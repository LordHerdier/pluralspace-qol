// ==UserScript==
// @name         pluralspace QoL
// @namespace    https://pluralspace.app/
// @version      1.0.0
// @description  Quality of life tweaks for pluralspace.app
// @match        https://pluralspace.app/*
// @run-at       document-start
// @grant        GM_registerMenuCommand
// @updateURL    https://github.com/LordHerdier/pluralspace-qol/raw/branch/main/src/pluralspace-qol.user.js
// @downloadURL  https://github.com/LordHerdier/pluralspace-qol/raw/branch/main/src/pluralspace-qol.user.js
// ==/UserScript==

(function () {
  'use strict';

// src/modules/05-header-consts.js

const VERSION = "1.0.0";
const log = (...a) => console.log("[ps-qol]", ...a);

// src/modules/10-selectors.js

// Vue 3 + Inertia, Tailwind, no hashed class names. The calendar exposes real
// data attributes and the drawer and form fields have stable ids, so these
// are about as durable as userscript selectors get.
const SEL = {
  fronts: "/space/fronts",

  // The app rings today's cell itself
  todayCell: "button[data-date].ring-accent",

  drawer: 'aside[aria-labelledby="day-drawer-title"]',
  startInput: "#front-start",
  endInput: "#front-end",
  frontingCard: '[data-tour="dashboard-fronting"]',
  prose: "div.prose",
  frontName: "span.max-w-full.truncate.text-center",
  drawerName: "span.truncate.text-sm.font-semibold.text-text-heading",
  drawerTime: "p.tabular-nums",
  drawerTitle: "#day-drawer-title",

  // Scoped by :has(h1) rather than a class chain: the fronting history page
  // has more than one <header> (the day drawer has its own), and this is
  // the only one with a heading in it.
  frontsHeader: "header:has(h1)",
};

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

// src/modules/30-pin-drawer.js

// All CSS. The drawer is a plain v-if'd element inside #main-content
const CSS = `
:root { --psqol-panel-w: min(28rem, 34vw); }

@media (min-width: 1024px) {
  html:has(${SEL.drawer}) { overflow: auto !important; }

  #main-content > div:has(> ${SEL.drawer}) {
    top: var(--app-header-h, 63px);
    bottom: 0;
    right: 0;
    left: auto;
    width: var(--psqol-panel-w);
    background: transparent !important;
    pointer-events: none;
  }

  #main-content ${SEL.drawer} {
    pointer-events: auto;
    inset: 0;
    width: 100%;
    max-width: none;
    box-shadow: none;
  }

  #main-content:has(${SEL.drawer}) {
    padding-right: calc(var(--psqol-panel-w) + 1.5rem);
  }
}
`;

// A second stylesheet, always present. The pinned-drawer rules live in their
// own element that is removed when that tweak is off
const BASE_CSS = `
[data-psqol-nav] { cursor: pointer; }
[data-psqol-nav]:hover { text-decoration: underline; }
`;

function injectBaseStyle() {
  if (document.getElementById("psqol-base-style")) return;
  const parent = document.head || document.documentElement;
  if (!parent) return;
  const el = document.createElement("style");
  el.id = "psqol-base-style";
  el.textContent = BASE_CSS;
  parent.appendChild(el);
}

function syncPinStyle() {
  const existing = document.getElementById("psqol-style");
  if (!cfg.pinDrawer) {
    existing?.remove();
    return;
  }
  if (existing) return;

  // Prevent flash when page loading
  const parent = document.head || document.documentElement;
  if (!parent) return;
  const el = document.createElement("style");
  el.id = "psqol-style";
  el.textContent = CSS;
  parent.appendChild(el);
}

// src/modules/35-custom-css.js

// A single <style> element with whatever the user pasted into the panel's CSS
// editor. In own element so only this is removed when it's disabled.
function syncCustomCss() {
  const existing = document.getElementById("psqol-custom-style");
  if (!cfg.customCss || !customCss) {
    existing?.remove();
    return;
  }
  const parent = document.head || document.documentElement;
  if (!parent) return;
  let el = existing;
  if (!el) {
    el = document.createElement("style");
    el.id = "psqol-custom-style";
    parent.appendChild(el);
  }
  if (el.textContent !== customCss) el.textContent = customCss;
}

// src/modules/40-24h-patch.js

// The app's shared time helper hardcodes hour12:true:
// `toLocaleTimeString(undefined, {hour:'numeric',minute:'2-digit',hour12:true})`
// Which doesn't respect locale settings. So we override it

const PAGE_PATCH = `(function () {
  if (window.__psqol24h) return;
  window.__psqol24h = true;
  ['toLocaleTimeString', 'toLocaleString'].forEach(function (m) {
    var orig = Date.prototype[m];
    Date.prototype[m] = function (locales, options) {
      // Only touch explicit 12-hour requests, and only while enabled.
      if (options && options.hour12 === true &&
          document.documentElement.getAttribute('data-psqol-24h') === 'on') {
        var o = Object.assign({}, options);
        delete o.hour12;
        // hourCycle h23 rather than hour12:false, which yields a 24:00 midnight
        // under some locales instead of 00:00.
        o.hourCycle = 'h23';
        return orig.call(this, locales, o);
      }
      return orig.apply(this, arguments);
    };
  });
})();`;

let patchInstalled = false;
function sync24h() {
  const root = document.documentElement;
  if (!root) return;
  root.setAttribute("data-psqol-24h", cfg.force24h ? "on" : "off");
  if (patchInstalled) return;
  const parent = document.head || root;
  patchInstalled = true;
  // Injected as a page <script> rather than run directly: under a @grant that
  // sandboxes the userscript, patching Date.prototype in the sandbox would
  // not affect the page's own Date. The site sends no CSP, so this executes.
  const el = document.createElement("script");
  el.textContent = PAGE_PATCH;
  parent.appendChild(el);
  el.remove();
}

// src/modules/50-dashboard-patch.js

// Render fronting time and name links on the dashboard.

const DASHBOARD_PATCH = `(function () {
  if (window.__psqolSw) return;
  window.__psqolSw = true;

  var CARD = '${SEL.frontingCard}';
  var NAME = '${SEL.frontName}';
  var DRAWER = '${SEL.drawer}';
  var DRAWER_NAME = '${SEL.drawerName}';
  var DRAWER_TIME = '${SEL.drawerTime}';
  var DRAWER_TITLE = '${SEL.drawerTitle}';
  var CLS = 'psqol-stopwatch';

  function pageProps() {
    try {
      var app = document.getElementById('app');
      var page = app && app.__vue_app__ &&
        app.__vue_app__.config.globalProperties.$page;
      return (page && page.props) || null;
    } catch (e) {
      return null; // app shape changed
    }
  }

  function fronts() {
    var p = pageProps();
    return (p && p.currentFronts) || null;
  }

  // The fronting history has no per-entry member id in the DOM, but its weeks
  // prop carries every front for the month, each with its member. Building a
  // label -> id map over the whole month avoids having to work out which day
  // the drawer currently shows.
  function memberIdsByLabel() {
    var p = pageProps();
    var weeks = p && p.weeks;
    if (!weeks || !weeks.length) return null;
    var map = Object.create(null);
    var ambiguous = Object.create(null);
    weeks.forEach(function (week) {
      (week || []).forEach(function (day) {
        ((day && day.fronts) || []).forEach(function (f) {
          var m = f && f.member;
          if (!m || !m.id) return;
          var label = m.display_label || m.name;
          if (!label) return;
          // Two members sharing a display label cannot be told apart from the
          // rendered name, and guessing would open the wrong profile.
          if (map[label] && map[label] !== m.id) ambiguous[label] = true;
          map[label] = m.id;
        });
      });
    });
    Object.keys(ambiguous).forEach(function (k) { delete map[k]; });
    return map;
  }

  function linkDrawerNames(on) {
    var drawer = document.querySelector(DRAWER);
    if (!drawer) return;
    var els = drawer.querySelectorAll(DRAWER_NAME);
    if (!on) {
      [].forEach.call(els, function (e) { e.removeAttribute('data-psqol-nav'); });
      return;
    }
    var map = memberIdsByLabel();
    if (!map) return;
    [].forEach.call(els, function (el) {
      var id = map[(el.textContent || '').trim()];
      if (id) {
        if (el.getAttribute('data-psqol-nav') !== id) el.setAttribute('data-psqol-nav', id);
      } else {
        el.removeAttribute('data-psqol-nav');
      }
    });
  }

  // parse dates on cross-day fronts so a front that runs past midnight is properly displayed
  function localYmd(t) {
    var d = new Date(t);
    var p2 = function (n) { return n < 10 ? '0' + n : String(n); };
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }

  // Which day the panel is showing. Its heading ("Sep 4, 2026") is the only place the app states that
  function drawerDay(drawer) {
    var h = drawer.querySelector(DRAWER_TITLE);
    if (!h) return null;
    var t = Date.parse((h.textContent || '').trim());
    return isNaN(t) ? null : localYmd(t);
  }

  function dayFronts(ymd) {
    var p = pageProps();
    var weeks = p && p.weeks;
    if (!weeks || !ymd) return null;
    for (var i = 0; i < weeks.length; i++) {
      var week = weeks[i] || [];
      for (var j = 0; j < week.length; j++) {
        var day = week[j];
        var d = day && day.date;
        // date may be a plain date or a full datetime; only the day matters.
        if (typeof d === 'string' && d.slice(0, 10) === ymd) return day.fronts || [];
      }
    }
    return null;
  }

  function labelOf(f) {
    var m = f && f.member;
    return (m && (m.display_label || m.name)) || '';
  }

  function edgeTime(f, end) {
    if (!f) return NaN;
    var keys = end
      ? ['ended_at', 'end_at', 'ends_at', 'end']
      : ['started_at', 'start_at', 'starts_at', 'start'];
    for (var i = 0; i < keys.length; i++) {
      if (f[keys[i]]) {
        var t = parseStarted(f[keys[i]]);
        if (!isNaN(t)) return t;
      }
    }
    return NaN;
  }

  // Minutes past midnight for a rendered time, in either 12- or 24-hour form.
  // Used only to tell two fronts of the same member apart, so a string it
  // cannot read is not an error
  function clockOf(s) {
    var m = /(\\d{1,2}):(\\d{2})/.exec(s || '');
    if (!m) return null;
    var h = Number(m[1]);
    if (/p\\.?m/i.test(s)) h = (h % 12) + 12;
    else if (/a\\.?m/i.test(s)) h = h % 12;
    return (h % 24) * 60 + Number(m[2]);
  }

  // The panel's order is not the prop's, so entries are matched by member and,
  // where one member fronted twice that day, by the start time already on
  // screen. Position is only a fallback, and only when the label agrees.
  function frontFor(list, label, startClock, i) {
    var same = [];
    for (var j = 0; j < list.length; j++) {
      if (labelOf(list[j]) === label) same.push(list[j]);
    }
    if (same.length === 1) return same[0];
    if (same.length > 1 && startClock !== null) {
      var hits = same.filter(function (f) {
        var t = edgeTime(f, false);
        if (isNaN(t)) return false;
        var d = new Date(t);
        return d.getHours() * 60 + d.getMinutes() === startClock;
      });
      if (hits.length === 1) return hits[0];
    }
    var byIndex = list[i];
    return byIndex && labelOf(byIndex) === label ? byIndex : null;
  }

  function dateLabel(t, dayYmd) {
    var d = new Date(t);
    var opts = { month: 'short', day: 'numeric' };
    // A front spanning new year would otherwise read as a date in this one.
    if (String(d.getFullYear()) !== dayYmd.slice(0, 4)) opts.year = 'numeric';
    return d.toLocaleDateString(undefined, opts);
  }

  function markDrawerDates(on) {
    var drawer = document.querySelector(DRAWER);
    if (!drawer) return;
    var names = drawer.querySelectorAll(DRAWER_NAME);
    if (!names.length) return;

    var dayYmd = on ? drawerDay(drawer) : null;
    var list = dayYmd ? dayFronts(dayYmd) : null;

    [].forEach.call(names, function (nameEl, i) {
      var box = nameEl.closest('.min-w-0');
      var p = box && box.querySelector(DRAWER_TIME);
      if (!p) return;

      var out = p.getAttribute('data-psqol-time-out');
      var raw = (out !== null && p.textContent === out)
        ? p.getAttribute('data-psqol-time-raw')
        : p.textContent;

      var next = raw;
      if (list) {
        var arrow = raw.indexOf('\u2192');
        if (arrow >= 0) {
          var startTxt = raw.slice(0, arrow).trim();
          var endTxt = raw.slice(arrow + 1).trim();
          var f = frontFor(list, (nameEl.textContent || '').trim(), clockOf(startTxt), i);
          if (f) {
            var st = edgeTime(f, false);
            var et = edgeTime(f, true);
            if (!isNaN(st) && localYmd(st) !== dayYmd) {
              startTxt = dateLabel(st, dayYmd) + ', ' + startTxt;
            }
            // No end time means "Ongoing", which no date belongs on.
            if (!isNaN(et) && clockOf(endTxt) !== null && localYmd(et) !== dayYmd) {
              endTxt = dateLabel(et, dayYmd) + ', ' + endTxt;
            }
            next = startTxt + ' \u2192 ' + endTxt;
          }
        }
      }

      if (p.textContent !== next) p.textContent = next;
      if (next === raw) {
        p.removeAttribute('data-psqol-time-raw');
        p.removeAttribute('data-psqol-time-out');
      } else {
        p.setAttribute('data-psqol-time-raw', raw);
        p.setAttribute('data-psqol-time-out', next);
      }
    });
  }


  // Weekly Export Bridge
  // The report is in its own sandbox, but the weeks prop and the Inertia asset version
  // are only reachable here. Keeps a hidden element fresh so we don't have to do another
  // request/response handshake
  var EXPORT_DATA_ID = 'psqol-export-data';

  function pageVersion() {
    try {
      var app = document.getElementById('app');
      var page = app && app.__vue_app__ &&
        app.__vue_app__.config.globalProperties.$page;
      return (page && page.version) || null;
    } catch (e) {
      return null;
    }
  }

  function publishExportData(on) {
    var el = document.getElementById(EXPORT_DATA_ID);
    if (!on) {
      if (el) el.remove();
      return;
    }
    var p = pageProps();
    var weeks = p && p.weeks;
    if (!weeks) return; // not loaded yet; leave any previous payload in place
    var payload = JSON.stringify({
      weeks: weeks,
      // Which month weeks belongs to
      month: (p.month && p.month.value) || null,
      version: pageVersion(),
      system: p.currentSystem || null,
    });
    if (!el) {
      el = document.createElement('div');
      el.id = EXPORT_DATA_ID;
      el.hidden = true;
      (document.body || document.documentElement).appendChild(el);
    }
    if (el.textContent !== payload) el.textContent = payload;
  }

  function parseStarted(v) {
    if (!v) return NaN;
    var t = Date.parse(v);
    // Laravel usually serialises ISO8601, but a space-separated datetime is
    // parsed inconsistently across engines; normalise before giving up.
    if (isNaN(t) && typeof v === 'string') t = Date.parse(v.replace(' ', 'T'));
    return t;
  }

  function fmt(ms) {
    if (ms < 0) ms = 0;
    var s = Math.floor(ms / 1000), m = Math.floor(s / 60);
    var h = Math.floor(m / 60), d = Math.floor(h / 24);
    var p2 = function (n) { return n < 10 ? '0' + n : String(n); };
    // Seconds stop being useful once it has been hours; each unit drops the
    // one below it rather than showing a long unreadable string.
    if (d > 0) return d + 'd ' + p2(h % 24) + 'h';
    if (h > 0) return h + 'h ' + p2(m % 60) + 'm';
    if (m > 0) return m + 'm ' + p2(s % 60) + 's';
    return s + 's';
  }

  function cells(card) {
    var grid = card.querySelector('.grid');
    if (!grid) return [];
    // The trailing "add a front" cell is a dashed placeholder with no avatar.
    return [].filter.call(grid.children, function (c) {
      return !!c.querySelector('img');
    });
  }

  function entryFor(cell, data, i) {
    // Match on the name in the avatar button's title, which is what the props
    // carry; fall back to position.
    var btn = cell.querySelector('button[title]');
    var name = btn && btn.getAttribute('title');
    if (name) {
      for (var j = 0; j < data.length; j++) {
        if (data[j] && data[j].member && data[j].member.name === name) return data[j];
      }
    }
    return data[i] || null;
  }

  function navigate(url, e) {
    // Treat it like a link even though it is a span
    if (e && (e.ctrlKey || e.metaKey || e.shiftKey || e.button === 1)) {
      window.open(url, '_blank', 'noopener');
      return;
    }
    try {
      var app = document.getElementById('app');
      var inertia = app && app.__vue_app__ &&
        app.__vue_app__.config.globalProperties.$inertia;
      // Inertia's own router keeps this a client-side visit. A location change
      // would throw away the SPA state and reload the whole app.
      if (inertia && typeof inertia.visit === 'function') {
        inertia.visit(url);
        return;
      }
    } catch (err) { /* fall through */ }
    window.location.assign(url);
  }

  function tick() {
    var swOn = document.documentElement.getAttribute('data-psqol-stopwatch') === 'on';
    var linkOn = document.documentElement.getAttribute('data-psqol-namelink') === 'on';

    // The fronting history and the dashboard are different pages; only one of
    // these ever finds its container.
    linkDrawerNames(linkOn);
    markDrawerDates(
      document.documentElement.getAttribute('data-psqol-frontdate') === 'on');
    publishExportData(
      document.documentElement.getAttribute('data-psqol-export') === 'on');

    var card = document.querySelector(CARD);
    if (!card) return;

    if (!swOn) {
      [].forEach.call(card.querySelectorAll('.' + CLS), function (e) { e.remove(); });
    }
    if (!linkOn) {
      [].forEach.call(card.querySelectorAll('[data-psqol-nav]'), function (e) {
        e.removeAttribute('data-psqol-nav');
      });
    }
    if (!swOn && !linkOn) return;

    var data = fronts();
    if (!data || !data.length) return;

    cells(card).forEach(function (cell, i) {
      var f = entryFor(cell, data, i);
      if (!f) return;

      if (linkOn) {
        var nameEl = cell.querySelector(NAME);
        // can_view_member is the app's own answer to whether this profile is
        // reachable; without it a click would land on a permission error.
        if (nameEl && f.member_id && f.can_view_member !== false) {
          if (nameEl.getAttribute('data-psqol-nav') !== f.member_id) {
            nameEl.setAttribute('data-psqol-nav', f.member_id);
          }
        } else if (nameEl) {
          nameEl.removeAttribute('data-psqol-nav');
        }
      }

      if (swOn) {
        var t = parseStarted(f.started_at);
        if (isNaN(t)) return;
        var el = cell.querySelector('.' + CLS);
        if (!el) {
          el = document.createElement('span');
          el.className = CLS;
          el.style.cssText = 'font-variant-numeric:tabular-nums;font-size:10px;' +
            'line-height:1.2;letter-spacing:.04em;opacity:.65;text-align:center';
          cell.appendChild(el);
        }
        var txt = fmt(Date.now() - t);
        if (el.textContent !== txt) el.textContent = txt;
        el.title = 'Fronting since ' + new Date(t).toLocaleString();
      }
    });
  }

  // Delegated, so a Vue re-render cannot strand a listener on a discarded node
  // and nothing needs rewiring each tick. Capture phase keeps it ahead of any
  // handler the app may add later.
  function onClick(e) {
    var el = e.target && e.target.closest && e.target.closest('[data-psqol-nav]');
    if (!el) return;
    if (e.type === 'auxclick' && e.button !== 1) return;
    e.preventDefault();
    e.stopPropagation();
    navigate('/members/' + el.getAttribute('data-psqol-nav'), e);
  }
  document.addEventListener('click', onClick, true);
  document.addEventListener('auxclick', onClick, true);

  // A plain interval rather than a MutationObserver: the observer would see
  // this function's own writes and re-enter once a second for no benefit. One
  // second is also the resync window after a Vue re-render drops the elements.
  setInterval(tick, 1000);
  tick();
})();`;

let dashboardInstalled = false;
function syncDashboard() {
  const root = document.documentElement;
  if (!root) return;
  root.setAttribute("data-psqol-stopwatch", cfg.stopwatch ? "on" : "off");
  root.setAttribute("data-psqol-namelink", cfg.nameLinks ? "on" : "off");
  root.setAttribute("data-psqol-frontdate", cfg.frontDates ? "on" : "off");
  root.setAttribute("data-psqol-export", cfg.weeklyExport ? "on" : "off");
  if (dashboardInstalled) return;
  const parent = document.head || root;
  dashboardInstalled = true;
  const el = document.createElement("script");
  el.textContent = DASHBOARD_PATCH;
  parent.appendChild(el);
  el.remove();
}

// src/modules/60-auto-open-today.js

// Calendar page: automatically open today's date.
const autoOpenToday = (() => {
  let doneFor = null;
  return {
    key: "autoOpenToday",
    apply() {
      if (location.pathname !== SEL.fronts) {
        doneFor = null;
        return;
      }
      if (doneFor === location.pathname) return;
      if (document.querySelector(SEL.drawer)) {
        doneFor = location.pathname;
        return;
      }
      const cell = document.querySelector(SEL.todayCell);
      if (!cell) return; // not rendered yet, or viewing another month
      doneFor = location.pathname;
      log("opening today", cell.dataset.date);
      cell.click();
      setTimeout(() => {
        if (document.querySelector(SEL.drawer)) return;
        if (location.pathname !== SEL.fronts || !cfg.autoOpenToday) return;
        const again = document.querySelector(SEL.todayCell);
        if (!again) return;
        log("drawer did not open, retrying once");
        again.click();
      }, 1200);
    },
  };
})();

// src/modules/65-prefill-end.js

// Seeds the "ended at" field on the calendar's "edit front" with the start time.
// Reduces the number of keystrokes by a bit if fronts are typically on the same day.
const prefillEnd = (() => {
  // Per-element, so reopening the modal on a fresh input prefills again while
  // a field the user has deliberately cleared is left alone.
  const filled = new WeakSet();
  return {
    key: "prefillEnd",
    apply() {
      const start = document.querySelector(SEL.startInput);
      const end = document.querySelector(SEL.endInput);
      if (!start || !end || filled.has(end)) return;
      // Disabled means "Still fronting" is on and an end time is meaningless.
      if (end.disabled || end.value || !start.value) return;
      filled.add(end);
      end.value = start.value;
      end.dispatchEvent(new Event("change", { bubbles: true }));
      log("prefilled end time from start:", start.value);
    },
  };
})();

// src/modules/70-html-descriptions.js

// Render HTML in member's descriptions
// WARNING: The official app *deliberately* escapes these to prevent XSS attacks.
// Opting back into these means accepting that risk. Minimal if you're only viewing
// your own system's pages, but please do keep this in mind

const ALLOWED_TAGS = new Set([
  "a",
  "abbr",
  "b",
  "blockquote",
  "br",
  "center",
  "code",
  "del",
  "details",
  "div",
  "em",
  "figcaption",
  "figure",
  "font",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "ins",
  "kbd",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "q",
  "s",
  "samp",
  "small",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "tr",
  "u",
  "ul",
]);
const ALLOWED_ATTRS = new Set([
  "align",
  "alt",
  "class",
  "color",
  "colspan",
  "face",
  "height",
  "href",
  "rowspan",
  "size",
  "src",
  "start",
  "style",
  "title",
  "width",
]);
const LOOKS_LIKE_HTML = /<([a-z][a-z0-9]*)(\s[^<>]*)?\/?>/i;

function sanitize(html) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const walk = (node) => {
    for (const child of [...node.children]) {
      if (!ALLOWED_TAGS.has(child.tagName.toLowerCase())) {
        child.remove(); // takes its subtree with it, which is the point
        continue;
      }
      for (const attr of [...child.attributes]) {
        const n = attr.name.toLowerCase();
        const v = attr.value.trim();
        const bad =
          n.startsWith("on") ||
          !ALLOWED_ATTRS.has(n) ||
          (n === "href" && !/^(https?:|mailto:|#)/i.test(v)) ||
          (n === "src" && !/^(https?:|data:image\/)/i.test(v)) ||
          (n === "style" && /javascript:|expression\(/i.test(v));
        if (bad) child.removeAttribute(attr.name);
      }
      walk(child);
    }
  };
  walk(doc.body);
  return doc.body.innerHTML;
}

const htmlDescriptions = (() => {
  const seen = new WeakMap();
  return {
    key: "htmlDescriptions",
    apply() {
      for (const el of document.querySelectorAll(SEL.prose)) {
        if (el.childElementCount) continue; // already markup
        const raw = el.textContent;
        if (!raw || seen.get(el) === raw) continue;
        seen.set(el, raw);
        if (!LOOKS_LIKE_HTML.test(raw)) continue;
        const clean = sanitize(raw);
        if (!clean.trim()) continue; // nothing survived; leave the text as-is
        el.innerHTML = clean;
      }
    },
  };
})();

// src/modules/80-weekly-export.js

// Front Log Export
// Generates a clinician readable report of a selected time-frame

const EXPORT_CSS = `
#psqol-export-btn {
  cursor: pointer; border: 1px solid rgba(127, 127, 127, .4); border-radius: 8px;
  padding: 6px 14px; font: inherit; font-size: 13px; background: transparent;
  color: inherit; margin-left: auto;
}
#psqol-export-btn:hover { background: rgba(127, 127, 127, .12); }
#psqol-export-modal {
  position: fixed; inset: 0; z-index: 2147483600; display: flex;
  align-items: center; justify-content: center; background: rgba(0, 0, 0, .5);
  font: 13px/1.45 system-ui, sans-serif;
}
#psqol-export-dialog {
  width: 300px; max-width: calc(100vw - 32px); border-radius: 12px;
  padding: 16px 18px; color: #1c1a26; background: #fff; border: 1px solid #d6d2e2;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .3);
}
html.dark #psqol-export-dialog {
  color: #e8e6f0; background: #191424; border-color: #3a3350;
}
#psqol-export-dialog h2 { margin: 0 0 12px; font-size: 14px; }
#psqol-export-dialog label { display: block; margin-bottom: 10px; }
#psqol-export-dialog input {
  display: block; margin-top: 3px; width: 100%; box-sizing: border-box;
  font: inherit; padding: 5px 7px; border-radius: 6px;
  border: 1px solid rgba(127, 127, 127, .4); background: transparent; color: inherit;
}
#psqol-export-error { color: #c0392b; font-size: 12px; margin-bottom: 8px; display: none; }
#psqol-export-actions { display: flex; justify-content: flex-end; gap: 8px; }
#psqol-export-actions button {
  cursor: pointer; border: 1px solid rgba(127, 127, 127, .4); border-radius: 6px;
  padding: 5px 12px; font: inherit; background: transparent; color: inherit;
}
`;

function injectExportStyle() {
  if (document.getElementById("psqol-export-style")) return;
  const el = document.createElement("style");
  el.id = "psqol-export-style";
  el.textContent = EXPORT_CSS;
  (document.head || document.documentElement).appendChild(el);
}

function escapeHtml(s) {
  return String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[c],
  );
}

function fmtLocalYmd(d) {
  const p2 = (n) => (n < 10 ? "0" + n : String(n));
  return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate());
}

// Sunday-Saturday, matching the calendar's own weeks prop grouping (each
// week row runs Sun..Sat), so the default range lines up with what the user
// is already looking at.
function currentWeekRange() {
  const now = new Date();
  const start = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - now.getDay(),
  );
  const end = new Date(
    start.getFullYear(),
    start.getMonth(),
    start.getDate() + 6,
  );
  return [start, end];
}

function fmtDuration(ms) {
  if (!isFinite(ms) || ms < 0) ms = 0;
  const mins = Math.round(ms / 60000);
  const h = Math.floor(mins / 60),
    m = mins % 60;
  return h > 0 ? h + "h " + m + "m" : m + "m";
}

// Fronts spanning multiple days appear once per day they are active, so the
// same id turns up in several day cells; a Map by id is what dedupes that.
function collectFronts(weeks, startYmd, endYmd) {
  const seen = new Map();
  (weeks || []).forEach((week) => {
    (week || []).forEach((day) => {
      const ymd = day && day.date && day.date.slice(0, 10);
      if (!ymd || ymd < startYmd || ymd > endYmd) return;
      (day.fronts || []).forEach((f) => {
        if (f && f.id && !seen.has(f.id)) seen.set(f.id, f);
      });
    });
  });
  return [...seen.values()].sort(
    (a, b) => Date.parse(a.started_at) - Date.parse(b.started_at),
  );
}

// Parsed from the YMD strings directly rather than via Date arithmetic on
// the boundaries, so a range that starts or ends at a month edge can't
// shift a day off under a timezone offset.
function monthsInRange(startYmd, endYmd) {
  const months = [];
  const cursor = new Date(
    Number(startYmd.slice(0, 4)),
    Number(startYmd.slice(5, 7)) - 1,
    1,
  );
  const last = new Date(
    Number(endYmd.slice(0, 4)),
    Number(endYmd.slice(5, 7)) - 1,
    1,
  );
  while (cursor <= last) {
    months.push(
      cursor.getFullYear() +
        "-" +
        String(cursor.getMonth() + 1).padStart(2, "0"),
    );
    cursor.setMonth(cursor.getMonth() + 1);
  }
  return months;
}

function monthLabel(value) {
  const [y, m] = value.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });
}

