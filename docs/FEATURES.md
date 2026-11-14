# Every feature, and where it comes from

Orbit Recorder is the open-source version of a private recorder and note
taker (a Chrome extension plus the pages that show its notes). This list was made
by going through that original screen by screen. Each line says what the
feature does here. Anything left out is listed at the end, with why.

## Recording a call (Google Meet, Zoom in the browser, Teams in the browser)

- A card at the top of the call: "Record this meeting?", with a **Video** switch (sound only, or sound and picture) remembered for next time.
- **One press records both sides**: the call's sound from its tab and your microphone, with no share box, when Chrome allows (after the icon was pressed once on that tab).
- Otherwise a small window opens to **pick the call's tab yourself** (Chrome's box, "Also share tab audio").
- The **toolbar icon** or **Alt+Shift+R** on a call starts and stops recording with no window at all.
- The card appears on calls that were already open when the extension was installed or updated, inside Meet's own app window, and above Meet's join screen.
- While recording: a bar with a red dot, the **time**, a level for **You** and one for **Them**, **Pause/Resume** and **Stop**.
- The bar can be **dragged** anywhere (the spot is kept per site) and made **small** (dot, time, Stop).
- A **consent line** for 15 seconds: "Tell everyone on the call: I'm recording this call for my notes, is that OK with you?"
- A warning when **nothing is heard from the call** for 20 seconds, with what to check.
- A warning when **the microphone is off** (only their side is recorded), with a button to allow it.
- You keep hearing the call while it records (a recorded tab goes quiet otherwise).
- A video call keeps its **sound twice**: inside the video, and on its own, so the words survive whatever happens to the picture.
- Saved every **five seconds**: closing the tab, a crash or a lost window keeps everything up to that moment, and it is put back together on the next start.
- **Type notes while it records** (a pencil on the bar): kept with the recording.
- **Live words** while it records (optional, with Deepgram): the last line said shows on the bar.
- At the end: "Saved", with **Open it**; the note opens beside the call and writes itself up.

## Recording a video (like Loom)

