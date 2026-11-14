/* Downloads: a guide or a note as the portable JSON (format.js), as one
   HTML page that opens anywhere with no extension and no server (a guide's
   pictures and, if you choose, a note's recording are inside it), and a
   note as Markdown. */
var Export = (function () {
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function slug(s) {
    return String(s || 'guide').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'guide';
  }
  function host(url) { try { return new URL(url).host; } catch (e) { return ''; } }
  function html(g) {
    var steps = g.steps.map(function (s) {
      var h = s.highlight;
      var ring = h ? '<span class="ring" style="left:' + h.x + '%;top:' + h.y + '%;width:' + h.w + '%;height:' + h.h + '%"></span>' : '';
      var pic = '';
      if (s.clip) {
        // the first frame keeps the box's size; the others lie on top of it
        pic = '<div class="pic" data-clip="1">' + s.clip.frames.map(function (f, k) {
          return '<img class="f' + (k ? ' over' : '') + '" alt="' + (k ? '' : 'The page at step ' + s.n) + '" src="data:' + esc(s.clip.type) + ';base64,' + f + '">';
        }).join('') + ring + '<span class="tag">Moving</span></div>';
      } else if (s.image) {
        pic = '<div class="pic"><img alt="The page at step ' + s.n + '" src="data:' + esc(s.image.type) + ';base64,' + s.image.data + '">' + ring + '</div>';
      }
      var where = s.page && s.page.url ? '<p class="where">' + esc((s.page.title ? s.page.title + ' · ' : '') + host(s.page.url)) + '</p>' : '';
      var tip = s.note ? '<p class="tip">' + esc(s.note) + '</p>' : '';
      return '<li><div class="head"><i>' + s.n + '</i><p>' + esc(s.sentence) + '</p></div>' + tip + pic + where + '</li>';
    }).join('\n');
    var made = g.finishedAt ? new Date(g.finishedAt).toLocaleDateString([], { dateStyle: 'medium' }) : '';
    return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">' +
      '<meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + esc(g.title) + '</title><style>' +
      ':root{--accent:#9140B0;--ink:#111111;--soft:#5f5f66;--line:#e6e3e8;--bg:#f7f6f8}' +
      '*{box-sizing:border-box}body{margin:0;font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg)}' +
      '.w{max-width:880px;margin:0 auto;padding:40px 16px 64px}h1{font-size:30px;line-height:1.2;letter-spacing:-.01em;margin:0 0 10px}' +
      '.intro{color:var(--soft);margin:0 0 28px}.chip{display:inline-block;background:#f4ecf8;color:#6e2c88;border-radius:999px;padding:4px 10px;font-size:13px;font-weight:600;margin-right:6px}' +
      'ol{list-style:none;margin:0;padding:0;display:grid;gap:18px}li{background:#fff;border:1px solid var(--line);border-radius:16px;padding:16px;box-shadow:0 1px 2px rgba(17,17,17,.05),0 4px 16px rgba(17,17,17,.05)}' +
      '.head{display:flex;gap:12px;align-items:flex-start;margin-bottom:12px}' +
      '.head i{font-style:normal;flex:none;width:34px;height:34px;border-radius:50%;background:var(--accent);color:#fff;display:grid;place-items:center;font-weight:700;font-size:15px}' +
      '.head p{margin:5px 0 0;font-weight:600}.pic{position:relative;border:1px solid var(--line);border-radius:12px;overflow:hidden}' +
      '.pic img{display:block;width:100%;height:auto}.ring{position:absolute;border:3px solid var(--accent);border-radius:8px;box-shadow:0 0 0 5px rgba(145,64,176,.22)}' +
      '.where{margin:10px 0 0;font-size:13px;color:var(--soft)}.tip{margin:0 0 12px 46px;color:var(--soft)}' +
      '.pic img.over{position:absolute;inset:0;width:100%;height:100%}.pic img.f{transition:opacity .25s}.ring{transition:opacity .25s}' +
      '.tag{position:absolute;left:10px;bottom:10px;background:rgba(17,17,17,.78);color:#fff;font-size:12px;font-weight:600;border-radius:999px;padding:3px 9px}' +
      '</style></head><body><div class="w"><h1>' + esc(g.title) + '</h1>' +
      '<div class="intro">' + (g.intro ? esc(g.intro) + ' ' : '') + '<span class="chip">' + g.steps.length + (g.steps.length === 1 ? ' step' : ' steps') + '</span>' +
      (made ? '<span class="chip">' + esc(made) + '</span>' : '') + '</div>' +
      '<ol>' + steps + '</ol></div>' +
      (typeof playClips === 'function' && g.steps.some(function (s) { return s.clip; }) ? '<script>' + playClips.toString() + '\nplayClips();</script>' : '') +
      '</body></html>\n';
  }
  /* A NOTE AS ONE PAGE: the recording (when given, as a data address),
     the notes, and the transcript; a time in either jumps the player. */
  function noteHtml(n, mediaUrl, mediaType) {
    var when = n.createdAt ? new Date(n.createdAt).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : '';
    var player = !mediaUrl ? '' : /^video/.test(mediaType)
      ? '<video id="m" controls playsinline preload="metadata" src="' + mediaUrl + '"></video>'
      : '<audio id="m" controls preload="metadata" src="' + mediaUrl + '"></audio>';
    var tr = n.transcript && n.transcript.utterances && n.transcript.utterances.length
      ? '<h2>Transcript</h2><div class="tr">' + n.transcript.utterances.map(function (u) {
          return '<p><span class="ts" data-t="' + (+u.start || 0) + '">' + clock(u.start) + '</span>' + (u.speaker ? '<b>' + esc(u.speaker) + '</b> ' : '') + esc(u.text) + '</p>';
        }).join('') + '</div>'
      : (n.transcript && n.transcript.text ? '<h2>Transcript</h2><div class="tr"><p>' + esc(n.transcript.text) + '</p></div>' : '');
    var kinds = { call: 'Call', video: 'Video', audio: 'Voice note' };
    return '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
      '<title>' + esc(n.title) + '</title><style>' +
      ':root{--accent:#9140B0;--ink:#111;--soft:#5f5f66;--line:#e6e3e8;--bg:#f7f6f8}*{box-sizing:border-box}' +
      'body{margin:0;font:16px/1.6 "League Spartan",system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;color:var(--ink);background:var(--bg)}' +
      '.w{max-width:880px;margin:0 auto;padding:40px 16px 64px}h1{font-size:30px;line-height:1.2;margin:0 0 10px}h2{font-size:19px;margin:26px 0 8px}' +
      '.chip{display:inline-block;background:#f4ecf8;color:#6e2c88;border-radius:999px;padding:4px 10px;font-size:13px;font-weight:600;margin:0 6px 18px 0}' +
      'video,audio{display:block;width:100%;border-radius:14px;background:#111;margin:0 0 8px}audio{background:none}' +
      '.card{background:#fff;border:1px solid var(--line);border-radius:16px;padding:6px 22px 18px;margin-top:16px}' +
      '.ts{display:inline-block;font-variant-numeric:tabular-nums;font-size:13px;font-weight:700;color:var(--accent);background:#f4ecf8;border-radius:6px;padding:0 6px;margin-right:8px;cursor:pointer}' +
      'ul[data-checks]{list-style:none;padding-left:0}ul[data-checks] li:before{content:"☐ ";color:var(--accent)}ul[data-checks] li[data-done="1"]:before{content:"☑ "}' +
      '.tr p{margin:0 0 10px}.tr b{font-weight:700}' +
      '</style></head><body><div class="w"><h1>' + esc(n.title) + '</h1>' +
      '<span class="chip">' + (kinds[n.kind] || 'Recording') + '</span>' + (n.seconds ? '<span class="chip">' + clock(n.seconds) + '</span>' : '') +
      (when ? '<span class="chip">' + esc(when) + '</span>' : '') + player +
      (summaryHtml(n) ? '<div class="card"><h2>Summary</h2>' + summaryHtml(n) + '</div>' : '') +
      (n.notes.html ? '<div class="card"><h2>Notes</h2>' + n.notes.html + '</div>' : '') + (tr ? '<div class="card">' + tr + '</div>' : '') +
      '</div><script>document.addEventListener("click",function(e){var t=e.target.closest(".ts"),m=document.getElementById("m");' +
      'if(t&&m){m.currentTime=+t.dataset.t' + (n.trim ? '-' + (+n.trim.from || 0) : '') + ';m.play();}});</script></body></html>\n';
  }
  function summaryHtml(n) { return n.summary && typeof Templates !== 'undefined' ? Templates.html(n.summary) : ''; }
  function clock(s) {
    s = Math.max(0, Math.round(s || 0));
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    return (h ? h + ':' + ('0' + m).slice(-2) : m) + ':' + ('0' + (s % 60)).slice(-2);
  }
  function noteMarkdown(n) {
    var out = '# ' + n.title + '\n\n';
    if (summaryHtml(n)) out += '## Summary\n\n' + Format.markdown(summaryHtml(n)) + '\n\n';
    if (n.notes.markdown) out += '## Notes\n\n' + n.notes.markdown + '\n\n';
    if (n.transcript && n.transcript.utterances && n.transcript.utterances.length) {
      out += '## Transcript\n\n' + n.transcript.utterances.map(function (u) {
        return '[' + clock(u.start) + '] ' + (u.speaker ? '**' + u.speaker + ':** ' : '') + u.text;
      }).join('\n\n') + '\n';
    } else if (n.transcript && n.transcript.text) out += '## Transcript\n\n' + n.transcript.text + '\n';
    return out;
  }
  function blobUrl(blob) {
    return new Promise(function (ok, bad) { var r = new FileReader(); r.onload = function () { ok(r.result); }; r.onerror = bad; r.readAsDataURL(blob); });
  }
  function downloadBlob(name, blob) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 60000);
  }
  function download(name, type, text) {
    var url = URL.createObjectURL(new Blob([text], { type: type }));
    var a = document.createElement('a');
    a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 30000);
  }
  return {
    html: html, noteHtml: noteHtml, summaryHtml: summaryHtml, noteMarkdown: noteMarkdown, blobUrl: blobUrl, downloadBlob: downloadBlob, slug: slug,
    downloadNoteHtml: function (n, blob) {
      return (blob ? blobUrl(blob) : Promise.resolve('')).then(function (u) { download(slug(n.title) + '.html', 'text/html', noteHtml(n, u, blob && blob.type)); });
    },
    downloadNoteMarkdown: function (n) { download(slug(n.title) + '.md', 'text/markdown', noteMarkdown(n)); },
    downloadNoteJson: function (n) { download(slug(n.title) + '.json', 'application/json', JSON.stringify(n, null, 2)); },
    downloadHtml: function (g) { download(slug(g.title) + '.html', 'text/html', html(g)); },
    downloadJson: function (g) { download(slug(g.title) + '.json', 'application/json', JSON.stringify(g, null, 2)); }
  };
})();
