// Coquille de l'OS : menu latéral repliable, thèmes sombre et clair, profil, écran de connexion.
import { h, icone, vider, remplir, lirePreference, ecrirePreference, estTelephone, champIntelligent, ouvrirMenu } from './ui.js';
import { MODULES } from './modules.js';
import { naviguer, lien } from './router.js';

// ---------------------------------------------------------------- thème

export function themeCourant() {
  return document.documentElement.dataset.theme === 'clair' ? 'clair' : 'sombre';
}

export function appliquerTheme(theme) {
  const t = theme === 'clair' ? 'clair' : 'sombre';
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', t === 'clair' ? '#f5f5f3' : '#1b1a1e');
  document.querySelectorAll('[data-role="bascule-theme"]').forEach(majBoutonTheme);
}

export function basculerTheme() {
  const t = themeCourant() === 'sombre' ? 'clair' : 'sombre';
  ecrirePreference('theme', t);
  appliquerTheme(t);
}

function majBoutonTheme(bouton) {
  const sombre = themeCourant() === 'sombre';
  const libelle = sombre ? 'Thème clair' : 'Thème sombre';
  remplir(bouton, icone(sombre ? 'sun' : 'moon'), h('span', { class: 'menu-texte' }, libelle));
  bouton.setAttribute('aria-label', libelle);
  bouton.dataset.infobulle = libelle;
}

export function boutonTheme(classe = 'menu-entree') {
  const b = h('button', { type: 'button', class: classe, dataset: { role: 'bascule-theme' }, onclick: basculerTheme });
  majBoutonTheme(b);
  return b;
}

// ---------------------------------------------------------------- baguette (marque)

export function baguette(taille = 28) {
  // Deux versions du SVG du site : l'une pour le thème sombre, l'autre pour le clair (choix en CSS).
  return h('span', { class: 'baguette', style: { width: `${taille}px`, height: `${taille}px` } },
    h('img', { class: 'baguette-sombre', src: 'assets/logo/marque-inverse.svg', alt: '', width: String(taille), height: String(taille) }),
    h('img', { class: 'baguette-claire', src: 'assets/logo/marque.svg', alt: '', width: String(taille), height: String(taille) }));
}

// ---------------------------------------------------------------- écran de connexion

export function afficherConnexion(racine, { message = '', surConnexion, enCours = false }) {
  vider(racine);
  document.body.classList.add('page-connexion');
  const bouton = h('button', { type: 'button', class: 'bouton bouton-google', disabled: enCours, onclick: async () => {
    bouton.disabled = true;
    try { await surConnexion(); } finally { bouton.disabled = false; }
  } }, icone('log-in', { taille: 18 }), 'Se connecter avec Google');
  racine.append(h('div', { class: 'connexion' },
    h('div', { class: 'connexion-marque' }, h('img', { src: 'assets/logo/marque-inverse.svg', alt: '', width: '28', height: '28' }), h('span', {}, 'Chevalier IA')),
    h('div', { class: 'scene' },
      h('div', { class: 'orbite o1' }),
      h('div', { class: 'orbite o2' }),
      h('div', { class: 'charles-flottant' }, h('img', { src: 'assets/charles-portrait.png', alt: 'Charles, l’assistant IA, te salue', width: '512', height: '384' }))),
    h('h1', {}, 'Chevalier IA OS'),
    h('p', { class: 'connexion-lead' }, 'L’espace de travail de Jérôme et Charles.'),
    message ? h('p', { class: 'message-refus', role: 'alert' }, icone('triangle-alert', { taille: 16 }), message) : null,
    bouton,
    h('p', { class: 'connexion-pied' }, 'Accès réservé aux comptes autorisés.')));
}

// ---------------------------------------------------------------- coquille

/**
 * Monte la coquille pour le compte connecté.
 * Renvoie { contenu, activer(route) }.
 * Options : `modules` (défaut : tous, CRM de Jérôme) ; chez un client (chantier 7) `client` = { nom, logo } remplace la marque de Jérôme,
 * `accueil` = première route, `reglages: false` retire l'entrée Réglages (pas de réglages de l'OS chez un client pour l'instant).
 */
