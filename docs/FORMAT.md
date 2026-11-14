# The formats

Orbit Recorder sends and downloads two kinds of JSON. Both carry a `format`
field; a change that is not backwards compatible bumps its number
(`orbit-note/2`) and is listed in the [changelog](../CHANGELOG.md).

Times inside a recording (`at`, `start`, `end`, `from`, `to`) are **seconds
from the start of the recording**. Dates are ISO 8601 in UTC.

## `orbit-note/1`

One call, video or voice note. This is the body of a webhook request (with
`X-Orbit-Event: note.finished`), the `item` part of a multipart request, and
the **JSON** download.

```jsonc
{
  "format": "orbit-note/1",
  "id": "nmwgro6ix",
  "kind": "call",                       // call | video | audio
  "title": "Support workflow with Northwind",
  "where": "meet.google.com",           // the site of the call, when there was one
  "contact": "jordan@example.com",      // typed on the note page; used by Teamtailor and HubSpot
  "createdAt": "2026-11-14T17:04:00.000Z",
  "endedAt": "2026-11-14T17:24:00.000Z",
  "seconds": 1200,
  "trim": { "from": 30, "to": 900 },    // null when not trimmed; everything below is cut to it
  "notes": { "html": "<p>…</p>", "markdown": "…" },   // what you typed in "Your notes"
  "summary": { … },                     // the write-up, below; null when there is none
  "talk": [ { "speaker": "Jordan Lee", "seconds": 610, "share": 52 } ],
  "transcript": {
    "language": "en",
    "provider": "deepgram",
    "text": "Thanks for making time…",
    "utterances": [ { "speaker": "Sam Rivera", "start": 0.4, "end": 3.1, "text": "Thanks for making time." } ]
  },
  "media": { "type": "video/webm", "bytes": 4194304, "file": "support-workflow-with-northwind.webm" },  // only when the file is sent
  "html": "<!doctype html>…"            // webhook only: the note as a ready-made web page
}
```

### The write-up (`summary`)

```jsonc
{
  "template": "discovery",                         // the template's id
  "title": "Support workflow with Northwind",
  "short": "Three or four sentences.",
  "long": "The longer version, in paragraphs.",
  "sections": [ { "heading": "What they need", "points": ["Urgent tickets routed first"] } ],
  "ideas":    [ { "at": 488, "text": "Route urgent tickets to the on-call lead" } ],
  "chapters": [ { "at": 0, "title": "How tickets arrive", "gist": "One inbox, sorted by hand" } ],
  "qa":       [ { "at": 125, "by": "Sam Rivera", "q": "How many tickets a day?", "a": "Around two hundred." } ],
  "topics":   ["Ticket routing", "Pricing"],
  "speakers": [ { "label": "0", "name": "Sam Rivera" } ],
  "mood": {
    "overall": "positive",                         // positive | warm | neutral | mixed | hesitant | tense | negative
    "why": "Agreed quickly and asked for pricing.",
    "voices":  [ { "label": "Jordan Lee", "tone": "positive", "note": "Open about the pain" } ],
    "moments": [ { "at": 305, "tone": "hesitant", "what": "Admits urgent tickets wait" } ]
  },
  "actions": [ { "text": "Send a proposal with routing rules", "owner": "Sam Rivera", "at": 854, "done": false } ]
}
```

When a note is trimmed, `ideas`, `chapters`, `qa`, `actions` and
`mood.moments` keep only what falls inside the kept part, and the transcript
keeps only the lines said inside it.

## `step-guide/1`

One guide. Body of a webhook request with `X-Orbit-Event: guide.finished`,
and the **JSON** download. The same format as the standalone
[Step Guide Recorder](https://github.com/tania-atomichr/step-guide-recorder),
with `kind` and `note` added.

```jsonc
{
  "format": "step-guide/1",
  "id": "gmwgro6ixe0qglp",
  "title": "How to: route urgent tickets",
  "intro": "Send urgent tickets straight to the on-call lead.",
  "createdAt": "2026-11-14T16:04:00.000Z",
  "finishedAt": "2026-11-14T16:06:00.000Z",
  "steps": [
    {
      "n": 1,
      "key": "k3",
      "sentence": "Click \"New rule\".",
      "label": "New rule",
      "role": "button",
      "kind": "click",          // start | click | choose | key | dblclick | rightclick | file | back | page | scroll | tab | drag
      "note": "Only admins see this button.",   // the tip typed under the step
      "page": { "title": "Routing rules", "url": "https://helpdesk.example.com/rules" },
      "highlight": { "x": 80.9, "y": 15.8, "w": 14.1, "h": 7.2 },   // the ring, in % of the picture; null for no ring
      "image": { "type": "image/jpeg", "data": "<base64>" },
      "clip": { "type": "image/jpeg", "frames": ["<base64>", "…"] }   // null for a still step
    }
  ]
}
```

`page.url` never has a query string or fragment, and a link that looks like
a private share link has its code cut out (then `page.title` is empty).

## Your own transcript or write-up service

Pick **My own service** in Settings to use any service you run.

**Transcripts.** The recording is `POST`ed as the request body
(`Content-Type: audio/webm` or `video/webm`), with
`Authorization: Bearer <secret>` if you set one. Answer:

```json
{ "language": "en", "utterances": [ { "speaker": "0", "start": 0.4, "end": 3.1, "text": "Thanks for making time." } ] }
```

or just `{ "text": "…" }` when you have no speakers.

**Write-ups.** A JSON body `{ "system", "user", "schema" }` is `POST`ed:
the instructions, the transcript with the template, and the JSON Schema of
the write-up above. Answer with the write-up as JSON. Times may be seconds
or `"mm:ss"`; they are turned into seconds.
