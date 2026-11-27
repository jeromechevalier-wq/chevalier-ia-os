// Page Réglages à menu latéral (2.6.0) : UNE page, chez Jérôme (racine) comme chez un client (#/espace/<client>/reglages).
// À gauche : d'abord les réglages de l'ESPACE (la coque : nom, logo, couleur, membres et rôles, modules actifs), puis un élément par MODULE actif
// (CRM, Veille, Automatisations, Accès MCP…). On voit ainsi tout de suite si un réglage vient de la coque ou d'un module.
// La coque ne connaît aucun module : le menu vient du registre (registre.js, reglagesDesModules) et chaque module écrit ses sections dans `reglages(page, ctx)`.
// On réorganise l'AFFICHAGE seulement : aucune donnée n'est déplacée, chaque module garde ses collections.
// Routes : reglages (première section de l'espace), reglages/<section d'espace ou bloc de module>, par exemple reglages/crm.
// Chez un client (2.10.0) : un ÉDITEUR règle lui-même le nom, la couleur, le logo, les images, le texte d'accueil (Mon espace) et les membres (Membres et rôles),
// par la fonction serveur « espaceReglages » (mon-espace.js) : les règles Firestore interdisent toujours d'écrire ces fiches depuis le navigateur. Les modules actifs restent
// à l'administrateur (lecture seule). Un lecteur voit Mon espace en lecture seule et ne modifie rien nulle part (réglages des modules grisés).
import { h, icone, vider, remplir } from './ui.js';
import { lien, naviguer } from './router.js';
import { boutonTheme } from './shell.js';
import { sectionMonEspace, sectionMembresEditable } from './mon-espace.js';
import { sectionDeploiement } from './deploiement-ecran.js';
import { sectionMesTests } from './mes-tests-ecran.js';
import { sectionConnexionBase } from './base-reglages-ecran.js';
import { compteReserve, pagesTechniquesCachees } from './acces-reserve.js';
import { nomEspaceRacine, maisonNeutre, logoMaison, identiteMaisonModifiable } from './identite-maison.js';
import { sectionMonEspaceMaison } from './mon-espace-maison.js';
import { modulesEcranBrut } from './comptes-maison.js';
import { lireModulesMaison } from './maison-modules.js';
import { reglagesDesModules, sectionsEspaceVisibles, interrupteursDuClient, interrupteursDeLaMaison, cibleReglages, moduleDeclare } from './registre.js';

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
  // Maison d'un client (reglages_maison/public porte un nom ou connexion_neutre) : tout compte de la maison qui peut écrire règle ici le nom et le logo (27/11/2026, accord de Jérôme :
  // plus seulement le titulaire ; js/os/mon-espace-maison.js ; règles Firestore : compteAutorise, chaque changement noté dans le journal). Un compte en lecture seule, et Jérôme chez lui : lecture seule.
  if (identiteMaisonModifiable(ctx)) return [sectionMonEspaceMaison(ctx, etat), apparence];
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
  if (!ctx.chezClient && logoMaison()) lignes.push(h('div', { class: 'reglages-info', dataset: { info: 'logo' } }, // maison d'un client : le logo de l'espace, en lecture seule
    h('span', { class: 'reglages-info-etiquette' }, 'Logo'), h('img', { class: 'reglages-logo', src: logoMaison(), alt: '', width: '48', height: '48' })));
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

/** Sommes-nous dans la MAISON d'un client (déploiement à part, CRM racine) ? Maison neutre, ou réglage `modules` présent dans reglages_maison/ecran. Jamais sur la plateforme, jamais chez Jérôme. */
function dansUneMaison(ctx) {
  return !ctx.chezClient && (maisonNeutre() || lireModulesMaison(modulesEcranBrut()).reglage);
}

