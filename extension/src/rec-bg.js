/* The background side of recording (the pages that record are offscreen.js
   for a call and screen.js for everything else; the card on a call is
   call-card.js).

   ON A CALL the toolbar icon records straight away instead of opening the
   popup: the card tells this script the tab is on a call, and the popup is
   switched off for that tab, so the press reaches chrome.action.onClicked.
   That press is also what lets Chrome hand the call's tab over
   (tabCapture), with no share box. A press on the card's Record works the
   same way once the icon was pressed on that tab; before that Chrome says
   no, and the card opens the recording window to pick the tab by hand.

   A FINISHED RECORDING opens as a note (note.html): in front for a video or
   a voice note, beside the call for a call, so the write-up is made while
   you are still talking to people. */
(function () {
  var onCall = {}, direct = null, screenRec = null;
  var restored = chrome.storage.session.get(['onCall', 'direct', 'screenRec']).then(function (r) {
    onCall = r.onCall || {}; direct = r.direct || null; screenRec = r.screenRec || null;
  }, function () {});
  function keep() { chrome.storage.session.set({ onCall: onCall, direct: direct, screenRec: screenRec }).catch(function () {}); }
  function quiet(p) { if (p && p.catch) p.catch(function () {}); }
  function setPopup(tabId, on) { try { quiet(chrome.action.setPopup({ tabId: tabId, popup: on ? 'popup.html' : '' })); } catch (e) {} }
  function toTab(tabId, msg) { try { chrome.tabs.sendMessage(tabId, msg, function () { void chrome.runtime.lastError; }); } catch (e) {} }
  function noteUrl(id) { return chrome.runtime.getURL('note.html') + '?id=' + encodeURIComponent(id); }

  /* Chrome only adds the card to call pages opened after the extension was
     installed or updated, so on install, update and start it is put into
     every call page already open. */
  var CALL_PAGES = ['https://meet.google.com/*', 'https://app.zoom.us/wc/*', 'https://*.zoom.us/wc/*', 'https://teams.microsoft.com/*', 'https://teams.live.com/*'];
  function putInto(tabId) {
    try { return chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['src/call-card.js'] }).then(function () { return true; }, function () { return false; }); }
    catch (e) { return Promise.resolve(false); }
  }
  function putIntoCalls() {
    chrome.tabs.query({ url: CALL_PAGES }, function (tabs) {
      void chrome.runtime.lastError;
      (tabs || []).forEach(function (t) { if (!t.discarded) putInto(t.id); });
    });
  }
  function askCall(tabId, then) {
    chrome.tabs.sendMessage(tabId, { type: 'are-you-on-call' }, function (r) {
      void chrome.runtime.lastError;
      if (r && r.call) return then(r.call);
      putInto(tabId).then(function (put) {
        if (!put) return then(null);
        chrome.tabs.sendMessage(tabId, { type: 'are-you-on-call' }, function (r2) { void chrome.runtime.lastError; then(r2 && r2.call ? r2.call : null); });
      });
    });
  }

  /* ---- a call, with no window ---- */
  function startNow(tab, refused, granted) {
    var check;
    try { check = chrome.runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] }); } catch (e) { check = Promise.resolve(null); }
    check.then(function (c) {
      if (c && !c.length && direct) { direct = null; keep(); }      // a recorder that vanished must not block the next call
      startChecked(tab, refused, granted);
    }, function () { startChecked(tab, refused, granted); });
  }
  function startChecked(tab, refused, granted) {
    var t = tab.id, call = onCall[t] || {};
    if (direct && direct.tab === t) { chrome.runtime.sendMessage({ type: 'off-stop' }, function () { void chrome.runtime.lastError; }); if (granted) granted(); return; }
    if (direct) { toTab(t, { type: 'capture-failed', error: 'Already recording another call. Stop that one first.' }); if (refused) refused(); return; }
    chrome.tabCapture.getMediaStreamId({ targetTabId: t }, function (id) {
      var err = chrome.runtime.lastError;
      if (!id && refused) return refused();
      if (!id) return toTab(t, { type: 'capture-failed', error: 'Chrome did not hand over the call' + (err ? ' (' + err.message + ')' : '') + '. Press Record to pick it yourself.' });
      if (granted) granted();
      direct = { tab: t, id: id, video: !!call.video, where: call.where || 'Meet' };
      keep();
      chrome.offscreen.createDocument({ url: 'offscreen.html', reasons: ['USER_MEDIA'], justification: 'Records the call you started.' }).catch(function (e) {
        direct = null; keep();
        toTab(t, { type: 'capture-failed', error: 'The recorder did not start (' + ((e && e.message) || 'error') + '). Press Record to pick the call yourself.' });
      });
    });
  }
  chrome.action.onClicked.addListener(function (tab) {
    restored.then(function () {
      if (screenRec && screenRec.live) return chrome.runtime.sendMessage({ type: 'screen-stop' }, function () { void chrome.runtime.lastError; });
      askCall(tab.id, function (call) {
        if (call) { onCall[tab.id] = call; keep(); return startNow(tab); }
        setPopup(tab.id, true);                         // no call here after all: the popup, now
        try { quiet(chrome.action.openPopup()); } catch (e) {}
      });
    });
  });

  /* ---- the recording window ---- */
  function screenOpen(reply, msg, from) {
    restored.then(function () {
      if (screenRec) {
        return chrome.windows.update(screenRec.win, { focused: true, drawAttention: true }, function (w) {
          if (chrome.runtime.lastError || !w) { screenRec = null; keep(); screenOpen(reply, msg, from); } else reply({ ok: true });
        });
      }
      var setup = msg.setup || null;
      if (setup && setup.what === 'call' && from) setup.meetTab = from.id;
      var small = setup && (setup.what === 'tab' || (setup.what === 'audio' && !setup.pc));
      chrome.windows.create({ url: chrome.runtime.getURL('screen.html'), type: 'popup', width: small ? 400 : 760, height: small ? 420 : 620, focused: true }, function (w) {
        void chrome.runtime.lastError;
        if (w) { screenRec = { win: w.id, live: false, setup: setup, streamId: msg.streamId || '', tab: typeof msg.tab === 'number' ? msg.tab : null }; keep(); }
        reply({ ok: !!w });
      });
    });
  }
  /* the lines typed during the call go first in the note's own notes, each with its time */
  function typedInto(tabId, id) {
    if (typeof tabId !== 'number') return Promise.resolve();
    var k = 'typed:' + tabId;
    return chrome.storage.session.get([k]).then(function (r) {
      var list = r[k] || [];
      return chrome.storage.session.remove(k).then(function () {
        if (!id || !list.length) return;
        var esc = function (x) { return x.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
        var html = list.map(function (x) { return '<p><span class="ts" data-t="' + x.t + '">' + Format.clock(x.t) + '</span> ' + esc(x.text) + '</p>'; }).join('');
        return Store.changeNote(id, function (n) { n.html = html + (n.html || ''); });
      });
    }).catch(function () {});
  }
  function screenLive(on) {
    if (on) {
      screenRec = Object.assign(screenRec || {}, { live: true, streamId: '' });
      quiet(chrome.action.setBadgeText({ text: 'REC' })); quiet(chrome.action.setBadgeBackgroundColor({ color: '#e04848' }));
      quiet(chrome.action.setPopup({ popup: '' }));     // a press on the icon now stops it
    } else {
      screenRec = null;
      quiet(chrome.action.setPopup({ popup: 'popup.html' }));
      quiet(chrome.action.setBadgeText({ text: '' }));
    }
    keep();
  }
  chrome.windows.onRemoved.addListener(function (w) { restored.then(function () { if (screenRec && screenRec.win === w) screenLive(false); }); });
  chrome.tabs.onRemoved.addListener(function (t) { restored.then(function () { if (onCall[t]) { delete onCall[t]; keep(); } }); });

  /* A recording that was cut off (its window or Chrome closed mid-way) is
     put together from the pieces it kept, once nothing is still writing. */
  function finishLeftOvers(olderThan) {
    return Store.notes().then(function (rows) {
      var open = rows.filter(function (n) { return !n.ended && Date.now() - n.began > (olderThan || 0); });
      return Promise.all(open.map(function (n) { return Recordings.finish(n.id, 0).catch(function () {}); }));
    });
  }
  chrome.alarms.onAlarm.addListener(function (a) { if (a.name === 'leftovers') finishLeftOvers(20000); });
  chrome.runtime.onStartup.addListener(function () { putIntoCalls(); finishLeftOvers(0); });
  chrome.runtime.onInstalled.addListener(function (d) {
    if (d.reason === 'install') chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') });
    putIntoCalls();
  });

  chrome.runtime.onMessage.addListener(function (msg, sender, reply) {
    if (!msg || typeof msg.type !== 'string') return;
    var ours = sender.id === chrome.runtime.id && (!sender.tab || (sender.url || '').indexOf(chrome.runtime.getURL('')) === 0);
    var t = msg.type;

    if (t === 'on-call' && sender.tab) {
      restored.then(function () { onCall[sender.tab.id] = { video: !!msg.video, where: msg.where || 'Meet' }; keep(); });
      setPopup(sender.tab.id, false);
      return false;
    }
    if (t === 'off-call' && sender.tab) {
      restored.then(function () { delete onCall[sender.tab.id]; keep(); });
      setPopup(sender.tab.id, true);
      return false;
    }
    if (t === 'card-record' && sender.tab) {
      var tab = sender.tab;
      restored.then(function () {
        onCall[tab.id] = { video: !!msg.video, where: msg.where || 'Meet' }; keep();
        if (direct) return reply({ ok: false });
        startNow(tab, function () { reply({ ok: false }); }, function () { reply({ ok: true }); });
      });
      return true;
    }
    if (t === 'meeting-start' && ours) {                // the popup's Record a call
      restored.then(function () {
        var tabId = msg.tab;
        var other = function () {
          var ids = Object.keys(onCall).map(Number).filter(function (x) { return x !== tabId; });
          if (!ids.length) return reply({ ok: false });
          chrome.tabs.get(ids[0], function (tb) {
            if (chrome.runtime.lastError || !tb) return reply({ ok: false });
            chrome.tabs.update(tb.id, { active: true }); chrome.windows.update(tb.windowId, { focused: true });
            reply({ ok: true, how: 'switched' });
          });
        };
        if (typeof tabId !== 'number') return other();
        askCall(tabId, function (call) {
          if (!call) return other();
          onCall[tabId] = call; keep(); setPopup(tabId, false);
          startNow({ id: tabId });
          reply({ ok: true, how: 'started' });
        });
      });
      return true;
    }
    if (t === 'off-ready' && !sender.tab) {
      restored.then(function () { reply(direct ? { id: direct.id, tab: direct.tab, video: direct.video, where: direct.where } : null); });
      return true;
    }
    if (t === 'to-tab' && !sender.tab && typeof msg.tab === 'number') {
      var m = msg.msg || {};
      if (m.type === 'rec-live') { quiet(chrome.action.setBadgeText({ tabId: msg.tab, text: '●' })); quiet(chrome.action.setBadgeBackgroundColor({ tabId: msg.tab, color: '#e04848' })); }
      else if (m.type === 'rec-saving' || m.type === 'capture-failed' || m.type === 'rec-closed') quiet(chrome.action.setBadgeText({ tabId: msg.tab, text: '' }));
      toTab(msg.tab, m);
      return false;
    }
    if (t === 'off-done' && !sender.tab) {
      direct = null; keep();
      try { chrome.offscreen.closeDocument().catch(function () {}); } catch (e) {}
      return false;
    }
    if (t === 'rec-typed' && sender.tab) {              // a line typed on the call's bar while it records
      var k = 'typed:' + sender.tab.id, line = msg.line || {};
      chrome.storage.session.get([k]).then(function (r) {
        var list = r[k] || [];
        list.push({ t: Math.max(0, +line.t || 0), text: String(line.text || '').slice(0, 2000) });
        var o = {}; o[k] = list; return chrome.storage.session.set(o);
      });
      return false;
    }
    if (t === 'rec-done' && !sender.tab) {
      if (typeof msg.tab === 'number') toTab(msg.tab, msg.id ? { type: 'saved', id: msg.id } : { type: 'saved' });
      typedInto(msg.tab, msg.id).then(function () {
        if (msg.id) chrome.tabs.create({ url: noteUrl(msg.id), active: msg.from !== 'call' });
      });
      return false;
    }
    if (t === 'rec-orphan' && !sender.tab) { chrome.alarms.create('leftovers', { delayInMinutes: 0.5 }); return false; }
    if (t === 'open-note') { chrome.tabs.create({ url: noteUrl(String(msg.id || '')) }); return false; }
    if (t === 'open-welcome') { chrome.tabs.create({ url: chrome.runtime.getURL('welcome.html') }); return false; }
    if (t === 'screen-start') { screenOpen(reply, msg, sender.tab || null); return true; }
    if (t === 'screen-setup' && ours) {
      restored.then(function () { reply(screenRec ? { setup: screenRec.setup || null, streamId: screenRec.streamId || '', tab: screenRec.tab } : {}); });
      return true;
    }
    if (t === 'screen-live' && ours) { restored.then(function () { screenLive(true); }); return false; }
    if (t === 'screen-off' && ours) { restored.then(function () { screenLive(false); }); return false; }
    if (t === 'screen-focus') { restored.then(function () { if (screenRec) chrome.windows.update(screenRec.win, { focused: true, drawAttention: true }, function () { void chrome.runtime.lastError; }); }); return false; }
    if (t === 'screen-cancel') { restored.then(function () { if (screenRec && !screenRec.live) chrome.windows.remove(screenRec.win, function () { void chrome.runtime.lastError; }); }); return false; }
    if (t === 'rec-status' && ours) {
      restored.then(function () { reply({ screen: !!(screenRec && screenRec.live), call: !!direct }); });
      return true;
    }
  });
})();
