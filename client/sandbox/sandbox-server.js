// sandbox/sandbox-server.js
/**
 * NeuraLaunch Universal Sandbox Server
 * Supports: Node.js, Python, Go, Rust, PHP, Ruby, Java
 */

const express = require("express");
const http = require("http");
const Pusher = require("pusher");
const { exec, execSync } = require("child_process");
const fs = require("fs").promises;
const path = require("path");

const app = express();
app.use(express.json());

const PORT = 8080;
const WORKSPACE_DIR = "/workspace";

// Pusher Configuration
let pusher;
if (
  process.env.PUSHER_APP_ID &&
  process.env.PUSHER_KEY &&
  process.env.PUSHER_SECRET &&
  process.env.PUSHER_CLUSTER
) {
  pusher = new Pusher({
    appId: process.env.PUSHER_APP_ID,
    key: process.env.PUSHER_KEY,
    secret: process.env.PUSHER_SECRET,
    cluster: process.env.PUSHER_CLUSTER,
    useTLS: true,
  });
  console.log("[Sandbox] Pusher configured");
} else {
  console.warn("[Sandbox] Pusher disabled (env vars not set)");
}

const projectId = process.env.PROJECT_ID || "unknown-project";
const pusherChannel = `sandbox-logs-${projectId}`;

// Fix workspace permissions on startup
try {
  execSync(`chmod -R 777 ${WORKSPACE_DIR}`);
  console.log("[Sandbox] Workspace permissions fixed");
} catch (error) {
  console.warn("[Sandbox] Could not fix permissions:", error.message);
}

// ==========================================
// LANGUAGE DETECTION & ENVIRONMENT SETUP
// ==========================================

/**
 * Detect project language and return appropriate environment
 */
async function detectProjectEnvironment() {
  const envInfo = {
    languages: [],
    packageManagers: [],
    frameworks: [],
  };

  try {
    // Check for Node.js
    if (await fileExists("package.json")) {
      envInfo.languages.push("node");
      envInfo.packageManagers.push("npm");

      const pkgJson = JSON.parse(
        await fs.readFile(path.join(WORKSPACE_DIR, "package.json"), "utf8")
      );

      // Detect framework
      if (pkgJson.dependencies?.next) envInfo.frameworks.push("nextjs");
      if (pkgJson.dependencies?.react) envInfo.frameworks.push("react");
      if (pkgJson.dependencies?.vue) envInfo.frameworks.push("vue");
      if (pkgJson.dependencies?.express) envInfo.frameworks.push("express");

      // Detect package manager
      if (await fileExists("pnpm-lock.yaml")) envInfo.packageManagers.push("pnpm");
      if (await fileExists("yarn.lock")) envInfo.packageManagers.push("yarn");
    }

    // Check for Python
    if (await fileExists("requirements.txt")) {
      envInfo.languages.push("python");
      envInfo.packageManagers.push("pip");
    }
    if (await fileExists("pyproject.toml")) {
      envInfo.languages.push("python");
      envInfo.packageManagers.push("poetry");
    }
    if (await fileExists("Pipfile")) {
      envInfo.languages.push("python");
      envInfo.packageManagers.push("pipenv");
    }
    if (await fileExists("manage.py")) {
      envInfo.frameworks.push("django");
    }

    // Check for Go
    if (await fileExists("go.mod")) {
      envInfo.languages.push("go");
      envInfo.packageManagers.push("go-modules");
    }

    // Check for Rust
    if (await fileExists("Cargo.toml")) {
      envInfo.languages.push("rust");
      envInfo.packageManagers.push("cargo");
    }

    // Check for PHP
    if (await fileExists("composer.json")) {
      envInfo.languages.push("php");
      envInfo.packageManagers.push("composer");

      const composerJson = JSON.parse(
        await fs.readFile(path.join(WORKSPACE_DIR, "composer.json"), "utf8")
      );
      if (composerJson.require?.["laravel/framework"]) {
        envInfo.frameworks.push("laravel");
      }
    }

    // Check for Ruby
    if (await fileExists("Gemfile")) {
      envInfo.languages.push("ruby");
      envInfo.packageManagers.push("bundler");

      const gemfile = await fs.readFile(
        path.join(WORKSPACE_DIR, "Gemfile"),
        "utf8"
      );
      if (gemfile.includes("rails")) {
        envInfo.frameworks.push("rails");
      }
    }

    // Check for Java
    if (await fileExists("pom.xml")) {
      envInfo.languages.push("java");
      envInfo.packageManagers.push("maven");
    }
    if (await fileExists("build.gradle")) {
      envInfo.languages.push("java");
      envInfo.packageManagers.push("gradle");
    }
  } catch (error) {
    console.error("[Sandbox] Error detecting environment:", error);
  }

  return envInfo;
}