// A month past this many fetches is a range wide enough that a clinician
// weekly report was probably the wrong tool for it, so it stops there
// rather than firing off dozens of requests for one export click.
const MAX_MONTHS_FETCHED = 24;

// The bridged weeks only ever cover whatever month the calendar currently
// has open. A range reaching outside that gets its other months the same
// Inertia-protocol way as everything else here.
// One request per month, in parallel, each falling back to "missing"
// rather than failing the whole export if the structure changes
async function collectAllWeeks(bridge, startYmd, endYmd) {
  const months = monthsInRange(startYmd, endYmd);
  const toFetch = months.slice(0, MAX_MONTHS_FETCHED);
  const versionHeader = bridge.version
    ? { "X-Inertia-Version": bridge.version }
    : {};

  const results = await Promise.all(
    toFetch.map(async (month) => {
      if (month === bridge.month) return { month, weeks: bridge.weeks || [] };
      try {
        const { value } = await fetchDeferrable(
          "/space/fronts?month=" + month,
          "weeks",
          versionHeader,
        );
        return { month, weeks: value || null };
      } catch (e) {
        log("fetching fronts for", month, "failed:", e);
        return { month, weeks: null };
      }
    }),
  );

  const allWeeks = [];
  const missingMonths = months.slice(MAX_MONTHS_FETCHED);
  results.forEach((r) => {
    if (r.weeks) allWeeks.push(...r.weeks);
    else missingMonths.push(r.month);
  });
  return { allWeeks, missingMonths };
}

