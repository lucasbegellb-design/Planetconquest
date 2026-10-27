// Peinture du raster de la carte dans un tampon RGBA (utilisé par le rendu et les tests Node).
import { BIOMES } from './biomes.js';
import { hexToRgb } from '../core/util.js';

const DEFAULT_PALETTE = {
  shallow: '#2f6b8f', deep: '#0d2238', foam: '#5d9cbc', neutralTint: 0.0,
};

export class MapPainter {
  /**
   * @param map carte générée
   * @param palette { shallow, deep, foam, biomes?: {id: '#hex'}, waterFn?(x,y,depth) }
   */
  constructor(map, palette = {}) {
    this.map = map;
    this.pal = { ...DEFAULT_PALETTE, ...palette };
    this.buf = new Uint8ClampedArray(map.W * map.H * 4);
    const bio = palette.biomes || {};
    this.biomeRGB = BIOMES.map((b, i) => hexToRgb(bio[i] || b.color));
    this.shallow = hexToRgb(this.pal.shallow);
    this.deep = hexToRgb(this.pal.deep);
    this.foam = hexToRgb(this.pal.foam);
    // Contexte de coloration fourni par le jeu
    this.ownerOf = (cell) => 0;
    this.colorOf = (owner) => [128, 128, 128];
    this.isNeutral = (owner) => owner === 0;
    this.playerId = -1;
    this.selCountry = -1;
    this.selCell = -1;
    // mode de carte : (cellule, propriétaire) -> [r, g, b] ou null (couleur politique)
    this.tintOf = null;
    this._cell = -1;
  }

  paintWater() {
    const { W, H, cellOf, depth } = this.map;
    const buf = this.buf, S = this.shallow, D = this.deep, F = this.foam;
    const fn = this.pal.waterFn;
    for (let p = 0, N = W * H; p < N; p++) {
      if (cellOf[p] >= 0) continue;
      const d = depth[p];
      let r, g, b;
      if (fn) {
        [r, g, b] = fn(p % W, (p / W) | 0, d, W, H);
      } else {
        const t = Math.min(1, d / 34);
        const tt = t * t * (3 - 2 * t);
        r = S[0] + (D[0] - S[0]) * tt; g = S[1] + (D[1] - S[1]) * tt; b = S[2] + (D[2] - S[2]) * tt;
        if (d <= 2) { const f = (3 - d) / 5; r += (F[0] - r) * f; g += (F[1] - g) * f; b += (F[2] - b) * f; }
      }
      const o = p * 4;
      buf[o] = r; buf[o + 1] = g; buf[o + 2] = b; buf[o + 3] = 255;
    }
  }

  // couleur de base d'un pixel de terre
  _base(p, owner, out) {
    const t = this.biomeRGB[this.map.biome[p]];
    const s = 0.8 + 0.4 * (this.map.shade[p] / 255);
    const tint = this.tintOf && this.tintOf(this._cell, owner);
    if (tint) {
      out[0] = (tint[0] * 0.86 + t[0] * 0.14) * s; out[1] = (tint[1] * 0.86 + t[1] * 0.14) * s; out[2] = (tint[2] * 0.86 + t[2] * 0.14) * s;
    } else if (this.isNeutral(owner)) {
      out[0] = (t[0] * 0.8 + 40) * s; out[1] = (t[1] * 0.8 + 38) * s; out[2] = (t[2] * 0.8 + 34) * s;
    } else {
      const c = this.colorOf(owner);
      out[0] = (c[0] * 0.84 + t[0] * 0.16) * s;
      out[1] = (c[1] * 0.84 + t[1] * 0.16) * s;
      out[2] = (c[2] * 0.84 + t[2] * 0.16) * s;
    }
    if (owner === this.selCountry && owner >= 0) {
      out[0] += (255 - out[0]) * 0.16; out[1] += (255 - out[1]) * 0.16; out[2] += (255 - out[2]) * 0.16;
    }
  }

  paintCell(id, ownerOverride) {
    const cell = this.map.cells[id];
    const owner = ownerOverride ?? this.ownerOf(id);
    const buf = this.buf, W = this.map.W;
    const px = cell.px, c = [0, 0, 0];
    const hatch = id === this.selCell;
    this._cell = id;
    for (let i = 0; i < px.length; i++) {
      const p = px[i];
      this._base(p, owner, c);
      const o = p * 4;
      if (hatch && ((p % W) + ((p / W) | 0)) % 6 < 2) {
        buf[o] = c[0] + (255 - c[0]) * 0.35; buf[o + 1] = c[1] + (255 - c[1]) * 0.35; buf[o + 2] = c[2] + (255 - c[2]) * 0.35;
      } else { buf[o] = c[0]; buf[o + 1] = c[1]; buf[o + 2] = c[2]; }
      buf[o + 3] = 255;
    }
    this.paintEdges(id, owner);
  }

  paintEdges(id, ownerOverride) {
    const cell = this.map.cells[id];
    const owner = ownerOverride ?? this.ownerOf(id);
    const buf = this.buf, edge = cell.edge, nbr = cell.edgeNbr;
    const c = [0, 0, 0];
    this._cell = id;
    const meP = owner === this.playerId;
    for (let i = 0; i < edge.length; i++) {
      const p = edge[i], nb = nbr[i];
      this._base(p, owner, c);
      let f;
      if (nb < 0) f = 0.72;
      else {
        const no = this.ownerOf(nb);
        if (no === owner) f = this.isNeutral(owner) ? 0.94 : 0.86;
        else if (meP) { c[0] = 245; c[1] = 245; c[2] = 235; f = 1; }
        else if (owner === this.selCountry && owner >= 0) { c[0] = 255; c[1] = 236; c[2] = 140; f = 1; }
        else f = 0.42;
      }
      const o = p * 4;
      buf[o] = c[0] * f; buf[o + 1] = c[1] * f; buf[o + 2] = c[2] * f;
    }
  }

  paintAll() {
    this.paintWater();
    for (let i = 0; i < this.map.cells.length; i++) this.paintCell(i);
  }
}
