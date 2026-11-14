/* End-to-end check in a real Chromium, with the extension loaded:

   1. a guide made on a local demo site (clicks, a field, a password, a
      dropdown, a menu that moves, a drag), its sentences, what is kept,
      editing (reorder, tip, take out, undo), the downloaded page;
   2. a recording's note page (player, summary, next steps, who talked,
      transcript, notes editor, trim);
   3. sending to a local webhook: JSON, then multipart with the recording,
      the Bearer token, the signature, the retry when it fails;
   4. the library (find, filters, choose many), and the embed showing
      what the webhook received.

   Run: npm test   (needs the "playwright" package and its Chromium)

   Pressing the toolbar icon cannot be scripted, so the test loads a copy of
   the extension that may reach 127.0.0.1 and starts the guide the way the
   menu's tile does. */
const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.env.OUT || path.join(ROOT, 'test', 'out');
const SECRET = 'hunter2-should-never-be-kept';
const TYPED = 'typed-email@example.com';
const SIGN = 'test-signing-secret';

function fail(msg) { console.error('FAIL ' + msg); process.exitCode = 1; }
function ok(msg) { console.log('ok   ' + msg); }
function check(cond, yes, no) { cond ? ok(yes) : fail(no || yes); }

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const received = [];
  let hookAnswer = 200;
  const server = http.createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/hook') {
      const parts = [];
      req.on('data', (c) => parts.push(c));
      req.on('end', () => {
        const raw = Buffer.concat(parts);
        received.push({ headers: req.headers, raw });
        res.writeHead(hookAnswer, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(hookAnswer === 200 ? { url: 'https://example.com/items/1' } : { error: 'nope' }));
      });
      return;
    }
    const name = path.basename(req.url.split('?')[0]) || 'a.html';
    const file = name === 'orbit-embed.js' ? path.join(ROOT, 'embed', name) : path.join(__dirname, 'site', name);
    if (!fs.existsSync(file)) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': name.endsWith('.js') ? 'text/javascript' : name.endsWith('.webm') ? 'video/webm' : name.endsWith('.json') ? 'application/json' : 'text/html' });
    res.end(fs.readFileSync(file));
  }).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;

  // a copy of the extension that may reach the demo site (stands in for the icon press)
  const ext = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-'));
  fs.cpSync(ROOT, ext, { recursive: true, filter: (p) => !/[\\/](\.git|node_modules|test|docs|examples)([\\/]|$)/.test(p.slice(ROOT.length)) });
  const man = JSON.parse(fs.readFileSync(path.join(ext, 'manifest.json')));
  man.host_permissions = ['<all_urls>'];   // captureVisibleTab needs all sites or a real icon press
  fs.writeFileSync(path.join(ext, 'manifest.json'), JSON.stringify(man));

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'orbit-profile-'));
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: 'chromium', headless: true, viewport: { width: 1280, height: 800 },
    args: ['--disable-extensions-except=' + ext, '--load-extension=' + ext, '--autoplay-policy=no-user-gesture-required']
  });
  const errors = [];
  try {
    let [sw] = ctx.serviceWorkers();
    if (!sw) sw = await ctx.waitForEvent('serviceworker');
    const extId = sw.url().split('/')[2];
    const at = (p) => 'chrome-extension://' + extId + '/' + p;
    ctx.on('page', (p) => p.on('pageerror', (e) => errors.push(p.url() + ': ' + e.message)));
    // welcome opens on install: close it
    // welcome opens on install, a moment after the worker starts: wait for it, then close it
    await ctx.waitForEvent('page', { predicate: (p) => p.url().includes('welcome.html'), timeout: 5000 }).catch(() => {});
    for (const p of ctx.pages()) if (p.url().includes('welcome.html')) await p.close();

    /* ---------------- 1. a guide ---------------- */
    const page = await ctx.newPage();
    await page.goto(base + '/a.html'); await page.bringToFront();
    const started = await sw.evaluate(async (url) => {
      const [tab] = await chrome.tabs.query({ url: url });
      return new Promise((r) => start(tab.id, r));
    }, base + '/a.html');
    check(started.ok, 'guide started', 'start: ' + JSON.stringify(started));

    const panel = page.locator('orbit-guide-panel');
    await panel.waitFor({ state: 'attached' });
    ok('panel is on the page');
    const pause = () => page.waitForTimeout(900);
    const count = () => panel.evaluate((h) => (h.shadowRoot.querySelector('.count b') || {}).textContent);
    const press = (re) => panel.evaluate((h, re) => [...h.shadowRoot.querySelectorAll('button')].find((b) => new RegExp(re).test(b.textContent)).click(), re);
    await page.waitForTimeout(1200);       // the first step: where it starts
    await page.click('#save'); await pause();
    await page.click('#email'); await page.keyboard.type(TYPED); await pause();
    await page.click('#pw'); await page.keyboard.type(SECRET); await pause();
    await page.click('#news'); await pause();
    await page.focus('#plan'); await page.keyboard.press('ArrowDown'); await pause();   // a real key: selectOption's change is not trusted
    await page.click('#news'); await pause();          // undone below
    const before = await count();
    await press('Undo'); await page.waitForTimeout(500);
    const after = await count();
    check(+after === +before - 1, 'Undo took one step out (' + before + ' to ' + after + ')', 'undo: ' + before + ' to ' + after);
    await press('^Pause$'); await page.waitForTimeout(300);
    await page.click('#save'); await pause();
    check((await count()) === after, 'a click while paused is not kept', 'count while paused: ' + (await count()));
    await press('^Resume$'); await page.waitForTimeout(300);
    await page.screenshot({ path: path.join(OUT, 'panel-1280.png') });

    await page.click('#next'); await page.waitForLoadState('load');
    await page.locator('orbit-guide-panel').waitFor({ state: 'attached', timeout: 5000 });
    ok('panel came back after moving to another page');
    await page.waitForTimeout(500);
    await page.click('text=Cards'); await pause();
    await page.click('#more'); await page.waitForTimeout(3500);
    const kb = await page.locator('#knob').boundingBox();
    await page.mouse.move(kb.x + 20, kb.y + 20); await page.mouse.down();
    for (let i = 1; i <= 20; i++) { await page.mouse.move(kb.x + 20 + i * 25, kb.y + 20); await page.waitForTimeout(100); }
    await page.mouse.up(); await page.waitForTimeout(2500);
    await page.click('#done'); await pause();

    const opened = ctx.waitForEvent('page');
    await page.locator('orbit-guide-panel').evaluate((h) => [...h.shadowRoot.querySelectorAll('button')].find((b) => /Finish/.test(b.textContent)).click());
    const view = await opened;
    await view.waitForLoadState('load');
    await view.waitForSelector('#steps li.step');
    check(view.url().startsWith(at('guide.html')), 'Finish opened the guide page', 'opened ' + view.url());
    const gid = new URL(view.url()).searchParams.get('id');

    const sentences = await view.$$eval('.say', (els) => els.map((e) => e.value));
    console.log('     sentences: ' + JSON.stringify(sentences));
    const want = ['Go to "127.0.0.1:' + server.address().port + '/a.html".', 'Click "Save changes".', 'Enter your email in the "Email address" field.',
                  'Enter your password in the "Password" field.', 'Tick the "Send me the newsletter" checkbox.', 'Choose "Team" in "Plan".',
                  'Click the "Go to billing" link.', 'On the "Demo shop: billing" page, open the "Cards" tab.'];
    check(want.every((w, i) => sentences[i] === w), 'the first steps say what was done: start, click, fields, checkbox, dropdown', 'sentences differ from ' + JSON.stringify(want));
    check(sentences.some((s) => /^Drag "Invoice card"/.test(s)), 'the drag is one step');
    const title = await view.inputValue('#title');
    check(/^How to: Demo shop/.test(title), 'title: ' + title);

    const kept = await view.evaluate(async (id) => JSON.stringify(Format.portable(await Store.guide(id), await Store.steps(id))), gid);
    check(!kept.includes(SECRET) && !kept.includes(TYPED), 'nothing typed is in the guide', 'typed text was kept');
    const steps = JSON.parse(kept).steps;
    const clipFor = (re) => { const s = steps.find((x) => re.test(x.sentence)); return s && s.clip ? s.clip.frames.length : 0; };
    check(clipFor(/More options/) >= 2, 'the menu that opened got a clip');
    check(clipFor(/Drag/) >= 2, 'the drag got a clip');
    check(clipFor(/Email address/) === 0 && clipFor(/Password/) === 0, 'no clip while a field had the cursor');

    // editing: a tip, move a step, take one out, undo it
    const n0 = steps.length;
    await view.locator('li.step').nth(1).locator('.tool', { hasText: 'Add a tip' }).click();
    await view.locator('li.step').nth(1).locator('.tipbox').fill('Saves without leaving the page.');
    await view.locator('li.step').nth(1).locator('.tipbox').blur();
    await view.waitForTimeout(300);
    await view.locator('li.step').nth(2).locator('.tool[title="Move up"]').click(); await view.waitForTimeout(500);
    const moved = await view.$$eval('.say', (els) => els.map((e) => e.value));
    check(moved[1] === sentences[2] && moved[2] === sentences[1], 'Move up swapped two steps');
    await view.locator('li.step').nth(3).locator('.tool', { hasText: 'Take out' }).click(); await view.waitForTimeout(500);
    check((await view.$$('li.step')).length === n0 - 1, 'Take out removed a step');
    await view.click('#undo'); await view.waitForTimeout(800);
    check((await view.$$('li.step')).length === n0, 'Undo put it back');
    const tip = await view.evaluate(async (id) => (await Store.steps(id)).map((r) => r.note).filter(Boolean), gid);
    check(tip[0] === 'Saves without leaving the page.', 'the tip is kept under its step');
    // the picture editor: cover a part, and it is burnt into the picture
    await view.locator('li.step').nth(1).locator('.tool', { hasText: 'Edit the picture' }).click();
    await view.waitForSelector('#editor[open]');
    const cb = await view.locator('#canvas').boundingBox();
    await view.mouse.move(cb.x + 10, cb.y + 10); await view.mouse.down(); await view.mouse.move(cb.x + 200, cb.y + 80, { steps: 5 }); await view.mouse.up();
    await view.screenshot({ path: path.join(OUT, 'picture-editor-1280.png') });
    await view.click('#picsave'); await view.waitForTimeout(800);
    const dark = await view.evaluate(async (id) => {
      const r = (await Store.steps(id))[1];
      const bmp = await createImageBitmap(new Blob([r.image], { type: 'image/jpeg' }));
      const c = new OffscreenCanvas(bmp.width, bmp.height), x = c.getContext('2d'); x.drawImage(bmp, 0, 0);
      const d = x.getImageData(Math.round(bmp.width * 0.05), Math.round(bmp.height * 0.05), 1, 1).data;
      return d[0] + d[1] + d[2];
    }, gid);
    check(dark < 90, 'Cover painted over that part of the picture', 'cover pixel sum ' + dark);
    await view.screenshot({ path: path.join(OUT, 'guide-1280.png') });
    await view.setViewportSize({ width: 390, height: 844 });
    await view.screenshot({ path: path.join(OUT, 'guide-390.png') });
    await view.setViewportSize({ width: 1280, height: 800 });

    const html = await view.evaluate(async (id) => Export.html(Format.portable(await Store.guide(id), await Store.steps(id))), gid);
    fs.writeFileSync(path.join(OUT, 'export.html'), html);
    const exp = await ctx.newPage();
    await exp.goto('file://' + path.join(OUT, 'export.html'));
    check((await exp.$$('li')).length === n0, 'downloaded web page has every step and opens on its own');
    await exp.close();

    /* ---------------- 2. a recording's note page ---------------- */
    const media = [...fs.readFileSync(path.join(__dirname, 'site', 'demo.webm'))];
    const nid = await view.evaluate(async (bytes) => {
      const id = 'ntest1';
      await Store.putMedia(id + '-main', new Blob([new Uint8Array(bytes)], { type: 'video/webm' }));
      const u = [[0, 0, 2, 'Thanks for joining. How do you sort tickets today?'], [1, 2, 4.5, 'One shared inbox, by hand every morning.'],
                 [0, 4.5, 6, 'I will send a proposal by Friday.'], [1, 6, 8, 'Great, include pricing for twelve people.']]
        .map(([speaker, start, end, text]) => ({ speaker, start, end, text }));
      await Store.putNote({ id, kind: 'call', where: 'Meet', title: 'Support workflow call', began: Date.now(), ended: true, endedAt: Date.now(), seconds: 8,
        mime: 'video/webm', video: true, media: id + '-main', sound: '', html: '<p>Typed during the call.</p>', sent: {}, speakers: { 0: 'Sam' },
        transcript: { provider: 'test', language: 'en', utterances: u, text: u.map((x) => x.text).join(' ') },
        summary: Templates.clean({ title: 'Support workflow', short: 'They sort tickets by hand. A proposal comes Friday.', long: 'One.\n\nTwo.',
          sections: [{ heading: 'What they need', points: ['Routing for urgent tickets'] }], ideas: [{ at: '00:03', text: 'Route urgent tickets' }],
          chapters: [{ at: '00:00', title: 'Today', gist: 'One inbox' }], qa: [{ at: '00:01', by: 'Speaker 1', q: 'How do you sort tickets today?', a: 'By hand.' }],
          topics: ['Routing'], speakers: [{ label: 'Speaker 2', name: 'Jordan' }],
          mood: { overall: 'positive', why: 'Keen on routing.', voices: [], moments: [{ at: '00:06', tone: 'positive', what: 'Asks for pricing' }] },
          actions: [{ text: 'Send a proposal', owner: 'Sam', at: '00:05' }] }, { id: 'meeting' }) });
      return id;
    }, media);
    const note = await ctx.newPage();
    await note.goto(at('note.html?id=' + nid));
    await note.waitForSelector('#page:not([hidden])');
    await note.waitForTimeout(800);
    check(await note.isVisible('#player video'), 'one player, with the video');
    check((await note.textContent('#summary')).includes('by hand'), 'the short summary shows');
    check((await note.$$('#todos li')).length === 1, 'next steps show, with a box to tick');
    check((await note.textContent('#talk')).includes('Sam'), 'who talked, by name');
    check((await note.$$('#transcript .u')).length === 4, 'the transcript shows every line');
    await note.fill('#find', 'pricing'); await note.waitForTimeout(200);
    check((await note.$$('#transcript .u')).length === 1, 'find narrows the transcript');
    await note.fill('#find', '');
    await note.click('#todos input[type=checkbox]'); await note.waitForTimeout(300);
    check(await note.evaluate(async (id) => (await Store.note(id)).summary.actions[0].done, nid), 'ticking a next step is kept');
    await note.click('#seg button[data-v="qa"]');
    check((await note.textContent('#summary')).includes('How do you sort tickets'), 'Q&A shows the questions asked');
    await note.click('#seg button[data-v="short"]');
    // notes editor: type, and it saves by itself
    await note.click('#editor'); await note.keyboard.press('End'); await note.keyboard.type(' And one more line.');
    await note.waitForTimeout(1000);
    check((await note.evaluate(async (id) => (await Store.note(id)).html, nid)).includes('one more line'), 'your notes save as you type');
    await note.screenshot({ path: path.join(OUT, 'note-1280.png'), fullPage: true });
    await note.setViewportSize({ width: 390, height: 844 });
    await note.screenshot({ path: path.join(OUT, 'note-390.png'), fullPage: true });
    await note.setViewportSize({ width: 1280, height: 800 });

    /* ---------------- 3. sending ---------------- */
    await note.evaluate((url) => chrome.storage.local.set({ connections: [
      { id: 'c1', kind: 'webhook', name: 'Test hook', config: { url, token: 's3cret', secret: 'test-signing-secret' }, what: ['call', 'video', 'audio', 'guide'], auto: false, media: false },
      { id: 'c2', kind: 'webhook', name: 'Hook with file', config: { url }, what: ['call'], auto: false, media: true }] }), base + '/hook');
    await note.reload(); await note.waitForSelector('#page:not([hidden])');
    await note.click('#send'); await note.click('#sendmenu .list button >> nth=0');
    await note.waitForSelector('#sentlist .note.good', { timeout: 10000 });
    const r1 = received.shift(), j1 = JSON.parse(r1.raw.toString());
    const sig = 'sha256=' + crypto.createHmac('sha256', SIGN).update(r1.raw).digest('hex');
    check(j1.format === 'orbit-note/1' && j1.summary.short && j1.transcript.utterances.length === 4, 'webhook got the note as orbit-note/1 with summary and transcript');
    check(r1.headers.authorization === 'Bearer s3cret', 'the token came as a Bearer header');
    check(r1.headers['x-orbit-signature'] === sig, 'the signature matches the body (HMAC-SHA256)');
    check((await note.textContent('#sentlist')).includes('Open it there'), 'the page links to the copy on the other system');
    await note.click('#send'); await note.click('#sendmenu .list button >> nth=1');
    await note.waitForFunction(() => document.querySelectorAll('#sentlist .note.good').length === 2, null, { timeout: 15000 });
    const r2 = received.shift();
    check(/multipart\/form-data/.test(r2.headers['content-type']) && r2.raw.includes(Buffer.from('name="media"')) && r2.raw.length > 50000,
      'with "send the recording" on, the file comes too (multipart: item + media)');
    // a failing address: waiting, tried again later; a wrong key: failed at once
    hookAnswer = 503;
    let s = await note.evaluate((id) => Outbox.send('note', id, 'c1'), nid);
    check(s.state === 'waiting' && s.next > Date.now(), 'a 503 is tried again later (waiting)');
    hookAnswer = 401;
    s = await note.evaluate((id) => Outbox.send('note', id, 'c1'), nid);
    check(s.state === 'failed', 'a 401 stops at once and says why');
    hookAnswer = 200;
    received.length = 0;
    // trimmed: only the kept part leaves, words included
    await note.evaluate((id) => Store.changeNote(id, (n) => { n.trim = { a: 4.5, b: 8 }; }), nid);
    s = await note.evaluate((id) => Outbox.send('note', id, 'c1'), nid);
    const j3 = JSON.parse(received.shift().raw.toString());
    check(j3.transcript.utterances.length === 2 && !j3.transcript.text.includes('Thanks for joining'), 'a trimmed note sends only the words in the kept part');
    await note.evaluate((id) => Store.changeNote(id, (n) => { n.trim = null; }), nid);
    // the guide goes the same way
    s = await note.evaluate((id) => Outbox.send('guide', id, 'c1'), gid);
    const j4 = JSON.parse(received.shift().raw.toString());
    check(j4.format === 'step-guide/1' && j4.steps.length === n0 && j4.steps[0].image.data.length > 1000, 'a guide goes as step-guide/1 with its pictures');
    fs.writeFileSync(path.join(__dirname, 'site', 'received-note.json'), JSON.stringify(j1));
    fs.writeFileSync(path.join(__dirname, 'site', 'received-guide.json'), JSON.stringify(j4));

    /* ---------------- 4. library, embed ---------------- */
    const lib = await ctx.newPage();
    await lib.goto(at('library.html'));
    await lib.waitForSelector('#list li');
    check((await lib.$$('#list li')).length === 2, 'the library lists the guide and the recording');
    await lib.fill('#q', 'pricing'); await lib.waitForTimeout(200);
    check((await lib.$$('#list li')).length === 1, 'find looks through what was said');
    await lib.fill('#q', '');
    await lib.screenshot({ path: path.join(OUT, 'library-1280.png') });
    await lib.click('#select'); await lib.click('#pickall'); await lib.click('#parchive'); await lib.waitForTimeout(400);
    check((await lib.$$('#list li')).length === 0, 'choose all, archive: out of the list');
    await lib.click('#filters button:has-text("Archived")'); await lib.waitForTimeout(200);
    check((await lib.$$('#list li')).length === 2, 'both are under Archived');
    await lib.click('#pickall'); await lib.click('#parchive'); await lib.waitForTimeout(400);

    const emb = await ctx.newPage();
    await emb.goto(base + '/a.html');
    await emb.setContent('<script src="' + base + '/orbit-embed.js"></script><orbit-note src="' + base + '/received-note.json" media="' + base + '/demo.webm"></orbit-note><orbit-guide src="' + base + '/received-guide.json"></orbit-guide>');
    await emb.waitForTimeout(800);
    const shown = await emb.evaluate(() => [document.querySelector('orbit-note').shadowRoot.textContent, document.querySelector('orbit-guide').shadowRoot.querySelectorAll('ol.steps li').length]);
    check(shown[0].includes('by hand') && shown[0].includes('Send a proposal'), 'the embed shows the note: summary and next steps');
    check(shown[1] === n0, 'the embed shows the guide with every step');
    await emb.screenshot({ path: path.join(OUT, 'embed-1280.png'), fullPage: true });

    for (const p of ['options.html', 'welcome.html']) {
      const o = await ctx.newPage(); await o.goto(at(p)); await o.waitForTimeout(400);
      await o.screenshot({ path: path.join(OUT, p.replace('.html', '') + '-1280.png'), fullPage: true });
      await o.close();
    }
    const pop = await ctx.newPage();
    await pop.setViewportSize({ width: 320, height: 420 });
    await pop.goto(at('popup.html')); await pop.waitForTimeout(400);
    await pop.screenshot({ path: path.join(OUT, 'popup.png') });

    check(!errors.length, 'no script errors on any page', 'script errors: ' + errors.join(' | '));
  } finally {
    await ctx.close();
    server.close();
    for (const f of ['received-note.json', 'received-guide.json']) { try { fs.unlinkSync(path.join(__dirname, 'site', f)); } catch (e) {} }
  }
  console.log(process.exitCode ? 'SOME CHECKS FAILED' : 'all checks passed');
})().catch((e) => { console.error(e); process.exit(1); });
