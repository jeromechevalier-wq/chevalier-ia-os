// Logique pure du module Projets (version 2.1, voir docs/cadrage-projets.md) : phases, statuts, création, changements de phase,
// avancement, retard, intégrité des liens et plans d'écriture. Aucun accès à Firebase ni au navigateur : testé avec node --test.
// Même méthode que le CRM : l'écran (et plus tard le serveur MCP) ne contient AUCUNE règle métier, il exécute les plans d'ici.
// Les plans suivent la forme de ceux de crm/logique.js (écritures `creer` / `modifier` / `supprimer`), donc le même moteur d'écriture
// et le même audit s'appliquent.
import {
  COLLECTIONS_PLAN, MARQUES_CREATION, MARQUES_MODIFICATION,
  ecritureCreer, ecritureModifier, ecritureSupprimer, evenements, modifierSiPatch, evenementCreation,
  nettoyerEspaces, aujourdhuiParis, validerUrlGithub, validerUrlDossier, urlOuVide, normaliser, ajouterJours,
  planChangerEtape, planMarquerPerdue,
} from '../crm/logique.js';

const C = COLLECTIONS_PLAN;

// ---------------------------------------------------------------- référentiels
// Les phases se stockent par identifiant stable, jamais par libellé : le jour où elles deviendront configurables
// (crm_parametres/phases_projet), aucune donnée n'aura à migrer. Libellés et couleurs vivent dans cette seule liste.

export const PHASES = [
  { id: 'lancement', libelle: 'Lancement', couleur: '#b9adc9' },
  { id: 'decouverte', libelle: 'Découverte', couleur: '#b98ee0' },
  { id: 'livraison', libelle: 'Livraison', couleur: '#ecbc06' },
  { id: 'cloture', libelle: 'Clôture', couleur: '#3fbf7f' },
];
export const PHASE_DEPART = 'lancement';

export const STATUTS_PROJET = [
  { id: 'actif', libelle: 'Actif', couleur: '#b98ee0' },
  { id: 'en_pause', libelle: 'En pause', couleur: '#8a9bb4' },
  { id: 'termine', libelle: 'Terminé', couleur: '#3fbf7f' },
];

/** `livraison` : le travail pour le client (défaut). `extraction` : projet dont le but est d'extraire la valeur de sa source. */
export const NATURES_PROJET = [
  { id: 'livraison', libelle: 'Livraison' },
  { id: 'extraction', libelle: 'Extraction de valeur' },
];

/** À qui est confiée une tâche (le champ est prêt pour « tâches confiées à Charles »). */
export const ASSIGNES = [
  { id: 'jerome', libelle: 'Jérôme' },
  { id: 'charles', libelle: 'Charles' },
];
export const libelleAssigne = (id) => ASSIGNES.find((a) => a.id === id)?.libelle ?? id ?? '';

export const libellePhase = (id) => PHASES.find((p) => p.id === id)?.libelle ?? id ?? '';
export const couleurPhase = (id) => PHASES.find((p) => p.id === id)?.couleur ?? '#8d8993';
export const libelleStatutProjet = (id) => STATUTS_PROJET.find((s) => s.id === id)?.libelle ?? id ?? '';
export const libelleNature = (id) => NATURES_PROJET.find((n) => n.id === id)?.libelle ?? id ?? '';

const estJour = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));

// ---------------------------------------------------------------- création

/** Seul le titre est obligatoire. Les dates, si elles sont données, sont des jours « AAAA-MM-JJ » et la fin ne précède pas le début. */
export function validerProjet(v = {}) {
  const erreurs = {};
  if (!nettoyerEspaces(v.titre)) erreurs.titre = 'Le titre est obligatoire.';
  if (v.phase && !PHASES.some((p) => p.id === v.phase)) erreurs.phase = 'Phase inconnue.';
  if (v.nature && !NATURES_PROJET.some((n) => n.id === v.nature)) erreurs.nature = 'Nature inconnue.';
  if (v.dateDebut && !estJour(v.dateDebut)) erreurs.dateDebut = 'La date de début doit être au format AAAA-MM-JJ.';
  if (v.dateFin && !estJour(v.dateFin)) erreurs.dateFin = 'La date de fin doit être au format AAAA-MM-JJ.';
  if (!erreurs.dateDebut && !erreurs.dateFin && v.dateDebut && v.dateFin && v.dateFin < v.dateDebut) erreurs.dateFin = 'La fin ne peut pas précéder le début.';
  return erreurs;
}

/** Document d'un nouveau projet : phase, statut, nature et dates de départ posés automatiquement. */
export function nouveauProjet(valeurs, ctx) {
  const phase = PHASES.some((p) => p.id === valeurs.phase) ? valeurs.phase : PHASE_DEPART;
  return {
    titre: nettoyerEspaces(valeurs.titre),
    affaireId: valeurs.affaireId || null,
    personneId: valeurs.personneId || null,
    organisationId: valeurs.organisationId || null,
    phase,
    statut: 'actif',
    dateDebut: estJour(valeurs.dateDebut) ? valeurs.dateDebut : aujourdhuiParis(ctx.maintenant),
    dateFin: estJour(valeurs.dateFin) ? valeurs.dateFin : null,
    modeleId: valeurs.modeleId || null,
    offreId: valeurs.offreId || null,
    dateEntreePhase: ctx.maintenant,
    datesPhases: { [phase]: ctx.maintenant },
    documents: [],
    urlGithub: urlOuVide(validerUrlGithub, valeurs.urlGithub),
    urlDossier: urlOuVide(validerUrlDossier, valeurs.urlDossier),
    nature: NATURES_PROJET.some((n) => n.id === valeurs.nature) ? valeurs.nature : 'livraison',
    projetSourceId: valeurs.projetSourceId || null,
    // Un projet d'extraction d'une affaire perdue reprend la raison de la perte (point de départ de ses leçons).
    ...(valeurs.raisonPerdue ? { raisonPerdue: valeurs.raisonPerdue, raisonPerdueDetail: nettoyerEspaces(valeurs.raisonPerdueDetail) } : {}),
    archive: false,
    proprietaire: ctx.proprietaire ?? ctx.auteur ?? '',
  };
}

// ---------------------------------------------------------------- statut, phase, fin

function evenementProjet(type, texte, projet, ctx) {
  const liens = { personneId: projet.personneId ?? null, organisationId: projet.organisationId ?? null, affaireId: projet.affaireId ?? null };
  return { ...evenementCreation(type, texte, liens, ctx), projetId: projet.id ?? null };
}

const sansEffet = { erreurs: {}, patch: {}, evenements: [] };

export const estProjetTermine = (p) => p?.statut === 'termine';
/** Projet « vivant » : ni archivé, ni en pause, ni terminé. */
export const estProjetActif = (p) => !!p && !p.archive && p.statut === 'actif';

