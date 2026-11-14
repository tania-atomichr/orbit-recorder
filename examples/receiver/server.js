/* A small backend that receives notes and guides from Orbit Recorder and
   shows them with the embed. No dependencies: Node 18 or newer.

     ORBIT_SECRET=your-signing-secret ORBIT_TOKEN=your-bearer-token node server.js

   In the extension: Settings → Where things go → Webhook or your own backend,
   address http://localhost:8787/hooks/orbit, the same token and secret.
   Open http://localhost:8787 to see what arrived.

   It keeps everything in ./data as files. Use it to learn the format, then
   do the same in your own app. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = +process.env.PORT || 8787;
const SECRET = process.env.ORBIT_SECRET || '';
const TOKEN = process.env.ORBIT_TOKEN || '';
const DATA = path.join(__dirname, 'data');
const EMBED = path.join(__dirname, '..', '..', 'embed', 'orbit-embed.js');
fs.mkdirSync(DATA, { recursive: true });

const safeId = (s) => String(s || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function readBody(req, limit) {
  return new Promise((ok, bad) => {
    const parts = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { bad(new Error('too big')); req.destroy(); } else parts.push(c); });
    req.on('end', () => ok(Buffer.concat(parts)));
    req.on('error', bad);
  });
}
// multipart/form-data with two parts: "item" (the JSON) and "media" (the file)
function multipart(body, type) {
  const m = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(type || '');
  if (!m) return {};
  const sep = Buffer.from('--' + (m[1] || m[2])), out = {};
  let at = body.indexOf(sep);
  while (at > -1) {
    const next = body.indexOf(sep, at + sep.length);
    if (next < 0) break;
    const part = body.slice(at + sep.length + 2, next - 2);
    const split = part.indexOf('\r\n\r\n');
    const head = part.slice(0, split).toString(), data = part.slice(split + 4);
    const name = (/name="([^"]+)"/.exec(head) || [])[1], file = (/filename="([^"]*)"/.exec(head) || [])[1];
    const ctype = (/content-type:\s*([^\r\n]+)/i.exec(head) || [])[1] || '';
    if (name) out[name] = { data, file, type: ctype };
    at = next;
  }
  return out;
}
function signed(raw, header) {
  if (!SECRET) return true;
  const want = 'sha256=' + crypto.createHmac('sha256', SECRET).update(raw).digest('hex');
  return typeof header === 'string' && header.length === want.length && crypto.timingSafeEqual(Buffer.from(header), Buffer.from(want));
}

async function receive(req, res) {
  if (TOKEN && req.headers.authorization !== 'Bearer ' + TOKEN) return send(res, 401, { error: 'wrong token' });
  const body = await readBody(req, 2 * 1024 * 1024 * 1024);
  let json, media = null;
  if (/multipart\/form-data/i.test(req.headers['content-type'])) {
    const parts = multipart(body, req.headers['content-type']);
    if (!parts.item) return send(res, 400, { error: 'no item part' });
    json = parts.item.data; media = parts.media || null;
  } else json = body;
  // the signature covers the JSON itself, in both shapes
  if (!signed(json, req.headers['x-orbit-signature'])) return send(res, 401, { error: 'bad signature' });
  let item;
  try { item = JSON.parse(json.toString('utf8')); } catch (e) { return send(res, 400, { error: 'not JSON' }); }
  const id = safeId(item.id);
  if (!id || !/^(orbit-note|step-guide)\//.test(item.format || '')) return send(res, 400, { error: 'not an Orbit item' });
  fs.writeFileSync(path.join(DATA, id + '.json'), JSON.stringify(item, null, 2));
  if (media) {
    const ext = /video/.test(media.type) ? '.webm' : '.weba';
    fs.writeFileSync(path.join(DATA, id + ext), media.data);
  }
  console.log(new Date().toISOString(), req.headers['x-orbit-event'] || 'item', id, item.title, media ? '(with media)' : '');
  send(res, 200, { ok: true, url: 'http://localhost:' + PORT + '/view/' + id });
}
function send(res, code, obj) { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); }
function page(res, title, inner) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  res.end('<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + esc(title) + '</title>' +
    '<style>body{font:16px/1.5 system-ui,sans-serif;max-width:860px;margin:32px auto;padding:0 16px;color:#111}a{color:#6e2c88}li{margin:6px 0}</style>' +
    '<script src="/orbit-embed.js"></script>' + inner);
}
function list(res) {
  const items = fs.readdirSync(DATA).filter((f) => f.endsWith('.json')).map((f) => {
    const j = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
    return { id: j.id, title: j.title, kind: j.kind || 'guide', at: j.createdAt || '' };
  }).sort((a, b) => (b.at > a.at ? 1 : -1));
  page(res, 'Received', '<h1>Received from Orbit Recorder</h1>' + (items.length ? '<ul>' + items.map((i) =>
    '<li><a href="/view/' + esc(i.id) + '">' + esc(i.title) + '</a> <small>' + esc(i.kind) + ' · ' + esc(i.at) + '</small></li>').join('') + '</ul>' : '<p>Nothing yet. Send something from the extension.</p>'));
}
function view(res, id) {
  const file = path.join(DATA, id + '.json');
  if (!fs.existsSync(file)) { res.writeHead(404); return res.end('Not found'); }
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const media = ['.webm', '.weba'].map((e) => id + e).find((f) => fs.existsSync(path.join(DATA, f)));
  const tag = j.format.startsWith('step-guide') ? '<orbit-guide src="/data/' + id + '.json"></orbit-guide>'
    : '<orbit-note src="/data/' + id + '.json"' + (media ? ' media="/data/' + media + '"' : '') + '></orbit-note>';
  page(res, j.title, '<p><a href="/">All items</a></p>' + tag);
}
function file(res, name) {
  const f = path.join(DATA, path.basename(name));
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const type = f.endsWith('.json') ? 'application/json' : f.endsWith('.webm') ? 'video/webm' : 'audio/webm';
  res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'none' });
  fs.createReadStream(f).pipe(res);
}

http.createServer((req, res) => {
  // the extension calls from its own origin: say yes to it
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, x-orbit-signature, x-orbit-event');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }
  const url = new URL(req.url, 'http://x');
  if (req.method === 'POST' && url.pathname === '/hooks/orbit') return receive(req, res).catch((e) => send(res, 500, { error: e.message }));
  if (url.pathname === '/') return list(res);
  if (url.pathname === '/orbit-embed.js') { res.writeHead(200, { 'Content-Type': 'text/javascript' }); return fs.createReadStream(EMBED).pipe(res); }
  if (url.pathname.startsWith('/view/')) return view(res, safeId(url.pathname.slice(6)));
  if (url.pathname.startsWith('/data/')) return file(res, url.pathname.slice(6));
  res.writeHead(404); res.end();
}).listen(PORT, () => console.log('Listening on http://localhost:' + PORT));
