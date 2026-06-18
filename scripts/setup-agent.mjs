import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const venvDir = path.join(root, "packages", "a2ui-python-agent", ".venv");
const requirementsPath = path.join(root, "packages", "a2ui-python-agent", "requirements.txt");
const venvPython = path.join(venvDir, process.platform === "win32" ? "Scripts/python.exe" : "bin/python");

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: false,
    ...options,
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function canRun(command, args) {
  const result = spawnSync(command, args, {
    stdio: "ignore",
    shell: false,
  });
  return !result.error && result.status === 0;
}

function findPython() {
  const candidates = [];
  if (process.env.PYTHON) candidates.push([process.env.PYTHON, ["--version"]]);
  if (process.platform === "win32") candidates.push(["py", ["-3", "--version"]]);
  candidates.push(["python3", ["--version"]], ["python", ["--version"]]);

  for (const [command, versionArgs] of candidates) {
    if (canRun(command, versionArgs)) {
      if (command === "py") return { command, args: ["-3"] };
      return { command, args: [] };
    }
  }

  throw new Error("Python 3 was not found. Install Python 3 or set PYTHON to its executable path.");
}

const python = findPython();
if (!existsSync(venvPython)) {
  console.log(`[setup:agent] creating virtualenv at ${path.relative(root, venvDir)}`);
  run(python.command, [...python.args, "-m", "venv", venvDir]);
}

console.log("[setup:agent] installing Python requirements");
run(venvPython, ["-m", "pip", "install", "-r", requirementsPath]);
console.log("[setup:agent] ready");
