// Règles métier pures du module CRM (version 2.0) : aucune dépendance à Firebase ni au navigateur.
// Conventions :
//  - les champs "date" (date d'une activité, dateReveil) sont des chaînes "AAAA-MM-JJ"
//    (jour civil, sans fuseau) ; les heures sont "HH:MM" ; les mois "AAAA-MM" ;
//  - les champs "timestamp" sont des Timestamp Firestore (ou des Date côté tests) : versDate() lit les deux ;
//  - les fonctions qui modifient un document renvoient un "patch" (champs à écrire) et, quand il y a lieu,
//    la liste des événements du journal à ajouter ; c'est donnees.js qui écrit.

export const FUSEAU = 'Europe/Paris';
export const JOURS_RAPPEL_EXPORT = 30;
export const MAX_HISTORIQUE = 500;
export const MAX_SUGGESTIONS = 8;
export const MIN_LETTRES = 2;
export const VERSION_EXPORT = '2.0.0';

// ---------------------------------------------------------------- référentiels fixes

export const STATUTS = [
  { id: 'ouverte', libelle: 'Ouverte', couleur: '#b98ee0' },
  { id: 'gagnee', libelle: 'Gagnée', couleur: '#ecbc06' },
  { id: 'perdue', libelle: 'Perdue', couleur: '#8d8993' },
  { id: 'en_pause', libelle: 'En pause', couleur: '#8a9bb4' },
];

export const TYPES_CONTACT = [
  { id: 'travail', libelle: 'Travail' },
  { id: 'perso', libelle: 'Perso' },
  { id: 'autre', libelle: 'Autre' },
];

export const TYPES_ACTIVITE = [
  { id: 'appel', libelle: 'Appel', titre: 'Appel' },
  { id: 'rendez_vous', libelle: 'Rendez vous', titre: 'Rendez vous' },
  { id: 'email', libelle: 'Email', titre: 'Email' },
  { id: 'tache', libelle: 'Tâche', titre: 'Tâche' },
];

export const TAILLES = ['Solo', '2 à 10', '11 à 50', 'Plus de 50'];

export const PRIORITES = [
  { id: 'chaud', libelle: 'Chaud' },
  { id: 'tiede', libelle: 'Tiède' },
  { id: 'froid', libelle: 'Froid' },
];

export const RAISONS_PERDUE = ['Prix', 'Pas le moment', 'Pas de besoin', 'Concurrent', 'Sans réponse', 'Autre'];

export const DATES_RAPIDES = [
  { id: 'demain', libelle: 'Demain', jours: 1 },
  { id: '3j', libelle: '+3 jours', jours: 3 },
  { id: '1sem', libelle: '+1 semaine', jours: 7 },
  { id: '2sem', libelle: '+2 semaines', jours: 14 },
];

export function libelleStatut(id) {
  return STATUTS.find((s) => s.id === id)?.libelle ?? id ?? '';
}
export function libellePriorite(id) {
  return PRIORITES.find((p) => p.id === id)?.libelle ?? id ?? '';
}
export function libelleTypeActivite(id) {
  return TYPES_ACTIVITE.find((t) => t.id === id)?.libelle ?? id ?? '';
}
export function libelleTypeContact(id) {
  return TYPES_CONTACT.find((t) => t.id === id)?.libelle ?? id ?? '';
}
export function libelleOffre(offres, id) {
  if (!id) return '';
  const o = (offres || []).find((x) => x.id === id);
  return o ? o.nom : id;
}
export function libelleEtiquette(etiquettes, id) {
  const e = (etiquettes || []).find((x) => x.id === id);
  return e ? e.nom : id;
}

// ---------------------------------------------------------------- configuration de l'espace : étapes de vente, phases de projet, options
//
// Les étapes de vente (affaires) et les phases de projet (projets) sont des EMPLACEMENTS FIXES : six, jamais plus, jamais moins. Chacun a un
// identifiant de stockage qui ne change jamais (c'est lui qui est écrit sur les fiches), un nom, une description (l'icône « i »), une couleur,
// et un état actif / désactivé. L'ordre est celui des emplacements. Un emplacement ne se désactive que s'il ne contient aucune fiche ; au moins
// MIN_ACTIFS restent actifs. Deux rôles sont portés par un emplacement actif au choix : « vente gagnée » (étapes) et « clôture » (phases).
// Chaque emplacement peut porter une « action suggérée » (jamais créée toute seule : l'écran demande d'accepter ou de refuser).
//
// Deux jeux de départ : NEUTRE (tout nouvel espace client) et JÉROME (la racine, dont les identifiants historiques restent valides : les fiches
// existantes gardent `premier_contact`, `gagne`, `lancement`, `cloture`…). Rien du jeu de Jérôme ne sert de défaut ailleurs.
// Écran ET serveur MCP lisent la même configuration (`construireConfig`) et la passent aux plans par `ctx.config`.

export const NB_EMPLACEMENTS = 6;
export const MIN_ACTIFS = 3;
export const COULEUR_NEUTRE = '#8d8993';
const LONGUEUR_MAX_NOM_EMPLACEMENT = 40;
const LONGUEUR_MAX_DESCRIPTION = 300;
const LONGUEUR_MAX_TITRE_ACTION = 120;
const DELAI_MAX_ACTION = 365;

const emplacement = (id, libelle, couleur, actif = true) => ({ id, libelle, description: '', couleur, actif, action: null });

export const ETAPES_NEUTRES = [
  emplacement('etape_1', 'Nouveau contact', '#8a9bb4'),
  emplacement('etape_2', 'Échange en cours', '#6aa6d8'),
  emplacement('etape_3', 'Proposition', '#b98ee0'),
  emplacement('etape_4', 'Négociation', '#fd6455'),
  emplacement('etape_5', 'Gagné', '#3fbf7f'),
  emplacement('etape_6', 'Étape 6', '#ecbc06', false),
];
export const PHASES_NEUTRES = [
  emplacement('phase_1', 'À démarrer', '#8a9bb4'),
  emplacement('phase_2', 'En cours', '#6aa6d8'),
  emplacement('phase_3', 'À valider', '#ecbc06'),
  emplacement('phase_4', 'Terminé', '#3fbf7f'),
  emplacement('phase_5', 'Phase 5', '#b98ee0', false),
  emplacement('phase_6', 'Phase 6', '#fd6455', false),
];

/** Valeurs historiques de Jérôme (version 2.3) : seulement pour la racine, jamais ailleurs. */
export const ETAPES_JEROME = [
  emplacement('premier_contact', 'Premier contact', '#b9adc9'),
  emplacement('rdv_fixe', 'Rendez vous fixé', '#e3cdee'),
  emplacement('proposition_envoyee', 'Proposition envoyée', '#b98ee0'),
  emplacement('gagne', 'Gagné', '#ecbc06'),
  emplacement('etape_5', 'Étape 5', '#8a9bb4', false),
  emplacement('etape_6', 'Étape 6', '#3fbf7f', false),
];
export const PHASES_JEROME = [
  emplacement('lancement', 'Lancement', '#b9adc9'),
  emplacement('decouverte', 'Découverte', '#b98ee0'),
  emplacement('livraison', 'Livraison', '#ecbc06'),
  emplacement('cloture', 'Clôture', '#3fbf7f'),
  emplacement('phase_5', 'Phase 5', '#8a9bb4', false),
  emplacement('phase_6', 'Phase 6', '#fd6455', false),
];

/** Options du CRM d'un espace (interrupteurs, stockés dans `crm_parametres/reglages`). */
export const OPTIONS_NEUTRES = Object.freeze({ suiviPaiements: false, clotureBloquee: true, extractionValeur: false, boutonsDepot: false, celebrations: false });
export const OPTIONS_JEROME = Object.freeze({ suiviPaiements: true, clotureBloquee: true, extractionValeur: true, boutonsDepot: true, celebrations: true });
export const CLES_OPTIONS = Object.freeze(Object.keys(OPTIONS_NEUTRES));

/** Membres auxquels une tâche peut être confiée à la racine (le CRM de Jérôme n'a pas de liste de membres : c'est Jérôme et Charles). */
export const MEMBRES_JEROME = Object.freeze([
  Object.freeze({ id: 'jerome', libelle: 'Jérôme', email: 'jerome.chevalier@gmail.com' }),
  Object.freeze({ id: 'charles', libelle: 'Charles', email: 'jeromebot.chevalierbot@gmail.com' }),
]);

/** Anciens réglages « Compte GitHub » et « Dossier Projets du Mac » : gardés tels quels dans la base (aucune perte), plus affichés ni utilisés depuis le chantier « Liens et documents ». */
export const PROPRIETAIRE_GITHUB_JEROME = 'jeromechevalier-wq';
export const CHEMIN_PROJETS_JEROME = '~/Library/CloudStorage/GoogleDrive-jerome.chevalier@gmail.com/Mon Drive/Chevalier-AI/Projets';
export const IMAGE_CELEBRATION_JEROME = 'assets/charles-portrait.png';

export const REGLAGES_NEUTRES = Object.freeze({
  debutActivite: null,
  dernierExport: null,
  dernierExportContacts: null,
  proprietaireGithub: '',
  cheminProjets: '',
  dossierParentDrive: null, // { id, nom } : le dossier Google Drive où « Créer le répertoire » range les dossiers de projets (choisi avec la fenêtre Google)
  sousDossiersDrive: [], // noms des sous-dossiers créés dans chaque dossier de projet
  ...OPTIONS_NEUTRES,
  prenomCelebration: '',
  imageCelebration: '',
});
export const REGLAGES_JEROME = Object.freeze({
  ...REGLAGES_NEUTRES,
  debutActivite: '2026-10',
  proprietaireGithub: PROPRIETAIRE_GITHUB_JEROME,
  cheminProjets: CHEMIN_PROJETS_JEROME,
  ...OPTIONS_JEROME,
  prenomCelebration: 'Jérôme',
  imageCelebration: IMAGE_CELEBRATION_JEROME,
});

export const CONFIG_NEUTRE = Object.freeze({
  etapes: ETAPES_NEUTRES, roleGagnee: 'etape_5', phases: PHASES_NEUTRES, roleCloture: 'phase_4',
  options: OPTIONS_NEUTRES, debutActivite: null, membres: Object.freeze([]),
});
export const CONFIG_JEROME = Object.freeze({
  etapes: ETAPES_JEROME, roleGagnee: 'gagne', phases: PHASES_JEROME, roleCloture: 'cloture',
  options: OPTIONS_JEROME, debutActivite: '2026-10', membres: MEMBRES_JEROME,
});

export const configDe = (x) => x?.config ?? (x?.etapes ? x : CONFIG_NEUTRE);

