// Coquille de l'OS : menu latéral repliable, thèmes sombre et clair, profil, écran de connexion.
import { h, icone, vider, remplir, lirePreference, ecrirePreference, estTelephone, champIntelligent, ouvrirMenu } from './ui.js';
import { MODULES } from './modules.js';
import { blocsDuMenu, routeArriveeMenu } from './registre.js';
import { badgeDe, definirBadge, surBadge, texteBadge, phraseBadge } from './badges.js';
import { naviguer, lien } from './router.js';

// Routes sans entrée de menu -> entrée allumée à leur place (l'écran principal de leur module).
/** Écrans qui gardent la barre de recherche et le bouton « + » du haut (les autres : Veille, Automatisations, Maintenance, réglages, journal, assistant…). */
const PAGES_AVEC_OUTILS = ['crm/accueil', 'crm/personnes', 'crm/organisations', 'crm/affaires', 'projets/', 'devis/editeur', 'devis/voir', 'devis/liste', 'devis/bordereau', 'devis/vocabulaire'];
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
// Largeur du menu déplié : bornes et défaut (le même défaut que --menu-elargi dans css/tokens.css ; le script de index.html applique la valeur mémorisée avant le premier rendu).
export const MENU_LARGEUR = { min: 200, max: 420, defaut: 240, pas: 16 };
const borneLargeur = (n) => Math.min(MENU_LARGEUR.max, Math.max(MENU_LARGEUR.min, Math.round(n)));
/** Largeur mémorisée ; absente, illisible ou hors bornes -> la largeur par défaut. */
export function largeurMemorisee() {
  const brut = lirePreference('menu-largeur', null);
  const n = /^\d{3}$/.test(String(brut)) ? Number(brut) : NaN;
  return n >= MENU_LARGEUR.min && n <= MENU_LARGEUR.max ? n : MENU_LARGEUR.defaut;
}
const poserLargeur = (n) => document.documentElement.style.setProperty('--menu-largeur', `${n}px`);

