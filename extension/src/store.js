/* Everything lives here, in the extension's own IndexedDB, first. Nothing
   leaves the browser unless you connect somewhere (destinations.js) or turn
   on a transcription or writing service with your own key (providers.js).

     guides  { id, title, intro, began, ended, finishedAt, sent }
     steps   { guide, key, meta, image (JPEG bytes), sentence, order, note }
     notes   { id, kind: call|video|audio, title, began, ended, seconds, mime,
               media, sound, trim, transcript, speakers, html, summary, sent, work }
     media   { key, blob }          a finished recording, and its sound alone
     pieces  { rec, part, bytes }   a recording still coming in, five seconds at a time

   Loaded by the background script (importScripts) and by the extension's
   own pages (<script>), so both read the same rows. */
var Store = (function () {
  var NAME = 'orbit-recorder', VERSION = 1, GUIDES = 'guides', STEPS = 'steps', NOTES = 'notes', MEDIA = 'media', PIECES = 'pieces';
  var opened = null;

  function db() {
    if (opened) return opened;
    opened = new Promise(function (ok, bad) {
      var r = indexedDB.open(NAME, VERSION);
      r.onupgradeneeded = function () {
        var d = r.result;
        if (!d.objectStoreNames.contains(GUIDES)) d.createObjectStore(GUIDES, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(STEPS)) d.createObjectStore(STEPS, { autoIncrement: true }).createIndex('guide', 'guide');
        if (!d.objectStoreNames.contains(NOTES)) d.createObjectStore(NOTES, { keyPath: 'id' });
        if (!d.objectStoreNames.contains(MEDIA)) d.createObjectStore(MEDIA, { keyPath: 'key' });
        if (!d.objectStoreNames.contains(PIECES)) d.createObjectStore(PIECES, { autoIncrement: true }).createIndex('rec', 'rec');
      };
      r.onsuccess = function () { ok(r.result); };
      r.onerror = function () { opened = null; bad(r.error); };
    });
    return opened;
  }
  // runs fn on one store and resolves with what it handed back (an IDBRequest's result, or a plain value)
  function tx(store, mode, fn) {
    return db().then(function (d) {
      return new Promise(function (ok, bad) {
        var t = d.transaction(store, mode), out = fn(t.objectStore(store));
        t.oncomplete = function () { ok(out && typeof out === 'object' && 'result' in out ? out.result : out); };
        t.onerror = function () { bad(t.error); };
        t.onabort = function () { bad(t.error); };
      });
    });
  }

  function guide(id) { return tx(GUIDES, 'readonly', function (s) { return s.get(id); }); }
  function guides() {
    return tx(GUIDES, 'readonly', function (s) { return s.getAll(); }).then(function (rows) {
      return rows.sort(function (a, b) { return (b.began || 0) - (a.began || 0); });
    });
  }
  function putGuide(row) { return tx(GUIDES, 'readwrite', function (s) { s.put(row); }); }
  function change(id, fn) {
    return tx(GUIDES, 'readwrite', function (s) {
      var g = s.get(id), out = { result: null };
      g.onsuccess = function () { if (g.result) { fn(g.result); s.put(g.result); out.result = g.result; } };
      return out;
    });
  }

  /* A guide's steps in the order they were taken, each with its row key
     (pk) so one can be changed or deleted. */
  function steps(id) {
    return tx(STEPS, 'readonly', function (s) {
      var out = { result: [] };
      s.index('guide').openCursor(IDBKeyRange.only(id)).onsuccess = function (e) {
        var c = e.target.result;
        if (!c) return;
        var row = c.value;
        row.pk = c.primaryKey;
        out.result.push(row);
        c.continue();
      };
      return out;
    }).then(function (rows) {
      // the order they were taken in, unless they were moved by hand
      return rows.sort(function (a, b) { return (a.order != null ? a.order : a.pk) - (b.order != null ? b.order : b.pk) || a.pk - b.pk; });
    });
  }
  function count(id) { return tx(STEPS, 'readonly', function (s) { return s.index('guide').count(id); }); }
  function addStep(row) { return tx(STEPS, 'readwrite', function (s) { s.add(row); }); }
  function changeStep(pk, fn) {
    return tx(STEPS, 'readwrite', function (s) {
      var q = s.get(pk);
      q.onsuccess = function () { if (q.result) { fn(q.result); s.put(q.result, pk); } };
    });
  }
  function dropStep(pk) { return tx(STEPS, 'readwrite', function (s) { s.delete(pk); }); }

  function forget(id) {
    return db().then(function (d) {
      return new Promise(function (ok, bad) {
        var t = d.transaction([GUIDES, STEPS], 'readwrite');
        t.objectStore(STEPS).index('guide').openKeyCursor(IDBKeyRange.only(id)).onsuccess = function (e) {
          var c = e.target.result;
          if (c) { t.objectStore(STEPS).delete(c.primaryKey); c.continue(); }
        };
        t.objectStore(GUIDES).delete(id);
        t.oncomplete = ok;
        t.onerror = function () { bad(t.error); };
      });
    });
  }

  /* Steps in a new order: pks top to bottom. */
  function reorder(id, pks) {
    return tx(STEPS, 'readwrite', function (s) {
      pks.forEach(function (pk, i) {
        var q = s.get(pk);
        q.onsuccess = function () { if (q.result && q.result.guide === id) { q.result.order = i; s.put(q.result, pk); } };
      });
    });
  }

  /* ---- recordings ---- */
  function note(id) { return tx(NOTES, 'readonly', function (s) { return s.get(id); }); }
  function notes() {
    return tx(NOTES, 'readonly', function (s) { return s.getAll(); }).then(function (rows) {
      return rows.sort(function (a, b) { return (b.began || 0) - (a.began || 0); });
    });
  }
  function putNote(row) { return tx(NOTES, 'readwrite', function (s) { s.put(row); }); }
  function changeNote(id, fn) {
    return tx(NOTES, 'readwrite', function (s) {
      var g = s.get(id), out = { result: null };
      g.onsuccess = function () { if (g.result) { fn(g.result); s.put(g.result); out.result = g.result; } };
      return out;
    });
  }
  function media(key) { return key ? tx(MEDIA, 'readonly', function (s) { return s.get(key); }).then(function (r) { return r ? r.blob : null; }) : Promise.resolve(null); }
  function putMedia(key, blob) { return tx(MEDIA, 'readwrite', function (s) { s.put({ key: key, blob: blob }); }); }
  function dropMedia(key) { return key ? tx(MEDIA, 'readwrite', function (s) { s.delete(key); }) : Promise.resolve(); }
  function addPiece(rec, part, bytes) { return tx(PIECES, 'readwrite', function (s) { s.add({ rec: rec, part: part, bytes: bytes }); }); }
  /* One recording's pieces of one part (main or sound), in order. */
  function pieces(rec, part) {
    return tx(PIECES, 'readonly', function (s) {
      var out = { result: [] };
      s.index('rec').openCursor(IDBKeyRange.only(rec)).onsuccess = function (e) {
        var c = e.target.result;
        if (!c) return;
        if (c.value.part === part) out.result.push({ k: c.primaryKey, bytes: c.value.bytes });
        c.continue();
      };
      return out;
    }).then(function (rows) { return rows.sort(function (a, b) { return a.k - b.k; }).map(function (r) { return r.bytes; }); });
  }
  function dropPieces(rec) {
    return tx(PIECES, 'readwrite', function (s) {
      s.index('rec').openKeyCursor(IDBKeyRange.only(rec)).onsuccess = function (e) {
        var c = e.target.result;
        if (c) { s.delete(c.primaryKey); c.continue(); }
      };
    });
  }
  function forgetNote(id) {
    return note(id).then(function (n) {
      if (!n) return;
      return Promise.all([dropMedia(n.media), dropMedia(n.sound), dropMedia(n.cut), dropPieces(id)])
        .then(function () { return tx(NOTES, 'readwrite', function (s) { s.delete(id); }); });
    });
  }

  return { reorder: reorder, note: note, notes: notes, putNote: putNote, changeNote: changeNote, media: media, putMedia: putMedia,
           dropMedia: dropMedia, addPiece: addPiece, pieces: pieces, dropPieces: dropPieces, forgetNote: forgetNote,
           guide: guide, guides: guides, putGuide: putGuide, change: change,
           steps: steps, count: count, addStep: addStep, changeStep: changeStep, dropStep: dropStep, forget: forget };
})();