const texteBorne = (v, max) => nettoyerEspaces(v).slice(0, max);
const couleurValide = (c) => (/^#[0-9a-fA-F]{6}$/.test(String(c ?? '')) ? c : null);

function actionNormalisee(a, genre) {
  if (!a || typeof a !== 'object') return null;
  const titre = texteBorne(a.titre, LONGUEUR_MAX_TITRE_ACTION);
  if (!titre) return null;
  const delai = Number(a.delaiJours);
  const action = { titre, delaiJours: Number.isInteger(delai) && delai >= 0 && delai <= DELAI_MAX_ACTION ? delai : 0 };
  if (genre === 'etape') action.type = TYPES_ACTIVITE.some((t) => t.id === a.type) ? a.type : 'tache';
  return action;
}

/** Les six emplacements d'une liste enregistrée, complétés par ceux de départ : toujours six, dans l'ordre, avec les identifiants fixes. */
function emplacementsNormalises(stockes, depart, genre) {
  const liste = Array.isArray(stockes) ? stockes : [];
  return depart.map((d, i) => {
    const s = liste[i] && typeof liste[i] === 'object' ? liste[i] : {};
    return {
      id: d.id,
      libelle: texteBorne(s.libelle, LONGUEUR_MAX_NOM_EMPLACEMENT) || d.libelle,
      description: texteBorne(s.description, LONGUEUR_MAX_DESCRIPTION),
      couleur: couleurValide(s.couleur) ?? d.couleur,
      actif: typeof s.actif === 'boolean' ? s.actif : d.actif,
      action: actionNormalisee(s.action, genre),
    };
  });
}

/** Identifiants de départ des six emplacements d'étapes / de phases pour la racine ou un espace client. */
const departEtapes = (racine) => (racine ? ETAPES_JEROME : ETAPES_NEUTRES);
const departPhases = (racine) => (racine ? PHASES_JEROME : PHASES_NEUTRES);

function roleValide(role, items, defaut) {
  if (items.some((e) => e.id === role && e.actif)) return role;
  if (items.some((e) => e.id === defaut && e.actif)) return defaut;
  return [...items].reverse().find((e) => e.actif)?.id ?? items[0].id;
}

/**
 * Configuration effective d'un espace, lue dans ses documents de paramètres.
 *  docs : { etapes, phases, reglages } (les documents de crm_parametres, ou rien) ; racine : true pour le CRM de Jérôme (valeurs historiques),
 *  false pour un espace client (valeurs neutres) ; membres : [{ id, libelle, email }] des membres à qui une tâche peut être confiée.
 * Un document absent ou incomplet se complète par les valeurs de départ de l'espace : l'écran et le serveur MCP obtiennent la même chose.
 */
export function construireConfig(docs = {}, { racine = false, membres = null } = {}) {
  const base = racine ? CONFIG_JEROME : CONFIG_NEUTRE;
  const etapes = emplacementsNormalises(docs.etapes?.items, departEtapes(racine), 'etape');
  const phases = emplacementsNormalises(docs.phases?.items, departPhases(racine), 'phase');
  const options = { ...base.options };
  for (const cle of CLES_OPTIONS) if (typeof docs.reglages?.[cle] === 'boolean') options[cle] = docs.reglages[cle];
  return {
    etapes, roleGagnee: roleValide(docs.etapes?.roleGagnee, etapes, base.roleGagnee),
    phases, roleCloture: roleValide(docs.phases?.roleCloture, phases, base.roleCloture),
    options,
    debutActivite: /^\d{4}-\d{2}$/.test(docs.reglages?.debutActivite || '') ? docs.reglages.debutActivite : base.debutActivite,
    membres: membres ?? base.membres,
  };
}

/** Réglages effectifs (fusion des valeurs de départ de l'espace et du document enregistré). */
export function reglagesEffectifs(doc = {}, { racine = false } = {}) {
  return { ...(racine ? REGLAGES_JEROME : REGLAGES_NEUTRES), ...(doc || {}) };
}

// ---- étapes de vente

export const etapesActives = (config) => configDe(config).etapes.filter((e) => e.actif);
export const etapeDe = (id, config) => configDe(config).etapes.find((e) => e.id === id) ?? null;
export const etapeActive = (id, config) => etapeDe(id, config)?.actif === true;
export const libelleEtape = (id, config) => etapeDe(id, config)?.libelle ?? id ?? '';
export const couleurEtape = (id, config) => etapeDe(id, config)?.couleur ?? COULEUR_NEUTRE;
export const estEtapeGagnee = (id, config) => !!id && id === configDe(config).roleGagnee;
/** Étape où commence une nouvelle affaire : la première active. */
export const etapeDeDepart = (config) => etapesActives(config)[0]?.id ?? configDe(config).etapes[0].id;
/** Identifiant de l'étape « vente gagnée ». */
export const etapeGagnee = (config) => configDe(config).roleGagnee;

export function statutPourEtape(etape, config) {
  return estEtapeGagnee(etape, config) ? 'gagnee' : 'ouverte';
}

// ---- validation de la configuration (enregistrement dans les Réglages)

/**
 * Contrôle une liste de six emplacements avant de l'enregistrer. `genre` : 'etape' ou 'phase' ; `role` : identifiant de l'emplacement qui porte
 * le rôle (vente gagnée / clôture) ; `comptes` : { identifiant: nombre de fiches } (toutes les fiches, archivées comprises).
 * Rend { erreurs } : un message par emplacement fautif (clé = identifiant) ou général (clé `general`).
 */
export function validerEmplacements(items, role, { genre = 'etape', comptes = {} } = {}) {
  const erreurs = {};
  const mot = genre === 'phase' ? 'phase' : 'étape';
  if (!Array.isArray(items) || items.length !== NB_EMPLACEMENTS) return { erreurs: { general: `Il faut exactement ${NB_EMPLACEMENTS} emplacements.` } };
  if (new Set(items.map((e) => e.id)).size !== items.length) return { erreurs: { general: 'Deux emplacements portent le même identifiant.' } };
  const noms = new Set();
  for (const e of items) {
    const nom = nettoyerEspaces(e.libelle);
    if (e.actif && !nom) erreurs[e.id] = `Donne un nom à cette ${mot}.`;
    else if (nom.length > LONGUEUR_MAX_NOM_EMPLACEMENT) erreurs[e.id] = `Le nom est trop long (${LONGUEUR_MAX_NOM_EMPLACEMENT} caractères au plus).`;
    else if (e.actif && noms.has(normaliserNom(nom))) erreurs[e.id] = `Deux ${mot}s actives portent le même nom.`;
    else if (e.description && nettoyerEspaces(e.description).length > LONGUEUR_MAX_DESCRIPTION) erreurs[e.id] = `La description est trop longue (${LONGUEUR_MAX_DESCRIPTION} caractères au plus).`;
    else if (e.couleur && !couleurValide(e.couleur)) erreurs[e.id] = 'La couleur est invalide.';
    if (e.actif) noms.add(normaliserNom(nom));
    if (!e.actif && !erreurs[e.id] && (comptes[e.id] || 0) > 0) {
      const n = comptes[e.id];
      erreurs[e.id] = `Cette ${mot} contient ${n} fiche${n > 1 ? 's' : ''} : déplace-les avant de la désactiver.`;
    }
    if (e.action) {
      const a = e.action;
      if (!nettoyerEspaces(a.titre)) erreurs[e.id] = erreurs[e.id] || 'Donne un titre à l’action suggérée (ou retire-la).';
      else if (!(Number.isInteger(Number(a.delaiJours)) && Number(a.delaiJours) >= 0 && Number(a.delaiJours) <= DELAI_MAX_ACTION)) erreurs[e.id] = erreurs[e.id] || `Le délai de l’action suggérée est un nombre de jours entre 0 et ${DELAI_MAX_ACTION}.`;
      else if (genre === 'etape' && !TYPES_ACTIVITE.some((t) => t.id === a.type)) erreurs[e.id] = erreurs[e.id] || 'Type d’action inconnu.';
    }
  }
  const actifs = items.filter((e) => e.actif);
  if (actifs.length < MIN_ACTIFS) erreurs.general = `Garde au moins ${MIN_ACTIFS} ${mot}s actives.`;
  const porteur = items.find((e) => e.id === role);
  if (!porteur) erreurs.role = `Choisis la ${mot} qui porte le rôle.`;
  else if (!porteur.actif) erreurs.role = `La ${mot} « ${porteur.libelle} » porte le rôle ${genre === 'phase' ? '« clôture »' : '« vente gagnée »'} : elle ne peut pas être désactivée.`;
  return { erreurs };
}

/** Nombre de fiches par étape (toutes les affaires, archivées, perdues ou en pause comprises) : { identifiant: nombre }. */
export function comptesParEtape(affaires) {
  const comptes = {};
  for (const a of affaires || []) if (a.etape) comptes[a.etape] = (comptes[a.etape] || 0) + 1;
  return comptes;
}

/** Document à enregistrer pour une liste d'emplacements : `crm_parametres/etapes` ou `crm_parametres/phases`. */
export function documentEmplacements(items, role, genre = 'etape') {
  return {
    items: items.map((e) => ({
      id: e.id, libelle: nettoyerEspaces(e.libelle), description: nettoyerEspaces(e.description), couleur: couleurValide(e.couleur) ?? COULEUR_NEUTRE, actif: e.actif === true,
      action: actionNormalisee(e.action, genre),
    })),
    [genre === 'phase' ? 'roleCloture' : 'roleGagnee']: role,
  };
}

// ---- action suggérée à l'arrivée d'une fiche dans une étape

/**
 * Action suggérée par l'étape où arrive une affaire : { titre, type, date } ou null. Aucune règle écrite en dur : seule la configuration de l'étape
 * décide (aucune par défaut). La suggestion n'est jamais créée toute seule : l'écran demande d'accepter ou de refuser ; le serveur MCP la rend telle quelle.
 */
export function suggestionPourEtape(etape, aujourdhui, config) {
  const a = etapeDe(etape, config)?.action;
  if (!a) return null;
  return { type: a.type || 'tache', titre: a.titre, date: ajouterJours(aujourdhui, a.delaiJours || 0) };
}

// ---------------------------------------------------------------- valeurs de départ des listes (nouvel espace client : neutres)

export const SECTEURS_NEUTRES = ['Commerce', 'Industrie', 'Services', 'Associatif', 'Autre'];
export const SOURCES_NEUTRES = ['Réseau personnel', 'Recommandation', 'Site internet', 'Événement', 'Autre'];
export const OFFRES_NEUTRES = [];
export const ETIQUETTES_NEUTRES = [
  { id: 'prioritaire', nom: 'Prioritaire', couleur: '#fd6455', ordre: 1 },
  { id: 'partenaire', nom: 'Partenaire', couleur: '#3fbf7f', ordre: 2 },
];
export const FILTRES_NEUTRES = [
  { id: 'relancer_semaine', nom: 'À relancer cette semaine', liste: 'affaires', criteres: { semaine: true }, ordre: 1 },
  { id: 'chaudes', nom: 'Chaudes', liste: 'affaires', criteres: { priorites: ['chaud'] }, ordre: 2 },
];

/** Valeurs de Jérôme (version 2.3), semées seulement dans sa base. */
export const SECTEURS_JEROME = ['Commerce local', 'Artisanat', 'Services', 'Bien être', 'Conseil', 'Associatif', 'Autre'];
export const SOURCES_JEROME = [
  'Réseau personnel', 'Réseau entrepreneuses', 'Commerçant local', 'LinkedIn',
  'Recommandation', 'Événement', 'Flyer', 'Autre',
];
export const OFFRES_JEROME = [
  { id: 'audit', nom: 'Audit', actif: true, ordre: 1 },
  { id: 'accompagnement', nom: 'Accompagnement', actif: true, ordre: 2 },
];
export const ETIQUETTES_JEROME = [
  { id: 'prospect_chaud', nom: 'Prospect chaud', couleur: '#fd6455', ordre: 1 },
  { id: 'reseau_entrepreneuses', nom: 'Réseau entrepreneuses', couleur: '#b98ee0', ordre: 2 },
  { id: 'commercant_local', nom: 'Commerçant local', couleur: '#ecbc06', ordre: 3 },
  { id: 'partenaire', nom: 'Partenaire', couleur: '#3fbf7f', ordre: 4 },
];
export const FILTRES_JEROME = [
  { id: 'relancer_semaine', nom: 'À relancer cette semaine', liste: 'affaires', criteres: { semaine: true }, ordre: 1 },
  { id: 'chaudes', nom: 'Chaudes', liste: 'affaires', criteres: { priorites: ['chaud'] }, ordre: 2 },
  { id: 'reseau_entrepreneuses', nom: 'Réseau entrepreneuses', liste: 'affaires', criteres: { sources: ['Réseau entrepreneuses'] }, ordre: 3 },
];

/** Modèles d'affaire de départ d'un nouvel espace (ceux de Jérôme : aucun, c'est une fonction nouvelle). */
export const MODELES_AFFAIRE_NEUTRES = [
  {
    id: 'affaire-type', nom: 'Affaire type', offreId: null, etape: null, priorite: 'tiede', montant: null, besoin: '', actif: true, ordre: 1,
    activites: [
      { id: 'affaire-type-rdv', type: 'rendez_vous', titre: 'Premier rendez-vous', delaiJours: 7 },
      { id: 'affaire-type-proposition', type: 'tache', titre: 'Envoyer la proposition', delaiJours: 14 },
    ],
  },
];

/**
 * Documents de `crm_parametres` créés au premier lancement d'un espace. Racine : les valeurs de Jérôme ; espace client : un petit jeu neutre.
 * `moisCourant` ("AAAA-MM") fixe le début d'activité d'un nouvel espace.
 */
export function parametresDepart({ racine = false, moisCourant = null } = {}) {
  const config = racine ? CONFIG_JEROME : CONFIG_NEUTRE;
  const reglages = { ...(racine ? REGLAGES_JEROME : REGLAGES_NEUTRES), ...(!racine && moisCourant ? { debutActivite: moisCourant } : {}) };
  return {
    offres: { items: structuredClone(racine ? OFFRES_JEROME : OFFRES_NEUTRES) },
    listes: { secteurs: [...(racine ? SECTEURS_JEROME : SECTEURS_NEUTRES)], sources: [...(racine ? SOURCES_JEROME : SOURCES_NEUTRES)] },
    etiquettes: { items: structuredClone(racine ? ETIQUETTES_JEROME : ETIQUETTES_NEUTRES) },
    filtres: { items: structuredClone(racine ? FILTRES_JEROME : FILTRES_NEUTRES), version: 2 },
    reglages,
    etapes: documentEmplacements(config.etapes, config.roleGagnee, 'etape'),
    phases: documentEmplacements(config.phases, config.roleCloture, 'phase'),
    modeles_affaire: { items: structuredClone(racine ? [] : MODELES_AFFAIRE_NEUTRES) },
  };
}

// ---------------------------------------------------------------- dates

/** Convertit un Timestamp Firestore, une Date, un nombre ou une chaîne en Date (ou null). */
export function versDate(v) {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) return isNaN(v) ? null : v;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v === 'object' && typeof v.seconds === 'number') {
    return new Date(v.seconds * 1000 + Math.round((v.nanoseconds || 0) / 1e6));
  }
  if (typeof v === 'number') return new Date(v);
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v)) return dateHeureParisVersDate(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return dateHeureParisVersDate(`${v}T12:00`);
    const d = new Date(v);
    return isNaN(d) ? null : d;
  }
  return null;
}

const formateurParis = new Intl.DateTimeFormat('en-GB', {
  timeZone: FUSEAU, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
});

function partiesParis(date) {
  const p = {};
  for (const { type, value } of formateurParis.formatToParts(date)) p[type] = value;
  return p;
}

/** Jour civil à Paris, "AAAA-MM-JJ". */
export function jourParis(dateLike) {
  const d = versDate(dateLike);
  if (!d) return null;
  const p = partiesParis(d);
  return `${p.year}-${p.month}-${p.day}`;
}

/** Aujourd'hui à Paris, "AAAA-MM-JJ". */
export function aujourdhuiParis(maintenant = new Date()) {
  return jourParis(maintenant);
}

/** Mois civil à Paris, "AAAA-MM". Accepte aussi une chaîne "AAAA-MM-JJ". */
export function moisParis(v) {
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && !v.includes('Z')) return v.slice(0, 7);
  const j = jourParis(v);
  return j ? j.slice(0, 7) : null;
}

export function moisCourant(maintenant = new Date()) {
  return moisParis(maintenant);
}

/** "2026-10-12T14:30" (heure de Paris) vers l'instant correspondant. */
export function dateHeureParisVersDate(texte) {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(texte || '');
  if (!m) return null;
  const [, a, mo, j, h, mi] = m.map(Number);
  const suppose = Date.UTC(a, mo - 1, j, h, mi);
  // Décalage de Paris à cet instant (itéré deux fois pour les changements d'heure).
  let instant = suppose;
  for (let i = 0; i < 2; i++) {
    const p = partiesParis(new Date(instant));
    const vuParis = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    instant = suppose - (vuParis - instant);
  }
  return new Date(instant);
}

/** Ajoute n jours à un jour civil "AAAA-MM-JJ". */
export function ajouterJours(jour, n) {
  const [a, m, j] = jour.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1, j + n));
  return d.toISOString().slice(0, 10);
}

/** Écart en jours entre deux jours civils (b - a). */
export function ecartJours(a, b) {
  const t = (s) => { const [x, y, z] = s.split('-').map(Number); return Date.UTC(x, y - 1, z); };
  return Math.round((t(b) - t(a)) / 86400000);
}

/** Date d'un bouton de date rapide ("demain", "3j", "1sem", "2sem"). */
export function dateRapide(code, aujourdhui) {
  const b = DATES_RAPIDES.find((x) => x.id === code);
  if (!b) throw new Error(`Bouton de date inconnu : ${code}`);
  return ajouterJours(aujourdhui, b.jours);
}

/** Dimanche de la semaine en cours (lundi à dimanche), "AAAA-MM-JJ". */
export function dimancheDeLaSemaine(aujourdhui) {
  const [a, m, j] = aujourdhui.split('-').map(Number);
  const jourSemaine = new Date(Date.UTC(a, m - 1, j)).getUTCDay(); // 0 = dimanche
  return ajouterJours(aujourdhui, (7 - jourSemaine) % 7);
}

