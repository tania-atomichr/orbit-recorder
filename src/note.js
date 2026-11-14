/* ONE RECORDING'S PAGE: play it, trim it, read what was said, write your
   notes, ask about it, send it on. It also finishes the work a recording
   needs once it is saved (transcript, then write-up, then sending), so a
   note that was closed half way picks up where it stopped when opened. */
(function () {
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function icon(name) { var i = el('i'); i.innerHTML = Icons.svg(name); return i.firstChild; }
  function chip(name, text, cls) { var c = el('span', 'chip' + (cls ? ' ' + cls : '')); c.appendChild(icon(name)); c.appendChild(el('span', '', text)); return c; }
  function when(t) { return t ? new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''; }
  var clock = Templates.mmss;
  var KIND_ICON = { call: 'phone', video: 'video', audio: 'mic' };

  var id = new URLSearchParams(location.search).get('id') || '';
  var n = null, settings = null, conns = [], media = null, mediaUrl = '', player = null, view = 'short', showOriginal = false;

  function save(fn) { fn(n); return Store.changeNote(id, fn); }

  /* ---- the player: one place, video or sound ---- */
  function seek(t) {
    if (!player) return;
    var at = Math.max(0, +t || 0);
    if (n.trim) at = Math.min(Math.max(at, n.trim.a), n.trim.b);
    player.currentTime = at;
    player.play().catch(function () {});
    if (innerWidth < 1000) player.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('.ts');
    if (t && !t.closest('[contenteditable]')) { e.preventDefault(); seek(t.dataset.t); }
  });
  function ts(at) { var b = el('button', 'ts', clock(at)); b.type = 'button'; b.dataset.t = at; return b; }
  function drawPlayer() {
    var box = $('player');
    box.textContent = '';
    if (!media) { box.appendChild(el('div', 'none', n.ended ? 'No recording file is kept for this note.' : 'Still recording…')); player = null; return; }
    if (!mediaUrl) mediaUrl = URL.createObjectURL(media);
    player = el(/^video/.test(media.type) && n.video !== false ? 'video' : 'audio');
    player.controls = true; player.preload = 'metadata'; player.playsInline = true; player.src = mediaUrl;
    // a browser recording carries no length: ask for the very end once, and it is worked out
    player.addEventListener('loadedmetadata', function () {
      if (player.duration === Infinity || isNaN(player.duration)) {
        player.currentTime = 1e101;
        player.addEventListener('durationchange', function back() { player.removeEventListener('durationchange', back); player.currentTime = n.trim ? n.trim.a : 0; });
      } else if (n.trim) player.currentTime = n.trim.a;
    });
    // only the kept part plays
    player.addEventListener('timeupdate', function () {
      if (n.trim && player.currentTime > n.trim.b) { player.pause(); player.currentTime = n.trim.b; }
      if (n.trim && player.currentTime < n.trim.a - 0.5 && !player.seeking) player.currentTime = n.trim.a;
      follow(player.currentTime);
    });
    box.appendChild(player);
  }
  function length() {
    var d = player && isFinite(player.duration) && player.duration > 0 ? player.duration : 0;
    return d || n.seconds || 0;
  }

  /* ---- the head: title, facts ---- */
  function fit(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }
  $('title').addEventListener('input', function () { fit($('title')); });
  $('title').addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); $('title').blur(); } });
  $('title').addEventListener('change', function () {
    var t = $('title').value.trim() || n.title;
    $('title').value = t; document.title = t;
    save(function (r) { r.title = t; r.named = true; });
  });
  function facts() {
    var f = $('facts');
    f.textContent = '';
    f.appendChild(chip(KIND_ICON[n.kind] || 'mic', Recordings.names[n.kind] || 'Recording', 'accent'));
    if (n.seconds) f.appendChild(chip('clock', n.trim ? clock(n.trim.b - n.trim.a) + ' kept of ' + clock(n.seconds) : clock(n.seconds)));
    f.appendChild(chip('book', when(n.began)));
    if (n.archived) f.appendChild(chip('archive', 'Archived'));
    var box = $('kindbox');
    box.className = 'kind ' + n.kind;
    box.innerHTML = Icons.svg(KIND_ICON[n.kind] || 'mic');
  }

  /* ---- the work a recording needs: transcript, write-up, sending ---- */
  function say(text, cls, iconName) {
    var w = $('work');
    if (!text) { w.hidden = true; return; }
    w.hidden = false; w.className = 'note' + (cls ? ' ' + cls : '');
    w.innerHTML = Icons.svg(iconName || 'clock');
    w.appendChild(el('p', '', text));
    return w.lastChild;
  }
  var working = false;
  function work(force) {
    if (working || !n.ended) return Promise.resolve();
    working = true;
    var s = settings, chain = Promise.resolve();
    if (!n.transcript && s.transcribe.use !== 'none' && (force || !n.work || n.work.state !== 'failed')) {
      chain = chain.then(function () {
        say('Getting the transcript from ' + Providers.transcribe[s.transcribe.use].label + '…');
        return Recordings.audioOf(n).then(function (blob) {
          if (!blob) throw new Error('There is no sound to transcribe.');
          return Providers.doTranscribe(blob);
        }).then(function (t) { return save(function (r) { r.transcript = t; r.work = { state: 'heard' }; }); });
      });
    }
    chain = chain.then(function () {
      if (!n.transcript || n.summary || s.write.use === 'none' || (!s.autoWrite && !force)) return;
      return writeUp(n.template || s.template);
    }).then(function () {
      say('');
      return Outbox.auto('note', id);
    }, function (err) {
      save(function (r) { r.work = { state: 'failed', error: String(err.message || err), at: Date.now() }; });
      var p = say(String(err.message || err) + ' ', 'bad', 'alert');
      var a = el('a', '', 'Try again'); a.href = '#'; a.onclick = function (e) { e.preventDefault(); work(true); };
      p.appendChild(a);
      if (err.off) { p.appendChild(document.createTextNode(' or ')); var o = el('a', '', 'open Settings'); o.href = 'options.html'; p.appendChild(o); }
    }).then(function () { working = false; return reload(); });
    return chain;
  }
  function writeUp(tid) {
    var t = Templates.pick(settings.templates, tid, n.kind);
    say('Writing it up as “' + t.name + '”…', '', 'wand');
    return Providers.doWrite(Templates.prompt(t, n, { withNotes: true })).then(function (out) {
      var r = Templates.clean(out, t);
      return save(function (row) {
        // the notes you typed are never touched; done ticks on next steps that come back the same are kept
        var was = {};
        ((row.summary && row.summary.actions) || []).forEach(function (a) { if (a.done) was[a.text] = true; });
        r.actions.forEach(function (a) { if (was[a.text]) a.done = true; });
        row.summary = r; row.template = t.id; row.work = { state: 'done' };
        if (!row.named && r.title) row.title = r.title;
        // a name the recording made clear, for a voice nobody has named yet
        row.speakers = row.speakers || {};
        r.speakers.forEach(function (sp) {
          var k = String(sp.label).replace(/\D+/g, '');
          if (sp.name && k && row.speakers[+k - 1] == null) row.speakers[+k - 1] = sp.name;
        });
      });
    });
  }

  /* ---- summary: Short, In depth, Q&A; the template's headings ---- */
  $('seg').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    view = b.dataset.v;
    $('seg').querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', x === b); });
    drawSummary();
  });
  function inTrim(at) { return !n.trim || (at >= n.trim.a && at <= n.trim.b); }
  function drawSummary() {
    var r = n.summary, box = $('summary');
    $('summarybox').hidden = !r && !n.transcript;
    box.textContent = '';
    $('sections').textContent = '';
    if (!r) { box.appendChild(el('p', 'muted', settings.write.use === 'none' ? 'Write-ups are off. Turn them on in Settings to get a summary, next steps and more.' : 'Not written up yet.')); return; }
    if (view === 'short') box.appendChild(el('p', '', r.short));
    if (view === 'long') String(r.long || r.short).split(/\n\s*\n/).forEach(function (p) { box.appendChild(el('p', '', p)); });
    if (view === 'qa') {
      var qa = r.qa.filter(function (x) { return inTrim(x.at); });
      if (!qa.length) box.appendChild(el('p', 'muted', 'No real questions were asked.'));
      var list = el('div', 'qa');
      qa.forEach(function (x) {
        var d = el('div'), q = el('b');
        q.appendChild(ts(x.at)); q.appendChild(document.createTextNode(x.q));
        d.appendChild(q);
        d.appendChild(el('span', x.a ? '' : 'muted', x.a || 'Not answered.'));
        if (x.by) d.appendChild(el('span', 'muted small', ' ' + whoLabel(x.by)));
        list.appendChild(d);
      });
      box.appendChild(list);
    }
    if (view !== 'qa') {
      r.sections.forEach(function (s) {
        if (!s.points.length) return;
        var sec = el('div', 'sec'), ul = el('ul');
        sec.appendChild(el('h3', '', s.heading));
        s.points.forEach(function (p) { ul.appendChild(el('li', '', p)); });
        sec.appendChild(ul);
        $('sections').appendChild(sec);
      });
    }
  }
  function drawTemplates() {
    var sel = $('template');
    sel.textContent = '';
    settings.templates.forEach(function (t) {
      var o = el('option', '', t.name); o.value = t.id; sel.appendChild(o);
    });
    sel.value = Templates.pick(settings.templates, n.template || settings.template, n.kind).id;
  }
  $('rewrite').addEventListener('click', function () {
    if (!n.transcript) return work(true);
    $('rewrite').disabled = true;
    writeUp($('template').value).then(function () { say(''); }, function (err) { say(String(err.message || err), 'bad', 'alert'); })
      .then(function () { $('rewrite').disabled = false; return reload(); });
  });

  /* ---- next steps: tick, edit, take out, add ---- */
  function drawTodos() {
    var r = n.summary, list = $('todos');
    var items = r ? r.actions : [];
    $('todobox').hidden = !r;
    list.textContent = '';
    if (!items.length) list.appendChild(el('li', 'muted', 'Nothing to do came up.'));
    items.forEach(function (a, i) {
      if (!inTrim(a.at)) return;
      var li = el('li', a.done ? 'done' : ''), box = el('input');
      box.type = 'checkbox'; box.checked = !!a.done; box.setAttribute('aria-label', 'Done');
      box.onchange = function () { save(function (row) { row.summary.actions[i].done = box.checked; }).then(drawTodos); };
      var mid = el('div'), t = el('span', 't', a.text);
      t.contentEditable = 'true'; t.spellcheck = true;
      t.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); t.blur(); } };
      t.onblur = function () {
        var v = t.textContent.trim();
        if (v && v !== a.text) save(function (row) { row.summary.actions[i].text = v; });
      };
      mid.appendChild(t);
      var who = el('span', 'who');
      if (a.owner) who.appendChild(document.createTextNode(a.owner + ' · '));
      if (a.at) { who.appendChild(document.createTextNode('said at ')); who.appendChild(ts(a.at)); }
      if (who.firstChild) mid.appendChild(who);
      var x = el('button', 'x'); x.type = 'button'; x.title = 'Take it out'; x.innerHTML = Icons.svg('x');
      x.onclick = function () { save(function (row) { row.summary.actions.splice(i, 1); }).then(drawAll); };
      li.appendChild(box); li.appendChild(mid); li.appendChild(x);
      list.appendChild(li);
    });
  }
  $('todoadd').addEventListener('click', function () {
    save(function (row) { row.summary.actions.push({ text: 'New step', owner: '', at: player ? Math.round(player.currentTime) : 0, done: false }); }).then(function () {
      drawTodos();
      var all = $('todos').querySelectorAll('.t'), last = all[all.length - 1];
      if (last) { last.focus(); document.getSelection().selectAllChildren(last); }
    });
  });

  /* ---- who talked: counted from the transcript, never guessed ---- */
  function said() {
    var u = (n.transcript && n.transcript.utterances) || [];
    return u.filter(function (x) { return !n.trim || (x.end > n.trim.a && x.start < n.trim.b); });
  }
  function whoLabel(label) {
    var k = String(label || '').replace(/\D+/g, '');
    return k ? Format.who(n, +k - 1) || label : label;
  }
  function drawTalk() {
    var rows = Format.talk(n, said()), box = $('talk');
    $('talkbox').hidden = rows.length < 1 || !said().some(function (u) { return u.speaker !== '' && u.speaker != null; });
    box.textContent = '';
    box.className = 'talk';
    var r = n.summary || { qa: [], actions: [] };
    rows.forEach(function (row) {
      var d = el('div', 'talkrow'), l = el('div', 'line1');
      l.appendChild(el('span', '', row.speaker));
      l.appendChild(el('span', 'muted', row.share + '% · ' + clock(row.seconds)));
      d.appendChild(l);
      var m = el('div', 'meter'), bar = el('span'); bar.style.width = row.share + '%'; m.appendChild(bar); d.appendChild(m);
      var asked = r.qa.filter(function (q) { return whoLabel(q.by) === row.speaker && inTrim(q.at); });
      var todo = r.actions.filter(function (a) { return a.owner && a.owner.toLowerCase() === row.speaker.toLowerCase(); });
      if (asked.length || todo.length) {
        var det = el('details'), sum = el('summary', '', [asked.length ? asked.length + (asked.length === 1 ? ' question' : ' questions') : '', todo.length ? todo.length + (todo.length === 1 ? ' to-do' : ' to-dos') : ''].filter(Boolean).join(' · '));
        det.appendChild(sum);
        var ul = el('ul');
        asked.forEach(function (q) { var li = el('li'); li.appendChild(ts(q.at)); li.appendChild(document.createTextNode(q.q)); ul.appendChild(li); });
        todo.forEach(function (a) { ul.appendChild(el('li', '', 'To do: ' + a.text)); });
        det.appendChild(ul);
        d.appendChild(det);
      }
      box.appendChild(d);
    });
  }

  /* ---- mood: from the words only ---- */
  var TONE_SAY = { positive: 'Positive', warm: 'Warm', neutral: 'Neutral', mixed: 'Mixed', hesitant: 'Hesitant', tense: 'Tense', negative: 'Negative' };
  function tone(t) { return el('span', 'tone ' + t, TONE_SAY[t] || t); }
  function drawMood() {
    var m = n.summary && n.summary.mood, box = $('mood');
    $('moodbox').hidden = !m;
    box.textContent = '';
    if (!m) return;
    box.className = 'mood';
    var top = el('div', 'bar'); top.appendChild(tone(m.overall)); box.appendChild(top);
    if (m.why) box.appendChild(el('p', '', m.why));
    if (m.voices.length) {
      var ul = el('ul');
      m.voices.forEach(function (v) { var li = el('li', 'bar'); li.appendChild(el('b', '', whoLabel(v.label))); li.appendChild(tone(v.tone)); li.appendChild(el('span', 'muted', v.note)); ul.appendChild(li); });
      box.appendChild(ul);
    }
    var mo = m.moments.filter(function (x) { return inTrim(x.at); });
    if (mo.length) {
      var ul2 = el('ul');
      mo.forEach(function (x) { var li = el('li'); li.appendChild(ts(x.at)); li.appendChild(tone(x.tone)); li.appendChild(document.createTextNode(' ' + x.what)); ul2.appendChild(li); });
      box.appendChild(ul2);
    }
  }

  /* ---- ideas, chapters, most talked about ---- */
  function drawMoments() {
    var r = n.summary;
    var ideas = r ? r.ideas.filter(function (x) { return inTrim(x.at); }) : [];
    var chapters = r ? r.chapters.filter(function (x) { return inTrim(x.at); }) : [];
    $('ideabox').hidden = !ideas.length;
    $('chapterbox').hidden = !chapters.length && !(r && r.topics.length);
    $('ideas').textContent = ''; $('chapters').textContent = ''; $('topics').textContent = '';
    ideas.forEach(function (x) { var li = el('li'); li.appendChild(ts(x.at)); li.appendChild(document.createTextNode(x.text)); $('ideas').appendChild(li); });
    chapters.forEach(function (x) {
      var li = el('li'); li.appendChild(ts(x.at)); li.appendChild(el('b', '', x.title));
      if (x.gist) li.appendChild(el('span', 'gist', ' ' + x.gist));
      $('chapters').appendChild(li);
    });
    if (r && r.topics.length) {
      $('topics').appendChild(el('span', 'muted small', 'Most talked about: '));
      r.topics.forEach(function (t) { $('topics').appendChild(chip('tag', t)); });
    }
  }

  /* ---- the transcript: who said what, find, name each voice, translate ---- */
  var lines = [];
  function drawTranscript() {
    var box = $('transcript'), t = n.transcript, q = $('find').value.trim().toLowerCase();
    box.textContent = ''; lines = [];
    $('trbox').hidden = !t && settings.transcribe.use === 'none' && !n.ended;
    if (!t) { box.appendChild(el('p', 'muted', settings.transcribe.use === 'none' ? 'Transcripts are off. Turn them on in Settings.' : 'No transcript yet.')); $('translate').hidden = true; return; }
    var u = t.utterances || [];
    $('translate').hidden = settings.write.use === 'none' || !u.length || (t.language && /^en/i.test(t.language) && !n.translation);
    $('translate').querySelector('span').textContent = n.translation && !showOriginal ? 'Show the original' : 'In English';
    if (!u.length) { box.appendChild(el('p', '', t.text || '')); return; }
    var tr = n.translation && !showOriginal ? n.translation.lines : null;
    u.forEach(function (x, i) {
      var text = tr && tr[i] ? tr[i] : x.text;
      if (q && text.toLowerCase().indexOf(q) < 0 && Format.who(n, x.speaker).toLowerCase().indexOf(q) < 0) return;
      var row = el('div', 'u' + (n.trim && (x.end <= n.trim.a || x.start >= n.trim.b) ? ' out' : ''));
      row.appendChild(ts(x.start));
      var body = el('div');
      if (x.speaker !== '' && x.speaker != null) {
        var who = el('button', 'who', Format.who(n, x.speaker)); who.type = 'button'; who.title = 'Name this voice';
        who.onclick = function () { nameVoice(x.speaker); };
        body.appendChild(who); body.appendChild(document.createTextNode(' '));
      }
      var words = el('span');
      if (q) {
        var at = text.toLowerCase().indexOf(q);
        if (at > -1) { words.appendChild(document.createTextNode(text.slice(0, at))); words.appendChild(el('mark', '', text.slice(at, at + q.length))); words.appendChild(document.createTextNode(text.slice(at + q.length))); }
        else words.textContent = text;
      } else words.textContent = text;
      body.appendChild(words);
      if (tr && tr[i] && tr[i] !== x.text) body.appendChild(el('span', 'orig', x.text));
      row.appendChild(body);
      lines.push({ row: row, a: x.start, b: x.end });
      box.appendChild(row);
    });
    if (!box.firstChild) box.appendChild(el('p', 'muted', 'No line has “' + q + '”.'));
    itsYou();
  }
  var lastNow = null;
  function follow(t) {
    var hit = null;
    for (var i = 0; i < lines.length; i++) if (t >= lines[i].a && t < lines[i].b + 0.3) { hit = lines[i]; break; }
    if (hit === lastNow) return;
    if (lastNow) lastNow.row.classList.remove('now');
    lastNow = hit;
    if (hit) hit.row.classList.add('now');
  }
  $('find').addEventListener('input', drawTranscript);
  $('translate').addEventListener('click', function () {
    if (n.translation) { showOriginal = !showOriginal; return drawTranscript(); }
    var b = $('translate'); b.disabled = true; b.querySelector('span').textContent = 'Translating…';
    Providers.translate(n.transcript.utterances, 'English').then(function (out) {
      showOriginal = false;
      return save(function (r) { r.translation = { lang: 'English', lines: out }; });
    }).catch(function (err) { say(String(err.message || err), 'bad', 'alert'); }).then(function () { b.disabled = false; drawTranscript(); });
  });
  function nameVoice(sp) {
    var now = Format.who(n, sp);
    ask('Name this voice', 'Every line from ' + now + ' will show this name, here and in what you send.', now, function (v) {
      save(function (r) { r.speakers = r.speakers || {}; if (v) r.speakers[sp] = v; else delete r.speakers[sp]; }).then(drawAll);
    }, 'Clear the name');
  }
  // on your own recording, the voice that talked most is most likely you
  function itsYou() {
    var box = $('itsyou'), rows = said();
    box.hidden = true;
    if (n.kind === 'call' || n.youAsked || !rows.length) return;
    var by = {};
    rows.forEach(function (u) { if (u.speaker !== '' && u.speaker != null) by[u.speaker] = (by[u.speaker] || 0) + (u.end - u.start); });
    var top = Object.keys(by).sort(function (a, b) { return by[b] - by[a]; })[0];
    if (top == null || (n.speakers && n.speakers[top])) return;
    box.hidden = false; box.textContent = '';
    box.innerHTML = Icons.svg('users');
    var p = el('p', '', 'Is ' + Format.who(n, top) + ' you? ');
    var yes = el('a', '', 'Yes, that is me'); yes.href = '#';
    yes.onclick = function (e) {
      e.preventDefault();
      chrome.storage.local.get(['myName']).then(function (s) {
        save(function (r) { r.speakers = r.speakers || {}; r.speakers[top] = s.myName || 'Me'; r.youAsked = true; }).then(drawAll);
      });
    };
    var no = el('a', '', 'No'); no.href = '#';
    no.onclick = function (e) { e.preventDefault(); save(function (r) { r.youAsked = true; }); box.hidden = true; };
    p.appendChild(yes); p.appendChild(document.createTextNode(' · ')); p.appendChild(no);
    box.appendChild(p);
  }

  /* ---- your notes: a small editor that saves as you type ---- */
  var ed = $('editor'), saving = null;
  function keepNotes() {
    clearTimeout(saving);
    $('saved').textContent = 'Saving…';
    saving = setTimeout(function () {
      var html = clean(ed.innerHTML);
      save(function (r) { r.html = html; }).then(function () { $('saved').textContent = 'Saved'; });
    }, 600);
  }
  // only the few tags the editor makes are kept: pasted pages bring their own styles otherwise
  function clean(html) {
    var box = document.createElement('div');
    box.innerHTML = html;
    var KEEP = { P: 1, BR: 1, H2: 1, H3: 1, B: 1, STRONG: 1, I: 1, EM: 1, UL: 1, OL: 1, LI: 1, A: 1, BLOCKQUOTE: 1, SPAN: 1, DIV: 1 };
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 8) return c.remove();
        if (c.nodeType !== 1) return;
        if (!KEEP[c.tagName]) { walk(c); while (c.firstChild) c.parentNode.insertBefore(c.firstChild, c); c.remove(); return; }
        var keep = {};
        if (c.tagName === 'A' && /^https?:/i.test(c.getAttribute('href') || '')) keep.href = c.getAttribute('href');
        if (c.tagName === 'SPAN' && c.classList.contains('ts')) { keep['class'] = 'ts'; keep['data-t'] = String(+c.dataset.t || 0); }
        if (c.tagName === 'UL' && c.hasAttribute('data-checks')) keep['data-checks'] = '1';
        if (c.tagName === 'LI' && c.hasAttribute('data-done')) keep['data-done'] = c.getAttribute('data-done') === '1' ? '1' : '0';
        Array.prototype.slice.call(c.attributes).forEach(function (a) { c.removeAttribute(a.name); });
        Object.keys(keep).forEach(function (k) { c.setAttribute(k, keep[k]); });
        if (c.tagName === 'SPAN' && !keep['class']) { walk(c); while (c.firstChild) c.parentNode.insertBefore(c.firstChild, c); c.remove(); return; }
        walk(c);
      });
    })(box);
    return box.innerHTML;
  }
  ed.addEventListener('input', keepNotes);
  ed.addEventListener('paste', function (e) {
    var html = e.clipboardData.getData('text/html');
    if (!html) return;
    e.preventDefault();
    document.execCommand('insertHTML', false, clean(html));
  });
  // a box in a checklist ticks; a time in the notes jumps the player
  ed.addEventListener('mousedown', function (e) {
    var li = e.target.closest('ul[data-checks] > li');
    if (li && e.clientX - li.getBoundingClientRect().left < 22) {
      e.preventDefault();
      li.setAttribute('data-done', li.getAttribute('data-done') === '1' ? '0' : '1');
      keepNotes();
      return;
    }
    var t = e.target.closest('.ts');
    if (t) { e.preventDefault(); seek(t.dataset.t); }
  });
  $('tools').addEventListener('mousedown', function (e) { e.preventDefault(); });   // keep the cursor in the notes
  $('tools').addEventListener('click', function (e) {
    var b = e.target.closest('button');
    if (!b) return;
    ed.focus();
    var d = b.dataset.do;
    if (d === 'h2') document.execCommand('formatBlock', false, document.queryCommandValue('formatBlock') === 'h2' ? 'p' : 'h2');
    if (d === 'bold' || d === 'italic') document.execCommand(d);
    if (d === 'ul') document.execCommand('insertUnorderedList');
    if (d === 'ol') document.execCommand('insertOrderedList');
    if (d === 'quote') document.execCommand('formatBlock', false, 'blockquote');
    if (d === 'check') {
      document.execCommand('insertUnorderedList');
      var sel = getSelection(), node = sel.anchorNode && (sel.anchorNode.nodeType === 1 ? sel.anchorNode : sel.anchorNode.parentNode);
      var ul = node && node.closest('ul');
      if (ul) { ul.setAttribute('data-checks', '1'); ul.querySelectorAll('li').forEach(function (li) { if (!li.hasAttribute('data-done')) li.setAttribute('data-done', '0'); }); }
    }
    if (d === 'link') {
      var text = String(getSelection());
      ask('Add a link', text ? 'The words “' + text.slice(0, 60) + '” will open it.' : 'The address shows as the link.', 'https://', function (v) {
        if (!/^https?:\/\/\S+$/.test(v)) return;
        ed.focus();
        if (text) document.execCommand('createLink', false, v); else document.execCommand('insertHTML', false, '<a href="' + v.replace(/"/g, '%22') + '">' + Format.esc(v) + '</a>');
        keepNotes();
      }, null, keepRange());
      return;
    }
    if (d === 'time') {
      var at = player ? Math.round(player.currentTime) : 0;
      document.execCommand('insertHTML', false, '<span class="ts" data-t="' + at + '" contenteditable="false">' + clock(at) + '</span>&nbsp;');
    }
    keepNotes();
  });
  function keepRange() { var s = getSelection(); return s.rangeCount ? s.getRangeAt(0).cloneRange() : null; }

  /* ---- a small box that asks for one thing ---- */
  function ask(head, help, value, done, clearLabel, range) {
    var d = $('dialog'), box = $('dialogin');
    box.textContent = '';
    box.appendChild(el('h2', '', head));
    if (help) box.appendChild(el('p', 'muted', help));
    var input = el('input'); input.value = value || ''; input.className = 'big';
    input.style.cssText = 'width:100%;border:1px solid var(--line);border-radius:10px;padding:11px 12px';
    box.appendChild(input);
    var bar = el('div', 'bar'), ok = el('button', 'pill accent', 'Save'), no = el('button', 'pill line', 'Cancel');
    ok.type = no.type = 'button';
    if (clearLabel) { var c = el('button', 'pill danger', clearLabel); c.type = 'button'; c.onclick = function () { d.close(); done(''); }; bar.appendChild(c); }
    bar.appendChild(el('span', 'grow'));
    bar.appendChild(no); bar.appendChild(ok);
    box.appendChild(bar);
    function go() { d.close(); if (range) { var s = getSelection(); s.removeAllRanges(); s.addRange(range); } done(input.value.trim()); }
    ok.onclick = go; no.onclick = function () { d.close(); };
    input.onkeydown = function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } };
    d.showModal(); input.focus(); input.select();
  }
  function show(head, nodes) {
    var d = $('dialog'), box = $('dialogin');
    box.textContent = '';
    box.appendChild(el('h2', '', head));
    nodes.forEach(function (x) { box.appendChild(x); });
    var bar = el('div', 'bar'), close = el('button', 'pill line', 'Close'); close.type = 'button'; close.onclick = function () { d.close(); };
    bar.appendChild(el('span', 'grow')); bar.appendChild(close); box.appendChild(bar);
    d.showModal();
  }

  /* ---- menus: Send, Download, Copy, more ---- */
  function menu(boxId, items) {
    var box = $(boxId), old = box.querySelector('.list');
    if (old) { old.remove(); return; }
    document.querySelectorAll('.menu > .list').forEach(function (l) { l.remove(); });
    var list = el('div', 'list' + (box.getBoundingClientRect().left > innerWidth / 2 ? ' right' : ''));
    items.forEach(function (it) {
      if (it.href) { var a = el('a'); a.href = it.href; fill(a, it); list.appendChild(a); return; }
      var b = el('button'); b.type = 'button'; fill(b, it);
      b.onclick = function () { list.remove(); it.run(); };
      list.appendChild(b);
    });
    box.appendChild(list);
    function fill(n2, it) {
      var ic = el('span', 'ic'); ic.innerHTML = Icons.svg(it.icon); n2.appendChild(ic);
      var t = el('span', '', it.label); if (it.help) t.appendChild(el('small', '', it.help)); n2.appendChild(t);
    }
  }
  document.addEventListener('click', function (e) { if (!e.target.closest('.menu')) document.querySelectorAll('.menu > .list').forEach(function (l) { l.remove(); }); });

  function portable(withMedia) {
    return (withMedia ? keptMedia() : Promise.resolve(null)).then(function (blob) { return { data: Format.note(n, blob), blob: blob }; });
  }
  // the recording as it may leave the browser: the kept part when trimmed
  function keptMedia() {
    if (!n.trim) return Promise.resolve(media);
    if (n.cut) return Store.media(n.cut);
    return makeCut().then(function () { return Store.media(n.cut); });
  }
  var KIND_SAY = { call: 'Calls', video: 'Videos', audio: 'Voice notes' };
  $('send').addEventListener('click', function () {
    var mine = conns.filter(function (c) { return c.what.indexOf(n.kind) > -1; });
    if (!mine.length) {
      return menu('sendmenu', [{ icon: 'plug', label: 'Connect a place first', help: 'Your app, Notion, Google Docs, Teamtailor, HubSpot…', href: 'options.html#connections' }]);
    }
    menu('sendmenu', mine.map(function (c) {
      var s = (n.sent || {})[c.id];
      return { icon: 'send', label: c.name, help: s && s.state === 'sent' ? 'Sent ' + when(s.at) + ', send again' : Destinations[c.kind].label,
               run: function () { sendTo(c); } };
    }));
  });
  function sendTo(c) {
    var go = function () { return Outbox.send('note', id, c.id).then(reload); };
    // a trimmed recording sends its cut copy only: it is made first
    if (n.trim && !n.cut && c.media && Destinations[c.kind].media) return makeCut().then(go);
    (n.sent = n.sent || {})[c.id] = { state: 'sending', at: Date.now() };
    drawSent();
    go();
  }
  function drawSent() {
    var box = $('sentlist');
    box.textContent = '';
    conns.forEach(function (c) {
      var s = (n.sent || {})[c.id];
      if (!s) return;
      var cls = s.state === 'sent' ? 'good' : s.state === 'sending' ? '' : 'bad';
      var row = el('div', 'note sent ' + cls);
      row.innerHTML = Icons.svg(s.state === 'sent' ? 'check' : s.state === 'sending' ? 'send' : 'alert');
      var p = el('p', 'what');
      if (s.state === 'sent') {
        p.textContent = 'Sent to ' + c.name + ' ' + when(s.at) + '. ';
        if (s.url) { var a = el('a', '', 'Open it there'); a.href = s.url; a.target = '_blank'; a.rel = 'noopener'; p.appendChild(a); }
      } else if (s.state === 'sending') p.textContent = 'Sending to ' + c.name + '…';
      else if (s.state === 'waiting') p.textContent = 'Not sent to ' + c.name + ' yet: ' + s.error + ' Tried again by itself around ' + new Date(s.next).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '.';
      else {
        p.textContent = 'Not sent to ' + c.name + ': ' + s.error + ' ';
        var t = el('a', '', 'Try again'); t.href = '#'; t.onclick = function (e) { e.preventDefault(); sendTo(c); }; p.appendChild(t);
      }
      row.appendChild(p);
      box.appendChild(row);
    });
    // the CRMs need to know who the note is about
    $('contactbox').hidden = !conns.some(function (c) { return (c.kind === 'teamtailor' || c.kind === 'hubspot') && c.what.indexOf(n.kind) > -1; });
  }
  $('contact').addEventListener('change', function () { var v = $('contact').value.trim(); save(function (r) { r.contact = v; }); });

  $('dl').addEventListener('click', function () {
    var items = [
      { icon: 'globe', label: 'One web page', help: 'Notes, summary and transcript' + (media ? ', with the recording inside' : ''), run: function () { portable(!!media).then(function (p) { return Export.downloadNoteHtml(p.data, p.blob); }); } },
      { icon: 'book', label: 'Markdown', help: 'For Obsidian, GitHub, any notes app', run: function () { portable(false).then(function (p) { Export.downloadNoteMarkdown(p.data); }); } },
      { icon: 'code', label: 'JSON', help: 'The orbit-note/1 format your own app reads', run: function () { portable(false).then(function (p) { Export.downloadNoteJson(p.data); }); } }
    ];
    if (media) {
      items.splice(1, 0, { icon: 'globe', label: 'One web page, no recording', help: 'Small: words only', run: function () { portable(false).then(function (p) { return Export.downloadNoteHtml(p.data, null); }); } });
      items.push({ icon: n.video ? 'video' : 'mic', label: 'The recording file', help: n.trim ? 'Only the kept part (WebM)' : 'WebM', run: function () {
        keptMedia().then(function (b) { if (b) Export.downloadBlob(Format.fileName(n, b), b); });
      } });
    }
    menu('dlmenu', items);
  });
  $('copy').addEventListener('click', function () {
    menu('copymenu', [
      { icon: 'copy', label: 'As rich text', help: 'Paste into Docs, Gmail, Notion, Slack', run: function () {
        portable(false).then(function (p) {
          var html = (Export.summaryHtml(p.data) || '') + (p.data.notes.html ? '<h2>Notes</h2>' + p.data.notes.html : '');
          var md = Export.noteMarkdown(p.data);
          return navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob(['<h1>' + Format.esc(n.title) + '</h1>' + html], { type: 'text/html' }), 'text/plain': new Blob([md], { type: 'text/plain' }) })]);
        }).then(function () { flash('Copied'); }, function () { flash('Chrome did not allow copying'); });
      } },
      { icon: 'book', label: 'As Markdown', run: function () {
        portable(false).then(function (p) { return navigator.clipboard.writeText(Export.noteMarkdown(p.data)); }).then(function () { flash('Copied'); });
      } }
    ]);
  });
  function flash(text) { $('saved').textContent = text; setTimeout(function () { $('saved').textContent = ''; }, 2500); }
  $('embed').addEventListener('click', function () {
    var code = '<script src="https://cdn.jsdelivr.net/gh/<you>/orbit-recorder@main/embed/orbit-embed.js"></script>\n' +
               '<orbit-note src="https://your-app.example.com/notes/' + id + '.json"></orbit-note>';
    var pre = el('pre', '', code), copy = el('button', 'pill small accent', 'Copy the code'); copy.type = 'button';
    copy.onclick = function () { navigator.clipboard.writeText(code).then(function () { copy.textContent = 'Copied'; }); };
    show('Show this note in your own page', [
      el('p', '', 'Send the note to your own app (a webhook connection). Your app keeps the JSON it gets, and any page can show it with these two lines:'),
      pre, copy,
      el('p', 'muted', 'The embed shows the player, summary, next steps, notes and transcript, in your page’s fonts. docs/EMBED.md has the options.')
    ]);
  });
  $('more').addEventListener('click', function () {
    menu('moremenu', [
      n.archived ? { icon: 'restore', label: 'Restore', help: 'Back in the library', run: function () { save(function (r) { r.archived = false; }).then(reload); } }
                 : { icon: 'archive', label: 'Archive', help: 'Out of the way, kept', run: function () { save(function (r) { r.archived = true; }).then(reload); } },
      { icon: 'trash', label: 'Delete', help: 'The recording, notes and transcript', run: function () {
        if (!confirm('Delete this recording, its notes and its transcript from this browser? This cannot be undone. Copies already sent elsewhere stay there.')) return;
        Store.forgetNote(id).then(function () { location.href = 'library.html'; });
      } }
    ]);
  });

  /* ---- trim, and a new note from part of this one ---- */
  var ta = 0, tb = 0;
  $('trimbtn').addEventListener('click', function () {
    var box = $('trim');
    box.hidden = !box.hidden;
    if (box.hidden) return;
    var len = length();
    ta = n.trim ? n.trim.a : 0; tb = n.trim ? n.trim.b : len;
    drawTrim();
  });
  function drawTrim() {
    var len = length() || 1;
    $('kept').style.left = (100 * ta / len) + '%'; $('kept').style.width = (100 * (tb - ta) / len) + '%';
    $('ha').style.left = (100 * ta / len) + '%'; $('hb').style.left = (100 * tb / len) + '%';
    $('trimsay').textContent = 'Keep ' + clock(ta) + ' to ' + clock(tb) + ' (' + clock(tb - ta) + ')';
  }
  ['ha', 'hb'].forEach(function (h) {
    var handle = $(h);
    handle.addEventListener('pointerdown', function (e) {
      e.preventDefault(); handle.setPointerCapture(e.pointerId);
      function move(ev) {
        var r = $('track').getBoundingClientRect(), len = length();
        var at = Math.max(0, Math.min(len, len * (ev.clientX - r.left) / r.width));
        if (h === 'ha') ta = Math.min(at, tb - 1); else tb = Math.max(at, ta + 1);
        drawTrim();
        if (player) player.currentTime = h === 'ha' ? ta : tb;
      }
      function up() { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); }
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up);
    });
    handle.addEventListener('keydown', function (e) {
      var step = e.shiftKey ? 10 : 1, len = length();
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault();
      var d = e.key === 'ArrowLeft' ? -step : step;
      if (h === 'ha') ta = Math.max(0, Math.min(ta + d, tb - 1)); else tb = Math.min(len, Math.max(tb + d, ta + 1));
      drawTrim();
    });
  });
  $('trimclear').addEventListener('click', function () {
    var old = n.cut;
    save(function (r) { r.trim = null; r.cut = ''; }).then(function () { return old ? Store.dropMedia(old) : null; }).then(function () { $('trim').hidden = true; reload(); });
  });
  $('trimsave').addEventListener('click', function () {
    var len = length(), a = Math.round(ta * 10) / 10, b = Math.round(tb * 10) / 10;
    if (a <= 0.5 && b >= len - 0.5) return $('trimclear').click();
    var old = n.cut;
    save(function (r) { r.trim = { a: a, b: b }; r.cut = ''; }).then(function () { return old ? Store.dropMedia(old) : null; }).then(function () {
      $('trim').hidden = true; reload();
      // only the kept part may leave the browser: its copy is made now, while the page is open
      if (media) makeCut();
    });
  });
  var cutting = null;
  function cutSay(left) {
    var c = $('cutnote');
    c.hidden = false; c.className = 'note';
    c.innerHTML = Icons.svg('cut');
    c.appendChild(el('p', '', 'Making the trimmed copy (only this part is ever sent or downloaded): ' + clock(left) + ' left. Keep this page open.'));
  }
  function makeCut() {
    if (cutting) return cutting;
    if (!n.trim || !media) return Promise.resolve();
    var trim = n.trim;
    cutSay(trim.b - trim.a);
    cutting = Cut.copy(media, trim.a, trim.b, cutSay).then(function (blob) {
      var key = id + '-cut';
      return Store.putMedia(key, blob).then(function () { return save(function (r) { if (r.trim && r.trim.a === trim.a && r.trim.b === trim.b) r.cut = key; }); });
    }).then(function () { $('cutnote').hidden = true; }, function (err) {
      var c = $('cutnote'); c.className = 'note bad'; c.innerHTML = Icons.svg('alert'); c.appendChild(el('p', '', 'The trimmed copy could not be made: ' + (err.message || err)));
    }).then(function () { cutting = null; Outbox.retryWaiting(); });
    return cutting;
  }
  $('clipmake').addEventListener('click', function () {
    if (!media) return;
    var a = ta, b = tb, b2 = $('clipmake');
    b2.disabled = true;
    cutSay(b - a);
    Cut.copy(media, a, b, cutSay).then(function (blob) {
      var nid = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      var u = ((n.transcript && n.transcript.utterances) || []).filter(function (x) { return x.end > a && x.start < b; })
        .map(function (x) { return { speaker: x.speaker, start: Math.max(0, x.start - a), end: x.end - a, text: x.text }; });
      var row = { id: nid, kind: n.kind, where: n.where, title: 'Part of ' + n.title + ' (' + clock(a) + ' to ' + clock(b) + ')', named: true,
                  began: Date.now(), ended: true, endedAt: Date.now(), seconds: Math.round(b - a), mime: blob.type, video: n.video,
                  media: nid + '-main', sound: '', html: '', sent: {}, speakers: n.speakers || {}, from: id,
                  transcript: n.transcript ? { utterances: u, text: u.map(function (x) { return x.text; }).join(' '), language: n.transcript.language, provider: n.transcript.provider } : null,
                  work: { state: 'heard' } };
      return Store.putMedia(row.media, blob).then(function () { return Store.putNote(row); }).then(function () { location.href = 'note.html?id=' + nid; });
    }, function (err) { var c = $('cutnote'); c.className = 'note bad'; c.innerHTML = Icons.svg('alert'); c.appendChild(el('p', '', 'The part could not be copied: ' + (err.message || err))); })
      .then(function () { b2.disabled = false; });
  });

  /* ---- ask about this recording ---- */
  $('askform').addEventListener('submit', function (e) {
    e.preventDefault();
    var q = $('askq').value.trim();
    if (!q) return;
    if (!n.transcript) return drawAnswers('There is no transcript to ask about yet.');
    if (settings.write.use === 'none') return drawAnswers('Asking needs a writing service. Turn one on in Settings.');
    $('askq').value = ''; $('askq').disabled = true;
    drawAnswers(null, { q: q, answer: 'Reading the transcript…', moments: [] });
    Providers.ask(n, q).then(function (out) {
      return save(function (r) { (r.asked = r.asked || []).unshift({ q: q, answer: out.answer, moments: out.moments, at: Date.now() }); r.asked = r.asked.slice(0, 20); });
    }).catch(function (err) { drawAnswers(String(err.message || err)); }).then(function () { $('askq').disabled = false; drawAnswers(); });
  });
  function drawAnswers(error, pending) {
    var box = $('answers');
    box.textContent = '';
    if (error) box.appendChild(el('p', 'note bad', error));
    (pending ? [pending] : []).concat(n.asked || []).forEach(function (x) {
      var d = el('div', 'answer');
      d.appendChild(el('b', '', x.q));
      d.appendChild(el('span', '', x.answer));
      if (x.moments && x.moments.length) { var m = el('div', 'bar'); m.style.marginTop = '6px'; x.moments.forEach(function (t) { m.appendChild(ts(t)); }); d.appendChild(m); }
      box.appendChild(d);
    });
  }

  /* ---- drawing it all ---- */
  function drawAll() {
    document.title = n.title;
    if (document.activeElement !== $('title')) { $('title').value = n.title; fit($('title')); }
    facts();
    drawSummary(); drawTodos(); drawTalk(); drawMood(); drawMoments(); drawTranscript(); drawSent(); drawAnswers();
    if (document.activeElement !== ed && ed.innerHTML !== (n.html || '')) ed.innerHTML = n.html || '';
    if (document.activeElement !== $('contact')) $('contact').value = n.contact || '';
    if (n.work && n.work.state === 'failed' && !working) {
      var p = say(n.work.error + ' ', 'bad', 'alert');
      var a = el('a', '', 'Try again'); a.href = '#'; a.onclick = function (e) { e.preventDefault(); work(true); }; p.appendChild(a);
    }
  }
  function reload() {
    return Promise.all([Store.note(id), Connections.all()]).then(function (r) {
      n = r[0]; conns = r[1];
      if (!n) { $('page').hidden = true; $('missing').hidden = false; return; }
      drawAll();
    });
  }
  function load() {
    return Promise.all([Store.note(id), Providers.read(), Connections.all()]).then(function (r) {
      n = r[0]; settings = r[1]; conns = r[2];
      if (!n) { $('page').hidden = true; $('missing').hidden = false; return; }
      $('page').hidden = false;
      drawTemplates();
      return Store.media(n.media || n.sound).then(function (b) {
        media = b; drawPlayer(); drawAll();
        if (n.trim && !n.cut && media) makeCut();
        return work(false);
      });
    });
  }
  // a send finishing in the background, or the recording ending, shows here
  chrome.storage.onChanged.addListener(function (c) { if (c.connections) reload(); });
  setInterval(function () {
    if (!n) return;
    var busy = !n.ended || Object.keys(n.sent || {}).some(function (k) { return /sending|waiting/.test(n.sent[k].state); });
    if (busy) Store.note(id).then(function (now) {
      if (!now) return;
      var ended = !n.ended && now.ended;
      n = now;
      if (ended) return load(); else drawSent();
    });
  }, 4000);
  load();
})();