- Record **this tab** (no box to pick from, with its sound), **a window**, **the whole screen**, or **part of the screen** (drag a box over the part; the box is remembered).
- **Your face in a round bubble** in the bottom-left corner, drawn into the video itself, mirrored, with a white ring.
- Pick the **camera** and the **microphone** by name; the last choices come back; one press starts a video with them, **Change** opens the setup.
- A slim **recording strip** in the corner: a live preview exactly as the video will look, the time, and **one chip per thing captured** (what is shared, computer sound, your mic, camera), each on or off, with live levels.
- Says **before you start** what happens to the computer's sound (a window records none; the screen needs "Also share system audio").
- Says **while it records** when no computer sound is coming through, and what to do.
- Keeps recording smoothly when the window is behind others (frames are mixed as they arrive, not on the page's timer).
- **Pause**, **Stop**, the toolbar icon (badge REC) or Chrome's **Stop sharing**; closing the window also stops and saves. No time limit.

## Recording audio

- **Just your voice** (a voice note, or a phone call on speaker), or **your voice and the computer's sound** (a call in a desktop app such as Zoom, WhatsApp or Teams).
- The same strip, sound only, with levels.

## Making a step-by-step guide (like Scribe)

- Start on any page: each **click** becomes a numbered step with a **picture taken before the click** and the clicked thing **ringed**.
- The first step is **where it starts** ("Go to example.com").
- Steps also come from **dropdown choices**, **keyboard shortcuts** (Ctrl/Cmd with a key, Enter, Escape, F keys), **double-clicks**, **right-clicks**, **going back**, **drags**, and **switching tabs**; a **scroll** is folded into the next step ("Scroll down and click ...").
- **Fields say what goes in them** from the page's own label or hint, never from what you typed.
- A **step that moves** (a menu opens, the page scrolls, something is dragged) keeps a short **clip**; still steps keep a picture.
- **Typing is never recorded**, **password and card fields are painted out** before every picture, and nothing is taken while a field has the cursor.
- A **panel** on the page: the count, the last three steps, Pause, Undo last step, Finish. It can be dragged, and it is hidden in every picture.
- The guide **follows you across tabs** (if you allow it once), or carries on when you press the icon on a new tab.
- **Chrome's own pages** (Settings, Extensions) can be added as a step with Alt+Shift+S or from the popup.
- Each step gets **a plain sentence** ("Click "Save changes"."); the guide gets a title.

## Editing a guide

- Change the **title**, an **intro**, and each step's **sentence**.
- **Write it for me**: the writing service rewrites the title, intro and every sentence in plain words, with **Undo the rewrite**.
- **Reorder** steps by dragging, or Move up / Move down.
- **Add a step by hand** anywhere, with or without a picture.
- A **typed note under any step**.
- **Tick steps** and delete them together; **Undo** the last change.
- **Picture editor**: **Cover** a part of the picture (for anything private), **redraw the ring**, or **no ring**; Undo.
- Download as **one web page** (pictures and clips inside) or **JSON**.

## The note: a recording's page

- **Rename** it in place.
- **One player** in the same place every time, video or audio, with the length shown even for a recording still being read.
- **Trim**: drag the start and the end; only the kept part plays, is downloaded and is sent anywhere, words included.
- **Clip a moment**: make a short new note from part of a recording.
- **Write-up from a template** (Meeting, Sales or discovery call, Interview, One-to-one, Customer support, Video explainer, Voice note, or your own): it writes itself when the recording is saved, and **Write it up again** keeps your notes.
- The write-up has: **Summary** with **Short / In depth / Q&A**, the template's **sections**, **Ideas** (each at its moment), **Next steps** (to-dos with who and when said, tick them done, edit them), **Chapters**, **Most talked about**, and **Mood** (how it felt overall, each voice's tone, and the moments it turned; read from the words only).
- **Who talked**: one row per voice with how much of the call they talked, the questions they asked (opens into each question at its moment) and their to-dos. Counted from the transcript, never guessed.
- **What they asked**: the questions and the answers given.
- **Ask about this call**: type a question, get an answer from this recording only, with times that jump the player.
- **Transcript** with who said what, every line jumps the player, **find** a word, **name each voice** (and "Is it you?" for the voice that talked most on your recording), **translate to English** with the original one press away.
- **Your notes**: a text editor (headings, bold, italic, lists, checklists, links, quotes, a timestamp that jumps the player), saving as you type.
- **Copy** it as rich text or Markdown.
- **Download** as one web page (with or without the recording inside), Markdown, JSON, or the recording file.
- **Send to** any place you connected, by hand or by itself when saved, with retries and the result on the page ("Sent, open it there").
- **Embed code** for your own site or app.
- **Archive** and **Restore**, or **Delete**.

## Your library

- Every call, video, voice note and guide, newest first, each with a colour and an icon for its kind.
- **Find** by a word in the title, the notes or anything said.
- **Filter** by kind; **Archived** apart.
- **Select** many: archive, restore, send, delete.
- **Upload a recording** made elsewhere: it is transcribed and written up like any other.

## Connecting it to your own system

- Transcription with **your own key**: Deepgram, AssemblyAI, OpenAI Whisper, or your own service.
- Write-ups with **your own key**: Claude (Anthropic), any OpenAI-compatible service (OpenRouter, Ollama, LM Studio...), or your own service.
- Places to send notes and guides: **your own web app or backend** (a webhook, with the recording file if you want), **Notion**, **Google Docs**, **Teamtailor**, **HubSpot**, and anything Zapier or Make can reach through a webhook. More than one at once; each can send by itself or only when you press Send.
- An **embed** (`<orbit-note>`, `<orbit-guide>`) that shows a note or a guide inside any web page from the JSON your backend keeps.
- A small **example backend** that receives notes and guides and shows them with the embed.
- Chrome asks for permission to reach each service only when you turn it on.

## Left out, and why

| In the original | Why it is not here |
|---|---|
| Filing a note under the original app's own records (people, projects, companies), and call types tied to those records | They change records in one specific app. Here, a template shapes the write-up and a connection sends it where you want. |
| Changes the call agreed ("pay range is now ...") applied to records with one tick | Same: there are no records here. They show as next steps. |
| Sharing with "only me, some people, my team, anyone with the link" | There is no server. Share by sending to your own app, Notion or Google Docs, or by downloading the page. |
| Recording from inside the original web app's own pages | The extension covers every page. |
| Signing in to the web app, version check against it | Nothing to sign in to. |
