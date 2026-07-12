import { existsSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";

const root = process.cwd();
const mainAgentDir = path.join(root, "packages", "a2ui-python-agent");
const proxyAgentDir = path.join(root, "packages", "a2ui-proxy-agent");
const venvPython = path.join(mainAgentDir, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");

if (!existsSync(venvPython)) {
  console.error("[proxy-agent:dev] Python virtualenv is missing.");
  console.error("[proxy-agent:dev] Run `npm run setup:agent` first.");
  process.exit(1);
}

const env = {
  ...process.env,
  PYTHONPATH: [proxyAgentDir, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
};

const child = spawn(
  venvPython,
  ["-m", "uvicorn", "app.main:app", "--reload", "--reload-dir", proxyAgentDir, "--port", "8200", "--app-dir", proxyAgentDir],
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
