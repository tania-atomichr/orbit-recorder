/* HOW A RECORDING IS WRITTEN UP. A template is the headings a write-up
   has and one line on what goes under each. "Write it up" sends the
   transcript and the template to the writing service you chose
   (providers.js) and gets back the same shape every time (a "reading"):

     { title, short, long,
       sections: [{ heading, points: [..] }],       the template's headings
       ideas:    [{ at, text }],                    suggestions someone raised
       chapters: [{ at, title, gist }],
       qa:       [{ at, by, q, a }],                questions asked, and the answer given
       topics:   [..],
       speakers: [{ label, name }],                 names the recording makes clear
       mood:     { overall, why, voices: [{ label, tone, note }], moments: [{ at, tone, what }] },
       actions:  [{ text, owner, at, done }] }

   Every "at" is seconds from the start. Add your own templates in
   Settings; they are kept with these. */
var Templates = (function () {
  var BUILT_IN = [
    { id: 'meeting', name: 'Meeting', for: ['call'], sections: [
      ['Summary', 'What the meeting was about and where it landed, in two or three sentences.'],
      ['Decisions', 'What was agreed.'],
      ['Open questions', 'What is still undecided or needs an answer.']] },
    { id: 'discovery', name: 'Sales or discovery call', for: ['call'], sections: [
      ['About them', 'Who they are, their team and their situation today.'],
      ['What they need', 'The problem they want solved and why now.'],
      ['Budget and timing', 'Money, deadlines and who decides, only if said.'],
      ['Concerns', 'Objections or doubts they raised.']] },
    { id: 'interview', name: 'Interview', for: ['call'], sections: [
      ['Background', 'Their experience, in the order they told it.'],
      ['Strengths', 'What came across well, with the example they gave.'],
      ['Worth checking', 'Gaps or answers to follow up on. Facts only, no judgement of the person.'],
      ['What they want next', 'Why they are looking and what matters to them.']] },
    { id: 'one-on-one', name: 'One-to-one', for: ['call'], sections: [
      ['How things are going', 'Wins, worries and workload.'],
      ['Feedback', 'Feedback given either way.'],
      ['Goals', 'Goals set or checked.']] },
    { id: 'support', name: 'Customer support call', for: ['call', 'audio'], sections: [
      ['The problem', 'What is not working, in the customer’s words.'],
      ['What was tried', 'Steps taken on the call.'],
      ['Where it stands', 'Solved, or what happens next.']] },
    { id: 'explainer', name: 'Video explainer', for: ['video'], sections: [
      ['Summary', 'What the video shows, in two sentences.'],
      ['Steps', 'The steps shown, in order, one per point.'],
      ['Good to know', 'Tips, warnings or links mentioned.']] },
    { id: 'voice', name: 'Voice note', for: ['audio'], sections: [
      ['Summary', 'The point of the note, in two sentences.'],
      ['Details', 'Everything worth keeping, one per point.']] }
  ];

  function all(custom) {
    var mine = (custom || []).filter(function (t) { return t && t.id && t.name && t.sections && t.sections.length; });
    return BUILT_IN.concat(mine);
  }
  function pick(list, id, kind) {
    return list.filter(function (t) { return t.id === id; })[0] ||
           list.filter(function (t) { return t.for && t.for.indexOf(kind) > -1; })[0] || list[0];
  }
  function mmss(s) {
    s = Math.max(0, Math.round(s || 0));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return (h ? h + ':' + ('0' + m).slice(-2) : ('0' + m).slice(-2)) + ':' + ('0' + (s % 60)).slice(-2);
  }

  /* The transcript as plain lines: [12:30] Ana: what she said */
  function lines(transcript, speakers, trim) {
    var u = ((transcript && transcript.utterances) || []).filter(function (x) { return !trim || (x.end > trim.a && x.start < trim.b); });
    if (!u.length) return (transcript && transcript.text) || '';
    return u.map(function (x) {
      var who = speakers && speakers[x.speaker] ? speakers[x.speaker] : (x.speaker != null && x.speaker !== '' ? 'Speaker ' + (Number(x.speaker) + 1) : '');
      return '[' + mmss(x.start) + '] ' + (who ? who + ': ' : '') + x.text;
    }).join('\n');
  }

  var TONES = ['positive', 'warm', 'neutral', 'mixed', 'hesitant', 'tense', 'negative'];
  function obj(props) { return { type: 'object', additionalProperties: false, required: Object.keys(props), properties: props }; }
  function list(item) { return { type: 'array', items: item }; }
  var STR = { type: 'string' }, AT = { type: 'string', description: 'mm:ss from the start' };
  var SCHEMA = obj({
    title: STR, short: STR, long: STR,
    sections: list(obj({ heading: STR, points: list(STR) })),
    ideas: list(obj({ at: AT, text: STR })),
    chapters: list(obj({ at: AT, title: STR, gist: STR })),
    qa: list(obj({ at: AT, by: STR, q: STR, a: STR })),
    topics: list(STR),
    speakers: list(obj({ label: STR, name: STR })),
    mood: obj({ overall: { type: 'string', enum: TONES }, why: STR,
                voices: list(obj({ label: STR, tone: { type: 'string', enum: TONES }, note: STR })),
                moments: list(obj({ at: AT, tone: { type: 'string', enum: TONES }, what: STR })) }),
    actions: list(obj({ text: STR, owner: STR, at: AT }))
  });

  /* What is sent to the writing service: instructions, and the words. */
  function prompt(t, note, extra) {
    var heads = t.sections.map(function (s) { return '- ' + s[0] + ': ' + s[1]; }).join('\n');
    var system = [
      'You read a recording for the person who made it. It can be a call, a note someone spoke to themselves, or a screen recording walking through something.',
      'You get the transcript, one line per turn as "[mm:ss] Speaker N: words" (labels may be wrong or missing).',
      'Use only what was said; never invent names, numbers or promises. Plain, short sentences in the language of the recording. No filler, no praise, no emoji, no dashes as punctuation.',
      'Return ONE JSON object with these keys:',
      '- "title": what it was about in 3 to 7 words. Sentence case.',
      '- "short": 2 to 4 plain sentences: who and what, what was decided, what is open.',
      '- "long": 3 to 6 short paragraphs covering the whole recording in order, separated by a blank line.',
      '- "sections": exactly these headings, in this order, each with the points that belong there (an empty list when nothing was said):',
      heads,
      '- "ideas": suggestions, insights or proposals someone raised (not facts or decisions already in "short"), 0 to 6, each "at" the moment it was said.',
      '- "chapters": the recording in 3 to 8 parts in order, the first at 00:00; "title" 2 to 5 words, "gist" under 10 words. Under two minutes: one or two.',
      '- "qa": real questions someone asked and the answer given ("" when it went unanswered), most useful first, at most 8. "by" is the speaker label.',
      '- "topics": 3 to 6 short noun phrases.',
      '- "speakers": each "Speaker N" label with a name when the recording makes it clear (people say names, introduce themselves); "" when it does not.',
      '- "mood": how the conversation felt, read only from what was said and how (agreement, enthusiasm, hesitation, pushback, frustration, laughter in the words). "overall" and every "tone" is one of: ' + TONES.join(', ') + '. "why": one sentence naming what made it feel that way. "voices": each speaker who said more than a few words, "note" under 12 words on how they came across. "moments": 0 to 5 points where the feeling clearly changed or peaked, in order, "what" under 12 words. A note someone spoke alone gets "overall" and "why" only, and empty lists. Never guess at feelings the words do not show.',
      '- "actions": things someone agreed or meant to do, with who ("owner", "" when not clear), each "at" the moment it was agreed.',
      'Every "at" is "mm:ss" (or "h:mm:ss") as printed in the transcript.',
      t.instructions ? 'Also: ' + t.instructions : ''
    ].filter(Boolean).join('\n');
    var user = 'Kind of recording: ' + note.kind + (note.where ? ' on ' + note.where : '') + '.\n' +
      (note.html && extra && extra.withNotes ? 'Notes the person typed during it (use them, they know best):\n' + Format.text(note.html) + '\n\n' : '') +
      'Transcript:\n' + lines(note.transcript, note.speakers, note.trim);
    return { system: system, user: user, schema: SCHEMA };
  }

  /* What came back, cleaned: anything missing is empty, every "at" becomes
     seconds, a tone not on the list is dropped, lists are cut to size. */
  function secs(v) {
    if (typeof v === 'number' && isFinite(v)) return Math.max(0, v);
    var p = String(v || '').trim().split(':').map(Number);
    if (!p.length || p.some(isNaN)) return 0;
    return p.reduce(function (a, b) { return a * 60 + b; }, 0);
  }
  function str(v, n) { return String(v == null ? '' : v).trim().slice(0, n || 400); }
  function arr(v, n) { return Array.isArray(v) ? v.slice(0, n || 20) : []; }
  function tone(v) { return TONES.indexOf(v) > -1 ? v : ''; }
  function clean(d, t) {
    d = d || {};
    var m = d.mood || {};
    return {
      template: t ? t.id : '', title: str(d.title, 120), short: str(d.short, 2000), long: str(d.long, 8000),
      sections: arr(d.sections, 12).map(function (s) { return { heading: str(s.heading, 80), points: arr(s.points, 20).map(function (p) { return str(p); }).filter(Boolean) }; }),
      ideas: arr(d.ideas, 6).map(function (x) { return { at: secs(x.at), text: str(x.text) }; }).filter(function (x) { return x.text; }),
      chapters: arr(d.chapters, 8).map(function (x) { return { at: secs(x.at), title: str(x.title, 60), gist: str(x.gist, 120) }; }).filter(function (x) { return x.title; }),
      qa: arr(d.qa, 8).map(function (x) { return { at: secs(x.at), by: str(x.by, 40), q: str(x.q), a: str(x.a) }; }).filter(function (x) { return x.q; }),
      topics: arr(d.topics, 6).map(function (x) { return str(x, 40); }).filter(Boolean),
      speakers: arr(d.speakers, 12).map(function (x) { return { label: str(x.label, 20), name: str(x.name, 60) }; }),
      mood: tone(m.overall) ? { overall: tone(m.overall), why: str(m.why, 300),
        voices: arr(m.voices, 6).map(function (v) { return { label: str(v.label, 20), tone: tone(v.tone), note: str(v.note, 120) }; }).filter(function (v) { return v.tone; }),
        moments: arr(m.moments, 5).map(function (v) { return { at: secs(v.at), tone: tone(v.tone), what: str(v.what, 120) }; }).filter(function (v) { return v.tone; }) } : null,
      actions: arr(d.actions, 20).map(function (x) { return { text: str(x.text), owner: str(x.owner, 60), at: secs(x.at), done: false }; }).filter(function (x) { return x.text; })
    };
  }

  /* A reading as HTML, for exports and the systems that take HTML: the
     short summary, the template's headings, next steps as a checklist,
     ideas, questions asked and chapters (times jump the player). */
  function html(out) {
    function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
    function ts(at) { return '<span class="ts" data-t="' + (+at || 0) + '">' + mmss(at) + '</span> '; }
    var h = '';
    if (out.short) h += '<p>' + esc(out.short) + '</p>';
    (out.sections || []).forEach(function (s) {
      if (!s.points || !s.points.length) return;
      h += '<h2>' + esc(s.heading) + '</h2><ul>' + s.points.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>';
    });
    if (out.actions && out.actions.length) {
      h += '<h2>Next steps</h2><ul data-checks="1">' + out.actions.map(function (a) {
        return '<li data-done="' + (a.done ? 1 : 0) + '">' + esc(a.text) + (a.owner ? ' <em>(' + esc(a.owner) + ')</em>' : '') + '</li>';
      }).join('') + '</ul>';
    }
    if (out.ideas && out.ideas.length) h += '<h2>Ideas</h2><ul>' + out.ideas.map(function (x) { return '<li>' + ts(x.at) + esc(x.text) + '</li>'; }).join('') + '</ul>';
    if (out.qa && out.qa.length) {
      h += '<h2>Questions asked</h2><ul>' + out.qa.map(function (x) {
        return '<li>' + ts(x.at) + '<strong>' + esc(x.q) + '</strong>' + (x.a ? '<br>' + esc(x.a) : '<br><em>Not answered</em>') + '</li>';
      }).join('') + '</ul>';
    }
    if (out.chapters && out.chapters.length) {
      h += '<h2>Chapters</h2><ul>' + out.chapters.map(function (c) { return '<li>' + ts(c.at) + esc(c.title) + (c.gist ? ': ' + esc(c.gist) : '') + '</li>'; }).join('') + '</ul>';
    }
    if (out.topics && out.topics.length) h += '<p><em>Topics: ' + out.topics.map(esc).join(', ') + '</em></p>';
    return h;
  }

  return { all: all, pick: pick, prompt: prompt, clean: clean, secs: secs, html: html, TONES: TONES, lines: lines, mmss: mmss, SCHEMA: SCHEMA };
})();