export function decalerMois(mois, n) {
  const [a, m] = mois.split('-').map(Number);
  const d = new Date(Date.UTC(a, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

const NOMS_MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const NOMS_MOIS_COURTS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

export function libelleMois(mois, court = false) {
  const [a, m] = mois.split('-').map(Number);
  return court ? `${NOMS_MOIS_COURTS[m - 1]}` : `${NOMS_MOIS[m - 1]} ${a}`;
}

export function formatJour(jour) {
  if (!jour) return '';
  const [a, m, j] = jour.slice(0, 10).split('-');
  return `${j}/${m}/${a}`;
}

export function formatJourCourt(jour, aujourdhui) {
  if (!jour) return '';
  if (aujourdhui) {
    const e = ecartJours(aujourdhui, jour);
    if (e === 0) return "Aujourd'hui";
    if (e === 1) return 'Demain';
    if (e === -1) return 'Hier';
  }
  const [a, m, j] = jour.slice(0, 10).split('-').map(Number);
  const suffixe = aujourdhui && aujourdhui.slice(0, 4) !== String(a) ? ` ${a}` : '';
  return `${j} ${NOMS_MOIS_COURTS[m - 1]}${suffixe}`;
}

export function formatDateHeure(v) {
  const d = versDate(v);
  if (!d) return '';
  const p = partiesParis(d);
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

export function formatEuros(n) {
  const v = Number(n) || 0;
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency', currency: 'EUR',
    maximumFractionDigits: Number.isInteger(v) ? 0 : 2,
    minimumFractionDigits: Number.isInteger(v) ? 0 : 2,
  }).format(v).replace(/[\u00a0\u202f]/g, ' ');
}

export function formatNombre(n) {
  return new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 }).format(Number(n) || 0).replace(/[\u00a0\u202f]/g, ' ');
}

export function idAleatoire() {
  return Math.random().toString(36).slice(2, 10);
}

// ---------------------------------------------------------------- texte : normalisation, noms, emails

/** Minuscules, sans accents, sans espaces aux bords. */
export function normaliser(texte) {
  return String(texte ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** Comme normaliser, mais les espaces multiples deviennent un seul espace (comparaison de noms). */
export function normaliserNom(texte) {
  return normaliser(texte).replace(/\s+/g, ' ');
}

/** Espaces en trop retirés, casse conservée. */
export function nettoyerEspaces(texte) {
  return String(texte ?? '').replace(/\s+/g, ' ').trim();
}

/** "Marie Durand" -> { prenom: "Marie", nomFamille: "Durand" } ; un seul mot -> nom de famille seul. */
export function decouperNom(nom) {
  const t = nettoyerEspaces(nom);
  if (!t) return { prenom: '', nomFamille: '' };
  const i = t.indexOf(' ');
  if (i === -1) return { prenom: '', nomFamille: t };
  return { prenom: t.slice(0, i), nomFamille: t.slice(i + 1) };
}

export function assemblerNom(prenom, nomFamille) {
  return nettoyerEspaces(`${prenom ?? ''} ${nomFamille ?? ''}`);
}

export function normaliserEmail(email) {
  return String(email ?? '').replace(/\s+/g, '').toLowerCase();
}

export function emailValide(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email ?? '').trim());
}

/** Liste des emails normalisés, sans doublon ni valeur vide. */
export function emailsNormalises(emails) {
  const vus = new Set();
  for (const e of emails || []) {
    const v = normaliserEmail(typeof e === 'string' ? e : e?.valeur);
    if (v) vus.add(v);
  }
  return [...vus];
}

// ---------------------------------------------------------------- recherche intelligente et doublons

function normaliserAvecIndex(texte) {
  let norm = '';
  const index = [];
  const s = String(texte ?? '');
  for (let i = 0; i < s.length; i++) {
    const n = s[i].normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    for (const c of n) { norm += c; index.push(i); }
  }
  return { norm, index };
}

/** Découpe un libellé en segments { texte, fort } : les lettres trouvées sont "fort". */
export function surligner(libelle, saisie) {
  const original = String(libelle ?? '');
  const mots = normaliser(saisie).split(/\s+/).filter(Boolean);
  const { norm, index } = normaliserAvecIndex(original);
  let plages = [];
  for (const mot of mots) {
    const pos = norm.indexOf(mot);
    if (pos === -1) continue;
    plages.push([index[pos], index[pos + mot.length - 1] + 1]);
  }
  plages.sort((a, b) => a[0] - b[0]);
  const fusion = [];
  for (const p of plages) {
    const dernier = fusion[fusion.length - 1];
    if (dernier && p[0] <= dernier[1]) dernier[1] = Math.max(dernier[1], p[1]);
    else fusion.push([...p]);
  }
  const segments = [];
  let curseur = 0;
  for (const [debut, fin] of fusion) {
    if (debut > curseur) segments.push({ texte: original.slice(curseur, debut), fort: false });
    segments.push({ texte: original.slice(debut, fin), fort: true });
    curseur = fin;
  }
  if (curseur < original.length) segments.push({ texte: original.slice(curseur), fort: false });
  return segments.length ? segments : [{ texte: original, fort: false }];
}

/**
 * Suggestions d'un champ intelligent.
 * elements : [{ id, libelle, sousTitre?, extra?: [string] }]
 * Dès `min` lettres : valeurs qui CONTIENNENT la saisie (accents et casse ignorés), débuts de mot d'abord,
 * `max` résultats au plus. `creer` : texte à créer ("Créer « … »") s'il n'existe pas de valeur identique.
 */
export function rechercherSuggestions(saisie, elements, { min = MIN_LETTRES, max = MAX_SUGGESTIONS, creer = false } = {}) {
  const q = normaliserNom(saisie);
  if (q.length < min) return { resultats: [], creer: null, total: 0 };
  const mots = q.split(' ');
  const classes = [];
  for (const el of elements || []) {
    const lib = normaliserNom(el.libelle);
    const botte = normaliserNom([el.libelle, ...(el.extra || [])].join(' '));
    if (!mots.every((m) => botte.includes(m))) continue;
    let score;
    if (lib.startsWith(q)) score = 0;
    else if (lib.split(/[\s'’\-]+/).some((w) => w.startsWith(mots[0])) && mots.every((m) => lib.includes(m))) score = 1;
    else if (mots.every((m) => lib.includes(m))) score = 2;
    else score = 3;
    classes.push({ el, score });
  }
  classes.sort((a, b) => a.score - b.score || String(a.el.libelle).localeCompare(String(b.el.libelle), 'fr'));
  const resultats = classes.slice(0, max).map(({ el }) => ({ ...el, segments: surligner(el.libelle, saisie) }));
  const identique = (elements || []).some((el) => normaliserNom(el.libelle) === q);
  return { resultats, creer: creer && !identique ? nettoyerEspaces(saisie) : null, total: classes.length };
}

/** Personnes qui ressemblent à la saisie : même nom (accents, casse, espaces ignorés) ou email partagé. */
export function trouverDoublonsPersonne(personnes, { nom, emails = [] }, { sauf = null } = {}) {
  const n = normaliserNom(nom);
  const mails = new Set(emailsNormalises(emails));
  return (personnes || []).filter((p) => {
    if (sauf && p.id === sauf) return false;
    if (p.archive) return false;
    if (n && normaliserNom(p.nom) === n) return true;
    const siens = p.emailsNormalises?.length ? p.emailsNormalises : emailsNormalises(p.emails);
    return siens.some((m) => mails.has(m));
  });
}

export function trouverDoublonsOrganisation(organisations, nom, { sauf = null } = {}) {
  const n = normaliserNom(nom);
  if (!n) return [];
  return (organisations || []).filter((o) => o.id !== sauf && !o.archive && normaliserNom(o.nom) === n);
}

// ---------------------------------------------------------------- personnes et organisations

export function validerPersonne(v) {
  const erreurs = {};
  if (!nettoyerEspaces(v.nom)) erreurs.nom = 'Le nom est obligatoire.';
  for (const e of v.emails || []) {
    if (e.valeur && !emailValide(e.valeur)) erreurs.emails = "Cette adresse email n'est pas valide.";
  }
  return erreurs;
}

export function validerOrganisation(v) {
  return nettoyerEspaces(v.nom) ? {} : { nom: 'Le nom est obligatoire.' };
}

function contactsNettoyes(liste) {
  return (liste || [])
    .map((c) => ({ valeur: nettoyerEspaces(c.valeur), type: TYPES_CONTACT.some((t) => t.id === c.type) ? c.type : 'travail' }))
    .filter((c) => c.valeur);
}

/** Document d'une nouvelle personne. Seul le nom est requis. */
export function nouvellePersonne(valeurs, ctx) {
  const nom = nettoyerEspaces(valeurs.nom);
  const { prenom, nomFamille } = decouperNom(nom);
  const emails = contactsNettoyes(valeurs.emails);
  return {
    nom,
    prenom,
    nomFamille,
    organisationId: valeurs.organisationId || null,
    telephones: contactsNettoyes(valeurs.telephones),
    emails,
    emailsNormalises: emailsNormalises(emails),
    etiquettes: [...(valeurs.etiquettes || [])],
    ville: nettoyerEspaces(valeurs.ville),
    linkedin: '',
    siteWeb: '',
    source: valeurs.source || '',
    oppositionProspection: false,
    dateOpposition: null,
    archive: false,
    proprietaire: ctx?.proprietaire ?? ctx?.auteur ?? '',
  };
}

export function nouvelleOrganisation(valeurs, ctx) {
  return {
    nom: nettoyerEspaces(valeurs.nom),
    adresse: nettoyerEspaces(valeurs.adresse),
    ville: nettoyerEspaces(valeurs.ville),
    siteWeb: '',
    secteur: valeurs.secteur || '',
    taille: '',
    etiquettes: [...(valeurs.etiquettes || [])],
    archive: false,
    proprietaire: ctx?.proprietaire ?? ctx?.auteur ?? '',
  };
}

/** Patch après modification du prénom ou du nom de famille : `nom` est recalculé. */
export function patchNomDetaille(prenom, nomFamille) {
  const p = nettoyerEspaces(prenom);
  const f = nettoyerEspaces(nomFamille);
  return { prenom: p, nomFamille: f, nom: assemblerNom(p, f) };
}

/** Patch après modification du nom affiché : prénom et nom de famille sont redécoupés. */
export function patchNomAffiche(nom) {
  const n = nettoyerEspaces(nom);
  return { nom: n, ...decouperNom(n) };
}

/** Patch après modification des emails : la liste normalisée suit. */
export function patchEmails(emails) {
  const propres = contactsNettoyes(emails);
  return { emails: propres, emailsNormalises: emailsNormalises(propres) };
}

/** Patch après modification des téléphones. */
export function patchTelephones(telephones) {
  return { telephones: contactsNettoyes(telephones) };
}

export function emailActif(personne) {
  return !personne.oppositionProspection && (personne.emails || []).some((e) => emailValide(e.valeur));
}

export function premierEmail(personne) {
  return (personne.emails || []).find((e) => emailValide(e.valeur))?.valeur ?? '';
}

export function marquerOpposition(coche, ctx) {
  return coche
    ? { oppositionProspection: true, dateOpposition: ctx.maintenant }
    : { oppositionProspection: false, dateOpposition: null };
}

// ---------------------------------------------------------------- affaires : création, statut, étapes

/** Titre proposé quand on n'en tape pas : organisation, sinon personne. */
export function titreParDefaut({ organisation, personne } = {}) {
  return nettoyerEspaces(organisation?.nom) || nettoyerEspaces(personne?.nom) || '';
}

export function validerAffaire(v) {
  return nettoyerEspaces(v.titre) ? {} : { titre: 'Le titre est obligatoire.' };
}

/** Document d'une nouvelle affaire (étape, priorité et statut posés automatiquement). L'étape de départ est la première étape active de la configuration (`ctx.config`). */
export function nouvelleAffaire(valeurs, ctx) {
  const config = configDe(ctx);
  const etape = valeurs.etape && etapeActive(valeurs.etape, config) ? valeurs.etape : etapeDeDepart(config);
  const montant = valeurs.montant === '' || valeurs.montant === null || valeurs.montant === undefined ? null : Number(valeurs.montant);
  return {
    titre: nettoyerEspaces(valeurs.titre),
    personneId: valeurs.personneId || null,
    organisationId: valeurs.organisationId || null,
    etape,
    statut: statutPourEtape(etape, config),
    priorite: PRIORITES.some((p) => p.id === valeurs.priorite) ? valeurs.priorite : 'tiede',
    montant: Number.isFinite(montant) ? montant : null,
    offreId: valeurs.offreId || null,
    dureeJours: valeurs.dureeJours ?? null,
    source: valeurs.source || '',
    besoin: valeurs.besoin || '',
    dateEntreeEtape: ctx.maintenant,
    datesEtapes: { [etape]: ctx.maintenant },
    raisonPerdue: '',
    raisonPerdueDetail: '',
    dateReveil: null,
    documents: [],
    projetId: null,
    urlGithub: urlOuVide(validerUrlGithub, valeurs.urlGithub),
    urlDossier: urlOuVide(validerUrlDossier, valeurs.urlDossier),
    archive: false,
    proprietaire: ctx.proprietaire ?? ctx.auteur ?? '',
  };
}

/** Une affaire ne peut arriver que dans une étape ACTIVE de la configuration. */
export function validerChangementEtape(etape, config) {
  return etapeActive(etape, config) ? {} : { etape: 'Étape inconnue ou désactivée.' };
}

function evenement(type, texte, liens, ctx) {
  return {
    type,
    texte,
    personneId: liens?.personneId ?? null,
    organisationId: liens?.organisationId ?? null,
    affaireId: liens?.affaireId ?? null,
    auteur: ctx.auteur ?? '',
    date: ctx.maintenant,
  };
}

/** Liens à poser sur un élément du fil (activité, note, événement) rattaché à une affaire. */
export function liensAffaire(affaire) {
  return {
    personneId: affaire.personneId ?? null,
    organisationId: affaire.organisationId ?? null,
    affaireId: affaire.id ?? null,
  };
}

/**
 * Changement d'étape : renvoie { patch, evenements, suggestion } (la suggestion vient de la configuration de l'étape : aucune par défaut).
 * Changer d'étape rouvre une affaire perdue ou en pause (raison et date de réveil effacées).
 */
export function changementEtape(affaire, etape, ctx, options = {}) {
  const config = configDe(ctx);
  const erreurs = validerChangementEtape(etape, config);
  if (Object.keys(erreurs).length) return { erreurs, patch: {}, evenements: [], suggestion: null };
  const liens = liensAffaire(affaire);
  const rouvre = affaire.statut === 'perdue' || affaire.statut === 'en_pause';
  if (etape === affaire.etape && !rouvre) return { erreurs: {}, patch: {}, evenements: [], suggestion: null };

  // La date d'entrée dans chaque étape est celle du PREMIER passage, sauf l'étape « vente gagnée » : elle porte la date de la signature
  // (dernier passage), pour que le chiffre d'affaires signé tombe dans le bon mois si une affaire est rouverte puis regagnée.
  const datesEtapes = { ...(affaire.datesEtapes || {}) };
  if (!datesEtapes[etape] || estEtapeGagnee(etape, config)) datesEtapes[etape] = ctx.maintenant;
  const patch = {
    etape,
    statut: statutPourEtape(etape, config),
    dateEntreeEtape: ctx.maintenant,
    datesEtapes,
    raisonPerdue: '',
    raisonPerdueDetail: '',
    dateReveil: null,
    archive: false,
  };
  const evenements = [];
  if (rouvre) evenements.push(evenement('affaire_rouverte', `Affaire rouverte : ${affaire.titre}`, liens, ctx));
  if (etape !== affaire.etape) {
    evenements.push(evenement('etape_changee', `Étape : ${libelleEtape(affaire.etape, config)} → ${libelleEtape(etape, config)}`, liens, ctx));
  }
  if (estEtapeGagnee(etape, config) && affaire.etape !== etape && !affaire.datesEtapes?.[etape]) {
    evenements.push(evenement('affaire_gagnee', `Affaire gagnée : ${affaire.titre}`, liens, ctx));
  }
  const suggestion = etape !== affaire.etape ? suggestionPourEtape(etape, aujourdhuiParis(ctx.maintenant), config) : null;
  return { erreurs: {}, patch, evenements, suggestion };
}

export function validerPerdue(raison) {
  return RAISONS_PERDUE.includes(raison) ? {} : { raison: 'La raison est obligatoire.' };
}

export function marquerPerdue(affaire, { raison, detail = '' }, ctx) {
  const erreurs = validerPerdue(raison);
  if (Object.keys(erreurs).length) return { erreurs, patch: {}, evenements: [] };
  return {
    erreurs: {},
    patch: { statut: 'perdue', raisonPerdue: raison, raisonPerdueDetail: nettoyerEspaces(detail), dateReveil: null },
    evenements: [evenement('affaire_perdue', `Affaire perdue (${raison}) : ${affaire.titre}`, liensAffaire(affaire), ctx)],
  };
}

/** Date de réveil proposée pour une affaire en pause : +3 mois, au même jour du mois. */
export function dateReveilParDefaut(aujourdhui) {
  const [a, m, j] = aujourdhui.split('-').map(Number);
  const cible = new Date(Date.UTC(a, m - 1 + 3, 1));
  const dernier = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0)).getUTCDate();
  cible.setUTCDate(Math.min(j, dernier));
  return cible.toISOString().slice(0, 10);
}

export function mettreEnPause(affaire, { dateReveil }, ctx) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateReveil || '')) return { erreurs: { dateReveil: 'La date de réveil est obligatoire.' }, patch: {}, evenements: [] };
  return {
    erreurs: {},
    patch: { statut: 'en_pause', dateReveil, raisonPerdue: '', raisonPerdueDetail: '' },
    evenements: [evenement('affaire_en_pause', `Affaire en pause jusqu'au ${formatJour(dateReveil)} : ${affaire.titre}`, liensAffaire(affaire), ctx)],
  };
}

