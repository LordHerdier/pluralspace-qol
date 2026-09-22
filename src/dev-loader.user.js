// ==UserScript==
// @name         pluralspace QoL (dev loader)
// @namespace    https://pluralspace.app/
// @version      0.2.0
// @description  Fetches the real script from the local dev server on every load. Install ONCE.
// @match        https://pluralspace.app/*
// @run-at       document-start
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @connect      localhost
// ==/UserScript==

// Deliberately NOT @require. Tampermonkey caches @require externals on its own
// update schedule and ignores the server's cache headers, so edits can sit
// invisible behind a stale copy. GM_xmlhttpRequest plus a cache-busting query
// fetches the current file on every page load, which is what a dev loop needs.
GM_xmlhttpRequest({
  method: "GET",
  url: "http://localhost:8137/pluralspace-qol.user.js?t=" + Date.now(),
  onload: (r) => {
    if (r.status !== 200) {
      console.error("[ps-qol] dev server returned", r.status);
      return;
    }
    try {
      (0, eval)(r.responseText);
    } catch (e) {
      console.error("[ps-qol] script threw on eval", e);
    }
  },
  onerror: () => console.error("[ps-qol] dev server unreachable on :8137"),
});
