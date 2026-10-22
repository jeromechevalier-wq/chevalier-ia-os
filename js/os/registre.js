// Registre des modules de la plateforme (chantier 7) : ce que chaque module DÉCLARE (nom, écrans, collections de données, outils MCP,
// dépendances) et comment on décide quels modules sont ACTIFS chez un client. Ce fichier n'importe rien (ni Firebase, ni DOM) : il se teste seul.
//
// Les modules actifs d'un client sont lus dans le document `clients/<client>`, champ `modules` : { affaires: true, projets: false }.
//  - champ absent, vide ou illisible : AUCUN module actif (le client voit seulement l'accueil provisoire) ;
//  - un module absent de l'objet, ou à autre chose que `true`, est inactif ;
//  - un module actif dont la dépendance est inactive est REFUSÉ (ex. projets sans affaires) : il n'est pas activé, l'erreur est donnée.
// Le CRM de Jérôme (racine) n'utilise rien de tout cela : il garde tous les modules (js/os/modules.js).
//
// Renommage « journal » -> « automatisations » (module n8n, 16/10/2026) : les fiches client déjà activées avec `journal: true` continuent de
// marcher (voir ANCIENS_IDENTIFIANTS ; la nouvelle clé gagne si les deux sont présentes) et les anciennes adresses `journal/…` sont redirigées
// (voir ANCIENS_PREFIXES). Aucune donnée n'est déplacée : les collections gardent leurs noms (workflows, executions, sync).
// Ne pas confondre avec l'écran « Journal » du CRM (route crm/journal, historique des modifications), qui garde son nom.
//
// Menu CRM unique (« méthode A », 2.6.0) : l'interface ne montre qu'UN groupe « CRM » (Accueil, Personnes, Organisations, Affaires, Projets, Journal, Archives).
// Techniquement `affaires` et `projets` restent deux modules (routes #/crm/… et #/projets/… inchangées : aucun signet ne casse) ; la déclaration `groupe: 'crm'`
// et GROUPES_MENU les réunissent pour le menu et pour les Réglages. Chez un client, un seul interrupteur « crm » allume les deux (voir INTERRUPTEURS).
//
// Réglages à menu latéral (2.6.0) : chaque module déclare ici `reglages` (sections qu'il affiche, résumé s'il n'en a pas) ; la coque (js/os/reglages.js) en tire
// le menu de gauche sans connaître aucun module. Ajouter un module ou une section = une déclaration ici + l'écran dans le module (`reglages(page, ctx)`).
//
// Les outils MCP ne sont ici qu'une DÉCLARATION (liste de noms). Le serveur MCP multi-clients est le chantier 9 ; un test
// (tests/registre-mcp.test.js) vérifie que cette liste correspond exactement aux outils du serveur.

const geler = (o) => {
  if (o && typeof o === 'object') { Object.values(o).forEach(geler); Object.freeze(o); }
  return o;
};

/** Outils du serveur qui ne dépendent d'aucun module : toujours disponibles. */
export const OUTILS_COMMUNS = geler(['qui_suis_je']);

/**
 * Modules déclarés, dans l'ordre de démarrage (une dépendance vient toujours avant ce qui en dépend).
 *  id          : identifiant dans le champ `modules` d'un client ;
 *  nom         : nom montré à l'utilisateur ; libelleMenu / iconeMenu : titre du groupe dans le menu (« CRM » pour le CRM de Jérôme) ;
 *  prefixe     : premier morceau des routes du module (#/crm/…) ;
 *  ecrans      : { route, libelle, icone } ; collections : noms « nus » (sous clients/<client>/ chez un client) ;
 *  outilsMcp   : outils MCP du module (déclaration seulement) ; dependances : modules à activer avant celui-ci ;
 *  horsMenu    : `true` = le module n'a pas d'entrée dans le menu principal (il s'ouvre depuis le menu utilisateur) mais garde ses écrans et son interrupteur ;
 *                Tous les modules existent chez Jérôme comme chez les clients (décision du 18/10/2026) : plus de champ « réservé aux clients ».
 */
