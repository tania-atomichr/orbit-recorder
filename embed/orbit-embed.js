/* Orbit embed: show a note or a guide inside any web page.

     <script src="orbit-embed.js"></script>
     <orbit-note src="/notes/n123.json" media="/notes/n123.webm"></orbit-note>
     <orbit-guide src="/guides/g123.json"></orbit-guide>

   src is the JSON your backend kept (orbit-note/1 or step-guide/1, as the
   extension sent it). media is the recording file, when you kept it.
   Attributes: hide="transcript notes summary todos" leaves parts out;
   accent="#9140B0" changes the colour. It draws in a shadow root with your
   page's font, so your styles and its never mix. No dependencies. MIT. */
(function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function clock(s) {
    s = Math.max(0, Math.round(+s || 0));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return (h ? h + ':' + ('0' + m).slice(-2) : m) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function ts(t) { return '<button class="ts" type="button" data-t="' + (+t || 0) + '">' + clock(t) + '</button>'; }
  /* the notes are HTML from the extension's editor: only its few tags survive */
  function safe(html) {
    var box = document.createElement('div');
    box.innerHTML = String(html || '');
    var KEEP = { P: 1, BR: 1, H2: 1, H3: 1, B: 1, STRONG: 1, I: 1, EM: 1, UL: 1, OL: 1, LI: 1, A: 1, BLOCKQUOTE: 1, SPAN: 1 };
    (function walk(node) {
      Array.prototype.slice.call(node.childNodes).forEach(function (c) {
        if (c.nodeType === 3) return;
        if (c.nodeType !== 1 || !KEEP[c.tagName]) {
          if (c.nodeType === 1 && !/^(SCRIPT|STYLE|IFRAME|OBJECT|EMBED)$/.test(c.tagName)) { walk(c); while (c.firstChild) node.insertBefore(c.firstChild, c); }
          c.remove(); return;
        }
        var href = c.getAttribute('href'), t = c.getAttribute('data-t'), done = c.getAttribute('data-done'), checks = c.hasAttribute('data-checks'), isTs = c.classList.contains('ts');
        Array.prototype.slice.call(c.attributes).forEach(function (a) { c.removeAttribute(a.name); });
        if (c.tagName === 'A' && /^https?:/i.test(href || '')) { c.setAttribute('href', href); c.setAttribute('target', '_blank'); c.setAttribute('rel', 'noopener'); }
        if (isTs) { c.className = 'ts'; c.setAttribute('data-t', String(+t || 0)); }
        if (checks) c.setAttribute('data-checks', '1');
        if (done) c.setAttribute('data-done', done === '1' ? '1' : '0');
        walk(c);
      });
    })(box);
    return box.innerHTML;
  }
  var CSS = ':host{display:block;--accent:#9140B0;--soft:#5f5f66;--line:#e6e3e8;--bg:#f7f6f8;font:inherit;color:inherit}' +
    '*{box-sizing:border-box}.w{display:grid;gap:14px}h1{font-size:1.5em;line-height:1.25;margin:0}h2{font-size:1.05em;margin:0 0 6px}' +
    '.chips{display:flex;flex-wrap:wrap;gap:6px}.chip{background:var(--bg);color:var(--soft);border-radius:999px;padding:3px 10px;font-size:.85em;font-weight:600}' +
    'video,audio{display:block;width:100%;border-radius:12px}video{background:#111;max-height:70vh}' +
    '.card{border:1px solid var(--line);border-radius:14px;padding:14px 16px}.card p{margin:0 0 8px}.card ul{margin:0 0 8px;padding-left:20px}' +
    '.ts{font:inherit;font-size:.8em;font-weight:700;color:var(--accent);background:var(--bg);border:0;border-radius:6px;padding:1px 6px;margin-right:6px;cursor:pointer}' +
    '.todo{list-style:none;padding:0!important}.todo li:before{content:"\\2610  ";color:var(--accent)}.todo li.d{color:var(--soft);text-decoration:line-through}.todo li.d:before{content:"\\2611  "}' +
    'ul[data-checks]{list-style:none;padding-left:0}ul[data-checks] li:before{content:"\\2610  ";color:var(--accent)}ul[data-checks] li[data-done="1"]:before{content:"\\2611  "}' +
    '.tr{display:grid;gap:4px;max-height:420px;overflow:auto}.tr p{margin:0}.tr b{font-weight:700}' +
    'ol.steps{list-style:none;margin:0;padding:0;display:grid;gap:14px}ol.steps li{border:1px solid var(--line);border-radius:14px;padding:14px}' +
    '.head{display:flex;gap:10px;align-items:flex-start;margin-bottom:10px;font-weight:600}.n{flex:none;width:28px;height:28px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;font-size:.85em}' +
    '.tip{background:#fdf3dc;border-radius:10px;padding:8px 10px;margin:0 0 10px}.pic{position:relative;border-radius:10px;overflow:hidden;border:1px solid var(--line)}.pic img{display:block;width:100%}' +
    '.ring{position:absolute;border:3px solid var(--accent);border-radius:8px;box-shadow:0 0 0 4px rgba(145,64,176,.22)}.err{color:#b42318}';

  function base(el) {
    var root = el.shadowRoot || el.attachShadow({ mode: 'open' });
    var accent = el.getAttribute('accent');
    root.innerHTML = '<style>' + CSS + (accent && /^#[0-9a-f]{3,8}$/i.test(accent) ? ':host{--accent:' + accent + '}' : '') + '</style><div class="w">Loading…</div>';
    return root;
  }
  function hidden(el, part) { return (' ' + (el.getAttribute('hide') || '') + ' ').indexOf(' ' + part + ' ') > -1; }
  function load(el, draw) {
    var root = base(el), src = el.getAttribute('src');
    var got = el.data ? Promise.resolve(el.data) : fetch(src, { credentials: el.hasAttribute('with-credentials') ? 'include' : 'same-origin' }).then(function (r) {
      if (!r.ok) throw new Error('Could not load it (' + r.status + ').');
      return r.json();
    });
    got.then(function (d) { root.querySelector('.w').innerHTML = draw(d); wire(root); }, function (e) {
      root.querySelector('.w').innerHTML = '<p class="err">' + esc(e.message || e) + '</p>';
    });
  }
  function wire(root) {
    root.addEventListener('click', function (e) {
      var t = e.target.closest('.ts'), m = root.querySelector('video,audio');
      if (t && m) { m.currentTime = Math.max(0, +t.dataset.t - (+m.dataset.from || 0)); m.play(); }
    });
  }

  function noteHtml(el, n) {
    var s = n.summary, h = '<h1>' + esc(n.title) + '</h1><div class="chips"><span class="chip">' + ({ call: 'Call', video: 'Video', audio: 'Voice note' }[n.kind] || 'Recording') + '</span>' +
      (n.seconds ? '<span class="chip">' + clock(n.trim ? n.trim.to - n.trim.from : n.seconds) + '</span>' : '') +
      (n.createdAt ? '<span class="chip">' + esc(new Date(n.createdAt).toLocaleDateString([], { dateStyle: 'medium' })) + '</span>' : '') + '</div>';
    var media = el.getAttribute('media');
    // a trimmed note's file is already only the kept part: its times start at the trim
    if (media) h += (/\.(mp4|webm|mov)$/i.test(media) && n.kind !== 'audio' ? '<video controls preload="metadata"' : '<audio controls preload="metadata"') +
      ' src="' + esc(media) + '" data-from="' + (n.trim ? +n.trim.from || 0 : 0) + '"></' + (n.kind !== 'audio' && /\.(mp4|webm|mov)$/i.test(media) ? 'video' : 'audio') + '>';
    if (s && !hidden(el, 'summary')) {
      h += '<div class="card"><h2>Summary</h2><p>' + esc(s.short || s.overview || '') + '</p>' + (s.sections || []).filter(function (x) { return x.points && x.points.length; }).map(function (x) {
        return '<h2>' + esc(x.heading) + '</h2><ul>' + x.points.map(function (p) { return '<li>' + esc(p) + '</li>'; }).join('') + '</ul>';
      }).join('') + '</div>';
    }
    if (s && s.actions && s.actions.length && !hidden(el, 'todos')) {
      h += '<div class="card"><h2>Next steps</h2><ul class="todo">' + s.actions.map(function (a) {
        return '<li class="' + (a.done ? 'd' : '') + '">' + esc(a.text) + (a.owner ? ' <em>(' + esc(a.owner) + ')</em>' : '') + '</li>';
      }).join('') + '</ul></div>';
    }
    if (s && s.ideas && s.ideas.length && !hidden(el, 'ideas')) h += '<div class="card"><h2>Ideas</h2>' + s.ideas.map(function (x) { return '<p>' + ts(x.at) + esc(x.text) + '</p>'; }).join('') + '</div>';
    if (s && s.mood && s.mood.overall && !hidden(el, 'mood')) {
      h += '<div class="card"><h2>Mood</h2><p><span class="chip">' + esc(s.mood.overall.charAt(0).toUpperCase() + s.mood.overall.slice(1)) + '</span> ' + esc(s.mood.why || '') + '</p>' +
        (s.mood.moments || []).map(function (m) { return '<p>' + ts(m.at) + esc(m.what) + '</p>'; }).join('') + '</div>';
    }
    if (s && s.chapters && s.chapters.length && !hidden(el, 'chapters')) h += '<div class="card"><h2>Chapters</h2>' + s.chapters.map(function (c) { return '<p>' + ts(c.at) + esc(c.title) + '</p>'; }).join('') + '</div>';
    if (n.notes && n.notes.html && !hidden(el, 'notes')) h += '<div class="card"><h2>Notes</h2>' + safe(n.notes.html) + '</div>';
    var u = n.transcript && n.transcript.utterances;
    if (u && u.length && !hidden(el, 'transcript')) h += '<div class="card"><h2>Transcript</h2><div class="tr">' + u.map(function (x) {
      return '<p>' + ts(x.start) + (x.speaker ? '<b>' + esc(x.speaker) + '</b> ' : '') + esc(x.text) + '</p>';
    }).join('') + '</div></div>';
    return h;
  }
  function guideHtml(el, g) {
    return '<h1>' + esc(g.title) + '</h1>' + (g.intro ? '<p>' + esc(g.intro) + '</p>' : '') + '<ol class="steps">' + (g.steps || []).map(function (s) {
      var hl = s.highlight, img = s.image ? (s.image.url ? s.image.url : 'data:' + s.image.type + ';base64,' + s.image.data) : '';
      return '<li><div class="head"><span class="n">' + s.n + '</span><span>' + esc(s.sentence) + '</span></div>' + (s.note ? '<p class="tip">' + esc(s.note) + '</p>' : '') +
        (img ? '<div class="pic"><img alt="Step ' + s.n + '" src="' + esc(img) + '">' + (hl ? '<span class="ring" style="left:' + hl.x + '%;top:' + hl.y + '%;width:' + hl.w + '%;height:' + hl.h + '%"></span>' : '') + '</div>' : '') + '</li>';
    }).join('') + '</ol>';
  }
  function define(name, draw) {
    if (customElements.get(name)) return;
    customElements.define(name, class extends HTMLElement {
      static get observedAttributes() { return ['src', 'media', 'hide', 'accent']; }
      connectedCallback() { var me = this; load(this, function (d) { return draw(me, d); }); }
      attributeChangedCallback() { if (this.isConnected) this.connectedCallback(); }
    });
  }
  define('orbit-note', noteHtml);
  define('orbit-guide', guideHtml);
})();
