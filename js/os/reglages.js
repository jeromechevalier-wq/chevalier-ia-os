// Page Réglages à menu latéral (2.6.0) : UNE page, chez Jérôme (racine) comme chez un client (#/espace/<client>/reglages).
// À gauche : d'abord les réglages de l'ESPACE (la coque : nom, logo, couleur, membres et rôles, modules actifs), puis un élément par MODULE actif
// (CRM, Veille, Automatisations, Accès MCP…). On voit ainsi tout de suite si un réglage vient de la coque ou d'un module.
// La coque ne connaît aucun module : le menu vient du registre (registre.js, reglagesDesModules) et chaque module écrit ses sections dans `reglages(page, ctx)`.
// On réorganise l'AFFICHAGE seulement : aucune donnée n'est déplacée, chaque module garde ses collections.
// Routes : reglages (première section de l'espace), reglages/<section d'espace ou bloc de module>, par exemple reglages/crm.
// Chez un client (2.9.0) : un ÉDITEUR règle lui-même le nom, la couleur, le logo, les images, le texte d'accueil (Mon espace) et les membres (Membres et rôles),
// par la fonction serveur « espaceReglages » (mon-espace.js) : les règles Firestore interdisent toujours d'écrire ces fiches depuis le navigateur. Les modules actifs restent
// à l'administrateur (lecture seule). Un lecteur voit Mon espace en lecture seule et ne modifie rien nulle part (réglages des modules grisés).
import { h, icone, vider, remplir } from './ui.js';
import { lien, naviguer } from './router.js';
import { boutonTheme } from './shell.js';
import { sectionMonEspace, sectionMembresEditable } from './mon-espace.js';
import { reglagesDesModules, sectionsEspaceVisibles, interrupteursDuClient, cibleReglages, moduleDeclare } from './registre.js';

const LIBELLES_ROLE = Object.freeze({ editeur: 'Éditeur : consulte et modifie', lecteur: 'Lecteur : consulte seulement' });

let courant = null; // { arreter } de la page montée

function arreterCourant() {
  const c = courant;
  courant = null;
  c?.arreter();
}

/** Le compte peut-il écrire ? À la racine le compte n'a pas de champ `ecrit` : il écrit. Chez un client : le rôle (éditeur) décide. */
export function compteEcrit(compte) {
  return compte?.ecrit !== false;
}

function section(id, titre, nomIcone, ...enfants) {
  return h('section', { class: 'carte-section', id }, h('h2', {}, icone(nomIcone, { taille: 18 }), titre), ...enfants);
}

function ligneInfo(etiquette, valeur, donnee) {
  return h('div', { class: 'reglages-info', dataset: donnee ? { info: donnee } : {} },
    h('span', { class: 'reglages-info-etiquette' }, etiquette), h('span', { class: 'reglages-info-valeur' }, valeur));
}

// ---------------------------------------------------------------- réglages de l'espace (coque)

function sectionEspace(ctx, etat) {
  const apparence = section('reglages-theme', 'Apparence de cet appareil', 'sun',
    h('p', { class: 'aide' }, 'Le thème choisi est mémorisé sur cet appareil.'),
    boutonTheme('bouton bouton-secondaire'));
  if (ctx.chezClient && ctx.client) return [sectionMonEspace(ctx, etat), apparence]; // éditeur : formulaire ; lecteur : mêmes valeurs désactivées
  const m = ctx.marque;
  const lignes = [ligneInfo('Nom', ctx.nomEspace, 'nom')];
  if (ctx.chezClient) {
    lignes.push(h('div', { class: 'reglages-info', dataset: { info: 'logo' } },
      h('span', { class: 'reglages-info-etiquette' }, 'Logo'),
      m?.logo ? h('img', { class: 'reglages-logo', src: m.logo, alt: '', width: '48', height: '48' }) : h('span', { class: 'reglages-info-valeur' }, 'Pas de logo')));
    lignes.push(h('div', { class: 'reglages-info', dataset: { info: 'couleur' } },
      h('span', { class: 'reglages-info-etiquette' }, 'Couleur'),
      m?.couleur ? h('span', { class: 'reglages-info-valeur' }, h('span', { class: 'reglages-pastille', style: { background: m.couleur }, 'aria-hidden': 'true' }), m.couleur) : h('span', { class: 'reglages-info-valeur' }, 'Couleur par défaut')));
  }
  const identite = section('reglages-identite', 'Identité de l’espace', 'house',
    h('p', { class: 'aide' }, 'L’identité de cet espace est celle de la coque de l’application : elle ne se règle pas ici.'),
    h('div', { class: 'reglages-infos' }, ...lignes));
  return [identite, apparence];
}

