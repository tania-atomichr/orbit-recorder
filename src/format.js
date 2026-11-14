/* The shapes a finished guide and a finished note have outside this
   extension. Downloads, the embed and every destination get exactly these,
   so whatever you connect reads one documented format (docs/FORMAT.md).

   A GUIDE:

     {
       "format": "step-guide/1",
       "id": "g...", "title": "...", "intro": "...",
       "createdAt": "2026-01-01T10:00:00.000Z", "finishedAt": "...",
       "steps": [{
         "n": 1, "key": "...", "sentence": "Click \"Save\".",
         "label": "Save", "role": "button", "kind": "click", "note": "a tip typed under the step",
         "page": { "title": "...", "url": "https://example.com/path" },
         "highlight": { "x": 12.5, "y": 40, "w": 10, "h": 4 },   // % of the image
         "image": { "type": "image/jpeg", "data": "<base64>" },
         "clip": null   // or { "type": "image/jpeg", "frames": ["<base64>", ...] }
       }]
     }

   Loaded by the background script and by the extension's pages. */
var Format = (function () {
  var FIELDS = ['textbox', 'searchbox', 'combobox', 'textarea', 'input', 'select', 'listbox', 'spinbutton'];
  var HINTS = { email: 'your email', password: 'your password', phone: 'your phone number', name: 'your name',
                search: 'what you are looking for', url: 'the web address', number: 'the number', date: 'the date' };
  var SHORTCUTS = { c: 'copy', v: 'paste', x: 'cut', z: 'undo', s: 'save', a: 'select everything',
                    f: 'search the page', p: 'print', enter: 'send' };

  /* Addresses. A guide's words get copied, pasted and searched, so the
     address a step prints never carries a code that opens a page for
     whoever holds it: a share link, a sign-in link, a document id. The path
     stops before the first piece a person would not read out loud, and the
     page is then called by its kind ("sign-in page"), never by its title. */
  var CHUNK = /^(?:[A-Za-z][a-z]*\d{0,2}|[A-Z]{1,5})$/;            // notes, Notes, FAQ, page2; never eyJhbGci
  var DOORS = ['s', 'r', 'g', 'd', 'magic', 'reset', 'share', 'shares', 'shared', 'token', 'invite', 'auth', 'login',
               'verify', 'confirm', 'unsubscribe', 'key', 'secret'];
  var ALL_CODE = { 'meet.google.com': 'meeting', 'calendly.com': 'booking page', 'zoom.us': 'meeting',
                   'docs.google.com': 'document', 'drive.google.com': 'file' };
  var PEOPLE = ['in', 'pub', 'profile', 'people'];                // linkedin.com/in/<a person>
  var KIND_OF_PAGE = { s: 'shared page', share: 'shared page', shared: 'shared page', shares: 'shared page', r: 'recording page',
                       g: 'guide page', d: 'document', login: 'sign-in page', magic: 'sign-in page', auth: 'sign-in page',
                       reset: 'password page', invite: 'invitation page' };
  function plainPart(part) {
    if (/^\d+$/.test(part)) return part.length <= 8;
    var chunks = part.split(/[-_~]/), last = chunks[chunks.length - 1];
    if (last.indexOf('.') > -1) {
      var dot = last.lastIndexOf('.');
      if (!/^[a-z]{2,5}$/.test(last.slice(dot + 1))) return false;
      chunks[chunks.length - 1] = last.slice(0, dot);
    }
    if (part.length <= 40 && chunks.every(function (c) { return CHUNK.test(c) && c.length <= 15; })) return true;
    return part.length <= 3 && /^[A-Za-z0-9]+$/.test(part);
  }
  function site(host) { host = host.toLowerCase().split(':')[0]; return host.indexOf('www.') === 0 ? host.slice(4) : host; }
  // { url: the address as kept, kind: what to call the page when its path lost something, '' when nothing was cut }
  function cutUrl(url) {
    var u;
    try { u = new URL(String(url || '')); } catch (e) { return { url: '', kind: '' }; }
    if (['http:', 'https:', 'chrome:'].indexOf(u.protocol) < 0 || !u.host) return { url: '', kind: '' };
    var host = u.host, st = site(host), kept = [], kind = '';
    var parts = u.pathname.split('/').filter(Boolean).map(function (p) { try { return decodeURIComponent(p); } catch (e) { return p; } });
    var whole = '';
    Object.keys(ALL_CODE).forEach(function (h) { if (st === h || st.slice(-h.length - 1) === '.' + h) whole = ALL_CODE[h]; });
    var people = st === 'linkedin.com' || /\.linkedin\.com$/.test(st);
    for (var i = 0; i < parts.length; i++) {
      var door = kept.length ? kept[kept.length - 1].toLowerCase() : '';
      if (whole) kind = whole;
      else if (people && PEOPLE.indexOf(door) > -1) kind = 'profile page';
      else if (!plainPart(parts[i]) || DOORS.indexOf(door) > -1) {
        kind = 'page';
        for (var k = 0; k < kept.length; k++) if (KIND_OF_PAGE[kept[k].toLowerCase()]) { kind = KIND_OF_PAGE[kept[k].toLowerCase()]; break; }
      }
      if (kind) break;
      kept.push(parts[i]);
    }
    if (kind) kept = [];                         // "/s" alone says nothing: the site, and the kind of page
    return { url: (u.protocol + '//' + host + kept.map(function (p) { return '/' + p; }).join('')).slice(0, 500), kind: kind };
  }
  function where(url) { return String(url || '').replace(/^https?:\/\//, '').replace(/\/$/, ''); }
  function lead(t) { return /^[A-Z]/.test(t) && !/^.[A-Z]/.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t; }
  function named(m) { return m.page && m.page !== 'page' ? m.page : ''; }

  /* What a step does, before anyone edits it: Click "Save". A step with no
     label says where it is, never "Click here." */
  function does(m) {
    var label = String(m.label || '').trim(), role = String(m.role || '').trim().toLowerCase(), kind = m.kind || '';
    var q = '"' + label + '"', w = where(m.url);
    if (kind === 'start' || kind === 'page') {
      if (w && m.cut) return kind === 'start' && m.page && m.page !== 'page'
        ? 'Open the ' + m.page + ' on "' + w + '", using your own link.' : 'Open the page shown on "' + w + '".';
      return w ? 'Go to "' + w + '".' : 'Open the page shown.';
    }
    if (kind === 'back') return 'Go back to the page before.';
    if (kind === 'key') {
      if (!label) return 'Press the keys shown.';
      var what = label.indexOf('+') > -1 && label.indexOf('Shift') < 0 && label.indexOf('Alt') < 0
        ? SHORTCUTS[label.split('+').pop().toLowerCase()] : null;
      return what ? 'Press ' + q + ' to ' + what + '.' : 'Press ' + q + '.';
    }
    if (kind === 'file') return 'Choose the file to upload.';
    if (kind === 'choose') {
      var chosen = String(m.choice || '').trim();
      if (chosen && label) return 'Choose "' + chosen + '" in ' + q + '.';
      return chosen ? 'Choose "' + chosen + '".' : (label ? 'Choose an option in ' + q + '.' : 'Choose the option shown.');
    }
    if (kind === 'dblclick' || kind === 'rightclick') {
      var verb = kind === 'dblclick' ? 'Double-click' : 'Right-click';
      return label ? verb + ' ' + q + '.' : verb + ' the spot shown.';
    }
    if (FIELDS.indexOf(role) > -1 || m.field) {
      if (!label) return 'Click the field shown.';
      return HINTS[m.hint] ? 'Enter ' + HINTS[m.hint] + ' in the ' + q + ' field.' : 'Click the ' + q + ' field and fill it in.';
    }
    if (role === 'checkbox' || role === 'menuitemcheckbox') return label ? (m.on === false ? 'Untick' : 'Tick') + ' the ' + q + ' checkbox.' : 'Tick the box shown.';
    if (role === 'switch') return label ? 'Turn ' + (m.on === false ? 'off' : 'on') + ' the ' + q + ' switch.' : 'Flip the switch shown.';
    if (['radio', 'option', 'menuitem', 'menuitemradio'].indexOf(role) > -1) return label ? 'Choose ' + q + '.' : 'Choose the option shown.';
    if (role === 'drag') return label ? 'Drag ' + q + '.' : 'Drag the thing shown.';
    if (role === 'tab') return label ? 'Open the ' + q + ' tab.' : 'Open the tab shown.';
    if (role === 'link') return label ? 'Click the ' + q + ' link.' : 'Click the link shown.';
    if (label) return 'Click ' + q + '.';
    if (m.near) return 'Click the icon in the "' + m.near + '" row.';
    if (m.title) return 'Click the spot shown on the "' + m.title + '" page.';
    return named(m) ? 'Click the spot shown on the ' + named(m) + '.' : 'Click the spot shown.';
  }
  /* before: the step before it, so a step on a new page says so. Scrolling
     and switching tabs are not steps of their own: the next step says them. */
  function sentence(meta, before) {
    var m = meta || {}, text = does(m), kind = m.kind || '';
    if (kind === 'start' || kind === 'back' || kind === 'page') return text;
    if (m.scroll && kind !== 'key') text = 'Scroll ' + m.scroll + ' and ' + lead(text);
    if (m.tab) {
      if (m.title) return 'Switch to the "' + m.title + '" tab and ' + lead(text);
      return named(m) ? 'Switch to the tab with the ' + named(m) + ' and ' + lead(text) : 'Switch to the other tab and ' + lead(text);
    }
    var b = before || null;
    if (b && m.title && m.title !== b.title && (b.title || b.page) && text.toLowerCase().indexOf('on the "' + m.title.toLowerCase() + '" page') < 0) {
      text = 'On the "' + m.title + '" page, ' + lead(text);
    } else if (b && named(m) && named(m) !== named(b) && !m.title) {
      text = 'On the ' + named(m) + ', ' + lead(text);       // a private page: its kind, never its title
    }
    return text;
  }

  function title(steps) {
    for (var i = 0; i < steps.length; i++) {
      var t = String((steps[i].meta && steps[i].meta.title) || '').trim();
      if (t) return (/^\s*how to\b/i.test(t) ? t : 'How to: ' + t).slice(0, 200);
    }
    return 'Untitled guide';
  }

  /* The clicked box as percentages of the picture, clipped to it. The
     picture is the visible part of the tab, so the viewport is its size. */
  function highlight(meta) {
    var r = (meta && meta.rect) || {}, v = (meta && meta.viewport) || {};
    if (!(v.w > 0 && v.h > 0 && r.w > 0 && r.h > 0)) return null;
    var left = Math.max(0, r.x), top = Math.max(0, r.y);
    var right = Math.min(v.w, r.x + r.w), bottom = Math.min(v.h, r.y + r.h);
    if (right <= left || bottom <= top) return null;
    var pc = function (n, of) { return Math.round(10000 * n / of) / 100; };
    return { x: pc(left, v.w), y: pc(top, v.h), w: pc(right - left, v.w), h: pc(bottom - top, v.h) };
  }

  function b64(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
    return btoa(bin);
  }
  function bytes(v) { return v instanceof Uint8Array ? v : new Uint8Array(v); }
  function iso(t) { return t ? new Date(t).toISOString() : null; }

  function portable(g, rows) {
    return {
      format: 'step-guide/1',
      id: g.id, title: g.title || title(rows), intro: g.intro || '',
      createdAt: iso(g.began), finishedAt: iso(g.finishedAt),
      steps: rows.map(function (r, i) {
        var m = r.meta || {};
        return {
          n: i + 1, key: m.key || '', sentence: r.sentence || sentence(m, i ? rows[i - 1].meta : null),
          label: m.label || '', role: m.role || '', kind: m.kind || 'click', note: r.note || '',
          page: { title: m.title || '', url: m.url || '' },
          highlight: r.ring === false ? null : (r.ring || highlight(m)),   // the editor can redraw the ring or take it off
          image: r.image ? { type: 'image/jpeg', data: b64(bytes(r.image)) } : null,
          clip: r.clip && r.clip.length > 1 ? { type: 'image/jpeg', frames: r.clip.map(function (f) { return b64(bytes(f)); }) } : null
        };
      })
    };
  }

  /* ---- notes ---- */
  function esc(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function unesc(t) {
    return String(t).replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  }
  /* The editor's HTML as Markdown. Works without a page (the background has
     none), so it reads the few tags the editor makes and drops the rest. */
  function markdown(html) {
    var s = String(html || '');
    s = s.replace(/<br\s*\/?>/gi, '\n');
    s = s.replace(/<span class="ts" data-t="([\d.]+)">[^<]*<\/span>/gi, function (m, t) { return '[' + clock(+t) + ']'; });
    s = s.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n').replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n').replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n');
    s = s.replace(/<blockquote[^>]*>([\s\S]*?)<\/blockquote>/gi, function (m, x) { return '\n> ' + x.replace(/<[^>]+>/g, '').trim() + '\n'; });
    s = s.replace(/<(ul|ol)([^>]*)>([\s\S]*?)<\/\1>/gi, function (m, tag, attrs, inner) {
      var checks = /data-checks/.test(attrs), n = 0;
      return '\n' + inner.replace(/<li([^>]*)>([\s\S]*?)<\/li>/gi, function (m2, la, x) {
        n++;
        var lead = checks ? (/data-done="1"/.test(la) ? '- [x] ' : '- [ ] ') : tag.toLowerCase() === 'ol' ? n + '. ' : '- ';
        return lead + x.replace(/<\/?p[^>]*>/gi, '').trim() + '\n';
      }) + '\n';
    });
    s = s.replace(/<(strong|b)>([\s\S]*?)<\/\1>/gi, '**$2**').replace(/<(em|i)>([\s\S]*?)<\/\1>/gi, '*$2*');
    s = s.replace(/<a [^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)');
    s = s.replace(/<\/(p|div)>/gi, '\n\n').replace(/<[^>]+>/g, '');
    return unesc(s).replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  function text(html) { return markdown(html).replace(/^#+ /gm, '').replace(/\*\*|\*/g, ''); }
  function clock(s) {
    s = Math.max(0, Math.round(s || 0));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return (h ? h + ':' + ('0' + m).slice(-2) : m) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function who(n, sp) {
    if (sp === '' || sp == null) return '';
    return (n.speakers && n.speakers[sp]) || 'Speaker ' + (Number(sp) + 1);
  }
  /* A finished note:

     { "format": "orbit-note/1", "id", "kind": "call" | "video" | "audio",
       "title", "where", "contact" (an email you added, for CRMs), "createdAt", "endedAt", "seconds",
       "trim": { "from", "to" } | null,
       "notes": { "html", "markdown" },
       "summary": { "template", "title", "short", "long", "sections", "ideas", "chapters", "qa",
                    "topics", "speakers", "mood", "actions" } | null,       (templates.js says what each holds)
       "talk": [{ "speaker", "seconds", "share" }],
       "transcript": { "language", "provider", "utterances": [{ "speaker", "start", "end", "text" }], "text" } | null,
       "media": { "type", "bytes", "file" } | null }

     "media" only describes the recording; the file itself travels beside
     the JSON (a multipart upload, or a download next to it). */
  function note(n, mediaBlob) {
    var t = n.transcript, cut = n.trim;
    /* trimmed: only what was kept leaves the browser, the words included */
    var said = t ? (t.utterances || []).filter(function (u) { return !cut || (u.end > cut.a && u.start < cut.b); }) : [];
    return {
      format: 'orbit-note/1', id: n.id, kind: n.kind, title: n.title || '', where: n.where || '', contact: n.contact || '',
      createdAt: iso(n.began), endedAt: iso(n.endedAt), seconds: n.seconds || 0,
      trim: n.trim ? { from: n.trim.a, to: n.trim.b } : null,
      notes: { html: n.html || '', markdown: markdown(n.html || '') },
      summary: n.summary ? keptReading(n.summary, cut) : null,
      talk: talk(n, said),
      transcript: t ? { language: t.language || '', provider: t.provider || '',
                        text: cut && said.length ? said.map(function (u) { return u.text; }).join(' ') : (cut ? '' : t.text || ''),
                        utterances: said.map(function (u) { return { speaker: who(n, u.speaker), start: u.start, end: u.end, text: u.text }; }) } : null,
      media: mediaBlob ? { type: mediaBlob.type, bytes: mediaBlob.size, file: fileName(n, mediaBlob) } : null
    };
  }
  /* trimmed: what the write-up says about the part cut away goes too */
  function keptReading(r, cut) {
    var out = JSON.parse(JSON.stringify(r));
    if (!cut) return out;
    var inside = function (x) { return !x.at || (x.at >= cut.a && x.at <= cut.b); };
    ['ideas', 'chapters', 'qa', 'actions'].forEach(function (k) { out[k] = (out[k] || []).filter(inside); });
    if (out.mood) out.mood.moments = (out.mood.moments || []).filter(inside);
    return out;
  }
  /* Who talked, and how much: [{ speaker, seconds, share }] from the words */
  function talk(n, said) {
    var by = {}, all = 0;
    (said || []).forEach(function (u) {
      var d = Math.max(0, (u.end || 0) - (u.start || 0)), k = who(n, u.speaker) || 'Unknown';
      by[k] = (by[k] || 0) + d; all += d;
    });
    return Object.keys(by).sort(function (a, b) { return by[b] - by[a]; }).map(function (k) {
      return { speaker: k, seconds: Math.round(by[k]), share: all ? Math.round(100 * by[k] / all) : 0 };
    });
  }
  function slug(s) { return String(s || 'note').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'note'; }
  function fileName(n, blob) { return slug(n.title) + (/^video/.test(blob.type) ? '.webm' : '.weba'); }

  return { sentence: sentence, title: title, cutUrl: cutUrl, talk: talk, highlight: highlight, portable: portable, note: note,
           markdown: markdown, text: text, esc: esc, clock: clock, who: who, slug: slug, fileName: fileName };
})();
