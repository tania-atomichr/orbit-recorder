/* RECORDING A CALL WITH NO WINDOW. On a Meet, Zoom or Teams tab, the Record
   button on the call's card (or the toolbar icon, or Alt+Shift+R) has Chrome
   hand this hidden page the call tab's sound, and its picture when Video is
   on, with no share box and nothing to pick.

   This page adds your microphone, plays the call back so you still hear it
   (a captured tab goes quiet otherwise), and writes the recording to the
   extension's storage every five seconds. The bar on the call shows the
   time, You and Them levels, Pause and Stop; the background passes this
   page's news to it. Playing the call back from the call's own tab would
   record itself in a loop, which is why this is a separate page. */
(function () {
  'use strict';
  var TAB = null, VIDEO = false, WHERE = 'Meet';
  var tab = null, mic = null, ctx = null, rec = null, snd = null, id = null, writes = Promise.resolve();
  var you = null, them = null, began = 0, pausedAt = 0, pausedTotal = 0, tick = null;
  var heardThem = false, quietSince = 0;

  function tell(msg) { chrome.runtime.sendMessage({ type: 'to-tab', tab: TAB, msg: msg }, function () { void chrome.runtime.lastError; }); }
  function elapsed() { return (pausedAt || Date.now()) - began - pausedTotal; }
  function peak(an, buf) {
    an.getByteTimeDomainData(buf);
    var p = 0;
    for (var i = 0; i < buf.length; i++) { var v = Math.abs(buf[i] - 128); if (v > p) p = v; }
    return p;
  }
  function cleanup() {
    clearInterval(tick); tick = null;
    [tab, mic].forEach(function (s) { if (s) s.getTracks().forEach(function (t) { t.stop(); }); });
    tab = mic = null;
    if (ctx && ctx.close) ctx.close();
    ctx = null; you = them = null;
  }

  function start(msg) {
    TAB = msg.tab; VIDEO = !!msg.video; WHERE = msg.where || 'Meet';
    var src = { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: msg.id } };
    var vid = VIDEO ? { mandatory: { chromeMediaSource: 'tab', chromeMediaSourceId: msg.id, maxWidth: 1280, maxHeight: 720, maxFrameRate: 24 } } : false;
    navigator.mediaDevices.getUserMedia({ audio: src, video: vid }).then(function (s) {
      tab = s;
      // The microphone needs one Allow on the welcome page; this hidden page
      // cannot ask. Without it only the call's side is recorded.
      return navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
        .then(function (m) { mic = m; }, function () { mic = null; });
    }).then(begin).catch(function (e) {
      cleanup();
      tell({ type: 'capture-failed', error: 'Chrome did not hand over the call (' + ((e && e.name) || 'error') + '). Press Record to pick it yourself.' });
      chrome.runtime.sendMessage({ type: 'off-done' });
    });
  }

  function begin() {
    ctx = new AudioContext();
    var out = ctx.createMediaStreamDestination();
    var tabSrc = ctx.createMediaStreamSource(new MediaStream(tab.getAudioTracks()));
    tabSrc.connect(out);
    tabSrc.connect(ctx.destination);        // keep hearing the call
    them = ctx.createAnalyser(); them.fftSize = 256; tabSrc.connect(them);
    if (mic) {
      var micSrc = ctx.createMediaStreamSource(mic);
      micSrc.connect(out);
      you = ctx.createAnalyser(); you.fftSize = 256; micSrc.connect(you);
    }
    var type, opts;
    if (VIDEO && tab.getVideoTracks().length) {
      type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm'].filter(function (k) { return MediaRecorder.isTypeSupported(k); })[0] || '';
      opts = type ? { mimeType: type, videoBitsPerSecond: 1200000, audioBitsPerSecond: 96000 } : undefined;
      rec = new MediaRecorder(new MediaStream(tab.getVideoTracks().concat(out.stream.getAudioTracks())), opts);
      // the same sound on its own, small, kept whatever happens to the picture
      var st = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      try { snd = new MediaRecorder(out.stream, st ? { mimeType: st, audioBitsPerSecond: 48000 } : undefined); } catch (e) { snd = null; }
    } else {
      VIDEO = false;
      type = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      rec = new MediaRecorder(out.stream, type ? { mimeType: type, audioBitsPerSecond: 48000 } : undefined);
    }
    var made = Recordings.begin({ kind: 'call', where: WHERE, video: VIDEO,
                                  mime: rec.mimeType || (VIDEO ? 'video/webm' : 'audio/webm') }).then(function (x) { id = x; return x; });
    function keep(part) {
      return function (e) {
        if (!e.data || !e.data.size) return;
        var blob = e.data;
        writes = writes.then(function () { return made; }).then(function (x) { return Recordings.piece(x, part, blob); }).catch(function () {});
      };
    }
    rec.ondataavailable = keep('main');
    if (snd) snd.ondataavailable = keep('sound');
    // finished once both recorders have handed over their last piece
    var waiting = snd ? 2 : 1;
    function lastOne() {
      if (--waiting > 0) return;
      var secs = Math.round(elapsed() / 1000);
      cleanup();
      setTimeout(function () {
        writes.then(function () { return made; }).then(function (x) { return Recordings.finish(x, secs); }).then(function (n) {
          chrome.runtime.sendMessage({ type: 'rec-done', id: n ? n.id : null, tab: TAB, from: 'call' }, function () { void chrome.runtime.lastError; });
          chrome.runtime.sendMessage({ type: 'off-done' });
        }, function () {
          tell({ type: 'failed', error: 'It could not be saved. What was recorded is kept and will be put together when Chrome restarts.' });
          chrome.runtime.sendMessage({ type: 'off-done' });
        });
      }, 300);
    }
    if (snd) snd.onstop = lastOne;
    rec.onstop = function () { lastOne(); tell({ type: 'rec-saving', video: VIDEO }); };
    // the call tab closed or left the call: stop and keep what was said
    tab.getTracks().forEach(function (t) { t.addEventListener('ended', stop); });
    rec.start(5000);
    if (snd) { try { snd.start(5000); } catch (e) { snd = null; waiting = 1; } }
    began = Date.now(); pausedTotal = 0; pausedAt = 0; quietSince = Date.now();
    tell({ type: 'rec-live', video: VIDEO, mic: !!mic });
    LiveWords.start(out.stream, function (text, final) { tell({ type: 'rec-words', text: text, final: final }); }).then(function (l) { live = l; });
    var bufY = new Uint8Array(128), bufT = new Uint8Array(128), hy = 0, ht = 0;
    tick = setInterval(function () {
      var paused = rec && rec.state === 'paused';
      var py = you && !paused ? peak(you, bufY) : 0, pt = them && !paused ? peak(them, bufT) : 0;
      hy = Math.max(py, hy * 0.6); ht = Math.max(pt, ht * 0.6);
      if (pt > 3) { heardThem = true; quietSince = Date.now(); }
      var quiet = !paused && Date.now() - quietSince > 20000;
      tell({ type: 'rec-level', you: hy, them: ht, t: elapsed(), paused: paused, quiet: quiet, heard: heardThem });
    }, 250);
  }

  function pause() {
    if (!rec) return;
    if (rec.state === 'recording') { rec.pause(); if (snd) snd.pause(); pausedAt = Date.now(); }
    else if (rec.state === 'paused') { rec.resume(); if (snd) snd.resume(); pausedTotal += Date.now() - pausedAt; pausedAt = 0; quietSince = Date.now(); }
  }
  var live = null;
  function stop() { if (live) live.stop(); if (snd && snd.state !== 'inactive') snd.stop(); if (rec && rec.state !== 'inactive') rec.stop(); }

  chrome.runtime.onMessage.addListener(function (msg, sender) {
    if (msg.type === 'off-stop' && !sender.tab) { stop(); return; }   // the toolbar pressed again
    if (!sender.tab || sender.tab.id !== TAB) return;
    if (msg.type === 'rec-stop') stop();                              // Pause and Stop on the bar
    else if (msg.type === 'rec-pause') pause();
  });
  // ask the background what to record
  chrome.runtime.sendMessage({ type: 'off-ready' }, function (m) { void chrome.runtime.lastError; if (m && m.id) start(m); });
})();
