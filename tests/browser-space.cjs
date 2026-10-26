// Test navigateur : monde procédural → conquête forcée → fusée → système → héritage → atterrissage → reprise.
const { chromium } = require('playwright');

const URL = process.argv[2] || 'http://localhost:8080/';
const OUT = process.argv[3] || '/tmp/claude-0';

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { try { localStorage.setItem('terra-conquest-welcome', '1'); } catch (e) {} });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message + '\n' + e.stack));
  await page.goto(URL + '?seed=demo42&type=terran');
  await page.waitForTimeout(400);
  await page.click('#btn-new');
  await page.waitForSelector('#pick:not([hidden])', { timeout: 30000 });
  await page.screenshot({ path: `${OUT}/s01-proc-pick.png` });
  await page.click('#pick-random');
  await page.waitForTimeout(1200);
  await page.click('#pick-go');
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/s02-proc-play.png` });
  // conquête forcée + époque spatiale + spatioport + fusée prête
  await page.evaluate(() => {
    const app = window.app, g = app.game, pid = g.playerId, P = g.countries[pid];
    for (let i = 0; i < g.nCells; i++) if (g.owner[i] !== pid) g.capture(i, pid, -1, (i % 50) * 0.02);
    for (const t of ['agriculture', 'bronze', 'writing', 'navigation', 'masonry', 'currency', 'feudalism', 'fortifications', 'steel', 'scholastic', 'banking', 'cartography',
      'steam', 'railways', 'artillery', 'medicine', 'conscription', 'industry', 'electricity', 'tanks', 'aviation', 'radar', 'computers', 'globalization', 'rocketry', 'colonization']) P.techs.add(t);
    g._refreshTech(P);
    P.gold = 1e5;
    g.buildIn(pid, P.capital, 'spaceport');
    g.startRocket();
    g.rocket.progress = 1e9;
    g.econ(0.5);
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${OUT}/s03-conquered.png` });
  await page.evaluate(() => { document.getElementById('modal-close').click(); window.app.openGoals(); });
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/s04-goals.png` });
  await page.click('#rk-launch');
  await page.waitForTimeout(1800);
  await page.screenshot({ path: `${OUT}/s05-launch.png` });
  await page.waitForSelector('#space:not([hidden])', { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/s06-space.png` });
  await page.click('[data-a="choose"]');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/s07-perks.png` });
  await page.click('[data-perk]');
  await page.waitForSelector('#pick:not([hidden])', { timeout: 30000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/s08-landing.png` });
  await page.evaluate(() => {
    const app = window.app, map = app.map;
    const c = map.cells.find((x) => x.initOwner < 0 && x.nbrs.length >= 3) || map.cells[0];
    app.landTap(c.id);
  });
  await page.click('#land-go');
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.app.setSpeed(4));
  await page.waitForTimeout(5000);
  await page.screenshot({ path: `${OUT}/s09-alien-play.png` });
  const st = await page.evaluate(() => {
    const g = window.app.game, P = g.countries[g.playerId];
    return { planet: g.planet.name, type: g.planet.type, level: g.planet.level, cells: g.cellsOf[g.playerId].size, era: P.era, army: Math.round(P.army), countries: g.countries.length, wars: g.wars.size };
  });
  console.log('alien', JSON.stringify(st));
  // sauvegarde + rechargement
  await page.evaluate(() => window.app.autosave());
  await page.reload();
  await page.waitForTimeout(500);
  await page.click('#btn-continue');
  await page.waitForSelector('#hud:not([hidden])', { timeout: 30000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `${OUT}/s10-reloaded.png` });
  const st2 = await page.evaluate(() => { const g = window.app.game; return { planet: g.planet.name, cells: g.cellsOf[g.playerId].size, level: window.app.meta.level }; });
  console.log('reloaded', JSON.stringify(st2));
  console.log('errors:\n' + errors.join('\n'));
  await browser.close();
})();