export const MODULES_DECLARES = geler([
  {
    id: 'affaires',
    nom: 'Affaires',
    libelleMenu: 'Affaires et projets',
    iconeMenu: 'users',
    prefixe: 'crm',
    groupe: 'crm',
    ecrans: [
      { route: 'crm/accueil', libelle: 'Accueil', icone: 'house' },
      { route: 'crm/personnes', libelle: 'Personnes', icone: 'user' },
      { route: 'crm/organisations', libelle: 'Organisations', icone: 'building-2' },
      { route: 'crm/affaires', libelle: 'Affaires', icone: 'briefcase' },
    ],
    // Le Journal des modifications (route crm/journal) n'est plus une entrée du menu principal (18/10/2026) : il s'ouvre depuis le menu utilisateur
    // (en bas à gauche). Sa route reste servie par le module (préfixe crm) et les signets marchent ; voir ROUTES_MENU_UTILISATEUR.
    // Sections de la page Réglages > CRM (id = identifiant de la section dans la page). La coque les range dans l'ordre de GROUPES_MENU.crm.ordreReglages.
    // Point d'accroche pour « Liens et documents » (Drive) : y ajouter { id: 'reglages-drive', libelle: '…' } et créer la section dans reglages() du module.
    reglages: {
      sections: [
        { id: 'reglages-etapes', libelle: 'Étapes des affaires' },
        { id: 'reglages-phases', libelle: 'Phases des projets' },
        { id: 'reglages-options', libelle: 'Options' },
        { id: 'reglages-modeles-affaire', libelle: 'Modèles d’affaires' },
        { id: 'reglages-objectifs', libelle: 'Objectifs du mois' },
        { id: 'reglages-offres', libelle: 'Offres' },
        { id: 'reglages-secteurs', libelle: 'Secteurs' },
        { id: 'reglages-sources', libelle: 'Sources' },
        { id: 'reglages-etiquettes', libelle: 'Étiquettes' },
        { id: 'reglages-filtres', libelle: 'Filtres enregistrés' },
        { id: 'reglages-debut', libelle: 'Début d’activité' },
        { id: 'reglages-projets', libelle: 'Google Drive : dossiers de projets' },
        { id: 'reglages-export', libelle: 'Sauvegarde' },
      ],
    },
    collections: ['crm_personnes', 'crm_organisations', 'crm_affaires', 'crm_activites', 'crm_notes', 'crm_evenements', 'crm_parametres'],
    outilsMcp: [
      'chercher', 'lire_personne', 'lire_organisation', 'lire_affaire', 'lister_affaires', 'lister_activites', 'lister_documents', 'lire_reglages', 'lire_audit',
      'creer_personne', 'creer_organisation', 'creer_affaire', 'creer_activite', 'ajouter_note', 'joindre_lien',
      'modifier_personne', 'modifier_organisation', 'modifier_affaire', 'modifier_note', 'changer_etape', 'terminer_activite',
      'marquer_perdue', 'rouvrir_affaire', 'retirer_document',
      'supprimer_personne', 'supprimer_organisation', 'supprimer_affaire', 'supprimer_activite', 'supprimer_note', 'restaurer_depuis_audit',
    ],
    dependances: [],
  },
  {
    id: 'projets',
    nom: 'Projets',
    libelleMenu: 'Projets',
    iconeMenu: 'folder-kanban',
    prefixe: 'projets',
    groupe: 'crm',
    ecrans: [
      { route: 'projets/projets', libelle: 'Projets', icone: 'folder-kanban' },
    ],
    reglages: { sections: [{ id: 'reglages-modeles-projets', libelle: 'Modèles de projets' }] },
    collections: ['projets_projets', 'projets_taches', 'projets_modeles'],
    outilsMcp: [
      'lister_projets', 'lire_projet', 'lister_modeles_projet',
      'creer_projet', 'creer_projet_depuis_affaire', 'modifier_projet', 'ajouter_livrable_projet', 'terminer_livrable_projet', 'changer_phase_projet',
      'terminer_projet', 'rouvrir_projet', 'archiver_projet',
      'ajouter_facture', 'marquer_facture_payee', 'abandonner_facture', 'supprimer_projet',
    ],
    dependances: ['affaires'],
  },
  {
    // Veille (étape 1, lecture seule) : sources suivies, contenus détectés (vidéos, épisodes, articles) et résumés produits.
    // Les trois tables suivent la règle `module_table`. Elles sont remplies par les workflows n8n (la « porte » viendra à l'étape 2).
    // Pour l'instant seul le CRM de Jérôme (base 1) s'en sert ; un client ne la voit que si Jérôme l'active dans sa fiche.
    id: 'veille',
    nom: 'Veille',
    libelleMenu: 'Veille',
    iconeMenu: 'globe',
    prefixe: 'veille',
    reglages: { sections: [], resume: 'La veille se lit : ses sources sont suivies par les workflows n8n. Aucun réglage à faire ici pour l’instant.' },
    ecrans: [
      { route: 'veille/contenus', libelle: 'Contenus', icone: 'file-text' },
      { route: 'veille/sources', libelle: 'Sources', icone: 'link' },
    ],
    collections: ['veille_sources', 'veille_contenus', 'veille_resumes', 'veille_pages'],
    outilsMcp: [],
    dependances: [],
  },
  {
    // Automatisations : historique des workflows n8n (chantier 14, anciennement le module « journal »). Présent chez Jérôme comme chez les clients.
    // Ses données (workflows, executions, sync) sont écrites par les fonctions du serveur seulement ; l'écran les lit.
    // Chez Jérôme (racine), rien ne les remplit encore (la copie de ses propres workflows n'est pas développée) : l'écran affiche un état vide.
    id: 'automatisations',
    nom: 'Automatisations',
    libelleMenu: 'Automatisations',
    iconeMenu: 'activity',
    prefixe: 'automatisations',
    reglages: { sections: [], resume: 'L’historique se lit : il est rempli par les workflows n8n. Aucun réglage à faire ici pour l’instant.' },
    ecrans: [
      { route: 'automatisations/historique', libelle: 'Historique', icone: 'activity' },
      { route: 'automatisations/a-valider', libelle: 'À valider', icone: 'inbox' }, // file des propositions des workflows (ajoutée APRÈS l'Historique : la première route du module ne change pas)
    ],
    collections: ['workflows', 'executions', 'sync'],
    outilsMcp: [],
    dependances: [],
  },
  {
    // Tableau de bord (étape 2 : écrans en lecture seule) : état des indicateurs de surveillance (clés, plus tard sauvegardes, finances, stocks).
    // Les indicateurs sont écrits par la porte des scripts de surveillance (tableaudebord_indicateurs) ; l'écran les lit. Les onglets Finance et Stocks
    // (routes tableaudebord/finance et tableaudebord/stocks) n'apparaissent que si un indicateur les porte : ils ne sont donc pas des entrées du menu.
    // Chez un client, il n'existe pas encore de porte qui écrit : le module s'affiche vide (attendu).
    id: 'tableaudebord',
    nom: 'Tableau de bord',
    libelleMenu: 'Tableau de bord',
    iconeMenu: 'layout-dashboard',
    prefixe: 'tableaudebord',
    reglages: { sections: [], resume: 'Le tableau de bord se lit : ses indicateurs sont écrits par les scripts de surveillance. Aucun réglage à faire ici pour l’instant.' },
    ecrans: [
      { route: 'tableaudebord/general', libelle: 'Général', icone: 'layout-dashboard' },
      { route: 'tableaudebord/technique', libelle: 'Technique', icone: 'shield-check' },
    ],
    collections: ['tableaudebord_indicateurs', 'tableaudebord_releves', 'tableaudebord_demandes'],
    outilsMcp: [],
    dependances: [],
  },
  {
    // Accès MCP (chantier 9 et 11) : un assistant (Claude, ChatGPT) se connecte à l'espace du client par un lien (…/mcp/<client>) et ses outils sont ceux des
    // modules actifs. Allumé ou éteint par client comme les autres modules ; éteint = le lien ne répond plus. Le module n'a qu'une page d'information
    // (lien à copier, mode d'emploi, membres et rôles, lien vers le Journal des modifications) : aucun réglage, aucune donnée à lui. Chez Jérôme (racine) la page
    // existe aussi (18/10/2026) : elle ne lit rien dans la base, elle donne l'adresse du MCP de Jérôme et le mode d'emploi de la connexion Google.
    // Elle s'ouvre depuis le menu utilisateur (« Connecter mon assistant »), pas depuis le menu principal.
    id: 'mcp',
    nom: 'Accès MCP',
    libelleMenu: 'Connecter mon assistant',
    iconeMenu: 'link',
    prefixe: 'mcp',
    horsMenu: true,
    reglages: { sections: [{ id: 'reglages-mcp', libelle: 'Connexion de l’assistant' }] },
    ecrans: [
      { route: 'mcp/infos', libelle: 'Connexion', icone: 'link' },
    ],
    collections: [],
    outilsMcp: [],
    dependances: [],
  },
]);

