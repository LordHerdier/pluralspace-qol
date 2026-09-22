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
