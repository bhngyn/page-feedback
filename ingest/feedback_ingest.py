#!/usr/bin/env python3
"""feedback_ingest.py — read a page-feedback export back into a worklist.

feedback.js exports one Markdown file that opens with a `## The list`
checklist, follows it with one section per note, and ends with a ```json
block carrying the raw notes. This reads both: the fence for the notes
themselves (checked against the note-shape contract in docs/format.md), the
checklist for the reader's own summary — and prints each note as one compact
record a person (or a coding agent) can act on: route · the rendered
element's path · the source paragraph · the likely files · the comment. It
writes nothing.

  python3 feedback_ingest.py ~/Downloads/page-feedback-20260823-1402.md
  python3 feedback_ingest.py feedback/*.md --json      # the notes, merged, as JSON
  python3 feedback_ingest.py --latest                  # newest export in ~/Downloads and ./feedback
  python3 feedback_ingest.py --latest --prefix my-site # if you set filePrefix

An explicit path always wins over --latest — passing both prints a warning
and reads the named file(s); --latest only picks a file when no path is given.
"""
from __future__ import annotations

import glob
import json
import os
import re
import sys
from pathlib import Path

# The greedy leading .*\n pins the match to the LAST ```json fence in the
# file: a note whose COMMENT ends in ```json must not hijack the capture.
FENCE = re.compile(r".*\n```json\s*\n(.*?)\n```\s*$", re.S)
# The export opens with a checklist ahead of the per-note sections; it ends
# where the first per-note "## n · kind · …" heading starts,
# or — a list with zero notes — straight at the closing "---". Never touches
# the ```json fence below; FENCE and LIST_RE are searched independently.
LIST_RE = re.compile(r"^## The list[ \t]*\n(.*?)(?=\n##[ \t]|\n---[ \t]*\n)", re.S | re.M)

REQUIRED = ("n", "kind", "route", "comment", "likely")
KINDS = ("text", "region", "page")
# Each kind's own sub-record and what IT must carry to be shown safely.
# "page" carries no sub-record at all — route/routeName/title/tag/comment
# sit at the top level. vw/vh are NOT required here on purpose: a region
# missing them is still a valid note, and show() degrades rather than
# trusting they're there.
SUB_REQUIRED = {
    "text": ("exact",),
    "region": ("x", "y", "w", "h"),
}


def clip(s: str, n: int) -> str:
    """The one truncation helper — every cut line goes through this, so
    every cut is marked."""
    return s if len(s) <= n else s[:n] + "…"


def para_line(p: dict, block_id) -> str:
    """Mirrors the exporter's paraLine in feedback.js: a footnote has no
    "shown as", and a paragraph carries one only when the host supplied it."""
    if p.get("kind") == "fn":
        return f"n. {p.get('n', '?')} in {p.get('file', '?')} · #{block_id}"
    shown = f" · shown as {p['shown']}" if p.get("shown") is not None else ""
    return f"¶{p.get('n', '?')} in {p.get('file', '?')}{shown} · #{block_id}"


def checklist_of(text: str) -> list[str]:
    """The export's own '## The list' section, verbatim — printed ahead of
    the per-note records. Absent in a note-free export, so an empty result
    is normal, not an error."""
    m = LIST_RE.search(text)
    if not m:
        return []
    return [ln.rstrip() for ln in m.group(1).splitlines() if ln.strip()]


def notes_of(text: str, path: Path) -> list[dict]:
    m = FENCE.search(text)
    if not m:
        sys.exit(f"{path}: no trailing ```json block — is this a feedback export?")
    try:
        notes = json.loads(m.group(1))
    except json.JSONDecodeError as e:
        sys.exit(f"{path}: the json block does not parse: {e}")
    if not isinstance(notes, list):
        sys.exit(f"{path}: the json block is not an array")
    for i, n in enumerate(notes):
        missing = [k for k in REQUIRED if k not in n]
        if missing:
            sys.exit(f"{path}: note {i + 1} lacks {', '.join(missing)}")
        kind = n["kind"]
        if kind not in KINDS:
            sys.exit(f"{path}: note {n['n']} is kind {kind!r}, not one of {', '.join(KINDS)}")
        # Validate each kind's own sub-record here too, so a bad note always
        # fails at the door with a contract error rather than a KeyError later.
        if kind in SUB_REQUIRED:
            sub = n.get(kind)
            if not isinstance(sub, dict):
                sys.exit(f"{path}: note {n['n']} is kind {kind!r} but carries no {kind} record")
            missing_sub = [k for k in SUB_REQUIRED[kind] if k not in sub]
            if missing_sub:
                sys.exit(f"{path}: note {n['n']}'s {kind} record lacks {', '.join(missing_sub)}")
        n["_file"] = path.name  # bookkeeping only — bare() strips it before --json
    return notes


def bare(n: dict) -> dict:
    """_file is our own bookkeeping for telling a merged run's notes apart —
    it is not part of the note contract, so --json must not leak it."""
    return {k: v for k, v in n.items() if k != "_file"}


