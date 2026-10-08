# page-feedback demo · feedback · 2026-10-08 08:35

4 notes · http://localhost:8791/demo/index.html · viewport 1280×900 · Chrome 152 on macOS

Each note names the route it was made on and the rendered element as a CSS
path from the page root — and, where the host page supplies them, the source
paragraph and a best guess at the files that render it. «likely» is a guess;
everything else — the path, the paragraph, every figure on a region — is measured.

A region note lists what its box covers, MOST-COVERED FIRST, with two
figures: «covered» is how much of that element the box holds, «of box» is
how much of the box that element accounts for. The first line is the likely
target; «words in the box» is the text the box actually encloses, which is
not always all the text of the element that holds it. A box that chooses
between nothing says so on its own «⚠ ambiguous» line.

## The list

- [ ] 1 · Wording · /demo/index.html#/a — Say how long notes persist.
- [ ] 2 · Design · /demo/index.html#/a — Remove this line.
- [ ] 3 · region · /demo/index.html#/a — Which card did I mean? The export says it cannot tell.
- [ ] 4 · Idea · /demo/index.html#/b — Page B could show an example export.

## 1 · text · Wording · /demo/index.html#/a

> "Notes persist across reloads and across pages."

- para: ¶2 in content/demo.md · #p2
- path: main#view > p#p2
- context: …or N to add a note about the page as a whole.«Notes persist across reloads and across pages.»
- likely: demo/index.html (PAGES.a)

Say how long notes persist.

## 2 · region · Design · /demo/index.html#/a

- rect: 682×13 at (299, 300) page px · viewport 1280×900 · scrolled 0
- within: main#view — «Page A Click Feedback (bottom right) or press Alt+Shift+F. Then select any run…»
- words in the box: none — the box encloses no text at all
- covers 1 element, most-covered first:
  ⇒ covered 100% · 8% of box  main#view > div.rule:nth-of-type(1) — a 1px rule, no text
- likely: demo/index.html (PAGES.a)

Remove this line.

## 3 · region · (no tag) · /demo/index.html#/a

- rect: 344×84 at (468, 341) page px · viewport 1280×900 · scrolled 0
- within: main#view > div.cards:nth-of-type(2) — «First card Draw a box across both cards to see the ambiguity warning. Second…»
- words in the box: «cards to see the ambiguity Second card When you are done, press Markdown file.» (14 words)
- ⚠ ambiguous: the box straddles two things and chooses neither — div.card[data-id="card-1"]:nth-of-type(1) (48% of the box) and div.card[data-id="card-2"]:nth-of-type(2) (48%)
- covers 6 elements, most-covered first:
  ⇒ covered 50% · 15% of box  main#view > div.cards:nth-of-type(2) > div.card[data-id="card-1"]:nth-of-type(1) > h3 «First card»
    covered 50% · 15% of box  main#view > div.cards:nth-of-type(2) > div.card[data-id="card-2"]:nth-of-type(2) > h3 «Second card»
    covered 48% · 48% of box  main#view > div.cards:nth-of-type(2) > div.card[data-id="card-1"]:nth-of-type(1) «First cardDraw a box across both cards to see the ambiguity warning.»
    covered 48% · 48% of box  main#view > div.cards:nth-of-type(2) > div.card[data-id="card-2"]:nth-of-type(2) «Second cardWhen you are done, press Export — you get one Markdown file.»
    covered 48% · 26% of box  main#view > div.cards:nth-of-type(2) > div.card[data-id="card-1"]:nth-of-type(1) > p «Draw a box across both cards to see the ambiguity warning.»
    covered 48% · 26% of box  main#view > div.cards:nth-of-type(2) > div.card[data-id="card-2"]:nth-of-type(2) > p «When you are done, press Export — you get one Markdown file.»
- likely: demo/index.html (PAGES.a)

Which card did I mean? The export says it cannot tell.

## 4 · page · Idea · /demo/index.html#/b

- page: page-feedback · demo · Page B
- likely: demo/index.html (PAGES.b)

Page B could show an example export.

---

