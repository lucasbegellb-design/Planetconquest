// Décodeur TopoJSON minimal (arcs quantifiés + delta) → anneaux de polygones [lon, lat].
export function decodeTopology(topo, objectName) {
  const { scale, translate } = topo.transform || { scale: [1, 1], translate: [0, 0] };
  const arcs = topo.arcs.map((arc) => {
    let x = 0, y = 0;
    return arc.map((p) => {
      x += p[0]; y += p[1];
      return [x * scale[0] + translate[0], y * scale[1] + translate[1]];
    });
  });
  const ring = (indices) => {
    const out = [];
    for (const idx of indices) {
      const a = idx >= 0 ? arcs[idx] : arcs[~idx].slice().reverse();
      for (let i = out.length ? 1 : 0; i < a.length; i++) out.push(a[i]);
    }
    return out;
  };
  const obj = topo.objects[objectName];
  return obj.geometries.map((g) => {
    let polygons = [];
    if (g.type === 'Polygon') polygons = [g.arcs.map(ring)];
    else if (g.type === 'MultiPolygon') polygons = g.arcs.map((poly) => poly.map(ring));
    return { id: g.id, name: g.properties && g.properties.name, polygons };
  });
}

// Remplissage par balayage (règle pair-impair) d'un polygone en coordonnées pixel.
// Les x peuvent sortir de [0, W) : ils sont repliés (carte cyclique).
export function rasterizePolygon(rings, W, H, value, out) {
  const edges = [];
  let ymin = Infinity, ymax = -Infinity;
  for (const r of rings) {
    for (let i = 0; i < r.length; i++) {
      const a = r[i], b = r[(i + 1) % r.length];
      if (a[1] === b[1]) continue;
      edges.push(a[0], a[1], b[0], b[1]);
      if (a[1] < ymin) ymin = a[1]; if (a[1] > ymax) ymax = a[1];
    }
  }
  const y0 = Math.max(0, Math.floor(ymin)), y1 = Math.min(H - 1, Math.ceil(ymax));
  const xs = [];
  for (let y = y0; y <= y1; y++) {
    const yc = y + 0.5;
    xs.length = 0;
    for (let e = 0; e < edges.length; e += 4) {
      const ax = edges[e], ay = edges[e + 1], bx = edges[e + 2], by = edges[e + 3];
      if ((ay <= yc && by > yc) || (by <= yc && ay > yc)) xs.push(ax + ((yc - ay) * (bx - ax)) / (by - ay));
    }
    if (xs.length < 2) continue;
    xs.sort((p, q) => p - q);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const xa = Math.ceil(xs[k] - 0.5), xb = Math.floor(xs[k + 1] - 0.5);
      for (let x = xa; x <= xb; x++) out[y * W + (((x % W) + W) % W)] = value;
    }
  }
}