export const IDS_MODULES = geler(MODULES_DECLARES.map((m) => m.id));

/**
 * Groupes du menu : plusieurs modules techniques montrés comme UN seul bloc dans le menu et dans les Réglages.
 *  id / nom / libelleMenu / iconeMenu : le bloc (« CRM ») ; modules : modules techniques réunis, dans l'ordre de démarrage ;
 *  ordreMenu : routes des entrées du menu, dans l'ordre voulu (elles viennent des écrans des deux modules) ;
 *  sectionsMenu : routes regroupées en blocs du menu (une fine ligne sépare deux blocs non vides) ;
 *  ordreReglages : identifiants des sections de la page Réglages, dans l'ordre voulu (celles qui ne sont pas listées viennent à la fin).
 */
export const GROUPES_MENU = geler([
  {
    id: 'crm',
    nom: 'Affaires et projets',
    libelleMenu: 'Affaires et projets',
    iconeMenu: 'users',
    modules: ['affaires', 'projets'],
    ordreMenu: ['crm/accueil', 'crm/personnes', 'crm/organisations', 'crm/affaires', 'projets/projets'],
    // Blocs du menu séparés par une fine ligne (pas de titres de groupes, 18/10/2026) : Accueil | Personnes, Organisations | Affaires, Projets.
    // Une entrée qui n'est pas listée (module éteint) laisse simplement son bloc plus court ; un bloc vide disparaît avec sa ligne.
    sectionsMenu: [['crm/accueil'], ['crm/personnes', 'crm/organisations'], ['crm/affaires', 'projets/projets']],
    ordreReglages: [
      'reglages-etapes', 'reglages-phases', 'reglages-options', 'reglages-modeles-affaire', 'reglages-modeles-projets', 'reglages-objectifs',
      'reglages-offres', 'reglages-secteurs', 'reglages-sources', 'reglages-etiquettes', 'reglages-filtres', 'reglages-debut', 'reglages-projets', 'reglages-export',
    ],
  },
]);