// Keyed by id rather than the label text: two members can share a display
// label (the drawer name-linking code hits the same ambiguity), and once
// names are resolved separately below, id is the only thing guaranteed to
// still point at one member.
function summarizeFronts(fronts) {
  const byMember = new Map();
  fronts.forEach((f) => {
    const id = (f.member && f.member.id) || null;
    const start = Date.parse(f.started_at);
    const end = f.ended_at ? Date.parse(f.ended_at) : Date.now();
    const cur = byMember.get(id) || { member: f.member, count: 0, ms: 0 };
    cur.count += 1;
    cur.ms += Math.max(0, end - start);
    byMember.set(id, cur);
  });
  return [...byMember.values()].sort((a, b) => b.ms - a.ms);
}

// The Fronts page's weeks prop only ever carries display_label and the real
// "Name" field only shows up on a member's own profile page.
async function resolveMemberNames(members, version) {
  const versionHeader = version ? { "X-Inertia-Version": version } : {};
  const names = new Map();
  await Promise.all(
    members.map(async (m) => {
      if (!m || !m.id || names.has(m.id)) return;
      let resolved = null;
      try {
        const body = await inertiaFetch("/members/" + m.id, versionHeader);
        const raw =
          body && body.props && body.props.member && body.props.member.name;
        if (raw) {
          // Sanitised the same way as htmlDescriptions
          const html = sanitize(raw);
          const text = new DOMParser()
            .parseFromString(html, "text/html")
            .body.textContent.trim();
          resolved = { html, text: text || raw };
        }
      } catch (e) {
        log("member name fetch failed for", m.id, e);
      }
      names.set(m.id, resolved);
    }),
  );
  return names;
}