export function rouvrirAffaire(affaire, ctx) {
  if (affaire.statut !== 'perdue' && affaire.statut !== 'en_pause') return { patch: {}, evenements: [] };
  return {
    patch: { statut: statutPourEtape(affaire.etape, configDe(ctx)), raisonPerdue: '', raisonPerdueDetail: '', dateReveil: null },
    evenements: [evenement('affaire_rouverte', `Affaire rouverte : ${affaire.titre}`, liensAffaire(affaire), ctx)],
  };
}

export function estArchivee(x) {
  return x.archive === true;
}

/** Affaire "vivante" : ni archivée, ni perdue, ni en pause. */
export function estAffaireActive(a) {
  return !estArchivee(a) && (a.statut === 'ouverte' || a.statut === 'gagnee');
}

export function ajouterDocument(affaire, libelle, url, favori = false) {
  const u = nettoyerEspaces(url);
  if (!/^https?:\/\//i.test(u)) return { erreurs: { url: "L'adresse doit commencer par http." }, patch: {} };
  const doc = { libelle: nettoyerEspaces(libelle) || u, url: u };
  if (favori === true) doc.favori = true;
  return { erreurs: {}, patch: { documents: [...(affaire.documents || []), doc] } };
}

export function supprimerDocument(affaire, index) {
  return { documents: (affaire.documents || []).filter((_, i) => i !== index) };
}

/** Met le document d'index `index` en favori (ou l'en retire) : l'étoile. Une étoile retirée efface le champ `favori`. */
export function basculerFavoriDocument(entite, index) {
  const documents = entite.documents || [];
  return {
    documents: documents.map((d, i) => {
      if (i !== index) return d;
      const { favori, ...reste } = d;
      return favori === true ? reste : { ...reste, favori: true };
    }),
  };
}

/**
 * Tous les documents en favori des affaires et des projets (un projet archivé ou une affaire archivée ne comptent pas),
 * par ordre alphabétique de libellé : [{ libelle, url, source: { type: 'affaire' | 'projet', id, titre }, index }].
 * `index` est la place du document dans la liste de sa source : il sert à retirer l'étoile.
 */
export function documentsFavoris(affaires = [], projets = []) {
  const depuis = (type, liste) => liste.filter((x) => !estArchivee(x)).flatMap((x) => (x.documents || []).flatMap((d, index) => (
    d.favori === true ? [{ libelle: d.libelle || d.url, url: d.url, source: { type, id: x.id, titre: x.titre || x.nom || '' }, index }] : [])));
  return [...depuis('affaire', affaires), ...depuis('projet', projets)].sort((a, b) => a.libelle.localeCompare(b.libelle, 'fr', { sensitivity: 'base' }));
}

// ---------------------------------------------------------------- liens et documents, dossier de travail
// (Google Drive, serveur, NAS, site : n'importe quel lien ; le dépôt GitHub n'est plus un champ à part, c'est un lien comme un autre)

const MOTIF_URL_GITHUB = /^https:\/\/github\.com\/([A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)\/([A-Za-z0-9._-]+)(\/\S*)?$/;

/** Ancien champ « Adresse GitHub » (toujours lu et écrit par les outils MCP, plus affiché comme champ à part). */
export function validerUrlGithub(url) {
  const u = nettoyerEspaces(url);
  if (!u || MOTIF_URL_GITHUB.test(u)) return {};
  return { url: "L'adresse doit commencer par https://github.com/ et indiquer un dépôt (https://github.com/compte/nom)." };
}

/** Schémas acceptés pour un dossier de travail : le web et les partages de fichiers courants (serveur, NAS). Jamais javascript:, data:, etc. */
const MOTIF_URL_DOSSIER = /^(?:https?|ftps?|sftp|smb|afp|nfs|file):\/\/[^\s<>"]+$/i;

/** Dossier de travail : n'importe quel lien (Drive, serveur, NAS, site…). Vide = effacer. */
export function validerUrlDossier(url) {
  const u = nettoyerEspaces(url);
  if (!u || MOTIF_URL_DOSSIER.test(u)) return {};
  return { url: "L'adresse doit être un lien complet (commençant par https, ou par smb pour un serveur ou un NAS)." };
}

export function urlOuVide(valider, url) {
  return Object.keys(valider(url)).length ? '' : nettoyerEspaces(url);
}

/** Enregistrement de l'adresse GitHub d'une affaire (ou d'un projet) : { erreurs, patch }. Vide = effacer. */
export function majUrlGithub(url) {
  const erreurs = validerUrlGithub(url);
  return Object.keys(erreurs).length ? { erreurs, patch: {} } : { erreurs: {}, patch: { urlGithub: nettoyerEspaces(url) } };
}

export function majUrlDossier(url) {
  const erreurs = validerUrlDossier(url);
  return Object.keys(erreurs).length ? { erreurs, patch: {} } : { erreurs: {}, patch: { urlDossier: nettoyerEspaces(url) } };
}

/**
 * La liste « Liens et documents » d'une affaire ou d'un projet : ses documents, puis l'ancienne adresse GitHub (libellé « GitHub ») si elle existe
 * et n'est pas déjà dans la liste. Rien n'est écrit : la donnée `urlGithub` reste telle quelle (aucune perte), seulement montrée comme un lien.
 * Chaque ligne : { libelle, url, favori, index } ; `index` = place dans `documents`, ou -1 pour l'ancienne adresse GitHub.
 */
export function liensEtDocuments(entite) {
  const documents = entite?.documents || [];
  const liens = documents.map((d, index) => ({ libelle: d.libelle || d.url, url: d.url, favori: d.favori === true, index }));
  const github = nettoyerEspaces(entite?.urlGithub);
  if (github && !Object.keys(validerUrlGithub(github)).length && !documents.some((d) => d.url === github)) liens.push({ libelle: 'GitHub', url: github, favori: false, index: -1 });
  return liens;
}

/** Retire une ligne de la liste (document, ou ancienne adresse GitHub) : { patch }. */
export function retirerLien(entite, lien) {
  return lien.index === -1 ? { urlGithub: '' } : supprimerDocument(entite, lien.index);
}

/** Étoile sur une ligne. Pour l'ancienne adresse GitHub, elle entre dans la liste des documents (en favori) et le champ ancien est vidé : même lien, même libellé. */
export function basculerFavoriLien(entite, lien) {
  if (lien.index !== -1) return basculerFavoriDocument(entite, lien.index);
  return { documents: [...(entite.documents || []), { libelle: lien.libelle, url: lien.url, favori: true }], urlGithub: '' };
}

// ---------------------------------------------------------------- activités

export function titreActiviteParDefaut(type) {
  return TYPES_ACTIVITE.find((t) => t.id === type)?.titre ?? 'Tâche';
}

export function validerActivite(v) {
  const erreurs = {};
  if (!TYPES_ACTIVITE.some((t) => t.id === v.type)) erreurs.type = 'Le type est obligatoire.';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date || '')) erreurs.date = 'La date est obligatoire.';
  return erreurs;
}

export function nouvelleActivite(valeurs, ctx) {
  const type = TYPES_ACTIVITE.some((t) => t.id === valeurs.type) ? valeurs.type : 'tache';
  return {
    type,
    titre: nettoyerEspaces(valeurs.titre) || titreActiviteParDefaut(type),
    date: valeurs.date || aujourdhuiParis(ctx.maintenant),
    heure: valeurs.heure || '',
    fait: false,
    dateFait: null,
    personneId: valeurs.personneId ?? null,
    organisationId: valeurs.organisationId ?? null,
    affaireId: valeurs.affaireId ?? null,
    // Une activité de projet (appel, rendez vous, email saisis depuis la fiche projet) porte aussi son projet : le champ n'existe que sur elles.
    ...(valeurs.projetId ? { projetId: valeurs.projetId } : {}),
    auteur: ctx.auteur ?? '',
  };
}

/**
 * À quoi une activité est rattachée, pour l'accueil : un seul lien, dans l'ordre affaire, personne, organisation.
 * trouver : { affaire, personne, organisation }, fonctions id → fiche ou null (un lien vers une fiche supprimée est ignoré).
 * Renvoie { type, fiche } ou null si l'activité n'est rattachée à rien.
 */
export function rattachementActivite(activite, trouver) {
  for (const type of ['affaire', 'personne', 'organisation']) {
    const id = activite?.[`${type}Id`];
    const fiche = id ? trouver[type]?.(id) : null;
    if (fiche) return { type, fiche };
  }
  return null;
}

export function activiteFaite(activite, ctx) {
  if (activite.fait) return { patch: {}, evenements: [] };
  return {
    patch: { fait: true, dateFait: ctx.maintenant },
    evenements: [evenement('activite_faite', `${libelleTypeActivite(activite.type)} fait : ${activite.titre}`, activite, ctx)],
  };
}

export function activiteNonFaite(activite) {
  return { fait: false, dateFait: null };
}

export function estActiviteEnRetard(a, aujourdhui) {
  return !a.fait && !!a.date && a.date < aujourdhui;
}

export function activitesAVenir(activites) {
  return (activites || []).filter((a) => !a.fait);
}

function cleTri(a) {
  return `${a.date || '9999-99-99'}T${a.heure || '00:00'}`;
}

export function trierActivites(activites) {
  return [...activites].sort((a, b) => cleTri(a).localeCompare(cleTri(b)));
}

export function prochaineActivite(activites) {
  return trierActivites(activitesAVenir(activites))[0] ?? null;
}

/** Pastille d'une affaire : rouge (activité en retard), verte (activité prévue), grise (aucune). */
export function pastilleActivite(activitesDeLAffaire, aujourdhui) {
  const prevues = activitesAVenir(activitesDeLAffaire);
  if (!prevues.length) return 'grise';
  return prevues.some((a) => estActiviteEnRetard(a, aujourdhui)) ? 'rouge' : 'verte';
}

export function activitesDeAffaire(activites, affaireId) {
  return (activites || []).filter((a) => a.affaireId === affaireId);
}

/** Affaire active sans aucune activité à venir. */
export function estSansAction(affaire, activites) {
  return estAffaireActive(affaire) && !activitesDeAffaire(activitesAVenir(activites), affaire.id).length;
}

export function estAReveiller(affaire, aujourdhui) {
  return affaire.statut === 'en_pause' && !!affaire.dateReveil && affaire.dateReveil <= aujourdhui && !estArchivee(affaire);
}

/**
 * Points clés : activités non faites (en retard, aujourd'hui), affaires à réveiller, affaires sans action.
 * Les activités rattachées à une affaire perdue, en pause ou archivée sont ignorées.
 */
export function pointsCles({ activites = [], affaires = [] }, aujourdhui) {
  const vivantes = new Set(affaires.filter(estAffaireActive).map((a) => a.id));
  const garde = (a) => !a.affaireId || vivantes.has(a.affaireId);
  const ouvertes = trierActivites(activitesAVenir(activites).filter(garde));
  return {
    enRetard: ouvertes.filter((a) => estActiviteEnRetard(a, aujourdhui)),
    aujourdhui: ouvertes.filter((a) => a.date === aujourdhui),
    reveils: affaires.filter((a) => estAReveiller(a, aujourdhui)),
    sansAction: affaires.filter((a) => estSansAction(a, activites)),
  };
}

/** Points clés d'une fiche : ses activités non faites, les plus proches d'abord. */
export function pointsClesFiche(activites, aujourdhui) {
  return trierActivites(activitesAVenir(activites)).map((a) => ({
    ...a,
    etat: estActiviteEnRetard(a, aujourdhui) ? 'retard' : a.date === aujourdhui ? 'aujourdhui' : 'avenir',
  }));
}

// ---------------------------------------------------------------- notes et historique

export function validerNote(texte) {
  return nettoyerEspaces(texte) ? {} : { texte: 'La note est vide.' };
}

export function nouvelleNote(texte, liens, ctx) {
  return {
    texte: String(texte ?? '').trim(),
    personneId: liens?.personneId ?? null,
    organisationId: liens?.organisationId ?? null,
    affaireId: liens?.affaireId ?? null,
    // Une note de projet porte aussi son projet (le champ n'existe que sur ces notes : les autres restent comme avant).
    ...(liens?.projetId ? { projetId: liens.projetId } : {}),
    auteur: ctx.auteur ?? '',
  };
}

/** Mention du canal à la suite de l'auteur dans le fil : « · via MCP » pour ce qu'un agent a créé par le serveur MCP, sinon rien. */
export function mentionCanal(element) {
  return element?.via === 'mcp' ? ' · via MCP' : '';
}

export const FILTRES_HISTORIQUE = [
  { id: 'tous', libelle: 'Tous' },
  { id: 'activites', libelle: 'Activités' },
  { id: 'notes', libelle: 'Notes' },
  { id: 'affaires', libelle: 'Affaires' },
  { id: 'evenements', libelle: 'Événements' },
];

const TYPES_EVENEMENT_AFFAIRE = new Set([
  'affaire_creee', 'etape_changee', 'affaire_gagnee', 'affaire_perdue', 'affaire_en_pause', 'affaire_rouverte', 'encaissement',
]);

/** Fil d'historique : activités faites, notes et événements, du plus récent au plus ancien. */
export function entreesHistorique({ activites = [], notes = [], evenements = [] }, filtre = 'tous') {
  const entrees = [
    ...activites.filter((a) => a.fait).map((a) => ({ genre: 'activite', date: versDate(a.dateFait) ?? versDate(a.date), element: a })),
    ...notes.map((n) => ({ genre: 'note', date: versDate(n.creeLe), element: n })),
    ...evenements.map((e) => ({ genre: 'evenement', date: versDate(e.date), element: e })),
  ];
  const gardees = entrees.filter((e) => {
    if (filtre === 'activites') return e.genre === 'activite';
    if (filtre === 'notes') return e.genre === 'note';
    if (filtre === 'affaires') return e.genre === 'evenement' && TYPES_EVENEMENT_AFFAIRE.has(e.element.type);
    if (filtre === 'evenements') return e.genre === 'evenement';
    return true;
  });
  gardees.sort((a, b) => (b.date?.getTime() ?? 0) - (a.date?.getTime() ?? 0));
  return gardees.slice(0, MAX_HISTORIQUE);
}

export function evenementCreation(type, texte, liens, ctx) {
  return evenement(type, texte, liens, ctx);
}

export function evenementEmailEnvoye(personne, ctx) {
  return evenement('email_envoye', `Email envoyé à ${personne.nom}`, { personneId: personne.id, organisationId: personne.organisationId }, ctx);
}

// ---------------------------------------------------------------- objectifs mensuels

function dansLeMois(valeur, mois) {
  return !!valeur && moisParis(valeur) === mois;
}

/**
 * Chaque calcul reçoit `donnees` ({ personnes, affaires, activites, projets, config }), un mois "AAAA-MM" et l'objectif (pour ses paramètres).
 *  - `explication` : texte en lecture seule qui dit comment l'indicateur est calculé (Réglages, un par indicateur) ;
 *  - `exige` : option du CRM dont dépend l'indicateur (`suiviPaiements` : factures des projets) ; sans elle, il n'est pas proposé ;
 *  - `etape: true` : l'indicateur porte le choix d'une étape (champ `etapeId` de l'objectif).
 */
const euros = (n) => Number(n) || 0;
const etapeDeLObjectif = (objectif) => objectif?.etapeId ?? null;
const avantDebut = (mois, config) => !!config?.debutActivite && mois < config.debutActivite;

export const CALCULS = {
  nouveaux_contacts: {
    libelle: 'Nouveaux contacts',
    unite: '',
    explication: 'Nombre de personnes créées dans le CRM pendant le mois.',
    calculer: ({ personnes = [] }, mois) => personnes.filter((p) => dansLeMois(p.creeLe, mois)).length,
  },
  rdv_tenus: {
    libelle: 'Rendez vous tenus',
    unite: '',
    explication: 'Nombre d’activités de type « Rendez vous » cochées comme faites pendant le mois (selon la date où on les coche).',
    calculer: ({ activites = [] }, mois) => activites.filter((a) => a.type === 'rendez_vous' && a.fait && dansLeMois(a.dateFait, mois)).length,
  },
  passages_etape: {
    libelle: 'Passages à l’étape',
    unite: '',
    etape: true,
    explication: 'Nombre d’affaires qui sont entrées dans l’étape choisie pendant le mois (date du premier passage dans cette étape). Si l’étape est désactivée, l’objectif l’est aussi.',
    calculer: ({ affaires = [] }, mois, objectif) => {
      const etape = etapeDeLObjectif(objectif);
      return etape ? affaires.filter((a) => dansLeMois(a.datesEtapes?.[etape], mois)).length : 0;
    },
  },
  ca_signe: {
    libelle: 'Chiffre d’affaires signé',
    unite: '€',
    explication: 'Total du contrat (montant de l’affaire) compté une seule fois, le mois où l’affaire passe à l’étape « vente gagnée ». Une affaire gagnée puis perdue ou rouverte n’est plus comptée ; une affaire sans montant ne compte pas ; avant le début d’activité, rien n’est compté.',
    calculer: ({ affaires = [], config }, mois) => {
      if (avantDebut(mois, config)) return 0;
      const gagnee = configDe(config).roleGagnee;
      return affaires.filter((a) => a.etape === gagnee && a.statut === 'gagnee' && dansLeMois(a.datesEtapes?.[gagnee], mois)).reduce((t, a) => t + euros(a.montant), 0);
    },
  },
  ca_facture: {
    libelle: 'Chiffre d’affaires facturé',
    unite: '€',
    exige: 'suiviPaiements',
    explication: 'Total des factures des projets qui ne sont pas abandonnées (à payer ou payées), compté le mois de leur date d’envoi.',
    calculer: ({ projets = [] }, mois) => projets.reduce(
      (s, p) => s + (Array.isArray(p.factures) ? p.factures : []).filter((f) => f.statut !== 'abandonnee' && String(f.dateEnvoi || '').slice(0, 7) === mois)
        .reduce((t, f) => t + euros(f.montant), 0),
      0,
    ),
  },
  ca_encaisse: {
    libelle: "Chiffre d'affaires encaissé",
    unite: '€',
    exige: 'suiviPaiements',
    explication: 'Total des factures des projets marquées payées, compté le mois du paiement. Les factures abandonnées et celles à payer ne comptent pas.',
    // Les factures PAYÉES des projets (jamais les abandonnées ni les à payer) et, pour l'historique, les anciens encaissements saisis sur les affaires avant la 2.2.
    calculer: ({ affaires = [], projets = [] }, mois) => affaires.reduce(
      (s, a) => s + (a.encaissements || []).filter((e) => dansLeMois(e.date, mois)).reduce((t, e) => t + euros(e.montant), 0),
      0,
    ) + projets.reduce(
      (s, p) => s + (Array.isArray(p.factures) ? p.factures : []).filter((f) => f.statut === 'payee' && String(f.datePaiement || '').slice(0, 7) === mois)
        .reduce((t, f) => t + euros(f.montant), 0),
      0,
    ),
  },
  // Ancien indicateur de Jérôme (« Propositions envoyées ») : conservé pour son historique, il compte les passages à l'étape `proposition_envoyee`.
  propositions_envoyees: {
    libelle: 'Propositions envoyées',
    unite: '',
    heritage: true,
    explication: 'Nombre d’affaires entrées dans l’étape « Proposition envoyée » pendant le mois (indicateur historique : « Passages à l’étape » le remplace).',
    calculer: ({ affaires = [] }, mois) => affaires.filter((a) => dansLeMois(a.datesEtapes?.proposition_envoyee, mois)).length,
  },
};

/** Libellé d'un objectif : celui qu'on lui a donné, sauf « Passages à l'étape » qui suit le nom actuel de l'étape choisie. */
export function libelleObjectif(objectif, config) {
  if (objectif?.calcul === 'passages_etape') return `Passages à l’étape : ${libelleEtape(etapeDeLObjectif(objectif), config) || '…'}`;
  return objectif?.libelle ?? '';
}

/** Un objectif calculé est-il utilisable ? Faux si l'option dont il dépend est éteinte ou si l'étape choisie est désactivée. */
export function objectifDisponible(objectif, config) {
  if (!objectif || objectif.type === 'manuel') return true;
  const c = CALCULS[objectif.calcul];
  if (!c) return false;
  if (c.exige && configDe(config).options[c.exige] !== true) return false;
  if (c.etape && !etapeActive(etapeDeLObjectif(objectif), config)) return false;
  return true;
}

/** Indicateurs calculés qu'on peut ajouter : ceux dont l'option est allumée, sans l'historique ; chaque indicateur une fois (sauf « passages à l'étape », une fois par étape). */
export function calculsProposables(config, objectifs = []) {
  return Object.entries(CALCULS).filter(([id, c]) => !c.heritage && (!c.exige || configDe(config).options[c.exige] === true)
    && (c.etape || !objectifs.some((o) => o.calcul === id))).map(([id, c]) => ({ id, libelle: c.libelle, unite: c.unite, explication: c.explication, etape: !!c.etape }));
}

/** Objectifs de départ d'un nouvel espace : nouveaux contacts, rendez-vous tenus, passages à une étape (la troisième étape active par défaut). Les chiffres d'affaires s'ajoutent au choix. */
export function objectifsDepart(config) {
  const etape = etapesActives(config)[2]?.id ?? etapesActives(config).at(-1)?.id ?? null;
  return [
    { id: 'nouveaux_contacts', libelle: 'Nouveaux contacts', type: 'calcule', calcul: 'nouveaux_contacts', cible: 5, unite: '', couleur: '#b98ee0', ordre: 1, actif: true },
    { id: 'rdv_tenus', libelle: 'Rendez vous tenus', type: 'calcule', calcul: 'rdv_tenus', cible: 2, unite: '', couleur: '#ecbc06', ordre: 2, actif: true },
    { id: 'passages_etape', libelle: 'Passages à l’étape', type: 'calcule', calcul: 'passages_etape', etapeId: etape, cible: 2, unite: '', couleur: '#fd6455', ordre: 3, actif: true },
  ];
}

/** Objectifs de Jérôme (déjà enregistrés dans sa base : cette liste ne sert qu'à recréer sa base à zéro). « Flyers » est à lui seul. */
export const OBJECTIFS_JEROME = [
  { id: 'nouveaux_contacts', libelle: 'Nouveaux contacts', type: 'calcule', calcul: 'nouveaux_contacts', cible: 10, unite: '', couleur: '#b98ee0', ordre: 2, actif: true },
  { id: 'rdv_tenus', libelle: 'Rendez vous tenus', type: 'calcule', calcul: 'rdv_tenus', cible: 4, unite: '', couleur: '#ecbc06', ordre: 3, actif: true },
  { id: 'propositions_envoyees', libelle: 'Propositions envoyées', type: 'calcule', calcul: 'propositions_envoyees', cible: 3, unite: '', couleur: '#fd6455', ordre: 4, actif: true },
  { id: 'ca_encaisse', libelle: "Chiffre d'affaires encaissé", type: 'calcule', calcul: 'ca_encaisse', cible: 1000, unite: '€', couleur: '#3fbf7f', ordre: 5, actif: true },
  { id: 'flyers', libelle: 'Flyers distribués', type: 'manuel', calcul: null, cible: 100, unite: '', couleur: '#ffe56c', ordre: 6, actif: true },
];

export function idSaisie(objectifId, mois) {
  return `${objectifId}_${mois}`;
}

export function valeurObjectif(objectif, { donnees = {}, saisies = [], mois }) {
  if (objectif.type === 'manuel') {
    const s = saisies.find((x) => x.objectifId === objectif.id && x.mois === mois);
    return Number(s?.valeur) || 0;
  }
  const c = CALCULS[objectif.calcul];
  return c ? c.calculer(donnees, mois, objectif) : 0;
}

export function progression(valeur, cible) {
  const c = Number(cible) || 0;
  if (c <= 0) return valeur > 0 ? 100 : 0;
  return Math.round((Number(valeur) / c) * 100);
}

/** Objectifs qui viennent de franchir 100 % (sous puis au dessus) entre deux relevés. */
export function objectifsFranchis(avant, apres, objectifs) {
  return objectifs.filter((o) => {
    if (!(o.id in avant) || !(o.id in apres)) return false;
    return progression(avant[o.id], o.cible) < 100 && progression(apres[o.id], o.cible) >= 100;
  });
}

export function objectifsActifsTries(objectifs, config) {
  return [...(objectifs || [])].filter((o) => o.actif !== false && (config === undefined || objectifDisponible(o, config))).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
}

// ---------------------------------------------------------------- statistiques et graphique

/** Affaires par étape active, dans l'ordre des étapes (une étape vide compte zéro). */
export function compterParEtape(affaires, config) {
  return etapesActives(config).map((e) => ({ ...e, nombre: affaires.filter((a) => a.etape === e.id).length }));
}

/**
 * Mois du graphique du chiffre d'affaires : de max(début d'activité, mois courant - (n-1)) au mois courant.
 * Aucun mois antérieur au début d'activité n'apparaît jamais ; avant le début, un seul mois (le début).
 */
export function fenetreCa(debutActivite, moisActuel, n = 6) {
  const debut = /^\d{4}-\d{2}$/.test(debutActivite || '') ? debutActivite : moisActuel;
  const fin = moisActuel < debut ? debut : moisActuel;
  const plancher = decalerMois(fin, -(n - 1));
  let depart = debut > plancher ? debut : plancher;
  const mois = [];
  while (depart <= fin) {
    mois.push(depart);
    depart = decalerMois(depart, 1);
  }
  return mois;
}

export function caParMois(affaires, moisListe, projets = []) { // chiffre d'affaires ENCAISSÉ
  return moisListe.map((mois) => ({
    mois,
    libelle: libelleMois(mois, true),
    montant: CALCULS.ca_encaisse.calculer({ affaires, projets }, mois),
  }));
}

export function totauxColonne(affaires) {
  return { nombre: affaires.length, montant: affaires.reduce((s, a) => s + (Number(a.montant) || 0), 0) };
}

// ---------------------------------------------------------------- filtres

export const CRITERES_PERSONNES_VIDES = Object.freeze({
  recherche: '', etiquettes: [], organisations: [], sources: [], villes: [], archives: false,
});
export const CRITERES_ORGANISATIONS_VIDES = Object.freeze({
  recherche: '', etiquettes: [], secteurs: [], villes: [], archives: false,
});
export const CRITERES_AFFAIRES_VIDES = Object.freeze({
  recherche: '', etapes: [], statuts: [], priorites: [], offres: [], sources: [], personnes: [], organisations: [],
  enRetard: false, sansAction: false, semaine: false, archives: false,
});

const VIDES = { personnes: CRITERES_PERSONNES_VIDES, organisations: CRITERES_ORGANISATIONS_VIDES, affaires: CRITERES_AFFAIRES_VIDES };

export function criteresComplets(liste, c = {}) {
  const base = VIDES[liste];
  const complet = {};
  for (const [cle, valeur] of Object.entries(base)) {
    complet[cle] = Array.isArray(valeur) ? [...(c[cle] || [])] : (c[cle] ?? valeur);
  }
  return complet;
}

export function criteresActifs(liste, c) {
  const complet = criteresComplets(liste, c);
  return Object.entries(complet).some(([, v]) => (Array.isArray(v) ? v.length : !!v));
}

const inter = (liste, valeur) => !liste.length || liste.includes(valeur);
const interAvec = (liste, valeurs) => !liste.length || (valeurs || []).some((v) => liste.includes(v));

function recherchePersonne(p, orgNom) {
  return normaliser([p.nom, orgNom, p.ville, ...(p.emails || []).map((e) => e.valeur), ...(p.telephones || []).map((t) => t.valeur)].join(' \u0001 '));
}

function correspond(botte, recherche) {
  const q = normaliser(recherche);
  return !q || q.split(/\s+/).every((mot) => botte.includes(mot));
}

export function filtrerPersonnes(personnes, criteres, { organisations = [] } = {}) {
  const c = criteresComplets('personnes', criteres);
  const orgs = new Map(organisations.map((o) => [o.id, o]));
  return personnes.filter((p) => {
    if (c.archives ? !estArchivee(p) : estArchivee(p)) return false;
    if (!correspond(recherchePersonne(p, orgs.get(p.organisationId)?.nom), c.recherche)) return false;
    if (!interAvec(c.etiquettes, p.etiquettes)) return false;
    if (!inter(c.organisations, p.organisationId)) return false;
    if (!inter(c.sources, p.source)) return false;
    if (!inter(c.villes, p.ville)) return false;
    return true;
  });
}

export function filtrerOrganisations(organisations, criteres) {
  const c = criteresComplets('organisations', criteres);
  return organisations.filter((o) => {
    if (c.archives ? !estArchivee(o) : estArchivee(o)) return false;
    if (!correspond(normaliser([o.nom, o.ville, o.adresse].join(' \u0001 ')), c.recherche)) return false;
    if (!interAvec(c.etiquettes, o.etiquettes)) return false;
    if (!inter(c.secteurs, o.secteur)) return false;
    if (!inter(c.villes, o.ville)) return false;
    return true;
  });
}

/** contexte : { activites, personnes, organisations, aujourdhui } */
export function filtrerAffaires(affaires, criteres, { activites = [], personnes = [], organisations = [], aujourdhui } = {}) {
  const c = criteresComplets('affaires', criteres);
  const pers = new Map(personnes.map((p) => [p.id, p]));
  const orgs = new Map(organisations.map((o) => [o.id, o]));
  const dimanche = aujourdhui ? dimancheDeLaSemaine(aujourdhui) : null;
  return affaires.filter((a) => {
    if (c.archives ? !estArchivee(a) : estArchivee(a)) return false;
    const botte = normaliser([a.titre, pers.get(a.personneId)?.nom, orgs.get(a.organisationId)?.nom].join(' \u0001 '));
    if (!correspond(botte, c.recherche)) return false;
    if (!inter(c.etapes, a.etape)) return false;
    if (!inter(c.statuts, a.statut)) return false;
    if (!inter(c.priorites, a.priorite)) return false;
    if (!inter(c.offres, a.offreId)) return false;
    if (!inter(c.sources, a.source)) return false;
    if (!inter(c.personnes, a.personneId)) return false;
    if (!inter(c.organisations, a.organisationId)) return false;
    const siennes = activitesAVenir(activitesDeAffaire(activites, a.id));
    if (c.enRetard && !(aujourdhui && siennes.some((x) => estActiviteEnRetard(x, aujourdhui)))) return false;
    if (c.sansAction && !(estAffaireActive(a) && !siennes.length)) return false;
    if (c.semaine && !(dimanche && estAffaireActive(a) && siennes.some((x) => x.date <= dimanche))) return false;
    return true;
  });
}

export function pastillesFiltres(liste, criteres, { offres = [], etiquettes = [], personnes = [], organisations = [], config } = {}) {
  const c = criteresComplets(liste, criteres);
  const p = [];
  const nomPersonne = (id) => personnes.find((x) => x.id === id)?.nom ?? id;
  const nomOrg = (id) => organisations.find((x) => x.id === id)?.nom ?? id;
  if (c.recherche) p.push({ cle: 'recherche', valeur: c.recherche, libelle: `Recherche : ${c.recherche}` });
  (c.etiquettes || []).forEach((v) => p.push({ cle: 'etiquettes', valeur: v, libelle: `Étiquette : ${libelleEtiquette(etiquettes, v)}` }));
  (c.organisations || []).forEach((v) => p.push({ cle: 'organisations', valeur: v, libelle: `Organisation : ${nomOrg(v)}` }));
  (c.sources || []).forEach((v) => p.push({ cle: 'sources', valeur: v, libelle: `Source : ${v}` }));
  (c.secteurs || []).forEach((v) => p.push({ cle: 'secteurs', valeur: v, libelle: `Secteur : ${v}` }));
  (c.villes || []).forEach((v) => p.push({ cle: 'villes', valeur: v, libelle: `Ville : ${v}` }));
  (c.etapes || []).forEach((v) => p.push({ cle: 'etapes', valeur: v, libelle: `Étape : ${libelleEtape(v, config)}` }));
  (c.statuts || []).forEach((v) => p.push({ cle: 'statuts', valeur: v, libelle: `Statut : ${libelleStatut(v)}` }));
  (c.priorites || []).forEach((v) => p.push({ cle: 'priorites', valeur: v, libelle: `Priorité : ${libellePriorite(v)}` }));
  (c.offres || []).forEach((v) => p.push({ cle: 'offres', valeur: v, libelle: `Offre : ${libelleOffre(offres, v)}` }));
  (c.personnes || []).forEach((v) => p.push({ cle: 'personnes', valeur: v, libelle: `Personne : ${nomPersonne(v)}` }));
  if (c.enRetard) p.push({ cle: 'enRetard', valeur: true, libelle: 'En retard' });
  if (c.sansAction) p.push({ cle: 'sansAction', valeur: true, libelle: 'Sans action prévue' });
  if (c.semaine) p.push({ cle: 'semaine', valeur: true, libelle: 'À relancer cette semaine' });
  if (c.archives) p.push({ cle: 'archives', valeur: true, libelle: 'Archivées' });
  return p;
}

/** Retire une pastille des critères. */
export function retirerCritere(liste, criteres, cle, valeur) {
  const c = criteresComplets(liste, criteres);
  if (Array.isArray(c[cle])) c[cle] = c[cle].filter((v) => v !== valeur);
  else c[cle] = VIDES[liste][cle];
  return c;
}

// ---------------------------------------------------------------- tri des listes

export function trier(lignes, cle, sens = 'asc') {
  const s = sens === 'desc' ? -1 : 1;
  return [...lignes].sort((a, b) => {
    const va = cle(a);
    const vb = cle(b);
    const videA = va === null || va === '' || va === undefined;
    const videB = vb === null || vb === '' || vb === undefined;
    if (videA && videB) return 0;
    if (videA) return 1; // les valeurs vides toujours à la fin
    if (videB) return -1;
    if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * s;
    return String(va).localeCompare(String(vb), 'fr') * s;
  });
}

// ---------------------------------------------------------------- intégrité des liens

export function affairesDeLaPersonne(affaires, personneId) {
  return (affaires || []).filter((a) => a.personneId === personneId);
}

export function personnesDeLOrganisation(personnes, organisationId) {
  return (personnes || []).filter((p) => p.organisationId === organisationId);
}

/** Suppression d'une organisation : refusée tant qu'elle a des personnes ou des affaires. */
export function verifierSuppressionOrganisation(organisationId, { personnes = [], affaires = [] }) {
  const np = personnesDeLOrganisation(personnes, organisationId).length;
  const na = (affaires || []).filter((a) => a.organisationId === organisationId).length;
  if (!np && !na) return { ok: true, personnes: 0, affaires: 0, raison: '' };
  const morceaux = [];
  if (np) morceaux.push(`${np} personne${np > 1 ? 's' : ''}`);
  if (na) morceaux.push(`${na} affaire${na > 1 ? 's' : ''}`);
  return {
    ok: false,
    personnes: np,
    affaires: na,
    raison: `Cette organisation a encore ${morceaux.join(' et ')}. Archive-la, ou détache d'abord ses personnes et ses affaires.`,
  };
}

/**
 * Suppression d'une personne. choix : "affaires" (supprime aussi ses affaires et leurs activités, notes
 * et événements) ou "conserver" (les affaires restent, rattachées à leur organisation seule).
 * Renvoie ce que donnees.js doit faire : { supprimerAffaires, detacherAffaires }.
 */
export function planSuppressionPersonne(personneId, affaires, choix) {
  const siennes = affairesDeLaPersonne(affaires, personneId);
  if (!siennes.length) return { supprimerAffaires: [], detacherAffaires: [] };
  if (choix === 'affaires') return { supprimerAffaires: siennes.map((a) => a.id), detacherAffaires: [] };
  if (choix === 'conserver') return { supprimerAffaires: [], detacherAffaires: siennes.map((a) => a.id) };
  throw new Error('Choisis ce que deviennent ses affaires.');
}

/** Confirmation de suppression définitive : le nom tapé est comparé sans accents ni casse. */
export function confirmationValide(saisie, nom) {
  const n = normaliserNom(nom);
  return n !== '' && normaliserNom(saisie) === n;
}

// ---------------------------------------------------------------- enchaînements d'écriture (écran ET serveur MCP)
//
// Chaque « plan » calcule, sans rien écrire, la liste des écritures d'une action (documents créés, champs changés, documents supprimés,
// événements du fil). L'écran (donnees.js) et le serveur MCP (functions/) exécutent EXACTEMENT les mêmes plans : une règle ne s'écrit
// qu'ici. Les lectures (liens à supprimer, étape actuelle…) restent à la charge de l'appelant, qui passe ce qu'il a lu.
// Une écriture : { type: 'creer' | 'modifier' | 'supprimer', collection, id, donnees | patch, horodater?: [champs], signer?: [champs] }.
// `horodater` : champs qui reçoivent l'heure du serveur ; `signer` : champs qui reçoivent l'acteur (e-mail à l'écran, nom du jeton côté MCP).
// ctx : le contexte habituel + `nouvelId(collection)` (identifiant frais) ; `proprietaire` (facultatif) remplace `auteur` comme propriétaire d'une fiche créée.

export const COLLECTIONS_PLAN = {
  personnes: 'crm_personnes',
  organisations: 'crm_organisations',
  affaires: 'crm_affaires',
  activites: 'crm_activites',
  notes: 'crm_notes',
  evenements: 'crm_evenements',
  // Module Projets (cadrage-projets.md) : mêmes plans, mêmes règles d'écriture, un seul code pour l'écran et le serveur MCP.
  projets: 'projets_projets',
  projetsTaches: 'projets_taches',
  projetsModeles: 'projets_modeles',
};
const C = COLLECTIONS_PLAN;
export const MARQUES_CREATION = { horodater: ['creeLe', 'modifieLe'], signer: ['creePar', 'modifiePar'] };
export const MARQUES_MODIFICATION = { horodater: ['modifieLe'], signer: ['modifiePar'] };

export const ecritureCreer = (collection, id, donnees, marques = {}) => ({ type: 'creer', collection, id, donnees, ...marques });
export const ecritureModifier = (collection, id, patch, marques = {}) => ({ type: 'modifier', collection, id, patch, ...marques });
export const ecritureSupprimer = (collection, id) => ({ type: 'supprimer', collection, id });
/** Écritures de création des événements du fil (un identifiant frais par événement). */
export const evenements = (liste, ctx) => (liste || []).map((e) => ecritureCreer(C.evenements, ctx.nouvelId(C.evenements), e));
export const modifierSiPatch = (collection, id, patch, marques) => (Object.keys(patch || {}).length ? [ecritureModifier(collection, id, patch, marques)] : []);

/**
 * Projets gardés quand une fiche du CRM disparaît : le projet reste, seul le lien vers la fiche supprimée est vidé
 * (cadrage-projets.md 6.3). Une seule écriture par projet, même si deux liens tombent en même temps.
 * `projets` : [{ id, affaireId, personneId, organisationId }] lus par l'appelant.
 */
function detacherProjets(projets, { affaireIds = new Set(), personneId = null, organisationId = null }) {
  const uniques = [...new Map((projets || []).map((p) => [p.id, p])).values()];
  return uniques.flatMap((p) => {
    const patch = {};
    if (p.affaireId && affaireIds.has(p.affaireId)) patch.affaireId = null;
    if (personneId && p.personneId === personneId) patch.personneId = null;
    if (organisationId && p.organisationId === organisationId) patch.organisationId = null;
    return modifierSiPatch(C.projets, p.id, patch, MARQUES_MODIFICATION);
  });
}

/** Un élément du fil qui appartient à un projet (`projetId`) n'est jamais supprimé avec une fiche du CRM : on vide seulement ses liens. */
function liensVides(lien, { affaireIds = new Set(), personneId = null, organisationId = null }) {
  const patch = {};
  if (lien.affaireId && affaireIds.has(lien.affaireId)) patch.affaireId = null;
  if (personneId && lien.personneId === personneId) patch.personneId = null;
  if (organisationId && lien.organisationId === organisationId) patch.organisationId = null;
  return patch;
}

// ---- personnes

export function planCreerPersonne(valeurs, ctx) {
  const id = ctx.nouvelId(C.personnes);
  return {
    id,
    ecritures: [
      ecritureCreer(C.personnes, id, nouvellePersonne(valeurs, ctx), MARQUES_CREATION),
      ...evenements([evenementCreation('personne_creee', `Personne créée : ${nettoyerEspaces(valeurs.nom)}`, { personneId: id, organisationId: valeurs.organisationId || null }, ctx)], ctx),
    ],
  };
}

export const planMajPersonne = (id, patch) => ({ ecritures: modifierSiPatch(C.personnes, id, patch, MARQUES_MODIFICATION) });

export function planEmailEnvoye(personne, ctx) {
  return { ecritures: evenements([evenementEmailEnvoye(personne, ctx)], ctx) };
}

export function planOppositionPersonne(personne, coche, ctx) {
  const liens = { personneId: personne.id, organisationId: personne.organisationId ?? null };
  return {
    ecritures: [
      ecritureModifier(C.personnes, personne.id, marquerOpposition(coche, ctx), MARQUES_MODIFICATION),
      ...(coche ? evenements([evenementCreation('opposition', 'Opposition à la prospection enregistrée', liens, ctx)], ctx) : []),
    ],
  };
}

/**
 * Suppression définitive d'une personne (voir planSuppressionPersonne pour `choix`). `liens` : les activités, notes et événements
 * lus par l'appelant qui portent un lien vers la personne OU vers l'une de ses affaires : [{ collection, id, personneId, affaireId, projetId }].
 * `projets` : les projets liés à la personne ou à l'une de ses affaires : ils sont gardés, leur lien est vidé.
 * D'abord les détachements, puis les suppressions (affaires supprimées avec leur fil, fil de la personne, la personne).
 */
export function planSupprimerPersonne({ personneId, choix, affaires, liens = [], projets = [] }) {
  const plan = planSuppressionPersonne(personneId, affaires, choix);
  const supprimees = new Set(plan.supprimerAffaires);
  const gardees = new Set(plan.detacherAffaires);
  const uniques = [...new Map(liens.map((l) => [`${l.collection}/${l.id}`, l])).values()];
  const detachements = [];
  const suppressions = [];
  for (const aid of gardees) detachements.push(ecritureModifier(C.affaires, aid, { personneId: null }, MARQUES_MODIFICATION));
  detachements.push(...detacherProjets(projets, { affaireIds: supprimees, personneId }));
  for (const l of uniques) {
    if (l.projetId) { // fil d'un projet : gardé, ses liens vers ce qui disparaît sont vidés
      detachements.push(...modifierSiPatch(l.collection, l.id, liensVides(l, { affaireIds: supprimees, personneId })));
    } else if (supprimees.has(l.affaireId)) suppressions.push(ecritureSupprimer(l.collection, l.id)); // fil d'une affaire supprimée
    else if (l.personneId === personneId && gardees.has(l.affaireId)) detachements.push(ecritureModifier(l.collection, l.id, { personneId: null }));
    else if (l.personneId === personneId) suppressions.push(ecritureSupprimer(l.collection, l.id));
  }
  for (const aid of supprimees) suppressions.push(ecritureSupprimer(C.affaires, aid));
  suppressions.push(ecritureSupprimer(C.personnes, personneId));
  return { ...plan, ecritures: [...detachements, ...suppressions] };
}

// ---- organisations

export function planCreerOrganisation(valeurs, ctx) {
  const id = ctx.nouvelId(C.organisations);
  return {
    id,
    ecritures: [
      ecritureCreer(C.organisations, id, nouvelleOrganisation(valeurs, ctx), MARQUES_CREATION),
      ...evenements([evenementCreation('organisation_creee', `Organisation créée : ${nettoyerEspaces(valeurs.nom)}`, { organisationId: id }, ctx)], ctx),
    ],
  };
}

export const planMajOrganisation = (id, patch) => ({ ecritures: modifierSiPatch(C.organisations, id, patch, MARQUES_MODIFICATION) });

/** Refus (`refus` = message) tant que l'organisation a des personnes ou des affaires. `liens` : documents portant son organisationId ; `projets` : projets gardés, leur lien est vidé. */
export function planSupprimerOrganisation({ organisationId, personnes, affaires, liens = [], projets = [] }) {
  const verif = verifierSuppressionOrganisation(organisationId, { personnes, affaires });
  if (!verif.ok) return { refus: verif.raison, ecritures: [] };
  const siens = liens.filter((l) => l.organisationId === organisationId);
  const detachements = [
    ...detacherProjets(projets, { organisationId }),
    ...siens.filter((l) => l.projetId).flatMap((l) => modifierSiPatch(l.collection, l.id, liensVides(l, { organisationId }))),
  ];
  const suppressions = siens.filter((l) => !l.projetId).map((l) => ecritureSupprimer(l.collection, l.id));
  return { ecritures: [...detachements, ...suppressions, ecritureSupprimer(C.organisations, organisationId)] };
}

// ---- affaires

/**
 * Valeurs d'une nouvelle affaire d'après un modèle d'affaire : le modèle donne l'offre, l'étape, la priorité, le montant et le besoin de départ ;
 * ce que l'appelant renseigne (non vide) l'emporte toujours. Un modèle désactivé ou une étape devenue inactive ne posent rien.
 */
export function valeursDepuisModeleAffaire(modele, valeurs = {}, config) {
  if (!modele) return valeurs;
  const vide = (v) => v === undefined || v === null || v === '';
  const du = { offreId: modele.offreId, priorite: modele.priorite, montant: modele.montant, besoin: modele.besoin };
  if (modele.etape && etapeActive(modele.etape, config)) du.etape = modele.etape;
  const fusion = { ...valeurs };
  for (const [cle, valeur] of Object.entries(du)) if (vide(fusion[cle]) && !vide(valeur)) fusion[cle] = valeur;
  return fusion;
}

/** Activités à créer avec une affaire née d'un modèle : la date est celle d'aujourd'hui plus le délai du modèle. */
function ecrituresActivitesModeleAffaire(modele, liens, ctx) {
  if (!modele) return [];
  const aujourdhui = aujourdhuiParis(ctx.maintenant);
  return (modele.activites || []).map((a) => {
    const id = ctx.nouvelId(C.activites);
    const delai = Number.isInteger(Number(a.delaiJours)) ? Number(a.delaiJours) : 0;
    return ecritureCreer(C.activites, id, nouvelleActivite({ type: a.type, titre: a.titre, date: ajouterJours(aujourdhui, delai), ...liens }, ctx), { horodater: ['creeLe'] });
  });
}

/**
 * `personnes` et `organisations` : les fiches connues de l'appelant (l'organisation de la personne est héritée si aucune n'est donnée).
 * `modele` (facultatif) : un modèle d'affaire ; il préremplit l'affaire et en crée les activités types.
 */
export function planCreerAffaire(valeurs, { personnes = [], organisations = [], modele = null } = {}, ctx) {
  const plein = valeursDepuisModeleAffaire(modele, valeurs, configDe(ctx));
  const p = plein.personneId ? personnes.find((x) => x.id === plein.personneId) || null : null;
  const organisationId = plein.organisationId || p?.organisationId || null;
  const org = organisationId ? organisations.find((x) => x.id === organisationId) || null : null;
  const titre = nettoyerEspaces(plein.titre) || titreParDefaut({ organisation: org, personne: p });
  const fiche = nouvelleAffaire({ ...plein, titre, organisationId }, ctx);
  const id = ctx.nouvelId(C.affaires);
  return {
    id,
    titre,
    ecritures: [
      ecritureCreer(C.affaires, id, fiche, MARQUES_CREATION),
      ...evenements([evenementCreation('affaire_creee', `Affaire créée : ${titre}`, { personneId: fiche.personneId, organisationId, affaireId: id }, ctx)], ctx),
      ...ecrituresActivitesModeleAffaire(modele, { personneId: fiche.personneId, organisationId, affaireId: id }, ctx),
    ],
  };
}

// ---- modèles d'affaire (réglages : `crm_parametres/modeles_affaire`, liste `items`)
// Un modèle d'affaire = un nom, une offre, une étape de départ, une priorité, un montant, un besoin et des activités types (type, titre, délai en jours).

export function validerModeleAffaire(v = {}, config) {
  const erreurs = {};
  if (!nettoyerEspaces(v.nom)) erreurs.nom = 'Le nom est obligatoire.';
  if (v.priorite && !PRIORITES.some((p) => p.id === v.priorite)) erreurs.priorite = 'Priorité inconnue.';
  if (v.etape && !etapeActive(v.etape, config)) erreurs.etape = 'Étape inconnue ou désactivée.';
  const m = v.montant;
  if (m !== null && m !== undefined && m !== '' && !(Number.isFinite(Number(m)) && Number(m) >= 0)) erreurs.montant = 'Le montant doit être un nombre positif.';
  return erreurs;
}

export function validerActiviteModele(v = {}) {
  const erreurs = {};
  if (!nettoyerEspaces(v.titre)) erreurs.titre = 'Le titre est obligatoire.';
  if (!TYPES_ACTIVITE.some((t) => t.id === v.type)) erreurs.type = 'Le type est obligatoire.';
  const d = v.delaiJours;
  if (d !== null && d !== undefined && d !== '' && !(Number.isInteger(Number(d)) && Number(d) >= 0 && Number(d) <= 3650)) erreurs.delaiJours = 'Le délai est un nombre de jours entre 0 et 3650.';
  return erreurs;
}

/** Modèle d'affaire propre à enregistrer (identifiant, ordre et activités conservées ou vides). */
export function nouveauModeleAffaire(valeurs, { id, ordre = 1 } = {}) {
  const montant = valeurs.montant === '' || valeurs.montant === null || valeurs.montant === undefined ? null : Number(valeurs.montant);
  return {
    id, nom: nettoyerEspaces(valeurs.nom), offreId: valeurs.offreId || null, etape: valeurs.etape || null,
    priorite: PRIORITES.some((p) => p.id === valeurs.priorite) ? valeurs.priorite : 'tiede',
    montant: Number.isFinite(montant) ? montant : null, besoin: String(valeurs.besoin ?? '').trim(),
    activites: (valeurs.activites || []).map((a) => ({
      id: a.id, type: TYPES_ACTIVITE.some((t) => t.id === a.type) ? a.type : 'tache', titre: nettoyerEspaces(a.titre),
      delaiJours: a.delaiJours === '' || a.delaiJours === null || a.delaiJours === undefined ? 0 : Number(a.delaiJours),
    })),
    actif: valeurs.actif !== false, ordre,
  };
}

export const modelesAffaireActifs = (modeles) => (modeles || []).filter((m) => m.actif !== false).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));

