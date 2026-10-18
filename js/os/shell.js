// Coquille de l'OS : menu latéral repliable, thèmes sombre et clair, profil, écran de connexion.
import { h, icone, vider, remplir, lirePreference, ecrirePreference, estTelephone, champIntelligent, ouvrirMenu } from './ui.js';
import { MODULES } from './modules.js';
import { blocsDuMenu } from './registre.js';
import { naviguer, lien } from './router.js';

// Routes sans entrée de menu -> entrée allumée à leur place (l'écran principal de leur module).
const ROUTES_SOUS_ENTREE = [['projets/archives', 'projets/projets'], ['projets/modeles', 'projets/projets']];

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

/** Espace de Jérôme (racine) : même forme que l'identité d'un client, `logo` = la baguette (fonction qui fabrique l'image à la taille voulue). */
export const ESPACE_RACINE = Object.freeze({ nom: 'Chevalier IA OS', logo: baguette, accent: 'OS' });

/** Nom d'un espace ; `accent` (facultatif) = dernier mot mis en valeur (le « OS » jaune de la marque de Jérôme). */
function nomEspace(c) {
  return c.accent && c.nom.endsWith(` ${c.accent}`) ? [c.nom.slice(0, -c.accent.length), h('b', {}, c.accent)] : [c.nom];
}

/** Logo d'un espace : adresse d'image (client), fonction qui fabrique l'image (baguette de la racine) ou rien. */
function logoEspace(logo, taille, classe) {
  if (typeof logo === 'function') return logo(taille);
  return logo ? h('img', { class: classe, src: logo, alt: '', width: String(taille), height: String(taille) }) : null;
}

/**
 * Monte la coquille pour le compte connecté.
 * Renvoie { contenu, activer(route), majClient(nouveau), arreter() }.
 * Options : `modules` (défaut : tous) ; `client` = { nom, logo, accent? } (identité de l'espace : la même forme chez Jérôme, où elle vaut ESPACE_RACINE, et chez un client) ;
 * `accueil` = première route.
 * Menu principal : blocs d'entrées séparés par de fines lignes, sans titres de groupes. Réglages, Journal des modifications, « Connecter mon assistant », thème
 * et déconnexion sont dans le menu utilisateur (clic sur le nom, en bas à gauche). Le bouton de repli est à droite du nom de l'espace (Cmd/Ctrl+B).
 */