/** Patch d'entrée dans une phase : la première date d'entrée de chaque phase est gardée (comme pour les étapes des affaires). */
function entreeDansPhase(projet, phase, ctx) {
  const datesPhases = { ...(projet.datesPhases || {}) };
  if (!datesPhases[phase]) datesPhases[phase] = ctx.maintenant;
  return { phase, dateEntreePhase: ctx.maintenant, datesPhases };
}

/**
 * Changement de phase, dans tous les sens (on peut revenir en arrière) : { erreurs, patch, evenements }.
 * Changer la phase d'un projet terminé le rouvre (actif, désarchivé), comme changer l'étape d'une affaire perdue la rouvre.
 */
export function changementPhase(projet, phase, ctx) {
  if (!PHASES.some((p) => p.id === phase)) return { erreurs: { phase: 'Phase inconnue.' }, patch: {}, evenements: [] };
  const rouvre = estProjetTermine(projet);
  if (phase === projet.phase && !rouvre) return sansEffet;
  const patch = {};
  const faits = [];
  if (phase !== projet.phase) Object.assign(patch, entreeDansPhase(projet, phase, ctx));
  if (rouvre) {
    Object.assign(patch, { statut: 'actif', archive: false });
    faits.push(evenementProjet('projet_rouvert', `Projet rouvert : ${projet.titre}`, projet, ctx));
  }
  if (phase !== projet.phase) faits.push(evenementProjet('phase_changee', `Phase : ${libellePhase(projet.phase)} → ${libellePhase(phase)}`, projet, ctx));
  return { erreurs: {}, patch, evenements: faits };
}

export function mettreProjetEnPause(projet, ctx) {
  if (projet.statut === 'en_pause') return sansEffet;
  if (estProjetTermine(projet)) return { erreurs: { statut: 'Un projet terminé ne se met pas en pause : rouvre-le d’abord.' }, patch: {}, evenements: [] };
  return { erreurs: {}, patch: { statut: 'en_pause' }, evenements: [evenementProjet('projet_en_pause', `Projet en pause : ${projet.titre}`, projet, ctx)] };
}

export function reprendreProjet(projet, ctx) {
  if (projet.statut !== 'en_pause') return sansEffet;
  return { erreurs: {}, patch: { statut: 'actif' }, evenements: [evenementProjet('projet_repris', `Projet repris : ${projet.titre}`, projet, ctx)] };
}

/**
 * Fin d'un projet : phase Clôture, statut Terminé, archivé. Rien d'autre n'est bloqué en 2.1 (la Clôture ne bloquera qu'en 2.2,
 * tant qu'une facture n'est pas payée). C'est ici que le projet d'extraction sera créé (version 2.1, étape 6) : un seul endroit
 * pour l'écran et pour le serveur MCP.
 */
export function terminerProjet(projet, ctx) {
  if (estProjetTermine(projet)) return sansEffet;
  const patch = { statut: 'termine', archive: true };
  if (projet.phase !== 'cloture') Object.assign(patch, entreeDansPhase(projet, 'cloture', ctx));
  return { erreurs: {}, patch, evenements: [evenementProjet('projet_termine', `Projet terminé : ${projet.titre}`, projet, ctx)] };
}

/** Rouvre un projet terminé : il redevient actif et sort des archives, sans changer de phase. */
export function rouvrirProjet(projet, ctx) {
  if (!estProjetTermine(projet)) return sansEffet;
  return { erreurs: {}, patch: { statut: 'actif', archive: false }, evenements: [evenementProjet('projet_rouvert', `Projet rouvert : ${projet.titre}`, projet, ctx)] };
}

/** Archivage à la main (la voie normale pour ranger un projet, plutôt que le supprimer). */
export function archiverProjet(projet, archive, ctx) {
  if (!!projet.archive === !!archive) return sansEffet;
  const [type, texte] = archive ? ['projet_archive', 'Projet archivé'] : ['projet_desarchive', 'Projet sorti des archives'];
  return { erreurs: {}, patch: { archive: !!archive }, evenements: [evenementProjet(type, `${texte} : ${projet.titre}`, projet, ctx)] };
}

// ---------------------------------------------------------------- avancement et retard
// Les tâches sont [{ fait, date }] (collection projets_taches, étape 4) : ces fonctions ne dépendent que de ces deux champs.

/** Avancement : { faites, total, ratio } (ratio de 0 à 1 ; 0 quand il n'y a aucune tâche). */
export function progressionProjet(taches = []) {
  const total = taches.length;
  const faites = taches.filter((t) => t.fait).length;
  return { faites, total, ratio: total ? faites / total : 0 };
}

export const tacheEnRetard = (t, aujourdhui) => !t.fait && !!t.date && t.date < aujourdhui;

/** En retard : fin prévue dépassée sans être terminé, ou une tâche non faite dont la date est passée. Un projet terminé, archivé ou en pause n'est jamais en retard. */
export function estProjetEnRetard(projet, taches = [], aujourdhui) {
  if (!estProjetActif(projet)) return false;
  if (projet.dateFin && projet.dateFin < aujourdhui) return true;
  return taches.some((t) => tacheEnRetard(t, aujourdhui));
}

/** Pastille d'un projet, comme celle des affaires : rouge (en retard), verte (une tâche à faire), grise (rien à signaler ou projet à l'arrêt). */
export function pastilleProjet(projet, taches = [], aujourdhui) {
  if (!estProjetActif(projet)) return 'grise';
  if (estProjetEnRetard(projet, taches, aujourdhui)) return 'rouge';
  return taches.some((t) => !t.fait) ? 'verte' : 'grise';
}

// ---------------------------------------------------------------- tâches d'un projet (collection projets_taches)
// Une tâche appartient à un projet et à une phase ; `ordre` la place dans sa phase. Les tâches datées et non faites d'un projet vivant remontent
// dans « En retard » et « Aujourd'hui » de l'Accueil (collection séparée des activités du CRM, une seule liste du matin).

const estHeure = (v) => /^([01]\d|2[0-3]):[0-5]\d$/.test(v || '');

/** Titre obligatoire ; date « AAAA-MM-JJ » et heure « HH:MM » facultatives ; phase et assigné parmi les valeurs connues. */
export function validerTache(v = {}) {
  const erreurs = {};
  if (!nettoyerEspaces(v.titre)) erreurs.titre = 'Le titre est obligatoire.';
  if (v.phase && !PHASES.some((p) => p.id === v.phase)) erreurs.phase = 'Phase inconnue.';
  if (v.date && !estJour(v.date)) erreurs.date = 'La date doit être au format AAAA-MM-JJ.';
  if (v.heure && !estHeure(v.heure)) erreurs.heure = 'L’heure doit être au format HH:MM.';
  if (v.assigneA && !ASSIGNES.some((a) => a.id === v.assigneA)) erreurs.assigneA = 'Personne inconnue.';
  return erreurs;
}

