/* A recording as it comes in, shared by the pages that record (screen.js,
   offscreen.js) and the background (which finishes any a crash left open).

   Every five seconds the recorder hands over a piece, and it is written to
   IndexedDB straight away (Store.addPiece). So closing the tab, a crash or a
   lost window keeps everything up to the last five seconds. A video keeps
   its sound twice: once inside the video, and once on its own as a small
   audio file, which is what gets transcribed and what survives if the
   picture is ever lost. */
var Recordings = (function () {
  function newId() { return 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function label(d) {
    return d.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' }) + ', ' +
           d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  var NAMES = { call: 'Call', video: 'Video', audio: 'Voice note' };

  /* meta: { kind, where (Meet, Zoom, Teams), mime, video } */
  function begin(meta) {
    var id = newId(), kind = NAMES[meta.kind] ? meta.kind : 'video';
    var row = { id: id, kind: kind, where: String(meta.where || '').slice(0, 20),
                title: (meta.where ? meta.where + ' call' : NAMES[kind]) + ', ' + label(new Date()),
                began: Date.now(), ended: false, seconds: 0, mime: String(meta.mime || '').split(';')[0] || (meta.video ? 'video/webm' : 'audio/webm'),
                video: !!meta.video, media: '', sound: '', html: '', sent: {}, work: { state: 'new' } };
    return Store.putNote(row).then(function () { return id; });
  }
  function piece(id, part, blob) {
    return blob.arrayBuffer().then(function (buf) { return Store.addPiece(id, part, buf); });
  }
  /* The pieces become one file each (the recording, and its sound alone),
     the pieces are dropped, and the note is marked ended. Safe to call
     twice: a second call finds no pieces and leaves the files alone. */
  function finish(id, seconds) {
    return Store.note(id).then(function (n) {
      if (!n) return null;
      return Promise.all([Store.pieces(id, 'main'), Store.pieces(id, 'sound')]).then(function (p) {
        var jobs = [];
        if (p[0].length) { n.media = id + '-main'; jobs.push(Store.putMedia(n.media, new Blob(p[0], { type: n.mime }))); }
        if (p[1].length) { n.sound = id + '-sound'; jobs.push(Store.putMedia(n.sound, new Blob(p[1], { type: 'audio/webm' }))); }
        return Promise.all(jobs);
      }).then(function () {
        if (seconds) n.seconds = seconds;
        n.ended = true; n.endedAt = n.endedAt || Date.now();
        return Store.putNote(n);
      }).then(function () { return Store.dropPieces(id); }).then(function () {
        // nothing at all was recorded (stopped at once, or the share was refused)
        if (!n.media && !n.sound) return Store.forgetNote(id).then(function () { return null; });
        return n;
      });
    });
  }
  /* The file to listen to: the sound on its own when there is one, else the recording. */
  function audioOf(n) { return Store.media(n.sound).then(function (b) { return b || Store.media(n.media); }); }

  return { begin: begin, piece: piece, finish: finish, audioOf: audioOf, names: NAMES };
})();
