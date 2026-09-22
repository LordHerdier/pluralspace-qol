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
