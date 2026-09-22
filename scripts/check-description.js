// Verifies HTML descriptions render, and that the sanitizer holds.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const snap = path.join(ROOT, "fixtures", "member-page.html");
const script = fs.readFileSync(
  path.join(ROOT, "src", "pluralspace-qol.user.js"),
  "utf8",
);

const results = [];
const check = (name, ok, extra = "") => {
  results.push([name, ok]);
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? "  " + extra : ""}`);
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1200, height: 900 },
  });
  const fired = [];
  page.on("dialog", async (d) => {
    fired.push(d.message());
    await d.dismiss();
  });
  page.on("pageerror", (e) => fired.push("pageerror: " + e.message));
  await page.goto("file://" + snap);

  // Set the container's text the way the server delivers it: escaped markup.
  const render = (text) =>
    page.evaluate((t) => {
      const el = document.querySelector("div.prose");
      el.textContent = t; // escaped: it is a text node
      document.querySelectorAll("#psqol-style").forEach((e) => e.remove());
      return el.textContent;
    }, text);

  const inspect = () =>
    page.evaluate(() => {
      const el = document.querySelector("div.prose");
      return {
        html: el.innerHTML,
        tags: [...el.querySelectorAll("*")].map((e) => e.tagName.toLowerCase()),
      };
    });

  // the real description
  const real = fs
    .readFileSync(path.join(ROOT, "fixtures", "description.html"), "utf8")
    .replace(/^[\s\S]*<body>/, "")
    .replace(/<\/body>[\s\S]*$/, "");
  await render(real);
  await page.evaluate(script);
  await page.waitForTimeout(120);
  let r = await inspect();
  check(
    "renders the styled divs",
    r.tags.filter((t) => t === "div").length >= 4,
    `(${r.tags.length} elements)`,
  );
  check("keeps inline style", /text-align:\s*center/.test(r.html));
  check("keeps <br>", r.tags.includes("br"));
  check(
    "text no longer shows raw markup",
    !/&lt;div/.test(r.html) &&
      !r.html.includes(
        '<div style="text-align:center; background'.replace("<", "&lt;"),
      ),
  );

  // sanitizer
  const cases = [
    [
      "strips <script>",
      "<div>ok<script>window.__x=1</script></div>",
      (r) => !r.tags.includes("script"),
    ],
    [
      "strips <iframe>",
      '<div>ok<iframe src="https://example.com"></iframe></div>',
      (r) => !r.tags.includes("iframe"),
    ],
    [
      "strips onerror handler",
      '<img src="x" onerror="window.__x=1">',
      (r) => !/onerror/i.test(r.html),
    ],
    [
      "strips onclick handler",
      '<div onclick="window.__x=1">hi</div>',
      (r) => !/onclick/i.test(r.html),
    ],
    [
      "strips javascript: href",
      '<a href="javascript:window.__x=1">x</a>',
      (r) => !/javascript:/i.test(r.html),
    ],
    [
      "keeps https href",
      '<a href="https://example.com">x</a>',
      (r) => /https:\/\/example\.com/.test(r.html),
    ],
    [
      "strips <object>",
      '<div>ok<object data="x"></object></div>',
      (r) => !r.tags.includes("object"),
    ],
    [
      "strips <form>",
      '<form><input name="p"></form>',
      (r) => !r.tags.includes("form") && !r.tags.includes("input"),
    ],
    [
      "strips <style>",
      "<div>ok<style>body{display:none}</style></div>",
      (r) => !r.tags.includes("style"),
    ],
    [
      "strips non-image data: src",
      '<img src="data:text/html;base64,PHN2Zz4=">',
      (r) => !/data:text\/html/i.test(r.html),
    ],
  ];

  for (const [name, input, ok] of cases) {
    await render(input);
    await page.evaluate(script);
    await page.waitForTimeout(80);
    check(name, ok(await inspect()));
  }

  check(
    "nothing executed",
    fired.length === 0,
    fired.length ? JSON.stringify(fired) : "",
  );

  // Plain text must be left alone.
  await render("Just a description. 3 < 5 and a <3 heart.");
  await page.evaluate(script);
  await page.waitForTimeout(80);
  r = await inspect();
  check(
    "leaves plain text alone",
    r.tags.length === 0,
    `(${r.tags.length} elements)`,
  );

  // Toggle off
  await page.evaluate(() =>
    localStorage.setItem(
      "psqolConfig",
      JSON.stringify({ htmlDescriptions: false }),
    ),
  );
  await page.reload();
  await render(real);
  await page.evaluate(script);
  await page.waitForTimeout(120);
  check("disabled: leaves markup as text", (await inspect()).tags.length === 0);

  await browser.close();
  const pass = results.every(([, ok]) => ok);
  console.log(
    pass ? "\nALL PASS" : `\n${results.filter(([, o]) => !o).length} FAILURES`,
  );
  process.exit(pass ? 0 : 1);
})();
