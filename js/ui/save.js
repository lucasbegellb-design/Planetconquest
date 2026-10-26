// Sauvegarde automatique (localStorage) + export / import en fichier JSON.
const KEY = 'terra-conquest-save-v1';

export function hasSave() {
  try { return !!localStorage.getItem(KEY); } catch { return false; }
}
export function readSave() {
  try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : null; } catch { return null; }
}
export function writeSave(data) {
  try { localStorage.setItem(KEY, JSON.stringify(data)); return true; } catch { return false; }
}
export function clearSave() {
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}
export function exportFile(data) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const d = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const name = `terra-conquest-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
export function validateSave(data) {
  return data && data.v === 1 && data.setup && data.setup.spec && data.game && Array.isArray(data.game.owner);
}