function sectionModules(ctx) {
  // Maison d'un client (27/11/2026) : l'état vrai (reglages_maison/ecran.modules, déjà appliqué à `actifs`) ; le catalogue entier pour le seul titulaire
  // (compteReserve : comptes_jerome_seul, la même liste que pour la Console), les seuls modules allumés pour les autres comptes. Chez Jérôme et sur la plateforme : inchangé.
  const maison = dansUneMaison(ctx);
  const catalogue = maison && compteReserve(ctx.compte);
  const lignes = maison ? interrupteursDeLaMaison(ctx.actifs, { catalogue }) : interrupteursDuClient(ctx.actifs);
  const aide = maison
    ? (catalogue
      ? 'Tous les modules du catalogue, avec leur état dans cet espace. Toi seul vois cette liste complète : les autres comptes ne voient que les modules allumés.'
      : 'Les modules allumés dans cet espace.')
    : (ctx.chezClient
      ? 'Les modules allumés dans cet espace. Éteindre un module ne supprime aucune donnée.'
      : 'Ici tous les modules sont allumés : cet espace n’a pas d’interrupteur par module.');
  return [section('reglages-modules', 'Modules actifs', 'layout-dashboard',
    h('p', { class: 'aide', dataset: maison ? { role: catalogue ? 'modules-catalogue' : 'modules-allumes' } : {} }, aide),
    ctx.chezClient || (maison && !catalogue) ? h('p', { class: 'aide', dataset: { role: 'modules-administrateur' } }, 'Pour changer de module, contacte ton administrateur') : null,
    maison && !lignes.length ? h('p', { class: 'aide', dataset: { role: 'modules-aucun' } }, 'Aucun module n’est allumé dans cet espace pour l’instant.') : null,
    h('ul', { class: 'reglages-modules' }, lignes.map((l) => {
      const noms = l.modules.map((id) => moduleDeclare(id).nom).join(', ');
      const groupe = l.modules.length > 1 || moduleDeclare(l.modules[0]).nom !== l.libelle; // un bloc de plusieurs modules (Achats) : on dit lesquels, même s'il n'en reste qu'un d'allumé
      const etat = l.actif ? 'Allumé' : 'Éteint';
      return h('li', { class: 'reglages-module-ligne', dataset: { module: l.id } },
        h('label', { class: 'case' },
          h('input', { type: 'checkbox', role: 'switch', checked: l.actif, disabled: true, dataset: { interrupteur: l.id }, 'aria-label': `${l.libelle} : ${etat.toLowerCase()}` }),
          h('strong', {}, l.libelle)),
        h('span', { class: 'aide', dataset: { role: 'modules-du-bloc' } }, groupe ? `${noms}${l.actif && !l.complet ? ' (une partie seulement est allumée)' : ''}` : ''),
        h('span', { class: `badge${l.actif ? ' badge-actif' : ''}` }, etat));
    })))];
}

const SECTIONS_ESPACE_RENDU = { espace: sectionEspace, membres: sectionMembres, modules: sectionModules, deploiement: (ctx, etat) => [sectionDeploiement(ctx, etat)], tests: (ctx, etat) => [sectionMesTests(ctx, etat)], base: (ctx, etat) => [sectionConnexionBase(ctx, etat)] };

// ---------------------------------------------------------------- réglages d'un module (ou d'un groupe de modules)

/** Sections d'un bloc de module : celles que ses modules ajoutent à `page`, rangées dans l'ordre déclaré par le registre. */
function sectionsDuModule(item, ctx, arrets) {
  const tampon = h('div', {});
  for (const idModule of item.modules) {
    const api = ctx.apis.get(idModule);
    const arret = api?.reglages?.(tampon, { chezClient: ctx.chezClient, compte: ctx.compte, lecture: !ctx.editeur, actifs: ctx.actifs });
    if (typeof arret === 'function') arrets.push(arret);
  }
  const rang = (el) => { const i = item.sections.findIndex((s) => s.id === el.id); return i === -1 ? item.sections.length : i; };
  return [...tampon.children].map((el, i) => ({ el, i })).sort((a, b) => rang(a.el) - rang(b.el) || a.i - b.i).map((x) => x.el);
}

/** Amène une section à l'écran ; si elle est rangée dans un bloc replié (ex. « Sauvegardes séparées » des Achats), on l'ouvre d'abord. */
function amenerSection(cible, options) {
  if (!cible) return;
  cible.closest('details')?.setAttribute('open', '');
  cible.scrollIntoView(options);
}

/** Raccourcis vers les sections d'une longue page (le CRM en a une douzaine) ; une section masquée (option éteinte) n'a pas de raccourci.
 *  Un bloc qui n'est pas une section peut aussi avoir son raccourci (attribut `data-raccourci`, déclaré dans le registre comme une section) ;
 *  l'attribut `data-alerte` ajoute un petit point rouge au raccourci (« il manque quelque chose » dans ce bloc). */