export const planMajAffaire = (id, patch) => ({ ecritures: modifierSiPatch(C.affaires, id, patch, MARQUES_MODIFICATION) });

/** Applique le résultat d'une règle d'affaire ({ erreurs?, patch, evenements }) : le patch sur l'affaire puis les événements du fil. */
export function planResultatAffaire(affaireId, resultat, ctx) {
  if (resultat.erreurs && Object.keys(resultat.erreurs).length) return { ...resultat, ecritures: [] };
  return { ...resultat, ecritures: [...modifierSiPatch(C.affaires, affaireId, resultat.patch, MARQUES_MODIFICATION), ...evenements(resultat.evenements, ctx)] };
}
export const planChangerEtape = (affaire, etape, ctx, options = {}) => planResultatAffaire(affaire.id, changementEtape(affaire, etape, ctx, options), ctx);
export const planMarquerPerdue = (affaire, saisie, ctx) => planResultatAffaire(affaire.id, marquerPerdue(affaire, saisie, ctx), ctx);
export const planMettreEnPause = (affaire, saisie, ctx) => planResultatAffaire(affaire.id, mettreEnPause(affaire, saisie, ctx), ctx);
export const planRouvrirAffaire = (affaire, ctx) => planResultatAffaire(affaire.id, rouvrirAffaire(affaire, ctx), ctx);

