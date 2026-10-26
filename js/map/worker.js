// Génération de carte hors du fil principal : l'interface reste fluide pendant le calcul.
import { generateEarth } from './earth.js';
import { generatePlanet } from './procedural.js';

let topology = null;

self.onmessage = async (e) => {
  const { spec } = e.data;
  try {
    const progress = async (p, m) => self.postMessage({ type: 'progress', p, m });
    let map;
    if (spec.kind === 'earth') {
      if (!topology) {
        await progress(0.02, 'Chargement de la carte du monde…');
        const r = await fetch(new URL('../../data/countries-110m.json', import.meta.url));
        if (!r.ok) throw new Error('Carte introuvable');
        topology = await r.json();
      }
      map = await generateEarth(topology, { scale: spec.scale || 1 }, progress);
    } else {
      map = await generatePlanet(spec, progress);
    }
    // les fonctions ne traversent pas postMessage : elles sont recréées côté page
    delete map.lonOf; delete map.latOf;
    if (map.palette) delete map.palette.waterFn;
    const transfer = [map.cellOf.buffer, map.biome.buffer, map.shade.buffer, map.depth.buffer];
    for (const c of map.cells) transfer.push(c.px.buffer, c.edge.buffer, c.edgeNbr.buffer);
    self.postMessage({ type: 'done', map }, transfer);
  } catch (err) {
    self.postMessage({ type: 'error', message: err.message || String(err) });
  }
};