function displayName(member, nameMap) {
  const label = (member && member.display_label) || "Unknown";
  const resolved = member && member.id && nameMap.get(member.id);
  return resolved || { html: escapeHtml(label), text: label };
}

// The Inertia-protocol headers its own client-side router sends for a
// partial visit
async function inertiaFetch(url, extraHeaders) {
  const headers = Object.assign(
    {
      "X-Inertia": "true",
      "X-Requested-With": "XMLHttpRequest",
      Accept: "text/html, application/xhtml+xml",
    },
    extraHeaders || {},
  );
  const res = await fetch(url, { headers, credentials: "same-origin" });
  if (!res.ok) throw new Error("activity request failed (" + res.status + ")");
  return res.json();
}

// Fetches one prop that might be Inertia-deferred (absent from
// the plain response until a second request explicitly asks for it).
// Returns the prop's value plus headers that ask for it
// directly, for a caller that needs to repeat the request (paging).
async function fetchDeferrable(url, propKey, versionHeader) {
  let body = await inertiaFetch(url, versionHeader);
  let value = body.props && body.props[propKey];
  let partialHeaders = Object.assign(
    {
      "X-Inertia-Partial-Component": body.component,
      "X-Inertia-Partial-Data": propKey,
    },
    versionHeader,
  );
  if (value === undefined && body.deferredProps) {
    const group = Object.values(body.deferredProps).find((keys) =>
      keys.includes(propKey),
    );
    if (group) {
      partialHeaders = Object.assign(
        {
          "X-Inertia-Partial-Component": body.component,
          "X-Inertia-Partial-Data": group.join(","),
        },
        versionHeader,
      );
      body = await inertiaFetch(url, partialHeaders);
      value = body.props && body.props[propKey];
    }
  }
  return { value, partialHeaders };
}