/** Les tâches d'un projet par ordre d'affichage : phase (dans l'ordre des phases), puis `ordre`, puis titre. */
export function tachesDuProjet(taches, projetId) {
  const rang = (t) => PHASES.findIndex((p) => p.id === t.phase);
  return (taches || []).filter((t) => t.projetId === projetId)
    .sort((a, b) => rang(a) - rang(b) || (a.ordre ?? 0) - (b.ordre ?? 0) || normaliser(a.titre).localeCompare(normaliser(b.titre)));
}

/** Les quatre phases avec leurs tâches (une phase sans tâche a une liste vide) : [{ phase, taches, faites }]. */
export function tachesParPhase(taches, projetId) {
  const siennes = tachesDuProjet(taches, projetId);
  return PHASES.map((phase) => {
    const liste = siennes.filter((t) => t.phase === phase.id);
    return { phase, taches: liste, faites: liste.filter((t) => t.fait).length };
  });
}

/** Document d'une nouvelle tâche. `ordre` : sa place dans la phase (le plan le calcule). */
export function nouvelleTache(valeurs, ctx) {
  return {
    titre: nettoyerEspaces(valeurs.titre),
    projetId: valeurs.projetId,
    phase: PHASES.some((p) => p.id === valeurs.phase) ? valeurs.phase : PHASE_DEPART,
    ordre: valeurs.ordre ?? 1,
    date: estJour(valeurs.date) ? valeurs.date : null,
    heure: estHeure(valeurs.heure) ? valeurs.heure : '',
    fait: false,
    dateFait: null,
    assigneA: ASSIGNES.some((a) => a.id === valeurs.assigneA) ? valeurs.assigneA : 'jerome',
    auteur: ctx.auteur ?? '',
  };
}

const prochainOrdre = (taches, projetId, phase) => 1 + Math.max(0, ...(taches || []).filter((t) => t.projetId === projetId && t.phase === phase).map((t) => t.ordre ?? 0));

/** Crée une tâche à la fin de sa phase. `valeurs.phase` : la phase du projet par défaut (c'est l'écran qui la donne). Refus : { erreurs, ecritures: [] }. */
export function planCreerTache({ projet, taches = [], valeurs }, ctx) {
  const phase = PHASES.some((p) => p.id === valeurs.phase) ? valeurs.phase : (projet.phase || PHASE_DEPART);
  const complet = { ...valeurs, phase, projetId: projet.id };
  const erreurs = validerTache(complet);
  if (Object.keys(erreurs).length) return { erreurs, ecritures: [] };
  const id = ctx.nouvelId(C.projetsTaches);
  return {
    erreurs: {},
    id,
    ecritures: [ecritureCreer(C.projetsTaches, id, nouvelleTache({ ...complet, ordre: prochainOrdre(taches, projet.id, phase) }, ctx), { horodater: ['creeLe'] })],
  };
}

/**
 * Modifie une tâche (titre, date, heure, assigné, phase). Changer de phase la place à la fin de la nouvelle phase.
 * `patch` vide : rien à écrire. Refus : { erreurs, ecritures: [] }.
 */
export function planMajTache({ tache, patch, taches = [] }) {
  const erreurs = validerTache({ titre: tache.titre, ...patch });
  if (Object.keys(erreurs).length) return { erreurs, ecritures: [] };
  const net = { ...patch };
  if (net.titre !== undefined) net.titre = nettoyerEspaces(net.titre);
  if (net.date === '') net.date = null;
  if (net.phase && net.phase !== tache.phase) net.ordre = prochainOrdre(taches, tache.projetId, net.phase);
  const changes = Object.fromEntries(Object.entries(net).filter(([k, v]) => v !== tache[k]));
  return { erreurs: {}, patch: changes, ecritures: modifierSiPatch(C.projetsTaches, tache.id, changes) };
}

/** Coche une tâche : « fait » et sa date, avec un événement dans le fil du projet. Déjà faite : rien. */
export function planTacheFaite({ tache, projet = null }, ctx) {
  if (tache.fait) return { ecritures: [] };
  return {
    ecritures: [
      ...modifierSiPatch(C.projetsTaches, tache.id, { fait: true, dateFait: ctx.maintenant }),
      ...(projet ? evenements([evenementProjet('tache_faite', `Tâche faite : ${tache.titre}`, projet, ctx)], ctx) : []),
    ],
  };
}

/** Décoche une tâche (elle redevient à faire). */
export const planTacheNonFaite = ({ tache }) => ({ ecritures: tache.fait ? modifierSiPatch(C.projetsTaches, tache.id, { fait: false, dateFait: null }) : [] });

export const planSupprimerTache = (id) => ({ ecritures: [ecritureSupprimer(C.projetsTaches, id)] });

/**
 * Monte (`sens` = -1) ou descend (+1) une tâche dans sa phase : les tâches de la phase sont remises en ordre 1, 2, 3… et seules celles
 * dont la place change sont écrites. Au bord de la liste : rien.
 */
export function planDeplacerTache({ tache, taches = [], sens }) {
  const liste = tachesDuProjet(taches, tache.projetId).filter((t) => t.phase === tache.phase);
  const i = liste.findIndex((t) => t.id === tache.id);
  const j = i + sens;
  if (i < 0 || j < 0 || j >= liste.length) return { ecritures: [] };
  [liste[i], liste[j]] = [liste[j], liste[i]];
  return { ecritures: liste.flatMap((t, k) => (t.ordre === k + 1 ? [] : [ecritureModifier(C.projetsTaches, t.id, { ordre: k + 1 })])) };
}

/**
 * Tâches à montrer dans les Points clés de l'Accueil : non faites, datées, d'un projet vivant (ni en pause, ni terminé, ni archivé).
 * { enRetard, aujourdhui } triés par date puis heure ; chaque tâche est rendue avec son projet : { ...tache, projet }.
 */
export function tachesPointsCles(taches, projets, aujourdhui) {
  const vivants = new Map((projets || []).filter(estProjetActif).map((p) => [p.id, p]));
  const cle = (t) => `${t.date}T${t.heure || '00:00'}`;
  const ouvertes = (taches || []).filter((t) => !t.fait && t.date && vivants.has(t.projetId))
    .map((t) => ({ ...t, projet: vivants.get(t.projetId) }))
    .sort((a, b) => cle(a).localeCompare(cle(b)));
  return { enRetard: ouvertes.filter((t) => t.date < aujourdhui), aujourdhui: ouvertes.filter((t) => t.date === aujourdhui) };
}

// ---------------------------------------------------------------- modèles de projet (collection projets_modeles)
// Un modèle = un nom, une offre liée (facultative), une nature, une liste de tâches types (titre, phase, délai en jours après le début du projet).
// Créer un projet depuis un modèle crée ses tâches, avec leurs dates calculées. Les modèles de départ sont écrits ici ; les copies de la base
// sont modifiables (écran Modèles). Le modèle « Extraction » sert aux projets d'extraction de valeur (étape 6).

