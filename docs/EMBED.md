# Embed a note or a guide in your own page

`embed/orbit-embed.js` adds two tags to any web page. It has no dependencies,
needs no build step, and works in every current browser.

```html
<script src="/orbit-embed.js"></script>

<orbit-note src="/notes/42.json" media="/notes/42.webm"></orbit-note>
<orbit-guide src="/guides/7.json"></orbit-guide>
```

`src` is the JSON your backend received from the webhook
([`orbit-note/1` or `step-guide/1`](FORMAT.md)), served by your own app.
Copy the file next to your pages or serve it from wherever you keep scripts.

## `<orbit-note>`

Shows the title, kind, length and date, the player, the short summary
with the template's sections, next steps (ticked ones crossed out), ideas,
the mood, chapters, your notes and the transcript. Every time in it jumps the player.

| Attribute | What it does |
|---|---|
| `src` | The note's JSON. Required. |
| `media` | The recording file (`.webm`, `.mp4`, `.weba`...). Left out: no player. A trimmed note plays from its start. |
| `hide` | Parts to leave out, separated by spaces: `summary todos ideas mood chapters notes transcript`. |
| `accent` | A colour for times and numbers, such as `#0a7` (default purple `#9140B0`). |

## `<orbit-guide>`

Shows the title, the intro, and each step with its number, sentence,
picture with the ring, and tip.

| Attribute | What it does |
|---|---|
| `src` | The guide's JSON. Required. |
| `accent` | As above. |

## How it fits your page

- **Your font and colours.** It inherits the font and text colour of the
  element it sits in, so it looks like the rest of your page.
- **No clashes.** Its own styles live in a shadow root: your CSS does not
  break it, and its CSS does not touch your page.
- **Safe with untrusted text.** Titles, transcripts and notes are escaped;
  the notes' HTML is filtered down to the few tags the editor makes, and
  links must be `http` or `https`.
- **Changes live.** Change `src`, `media`, `hide` or `accent` and it redraws.

## From the extension

The note page's **Embed** button shows the two lines for that note, ready
to copy; change the address to where your app keeps it.

The [example receiver](../examples/receiver) serves notes and guides with
this embed, if you want to see it working end to end.
