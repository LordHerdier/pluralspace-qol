// Concatenates src/modules/*.js into the single pluralspace-qol.user.js that gets installed.
// Uses the filename prefixes as load order
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const MODULES_DIR = path.join(ROOT, "src", "modules");
const HEADER_FILE = path.join(ROOT, "src", "_header.txt");
const OUT_FILE = path.join(ROOT, "src", "pluralspace-qol.user.js");

function build() {
  const header = fs.readFileSync(HEADER_FILE, "utf8");
  const files = fs
    .readdirSync(MODULES_DIR)
    .filter((f) => f.endsWith(".js"))
    .sort();
  const body = files
    .map((f) => fs.readFileSync(path.join(MODULES_DIR, f), "utf8"))
    .join("\n");
  return `${header}\n(function () {\n  'use strict';\n\n${body}})();\n`;
}

if (require.main === module) {
  fs.writeFileSync(OUT_FILE, build());
  console.log(
    `built ${path.relative(ROOT, OUT_FILE)} from ${fs.readdirSync(MODULES_DIR).length} modules`,
  );
}

module.exports = { build };