export function monterCoquille(racine, compte, { surDeconnexion, apis = new Map(), modules = MODULES, client = ESPACE_RACINE, accueil = 'crm/accueil' }) {
  vider(racine);
  document.body.classList.remove('page-connexion');
  const elargi = lirePreference('menu', 'replie') === 'elargi';
  const idsModules = modules.map((x) => x.id);

  const entrees = [];
  const entreesBadge = []; // [{ a, entree, pastille, lu }] : les entrées dont le module déclare une pastille (registre.js, champ `badge`) ; la coque ne connaît aucun module en particulier
  const nav = h('nav', { class: 'menu-nav', 'aria-label': 'Navigation' });
  // Un bloc du menu par module ou groupe de modules (le CRM réunit affaires et projets : registre.js, blocsDuMenu), lui-même coupé en sections ;
  // une fine ligne sépare deux sections (CSS), jamais de titre. Un module sans entrée de menu (Connecter mon assistant) n'a pas de bloc.
  for (const m of blocsDuMenu(idsModules)) {
    if (!m.sections.length) continue;
    const groupe = h('div', { class: 'menu-groupe', dataset: { bloc: m.id } });
    for (const liste of m.sections) {
      const section = h('div', { class: 'menu-section' });
      for (const e of liste) {
        const a = h('a', { class: 'menu-entree', href: lien(e.chemin), dataset: { infobulle: e.libelle, chemin: e.chemin, ...(e.prefixe ? { prefixe: e.prefixe } : {}) } },
          icone(e.icone), h('span', { class: 'menu-texte' }, e.libelle));
        if (e.badge) {
          // Pastille ronde rouge : le nombre est vu à l'œil (aria-hidden), la phrase « n à valider » est lue par les lecteurs d'écran (texte masqué).
          const pastille = h('span', { class: 'menu-badge', hidden: true, dataset: { role: 'badge-menu' } }, h('span', { 'aria-hidden': 'true', class: 'menu-badge-nombre' }), h('span', { class: 'sr-only' }));
          a.append(pastille);
          entreesBadge.push({ a, entree: e, pastille });
        }
        entrees.push(a);
        section.append(a);
      }
      groupe.append(section);
    }
    nav.append(groupe);
  }

  /** Met à jour la pastille et le lien d'une entrée : le lien arrive sur l'écran du badge quand il y a quelque chose à traiter, sinon sur l'entrée habituelle. */
  function majBadgeEntree({ a, entree, pastille }) {
    const n = badgeDe(entree.module);
    pastille.hidden = n === 0;
    pastille.firstChild.textContent = n > 0 ? texteBadge(n) : '';
    pastille.lastChild.textContent = n > 0 ? phraseBadge(n, entree.badge.texte) : '';
    a.setAttribute('href', lien(routeArriveeMenu(entree, n)));
    a.dataset.badge = String(n);
  }
  entreesBadge.forEach(majBadgeEntree);
  const arretAffichageBadges = surBadge((id) => entreesBadge.filter((x) => x.entree.module === id).forEach(majBadgeEntree));
  // Écoute permanente tant que la coque existe : chaque module à pastille fournit `ecouterBadge(rappel)` dans son API (le rappel reçoit un nombre) ; arrêtée avec la coque.
  const arretsEcoutes = entreesBadge.map(({ entree }) => {
    try { return apis.get(entree.module)?.ecouterBadge?.((n) => definirBadge(entree.module, n)) ?? null; } catch (e) { console.warn('badge indisponible', e?.code); return null; }
  });

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

  // Poignée de redimensionnement (bord droit du menu déplié, ordinateur seulement) : souris, stylet, doigt (pointer events) et clavier.
  let largeur = largeurMemorisee();
  const poignee = h('div', { class: 'menu-poignee', role: 'separator', 'aria-orientation': 'vertical', 'aria-label': 'Largeur du menu', tabindex: '0', dataset: { role: 'poignee-menu' } });
  const maxFenetre = () => Math.max(MENU_LARGEUR.min, Math.min(MENU_LARGEUR.max, Math.floor(window.innerWidth / 2))); // jamais plus de la moitié de la fenêtre
  const largeurAffichee = () => Math.min(largeur, maxFenetre());
  function majPoignee() {
    poignee.setAttribute('aria-valuemin', String(MENU_LARGEUR.min));
    poignee.setAttribute('aria-valuemax', String(maxFenetre()));
    poignee.setAttribute('aria-valuenow', String(largeurAffichee()));
    poignee.setAttribute('aria-valuetext', `${largeurAffichee()} px`);
  }
  function definirLargeur(n, { memoriser = true } = {}) {
    largeur = Math.min(borneLargeur(n), maxFenetre());
    poserLargeur(largeur);
    if (memoriser) ecrirePreference('menu-largeur', String(largeur));
    majPoignee();
  }
  let glisse = false;
  let largeurAvant = largeur;
  let pointeur = null;
  /** Fin d'un tirage : valide la largeur atteinte, ou revient à celle d'avant (Échap, perte du pointeur, poignée disparue). */
  function finGlisse({ annuler = false } = {}) {
    if (!glisse) return;
    glisse = false;
    coquille.classList.remove('menu-glisse');
    document.removeEventListener('keydown', surToucheGlisse, true);
    try { if (pointeur !== null) poignee.releasePointerCapture(pointeur); } catch { /* déjà relâché */ }
    pointeur = null;
    if (annuler) definirLargeur(largeurAvant, { memoriser: false }); else definirLargeur(largeur);
  }
  function surToucheGlisse(e) {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finGlisse({ annuler: true }); }
    else if ((e.ctrlKey || e.metaKey) && String(e.key).toLowerCase() === 'b') { e.preventDefault(); e.stopPropagation(); } // pas de repli pendant un tirage
  }
  poignee.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.preventDefault();
    glisse = true;
    largeurAvant = largeurAffichee();
    pointeur = e.pointerId;
    poignee.setPointerCapture(e.pointerId);
    coquille.classList.add('menu-glisse');
    document.addEventListener('keydown', surToucheGlisse, true);
  });
  poignee.addEventListener('pointermove', (e) => { if (glisse) definirLargeur(e.clientX - menu.getBoundingClientRect().left, { memoriser: false }); });
  poignee.addEventListener('pointerup', () => finGlisse());
  poignee.addEventListener('pointercancel', () => finGlisse({ annuler: true }));
  poignee.addEventListener('lostpointercapture', () => finGlisse({ annuler: true }));
  poignee.addEventListener('dblclick', () => definirLargeur(MENU_LARGEUR.defaut));
  poignee.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const cible = { ArrowLeft: largeurAffichee() - MENU_LARGEUR.pas, ArrowRight: largeurAffichee() + MENU_LARGEUR.pas, Home: MENU_LARGEUR.min, End: maxFenetre() }[e.key];
    if (cible === undefined) return;
    e.preventDefault();
    definirLargeur(cible);
  });
  const surRedimension = () => majPoignee();
  window.addEventListener('resize', surRedimension);
  poserLargeur(largeur);
  majPoignee();

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
      // Un module qui échoue ne coupe pas la recherche des autres.
      for (const api of apis.values()) {
        try { groupes.push(...(api.rechercher?.(saisie)?.groupes || [])); } catch (e) { console.warn('Recherche : un module a échoué', e); }
      }
      return { groupes };
    },
    lienDe: (el) => (el?.chemin ? lien(el.chemin) : null),
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
    // La poignée n'existe que dans l'état déplié (et jamais sur téléphone, où le menu glisse).
    if (v && !estTelephone()) { if (!poignee.isConnected) menu.append(poignee); majPoignee(); } else { finGlisse({ annuler: true }); poignee.remove(); }
  }
  function ouvrirMobile(v) {
    coquille.classList.toggle('menu-ouvert', v);
    boutonMobile.setAttribute('aria-expanded', String(v));
  }
  majRepli();
  const surBascule = window.matchMedia('(max-width: 767px)');
  surBascule.addEventListener?.('change', majRepli);
  nav.addEventListener('click', (e) => { if (e.target.closest('a') && estTelephone()) ouvrirMobile(false); });

  const ignorerTouche = (e) => {
    const cible = e.target;
    return Boolean(cible && (['INPUT', 'TEXTAREA', 'SELECT'].includes(cible.tagName) || cible.isContentEditable)) || Boolean(document.querySelector('.voile-dialogue'));
  };
  // Raccourcis (ordinateur) : "n" ouvre « Ajouter une personne », "/" place le curseur dans la recherche.
  function surTouche(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (ignorerTouche(e)) return;
    if (e.key === '/') { if (coquille.classList.contains('sans-outils')) return; e.preventDefault(); recherche.focus(); }
    else if (e.key === 'n' && !coquille.classList.contains('sans-outils')) {
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
  // Téléphone : Échap referme le tiroir du menu (sauf si une fenêtre ou le menu utilisateur est ouvert : eux d'abord).
  function surToucheTiroir(e) {
    if (e.key !== 'Escape' || e.defaultPrevented || !coquille.classList.contains('menu-ouvert')) return;
    if (document.querySelector('.voile-dialogue, .menu-pop')) return;
    ouvrirMobile(false);
    boutonMobile.focus?.();
  }
  document.addEventListener('keydown', surTouche);
  document.addEventListener('keydown', surToucheTiroir);
  document.addEventListener('keydown', surToucheRepli);

  function activer(route) {
    // La recherche du haut et le gros bouton « + » ne servent que sur l'Accueil, Personnes, Organisations, Affaires, Projets, l'éditeur, la liste des devis et le Catalogue (25/10/2026).
    const avecOutils = PAGES_AVEC_OUTILS.some((p) => route === p || route.startsWith(p.endsWith('/') ? p : `${p}/`));
    coquille.classList.toggle('sans-outils', !avecOutils);
    coquille.classList.toggle('outils-defilent', route === 'devis/editeur' || route.startsWith('devis/editeur/') || route.startsWith('devis/voir/'));
    if (!avecOutils) coquille.classList.remove('recherche-ouverte');
    for (const a of entrees) {
      // Les pages d'un module qui n'ont pas (ou plus) d'entrée de menu allument l'entrée de leur écran principal : archives et modèles -> Projets.
      const chemin = ROUTES_SOUS_ENTREE.find(([prefixe]) => route === prefixe || route.startsWith(`${prefixe}/`))?.[1];
      // Entrée d'un module à onglets (data-prefixe) : allumée sur tous les écrans du module, quel que soit l'onglet.
      const actif = route === a.dataset.chemin || route.startsWith(`${a.dataset.chemin}/`) || chemin === a.dataset.chemin
        || Boolean(a.dataset.prefixe && route.startsWith(`${a.dataset.prefixe}/`));
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
  return { contenu, activer, majClient, arreter: () => { arretsEcoutes.forEach((f) => { try { f?.(); } catch { /* déjà arrêtée */ } }); arretAffichageBadges(); for (const { entree } of entreesBadge) definirBadge(entree.module, 0); document.removeEventListener('keydown', surTouche); document.removeEventListener('keydown', surToucheTiroir); document.removeEventListener('keydown', surToucheRepli); window.removeEventListener('resize', surRedimension); surBascule.removeEventListener?.('change', majRepli); } };
}
