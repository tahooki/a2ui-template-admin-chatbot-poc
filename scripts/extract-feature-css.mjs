import fs from "node:fs";
import path from "node:path";
import postcss from "postcss";

const root = process.cwd();
const sourcePath = path.join(root, "src/features/a2ui-template-poc/styles.module.css");
const sourceCss = fs.readFileSync(sourcePath, "utf8");
const sourceRoot = postcss.parse(sourceCss);

const features = [
  {
    directory: "src/features/a2ui-chat-kit",
    output: "src/features/a2ui-chat-kit/a2ui-chat-kit.module.css",
  },
  {
    directory: "src/features/a2ui-chat",
    output: "src/features/a2ui-chat/chat-components.module.css",
  },
  {
    directory: "src/features/a2ui-observability",
    output: "src/features/a2ui-observability/observability.module.css",
  },
];

function usageFor(directory) {
  const names = new Set();
  const prefixes = new Set();
  const files = fs.readdirSync(path.join(root, directory)).filter((file) => file.endsWith(".tsx"));
  for (const file of files) {
    const source = fs.readFileSync(path.join(root, directory, file), "utf8");
    for (const match of source.matchAll(/styles\.([A-Za-z0-9_]+)/g)) names.add(match[1]);
    for (const match of source.matchAll(/styles\[`([A-Za-z0-9_]+)\$\{/g)) prefixes.add(match[1]);
  }
  return { names, prefixes };
}

function includesUsedClass(selector, usage) {
  const classes = [...selector.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)].map((match) => match[1]);
  return classes.some((name) => usage.names.has(name) || [...usage.prefixes].some((prefix) => name.startsWith(prefix)));
}

function filteredContainer(container, usage) {
  const output = postcss.root();
  container.each((node) => {
    if (node.type === "rule" && includesUsedClass(node.selector, usage)) {
      output.append(node.clone());
      return;
    }
    if (node.type !== "atrule") return;
    if (node.name.toLowerCase().includes("keyframes")) {
      output.append(node.clone());
      return;
    }
    const nested = filteredContainer(node, usage);
    if (!nested.nodes.length) return;
    const wrapper = node.clone({ nodes: [] });
    nested.each((child) => wrapper.append(child.clone()));
    output.append(wrapper);
  });
  return output;
}

for (const feature of features) {
  const usage = usageFor(feature.directory);
  const outputRoot = filteredContainer(sourceRoot, usage);
  fs.writeFileSync(
    path.join(root, feature.output),
    `/* Extracted from the original POC stylesheet. Feature-owned for independent bundling. */\n${outputRoot.toString()}\n`,
  );
}
