/* page-feedback — feedback.js
 *
 * A drop-in instrument for leaving notes on a rendered web page and handing
 * them back as one Markdown file that a person — or a coding agent such as
 * Claude Code — can work through without a conversation.
 *
 * IT IS A QUEUE. A reader accumulates notes across a session and across
 * pages — three kinds: a run of selected TEXT, a drawn REGION, or a note about
 * the PAGE that points at nothing — revises any of them in place, and sends
 * the whole list in one action. The export opens with the list itself, so the
 * file reads as a worklist and the evidence for each item follows it.
 *
 *   the «Feedback» button, bottom right
 *   ⌥⇧F  (Alt+Shift+F, any platform)     toggles
 *   R                                     arms one region while the panel is open
 *   N                                     a note about this page, marking nothing
 *   ⌘/Ctrl+Enter saves a note · Esc cancels
 *   window.PageFeedback.toggle() · .page() · .md() · .json() · .export()
 *
 * Off by default, and it costs nothing until switched on. Nothing leaves the
 * machine: no server, no screenshot, no request of any kind. Notes live in
 * localStorage until exported.
 *
 * Three facts worth keeping:
 *
 *  - A MARK MUST NOT MOVE A LINE. Text marks are wrapped per text node — the
 *    range is cut at node boundaries, never surroundContents, which throws
 *    across elements — and `.fbmark` carries no padding, border or margin: it
 *    spreads by box-shadow. Region boxes live in a zero-height absolutely-
 *    positioned layer, so they sit over the page without being in its flow.
 *  - EVERY ELEMENT OF CHROME THIS INSTRUMENT MAKES CARRIES `data-fb-ui`, so a
 *    selection made inside the panel never becomes a note. The text mark alone
 *    does not — it is the page's own text under a wash, and a run that already
 *    carries a note can take a second one; the marks nest and the wash doubles.
 *  - THE EXPORT IS THE DURABLE RECORD; THE ANCHORS ARE BEST-EFFORT. A note
 *    carries its exact text, its neighbours, the block id and the CSS path —
 *    enough to find again by hand. On render the text notes are re-anchored by
 *    SEARCHING for that exact text; one that cannot be found is listed as «not
 *    on this page now» and is never dropped. Region boxes are redrawn at their
 *    stored page coordinates and may drift after a relayout.
 *
 * Configuration — set before this script loads, or call
 * PageFeedback.configure({...}) afterwards. Every key is optional; README.md
 * documents each one.
 *
 *   window.PageFeedbackConfig = {
 *     name: "my-site",            // heads the export
 *     storageKey: "page-feedback",
 *     filePrefix: "page-feedback",
 *     tags: ["Design", "Wording", "Bug", "Idea"],
 *     roots: ["main", "header"],  // where notes may be made; paths stop here
 *     skip: "sup.fn",             // text never captured (e.g. footnote markers)
 *     dataKeys: ["data-id"],      // attributes that name a thing in a CSS path
 *     route: () => location.pathname + location.hash,
 *     routeName: () => "",        // a label for the kind of page
 *     resolveBlock: (id, el) => null,  // → {file, n, kind?, shown?}
 *     likely: (note) => [],       // → the source files that render it
 *     subscribe: (fn) => {},      // call fn after your app re-renders
 *     button: true,
 *   };
 */
