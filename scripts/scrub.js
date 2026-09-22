// Turns the private DOM snapshots in snapshots/ into shareable fixtures/.
//
// The snapshots are captures of a logged-in session and must never be
// committed. The checks only need structure (ids, classes, data attributes
// and real CSS geometry) so everything identifying can be deleted.
//
// Run: node scripts/scrub.js   (re-run after capturing new snapshots)
//
// Anything long enough to be user-written that is not explicitly allowlisted
// below is redacted and REPORTED, so a new snapshot containing new personal
// text fails loudly here instead of leaking quietly into git.

const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SNAPDIR = path.join(ROOT, "snapshots");
const OUTDIR = path.join(ROOT, "fixtures");

// Names are DERIVED from each snapshot at run time, never written down here:
// this file is committed, so a hardcoded list of a real system's members would
// be exactly the leak the scrub exists to prevent. Avatar alt and title
// attributes carry the member names, which makes them a reliable source.
const GENERIC_LABELS = ["PluralSpace Logo", "Avatar", "Notifications", ""];

// Static app chrome: not user-written, worth keeping so fixtures stay readable.
const ALLOW = [
  "Browse who was fronting on any day",
  "Expect bugs and missing features",
  "Fronting history",
  "Still fronting",
  "PluralSpace",
];
const LONG_TEXT = 30; // chars; above this, text must be allowlisted or is redacted

const BLANK_IMG =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