export function monterCoquille(racine, compte, { surDeconnexion, apis = new Map(), modules = MODULES, client = ESPACE_RACINE, accueil = 'crm/accueil' }) {
  vider(racine);
  document.body.classList.remove('page-connexion');
  const elargi = lirePreference('menu', 'replie') === 'elargi';
  const idsModules = modules.map((x) => x.id);

  const entrees = [];
  const nav = h('nav', { class: 'menu-nav', 'aria-label': 'Navigation' });
  // Un bloc du menu par module ou groupe de modules (le CRM réunit affaires et projets : registre.js, blocsDuMenu), lui-même coupé en sections ;
  // une fine ligne sépare deux sections (CSS), jamais de titre. Un module sans entrée de menu (Connecter mon assistant) n'a pas de bloc.
  for (const m of blocsDuMenu(idsModules)) {
    if (!m.sections.length) continue;
    const groupe = h('div', { class: 'menu-groupe', dataset: { bloc: m.id } });
    for (const liste of m.sections) {
      const section = h('div', { class: 'menu-section' });
      for (const e of liste) {
        const a = h('a', { class: 'menu-entree', href: lien(e.chemin), dataset: { infobulle: e.libelle, chemin: e.chemin } },
          icone(e.icone), h('span', { class: 'menu-texte' }, e.libelle));
        entrees.push(a);
        section.append(a);
      }
      groupe.append(section);
    }
    nav.append(groupe);
  }

  const boutonRepli = h('button', {
    type: 'button', class: 'bouton-icone menu-repli', dataset: { role: 'bascule-menu' },
    onclick: () => definirElargi(coquille.dataset.menu !== 'elargi'),
  });
  const initiale = (taille, nomAccessible = false) => h('span', {
    class: 'avatar avatar-initiale', style: { width: `${taille}px`, height: `${taille}px` },
    ...(nomAccessible ? { role: 'img', 'aria-label': compte.nom } : { 'aria-hidden': 'true' }),
  }, [...String(compte.nom || '?')][0].toUpperCase());
  const marqueNom = h('span', { class: 'menu-marque-nom' });
  const remplirMarque = () => {
    remplir(marqueNom, logoEspace(client.logo, 26, 'menu-logo-client'), h('span', { class: 'menu-texte' }, ...nomEspace(client)));
  };
  remplirMarque();

  // Menu utilisateur : s'ouvre vers le haut depuis le nom du compte (ouvrirMenu, placement 'haut').
  const boutonCompte = h('button', {
    type: 'button', class: 'menu-compte', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-controls': 'menu-utilisateur', dataset: { role: 'menu-utilisateur', infobulle: compte.nom },
  }, initiale(32), h('span', { class: 'menu-texte compte-nom' }, compte.nom), h('span', { class: 'menu-texte compte-chevron' }, icone('chevron-up', { taille: 16 })));
  let fermerCompte = null;
  const allerDepuisMenu = (route) => () => { if (estTelephone()) ouvrirMobile(false); naviguer(route); };
  boutonCompte.addEventListener('click', () => {
    if (boutonCompte.getAttribute('aria-expanded') === 'true') { fermerCompte?.(); return; }
    const items = [
      ...(compte.email && compte.email.toLowerCase() !== String(compte.nom || '').toLowerCase() ? [{ texte: compte.email }] : []),
      { libelle: 'Réglages', icone: 'settings', action: allerDepuisMenu('reglages') },
      ...(idsModules.includes('affaires') ? [{ libelle: 'Voir le journal des modifications', icone: 'history', action: allerDepuisMenu('crm/journal') }] : []),
      ...(idsModules.includes('mcp') ? [{ libelle: 'Connecter mon assistant', icone: 'link', action: allerDepuisMenu('mcp/infos') }] : []),
      { noeud: boutonTheme('menu-pop-entree') },
      { separateur: true },
      { libelle: 'Se déconnecter', icone: 'log-out', action: surDeconnexion },
    ];
    fermerCompte = ouvrirMenu(boutonCompte, items, { placement: 'haut', id: 'menu-utilisateur' });
  });

  const menu = h('aside', { class: 'menu', id: 'menu', 'aria-label': 'Menu principal' },
    h('div', { class: 'menu-marque' }, marqueNom, boutonRepli),
    nav,
    h('div', { class: 'menu-bas' }, boutonCompte));

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

  const marqueHaut = h('a', { class: 'barre-haut-marque', href: lien(accueil) });
  const remplirMarqueHaut = () => remplir(marqueHaut, logoEspace(client.logo, 22, 'barre-haut-logo'), h('span', {}, ...nomEspace(client)));
  remplirMarqueHaut();
  const barreHaut = h('header', { class: 'barre-haut' }, boutonMobile, marqueHaut, boutonRecherche, boutonPlusMobile, initiale(30, true));
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
    remplir(boutonRepli, icone(v ? 'panel-left-close' : 'panel-left-open', { taille: 20 }));
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

  const ignorerTouche = (e) => {
    const cible = e.target;
    return Boolean(cible && (['INPUT', 'TEXTAREA', 'SELECT'].includes(cible.tagName) || cible.isContentEditable)) || Boolean(document.querySelector('.voile-dialogue'));
  };
  // Raccourcis (ordinateur) : "n" ouvre « Ajouter une personne », "/" place le curseur dans la recherche.
  function surTouche(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (ignorerTouche(e)) return;
    if (e.key === '/') { e.preventDefault(); recherche.focus(); }
    else if (e.key === 'n') {
      const a = actions.find((x) => x.raccourci === 'n');
      if (a) { e.preventDefault(); a.action(); }
    }
  }
  // Cmd+B (Mac) ou Ctrl+B : replie ou élargit le menu (écouteur à part : surTouche sort dès qu'une touche Ctrl ou Cmd est pressée). Sans effet sur téléphone.
  function surToucheRepli(e) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey || String(e.key).toLowerCase() !== 'b') return;
    if (ignorerTouche(e) || estTelephone() || document.querySelector('.menu-pop')) return; // un menu flottant ouvert : on ne replie pas le menu dessous
    e.preventDefault();
    definirElargi(coquille.dataset.menu !== 'elargi');
  }
  document.addEventListener('keydown', surTouche);
  document.addEventListener('keydown', surToucheRepli);

  function activer(route) {
    for (const a of entrees) {
      // Les pages d'un module qui n'ont pas (ou plus) d'entrée de menu allument l'entrée de leur écran principal : archives et modèles -> Projets.
      const chemin = ROUTES_SOUS_ENTREE.find(([prefixe]) => route === prefixe || route.startsWith(`${prefixe}/`))?.[1];
      const actif = route === a.dataset.chemin || route.startsWith(`${a.dataset.chemin}/`) || chemin === a.dataset.chemin;
      a.classList.toggle('actif', actif);
      if (actif) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    }
  }
  /** Nouveau nom et nouveau logo de l'espace (un éditeur vient de les enregistrer chez un client) dans le menu et la barre du haut, sans recharger la page. */
  function majClient(nouveau) {
    client = { ...client, ...nouveau };
    remplirMarque();
    remplirMarqueHaut();
  }
  return { contenu, activer, majClient, arreter: () => { document.removeEventListener('keydown', surTouche); document.removeEventListener('keydown', surToucheRepli); } };
}