export function monterCoquille(racine, compte, { surDeconnexion, apis = new Map(), modules = MODULES, client = null, accueil = 'crm/accueil', reglages: avecReglages = true }) {
  vider(racine);
  document.body.classList.remove('page-connexion');
  const elargi = lirePreference('menu', 'replie') === 'elargi';

  const entrees = [];
  const nav = h('nav', { class: 'menu-nav', 'aria-label': 'Navigation' });
  for (const m of modules) {
    const groupe = h('div', { class: 'menu-groupe' },
      h('div', { class: 'menu-groupe-titre' }, icone(m.icone, { taille: 16 }), h('span', { class: 'menu-texte' }, m.libelle)));
    for (const e of m.entrees) {
      const a = h('a', { class: 'menu-entree', href: lien(e.chemin), dataset: { infobulle: e.libelle, chemin: e.chemin } },
        icone(e.icone), h('span', { class: 'menu-texte' }, e.libelle));
      entrees.push(a);
      groupe.append(a);
    }
    nav.append(groupe);
  }
  if (avecReglages) {
    const reglages = h('a', { class: 'menu-entree', href: '#/reglages', dataset: { infobulle: 'Réglages', chemin: 'reglages' } },
      icone('settings'), h('span', { class: 'menu-texte' }, 'Réglages'));
    entrees.push(reglages);
    nav.append(h('div', { class: 'menu-groupe' }, reglages));
  }

  const boutonRepli = h('button', {
    type: 'button', class: 'menu-entree menu-repli', dataset: { role: 'bascule-menu' },
    onclick: () => definirElargi(coquille.dataset.menu !== 'elargi'),
  });
  // Chez un client : pas de photo, une pastille avec l'initiale du nom.
  const initiale = (taille) => h('span', { class: 'avatar avatar-initiale', style: { width: `${taille}px`, height: `${taille}px` }, 'aria-hidden': 'true' }, [...String(compte.nom || '?')][0].toUpperCase());
  const avatar = client ? initiale(32) : h('img', { class: `avatar avatar-${compte.nom === 'Charles' ? 'charles' : 'jerome'}`, src: compte.avatar, alt: '', width: '32', height: '32' });
  const marqueMenu = client
    ? [client.logo ? h('img', { class: 'menu-logo-client', src: client.logo, alt: '', width: '26', height: '26' }) : null, h('span', { class: 'menu-texte' }, client.nom)]
    : [baguette(26), h('span', { class: 'menu-texte' }, 'Chevalier IA ', h('b', {}, 'OS'))];
  const menu = h('aside', { class: 'menu', id: 'menu', 'aria-label': 'Menu principal' },
    h('div', { class: 'menu-marque' }, ...marqueMenu),
    nav,
    h('div', { class: 'menu-bas' },
      boutonTheme(),
      h('div', { class: 'menu-compte', dataset: { infobulle: compte.nom } }, avatar, h('span', { class: 'menu-texte' }, h('span', { class: 'compte-nom' }, compte.nom), h('span', { class: 'compte-email' }, compte.email))),
      h('button', { type: 'button', class: 'menu-entree', dataset: { infobulle: 'Se déconnecter' }, 'aria-label': 'Se déconnecter', onclick: surDeconnexion },
        icone('log-out'), h('span', { class: 'menu-texte' }, 'Se déconnecter')),
      boutonRepli));

  const boutonMobile = h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Ouvrir le menu', 'aria-controls': 'menu', 'aria-expanded': 'false', dataset: { role: 'ouvrir-menu' },
    onclick: () => ouvrirMobile(!coquille.classList.contains('menu-ouvert')) }, icone('menu', { taille: 22 }));
  const actions = [...apis.values()].flatMap((api) => api.actionsRapides || []);
  const ouvrirPlus = (e) => ouvrirMenu(e.currentTarget, actions.map((a) => ({ libelle: a.libelle, icone: a.icone, action: a.action })));
  const boutonPlus = h('button', { type: 'button', class: 'bouton-plus', 'aria-label': 'Ajouter', 'aria-haspopup': 'menu', dataset: { role: 'bouton-plus' }, onclick: ouvrirPlus }, icone('plus', { taille: 20 }));
  const boutonPlusMobile = h('button', { type: 'button', class: 'bouton-plus bouton-plus-mobile', 'aria-label': 'Ajouter', 'aria-haspopup': 'menu', onclick: ouvrirPlus }, icone('plus', { taille: 20 }));
  const boutonRecherche = h('button', { type: 'button', class: 'bouton-icone bouton-recherche-mobile', 'aria-label': 'Rechercher', dataset: { role: 'ouvrir-recherche' },
    onclick: () => { coquille.classList.toggle('recherche-ouverte'); if (coquille.classList.contains('recherche-ouverte')) setTimeout(() => recherche.focus(), 0); } }, icone('search', { taille: 20 }));

  // Recherche globale : résultats groupés (Personnes, Organisations, Affaires) fournis par les modules.
  const recherche = champIntelligent({
    etiquette: 'Rechercher', placeholder: 'Rechercher (/)', icone: 'search', classe: 'recherche-globale',
    fournir: (saisie) => {
      const groupes = [];
      for (const api of apis.values()) groupes.push(...(api.rechercher?.(saisie)?.groupes || []));
      return { groupes };
    },
    surChoix: (el) => {
      if (!el?.chemin) return;
      naviguer(el.chemin);
      coquille.classList.remove('recherche-ouverte');
      setTimeout(() => { recherche.effacer(); recherche.entree.blur(); }, 0);
    },
  });
  recherche.entree.dataset.role = 'recherche-globale';
  // Entrée sans flèche : ouvre le premier résultat.
  recherche.entree.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || recherche.entree.getAttribute('aria-activedescendant')) return;
    recherche.element.querySelector('.suggestion')?.click();
  });
  const barreOutils = h('div', { class: 'barre-outils' }, recherche.element, boutonPlus);

  const barreHaut = h('header', { class: 'barre-haut' },
    boutonMobile,
    h('a', { class: 'barre-haut-marque', href: lien(accueil) }, ...(client ? [h('span', {}, client.nom)] : [baguette(22), h('span', {}, 'Chevalier IA ', h('b', {}, 'OS'))])),
    boutonRecherche,
    boutonPlusMobile,
    client ? initiale(30) : h('img', { class: `avatar avatar-${compte.nom === 'Charles' ? 'charles' : 'jerome'}`, src: compte.avatar, alt: compte.nom, width: '30', height: '30' }));
  const voile = h('div', { class: 'voile-menu', onclick: () => ouvrirMobile(false) });
  const contenu = h('main', { class: 'contenu', id: 'contenu', tabindex: '-1' });
  const zone = h('div', { class: 'zone' }, barreOutils, contenu);
  const coquille = h('div', { class: 'coquille', dataset: { menu: elargi ? 'elargi' : 'replie' } }, barreHaut, menu, voile, zone);
  racine.append(coquille);

  function definirElargi(v) {
    coquille.dataset.menu = v ? 'elargi' : 'replie';
    ecrirePreference('menu', v ? 'elargi' : 'replie');
    majRepli();
  }
  function majRepli() {
    const v = coquille.dataset.menu === 'elargi';
    const libelle = v ? 'Replier le menu' : 'Élargir le menu';
    remplir(boutonRepli, icone(v ? 'panel-left-close' : 'panel-left-open'), h('span', { class: 'menu-texte' }, libelle));
    boutonRepli.setAttribute('aria-label', libelle);
    boutonRepli.setAttribute('aria-expanded', String(v));
    boutonRepli.dataset.infobulle = libelle;
  }
  function ouvrirMobile(v) {
    coquille.classList.toggle('menu-ouvert', v);
    boutonMobile.setAttribute('aria-expanded', String(v));
  }
  majRepli();
  nav.addEventListener('click', (e) => { if (e.target.closest('a') && estTelephone()) ouvrirMobile(false); });

  // Raccourcis (ordinateur) : "n" ouvre « Ajouter une personne », "/" place le curseur dans la recherche.
  function surTouche(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const cible = e.target;
    if (cible && (['INPUT', 'TEXTAREA', 'SELECT'].includes(cible.tagName) || cible.isContentEditable)) return;
    if (document.querySelector('.voile-dialogue')) return;
    if (e.key === '/') { e.preventDefault(); recherche.focus(); }
    else if (e.key === 'n') {
      const a = actions.find((x) => x.raccourci === 'n');
      if (a) { e.preventDefault(); a.action(); }
    }
  }
  document.addEventListener('keydown', surTouche);

  function activer(route) {
    for (const a of entrees) {
      const actif = route === a.dataset.chemin || route.startsWith(`${a.dataset.chemin}/`);
      a.classList.toggle('actif', actif);
      if (actif) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
  }
  return { contenu, activer, arreter: () => document.removeEventListener('keydown', surTouche) };
}