(async () => {
  fs.mkdirSync(OUTDIR, { recursive: true });
  const snaps = fs.readdirSync(SNAPDIR).filter((f) => f.endsWith(".html"));
  if (!snaps.length) {
    console.error("no snapshots to scrub");
    process.exit(1);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Vendor the app's stylesheets once, shared by every fixture. Inlining per
  // file would triple the size; linking the live URL would break on their next
  // deploy, since the asset names are content-hashed.
  const cssPath = path.join(OUTDIR, "app.css");
  if (!fs.existsSync(cssPath)) {
    await page.goto("file://" + path.join(SNAPDIR, snaps[0]));
    const hrefs = await page.evaluate(() =>
      [...document.querySelectorAll("link[rel=stylesheet]")].map((l) => l.href),
    );
    let css = "";
    for (const h of hrefs) {
      const r = await page.request.get(h);
      if (r.ok())
        css += `/* ${h.split("/").pop()} */\n` + (await r.text()) + "\n";
    }
    fs.writeFileSync(cssPath, css);
    console.log(
      `vendored ${hrefs.length} stylesheets -> fixtures/app.css (${Math.round(css.length / 1024)} KB)`,
    );
  }

  // Pass 1: collect the identifying labels across every snapshot, so a name
  // appearing in only one still gets scrubbed from all of them.
  const names = new Set();
  for (const name of snaps) {
    await page.goto("file://" + path.join(SNAPDIR, name));
    const found = await page.evaluate((generic) => {
      const out = new Set();
      document.querySelectorAll("[alt], [title]").forEach((el) => {
        for (const v of [el.getAttribute("alt"), el.getAttribute("title")]) {
          const t = (v || "").trim();
          if (!t || generic.includes(t)) continue;
          out.add(t);
          // The bare name without decoration glyphs, which appears in body text
          // where the decorated form does not.
          const bare = t.replace(/[^\p{L}\p{N}\s'-]/gu, "").trim();
          if (bare && bare !== t) out.add(bare);
        }
      });
      return [...out];
    }, GENERIC_LABELS);
    found.forEach((f) => names.add(f));
  }
  // Longest first, so a decorated form is replaced before its bare substring.
  const NAMES = [...names].sort((a, b) => b.length - a.length);
  console.log(`derived ${NAMES.length} identifying labels from the snapshots`);

  const redacted = [];
  for (const name of snaps) {
    await page.goto("file://" + path.join(SNAPDIR, name));
    const report = await page.evaluate(
      ({ NAMES, ALLOW, LONG_TEXT, BLANK_IMG }) => {
        const out = [];

        // Scripts cannot run from a file:// fixture anyway and only produce
        // CORS noise; preloads are equally dead weight.
        document
          .querySelectorAll(
            "script, link[rel=modulepreload], link[rel=preload]",
          )
          .forEach((e) => e.remove());

        // One shared vendored stylesheet in place of every remote one.
        const links = [...document.querySelectorAll("link[rel=stylesheet]")];
        links.forEach((l, i) =>
          i === 0 ? l.setAttribute("href", "./app.css") : l.remove(),
        );

        document.querySelectorAll("img").forEach((img) => {
          img.setAttribute("src", BLANK_IMG);
          if (img.alt) img.alt = "Avatar";
          if (img.title) img.title = "Avatar";
        });

        // Bare and decorated forms of one member collapse to the same
        // placeholder because the bare form sorts adjacent after the length
        // sort; exactness is not required, only that nothing identifying
        // survives.
        const swapNames = (s) => {
          NAMES.forEach((n, i) => {
            if (!s.includes(n)) return;
            s = s.split(n).join("Member " + String.fromCharCode(65 + (i % 26)));
          });
          return s;
        };
        const scrubIds = (s) =>
          s
            .replace(
              /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
              "00000000-0000-0000-0000-000000000000",
            )
            .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, "user@example.com");

        document.querySelectorAll("*").forEach((el) => {
          for (const a of [...el.attributes]) {
            const v = scrubIds(swapNames(a.value));
            if (v !== a.value) el.setAttribute(a.name, v);
          }
        });

        const walker = document.createTreeWalker(
          document.documentElement,
          NodeFilter.SHOW_TEXT,
        );
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          if (
            n.parentElement &&
            ["SCRIPT", "STYLE"].includes(n.parentElement.tagName)
          )
            continue;
          let v = scrubIds(swapNames(n.nodeValue));
          const trimmed = v.trim();
          if (
            trimmed.length > LONG_TEXT &&
            !ALLOW.some((a) => trimmed.includes(a))
          ) {
            out.push(trimmed.slice(0, 80));
            v = v.replace(trimmed, "Redacted note text.");
          }
          if (v !== n.nodeValue) n.nodeValue = v;
        }

        return {
          html: "<!DOCTYPE html>\n" + document.documentElement.outerHTML,
          out,
        };
      },
      { NAMES, ALLOW, LONG_TEXT, BLANK_IMG },
    );

    fs.writeFileSync(path.join(OUTDIR, name), report.html);
    report.out.forEach((t) => redacted.push(`${name}: ${t}`));
    console.log(
      `scrubbed ${name} -> fixtures/${name} (${Math.round(report.html.length / 1024)} KB)`,
    );
  }

  await browser.close();

  if (redacted.length) {
    console.log(
      "\nredacted free text (review that none of this needed keeping):",
    );
    redacted.forEach((r) => console.log("  " + r));
  }

  // Verification: the fixtures must contain none of it. This is the gate
  // everything above is best-effort, this is what makes committing safe.
  const banned = [
    ...NAMES,
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi,
    /cdn\d*\.pluralspace\.app\/avatars/gi,
    /[\w.+-]+@[\w-]+\.[\w.]+/g,
  ];
  let leaks = 0;
  for (const f of fs.readdirSync(OUTDIR).filter((f) => f.endsWith(".html"))) {
    const body = fs.readFileSync(path.join(OUTDIR, f), "utf8");
    for (const b of banned) {
      const hit =
        typeof b === "string"
          ? body.includes(b)
            ? b
            : null
          : (body.match(b) || []).filter(
              (m) =>
                !/^0{8}-0{4}-0{4}-0{4}-0{12}$/.test(m) &&
                m !== "user@example.com",
            )[0];
      if (hit) {
        console.error(`LEAK in fixtures/${f}: ${hit}`);
        leaks++;
      }
    }
  }
  console.log(
    leaks
      ? `\n${leaks} LEAKS -- not safe to commit`
      : "\nclean: no names, ids, avatar urls or emails remain",
  );
  process.exit(leaks ? 1 : 0);
})();
