/* Frames for the README's demo.gif: a guide made on the test site, the finished guide,
   a call's note and the library. node scripts/demo-frames.js -> scripts/out/frames */
const { chromium } = require('playwright');
const fs = require('fs'), os = require('os'), path = require('path'), http = require('http');
const REPO = path.join(__dirname, '..'), ROOT = path.join(REPO, 'extension'), DATA = path.join(__dirname, 'demo-data'), OUT = path.join(__dirname, 'out', 'frames');
fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true });
let n = 0; const snap = async (p, hold = 1) => { for (let i = 0; i < hold; i++) await p.screenshot({ path: path.join(OUT, String(n++).padStart(3, '0') + '.png') }); };
(async () => {
  const server = http.createServer((req, res) => {
    const f = path.join(REPO, 'test/site', path.basename(req.url.split('?')[0]) || 'a.html');
    if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': 'text/html' }); res.end(fs.readFileSync(f));
  }).listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-'));
  fs.cpSync(ROOT, ext, { recursive: true });
  const man = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json'))); man.host_permissions = ['<all_urls>'];
  fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(man));
  const ctx = await chromium.launchPersistentContext(fs.mkdtempSync(path.join(os.tmpdir(), 'op-')), { channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 },
    args: ['--disable-extensions-except=' + ext, '--load-extension=' + ext, '--autoplay-policy=no-user-gesture-required'] });
  let [sw] = ctx.serviceWorkers(); if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = sw.url().split('/')[2];
  await ctx.waitForEvent('page', { predicate: p => p.url().includes('welcome'), timeout: 5000 }).catch(() => {});
  for (const p of ctx.pages()) if (p.url().includes('welcome')) await p.close();
  const page = await ctx.newPage();
  await page.goto(base + '/a.html'); await page.bringToFront();
  await sw.evaluate(async url => { const [t] = await chrome.tabs.query({ url }); return new Promise(r => start(t.id, r)); }, base + '/a.html');
  await page.locator('orbit-guide-panel').waitFor({ state: 'attached' }); await page.waitForTimeout(1300);
  await snap(page, 2);
  const step = async (fn) => { await fn(); await page.waitForTimeout(1000); await snap(page, 2); };
  await step(() => page.click('#save'));
  await step(async () => { await page.click('#email'); await page.keyboard.type('sam@example.com'); });
  await step(async () => { await page.click('#pw'); await page.keyboard.type('hunter22'); });
  await step(() => page.click('#news'));
  await step(async () => { await page.focus('#plan'); await page.keyboard.press('ArrowDown'); });
  const opened = ctx.waitForEvent('page');
  await page.locator('orbit-guide-panel').evaluate(h => [...h.shadowRoot.querySelectorAll('button')].find(b => /Finish/.test(b.textContent)).click());
  const view = await opened; await view.setViewportSize({ width: 1280, height: 800 });
  await view.waitForSelector('#steps li.step'); await view.waitForTimeout(1200);
  await snap(view, 3);
  for (const y of [500, 1000, 1500]) { await view.mouse.wheel(0, 500); await view.waitForTimeout(400); await snap(view, 2); }
  // a call's note (seeded, as look.js does)
  const seed = JSON.parse(fs.readFileSync(path.join(DATA, 'seed.json'), 'utf8'));
  await view.goto(`chrome-extension://${extId}/library.html`);
  await view.evaluate(async (s) => {
    await Store.putMedia('ndemo1-main', new Blob([new Uint8Array(s.bytes)], { type: 'video/webm' }));
    await Store.putNote(Object.assign({ id: 'ndemo1', media: 'ndemo1-main', sound: '', mime: 'video/webm', video: true, began: Date.now() - 3600e3, endedAt: Date.now() - 3500e3, ended: true, sent: { c1: { state: 'sent', at: Date.now() - 3400e3, url: 'https://crm.example.com/notes/42' } } }, s.note));
    await chrome.storage.local.set({ connections: [{ id: 'c1', kind: 'webhook', name: 'Our CRM', config: { url: 'https://crm.example.com/hooks/orbit' }, what: ['call', 'video', 'audio', 'guide'], auto: false, media: false }] });
  }, Object.assign(seed, { bytes: [...fs.readFileSync(path.join(DATA, 'demo.webm'))] }));
  await view.goto(`chrome-extension://${extId}/note.html?id=ndemo1`); await view.waitForTimeout(1500);
  await snap(view, 4);
  for (let i = 0; i < 3; i++) { await view.mouse.wheel(0, 550); await view.waitForTimeout(400); await snap(view, 3); }
  await view.goto(`chrome-extension://${extId}/library.html`); await view.waitForTimeout(1200);
  await snap(view, 4);
  await ctx.close(); server.close();
  console.log('frames', n);
})();
