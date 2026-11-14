/* ONE GUIDE: fix its words, rewrite it in one press, reorder, add and
   take out steps, cover private parts of a picture, download it, send it. */
(function () {
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function chip(icon, text, cls) { var c = el('span', 'chip' + (cls ? ' ' + cls : '')); c.innerHTML = Icons.svg(icon); c.appendChild(el('span', '', text)); return c; }
  function tool(icon, text, title) { var b = el('button', 'tool'); b.type = 'button'; b.innerHTML = Icons.svg(icon); if (text) b.appendChild(el('span', '', text)); if (title) b.title = title; return b; }
  function when(t) { return t ? new Date(t).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : ''; }
  function host(url) { try { return new URL(url).host; } catch (e) { return url || ''; } }

  var id = new URLSearchParams(location.search).get('id') || '';
  var g = null, rows = [], urls = [], conns = [], settings = null, picked = {};

  function fit(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }
  document.addEventListener('input', function (e) { if (e.target.tagName === 'TEXTAREA') fit(e.target); });
  addEventListener('resize', function () { document.querySelectorAll('textarea').forEach(fit); });
  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'TEXTAREA' && e.key === 'Enter' && !e.target.classList.contains('tipbox')) { e.preventDefault(); e.target.blur(); }
  });

  /* ---- Undo: each change keeps how the guide was just before it ---- */
  var history = [];
  function snapshot() {
    history.push({ g: JSON.parse(JSON.stringify(g)), rows: rows.map(function (r) { return Object.assign({}, r, { meta: JSON.parse(JSON.stringify(r.meta || {})) }); }) });
    if (history.length > 30) history.shift();
    $('undo').disabled = false;
  }
  function undo() {
    var s = history.pop();
    $('undo').disabled = !history.length;
    if (!s) return;
    // the steps as they were: the ones there now go, the kept copies come back in their order
    Promise.all(rows.map(function (r) { return Store.dropStep(r.pk); })).then(function () {
      return s.rows.reduce(function (p, r, i) {
        var copy = Object.assign({}, r, { order: i }); delete copy.pk;
        return p.then(function () { return Store.addStep(copy); });
      }, Promise.resolve());
    }).then(function () { return Store.putGuide(s.g); }).then(load);
  }
  $('undo').addEventListener('click', undo);
  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !/TEXTAREA|INPUT/.test(e.target.tagName) && !$('editor').open) { e.preventDefault(); undo(); }
  });
  function change(fn) { snapshot(); return fn().then(load); }

  /* ---- the head ---- */
  function facts() {
    var f = $('facts');
    f.textContent = '';
    f.appendChild(chip('steps', rows.length + (rows.length === 1 ? ' step' : ' steps'), 'accent'));
    f.appendChild(chip('clock', g.finishedAt ? when(g.finishedAt) : 'Still being made'));
    if (g.archived) f.appendChild(chip('archive', 'Archived'));
  }
  $('title').addEventListener('change', function () {
    var t = $('title').value.trim() || Format.title(rows);
    snapshot();
    $('title').value = t; document.title = t; fit($('title'));
    g.title = t; Store.change(id, function (row) { row.title = t; });
  });
  $('intro').addEventListener('change', function () {
    var t = $('intro').value.trim();
    snapshot();
    g.intro = t; Store.change(id, function (row) { row.intro = t; });
  });

  /* ---- the steps ---- */
  function draw() {
    document.title = g.title || 'Guide';
    $('title').value = g.title || ''; fit($('title'));
    $('intro').value = g.intro || ''; requestAnimationFrame(function () { fit($('intro')); });
    facts(); drawSent(); drawPicked();
    urls.forEach(URL.revokeObjectURL); urls = [];
    var list = $('steps');
    list.textContent = '';
    rows.forEach(function (r, i) {
      list.appendChild(addHere(i));
      list.appendChild(stepCard(r, i));
    });
    playClips(list);
  }
  function addHere(at) {
    var d = el('li', 'addhere'), b = el('button', 'pill small soft'); b.type = 'button';
    b.innerHTML = Icons.svg('plus'); b.appendChild(el('span', '', 'Add a step here'));
    b.onclick = function () { addStep(at); };
    d.appendChild(b);
    return d;
  }
  function stepCard(r, i) {
    var li = el('li', 'card step' + (picked[r.pk] ? ' chosen' : '')), head = el('div', 'head'), m = r.meta || {};
    li.dataset.pk = r.pk;
    var box = el('input', 'pick'); box.type = 'checkbox'; box.checked = !!picked[r.pk]; box.setAttribute('aria-label', 'Choose step ' + (i + 1));
    box.onchange = function () { if (box.checked) picked[r.pk] = true; else delete picked[r.pk]; li.classList.toggle('chosen', box.checked); drawPicked(); };
    head.appendChild(box);
    head.appendChild(el('span', 'num', String(i + 1)));
    var say = el('textarea', 'say'); say.rows = 1; say.value = r.sentence || Format.sentence(m, i ? rows[i - 1].meta : null);
    say.setAttribute('aria-label', 'Step ' + (i + 1));
    say.addEventListener('change', function () {
      var text = say.value.trim() || Format.sentence(m, i ? rows[i - 1].meta : null);
      snapshot(); say.value = text; r.sentence = text;
      Store.changeStep(r.pk, function (row) { row.sentence = text; });
    });
    head.appendChild(say);
    requestAnimationFrame(function () { fit(say); });
    var grip = el('button', 'grip'); grip.type = 'button'; grip.title = 'Drag to move'; grip.innerHTML = Icons.svg('grip'); grip.draggable = true;
    head.appendChild(grip);
    li.appendChild(head);

    // a tip under the step, typed by hand
    var tip = el('textarea', 'tipbox'); tip.rows = 1; tip.placeholder = 'Add a tip for this step (optional)'; tip.value = r.note || '';
    tip.hidden = !r.note; tip.setAttribute('aria-label', 'Tip for step ' + (i + 1));
    tip.addEventListener('change', function () { var v = tip.value.trim(); snapshot(); r.note = v; Store.changeStep(r.pk, function (row) { row.note = v; }); if (!v) tip.hidden = true; });
    li.appendChild(tip);
    if (r.note) requestAnimationFrame(function () { fit(tip); });

    if (r.image) {
      var pic = el('div', 'pic'), shots = r.clip && r.clip.length > 1 ? r.clip : [r.image];
      shots.forEach(function (bytes, k) {
        var img = el('img', 'f' + (k ? ' over' : ''));
        var u = URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' })); urls.push(u);
        img.src = u; img.alt = k ? '' : 'The page at step ' + (i + 1);
        pic.appendChild(img);
      });
      if (shots.length > 1) { pic.dataset.clip = '1'; pic.appendChild(el('span', 'tag', 'Moving')); }
      var h = r.ring === false ? null : (r.ring || Format.highlight(m));
      if (h) {
        var ring = el('span', 'ring');
        ring.style.left = h.x + '%'; ring.style.top = h.y + '%'; ring.style.width = h.w + '%'; ring.style.height = h.h + '%';
        pic.appendChild(ring);
      }
      li.appendChild(pic);
    }
    if (m.url) {
      var w = chip('globe', (m.title ? m.title + ' · ' : '') + host(m.url));
      w.classList.add('where'); w.title = m.url;
      li.appendChild(w);
    }

    var bar = el('div', 'stepbar');
    var upB = tool('up', '', 'Move up'), downB = tool('down', '', 'Move down');
    upB.disabled = i === 0; downB.disabled = i === rows.length - 1;
    upB.onclick = function () { move(i, i - 1); }; downB.onclick = function () { move(i, i + 1); };
    var tipB = tool('pen', r.note ? 'Edit the tip' : 'Add a tip');
    tipB.onclick = function () { tip.hidden = false; fit(tip); tip.focus(); };
    var picB = tool('image', r.image ? 'Edit the picture' : 'Add a picture');
    picB.onclick = function () { r.image ? editPicture(r) : addPicture(r); };
    var outB = tool('trash', 'Take out');
    outB.onclick = function () { change(function () { return Store.dropStep(r.pk); }); };
    [upB, downB, tipB, picB, outB].forEach(function (b) { bar.appendChild(b); });
    li.appendChild(bar);

    // drag the grip to move the step
    grip.addEventListener('dragstart', function (e) { e.dataTransfer.setData('text/plain', String(i)); li.classList.add('drag'); });
    grip.addEventListener('dragend', function () { li.classList.remove('drag'); });
    li.addEventListener('dragover', function (e) { e.preventDefault(); li.classList.add('over'); });
    li.addEventListener('dragleave', function () { li.classList.remove('over'); });
    li.addEventListener('drop', function (e) {
      e.preventDefault(); li.classList.remove('over');
      var from = +e.dataTransfer.getData('text/plain');
      if (!isNaN(from) && from !== i) move(from, from < i ? i - 1 : i);
    });
    return li;
  }
  function move(from, to) {
    if (to < 0 || to >= rows.length) return;
    var pks = rows.map(function (r) { return r.pk; }), pk = pks.splice(from, 1)[0];
    pks.splice(to, 0, pk);
    change(function () { return Store.reorder(id, pks); });
  }
  // a step written by hand, at a place in the list; its picture is optional
  function addStep(at) {
    var pks = rows.map(function (r) { return r.pk; });
    change(function () {
      var key = 'h' + Date.now().toString(36);
      return Store.addStep({ guide: id, key: key, meta: { key: key, kind: 'hand' }, image: null, clip: null, sentence: 'Describe this step.' })
        .then(function () { return Store.steps(id); })
        .then(function (now) {
          var added = now.filter(function (r) { return r.key === key; })[0];
          pks.splice(at, 0, added.pk);
          return Store.reorder(id, pks);
        });
    }).then(function () {
      var says = $('steps').querySelectorAll('.say'), t = says[at];
      if (t) { t.focus(); t.select(); t.scrollIntoView({ block: 'center' }); }
    });
  }
  $('addend').addEventListener('click', function () { addStep(rows.length); });
  function addPicture(r) {
    var f = el('input'); f.type = 'file'; f.accept = 'image/*';
    f.onchange = function () {
      var file = f.files[0];
      if (!file) return;
      createImageBitmap(file).then(function (bmp) {
        var c = document.createElement('canvas'), w = Math.min(1600, bmp.width), h = Math.round(bmp.height * w / bmp.width);
        c.width = w; c.height = h; c.getContext('2d').drawImage(bmp, 0, 0, w, h);
        return new Promise(function (ok) { c.toBlob(ok, 'image/jpeg', 0.85); });
      }).then(function (b) { return b.arrayBuffer(); }).then(function (buf) {
        change(function () { return Store.changeStep(r.pk, function (row) { row.image = buf; row.clip = null; row.ring = false; }); });
      });
    };
    f.click();
  }

  /* ---- several steps at once ---- */
  function drawPicked() {
    var k = Object.keys(picked).filter(function (pk) { return rows.some(function (r) { return String(r.pk) === pk; }); });
    $('picked').hidden = !k.length;
    $('pickedn').textContent = k.length + (k.length === 1 ? ' step chosen' : ' steps chosen');
  }
  $('pickclear').addEventListener('click', function () { picked = {}; draw(); });
  $('pickdel').addEventListener('click', function () {
    var pks = Object.keys(picked).map(Number);
    picked = {};
    change(function () { return Promise.all(pks.map(function (pk) { return Store.dropStep(pk); })); });
  });

  /* ---- Write it for me: the title, intro and every sentence, in plain words ---- */
  var REWRITE = { type: 'object', additionalProperties: false, required: ['title', 'intro', 'steps'],
                  properties: { title: { type: 'string' }, intro: { type: 'string' }, steps: { type: 'array', items: { type: 'string' } } } };
  var SYSTEM = [
    'You write short how-to guides. You get the steps someone clicked through in a web app: for each, the sentence the recorder wrote, the label of the thing used, its kind, and the title and address of the page it was on. Write:',
    '- "title": what the guide teaches, starting "How to", sentence case, no full stop, under 70 characters.',
    '- "intro": one plain sentence saying what the reader will get done, and where it starts when the first step is an address.',
    '- "steps": one sentence per step, in the same order and the same number of them. Each tells the reader what to do, names the thing to use EXACTLY as its label is written and wraps that label in **double asterisks**.',
    'Keep what each step does (go to an address, choose an option, press keys, double-click, right-click, scroll, go back, switch tab, enter something in a field, tick or untick) and every quoted name, address and key exactly; only make it read better.',
    'Give the reader enough to act without guessing: never drop where it happens (the address, the page, the tab, the row), what kind of thing to use (link, field, checkbox, switch, menu) or what goes into a field.',
    'Plain words, sentence case. No dashes used as punctuation, no emoji, no exclamation marks, nothing invented beyond what the steps say. A step with no label reads "Click the spot shown." or similar.',
    'Return JSON only: {"title": "...", "intro": "...", "steps": ["...", "..."]}'
  ].join('\n');
  $('write').addEventListener('click', function () {
    if (!settings || settings.write.use === 'none') return note('Writing is off. Choose a writing service in Settings to use this.', 'bad', 'options.html');
    if (!rows.length) return;
    var b = $('write'); b.disabled = true; b.querySelector('span').textContent = 'Writing…';
    var user = rows.map(function (r, i) {
      var m = r.meta || {};
      return (i + 1) + '. ' + JSON.stringify({ plain: r.sentence || Format.sentence(m, i ? rows[i - 1].meta : null), label: m.label || '', kind: m.kind || 'click', role: m.role || '',
                                               page: m.title || '', address: m.url ? m.url.replace(/^https?:\/\//, '') : '', tip: r.note || '' });
    }).join('\n');
    Providers.doWrite({ system: SYSTEM, user: user, schema: REWRITE }).then(function (out) {
      var said = Array.isArray(out.steps) ? out.steps : [];
      if (said.length !== rows.length) throw new Error('The writing service sent back a different number of steps. Nothing was changed.');
      snapshot();
      var t = String(out.title || '').trim().slice(0, 200), intro = String(out.intro || '').trim().slice(0, 600);
      return Promise.all(rows.map(function (r, i) {
        var text = String(said[i] || '').trim().replace(/\*\*/g, '"').replace(/""/g, '"');
        return text ? Store.changeStep(r.pk, function (row) { row.sentence = text; }) : null;
      })).then(function () { return Store.change(id, function (row) { if (t) row.title = t; if (intro) row.intro = intro; }); });
    }).then(function () { note('Rewritten. Not what you wanted? Press Undo to put your words back.', 'good'); return load(); },
            function (err) { note(String(err.message || err), 'bad'); })
      .then(function () { b.disabled = false; b.querySelector('span').textContent = 'Write it for me'; });
  });
  function note(text, cls, link) {
    var n = $('worknote');
    n.hidden = !text; n.className = 'note' + (cls ? ' ' + cls : '');
    n.innerHTML = Icons.svg(cls === 'bad' ? 'alert' : 'check');
    var p = el('p', '', text + ' ');
    if (link) { var a = el('a', '', 'Open Settings'); a.href = link; p.appendChild(a); }
    n.appendChild(p);
  }

  /* ---- the picture editor: cover a part, redraw the ring, no ring ---- */
  var ed = { row: null, img: null, covers: [], ring: null, mode: 'cover', stack: [] };
  function editPicture(r) {
    ed = { row: r, covers: [], ring: r.ring === false ? false : (r.ring || Format.highlight(r.meta)), mode: 'cover', stack: [] };
    createImageBitmap(new Blob([r.image], { type: 'image/jpeg' })).then(function (bmp) {
      ed.img = bmp;
      var c = $('canvas'); c.width = bmp.width; c.height = bmp.height;
      setMode('cover'); paint();
      $('picundo').disabled = true;
      $('editor').showModal();
    });
  }
  function paint(drag) {
    var c = $('canvas'), x = c.getContext('2d');
    x.drawImage(ed.img, 0, 0);
    x.fillStyle = '#111';
    ed.covers.forEach(function (b) { x.fillRect(b.x, b.y, b.w, b.h); });
    var ring = drag && ed.mode === 'ring' ? toPct(drag) : ed.ring;
    if (ring) {
      x.lineWidth = Math.max(3, c.width / 300); x.strokeStyle = '#9140B0';
      x.strokeRect(ring.x * c.width / 100, ring.y * c.height / 100, ring.w * c.width / 100, ring.h * c.height / 100);
    }
    if (drag && ed.mode === 'cover') { x.fillStyle = 'rgba(17,17,17,.75)'; x.fillRect(drag.x, drag.y, drag.w, drag.h); }
  }
  function toPct(b) { var c = $('canvas'); return { x: 100 * b.x / c.width, y: 100 * b.y / c.height, w: 100 * b.w / c.width, h: 100 * b.h / c.height }; }
  function setMode(m) {
    ed.mode = m;
    document.querySelectorAll('[data-mode]').forEach(function (b) { b.classList.toggle('on', b.dataset.mode === m); });
    $('pichelp').textContent = m === 'cover'
      ? 'Drag over anything private: a name, an email, a number. It is painted over for good, in the picture and its clip.'
      : 'Drag a box around what the reader should look at.';
  }
  document.querySelectorAll('[data-mode]').forEach(function (b) { b.addEventListener('click', function () { setMode(b.dataset.mode); }); });
  function push() { ed.stack.push({ covers: ed.covers.slice(), ring: ed.ring }); $('picundo').disabled = false; }
  $('noring').addEventListener('click', function () { push(); ed.ring = false; paint(); });
  $('picundo').addEventListener('click', function () { var s = ed.stack.pop(); if (s) { ed.covers = s.covers; ed.ring = s.ring; } $('picundo').disabled = !ed.stack.length; paint(); });
  (function () {
    var c = $('canvas'), start = null;
    function at(e) { var r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * c.width / r.width, y: (e.clientY - r.top) * c.height / r.height }; }
    function box(a, b) { return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) }; }
    c.addEventListener('pointerdown', function (e) { start = at(e); c.setPointerCapture(e.pointerId); });
    c.addEventListener('pointermove', function (e) { if (start) paint(box(start, at(e))); });
    c.addEventListener('pointerup', function (e) {
      if (!start) return;
      var b = box(start, at(e)); start = null;
      if (b.w < 4 || b.h < 4) return paint();
      push();
      if (ed.mode === 'cover') ed.covers.push(b); else ed.ring = toPct(b);
      paint();
    });
  })();
  $('piccancel').addEventListener('click', function () { $('editor').close(); });
  $('picsave').addEventListener('click', function () {
    var r = ed.row, covers = ed.covers, ring = ed.ring;
    // covers are burnt into the picture and into every picture of its clip
    function burn(bytes) {
      if (!covers.length) return Promise.resolve(bytes);
      return createImageBitmap(new Blob([bytes], { type: 'image/jpeg' })).then(function (bmp) {
        var c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
        var x = c.getContext('2d'), sx = bmp.width / ed.img.width, sy = bmp.height / ed.img.height;
        x.drawImage(bmp, 0, 0); x.fillStyle = '#111';
        covers.forEach(function (b) { x.fillRect(b.x * sx, b.y * sy, b.w * sx, b.h * sy); });
        return new Promise(function (ok) { c.toBlob(ok, 'image/jpeg', 0.85); }).then(function (b) { return b.arrayBuffer(); });
      });
    }
    $('picsave').disabled = true;
    Promise.all([burn(r.image), Promise.all((r.clip || []).map(burn))]).then(function (out) {
      return change(function () { return Store.changeStep(r.pk, function (row) { row.image = out[0]; row.clip = r.clip ? out[1] : null; row.ring = ring; }); });
    }).then(function () { $('picsave').disabled = false; $('editor').close(); });
  });

  /* ---- send, download, more ---- */
  function menu(boxId, items) {
    var box = $(boxId), old = box.querySelector('.list');
    if (old) { old.remove(); return; }
    document.querySelectorAll('.menu > .list').forEach(function (l) { l.remove(); });
    var list = el('div', 'list' + (box.getBoundingClientRect().left > innerWidth / 2 ? ' right' : ''));
    items.forEach(function (it) {
      var b = el(it.href ? 'a' : 'button');
      if (it.href) b.href = it.href; else { b.type = 'button'; b.onclick = function () { list.remove(); it.run(); }; }
      var ic = el('span', 'ic'); ic.innerHTML = Icons.svg(it.icon); b.appendChild(ic);
      var t = el('span', '', it.label); if (it.help) t.appendChild(el('small', '', it.help)); b.appendChild(t);
      list.appendChild(b);
    });
    box.appendChild(list);
  }
  document.addEventListener('click', function (e) { if (!e.target.closest('.menu')) document.querySelectorAll('.menu > .list').forEach(function (l) { l.remove(); }); });
  function portable() { return Store.guide(id).then(function (now) { return Format.portable(now, rows); }); }
  $('send').addEventListener('click', function () {
    var mine = conns.filter(function (c) { return c.what.indexOf('guide') > -1; });
    if (!mine.length) return menu('sendmenu', [{ icon: 'plug', label: 'Connect a place first', help: 'Your app, Notion, Google Docs…', href: 'options.html#connections' }]);
    menu('sendmenu', mine.map(function (c) {
      var s = (g.sent || {})[c.id];
      return { icon: 'send', label: c.name, help: s && s.state === 'sent' ? 'Sent ' + when(s.at) + ', send again' : Destinations[c.kind].label,
               run: function () { (g.sent = g.sent || {})[c.id] = { state: 'sending', at: Date.now() }; drawSent(); Outbox.send('guide', id, c.id).then(load); } };
    }));
  });
  function drawSent() {
    var box = $('sentlist');
    box.textContent = '';
    conns.forEach(function (c) {
      var s = (g.sent || {})[c.id];
      if (!s) return;
      var row = el('div', 'note ' + (s.state === 'sent' ? 'good' : s.state === 'sending' ? '' : 'bad'));
      row.innerHTML = Icons.svg(s.state === 'sent' ? 'check' : s.state === 'sending' ? 'send' : 'alert');
      var p = el('p');
      if (s.state === 'sent') {
        p.textContent = 'Sent to ' + c.name + ' ' + when(s.at) + '. ';
        if (s.url) { var a = el('a', '', 'Open it there'); a.href = s.url; a.target = '_blank'; a.rel = 'noopener'; p.appendChild(a); }
      } else if (s.state === 'sending') p.textContent = 'Sending to ' + c.name + '…';
      else if (s.state === 'waiting') p.textContent = 'Not sent to ' + c.name + ' yet: ' + s.error + ' Tried again by itself around ' + new Date(s.next).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) + '.';
      else p.textContent = 'Not sent to ' + c.name + ': ' + s.error + ' Press Send to try again.';
      row.appendChild(p);
      box.appendChild(row);
    });
  }
  $('dl').addEventListener('click', function () {
    menu('dlmenu', [
      { icon: 'globe', label: 'One web page', help: 'Pictures and clips inside, opens anywhere', run: function () { portable().then(Export.downloadHtml); } },
      { icon: 'book', label: 'Markdown', help: 'The words, without pictures', run: function () { portable().then(function (p) { downloadText(Export.slug(p.title) + '.md', 'text/markdown', Outbox.guideMarkdown(p)); }); } },
      { icon: 'code', label: 'JSON', help: 'The step-guide/1 format your own app reads', run: function () { portable().then(Export.downloadJson); } }
    ]);
  });
  function downloadText(name, type, text) {
    var a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type: type })); a.download = name; a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 30000);
  }
  $('more').addEventListener('click', function () {
    menu('moremenu', [
      g.archived ? { icon: 'restore', label: 'Restore', run: function () { Store.change(id, function (r) { r.archived = false; }).then(load); } }
                 : { icon: 'archive', label: 'Archive', help: 'Out of the way, kept', run: function () { Store.change(id, function (r) { r.archived = true; }).then(load); } },
      { icon: 'trash', label: 'Delete the guide', help: 'With its pictures', run: function () {
        if (!confirm('Delete this guide and its pictures from this browser? This cannot be undone. Copies already sent elsewhere stay there.')) return;
        Store.forget(id).then(function () { location.href = 'library.html'; });
      } }
    ]);
  });

  function load() {
    return Promise.all([Store.guide(id), Store.steps(id), Connections.all(), Providers.read()]).then(function (r) {
      g = r[0]; rows = r[1]; conns = r[2]; settings = r[3];
      if (!g) { $('page').hidden = true; $('missing').hidden = false; return; }
      $('page').hidden = false;
      draw();
    });
  }
  // a send finishing in the background shows here without a reload
  setInterval(function () {
    if (!g || !Object.keys(g.sent || {}).some(function (k) { return /sending|waiting/.test(g.sent[k].state); })) return;
    Store.guide(id).then(function (now) { if (now) { g.sent = now.sent; drawSent(); } });
  }, 4000);
  load();
})();
