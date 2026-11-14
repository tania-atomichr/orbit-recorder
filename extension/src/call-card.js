/* THE CARD ON A CALL. On Google Meet, Zoom in the browser or Teams in the
   browser it offers "Record this meeting?" with a Video switch. Record
   starts at once when Chrome hands the call over (offscreen.js); otherwise
   a small Orbit window opens where you pick the call's tab yourself
   (screen.js). While it records, a bar shows the time, a level for You and
   one for Them, Pause and Stop. It can be dragged anywhere and made small.
   Then "Saved", with a button that opens the note.

   Everything lives in a shadow root, so the meeting's styles never touch it
   and it never touches theirs. */
(function () {
  'use strict';
  /* One card per call, even after the extension is updated: Chrome does not
     put a new copy into tabs that were already open, so the background puts
     it in (putIntoCalls), and a copy left from before steps aside. */
  var ME = 'orbit:' + chrome.runtime.id + ':' + chrome.runtime.getManifest().version;
  if (document.documentElement.getAttribute('data-orbit-recorder') === ME && window.__orbitAlive && window.__orbitAlive()) return;
  window.__orbitAlive = function () { try { return !!chrome.runtime.id; } catch (e) { return false; } };
  document.documentElement.setAttribute('data-orbit-recorder', ME);
  Array.prototype.forEach.call(document.querySelectorAll('#orbit-recorder'), function (old) { old.remove(); });

  var MARK = chrome.runtime.getURL('icons/icon-48.png');
  var KEYS = /Mac/.test(navigator.platform) ? '⌥ Shift R' : 'Alt Shift R';
  var announced = false, how = 'direct', savedId = null;

  function announce() {
    announced = true;
    try { chrome.runtime.sendMessage({ type: 'on-call', video: withVideo, where: where() }, function () { void chrome.runtime.lastError; }); } catch (e) {}
  }
  function unannounce() {
    if (!announced) return;
    announced = false;
    try { chrome.runtime.sendMessage({ type: 'off-call' }, function () { void chrome.runtime.lastError; }); } catch (e) {}
  }
  window.addEventListener('pagehide', unannounce);

  function inMeeting() {
    var h = location.hostname, p = location.pathname;
    // the meeting code anywhere in the path (a tab, or Meet's installed app window), or a Leave call button
    if (h === 'meet.google.com') {
      return /(^|\/)[a-z]{3}-[a-z]{4}-[a-z]{3}(\/|$)/.test(p) || !!document.querySelector('[aria-label="Leave call"]');
    }
    if (/(^|\.)zoom\.us$/.test(h)) return /^\/wc\/\d+\/(join|start)/.test(p) || /^\/wc\/join/.test(p);
    if (/teams\.(microsoft|live)\.com$/.test(h)) {
      return !!document.querySelector('#hangup-button, [data-tid="hangup-main-btn"], [data-tid="call-hangup"], button[aria-label^="Leave"]');
    }
    return false;
  }
  function where() { var h = location.hostname; return h === 'meet.google.com' ? 'Meet' : (/zoom/.test(h) ? 'Zoom' : 'Teams'); }

  var CSS = [
    ':host{all:initial}', '[hidden]{display:none!important}',
    '*{box-sizing:border-box;font-family:"League Spartan",system-ui,-apple-system,sans-serif}',
    '.offer{position:fixed;top:16px;left:12px;right:12px;margin:0 auto;width:max-content;max-width:calc(100vw - 24px);z-index:2147483647;display:flex;align-items:center;gap:14px;',
    'background:#fff;color:#111;border-radius:999px;padding:12px 12px 12px 18px;box-shadow:0 6px 24px rgba(0,0,0,.18),0 0 0 1px rgba(0,0,0,.06);cursor:grab;touch-action:none;user-select:none}',
    '.offer.dragging{cursor:grabbing;box-shadow:0 12px 36px rgba(0,0,0,.32)}',
    '.offer button{cursor:pointer}',
    '.offer>img{width:32px;height:32px;display:block;flex:none}',
    '.t{display:flex;flex-direction:column;line-height:1.2;min-width:0}',
    '.t b{font-size:16px;font-weight:600}.t span{font-size:12.5px;color:#5f5f66}.t span.err{color:#a92e64;font-weight:600}',
    '.t .tip{font-size:12px;color:#111;margin-top:3px}.t .tip kbd{font:inherit;font-weight:600;background:#f1f1f1;border-radius:5px;padding:0 5px}',
    '.go{font:inherit;font-size:14px;font-weight:600;background:#111;color:#fff;border:0;border-radius:999px;padding:10px 16px;flex:none}.go:hover{background:#333}',
    '.go.rec1{display:inline-flex;align-items:center;gap:8px;font-size:15px;padding:11px 18px}.go.rec1 i{display:block;width:10px;height:10px;border-radius:50%;background:#e04848}',
    '.ghost{font:inherit;font-size:14px;font-weight:600;background:#f1f1f1;color:#111;border:0;border-radius:999px;padding:10px 16px;flex:none}.ghost:hover{background:#e6e6e6}',
    '.stopb{background:#9140B0}.stopb:hover{background:#6e2c88}',
    '.x{font:inherit;width:30px;height:30px;border-radius:50%;border:0;background:#f1f1f1;color:#555;font-size:16px;line-height:30px;text-align:center;padding:0;flex:none}.x:hover{background:#e6e6e6;color:#111}',
    'button:focus-visible{outline:none;box-shadow:0 0 0 3px #fff,0 0 0 5px #9140B0}',
    '.vid{display:flex;align-items:center;gap:8px;flex:none;font-size:13px;font-weight:600;color:#111;background:none;border:0;padding:4px 2px;font-family:inherit}',
    '.vid i{position:relative;display:block;width:34px;height:20px;border-radius:999px;background:#d9d4dc;transition:background .15s}',
    '.vid i:after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .15s}',
    '.vid[aria-checked="true"] i{background:#9140B0}.vid[aria-checked="true"] i:after{left:16px}',
    '.dot{display:block;width:12px;height:12px;border-radius:50%;background:#e04848;flex:none;animation:b 1.4s ease-in-out infinite}',
    '.paused .dot{background:#9b9b9b;animation:none}@keyframes b{50%{opacity:.35}}',
    '.tm{font-variant-numeric:tabular-nums}',
    '.meters{display:grid;gap:4px;flex:none;width:120px}',
    '.mt{display:grid;grid-template-columns:38px 1fr;align-items:center;gap:6px;font-size:11px;font-weight:600;color:#5f5f66}.mt em{font-style:normal}',
    '.mb{display:block;height:6px;border-radius:3px;background:#eee;overflow:hidden}.mb i{display:block;height:100%;width:0;background:#9140B0;border-radius:3px;transition:width .1s}',
    '.mt.quiet em{color:#a92e64}.mt.quiet .mb i{background:#a92e64}',
    '.ask{position:fixed;top:96px;left:12px;right:12px;margin:0 auto;width:max-content;max-width:min(460px,calc(100vw - 24px));z-index:2147483647;background:#111;color:#fff;border-radius:16px;',
    'padding:12px 40px 12px 14px;box-shadow:0 6px 24px rgba(0,0,0,.25);font-size:13px;line-height:1.4;display:grid;gap:4px}',
    '.ask b{font-size:13px;font-weight:600}.ask .x{position:absolute;top:8px;right:8px;width:24px;height:24px;line-height:24px;font-size:14px;background:#2a2a2a;color:#fff}',
    '.ask.warn{background:#a92e64;padding-right:14px}',
    '.small{gap:8px;padding:5px 5px 5px 12px}.small .t>span,.small .meters,.small .ghost{display:none}.small .t b{font-size:13px}.small .stopb{padding:6px 12px;font-size:13px}',
    '.grip{flex:none;width:6px;height:16px;margin-right:-6px;opacity:.55;background-image:radial-gradient(circle,#111 1.2px,transparent 1.5px);background-size:6px 5.5px;background-position:center}',
    '.pad{position:fixed;top:84px;left:12px;right:12px;margin:0 auto;width:min(460px,calc(100vw - 24px));z-index:2147483647;background:#fff;color:#111;border-radius:16px;',
    'padding:10px;box-shadow:0 6px 24px rgba(0,0,0,.22);display:grid;gap:6px;font-size:13px}',
    '.pad textarea{font:inherit;font-size:14px;border:1px solid #e6e3e8;border-radius:10px;padding:8px 10px;resize:none;height:56px;outline:none}.pad textarea:focus{border-color:#9140B0}',
    '.pad .kept{color:#5f5f66;max-height:90px;overflow:auto}.pad .kept p{margin:0}.pad .kept em{font-style:normal;font-weight:700;color:#6e2c88;margin-right:6px}',
    '.words{position:fixed;bottom:96px;left:12px;right:12px;margin:0 auto;width:max-content;max-width:min(640px,calc(100vw - 24px));z-index:2147483647;background:rgba(17,17,17,.82);',
    'color:#fff;border-radius:12px;padding:8px 14px;font-size:15px;line-height:1.4;pointer-events:none}.words:empty{display:none}.words i{font-style:normal;opacity:.7}',
    '@media (max-width:640px){.meters,.t .tip{display:none}.offer{border-radius:22px;flex-wrap:wrap;row-gap:8px}}',
    '@media (prefers-reduced-motion:reduce){.mb i{transition:none}.dot{animation:none}}'
  ].join('');

  var host = document.createElement('div');
  host.id = 'orbit-recorder';
  var root = host.attachShadow({ mode: 'open' });
  var style = document.createElement('style'); style.textContent = CSS; root.appendChild(style);
  var box = document.createElement('div'); root.appendChild(box);
  /* Meet can draw its join screen as a modal in the top layer, which no
     z-index beats, so the card lives in the top layer itself (a manual
     popover) and moves inside any modal that opens. */
  host.setAttribute('popover', 'manual');
  host.style.cssText = 'position:fixed;inset:0 auto auto 0;width:0;height:0;margin:0;padding:0;border:0;background:transparent;overflow:visible;color:inherit';
  function mount() {
    var at = null;
    try { var all = document.querySelectorAll(':modal'); at = all[all.length - 1] || null; } catch (e) {}
    at = at || document.documentElement;
    if (host.parentNode !== at) at.appendChild(host);
    try { if (host.showPopover && !host.matches(':popover-open')) host.showPopover(); } catch (e) {}
  }

  /* DRAG IT ANYWHERE: the spot is kept per site and pulled back inside a smaller window. */
  var POS_KEY = 'barPos:' + location.host, pos = null, small = false;
  try { chrome.storage.local.get(['barSmall', POS_KEY], function (r) { small = !!(r && r.barSmall); pos = (r && r[POS_KEY]) || null; place(); }); } catch (e) {}
  function inside(o, x, y) {
    return { x: Math.round(Math.max(8, Math.min(x, innerWidth - o.offsetWidth - 8))), y: Math.round(Math.max(8, Math.min(y, innerHeight - o.offsetHeight - 8))) };
  }
  function put(o, p) { o.style.left = p.x + 'px'; o.style.top = p.y + 'px'; o.style.right = 'auto'; o.style.margin = '0'; }
  function place() { var o = box.querySelector('.offer'); if (!o) return; if (!o.dataset.drag) grab(o); if (pos) put(o, inside(o, pos.x, pos.y)); }
  function grab(o) {
    o.dataset.drag = '1'; o.title = 'Drag to move';
    var g = el('span', 'grip'); g.setAttribute('aria-hidden', 'true'); o.insertBefore(g, o.firstChild);
    var dx = 0, dy = 0, pid = null;
    o.addEventListener('pointerdown', function (e) {
      if (e.button !== 0 || e.target.closest('button,a,[role=switch]')) return;
      var r = o.getBoundingClientRect(); dx = e.clientX - r.left; dy = e.clientY - r.top; pid = e.pointerId;
      o.setPointerCapture(pid); o.classList.add('dragging'); e.preventDefault();
    });
    o.addEventListener('pointermove', function (e) { if (e.pointerId !== pid) return; pos = inside(o, e.clientX - dx, e.clientY - dy); put(o, pos); });
    function drop(e) {
      if (e.pointerId !== pid) return;
      pid = null; o.classList.remove('dragging');
      if (pos) { var w = {}; w[POS_KEY] = pos; try { chrome.storage.local.set(w); } catch (err) {} }
    }
    o.addEventListener('pointerup', drop); o.addEventListener('pointercancel', drop);
  }
  new MutationObserver(place).observe(box, { childList: true });
  addEventListener('resize', place);

  var dismissedFor = null, phase = 'idle';       // idle | offer | starting | waiting | live | saving | done
  var withVideo = false, recVideo = false;
  try { chrome.storage.local.get('callVideo', function (r) { withVideo = !!(r && r.callVideo); syncVid(); }); } catch (e) {}
  var syncVid = function () {};

  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text) n.textContent = text; return n; }
  function btn(cls, text) { var b = el('button', cls, text); b.type = 'button'; return b; }
  function mmss(ms) {
    var s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return (h ? h + ':' + ('0' + m).slice(-2) : m) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function remote(type) { try { chrome.runtime.sendMessage({ type: type }, function () { void chrome.runtime.lastError; }); } catch (e) {} }
  function mark() { var i = el('img'); i.src = MARK; i.alt = ''; return i; }

  function showOffer(note) {
    phase = 'offer';
    box.innerHTML = '';
    var o = el('div', 'offer'); o.setAttribute('role', 'dialog'); o.setAttribute('aria-label', 'Record this meeting?');
    var t = el('div', 't');
    t.appendChild(el('b', '', 'Record this meeting?'));
    var sub = el('span'); t.appendChild(sub);
    var tip = el('span', 'tip'); tip.appendChild(document.createTextNode('Or press ')); tip.appendChild(el('kbd', '', KEYS)); tip.appendChild(document.createTextNode(' any time on a call'));
    t.appendChild(tip);
    function say() {
      sub.className = note ? 'err' : '';
      sub.textContent = note || (withVideo ? 'Both sides, with the picture. Kept in your browser.' : 'Both sides of the call. Kept in your browser.');
    }
    var vid = btn('vid'); vid.setAttribute('role', 'switch');
    vid.appendChild(el('i')); vid.appendChild(document.createTextNode('Video'));
    vid.addEventListener('click', function () {
      withVideo = !withVideo; vid.setAttribute('aria-checked', String(withVideo));
      try { chrome.storage.local.set({ callVideo: withVideo }); } catch (e) {}
      announce(); say();
    });
    syncVid = function () { vid.setAttribute('aria-checked', String(withVideo)); say(); };
    syncVid();
    var go = btn('go rec1'); go.appendChild(el('i')); go.appendChild(document.createTextNode('Record'));
    var x = btn('x', '×'); x.setAttribute('aria-label', 'Not this meeting'); x.title = 'Not this meeting';
    go.addEventListener('click', start);
    x.addEventListener('click', function () { dismissedFor = location.pathname; phase = 'idle'; box.innerHTML = ''; });
    o.appendChild(mark()); o.appendChild(t); o.appendChild(vid); o.appendChild(go); o.appendChild(x);
    box.appendChild(o);
    announce(); mount();
  }

  function showWaiting() {
    phase = 'waiting';
    box.innerHTML = '';
    var b = el('div', 'offer'); b.setAttribute('role', 'status');
    var t = el('div', 't');
    t.appendChild(el('b', '', 'Not recording yet'));
    t.appendChild(el('span', '', 'A small Orbit window opened. In Chrome’s box pick this call’s tab, keep “Also share tab audio” on, then Share.'));
    var show = btn('go', 'Show it'); show.addEventListener('click', function () { remote('screen-focus'); });
    var x = btn('x', '×'); x.setAttribute('aria-label', 'Cancel'); x.addEventListener('click', function () { remote('screen-cancel'); showOffer(); });
    b.appendChild(mark()); b.appendChild(t); b.appendChild(show); b.appendChild(x);
    box.appendChild(b); mount();
  }

  var tmEl = null, barEl = null, quietEl = null, youEl = null, themEl = null;
  function showBar() {
    box.innerHTML = '';
    var b = el('div', 'offer rec'); b.setAttribute('role', 'group'); b.setAttribute('aria-label', 'Orbit is recording this call');
    var t = el('div', 't'), head = el('b');
    tmEl = el('span', 'tm', '0:00');
    head.appendChild(document.createTextNode('Recording ')); head.appendChild(tmEl);
    t.appendChild(head);
    t.appendChild(el('span', '', recVideo ? 'Video and sound' : 'Sound only'));
    var lv = el('div', 'meters');
    function meter(label) { var m = el('span', 'mt'); m.appendChild(el('em', '', label)); var bar = el('span', 'mb'); bar.appendChild(el('i')); m.appendChild(bar); lv.appendChild(m); return bar.firstChild; }
    youEl = meter('You'); themEl = meter('Them');
    var pause = btn('ghost', 'Pause'), note = btn('ghost', 'Note'), stopB = btn('go stopb', 'Stop'), size = btn('x');
    note.title = 'Type a note while it records'; note.setAttribute('aria-label', note.title);
    note.addEventListener('click', togglePad);
    function sized() {
      b.classList.toggle('small', small);
      size.textContent = small ? '+' : '–';
      size.setAttribute('aria-label', small ? 'Make it bigger' : 'Make it smaller'); size.title = size.getAttribute('aria-label');
      place();
    }
    size.addEventListener('click', function () { small = !small; sized(); try { chrome.storage.local.set({ barSmall: small }); } catch (e) {} });
    b.appendChild(el('i', 'dot')); b.appendChild(t); b.appendChild(lv); b.appendChild(pause); b.appendChild(note); b.appendChild(stopB); b.appendChild(size);
    sized();
    box.appendChild(b);
    quietEl = el('div', 'ask warn', how === 'direct'
      ? 'Nothing heard from the call yet. If the other side has spoken, check the call’s sound is on.'
      : 'Nothing heard from the call yet. If the other side has spoken, Stop and pick the call again with “Also share tab audio” on.');
    quietEl.setAttribute('role', 'status'); quietEl.hidden = true;
    box.appendChild(quietEl);
    stopB.addEventListener('click', function () { phase = 'saving'; remote('rec-stop'); });
    pause.addEventListener('click', function () { remote('rec-pause'); });
    wordsEl = el('div', 'words'); wordsEl.setAttribute('aria-live', 'polite');
    box.appendChild(wordsEl);
    if (typed.length) togglePad();
    barEl = b; mount();
  }
  /* NOTES WHILE IT RECORDS: each line is kept with the time it was typed at,
     and goes into the note's own notes when the recording is saved. */
  var typed = [], lastT = 0, padEl = null, wordsEl = null, lastFinal = '';
  function togglePad() {
    if (padEl && padEl.isConnected) { padEl.remove(); padEl = null; return; }
    padEl = el('div', 'pad');
    var kept = el('div', 'kept'), ta = el('textarea');
    ta.placeholder = 'Type a note. Enter keeps it with the time.';
    function draw() {
      kept.textContent = '';
      typed.forEach(function (x) { var p = el('p'); p.appendChild(el('em', '', mmss(x.t * 1000))); p.appendChild(document.createTextNode(x.text)); kept.appendChild(p); });
      kept.scrollTop = kept.scrollHeight;
    }
    ta.addEventListener('keydown', function (e) {
      e.stopPropagation();                         // the call's own shortcuts stay out of it
      if (e.key !== 'Enter' || e.shiftKey) return;
      e.preventDefault();
      var text = ta.value.trim();
      if (!text) return;
      var line = { t: Math.round(lastT / 1000), text: text.slice(0, 2000) };
      typed.push(line); ta.value = ''; draw();
      try { chrome.runtime.sendMessage({ type: 'rec-typed', line: line }, function () { void chrome.runtime.lastError; }); } catch (err) {}
    });
    ['keyup', 'keypress'].forEach(function (k) { ta.addEventListener(k, function (e) { e.stopPropagation(); }); });
    padEl.appendChild(kept); padEl.appendChild(ta);
    draw();
    box.appendChild(padEl);
    ta.focus();
  }
  function showWords(text, final) {
    if (!wordsEl) return;
    wordsEl.textContent = '';
    if (lastFinal && !final) { wordsEl.appendChild(el('i', '', lastFinal + ' ')); }
    wordsEl.appendChild(document.createTextNode(text));
    if (final) lastFinal = text;
  }
  function showLevel(msg) {
    if (!barEl) return;
    lastT = msg.t || 0;
    tmEl.textContent = mmss(lastT);
    barEl.classList.toggle('paused', !!msg.paused);
    var head = barEl.querySelector('.t b'); if (head && head.firstChild) head.firstChild.textContent = msg.paused ? 'Paused ' : 'Recording ';
    var p = barEl.querySelector('.ghost'); if (p) p.textContent = msg.paused ? 'Resume' : 'Pause';
    youEl.style.width = Math.min(100, Math.round((msg.you || 0) / 60 * 100)) + '%';
    themEl.style.width = Math.min(100, Math.round((msg.them || 0) / 60 * 100)) + '%';
    themEl.parentNode.parentNode.classList.toggle('quiet', !!msg.quiet);
    if (quietEl) quietEl.hidden = !msg.quiet;
  }
  function popup(cls, title, text, ms, action) {
    var c = el('div', 'ask' + (cls ? ' ' + cls : '')); c.setAttribute('role', 'status');
    c.appendChild(el('b', '', title));
    if (text) c.appendChild(el('span', '', text));
    if (action) c.appendChild(action);
    var ok = btn('x', '×'); ok.setAttribute('aria-label', 'Got it'); ok.addEventListener('click', function () { c.remove(); });
    c.appendChild(ok);
    box.appendChild(c);
    setTimeout(function () { if (c.isConnected) c.remove(); }, ms);
  }
  // everyone on a call should know it is recorded, and agree
  function consent() { popup('', 'Recording. Tell everyone on the call:', '“I’m recording this call for my notes, is that OK with you?”', 15000); }
  function micOff() {
    var a = btn('ghost', 'Allow the microphone'); a.style.justifySelf = 'start';
    a.addEventListener('click', function () { remote('open-welcome'); });
    popup('warn', 'Microphone off: only the call’s side is recorded.', '', 18000, a);
  }
  function showDone(title, text, busy) {
    barEl = null;
    box.innerHTML = '';
    var d = el('div', 'offer'); d.setAttribute('role', 'status');
    var t = el('div', 't'); t.appendChild(el('b', '', title)); t.appendChild(el('span', '', text));
    d.appendChild(mark()); d.appendChild(t);
    if (savedId) {
      var a = btn('go', 'Open it');
      a.addEventListener('click', function () { try { chrome.runtime.sendMessage({ type: 'open-note', id: savedId }); } catch (e) {} });
      d.appendChild(a);
    }
    if (!busy) {
      var x = btn('x', '×'); x.setAttribute('aria-label', 'Close');
      x.addEventListener('click', function () { phase = 'idle'; dismissedFor = location.pathname; box.innerHTML = ''; });
      d.appendChild(x);
    }
    box.appendChild(d); mount();
  }

  function start() {
    recVideo = withVideo; phase = 'starting';
    var go = root.querySelector('.go'); if (go) { go.disabled = true; go.lastChild.textContent = 'Starting…'; }
    try {
      chrome.runtime.sendMessage({ type: 'card-record', video: recVideo, where: where() }, function (r) {
        void chrome.runtime.lastError;
        if (phase !== 'starting') return;
        if (r && r.ok) return;                       // the hidden recorder says rec-live
        // Chrome did not hand the call over: the small window, where you pick it yourself
        chrome.runtime.sendMessage({ type: 'screen-start', setup: { what: 'call', video: recVideo, where: where(), cam: 'off', mic: 'default' } }, function (w) {
          void chrome.runtime.lastError;
          if (phase !== 'starting') return;
          if (w && w.ok) showWaiting(); else showOffer('The recorder did not open. Press Record again.');
        });
      });
    } catch (e) { showOffer(); }
  }

  chrome.runtime.onMessage.addListener(function (msg, _sender, reply) {
    if (msg.type === 'are-you-on-call') { reply(announced ? { call: { video: withVideo, where: where() } } : null); return; }
    if (msg.type === 'rec-live') {
      if (phase === 'live') return;
      recVideo = !!msg.video; how = msg.how === 'window' ? 'window' : 'direct'; phase = 'live'; savedId = null;
      typed = []; lastFinal = '';
      showBar();
      try { chrome.storage.local.get('consent', function (r) { if (!r || r.consent !== false) consent(); }); } catch (e) { consent(); }
      if (msg.mic === false) micOff();
    } else if (msg.type === 'capture-failed') {
      if (phase !== 'live' && phase !== 'saving') showOffer(msg.error || 'It did not start. Press Record again.');
    } else if (msg.type === 'rec-closed') {
      if (phase === 'waiting' || phase === 'starting') showOffer();
    } else if (msg.type === 'rec-words') {
      if (phase === 'live') showWords(msg.text || '', !!msg.final);
    } else if (msg.type === 'rec-level') {
      if (phase === 'live') showLevel(msg);
    } else if (msg.type === 'rec-saving') {
      if (phase === 'live' || phase === 'saving') { phase = 'saving'; showDone('Saving…', 'Putting the recording together.', true); }
    } else if (msg.type === 'saved') {
      phase = 'done'; savedId = msg.id || null;
      showDone('Saved', msg.id ? 'In your Orbit library. The write-up is being made in a tab beside this one.' : 'Nothing was recorded.');
    } else if (msg.type === 'failed') {
      phase = 'done'; showDone('Not saved yet', msg.error || 'Something went wrong.');
    }
  });

  // the card can be turned off in Settings; the toolbar icon still records
  var offerOn = true;
  try { chrome.storage.local.get('callCard', function (r) { offerOn = !r || r.callCard !== false; }); } catch (e) {}
  // Offer once per meeting, when the meeting starts; never while recording.
  var loop = setInterval(function () {
    var alive = false;
    try { alive = !!chrome.runtime.id; } catch (e) {}
    if (!alive) { clearInterval(loop); host.remove(); return; }    // this copy's extension was updated or removed
    var here = inMeeting();
    if (here && !announced) announce();
    else if (!here && announced && (phase === 'idle' || phase === 'offer')) unannounce();
    if (box.firstChild) mount();
    if (phase !== 'idle' && phase !== 'offer') return;
    if (here && phase === 'idle' && dismissedFor !== location.pathname && offerOn) showOffer();
    else if (!here && phase === 'offer') { phase = 'idle'; box.innerHTML = ''; }
  }, 1500);
})();
