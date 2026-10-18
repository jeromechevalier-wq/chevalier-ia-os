// Routage par ancre : #/crm/accueil (défaut), #/crm/kanban, #/crm/liste, #/crm/fiche/<id>, #/reglages.
// Chez un client (chantier 7), toutes les routes des modules vivent sous #/espace/<client>/… : `definirPrefixe('espace/<client>')` fait
// que routeCourante() rend la route SANS ce préfixe (les modules continuent de parler en `crm/personnes`) et que naviguer() / lien() le remettent.
// Sans préfixe (CRM de Jérôme), rien ne change.
export const ROUTE_DEFAUT = 'crm/accueil';

let prefixe = '';

/** Préfixe de route d'un client, ou '' pour le CRM de Jérôme. */
export function definirPrefixe(p = '') {
  prefixe = String(p ?? '').split('/').filter(Boolean).join('/');
}

/** Route (sans le « # » ni le préfixe) lue dans une adresse de la forme #/…. Fonction pure, testée seule. */
export function routeDepuisHash(hash, pref = '') {
  const brut = decodeURIComponent(String(hash ?? '').replace(/^#\/?/, '')).replace(/\/+$/, '');
  if (!pref) return brut || ROUTE_DEFAUT;
  const bas = brut.toLowerCase();
  const p = pref.toLowerCase();
  if (bas === p) return '';
  if (bas.startsWith(`${p}/`)) return brut.slice(p.length + 1);
  return '';
}

/** L'adresse (#/…) est-elle déjà sous ce préfixe de client ? */
export function estSousPrefixe(hash, pref) {
  const bas = String(hash ?? '').replace(/^#\/?/, '').toLowerCase();
  const p = String(pref ?? '').toLowerCase();
  return Boolean(p) && (bas === p || bas.startsWith(`${p}/`));
}

/** Adresse (avec « # ») d'une route de module. */
export function lien(chemin, pref = prefixe) {
  const c = String(chemin ?? '').replace(/^#?\/+/, '');
  return `#/${pref ? `${pref}/` : ''}${c}`.replace(/\/+$/, '');
}

export function routeCourante() {
  return routeDepuisHash(location.hash, prefixe);
}

export function segments(route = routeCourante()) {
  return route.split('/').filter(Boolean);
}

export function naviguer(chemin, { remplacer = false } = {}) {
  const cible = lien(chemin);
  if (location.hash === cible) return;
  if (remplacer) {
    history.replaceState(null, '', `${location.pathname}${location.search}${cible}`);
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  } else {
    location.hash = cible;
  }
}

export function surChangementRoute(rappel) {
  const f = () => rappel(routeCourante());
  window.addEventListener('hashchange', f);
  return () => window.removeEventListener('hashchange', f);
}

/**
 * Chez un client : les liens écrits en dur par les modules (`href="#/crm/personnes/…"`) sont ramenés sous le préfixe du client.
 * Ne fait rien sans préfixe. Renvoie la fonction qui retire l'écouteur.
 */
export function suivreLiensDuPrefixe() {
  if (!prefixe) return () => {};
  const surClic = (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = e.target?.closest?.('a[href^="#/"]');
    if (!a) return;
    const cible = a.getAttribute('href');
    if (estSousPrefixe(cible, prefixe)) return;
    e.preventDefault();
    naviguer(cible.replace(/^#\/?/, ''));
  };
  document.addEventListener('click', surClic);
  return () => document.removeEventListener('click', surClic);
}

// ---------------------------------------------------------------- garde de sortie
// Une page avec un brouillon non enregistré (Réglages) déclare une garde : tant qu'elle répond « modifié », un changement d'adresse est annulé
// puis une fenêtre demande « Quitter sans enregistrer ? ». Sans brouillon modifié, la navigation n'est jamais touchée.
const gardes = new Set();
let derniereAdresse = typeof location === 'undefined' ? '' : location.hash;
let sortieConfirmee = false;

/** `modifie()` : vrai s'il y a un brouillon non enregistré. Une garde dont la page a disparu doit répondre faux (elle est alors retirée). */
export function ajouterGardeSortie(modifie, { message = 'Des changements ne sont pas enregistrés.' } = {}) {
  const g = { modifie, message };
  gardes.add(g);
  return () => gardes.delete(g);
}

function gardeActive() {
  return [...gardes].find((g) => g.modifie());
}

if (typeof window !== 'undefined') {
  // Enregistré à l'import du routeur, donc avant les écouteurs de la coque : stopImmediatePropagation empêche le changement de page.
  window.addEventListener('hashchange', async (e) => {
    const nouvelle = location.hash;
    if (sortieConfirmee) { sortieConfirmee = false; derniereAdresse = nouvelle; return; }
    const garde = nouvelle === derniereAdresse ? null : gardeActive();
    if (!garde) { derniereAdresse = nouvelle; return; }
    e.stopImmediatePropagation();
    history.replaceState(null, '', `${location.pathname}${location.search}${derniereAdresse}`);
    const { confirmer } = await import('./ui.js');
    if (await confirmer('Quitter sans enregistrer ?', `${garde.message} Si tu quittes, ils seront perdus.`, { libelleOk: 'Quitter sans enregistrer', danger: true })) {
      sortieConfirmee = true;
      location.hash = nouvelle;
    }
  });
  window.addEventListener('beforeunload', (e) => { if (gardeActive()) { e.preventDefault(); e.returnValue = ''; } });
}