// Don't fetch too much data
const ACTIVITY_PAGE_SIZE = 200;
const MAX_ACTIVITY_PAGES = 10;

async function fetchMoodEvents(version, rangeStart, rangeEnd) {
  const versionHeader = version ? { "X-Inertia-Version": version } : {};
  const pageUrl = (n) =>
    "/activity?per_page=" + ACTIVITY_PAGE_SIZE + (n > 1 ? "&page=" + n : "");

  const first = await fetchDeferrable(pageUrl(1), "logs", versionHeader);
  const partialHeaders = first.partialHeaders;
  let logs = first.value;
  let rows = (logs && logs.data) || [];
  let lastPage = (logs && logs.last_page) || 1;
  let page = 1;
  let cappedByPageLimit = false;

  // Rows come back newest-first, so the last row on a page is its oldest.
  while (page < lastPage) {
    const oldest = rows.length
      ? Date.parse(rows[rows.length - 1].created_at)
      : null;
    if (oldest !== null && oldest <= rangeStart.getTime()) break;
    if (page >= MAX_ACTIVITY_PAGES) {
      cappedByPageLimit = true;
      break;
    }
    page += 1;
    const next = await inertiaFetch(pageUrl(page), partialHeaders);
    const nextLogs = next.props && next.props.logs;
    const nextRows = (nextLogs && nextLogs.data) || [];
    if (!nextRows.length) break;
    rows = rows.concat(nextRows);
    lastPage = (nextLogs && nextLogs.last_page) || lastPage;
  }

  const events = rows
    .filter((r) => r && r.subject_type === "App\\Models\\SystemMoodEntry")
    .map((r) => {
      const m = /mood to (.+)$/i.exec(r.description || "");
      return {
        at: Date.parse(r.created_at),
        mood: m ? m[1].trim() : r.description || "Unknown",
      };
    })
    .filter(
      (e) =>
        !isNaN(e.at) &&
        e.at >= rangeStart.getTime() &&
        e.at <= rangeEnd.getTime(),
    )
    .sort((a, b) => a.at - b.at);

  // Only actually incomplete if the page cap cut it off before reaching the
  // range's start. Running out of real pages (page === lastPage) means
  // there just isn't any older activity, which is a normal, complete answer.
  const oldestFetched = rows.length
    ? Date.parse(rows[rows.length - 1].created_at)
    : null;
  const truncated =
    cappedByPageLimit &&
    oldestFetched !== null &&
    oldestFetched > rangeStart.getTime();
  return { events, truncated };
}

// Approximate time-in-mood: each change lasts until the next one, or until
// the end of the range for the last
function moodDurations(events, rangeEnd) {
  return events.map((e, i) => {
    const nextAt =
      i + 1 < events.length ? events[i + 1].at : rangeEnd.getTime();
    return { ...e, ms: Math.max(0, nextAt - e.at) };
  });
}

function totalByMood(durEvents) {
  const byMood = new Map();
  durEvents.forEach((e) => {
    const cur = byMood.get(e.mood) || { count: 0, ms: 0 };
    cur.count += 1;
    cur.ms += e.ms;
    byMood.set(e.mood, cur);
  });
  return [...byMood.entries()]
    .map(([mood, v]) => ({ mood, ...v }))
    .sort((a, b) => b.ms - a.ms);
}

// Every day in the range, zero-filled, so a quiet stretch shows as a gap
// rather than just being absent from the chart.
function switchesPerDay(fronts, startYmd, endYmd) {
  const counts = new Map();
  for (
    let d = new Date(startYmd + "T00:00:00"),
      end = new Date(endYmd + "T00:00:00");
    d <= end;
    d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)
  ) {
    counts.set(fmtLocalYmd(d), 0);
  }
  fronts.forEach((f) => {
    const day = fmtLocalYmd(new Date(f.started_at));
    if (counts.has(day)) counts.set(day, counts.get(day) + 1);
  });
  return [...counts.entries()].map(([day, count]) => ({ day, count }));
}

