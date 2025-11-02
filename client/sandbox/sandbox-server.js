// ./sandbox/sandbox-server.js

const express = require("express");
const http = require("http");
const Pusher = require("pusher");
const pty = require("node-pty");
const fs = require("fs").promises;
const path = require("path");

const app = express();
app.use(express.json());

const PORT = 8080;
const WORKSPACE_DIR = "/workspace"; // Matches the volume mount

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

let activeShell = null;

// --- Health Check Endpoint ---
app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok" });
});

// --- Terminal Execution Endpoint ---
app.post("/exec", (req, res) => {
    const { command, timeout = 300 } = req.body;

    if (!command || typeof command !== 'string') {
        return res.status(400).json({ error: "Invalid 'command' provided." });
    }
    if (activeShell) {
        return res.status(409).json({ status: "error", exitCode: -1, stdout: "", stderr: "Another command is already running." });
    }

    console.log(`[Sandbox Exec] Running command: ${command}`);
    if (pusher) {
         pusher.trigger(pusherChannel, 'log-message', { message: `\n$ ${command}\n` })
              .catch(error => console.error("Pusher trigger error:", error));
    }

    // *** THIS IS THE FIX ***
    // Use 'sh' (which exists in Alpine) instead of 'bash'
    const shell = pty.spawn("sh", [], {
  // ***********************
    name: "xterm-color",
    cols: 120,
    rows: 40,
    cwd: WORKSPACE_DIR,
    // --- ADD THIS BLOCK ---
    env: {
     ...process.env, // Inherit existing env vars (like PUSHER_APP_ID)
     // Explicitly set a sane PATH for the non-root user
     PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    },
    // --- END OF BLOCK ---
  });

    activeShell = { process: shell, stdout: "", stderr: "" };
    let timer;
    let hasExited = false;

    timer = setTimeout(() => {
        if (!hasExited) {
            console.log(`[Sandbox Exec] Command timed out: ${command}`);
            shell.kill();
            hasExited = true;
            if (pusher) {
                pusher.trigger(pusherChannel, 'log-message', { message: "\n[Sandbox] Process timed out.\n" })
                      .catch(error => console.error("Pusher trigger error:", error));
            }
            res.status(200).json({
                status: "error",
                exitCode: -1,
                stdout: activeShell.stdout,
                stderr: activeShell.stderr + "\n[Sandbox] Process timed out.",
            });
            activeShell = null;
        }
    }, timeout * 1000);

    shell.onData((data) => {
        const dataStr = data.toString();
        if (activeShell) activeShell.stdout += dataStr;
        if (pusher) {
            pusher.trigger(pusherChannel, 'log-message', { message: dataStr })
                  .catch(error => console.error("Pusher trigger error:", error));
        }
    });

    shell.onExit(({ exitCode }) => {
        if (hasExited) return;

        console.log(`[Sandbox Exec] Command finished with exit code ${exitCode}: ${command}`);
        clearTimeout(timer);
        hasExited = true;

        const result = {
            status: exitCode === 0 ? "success" : "error",
            exitCode: exitCode,
            stdout: activeShell.stdout,
            stderr: activeShell.stderr,
        };

        if (pusher) {
            pusher.trigger(pusherChannel, 'log-message', { message: `\n[Sandbox] Process exited with code ${exitCode}\n` })
                  .catch(error => console.error("Pusher trigger error:", error));
        }

        res.status(200).json(result);
        activeShell = null;
    });

    // Send the command and a newline to execute it
    shell.write(command + "\r");
    
    // Send an extra command to print a unique boundary after the command finishes.
    // This helps capture all stdout/stderr, but for pty it's often not needed
    // shell.write("echo '__COMMAND_COMPLETE__'\r");
});

// --- File System Write Endpoint ---
app.post("/fs/write", async (req, res) => {
    const { path: relativePath, content } = req.body;

    if (!relativePath || typeof relativePath !== "string" || content === undefined) {
        return res.status(400).json({ status: "error", path: relativePath, message: "Invalid 'path' or 'content' provided." });
    }
    if (relativePath.includes("..") || relativePath.startsWith("/")) {
        return res.status(403).json({ status: "error", path: relativePath, message: "Forbidden: Path is not relative or contains '..'." });
    }

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

// --- Start the HTTP server ---
const server = http.createServer(app);
server.listen(PORT, () => {
    console.log(`[NeuraLaunch Sandbox] Server listening on port ${PORT}`);
});