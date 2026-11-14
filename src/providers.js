/* THE TWO SERVICES ORBIT CAN USE, WITH YOUR OWN KEYS. Both are optional:
   with neither, a recording is kept with your typed notes only.

     Transcribe   turns a recording's sound into words, with who spoke
                  when the service can tell (Deepgram, AssemblyAI), or any
                  service of yours that takes audio and answers JSON.
     Write        turns the words into a write-up from a template
                  (templates.js), and a guide's steps into plain sentences
                  (Claude by Anthropic, any OpenAI-compatible service,
                  or your own).

   Keys are kept in this browser's extension storage and sent only to the
   service they belong to. Adding a service is one entry below: its fields,
   the address it calls (Chrome is asked for permission to reach it when
   you save), and one function. */
var Providers = (function () {
  function need(ok, text) { if (!ok) throw new Error(text); }
  function fail(r, who) {
    return r.text().then(function (t) {
      var msg = '';
      try { var j = JSON.parse(t); msg = (j.error && (j.error.message || j.error)) || j.message || j.err_msg || ''; } catch (e) { msg = t.slice(0, 200); }
      throw new Error(who + ' answered ' + r.status + (msg ? ': ' + String(msg).slice(0, 200) : '') + '.');
    });
  }
  function origin(url) { try { return new URL(url).origin; } catch (e) { return null; } }
  function langOf(c) { return String(c.lang || '').trim().toLowerCase(); }

  var transcribe = {
    none: { label: 'Off: no transcript', fields: [], origin: function () { return null; }, run: null },

    deepgram: {
      label: 'Deepgram', site: 'https://console.deepgram.com',
      fields: [{ key: 'key', label: 'API key', type: 'password' },
               { key: 'model', label: 'Model', placeholder: 'nova-3' },
               { key: 'lang', label: 'Language', placeholder: 'Leave empty to detect it', help: 'A code such as en, es or pt-BR.' }],
      origin: function () { return 'https://api.deepgram.com'; },
      run: function (blob, c) {
        need(c.key, 'Add your Deepgram API key in Settings.');
        var q = 'model=' + encodeURIComponent(c.model || 'nova-3') + '&smart_format=true&punctuate=true&diarize=true&utterances=true' +
                (langOf(c) ? '&language=' + encodeURIComponent(langOf(c)) : '&detect_language=true');
        return fetch('https://api.deepgram.com/v1/listen?' + q, { method: 'POST', headers: { Authorization: 'Token ' + c.key, 'Content-Type': blob.type || 'audio/webm' }, body: blob })
          .then(function (r) { return r.ok ? r.json() : fail(r, 'Deepgram'); })
          .then(function (j) {
            var res = j.results || {}, alt = (((res.channels || [])[0] || {}).alternatives || [])[0] || {};
            return { utterances: (res.utterances || []).map(function (u) { return { speaker: u.speaker, start: u.start, end: u.end, text: u.transcript }; }),
                     text: alt.transcript || '', language: ((res.channels || [])[0] || {}).detected_language || langOf(c) };
          });
      }
    },

    assemblyai: {
      label: 'AssemblyAI', site: 'https://www.assemblyai.com/dashboard',
      fields: [{ key: 'key', label: 'API key', type: 'password' },
               { key: 'lang', label: 'Language', placeholder: 'Leave empty to detect it' }],
      origin: function () { return 'https://api.assemblyai.com'; },
      run: function (blob, c) {
        need(c.key, 'Add your AssemblyAI API key in Settings.');
        var H = { authorization: c.key };
        return fetch('https://api.assemblyai.com/v2/upload', { method: 'POST', headers: H, body: blob })
          .then(function (r) { return r.ok ? r.json() : fail(r, 'AssemblyAI'); })
          .then(function (up) {
            var body = { audio_url: up.upload_url, speaker_labels: true };
            if (langOf(c)) body.language_code = langOf(c); else body.language_detection = true;
            return fetch('https://api.assemblyai.com/v2/transcript', { method: 'POST', headers: Object.assign({ 'content-type': 'application/json' }, H), body: JSON.stringify(body) });
          })
          .then(function (r) { return r.ok ? r.json() : fail(r, 'AssemblyAI'); })
          .then(function (job) {
            return new Promise(function (ok, bad) {
              (function poll(n) {
                fetch('https://api.assemblyai.com/v2/transcript/' + job.id, { headers: H }).then(function (r) { return r.json(); }).then(function (t) {
                  if (t.status === 'completed') return ok(t);
                  if (t.status === 'error') return bad(new Error('AssemblyAI: ' + t.error));
                  if (n > 360) return bad(new Error('AssemblyAI took longer than half an hour.'));
                  setTimeout(function () { poll(n + 1); }, 5000);
                }, bad);
              })(0);
            });
          })
          .then(function (t) {
            return { utterances: (t.utterances || []).map(function (u) { return { speaker: u.speaker.charCodeAt(0) - 65, start: u.start / 1000, end: u.end / 1000, text: u.text }; }),
                     text: t.text || '', language: t.language_code || langOf(c) };
          });
      }
    },

    openai: {
      label: 'OpenAI (Whisper)', site: 'https://platform.openai.com/api-keys',
      fields: [{ key: 'key', label: 'API key', type: 'password' },
               { key: 'model', label: 'Model', placeholder: 'whisper-1' },
               { key: 'lang', label: 'Language', placeholder: 'Leave empty to detect it' }],
      note: 'Does not say who spoke. Takes files up to 25 MB (about 70 minutes of a call).',
      origin: function () { return 'https://api.openai.com'; },
      run: function (blob, c) {
        need(c.key, 'Add your OpenAI API key in Settings.');
        need(blob.size <= 25 * 1024 * 1024, 'This recording is over 25 MB, more than OpenAI takes. Choose Deepgram or AssemblyAI for long calls.');
        var f = new FormData();
        f.append('file', blob, 'recording.webm');
        f.append('model', c.model || 'whisper-1');
        f.append('response_format', 'verbose_json');
        if (langOf(c)) f.append('language', langOf(c).slice(0, 2));
        return fetch('https://api.openai.com/v1/audio/transcriptions', { method: 'POST', headers: { Authorization: 'Bearer ' + c.key }, body: f })
          .then(function (r) { return r.ok ? r.json() : fail(r, 'OpenAI'); })
          .then(function (j) {
            return { utterances: (j.segments || []).map(function (s) { return { speaker: '', start: s.start, end: s.end, text: String(s.text || '').trim() }; }),
                     text: j.text || '', language: j.language || langOf(c) };
          });
      }
    },

    custom: {
      label: 'My own service',
      fields: [{ key: 'url', label: 'Address', type: 'url', placeholder: 'https://example.com/transcribe',
                 help: 'Gets the audio as the request body (POST). Answers JSON: {"utterances": [{"speaker", "start", "end", "text"}]} or {"text"}.' },
               { key: 'token', label: 'Secret (optional)', type: 'password', help: 'Sent as "Authorization: Bearer <secret>".' }],
      origin: function (c) { return origin(c.url); },
      run: function (blob, c) {
        need(origin(c.url), 'Add the address of your transcription service in Settings.');
        var h = { 'Content-Type': blob.type || 'audio/webm' };
        if (c.token) h.Authorization = 'Bearer ' + c.token;
        return fetch(c.url, { method: 'POST', headers: h, body: blob })
          .then(function (r) { return r.ok ? r.json() : fail(r, 'Your service'); })
          .then(function (j) { return { utterances: Array.isArray(j.utterances) ? j.utterances : [], text: j.text || '', language: j.language || '' }; });
      }
    }
  };

  function parse(text) {
    var s = String(text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
    try { return JSON.parse(s); } catch (e) {
      var a = s.indexOf('{'), b = s.lastIndexOf('}');
      if (a > -1 && b > a) return JSON.parse(s.slice(a, b + 1));
      throw new Error('The writing service did not answer in the expected shape. Try again.');
    }
  }

  var write = {
    none: { label: 'Off: I write my own notes', fields: [], origin: function () { return null; }, run: null },

    anthropic: {
      label: 'Claude (Anthropic)', site: 'https://console.anthropic.com/settings/keys',
      fields: [{ key: 'key', label: 'API key', type: 'password' },
               { key: 'model', label: 'Model', placeholder: 'claude-opus-5-5', help: 'Any Claude model id. A cheaper one such as claude-haiku-5-5 works for short calls.' }],
      origin: function () { return 'https://api.anthropic.com'; },
      run: function (p, c) {
        need(c.key, 'Add your Anthropic API key in Settings.');
        var body = { model: c.model || 'claude-opus-5-5', max_tokens: 16000, thinking: { type: 'adaptive' },
                     system: p.system, messages: [{ role: 'user', content: p.user }] };
        if (p.schema) body.output_config = { format: { type: 'json_schema', schema: p.schema } };
        return fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          // the key is yours and stays in this browser, so the API is called from it directly
          headers: { 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true', 'content-type': 'application/json' },
          body: JSON.stringify(body)
        }).then(function (r) { return r.ok ? r.json() : fail(r, 'Anthropic'); }).then(function (j) {
          if (j.stop_reason === 'refusal') throw new Error('Claude declined to write this one up.');
          if (j.stop_reason === 'max_tokens') throw new Error('The write-up was cut off before it ended. Try a shorter part, or a model with more room.');
          var text = (j.content || []).filter(function (b) { return b.type === 'text'; }).map(function (b) { return b.text; }).join('');
          return parse(text);
        });
      }
    },

    openai: {
      label: 'OpenAI or compatible (OpenRouter, Ollama, LM Studio...)',
      fields: [{ key: 'base', label: 'Address', type: 'url', placeholder: 'https://api.openai.com/v1', help: 'The service’s base address; /chat/completions is added.' },
               { key: 'key', label: 'API key', type: 'password', help: 'Empty for a local service that needs none.' },
               { key: 'model', label: 'Model', placeholder: 'The model name your service uses' }],
      origin: function (c) { return origin(c.base || 'https://api.openai.com/v1'); },
      run: function (p, c) {
        need(c.model, 'Add the model name in Settings.');
        var h = { 'Content-Type': 'application/json' };
        if (c.key) h.Authorization = 'Bearer ' + c.key;
        return fetch(String(c.base || 'https://api.openai.com/v1').replace(/\/+$/, '') + '/chat/completions', {
          method: 'POST', headers: h,
          body: JSON.stringify({ model: c.model, response_format: { type: 'json_object' },
                                 messages: [{ role: 'system', content: p.system }, { role: 'user', content: p.user }] })
        }).then(function (r) { return r.ok ? r.json() : fail(r, 'The service'); })
          .then(function (j) { return parse((((j.choices || [])[0] || {}).message || {}).content); });
      }
    },

    custom: {
      label: 'My own service',
      fields: [{ key: 'url', label: 'Address', type: 'url', placeholder: 'https://example.com/write',
                 help: 'Gets {"system", "user", "schema"} as JSON (POST) and answers the write-up as JSON in that schema.' },
               { key: 'token', label: 'Secret (optional)', type: 'password' }],
      origin: function (c) { return origin(c.url); },
      run: function (p, c) {
        need(origin(c.url), 'Add the address of your writing service in Settings.');
        var h = { 'Content-Type': 'application/json' };
        if (c.token) h.Authorization = 'Bearer ' + c.token;
        return fetch(c.url, { method: 'POST', headers: h, body: JSON.stringify(p) })
          .then(function (r) { return r.ok ? r.json() : fail(r, 'Your service'); });
      }
    }
  };

  /* Settings: { transcribe: { use, <use>: config }, write: { use, <use>: config } } */
  function read() {
    return chrome.storage.local.get(['transcribe', 'write', 'templates', 'autoWrite', 'template']).then(function (s) {
      var t = s.transcribe || {}, w = s.write || {};
      var tu = transcribe[t.use] ? t.use : 'none', wu = write[w.use] ? w.use : 'none';
      return { transcribe: { use: tu, config: t[tu] || {}, all: t }, write: { use: wu, config: w[wu] || {}, all: w },
               templates: Templates.all(s.templates), custom: s.templates || [], autoWrite: s.autoWrite !== false, template: s.template || '' };
    });
  }
  function doTranscribe(blob) {
    return read().then(function (s) {
      var p = transcribe[s.transcribe.use];
      if (!p.run) throw Object.assign(new Error('Transcripts are off. Turn them on in Settings.'), { off: true });
      return p.run(blob, s.transcribe.config).then(function (out) { out.provider = s.transcribe.use; out.at = Date.now(); return out; });
    });
  }
  function doWrite(prompt) {
    return read().then(function (s) {
      var p = write[s.write.use];
      if (!p.run) throw Object.assign(new Error('Writing is off. Turn it on in Settings.'), { off: true });
      return p.run(prompt, s.write.config);
    });
  }

  /* Ask about this recording: an answer from what was said, with the
     moments it comes from, or a plain "it was not said". */
  var ASK = { type: 'object', additionalProperties: false, required: ['answer', 'moments'],
              properties: { answer: { type: 'string' }, moments: { type: 'array', items: { type: 'string', description: 'mm:ss' } } } };
  function ask(note, question) {
    return doWrite({
      system: 'You answer a question about one recording, using only its transcript. Answer in two to five plain sentences, in the language of the question. ' +
              'If the transcript does not say, answer "That was not said in this recording." and give no moments. ' +
              'Return JSON only: {"answer": string, "moments": ["mm:ss", ...]} with up to 3 moments the answer comes from.',
      user: 'Question: ' + String(question || '').slice(0, 500) + '\n\nTranscript:\n' + Templates.lines(note.transcript, note.speakers, note.trim),
      schema: ASK
    }).then(function (j) {
      return { answer: String(j.answer || '').trim(), moments: (Array.isArray(j.moments) ? j.moments : []).slice(0, 3).map(Templates.secs) };
    });
  }
  /* The transcript in English (or another language), line for line, so the
     times and voices stay where they were. Long transcripts go in parts. */
  var TRANSLATE = { type: 'object', additionalProperties: false, required: ['lines'],
                    properties: { lines: { type: 'array', items: { type: 'string' } } } };
  function translate(utterances, language) {
    var lang = language || 'English', out = [], parts = [];
    for (var i = 0; i < utterances.length; i += 120) parts.push(utterances.slice(i, i + 120));
    return parts.reduce(function (chain, part) {
      return chain.then(function () {
        return doWrite({
          system: 'Translate each line into ' + lang + '. Keep the meaning and tone, plain words, no notes. A line already in ' + lang + ' stays as it is. ' +
                  'Return JSON only: {"lines": [string]} with exactly as many lines as you got, in the same order.',
          user: part.map(function (u, k) { return (k + 1) + '. ' + u.text; }).join('\n'),
          schema: TRANSLATE
        }).then(function (j) {
          var got = Array.isArray(j.lines) ? j.lines : [];
          part.forEach(function (u, k) { out.push(String(got[k] || '').replace(/^\d+\.\s*/, '').trim() || u.text); });
        });
      });
    }, Promise.resolve()).then(function () { return out; });
  }

  return { transcribe: transcribe, write: write, read: read, doTranscribe: doTranscribe, doWrite: doWrite, ask: ask, translate: translate };
})();
