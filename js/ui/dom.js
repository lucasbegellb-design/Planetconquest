// Petits utilitaires DOM : sélection, modale, notifications.
import { escapeHtml } from '../core/util.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const esc = escapeHtml;

let modalOnClose = null;
export function openModal(html, { narrow = false, onClose = null, closable = true } = {}) {
  const m = $('#modal');
  $('#modal-body').innerHTML = html;
  $('.modal-box', m).classList.toggle('narrow', narrow);
  $('#modal-close').hidden = !closable;
  m.hidden = false;
  m.dataset.closable = closable ? '1' : '';
  modalOnClose = onClose;
  return $('#modal-body');
}
export function closeModal() {
  const m = $('#modal');
  if (m.hidden) return;
  m.hidden = true;
  $('#modal-body').innerHTML = '';
  const cb = modalOnClose; modalOnClose = null;
  if (cb) cb();
}
export const modalOpen = () => !$('#modal').hidden;

export function initModal() {
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal').addEventListener('pointerdown', (e) => {
    if (e.target.id === 'modal' && $('#modal').dataset.closable) closeModal();
  });
}

export function toast(text, kind = '', ms = 2600) {
  const box = $('#toasts');
  if (!box) return null;
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.innerHTML = text;
  box.appendChild(t);
  while (box.children.length > 5) box.firstChild.remove();
  if (ms > 0) setTimeout(() => t.remove(), ms);
  return t;
}

export function show(sel, on = true) { const e = typeof sel === 'string' ? $(sel) : sel; if (e) e.hidden = !on; }
