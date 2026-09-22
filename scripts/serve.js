// Serves src/ over http so Tampermonkey's @require can fetch the script.
// Firefox extensions cannot read file:// URLs, so a local http origin is the
// only workable dev loader there. WSL2 forwards localhost, so Firefox on
// Windows reaches this at the same address.
const http = require("http");
const fs = require("fs");
const path = require("path");
const { build } = require("./build.js");

const PORT = process.env.PS_QOL_PORT || 8137;
const ROOT = path.join(__dirname, "..", "src");

http
  .createServer((req, res) => {
    const name = path.basename(decodeURIComponent(req.url.split("?")[0]));

    // The one file that matters for the dev loop is generated from src/modules/
    // on every request, not read off disk, whichis what makes editing a
    // module file behave like editing the old single file: refresh the page,
    // get the change, no separate watcher required.
    if (name === "pluralspace-qol.user.js") {
      let script;
      try {
        script = build();
      } catch (e) {
        res.writeHead(500).end("build failed: " + e.message);
        return;
      }
      res.writeHead(200, {
        "Content-Type": "application/javascript; charset=utf-8",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Access-Control-Allow-Origin": "*",
      });
      res.end(script);
      return;
    }

    const file = path.join(ROOT, name);
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
      res.writeHead(404).end("not found");
      return;
    }
    res.writeHead(200, {
      "Content-Type": "application/javascript; charset=utf-8",
      // Tampermonkey caches @require aggressively; defeat it completely.
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Access-Control-Allow-Origin": "*",
    });
    fs.createReadStream(file).pipe(res);
  })
  .listen(PORT, () => {
    console.log(`serving ${ROOT} on http://localhost:${PORT}/`);
  });