/**
 * Suppression définitive d'une affaire et de son fil. `liens` : documents portant son affaireId ; `projets` : projets liés à l'affaire,
 * gardés avec leur fil (leur `affaireId` est vidé).
 */
export function planSupprimerAffaire({ affaireId, liens = [], projets = [] }) {
  const siens = [...new Map(liens.filter((l) => l.affaireId === affaireId).map((l) => [`${l.collection}/${l.id}`, l])).values()];
  const affaireIds = new Set([affaireId]);
  const detachements = [
    ...detacherProjets(projets, { affaireIds }),
    ...siens.filter((l) => l.projetId).flatMap((l) => modifierSiPatch(l.collection, l.id, liensVides(l, { affaireIds }))),
  ];
  const suppressions = siens.filter((l) => !l.projetId).map((l) => ecritureSupprimer(l.collection, l.id));
  return { ecritures: [...detachements, ...suppressions, ecritureSupprimer(C.affaires, affaireId)] };
}

// ---- activités

export function planCreerActivite(valeurs, ctx) {
  const id = ctx.nouvelId(C.activites);
  return { id, ecritures: [ecritureCreer(C.activites, id, nouvelleActivite(valeurs, ctx), { horodater: ['creeLe'] })] };
}

export function planActiviteFaite(activite, ctx) {
  const r = activiteFaite(activite, ctx);
  return { ...r, ecritures: [...modifierSiPatch(C.activites, activite.id, r.patch), ...evenements(r.evenements, ctx)] };
}

