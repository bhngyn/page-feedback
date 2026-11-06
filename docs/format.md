# The export format

One Markdown file, `<filePrefix>-YYYYMMDD-HHMM.md` (local time), in four
parts. A complete example is [`example-export.md`](example-export.md).

1. **A header** — `# <name> · feedback · <date time>`, a line with the note
   count, the page URL, the viewport and a short browser name, and two short
   paragraphs explaining the figures.
2. **`## The list`** — one GitHub-checklist line per note, in the order they
   were made: `- [ ] n · tag-or-kind · where · route — comment` (`where` is the tab;
   a route made on the exported page is shown as its hash, with its filters). The file is handed
   over to be worked through, so the worklist comes first.
3. **One section per note** — `## n · kind · tag-or-(no tag) · where · route`, then an `on:` line with the
   tab and the full route, then:
   - **text** — a blockquote of the exact selection (cut at 300 characters),
     `para` (only if the host supplies `resolveBlock`), `path`, and `context`
     (the words either side, with the selection in «…»).
   - **region** — `rect`, `within`, `words in the box`, an optional
     `⚠ ambiguous` line, and `covers`: every element the box intersects,
     most-covered first, each with `covered N%` (how much of the element the
     box holds) and `N% of box` (how much of the box the element accounts
     for). The first is marked `⇒`.
   - **page** — just `page` (the page title). Nothing is marked.

   Every kind then has `likely` (only if non-empty), `exported before` (if
   the note was sent once already) and the comment.
4. **`---` and a fenced ```` ```json ```` block** holding the raw notes. It is
   always the last thing in the file.

## The note contract

Every note in the JSON block is an object with:

| key | type | |
|---|---|---|
| `id` | string | stable identity (survives renumbering) |
| `n` | number | display number |
| `kind` | `"text"` \| `"region"` \| `"page"` | |
| `route` | string | the host's `route()` when the note was made |
| `routeName` | string | the host's `routeName()`, or `""` |
| `where` | string? | the tab or view the reader was on (the host's `where()`, or the selected tab's label); absent on notes made before it existed |
| `title` | string | `document.title` |
| `tag` | string \| null | |
| `comment` | string \| null | a note has a tag, a comment, or both |
| `at` | string | ISO 8601 with offset |
| `ua`, `vw`, `vh` | string, number, number | browser and viewport |
| `likely` | string[] | possibly empty |
| `sent` | string? | ISO time of the last export that carried it |
| `text` | object | **kind `text` only** — see below |
| `region` | object | **kind `region` only** — see below |

**`text`**: `exact` (≤1,500 chars, whitespace collapsed), `truncated?`,
`prefix`, `suffix` (≤48 chars each, «…» where cut), `offset` (characters
from the start of the block), `blockId` (nearest ancestor id, or null),
`path`, `para?` (`{file, n, kind: "p"|"fn", shown?}` from `resolveBlock`),
`rect` (`{x, y, w, h}` page px).

**`region`**: `x, y, w, h` (page px, or viewport px when `fixed: true`),
`vw, vh, scrollY`, `within` (`{path, text}` or null), `covers`
(`[{path, text, cover, fill, kind?}]`, at most 12, ranked), `moreCovers?`,
`truncated?`, `under` (the words in the box), `underWords`, `ambiguous?`.

`ingest/feedback_ingest.py` validates `n, kind, route, comment, likely` on
every note, `text.exact` on text notes and `region.x/y/w/h` on region notes,
and fails with a message naming the note otherwise.