function renderChart(daily, accentColor) {
  if (!daily.length) return "";
  const max = Math.max(1, ...daily.map((d) => d.count));
  const bars = daily
    .map((d) => {
      const h = Math.round((d.count / max) * 100);
      const label = new Date(d.day + "T00:00:00").toLocaleDateString(
        undefined,
        { month: "short", day: "numeric" },
      );
      return (
        '<div class="bar-col"><div class="bar-count">' +
        d.count +
        "</div>" +
        '<div class="bar-track"><div class="bar" style="height:' +
        h +
        "%;background:" +
        accentColor +
        '" title="' +
        escapeHtml(label) +
        ": " +
        d.count +
        '"></div></div>' +
        '<div class="bar-label">' +
        escapeHtml(label) +
        "</div></div>"
      );
    })
    .join("");
  return (
    '<div class="chart-scroll"><div class="chart">' + bars + "</div></div>"
  );
}

function buildTimelineRows(fronts, moodEvents, nameMap) {
  const rows = fronts.map((f) => ({
    type: "switch",
    at: Date.parse(f.started_at),
    endAt: f.ended_at ? Date.parse(f.ended_at) : null,
    member: displayName(f.member, nameMap),
    frontType: (f.front_type && f.front_type.name) || "",
    note: f.comment || "",
  }));
  moodEvents.forEach((e) =>
    rows.push({ type: "mood", at: e.at, mood: e.mood }),
  );
  return rows.sort((a, b) => a.at - b.at);
}

