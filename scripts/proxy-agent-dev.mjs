import path from "node:path";
import { spawn, spawnSync } from "node:child_process";

const root = process.cwd();
const proxyAgentDir = path.join(root, "packages", "a2ui-proxy-agent");
const runnerPath = path.join(proxyAgentDir, "run.py");

function canRun(command, args) {
  const result = spawnSync(command, args, { stdio: "ignore", shell: false });
  return !result.error && result.status === 0;
}

function findPython() {
  if (process.env.PYTHON && canRun(process.env.PYTHON, ["--version"])) {
    return { command: process.env.PYTHON, prefixArgs: [] };
  }
  if (process.platform === "win32" && canRun("py", ["-3", "--version"])) {
    return { command: "py", prefixArgs: ["-3"] };
  }
  for (const command of ["python3", "python"]) {
    if (canRun(command, ["--version"])) return { command, prefixArgs: [] };
  }
  throw new Error("Python 3 was not found. Install Python 3 or set PYTHON to its executable path.");
}

const python = findPython();

const child = spawn(
  python.command,
  [...python.prefixArgs, runnerPath, "--reload"],
  {
    cwd: root,
    env: process.env,
    stdio: "inherit",
    shell: false,
  },
);

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
