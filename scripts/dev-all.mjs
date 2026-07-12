import { spawn } from "node:child_process";
import readline from "node:readline";

const services = [
  { name: "web", command: "npm", args: ["run", "web:dev"] },
  { name: "main-agent", command: "npm", args: ["run", "main-agent:dev"] },
  { name: "proxy-agent", command: "npm", args: ["run", "proxy-agent:dev"] },
];

const children = new Map();
let shuttingDown = false;

function prefixStream(name, stream, output) {
  const reader = readline.createInterface({ input: stream });
  reader.on("line", (line) => {
    output.write(`[${name}] ${line}\n`);
  });
}

function stopAll(signal = "SIGTERM") {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children.values()) {
    if (!child.killed) child.kill(signal);
  }
}

for (const service of services) {
  const child = spawn(service.command, service.args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  children.set(service.name, child);
  prefixStream(service.name, child.stdout, process.stdout);
  prefixStream(service.name, child.stderr, process.stderr);

  child.on("exit", (code, signal) => {
    children.delete(service.name);
    if (shuttingDown) return;
    const reason = signal ? `signal ${signal}` : `code ${code}`;
    console.error(`[dev:all] ${service.name} exited with ${reason}; stopping the rest.`);
    stopAll();
    process.exitCode = code ?? 1;
  });
}

process.on("SIGINT", () => stopAll("SIGINT"));
process.on("SIGTERM", () => stopAll("SIGTERM"));

console.log("[dev:all] starting web:3001, main-agent:8000, and proxy-agent:8200 with A2A");
