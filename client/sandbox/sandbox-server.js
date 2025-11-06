// ./sandbox/sandbox-server.js

const express = require("express");
const http = require("http");
const Pusher = require("pusher");
const { exec, execSync } = require("child_process"); // <-- Added execSync
const fs = require("fs").promises;
const path = require("path");

const app = express();
app.use(express.json());

const PORT = 8080;
const WORKSPACE_DIR = "/workspace";

// --- Pusher Configuration ---
let pusher;
if (process.env.PUSHER_APP_ID && process.env.PUSHER_KEY && process.env.PUSHER_SECRET && process.env.PUSHER_CLUSTER) {
    pusher = new Pusher({
        appId: process.env.PUSHER_APP_ID,
        key: process.env.PUSHER_KEY,
        secret: process.env.PUSHER_SECRET,
        cluster: process.env.PUSHER_CLUSTER,
        useTLS: true
    });
    console.log("[Sandbox Pusher] Pusher client configured.");
} else {
    console.warn("[Sandbox Pusher] Pusher ENV variables not set. Log streaming disabled.");
}

const projectId = process.env.PROJECT_ID || "unknown-project";
const pusherChannel = `sandbox-logs-${projectId}`;

// --- Fix workspace permissions on startup ---
try {
    // Ensure the workspace directory is writable by all users
    execSync(`chmod -R 777 ${WORKSPACE_DIR}`);
    console.log(`[NeuraLaunch Sandbox] Workspace permissions fixed.`);
} catch (error) {
    console.warn(`[NeuraLaunch Sandbox] Could not fix permissions:`, error.message);
}

// --- Health Check Endpoint ---
app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});

// --- Terminal Execution Endpoint (Robust Version) ---
app.post("/exec", (req, res) => {
    const { command, timeout = 300 } = req.body; // 300s = 5 min default

    if (!command || typeof command !== 'string') {
        return res.status(400).json({ error: "Invalid 'command' provided." });
    }

    console.log(`[Sandbox Exec] Running command: ${command}`);
    if (pusher) {
        pusher.trigger(pusherChannel, 'log-message', { message: `\n$ ${command}\n` })
            .catch(error => console.error("Pusher trigger error:", error));
    }

    // Store the original process.env
    const originalEnv = process.env;

    const childProcess = exec(command, {
        cwd: WORKSPACE_DIR,
        env: {
            ...originalEnv, // Use the stored env
            PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin", // Set the path
            TERM: "xterm", // Add TERM to avoid escape sequence issues
        },
        timeout: timeout * 1000, // Built-in timeout
        shell: "/bin/sh", // Explicitly use /bin/sh (Alpine's shell)
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    }, (error, stdout, stderr) => {
        // This single callback handles success, error, and timeout
        
        if (error) {
            console.error(`[Sandbox Exec] Error: ${error.message}`);
            if (error.signal === 'SIGTERM' || error.killed) {
                console.log(`[Sandbox Exec] Command timed out: ${command}`);
                const timeoutMsg = "\n[Sandbox] Process timed out.\n";
                if (pusher) pusher.trigger(pusherChannel, 'log-message', { message: timeoutMsg }).catch(e => console.error(e));
                
                return res.status(200).json({
                    status: "error",
                    exitCode: -1,
                    stdout: stdout || "", // Send whatever output we got
                    stderr: (stderr || "") + timeoutMsg,
                });
            }
            
            console.log(`[Sandbox Exec] Command failed with code ${error.code}: ${command}`);
            if (pusher) pusher.trigger(pusherChannel, 'log-message', { message: `\n[Sandbox] Process exited with code ${error.code}\n` }).catch(e => console.error(e));
            return res.status(200).json({
                status: "error",
                exitCode: error.code || 1,
                stdout: stdout || "",
                stderr: stderr || "",
            });
        }

        // Success (error is null)
        console.log(`[Sandbox Exec] Command succeeded: ${command}`);
        if (pusher) pusher.trigger(pusherChannel, 'log-message', { message: `\n[Sandbox] Process exited with code 0\n` }).catch(e => console.error(e));
        res.status(200).json({
            status: "success",
            exitCode: 0,
            stdout: stdout || "",
            stderr: stderr || "",
        });
    });

    // --- Stream stdout/stderr to Pusher in real-time ---
    childProcess.stdout.on('data', (data) => {
        if (pusher) {
            pusher.trigger(pusherChannel, 'log-message', { message: data.toString() })
                .catch(error => console.error("Pusher trigger error:", error));
        }
    });
    childProcess.stderr.on('data', (data) => {
        if (pusher) {
            pusher.trigger(pusherChannel, 'log-message', { message: data.toString() })
                .catch(error => console.error("Pusher trigger error:", error));
        }
    });
});

