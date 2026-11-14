# Privacy

Orbit Recorder has no server and collects nothing. This page says exactly
what the extension stores and where it can go, so it can also serve as the
privacy policy for a store listing.

## What is stored, and where

Everything is kept in your browser, in the extension's own storage
(IndexedDB for recordings, notes and guides; the extension's settings storage
for settings and keys).

**Recordings** (calls, videos, audio): the sound and picture you chose to
record, saved in five-second pieces while recording so nothing is lost. A
call records the call's tab and your microphone; a video records the tab,
window, screen or part you picked, and your camera if you turned it on.

**Notes**: the title, what you typed, the transcript and the write-up that
your chosen services returned, the questions you asked about a recording,
and the names you gave to voices.

**Guides**, only while you are making one and only on the tabs it follows:

- pictures of the visible part of the page at each step, and for a step that
  sets something moving, a few more over the next two to three seconds;
- what was clicked: the control's name as shown on the page (at most 80
  characters), its kind (button, link, tab...) and where it sits;
- the page's title and address, without the query string or fragment.

**Settings**: your name (to name your voice), your services and their keys,
your templates and the places you send to.

## What is never stored

- **Anything you type while making a guide.** No field's contents are read
  into a guide. Keys pressed are kept only when they do something on their
  own (a shortcut such as Ctrl+V, Enter, Escape).
- **Passwords, one-time codes and card numbers** in guides: those fields are
  painted over before every picture, and no clip picture is taken while a
  field has the cursor or a password field is on screen.
- **Share codes**: an address that looks like a private share link has its
  code cut out, and that page's title is dropped.

**Pictures and recordings show what is on screen.** Names, emails and other
details on the page can appear in them. Use **Cover** in the picture editor,
or **Trim**, before you share.

## Where it can go

Nowhere, unless you choose:

| What | Where | When |
|---|---|---|
| The recording's sound | The transcript service you picked (Deepgram, AssemblyAI, OpenAI or your own) | When a recording ends, or when you press **Try again** on the note |
| The sound, live | Deepgram | Only with **Live words** on, while a call records |
| The transcript, your template, your question | The write-up service you picked (Claude, an OpenAI-compatible service or your own) | When it writes up, answers **Ask**, translates, or rewrites a guide |
| A note or a guide | The places you added under **Where things go** | By itself only if you turned that on for that place; otherwise when you press **Send** |
| A file | Your computer | When you press **Download** |

Each service and place is reached straight from your browser with your own
key. Nothing goes through a server of ours, because there is none. Chrome
asks your permission to reach each address when you add it.

**A trimmed note** sends only the kept part of the recording and only the
words, ideas, chapters, questions and next steps inside it. Until the cut
copy is made, it does not send the file at all.

There are no analytics, no tracking and no third-party scripts.

## Recording other people

The call card reminds you to tell everyone you are recording and ask if it
is fine. Laws on recording calls differ by country and state; following
yours is up to you.

## Deleting

Delete a note or a guide from its page, or many at once from the library.
Copies already sent to another place stay there. Removing the extension
deletes everything it stored.

## Permissions

| Permission | Why |
|---|---|
| `tabCapture`, `desktopCapture`, `offscreen` | Record a call's tab, a window or the screen. |
| `activeTab`, `scripting` | Show the call card, the recording bar and the guide panel on the tab you are on. |
| `storage`, `unlimitedStorage` | Keep recordings, notes, guides and settings in your browser. |
| `alarms` | Try a failed send again later. |
| `identity` | Sign in to Google, only when you add Google Docs. |
| Meet, Zoom and Teams sites | Offer to record when a call opens. |
| Other sites (optional, asked when needed) | Let a guide follow you to other tabs, and reach each service and place you add. You can say no. |
