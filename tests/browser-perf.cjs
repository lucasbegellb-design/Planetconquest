// Performance : partie Terre avancée (10 min simulées) puis grande planète (≈900 territoires).
const { chromium } = require('playwright');
const URL = process.argv[2] || 'http://localhost:8080/';
const OUT = process.argv[3] || '/tmp/claude-0';

const measure = (page) => page.evaluate(() => new Promise((res) => {
  let n = 0, worst = 0, last = performance.now(); const t0 = last;
  const f = (t) => { n++; worst = Math.max(worst, t - last); last = t; if (t - t0 < 3000) requestAnimationFrame(f); else res({ fps: Math.round(n / 3), worstMs: Math.round(worst) }); };
  requestAnimationFrame(f);
}));

(async () => {
  const browser = await chromium.launch();
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 860 } })).newPage();
  await page.addInitScript(() => { try { localStorage.setItem('terra-conquest-welcome', '1'); } catch (e) {} });
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(URL);
  await page.click('#btn-new');
  await page.waitForSelector('#pick:not([hidden])', { timeout: 30000 });
  await page.evaluate(() => { const a = window.app; const k = a.map.countries0.findIndex((c) => c.name === 'Allemagne'); a.pickTap(a.map.countries0[k].capital); });
  await page.click('#pick-go');
  await page.waitForTimeout(800);
  // avance rapide de 10 minutes de jeu (sans rendu)
  await page.evaluate(() => { const g = window.app.game; for (let i = 0; i < 600; i++) g.advance(1); });
  await page.evaluate(() => window.app.setSpeed(4));
  const info = await page.evaluate(() => { const g = window.app.game; return { offs: g.offensives.length, alive: g.countries.filter((c) => c.alive && !c.neutral).length }; });
  console.log('earth 10min', JSON.stringify(info), JSON.stringify(await measure(page)));
  await page.evaluate(() => { const cam = window.app.renderer.cam; cam.zoom = cam.maxZoom * 0.4; cam.clamp(); });
  console.log('earth zoomed', JSON.stringify(await measure(page)));
  await page.screenshot({ path: `${OUT}/p01-earth-zoom.png` });
  // grande planète
  const t0 = Date.now();
  await page.evaluate(async () => {
    const app = window.app;
    const map = await app.buildMap({ kind: 'proc', seed: 'grande', type: 'terran', nCountries: 60, targetCells: 900, name: 'Géante' });
    app.mode = 'menu';
    app.makeRenderer(map);
    const { Game } = await import('./js/sim/game.js');
    const g = Game.create(map, { difficulty: 'normal', playerIndex: 0, planet: app.homePlanet({ kind: 'proc', type: 'terran', name: 'Géante' }) });
    app.beginPlay(g, false);
    for (let i = 0; i < 300; i++) g.advance(1);
    app.setSpeed(4);
  });
  console.log('big planet gen+5min', Date.now() - t0, 'ms', JSON.stringify(await page.evaluate(() => ({ cells: window.app.game.nCells, W: window.app.map.W, offs: window.app.game.offensives.length }))));
  console.log('big planet', JSON.stringify(await measure(page)));
  await page.screenshot({ path: `${OUT}/p02-big.png` });
  console.log('errors', errors.join('\n'));
  await browser.close();
})();
