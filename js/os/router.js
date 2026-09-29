// Routage par ancre : #/crm/accueil (défaut), #/crm/kanban, #/crm/liste, #/crm/fiche/<id>, #/reglages.
export const ROUTE_DEFAUT = 'crm/accueil';

export function routeCourante() {
  const brut = decodeURIComponent(location.hash.replace(/^#\/?/, '')).replace(/\/+$/, '');
  return brut || ROUTE_DEFAUT;
}

export function segments(route = routeCourante()) {
  return route.split('/').filter(Boolean);
}

export function naviguer(chemin, { remplacer = false } = {}) {
  const cible = `#/${chemin}`;
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
