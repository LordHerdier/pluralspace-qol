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