async function fileExists(relativePath) {
  try {
    await fs.access(path.join(WORKSPACE_DIR, relativePath));
    return true;
  } catch {
    return false;
  }
}

/**
 * Get appropriate environment variables for detected language
 */
function getLanguageEnv(envInfo) {
  const env = {
    PATH: "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin",
    TERM: "xterm",
    HOME: "/root",
  };

  // Add language-specific paths
  if (envInfo.languages.includes("node")) {
    env.NODE_ENV = process.env.NODE_ENV || "development";
  }

  if (envInfo.languages.includes("python")) {
    env.PYTHONUNBUFFERED = "1";
    env.PYTHONDONTWRITEBYTECODE = "1";
  }

  if (envInfo.languages.includes("go")) {
    env.GOPATH = "/root/go";
    env.PATH = `/usr/local/go/bin:${env.GOPATH}/bin:${env.PATH}`;
  }

  if (envInfo.languages.includes("rust")) {
    env.PATH = `/root/.cargo/bin:${env.PATH}`;
  }

  if (envInfo.languages.includes("java")) {
    env.JAVA_HOME = "/usr/lib/jvm/java-17-openjdk-amd64";
    env.PATH = `${env.JAVA_HOME}/bin:${env.PATH}`;
  }

  return env;
}

// ==========================================
// ENDPOINTS
// ==========================================

// Health Check
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", runtimes: getRuntimeVersions() });
});

// Get runtime versions
app.get("/runtimes", async (req, res) => {
  const versions = getRuntimeVersions();
  const envInfo = await detectProjectEnvironment();

  res.status(200).json({
    available: versions,
    detected: envInfo,
  });
});

function getRuntimeVersions() {
  const versions = {};

  try {
    versions.node = execSync("node --version").toString().trim();
    versions.npm = execSync("npm --version").toString().trim();
    versions.python = execSync("python --version").toString().trim();
    versions.pip = execSync("pip --version").toString().trim().split(" ")[1];
    versions.go = execSync("go version").toString().trim().split(" ")[2];
    versions.rust = execSync("rustc --version").toString().trim().split(" ")[1];
    versions.cargo = execSync("cargo --version").toString().trim().split(" ")[1];
    versions.php = execSync("php --version").toString().trim().split("\n")[0];
    versions.composer = execSync("composer --version").toString().trim().split(" ")[2];
    versions.ruby = execSync("ruby --version").toString().trim().split(" ")[1];
    versions.java = execSync("java --version").toString().trim().split("\n")[0];
  } catch (error) {
    console.error("[Sandbox] Error getting runtime versions:", error);
  }

  return versions;
}

