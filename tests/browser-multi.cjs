const { chromium } = require('playwright');
// Test multijoueur de bout en bout : deux navigateurs isolés (comme deux appareils) via PeerJS/WebRTC.
// Serveur local lancé ; usage : NODE_PATH=$(npm root -g) node tests/browser-multi.cjs [dossier]
// Variables : EARTH=1 (carte Terre), FORCEMAP=1 (force l'envoi de la carte), MOBILE=1 (écran de téléphone)
const OUT = process.argv[2] || '/tmp';
(async () => {
  const b = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' }, args: ['--disable-features=WebRtcHideLocalIpsWithMdns'] });
  const mk = async () => (await b.newContext({ ...(process.env.MOBILE ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 } }), ignoreHTTPSErrors: true })).newPage();
  const A = await mk(); let B = await mk();
  const errs = [];
  for (const [n, p] of [['A', A], ['B', B]]) {
    p.on('pageerror', (e) => errs.push(n + ' pageerror ' + e.message));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(n + ' console ' + m.text()); });
  }
  await A.goto('http://localhost:8080/');
  await A.waitForFunction(() => window.app);
  // monde procédural pour aller vite
  if (!process.env.EARTH) await A.click('.tab[data-mode="proc"]').catch(() => {});
  else await A.click('.tab[data-mode="earth"]').catch(() => {});
  await A.click('#btn-multi');
  await A.fill('#mp-name', 'Alice');
  await A.selectOption('#mp-dur', '10');
  if (process.env.TEAMS) await A.selectOption('#mp-mode', 'teams');
  await A.click('#mp-create');
  await A.waitForFunction(() => app.multi.code && app.mode === 'pick' && !app.mapBuilding, null, { timeout: 30000 });
  const code = await A.evaluate(() => app.multi.code);
  console.log('code', code);
  if (process.env.FORCEMAP) await A.evaluate(() => { app.multi.hash = 1; });
  await B.goto(`http://localhost:8080/?join=${code}`);
  await B.waitForSelector('#mp-join');
  await B.fill('#mp-name', 'Bob');
  await B.click('#mp-join');
  await B.waitForFunction(() => app.mode === 'pick' && !app.mapBuilding && app.map, null, { timeout: 30000 });
  await A.waitForTimeout(1500);
  const lobbyA = await A.evaluate(() => [...app.multi.players.values()]);
  console.log('lobby', JSON.stringify(lobbyA));
  // choix des pays : deux pays différents
  await A.evaluate(() => app.multi.pick(1));
  await B.evaluate(() => app.multi.pick(2));
  await A.waitForTimeout(800);
  await A.screenshot({ path: OUT + '/mp-lobby.png' });
  const dis = await A.evaluate(() => document.querySelector('#lb-start')?.disabled);
  console.log('start disabled', dis, JSON.stringify(await A.evaluate(() => [...app.multi.players.values()])));
  if (process.env.TEAMS) {
    console.log('teams', JSON.stringify(await A.evaluate(() => [...app.multi.players.values()].map((p) => p.team))));
    await B.click('[data-switch]');
    await A.waitForTimeout(800);
    console.log('same team -> start disabled', await A.evaluate(() => document.querySelector('#lb-start').disabled));
    await B.click('[data-switch]');
    await A.waitForTimeout(800);
  }
  // discussion
  await B.evaluate(() => app.multi.sendChat('Salut Alice !'));
  await A.evaluate(() => app.multi.sendChat('Bonne chance'));
  await A.waitForTimeout(800);
  console.log('chat A', await A.evaluate(() => app.multi.chat.map((m) => m.name + ':' + m.text).join(' / ')), '| chat B', await B.evaluate(() => app.multi.chat.length));
  await A.click('#lb-start', { timeout: 15000 }).catch(async (e) => { console.log('ERRS', errs.join('\n')); console.log('B state', await B.evaluate(() => JSON.stringify({ mode: app.mode, cells: app.map.cells.length, toasts: document.querySelector('#toasts').innerText }))); process.exit(1); });
  await B.waitForFunction(() => app.mode === 'play' && app.game, null, { timeout: 20000 });
  await A.waitForTimeout(3000);
  const st = async (p) => p.evaluate(() => ({ t: app.game.t.toFixed(1), me: app.game.playerId, cells: app.game.cellsOf[app.game.playerId].size, gold: Math.round(app.game.countries[app.game.playerId].gold), time: document.querySelector('#tb-time').textContent }));
  console.log('A', JSON.stringify(await st(A)), 'B', JSON.stringify(await st(B)));
  // attaque depuis le client : vers un voisin
  const r = await B.evaluate(() => {
    const g = app.game, me = g.playerId;
    for (const cell of g.cellsOf[me]) for (const nb of g.map.cells[cell].nbrs) { const o = g.owner[nb]; if (o !== me) { app.cmd('launch', o, 0.5); return o; } }
    return -1;
  });
  console.log('B attacks', r, await B.evaluate(() => Math.round(app.game.countries[app.game.playerId].army)));
  await A.waitForTimeout(1000);
  console.log('toasts B', await B.evaluate(() => document.querySelector('#toasts').innerText));
  await A.waitForTimeout(2500);
  console.log('host offensives by B', await A.evaluate((id) => app.game.offensives.filter((o) => o.a === id).length, await B.evaluate(() => app.game.playerId)));
  console.log('client offensives', await B.evaluate(() => app.game.offensives.filter((o) => o.a === app.game.playerId).length));
  await A.waitForTimeout(5000);
  console.log('A', JSON.stringify(await st(A)), 'B', JSON.stringify(await st(B)));
  // cohérence des propriétaires
  const oa = await A.evaluate(() => Array.from(app.game.owner).join(','));
  const ob = await B.evaluate(() => Array.from(app.game.owner).join(','));
  let diff = 0; const xa = oa.split(','), xb = ob.split(','); for (let i = 0; i < xa.length; i++) if (xa[i] !== xb[i]) diff++;
  console.log('owner diffs', diff, '/', xa.length);
  await B.screenshot({ path: OUT + '/mp-client.png' });
  // empire côté client : gouvernement + merveille, synchronisés par l'hôte
  await B.evaluate(() => { app.cmd('gov', 'monarchy'); });
  await A.evaluate((id) => { app.game.countries[id].gold += 1000; }, await B.evaluate(() => app.game.playerId));
  await A.waitForTimeout(1500);
  await B.evaluate(() => { app.cmd('wonder', 'library'); });
  await A.waitForTimeout(1500);
  console.log('empire B', await B.evaluate(() => { const P = app.game.countries[app.game.playerId]; return JSON.stringify({ gov: P.gov, job: P.job && P.job.wid, res: P.resN }); }));
  console.log('HUD score B', await B.evaluate(() => document.querySelector('[data-open="score"]')?.textContent));
  await B.evaluate(() => app.multi.openScores());
  await B.waitForTimeout(300);
  await B.screenshot({ path: OUT + '/mp-scores.png' });
  await B.evaluate(() => document.querySelector('.modal-close, [data-close]')?.click());
  await B.keyboard.press('Escape');
  // déconnexion / reconnexion de Bob
  const bid = await B.evaluate(() => app.game.playerId);
  await B.close();
  await A.waitForTimeout(4000);
  console.log('after leave, host players', await A.evaluate(() => app.multi.players.size), 'toasts', await A.evaluate(() => document.querySelector('#toasts').innerText.split('\n').join(' | ')));
  B = await mk();
  B.on('pageerror', (e) => errs.push('B2 pageerror ' + e.message)); 
  await B.goto(`http://localhost:8080/?join=${code}`);
  await B.waitForSelector('#mp-join');
  await B.fill('#mp-name', 'Bob');
  await B.click('#mp-join');
  await B.waitForFunction(() => app.mode === 'play' && app.game, null, { timeout: 60000 }).catch(() => console.log('B2 did not re-enter play'));
  await A.waitForTimeout(2000);
  console.log('B2 state', await B.evaluate(() => JSON.stringify({ mode: app.mode, mb: app.mapBuilding, map: !!app.map, toasts: document.querySelector('#toasts').innerText }))); console.log('B2 country', await B.evaluate(() => app.game && app.game.playerId), 'was', bid, 'B2 t', await B.evaluate(() => app.game && app.game.t.toFixed(1)), 'A t', await A.evaluate(() => app.game.t.toFixed(1)));
  // fin de partie
  await A.evaluate(() => { app.game.match.ends = app.game.t + 2; });
  await B.waitForFunction(() => document.querySelector('#me-menu'), null, { timeout: 15000 }).catch(() => console.log('no results on B'));
  await A.waitForTimeout(500);
  console.log('A results', !!(await A.$('#me-menu')));
  await B.screenshot({ path: OUT + '/mp-results.png' });
  console.log('errors', errs.slice(0, 15).join('\n'));
  await b.close();
})();
