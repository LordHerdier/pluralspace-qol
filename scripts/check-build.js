// Verifies that src/pluralspace-qol.user.js is the proper build.
// *Should* catch if I edit the built file by hand or forget to rebuild
const fs = require("fs");
const path = require("path");
const { build } = require("./build.js");

const OUT_FILE = path.join(__dirname, "..", "src", "pluralspace-qol.user.js");

const committed = fs.readFileSync(OUT_FILE, "utf8");
const fresh = build();

if (committed === fresh) {
  console.log("PASS: src/pluralspace-qol.user.js matches src/modules/");
  process.exit(0);
}

console.log(
  "FAIL: src/pluralspace-qol.user.js is stale -- run `node scripts/build.js`",
);
process.exit(1);