function sectionMembres(ctx, etat) {
  if (ctx.chezClient && ctx.client && ctx.editeur) return [sectionMembresEditable(ctx, etat)];
  const equipe = Array.isArray(ctx.fiche?.equipe) ? ctx.fiche.equipe : null;
  const moi = String(ctx.compte?.email ?? '').toLowerCase();
  const membres = (equipe ?? [{ email: ctx.compte?.email, role: ctx.compte?.role }])
    .filter((x) => x && typeof x.email === 'string' && Object.hasOwn(LIBELLES_ROLE, x.role))
    .map((x) => ({ email: x.email.toLowerCase(), role: x.role }))
    .sort((a, b) => a.email.localeCompare(b.email, 'fr'));
  return [section('reglages-membres', 'Membres et rôles', 'users',
    h('p', { class: 'aide' }, 'Les personnes qui ont accès à cet espace. Un éditeur consulte et modifie, un lecteur consulte seulement. Pour ajouter, retirer ou changer le rôle d’un membre, demande à la personne qui gère ton espace : cela ne se fait pas depuis cette page.'),
    h('ul', { class: 'reglages-membres' }, membres.length
      ? membres.map((x) => h('li', { class: 'reglages-membre', dataset: { membre: x.email } },
        h('span', { class: 'reglages-membre-nom' }, x.email, x.email === moi ? ' (toi)' : ''),
        h('span', { class: `reglages-role reglages-role-${x.role}` }, LIBELLES_ROLE[x.role])))
      : h('li', { class: 'aide' }, 'Aucun membre trouvé.')))];
}

function sectionModules(ctx) {
  const lignes = interrupteursDuClient(ctx.actifs).filter((l) => ctx.chezClient || l.modules.every((id) => !moduleDeclare(id).reserveAuxClients));
  return [section('reglages-modules', 'Modules actifs', 'layout-dashboard',
    h('p', { class: 'aide' }, ctx.chezClient
      ? 'Les modules allumés dans cet espace. Éteindre un module ne supprime aucune donnée.'
      : 'Ici tous les modules sont allumés : cet espace n’a pas d’interrupteur par module.'),
    ctx.chezClient ? h('p', { class: 'aide', dataset: { role: 'modules-administrateur' } }, 'Pour changer de module, contacte ton administrateur') : null,
    h('ul', { class: 'reglages-modules' }, lignes.map((l) => {
      const noms = l.modules.map((id) => moduleDeclare(id).nom).join(', ');
      const etat = l.actif ? 'Allumé' : 'Éteint';
      return h('li', { class: 'reglages-module-ligne', dataset: { module: l.id } },
        h('label', { class: 'case' },
          h('input', { type: 'checkbox', role: 'switch', checked: l.actif, disabled: true, dataset: { interrupteur: l.id }, 'aria-label': `${l.libelle} : ${etat.toLowerCase()}` }),
          h('strong', {}, l.libelle)),
        h('span', { class: 'aide' }, l.modules.length > 1 ? `${noms}${l.actif && !l.complet ? ' (une partie seulement est allumée)' : ''}` : ''),
        h('span', { class: `badge${l.actif ? ' badge-actif' : ''}` }, etat));
    })))];
}

const SECTIONS_ESPACE_RENDU = { espace: sectionEspace, membres: sectionMembres, modules: sectionModules };

