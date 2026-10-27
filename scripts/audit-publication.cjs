const fs = require("node:fs"),
  path = require("node:path");
const root = path.resolve(__dirname, ".."),
  skip = new Set([".git", "node_modules", "dist"]),
  issues = [];
const forbiddenDirs = new Set([
  "test-data",
  "data",
  "saved-accounts",
  "desktop-profile",
  "codex-home",
  "asar",
]);
function visit(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skip.has(item.name)) continue;
    const full = path.join(dir, item.name),
      relative = path.relative(root, full);
    if (item.isDirectory()) {
      if (forbiddenDirs.has(item.name))
        issues.push(relative + ": runtime data directory");
      else visit(full);
      continue;
    }
    if (/\.(exe|dll|zip)$/i.test(item.name)) continue;
    if (
      /\.(sqlite.*|jsonl|log)$/i.test(item.name) ||
      /^(auth\.json|config\.json|.*-config\.json)$/i.test(item.name)
    ) {
      issues.push(relative + ": runtime data file");
      continue;
    }
    const text = fs.readFileSync(full, "utf8");
    if (/C:[\\/]+Users[\\/]+revan/i.test(text))
      issues.push(relative + ": private machine path");
    if (
      /\bgh[pousr]_[A-Za-z0-9]{30,}\b|\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}\b|\beyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{15,}/.test(
        text,
      )
    )
      issues.push(relative + ": possible credential");
  }
}
visit(root);
if (issues.length) {
  console.error(issues.join("\n"));
  process.exitCode = 1;
} else
  console.log(
    "Publication audit passed: no runtime data, private machine paths, or recognizable credential strings found. Review the Git file list before publishing.",
  );