export const planMajActivite = (id, patch) => ({ ecritures: modifierSiPatch(C.activites, id, patch) });
export const planSupprimerActivite = (id) => ({ ecritures: [ecritureSupprimer(C.activites, id)] });

// ---- notes

export function planCreerNote(texte, liens, ctx) {
  const id = ctx.nouvelId(C.notes);
  return { id, ecritures: [ecritureCreer(C.notes, id, nouvelleNote(texte, liens, ctx), { horodater: ['creeLe', 'modifieLe'] })] };
}

export const planMajNote = (id, texte) => ({ ecritures: [ecritureModifier(C.notes, id, { texte: String(texte).trim() }, { horodater: ['modifieLe'] })] });
export const planSupprimerNote = (id) => ({ ecritures: [ecritureSupprimer(C.notes, id)] });

// ---------------------------------------------------------------- audit des écritures faites à l'écran
//
// Chaque action de l'écran écrit, DANS LE MÊME LOT que les données, une ligne dans crm_audit (qui, quand, quoi, quel document) et une
// copie « avant / après » dans crm_audit_avant (effacée après 90 jours). Même schéma que le serveur MCP : lire_audit et
// restaurer_depuis_audit comprennent aussi les actions de l'écran. Les fonctions ci-dessous sont pures : l'écran leur donne
// ses valeurs « serveur » (horodatage Firebase, e-mail du compte), les tests des dates ordinaires.