// Terminal Execution (Language-Aware)
app.post("/exec", async (req, res) => {
  const { command, timeout = 300 } = req.body;

  if (!command || typeof command !== "string") {
    return res.status(400).json({ error: "Invalid 'command' provided." });
  }

  console.log(`[Sandbox] Executing: ${command}`);
  if (pusher) {
    pusher
      .trigger(pusherChannel, "log-message", { message: `\n$ ${command}\n` })
      .catch((error) => console.error("Pusher error:", error));
  }

  // Detect project environment for proper PATH
  const envInfo = await detectProjectEnvironment();
  const languageEnv = getLanguageEnv(envInfo);

  const childProcess = exec(
    command,
    {
      cwd: WORKSPACE_DIR,
      env: {
        ...process.env,
        ...languageEnv,
      },
      timeout: timeout * 1000,
      shell: "/bin/bash", // Use bash for better compatibility
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024, // 10MB
    },
    (error, stdout, stderr) => {
      if (error) {
        if (error.signal === "SIGTERM" || error.killed) {
          const timeoutMsg = "\n[Sandbox] Process timed out.\n";
          if (pusher)
            pusher
              .trigger(pusherChannel, "log-message", { message: timeoutMsg })
              .catch((e) => console.error(e));

          return res.status(200).json({
            status: "error",
            exitCode: -1,
            stdout: stdout || "",
            stderr: (stderr || "") + timeoutMsg,
          });
        }

        if (pusher)
          pusher
            .trigger(pusherChannel, "log-message", {
              message: `\n[Sandbox] Process exited with code ${error.code}\n`,
            })
            .catch((e) => console.error(e));

        return res.status(200).json({
          status: "error",
          exitCode: error.code || 1,
          stdout: stdout || "",
          stderr: stderr || "",
        });
      }

      // Success
      if (pusher)
        pusher
          .trigger(pusherChannel, "log-message", {
            message: `\n[Sandbox] Process exited with code 0\n`,
          })
          .catch((e) => console.error(e));

      res.status(200).json({
        status: "success",
        exitCode: 0,
        stdout: stdout || "",
        stderr: stderr || "",
      });
    }
  );

  // Stream output to Pusher
  childProcess.stdout.on("data", (data) => {
    if (pusher) {
      pusher
        .trigger(pusherChannel, "log-message", { message: data.toString() })
        .catch((error) => console.error("Pusher error:", error));
    }
  });

  childProcess.stderr.on("data", (data) => {
    if (pusher) {
      pusher
        .trigger(pusherChannel, "log-message", { message: data.toString() })
        .catch((error) => console.error("Pusher error:", error));
    }
  });
});

// File System Write
app.post("/fs/write", async (req, res) => {
  const { path: relativePath, content } = req.body;

  if (!relativePath || typeof relativePath !== "string" || content === undefined) {
    return res.status(400).json({
      status: "error",
      path: relativePath,
      message: "Invalid 'path' or 'content' provided.",
    });
  }

  const safeFilePath = path.join(WORKSPACE_DIR, relativePath);
  const normalizedSandboxDir = path.normalize(WORKSPACE_DIR);
  const normalizedFilePath = path.normalize(safeFilePath);

  if (!normalizedFilePath.startsWith(normalizedSandboxDir)) {
    console.warn(`[Sandbox] Path traversal attempt: ${safeFilePath}`);
    return res.status(403).json({
      status: "error",
      path: relativePath,
      message: "Forbidden: Path is outside of sandbox.",
    });
  }

  try {
    await fs.mkdir(path.dirname(safeFilePath), { recursive: true });
    await fs.writeFile(safeFilePath, content, "utf8");
    res.status(201).json({
      status: "success",
      path: relativePath,
      size: content.length,
    });
  } catch (error) {
    console.error(`[Sandbox] Error writing file ${safeFilePath}:`, error);
    res.status(500).json({
      status: "error",
      path: relativePath,
      message: error.message,
    });
  }
});

// File System Read
app.post("/fs/read", async (req, res) => {
  const { path: relativePath } = req.body;

  if (!relativePath || typeof relativePath !== "string") {
    return res.status(400).json({
      status: "error",
      message: "Invalid 'path' provided.",
    });
  }

  const safeFilePath = path.join(WORKSPACE_DIR, relativePath);
  const normalizedSandboxDir = path.normalize(WORKSPACE_DIR);
  const normalizedFilePath = path.normalize(safeFilePath);

  if (!normalizedFilePath.startsWith(normalizedSandboxDir)) {
    return res.status(403).json({
      status: "error",
      message: "Forbidden: Path is outside of sandbox.",
    });
  }

  try {
    const content = await fs.readFile(safeFilePath, "utf8");
    res.status(200).json({ status: "success", content });
  } catch (error) {
    if (error.code === "ENOENT") {
      res.status(404).json({
        status: "error",
        message: "File not found.",
      });
    } else {
      res.status(500).json({
        status: "error",
        message: error.message,
      });
    }
  }
});

// Start server
const server = http.createServer(app);
server.listen(PORT, () => {
  console.log(`[Sandbox] Server listening on port ${PORT}`);
  console.log(`[Sandbox] Workspace: ${WORKSPACE_DIR}`);
  console.log(`[Sandbox] Project ID: ${projectId}`);
});