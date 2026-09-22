// This verifies the 24 hour patch against the app's real formatter (time-w7nBHLrj.js)
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const script = fs.readFileSync(
  path.join(ROOT, "src", "pluralspace-qol.user.js"),
  "utf8",
);

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ locale: "en-US" });
  await page.goto("about:blank");

  const setup = () => {
    // app's display helper (time-w7nBHLrj.js, function z)
    window.appTime = (d, tz) =>
      new Date(d)
        .toLocaleTimeString(undefined, {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
          timeZone: tz,
        })
        .toLowerCase();
    // app's input-value helper (History-CyRMPcH2.js) -- must stay 24h/en-CA
    window.appInput = (d, tz) =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(d));
    // an untouched default call
    window.appDefault = (d) =>
      new Date(d).toLocaleTimeString(undefined, { timeZone: "UTC" });
  };

  await page.evaluate(setup);
  const before = await page.evaluate(() => ({
    display: appTime("2026-09-04T17:25:00Z", "UTC"),
    midnight: appTime("2026-09-04T00:10:00Z", "UTC"),
    input: appInput("2026-09-04T17:25:00Z", "UTC"),
  }));

  await page.evaluate(script);
  await page.waitForTimeout(50);
  const after = await page.evaluate(() => ({
    display: appTime("2026-09-04T17:25:00Z", "UTC"),
    midnight: appTime("2026-09-04T00:10:00Z", "UTC"),
    input: appInput("2026-09-04T17:25:00Z", "UTC"),
  }));

  console.log("before:", before);
  console.log("after: ", after);

  const checks = [
    ["display is 24h", after.display === "17:25"],
    ["midnight is 00:10 not 24:10", after.midnight === "00:10"],
    ["input helper unaffected", after.input === before.input],
  ];
  let pass = true;
  for (const [name, ok] of checks) {
    if (!ok) pass = false;
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}`);
  }
  console.log(pass ? "\nALL PASS" : "\nFAILURES");
  await browser.close();
  process.exit(pass ? 0 : 1);
})();
