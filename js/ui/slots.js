// Fenêtre des sauvegardes : sauvegarde automatique + emplacements manuels (avec aperçu de la carte).
import { openModal, closeModal, toast, esc } from './dom.js';
import { listSlots, writeSlot, readSlot, deleteSlot, readSave } from './save.js';
import { fmtTime, rgbToCss } from '../core/util.js';

const when = (ms) => new Date(ms).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// mode : 'save' (depuis une partie) ou 'load' (depuis l'accueil)
export function openSlots(app, mode) {
  const root = openModal('<div id="slots-root"></div>', { narrow: true });
  const box = root.querySelector('#slots-root');
  const render = () => {
    const slots = listSlots();
    const auto = readSave();
    const card = (i, m, label) => {
      if (!m) return `<div class="slot empty"><div class="slot-thumb"></div><div class="slot-info"><b>${label}</b><span class="hint">Emplacement libre</span></div>
        ${mode === 'save' ? `<div class="slot-acts"><button class="btn small primary" data-save="${i}">💾 Sauvegarder ici</button></div>` : ''}</div>`;
      return `<div class="slot"><div class="slot-thumb">${m.thumb ? `<img src="${m.thumb}" alt="">` : ''}</div>
        <div class="slot-info"><b>${m.color ? `<span class="swatch" style="background:${rgbToCss(m.color)}"></span>` : ''}${esc(m.name || label)}</b>
          <span class="hint">${esc(m.country || '')}${m.planet ? ' · ' + esc(m.planet) : ''} · ${m.cells ?? '?'} terr. · ${fmtTime(m.t || 0)} de jeu</span>
          <span class="hint">${when(m.savedAt)}</span></div>
        <div class="slot-acts">${mode === 'save' && i > 0 ? `<button class="btn small" data-save="${i}">Écraser</button>` : ''}
          <button class="btn small primary" data-load="${i}">Charger</button>${i > 0 ? `<button class="btn small ghost" data-del="${i}" title="Supprimer">🗑️</button>` : ''}</div></div>`;
    };
    const autoMeta = auto ? { t: auto.game?.t, ...auto.slotMeta, savedAt: auto.savedAt || Date.now() } : null;
    box.innerHTML = `<h2>${mode === 'save' ? '💾 Sauvegarder' : '📂 Charger une partie'}</h2>
      <p class="hint">La partie est aussi sauvegardée automatiquement toutes les 30 s. Pour la garder ailleurs : ☰ → Exporter en fichier.</p>
      <h3>Automatique</h3>${autoMeta ? card(0, { ...autoMeta, name: 'Sauvegarde automatique' }, 'Automatique') : '<p class="hint">Aucune.</p>'}
      <h3>Emplacements</h3>${slots.map((m, i) => card(i + 1, m, `Emplacement ${i + 1}`)).join('')}`;
  };
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-save],[data-load],[data-del]');
    if (!b) return;
    if (b.dataset.save) {
      const i = +b.dataset.save, data = app.makeSave();
      if (!data) { toast('Rien à sauvegarder ici.', 'err'); return; }
      const ok = writeSlot(i, data, app.slotMeta());
      toast(ok ? `💾 Sauvegardé dans l’emplacement ${i}` : 'Stockage plein : supprimez une sauvegarde ou exportez en fichier.', ok ? 'ok' : 'err', 3000);
      render();
    } else if (b.dataset.load) {
      const i = +b.dataset.load, data = i === 0 ? readSave() : readSlot(i);
      if (!data) { toast('Sauvegarde introuvable.', 'err'); return; }
      closeModal();
      if (app.mode === 'play') app.autosave();
      await app.loadData(data);
    } else if (b.dataset.del) {
      if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Supprimer ?'; return; }
      deleteSlot(+b.dataset.del);
      render();
    }
  });
  render();
}