def latest(prefix: str) -> Path:
    pat = f"{prefix}-*.md"
    cands = glob.glob(os.path.join(os.path.expanduser("~/Downloads"), pat)) + glob.glob(os.path.join("feedback", pat))
    if not cands:
        sys.exit(f"no {pat} in ~/Downloads or ./feedback")
    return Path(max(cands, key=os.path.getmtime))


def show(n: dict, multi: bool = False) -> str:
    tag = n.get("tag") or "(no tag)"
    route = n.get("route", "—")
    sent = f" · sent {n['sent']}" if n.get("sent") else ""
    file_tag = f" [{n['_file']}]" if multi and n.get("_file") else ""
    head = f"{n.get('n', '?'):>2} · {n.get('kind', '?'):<6} · {tag:<8} · {route}{sent}{file_tag}"
    lines = [head]
    kind = n.get("kind")
    if kind == "text":
        t = n.get("text") or {}
        q = clip(" ".join(t.get("exact", "").split()), 160)
        cap = " (capped by the instrument at export)" if t.get("truncated") else ""
        lines.append(f"     > {q}{cap}")
        p = t.get("para")
        if p:
            lines.append(f"     para  {para_line(p, t.get('blockId', '?'))}")
        lines.append(f"     path  {t.get('path', '—')}")
    elif kind == "region":
        r = n.get("region") or {}
        lines.append(f"     rect  {r.get('w', '?')}×{r.get('h', '?')} at ({r.get('x', '?')}, {r.get('y', '?')}) page px · viewport {r.get('vw', '?')}×{r.get('vh', '?')}")
        w = r.get("within") or {}
        lines.append(f"     within  {w.get('path', '—')} — «{clip(' '.join((w.get('text') or '').split()), 80)}»")
        # the words the box actually holds come BEFORE the elements: a box
        # drawn over part of a line is answered by this and by nothing else
        # an export written before the instrument measured this has no `under`
        # key at all, which is not the same fact as a box that holds no words
        if "under" in r:
            under = " ".join((r.get("under") or "").split())
            lines.append(f"     words  «{clip(under, 140)}»" if under
                         else "     words  none — the box encloses no text at all")
        if r.get("ambiguous"):
            lines.append(f"     ⚠ ambiguous  {r['ambiguous']}")
        cov = r.get("covers") or []
        if cov:
            more = f" · and {r['moreCovers']} less-covered, not listed" if r.get("moreCovers") else ""
            lines.append(f"     covers  most-covered first{more}")
            for k, c in enumerate(cov[:6]):
                # `cover` is how much of the element the box holds; `fill` how
                # much of the box it accounts for. Older exports carry neither.
                cv, fl = c.get("cover"), c.get("fill")
                fig = f"{round((cv or 0) * 100):>3}% · {round((fl or 0) * 100):>3}% of box  " if cv is not None else ""
                what = f"— {c['kind']}" if c.get("kind") else f"«{clip(' '.join((c.get('text') or '').split()), 40)}»"
                mark = "⇒" if k == 0 else " "
                lines.append(f"       {mark} {fig}{c.get('path', '?').split(' > ')[-1]} {what}")
            if len(cov) > 6:
                lines.append(f"         … and {len(cov) - 6} more listed in the export")
    else:  # "page" — no anchor, so no path and no ¶: just what the reader was looking at
        lines.append(f"     page   {n.get('title') or '—'}")
        if n.get("routeName"):
            lines.append(f"     as     {n['routeName']}")
    lines.append(f"     likely  {' · '.join(n.get('likely') or []) or '—'}")
    if n.get("comment"):
        lines.append(f"     ⇒ {n['comment']}")
    return "\n".join(lines)


def main(argv: list[str]) -> None:
    as_json = "--json" in argv
    prefix = "page-feedback"
    if "--prefix" in argv:
        i = argv.index("--prefix")
        if i + 1 >= len(argv):
            sys.exit("--prefix needs a value")
        prefix = argv[i + 1]
        argv = argv[:i] + argv[i + 2:]
    paths = [Path(a) for a in argv if not a.startswith("--")]
    if "--latest" in argv:
        if paths:
            # explicit paths must win over --latest
            print("--latest ignored: explicit path(s) given", file=sys.stderr)
        else:
            paths = [latest(prefix)]
    elif not paths:
        paths = [latest(prefix)]

    texts = [(p, p.read_text(encoding="utf-8")) for p in paths]
    notes = [n for p, t in texts for n in notes_of(t, p)]

    if as_json:
        print(json.dumps([bare(n) for n in notes], ensure_ascii=False, indent=2))
        return

    multi = len(paths) > 1
    print(f"{len(notes)} notes from {', '.join(p.name for p in paths)}\n")

    for p, t in texts:
        lines = checklist_of(t)
        if not lines:
            continue
        label = "the list as the reader wrote it" + (f" — {p.name}" if multi else "")
        print(label)
        for ln in lines:
            print(ln)
        print()

    for n in notes:
        print(show(n, multi))
        print()
    likely = {}
    for n in notes:
        for f in n.get("likely") or []:
            likely[f] = likely.get(f, 0) + 1
    if likely:
        print("files named, by count: " + " · ".join(f"{f} ({c})" for f, c in sorted(likely.items(), key=lambda x: -x[1])))


if __name__ == "__main__":
    main(sys.argv[1:])
