import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const mainAgentDir = path.join(root, "packages", "a2ui-python-agent");
const proxyAgentDir = path.join(root, "packages", "a2ui-proxy-agent");
const venvPython = path.join(mainAgentDir, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");

if (!existsSync(venvPython)) {
  console.error("[proxy-agent:test] Python virtualenv is missing.");
  console.error("[proxy-agent:test] Run `npm run setup:agent` first.");
  process.exit(1);
}

const env = {
  ...process.env,
  PYTHONPATH: [proxyAgentDir, process.env.PYTHONPATH].filter(Boolean).join(path.delimiter),
};

const result = spawnSync(
  venvPython,
  ["-m", "unittest", "discover", path.join("packages", "a2ui-proxy-agent", "tests")],
  {
    cwd: root,
    env,
    stdio: "inherit",
    shell: false,
  },
);

if (result.error) throw result.error;
process.exit(result.status ?? 1);