/**
 * Interrupteurs : un seul nom (champ `modules` d'un client, outil « nouveau client ») qui allume ou éteint plusieurs modules techniques.
 * `crm: true` = `affaires` ET `projets`. Les identifiants techniques restent acceptés tels quels ; une valeur écrite pour un module précis
 * (affaires ou projets) l'emporte sur l'interrupteur (un client déjà réglé { affaires: true, projets: false } ne change pas).
 */
export const INTERRUPTEURS = geler({ crm: ['affaires', 'projets'] });

/** Identifiants techniques derrière un nom d'interrupteur ou de module : « crm » -> [affaires, projets] ; « veille » -> [veille] ; inconnu -> [tel quel]. */
export function modulesDeNom(nom) {
  return Object.prototype.hasOwnProperty.call(INTERRUPTEURS, nom) ? [...INTERRUPTEURS[nom]] : [identifiantActuel(nom)];
}

/** Groupe de menu d'un module technique (objet de GROUPES_MENU), ou null s'il forme son propre bloc. */
export function groupeDuModule(idModule) {
  const g = GROUPES_MENU.find((x) => x.modules.includes(idModule));
  return g ?? null;
}

/** Anciens identifiants de modules -> identifiant actuel (champ `modules` des fiches client écrites avant le renommage). */
export const ANCIENS_IDENTIFIANTS = geler({ journal: 'automatisations' });
/** Anciens premiers segments de route -> segment actuel (signets et liens écrits avant le renommage). */
export const ANCIENS_PREFIXES = geler({ journal: 'automatisations' });

