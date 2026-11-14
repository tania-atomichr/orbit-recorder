/* The toolbar menu. One tile for each thing it does:

   Record a call      the Meet, Zoom or Teams call on this tab, both sides
                      (what the toolbar icon does on a call).
   Record a video     like Loom: pick what to record, the camera and the
                      mic, then Start recording (screen.js records it). Once
                      set up, one press starts it the same way; Change opens
                      the setup again.
   Record audio       sound only: just the mic (a voice note, a phone call
                      on speaker), or the mic and the computer's sound (a
                      call in a desktop app).
   Make a guide       like Scribe: each click on this tab becomes a step
                      with a picture (page.js on the page, guide-bg.js
                      behind it); while one is being made the menu is its
                      count and Finish.

   While a video records, the menu is Stop and save. */
(function () {
  var $ = function (id) { return document.getElementById(id); };
  var say = $('say');
  function tell(text) { say.textContent = text; say.hidden = !text; }
  function activeTab(then) {
    chrome.tabs.query({ active: true, lastFocusedWindow: true }, function (tabs) { void chrome.runtime.lastError; then(tabs && tabs[0]); });
  }

  function show(s) {
    s = s || {};
    $('ver-short').textContent = 'Version ' + chrome.runtime.getManifest().version;
    // a video is recording: the menu is Stop and save, nothing else
    $('home').hidden = !!s.screen || guiding;
    $('asetup').hidden = true;
    $('live').hidden = !s.screen;
    $('vagain').hidden = !saved;
  }
  var guiding = false, last = null;
  chrome.runtime.sendMessage({ type: 'rec-status' }, function (s) { void chrome.runtime.lastError; last = s || {}; show(last); });

  /* RECORD A CALL: on a call's tab it starts straight away (the bar on
     the call shows the time and Stop). A call open in another tab is brought
     to the front, where its bar has Start. No call anywhere: say what to do. */
  $('meet').addEventListener('click', function () {
    var b = $('meet');
    b.disabled = true;
    activeTab(function (tab) {
      chrome.runtime.sendMessage({ type: 'meeting-start', tab: tab ? tab.id : null }, function (r) {
        void chrome.runtime.lastError;
        b.disabled = false;
        if (r && (r.how === 'started' || r.how === 'switched')) { window.close(); return; }
        tell('Open your Meet, Zoom or Teams call in Chrome and join it, then press Record on the card at its top.');
      });
    });
  });

  /* MAKE A STEP-BY-STEP GUIDE: starts on the tab the menu was opened on
     (pressing the icon is what lets the extension work on that tab, so
     no permission for every site is needed). The panel on the page takes
     over; this menu closes. While a guide is being made the menu shows its
     count and Finish, and on the guide's own tab it puts the panel back if
     a move to another site took it away. */
  var gtab = null;
  function guideLive(g, stuck) {
    guiding = !!(g && g.on);
    $('glive').hidden = !guiding;
    if (last) show(last);
    if (!guiding) return;
    $('gcount').textContent = g.count === 1 ? '1 step so far.' : g.count + ' steps so far.';
    /* Chrome's own pages (Extensions, Settings): clicks can't be followed
       there, but opening this menu lets Chrome hand over the page's picture,
       so the whole page can go in as one step (guide-bg.js gpageStep). */
    var closed = !!gtab && (stuck || (g.here && !g.capturing));
    $('gsay').textContent = closed ? 'Chrome does not let extensions follow clicks on this page. You can add the page itself as a step.'
      : !g.here ? 'It is being made in another tab.'
      : g.capturing ? (g.paused ? 'It is paused. Press Resume on the panel to carry on.' : 'Each click on this page adds a step.')
      : 'Chrome does not let extensions work on this page. Go back to the page you were explaining, or finish the guide.';
    $('gpage').hidden = !closed;
    $('gshow').hidden = !!g.here;
  }
  $('gpage').addEventListener('click', function () {
    var b = $('gpage');
    if (!gtab || b.disabled) return;
    b.disabled = true;
    chrome.runtime.sendMessage({ type: 'guide-page', tab: gtab.id }, function (r) {
      void chrome.runtime.lastError;
      b.disabled = false;
      if (r && r.ok) {
        $('gcount').textContent = r.count === 1 ? '1 step so far.' : r.count + ' steps so far.';
        return window.close();
      }
      tell((r && r.error) || 'That page could not be added. Try once more.');
    });
  });
  activeTab(function (tab) {
    gtab = tab || null;
    chrome.runtime.sendMessage({ type: 'guide-status', tab: tab ? tab.id : null }, function (g) {
      void chrome.runtime.lastError;
      // the icon pressed on another tab: the guide carries on here (the press is Chrome's pass for this tab)
      if (g && g.on && !g.here && tab) {
        return chrome.runtime.sendMessage({ type: 'guide-here', tab: tab.id }, function (r) {
          void chrome.runtime.lastError;
          if (r && r.ok) return window.close();
          guideLive(g, true);
        });
      }
      guideLive(g);
    });
  });
  /* May the guide follow you to other tabs? Chrome asks "read and change
     all your data on all websites" once; no is fine, the icon on a
     new tab carries the guide on instead. The question has to be asked in
     the press itself (Chrome refuses it a moment later), so what is known
     is read when the menu opens; "asked" is kept only once Chrome had an
     answer, so a refused request asks again next time. */
  var allSites = false, guideAsked = false;
  try {
    chrome.permissions.contains({ origins: ['<all_urls>'] }, function (yes) { void chrome.runtime.lastError; allSites = !!yes; });
    chrome.storage.local.get('guideAsked', function (a) { void chrome.runtime.lastError; guideAsked = !!(a && a.guideAsked); });
  } catch (e) {}
  $('guide').addEventListener('click', function () {
    var b = $('guide'), asking = false, started = false;
    b.disabled = true;
    function done() { if (started && !asking) window.close(); }
    if (!allSites && !guideAsked) {
      try {
        asking = true;
        chrome.permissions.request({ origins: ['<all_urls>'] }, function () {
          var refused = chrome.runtime.lastError;
          if (!refused) { try { chrome.storage.local.set({ guideAsked: true }); } catch (e) {} }
          asking = false; done();
        });
      } catch (e) { asking = false; }
    }
    activeTab(function (tab) {
      chrome.runtime.sendMessage({ type: 'guide-start', tab: tab ? tab.id : null }, function (r) {
        void chrome.runtime.lastError;
        b.disabled = false;
        if (r && r.ok) { started = true; return done(); }
        tell((r && r.error) || 'The guide did not start. Try again.');
      });
    });
  });
  $('gshow').addEventListener('click', function () { chrome.runtime.sendMessage({ type: 'guide-show' }, function () { void chrome.runtime.lastError; window.close(); }); });
  $('gfinish').addEventListener('click', function () {
    var b = $('gfinish');
    b.disabled = true; b.textContent = 'Saving…';
    chrome.runtime.sendMessage({ type: 'guide-finish' }, function (r) {
      void chrome.runtime.lastError;
      if (r && r.note) { b.hidden = true; $('gshow').hidden = true; $('gsay').textContent = r.note; return; }
      window.close();
    });
  });

  /* RECORD A VIDEO: the setup panel. The camera and the mic are listed by
     name once the extension may use them (one Allow on its welcome page); the
     last choices come back next time. */
  var what = $('what'), cam = $('cam'), mic = $('mic'), setup = self.orbitScreenSetup(null);
  function opt(sel, value, text) {
    var o = document.createElement('option');
    o.value = value; o.textContent = text;
    sel.appendChild(o);
    return o;
  }
  function choose(sel, value, fallback) {
    sel.value = value;
    if (sel.value !== value) sel.value = fallback;
  }
  function devices() {
    var md = navigator.mediaDevices;
    if (!md || !md.enumerateDevices) return Promise.resolve([]);
    return md.enumerateDevices().catch(function () { return []; });
  }
  function fill(list) {
    var cams = list.filter(function (d) { return d.kind === 'videoinput'; });
    var mics = list.filter(function (d) { return d.kind === 'audioinput' && d.deviceId !== 'communications'; });
    var named = function (d) { return !!d.label; };
    cam.textContent = ''; mic.textContent = ''; amic.textContent = '';
    opt(cam, 'off', 'Off');
    cams.filter(named).forEach(function (d) { opt(cam, d.deviceId, d.label.replace(/\s*\([^)]*\)$/, '')); });
    if (cams.length && !cams.some(named)) opt(cam, 'allow', 'Allow the camera…');
    var plain = function (d) { return d.label.replace(/^Default\s*-\s*/i, '').replace(/\s*\([^)]*\)$/, ''); };
    var first = mics.filter(function (d) { return d.deviceId === 'default' && d.label; })[0];
    // the default mic by its own name, first; the same mic is not listed twice
    opt(mic, 'default', first ? plain(first) : 'Default microphone');
    mics.filter(named).forEach(function (d) {
      if (d.deviceId !== 'default' && !(first && plain(d) === plain(first))) opt(mic, d.deviceId, plain(d));
    });
    Array.prototype.forEach.call(mic.options, function (o) { opt(amic, o.value, o.textContent); });
    opt(mic, 'off', 'Off');
    choose(what, setup.what, self.ORBIT_SCREEN_DEFAULTS.what);
    var firstCam = !saved && cams.filter(named)[0];
    choose(cam, firstCam ? firstCam.deviceId : setup.cam, self.ORBIT_SCREEN_DEFAULTS.cam);
    choose(mic, setup.mic, self.ORBIT_SCREEN_DEFAULTS.mic);
    needCam = cams.length > 0 && !cams.some(named);
    hint();
  }
  var needCam = false;
  function hint() {
    // what happens to the computer's sound, said before Start
    $('hint').textContent = (needCam ? 'For your face in the corner, choose Allow the camera under Camera. ' : '') + (what.value === 'tab' ? 'Records the tab you are on now, with its sound.'
      : what.value === 'window' ? 'Chrome asks which window. It records the picture only: Chrome can’t record one window’s sound. For sound, pick This tab or Whole screen.'
      : what.value === 'area' ? 'Chrome asks which screen, then you drag a box over the part to record. Turn on Also share system audio there for your computer’s sound.'
      : 'Chrome asks which screen. Turn on Also share system audio there to record your computer’s sound.');
  }
  function chosen() { return { what: what.value, cam: cam.value === 'allow' ? 'off' : cam.value, mic: mic.value }; }
  function remember() { try { chrome.storage.local.set({ screenSetup: chosen() }); } catch (e) {} }
  [what, cam, mic].forEach(function (sel) { sel.addEventListener('change', function () {
    if (sel === cam && cam.value === 'allow') {         // names need one Allow, on a full page (a menu closes under Chrome's question)
      chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html#camera') });
      window.close();
      return;
    }
    hint(); remember();
  }); });
  /* Once a video was set up, the tile starts it in one press with those
     choices; Change opens the setup. The first time, the setup opens with
     the camera on when there is one. */
  var saved = null;
  function openSetup() {
    $('home').hidden = true; $('setup').hidden = false;
    setup = self.orbitScreenSetup(saved);
    devices().then(fill);
    $('start').focus();
  }
  chrome.storage.local.get('screenSetup', function (r) {
    void chrome.runtime.lastError;
    saved = r && r.screenSetup && r.screenSetup.what && r.screenSetup.what !== 'audio' ? r.screenSetup : null;
    if (!saved) return;
    $('vline').textContent = self.orbitScreenLine(self.orbitScreenSetup(saved));
    $('vagain').hidden = $('video').hidden;
  });
  $('video').addEventListener('click', function () {
    if (!saved) return openSetup();
    startVideo(self.orbitScreenSetup(saved), $('video'));
  });
  $('vchange').addEventListener('click', openSetup);
  $('back').addEventListener('click', function () { $('setup').hidden = true; $('home').hidden = false; $('video').focus(); });
  function startVideo(s, b) {
    if (b) b.disabled = true;
    function go(extra) {
      chrome.runtime.sendMessage(Object.assign({ type: 'screen-start', setup: s }, extra || {}), function () {
        void chrome.runtime.lastError;
        window.close();
      });
    }
    if (s.what !== 'tab') return go();
    /* This tab: Chrome hands the extension the tab it was opened on with no
       box to pick from. The pass is asked for here, on the press, and used
       by the recording window within a moment. */
    activeTab(function (tab) {
      if (!tab) return go();
      try {
        chrome.tabCapture.getMediaStreamId({ targetTabId: tab.id }, function (id) {
          void chrome.runtime.lastError;
          go({ tab: tab.id, streamId: id || '' });
        });
      } catch (e) { go({ tab: tab.id }); }
    });
  }
  $('start').addEventListener('click', function () {
    var s = chosen();
    remember();
    startVideo(s, $('start'));
  });
  /* RECORD AUDIO: which sound and which mic, then the same small window,
     sound only. The choices are kept apart from the video's. */
  var amic = $('amic'), pc = $('pc');
  function ahint() {
    $('ahint').textContent = pc.value === '1'
      ? 'For a call in an app on this computer (WhatsApp, Zoom, Teams). Chrome asks for your screen: turn on Also share system audio there. Only the sound is kept.'
      : 'For a phone call on speaker, or a voice note. Records what your mic hears.';
  }
  function aremember() { try { chrome.storage.local.set({ audioSetup: { mic: amic.value, pc: pc.value === '1' } }); } catch (e) {} }
  [pc, amic].forEach(function (sel) { sel.addEventListener('change', function () { ahint(); aremember(); }); });
  $('audio').addEventListener('click', function () {
    $('home').hidden = true; $('asetup').hidden = false;
    chrome.storage.local.get('audioSetup', function (r) {
      void chrome.runtime.lastError;
      var a = (r && r.audioSetup) || {};
      devices().then(function (list) {
        fill(list);
        choose(amic, a.mic || 'default', 'default');
        pc.value = a.pc ? '1' : '0';
        ahint();
      });
    });
    $('astart').focus();
  });
  $('aback').addEventListener('click', function () { $('asetup').hidden = true; $('home').hidden = false; $('audio').focus(); });
  $('astart').addEventListener('click', function () {
    $('astart').disabled = true;
    aremember();
    chrome.runtime.sendMessage({ type: 'screen-start', setup: { what: 'audio', cam: 'off', mic: amic.value, pc: pc.value === '1' } }, function () {
      void chrome.runtime.lastError;
      window.close();
    });
  });

  $('stop').addEventListener('click', function () {
    $('stop').disabled = true;
    chrome.runtime.sendMessage({ type: 'screen-stop' }, function () { void chrome.runtime.lastError; window.close(); });
  });

})();