/** Contenu fourni par Jérôme (03/10/2026). Délai `null` : pas de date (elle se pose au fil de l'eau). Extraction : sept jours après la création. */
export const MODELES_DEPART = [
  {
    id: 'audit', nom: 'Audit', offreId: 'audit', nature: 'livraison', actif: true, ordre: 1,
    taches: [
      { id: 'audit-interview', titre: 'Interview', phase: 'decouverte', delaiJours: null, ordre: 1 },
      { id: 'audit-rapport', titre: 'Créer le rapport', phase: 'livraison', delaiJours: null, ordre: 1 },
      { id: 'audit-debriefing', titre: 'Débriefing avec le client', phase: 'livraison', delaiJours: null, ordre: 2 },
    ],
  },
  {
    id: 'accompagnement', nom: 'Accompagnement', offreId: 'accompagnement', nature: 'livraison', actif: true, ordre: 2,
    taches: [{ id: 'accompagnement-lancement', titre: 'Rendez-vous de lancement', phase: 'lancement', delaiJours: null, ordre: 1 }],
  },
  {
    id: 'extraction', nom: 'Extraction', offreId: null, nature: 'extraction', actif: true, ordre: 3,
    taches: [
      { id: 'extraction-regles', titre: 'Tirer les règles', phase: 'decouverte', delaiJours: 7, ordre: 1 },
      { id: 'extraction-erreurs', titre: 'Comprendre les erreurs', phase: 'decouverte', delaiJours: 7, ordre: 2 },
      { id: 'extraction-automatisable', titre: 'Repérer ce qui est automatisable', phase: 'livraison', delaiJours: 7, ordre: 1 },
      { id: 'extraction-marketing', titre: 'Créer la documentation marketing', phase: 'livraison', delaiJours: 7, ordre: 2 },
    ],
  },
];

const DELAI_MAX = 3650;

export function validerModele(v = {}) {
  const erreurs = {};
  if (!nettoyerEspaces(v.nom)) erreurs.nom = 'Le nom est obligatoire.';
  if (v.nature && !NATURES_PROJET.some((n) => n.id === v.nature)) erreurs.nature = 'Nature inconnue.';
  return erreurs;
}

/** Tâche type : titre obligatoire, phase connue, délai = nombre entier de jours après le début du projet (vide = pas de date). */
export function validerTacheModele(v = {}) {
  const erreurs = {};
  if (!nettoyerEspaces(v.titre)) erreurs.titre = 'Le titre est obligatoire.';
  if (v.phase && !PHASES.some((p) => p.id === v.phase)) erreurs.phase = 'Phase inconnue.';
  const d = v.delaiJours;
  if (d !== null && d !== undefined && d !== '' && !(Number.isInteger(Number(d)) && Number(d) >= 0 && Number(d) <= DELAI_MAX)) erreurs.delaiJours = `Le délai est un nombre de jours entre 0 et ${DELAI_MAX}.`;
  return erreurs;
}

const delaiNet = (d) => (d === null || d === undefined || d === '' ? null : Number(d));

/** Les tâches d'un modèle dans l'ordre d'affichage : phase, puis `ordre`. */
export function tachesDuModele(modele) {
  const rang = (t) => PHASES.findIndex((p) => p.id === t.phase);
  return [...(modele?.taches || [])].sort((a, b) => rang(a) - rang(b) || (a.ordre ?? 0) - (b.ordre ?? 0));
}

/** Les quatre phases avec les tâches types de chacune : [{ phase, taches }]. */
export function tachesModeleParPhase(modele) {
  const toutes = tachesDuModele(modele);
  return PHASES.map((phase) => ({ phase, taches: toutes.filter((t) => t.phase === phase.id) }));
}

export const modelesActifs = (modeles) => (modeles || []).filter((m) => m.actif !== false).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));

/** Le modèle proposé pour une offre : le premier modèle actif qui y est lié (null s'il n'y en a pas). */
export const modeleParOffre = (modeles, offreId) => (offreId ? modelesActifs(modeles).find((m) => m.offreId === offreId) ?? null : null);

/** Les tâches d'un modèle devenues vraies tâches d'un projet : date = début du projet + délai, ordre repris dans chaque phase. */
function ecrituresTachesModele(modele, { projetId, dateDebut }, ctx) {
  if (!modele) return [];
  const comptes = {};
  return tachesDuModele(modele).map((t) => {
    comptes[t.phase] = (comptes[t.phase] || 0) + 1;
    const id = ctx.nouvelId(C.projetsTaches);
    const delai = delaiNet(t.delaiJours);
    return ecritureCreer(C.projetsTaches, id, nouvelleTache({
      titre: t.titre, projetId, phase: t.phase, ordre: comptes[t.phase], date: delai === null ? null : ajouterJours(dateDebut, delai),
    }, ctx), { horodater: ['creeLe'] });
  });
}

/** Document d'un nouveau modèle (sans tâche). */
export function nouveauModele(valeurs, ctx, ordre = 1) {
  return {
    nom: nettoyerEspaces(valeurs.nom),
    offreId: valeurs.offreId || null,
    nature: NATURES_PROJET.some((n) => n.id === valeurs.nature) ? valeurs.nature : 'livraison',
    taches: [],
    actif: true,
    ordre,
    proprietaire: ctx.proprietaire ?? ctx.auteur ?? '',
  };
}

export function planCreerModele({ valeurs, modeles = [] }, ctx) {
  const erreurs = validerModele(valeurs);
  if (Object.keys(erreurs).length) return { erreurs, ecritures: [] };
  const id = ctx.nouvelId(C.projetsModeles);
  const ordre = 1 + Math.max(0, ...modeles.map((m) => m.ordre ?? 0));
  return { erreurs: {}, id, ecritures: [ecritureCreer(C.projetsModeles, id, nouveauModele(valeurs, ctx, ordre), MARQUES_CREATION)] };
}

/** Modifie le nom, l'offre, la nature ou l'état (actif) d'un modèle. */
export function planMajModele({ modele, patch }) {
  const erreurs = validerModele({ nom: modele.nom, ...patch });
  if (Object.keys(erreurs).length) return { erreurs, ecritures: [] };
  const net = { ...patch };
  if (net.nom !== undefined) net.nom = nettoyerEspaces(net.nom);
  if ('offreId' in net) net.offreId = net.offreId || null;
  const changes = Object.fromEntries(Object.entries(net).filter(([k, v]) => v !== modele[k]));
  return { erreurs: {}, patch: changes, ecritures: modifierSiPatch(C.projetsModeles, modele.id, changes, MARQUES_MODIFICATION) };
}