function csvField(v) {
  const s = String(v == null ? "" : v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function buildCsv(timeline) {
  const header = ["when", "type", "who", "duration_minutes", "note"]
    .map(csvField)
    .join(",");
  const lines = timeline.map((r) => {
    if (r.type === "switch") {
      const dur = Math.round(((r.endAt || Date.now()) - r.at) / 60000);
      return [
        new Date(r.at).toISOString(),
        "switch",
        r.member.text,
        dur,
        r.note,
      ]
        .map(csvField)
        .join(",");
    }
    return [new Date(r.at).toISOString(), "mood", r.mood, "", ""]
      .map(csvField)
      .join(",");
  });
  return [header, ...lines].join("\r\n");
}

function renderReport({
  system,
  startYmd,
  endYmd,
  summary,
  moodTotals,
  timeline,
  truncatedMood,
  daily,
  missingMonths,
}) {
  // The system's own accent colour if it looks like a real one
  const accentColor = /^#[0-9a-f]{3,8}$/i.test((system && system.color) || "")
    ? system.color
    : "#7c3aed";
  const dateFmt = (t) =>
    new Date(t).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  const rowsHtml =
    timeline
      .map((r) => {
        if (r.type === "switch") {
          const range = r.endAt
            ? dateFmt(r.at) + " → " + dateFmt(r.endAt)
            : dateFmt(r.at) + " → ongoing";
          const dur = fmtDuration((r.endAt || Date.now()) - r.at);
          const type = r.frontType
            ? ' <span class="muted">(' + escapeHtml(r.frontType) + ")</span>"
            : "";

          return (
            '<tr><td class="when">' +
            escapeHtml(range) +
            "</td><td>Switch</td><td>" +
            r.member.html +
            type +
            "</td><td>" +
            dur +
            "</td><td>" +
            escapeHtml(r.note) +
            "</td></tr>"
          );
        }
        return (
          '<tr><td class="when">' +
          escapeHtml(dateFmt(r.at)) +
          "</td><td>Mood</td><td>" +
          escapeHtml(r.mood) +
          "</td><td></td><td></td></tr>"
        );
      })
      .join("") ||
    '<tr><td colspan="5" class="muted">Nothing in this range.</td></tr>';

  const summaryHtml =
    summary
      .map(
        (s) =>
          "<tr><td>" +
          s.name.html +
          "</td><td>" +
          s.count +
          "</td><td>" +
          fmtDuration(s.ms) +
          "</td></tr>",
      )
      .join("") ||
    '<tr><td colspan="3" class="muted">No switches in this range.</td></tr>';

  const moodHtml =
    moodTotals
      .map(
        (m) =>
          "<tr><td>" +
          escapeHtml(m.mood) +
          "</td><td>" +
          m.count +
          "</td><td>" +
          fmtDuration(m.ms) +
          "</td></tr>",
      )
      .join("") ||
    '<tr><td colspan="3" class="muted">No mood changes in this range.</td></tr>';

  const csvHref =
    "data:text/csv;charset=utf-8," + encodeURIComponent(buildCsv(timeline));
  const fileStem = "fronting-report-" + startYmd + "-to-" + endYmd;
  const title =
    (system && system.name ? system.name + " - " : "") + "Fronting report";

  return (
    '<!doctype html><html><head><meta charset="utf-8"><title>' +
    escapeHtml(title) +
    "</title><style>" +
    "body{font:14px/1.5 system-ui,sans-serif;color:#1c1a26;max-width:900px;margin:2rem auto;padding:0 1rem}" +
    "h1{font-size:20px;margin-bottom:4px}h2{font-size:15px;margin:22px 0 6px}" +
    ".muted{color:#6b6b76;font-size:12px}" +
    "table{width:100%;border-collapse:collapse;margin:8px 0 18px}" +
    "th,td{text-align:left;padding:6px 8px;border-bottom:1px solid #ddd;font-size:13px;vertical-align:top}" +
    "th{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#6b6b76}" +
    ".when{white-space:nowrap;width:1%}" +
    ".actions{margin:16px 0}.actions a,.actions button{font:inherit;font-size:13px;margin-right:10px}" +
    ".warn{background:#fff6e5;border:1px solid #f0c36d;padding:8px 12px;border-radius:8px;font-size:13px;margin:12px 0}" +
    // Horizontal scroll rather than squeezing, so a range with many days
    // still has one readable bar per day instead of illegibly thin ones.
    // TODO: Change chart type if we reach this point
    ".chart-scroll{overflow-x:auto;margin:8px 0 18px}" +
    ".chart{display:flex;align-items:flex-end;gap:6px;min-width:max-content;padding:4px 4px 0}" +
    ".bar-col{display:flex;flex-direction:column;align-items:center;width:30px}" +
    ".bar-track{display:flex;align-items:flex-end;height:100px;width:100%}" +
    ".bar{width:100%;border-radius:3px 3px 0 0;min-height:2px}" +
    ".bar-count{font-size:10px;color:#6b6b76;margin-bottom:2px}" +
    ".bar-label{font-size:10px;color:#6b6b76;margin-top:4px;white-space:nowrap}" +
    "@media print{.actions{display:none}}" +
    "</style></head><body>" +
    "<h1>" +
    escapeHtml(title) +
    "</h1>" +
    '<p class="muted">' +
    escapeHtml(startYmd) +
    " to " +
    escapeHtml(endYmd) +
    " - generated " +
    escapeHtml(new Date().toLocaleString()) +
    "</p>" +
    (truncatedMood
      ? '<div class="warn">This range needed more than ' +
        MAX_ACTIVITY_PAGES * ACTIVITY_PAGE_SIZE +
        " activity entries to reach its start, so the search for mood changes stopped there. Mood data for the earlier part of this range may be missing.</div>"
      : "") +
    (missingMonths && missingMonths.length
      ? '<div class="warn">Fronting data for ' +
        escapeHtml(missingMonths.map(monthLabel).join(", ")) +
        " could not be loaded -- switch and summary totals for those months are missing from this report.</div>"
      : "") +
    '<div class="actions"><button onclick="window.print()">Print / Save as PDF</button>' +
    '<a download="' +
    escapeHtml(fileStem) +
    '.csv" href="' +
    csvHref +
    '">Download CSV</a></div>' +
    "<h2>Summary</h2><table><thead><tr><th>Member</th><th>Switches</th><th>Time fronting</th></tr></thead><tbody>" +
    summaryHtml +
    "</tbody></table>" +
    "<h2>Switches per day</h2>" +
    (daily.some((d) => d.count > 0)
      ? renderChart(daily, accentColor)
      : '<p class="muted">No switches in this range.</p>') +
    "<h2>Mood</h2><table><thead><tr><th>Mood</th><th>Changes</th><th>Approx. time</th></tr></thead><tbody>" +
    moodHtml +
    "</tbody></table>" +
    "<h2>Timeline</h2><table><thead><tr><th>When</th><th>Type</th><th>Who / what</th><th>Duration</th><th>Note</th></tr></thead><tbody>" +
    rowsHtml +
    "</tbody></table>" +
    "</body></html>"
  );
}

async function buildReport(bridge, startYmd, endYmd) {
  const rangeStart = new Date(startYmd + "T00:00:00");
  const rangeEnd = new Date(endYmd + "T23:59:59.999");

  let allWeeks = bridge.weeks;
  let missingMonths = [];
  try {
    const collected = await collectAllWeeks(bridge, startYmd, endYmd);
    allWeeks = collected.allWeeks;
    missingMonths = collected.missingMonths;
  } catch (e) {
    log(
      "collecting fronts across months failed, using only the bridged month:",
      e,
    );
  }
  const fronts = collectFronts(allWeeks, startYmd, endYmd);

  let moodResult = { events: [], truncated: false };
  try {
    moodResult = await fetchMoodEvents(bridge.version, rangeStart, rangeEnd);
  } catch (e) {
    log("mood fetch failed, continuing without it:", e);
  }

  let nameMap = new Map();
  try {
    nameMap = await resolveMemberNames(
      fronts.map((f) => f.member),
      bridge.version,
    );
  } catch (e) {
    log("member name lookup failed, falling back to display labels:", e);
  }

  const moodTotals = totalByMood(moodDurations(moodResult.events, rangeEnd));
  const summary = summarizeFronts(fronts).map((s) => ({
    name: displayName(s.member, nameMap),
    count: s.count,
    ms: s.ms,
  }));
  return renderReport({
    system: bridge.system,
    startYmd,
    endYmd,
    summary,
    moodTotals,
    timeline: buildTimelineRows(fronts, moodResult.events, nameMap),
    truncatedMood: moodResult.truncated,
    daily: switchesPerDay(fronts, startYmd, endYmd),
    missingMonths,
  });
}

function runExport(overlay) {
  const startInput = overlay.querySelector("#psqol-export-start");
  const endInput = overlay.querySelector("#psqol-export-end");
  const errEl = overlay.querySelector("#psqol-export-error");
  const start = startInput.value,
    end = endInput.value;
  if (!start || !end || start > end) {
    errEl.textContent = "Pick a valid start and end date.";
    errEl.style.display = "block";
    return;
  }

  const dataEl = document.getElementById("psqol-export-data");
  let bridge = null;
  try {
    bridge =
      dataEl && dataEl.textContent ? JSON.parse(dataEl.textContent) : null;
  } catch (e) {
    /* leave bridge null */
  }
  if (!bridge || !bridge.weeks) {
    errEl.textContent =
      "Calendar data is not ready yet -- wait a moment and try again.";
    errEl.style.display = "block";
    return;
  }

  overlay.remove();

  // Opened synchronously, before any await, so it reads as a direct
  // response to the click rather than a background pop-up.
  const win = window.open("", "_blank");
  if (win) {
    win.document.write(
      '<title>Generating report…</title><body style="font:14px system-ui;padding:2rem;">Generating report…</body>',
    );
    win.document.close();
  }

  buildReport(bridge, start, end)
    .then((html) => {
      if (!win) {
        log("export: pop-up blocked -- allow pop-ups for pluralspace.app");
        return;
      }
      win.document.open();
      win.document.write(html);
      win.document.close();
    })
    .catch((e) => {
      log("export failed:", e);
      if (!win) return;
      win.document.open();
      win.document.write(
        '<title>Export failed</title><body style="font:14px system-ui;padding:2rem;">Could not build the report: ' +
          escapeHtml(String((e && e.message) || e)) +
          "</body>",
      );
      win.document.close();
    });
}

function openExportModal() {
  document.getElementById("psqol-export-modal")?.remove();
  const [defStart, defEnd] = currentWeekRange();

  const overlay = document.createElement("div");
  overlay.id = "psqol-export-modal";
  overlay.innerHTML = `
      <div id="psqol-export-dialog" role="dialog" aria-label="Export fronting report">
        <h2>Export fronting report</h2>
        <label>From<input type="date" id="psqol-export-start" value="${fmtLocalYmd(defStart)}"></label>
        <label>To<input type="date" id="psqol-export-end" value="${fmtLocalYmd(defEnd)}"></label>
        <div id="psqol-export-error"></div>
        <div id="psqol-export-actions">
          <button type="button" id="psqol-export-cancel">Cancel</button>
          <button type="button" id="psqol-export-go">Export</button>
        </div>
      </div>`;
  document.body.appendChild(overlay);
  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay
    .querySelector("#psqol-export-cancel")
    .addEventListener("click", () => overlay.remove());
  overlay
    .querySelector("#psqol-export-go")
    .addEventListener("click", () => runExport(overlay));
  overlay.querySelector("#psqol-export-start").focus();
}

// A sync*(), not a FEATURES entry: disabling this tweak needs the button (and
// any open modal) to actually go away, whereas the FEATURES loop just skips
// apply() when a tweak is off and leaves whatever it last did in place.
function syncExportButton() {
  if (!cfg.weeklyExport || location.pathname !== SEL.fronts) {
    document.getElementById("psqol-export-btn")?.remove();
    document.getElementById("psqol-export-modal")?.remove();
    return;
  }
  if (document.getElementById("psqol-export-btn")) return;
  const header = document.querySelector("#main-content " + SEL.frontsHeader);
  if (!header) return;
  injectExportStyle();
  const btn = document.createElement("button");
  btn.id = "psqol-export-btn";
  btn.type = "button";
  btn.textContent = "Export…";
  btn.addEventListener("click", openExportModal);
  header.appendChild(btn);
}

// src/modules/85-features.js

const FEATURES = [autoOpenToday, prefillEnd, htmlDescriptions];

// src/modules/90-css-editor.js

// custom CSS injector (Stylus alternative)
// A pop-up rather than a textarea in the panel itself: the panel is a fixed
// 320px box meant to stay out of the way, and a chunk of CSS needs real room
// to write in.
const CSS_EDITOR_CSS = `
#psqol-css-modal {
  position: fixed; inset: 0; z-index: 2147483600; display: flex;
  align-items: center; justify-content: center; background: rgba(0, 0, 0, .5);
  font: 13px/1.45 system-ui, sans-serif;
}
#psqol-css-dialog {
  width: 520px; max-width: calc(100vw - 32px); border-radius: 12px;
  padding: 16px 18px; color: #1c1a26; background: #fff; border: 1px solid #d6d2e2;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .3);
}
html.dark #psqol-css-dialog {
  color: #e8e6f0; background: #191424; border-color: #3a3350;
}
#psqol-css-dialog h2 { margin: 0 0 4px; font-size: 14px; }
#psqol-css-dialog p.psqol-css-hint { margin: 0 0 10px; opacity: .6; font-size: 11.5px; }
#psqol-css-textarea {
  display: block; width: 100%; box-sizing: border-box; min-height: 260px;
  resize: vertical; font: 12px/1.4 ui-monospace, SFMono-Regular, monospace;
  padding: 8px; border-radius: 6px; border: 1px solid rgba(127, 127, 127, .4);
  background: transparent; color: inherit;
}
#psqol-css-actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 10px; }
#psqol-css-actions button {
  cursor: pointer; border: 1px solid rgba(127, 127, 127, .4); border-radius: 6px;
  padding: 5px 12px; font: inherit; background: transparent; color: inherit;
}
`;

function injectCssEditorStyle() {
  if (document.getElementById("psqol-css-editor-style")) return;
  const el = document.createElement("style");
  el.id = "psqol-css-editor-style";
  el.textContent = CSS_EDITOR_CSS;
  (document.head || document.documentElement).appendChild(el);
}

function openCssEditor() {
  document.getElementById("psqol-css-modal")?.remove();
  injectCssEditorStyle();

  const overlay = document.createElement("div");
  overlay.id = "psqol-css-modal";
  overlay.innerHTML = `
      <div id="psqol-css-dialog" role="dialog" aria-label="Custom CSS">
        <h2>Custom CSS</h2>
        <p class="psqol-css-hint">Applied on every pluralspace page while "Custom CSS" is checked above.</p>
        <textarea id="psqol-css-textarea" spellcheck="false" autocapitalize="off"></textarea>
        <div id="psqol-css-actions">
          <button type="button" id="psqol-css-cancel">Cancel</button>
          <button type="button" id="psqol-css-save">Save</button>
        </div>
      </div>`;
  document.body.appendChild(overlay);

  // Assigned as a property, not interpolated into the template above
  const textarea = overlay.querySelector("#psqol-css-textarea");
  textarea.value = customCss;

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) overlay.remove();
  });
  overlay
    .querySelector("#psqol-css-cancel")
    .addEventListener("click", () => overlay.remove());
  overlay.querySelector("#psqol-css-save").addEventListener("click", () => {
    saveCustomCss(textarea.value);
    syncCustomCss();
    overlay.remove();
    log("custom CSS saved");
  });
  textarea.focus();
}