export const JOURS_COPIES_AUDIT = 90;
export const CANAL_ECRAN = 'ecran';

/** Document « après » d'une écriture : null pour une suppression ; `avant` sert pour une modification (champs fusionnés, comme Firestore). */
export function documentApres(op, avant, { horodatage, acteur }) {
  const marques = {};
  for (const champ of op.horodater || []) marques[champ] = horodatage;
  for (const champ of op.signer || []) marques[champ] = acteur;
  if (op.type === 'creer') return { ...op.donnees, ...marques };
  if (op.type === 'modifier') return { ...(avant || {}), ...op.patch, ...marques };
  return null;
}

/**
 * Écritures d'audit d'une action : un tableau par écriture de données, [ligne d'audit, copie avant/après], au même ordre que `ecritures`.
 * `avants` : { 'collection/id': document avant | null } (les créations n'en ont pas).
 * `contexte` : { acteur, outil, operationId, maintenant (Date), horodatage (valeur « heure du serveur »), nouvelId(collection) }.
 */
export function construireAudit(ecritures, avants, { acteur, outil, operationId, maintenant, horodatage, nouvelId }) {
  const expireAt = new Date(maintenant.getTime() + JOURS_COPIES_AUDIT * 86_400_000);
  const action = { creer: 'creer', modifier: 'modifier', supprimer: 'supprimer' };
  return ecritures.map((op, i) => {
    const avant = avants?.[`${op.collection}/${op.id}`] ?? null;
    const apres = documentApres(op, avant, { horodatage, acteur });
    const champs = op.type === 'modifier' ? [...new Set([...Object.keys(op.patch || {}), ...(op.horodater || []), ...(op.signer || [])])]
      : op.type === 'creer' ? Object.keys(apres) : [];
    const id = nouvelId('crm_audit');
    return [
      {
        type: 'creer', collection: 'crm_audit', id, horodater: ['date'],
        donnees: {
          operationId, ordre: i + 1, acteur, jeton: CANAL_ECRAN, via: CANAL_ECRAN, outil, collection: op.collection, docId: op.id,
          action: action[op.type], statut: 'succes', champsModifies: champs, parametresRecus: [],
        },
      },
      { type: 'creer', collection: 'crm_audit_avant', id, donnees: { operationId, collection: op.collection, docId: op.id, avant, apres, expireAt } },
    ];
  });
}

// ---------------------------------------------------------------- écran Journal (lecture seule)
// Les lignes du journal (une par document touché) sont regroupées par opération : une action de l'écran ou un appel d'outil du serveur.

const NOMS_DOCUMENTS = {
  crm_personnes: ['personne', 'personnes'], crm_organisations: ['organisation', 'organisations'], crm_affaires: ['affaire', 'affaires'],
  crm_activites: ['activité', 'activités'], crm_notes: ['note', 'notes'], crm_evenements: ['événement', 'événements'],
  projets_projets: ['projet', 'projets'], projets_taches: ['tâche de projet', 'tâches de projet'], projets_modeles: ['modèle de projet', 'modèles de projet'],
};
const ACTIONS_JOURNAL = { creer: 'Création', modifier: 'Modification', supprimer: 'Suppression', restaurer: 'Restauration' };

export function libelleDocumentJournal(collection, pluriel = false) {
  const n = NOMS_DOCUMENTS[collection];
  return n ? n[pluriel ? 1 : 0] : String(collection ?? 'document');
}

export const libelleActionJournal = (action) => ACTIONS_JOURNAL[action] ?? String(action ?? '');

/** Qui a fait l'opération : les deux comptes par leur prénom, un jeton du serveur par son nom (ex. claude-code-jerome). */
export function libelleActeurJournal(ligne) {
  const acteur = String(ligne?.acteur ?? '');
  if (ligne?.via !== 'ecran') return acteur;
  return { 'jerome.chevalier@gmail.com': 'Jérôme', 'jeromebot.chevalierbot@gmail.com': 'Charles' }[acteur] ?? acteur;
}

export const libelleCanalJournal = (ligne) => (ligne?.via === 'mcp' ? 'MCP' : 'Appli');

/** « Suppression de 1 affaire, 1 événement · Modification de 2 activités » (actions dans l'ordre création, modification, suppression, restauration). */
export function resumeOperationJournal(lignes) {
  const parAction = new Map();
  for (const l of lignes) {
    const m = parAction.get(l.action) ?? new Map();
    m.set(l.collection, (m.get(l.collection) ?? 0) + 1);
    parAction.set(l.action, m);
  }
  return ['creer', 'modifier', 'supprimer', 'restaurer'].filter((a) => parAction.has(a)).map((a) => {
    const docs = [...parAction.get(a)].map(([c, n]) => `${n} ${libelleDocumentJournal(c, n > 1)}`).join(', ');
    return `${libelleActionJournal(a)} de ${docs}`;
  }).join(' · ');
}

/** « succes » (rien à signaler), « averifier » (opération restée en cours : peut-être incomplète) ou « echec ». */
export function statutOperationJournal(lignes) {
  if (lignes.some((l) => l.statut === 'echec')) return 'echec';
  if (lignes.some((l) => l.statut === 'en_cours')) return 'averifier';
  return 'succes';
}

/** Lignes du journal → opérations, la plus récente d'abord ; les lignes d'une opération suivent leur ordre d'écriture. */
export function grouperJournal(lignes) {
  const groupes = new Map();
  for (const l of lignes) {
    const cle = l.operationId || l.id;
    if (!groupes.has(cle)) groupes.set(cle, []);
    groupes.get(cle).push(l);
  }
  const ms = (l) => versDate(l.date)?.getTime() ?? 0;
  return [...groupes].map(([operationId, liste]) => {
    liste.sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || ms(a) - ms(b));
    const premiere = liste[0];
    return {
      operationId, lignes: liste, date: liste.reduce((m, l) => Math.max(m, ms(l)), 0), acteur: libelleActeurJournal(premiere), canal: libelleCanalJournal(premiere),
      outil: premiere.outil ?? '', statut: statutOperationJournal(liste), resume: resumeOperationJournal(liste),
    };
  }).sort((a, b) => b.date - a.date);
}

/** criteres : { canal: 'tous' | 'ecran' | 'mcp', aVerifier: bool, depuis: 'AAAA-MM-JJ', texte } ; le texte cherche dans qui, quel outil, quel type de fiche */
export function filtrerJournal(operations, { canal = 'tous', aVerifier = false, depuis = '', texte = '' } = {}) {
  const seuil = depuis ? versDate(`${depuis}T00:00`)?.getTime() ?? 0 : 0;
  const mots = normaliser(texte).split(/\s+/).filter(Boolean);
  return operations.filter((o) => {
    if (canal === 'ecran' && o.canal !== 'Appli') return false;
    if (canal === 'mcp' && o.canal !== 'MCP') return false;
    if (aVerifier && o.statut === 'succes') return false;
    if (seuil && o.date < seuil) return false;
    if (!mots.length) return true;
    const foin = normaliser([o.acteur, o.outil, o.canal, o.resume, o.operationId, ...o.lignes.flatMap((l) => [l.docId, l.collection, l.outil])].join(' '));
    return mots.every((m) => foin.includes(m));
  });
}

/** Valeur rendue comparable : dates en millisecondes, clés triées. */
function formeComparable(v) {
  if (v === undefined) return null;
  if (v === null || typeof v !== 'object') return v;
  if (v instanceof Date || typeof v.toDate === 'function' || typeof v.seconds === 'number') return { t: versDate(v)?.getTime() ?? null };
  if (Array.isArray(v)) return v.map(formeComparable);
  return Object.fromEntries(Object.keys(v).sort().map((k) => [k, formeComparable(v[k])]));
}

/** Champs qui diffèrent entre la copie « avant » et la copie « après » (null = document absent) : [{ champ, avant, apres }], par ordre alphabétique. */
export function differencesJournal(avant, apres) {
  const a = avant ?? {};
  const b = apres ?? {};
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort()
    .filter((champ) => JSON.stringify(formeComparable(a[champ])) !== JSON.stringify(formeComparable(b[champ])))
    .map((champ) => ({ champ, avant: a[champ], apres: b[champ] }));
}

/**
 * Ce qui a changé dans la liste des documents d'une affaire ou d'un projet, en phrases : « Favori ajouté : Suivi », « Document joint : Devis »,
 * « Document retiré : Devis ». Les documents sont reconnus par leur adresse. `avant` et `apres` : les listes (ou rien).
 */
export function changementsDocumentsJournal(avant, apres) {
  const liste = (v) => (Array.isArray(v) ? v.filter((d) => d && typeof d === 'object') : []);
  const nom = (d) => d.libelle || d.url || 'sans nom';
  const avants = new Map(liste(avant).map((d) => [d.url, d]));
  const apresMap = new Map(liste(apres).map((d) => [d.url, d]));
  const phrases = [];
  for (const [url, d] of apresMap) {
    const ancien = avants.get(url);
    if (!ancien) phrases.push(`Document joint${d.favori === true ? ' (en favori)' : ''} : ${nom(d)}`);
    else if (d.favori === true && ancien.favori !== true) phrases.push(`Favori ajouté : ${nom(d)}`);
    else if (d.favori !== true && ancien.favori === true) phrases.push(`Favori retiré : ${nom(d)}`);
  }
  for (const [url, d] of avants) if (!apresMap.has(url)) phrases.push(`Document retiré : ${nom(d)}`);
  return phrases;
}

/** Texte lisible d'une valeur de copie (date, liste, objet), tronqué pour ne pas noyer l'écran. */
export function formaterValeurJournal(v, max = 300) {
  if (v === undefined || v === null || v === '') return '—';
  if (v instanceof Date || (typeof v === 'object' && (typeof v.toDate === 'function' || typeof v.seconds === 'number'))) return formatDateHeure(v) || '—';
  if (typeof v === 'boolean') return v ? 'oui' : 'non';
  const t = typeof v === 'object' ? JSON.stringify(formeComparable(v)) : String(v);
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

// ---------------------------------------------------------------- export JSON et contacts

function versSerialisable(v) {
  if (v === null || v === undefined) return null;
  const d = typeof v === 'object' && !Array.isArray(v) ? versDateStricte(v) : null;
  if (d) return d.toISOString();
  if (Array.isArray(v)) return v.map(versSerialisable);
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, versSerialisable(x)]));
  return v;
}

function versDateStricte(v) {
  if (v instanceof Date) return v;
  if (typeof v.toDate === 'function') return v.toDate();
  if (typeof v.seconds === 'number' && 'nanoseconds' in v) return versDate(v);
  return null;
}

/** Sauvegarde complète : { version, exporteLe, collections: { nom: [documents avec id] } }, en texte JSON. */
export function exportJson(collections, maintenant = new Date()) {
  const sortie = {};
  for (const [nom, docs] of Object.entries(collections)) sortie[nom] = (docs || []).map((d) => versSerialisable(d));
  return JSON.stringify({ version: VERSION_EXPORT, exporteLe: maintenant.toISOString(), collections: sortie }, null, 2);
}

export function nomFichierExport(maintenant = new Date(), type = 'complet') {
  const jour = aujourdhuiParis(maintenant);
  const bases = {
    complet: ['chevalier-ia-os', 'json'],
    contacts: ['chevalier-ia-contacts', 'vcf'],
  };
  const [base, ext] = bases[type] || bases.complet;
  return `${base}-${jour}.${ext}`;
}

// ---------------------------------------------------------------- export des contacts vers le téléphone (.vcf)

/**
 * Personnes à envoyer au téléphone, non archivées : { nouvelles, modifiees }.
 * nouvelles = créées après le dernier export des contacts (toutes s'il n'y en a pas eu) ;
 * modifiees = déjà exportées (créées avant) mais modifiées depuis.
 */
export function personnesAExporterVcf(personnes, dernierExportContacts) {
  const depuis = versDate(dernierExportContacts);
  const nouvelles = [];
  const modifiees = [];
  for (const p of personnes || []) {
    if (p.archive || !String(p.nom || '').trim()) continue;
    if (!depuis) { nouvelles.push(p); continue; }
    const cree = versDate(p.creeLe);
    const modifie = versDate(p.modifieLe);
    if (!cree || cree.getTime() > depuis.getTime()) nouvelles.push(p);
    else if (modifie && modifie.getTime() > depuis.getTime()) modifiees.push(p);
  }
  return { nouvelles, modifiees };
}

function echapperVcf(valeur) {
  return String(valeur ?? '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

const TYPE_VCF = { travail: 'WORK', perso: 'HOME' };

/** Fichier de contacts vCard 3.0 (lu par Google Contacts et par les téléphones). Fins de ligne CRLF. */
export function vcardPersonnes(personnes, { organisations = [] } = {}) {
  const orgs = new Map(organisations.map((o) => [o.id, o.nom]));
  const cartes = personnes.map((p) => {
    const nom = String(p.nom || '').trim();
    const l = ['BEGIN:VCARD', 'VERSION:3.0'];
    if (p.id) l.push(`UID:chevalier-ia-os-${p.id}`);
    l.push(`N:${echapperVcf(p.nomFamille || '')};${echapperVcf(p.prenom || '')};;;`);
    l.push(`FN:${echapperVcf(nom)}`);
    const org = orgs.get(p.organisationId);
    if (org) l.push(`ORG:${echapperVcf(org)}`);
    for (const t of p.telephones || []) if (t.valeur) l.push(`TEL;TYPE=${TYPE_VCF[t.type] || 'OTHER'}:${echapperVcf(t.valeur)}`);
    for (const e of p.emails || []) if (e.valeur) l.push(`EMAIL;TYPE=${TYPE_VCF[e.type] || 'OTHER'}:${echapperVcf(e.valeur)}`);
    if (p.ville) l.push(`ADR;TYPE=HOME:;;;${echapperVcf(p.ville)};;;`);
    if (p.siteWeb) l.push(`URL:${echapperVcf(p.siteWeb)}`);
    l.push('END:VCARD');
    return l.join('\r\n');
  });
  return cartes.length ? `${cartes.join('\r\n')}\r\n` : '';
}

/** Rappel d'export : affiché si aucun export, ou si le dernier date de plus de 30 jours. */
export function rappelExportVisible(dernierExport, maintenant = new Date()) {
  const d = versDate(dernierExport);
  if (!d) return true;
  return maintenant.getTime() - d.getTime() > JOURS_RAPPEL_EXPORT * 86400000;
}