(function () {
  "use strict";

  // ---- configuration ---------------------------------------------------
  const CFG = {
    name: "",
    storageKey: "page-feedback",
    filePrefix: "page-feedback",
    tags: ["Design", "Wording", "Bug", "Idea"],
    roots: ["body"],
    skip: "",
    dataKeys: ["data-id", "data-key", "data-testid"],
    route: () => location.pathname + location.hash,
    routeName: () => "",
    resolveBlock: null,
    likely: null,
    subscribe: null,
    button: true,
  };
  let subscribed = false;
  function configure(opts) {
    if (!opts || typeof opts !== "object") return;
    for (const k in opts) if (opts[k] !== undefined) CFG[k] = opts[k];
    if (typeof CFG.roots === "string") CFG.roots = [CFG.roots];
    if (typeof CFG.subscribe === "function" && !subscribed) { subscribed = true; CFG.subscribe(onRender); }
    if (btn && !CFG.button) { btn.remove(); btn = null; }
    else if (!btn && CFG.button && document.body) makeBtn();
  }

  // ---- tiny helpers ----------------------------------------------------
  /* h("tag.class#id", props, ...children) — children: string, Node, array, null */
  function h(sel, props, ...kids) {
    const m = /^([a-z0-9-]+)?((?:\.[\w-]+)*)(?:#([\w-]+))?$/i.exec(sel) || [];
    const el = document.createElement(m[1] || "div");
    if (m[2]) el.className = m[2].split(".").filter(Boolean).join(" ");
    if (m[3]) el.id = m[3];
    if (props && (typeof props !== "object" || props instanceof Node || Array.isArray(props))) { kids.unshift(props); props = null; }
    if (props) for (const k in props) {
      const v = props[k];
      if (v == null || v === false) continue;
      if (k === "on") for (const ev in v) el.addEventListener(ev, v[ev]);
      else if (k === "class") el.className += (el.className ? " " : "") + v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else if (k in el && typeof v !== "string" && k !== "role") { try { el[k] = v; } catch (_) { el.setAttribute(k, v); } }
      else el.setAttribute(k, v === true ? "" : v);
    }
    const add = (c) => { if (c == null || c === false) return; if (Array.isArray(c)) c.forEach(add); else el.append(c instanceof Node ? c : document.createTextNode(String(c))); };
    kids.forEach(add);
    return el;
  }
  const qs = (sel, root) => (root || document).querySelector(sel);
  const qsa = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const truncate = (s, n) => (s && s.length > n ? s.slice(0, n).replace(/\s+\S*$/, "") + "…" : s);
  const plural = (n, one, many) => `${Number(n).toLocaleString("en-US")} ${n === 1 ? one : (many || one + "s")}`;
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const reEsc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  /* an inline box does not break a sentence: <b>, <a>, <mark> cut a paragraph
   * into several text nodes, and treating each node as its own scope would
   * lose every run that crosses one */
  const INLINE = new Set(["A", "ABBR", "B", "BDI", "BDO", "BR", "CITE", "CODE", "DATA", "DEL", "DFN", "EM", "I", "INS",
    "KBD", "MARK", "Q", "RUBY", "S", "SAMP", "SMALL", "SPAN", "STRONG", "SUB", "SUP", "TIME", "U", "VAR", "WBR"]);
  /* the nearest ancestor of a node that DOES break a sentence */
  const scopeOf = (node) => {
    let e = !node ? null : node.nodeType === 1 ? node : node.parentElement;
    while (e && INLINE.has(e.tagName) && e.parentElement) e = e.parentElement;
    return e;
  };
  /* take an element out and leave its CHILDREN in its place — never its
   * textContent, which would destroy anything another script painted inside */
  const unwrap = (el) => {
    const p = el.parentNode;
    if (!p) return null;
    el.replaceWith(...Array.from(el.childNodes));
    return p;
  };

  const MINDRAG = 8;                 // a rectangle under this is a mis-click

  let on = false;
  const notes = [];                  // the truth; localStorage is a mirror
  const marks = [];                  // every <mark> we made, for a clean undo
  let seq = 0;
  let btn = null, panel = null, layer = null, pop = null, overlay = null, pending = null;
  let returnFocus = null;            // where the keyboard was before the popover took it

  /* every element the instrument makes is excluded from capture */
  const FBATTR = { "data-fb-ui": "" };
  function fh(sel, props, ...kids) {
    if (props && (typeof props !== "object" || props instanceof Node || Array.isArray(props))) { kids.unshift(props); props = null; }
    return h(sel, Object.assign({}, FBATTR, props || {}), ...kids);
  }

  const collapse = (s) => String(s == null ? "" : s).replace(/\s+/g, " ").trim();
  /* what a text walk never reads: our chrome, scripts, and whatever the host
   * declares (footnote markers, say — so a captured quote can be grepped
   * against a source that does not contain them) */
  const skipSel = () => "script, style, [data-fb-ui]" + (CFG.skip ? ", " + CFG.skip : "");
  const EXACT_MAX = 1500;            // a note is an excerpt, not the page

  // ---- roots -----------------------------------------------------------
  const matches = (e, s) => { try { return e.matches(s); } catch (_) { return false; } };
  function rootEls() {
    const out = [];
    for (const s of CFG.roots || []) { try { for (const e of qsa(s)) if (out.indexOf(e) < 0) out.push(e); } catch (_) {} }
    if (!out.length) out.push(document.body);
    return out;
  }
  const isRoot = (e) => !!e && e.nodeType === 1 && (CFG.roots || []).some((s) => matches(e, s));
  const inRoots = (el) => rootEls().some((r) => r.contains(el));
  /* a root's own name in a path: its id if it has one, else the selector the
   * host declared it by */
  function rootLabel(e) {
    if (e.id) return e.tagName.toLowerCase() + "#" + e.id;
    return (CFG.roots || []).find((s) => matches(e, s)) || e.tagName.toLowerCase();
  }

  /* THE TEXT NODES A RANGE COVERS, with the slice of each — one walk, used by
   * both the capture and the marking. The walk stops at the range's end and
   * calls closest() only for a node the range actually touches. */
  function rangeNodes(range) {
    const out = [];
    const cac = range.commonAncestorContainer;
    const skip = skipSel();
    if (cac.nodeType === 3) {
      if (range.endOffset > range.startOffset && !(cac.parentElement && cac.parentElement.closest(skip)))
        out.push({ node: cac, a: range.startOffset, b: range.endOffset });
      return out;
    }
    const w = document.createTreeWalker(cac, NodeFilter.SHOW_TEXT, null);
    let started = false;
    while (w.nextNode()) {
      const n = w.currentNode;
      if (!range.intersectsNode(n)) { if (started) break; continue; }
      started = true;
      if (!n.parentElement || n.parentElement.closest(skip)) continue;
      const a = n === range.startContainer ? range.startOffset : 0;
      const b = n === range.endContainer ? range.endOffset : n.data.length;
      if (b > a) out.push({ node: n, a, b });
      if (n === range.endContainer) break;
    }
    return out;
  }
  const rangeText = (range) => rangeNodes(range).map((c) => c.node.data.slice(c.a, c.b)).join("");
  function textOf(el) {
    let out = "";
    const skip = skipSel();
    const w = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, null);
    while (w.nextNode()) {
      const n = w.currentNode;
      if (!n.parentElement || n.parentElement.closest(skip)) continue;
      out += n.data;
    }
    return out;
  }
  const clip = (s, n) => truncate(s, n) || "";
  const routeOf = (r) => String(r || "").split("?")[0];
  const currentRoute = () => { try { return String(CFG.route() || "/"); } catch (_) { return location.pathname + location.hash; } };
  const currentRouteName = () => { try { return String(CFG.routeName() || ""); } catch (_) { return ""; } };

  // ---- the CSS path ----------------------------------------------------
  /* Readable rather than minimal: what a person greps for. An id anchors the
   * path — the walk up stops at the first ancestor that has one — and
   * :nth-of-type is written only where a same-tag sibling makes it necessary. */
  function seg(el) {
    let s = el.tagName.toLowerCase();
    if (el.id) return s + "#" + el.id;
    const cls = Array.from(el.classList)
      .filter((c) => c !== "fbmark" && !/^is-/.test(c))
      .slice(0, 2);
    s += cls.map((c) => "." + c).join("");
    for (const k of CFG.dataKeys || []) if (el.hasAttribute(k)) { s += `[${k}="${el.getAttribute(k)}"]`; break; }
    const p = el.parentElement;
    if (p) {
      const same = Array.from(p.children).filter((c) => c.tagName === el.tagName);
      if (same.length > 1) s += `:nth-of-type(${same.indexOf(el) + 1})`;
    }
    return s;
  }
  function pathOf(el) {
    if (!el || el.nodeType !== 1) return "";
    const segs = [];
    let e = el;
    while (e && e !== document.documentElement) {
      if (isRoot(e) || e === document.body) { segs.unshift(rootLabel(e)); break; }
      segs.unshift(seg(e));
      if (e !== el && e.id) break;   // an id anchors the path
      e = e.parentElement;
    }
    return (segs.length > 6 ? "… > " : "") + segs.slice(-6).join(" > ");
  }

  // ---- the likely files (host-supplied) --------------------------------
  /* A GUESS, and the export says so in its head: which source files most
   * likely render what was marked. Only the host can know; with no `likely`
   * function the list is empty. The path beside it is measured. */
  function likelyFiles(nt) {
    if (typeof CFG.likely !== "function") return [];
    try {
      const r = CFG.likely(bare(nt));
      return Array.isArray(r) ? r.filter((x) => typeof x === "string" && x) : [];
    } catch (e) { console.warn("[page-feedback] likely() threw", e); return []; }
  }

  // ---- capture: text ---------------------------------------------------
  function blockIdOf(el) {
    let e = el;
    while (e && e !== document.body) {
      if (e.id && isRoot(e)) return null;   // a root anchors nothing useful
      if (e.id) return e.id;
      e = e.parentElement;
    }
    return null;
  }
  /* the host may map a block id to its SOURCE — a file and a paragraph or
   * footnote number — so a quote can be checked against the original */
  function paraOf(blockId, el) {
    if (!blockId || typeof CFG.resolveBlock !== "function") return null;
    try {
      const p = CFG.resolveBlock(blockId, el);
      return p && p.file ? Object.assign({ kind: "p" }, p) : null;
    } catch (e) { console.warn("[page-feedback] resolveBlock() threw", e); return null; }
  }

  function captureText(range) {
    /* the scope must CONTAIN the whole range: a selection that crosses a block
     * boundary takes the common ancestor's block, or its offset/suffix would be
     * measured against a block the selection has already left */
    let scope = scopeOf(range.startContainer);
    const endScope = scopeOf(range.endContainer);
    if (!scope || (endScope && endScope !== scope && !scope.contains(endScope)))
      scope = scopeOf(range.commonAncestorContainer);
    if (!scope) return null;
    const rawExact = collapse(rangeText(range));
    if (!rawExact) return null;
    const truncated = rawExact.length > EXACT_MAX;
    const exact = truncated ? rawExact.slice(0, EXACT_MAX).replace(/\s+\S*$/, "") : rawExact;
    const r2 = document.createRange();
    r2.selectNodeContents(scope);
    try { r2.setEnd(range.startContainer, range.startOffset); } catch (_) { /* keep 0 */ }
    const offset = rangeText(r2).length;
    const full = textOf(scope);
    const b = offset + rawExact.length;
    const blockId = blockIdOf(scope);
    const cr = range.getBoundingClientRect();
    return {
      exact,
      truncated: truncated || undefined,
      prefix: (offset > 48 ? "…" : "") + collapse(full.slice(Math.max(0, offset - 48), offset)),
      suffix: collapse(full.slice(b, b + 48)) + (b + 48 < full.length ? "…" : ""),
      offset,
      blockId,
      path: pathOf(scope),
      para: paraOf(blockId, blockId ? document.getElementById(blockId) : null),
      rect: { x: Math.round(cr.left + window.scrollX), y: Math.round(cr.top + window.scrollY), w: Math.round(cr.width), h: Math.round(cr.height) },
    };
  }

  /* NOTHING SAID YET — no tag, nothing typed, and not an edit of an existing
   * note or a page note (both of which carry a heading) */
  function popPristine() {
    if (!pop) return false;
    if (pop.querySelector(".fbpop__hd")) return false;
    if (pop.querySelector(".fbpop__tag.is-on")) return false;
    const ta = pop.querySelector(".fbpop__ta");
    return !collapse(ta ? ta.value : "");
  }

  function onSelection() {
    if (!on || overlay) return;
    /* An open popover owns the screen — EXCEPT when it is still untouched and
     * over a text mark, where a selection that CONTAINS the pending one is the
     * reader widening what they meant. */
    const mayReplace = !!pop && !!pending && pending.kind === "text" && popPristine();
    if (pop && !mayReplace) return;
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!collapse(range.toString())) return;
    const cac = range.commonAncestorContainer;
    const el = cac.nodeType === 1 ? cac : cac.parentElement;
    if (!el || el.closest("[data-fb-ui]")) return;
    if (!inRoots(el)) return;
    const data = captureText(range);
    if (!data) return;
    if (mayReplace) {
      const had = pending.text.exact;
      if (!(data.exact.length > had.length && data.exact.includes(had))) return;
    }
    /* the range is cloned NOW: clicking into the popover's textarea moves the
     * document's selection. The route is stamped now too: the note belongs to
     * the page the selection was made on. */
    pending = { kind: "text", range: range.cloneRange(), text: data,
      route: currentRoute(), routeName: currentRouteName(), title: document.title };
    const rects = range.getClientRects();
    const at = rects.length ? rects[rects.length - 1] : range.getBoundingClientRect();
    openPop({ excerpt: clip(data.exact, 90), at });
  }

  // ---- capture: region -------------------------------------------------
  function armRegion() {
    if (!on || overlay || pop) return;
    overlay = fh("div.fboverlay", {},
      fh("div.fbhint", "Drag to draw a region · Esc to cancel"));
    let sx = 0, sy = 0, rubber = null;
    /* one derivation of the rectangle, so the band the reader sees and the
     * rectangle the note stores can never disagree */
    const rectAt = (ex, ey) => ({ x: Math.min(sx, ex), y: Math.min(sy, ey), w: Math.abs(ex - sx), h: Math.abs(ey - sy) });
    overlay.addEventListener("pointerdown", (e) => {
      sx = e.clientX; sy = e.clientY;
      rubber = fh("div.fbrubber");
      overlay.append(rubber);
      try { overlay.setPointerCapture(e.pointerId); } catch (_) {}
      e.preventDefault();
    });
    overlay.addEventListener("pointermove", (e) => {
      if (!rubber) return;
      const r = rectAt(e.clientX, e.clientY);
      Object.assign(rubber.style, { left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" });
    });
    overlay.addEventListener("pointerup", (e) => {
      if (!rubber) { disarmRegion(); return; }
      const { x, y, w, h: ht } = rectAt(e.clientX, e.clientY);
      disarmRegion();                       // the page must be hit-testable again
      if (w < MINDRAG || ht < MINDRAG) return;
      const data = captureRegion(x, y, w, ht);
      pending = { kind: "region", region: data,
        route: currentRoute(), routeName: currentRouteName(), title: document.title };
      openPop({ at: { left: x, top: y, right: x + w, bottom: y + ht, width: w, height: ht } });
    });
    /* the page must not move under the crosshair: a wheel scroll mid-drag
     * mixes two scroll frames and captures a rectangle nobody drew */
    overlay.addEventListener("wheel", (e) => e.preventDefault(), { passive: false });
    document.body.append(overlay);
  }
  function disarmRegion() { if (overlay) { overlay.remove(); overlay = null; } }

  /* WHAT IS UNDER THE BOX, MEASURED.
   *
   * Sampling points tells you WHICH elements were hit and never HOW MUCH of
   * any of them, and it cannot see anything without text — a 1px rule, an
   * empty spacer. So the capture walks GEOMETRY. Every element inside
   * `within` whose border box intersects the rectangle is kept, with two
   * measured figures: `cover`, the share of the ELEMENT the box holds, and
   * `fill`, the share of the BOX that element accounts for. Ranked by cover
   * and then by fill: a block the box holds whole outranks its own rows (both
   * covered 100%, the block fills more of the box), and a hairline crossing a
   * paragraph does not outrank the paragraph.
   *
   * And the WORDS the box holds are captured beside the elements, because an
   * element name cannot answer «remove these labels, keep the numbers». */

  /* the DEEPEST element at a point that carries text; the bare topmost hit is
   * the fallback (a full-bleed empty link overlay names nothing) */
  function deepestAt(x, y) {
    const els = document.elementsFromPoint(x, y) || [];
    let first = null;
    for (const e of els) {
      if (!e || e === document.body || e === document.documentElement) continue;
      if (e.closest("[data-fb-ui]")) continue;
      if (!first) first = e;
      if (collapse(e.textContent).length) return e;
    }
    return first;
  }

  /* how much of `r` the rectangle holds, and how much of the rectangle `r` is.
   * A degenerate side is inflated to one pixel, so a rule the box holds end to
   * end is covered 1.00. Rounded to two places HERE, before sorting: unrounded
   * covers make a fifteenth-decimal difference the primary key and the
   * tiebreak on `fill` never runs. */
  function coverOf(r, x, y, w, ht) {
    const right = r.right + (r.width ? 0 : 1), bottom = r.bottom + (r.height ? 0 : 1);
    const ix = Math.min(right, x + w) - Math.max(r.left, x);
    const iy = Math.min(bottom, y + ht) - Math.max(r.top, y);
    if (ix <= 0 || iy <= 0) return null;          // touching an edge is not covering
    const area = ix * iy;
    const r2 = (v) => Math.round(Math.min(1, v) * 100) / 100;
    return {
      cover: r2(area / Math.max(1, Math.max(r.width, 1) * Math.max(r.height, 1))),
      fill: r2(area / Math.max(1, w * ht)),
    };
  }

  const COVER_FLOOR = 0.015;     // a container the box merely sits inside is `within`, not a cover
  const COVERS_MAX = 12;         // ranked, so the tail is the least of it
  const WALK_MAX = 9000;
  const WORD_MAX = 1500;

  function coversUnder(root, x, y, w, ht) {
    const out = [];
    let walked = 0, capped = false;
    for (const e of root.querySelectorAll("*")) {
      if (++walked > WALK_MAX) { capped = true; break; }
      if (e.closest("[data-fb-ui]")) continue;
      const r = e.getBoundingClientRect();
      const o = coverOf(r, x, y, w, ht);
      if (!o || o.cover < COVER_FLOOR) continue;
      const words = collapse(e.textContent);
      /* what a textless element IS, said rather than left as a bare path */
      const kind = words ? null
        : (r.height <= 2 && r.width > 2) ? `a ${Math.max(1, Math.round(r.height))}px rule, no text`
        : (r.width <= 2 && r.height > 2) ? `a ${Math.max(1, Math.round(r.width))}px rule, no text`
        : "no text";
      out.push({ e, cover: o.cover, fill: o.fill, words, kind });
    }
    out.sort((a, b) => (b.cover - a.cover) || (b.fill - a.fill));
    return { list: out, walked, capped };
  }

  /* THE WORDS UNDER THE BOX. Each word gets a Range and its own rect, and a
   * word counts when its MIDDLE is inside the box — a box that clips three
   * pixels off an ascender did not enclose that word. */
  function wordsUnder(root, x, y, w, ht) {
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue || !n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if (!p || p.closest("[data-fb-ui]")) return NodeFilter.FILTER_REJECT;
        const r = p.getBoundingClientRect();
        if (r.right < x || r.left > x + w || r.bottom < y || r.top > y + ht) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const hit = [], rng = document.createRange();
    let seen = 0, capped = false;
    for (let n = walk.nextNode(); n && !capped; n = walk.nextNode()) {
      for (const m of n.nodeValue.matchAll(/\S+/g)) {
        if (++seen > WORD_MAX) { capped = true; break; }
        try { rng.setStart(n, m.index); rng.setEnd(n, m.index + m[0].length); } catch (_) { continue; }
        const r = rng.getBoundingClientRect();
        if (!r.width && !r.height) continue;
        const mx = (r.left + r.right) / 2, my = (r.top + r.bottom) / 2;
        if (mx >= x && mx <= x + w && my >= y && my <= y + ht) hit.push(m[0]);
      }
    }
    return { text: collapse(hit.join(" ")), words: hit.length, capped };
  }

  function captureRegion(x, y, w, ht) {
    const pcache = new Map();
    const pathC = (e) => { let v = pcache.get(e); if (v === undefined) { v = pathOf(e); pcache.set(e, v); } return v; };
    /* `within` — the smallest ancestor of the centre that holds the whole
     * rectangle, which is the element a reader means by «this bit here». It is
     * also the ROOT of both walks below. */
    let within = null, root = null;
    let e = deepestAt(x + w / 2, y + ht / 2);
    while (e && e !== document.body) {
      const r = e.getBoundingClientRect();
      if (r.left <= x + 2 && r.top <= y + 2 && r.right >= x + w - 2 && r.bottom >= y + ht - 2) {
        root = e;
        within = { path: pathC(e), text: clip(collapse(e.innerText || e.textContent), 80) };
        break;
      }
      if (isRoot(e)) break;
      e = e.parentElement;
    }
    if (!root) root = rootEls()[0] || document.body;

    const found = coversUnder(root, x, y, w, ht);
    const covers = found.list.slice(0, COVERS_MAX).map((c) => ({
      path: pathC(c.e),
      text: clip(c.words, 80),
      cover: c.cover,
      fill: c.fill,
      kind: c.kind || undefined,
    }));
    const more = found.list.length - covers.length;
    const under = wordsUnder(root, x, y, w, ht);

    /* AMBIGUITY, SAID AT CAPTURE TIME. Two shapes:
     *   · a STRADDLE — two candidates, neither containing the other, each a
     *     real share of the box (half of one card and half of the next).
     *     Nesting is NOT a straddle: a block and its own rows are both covered
     *     whole and the ranking already puts the block first.
     *   · a box that ENCLOSES NOTHING WHOLE — even the best match is mostly
     *     outside it, which is what a box drawn across a gap looks like. */
    const tail = (p) => String(p || "").split(" > ").pop();
    const pct = (v) => `${Math.round(v * 100)}%`;
    const ambiguous = (() => {
      const top = found.list[0];
      if (!top) return "the box holds nothing this instrument can name";
      const big = found.list.filter((c) => c.fill >= 0.25);
      for (const c of big.slice(1, 6)) {
        const a = big[0];
        if (a.e.contains(c.e) || c.e.contains(a.e)) continue;
        if (c.fill < a.fill * 0.6) break;
        return `the box straddles two things and chooses neither — ${tail(pathC(a.e))} (${pct(a.fill)} of the box) and ${tail(pathC(c.e))} (${pct(c.fill)})`;
      }
      if (top.cover < 0.25) return `the box encloses nothing whole — its best match, ${tail(pathC(top.e))}, is covered only ${pct(top.cover)}`;
      return null;
    })();

    /* a rectangle over a fixed or sticky element is meaningless in page
     * coordinates — it keeps viewport coordinates and says so */
    let fixed = false;
    for (let f = deepestAt(x + w / 2, y + ht / 2); f && f !== document.body; f = f.parentElement) {
      const pos = getComputedStyle(f).position;
      if (pos === "fixed" || pos === "sticky") { fixed = true; break; }
    }
    return {
      x: Math.round(x + (fixed ? 0 : window.scrollX)), y: Math.round(y + (fixed ? 0 : window.scrollY)),
      w: Math.round(w), h: Math.round(ht), fixed: fixed || undefined,
      vw: window.innerWidth, vh: window.innerHeight, scrollY: Math.round(window.scrollY),
      within, covers,
      moreCovers: more > 0 ? more : undefined,
      truncated: (found.capped || under.capped) || undefined,
      under: under.text,
      underWords: under.words,
      ambiguous: ambiguous || undefined,
    };
  }

  /* A NOTE NEED NOT POINT AT ANYTHING. The third kind, `page`, is a note about
   * the page as a whole — which is what lets a reader keep a list of things
   * rather than hunt for something to select for each one. */
  function addPageNote() {
    if (!on || pop || overlay) return;
    pending = { kind: "page", route: currentRoute(), routeName: currentRouteName(), title: document.title };
    openPop({ page: true });
  }

  /* what a note shows of itself in a list or a heading */
  const excerptOf = (nt, n) => (nt.kind === "text" ? clip((nt.text || {}).exact || "", n || 60)
    : nt.kind === "region" ? clip((((nt.region || {}).within) || {}).text || "the page", n || 60)
    : clip(nt.title || "this page", n || 60));

  // ---- the popover -----------------------------------------------------
  /* openPop({excerpt, at, page, note}) — `note` puts it in EDIT mode over an
   * existing note */
  function openPop(opts) {
    opts = opts || {};
    const editing = opts.note || null;
    if (pop) { pop.remove(); pop = null; }
    /* a popover REPLACING a popover must not record our own textarea as the
     * place to put the reader back */
    const act = document.activeElement;
    if (!act || !act.closest || !act.closest("[data-fb-ui]")) returnFocus = act;
    let tag = editing ? editing.tag : null, ta = null, save = null;
    const tags = Array.isArray(CFG.tags) ? CFG.tags : [];
    const able = () => { if (save) save.disabled = !(tag || collapse(ta && ta.value)); };
    const syncTags = () => qsa(".fbpop__tag", pop).forEach((b) => {
      const isOn = b.textContent === tag;
      b.classList.toggle("is-on", isOn);
      b.setAttribute("aria-pressed", String(isOn));
    });
    const tagBtn = (t) => fh("button.fbpop__tag", {
      type: "button",
      "aria-pressed": String(tag === t),
      class: tag === t ? "is-on" : null,
      on: { click: () => { tag = tag === t ? null : t; syncTags(); able(); } },
    }, t);
    const done = () => (editing ? commit(tag, ta.value, editing) : commit(tag, ta.value));
    ta = fh("textarea.fbpop__ta", { rows: 3, placeholder: "Your note…", on: { input: able } });
    if (editing && editing.comment) ta.value = editing.comment;
    save = fh("button.fbpop__b.fbpop__b--go", { type: "button", disabled: true, on: { click: done } }, editing ? "Save changes" : "Save");
    const said = editing ? excerptOf(editing, 90)
      : opts.page ? (document.title || "this page")
      : opts.excerpt;
    pop = fh("div.fbpop", { role: "dialog", "aria-label": editing ? "Edit a note" : "Add a note" },
      editing ? fh("p.fbpop__hd", `Editing note ${editing.n}`) : null,
      opts.page && !editing ? fh("p.fbpop__hd", "A note about this page — nothing is marked") : null,
      fh("p.fbpop__x", said ? "“" + said + "”" : `region · ${Math.round(opts.at.width)}×${Math.round(opts.at.height)}`),
      tags.length ? fh("div.fbpop__tags", tags.map(tagBtn)) : null,
      ta,
      fh("div.fbpop__ft",
        save,
        fh("button.fbpop__b", { type: "button", on: { click: closePop } }, "Cancel"),
        fh("span.fbpop__k", "⌘↵ save · esc cancel")));
    pop.addEventListener("keydown", (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") { e.preventDefault(); if (!save.disabled) done(); }
    });
    document.body.append(pop);
    place(pop, opts.at || null);
    able();
    /* preventScroll: the reader is looking at the thing they just marked */
    setTimeout(() => { try { ta.focus({ preventScroll: true }); } catch (_) { ta.focus(); } }, 0);
  }
  function place(el, at) {
    const r = el.getBoundingClientRect();
    const pad = 8;
    /* a page note and an edit point at nothing, so they open where the reader
     * is looking rather than beside a mark that does not exist */
    if (!at) {
      el.style.left = Math.max(pad, Math.round((window.innerWidth - r.width) / 2)) + "px";
      el.style.top = Math.max(pad, Math.round(Math.min(window.innerHeight * 0.24, window.innerHeight - r.height - pad))) + "px";
      return;
    }
    let left = at.right + pad;
    /* below what was marked — but ABOVE it when there is no room below, so
     * the popover never covers the words the reader just selected */
    let top = at.bottom + pad;
    if (top + r.height + pad > window.innerHeight && at.top - r.height - pad > pad) top = at.top - r.height - pad;
    left = Math.max(pad, Math.min(left, window.innerWidth - r.width - pad));
    top = Math.max(pad, Math.min(top, window.innerHeight - r.height - pad));
    el.style.left = left + "px";
    el.style.top = top + "px";
  }
  function closePop() {
    if (pop) { pop.remove(); pop = null; }
    pending = null;
    const back = returnFocus; returnFocus = null;
    if (back && back.isConnected && back !== document.body) {
      try { back.focus({ preventScroll: true }); } catch (_) {}
    }
  }

  function commit(tag, comment, editing) {
    /* EDITING rewrites the note in place and clears `sent`: a note whose words
     * have changed has not been sent in the form it now carries */
    if (editing) {
      editing.tag = tag || null;
      editing.comment = collapse(comment) || null;
      delete editing.sent;
      editing.likely = likelyFiles(editing);
      closePop(); save(); redraw(); refreshBtn();
      status(`Note ${editing.n} rewritten.`);
      return;
    }
    if (!pending) return;
    const now = new Date();
    const nt = {
      id: now.getTime().toString(36) + Math.random().toString(36).slice(2, 7),
      n: ++seq,
      kind: pending.kind,
      route: pending.route || currentRoute(),
      routeName: pending.routeName || "",
      title: pending.title || document.title,
      tag: tag || null,
      comment: collapse(comment) || null,
      at: localISO(now),
      ua: navigator.userAgent,
      vw: window.innerWidth,
      vh: window.innerHeight,
    };
    if (pending.kind === "text") nt.text = pending.text;
    else if (pending.kind === "region") nt.region = pending.region;
    nt.likely = likelyFiles(nt);
    notes.push(nt);
    const range = pending.kind === "text" ? pending.range : null;
    closePop();
    if (range) {
      /* a render since capture detaches the cloned range: wrap what it holds,
       * and if that yields nothing, re-anchor by the captured text instead */
      let ok = false;
      try { ok = wrapRange(range, nt); } catch (e) { console.warn("[page-feedback] could not mark the selection", e); }
      if (!ok && here(nt)) nt.found = anchor(nt);
      const sel = window.getSelection(); if (sel) sel.removeAllRanges();
    } else if (nt.kind === "region" && here(nt)) {
      drawBox(nt);
    }
    save();
    renderList();
    refreshBtn();
  }

  // ---- the marks -------------------------------------------------------
  /* the range is cut at NODE boundaries and each node rewritten once:
   * surroundContents throws the moment a selection crosses an element */
  function wrapRange(range, nt) {
    const cuts = rangeNodes(range);
    const title = nt.n + " · " + (nt.comment || nt.tag || "no comment");
    for (const c of cuts) {
      const s = c.node.data, frag = document.createDocumentFragment();
      if (c.a > 0) frag.append(s.slice(0, c.a));
      const m = document.createElement("mark");
      m.className = "fbmark";
      m.setAttribute("data-fb", String(nt.n));
      m.title = title;
      m.textContent = s.slice(c.a, c.b);
      frag.append(m); marks.push(m);
      if (c.b < s.length) frag.append(s.slice(c.b));
      c.node.replaceWith(frag);
    }
    return cuts.length > 0;
  }
  function clearMarks() {
    const parents = new Set();
    for (const m of marks) {
      const par = unwrap(m);
      if (par) parents.add(par);
    }
    marks.length = 0;
    for (const p of parents) p.normalize();
  }

  /* re-anchoring: the note's own words are searched for, first inside the block
   * it was made in and then anywhere in the roots. Whitespace is allowed to
   * have changed (\s+ between the words); nothing else is. */
  function findRange(root, exact, prefix, suffix, offset) {
    /* the first 40 words are enough to FIND the run */
    const ws = collapse(exact).split(" ").filter(Boolean).slice(0, 40);
    if (!root || !ws.length) return null;
    const parts = [];
    let text = "";
    const skip = skipSel();
    const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) => (!n.parentElement || n.parentElement.closest(skip)
        ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    while (w.nextNode()) { const n = w.currentNode; parts.push({ node: n, a: text.length, b: text.length + n.data.length }); text += n.data; }
    /* EVERY match is scored against the note's own neighbours — the first
     * occurrence is the wrong one exactly when the text repeats */
    let re;
    try { re = new RegExp(ws.map(reEsc).join("\\s+"), "g"); } catch (_) { return null; }
    const pre = collapse(String(prefix || "").replace(/^…/, "")).slice(-24).toLowerCase();
    const suf = collapse(String(suffix || "").replace(/…$/, "")).slice(0, 24).toLowerCase();
    let best = null, bestScore = -1, m;
    while ((m = re.exec(text))) {
      const a = m.index, b = a + m[0].length;
      let score = 0;
      if (pre && collapse(text.slice(Math.max(0, a - 80), a)).toLowerCase().endsWith(pre)) score += 2;
      if (suf && collapse(text.slice(b, b + 80)).toLowerCase().startsWith(suf)) score += 2;
      /* the measured offset breaks a tie when the neighbours are identical too */
      if (offset != null && Math.abs(a - offset) <= 40) score += 1;
      if (score > bestScore) { bestScore = score; best = [a, b]; }
      if (bestScore >= 5) break;
      if (re.lastIndex === m.index) re.lastIndex++;
    }
    if (!best) return null;
    const A = best[0], B = best[1];
    const r = document.createRange();
    let sOk = false, eOk = false;
    for (const p of parts) {
      if (!sOk && A >= p.a && A < p.b) { r.setStart(p.node, A - p.a); sOk = true; }
      if (sOk && B > p.a && B <= p.b) { r.setEnd(p.node, B - p.a); eOk = true; break; }
    }
    return sOk && eOk ? r : null;
  }
  function anchor(nt) {
    const t = nt.text || {};
    const block = t.blockId ? document.getElementById(t.blockId) : null;
    const roots = (block ? [block] : []).concat(rootEls());
    for (const root of roots) {
      /* the offset is only comparable inside the block it was measured in */
      const r = findRange(root, t.exact, t.prefix, t.suffix, root === block ? t.offset : null);
      if (r) { try { return wrapRange(r, nt); } catch (_) { return false; } }
    }
    return false;
  }

  function drawBox(nt) {
    if (!layer || !nt.region) return;
    const r = nt.region;
    layer.append(fh("div.fbbox", {
      class: r.fixed ? "fbbox--fixed" : null,
      style: { left: r.x + "px", top: r.y + "px", width: r.w + "px", height: r.h + "px" },
      "data-fb": String(nt.n),
    }, fh("span.fbbox__n", String(nt.n))));
  }

  const here = (nt) => routeOf(nt.route) === routeOf(currentRoute());
  const redrawSoon = debounce(() => { if (on) redraw(); }, 90);
  function redraw() {
    clearMarks();
    if (layer) layer.replaceChildren();
    if (!on) return;
    for (const nt of notes) {
      if (!here(nt)) { nt.found = null; continue; }
      if (nt.kind === "text") nt.found = anchor(nt);
      else if (nt.kind === "region") { nt.found = true; drawBox(nt); }
      else nt.found = true;                 // a page note is about the page; it is always «here»
    }
    renderList();
    if (pendingScroll != null) {
      const want = pendingScroll; pendingScroll = null;
      const nt = notes.find((x) => (x.id || x.n) === want);
      const el = nt && markOf(nt);
      if (el) el.scrollIntoView({ block: "center" });
    }
  }

  // ---- the panel: THE QUEUE --------------------------------------------
  function status(msg) {
    const s = panel && qs(".fbpanel__status", panel);
    if (s) s.textContent = msg || "";
  }
  const unsentOf = () => notes.filter((nt) => !nt.sent);

  function makeRow(nt) {
    const elsewhere = !here(nt);
    return fh("div.fbrow", { class: nt.sent ? "is-sent" : null },
      fh("button.fbrow__go", {
        type: "button",
        title: nt.kind === "page" ? "a note about that page" : "scroll to this note",
        on: { click: () => goTo(nt) },
      },
        fh("span.fbrow__n", String(nt.n)),
        fh("span.fbrow__kind", nt.kind),
        fh("span.fbrow__ex", "“" + excerptOf(nt) + "”"),
        nt.comment ? fh("span.fbrow__c", clip(nt.comment, 80)) : null,
        nt.tag ? fh("span.fbrow__tag", nt.tag) : null,
        elsewhere ? fh("span.fbrow__route", routeOf(nt.route)) : null,
        nt.sent ? fh("span.fbrow__sent", "sent") : null,
        !elsewhere && nt.found === false ? fh("span.fbrow__lost", "not on this page now") : null),
      fh("div.fbrow__acts",
        fh("button.fbrow__edit", { type: "button", "aria-label": "edit note " + nt.n, title: "edit this note",
          on: { click: () => openPop({ note: nt }) } }, "✎"),
        fh("button.fbrow__x", { type: "button", "aria-label": "delete note " + nt.n, title: "delete this note",
          on: { click: () => del(nt) } }, "×")));
  }

  /* a row is rebuilt only when what it SAYS has changed, so a re-render does
   * not throw away the reader's place in the queue */
  const rowCache = new Map();
  const sigOf = (nt) => [nt.n, nt.kind, nt.tag, nt.comment, nt.found, nt.sent,
    here(nt) ? "" : routeOf(nt.route), excerptOf(nt)].join("␟");
  function renderList() {
    const list = panel && qs(".fbpanel__list", panel);
    if (!list) return;
    refreshFoot();
    if (!notes.length) {
      rowCache.clear();
      list.replaceChildren(fh("p.fbpanel__empty", "No notes yet. Select text, draw a region, or add a note about this page."));
      return;
    }
    const rows = [], live = new Set();
    for (const nt of notes) {
      const key = nt.id || String(nt.n);
      live.add(key);
      const sig = sigOf(nt);
      let c = rowCache.get(key);
      if (!c || c.sig !== sig) { c = { row: makeRow(nt), sig }; rowCache.set(key, c); }
      rows.push(c.row);
    }
    for (const k of Array.from(rowCache.keys())) if (!live.has(k)) rowCache.delete(k);
    const cur = Array.from(list.children);
    if (cur.length !== rows.length || rows.some((r, i) => cur[i] !== r)) list.replaceChildren(...rows);
  }

  /* the foot says what the button will actually send */
  let btnGo = null, btnAll = null;
  function refreshFoot() {
    const count = panel && qs(".fbpanel__count", panel);
    const all = notes.length, nw = unsentOf().length;
    const some = nw > 0 && nw < all;
    if (count) count.textContent = all ? plural(all, "note") + (some ? " · " + nw + " new" : "") : "";
    if (btnGo) {
      btnGo.disabled = !all;
      btnGo.textContent = !all ? "Export feedback" : some ? `Export ${nw} new` : `Export ${plural(all, "note")}`;
    }
    if (btnAll) { btnAll.hidden = !some; btnAll.textContent = `Export all ${all}`; }
  }

  /* the element a note is pinned to on THIS page, if it is on this page */
  function markOf(nt) {
    return nt.kind === "text" ? qs(`.fbmark[data-fb="${nt.n}"]`)
      : nt.kind === "region" ? (layer && qs(`.fbbox[data-fb="${nt.n}"]`, layer))
      : null;
  }
  /* a note on another page: go there, and scroll to it once it is drawn */
  let pendingScroll = null;
  function navigateTo(route) {
    try {
      const u = new URL(route, location.href);
      if (u.pathname === location.pathname && u.search === location.search) location.hash = u.hash;
      else location.href = u.href;
    } catch (_) { location.hash = route; }
  }
  function goTo(nt) {
    const el = markOf(nt);
    if (el) { el.scrollIntoView({ block: "center" }); return; }
    if (!here(nt)) {
      pendingScroll = nt.id || nt.n;
      navigateTo(nt.route);
      return;
    }
    status(nt.kind === "page"
      ? `Note ${nt.n} is about this page as a whole — there is nothing to scroll to.`
      : `Note ${nt.n} is not on this page any more: its text or its layout has changed.`);
  }
  function del(nt) {
    const i = notes.indexOf(nt);
    if (i >= 0) { if (nt.id) deleted.add(nt.id); notes.splice(i, 1); }
    save(); redraw(); refreshBtn();
  }
  function clearAll() { notes.forEach((nt) => nt.id && deleted.add(nt.id)); notes.length = 0; seq = 0; save(); redraw(); refreshBtn(); }

  function makePanel() {
    const fold = fh("button.fbpanel__x", { type: "button", "aria-label": "fold the panel", "aria-expanded": "true",
      on: { click: (e) => {
        const f = panel.classList.toggle("is-min");
        e.currentTarget.textContent = f ? "+" : "−";
        e.currentTarget.setAttribute("aria-expanded", String(!f));
      } } }, "−");
    btnGo = fh("button.fbb.fbb--go", { type: "button", on: { click: () => doExport({}) } }, "Export feedback");
    btnAll = fh("button.fbb", { type: "button", hidden: true, on: { click: () => doExport({ all: true }) } }, "Export all");
    /* an <aside> with a label is a complementary landmark: it takes no focus,
     * traps none, and leaves the page fully usable */
    panel = fh("aside.fbpanel#fbpanel", { "aria-label": "Feedback notes" },
      fh("div.fbpanel__hd",
        fh("span.fbpanel__dot", { "aria-hidden": "true" }), "feedback",
        fh("span.fbpanel__count"),
        fold,
        fh("button.fbpanel__x", { type: "button", "aria-label": "turn the feedback instrument off", on: { click: () => disable() } }, "×")),
      fh("div.fbpanel__body",
        fh("p.fbpanel__how", "Select text to comment on it · ",
          fh("button.fbpanel__region", { type: "button", on: { click: armRegion } }, "Draw a region"), " (R) · ",
          fh("button.fbb.fbb--add", { type: "button", on: { click: addPageNote } }, "＋ Note on this page"), " (N)"),
        fh("div.fbpanel__list")),
      fh("div.fbpanel__ft",
        fh("div.fbpanel__btns",
          btnGo, btnAll,
          fh("button.fbb", { type: "button", on: { click: () => doExport({ copyOnly: true }) } }, "Copy only"),
          fh("button.fbb", { type: "button", on: { click: () => { if (notes.length && window.confirm(`Delete all ${notes.length} notes? This cannot be undone.`)) clearAll(); } } }, "Clear all")),
        fh("p.fbpanel__status", { role: "status" })));
    document.body.append(panel);
    renderList();
  }

  function makeBtn() {
    btn = fh("button.fbtoggle#fbtoggle", { type: "button", "aria-label": "Feedback (Alt+Shift+F)", on: { click: () => toggle() } }, "Feedback");
    document.body.append(btn);
    refreshBtn();
  }
  function refreshBtn() {
    if (!btn) return;
    const nw = unsentOf().length;
    btn.textContent = "Feedback" + (notes.length ? " · " + notes.length : "");
    btn.title = notes.length
      ? `${plural(notes.length, "note")}${nw && nw < notes.length ? ` · ${nw} not yet exported` : ""}`
      : "Feedback (Alt+Shift+F)";
    btn.classList.toggle("is-on", on);
  }

  // ---- the export ------------------------------------------------------
  const pad2 = (n) => String(n).padStart(2, "0");
  function localISO(d) {
    const off = -d.getTimezoneOffset(), s = off >= 0 ? "+" : "-", a = Math.abs(off);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}${s}${pad2(Math.floor(a / 60))}:${pad2(a % 60)}`;
  }
  const stampHead = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
  const stampFile = (d) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}-${pad2(d.getHours())}${pad2(d.getMinutes())}`;
  function shortUA() {
    const ua = navigator.userAgent; let m, br;
    if ((m = /Edg\/(\d+)/.exec(ua))) br = "Edge " + m[1];
    else if ((m = /OPR\/(\d+)/.exec(ua))) br = "Opera " + m[1];
    else if ((m = /Chrome\/(\d+)/.exec(ua))) br = "Chrome " + m[1];
    else if ((m = /Firefox\/(\d+)/.exec(ua))) br = "Firefox " + m[1];
    else if ((m = /Version\/(\d+)[\d.]* Safari/.exec(ua))) br = "Safari " + m[1];
    else br = "an unnamed browser";
    const os = /Mac OS X|Macintosh/.test(ua) ? "macOS" : /Windows/.test(ua) ? "Windows"
      : /Android/.test(ua) ? "Android" : /iPhone|iPad|iPod/.test(ua) ? "iOS"
      : /Linux/.test(ua) ? "Linux" : "an unnamed system";
    return br + " on " + os;
  }
  const paraLine = (p, blockId) => (p.kind === "fn"
    ? `n. ${p.n} in ${p.file} · #${blockId}`
    : `¶${p.n} in ${p.file}${p.shown != null ? ` · shown as ${p.shown}` : ""} · #${blockId}`);

  function markdown(list) {
    const d = new Date();
    const all = notes.length, n = list.length;
    const out = [];
    out.push(`# ${CFG.name ? CFG.name + " · " : ""}feedback · ${stampHead(d)}`, "");
    out.push(`${plural(n, "note")}${n < all ? ` · ${all - n} more in the queue, exported earlier` : ""}`
      + ` · ${location.origin}${location.pathname} · viewport ${window.innerWidth}×${window.innerHeight} · ${shortUA()}`, "");
    out.push("Each note names the route it was made on and the rendered element as a CSS");
    out.push("path from the page root — and, where the host page supplies them, the source");
    out.push("paragraph and a best guess at the files that render it. «likely» is a guess;");
    out.push("everything else — the path, the paragraph, every figure on a region — is measured.", "");
    out.push("A region note lists what its box covers, MOST-COVERED FIRST, with two");
    out.push("figures: «covered» is how much of that element the box holds, «of box» is");
    out.push("how much of the box that element accounts for. The first line is the likely");
    out.push("target; «words in the box» is the text the box actually encloses, which is");
    out.push("not always all the text of the element that holds it. A box that chooses");
    out.push("between nothing says so on its own «⚠ ambiguous» line.", "");
    /* THE LIST FIRST. This file is handed over to be worked through, so the
     * first screen is the worklist itself and the evidence follows it. */
    out.push("## The list", "");
    for (const nt of list) {
      out.push(`- [ ] ${nt.n} · ${nt.tag || nt.kind} · ${routeOf(nt.route)} — ${nt.comment || "“" + excerptOf(nt, 60) + "”"}`);
    }
    out.push("");
    for (const nt of list) {
      out.push(`## ${nt.n} · ${nt.kind} · ${nt.tag || "(no tag)"} · ${nt.route}`, "");
      if (nt.kind === "text") {
        const t = nt.text;
        out.push(`> "${clip(t.exact, 300)}"`, "");
        if (t.truncated) out.push("- note: the selection was longer than the instrument stores; the quote above is the head of it");
        if (t.para) out.push(`- para: ${paraLine(t.para, t.blockId)}`);
        out.push(`- path: ${t.path}`);
        out.push(`- context: ${t.prefix}«${clip(t.exact, 120)}»${t.suffix}`);
      } else if (nt.kind === "region") {
        const r = nt.region;
        out.push(r.fixed
          ? `- rect: ${r.w}×${r.h} at (${r.x}, ${r.y}) viewport px (a fixed element — it does not scroll) · viewport ${r.vw}×${r.vh}`
          : `- rect: ${r.w}×${r.h} at (${r.x}, ${r.y}) page px · viewport ${r.vw}×${r.vh} · scrolled ${r.scrollY}`);
        if (r.within) out.push(`- within: ${r.within.path} — «${r.within.text}»`);
        out.push(r.under
          ? `- words in the box: «${clip(r.under, 220)}»${r.underWords ? ` (${plural(r.underWords, "word")})` : ""}`
          : "- words in the box: none — the box encloses no text at all");
        if (r.ambiguous) out.push(`- ⚠ ambiguous: ${r.ambiguous}`);
        const cov = r.covers || [];
        out.push(`- covers ${plural(cov.length, "element")}, most-covered first${r.moreCovers ? ` (and ${r.moreCovers} less-covered, not listed)` : ""}:`);
        cov.forEach((c, k) => {
          const fig = `covered ${Math.round(c.cover * 100)}% · ${Math.round(c.fill * 100)}% of box`;
          const what = c.kind ? `— ${c.kind}` : c.text ? `«${c.text}»` : "";
          out.push(`  ${k === 0 ? "⇒" : " "} ${fig}  ${c.path} ${what}`.trimEnd());
        });
        if (r.truncated) out.push("- note: this page was large enough that the walk was capped; the figures above are of what was reached");
      } else {
        out.push(`- page: ${nt.title || "—"}`);
      }
      if ((nt.likely || []).length) out.push(`- likely: ${nt.likely.join(" · ")}`);
      if (nt.sent) out.push(`- exported before: ${nt.sent}`);
      if (nt.comment) out.push("", nt.comment);
      out.push("");
    }
    out.push("---", "", "```json", JSON.stringify(list.map(bare), null, 2), "```", "");
    return out.join("\n");
  }
  /* the JSON block is the raw notes, without the render-time bookkeeping */
  function bare(nt) { const c = Object.assign({}, nt); delete c.found; return c; }

  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const a = fh("a", { href: url, download: name, style: { display: "none" } });
    document.body.append(a);
    a.click();
    setTimeout(() => { a.remove(); URL.revokeObjectURL(url); }, 2000);
  }
  /* a note that has left the machine is marked, so the queue can say which
   * ones are new and the next export can carry only those */
  function markSent(batch) {
    const at = localISO(new Date());
    batch.forEach((nt) => { nt.sent = at; });
    save(); renderList(); refreshBtn();
  }
  /* doExport({all, copyOnly}) — «all» ignores the sent marks and writes the
   * whole queue; otherwise the new notes go, or the whole queue when none of
   * it is new */
  async function doExport(opts) {
    opts = opts || {};
    const nw = unsentOf();
    const batch = opts.all || !nw.length || nw.length === notes.length ? notes.slice() : nw.slice();
    if (!batch.length) { status("There are no notes to export yet."); return ""; }
    const text = markdown(batch);
    let copied = false;
    try { await navigator.clipboard.writeText(text); copied = true; } catch (_) { copied = false; }
    const how = plural(batch.length, "note");
    if (opts.copyOnly) {
      if (copied) { markSent(batch); status(`Copied ${how}.`); }
      else status("The clipboard refused. Use «Export» for a file.");
      return text;
    }
    const name = `${CFG.filePrefix || "page-feedback"}-${stampFile(new Date())}.md`;
    download(name, text);
    markSent(batch);
    status(copied ? `Copied · downloaded ${name} — ${how}.` : `Downloaded ${name} — ${how}.`);
    return text;
  }

  // ---- storage ---------------------------------------------------------
  /* only shaped notes are accepted; what is dropped is said in the console */
  function validNote(nt) {
    if (!nt || typeof nt !== "object" || typeof nt.n !== "number") return false;
    if (nt.kind === "text") return !!(nt.text && typeof nt.text.exact === "string");
    if (nt.kind === "region") return !!(nt.region && typeof nt.region.w === "number");
    if (nt.kind === "page") return true;   // a page note's comment is its whole payload
    return false;
  }
  const deleted = new Set();           // ids deleted THIS session — a merge must not resurrect them
  let storageWarned = false;
  function mergeFromStore() {
    try {
      const arr = JSON.parse(localStorage.getItem(CFG.storageKey) || "[]");
      if (!Array.isArray(arr)) return;
      let dropped = 0;
      for (const nt of arr) {
        if (!validNote(nt)) { dropped++; continue; }
        if (!nt.id) nt.id = "old-" + nt.n + "-" + (nt.at || "");
        if (deleted.has(nt.id) || notes.some((x) => x.id === nt.id)) continue;
        /* another tab's note may collide on n — the id is the identity, the
         * running number is display, so the incomer is renumbered */
        if (notes.some((x) => x.n === nt.n)) nt.n = Math.max(seq, ...notes.map((x) => x.n)) + 1;
        notes.push(nt);
      }
      for (const nt of notes) seq = Math.max(seq, nt.n || 0);
      if (dropped) console.warn(`[page-feedback] ${dropped} stored note(s) did not match the schema and were not loaded`);
    } catch (_) {}
  }
  function save() {
    mergeFromStore();                  // union with what another tab wrote — last writer must not win alone
    try { localStorage.setItem(CFG.storageKey, JSON.stringify(notes.map(bare))); }
    catch (_) {
      if (!storageWarned) { storageWarned = true; status("Storage refused — notes live only in this session. Export soon."); }
    }
  }
  window.addEventListener("storage", (e) => {
    if (e.key !== CFG.storageKey) return;
    mergeFromStore();
    if (on) { redraw(); refreshBtn(); }
  });

  // ---- wiring ----------------------------------------------------------
  function enable() {
    if (on) return;
    on = true;
    document.documentElement.setAttribute("data-fb", "on");
    layer = fh("div#fblayer");
    document.body.append(layer);
    makePanel();
    redraw();
    refreshBtn();
  }
  function disable() {
    if (!on) return;
    on = false;
    closePop(); disarmRegion();
    clearMarks();
    if (layer) { layer.remove(); layer = null; }
    if (panel) { panel.remove(); panel = null; }
    document.documentElement.removeAttribute("data-fb");
    refreshBtn();
  }
  const toggle = () => (on ? disable() : enable());

  /* A SELECTION IS CAPTURED WHEN IT HAS SETTLED, AND A MULTI-CLICK HAS NOT
   * SETTLED UNTIL THE CLICKS STOP. Every click of a triple-click fires its own
   * mouseup; at a flat delay the second one wins and the popover opens on ONE
   * WORD. So a mouseup that is part of a multi-click waits out the browser's
   * click-chaining window, and each further click resets it. */
  const SETTLE_MS = 120;         // a drag: this mouseup IS the end of it
  const MULTI_MS = 450;          // a 2nd/3rd click: another may still follow
  let settleT = null;
  const settle = (ms) => { clearTimeout(settleT); settleT = setTimeout(onSelection, ms); };
  document.addEventListener("mouseup", (e) => { if (on) settle(e.detail > 1 ? MULTI_MS : SETTLE_MS); });
  /* touch platforms suppress mouse events while selecting with the handles,
   * so selectionchange is the signal there — but ONLY for touch/pen: on a
   * mouse it would open the popover mid-drag */
  let lastPtr = "mouse";
  document.addEventListener("pointerdown", (e) => { if (e.pointerType) lastPtr = e.pointerType; }, true);
  document.addEventListener("selectionchange", () => { if (on && lastPtr !== "mouse") settle(SETTLE_MS); });
  document.addEventListener("keyup", (e) => {
    if (!on) return;
    if (e.key === "Shift" || /^Arrow/.test(e.key) || (e.key === "a" && (e.ctrlKey || e.metaKey))) settle(SETTLE_MS);
  });

  /* e.code is the reliable reading — ⌥⇧F types «ƒ» or «Ï» on a Mac layout —
   * but a synthetic event may carry no code */
  const isF = (e) => e.code === "KeyF" || ["f", "F", "ƒ", "Ï"].indexOf(e.key) >= 0;
  const typing = () => {
    const a = document.activeElement;
    return !!a && (a.tagName === "INPUT" || a.tagName === "TEXTAREA" || a.tagName === "SELECT" || a.isContentEditable);
  };
  window.addEventListener("keydown", (e) => {
    if (e.altKey && e.shiftKey && !e.metaKey && !e.ctrlKey && isF(e)) { e.preventDefault(); toggle(); return; }
    if (!on) return;
    if (e.key === "Escape") {
      if (pop) { e.preventDefault(); closePop(); return; }
      if (overlay) { e.preventDefault(); disarmRegion(); return; }
      return;
    }
    if (typing() || pop || overlay || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "r" || e.key === "R") { e.preventDefault(); armRegion(); }
    if (e.key === "n" || e.key === "N") { e.preventDefault(); addPageNote(); }
  });

  /* A ROUTE change ends whatever was in flight (an open popover would save
   * under the wrong page), and any re-render re-anchors the marks. Hash and
   * history navigation are heard here; an app that re-renders without
   * changing the URL calls PageFeedback.refresh() or passes `subscribe`. */
  let fbPath = null;
  function onRender() {
    const path = routeOf(currentRoute());
    if (fbPath !== null && path !== fbPath) { if (pop) closePop(); if (overlay) disarmRegion(); }
    fbPath = path;
    if (on) redrawSoon();
  }
  window.addEventListener("hashchange", onRender);
  window.addEventListener("popstate", onRender);

  window.PageFeedback = {
    configure,
    toggle, enable, disable,
    refresh: onRender,
    region: armRegion,
    page: addPageNote,
    get on() { return on; },
    notes: () => notes.map(bare),
    /* both take the whole queue by default; pass {new: true} for the notes
     * that have not been exported yet */
    md: (o) => markdown(o && o.new ? unsentOf() : notes),
    json: (o) => JSON.parse(JSON.stringify((o && o.new ? unsentOf() : notes).map(bare))),
    clear: clearAll,
    export: (o) => doExport(typeof o === "boolean" ? { copyOnly: o } : (o || {})),
  };

  const boot = () => {
    configure(window.PageFeedbackConfig);
    fbPath = routeOf(currentRoute());
    mergeFromStore();
    if (CFG.button && !btn) makeBtn();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
