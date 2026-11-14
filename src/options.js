/* Settings save as you change them. Chrome asks your permission once for
   each service's address, from the "Allow" button next to it. */
(function () {
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function toast(text) {
    var t = el('div', 'toast', text || 'Saved');
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 1600);
  }
  function get(keys) { return chrome.storage.local.get(keys); }
  function set(obj) { return chrome.storage.local.set(obj).then(function () { toast(); }); }

  /* one field of a service's settings */
  function field(f, value, onChange) {
    var box = el('div', 'field'), id = 'f' + Math.random().toString(36).slice(2, 8);
    if (f.type === 'checkbox') {
      var l = el('label', 'check'), c = el('input'); c.type = 'checkbox'; c.checked = !!value;
      c.onchange = function () { onChange(c.checked); };
      l.appendChild(c); l.appendChild(document.createTextNode(' ' + f.label));
      return l;
    }
    var lab = el('label', '', f.label); lab.htmlFor = id; box.appendChild(lab);
    var input;
    if (f.type === 'select') {
      input = el('select');
      f.options.forEach(function (o) { var op = el('option', '', o[1]); op.value = o[0]; input.appendChild(op); });
      input.value = value || f.options[0][0];
    } else {
      input = el('input'); input.type = f.type || 'text'; input.placeholder = f.placeholder || ''; input.value = value || '';
      input.autocomplete = 'off'; input.spellcheck = false;
    }
    input.id = id;
    input.onchange = function () { onChange(input.value.trim()); };
    box.appendChild(input);
    if (f.help) box.appendChild(el('small', '', f.help));
    return box;
  }
  /* "Allow Chrome to reach api.example.com", only while it is not allowed yet */
  function allow(box, origins) {
    origins = (origins || []).filter(Boolean);
    var bar = el('div', 'note');
    bar.hidden = true;
    box.appendChild(bar);
    if (!origins.length) return;
    var want = { origins: origins.map(function (o) { return o + '/*'; }) };
    chrome.permissions.contains(want).then(function (yes) {
      if (yes) return;
      bar.hidden = false;
      bar.innerHTML = Icons.svg('alert');
      var p = el('p', '', 'Chrome needs your OK to reach ' + origins.map(function (o) { return o.replace(/^https?:\/\//, ''); }).join(' and ') + '. ');
      var b = el('button', 'pill small accent', 'Allow'); b.type = 'button';
      b.onclick = function () { chrome.permissions.request(want).then(function (ok) { if (ok) { bar.hidden = true; toast('Allowed'); } }); };
      p.appendChild(b); bar.appendChild(p);
    });
  }

  /* ---- transcripts and write-ups: one service each ---- */
  function provider(kind, useSel, fieldsBox) {
    var list = Providers[kind];
    Object.keys(list).forEach(function (k) { var o = el('option', '', list[k].label); o.value = k; useSel.appendChild(o); });
    function draw(all) {
      var use = list[useSel.value] ? useSel.value : 'none', p = list[use], cfg = all[use] || {};
      fieldsBox.textContent = '';
      if (p.site) { var a = el('a', 'site', 'Get a key'); a.href = p.site; a.target = '_blank'; a.rel = 'noopener'; var s = el('p', 'muted site'); s.appendChild(a); s.style.marginBottom = '10px'; fieldsBox.appendChild(s); }
      p.fields.forEach(function (f) {
        fieldsBox.appendChild(field(f, cfg[f.key], function (v) {
          cfg[f.key] = v; all[use] = cfg;
          var o = {}; o[kind] = all; set(o).then(function () { draw(all); });
        }));
      });
      allow(fieldsBox, [p.origin ? p.origin(cfg) : null]);
    }
    return get([kind]).then(function (s) {
      var all = s[kind] || {};
      useSel.value = list[all.use] ? all.use : 'none';
      draw(all);
      useSel.onchange = function () { all.use = useSel.value; var o = {}; o[kind] = all; set(o); draw(all); };
    });
  }

  /* ---- templates ---- */
  var custom = [];
  function drawTemplates() {
    var box = $('tplList');
    box.textContent = '';
    custom.forEach(function (t, i) {
      var d = el('div', 'tpl'), top = el('div', 'row');
      top.appendChild(el('b', 'grow', t.name));
      var e = el('button', 'pill small line', 'Edit'); e.type = 'button'; e.onclick = function () { editTemplate(i); };
      var x = el('button', 'pill small danger', 'Remove'); x.type = 'button';
      x.onclick = function () { if (confirm('Remove the template “' + t.name + '”?')) { custom.splice(i, 1); saveTemplates(); } };
      top.appendChild(e); top.appendChild(x); d.appendChild(top);
      var ol = el('ol');
      t.sections.forEach(function (s) { ol.appendChild(el('li', '', s[0] + (s[1] ? ': ' + s[1] : ''))); });
      d.appendChild(ol);
      box.appendChild(d);
    });
    // the start template picker lists built-in and yours
    var sel = $('template'), keep = sel.value;
    sel.textContent = '';
    var auto = el('option', '', 'The first one made for each kind'); auto.value = ''; sel.appendChild(auto);
    Templates.all(custom).forEach(function (t) { var o = el('option', '', t.name); o.value = t.id; sel.appendChild(o); });
    sel.value = keep;
  }
  function saveTemplates() { set({ templates: custom }).then(drawTemplates); }
  function editTemplate(i) {
    var t = i == null ? { id: 'my-' + Date.now().toString(36), name: '', for: ['call'], sections: [['Summary', 'What it was about, in two sentences.']], instructions: '' } : JSON.parse(JSON.stringify(custom[i]));
    var d = $('dialog'), box = $('dialogin');
    box.textContent = '';
    box.appendChild(el('h2', '', i == null ? 'Add a template' : 'Edit the template'));
    var name = field({ label: 'Name', placeholder: 'Weekly team sync' }, t.name, function (v) { t.name = v; });
    box.appendChild(name);
    var fors = el('div', 'checks');
    [['call', 'Calls'], ['video', 'Videos'], ['audio', 'Voice notes']].forEach(function (k) {
      var l = el('label', 'check'), c = el('input'); c.type = 'checkbox'; c.checked = t.for.indexOf(k[0]) > -1;
      c.onchange = function () { t.for = t.for.filter(function (x) { return x !== k[0]; }); if (c.checked) t.for.push(k[0]); };
      l.appendChild(c); l.appendChild(document.createTextNode(' ' + k[1])); fors.appendChild(l);
    });
    box.appendChild(el('b', '', 'Made for')); box.appendChild(fors);
    var secs = field({ label: 'Headings, one per line: Heading: what goes under it', type: 'text' }, '', function () {});
    var ta = el('textarea'); ta.rows = 6; ta.value = t.sections.map(function (s) { return s[0] + (s[1] ? ': ' + s[1] : ''); }).join('\n');
    secs.replaceChild(ta, secs.querySelector('input'));
    box.appendChild(secs);
    var more = field({ label: 'Anything else the writer should know (optional)', placeholder: 'Write in Spanish. Call our customers "members".' }, t.instructions, function (v) { t.instructions = v; });
    box.appendChild(more);
    var bar = el('div', 'row'), ok = el('button', 'pill accent', 'Save'), no = el('button', 'pill line', 'Cancel');
    ok.type = no.type = 'button';
    bar.appendChild(el('span', 'grow')); bar.appendChild(no); bar.appendChild(ok); box.appendChild(bar);
    no.onclick = function () { d.close(); };
    ok.onclick = function () {
      t.name = box.querySelector('input').value.trim();
      t.instructions = more.querySelector('input').value.trim();
      t.sections = ta.value.split('\n').map(function (l) { var k = l.indexOf(':'); return k > 0 ? [l.slice(0, k).trim(), l.slice(k + 1).trim()] : [l.trim(), '']; }).filter(function (s) { return s[0]; });
      if (!t.name || !t.sections.length) return alert('Give it a name and at least one heading.');
      if (i == null) custom.push(t); else custom[i] = t;
      d.close(); saveTemplates();
    };
    d.showModal();
  }
  $('tplAdd').addEventListener('click', function () { editTemplate(null); });

  /* ---- connections ---- */
  var conns = [], open = {};
  Object.keys(Destinations).forEach(function (k) { var o = el('option', '', Destinations[k].label); o.value = k; $('connKind').appendChild(o); });
  function saveConns() { return Connections.save(conns).then(function () { toast(); }); }
  function drawConns() {
    var box = $('connList');
    box.textContent = '';
    if (!conns.length) box.appendChild(el('p', 'note', 'Nothing connected: everything stays in this browser, and can be downloaded from its page.'));
    conns.forEach(function (c, i) {
      var d = Destinations[c.kind], card = el('div', 'conn'), top = el('div', 'top'), ic = el('span', 'ic'); ic.innerHTML = Icons.svg('plug');
      top.appendChild(ic); top.appendChild(el('b', '', c.name));
      top.appendChild(el('span', 'chip' + (c.auto ? ' accent' : ''), c.auto ? 'Sends by itself' : 'By hand'));
      var t = el('button', 'pill small line', open[c.id] ? 'Close' : 'Edit'); t.type = 'button';
      t.onclick = function () { open[c.id] = !open[c.id]; drawConns(); };
      top.appendChild(t);
      card.appendChild(top);
      if (open[c.id]) {
        var body = el('div', 'body');
        if (d.help) body.appendChild(el('p', 'muted', d.help));
        if (d.site) { var a = el('a', 'site', 'Where to get it'); a.href = d.site; a.target = '_blank'; a.rel = 'noopener'; var p = el('p'); p.appendChild(a); p.style.margin = '6px 0 12px'; body.appendChild(p); }
        body.appendChild(field({ label: 'Name' }, c.name, function (v) { c.name = v || d.label; saveConns().then(drawConns); }));
        d.fields.forEach(function (f) {
          body.appendChild(field(f, c.config[f.key], function (v) { c.config[f.key] = v; saveConns().then(drawConns); }));
        });
        if (c.kind === 'gdocs') {
          body.appendChild(el('p', 'muted small', 'Redirect address for your OAuth client: '));
          body.lastChild.appendChild(el('code', '', chrome.identity.getRedirectURL('google')));
          var sg = el('button', 'pill small accent', 'Sign in with Google'); sg.type = 'button';
          sg.onclick = function () { Connections.save(conns).then(function () { return Connections.all(); }).then(function (all) {
            var me = all.filter(function (x) { return x.id === c.id; })[0];
            return d.signIn(Object.assign({ _id: c.id }, me.config));
          }).then(function () { toast('Signed in'); }, function (e) { alert(e.message || e); }); };
          var r0 = el('div', 'row'); r0.style.margin = '6px 0 14px'; r0.appendChild(sg); body.appendChild(r0);
        }
        body.appendChild(el('b', '', 'It takes'));
        var what = el('div', 'checks');
        Object.keys(Connections.KINDS).forEach(function (k) {
          var l = el('label', 'check'), cb = el('input'); cb.type = 'checkbox'; cb.checked = c.what.indexOf(k) > -1;
          cb.onchange = function () { c.what = c.what.filter(function (x) { return x !== k; }); if (cb.checked) c.what.push(k); saveConns(); };
          l.appendChild(cb); l.appendChild(document.createTextNode(' ' + Connections.KINDS[k])); what.appendChild(l);
        });
        body.appendChild(what);
        var au = el('label', 'check'), ac = el('input'); ac.type = 'checkbox'; ac.checked = !!c.auto;
        ac.onchange = function () { c.auto = ac.checked; saveConns().then(drawConns); };
        au.appendChild(ac); au.appendChild(document.createTextNode(' Send each one by itself when it is finished'));
        body.appendChild(au);
        if (d.media) {
          var me2 = el('label', 'check'), mc = el('input'); mc.type = 'checkbox'; mc.checked = !!c.media;
          mc.onchange = function () { c.media = mc.checked; saveConns(); };
          me2.appendChild(mc); me2.appendChild(document.createTextNode(' Send the recording file too (only the kept part of a trimmed one)'));
          body.appendChild(me2);
        }
        allow(body, d.origins(c.config));
        var row = el('div', 'row'), test = el('button', 'pill small line', 'Send a test'), rm = el('button', 'pill small danger', 'Remove');
        test.type = rm.type = 'button';
        test.onclick = function () {
          test.disabled = true; test.textContent = 'Sending…';
          var data = sample();
          d.send({ type: 'note', data: data, html: Export.noteHtml(data, '', ''), markdown: Export.noteMarkdown(data), media: null }, Object.assign({ _id: c.id }, c.config))
            .then(function (r) { alert('It worked.' + (r && r.url ? ' It is at ' + r.url : '')); }, function (e) { alert('It did not work: ' + (e.message || e)); })
            .then(function () { test.disabled = false; test.textContent = 'Send a test'; });
        };
        rm.onclick = function () { if (confirm('Remove “' + c.name + '”? What was already sent stays there.')) { conns.splice(i, 1); saveConns().then(drawConns); } };
        row.appendChild(test); row.appendChild(el('span', 'grow')); row.appendChild(rm);
        body.appendChild(row);
        card.appendChild(body);
      }
      box.appendChild(card);
    });
  }
  // a small made-up note, to see what arrives
  function sample() {
    return Format.note({ id: 'ntest', kind: 'call', where: 'Meet', title: 'Test from Orbit Recorder', began: Date.now(), endedAt: Date.now(), seconds: 42,
      html: '<p>This is a test note. Nothing to do.</p>', contact: '',
      summary: Templates.clean({ title: 'Test', short: 'A test sent from Settings.', long: 'A test sent from Settings.', sections: [], ideas: [], chapters: [], qa: [], topics: ['Testing'], speakers: [],
                                 mood: { overall: 'neutral', why: 'A test.', voices: [], moments: [] }, actions: [{ text: 'Delete this test', owner: '', at: '0:00' }] }),
      transcript: { utterances: [{ speaker: 0, start: 0, end: 3, text: 'Testing, one, two.' }], text: 'Testing, one, two.' } }, null);
  }
  $('connAdd').addEventListener('click', function () {
    var k = $('connKind').value, c = { id: 'c' + Date.now().toString(36), kind: k, name: Destinations[k].label, config: {}, what: ['call', 'video', 'audio', 'guide'], auto: false, media: false };
    if (k === 'teamtailor' || k === 'hubspot') c.what = ['call', 'audio'];
    conns.push(c); open[c.id] = true;
    saveConns().then(drawConns);
  });

  /* ---- you, calls, and the simple switches ---- */
  function switches() {
    var keys = { callCard: true, callVideo: false, consent: true, liveWords: false, autoWrite: true };
    return get(Object.keys(keys).concat(['myName', 'template'])).then(function (s) {
      Object.keys(keys).forEach(function (k) {
        var c = $(k); c.checked = s[k] == null ? keys[k] : !!s[k];
        c.onchange = function () { var o = {}; o[k] = c.checked; set(o); };
      });
      $('myName').value = s.myName || '';
      $('myName').onchange = function () { set({ myName: $('myName').value.trim() }); };
      $('template').value = s.template || '';
      $('template').onchange = function () { set({ template: $('template').value }); };
    });
  }

  Promise.all([get(['templates']), Connections.all()]).then(function (r) {
    custom = r[0].templates || []; conns = r[1];
    drawTemplates(); drawConns();
    return Promise.all([provider('transcribe', $('tUse'), $('tFields')), provider('write', $('wUse'), $('wFields')), switches()]);
  }).then(function () { if (location.hash) { var t = document.querySelector(location.hash); if (t) t.scrollIntoView(); } });
})();
