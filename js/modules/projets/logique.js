// Logique pure du module Projets (version 2.1, voir docs/cadrage-projets.md) : phases, statuts, création, changements de phase,
// avancement, retard, intégrité des liens et plans d'écriture. Aucun accès à Firebase ni au navigateur : testé avec node --test.
// Même méthode que le CRM : l'écran (et plus tard le serveur MCP) ne contient AUCUNE règle métier, il exécute les plans d'ici.
// Les plans suivent la forme de ceux de crm/logique.js (écritures `creer` / `modifier` / `supprimer`), donc le même moteur d'écriture
// et le même audit s'appliquent.
import {
  COLLECTIONS_PLAN, MARQUES_CREATION, MARQUES_MODIFICATION,
  ecritureCreer, ecritureSupprimer, evenements, modifierSiPatch, evenementCreation,
  nettoyerEspaces, aujourdhuiParis, validerUrlGithub, validerUrlDossier, urlOuVide, normaliser,
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

// ---------------------------------------------------------------- liens

/** Le projet d'une affaire (au plus un). */
export const projetDeAffaire = (projets, affaireId) => (projets || []).find((p) => affaireId && p.affaireId === affaireId) ?? null;

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

/** Projets qu'on peut lier à une affaire : sans affaire et pas archivés, par ordre alphabétique. */
export const projetsLiables = (projets) => (projets || []).filter((p) => !p.affaireId && !p.archive).sort((a, b) => normaliser(a.titre).localeCompare(normaliser(b.titre)));

/**
 * Crée le projet d'une affaire gagnée : il reprend le titre, la personne, l'organisation, l'offre, l'adresse GitHub et le dossier de l'affaire
 * (`valeurs` peut en changer). Même plan : l'affaire reçoit `projetId`. Refus : { erreurs, ecritures: [] }.
 */
export function planCreerProjetDepuisAffaire({ affaire, projets = [], valeurs = {} }, ctx) {
  const erreurs = validerLienAffaire({ affaire, projets });
  if (Object.keys(erreurs).length) return { erreurs, ecritures: [] };
  const id = ctx.nouvelId(C.projets);
  const fiche = nouveauProjet({
    titre: affaire.titre, personneId: affaire.personneId, organisationId: affaire.organisationId, offreId: affaire.offreId,
    urlGithub: affaire.urlGithub, urlDossier: affaire.urlDossier, ...valeurs, affaireId: affaire.id,
  }, ctx);
  return {
    erreurs: {},
    id,
    titre: fiche.titre,
    ecritures: [
      ecritureCreer(C.projets, id, fiche, MARQUES_CREATION),
      ...modifierSiPatch(C.affaires, affaire.id, { projetId: id }, MARQUES_MODIFICATION),
      ...evenements([evenementProjet('projet_cree', `Projet créé : ${fiche.titre}`, { ...fiche, id }, ctx)], ctx),
    ],
  };
}

/**
 * Lie un projet existant (sans affaire) à une affaire gagnée. Le projet garde ce qu'il a déjà ; ce qui lui manque (personne, organisation, offre,
 * adresse GitHub, dossier) est repris de l'affaire.
 */
export function planLierProjet({ affaire, projet, projets = [] }, ctx) {
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

/** `ctx.nouvelId(collection)` donne un identifiant frais. L'appelant valide d'abord (`validerProjet`). */
export function planCreerProjet(valeurs, ctx) {
  const id = ctx.nouvelId(C.projets);
  const fiche = nouveauProjet(valeurs, ctx);
  return {
    id,
    titre: fiche.titre,
    ecritures: [
      ecritureCreer(C.projets, id, fiche, MARQUES_CREATION),
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
