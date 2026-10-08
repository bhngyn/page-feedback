---
name: apply-feedback
description: Ingest a page-feedback-*.md export and act on every note. Use when the user says "apply the feedback", pastes a feedback export, or names a page-feedback-*.md file.
---

# /apply-feedback [path]

A page-feedback export is a QUEUE of notes a reviewer built while reading the
rendered site: text notes (a selected run and its CSS path), region notes (a
drawn rectangle and the elements under it, ranked), and page notes (an item
about a page that marks nothing), each with an optional tag and a comment.
The file opens with a `## The list` checklist — the worklist, in the
reviewer's own order — followed by one detail section per note and a
trailing JSON block.

Copy this folder to `.claude/skills/apply-feedback/` and adjust the paths
below to where `feedback_ingest.py` lives in your project.

## Steps

1. **Find the export.** `$ARGUMENTS` is a path; or the Markdown was pasted
   into the chat (save it to `feedback/page-feedback-<stamp>.md` first); or
   nothing was given — then use `--latest`.
2. **Ingest, don't read raw:**
   `python3 path/to/feedback_ingest.py <path|--latest>` prints one record per
   note and validates the JSON block. If it exits non-zero the export is
   malformed; say so and stop.
3. **Confirm before editing.** `likely` files are a guess; the CSS `path`,
   the quoted words and a region's `words in the box` are measured. Open the
   element the path names in the file that renders it before changing
   anything. A region note marked `⚠ ambiguous` needs a closer look.
4. **Work the notes in the order of `## The list`**, grouping notes that
   touch the same file. Small, surgical edits. A note marked `sent` in an
   earlier export may already have been acted on — check before redoing it.
5. **Run the project's build and tests.**
6. **Report per note**, numbered as in the export: done (what changed,
   file:line) · declined (why) · needs a decision (the question).