/** Identifiant actuel d'un module à partir d'un identifiant ancien ou actuel (inconnu : renvoyé tel quel). */
export function identifiantActuel(id) {
  return Object.prototype.hasOwnProperty.call(ANCIENS_IDENTIFIANTS, id) ? ANCIENS_IDENTIFIANTS[id] : id;
}

/** Route écrite avec un ancien préfixe (journal/historique) -> route actuelle (automatisations/historique) ; sinon renvoyée telle quelle. */
export function routeModernisee(route) {
  const morceaux = String(route ?? '').split('/');
  const premier = morceaux[0];
  if (!Object.prototype.hasOwnProperty.call(ANCIENS_PREFIXES, premier)) return route;
  return [ANCIENS_PREFIXES[premier], ...morceaux.slice(1)].join('/');
}

/** Déclaration d'un module par son identifiant, ou null. */
export function moduleDeclare(id) {
  return MODULES_DECLARES.find((m) => m.id === id) ?? null;
}

/** Déclaration du module qui gère les routes commençant par ce segment (crm, projets…), ou null. */
export function moduleDeRoute(segment) {
  return MODULES_DECLARES.find((m) => m.prefixe === segment) ?? null;
}

/**
 * Lit le champ `modules` d'une fiche client et le range : { demandes, erreurs }.
 * `demandes` = identifiants connus mis à `true` ; les identifiants inconnus et les valeurs autres que `true` sont ignorés
 * (une inconnue est signalée dans `erreurs`, pas une valeur à `false`).
 */
export function lireModulesDemandes(fiche) {
  const brut = fiche && typeof fiche === 'object' ? fiche.modules : undefined;
  const erreurs = [];
  if (brut === undefined || brut === null) return { demandes: [], erreurs };
  if (typeof brut !== 'object' || Array.isArray(brut)) {
    return { demandes: [], erreurs: ['Le champ « modules » doit être un objet, par exemple { affaires: true, projets: false }.'] };
  }
  for (const cle of Object.keys(brut)) {
    if (!IDS_MODULES.includes(cle) && !Object.prototype.hasOwnProperty.call(ANCIENS_IDENTIFIANTS, cle) && !Object.prototype.hasOwnProperty.call(INTERRUPTEURS, cle)) erreurs.push(`Module inconnu : « ${cle} ».`);
  }
  // Migration douce : un ancien identifiant à `true` active le module actuel, sauf si la fiche dit déjà autre chose pour le nouveau (true ou false).
  const effectif = (id) => {
    const valeur = brut[id];
    if (valeur !== undefined && valeur !== null) return valeur;
    if (Object.entries(ANCIENS_IDENTIFIANTS).some(([ancien, actuel]) => actuel === id && brut[ancien] === true)) return true;
    // Interrupteur « crm » : à `true`, il allume affaires et projets, sauf si la fiche dit déjà autre chose pour le module précis.
    if (Object.entries(INTERRUPTEURS).some(([nom, ids]) => ids.includes(id) && brut[nom] === true)) return true;
    return valeur;
  };
  return { demandes: IDS_MODULES.filter((id) => effectif(id) === true), erreurs };
}

/**
 * Vérifie une liste de modules demandés. Renvoie { ok, actifs, erreurs } :
 * `actifs` = ceux qui peuvent vraiment être activés (dans l'ordre de démarrage) ; `erreurs` = pourquoi les autres sont refusés.
 * Un module dont une dépendance n'est pas active est refusé (et ceux qui en dépendent, en cascade).
 */
