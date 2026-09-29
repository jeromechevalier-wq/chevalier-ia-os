// Détection de nouvelle version (version.json, sans cache) et bandeau hors ligne. Aucun service worker.
import { VERSION } from './version.js';
import { h, icone } from './ui.js';

function zoneBandeaux() {
  let z = document.getElementById('bandeaux');
  if (!z) {
    z = h('div', { id: 'bandeaux', class: 'bandeaux' });
    document.body.prepend(z);
  }
  return z;
}

function afficherBandeau(id, contenu, classe) {
  if (document.getElementById(id)) return;
  zoneBandeaux().append(h('div', { id, class: `bandeau ${classe}`, role: 'status' }, contenu));
}

function retirerBandeau(id) {
  document.getElementById(id)?.remove();
}

export async function verifierVersion() {
  try {
    const r = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!r.ok) return;
    const { version } = await r.json();
    if (version && version !== VERSION) {
      afficherBandeau('bandeau-version', [
        icone('sparkles', { taille: 16 }),
        h('span', {}, 'Nouvelle version disponible'),
        h('button', { type: 'button', class: 'bouton bouton-principal bouton-petit', onclick: () => location.reload() }, 'Recharger'),
      ], 'bandeau-version');
    }
  } catch {
    // Pas de réseau : le bandeau hors ligne s'en charge.
  }
}

function majEtatReseau() {
  if (navigator.onLine) {
    retirerBandeau('bandeau-hors-ligne');
  } else {
    afficherBandeau('bandeau-hors-ligne', [
      icone('wifi-off', { taille: 16 }),
      h('span', {}, 'Hors ligne : reconnecte toi pour continuer'),
    ], 'bandeau-hors-ligne');
  }
}

export function demarrerPwa() {
  verifierVersion();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') verifierVersion();
  });
  window.addEventListener('focus', verifierVersion);
  window.addEventListener('online', () => { majEtatReseau(); verifierVersion(); });
  window.addEventListener('offline', majEtatReseau);
  majEtatReseau();
}