```json
[
  {
    "id": "muzp7mt0r8gn1",
    "n": 1,
    "kind": "text",
    "route": "/demo/index.html#/a",
    "routeName": "page-a",
    "title": "page-feedback · demo · Page A",
    "tag": "Wording",
    "comment": "Say how long notes persist.",
    "at": "2026-10-08T08:35:42-07:00",
    "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
    "vw": 1280,
    "vh": 900,
    "text": {
      "exact": "Notes persist across reloads and across pages.",
      "prefix": "…or N to add a note about the page as a whole.",
      "suffix": "",
      "offset": 138,
      "blockId": "p2",
      "path": "main#view > p#p2",
      "para": {
        "kind": "p",
        "file": "content/demo.md",
        "n": 2
      },
      "rect": {
        "x": 629,
        "y": 250,
        "w": 343,
        "h": 19
      }
    },
    "likely": [
      "demo/index.html (PAGES.a)"
    ]
  },
  {
    "id": "muzp7muv5rmd0",
    "n": 2,
    "kind": "region",
    "route": "/demo/index.html#/a",
    "routeName": "page-a",
    "title": "page-feedback · demo · Page A",
    "tag": "Design",
    "comment": "Remove this line.",
    "at": "2026-10-08T08:35:42-07:00",
    "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
    "vw": 1280,
    "vh": 900,
    "region": {
      "x": 299,
      "y": 300,
      "w": 682,
      "h": 13,
      "vw": 1280,
      "vh": 900,
      "scrollY": 0,
      "within": {
        "path": "main#view",
        "text": "Page A Click Feedback (bottom right) or press Alt+Shift+F. Then select any run…"
      },
      "covers": [
        {
          "path": "main#view > div.rule:nth-of-type(1)",
          "text": "",
          "cover": 1,
          "fill": 0.08,
          "kind": "a 1px rule, no text"
        }
      ],
      "under": "",
      "underWords": 0
    },
    "likely": [
      "demo/index.html (PAGES.a)"
    ]
  },
  {
    "id": "muzp7mwn3w27e",
    "n": 3,
    "kind": "region",
    "route": "/demo/index.html#/a",
    "routeName": "page-a",
    "title": "page-feedback · demo · Page A",
    "tag": null,
    "comment": "Which card did I mean? The export says it cannot tell.",
    "at": "2026-10-08T08:35:43-07:00",
    "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
    "vw": 1280,
    "vh": 900,
    "region": {
      "x": 468,
      "y": 341,
      "w": 344,
      "h": 84,
      "vw": 1280,
      "vh": 900,
      "scrollY": 0,
      "within": {
        "path": "main#view > div.cards:nth-of-type(2)",
        "text": "First card Draw a box across both cards to see the ambiguity warning. Second…"
      },
      "covers": [
        {
          "path": "main#view > div.cards:nth-of-type(2) > div.card[data-id=\"card-1\"]:nth-of-type(1) > h3",
          "text": "First card",
          "cover": 0.5,
          "fill": 0.15
        },
        {
          "path": "main#view > div.cards:nth-of-type(2) > div.card[data-id=\"card-2\"]:nth-of-type(2) > h3",
          "text": "Second card",
          "cover": 0.5,
          "fill": 0.15
        },
        {
          "path": "main#view > div.cards:nth-of-type(2) > div.card[data-id=\"card-1\"]:nth-of-type(1)",
          "text": "First cardDraw a box across both cards to see the ambiguity warning.",
          "cover": 0.48,
          "fill": 0.48
        },
        {
          "path": "main#view > div.cards:nth-of-type(2) > div.card[data-id=\"card-2\"]:nth-of-type(2)",
          "text": "Second cardWhen you are done, press Export — you get one Markdown file.",
          "cover": 0.48,
          "fill": 0.48
        },
        {
          "path": "main#view > div.cards:nth-of-type(2) > div.card[data-id=\"card-1\"]:nth-of-type(1) > p",
          "text": "Draw a box across both cards to see the ambiguity warning.",
          "cover": 0.48,
          "fill": 0.26
        },
        {
          "path": "main#view > div.cards:nth-of-type(2) > div.card[data-id=\"card-2\"]:nth-of-type(2) > p",
          "text": "When you are done, press Export — you get one Markdown file.",
          "cover": 0.48,
          "fill": 0.26
        }
      ],
      "under": "cards to see the ambiguity Second card When you are done, press Markdown file.",
      "underWords": 14,
      "ambiguous": "the box straddles two things and chooses neither — div.card[data-id=\"card-1\"]:nth-of-type(1) (48% of the box) and div.card[data-id=\"card-2\"]:nth-of-type(2) (48%)"
    },
    "likely": [
      "demo/index.html (PAGES.a)"
    ]
  },
  {
    "id": "muzp7n6vmub1q",
    "n": 4,
    "kind": "page",
    "route": "/demo/index.html#/b",
    "routeName": "page-b",
    "title": "page-feedback · demo · Page B",
    "tag": "Idea",
    "comment": "Page B could show an example export.",
    "at": "2026-10-08T08:35:43-07:00",
    "ua": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36",
    "vw": 1280,
    "vh": 900,
    "likely": [
      "demo/index.html (PAGES.b)"
    ]
  }
]
```