// ---------------------------------------------------------------- réglages d'un module (ou d'un groupe de modules)

/** Sections d'un bloc de module : celles que ses modules ajoutent à `page`, rangées dans l'ordre déclaré par le registre. */
function sectionsDuModule(item, ctx, arrets) {
  const tampon = h('div', {});
  for (const idModule of item.modules) {
    const api = ctx.apis.get(idModule);
    const arret = api?.reglages?.(tampon, { chezClient: ctx.chezClient, compte: ctx.compte, lecture: !ctx.editeur });
    if (typeof arret === 'function') arrets.push(arret);
  }
  const rang = (el) => { const i = item.sections.findIndex((s) => s.id === el.id); return i === -1 ? item.sections.length : i; };
  return [...tampon.children].map((el, i) => ({ el, i })).sort((a, b) => rang(a.el) - rang(b.el) || a.i - b.i).map((x) => x.el);
}

/** Raccourcis vers les sections d'une longue page (le CRM en a une douzaine) ; une section masquée (option éteinte) n'a pas de raccourci. */
function raccourcis(item, zone) {
  const barre = h('nav', { class: 'reglages-raccourcis', 'aria-label': 'Dans cette page' });
  const maj = () => {
    const visibles = [...zone.querySelectorAll('section.carte-section[id]')].filter((el) => !el.hidden);
    remplir(barre, ...visibles.map((el) => {
      const declaree = item.sections.find((s) => s.id === el.id);
      const titre = declaree?.libelle ?? el.querySelector('h2')?.textContent ?? el.id;
      return h('button', { type: 'button', class: 'reglages-raccourci', dataset: { vers: el.id }, onclick: () => el.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, titre);
    }));
    barre.hidden = visibles.length < 4;
  };
  maj();
  const observateur = typeof MutationObserver === 'function' ? new MutationObserver(maj) : null;
  observateur?.observe(zone, { attributes: true, attributeFilter: ['hidden'], subtree: true, childList: true });
  return { barre, arreter: () => observateur?.disconnect() };
}

function contenuModule(item, ctx, arrets) {
  const elements = sectionsDuModule(item, ctx, arrets);
  const enTete = h('header', { class: 'page-tete' }, h('div', {},
    h('p', { class: 'etiquette' }, `Réglages du module · ${item.libelle}`),
    h('h2', { class: 'reglages-titre' }, item.libelle)));
  if (!elements.length) {
    return [enTete, section(`reglages-${item.id}`, item.libelle, item.icone,
      h('p', { class: 'aide', dataset: { role: 'aucun-reglage' } }, item.resume || 'Ce module n’a pas de réglage pour l’instant.'),
      item.ouvrir ? h('a', { class: 'bouton bouton-secondaire', href: lien(item.ouvrir) }, icone('chevron-right', { taille: 16 }), `Ouvrir ${item.libelle}`) : null)];
  }
  const zone = h('fieldset', { class: 'reglages-sections', disabled: !ctx.editeur }, ...elements); // fieldset désactivé = lecteur : tout est consultable, rien ne se modifie
  const avis = ctx.editeur ? null : h('p', { class: 'aide reglages-lecture', role: 'status' }, icone('info', { taille: 14 }), 'Tu es lecteur de cet espace : tu peux consulter ces réglages, pas les modifier.');
  const r = raccourcis(item, zone);
  arrets.push(r.arreter);
  return [enTete, avis, r.barre, zone];
}

// ---------------------------------------------------------------- page

/**
 * Monte la page Réglages dans `conteneur` (appelée à chaque changement d'adresse sous `reglages`). Renvoie `quitter()`.
 * `ctx` : { apis: Map(id -> api), actifs: [ids], chezClient, client (identifiant), nomEspace, marque, fiche, compte, editeur, surMarque(marque) (nouvelle marque enregistrée), surDeconnexion }.
 */
export function monterReglages(conteneur, segs, ctx) {
  arreterCourant();
  const editeur = ctx.editeur !== false && compteEcrit(ctx.compte);
  const c = { ...ctx, editeur };
  const items = reglagesDesModules(c.actifs);
  const espaces = sectionsEspaceVisibles({ chezClient: !!c.chezClient, editeur });
  const cible = cibleReglages(segs, { espaces, modules: items });
  if (!cible) { naviguer('reglages', { remplacer: true }); return arreterCourant; } // section inconnue (ou réservée aux éditeurs) : retour à la page d'arrivée

  const arrets = [];
  const etat = { vivant: true, nettoyages: [] }; // écrans de « Mon espace » : plus rien ne s'affiche après avoir quitté la page
  arrets.push(() => { etat.vivant = false; etat.nettoyages.forEach((f) => f()); }); // un retrait en attente (8 s) suit son cours même si on change de page
  // Un éditeur vient d'enregistrer : le nom de la page se met à jour ici, la coquille (menu, barre, onglet, accent) dans espace-modules.js.
  c.surMarque = (m) => {
    ctx.surMarque?.(m);
    document.querySelectorAll('[data-nom-espace]').forEach((el) => { el.textContent = `${el.dataset.nomEspace}${m.nom}`; });
  };
  const contenu = h('div', { class: 'reglages-contenu', dataset: { reglages: `${cible.type}:${cible.id}` } });
  const titreActuel = cible.type === 'espace' ? espaces.find((s) => s.id === cible.id) : items.find((m) => m.id === cible.id);
  if (cible.type === 'espace') {
    contenu.append(h('header', { class: 'page-tete' }, h('div', {}, h('p', { class: 'etiquette', dataset: { nomEspace: 'Réglages de l’espace · ' } }, `Réglages de l’espace · ${c.nomEspace}`), h('h2', { class: 'reglages-titre' }, titreActuel.libelle))));
    const rendu = SECTIONS_ESPACE_RENDU[cible.id](c, etat);
    contenu.append(...rendu);
  } else {
    contenu.append(...contenuModule(items.find((m) => m.id === cible.id), c, arrets).filter(Boolean));
  }

  const lienMenu = (id, libelle, nomIcone, type) => h('a', {
    class: 'reglages-menu-lien', href: lien(`reglages/${id}`), dataset: { reglage: id, type },
    'aria-current': cible.id === id ? 'page' : null,
  }, icone(nomIcone, { taille: 16 }), h('span', {}, libelle));
  const menuListe = h('div', { class: 'reglages-menu-liste', id: 'reglages-menu-liste' },
    h('p', { class: 'reglages-menu-titre' }, 'Espace'),
    ...espaces.map((s) => lienMenu(s.id, s.libelle, s.icone, 'espace')),
    items.length ? h('p', { class: 'reglages-menu-titre' }, 'Modules') : null,
    ...items.map((m) => lienMenu(m.id, m.libelle, m.icone, 'module')));
  const boutonMenu = h('button', {
    type: 'button', class: 'reglages-menu-bouton', 'aria-expanded': 'false', 'aria-controls': 'reglages-menu-liste',
    onclick: () => { const ouvert = menu.dataset.ouvert !== 'true'; menu.dataset.ouvert = String(ouvert); boutonMenu.setAttribute('aria-expanded', String(ouvert)); },
  }, icone(titreActuel.icone ?? 'settings', { taille: 16 }), h('span', {}, titreActuel.libelle), icone('chevron-down', { taille: 16 }));
  const menu = h('nav', { class: 'reglages-menu', 'aria-label': 'Sections des réglages', dataset: { ouvert: 'false' } }, boutonMenu, menuListe);

  vider(conteneur);
  conteneur.append(h('div', { class: 'page page-reglages page-reglages-menu' },
    h('header', { class: 'page-tete page-tete-reglages' }, h('div', {}, h('p', { class: 'etiquette', dataset: { nomEspace: '' } }, c.nomEspace), h('h1', {}, 'Réglages'))),
    h('div', { class: 'reglages-corps' }, menu, contenu)));

  courant = { arreter: () => { arrets.forEach((f) => f()); } };
  return arreterCourant;
}
