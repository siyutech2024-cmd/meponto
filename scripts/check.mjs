import { spawn } from "node:child_process";
import { createServer } from "node:net";

const port = process.env.PONTOSYS_CHECK_PORT ?? process.env.PORT ?? "3100";
const baseUrl = `http://localhost:${port}`;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: "inherit",
      shell: false,
      ...options,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

function startServer() {
  return spawn(npmCommand, ["run", "start", "--", "-p", port], {
    env: { ...process.env, PORT: port },
    stdio: "inherit",
    shell: false,
  });
}

function assertPortAvailable() {
  return new Promise((resolve, reject) => {
    const server = createServer();

    server.once("error", (error) => {
      reject(
        new Error(
          `Port ${port} is unavailable. Stop the existing process or run PONTOSYS_CHECK_PORT=<port> npm run check. ${error.message}`,
        ),
      );
    });

    server.once("listening", () => {
      server.close(resolve);
    });

    server.listen(Number(port), "127.0.0.1");
  });
}

async function waitForServer(deadlineMs = 30000) {
  const deadline = Date.now() + deadlineMs;
  const healthUrl = new URL("/api/health", baseUrl);

  while (Date.now() < deadline) {
    try {
      const response = await fetch(healthUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // Server is still warming up.
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  throw new Error(`Timed out waiting for ${healthUrl}`);
}

async function stopServer(server) {
  if (server.exitCode !== null || server.signalCode !== null) {
    return;
  }

  server.kill("SIGTERM");
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      server.kill("SIGKILL");
      resolve();
    }, 5000);

    server.on("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

let server;

try {
  await run(npmCommand, ["run", "build"]);
  await assertPortAvailable();
  server = startServer();
  await waitForServer();
  await run(npmCommand, ["run", "smoke"], {
    env: { ...process.env, PONTOSYS_BASE_URL: baseUrl },
  });
  await run(npmCommand, ["run", "a11y:smoke"], {
    env: { ...process.env, PONTOSYS_BASE_URL: baseUrl },
  });
  await run(npmCommand, ["run", "workflow:smoke"], {
    env: { ...process.env, PONTOSYS_BASE_URL: baseUrl },
  });
} finally {
  if (server) {
    await stopServer(server);
  }
}
