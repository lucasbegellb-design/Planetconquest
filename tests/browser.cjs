// Test de bout en bout dans Chromium : node tests/browser.cjs [url] [dossier captures]
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8080/';
const OUT = process.argv[3] || '/tmp/claude-0';
const mobile = process.argv.includes('mobile');

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext(mobile
    ? { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
    : { viewport: { width: 1440, height: 860 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('terra-conquest-welcome', '1'); } catch (e) {} });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
  const tag = mobile ? 'm-' : '';
  await page.goto(URL);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${tag}01-menu.png` });
  await page.click('#btn-new');
  await page.waitForSelector('#pick:not([hidden])', { timeout: 30000 });
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/${tag}02-pick.png` });
  // choisir la France via l'application
  await page.evaluate(() => {
    const app = window.app;
    const k = app.map.countries0.findIndex((c) => c.name === 'France');
    app.pickTap(app.map.countries0[k].capital);
  });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${tag}03-card.png` });
  await page.click('#pick-go');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${tag}04-play.png` });
  // --- interactions réelles : clic sur un territoire espagnol, puis bouton Attaquer
  const pt = await page.evaluate(() => {
    const app = window.app, g = app.game;
    const es = g.countries.find((c) => c.name === 'Espagne');
    const cell = [...g.cellsOf[es.id]][0];
    const c = app.map.cells[cell];
    app.renderer.cam.x = c.ax; app.renderer.cam.y = c.ay; app.renderer.cam.fly = null; app.renderer.cam.clamp();
    return app.renderer.cam.toScreen(c.ax + 0.5, c.ay + 0.5);
  });
  await page.mouse.click(pt[0], pt[1]);
  await page.waitForTimeout(400);
  const panelTitle = await page.textContent('#panel h2');
  await page.click('[data-act="attack"]');
  await page.waitForTimeout(300);
  const offs1 = await page.evaluate(() => window.app.game.offensives.filter((o) => o.a === window.app.game.playerId).length);
  console.log('ui-attack', panelTitle, 'player offensives', offs1);
  // construction d'une ferme dans la capitale via le panneau
  const pc = await page.evaluate(() => {
    const app = window.app, g = app.game, P = g.countries[g.playerId];
    P.gold += 500;
    const c = app.map.cells[P.capital];
    app.renderer.cam.x = c.ax; app.renderer.cam.y = c.ay; app.renderer.cam.clamp();
    return app.renderer.cam.toScreen(c.ax + 0.5, c.ay + 0.5);
  });
  await page.mouse.click(pc[0], pc[1]);
  await page.waitForTimeout(400);
  await page.click('[data-act="build"][data-b="farm"]');
  await page.waitForTimeout(200);
  const farm = await page.evaluate(() => { const g = window.app.game; return g.buildingLevel(g.countries[g.playerId].capital, 'farm'); });
  console.log('ui-build farm level', farm);
  await page.screenshot({ path: `${OUT}/${tag}04b-ui.png` });
  // simuler 90 s de jeu en x4 puis attaquer l'Allemagne
  await page.evaluate(() => { window.app.setSpeed(4); });
  await page.waitForTimeout(6000);
  const info = await page.evaluate(() => {
    const app = window.app, g = app.game;
    const de = g.countries.find((c) => c.name === 'Allemagne');
    const cell = [...g.cellsOf[de.id]][0];
    app.select(cell);
    app.panel.pct = 70;
    app.attack(de.id, 0.7, cell);
    app.setSpeed(2);
    return { t: g.t, offs: g.offensives.length, news: g.news.length, cells: g.cellsOf[g.playerId].size };
  });
  console.log('state', JSON.stringify(info));
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/${tag}05-attack.png` });
  await page.waitForTimeout(6000);
  await page.screenshot({ path: `${OUT}/${tag}06-later.png` });
  const fps = await page.evaluate(() => new Promise((res) => {
    let n = 0; const t0 = performance.now();
    const f = () => { n++; if (performance.now() - t0 < 2000) requestAnimationFrame(f); else res(n / 2); };
    requestAnimationFrame(f);
  }));
  console.log('fps', fps);
  await page.click('#btn-tech');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${tag}07-tech.png` });
  console.log('errors:\n' + errors.join('\n'));
  await browser.close();
})();