// --- File System Write Endpoint (Unchanged) ---
app.post("/fs/write", async (req, res) => {
    const { path: relativePath, content } = req.body;

    if (!relativePath || typeof relativePath !== 'string' || content === undefined) {
        return res.status(400).json({ status: "error", path: relativePath, message: "Invalid 'path' or 'content' provided." });
    }
    // if (relativePath.startsWith("/")) {
    //     return res.status(403).json({ status: "error", path: relativePath, message: "Forbidden: Path must be relative." });
    // }
   

    const safeFilePath = path.join(WORKSPACE_DIR, relativePath);
    const normalizedSandboxDir = path.normalize(WORKSPACE_DIR);
    const normalizedFilePath = path.normalize(safeFilePath);

    if (!normalizedFilePath.startsWith(normalizedSandboxDir)) {
        console.warn(`[Sandbox FS Write] Attempted path traversal: ${safeFilePath}`);
        return res.status(403).json({ status: "error", path: relativePath, message: "Forbidden: Path is outside of sandbox." });
    }

    try {
        console.log(`[Sandbox FS Write] Writing to: ${safeFilePath}`);
        await fs.mkdir(path.dirname(safeFilePath), { recursive: true });
        await fs.writeFile(safeFilePath, content, "utf8");
        res.status(201).json({ status: "success", path: relativePath, size: content.length });
    } catch (error) {
        console.error(`[Sandbox FS Write] Error writing file ${safeFilePath}:`, error);
        res.status(500).json({ status: "error", path: relativePath, message: error.message });
    }
});

// --- File System Read Endpoint (NEW) ---
app.post("/fs/read", async (req, res) => {
  const { path: relativePath } = req.body;

  if (!relativePath || typeof relativePath !== 'string') {
    return res.status(400).json({ 
      status: "error", 
      message: "Invalid 'path' provided." 
    });
  }

  if (relativePath.startsWith("/") || relativePath.includes("../")) {
    return res.status(403).json({ 
      status: "error", 
      message: "Forbidden: Path must be relative and cannot traverse." 
    });
  }

  const safeFilePath = path.join(WORKSPACE_DIR, relativePath);
  const normalizedSandboxDir = path.normalize(WORKSPACE_DIR);
  const normalizedFilePath = path.normalize(safeFilePath);

  if (!normalizedFilePath.startsWith(normalizedSandboxDir)) {
    return res.status(403).json({ 
      status: "error", 
      message: "Forbidden: Path is outside of sandbox." 
    });
  }

  try {
    const content = await fs.readFile(safeFilePath, "utf8");
    res.status(200).json({ status: "success", content });
  } catch (error) {
    if (error.code === 'ENOENT') {
      res.status(404).json({ 
        status: "error", 
        message: "File not found." 
      });
    } else {
      res.status(500).json({ 
        status: "error", 
        message: error.message 
      });
    }
  }
});

// --- Start the HTTP server ---
const server = http.createServer(app);
server.listen(PORT, () => {
    console.log(`[NeuraLaunch Sandbox] Server listening on port ${PORT}`);
});