/** Supprime un modèle. Les projets déjà créés le gardent comme « modèle d'origine » (information seulement). */
export const planSupprimerModele = (id) => ({ ecritures: [ecritureSupprimer(C.projetsModeles, id)] });

const ecrireTachesModele = (modele, taches) => ({ ecritures: modifierSiPatch(C.projetsModeles, modele.id, { taches }, MARQUES_MODIFICATION) });

/** Ajoute une tâche type à la fin de sa phase. */
export function planAjouterTacheModele({ modele, valeurs }, ctx) {
  const phase = PHASES.some((p) => p.id === valeurs.phase) ? valeurs.phase : PHASE_DEPART;
  const erreurs = validerTacheModele({ ...valeurs, phase });
  if (Object.keys(erreurs).length) return { erreurs, ecritures: [] };
  const ordre = 1 + Math.max(0, ...(modele.taches || []).filter((t) => t.phase === phase).map((t) => t.ordre ?? 0));
  const tache = { id: ctx.nouvelId(C.projetsModeles), titre: nettoyerEspaces(valeurs.titre), phase, delaiJours: delaiNet(valeurs.delaiJours), ordre };
  return { erreurs: {}, ...ecrireTachesModele(modele, [...(modele.taches || []), tache]) };
}

/** Modifie une tâche type (titre, délai, phase). Changer de phase la place à la fin de la nouvelle phase. */
export function planMajTacheModele({ modele, tacheId, patch }) {
  const tache = (modele.taches || []).find((t) => t.id === tacheId);
  if (!tache) return { erreurs: { tache: 'Tâche introuvable.' }, ecritures: [] };
  const erreurs = validerTacheModele({ titre: tache.titre, ...patch });
  if (Object.keys(erreurs).length) return { erreurs, ecritures: [] };
  const net = { ...patch };
  if (net.titre !== undefined) net.titre = nettoyerEspaces(net.titre);
  if ('delaiJours' in net) net.delaiJours = delaiNet(net.delaiJours);
  if (net.phase && net.phase !== tache.phase) net.ordre = 1 + Math.max(0, ...modele.taches.filter((t) => t.phase === net.phase).map((t) => t.ordre ?? 0));
  const changes = Object.fromEntries(Object.entries(net).filter(([k, v]) => v !== tache[k]));
  if (!Object.keys(changes).length) return { erreurs: {}, ecritures: [] };
  return { erreurs: {}, ...ecrireTachesModele(modele, modele.taches.map((t) => (t.id === tacheId ? { ...t, ...changes } : t))) };
}

export const planSupprimerTacheModele = ({ modele, tacheId }) => ecrireTachesModele(modele, (modele.taches || []).filter((t) => t.id !== tacheId));

/** Monte (`sens` = -1) ou descend (+1) une tâche type dans sa phase ; les tâches de la phase sont remises en ordre 1, 2, 3… Au bord : rien. */
export function planDeplacerTacheModele({ modele, tacheId, sens }) {
  const tache = (modele.taches || []).find((t) => t.id === tacheId);
  if (!tache) return { ecritures: [] };
  const liste = tachesDuModele(modele).filter((t) => t.phase === tache.phase);
  const i = liste.findIndex((t) => t.id === tacheId);
  const j = i + sens;
  if (j < 0 || j >= liste.length) return { ecritures: [] };
  [liste[i], liste[j]] = [liste[j], liste[i]];
  const place = new Map(liste.map((t, k) => [t.id, k + 1]));
  return ecrireTachesModele(modele, modele.taches.map((t) => (place.has(t.id) ? { ...t, ordre: place.get(t.id) } : t)));
}

/** Création des modèles de départ (premier lancement) : les identifiants sont fixes, donc le même plan rejoué n'en fait jamais deux. */
export function planInitialiserModeles() {
  return { ecritures: MODELES_DEPART.map(({ id, ...donnees }) => ecritureCreer(C.projetsModeles, id, structuredClone(donnees), MARQUES_CREATION)) };
}

// ---------------------------------------------------------------- liens

/** Le projet d'une affaire (au plus un). Le projet d'extraction de l'affaire n'est pas « son projet » : il a son propre lien (`extractionDeLAffaire`). */
export const projetDeAffaire = (projets, affaireId) => (projets || []).find((p) => affaireId && p.affaireId === affaireId && !estExtraction(p)) ?? null;

/** Projets liés à une fiche : { affaireId } | { personneId } | { organisationId }. */
export function projetsLies(projets, lien) {
  const [cle, id] = Object.entries(lien)[0];
  return (projets || []).filter((p) => id && p[cle] === id);
}

/** Liens à poser sur un élément du fil (note, événement) rattaché à un projet : le projet et tout ce que le projet relie. */
export function liensProjet(projet) {
  return {
    personneId: projet.personneId ?? null,
    organisationId: projet.organisationId ?? null,
    affaireId: projet.affaireId ?? null,
    projetId: projet.id ?? null,
  };
}

// ---------------------------------------------------------------- affaire gagnée : créer ou lier un projet
// Décisions du 06/10/2026 : depuis la fiche d'une affaire GAGNÉE, on crée un projet ou on en lie un existant ; au plus un projet par affaire
// (`affaire.projetId` ↔ `projet.affaireId`, les deux côtés s'écrivent dans le même plan) ; une affaire gagnée peut rester sans projet.

/** Le projet d'une affaire : celui qui la cite, sinon celui que l'affaire cite. */
export function projetLieAAffaire(projets, affaire) {
  if (!affaire) return null;
  return projetDeAffaire(projets, affaire.id) ?? (affaire.projetId ? (projets || []).find((p) => p.id === affaire.projetId) ?? null : null);
}

/** Erreurs d'un lien affaire ↔ projet à créer ({} si tout va bien). `projet` : le projet à lier (absent pour une création). */
export function validerLienAffaire({ affaire, projet = null, projets = [] }) {
  if (affaire?.statut !== 'gagnee') return { affaire: 'Seule une affaire gagnée peut avoir un projet.' };
  if (projetLieAAffaire(projets, affaire)) return { affaire: 'Cette affaire a déjà un projet.' };
  if (projet?.affaireId) return { projet: 'Ce projet est déjà lié à une affaire.' };
  if (projet?.archive) return { projet: 'Ce projet est archivé : sors-le d’abord des archives.' };
  return {};
}

/** Projets qu'on peut lier à une affaire : sans affaire, pas archivés, pas d'extraction, par ordre alphabétique. */
export const projetsLiables = (projets) => (projets || []).filter((p) => !p.affaireId && !p.archive && !estExtraction(p)).sort((a, b) => normaliser(a.titre).localeCompare(normaliser(b.titre)));

/**
 * Crée le projet d'une affaire gagnée : il reprend le titre, la personne, l'organisation, l'offre, l'adresse GitHub et le dossier de l'affaire
 * (`valeurs` peut en changer). Même plan : l'affaire reçoit `projetId`. Refus : { erreurs, ecritures: [] }.
 */
