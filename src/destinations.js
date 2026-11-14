/* WHERE FINISHED NOTES AND GUIDES GO. This file is the only place the
   extension sends your recordings, notes and guides out of the browser, so
   connecting it to another system means adding one entry here.

   A destination is:

     {
       label, help:  shown in Settings,
       fields:  the settings it needs, [{ key, label, type, placeholder, help }],
       media:   true when it can take the recording file itself,
       origins: function (config) -> the web origins it calls, so Chrome can
                ask your permission to reach them,
       send:    function (item, config) -> Promise of { url? }
     }

   item is what outbox.js hands over:

     { type: 'note' | 'guide',
       data:  the portable JSON (format.js: "orbit-note/1" or "step-guide/1"),
       html:  the same as a page of HTML (no player, pictures inline),
       markdown: the same as Markdown,
       media: the recording as a Blob, only when the connection is set to
              send it (and, for a trimmed recording, only the kept part) }

   Resolve when the other system has it. Reject with an Error to have it
   tried again later; set error.final = true when trying again cannot help
   (a wrong key, a page that does not exist). The item stays in the browser
   either way. */
var Destinations = (function () {
  function origin(url) { try { var u = new URL(url); return /^https?:$/.test(u.protocol) ? u.origin : null; } catch (e) { return null; } }
  function need(ok, text) { if (!ok) throw Object.assign(new Error(text), { final: true }); }
  // a 4xx other than "too many" will answer the same next time
  function failed(r, who) {
    return r.text().catch(function () { return ''; }).then(function (t) {
      var msg = '';
      try { var j = JSON.parse(t); msg = j.message || (j.error && (j.error.message || j.error)) || (j.errors && j.errors[0] && (j.errors[0].detail || j.errors[0].title)) || ''; } catch (e) {}
      var err = new Error(who + ' answered ' + r.status + (msg ? ': ' + String(msg).slice(0, 200) : '.'));
      err.final = r.status >= 400 && r.status < 500 && r.status !== 408 && r.status !== 429;
      throw err;
    });
  }
  function json(r, who) { return r.ok ? r.json().catch(function () { return {}; }) : failed(r, who); }
  function link(u) { return typeof u === 'string' && /^https:\/\//.test(u) ? u : ''; }
  function title(item) { return String(item.data.title || (item.type === 'guide' ? 'Guide' : 'Recording')).slice(0, 200); }

  /* HMAC-SHA256 of the body with your secret, so your server can tell the
     request came from you: X-Orbit-Signature: sha256=<hex> */
  function sign(secret, body) {
    var enc = new TextEncoder();
    return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
      .then(function (k) { return crypto.subtle.sign('HMAC', k, enc.encode(body)); })
      .then(function (sig) { return 'sha256=' + Array.from(new Uint8Array(sig)).map(function (b) { return ('0' + b.toString(16)).slice(-2); }).join(''); });
  }

  /* ---- Notion: the note or guide as a page under a page you shared with
     your integration, or as a row in a database ---- */
  var NOTION = 'https://api.notion.com/v1/', NOTION_VERSION = '2022-06-28';
  function rich(text) {
    // bold **x** survives; Notion caps one text run at 2000 characters
    var out = [], parts = String(text || '').split(/(\*\*[^*]+\*\*)/);
    parts.forEach(function (p) {
      if (!p) return;
      var bold = /^\*\*[^*]+\*\*$/.test(p), t = bold ? p.slice(2, -2) : p;
      for (var i = 0; i < t.length; i += 2000) out.push({ type: 'text', text: { content: t.slice(i, i + 2000) }, annotations: { bold: bold } });
    });
    return out.length ? out : [{ type: 'text', text: { content: '' } }];
  }
  function blocks(md) {
    var out = [];
    String(md || '').split('\n').forEach(function (line) {
      var l = line.replace(/\s+$/, ''), m;
      if (!l.trim()) return;
      if ((m = /^(#{1,3}) (.*)$/.exec(l))) { var h = 'heading_' + m[1].length; out.push({ type: h, [h]: { rich_text: rich(m[2]) } }); return; }
      if ((m = /^- \[( |x)\] (.*)$/.exec(l))) { out.push({ type: 'to_do', to_do: { rich_text: rich(m[2]), checked: m[1] === 'x' } }); return; }
      if ((m = /^[-*] (.*)$/.exec(l))) { out.push({ type: 'bulleted_list_item', bulleted_list_item: { rich_text: rich(m[1]) } }); return; }
      if ((m = /^\d+\. (.*)$/.exec(l))) { out.push({ type: 'numbered_list_item', numbered_list_item: { rich_text: rich(m[1]) } }); return; }
      if ((m = /^> (.*)$/.exec(l))) { out.push({ type: 'quote', quote: { rich_text: rich(m[1]) } }); return; }
      out.push({ type: 'paragraph', paragraph: { rich_text: rich(l) } });
    });
    return out;
  }
  function notionId(v) {
    var s = String(v || '').replace(/-/g, ''), m = s.match(/[0-9a-f]{32}(?=[^0-9a-f]*$)/i);
    return m ? m[0] : '';
  }
  function notionFetch(c, path, body, method) {
    return fetch(NOTION + path, {
      method: method || 'POST',
      headers: { Authorization: 'Bearer ' + c.token, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (r) { return json(r, 'Notion'); });
  }
  // a file (a step's picture, a short recording) into Notion; up to 20 MB in one go
  function notionUpload(c, blob, name) {
    if (!blob || blob.size > 20 * 1024 * 1024) return Promise.resolve(null);
    return notionFetch(c, 'file_uploads', { filename: name, content_type: blob.type || 'application/octet-stream' }).then(function (up) {
      var form = new FormData();
      form.append('file', blob, name);
      return fetch(NOTION + 'file_uploads/' + up.id + '/send', {
        method: 'POST', headers: { Authorization: 'Bearer ' + c.token, 'Notion-Version': NOTION_VERSION }, body: form
      }).then(function (r) { return json(r, 'Notion'); }).then(function () { return up.id; });
    });
  }
  function b64blob(b64, type) {
    var bin = atob(b64), bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: type });
  }
  function notionChildren(item, c) {
    if (item.type === 'guide') {
      var g = item.data, head = g.intro ? [{ type: 'paragraph', paragraph: { rich_text: rich(g.intro) } }] : [];
      // one step at a time: its sentence, its picture, its tip
      return g.steps.reduce(function (chain, s) {
        return chain.then(function (list) {
          list.push({ type: 'numbered_list_item', numbered_list_item: { rich_text: rich(s.sentence) } });
          var pic = s.image ? notionUpload(c, b64blob(s.image.data, s.image.type), 'step-' + s.n + '.jpg') : Promise.resolve(null);
          return pic.then(function (id) {
            if (id) list.push({ type: 'image', image: { type: 'file_upload', file_upload: { id: id } } });
            if (s.note) list.push({ type: 'callout', callout: { rich_text: rich(s.note), icon: { emoji: '💡' } } });
            return list;
          });
        });
      }, Promise.resolve(head));
    }
    var list = blocks(item.markdown.replace(/^# .*\n+/, ''));
    var file = item.media ? notionUpload(c, item.media, item.data.media.file) : Promise.resolve(null);
    return file.then(function (id) {
      if (id) list.unshift({ type: /^video/.test(item.media.type) ? 'video' : 'audio', [/^video/.test(item.media.type) ? 'video' : 'audio']: { type: 'file_upload', file_upload: { id: id } } });
      return list;
    });
  }

  /* ---- Google Docs: your own OAuth client, a Doc made from the HTML ---- */
  function googleToken(c, interactive) {
    var cached = c._token && c._tokenUntil > Date.now() + 60000 ? c._token : '';
    if (cached) return Promise.resolve(cached);
    need(c.clientId, 'Add your Google OAuth client id in Settings.');
    var redirect = chrome.identity.getRedirectURL('google');
    var url = 'https://accounts.google.com/o/oauth2/v2/auth?response_type=token&prompt=' + (interactive ? 'consent' : 'none') +
      '&client_id=' + encodeURIComponent(c.clientId) + '&redirect_uri=' + encodeURIComponent(redirect) +
      '&scope=' + encodeURIComponent('https://www.googleapis.com/auth/drive.file');
    return chrome.identity.launchWebAuthFlow({ url: url, interactive: !!interactive }).then(function (back) {
      var h = new URLSearchParams(String(back || '').split('#')[1] || '');
      need(h.get('access_token'), 'Google did not let this extension in. Press "Sign in with Google" in Settings.');
      var token = h.get('access_token'), until = Date.now() + 1000 * (+h.get('expires_in') || 3000);
      return Connections.patch(c._id, { _token: token, _tokenUntil: until }).then(function () { return token; });
    }, function () {
      throw Object.assign(new Error('Google sign-in is needed. Press "Sign in with Google" in Settings.'), { final: !interactive });
    });
  }
  function driveUpload(token, meta, blob) {
    var form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
    form.append('file', blob);
    return fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
      method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form
    }).then(function (r) { return json(r, 'Google Drive'); });
  }

  /* ---- Teamtailor and HubSpot: a note on the person the email belongs to ---- */
  function email(v) { var s = String(v || '').trim(); return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : ''; }
  function whoFor(item, c) { return email(item.data.contact) || email(c.email); }

  var list = {
    /* One POST of the whole note or guide as JSON. With "Send the recording
       file" on, a multipart form instead: "item" (the JSON) and "media" (the
       file). The other side answers 2xx; a "url" in its JSON answer is
       linked from the note's page. Works with Zapier, Make and n8n "catch
       hook" addresses too. */
    webhook: {
      label: 'Webhook or your own backend', media: true,
      help: 'Your server, or a Zapier, Make or n8n hook address. Gets the whole note or guide as JSON.',
      fields: [
        { key: 'url', label: 'Address', type: 'url', placeholder: 'https://example.com/hooks/orbit' },
        { key: 'token', label: 'Bearer token (optional)', type: 'password', help: 'Sent as "Authorization: Bearer <token>".' },
        { key: 'secret', label: 'Signing secret (optional)', type: 'password', help: 'Signs each request: X-Orbit-Signature: sha256=<HMAC of the body>.' }
      ],
      origins: function (c) { return [origin(c.url)]; },
      send: function (item, c) {
        need(origin(c.url), 'Add the address in Settings.');
        var body = JSON.stringify(item.type === 'guide' ? item.data : Object.assign({}, item.data, { html: item.html }));
        var headers = { 'X-Orbit-Event': item.type + '.finished' };
        if (c.token) headers.Authorization = 'Bearer ' + c.token;
        return (c.secret ? sign(c.secret, body) : Promise.resolve('')).then(function (sig) {
          if (sig) headers['X-Orbit-Signature'] = sig;
          var payload = body;
          if (item.media) {
            payload = new FormData();
            payload.append('item', new Blob([body], { type: 'application/json' }), 'item.json');
            payload.append('media', item.media, item.data.media.file);
          } else headers['Content-Type'] = 'application/json';
          return fetch(c.url, { method: 'POST', headers: headers, body: payload });
        }).then(function (r) { return json(r, 'The address'); }).then(function (j) { return { url: link(j && j.url) }; });
      }
    },

    notion: {
      label: 'Notion', media: true, site: 'https://www.notion.so/profile/integrations',
      help: 'Make an internal integration, copy its secret, then share a page or database with it (••• → Connections).',
      fields: [
        { key: 'token', label: 'Integration secret', type: 'password', placeholder: 'ntn_...' },
        { key: 'parent', label: 'Page or database link', type: 'url', placeholder: 'https://www.notion.so/...', help: 'A page: each note becomes a page inside it. A database: each note becomes a row.' },
        { key: 'database', label: 'It is a database', type: 'checkbox' }
      ],
      origins: function () { return ['https://api.notion.com']; },
      send: function (item, c) {
        need(c.token, 'Add your Notion integration secret in Settings.');
        var parent = notionId(c.parent);
        need(parent, 'Add the link of the Notion page or database in Settings.');
        return notionChildren(item, c).then(function (children) {
          var page = { parent: c.database ? { database_id: parent } : { page_id: parent },
                       properties: c.database ? { Name: { title: rich(title(item)) } } : { title: { title: rich(title(item)) } },
                       children: children.slice(0, 100) };
          return notionFetch(c, 'pages', page).then(function (p) {
            // Notion takes 100 blocks per call: the rest follow in order
            var rest = children.slice(100), chain = Promise.resolve();
            for (var i = 0; i < rest.length; i += 100) {
              (function (part) { chain = chain.then(function () { return notionFetch(c, 'blocks/' + p.id + '/children', { children: part }, 'PATCH'); }); })(rest.slice(i, i + 100));
            }
            return chain.then(function () { return { url: link(p.url) }; });
          });
        });
      }
    },

    gdocs: {
      label: 'Google Docs', media: true, site: 'https://console.cloud.google.com/apis/credentials',
      help: 'Uses your own Google OAuth client (Web application) with the redirect address shown below. Only files this extension makes are visible to it.',
      fields: [
        { key: 'clientId', label: 'OAuth client id', placeholder: '1234-abc.apps.googleusercontent.com' },
        { key: 'folder', label: 'Folder link (optional)', type: 'url', placeholder: 'https://drive.google.com/drive/folders/...' }
      ],
      origins: function () { return ['https://www.googleapis.com']; },
      signIn: function (c) { return googleToken(c, true); },
      send: function (item, c) {
        var folder = (String(c.folder || '').match(/folders\/([A-Za-z0-9_-]+)/) || [])[1];
        return googleToken(c, false).then(function (token) {
          var parents = folder ? [folder] : undefined;
          // the recording first, so the Doc can link to it
          var file = item.media ? driveUpload(token, { name: item.data.media.file, parents: parents }, item.media) : Promise.resolve(null);
          return file.then(function (f) {
            var html = item.html.replace('<body>', '<body>' + (f && f.webViewLink ? '<p><a href="' + f.webViewLink + '">Recording</a></p>' : ''));
            return driveUpload(token, { name: title(item), mimeType: 'application/vnd.google-apps.document', parents: parents }, new Blob([html], { type: 'text/html' }));
          }).then(function (doc) { return { url: link(doc.webViewLink) }; });
        });
      }
    },

    teamtailor: {
      label: 'Teamtailor', site: 'https://support.teamtailor.com/en/articles/2264349-api-keys',
      help: 'A note on the candidate whose email you give on the note (or the one below). Needs an Admin API key with read and write.',
      fields: [
        { key: 'key', label: 'API key', type: 'password' },
        { key: 'region', label: 'Region', type: 'select', options: [['api.teamtailor.com', 'Europe'], ['api.na.teamtailor.com', 'North America']] },
        { key: 'email', label: 'Candidate email (when the note has none)', type: 'email' }
      ],
      origins: function () { return ['https://api.teamtailor.com', 'https://api.na.teamtailor.com']; },
      send: function (item, c) {
        need(c.key, 'Add your Teamtailor API key in Settings.');
        var to = whoFor(item, c);
        need(to, 'Add the candidate’s email on the note first.');
        var base = 'https://' + (c.region === 'api.na.teamtailor.com' ? 'api.na.teamtailor.com' : 'api.teamtailor.com') + '/v1/';
        var H = { Authorization: 'Token token=' + c.key, 'X-Api-Version': '20240904', 'Content-Type': 'application/vnd.api+json' };
        return fetch(base + 'candidates?filter[email]=' + encodeURIComponent(to), { headers: H }).then(function (r) { return json(r, 'Teamtailor'); }).then(function (j) {
          var cand = (j.data || [])[0];
          need(cand, 'Teamtailor has no candidate with the email ' + to + '.');
          var body = { data: { type: 'notes', attributes: { note: (title(item) + '\n\n' + item.markdown.replace(/^# .*\n+/, '')).slice(0, 60000) },
                               relationships: { candidate: { data: { type: 'candidates', id: cand.id } } } } };
          return fetch(base + 'notes', { method: 'POST', headers: H, body: JSON.stringify(body) }).then(function (r) { return json(r, 'Teamtailor'); })
            .then(function () { return { url: link(cand.links && cand.links['careersite-candidate-url']) }; });
        });
      }
    },

    hubspot: {
      label: 'HubSpot', site: 'https://developers.hubspot.com/docs/api/private-apps',
      help: 'A note on the contact whose email you give on the note. Needs a private app token with crm.objects.contacts read and write.',
      fields: [
        { key: 'token', label: 'Private app token', type: 'password', placeholder: 'pat-...' },
        { key: 'email', label: 'Contact email (when the note has none)', type: 'email' }
      ],
      origins: function () { return ['https://api.hubapi.com']; },
      send: function (item, c) {
        need(c.token, 'Add your HubSpot private app token in Settings.');
        var to = whoFor(item, c);
        need(to, 'Add the contact’s email on the note first.');
        var H = { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json' };
        return fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
          method: 'POST', headers: H,
          body: JSON.stringify({ filterGroups: [{ filters: [{ propertyName: 'email', operator: 'EQ', value: to }] }], limit: 1 })
        }).then(function (r) { return json(r, 'HubSpot'); }).then(function (j) {
          var contact = (j.results || [])[0];
          need(contact, 'HubSpot has no contact with the email ' + to + '.');
          var body = item.html.replace(/^[\s\S]*<body[^>]*>|<\/body>[\s\S]*$/g, '').replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, '');
          return fetch('https://api.hubapi.com/crm/v3/objects/notes', {
            method: 'POST', headers: H,
            body: JSON.stringify({ properties: { hs_timestamp: new Date().toISOString(), hs_note_body: body.slice(0, 65000) },
                                   associations: [{ to: { id: contact.id }, types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: 202 }] }] })
          }).then(function (r) { return json(r, 'HubSpot'); }).then(function () { return { url: '' }; });
        });
      }
    }
  };
  return list;
})();

/* Connections, as saved in Settings: each is one destination with its own
   settings, what it takes (calls, videos, voice notes, guides), whether it
   gets the recording file, and whether finished items go there by
   themselves. */
var Connections = {
  KINDS: { call: 'Calls', video: 'Videos', audio: 'Voice notes', guide: 'Guides' },
  all: function () {
    return chrome.storage.local.get(['connections']).then(function (s) {
      return (s.connections || []).filter(function (c) { return c && Destinations[c.kind]; }).map(function (c) {
        return Object.assign({ name: Destinations[c.kind].label, what: ['call', 'video', 'audio', 'guide'], auto: false, media: false, config: {} }, c);
      });
    });
  },
  save: function (list) { return chrome.storage.local.set({ connections: list }); },
  patch: function (id, config) {
    return chrome.storage.local.get(['connections']).then(function (s) {
      var list = s.connections || [];
      list.forEach(function (c) { if (c.id === id) c.config = Object.assign({}, c.config, config); });
      return chrome.storage.local.set({ connections: list });
    });
  }
};
