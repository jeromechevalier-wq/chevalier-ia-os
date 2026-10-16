// Registre des modules de la plateforme (chantier 7) : ce que chaque module DÉCLARE (nom, écrans, collections de données, outils MCP,
// dépendances) et comment on décide quels modules sont ACTIFS chez un client. Ce fichier n'importe rien (ni Firebase, ni DOM) : il se teste seul.
//
// Les modules actifs d'un client sont lus dans le document `clients/<client>`, champ `modules` : { affaires: true, projets: false }.
//  - champ absent, vide ou illisible : AUCUN module actif (le client voit seulement l'accueil provisoire) ;
//  - un module absent de l'objet, ou à autre chose que `true`, est inactif ;
//  - un module actif dont la dépendance est inactive est REFUSÉ (ex. projets sans affaires) : il n'est pas activé, l'erreur est donnée.
// Le CRM de Jérôme (racine) n'utilise rien de tout cela : il garde tous les modules (js/os/modules.js).
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
 *  reserveAuxClients : `true` = module réservé aux clients de la plateforme, absent du CRM de Jérôme (champ absent = présent partout).
 */
export const MODULES_DECLARES = geler([
  {
    id: 'affaires',
    nom: 'Affaires',
    libelleMenu: 'CRM',
    iconeMenu: 'users',
    prefixe: 'crm',
    ecrans: [
      { route: 'crm/accueil', libelle: 'Accueil', icone: 'house' },
      { route: 'crm/personnes', libelle: 'Personnes', icone: 'user' },
      { route: 'crm/organisations', libelle: 'Organisations', icone: 'building-2' },
      { route: 'crm/affaires', libelle: 'Affaires', icone: 'briefcase' },
      { route: 'crm/journal', libelle: 'Journal', icone: 'history' },
    ],
    collections: ['crm_personnes', 'crm_organisations', 'crm_affaires', 'crm_activites', 'crm_notes', 'crm_evenements', 'crm_parametres'],
    outilsMcp: [
      'chercher', 'lire_personne', 'lire_organisation', 'lire_affaire', 'lister_affaires', 'lister_activites', 'lister_documents', 'lire_reglages', 'lire_audit',
      'creer_personne', 'creer_organisation', 'creer_affaire', 'creer_activite', 'ajouter_note', 'joindre_lien',
      'modifier_personne', 'modifier_organisation', 'modifier_affaire', 'modifier_note', 'changer_etape', 'terminer_activite',
      'marquer_perdue', 'mettre_en_pause', 'rouvrir_affaire', 'retirer_document',
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
    ecrans: [
      { route: 'projets/projets', libelle: 'Projets', icone: 'folder-kanban' },
      { route: 'projets/archives', libelle: 'Archives', icone: 'archive' },
    ],
    collections: ['projets_projets', 'projets_taches', 'projets_modeles'],
    outilsMcp: [
      'lister_projets', 'lire_projet', 'lister_modeles_projet', 'extraire_valeur_projet',
      'creer_projet', 'creer_projet_depuis_affaire', 'modifier_projet', 'ajouter_tache_projet', 'terminer_tache_projet', 'changer_phase_projet',
      'mettre_projet_en_pause', 'reprendre_projet', 'terminer_projet', 'rouvrir_projet', 'archiver_projet',
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
    ecrans: [
      { route: 'veille/contenus', libelle: 'Contenus', icone: 'file-text' },
      { route: 'veille/sources', libelle: 'Sources', icone: 'link' },
    ],
    collections: ['veille_sources', 'veille_contenus', 'veille_resumes'],
    outilsMcp: [],
    dependances: [],
  },
  {
    // Journal d'activité des workflows n8n (chantier 14). Réservé aux clients de la plateforme : le CRM de Jérôme ne le montre pas (reserveAuxClients: true).
    // Ses données (workflows, executions, sync) sont écrites par les fonctions du serveur seulement ; l'écran les lit.
    id: 'journal',
    nom: "Journal d'activité",
    libelleMenu: 'Automatisations',
    iconeMenu: 'activity',
    prefixe: 'journal',
    reserveAuxClients: true,
    ecrans: [
      { route: 'journal/historique', libelle: 'Historique', icone: 'activity' },
    ],
    collections: ['workflows', 'executions', 'sync'],
    outilsMcp: [],
    dependances: [],
  },
]);

export const IDS_MODULES = geler(MODULES_DECLARES.map((m) => m.id));

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
    if (!IDS_MODULES.includes(cle)) erreurs.push(`Module inconnu : « ${cle} ».`);
  }
  return { demandes: IDS_MODULES.filter((id) => brut[id] === true), erreurs };
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
