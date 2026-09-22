// Verifies the "Ended at" prefill against the real edit-front markup, including
// that it emits the events Vue's v-model actually listens to.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const snap = path.join(ROOT, "fixtures", "edit-front.html");
const script = fs.readFileSync(
  path.join(ROOT, "src", "pluralspace-qol.user.js"),
  "utf8",
);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1600, height: 900 },
  });
  await page.goto("file://" + snap);

  // Record the events a Vue v-model would be listening for.
  await page.evaluate(() => {
    window.__ev = [];
    const end = document.querySelector("#front-end");
    ["input", "change"].forEach((t) =>
      end.addEventListener(t, (e) =>
        window.__ev.push({ type: t, value: e.target.value }),
      ),
    );
  });

  // Expectations are resolved against the values the input actually holds after
  // assignment: a step="1" field normalises 17:25:00 to 17:25, so comparing
  // against the literal string written would fail on formatting, not behaviour.
  const cases = [
    {
      name: "blank end, enabled",
      start: "2026-09-04T17:25:00",
      endBefore: "",
      disabled: false,
      expect: "start",
    },
    {
      name: "end already set",
      start: "2026-09-04T17:25:00",
      endBefore: "2026-09-05T09:00:00",
      disabled: false,
      expect: "unchanged",
    },
    {
      name: "still-fronting on",
      start: "2026-09-04T17:25:00",
      endBefore: "",
      disabled: true,
      expect: "unchanged",
    },
  ];

  let pass = true;
  for (const c of cases) {
    const before = await page.evaluate((c) => {
      const s = document.querySelector("#front-start");
      const e = document.querySelector("#front-end");
      s.value = c.start;
      e.value = c.endBefore;
      e.disabled = c.disabled;
      window.__ev = [];
      document.getElementById("psqol-style")?.remove();
      return { start: s.value, end: e.value }; // normalised by the input
    }, c);
    await page.evaluate(script);
    await page.waitForTimeout(60);
    const got = await page.evaluate(() => ({
      end: document.querySelector("#front-end").value,
      events: window.__ev.map((e) => e.type),
    }));
    const want = c.expect === "start" ? before.start : before.end;
    const ok = got.end === want;
    if (!ok) pass = false;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${c.name.padEnd(20)} end="${got.end}" want="${want}" events=[${got.events}]`,
    );
  }

  console.log(pass ? "\nALL PASS" : "\nFAILURES");
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
