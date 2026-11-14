/* SENDING. A finished note or guide goes to each connection that takes
   its kind and is set to get things by itself; the note's page can send it
   to any connection by hand. Each item remembers, per connection:

     sent[connectionId] = { state: 'sending' | 'sent' | 'waiting' | 'failed',
                            at, url, error, tries, next }

   A send that fails for a reason that may pass (offline, the other side
   down) is tried again after 1, 2, 4 ... minutes, eight times; one that
   cannot pass (a wrong key) stops at once and says why. Runs in the
   background and on the extension's pages alike. */
var Outbox = (function () {
  var TRIES = 8;
  var busy = {};

  function load(type, id) {
    if (type === 'guide') {
      return Promise.all([Store.guide(id), Store.steps(id)]).then(function (r) {
        if (!r[0]) return null;
        var data = Format.portable(r[0], r[1]);
        return { row: r[0], kind: 'guide', item: { type: 'guide', data: data, html: Export.html(data), markdown: guideMarkdown(data) } };
      });
    }
    return Store.note(id).then(function (n) {
      if (!n || !n.ended) return null;
      return { row: n, kind: n.kind, item: null };
    });
  }
  function guideMarkdown(g) {
    return '# ' + g.title + '\n\n' + (g.intro ? g.intro + '\n\n' : '') +
      g.steps.map(function (s) { return s.n + '. ' + s.sentence + (s.note ? '\n   > ' + s.note : ''); }).join('\n') + '\n';
  }
  /* The recording a connection may send: for a trimmed one only the cut
     copy (the note page makes it when the trim is saved), never the whole. */
  function mediaOf(n) {
    if (n.trim) {
      if (!n.cut) return Promise.reject(Object.assign(new Error('The trimmed copy is not made yet. Open the note once to make it.'), { final: false }));
      return Store.media(n.cut);
    }
    return Store.media(n.media || n.sound);
  }
  function noteItem(n, withMedia) {
    return (withMedia ? mediaOf(n) : Promise.resolve(null)).then(function (blob) {
      var data = Format.note(n, blob);
      return { type: 'note', data: data, html: Export.noteHtml(data, '', ''), markdown: Export.noteMarkdown(data), media: blob };
    });
  }
  function mark(type, id, connId, value) {
    var fn = function (row) { row.sent = row.sent || {}; row.sent[connId] = value; };
    return type === 'guide' ? Store.change(id, fn) : Store.changeNote(id, fn);
  }

  /* One item to one connection. Resolves to the new sent[connId]. */
  function send(type, id, connId) {
    var key = type + id + connId;
    if (busy[key]) return busy[key];
    var p = Promise.all([load(type, id), Connections.all()]).then(function (r) {
      var got = r[0], conn = r[1].filter(function (c) { return c.id === connId; })[0];
      if (!got) throw Object.assign(new Error('It is no longer in this browser.'), { final: true });
      if (!conn) throw Object.assign(new Error('That connection was removed in Settings.'), { final: true });
      var dest = Destinations[conn.kind], before = (got.row.sent || {})[connId] || {};
      var tries = (before.state === 'waiting' ? before.tries || 0 : 0) + 1;
      return mark(type, id, connId, { state: 'sending', at: Date.now(), tries: tries }).then(function () {
        return got.item ? got.item : noteItem(got.row, conn.media && dest.media);
      }).then(function (item) {
        return dest.send(item, Object.assign({ _id: conn.id }, conn.config));
      }).then(function (res) {
        return { state: 'sent', at: Date.now(), url: (res && res.url) || '', tries: tries };
      }, function (err) {
        var msg = String((err && err.message) || err || 'It did not go through.');
        if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) msg = 'Could not reach it (offline, or Chrome was not allowed to reach that address).';
        if (err && err.final || tries >= TRIES) return { state: 'failed', at: Date.now(), error: msg, tries: tries };
        return { state: 'waiting', at: Date.now(), error: msg, tries: tries, next: Date.now() + 60000 * Math.pow(2, tries - 1) };
      }).then(function (v) { return mark(type, id, connId, v).then(function () { return v; }); });
    }).finally(function () { delete busy[key]; });
    busy[key] = p;
    return p;
  }

  /* A finished item, to every connection that takes it by itself. */
  function auto(type, id) {
    return Promise.all([load(type, id), Connections.all()]).then(function (r) {
      if (!r[0]) return [];
      var kind = r[0].kind, sent = r[0].row.sent || {};
      return Promise.all(r[1].filter(function (c) { return c.auto && c.what.indexOf(kind) > -1 && !sent[c.id]; })
        .map(function (c) { return send(type, id, c.id).catch(function () {}); }));
    });
  }

  /* Everything waiting whose time has come; a send left "sending" by a
     browser that closed counts as waiting. */
  function retryWaiting() {
    var now = Date.now();
    function due(v) { return v && ((v.state === 'waiting' && (v.next || 0) <= now) || (v.state === 'sending' && now - (v.at || 0) > 10 * 60000)); }
    return Promise.all([Store.guides(), Store.notes()]).then(function (r) {
      var jobs = [];
      r[0].forEach(function (g) { Object.keys(g.sent || {}).forEach(function (c) { if (due(g.sent[c])) jobs.push(send('guide', g.id, c)); }); });
      r[1].forEach(function (n) { Object.keys(n.sent || {}).forEach(function (c) { if (due(n.sent[c])) jobs.push(send('note', n.id, c)); }); });
      return Promise.all(jobs.map(function (j) { return j.catch(function () {}); }));
    });
  }

  /* Chrome asks you, once per address, before the extension may reach it. */
  function origins(conn) {
    var d = Destinations[conn.kind];
    return (d && d.origins ? d.origins(conn.config || {}) : []).filter(Boolean).map(function (o) { return o + '/*'; });
  }
  return { send: send, auto: auto, retryWaiting: retryWaiting, origins: origins, noteItem: noteItem, guideMarkdown: guideMarkdown };
})();

// the background wakes every minute to send what is waiting
if (typeof window === 'undefined' && chrome.alarms) {
  chrome.alarms.create('outbox', { periodInMinutes: 1 });
  chrome.alarms.onAlarm.addListener(function (a) { if (a.name === 'outbox') Outbox.retryWaiting(); });
}
