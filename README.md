# page-feedback

A drop-in feedback instrument for any web page. Select text, draw a box, or
jot a note about the whole page; the notes pile up in a queue across pages
and sessions, and one click exports them as a single Markdown file — a
checklist first, then the evidence for each note, then the raw notes as JSON.

The export is written to be handed straight to a coding agent such as
[Claude Code](https://claude.com/claude-code) ("apply the feedback in
`page-feedback-20260823-1402.md`"), but it reads fine to a person too.

- **No dependencies, no build, no server.** One script, one stylesheet.
- **Nothing leaves the machine.** No network requests, no screenshots. Notes
  live in `localStorage` until you export them.
- **Off by default.** It costs nothing until switched on, and a mark never
  moves a line of the page under it.

Try it: open [`demo/index.html`](demo/index.html) in a browser (or serve the
repo with `python3 -m http.server` and visit `/demo/`).

## Install

```html
<link rel="stylesheet" href="feedback.css">
<script src="feedback.js" defer></script>
```

That's all. A **Feedback** button appears at the bottom right; **Alt+Shift+F**
(⌥⇧F) toggles it too.

## Using it

With the panel open:

| Do this | Makes |
|---|---|
| Select any run of text | a **text** note — the exact words, their neighbours, the CSS path |
| Press **R** (or «Draw a region») and drag | a **region** note — every element under the box, ranked, and the words it encloses |
| Press **N** (or «＋ Note on this page») | a **page** note — marks nothing, it's just an item on the list |

Each note takes an optional tag (Design · Wording · Bug · Idea) and a
comment. **⌘/Ctrl+Enter** saves, **Esc** cancels. Rows in the panel can be
edited (✎), deleted (×), or clicked to jump to their mark — including on
another page.

**Export** copies the Markdown to the clipboard and downloads it as
`page-feedback-YYYYMMDD-HHMM.md`. Exporting stamps notes as *sent* (it never
deletes them), so the next export carries only what's new; «Export all»
sends the whole queue again.

## What a note records

- **Text notes**: the exact selection (≤1,500 chars), 48 characters of context
  either side, the nearest block's `id`, a readable CSS path, and — if the
  host supplies `resolveBlock` — the source file and paragraph it came from.
- **Region notes**: the rectangle, the smallest element that contains it,
  every element it covers **ranked by how much of each the box holds**
  (`covered`) and how much of the box each accounts for (`of box`), the
  actual words inside the box, and an `⚠ ambiguous` line when the box
  straddles two things or encloses nothing whole. Textless elements (a 1px
  rule, a spacer) are named for what they are.
- **Every note**: route, page title, tag, comment, timestamp, viewport size,
  user agent, and — if the host supplies `likely` — the source files that
  probably render it.

See [`docs/format.md`](docs/format.md) for the full export format and the
JSON note contract.

## Configuration

All optional. Set `window.PageFeedbackConfig` before the script loads, or
call `PageFeedback.configure({...})` later.

```js
window.PageFeedbackConfig = {
  name: "my-site",                 // heads the export: "# my-site · feedback · …"
  storageKey: "page-feedback",     // localStorage key
  filePrefix: "page-feedback",     // export file name prefix
  tags: ["Design", "Wording", "Bug", "Idea"],   // [] for no tags
  roots: ["main", "header"],       // selectors where notes may be made; CSS paths stop here (default: body)
  skip: "sup.fn",                  // text never captured — e.g. footnote markers
  dataKeys: ["data-id"],           // attributes worth writing into a CSS path
  route: () => location.pathname + location.hash,  // what "page" a note belongs to
  routeName: () => "",             // a label for the kind of page, stored on each note
  resolveBlock: (id, el) => null,  // block id → { file, n, kind?: "p"|"fn", shown? }
  likely: (note) => [],            // note → source files that probably render it
  subscribe: (refresh) => {},      // register `refresh` with your app's render hook
  button: true,                    // false to hide the on-screen button (⌥⇧F still works)
};
```

**Single-page apps.** The instrument re-anchors its marks on `hashchange`
and `popstate`. If your app re-renders without changing the URL, call
`PageFeedback.refresh()` after each render, or pass `subscribe`:

```js
PageFeedback.configure({ subscribe: (refresh) => router.afterEach(refresh) });
```

**`likely` and `resolveBlock`** are where the instrument learns about *your*
codebase. A router-aware `likely` turns every note into "go edit
`src/views/cart.js`"; a `resolveBlock` that maps `#p12` to
`content/chapter-3.md ¶12` lets a reviewer's quote be checked against the
source text. The [demo](demo/index.html) shows both.

## JavaScript API

```
PageFeedback.toggle() .enable() .disable() .on
PageFeedback.region()          arm one rectangle (same as R)
PageFeedback.page()            open a page note (same as N)
PageFeedback.notes()           the queue, as an array
PageFeedback.md({new?})        the export Markdown, without writing anything
PageFeedback.json({new?})      the raw notes
PageFeedback.export({all?, copyOnly?})
PageFeedback.clear()
PageFeedback.refresh()         re-anchor marks after a re-render
PageFeedback.configure({...})
```

## Reading an export back

[`ingest/feedback_ingest.py`](ingest/feedback_ingest.py) (Python 3.8+, no
dependencies) validates an export and prints it as a compact worklist:

```bash
python3 ingest/feedback_ingest.py ~/Downloads/page-feedback-20260823-1402.md
python3 ingest/feedback_ingest.py --latest            # newest in ~/Downloads or ./feedback
python3 ingest/feedback_ingest.py exports/*.md --json # merged, as JSON
```

### With Claude Code

Paste the export into the chat, or name the file: *"apply the feedback in
`~/Downloads/page-feedback-20260823-1402.md`"*. For a repeatable workflow,
copy [`examples/claude-code-skill/`](examples/claude-code-skill/) into your
project's `.claude/skills/apply-feedback/` and type `/apply-feedback`.

## Design notes

- **A mark must not move a line.** Text marks wrap each text node in a
  `<mark>` with no padding, border or margin — the highlight spreads by
  `box-shadow`. Region boxes live in a zero-height overlay layer.
- **The export is the durable record; anchors are best-effort.** Text notes
  are re-found by searching for their exact words (scored against their
  neighbours, so repeated text re-anchors to the right copy). A note that
  can't be found is listed as «not on this page now», never dropped.
- **Two tabs merge, they don't clobber.** Saves union with storage, deletions
  are tombstoned for the session, and colliding note numbers are renumbered.
- **The chrome is a dark monospace slab** so it can never be mistaken for the
  page. Retheme via the `--fb-*` custom properties in `feedback.css`.

Browser support: current Chrome, Edge, Firefox and Safari.

## License

[MIT](LICENSE)