export function verifierActivation(demandes) {
  const demandes_ = new Set(demandes);
  const actifs = [];
  const erreurs = [];
  for (const m of MODULES_DECLARES) {
    if (!demandes_.has(m.id)) continue;
    const manquantes = m.dependances.filter((d) => !actifs.includes(d));
    if (manquantes.length) {
      const noms = manquantes.map((d) => moduleDeclare(d).nom).join(', ');
      erreurs.push(`Le module « ${m.nom} » ne peut pas être activé sans : ${noms}.`);
    } else {
      actifs.push(m.id);
    }
  }
  return { ok: erreurs.length === 0, actifs, erreurs };
}

/** Modules actifs d'un client d'après sa fiche `clients/<client>` (peut être null) : { actifs, erreurs }. Aucun champ = aucun module actif. */
export function modulesActifsDuClient(fiche) {
  const lu = lireModulesDemandes(fiche);
  const v = verifierActivation(lu.demandes);
  return { actifs: v.actifs, erreurs: [...lu.erreurs, ...v.erreurs] };
}

/** Le module de cette route (premier morceau) est-il actif ? Une route sans module connu, ou d'un module inactif, est introuvable. */
export function moduleAccessible(segment, actifs) {
  const m = moduleDeRoute(segment);
  return Boolean(m) && actifs.includes(m.id);
}

/** Premier écran à ouvrir pour un client : le premier écran du premier module actif, ou null s'il n'y en a aucun. */
export function premiereRoute(actifs) {
  const m = MODULES_DECLARES.find((x) => actifs.includes(x.id));
  return m ? m.ecrans[0].route : null;
}

/** Toutes les routes d'écran des modules actifs (pour le menu et les tests). */
export function ecransActifs(actifs) {
  return MODULES_DECLARES.filter((m) => actifs.includes(m.id)).flatMap((m) => m.ecrans);
}

// ---------------------------------------------------------------- menu (blocs) et Réglages (méthode A, 2.6.0)

/**
 * Blocs du menu pour les modules actifs : [{ id, libelle, icone, modules, entrees: [{ chemin, libelle, icone }], sections: [[entrée…]] }], dans l'ordre de démarrage.
 * `entrees` contient tous les écrans du bloc (une entrée « horsMenu » porte l'indicateur) ; `sections` ne contient que ce que le menu principal montre. Un bloc sans section n'a pas de place dans le menu.
 * Les modules d'un même groupe (GROUPES_MENU) ne forment qu'un bloc ; les autres ont chacun le leur. Un bloc sans module actif n'existe pas.
 */
export function blocsDuMenu(actifs) {
  const blocs = [];
  for (const m of MODULES_DECLARES) {
    if (!actifs.includes(m.id)) continue;
    const groupe = groupeDuModule(m.id);
    const id = groupe ? groupe.id : m.id;
    let bloc = blocs.find((b) => b.id === id);
    if (!bloc) {
      bloc = { id, libelle: groupe ? groupe.libelleMenu : m.libelleMenu, icone: groupe ? groupe.iconeMenu : m.iconeMenu, modules: [], entrees: [] };
      blocs.push(bloc);
    }
    bloc.modules.push(m.id);
    bloc.entrees.push(...m.ecrans.map((e) => ({ chemin: e.route, libelle: e.libelle, icone: e.icone, ...(m.horsMenu ? { horsMenu: true } : {}) })));
  }
  for (const bloc of blocs) {
    const groupe = GROUPES_MENU.find((g) => g.id === bloc.id);
    if (groupe?.ordreMenu) bloc.entrees.sort((a, b) => rangOu(groupe.ordreMenu, a.chemin) - rangOu(groupe.ordreMenu, b.chemin));
    // Blocs séparés par une ligne : ceux de sectionsMenu, puis les entrées non listées ; les écrans « horsMenu » n'y sont pas et un bloc vide n'existe pas.
    const visibles = bloc.entrees.filter((e) => !e.horsMenu);
    const listes = groupe?.sectionsMenu ? [...groupe.sectionsMenu.map((routes) => visibles.filter((e) => routes.includes(e.chemin))),
      visibles.filter((e) => !groupe.sectionsMenu.some((routes) => routes.includes(e.chemin)))] : [visibles];
    bloc.sections = listes.filter((l) => l.length);
  }
  return blocs;
}