export function planCreerProjetDepuisAffaire({ affaire, projets = [], valeurs = {}, modele = null, taches = [] }, ctx) {
  const erreurs = validerLienAffaire({ affaire, projets });
  if (Object.keys(erreurs).length) return { erreurs, ecritures: [] };
  const id = ctx.nouvelId(C.projets);
  const fiche = nouveauProjet({
    titre: affaire.titre, personneId: affaire.personneId, organisationId: affaire.organisationId, offreId: affaire.offreId,
    urlGithub: affaire.urlGithub, urlDossier: affaire.urlDossier, ...valeurs, affaireId: affaire.id,
    ...(modele ? { modeleId: modele.id, nature: modele.nature || valeurs.nature } : {}),
  }, ctx);
  return {
    erreurs: {},
    id,
    titre: fiche.titre,
    ecritures: [
      ecritureCreer(C.projets, id, fiche, MARQUES_CREATION),
      ...ecrituresTachesModele(modele, { projetId: id, dateDebut: fiche.dateDebut }, ctx),
      ...modifierSiPatch(C.affaires, affaire.id, { projetId: id }, MARQUES_MODIFICATION),
      ...evenements([evenementProjet('projet_cree', `Projet créé : ${fiche.titre}`, { ...fiche, id }, ctx)], ctx),
      ...ecrituresRangerExtraction({ affaire, projets, taches }, ctx),
    ],
  };
}

/**
 * Lie un projet existant (sans affaire) à une affaire gagnée. Le projet garde ce qu'il a déjà ; ce qui lui manque (personne, organisation, offre,
 * adresse GitHub, dossier) est repris de l'affaire.
 */
export function planLierProjet({ affaire, projet, projets = [], taches = [] }, ctx) {
  const erreurs = validerLienAffaire({ affaire, projet, projets });
  if (Object.keys(erreurs).length) return { erreurs, ecritures: [] };
  const patch = { affaireId: affaire.id };
  for (const champ of ['personneId', 'organisationId', 'offreId']) if (!projet[champ] && affaire[champ]) patch[champ] = affaire[champ];
  for (const champ of ['urlGithub', 'urlDossier']) if (!projet[champ] && affaire[champ]) patch[champ] = affaire[champ];
  return {
    erreurs: {},
    patch,
    ecritures: [
      ...modifierSiPatch(C.projets, projet.id, patch, MARQUES_MODIFICATION),
      ...modifierSiPatch(C.affaires, affaire.id, { projetId: projet.id }, MARQUES_MODIFICATION),
      ...evenements([evenementProjet('projet_lie', `Projet lié à l’affaire : ${affaire.titre}`, { ...projet, ...patch }, ctx)], ctx),
      ...ecrituresRangerExtraction({ affaire, projets, taches }, ctx),
    ],
  };
}

/** Détache un projet de son affaire : le projet et l'affaire restent, seul le lien disparaît des deux côtés. `affaire` peut manquer (lien resté seul d'un côté). */
export function planDelierProjet({ projet, affaire = null }, ctx) {
  if (!projet?.affaireId) return { erreurs: { projet: 'Ce projet n’est lié à aucune affaire.' }, ecritures: [] };
  if (affaire && affaire.id !== projet.affaireId) return { erreurs: { projet: 'Ce projet n’est pas lié à cette affaire.' }, ecritures: [] };
  return {
    erreurs: {},
    ecritures: [
      ...modifierSiPatch(C.projets, projet.id, { affaireId: null }, MARQUES_MODIFICATION),
      ...(affaire?.projetId === projet.id ? modifierSiPatch(C.affaires, affaire.id, { projetId: null }, MARQUES_MODIFICATION) : []),
      ...evenements([evenementProjet('projet_delie', `Projet détaché de l’affaire${affaire ? ` : ${affaire.titre}` : ''}`, projet, ctx)], ctx),
    ],
  };
}

/**
 * Notes à montrer dans un projet : les siennes, plus celles de son affaire (montrées, pas déplacées : elles restent sur l'affaire et sont
 * marquées `deAffaire`, en lecture seule). Une note n'apparaît qu'une fois.
 */
export function notesDuProjet(notesProjet = [], notesAffaire = [], projetId) {
  const vues = new Set();
  const sorties = [];
  for (const n of [...notesProjet, ...notesAffaire]) {
    if (vues.has(n.id)) continue;
    vues.add(n.id);
    sorties.push(n.projetId === projetId ? n : { ...n, deAffaire: true });
  }
  return sorties;
}

// ---------------------------------------------------------------- extraction de valeur
// Vision de Jérôme (03/10/2026), règles du 06/10/2026 : extraire un maximum de valeur de chaque affaire et de chaque projet, gagnés ou perdus
// (règles, erreurs, ce qui est automatisable, documentation marketing). L'extraction est un projet comme les autres (nature `extraction`, mêmes phases,
// tâches, statut, Clôture), créé AUTOMATIQUEMENT, dans les plans ci-dessous : l'écran et le serveur MCP font donc exactement la même chose.
//  - affaire perdue : à Perdu (la raison de la perte est reprise) ;
//  - projet terminé : à la fin du projet ;
//  - affaire gagnée SANS projet : à Gagné. Si un projet est créé ou lié ensuite, cette extraction est rangée (archivée) tant que rien n'y a été fait :
//    c'est la fin du projet qui crée la vraie extraction (un seul projet d'extraction vivant par affaire) ;
//  - jamais de boucle (un projet d'extraction ne déclenche rien) ; une seule extraction par source ; elle reprend le dossier et le dépôt de sa source.

export const estExtraction = (p) => p?.nature === 'extraction';

/** L'extraction d'une affaire (créée à Perdu ou à Gagné), archivée ou non. */
export const extractionDeLAffaire = (projets, affaireId) => (projets || []).find((p) => estExtraction(p) && affaireId && p.affaireId === affaireId) ?? null;

/** L'extraction d'un projet terminé. */
export const extractionDuProjet = (projets, projetId) => (projets || []).find((p) => estExtraction(p) && projetId && p.projetSourceId === projetId) ?? null;

/** Le modèle de l'extraction : celui d'identifiant `extraction`, sinon un modèle actif de nature extraction, sinon la copie livrée avec l'appli. */
export function modeleExtraction(modeles = []) {
  return modeles.find((m) => m.id === 'extraction') ?? modelesActifs(modeles).find((m) => m.nature === 'extraction') ?? MODELES_DEPART.find((m) => m.id === 'extraction');
}

