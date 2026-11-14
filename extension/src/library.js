/* Every call, video, voice note and guide kept in this browser, newest
   first: find, filter, choose many, upload a recording made elsewhere. */
(function () {
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function chip(icon, text, cls) { var c = el('span', 'chip' + (cls ? ' ' + cls : '')); c.innerHTML = Icons.svg(icon); c.appendChild(el('span', '', text)); return c; }
  var ICON = { call: 'phone', video: 'video', audio: 'mic', guide: 'steps' };
  var FILTERS = [['all', 'Everything', 'list'], ['call', 'Calls', 'phone'], ['video', 'Videos', 'video'], ['audio', 'Voice notes', 'mic'], ['guide', 'Guides', 'steps'], ['archived', 'Archived', 'archive']];
  var items = [], filter = 'all', picked = {}, urls = [], conns = [];
  try { filter = localStorage.getItem('libraryFilter') || 'all'; } catch (e) {}

  /* one list of both kinds, each with what Find looks through */
  function gather() {
    return Promise.all([Store.notes(), Store.guides(), Connections.all()]).then(function (r) {
      conns = r[2];
      var notes = r[0].map(function (n) {
        var s = n.summary || {};
        return { type: 'note', id: n.id, kind: n.kind, title: n.title, at: n.began, archived: !!n.archived, row: n, sent: n.sent || {},
                 gist: s.short || '', ended: n.ended,
                 words: [n.title, Format.text(n.html || ''), s.short, s.long, (s.topics || []).join(' '), n.transcript && (n.transcript.text || (n.transcript.utterances || []).map(function (u) { return u.text; }).join(' '))].join(' ').toLowerCase() };
      });
      return Promise.all(r[1].map(function (g) {
        return Store.steps(g.id).then(function (rows) {
          return { type: 'guide', id: g.id, kind: 'guide', title: g.title || (g.ended ? Format.title(rows) : 'Being made now'), at: g.finishedAt || g.began,
                   archived: !!g.archived, row: g, steps: rows.length, first: rows[0], sent: g.sent || {}, gist: g.intro || '', ended: g.ended,
                   words: [g.title, g.intro].concat(rows.map(function (s) { return s.sentence + ' ' + (s.note || ''); })).join(' ').toLowerCase() };
        });
      })).then(function (guides) {
        items = notes.concat(guides).sort(function (a, b) { return (b.at || 0) - (a.at || 0); });
      });
    });
  }

  function shown() {
    var q = $('q').value.trim().toLowerCase();
    return items.filter(function (it) {
      if (filter === 'archived' ? !it.archived : it.archived) return false;
      if (filter !== 'all' && filter !== 'archived' && it.kind !== filter) return false;
      return !q || q.split(/\s+/).every(function (w) { return it.words.indexOf(w) > -1; });
    });
  }
  function drawFilters() {
    var box = $('filters');
    box.textContent = '';
    FILTERS.forEach(function (f) {
      var count = items.filter(function (it) { return f[0] === 'archived' ? it.archived : !it.archived && (f[0] === 'all' || it.kind === f[0]); }).length;
      if (!count && f[0] !== 'all' && f[0] !== filter) return;
      var b = el('button', f[0] === filter ? 'on' : ''); b.type = 'button';
      b.innerHTML = Icons.svg(f[2]); b.appendChild(el('span', '', f[1])); b.appendChild(el('span', 'n', String(count)));
      b.onclick = function () { filter = f[0]; try { localStorage.setItem('libraryFilter', filter); } catch (e) {} draw(); };
      box.appendChild(b);
    });
  }
  function draw() {
    drawFilters();
    urls.forEach(URL.revokeObjectURL); urls = [];
    var list = $('list'), all = shown();
    list.textContent = '';
    $('empty').hidden = items.length > 0;
    $('none').hidden = !items.length || all.length > 0;
    all.forEach(function (it) { list.appendChild(card(it)); });
    drawPicked();
  }
  function card(it) {
    var key = it.type + ':' + it.id, li = el('li', 'item' + (picked[key] ? ' chosen' : ''));
    var box = el('input', 'sel'); box.type = 'checkbox'; box.checked = !!picked[key]; box.setAttribute('aria-label', 'Choose ' + it.title);
    box.onchange = function () { if (box.checked) picked[key] = it; else delete picked[key]; li.classList.toggle('chosen', box.checked); drawPicked(); };
    li.appendChild(box);
    var a = el('a', 'card');
    a.href = it.type === 'guide' ? 'guide.html?id=' + encodeURIComponent(it.id) : 'note.html?id=' + encodeURIComponent(it.id);
    a.addEventListener('click', function (e) { if (document.body.classList.contains('selecting')) { e.preventDefault(); box.checked = !box.checked; box.onchange(); } });
    var thumb = el('div', 'thumb ' + it.kind);
    if (it.type === 'guide' && it.first && it.first.image) {
      var img = el('img'); img.alt = ''; img.loading = 'lazy';
      img.src = URL.createObjectURL(new Blob([it.first.image], { type: 'image/jpeg' })); urls.push(img.src);
      thumb.appendChild(img);
    } else thumb.innerHTML = Icons.svg(ICON[it.kind]);
    if (it.type === 'note' && it.row.seconds) thumb.appendChild(el('span', 'len', Format.clock(it.row.trim ? it.row.trim.b - it.row.trim.a : it.row.seconds)));
    a.appendChild(thumb);
    var body = el('div', 'body'), t = el('div', 't'), k = el('span', 'kind ' + it.kind);
    k.innerHTML = Icons.svg(ICON[it.kind]);
    t.appendChild(k); t.appendChild(el('b', '', it.title));
    body.appendChild(t);
    if (it.gist) body.appendChild(el('span', 'gist', it.gist));
    var facts = el('div', 'bar');
    facts.appendChild(chip('clock', new Date(it.at || Date.now()).toLocaleDateString([], { dateStyle: 'medium' })));
    if (it.type === 'guide') facts.appendChild(chip('steps', it.steps + (it.steps === 1 ? ' step' : ' steps')));
    if (!it.ended) facts.appendChild(chip('pen', it.type === 'guide' ? 'Being made' : 'Recording', 'accent'));
    var states = Object.keys(it.sent).map(function (c) { return it.sent[c].state; });
    if (states.indexOf('failed') > -1 || states.indexOf('waiting') > -1) facts.appendChild(chip('alert', 'Not sent', 'bad'));
    else if (states.indexOf('sent') > -1) facts.appendChild(chip('check', 'Sent', 'good'));
    body.appendChild(facts);
    a.appendChild(body);
    li.appendChild(a);
    return li;
  }

  /* ---- choose many ---- */
  $('select').addEventListener('click', function () {
    var on = document.body.classList.toggle('selecting');
    $('select').querySelector('span').textContent = on ? 'Done' : 'Select';
    if (!on) picked = {};
    draw();
  });
  function chosen() { return Object.keys(picked).map(function (k) { return picked[k]; }); }
  function drawPicked() {
    var c = chosen();
    $('picked').hidden = !c.length && !document.body.classList.contains('selecting');   // Select shows the bar, so Choose all is there from the start
    $('pickedn').textContent = c.length + ' chosen';
    var arch = c.length && c.every(function (it) { return it.archived; });
    $('parchive').innerHTML = Icons.svg(arch ? 'restore' : 'archive');
    $('parchive').appendChild(el('span', '', arch ? 'Restore' : 'Archive'));
  }
  $('pickall').addEventListener('click', function () {
    document.body.classList.add('selecting');
    shown().forEach(function (it) { picked[it.type + ':' + it.id] = it; });
    draw();
  });
  $('parchive').addEventListener('click', function () {
    var c = chosen(), back = c.every(function (it) { return it.archived; });
    Promise.all(c.map(function (it) {
      var fn = function (r) { r.archived = !back; };
      return it.type === 'guide' ? Store.change(it.id, fn) : Store.changeNote(it.id, fn);
    })).then(function () { picked = {}; return refresh(); });
  });
  $('pdelete').addEventListener('click', function () {
    var c = chosen();
    if (!confirm('Delete ' + c.length + (c.length === 1 ? ' item' : ' items') + ' from this browser, with their recordings and pictures? This cannot be undone. Copies already sent elsewhere stay there.')) return;
    Promise.all(c.map(function (it) { return it.type === 'guide' ? Store.forget(it.id) : Store.forgetNote(it.id); }))
      .then(function () { picked = {}; return refresh(); });
  });
  $('psend').addEventListener('click', function () {
    var box = $('pmenu'), old = box.querySelector('.list');
    if (old) return old.remove();
    var list = el('div', 'list right');
    if (!conns.length) {
      var a = el('a'); a.href = 'options.html#connections'; a.innerHTML = '<span class="ic">' + Icons.svg('plug') + '</span>';
      a.appendChild(el('span', '', 'Connect a place first')); list.appendChild(a);
    }
    conns.forEach(function (cn) {
      var b = el('button'); b.type = 'button';
      b.innerHTML = '<span class="ic">' + Icons.svg('send') + '</span>';
      var t = el('span', '', cn.name); t.appendChild(el('small', '', 'Only what it takes: ' + cn.what.map(function (k) { return Connections.KINDS[k]; }).join(', ').toLowerCase()));
      b.appendChild(t);
      b.onclick = function () {
        list.remove();
        var c = chosen().filter(function (it) { return cn.what.indexOf(it.kind) > -1 && it.ended; });
        busy('Sending ' + c.length + (c.length === 1 ? ' item' : ' items') + ' to ' + cn.name + '…');
        c.reduce(function (p, it) { return p.then(function () { return Outbox.send(it.type, it.id, cn.id).catch(function () {}); }); }, Promise.resolve())
          .then(function () { busy(''); picked = {}; return refresh(); });
      };
      list.appendChild(b);
    });
    box.appendChild(list);
  });
  document.addEventListener('click', function (e) { if (!e.target.closest('.menu')) document.querySelectorAll('.menu > .list').forEach(function (l) { l.remove(); }); });
  function busy(text) { $('busy').hidden = !text; $('busy').textContent = text; }

  /* ---- a recording made elsewhere: kept like one made here, then opened to be transcribed ---- */
  $('upload').addEventListener('click', function () { $('file').click(); });
  $('file').addEventListener('change', function () {
    var f = $('file').files[0];
    if (!f) return;
    busy('Reading ' + f.name + '…');
    var video = /^video/.test(f.type), url = URL.createObjectURL(f), probe = el(video ? 'video' : 'audio');
    probe.preload = 'metadata'; probe.src = url;
    new Promise(function (ok) {
      probe.onloadedmetadata = function () { ok(isFinite(probe.duration) ? Math.round(probe.duration) : 0); };
      probe.onerror = function () { ok(0); };
      setTimeout(function () { ok(0); }, 8000);
    }).then(function (secs) {
      URL.revokeObjectURL(url);
      var id = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
      var row = { id: id, kind: video ? 'video' : 'audio', where: '', title: f.name.replace(/\.[^.]+$/, '').slice(0, 120), named: true,
                  began: f.lastModified || Date.now(), ended: true, endedAt: Date.now(), seconds: secs, mime: f.type || 'audio/webm', video: video,
                  media: id + '-main', sound: '', html: '', sent: {}, uploaded: true, work: { state: 'new' } };
      return Store.putMedia(row.media, f).then(function () { return Store.putNote(row); }).then(function () { location.href = 'note.html?id=' + id; });
    }).catch(function (err) { busy('That file could not be kept: ' + (err.message || err)); });
  });

  $('q').addEventListener('input', draw);
  function refresh() { return gather().then(draw); }
  refresh();
})();
