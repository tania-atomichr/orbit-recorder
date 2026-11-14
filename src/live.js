/* LIVE WORDS while a call records (optional): the call's sound goes to
   Deepgram's streaming service with your own key, and the last line said
   shows on the call's bar. Nothing is kept from it: the transcript of the
   note still comes from the saved recording. Off unless "Show the words as
   they are said" is on in Settings and Deepgram is the transcript service. */
var LiveWords = (function () {
  function start(stream, say) {
    return chrome.storage.local.get(['liveWords', 'transcribe']).then(function (s) {
      var t = s.transcribe || {}, key = t.deepgram && t.deepgram.key;
      if (!s.liveWords || t.use !== 'deepgram' || !key || !window.WebSocket) return null;
      var lang = (t.deepgram.lang || '').trim();
      var url = 'wss://api.deepgram.com/v1/listen?model=nova-3&smart_format=true&interim_results=true' + (lang ? '&language=' + encodeURIComponent(lang) : '&detect_language=true');
      var ws = new WebSocket(url, ['token', key]), rec = null, open = true;
      ws.onopen = function () {
        var type = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : '';
        rec = new MediaRecorder(new MediaStream(stream.getAudioTracks()), type ? { mimeType: type } : undefined);
        rec.ondataavailable = function (e) { if (e.data && e.data.size && ws.readyState === 1) ws.send(e.data); };
        rec.start(250);
      };
      ws.onmessage = function (e) {
        try {
          var j = JSON.parse(e.data), alt = j.channel && j.channel.alternatives && j.channel.alternatives[0];
          if (alt && alt.transcript) say(alt.transcript, !!j.is_final);
        } catch (err) {}
      };
      ws.onerror = function () { say('', true); };
      return {
        stop: function () {
          if (!open) return;
          open = false;
          try { if (rec && rec.state !== 'inactive') rec.stop(); } catch (e) {}
          try { if (ws.readyState === 1) ws.send(JSON.stringify({ type: 'CloseStream' })); ws.close(); } catch (e) {}
        }
      };
    }).catch(function () { return null; });
  }
  return { start: start };
})();
