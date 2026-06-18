import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const venvPython = path.join(
  root,
  "packages",
  "a2ui-python-agent",
  ".venv",
  process.platform === "win32" ? "Scripts/python.exe" : "bin/python",
);
const sourceDir = path.join(root, "packages", "equipment-data-source");

if (!existsSync(venvPython)) {
  console.error("[equipment-source:dev] Python virtualenv is missing.");
  console.error("[equipment-source:dev] Run `npm run setup:agent` first.");
  process.exit(1);
}

const env = {
  ...process.env,
  PYTHONPATH: [sourceDir, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
};

const child = spawn(
  venvPython,
  ["-m", "uvicorn", "app.main:app", "--reload", "--port", "8100", "--app-dir", sourceDir],
  {
    cwd: root,
    env,
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
