/* End-to-end test of the live scoreboard with local MQTT brokers.
   Run: npm install && CHROMIUM_PATH=/path/to/chrome npm run test:e2e
   (or `npx playwright install chromium` and leave CHROMIUM_PATH unset)
   - static server on :8000 (root = this repository)
   - two aedes brokers over WebSocket on :8888 and :8889 (stand-ins for the public ones)
   - control.html on a phone-sized page, marcador.html on a 1280x720 page
   Screenshots go to ./shots */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, createWebSocketStream } = require('ws');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '..');
const SHOTS = path.join(__dirname, 'shots');
fs.mkdirSync(SHOTS, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.json': 'application/json', '.css': 'text/css', '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json' };

function staticServer(port) {
  const srv = http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x');
    let p = path.join(ROOT, decodeURIComponent(u.pathname));
    if (!p.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
    if (fs.existsSync(p) && fs.statSync(p).isDirectory()) p = path.join(p, 'index.html');
    fs.readFile(p, (err, data) => {
      if (err) { res.writeHead(404); return res.end('not found'); }
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(data);
    });
  });
  return new Promise((r) => srv.listen(port, () => r(srv)));
}

function broker(port) {
  const aedes = require('aedes')();
  const srv = http.createServer();
  const wss = new WebSocketServer({ server: srv });
  const sockets = new Set();
  wss.on('connection', (conn, req) => { sockets.add(conn); conn.on('close', () => sockets.delete(conn)); aedes.handle(createWebSocketStream(conn), req); });
  return new Promise((r) => srv.listen(port, () => r({
    stop: () => new Promise((done) => { sockets.forEach((s) => s.terminate()); wss.close(); srv.close(() => aedes.close(done)); }),
  })));
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(cond, msg) { console.log((cond ? '  ok   ' : '  FAIL ') + msg); if (!cond) failures++; }

(async () => {
  const web = await staticServer(8000);
  let b1 = await broker(8888);
  const b2 = await broker(8889);
  const CH = 'e2e' + Date.now().toString(36);
  const BQ = `broker=ws://localhost:8888&broker=ws://localhost:8889&canal=${CH}`;

  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  const ctlCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'es-ES' });
  const ovlCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const ctl = await ctlCtx.newPage();
  const ovl = await ovlCtx.newPage();
  const errors = [];
  const watch = (n, p) => {
    p.on('pageerror', (e) => errors.push(n + ': ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('Failed to load resource')) errors.push(n + ' console: ' + m.text()); });
    p.on('response', (r) => { if (r.status() >= 400) errors.push(n + ' HTTP ' + r.status() + ' ' + r.url()); });
  };
  watch('control', ctl); watch('marcador', ovl);
  ctl.on('dialog', (d) => d.accept());

  const read = (page) => page.evaluate(() => {
    const t = (s) => document.querySelector(s).textContent;
    const tag = document.querySelector('#tag');
    return {
      set: t('#setlabel'), label: t('#label'),
      n0: t('#row0 .name span'), n1: t('#row1 .name span'),
      p: [t('#row0 .pts span'), t('#row1 .pts span')].join('-'),
      s: [t('#row0 .sets span'), t('#row1 .sets span')].join('-'),
      serve: document.querySelector('#row0').classList.contains('serving') ? 0 : document.querySelector('#row1').classList.contains('serving') ? 1 : -1,
      tag: tag.classList.contains('on') ? tag.querySelector('.txt').textContent : '',
      hidden: document.querySelector('#board').classList.contains('hidden'),
      partials: document.querySelector('#partials').classList.contains('on') ? document.querySelector('#partials').textContent : '',
    };
  });
  async function expect(page, want, msg, timeout = 4000) {
    const t0 = Date.now();
    let got;
    while (Date.now() - t0 < timeout) {
      got = await read(page);
      if (Object.keys(want).every((k) => got[k] === want[k])) { check(true, `${msg} (${Date.now() - t0} ms)`); return got; }
      await sleep(40);
    }
    check(false, `${msg}: wanted ${JSON.stringify(want)} got ${JSON.stringify(got)}`);
    return got;
  }
  const tap = async (sel, n = 1) => { for (let i = 0; i < n; i++) await ctl.click(sel); };
  const bg = async (page) => page.addStyleTag({ content: 'body{background:url(/assets/pabellon.jpg) center/cover no-repeat !important}' });

  console.log('1. load both pages');
  await ctl.goto(`http://localhost:8000/control.html?${BQ}`);
  await ovl.goto(`http://localhost:8000/marcador.html?pantalla=1&${BQ}`);
  await ctl.waitForFunction(() => document.querySelector('#conntext').textContent === 'Conectado');
  await sleep(300);
  check((await ctl.textContent('#servers')).split('✓').length - 1 === 2, 'control connected to both brokers: ' + (await ctl.textContent('#servers')));
  await expect(ovl, { p: '0-0', s: '0-0', set: 'SET 1', hidden: false, n0: 'RIBERA', n1: 'A7' }, 'overlay shows 0-0 on load');
  await ctl.screenshot({ path: path.join(SHOTS, 'control_inicio.png') });

  console.log('2. scoring, serve and undo');
  let t0 = Date.now();
  await tap('#t0 .plus');
  await expect(ovl, { p: '1-0', serve: 0 }, 'home +1 reaches the overlay');
  console.log('     latency ~', Date.now() - t0, 'ms');
  await tap('#t0 .plus', 2); await tap('#t1 .plus');
  await expect(ovl, { p: '3-1', serve: 1 }, '3-1, visitors serving');
  await tap('#undo');
  await expect(ovl, { p: '3-0', serve: 0 }, 'undo brings back 3-0 and the serve');
  await tap('#t1 .minus');
  await expect(ovl, { p: '3-0' }, '-1 at zero stays at zero');

  console.log('3. one broker goes down mid-match');
  await b1.stop();
  await sleep(400);
  check(await ctl.textContent('#conntext') === 'Conectado', 'control still says Conectado with one broker: ' + (await ctl.textContent('#servers')));
  await tap('#t0 .plus');
  await expect(ovl, { p: '4-0' }, 'score still flows through the second broker');

  console.log('4. broker comes back empty, control re-sends the score');
  b1 = await broker(8888);
  await ctl.waitForFunction(() => document.querySelector('#servers').textContent.split('✓').length - 1 === 2, null, { timeout: 8000 });
  await sleep(2000); // control re-publishes 1.5 s after reconnecting
  const fresh = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const ovl2 = await fresh.newPage();
  await ovl2.goto(`http://localhost:8000/marcador.html?broker=ws://localhost:8888&canal=${CH}`);
  await expect(ovl2, { p: '4-0' }, 'a brand-new overlay on the restarted broker gets 4-0 straight away');
  await fresh.close();

  console.log('5. overlay reload keeps the score (PRISM may reload the widget)');
  await ovl.reload();
  await expect(ovl, { p: '4-0', hidden: false }, 'after reload: 4-0');

  console.log('6. set point, timeout, set won, close set');
  await tap('#t0 .plus', 20); await tap('#t1 .plus', 20);
  await expect(ovl, { p: '24-20', tag: 'PUNTO DE SET · RIBERA' }, 'set point tag at 24-20');
  await bg(ovl); await sleep(700);
  await ovl.screenshot({ path: path.join(SHOTS, 'marcador_punto_de_set.png') });
  await tap('#to1');
  await expect(ovl, { tag: 'TIEMPO MUERTO · A7' }, 'timeout tag');
  await sleep(1200);
  await ovl.screenshot({ path: path.join(SHOTS, 'marcador_tiempo_muerto.png') });
  await ctl.screenshot({ path: path.join(SHOTS, 'control_tiempo_muerto.png') });
  await tap('#to1');
  await expect(ovl, { tag: 'PUNTO DE SET · RIBERA' }, 'timeout cancelled, back to set point');
  await tap('#t0 .plus');
  await expect(ovl, { p: '25-20', tag: 'SET PARA RIBERA' }, 'set won');
  check(await ctl.isDisabled('#t0 .plus') && await ctl.isDisabled('#t1 .plus'), '+1 locked until the set is closed');
  await ctl.screenshot({ path: path.join(SHOTS, 'control_set_ganado.png') });
  await sleep(600);
  await ovl.screenshot({ path: path.join(SHOTS, 'marcador_set_ganado.png') });
  await tap('#close');
  await expect(ovl, { p: '0-0', s: '1-0', set: 'SET 2', serve: 1, tag: '' }, 'set 2 at 0-0, visitors start serving');

  console.log('7. results of each set, deuce, tie-break and final');
  await tap('#parts');
  await expect(ovl, { partials: 'SET 125-20' }, 'set results strip');
  await tap('#t1 .plus', 24); await tap('#t0 .plus', 24);
  await expect(ovl, { p: '24-24', tag: '' }, '24-24 no tag');
  await tap('#t1 .plus');
  await expect(ovl, { tag: 'PUNTO DE SET · A7' }, 'set point A7 at 24-25');
  await tap('#t1 .plus'); await tap('#close');
  await expect(ovl, { s: '1-1', set: 'SET 3' }, '1-1 after deuce');
  await tap('#t0 .plus', 25); await tap('#close');
  await tap('#t1 .plus', 25); await tap('#close');
  await expect(ovl, { s: '2-2', set: 'TIE-BREAK' }, 'tie-break label in set 5');
  await tap('#t0 .plus', 12); await tap('#t1 .plus', 9);
  await expect(ovl, { p: '12-9' }, 'tie-break 12-9');
  await sleep(600);
  await ovl.screenshot({ path: path.join(SHOTS, 'marcador_tiebreak.png') });
  await tap('#t0 .plus', 2);
  await expect(ovl, { p: '14-9', tag: 'PUNTO DE PARTIDO · RIBERA' }, 'match point at 14-9 in the tie-break');
  await sleep(700);
  await ovl.screenshot({ path: path.join(SHOTS, 'marcador_punto_de_partido.png') });
  await tap('#t0 .plus'); await tap('#close');
  await expect(ovl, { set: 'FINAL', s: '3-2', tag: 'GANA RIBERA 3-2' }, 'final 3-2');
  await sleep(700);
  await ovl.screenshot({ path: path.join(SHOTS, 'marcador_final.png') });
  await ctl.screenshot({ path: path.join(SHOTS, 'control_final.png') });

  console.log('8. hide / show, settings, new match');
  await tap('#show');
  await expect(ovl, { hidden: true }, 'board hidden');
  await tap('#show');
  await expect(ovl, { hidden: false }, 'board back');
  await ctl.click('#setup summary');
  await ctl.fill('#lbl', 'Senior Femenino · Jornada 1');
  await ctl.fill('#n1', 'Voleibol A7');
  await tap('#apply');
  await expect(ovl, { label: 'SENIOR FEMENINO · JORNADA 1', n1: 'VOLEIBOL A7' }, 'settings reach the overlay');
  check(await ctl.isDisabled('#t0 .plus'), 'no scoring after the final whistle');
  await ctl.fill('#lbl', 'senior femenino · jornada 2');
  await tap('#reset');
  await expect(ovl, { p: '0-0', s: '0-0', set: 'SET 1', tag: '', label: 'SENIOR FEMENINO · JORNADA 2' }, 'new match 0-0 also saves the edited text');
  await ctl.evaluate(() => document.querySelector('#setup').scrollIntoView());
  await ctl.screenshot({ path: path.join(SHOTS, 'control_ajustes.png'), fullPage: true });

  console.log('9. second control phone follows along');
  const ctl2Ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const ctl2 = await ctl2Ctx.newPage();
  await ctl2.goto(`http://localhost:8000/control.html?${BQ}`);
  await ctl2.waitForFunction(() => document.querySelector('#t0 .nm').textContent === 'RIBERA' && document.querySelector('#hdlabel').textContent.includes('FEMENINO'), null, { timeout: 5000 })
    .then(() => check(true, 'second control picks up the current match'), () => check(false, 'second control picks up the current match'));
  await ctl2.click('#t1 .plus');
  await expect(ovl, { p: '0-1' }, 'point from the second phone');
  await ctl.waitForFunction(() => document.querySelector('#t1 .pts').textContent === '1', null, { timeout: 4000 })
    .then(() => check(true, 'first phone sees it too'), () => check(false, 'first phone sees it too'));
  await ctl2Ctx.close();

  console.log('10. junk on the channel is ignored');
  const mqtt = require('mqtt');
  const evil = mqtt.connect('ws://localhost:8889');
  await new Promise((r) => evil.on('connect', r));
  evil.publish('adribera/marcador/v1/' + CH, JSON.stringify({ v: 1, ts: Date.now() + 99 * 3600e3, seq: 9, points: [99, 0] }), { retain: true });
  evil.publish('adribera/marcador/v1/' + CH, '<script>alert(1)</script>');
  evil.publish('adribera/marcador/v1/' + CH, JSON.stringify({ v: 1, ts: Date.now() + 1000, seq: 9, partials: [['<img src=x onerror=alert(1)>', 1]], home: { name: 'HACK' } }), { retain: true });
  await sleep(800);
  const after = await read(ovl);
  check(after.p !== '99-0', 'far-future message ignored (score ' + after.p + ')');
  check(!(await ovl.evaluate(() => !!document.querySelector('#partials img'))), 'no HTML injected into the overlay');
  evil.end();
  await tap('#t0 .plus');
  const ctlScore = await ctl.evaluate(() => document.querySelector('#t0 .pts').textContent + '-' + document.querySelector('#t1 .pts').textContent);
  await expect(ovl, { p: ctlScore }, `the scorer's next tap is what the overlay shows (${ctlScore})`, 5000);
  await tap('#undo');
  const ctlScore2 = await ctl.evaluate(() => document.querySelector('#t0 .pts').textContent + '-' + document.querySelector('#t1 .pts').textContent);
  await expect(ovl, { p: ctlScore2 }, `undo after junk also flows (${ctlScore2})`, 5000);

  console.log('11. transparency and layouts');
  const clean = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const tp = await clean.newPage();
  await tp.goto(`http://localhost:8000/marcador.html?broker=ws://localhost:8889&canal=${CH}`);
  await sleep(1200);
  const buf = await tp.screenshot({ omitBackground: true, path: path.join(SHOTS, 'marcador_transparente.png') });
  check(buf.length > 0, 'transparent screenshot taken');
  await tp.setViewportSize({ width: 600, height: 400 });
  await sleep(400);
  await tp.screenshot({ omitBackground: true, path: path.join(SHOTS, 'marcador_widget_600x400.png') });
  await clean.close();

  console.log('12. home page');
  const home = await (await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
  watch('index', home);
  await home.goto('http://localhost:8000/');
  await sleep(3500);
  check((await home.textContent('#ovl')) === 'http://localhost:8000/marcador.html', 'PRISM link: ' + (await home.textContent('#ovl')));
  check((await home.textContent('#ctl')) === 'http://localhost:8000/control.html', 'control link: ' + (await home.textContent('#ctl')));
  const frame = home.frames().find((f) => f.url().includes('demo=1'));
  const demoState = frame && await frame.evaluate(() => ({ hidden: document.querySelector('#board').classList.contains('hidden'), p: document.querySelector('#row0 .pts span').textContent }));
  check(demoState && !demoState.hidden, 'preview board visible in the home page: ' + JSON.stringify(demoState));
  await home.screenshot({ path: path.join(SHOTS, 'inicio_movil.png'), fullPage: true });
  await home.setViewportSize({ width: 1100, height: 800 });
  await sleep(500);
  await home.screenshot({ path: path.join(SHOTS, 'inicio_escritorio.png') });

  console.log(errors.length ? 'page errors:\n  ' + errors.join('\n  ') : 'no page errors');
  failures += errors.filter((e) => !e.includes('ERR_CONNECTION_REFUSED') && !e.includes('WebSocket')).length;
  await browser.close();
  await b1.stop(); await b2.stop(); web.close();
  console.log(failures ? `\n${failures} FAILED` : '\nALL GOOD');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