function raccourcis(item, zone) {
  const barre = h('nav', { class: 'reglages-raccourcis', 'aria-label': 'Dans cette page' });
  let signature = null;
  const maj = () => {
    const visibles = [...zone.querySelectorAll('section.carte-section[id], [data-raccourci][id]')].filter((el) => !el.hidden && !el.parentElement?.closest('details')); // une section rangée dans un bloc replié (ex. « Sauvegardes séparées » des Achats) n'a pas de raccourci
    const lignes = visibles.map((el) => ({ id: el.id, titre: item.sections.find((s) => s.id === el.id)?.libelle ?? el.querySelector('h2')?.textContent ?? el.id, alerte: el.hasAttribute('data-alerte') }));
    barre.hidden = visibles.length < 3;
    const nouvelle = JSON.stringify(lignes);
    if (nouvelle === signature) return; // rien n'a changé pour la barre (ex. une frappe dans un champ) : on ne recrée pas les boutons, le focus reste
    signature = nouvelle;
    remplir(barre, ...lignes.map((l) => h('button', { type: 'button', class: 'reglages-raccourci', dataset: { vers: l.id },
      onclick: () => amenerSection(zone.querySelector(`[id="${CSS.escape(l.id)}"]`), { behavior: 'smooth', block: 'start' }) }, l.titre, // la section est relue à chaque clic : elle peut avoir été redessinée
    l.alerte ? h('span', { class: 'reglages-raccourci-alerte', dataset: { role: 'alerte-raccourci' } }, h('span', { class: 'sr-only' }, ' (à compléter)')) : null)));
  };
  maj();
  const observateur = typeof MutationObserver === 'function' ? new MutationObserver(maj) : null;
  observateur?.observe(zone, { attributes: true, attributeFilter: ['hidden', 'data-alerte'], subtree: true, childList: true });
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
 * `ctx` : { apis: Map(id -> api), actifs: [ids], chezClient, client (identifiant), nomEspace, marque, fiche, compte, editeur, surMarque(marque) (nouvelle marque enregistrée), surDeconnexion,
 *   retourVillage (route de l'accueil village, ou null : lien « Retour au village » en haut de la page, sur toutes les sections ; jamais sur la plateforme des clients) }.
 */
export function monterReglages(conteneur, segs, ctx) {
  arreterCourant();
  const editeur = ctx.editeur !== false && compteEcrit(ctx.compte);
  const c = { ...ctx, editeur, nomEspace: ctx.chezClient ? ctx.nomEspace : nomEspaceRacine(ctx.nomEspace) }; // maison d'un client : son nom, jamais « Chevalier IA OS »
  const items = reglagesDesModules(c.actifs);
  // « Connexion à la base » : Jérôme seul, à la racine. Maison d'un client, compte non titulaire : ni Déploiement, ni Mes tests, ni Connexion à la base (« Modules actifs » reste visible : ses seuls modules allumés)
  // (une adresse cachée tapée à la main ramène à « Mon espace », comme toute section inconnue). Plateforme des clients (chezClient) : inchangé.
  const espaces = sectionsEspaceVisibles({ chezClient: !!c.chezClient, editeur, jerome: compteReserve(c.compte), techniques: !!c.chezClient || !pagesTechniquesCachees(c.compte) });
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
    c.retourVillage ? h('a', { class: 'bouton bouton-discret reglages-retour-village', href: lien(c.retourVillage), dataset: { action: 'retour-village' } }, icone('chevron-left', { taille: 16 }), 'Retour au village') : null,
    h('header', { class: 'page-tete page-tete-reglages' }, h('div', {}, h('p', { class: 'etiquette', dataset: { nomEspace: '' } }, c.nomEspace), h('h1', {}, 'Réglages'))),
    h('div', { class: 'reglages-corps' }, menu, contenu)));

  // Adresse #/reglages/<module>/<id d'une section> : on amène cette section à l'écran (même défilement que les raccourcis).
  const versSection = cible.type === 'module' ? segs[2] : null;
  if (versSection) setTimeout(() => amenerSection(contenu.querySelector(`[id="${CSS.escape(versSection)}"]`), { block: 'start' }), 0);

  courant = { arreter: () => { arrets.forEach((f) => f()); } };
  return arreterCourant;
}
