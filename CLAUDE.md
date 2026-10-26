# Terra Conquest — guide rapide pour les agents

Jeu de stratégie 100 % statique (HTML/CSS/JS, modules ES natifs, zéro dépendance, zéro build). Interface et commentaires en **français**.

## Lire le moins possible
- Ne jamais ouvrir `data/countries-110m.json` (107 Ko) ni les captures `screenshots/`.
- Chercher avec `grep -n` puis lire des plages (`sed -n a,bp`) plutôt que des fichiers entiers.
- Tests rapides avant tout : `node tests/smoke.mjs` (≈2 s). Navigateur seulement si l'UI change.

## Carte du code
- `js/main.js` — classe `App` : écrans (`mode` = menu|pick|play|land|space|replay), boucle, sauvegarde, gestes, sons.
- `js/sim/` — **pur, sans DOM** (testable en Node). `game.js` (état, économie `econ`, offensives `stepOffensives`, `capture`, diplomatie, `serialize/restore`, historique `hist`), `ai.js`, `events.js`, `governor.js`, `balance.js` (toutes les constantes).
- `js/map/` — génération (`earth.js`, `procedural.js`, `cells.js`, exécutée dans `worker.js`) et rendu (`renderer.js`, `paint.js`, `camera.js` = caméra + gestes).
- `js/tech/` — `techtree.js` (ères, technologies, répétables), `buildings.js`.
- `js/space/` — `progression.js` (méta, difficulté par niveau), `spaceView.js`.
- `js/ui/` — `hud.js`, `panel.js`, `techView.js`, `replay.js`, `sound.js`, `menu.js`, `save.js`, `dom.js`.

## Invariants
- Pays d'indice 0 = « Terres libres » (neutre). `g.owner[cell]` → id pays ; `g.cellsOf[id]` = Set de cellules.
- Clé de paire de pays : `pairKey(a,b)` (a*4096+b trié). Un tick = 0,1 s de jeu, économie toutes les 0,5 s.
- Toute capture passe par `g.capture()` (animations, historique, éliminations).
- Textes du fil : accorder avec `v(pays, 'annexe', 'annexent')`, articles via `art/Art/de/a/en` (`js/core/fr.js`).
- La carte est cyclique en x : utiliser `wrapDx`.

## Commandes
- Jouer : `python3 -m http.server 8080` → http://localhost:8080
- Équilibrage : `node tests/sim.mjs 30 France bot quiet`, `REP=2.5 node tests/space-sim.mjs 4`
- Navigateur (Playwright, serveur lancé) : `NODE_PATH=$(npm root -g) node tests/browser.cjs [url] [dossier] [mobile]`, `tests/browser-space.cjs`, `tests/browser-perf.cjs`
- CI : `.github/workflows/deploy.yml` (syntaxe + smoke, puis Pages depuis la branche par défaut).
