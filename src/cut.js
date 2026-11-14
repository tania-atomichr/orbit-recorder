/* A COPY OF PART OF A RECORDING. A browser recording (WebM) cannot be cut
   without taking it apart, so the part is played once, muted, in a hidden
   player and recorded again as it plays. It takes as long as the part
   itself, and the page shows how long is left. Used when a trim is saved
   (so only the kept part ever leaves the browser) and for "Make a new note
   from this part". */
var Cut = (function () {
  /* blob: the whole recording; a, b: seconds; tick(secondsLeft) */
  function copy(blob, a, b, tick) {
    return new Promise(function (ok, bad) {
      var video = /^video/.test(blob.type), el = document.createElement(video ? 'video' : 'audio');
      var url = URL.createObjectURL(blob), done = false;
      el.src = url; el.preload = 'auto'; el.playsInline = true;
      el.style.cssText = 'position:fixed;left:-9999px;top:0;width:640px;height:360px;';
      document.body.appendChild(el);
      var ac = new AudioContext(), dest = ac.createMediaStreamDestination();
      // the sound goes to the copy, not to the speakers
      var src = ac.createMediaElementSource(el);
      src.connect(dest);
      function stop(err) {
        if (done) return;
        done = true;
        try { if (rec && rec.state !== 'inactive') rec.stop(); } catch (e) {}
        el.pause();
        setTimeout(function () { el.remove(); URL.revokeObjectURL(url); ac.close().catch(function () {}); }, 500);
        if (err) bad(err);
      }
      var rec = null, parts = [];
      el.onerror = function () { stop(new Error('This recording could not be read.')); };
      el.onloadedmetadata = function () {
        el.currentTime = a;
        el.onseeked = function () {
          el.onseeked = null;
          var tracks = dest.stream.getAudioTracks();
          if (video) {
            var vs = el.captureStream ? el.captureStream() : null;
            if (!vs) return stop(new Error('Chrome could not copy this video.'));
            tracks = vs.getVideoTracks().concat(tracks);
          }
          var type = video ? (MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm') : 'audio/webm;codecs=opus';
          rec = new MediaRecorder(new MediaStream(tracks), { mimeType: type, videoBitsPerSecond: 2500000 });
          rec.ondataavailable = function (e) { if (e.data && e.data.size) parts.push(e.data); };
          rec.onstop = function () { ok(new Blob(parts, { type: type.split(';')[0] })); };
          rec.start(1000);
          ac.resume().then(function () { return el.play(); }).catch(function (e) { stop(e); });
        };
      };
      el.ontimeupdate = function () {
        if (!rec) return;
        if (tick) tick(Math.max(0, b - el.currentTime));
        if (el.currentTime >= b) stop();
      };
      el.onended = function () { stop(); };
    });
  }
  return { copy: copy };
})();
