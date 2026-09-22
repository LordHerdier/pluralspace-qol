// src/modules/20-config.js

const TWEAKS = [
  {
    key: "pinDrawer",
    label: "Pin the day drawer",
    desc: "Show the fronts day panel as a right-hand column instead of a modal slide-over.",
  },
  {
    key: "autoOpenToday",
    label: "Open today automatically",
    desc: "Open today's panel on arrival at the fronting history.",
  },
  {
    key: "prefillEnd",
    label: 'Prefill "Ended at"',
    desc: "Seed a blank end time from the start time when editing a front.",
  },
  {
    key: "stopwatch",
    label: "Fronting stopwatch",
    desc: "Show how long each member has been fronting, under their name on the dashboard.",
  },
  {
    key: "nameLinks",
    label: "Names link to profiles",
    desc: "On the dashboard, click a fronting member's name to open their profile. The avatar still opens the front-type switcher.",
  },
  {
    key: "frontDates",
    label: "Dates on cross-day fronts",
    desc: "In the fronting history day panel, show the date beside a start or end time that falls on another day.",
  },
  {
    key: "htmlDescriptions",
    label: "Render HTML in descriptions",
    desc: "Show saved descriptions as formatted HTML, the way the editor preview does, instead of raw markup. Sanitised first.",
  },
  {
    key: "weeklyExport",
    label: "Weekly export",
    desc: 'Add an "Export..." button to the fronting history for a clinician-readable report: a timeline of switches and notes, mood changes, and summary stats over a chosen date range.',
  },
  {
    key: "force24h",
    label: "24-hour times",
    desc: "Render times as 17:25 rather than 5:25 pm, everywhere on the site.",
  },
  {
    key: "customCss",
    label: "Custom CSS",
    desc: "Apply your own CSS to the site!",
  },
];
const STORE = "psqolConfig";
const CSS_STORE = "psqolCustomCss";

let cfg = (() => {
  const defaults = Object.fromEntries(TWEAKS.map((t) => [t.key, true]));
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(STORE) || "{}") };
  } catch {
    return defaults; // private mode, blocked storage, corrupt JSON
  }
})();

function saveConfig() {
  try {
    localStorage.setItem(STORE, JSON.stringify(cfg));
  } catch {
    log(
      "could not persist config (storage blocked); changes apply for this page only",
    );
  }
}

// CSS is kept out of `cfg`: that object is a flat set of booleans, derived from
// TWEAKS by defaulting every key to true, and a free-text value doesn't fit that shape.
// Also means a corrupt/missing cfg blob can't wipe out CSS someone spent time writing.

let customCss = "";
try {
  customCss = localStorage.getItem(CSS_STORE) || "";
} catch {
  customCss = ""; // private mode, blocked storage
}

function saveCustomCss(css) {
  customCss = css;
  try {
    localStorage.setItem(CSS_STORE, css);
  } catch {
    log(
      "could not persist custom CSS (storage blocked); changes apply for this page only",
    );
  }
}
