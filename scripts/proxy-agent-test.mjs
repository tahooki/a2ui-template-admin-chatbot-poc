import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const proxyAgentDir = path.join(root, "packages", "a2ui-proxy-agent");
const runnerPath = path.join(proxyAgentDir, "run.py");
const venvPython = path.join(proxyAgentDir, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");

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
const setup = spawnSync(
  python.command,
  [...python.prefixArgs, runnerPath, "--install-only"],
  {
    cwd: proxyAgentDir,
    env: process.env,
    stdio: "inherit",
    shell: false,
  },
);
if (setup.error) throw setup.error;
if (setup.status !== 0) process.exit(setup.status ?? 1);

const env = {
  ...process.env,
  PYTHONPATH: [proxyAgentDir, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
};

const result = spawnSync(
  venvPython,
  ["-m", "unittest", "discover", "tests"],
  {
    cwd: proxyAgentDir,
    env,
    stdio: "inherit",
    shell: false,
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
