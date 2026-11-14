/* The README's screenshots: loads the extension with made-up data (scripts/demo-data),
   then pictures every page at 1280 and 390, a stand-in call, and the note's menus.
   node scripts/screenshots.js  ->  scripts/out/shots, then python3 scripts/make_pictures.py */
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path');
const ROOT = path.join(__dirname, '..', 'extension'), DATA = path.join(__dirname, 'demo-data'), OUT = path.join(__dirname, 'out', 'shots');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'orb-'));
  const ctx = await chromium.launchPersistentContext(profile, { channel: 'chromium', headless: true, viewport: { width: 1280, height: 900 },
    args: ['--disable-extensions-except=' + ROOT, '--load-extension=' + ROOT, '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  const errs = [];
  sw.on('console', m => { if (m.type() === 'error') errs.push('SW ' + m.text()); });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push('PAGE ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('CON ' + m.text()); });
  await page.goto(`chrome-extension://${extId}/library.html`);
  const nid = await page.evaluate(async (seed) => {
    const blob = new Blob([new Uint8Array(seed.bytes)], { type: 'video/webm' });
    const id = 'ndemo1';
    await Store.putMedia(id + '-main', blob);
    await Store.putNote(Object.assign({ id, media: id + '-main', sound: '', mime: 'video/webm', video: true, began: Date.now() - 3600e3, endedAt: Date.now() - 3500e3, ended: true, sent: { c1: { state: 'sent', at: Date.now() - 3400e3, url: 'https://crm.example.com/notes/42' } } }, seed.note));
    return id;
  }, Object.assign(JSON.parse(fs.readFileSync(path.join(DATA, 'seed.json'), 'utf8')), { bytes: [...fs.readFileSync(path.join(DATA, 'demo.webm'))] }));
  const pics = ['inbox', 'rules', 'new-rule'].map(n => [...fs.readFileSync(path.join(DATA, 'helpdesk-' + n + '.jpg'))]);
  await page.evaluate(async (pics) => {
    const id = 'gdemo1';
    await Store.putGuide({ id, title: 'How to: route urgent tickets', intro: 'Send urgent tickets straight to the on-call lead.', began: Date.now() - 7200e3, finishedAt: Date.now() - 7100e3, ended: true, sent: {} });
    const metas = [
      { key: 'a', kind: 'start', url: 'https://helpdesk.example.com/inbox', title: 'Inbox', rect: { x: 0, y: 0, w: 0, h: 0 }, viewport: { w: 1280, h: 720 } },
      { key: 'b', label: 'Rules', role: 'link', url: 'https://helpdesk.example.com/inbox', title: 'Inbox', rect: { x: 20, y: 140, w: 120, h: 40 }, viewport: { w: 1280, h: 720 } },
      { key: 'c', label: 'New rule', role: 'button', url: 'https://helpdesk.example.com/rules', title: 'Routing rules', rect: { x: 1036, y: 114, w: 180, h: 52 }, viewport: { w: 1280, h: 720 } }];
    for (let i = 0; i < 3; i++) await Store.addStep({ guide: id, key: metas[i].key, meta: metas[i], image: new Uint8Array(pics[i]).buffer, clip: null, sentence: Format.sentence(metas[i], i ? metas[i - 1] : null), note: i === 2 ? 'Only admins see this button.' : '' });
  }, pics);
  await page.evaluate(() => chrome.storage.local.set({ connections: [{ id: 'c1', kind: 'webhook', name: 'Our CRM', config: { url: 'https://crm.example.com/hooks/orbit' }, what: ['call', 'video', 'audio', 'guide'], auto: false, media: false },
                                                                  { id: 'c2', kind: 'notion', name: 'Team wiki', config: {}, what: ['call', 'guide'], auto: false }],
                                                   transcribe: { use: 'deepgram', deepgram: { key: 'x' } }, write: { use: 'anthropic', anthropic: { key: 'x' } } }));

  for (const p of ['note.html?id=' + nid, 'guide.html?id=gdemo1', 'library.html', 'options.html', 'popup.html']) {
    await page.setViewportSize({ width: p.startsWith('popup') ? 320 : 1280, height: 900 });
    await page.goto(`chrome-extension://${extId}/${p}`); await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, p.split(/[.?]/)[0] + '-1280.png'), fullPage: true });
  }
  const S2 = OUT;
  const shot = (p, n, opt) => p.screenshot(Object.assign({ path: path.join(S2, n + '.png') }, opt || {}));
  // 1. a call: a stand-in Meet page, the offer card, then the bar while recording
  const bg = (n) => 'background-image:url(data:image/jpeg;base64,' + fs.readFileSync(path.join(DATA, 'callers', n + '.jpg')).toString('base64') + ')';
  const MEET = `<!doctype html><html><head><title>Weekly sync</title><style>
   body{margin:0;background:#202124;font:14px system-ui;color:#fff;height:100vh;display:grid;grid-template-rows:1fr 72px;overflow:hidden}
   .g{display:grid;grid-template-columns:repeat(2,minmax(0,520px));gap:10px;padding:16px;align-content:center;justify-content:center}
   .t{position:relative;aspect-ratio:16/9;border-radius:10px;overflow:hidden;background-size:cover;background-position:center}
   .t.talk{box-shadow:0 0 0 3px #8ab4f8}
   .nm{position:absolute;left:12px;bottom:10px;text-shadow:0 1px 3px rgba(0,0,0,.8);font-weight:500}
   .me{position:absolute;right:20px;bottom:12px;width:200px;aspect-ratio:16/9;border-radius:8px;background:#3c4043;display:grid;place-items:center}
   .av{width:56px;height:56px;border-radius:50%;background:#9140B0;display:grid;place-items:center;font-size:15px;font-weight:600}
   .bar{display:flex;justify-content:center;gap:12px;align-items:center}.bar button{border:0;border-radius:24px;padding:12px 18px;background:#3c4043;color:#fff}.bar .end{background:#ea4335}</style></head>
   <body><div class="g"><div class="t talk" style="${bg('sam-rivera')}"><span class="nm">Sam Rivera</span></div><div class="t" style="${bg('jordan-lee')}"><span class="nm">Jordan Lee</span></div>
   <div class="t" style="${bg('maya-chen')}"><span class="nm">Maya Chen</span></div><div class="t" style="${bg('you')}"><span class="nm">You</span></div></div>
   <div class="bar"><button>Mic</button><button>Camera</button><button>Share</button><button class="end" aria-label="Leave call">Leave</button></div></body></html>`;
  await ctx.route('https://meet.google.com/**', r => r.fulfill({ status: 200, contentType: 'text/html', body: MEET }));
  const meet = await ctx.newPage(); await meet.setViewportSize({ width: 1280, height: 720 });
  await meet.goto('https://meet.google.com/abc-defg-hij'); await meet.bringToFront(); await meet.waitForTimeout(3500);
  await shot(meet, 'call-offer');
  const tell = (m) => sw.evaluate(async (m) => { const [t] = await chrome.tabs.query({ url: 'https://meet.google.com/*' }); await chrome.tabs.sendMessage(t.id, m).catch(() => {}); }, m);
  await tell({ type: 'rec-live', video: false, how: 'direct', mic: true });
  await meet.waitForTimeout(16000);   // the consent line goes after 15 s
  for (let i = 0; i < 6; i++) { await tell({ type: 'rec-level', you: 28 + Math.random() * 20, them: 18 + Math.random() * 30, t: (754 + i) * 1000 }); await meet.waitForTimeout(150); }
  await tell({ type: 'rec-words', text: 'Routing would be better. Maya leads the on-call rota.', final: true }); await meet.waitForTimeout(500);
  await shot(meet, 'call-bar');
  // 2. note page details: trim, send menu, embed, ask
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`chrome-extension://${extId}/note.html?id=${nid}`); await page.waitForTimeout(1500);
  await page.click('#trimbtn'); await page.waitForTimeout(500);
  const side = await page.$('.side') || await page.$('aside');
  await shot(page, 'note-trim', { clip: { x: 0, y: 60, width: 470, height: 760 } });
  await page.reload(); await page.waitForTimeout(1500);
  await page.click('#send'); await page.waitForTimeout(400);
  await shot(page, 'note-send', { clip: { x: 0, y: 60, width: 470, height: 760 } });
  await page.keyboard.press('Escape'); await page.click('h1, body', { position: { x: 5, y: 5 } }).catch(() => {});
  await page.click('#embed'); await page.waitForTimeout(400);
  await shot(page, 'note-embed');
  // 3. settings: where things go
  await page.setViewportSize({ width: 1280, height: 900 }); await page.goto(`chrome-extension://${extId}/options.html#connections`); await page.waitForTimeout(1200);
  const c = await page.$('#connections'); await c.scrollIntoViewIfNeeded(); await c.screenshot({ path: path.join(S2, 'settings-places.png') });
  // 4. phones
  for (const p of ['note.html?id=' + nid, 'guide.html?id=gdemo1', 'library.html']) {
    await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`chrome-extension://${extId}/${p}`); await page.waitForTimeout(1200);
    await shot(page, 'phone-' + p.split(/[.?]/)[0]);
  }
  console.log(errs.join('\n') || 'no errors');
  await ctx.close();
})();