/** Écritures de création du projet d'extraction d'une source ({ affaire } ou { projet }) : { id, titre, ecritures }. `raison` : { raison, detail } d'une affaire perdue. */
function creerExtraction({ affaire = null, projet = null, modeles = [], raison = null }, ctx) {
  const source = affaire ?? projet;
  const plan = planCreerProjet({
    titre: `Extraction : ${source.titre}`,
    personneId: source.personneId, organisationId: source.organisationId, offreId: source.offreId,
    urlGithub: source.urlGithub, urlDossier: source.urlDossier,
    ...(affaire ? { affaireId: affaire.id } : { projetSourceId: projet.id }),
    ...(raison ? { raisonPerdue: raison.raison, raisonPerdueDetail: raison.detail } : {}),
  }, ctx, { modele: { ...modeleExtraction(modeles), nature: 'extraction' } });
  return { id: plan.id, titre: plan.titre, ecritures: plan.ecritures };
}

/**
 * Range l'extraction d'une affaire quand l'affaire reçoit son projet : archivée, tant que rien n'y a été fait (aucune de ses tâches n'est faite).
 * Si elle a déjà avancé, elle reste vivante (la fin du projet en créera une autre, rare).
 */
function ecrituresRangerExtraction({ affaire, projets = [], taches = [] }, ctx) {
  const extraction = extractionDeLAffaire(projets, affaire?.id);
  if (!extraction || extraction.archive || taches.some((t) => t.projetId === extraction.id && t.fait)) return [];
  return [
    ...modifierSiPatch(C.projets, extraction.id, { archive: true }, MARQUES_MODIFICATION),
    ...evenements([evenementProjet('extraction_rangee', `Extraction rangée : l’affaire a maintenant son projet (${extraction.titre})`, extraction, ctx)], ctx),
  ];
}

/**
 * Changement d'étape d'une affaire AVEC l'extraction qu'il déclenche (affaire qui devient gagnée sans projet). Rend le plan de `planChangerEtape`
 * (erreurs, patch, evenements, suggestion, ecritures) + `extraction` ({ id, titre } ou null).
 */
export function planChangerEtapeAvecExtraction({ affaire, etape, options = {}, projets = [], modeles = [] }, ctx) {
  const plan = planChangerEtape(affaire, etape, ctx, options);
  const devientGagnee = !Object.keys(plan.erreurs || {}).length && plan.patch?.statut === 'gagnee' && affaire.statut !== 'gagnee';
  if (!devientGagnee || projetLieAAffaire(projets, affaire) || extractionDeLAffaire(projets, affaire.id)) return { ...plan, extraction: null };
  const extraction = creerExtraction({ affaire, modeles }, ctx);
  return { ...plan, extraction: { id: extraction.id, titre: extraction.titre }, ecritures: [...plan.ecritures, ...extraction.ecritures] };
}

/** Affaire perdue AVEC son extraction (la raison de la perte est reprise). Même forme que `planMarquerPerdue` + `extraction`. */
export function planMarquerPerdueAvecExtraction({ affaire, saisie, projets = [], modeles = [] }, ctx) {
  const plan = planMarquerPerdue(affaire, saisie, ctx);
  if (Object.keys(plan.erreurs || {}).length || extractionDeLAffaire(projets, affaire.id)) return { ...plan, extraction: null };
  const extraction = creerExtraction({ affaire, modeles, raison: { raison: saisie.raison, detail: saisie.detail ?? '' } }, ctx);
  return { ...plan, extraction: { id: extraction.id, titre: extraction.titre }, ecritures: [...plan.ecritures, ...extraction.ecritures] };
}

/** Fin d'un projet AVEC son extraction (sauf pour un projet d'extraction, et une seule par projet). Même forme que `planTerminerProjet` + `extraction`. */
export function planTerminerProjetAvecExtraction({ projet, projets = [], modeles = [] }, ctx) {
  const plan = planTerminerProjet(projet, ctx);
  if (!plan.ecritures.length || estExtraction(projet) || extractionDuProjet(projets, projet.id)) return { ...plan, extraction: null };
  const extraction = creerExtraction({ projet, modeles }, ctx);
  return { ...plan, extraction: { id: extraction.id, titre: extraction.titre }, ecritures: [...plan.ecritures, ...extraction.ecritures] };
}

/**
 * Extraction DÉCLENCHÉE À LA MAIN sur un projet (bouton « Extraire la valeur », décision de Jérôme du 07/10/2026 : on n'attend pas le paiement pour
 * extraire). Une seule extraction par projet : si elle existe déjà, rien n'est créé et le plan rend `dejaExistante: true` avec cette extraction
 * (l'écran l'ouvre). Un projet d'extraction ne s'extrait pas. Rend { erreurs, ecritures, extraction: { id, titre } | null, dejaExistante }.
 */
export function planExtraireProjet({ projet, projets = [], modeles = [] }, ctx) {
  if (!projet) return { erreurs: { projet: 'Projet introuvable.' }, ecritures: [], extraction: null, dejaExistante: false };
  if (estExtraction(projet)) return { erreurs: { projet: 'Un projet d’extraction ne s’extrait pas.' }, ecritures: [], extraction: null, dejaExistante: false };
  const existante = extractionDuProjet(projets, projet.id);
  if (existante) return { erreurs: {}, ecritures: [], extraction: { id: existante.id, titre: existante.titre }, dejaExistante: true };
  const extraction = creerExtraction({ projet, modeles }, ctx);
  return { erreurs: {}, ecritures: extraction.ecritures, extraction: { id: extraction.id, titre: extraction.titre }, dejaExistante: false };
}

// ---------------------------------------------------------------- filtres (écran Projets)

export const CRITERES_PROJETS_VIDES = Object.freeze({ recherche: '', phases: [], statuts: [], natures: [], enRetard: false });

/** Critères complets : les clés manquantes reprennent leur valeur vide (comme `criteresComplets` du CRM). */
export function criteresProjetsComplets(c = {}) {
  return {
    recherche: c.recherche ?? '',
    phases: [...(c.phases ?? [])],
    statuts: [...(c.statuts ?? [])],
    natures: [...(c.natures ?? [])],
    enRetard: !!c.enRetard,
  };
}

/** Vrai quand il y a quelque chose à enregistrer : une recherche ou au moins un filtre. */
export const criteresProjetsActifs = (c = {}) => !!nettoyerEspaces(c.recherche) || filtresProjetsActifs(c) > 0;

/** Les filtres enregistrés qui concernent les projets (ils vivent avec ceux du CRM, dans crm_parametres/filtres, avec `liste: 'projets'`). */
export const filtresEnregistresProjets = (filtres = []) => filtres.filter((f) => f.liste === 'projets');

/**
 * Nouveau filtre enregistré : { id, nom, liste: 'projets', criteres, ordre }. `suffixe` rend l'identifiant unique (4 caractères au hasard).
 * Refus (`erreurs.nom`) si le nom est vide ou déjà pris par un autre filtre de projets.
 */