function rangOu(liste, valeur) {
  const i = liste.indexOf(valeur);
  return i === -1 ? liste.length : i;
}

/**
 * Éléments du menu de la page Réglages, un par bloc de module actif (CRM, Veille, Automatisations, Accès MCP…) :
 * [{ id, libelle, icone, modules, resume, sections: [{ id, libelle, module }], ouvrir }]. `resume` = texte montré quand le bloc n'a aucune section ; `ouvrir` = route de son premier écran.
 */
export function reglagesDesModules(actifs) {
  return blocsDuMenu(actifs).map((bloc) => {
    const groupe = GROUPES_MENU.find((g) => g.id === bloc.id);
    const sections = bloc.modules.flatMap((idModule) => (moduleDeclare(idModule).reglages?.sections ?? []).map((s) => ({ ...s, module: idModule })));
    if (groupe?.ordreReglages) sections.sort((a, b) => rangOu(groupe.ordreReglages, a.id) - rangOu(groupe.ordreReglages, b.id));
    const resume = bloc.modules.map((id) => moduleDeclare(id).reglages?.resume).find(Boolean) ?? '';
    return { id: bloc.id, libelle: bloc.libelle, icone: bloc.icone, modules: bloc.modules, resume, sections, ouvrir: bloc.entrees[0]?.chemin ?? null };
  });
}

/**
 * Réglages de l'ESPACE (la coque), montrés avant ceux des modules :
 *  espace  : nom, logo, couleur et thème de l'appareil (tout le monde) ;
 *  membres : qui a accès et avec quel rôle (éditeurs seulement, chez un client) ;
 *  modules : modules allumés (éditeurs seulement ; chez Jérôme, tous le sont).
 * `editeursSeulement` : un lecteur ne voit pas la section (adresse introuvable). `clientSeulement` : n'existe pas à la racine.
 */
export const SECTIONS_ESPACE = geler([
  { id: 'espace', libelle: 'Mon espace', icone: 'house', editeursSeulement: false, clientSeulement: false },
  { id: 'membres', libelle: 'Membres et rôles', icone: 'users', editeursSeulement: true, clientSeulement: true },
  { id: 'modules', libelle: 'Modules actifs', icone: 'layout-dashboard', editeursSeulement: true, clientSeulement: false },
]);

/** Sections d'espace visibles : `chezClient` (plateforme) ou racine ; `editeur` = le compte peut écrire (à la racine, toujours vrai). */
export function sectionsEspaceVisibles({ chezClient, editeur }) {
  return SECTIONS_ESPACE.filter((s) => (chezClient || !s.clientSeulement) && (editeur || !s.editeursSeulement));
}

/** Interrupteurs montrés dans « Modules actifs » : un par bloc du menu (CRM = affaires + projets), allumé si son premier module l'est. */
export function interrupteursDuClient(actifs) {
  const vus = new Set();
  const lignes = [];
  for (const m of MODULES_DECLARES) {
    const groupe = groupeDuModule(m.id);
    const id = groupe ? groupe.id : m.id;
    if (vus.has(id)) continue;
    vus.add(id);
    const ids = groupe ? groupe.modules : [m.id];
    lignes.push({ id, libelle: groupe ? groupe.nom : m.nom, modules: ids, actif: actifs.includes(ids[0]), complet: ids.every((x) => actifs.includes(x)) });
  }
  return lignes;
}

/** Route des Réglages (sans préfixe) -> { type: 'espace' | 'module', id } ; page d'arrivée (aucun identifiant) : première section d'espace. */
export function cibleReglages(segs, { espaces, modules }) {
  const id = segs[0] === 'reglages' ? segs[1] : undefined;
  if (!id) return espaces.length ? { type: 'espace', id: espaces[0].id } : (modules.length ? { type: 'module', id: modules[0].id } : null);
  if (espaces.some((s) => s.id === id)) return { type: 'espace', id };
  if (modules.some((m) => m.id === id)) return { type: 'module', id };
  return null;
}
