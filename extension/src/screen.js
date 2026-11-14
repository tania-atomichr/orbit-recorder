/* THE RECORDING WINDOW: a video of your screen with your face in a round
   bubble in the corner (like Loom), a voice note, or a call picked by hand.

   The popup chooses what to record, the camera and the mic, and opens this
   small window, which asks the background what was chosen ('screen-setup')
   and starts straight away:

   This tab       Chrome hands over the tab the popup was opened on, with its
                  sound and no box to pick from. If Chrome refuses, its box
                  opens with tabs only.
   A window,      Chrome's box showing only that kind, with its sound when
   Whole screen   that is ticked.
   Part of the    Chrome's box for the screen, then this window grows and
   screen         shows it live: drag a box over the part to record. Only
                  that part is drawn into the video.
   Audio          no picture: the mic, and the computer's sound if chosen.
   A call         the card on a call could not get the call by itself: pick
                  the call's tab in Chrome's box. Both sides are recorded,
                  with the picture when the card's Video switch was on.

   With a camera chosen, the picture is MIXED here: each frame of what is
   shared is drawn with the camera as a round bubble, bottom left, so the
   bubble is in the recording whatever was shared.

   Every five seconds the recording is written to the extension's storage
   (recordings.js). Stop here, on the toolbar icon (badge REC) or with
   Chrome's Stop sharing; the note then opens in a tab. Closing this window
   stops and saves too. There is no time limit. */
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var display = null, mic = null, cam = null, mix = null, ctx = null, rec = null, snd = null, level = null, pcLevel = null;
  var began = 0, pausedAt = 0, pausedTotal = 0, tick = null, stopping = false;
  var setup = self.orbitScreenSetup(null), loud = false, crop = null;   // loud: a tab handed over goes quiet unless played back; crop: the part of the screen, as fractions
  var id = null, made = null, writes = Promise.resolve(), meetTab = null;

  function elapsed() { return (pausedAt || Date.now()) - began - pausedTotal; }
  function mmss(ms) {
    var s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return (h ? h + ':' + ('0' + m).slice(-2) : m) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function b64(buf) {
    var bytes = new Uint8Array(buf), s = '', CH = 0x8000;
    for (var i = 0; i < bytes.length; i += CH) s += String.fromCharCode.apply(null, bytes.subarray(i, i + CH));
    return btoa(s);
  }
  function size(w, h, corner) {
    var at = { width: w, height: h };
    // out of the way: the bottom left corner of the screen, as Loom sits
    if (corner && self.screen && screen.availHeight) {
      at.left = Math.round((screen.availLeft || 0) + 16);
      at.top = Math.round((screen.availTop || 0) + screen.availHeight - h - 16);
    }
    try { chrome.windows.getCurrent(function (win) { chrome.windows.update(win.id, at, function () { void chrome.runtime.lastError; }); }); } catch (e) {}
  }
  function cleanup() {
    clearInterval(tick); tick = null;
    if (mix) { mix.stop(); mix = null; }
    [display, mic, cam].forEach(function (s) { if (s) s.getTracks().forEach(function (t) { t.stop(); }); });
    display = mic = cam = null;
    if (ctx && ctx.close) ctx.close();
    ctx = null; level = null; pcLevel = null;
  }
  function done(text, link) {
    $('pick').hidden = $('live').hidden = true;
    $('done').hidden = false;
    $('done-t').textContent = text;
    var row = $('done-row');
    row.textContent = '';
    if (link) {
      var a = document.createElement('a');
      a.href = link.url; a.target = '_blank'; a.rel = 'noopener'; a.textContent = link.label;
      row.appendChild(a);
    }
    var close = document.createElement('button');
    close.className = 'ghost'; close.type = 'button'; close.textContent = 'Close';
    close.addEventListener('click', function () { window.close(); });
    row.appendChild(close);
  }
  function off() { chrome.runtime.sendMessage({ type: 'screen-off' }, function () { void chrome.runtime.lastError; }); }
  function media(c) { return navigator.mediaDevices.getUserMedia(c); }

  /* WHAT TO RECORD */
  function fromTab(id) {
    var src = { chromeMediaSource: 'tab', chromeMediaSourceId: id };
    return media({ audio: { mandatory: src }, video: { mandatory: Object.assign({ maxWidth: 1920, maxHeight: 1080, maxFrameRate: 30 }, src) } })
      .then(function (s) { loud = true; return s; });
  }
  function tabPass(tabId) {              // Chrome's pass for a tab, asked again from here
    return new Promise(function (ok, bad) {
      if (typeof tabId !== 'number') return bad(new Error('notab'));
      try {
        chrome.tabCapture.getMediaStreamId({ targetTabId: tabId }, function (id) {
          void chrome.runtime.lastError;
          if (id) ok(id); else bad(new Error('nopass'));
        });
      } catch (e) { bad(e); }
    });
  }
  function fromBox(kinds, say) {         // Chrome's own box, showing only these kinds
    $('pick-t').textContent = say;
    size(760, 620);                      // room for Chrome's box
    return new Promise(function (ok, bad) {
      chrome.desktopCapture.chooseDesktopMedia(kinds, function (id, opts) {
        if (!id) return bad(new Error('closed'));          // closed Chrome's box: nothing to keep
        var src = { chromeMediaSource: 'desktop', chromeMediaSourceId: id };
        var audio = opts && opts.canRequestAudioTrack ? { mandatory: src } : false;
        media({ audio: audio, video: { mandatory: Object.assign({ maxWidth: 1920, maxHeight: 1080, maxFrameRate: 30 }, src) } }).then(ok, bad);
      });
    });
  }
  function source(given) {
    /* RECORD AUDIO: no picture. Just the mic: nothing to share. With the
       computer's sound: Chrome's box for the screen, whose picture is not
       kept, only its sound. */
    if (setup.what === 'audio') {
      if (!setup.pc) return Promise.resolve(new MediaStream());
      return fromBox(['screen', 'audio'], 'Pick your screen in Chrome\'s box and turn on Also share system audio. Only the sound is kept.');
    }
    if (setup.what === 'call') return fromBox(['tab', 'audio'], 'Pick the call’s tab in Chrome’s box and keep Also share tab audio on.');
    if (setup.what === 'window') return fromBox(['window', 'audio'], 'Pick the window in Chrome\'s box.');
    if (setup.what === 'screen') return fromBox(['screen', 'audio'], 'Pick the screen in Chrome\'s box. Turn on Also share audio there to keep its sound.');
    if (setup.what === 'area') return fromBox(['screen', 'audio'], 'Pick the screen in Chrome\'s box. Next you drag a box over the part to record.');
    var box = function () { return fromBox(['tab', 'audio'], 'Chrome did not hand over the tab by itself. Pick it in Chrome\'s box.'); };
    var again = function () { return tabPass(given.tab).then(fromTab).catch(box); };
    return given.streamId ? fromTab(given.streamId).catch(again) : again();
  }
  /* THE MIC AND THE CAMERA that were chosen by name; the default one when
     that one is gone (unplugged since); none when Chrome says no. */
  function getMic() {
    if (setup.mic === 'off') return Promise.resolve(null);
    var base = { echoCancellation: true, noiseSuppression: true };
    var any = function () { return media({ audio: base }); };
    return (setup.mic === 'default' ? any() : media({ audio: Object.assign({ deviceId: { exact: setup.mic } }, base) }).catch(any))
      .catch(function () { return null; });
  }
  function getCam() {
    if (setup.cam === 'off') return Promise.resolve(null);
    var base = { width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } };
    return media({ video: Object.assign({ deviceId: { exact: setup.cam } }, base) })
      .catch(function () { return media({ video: base }); })
      .catch(function () { return null; });
  }

  /* THE PICTURE MIXER: what is shared, with the camera as a round bubble
     bottom left, on one canvas that becomes the recorded track.

     This window is usually BEHIND what is being shown, and Chrome stops a
     hidden page's requestAnimationFrame and slows its timers to one a
     second, which would freeze the recording. So nothing here waits on the
     page being seen: Chrome hands this page every camera frame and every
     shared frame as it arrives (MediaStreamTrackProcessor), each camera
     frame paints the canvas (a steady 30 a second even when the screen is
     still), and the painted canvas is pushed out as a frame of the new
     track (MediaStreamTrackGenerator). On a Chrome without those, the
     canvas is painted on a worker's beat (tick.js; a worker's timer is not
     slowed) and read with captureStream(30). */
  function dims(x) { return x ? [x.displayWidth || x.videoWidth || 0, x.displayHeight || x.videoHeight || 0] : [0, 0]; }
  function paintOn(g, W, H, shot, face) {
    g.fillStyle = '#000';
    g.fillRect(0, 0, W, H);
    var d = dims(shot);
    if (d[0] && d[1]) {                               // the shared picture (or its chosen part), whole, centred
      var sx = 0, sy = 0, sw = d[0], sh = d[1];
      if (crop) { sx = crop.x * d[0]; sy = crop.y * d[1]; sw = crop.w * d[0]; sh = crop.h * d[1]; }
      var k = Math.min(W / sw, H / sh), w = sw * k, h = sh * k;
      g.drawImage(shot, sx, sy, sw, sh, (W - w) / 2, (H - h) / 2, w, h);
    }
    var f = dims(face);
    if (!(f[0] && f[1])) return;
    var side = Math.min(W, H), dia = Math.round(side * 0.27), gap = Math.round(side * 0.035);
    var cx = gap + dia / 2, cy = H - gap - dia / 2, r = dia / 2;
    g.save();                                          // a soft shadow under the bubble
    g.shadowColor = 'rgba(0,0,0,.35)'; g.shadowBlur = dia * 0.12; g.shadowOffsetY = dia * 0.03;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.fillStyle = '#111'; g.fill();
    g.restore();
    g.save();                                          // the face: a square cut from the middle, mirrored like a mirror
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.clip();
    var cut = Math.min(f[0], f[1]);
    g.translate(cx, cy); g.scale(-1, 1);
    g.drawImage(face, (f[0] - cut) / 2, (f[1] - cut) / 2, cut, cut, -r, -r, dia, dia);
    g.restore();
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2);   // a white ring
    g.lineWidth = Math.max(3, Math.round(dia * 0.022)); g.strokeStyle = '#fff'; g.stroke();
  }
  function mixer(shotTrack, faceTrack) {
    var st = shotTrack.getSettings ? shotTrack.getSettings() : {};
    var canvas = null, g = null, W = 0, H = 0, live = true, frames = 0;
    function ready(shot) {                              // the picture's size is fixed by the first shared frame
      if (canvas) return true;
      var d = dims(shot);
      if (!(d[0] && d[1])) { if (!(st.width && st.height)) return false; d = [st.width, st.height]; }
      if (crop) d = [Math.max(2, Math.round(d[0] * crop.w)), Math.max(2, Math.round(d[1] * crop.h))];
      W = d[0] - d[0] % 2; H = d[1] - d[1] % 2;
      canvas = self.OffscreenCanvas && self.MediaStreamTrackGenerator ? new OffscreenCanvas(W, H) : document.createElement('canvas');
      canvas.width = W; canvas.height = H;
      g = canvas.getContext('2d', { alpha: false });
      return true;
    }
    if (self.MediaStreamTrackProcessor && self.MediaStreamTrackGenerator && self.VideoFrame) {
      var gen = new MediaStreamTrackGenerator({ kind: 'video' }), out = gen.writable.getWriter();
      var shot = null, face = null, last = 0, readers = [];
      var paint = function () {
        if (!live || !ready(shot)) return;
        paintOn(g, W, H, shot, face);
        last = performance.now(); frames++;
        var vf = new VideoFrame(canvas, { timestamp: Math.round(last * 1000) });
        if (out.desiredSize > 0) out.write(vf).catch(function () {}); else vf.close();
      };
      var pump = function (track, on) {
        var r = new MediaStreamTrackProcessor({ track: track }).readable.getReader();
        readers.push(r);
        (function next() {
          r.read().then(function (x) {
            if (x.done || !live) { if (x.value) x.value.close(); return; }
            on(x.value); next();
          }, function () {});
        })();
      };
      // each camera frame paints; a shared frame paints only when the camera has gone quiet
      // (no camera, only a part of the screen: every shared frame paints)
      pump(shotTrack, function (f) { if (shot) shot.close(); shot = f; if (!faceTrack || performance.now() - last > 90) paint(); });
      if (faceTrack) {
        pump(faceTrack, function (f) { if (face) face.close(); face = f; paint(); });
        faceTrack.addEventListener('ended', function () { if (face) { face.close(); face = null; } });
      }
      // a still screen sends no frames: without a camera's beat, paint what
      // is there twice a second so the video keeps its time
      var still = faceTrack ? null : setInterval(function () { if (performance.now() - last > 450) paint(); }, 500);
      return { track: gen, how: 'frames', count: function () { return frames; },
               stop: function () {
                 live = false;
                 if (still) clearInterval(still);
                 readers.forEach(function (r) { r.cancel().catch(function () {}); });
                 if (shot) shot.close(); if (face) face.close(); shot = face = null;
                 out.close().catch(function () {}); gen.stop();
               } };
    }
    // an older Chrome: two hidden players, a worker's beat, the canvas read 30 times a second
    var player = function (track) {
      var v = document.createElement('video');
      v.muted = true; v.playsInline = true; v.srcObject = new MediaStream([track]);
      v.play().catch(function () {});
      return v;
    };
    var sv = player(shotTrack), fv = faceTrack ? player(faceTrack) : null, beat = null, stream = null;
    canvas = document.createElement('canvas');
    var cw = Math.round((st.width || 1280) * (crop ? crop.w : 1)), ch = Math.round((st.height || 720) * (crop ? crop.h : 1));
    W = cw - cw % 2; H = ch - ch % 2;
    canvas.width = W; canvas.height = H;
    g = canvas.getContext('2d', { alpha: false });
    var step = function () { if (live) { paintOn(g, W, H, sv, faceTrack && faceTrack.readyState === 'live' ? fv : null); frames++; } };
    try { beat = new Worker('src/tick.js'); beat.onmessage = step; } catch (e) { beat = null; var t = setInterval(step, 33); }
    step();
    stream = canvas.captureStream(30);
    return { track: stream.getVideoTracks()[0], how: 'canvas', count: function () { return frames; },
             stop: function () {
               live = false;
               if (beat) beat.terminate(); else clearInterval(t);
               stream.getTracks().forEach(function (x) { x.stop(); });
               sv.srcObject = null; if (fv) fv.srcObject = null;
             } };
  }

  function begin() {
    // what was shared, its sound when there is any, and the microphone
    ctx = new AudioContext();
    var out = ctx.createMediaStreamDestination();
    if (display.getAudioTracks().length) {
      var shared = ctx.createMediaStreamSource(new MediaStream(display.getAudioTracks()));
      shared.connect(out);
      if (loud) shared.connect(ctx.destination);       // keep hearing the tab
      pcLevel = ctx.createAnalyser(); pcLevel.fftSize = 256; shared.connect(pcLevel);
    }
    if (mic) {
      var m = ctx.createMediaStreamSource(mic);
      m.connect(out);
      level = ctx.createAnalyser(); level.fftSize = 256; m.connect(level);
    }
    var sound = out.stream.getAudioTracks();
    var hasSound = !!(display.getAudioTracks().length || mic);
    var audioOnly = setup.what === 'audio' || (setup.what === 'call' && !setup.video);
    var isCall = setup.what === 'call';
    if (isCall && display.getAudioTracks().length) loud = true;      // keep hearing the call
    if (audioOnly && !hasSound) throw Object.assign(new Error('nosound'), { name: 'No microphone or computer sound' });
    var picture = display.getVideoTracks()[0];
    var face = cam && cam.getVideoTracks().length ? cam.getVideoTracks()[0] : null;
    if (!audioOnly && (face || crop)) {
      try { mix = mixer(picture, face); picture = mix.track; }
      catch (e) {
        mix = null;                                    // no mixer: the shared picture alone
        // ...but never the whole screen when only a part was chosen
        if (crop) throw Object.assign(new Error('nocrop'), { name: 'Part of the screen' });
      }
    }
    self.orbitMix = mix; self.orbitSource = loud ? 'tab' : 'box';       // for the tests
    var type = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
      .filter(function (k) { return MediaRecorder.isTypeSupported(k); })[0] || '';
    if (audioOnly) {
      // sound only: one small file, sent as a call (both sides when the computer's sound is in)
      var at = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      rec = new MediaRecorder(out.stream, at ? { mimeType: at, audioBitsPerSecond: 64000 } : undefined);
    } else {
      rec = new MediaRecorder(new MediaStream([picture].concat(hasSound ? sound : [])),
                              type ? { mimeType: type, videoBitsPerSecond: mix ? 2000000 : 1500000, audioBitsPerSecond: 96000 } : undefined);
    }
    // the sound on its own as well, small, so the words are safe whatever
    // happens to the picture (as a call with video does, offscreen.js)
    if (hasSound && !audioOnly) {
      var st = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
      try { snd = new MediaRecorder(out.stream, st ? { mimeType: st, audioBitsPerSecond: 48000 } : undefined); } catch (e) { snd = null; }
    }
    made = Recordings.begin({ kind: isCall ? 'call' : audioOnly ? 'audio' : 'video', where: isCall ? setup.where : '',
                              video: !audioOnly, mime: rec.mimeType || (audioOnly ? 'audio/webm' : 'video/webm') })
      .then(function (x) { id = x; return x; });
    function keep(part) {
      return function (e) {
        if (!e.data || !e.data.size) return;
        var blob = e.data;
        writes = writes.then(function () { return made; }).then(function (x) { return Recordings.piece(x, part, blob); }).catch(function () {});
      };
    }
    rec.ondataavailable = keep('main');
    if (snd) snd.ondataavailable = keep('sound');
    var waiting = snd ? 2 : 1;
    function lastOne() {
      if (--waiting > 0) return;
      var secs = Math.round(elapsed() / 1000);
      cleanup();
      setTimeout(function () {
        writes.then(function () { return made; }).then(function (x) { return Recordings.finish(x, secs); }).then(function (n) {
          off();
          chrome.runtime.sendMessage({ type: 'rec-done', id: n ? n.id : null, tab: meetTab, from: isCall ? 'call' : 'window' }, function () { void chrome.runtime.lastError; });
          if (!n) done('Nothing was recorded.');
          else if (!isCall) window.close();
          else done('Saved. The note opens in a tab beside your call.');
        }, function () {
          off();
          done('It could not be put together now. What was recorded is kept, and is put together when Chrome restarts.');
        });
      }, 300);
    }
    if (snd) snd.onstop = lastOne;
    rec.onstop = function () {
      lastOne();
      callTell({ type: 'rec-saving', video: !audioOnly });
      $('live').hidden = true; $('done').hidden = false;
      $('done-t').textContent = 'Saving it…';
    };
    var shot = display.getVideoTracks()[0] || display.getAudioTracks()[0];
    if (shot) shot.addEventListener('ended', stop);                  // Chrome's "Stop sharing", or the tab closed
    rec.start(5000);
    if (snd) { try { snd.start(5000); } catch (e) { snd = null; waiting = 1; } }
    began = Date.now(); pausedTotal = 0; pausedAt = 0;
    chrome.runtime.sendMessage({ type: 'screen-live' }, function () { void chrome.runtime.lastError; });
    callTell({ type: 'rec-live', video: !audioOnly, mic: !!mic, how: 'window' });
    if (isCall) LiveWords.start(out.stream, function (text, final) { callTell({ type: 'rec-words', text: text, final: final }); }).then(function (l) { live = l; });
    $('pick').hidden = true; $('live').hidden = false; $('top').hidden = true;
    if (picture && !audioOnly) $('peek').srcObject = new MediaStream([picture]);    // what the video will look like, live
    document.body.classList.toggle('audio', audioOnly);
    $('state').textContent = says();
    var why = soundWhy();
    $('warn').hidden = !why; if (why) $('warn').innerHTML = why;
    chips();
    document.title = isCall ? 'REC · Orbit · recording a call' : audioOnly ? 'REC · Orbit · recording audio' : 'REC · Orbit · recording a video';
    size(audioOnly ? 420 : 520, (why ? 64 : 0) + (audioOnly ? 112 : 132), true);
    back();
    var bufs = {}, held = {};
    function meter(an, key) {
      var p = 0;
      if (an && !(rec && rec.state === 'paused')) {
        var buf = bufs[key] || (bufs[key] = new Uint8Array(128));
        an.getByteTimeDomainData(buf);
        for (var i = 0; i < buf.length; i++) { var v = Math.abs(buf[i] - 128); if (v > p) p = v; }
      }
      held[key] = Math.max(p, (held[key] || 0) * 0.6);
      var el = document.querySelector('.chip[data-k="' + key + '"] .lv i');
      if (el) el.style.width = Math.min(100, Math.round(held[key] / 60 * 100)) + '%';
    }
    tick = setInterval(function () {
      $('tm').textContent = mmss(elapsed());
      meter(level, 'mic'); meter(pcLevel, 'pc');
      if (isCall) callTell({ type: 'rec-level', you: held.mic || 0, them: held.pc || 0, t: elapsed(), paused: rec && rec.state === 'paused', quiet: false });
    }, 250);
  }
  /* ONE CHIP PER THING CAPTURED, on or off, so what is in the recording is
     never a guess: what is shared, the computer's sound, your mic, the camera. */
  var ICONS = {
    shot: '<path d="M3 5.5h18v11H3z"/><path d="M8.5 20h7"/>',
    pc: '<path d="M4 9.5v5h3.5L12 18.5v-13L7.5 9.5z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"/>',
    cam: '<rect x="3" y="6.5" width="12.5" height="11" rx="2.5"/><path d="M15.5 10.5 21 7.5v9l-5.5-3"/>'
  };
  function chip(key, on, text, meter) {
    var c = document.createElement('span');
    c.className = 'chip' + (on ? '' : ' off'); c.setAttribute('data-k', key);
    c.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + ICONS[key === 'shot' ? 'shot' : key] + '</svg>';
    c.appendChild(document.createTextNode(text));
    if (on && meter) { var lv = document.createElement('span'); lv.className = 'lv'; lv.appendChild(document.createElement('i')); c.appendChild(lv); }
    $('chips').appendChild(c);
  }
  function chips() {
    $('chips').textContent = '';
    var pc = !!(display && display.getAudioTracks().length);
    var noPicture = setup.what === 'audio' || (setup.what === 'call' && !setup.video);
    if (setup.what === 'call') chip('pc', pc, pc ? 'The call' : 'No sound from the call', true);
    else if (!noPicture) chip('shot', true, setup.what === 'tab' ? 'This tab' : setup.what === 'window' ? 'A window' : crop ? 'Part of your screen' : 'Your screen');
    if (setup.what !== 'call' && (setup.what !== 'audio' || setup.pc)) chip('pc', pc, pc ? 'Computer sound' : 'No computer sound', true);
    chip('mic', !!mic, mic ? 'Your mic' : 'Mic off', true);
    if (setup.cam !== 'off') chip('cam', !!(mix && cam), mix && cam ? 'Camera' : 'No camera');
  }
  // what to do when the computer's sound is not coming through, by what was shared
  function soundWhy() {
    if (display && display.getAudioTracks().length) return '';
    if (setup.what === 'audio') return setup.pc ? '<b>No computer sound,</b> only your mic. To add it, stop and start again, and turn on <b>Also share system audio</b> in Chrome’s box.' : '';
    if (setup.what === 'call') return '<b>No sound from the call.</b> Stop, press Record on the call again, and keep <b>Also share tab audio</b> on in Chrome’s box.';
    if (setup.what === 'window') return '<b>No computer sound.</b> Chrome can’t record one window’s sound. For sound, stop and record This tab or Whole screen.';
    if (setup.what === 'screen' || setup.what === 'area') return '<b>No computer sound.</b> To add it, stop and start again, and turn on <b>Also share system audio</b> in Chrome’s box.';
    return '<b>No computer sound.</b> To add it, stop and start again, and keep <b>Also share tab audio</b> on in Chrome’s box.';
  }
  // the tab being recorded comes back to the front, the strip waits in its corner
  function back() {
    if (setup.what !== 'tab' || typeof shared_tab !== 'number') return;
    try {
      chrome.tabs.get(shared_tab, function (t) {
        void chrome.runtime.lastError;
        if (t) chrome.windows.update(t.windowId, { focused: true }, function () { void chrome.runtime.lastError; });
      });
    } catch (e) {}
  }
  // the chips say what is captured; this line says only whether it is running
  function says() { return 'Recording'; }

  function pause() {
    if (!rec) return;
    if (rec.state === 'recording') {
      rec.pause(); if (snd) snd.pause(); pausedAt = Date.now();
      $('pause').textContent = 'Resume'; $('state').textContent = 'Paused'; document.body.classList.add('paused');
    } else if (rec.state === 'paused') {
      rec.resume(); if (snd) snd.resume(); pausedTotal += Date.now() - pausedAt; pausedAt = 0;
      $('pause').textContent = 'Pause'; $('state').textContent = says(); document.body.classList.remove('paused');
    }
  }
  var live = null;
  function stop() {
    if (stopping) return;
    stopping = true;
    if (live) live.stop();
    if (snd && snd.state !== 'inactive') snd.stop();
    if (rec && rec.state !== 'inactive') rec.stop();
  }

  /* a call picked here: the bar on the call shows this window's time and
     levels, and its Pause and Stop work this window */
  function callTell(msg) {
    if (meetTab === null) return;
    chrome.runtime.sendMessage({ type: 'to-tab', tab: meetTab, msg: msg }, function () { void chrome.runtime.lastError; });
  }
  $('pause').addEventListener('click', pause);
  $('stop').addEventListener('click', stop);
  // the popup or the toolbar icon pressed while it records, or the call's bar
  chrome.runtime.onMessage.addListener(function (msg, sender) {
    if (!msg) return;
    if (msg.type === 'screen-stop' && !sender.tab) stop();
    if (sender.tab && sender.tab.id === meetTab) {
      if (msg.type === 'rec-stop') stop();
      else if (msg.type === 'rec-pause') pause();
    }
  });
  // closing this window mid-recording keeps what was recorded (the background puts it together)
  addEventListener('pagehide', function () { if (id && rec && rec.state !== 'inactive') chrome.runtime.sendMessage({ type: 'rec-orphan', id: id }); });

  /* PART OF THE SCREEN: the screen, live, with a box to drag over the part
     to record. The box from last time is where it starts; a drag draws a
     new one, a drag inside moves it. "Whole screen" keeps it all. */
  function drawArea(d) {
    return new Promise(function (ok, bad) {
      var area = $('area'), stage = $('stage'), see = $('see'), box = $('box');
      var r = { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
      try {
        chrome.storage.local.get('screenArea', function (s) {
          void chrome.runtime.lastError;
          var a = s && s.screenArea;
          if (a && a.w >= 0.05 && a.h >= 0.05 && a.x >= 0 && a.y >= 0 && a.x + a.w <= 1.001 && a.y + a.h <= 1.001) { r = a; show(); }
        });
      } catch (e) {}
      $('pick').hidden = true; area.hidden = false; $('head').textContent = 'Record part of the screen';
      size(Math.min(1100, (self.screen && screen.availWidth) || 1100), Math.min(780, (self.screen && screen.availHeight) || 780));
      var t0 = d.getVideoTracks()[0], s0 = t0 && t0.getSettings ? t0.getSettings() : {};
      if (s0.width && s0.height) stage.style.aspectRatio = s0.width + ' / ' + s0.height;
      see.addEventListener('loadedmetadata', function () { if (see.videoWidth) stage.style.aspectRatio = see.videoWidth + ' / ' + see.videoHeight; });
      see.srcObject = new MediaStream(d.getVideoTracks());
      see.play().catch(function () {});
      function show() {
        box.style.left = (r.x * 100) + '%'; box.style.top = (r.y * 100) + '%';
        box.style.width = (r.w * 100) + '%'; box.style.height = (r.h * 100) + '%';
        var t = d.getVideoTracks()[0], st = t && t.getSettings ? t.getSettings() : {};
        $('area-n').textContent = st.width ? Math.round(r.w * st.width) + ' × ' + Math.round(r.h * st.height) : '';
      }
      function at(e) {
        var b = stage.getBoundingClientRect();
        return { x: Math.min(1, Math.max(0, (e.clientX - b.left) / b.width)), y: Math.min(1, Math.max(0, (e.clientY - b.top) / b.height)) };
      }
      // Chrome's "Stop sharing" while the box is drawn: nothing to record
      var live = d.getVideoTracks()[0], gone = function () { see.srcObject = null; bad(new Error('ended')); };
      if (live) live.addEventListener('ended', gone);
      var drag = null;
      stage.addEventListener('pointerdown', function (e) {
        var p = at(e);
        // a drag inside moves the box; one that covers nearly everything can only be drawn again
        var inside = p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h && r.w * r.h < 0.85;
        drag = inside ? { move: true, p: p, r: Object.assign({}, r) } : { move: false, p: p, was: Object.assign({}, r) };
        stage.setPointerCapture(e.pointerId); e.preventDefault();
      });
      stage.addEventListener('pointermove', function (e) {
        if (!drag) return;
        var p = at(e);
        if (drag.move) {
          r.x = Math.min(1 - r.w, Math.max(0, drag.r.x + p.x - drag.p.x));
          r.y = Math.min(1 - r.h, Math.max(0, drag.r.y + p.y - drag.p.y));
        } else {
          r = { x: Math.min(p.x, drag.p.x), y: Math.min(p.y, drag.p.y), w: Math.abs(p.x - drag.p.x), h: Math.abs(p.y - drag.p.y) };
        }
        show();
      });
      stage.addEventListener('pointerup', function () {
        if (drag && !drag.move && (r.w < 0.05 || r.h < 0.05)) r = drag.was || { x: 0.2, y: 0.2, w: 0.6, h: 0.6 };
        drag = null; show();
      });
      function go(c) {
        if (live) live.removeEventListener('ended', gone);
        crop = c; see.srcObject = null; area.hidden = true; $('pick').hidden = false;
        $('pick-t').textContent = 'Starting…';
        if (c) { try { chrome.storage.local.set({ screenArea: c }); } catch (e) {} }
        ok();
      }
      $('area-go').addEventListener('click', function () { go({ x: r.x, y: r.y, w: r.w, h: r.h }); });
      $('area-all').addEventListener('click', function () { go(null); });
      show();
    });
  }

  var shared_tab = null;
  function start(given) {
    shared_tab = given && typeof given.tab === 'number' ? given.tab : null;
    meetTab = setup.what === 'call' && typeof setup.meetTab === 'number' ? setup.meetTab : null;
    source(given)
      .then(function (d) {
        display = d;
        return setup.what === 'area' ? drawArea(d) : null;
      })
      .then(function () {
        return Promise.all([getMic(), getCam()]).then(function (r) { mic = r[0]; cam = r[1]; });
      })
      .then(begin)
      .catch(function (e) {
        cleanup(); off();
        callTell({ type: 'rec-closed' });
        if (e && e.message === 'closed') { window.close(); return; }
        size(420, 300);
        if (e && e.message === 'ended') { done('Sharing was stopped before the recording started. Nothing was recorded.'); return; }
        if (e && e.message === 'nocrop') { done('This Chrome could not record only a part of the screen, so nothing was recorded. Record This tab, A window or Whole screen instead.'); return; }
        if (e && e.message === 'nosound') { done('No microphone found. Allow the microphone on Orbit’s welcome page (Settings, then Microphone and camera), then try again.'); return; }
        done('The recorder could not start (' + ((e && e.name) || 'error') + '). Check that Chrome may record your screen (on a Mac: System Settings, Privacy, Screen recording), then try again.');
      });
  }
  // what the menu's panel chose; started another way (no panel), the last choices
  chrome.runtime.sendMessage({ type: 'screen-setup' }, function (r) {
    void chrome.runtime.lastError;
    r = r || {};
    if (r.setup) { setup = self.orbitScreenSetup(r.setup); return start(r); }
    chrome.storage.local.get('screenSetup', function (s) {
      void chrome.runtime.lastError;
      setup = self.orbitScreenSetup(s && s.screenSetup);
      start(r);
    });
  });
})();