export function nouveauFiltreProjets(nom, criteres, filtres = [], suffixe = '') {
  const n = nettoyerEspaces(nom);
  if (!n) return { erreurs: { nom: 'Le nom du filtre est obligatoire.' }, filtre: null };
  if (filtresEnregistresProjets(filtres).some((f) => normaliser(f.nom) === normaliser(n))) return { erreurs: { nom: 'Un filtre porte déjà ce nom.' }, filtre: null };
  const id = `${normaliser(n).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'filtre'}_${suffixe}`;
  return { erreurs: {}, filtre: { id, nom: n, liste: 'projets', criteres: criteresProjetsComplets(criteres), ordre: filtres.length + 1 } };
}

/** Nombre de filtres posés (la recherche n'est pas un filtre : elle a son propre champ). */
export function filtresProjetsActifs(c = {}) {
  const k = criteresProjetsComplets(c);
  return [k.phases.length, k.statuts.length, k.natures.length, k.enRetard ? 1 : 0].filter(Boolean).length;
}

/**
 * Projets qui répondent aux critères. `archives` : false = ceux du tableau, true = les projets archivés (terminés ou rangés).
 * La recherche (sans accents ni casse) porte sur le titre, la personne et l'organisation ; tous les mots doivent être trouvés.
 * contexte : { personnes, organisations, taches, aujourdhui } (les tâches servent au retard).
 */
export function filtrerProjets(projets, criteres, { personnes = [], organisations = [], taches = [], aujourdhui, archives = false } = {}) {
  const c = criteresProjetsComplets(criteres);
  const mots = normaliser(c.recherche).split(/\s+/).filter(Boolean);
  const nomPersonne = new Map(personnes.map((p) => [p.id, p.nom]));
  const nomOrganisation = new Map(organisations.map((o) => [o.id, o.nom]));
  return (projets || []).filter((p) => {
    if (!!p.archive !== !!archives) return false;
    if (c.phases.length && !c.phases.includes(p.phase)) return false;
    if (c.statuts.length && !c.statuts.includes(p.statut)) return false;
    if (c.natures.length && !c.natures.includes(p.nature || 'livraison')) return false;
    if (c.enRetard && !estProjetEnRetard(p, taches.filter((t) => t.projetId === p.id), aujourdhui)) return false;
    if (!mots.length) return true;
    const foin = normaliser([p.titre, nomPersonne.get(p.personneId), nomOrganisation.get(p.organisationId)].filter(Boolean).join(' '));
    return mots.every((m) => foin.includes(m));
  });
}

/** Projets d'une phase dans le tableau (les projets archivés n'y sont pas). */
export const projetsDePhase = (projets, phase) => (projets || []).filter((p) => p.phase === phase && !p.archive);

// ---------------------------------------------------------------- plans d'écriture (écran ET, plus tard, serveur MCP)

/**
 * `ctx.nouvelId(collection)` donne un identifiant frais. L'appelant valide d'abord (`validerProjet`).
 * `modele` (facultatif) : le projet part avec les tâches du modèle (dates calculées d'après le début du projet) et prend sa nature.
 */
export function planCreerProjet(valeurs, ctx, { modele = null } = {}) {
  const id = ctx.nouvelId(C.projets);
  const fiche = nouveauProjet(modele ? { ...valeurs, modeleId: modele.id, nature: modele.nature || valeurs.nature } : valeurs, ctx);
  return {
    id,
    titre: fiche.titre,
    ecritures: [
      ecritureCreer(C.projets, id, fiche, MARQUES_CREATION),
      ...ecrituresTachesModele(modele, { projetId: id, dateDebut: fiche.dateDebut }, ctx),
      ...evenements([evenementProjet('projet_cree', `Projet créé : ${fiche.titre}`, { ...fiche, id }, ctx)], ctx),
    ],
  };
}

export const planMajProjet = (id, patch) => ({ ecritures: modifierSiPatch(C.projets, id, patch, MARQUES_MODIFICATION) });

/** Applique le résultat d'une règle de projet ({ erreurs?, patch, evenements }) : le patch sur le projet, puis les événements du fil. */
export function planResultatProjet(projetId, resultat, ctx) {
  if (resultat.erreurs && Object.keys(resultat.erreurs).length) return { ...resultat, ecritures: [] };
  return { ...resultat, ecritures: [...modifierSiPatch(C.projets, projetId, resultat.patch, MARQUES_MODIFICATION), ...evenements(resultat.evenements, ctx)] };
}
export const planChangerPhase = (projet, phase, ctx) => planResultatProjet(projet.id, changementPhase(projet, phase, ctx), ctx);
export const planMettreProjetEnPause = (projet, ctx) => planResultatProjet(projet.id, mettreProjetEnPause(projet, ctx), ctx);
export const planReprendreProjet = (projet, ctx) => planResultatProjet(projet.id, reprendreProjet(projet, ctx), ctx);
export const planTerminerProjet = (projet, ctx) => planResultatProjet(projet.id, terminerProjet(projet, ctx), ctx);
export const planRouvrirProjet = (projet, ctx) => planResultatProjet(projet.id, rouvrirProjet(projet, ctx), ctx);
export const planArchiverProjet = (projet, archive, ctx) => planResultatProjet(projet.id, archiverProjet(projet, archive, ctx), ctx);

/**
 * Suppression définitive d'un projet (l'archivage est la voie normale). Sont supprimés : le projet, ses tâches et son fil.
 * Sont gardés, avec un lien vidé : l'affaire d'origine (`projetId`) et les extractions qui le citent (`projetSourceId`).
 * `taches` : projets_taches du projet ; `liens` : notes, événements et activités qui portent son `projetId` ([{ collection, id, projetId }]) ;
 * `affaire` : l'affaire liée (lue par l'appelant) ; `extractions` : projets dont `projetSourceId` est ce projet.
 * Même confirmation que le CRM : taper le titre (`confirmationValide`).
 */
export function planSupprimerProjet({ projet, taches = [], liens = [], affaire = null, extractions = [] }) {
  const detachements = [
    ...(affaire && affaire.projetId === projet.id ? modifierSiPatch(C.affaires, affaire.id, { projetId: null }, MARQUES_MODIFICATION) : []),
    ...[...new Map(extractions.filter((e) => e.projetSourceId === projet.id).map((e) => [e.id, e])).values()]
      .flatMap((e) => modifierSiPatch(C.projets, e.id, { projetSourceId: null }, MARQUES_MODIFICATION)),
  ];
  const siens = [...new Map(liens.filter((l) => l.projetId === projet.id).map((l) => [`${l.collection}/${l.id}`, l])).values()];
  return {
    ecritures: [
      ...detachements,
      ...siens.map((l) => ecritureSupprimer(l.collection, l.id)),
      ...taches.filter((t) => t.projetId === projet.id).map((t) => ecritureSupprimer(C.projetsTaches, t.id)),
      ecritureSupprimer(C.projets, projet.id),
    ],
  };
}