// src/modules/95-settings-panel.js

const PANEL_ID = "psqol-panel";
const PANEL_CSS = `
#${PANEL_ID} {
  position: fixed;
  right: 16px;
  bottom: 16px;
  z-index: 2147483600;
  width: 320px;
  max-width: calc(100vw - 32px);
  max-height: calc(100vh - 32px);
  overflow: auto;

  border-radius: 12px;
  font: 13px/1.45 system-ui, sans-serif;
  /* Self-contained colors so the app stays legible*/
  color: #1c1a26;
  background: #fff;

  box-shadow: 0 10px 30px rgba(0, 0, 0, .3);
}
html.dark #${PANEL_ID} {
  color: #e8e6f0;
  background: #191424;
  border-color: #3a3350;
  box-shadow: 0 10px 30px rgba(0, 0, 0, .45);
}
#${PANEL_ID} h2 {
  margin: 0 0 2px; font-size: 13px; font-weight: 700; letter-spacing: .02em;
}
#${PANEL_ID} .psqol-ver { margin: 0 0 10px; opacity: .55; font-size: 11px; }
#${PANEL_ID} label {
  display: grid; grid-template-columns: auto 1fr; gap: 2px 9px;
  align-items: start; padding: 7px 0; cursor: pointer;
  border-top: 1px solid rgba(127, 127, 127, .25);
}
#${PANEL_ID} input { margin: 2px 0 0; cursor: pointer; }
#${PANEL_ID} .psqol-desc { grid-column: 2; opacity: .6; font-size: 11.5px; }
#${PANEL_ID} .psqol-css-edit {
  grid-column: 2; justify-self: start; margin-top: 5px; cursor: pointer;
  border: 1px solid rgba(127, 127, 127, .4); border-radius: 6px; padding: 3px 9px;
  font: inherit; font-size: 11px; background: transparent; color: inherit;
}
#${PANEL_ID} .psqol-foot {
  display: flex; justify-content: space-between; align-items: center;
  margin-top: 10px; padding-top: 9px;
  border-top: 1px solid rgba(127, 127, 127, .25);
  opacity: .6; font-size: 11px;
}
#${PANEL_ID} button.psqol-close {
  cursor: pointer; border: 0; border-radius: 6px; padding: 4px 9px;
  font: inherit; color: inherit; background: rgba(127, 127, 127, .22);
}
`;

function togglePanel(force) {
  const open = force ?? !document.getElementById(PANEL_ID);
  document.getElementById(PANEL_ID)?.remove();
  if (!open) return;

  if (!document.getElementById("psqol-panel-style")) {
    const st = document.createElement("style");
    st.id = "psqol-panel-style";
    st.textContent = PANEL_CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "pluralspace QoL settings");

  const h = document.createElement("h2");
  h.textContent = "pluralspace QoL";
  const ver = document.createElement("p");
  ver.className = "psqol-ver";
  ver.textContent = "v" + VERSION;
  panel.append(h, ver);

  for (const t of TWEAKS) {
    const label = document.createElement("label");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = !!cfg[t.key];
    box.addEventListener("change", () => {
      cfg[t.key] = box.checked;
      saveConfig();
      applyAll();
      log(t.key, box.checked ? "enabled" : "disabled");
    });
    const name = document.createElement("span");
    name.textContent = t.label;
    const desc = document.createElement("span");
    desc.className = "psqol-desc";
    desc.textContent = t.desc;
    label.append(box, name, desc);
    if (t.key === "customCss") {
      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "psqol-css-edit";
      editBtn.textContent = "Edit CSS…";
      editBtn.addEventListener("click", (e) => {
        e.preventDefault(); // stay inside the <label>, not toggle the checkbox
        openCssEditor();
      });
      label.append(editBtn);
    }
    panel.append(label);
  }

  const foot = document.createElement("div");
  foot.className = "psqol-foot";
  const hint = document.createElement("span");
  hint.textContent = "Alt+Shift+P";
  const close = document.createElement("button");
  close.className = "psqol-close";
  close.textContent = "Close";
  close.addEventListener("click", () => togglePanel(false));
  foot.append(hint, close);
  panel.append(foot);

  (document.body || document.documentElement).appendChild(panel);
  panel.querySelector("input")?.focus();
}

// src/modules/99-runtime.js

function applyAll() {
  injectBaseStyle();
  sync24h();
  syncDashboard();
  syncPinStyle();
  syncCustomCss();
  syncExportButton();
  for (const f of FEATURES) {
    if (!cfg[f.key]) continue;
    try {
      f.apply();
    } catch (e) {
      log("feature failed:", f.key, e);
    }
  }
}

// The app is an SPA: the calendar is replaced under you on month changes and
// Inertia visits, so everything has to be idempotent and re-applied.
const schedule = (() => {
  let queued = false;
  return () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(() => {
      queued = false;
      applyAll();
    });
  };
})();

function boot() {
  applyAll();
  new MutationObserver(schedule).observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  window.addEventListener("popstate", schedule);
  window.addEventListener("keydown", (e) => {
    if (e.altKey && e.shiftKey && (e.key === "P" || e.key === "p")) {
      e.preventDefault();
      togglePanel();
    } else if (e.key === "Escape" && document.getElementById(PANEL_ID)) {
      togglePanel(false);
    }
  });
  // Only present when the script is installed with a grant; the keyboard
  // shortcut is the path that always works.
  if (typeof GM_registerMenuCommand !== "undefined") {
    GM_registerMenuCommand("Settings", () => togglePanel(true));
  }
  log(`loaded v${VERSION} -- Alt+Shift+P for settings`);
}

// At document-start the root element may not exist yet, and observe() throws
// on a null target, which would kill the whole script before anything ran.
// Usually documentElement is already there, so the poll almost never fires.
if (document.documentElement) {
  boot();
} else {
  const t = setInterval(() => {
    if (!document.documentElement) return;
    clearInterval(t);
    boot();
  }, 0);
}
})();
