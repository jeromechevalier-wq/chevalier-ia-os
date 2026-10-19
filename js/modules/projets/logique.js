// Logique pure du module Projets (version 2.1, voir docs/cadrage-projets.md) : phases, statuts, création, changements de phase,
// avancement, retard, intégrité des liens et plans d'écriture. Aucun accès à Firebase ni au navigateur : testé avec node --test.
// Même méthode que le CRM : l'écran (et plus tard le serveur MCP) ne contient AUCUNE règle métier, il exécute les plans d'ici.
// Les plans suivent la forme de ceux de crm/logique.js (écritures `creer` / `modifier` / `supprimer`), donc le même moteur d'écriture
// et le même audit s'appliquent.
import {
  COLLECTIONS_PLAN, MARQUES_CREATION, MARQUES_MODIFICATION,
  ecritureCreer, ecritureModifier, ecritureSupprimer, evenements, modifierSiPatch, evenementCreation,
  nettoyerEspaces, aujourdhuiParis, validerUrlGithub, validerUrlDossier, urlOuVide, normaliser, ajouterJours,
  planChangerEtape, planMarquerPerdue, formatEuros, configDe, TYPES_ACTIVITE,
} from '../crm/logique.js';

const C = COLLECTIONS_PLAN;

// ---------------------------------------------------------------- référentiels
// Les phases se stockent par identifiant stable, jamais par libellé. Elles sont configurables (six emplacements fixes, voir crm/logique.js :
// `construireConfig`) : libellé, couleur, description et rôle « clôture » viennent de la configuration de l'espace, passée par `ctx.config`
// (ou `config` quand une fonction n'a pas de ctx). Sans configuration, le jeu neutre sert de repli.

export const STATUTS_PROJET = [
  { id: 'actif', libelle: 'Actif', couleur: '#b98ee0' },
  { id: 'en_pause', libelle: 'En pause', couleur: '#8a9bb4' },
  { id: 'termine', libelle: 'Terminé', couleur: '#3fbf7f' },
];

export const phasesActives = (config) => configDe(config).phases.filter((p) => p.actif);
export const phaseDe = (id, config) => configDe(config).phases.find((p) => p.id === id) ?? null;
export const phaseActive = (id, config) => phaseDe(id, config)?.actif === true;
export const libellePhase = (id, config) => phaseDe(id, config)?.libelle ?? id ?? '';
export const couleurPhase = (id, config) => phaseDe(id, config)?.couleur ?? '#8d8993';
/** Phase où commence un nouveau projet : la première active. */
export const phaseDeDepart = (config) => phasesActives(config)[0]?.id ?? configDe(config).phases[0].id;
/** Identifiant de la phase « clôture ». */
export const phaseCloture = (config) => configDe(config).roleCloture;
export const estPhaseCloture = (id, config) => !!id && id === phaseCloture(config);
/** Rang d'une phase parmi les six emplacements (pour trier) ; une phase inconnue passe en dernier. */
export const rangPhase = (id, config) => { const i = configDe(config).phases.findIndex((p) => p.id === id); return i < 0 ? 99 : i; };

/** Nombre de projets par phase (tous les projets, archivés compris) : { identifiant: nombre }. */
export function comptesParPhase(projets) {
  const comptes = {};
  for (const p of projets || []) if (p.phase) comptes[p.phase] = (comptes[p.phase] || 0) + 1;
  return comptes;
}

/** Membres à qui une tâche peut être confiée : ceux de l'espace (`config.membres`). Un seul membre : pas de choix à proposer. */
export const membresAssignables = (config) => configDe(config).membres;
export const choixAssigneVisible = (config) => membresAssignables(config).length > 1;
/** Nom d'affichage de la personne à qui une tâche est confiée ; un membre retiré garde son nom suivi de « (ancien membre) ». */
export function libelleAssigne(id, config, nomMemorise = '') {
  if (!id) return '';
  const m = membresAssignables(config).find((x) => x.id === id);
  if (m) return m.libelle;
  const nom = nettoyerEspaces(nomMemorise) || (String(id).includes('@') ? String(id).split('@')[0] : String(id));
  return `${nom} (ancien membre)`;
}
/** Assigné par défaut d'une nouvelle tâche : l'auteur s'il est membre, sinon le premier membre, sinon personne. */
export function assigneParDefaut(config, auteur = '') {
  const membres = membresAssignables(config);
  const a = normaliser(auteur);
  return (membres.find((m) => normaliser(m.email) === a) ?? membres[0])?.id ?? '';
}

export const libelleStatutProjet = (id) => STATUTS_PROJET.find((s) => s.id === id)?.libelle ?? id ?? '';

const estJour = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || '') && !Number.isNaN(Date.parse(`${v}T12:00:00Z`));

// ---------------------------------------------------------------- création

/** Seul le titre est obligatoire. Les dates, si elles sont données, sont des jours « AAAA-MM-JJ » et la fin ne précède pas le début. */
export function validerProjet(v = {}, config) {
  const erreurs = {};
  if (!nettoyerEspaces(v.titre)) erreurs.titre = 'Le titre est obligatoire.';
  if (v.phase && !phaseActive(v.phase, config)) erreurs.phase = 'Phase inconnue ou désactivée.';
  if (v.dateDebut && !estJour(v.dateDebut)) erreurs.dateDebut = 'La date de début doit être au format AAAA-MM-JJ.';
  if (v.dateFin && !estJour(v.dateFin)) erreurs.dateFin = 'La date de fin doit être au format AAAA-MM-JJ.';
  if (!erreurs.dateDebut && !erreurs.dateFin && v.dateDebut && v.dateFin && v.dateFin < v.dateDebut) erreurs.dateFin = 'La fin ne peut pas précéder le début.';
  return erreurs;
}

/** Document d'un nouveau projet : phase, statut et dates de départ posés automatiquement. */
export function nouveauProjet(valeurs, ctx) {
  const config = configDe(ctx);
  const phase = phaseActive(valeurs.phase, config) ? valeurs.phase : phaseDeDepart(config);
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
    factures: [],
    urlGithub: urlOuVide(validerUrlGithub, valeurs.urlGithub),
    urlDossier: urlOuVide(validerUrlDossier, valeurs.urlDossier),
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
  const config = configDe(ctx);
  if (!phaseActive(phase, config)) return { erreurs: { phase: 'Phase inconnue ou désactivée.' }, patch: {}, evenements: [] };
  const rouvre = estProjetTermine(projet);
  if (phase === projet.phase && !rouvre) return sansEffet;
  if (estPhaseCloture(phase, config) && !estProjetTermine(projet)) {
    const blocage = blocageCloture(projet, config);
    if (blocage) return blocage;
  }
  const patch = {};
  const faits = [];
  if (phase !== projet.phase) Object.assign(patch, entreeDansPhase(projet, phase, ctx));
  if (rouvre) {
    Object.assign(patch, { statut: 'actif', archive: false });
    faits.push(evenementProjet('projet_rouvert', `Projet rouvert : ${projet.titre}`, projet, ctx));
  }
  if (phase !== projet.phase) faits.push(evenementProjet('phase_changee', `Phase : ${libellePhase(projet.phase, config)} → ${libellePhase(phase, config)}`, projet, ctx));
  const suggestion = phase !== projet.phase ? suggestionPourPhase(phase, aujourdhuiParis(ctx.maintenant), config) : null;
  return { erreurs: {}, patch, evenements: faits, suggestion };
}

/**
 * Action suggérée par la phase où arrive un projet : { type: 'tache', titre, date } ou null (aucune par défaut). Jamais créée toute seule :
 * l'écran demande d'accepter ou de refuser ; si on accepte, c'est une tâche du projet, dans cette phase.
 */
export function suggestionPourPhase(phase, aujourdhui, config) {
  const a = phaseDe(phase, config)?.action;
  return a ? { type: 'tache', titre: a.titre, date: ajouterJours(aujourdhui, a.delaiJours || 0) } : null;
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
 * Fin d'un projet : phase « clôture » (celle qui porte ce rôle), statut Terminé, archivé. Quand le suivi des paiements est allumé et que la règle
 * est active (réglage), la Clôture est BLOQUÉE tant qu'une facture du projet n'est pas payée (voir « facturation »). Deux sorties : marquer la facture payée, ou clôturer avec impayé (`options.impaye = { raison }` : chaque facture
 * restante passe à « Abandonnée »).
 */
export function terminerProjet(projet, ctx, options = {}) {
  if (estProjetTermine(projet)) return sansEffet;
  const config = configDe(ctx);
  const patch = { statut: 'termine', archive: true };
  const faits = [];
  if (clotureBloqueeParFactures(config) && facturesAPayer(projet).length) {
    if (!options.impaye) return blocageCloture(projet, config);
    const raison = nettoyerEspaces(options.impaye.raison);
    if (!raison) return { erreurs: { raison: 'Dis en quelques mots pourquoi la facture est abandonnée.' }, patch: {}, evenements: [] };
    Object.assign(patch, { factures: facturesDe(projet).map((f) => (f.statut === 'a_payer' ? { ...f, statut: 'abandonnee', raison, dateAbandon: aujourdhuiParis(ctx.maintenant) } : f)) });
    facturesAPayer(projet).forEach((f) => faits.push(evenementProjet('facture_abandonnee', `Facture abandonnée : ${libelleFacture(f)} (${raison})`, projet, ctx)));
  }
  if (projet.phase !== phaseCloture(config)) Object.assign(patch, entreeDansPhase(projet, phaseCloture(config), ctx));
  return { erreurs: {}, patch, evenements: [...faits, evenementProjet('projet_termine', `Projet terminé : ${projet.titre}`, projet, ctx)] };
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

// ---------------------------------------------------------------- facturation (version 2.2, décisions du 06 et du 07/10/2026)
// Les factures vivent dans le projet (`factures`, une liste de { id, libelle, montant, dateEnvoi, datePaiement, statut }), une ligne par échéance :
// 30 % à la commande, 30 % en cours de projet, 40 % à la fin = trois lignes. Une facture est payée en entier ou pas. Statuts : À payer, Payée,
// Abandonnée (un seul statut pour l'impayé : « Abandonnée », avec sa raison). La Clôture est bloquée tant qu'une facture est À payer ; la sortie
// « clôturer avec impayé » abandonne les factures restantes. Une facture abandonnée ne compte jamais dans l'encaissé. Seules les factures PAYÉES comptent
// dans l'objectif « chiffre d'affaires encaissé » (`CALCULS.ca_encaisse`, qui lit aussi les projets).

export const STATUTS_FACTURE = [
  { id: 'a_payer', libelle: 'À payer', couleur: '#ecbc06' },
  { id: 'payee', libelle: 'Payée', couleur: '#3fbf7f' },
  { id: 'abandonnee', libelle: 'Abandonnée', couleur: '#fd6455' },
];
export const libelleStatutFacture = (id) => STATUTS_FACTURE.find((s) => s.id === id)?.libelle ?? id;

const MONTANT_MAX = 10_000_000;

export const facturesDe = (projet) => (Array.isArray(projet?.factures) ? projet.factures : []);
export const facturesAPayer = (projet) => facturesDe(projet).filter((f) => f.statut === 'a_payer');
/** Un projet clôturé avec au moins une facture abandonnée garde une pastille « Impayé ». */
export const aUnImpaye = (projet) => facturesDe(projet).some((f) => f.statut === 'abandonnee');
export const libelleFacture = (f) => nettoyerEspaces(f?.libelle) || `Facture de ${formatEuros(f?.montant)}`;
const sommeFactures = (projet, statut) => facturesDe(projet).filter((f) => f.statut === statut).reduce((t, f) => t + (Number(f.montant) || 0), 0);
/** Totaux d'un projet : { facture (tout ce qui n'est pas abandonné), paye, aPayer, abandonne }. */
export function totauxFactures(projet) {
  const paye = sommeFactures(projet, 'payee');
  const aPayer = sommeFactures(projet, 'a_payer');
  return { facture: paye + aPayer, paye, aPayer, abandonne: sommeFactures(projet, 'abandonnee') };
}

/** Le suivi des paiements (factures des projets) est-il allumé ? Éteint : plus de factures, la Clôture n'est jamais bloquée. */
export const suiviPaiementsActif = (config) => configDe(config).options.suiviPaiements === true;
/** La Clôture est-elle bloquée par des factures à payer ? Il faut le suivi des paiements ET la règle « clôture bloquée » (réglable oui/non). */
export const clotureBloqueeParFactures = (config) => suiviPaiementsActif(config) && configDe(config).options.clotureBloquee !== false;

/** Refus de la Clôture : { erreurs: { factures }, facturesBloquantes } ou null quand rien ne bloque. */
export function blocageCloture(projet, config) {
  if (!clotureBloqueeParFactures(config)) return null;
  const bloquantes = facturesAPayer(projet);
  if (!bloquantes.length) return null;
  const liste = bloquantes.map((f) => `${libelleFacture(f)} (${formatEuros(f.montant)})`).join(', ');
  return {
    erreurs: { factures: `Clôture bloquée : ${bloquantes.length > 1 ? 'des factures ne sont pas payées' : 'une facture n’est pas payée'} (${liste}).` },
    facturesBloquantes: bloquantes, patch: {}, evenements: [],
  };
}

/** Montant lu dans un champ (virgule ou point, espaces ignorés) ; NaN quand illisible. */
export function lireMontant(v) {
  if (typeof v === 'number') return v;
  return Number(String(v ?? '').replace(/[\s\u00a0\u202f€]/g, '').replace(',', '.'));
}

export function validerFacture(v = {}) {
  const erreurs = {};
  const montant = lireMontant(v.montant);
  if (v.montant === undefined || v.montant === null || v.montant === '' || !(montant > 0)) erreurs.montant = 'Le montant doit être supérieur à zéro.';
  else if (montant > MONTANT_MAX) erreurs.montant = 'Ce montant est trop grand.';
  if (v.dateEnvoi && !estJour(v.dateEnvoi)) erreurs.dateEnvoi = 'La date d’envoi doit être au format AAAA-MM-JJ.';
  if (v.datePaiement && !estJour(v.datePaiement)) erreurs.datePaiement = 'La date de paiement doit être au format AAAA-MM-JJ.';
  if (!erreurs.dateEnvoi && !erreurs.datePaiement && v.dateEnvoi && v.datePaiement && v.datePaiement < v.dateEnvoi) erreurs.datePaiement = 'Le paiement ne peut pas précéder l’envoi.';
  return erreurs;
}

const retour = (erreurs, extra = {}) => ({ erreurs, patch: {}, evenements: [], ...extra });
export const MESSAGE_SUIVI_ETEINT = 'Le suivi des paiements est désactivé dans les réglages.';
export const MESSAGE_PROJET_TERMINE = 'Ce projet est terminé : rouvre-le d’abord.';
const suiviEteint = (ctx) => (suiviPaiementsActif(configDe(ctx)) ? null : retour({ factures: MESSAGE_SUIVI_ETEINT }));
const trouverFacture = (projet, id) => facturesDe(projet).find((f) => f.id === id) ?? null;
const remplacerFacture = (projet, facture) => facturesDe(projet).map((f) => (f.id === facture.id ? facture : f));

function evenementEncaissement(projet, facture, ctx) {
  return evenementProjet('encaissement', `Encaissement : ${formatEuros(facture.montant)} (${libelleFacture(facture)})`, projet, ctx);
}

/**
 * Ajoute une facture. `valeurs` : montant (obligatoire), libelle, dateEnvoi, datePaiement (une facture déjà payée : elle est créée « Payée »).
 * Rend { erreurs, patch, evenements, facture }.
 */
export function ajouterFacture(projet, valeurs, ctx) {
  { const eteint = suiviEteint(ctx); if (eteint) return eteint; }
  const erreurs = validerFacture(valeurs);
  if (Object.keys(erreurs).length) return retour(erreurs);
  const payee = !!valeurs.datePaiement;
  if (!payee && estProjetTermine(projet)) return retour({ projet: MESSAGE_PROJET_TERMINE }); // un impayé ne se cache pas dans un projet terminé
  const facture = {
    id: ctx.nouvelId('factures'),
    libelle: nettoyerEspaces(valeurs.libelle),
    montant: Math.round(lireMontant(valeurs.montant) * 100) / 100,
    dateEnvoi: valeurs.dateEnvoi || null,
    datePaiement: payee ? valeurs.datePaiement : null,
    statut: payee ? 'payee' : 'a_payer',
  };
  const faits = [evenementProjet('facture_ajoutee', `Facture ajoutée : ${libelleFacture(facture)} (${formatEuros(facture.montant)})`, projet, ctx)];
  if (payee) faits.push(evenementEncaissement(projet, facture, ctx));
  return { erreurs: {}, patch: { factures: [...facturesDe(projet), facture] }, evenements: faits, facture };
}

/** Modifie une facture (libellé, montant, date d'envoi ; date de paiement si elle est payée). Une facture abandonnée ne se modifie pas. */
export function modifierFacture(projet, id, valeurs, ctx) {
  { const eteint = suiviEteint(ctx); if (eteint) return eteint; }
  const f = trouverFacture(projet, id);
  if (!f) return retour({ facture: 'Facture introuvable.' });
  if (f.statut === 'abandonnee') return retour({ facture: 'Une facture abandonnée ne se modifie pas.' });
  const suivante = { ...f, ...valeurs };
  const erreurs = validerFacture({ ...suivante, datePaiement: f.statut === 'payee' ? suivante.datePaiement : null });
  if (f.statut === 'payee' && !suivante.datePaiement) erreurs.datePaiement = 'Une facture payée garde sa date de paiement : pour l’enlever, remets-la à payer.'; // sans date, elle sortirait du chiffre d’affaires
  if (Object.keys(erreurs).length) return retour(erreurs);
  const nette = {
    ...f,
    libelle: nettoyerEspaces(suivante.libelle),
    montant: Math.round(lireMontant(suivante.montant) * 100) / 100,
    dateEnvoi: suivante.dateEnvoi || null,
    datePaiement: f.statut === 'payee' ? suivante.datePaiement : null,
  };
  if (JSON.stringify(nette) === JSON.stringify(f)) return sansEffet;
  return { erreurs: {}, patch: { factures: remplacerFacture(projet, nette) }, evenements: [evenementProjet('facture_modifiee', `Facture modifiée : ${libelleFacture(nette)} (${formatEuros(nette.montant)})`, projet, ctx)], facture: nette };
}

/** Marque une facture payée (date du jour par défaut). Une facture se paie en entier : `montant`, s'il est donné, doit être celui de la facture, sinon refus. Compte dans l'encaissé du mois du paiement. */
export function marquerFacturePayee(projet, id, { datePaiement = null, montant = null } = {}, ctx) {
  { const eteint = suiviEteint(ctx); if (eteint) return eteint; }
  const f = trouverFacture(projet, id);
  if (!f) return retour({ facture: 'Facture introuvable.' });
  if (f.statut === 'payee') return sansEffet;
  if (f.statut === 'abandonnee') return retour({ facture: 'Cette facture est abandonnée : remets-la d’abord à payer.' });
  const jour = datePaiement || aujourdhuiParis(ctx.maintenant);
  if (montant !== null && montant !== undefined && montant !== '') {
    const erreurMontant = validerFacture({ montant }).montant;
    if (erreurMontant) return retour({ montant: erreurMontant });
    if (Math.round(lireMontant(montant) * 100) !== Math.round(lireMontant(f.montant) * 100)) {
      return retour({ montant: `Le montant reçu (${formatEuros(lireMontant(montant))}) ne correspond pas à la facture (${formatEuros(f.montant)}) : une facture se paie en entier. Modifie son montant ou sépare-la en deux lignes.` });
    }
  }
  const erreurs = validerFacture({ montant: f.montant, dateEnvoi: f.dateEnvoi, datePaiement: jour });
  if (Object.keys(erreurs).length) return retour(erreurs);
  const payee = { ...f, montant: Math.round(lireMontant(f.montant) * 100) / 100, datePaiement: jour, statut: 'payee' };
  delete payee.raison;
  delete payee.dateAbandon;
  return { erreurs: {}, patch: { factures: remplacerFacture(projet, payee) }, evenements: [evenementEncaissement(projet, payee, ctx)], facture: payee };
}

/** Remet à payer une facture payée (erreur de saisie) ou abandonnée (le client finit par payer). */
export function remettreFactureAPayer(projet, id, ctx) {
  { const eteint = suiviEteint(ctx); if (eteint) return eteint; }
  const f = trouverFacture(projet, id);
  if (!f) return retour({ facture: 'Facture introuvable.' });
  if (f.statut === 'a_payer') return sansEffet;
  if (estProjetTermine(projet)) return retour({ projet: MESSAGE_PROJET_TERMINE });
  const { raison, dateAbandon, ...reste } = f;
  const nette = { ...reste, datePaiement: null, statut: 'a_payer' };
  return { erreurs: {}, patch: { factures: remplacerFacture(projet, nette) }, evenements: [evenementProjet('facture_remise_a_payer', `Facture remise à payer : ${libelleFacture(nette)}`, projet, ctx)], facture: nette };
}

/** Abandonne une facture (impayé définitif, geste commercial) : la raison est obligatoire. */
export function abandonnerFacture(projet, id, raison, ctx) {
  { const eteint = suiviEteint(ctx); if (eteint) return eteint; }
  const f = trouverFacture(projet, id);
  if (!f) return retour({ facture: 'Facture introuvable.' });
  if (f.statut === 'abandonnee') return sansEffet;
  if (f.statut === 'payee') return retour({ facture: 'Une facture payée ne s’abandonne pas : remets-la d’abord à payer.' });
  const motif = nettoyerEspaces(raison);
  if (!motif) return retour({ raison: 'Dis en quelques mots pourquoi la facture est abandonnée.' });
  const nette = { ...f, statut: 'abandonnee', raison: motif, dateAbandon: aujourdhuiParis(ctx.maintenant) };
  return { erreurs: {}, patch: { factures: remplacerFacture(projet, nette) }, evenements: [evenementProjet('facture_abandonnee', `Facture abandonnée : ${libelleFacture(nette)} (${motif})`, projet, ctx)], facture: nette };
}

export function supprimerFacture(projet, id, ctx) {
  { const eteint = suiviEteint(ctx); if (eteint) return eteint; }
  const f = trouverFacture(projet, id);
  if (!f) return retour({ facture: 'Facture introuvable.' });
  return { erreurs: {}, patch: { factures: facturesDe(projet).filter((x) => x.id !== id) }, evenements: [evenementProjet('facture_supprimee', `Facture supprimée : ${libelleFacture(f)} (${formatEuros(f.montant)})`, projet, ctx)] };
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
export function validerTache(v = {}, config) {
  const erreurs = {};
  if (!nettoyerEspaces(v.titre)) erreurs.titre = 'Le titre est obligatoire.';
  if (v.phase && !phaseActive(v.phase, config)) erreurs.phase = 'Phase inconnue ou désactivée.';
  if (v.date && !estJour(v.date)) erreurs.date = 'La date doit être au format AAAA-MM-JJ.';
  if (v.heure && !estHeure(v.heure)) erreurs.heure = 'L’heure doit être au format HH:MM.';
  if (v.assigneA && !membresAssignables(config).some((a) => a.id === v.assigneA)) erreurs.assigneA = 'Personne inconnue : elle n’est pas membre de l’espace.';
  return erreurs;
}

/** Les tâches d'un projet par ordre d'affichage : phase (dans l'ordre des phases), puis `ordre`, puis titre. */
export function tachesDuProjet(taches, projetId, config) {
  const rang = (t) => rangPhase(t.phase, config);
  return (taches || []).filter((t) => t.projetId === projetId)
    .sort((a, b) => rang(a) - rang(b) || (a.ordre ?? 0) - (b.ordre ?? 0) || normaliser(a.titre).localeCompare(normaliser(b.titre)));
}

/**
 * Les phases actives avec leurs tâches (une phase sans tâche a une liste vide) : [{ phase, taches, faites }].
 * Une phase désactivée qui porte encore des tâches reste montrée, pour qu'aucune tâche ne disparaisse.
 */
export function tachesParPhase(taches, projetId, config) {
  const siennes = tachesDuProjet(taches, projetId, config);
  const montrees = configDe(config).phases.filter((p) => p.actif || siennes.some((t) => t.phase === p.id));
  return montrees.map((phase) => {
    const liste = siennes.filter((t) => t.phase === phase.id);
    return { phase, taches: liste, faites: liste.filter((t) => t.fait).length };
  });
}

/** Document d'une nouvelle tâche. `ordre` : sa place dans la phase (le plan le calcule). */
export function nouvelleTache(valeurs, ctx) {
  const config = configDe(ctx);
  const membre = membresAssignables(config).find((m) => m.id === valeurs.assigneA) ?? membresAssignables(config).find((m) => m.id === assigneParDefaut(config, ctx.auteur)) ?? null;
  return {
    titre: nettoyerEspaces(valeurs.titre),
    projetId: valeurs.projetId,
    phase: phaseActive(valeurs.phase, config) ? valeurs.phase : phaseDeDepart(config),
    ordre: valeurs.ordre ?? 1,
    date: estJour(valeurs.date) ? valeurs.date : null,
    heure: estHeure(valeurs.heure) ? valeurs.heure : '',
    fait: false,
    dateFait: null,
    assigneA: membre?.id ?? '',
    assigneNom: membre?.libelle ?? '',
    auteur: ctx.auteur ?? '',
  };
}

const prochainOrdre = (taches, projetId, phase) => 1 + Math.max(0, ...(taches || []).filter((t) => t.projetId === projetId && t.phase === phase).map((t) => t.ordre ?? 0));

/** Crée une tâche à la fin de sa phase. `valeurs.phase` : la phase du projet par défaut (c'est l'écran qui la donne). Refus : { erreurs, ecritures: [] }. */
export function planCreerTache({ projet, taches = [], valeurs }, ctx) {
  const config = configDe(ctx);
  const phase = phaseActive(valeurs.phase, config) ? valeurs.phase : (phaseActive(projet.phase, config) ? projet.phase : phaseDeDepart(config));
  const complet = { ...valeurs, phase, projetId: projet.id };
  const erreurs = validerTache(complet, config);
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
export function planMajTache({ tache, patch, taches = [], config }) {
  const erreurs = validerTache({ titre: tache.titre, ...patch }, config);
  if (Object.keys(erreurs).length) return { erreurs, ecritures: [] };
  const net = { ...patch };
  if (net.assigneA) net.assigneNom = membresAssignables(config).find((m) => m.id === net.assigneA)?.libelle ?? '';
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
// Un modèle = un nom, une offre liée (facultative), une liste de tâches types (titre, phase, délai en jours après le début du projet).
// Créer un projet depuis un modèle crée ses tâches, avec leurs dates calculées. Les modèles de départ sont écrits ici ; les copies de la base
// sont modifiables (Réglages, « Modèles de projets »).

/** Modèles de Jérôme (03/10/2026), semés seulement dans sa base. Délai `null` : pas de date (elle se pose au fil de l'eau). */
export const MODELES_JEROME = [
  {
    id: 'audit', nom: 'Audit', offreId: 'audit', actif: true, ordre: 1,
    taches: [
      { id: 'audit-interview', titre: 'Interview', phase: 'decouverte', delaiJours: null, ordre: 1 },
      { id: 'audit-rapport', titre: 'Créer le rapport', phase: 'livraison', delaiJours: null, ordre: 1 },
      { id: 'audit-debriefing', titre: 'Débriefing avec le client', phase: 'livraison', delaiJours: null, ordre: 2 },
    ],
  },
  {
    id: 'accompagnement', nom: 'Accompagnement', offreId: 'accompagnement', actif: true, ordre: 2,
    taches: [{ id: 'accompagnement-lancement', titre: 'Rendez-vous de lancement', phase: 'lancement', delaiJours: null, ordre: 1 }],
  },
];

/** Jeu neutre d'un nouvel espace : un seul modèle générique, sur les trois premières phases du jeu neutre. */
export const MODELES_NEUTRES = [
  {
    id: 'projet-type', nom: 'Projet type', offreId: null, actif: true, ordre: 1,
    taches: [
      { id: 'projet-type-demarrage', titre: 'Réunion de démarrage', phase: 'phase_1', delaiJours: null, ordre: 1 },
      { id: 'projet-type-point', titre: 'Point d’avancement', phase: 'phase_2', delaiJours: null, ordre: 1 },
      { id: 'projet-type-livraison', titre: 'Livraison au client', phase: 'phase_3', delaiJours: null, ordre: 1 },
    ],
  },
];

const DELAI_MAX = 3650;

export function validerModele(v = {}) {
  const erreurs = {};
  if (!nettoyerEspaces(v.nom)) erreurs.nom = 'Le nom est obligatoire.';
  return erreurs;
}

/** Tâche type : titre obligatoire, phase connue, délai = nombre entier de jours après le début du projet (vide = pas de date). */
export function validerTacheModele(v = {}, config) {
  const erreurs = {};
  if (!nettoyerEspaces(v.titre)) erreurs.titre = 'Le titre est obligatoire.';
  if (v.phase && !phaseActive(v.phase, config)) erreurs.phase = 'Phase inconnue ou désactivée.';
  const d = v.delaiJours;
  if (d !== null && d !== undefined && d !== '' && !(Number.isInteger(Number(d)) && Number(d) >= 0 && Number(d) <= DELAI_MAX)) erreurs.delaiJours = `Le délai est un nombre de jours entre 0 et ${DELAI_MAX}.`;
  return erreurs;
}

const delaiNet = (d) => (d === null || d === undefined || d === '' ? null : Number(d));

/** Les tâches d'un modèle dans l'ordre d'affichage : phase, puis `ordre`. */
export function tachesDuModele(modele, config) {
  const rang = (t) => rangPhase(t.phase, config);
  return [...(modele?.taches || [])].sort((a, b) => rang(a) - rang(b) || (a.ordre ?? 0) - (b.ordre ?? 0));
}

/** Les phases actives (et celles, désactivées, qui portent encore des tâches types) avec leurs tâches types : [{ phase, taches }]. */
export function tachesModeleParPhase(modele, config) {
  const toutes = tachesDuModele(modele, config);
  return configDe(config).phases.filter((p) => p.actif || toutes.some((t) => t.phase === p.id)).map((phase) => ({ phase, taches: toutes.filter((t) => t.phase === phase.id) }));
}

export const modelesActifs = (modeles) => (modeles || []).filter((m) => m.actif !== false).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));

/** Le modèle proposé pour une offre : le premier modèle actif qui y est lié (null s'il n'y en a pas). */
export const modeleParOffre = (modeles, offreId) => (offreId ? modelesActifs(modeles).find((m) => m.offreId === offreId) ?? null : null);

/** Les tâches d'un modèle devenues vraies tâches d'un projet : date = début du projet + délai, ordre repris dans chaque phase. */
function ecrituresTachesModele(modele, { projetId, dateDebut }, ctx) {
  if (!modele) return [];
  const comptes = {};
  return tachesDuModele(modele, configDe(ctx)).map((t) => {
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

/** Modifie le nom, l'offre ou l'état (actif) d'un modèle. */
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
  const config = configDe(ctx);
  const phase = phaseActive(valeurs.phase, config) ? valeurs.phase : phaseDeDepart(config);
  const erreurs = validerTacheModele({ ...valeurs, phase }, config);
  if (Object.keys(erreurs).length) return { erreurs, ecritures: [] };
  const ordre = 1 + Math.max(0, ...(modele.taches || []).filter((t) => t.phase === phase).map((t) => t.ordre ?? 0));
  const tache = { id: ctx.nouvelId(C.projetsModeles), titre: nettoyerEspaces(valeurs.titre), phase, delaiJours: delaiNet(valeurs.delaiJours), ordre };
  return { erreurs: {}, ...ecrireTachesModele(modele, [...(modele.taches || []), tache]) };
}

/** Modifie une tâche type (titre, délai, phase). Changer de phase la place à la fin de la nouvelle phase. */
export function planMajTacheModele({ modele, tacheId, patch, config }) {
  const tache = (modele.taches || []).find((t) => t.id === tacheId);
  if (!tache) return { erreurs: { tache: 'Tâche introuvable.' }, ecritures: [] };
  const erreurs = validerTacheModele({ titre: tache.titre, ...patch }, config);
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
export function planDeplacerTacheModele({ modele, tacheId, sens, config }) {
  const tache = (modele.taches || []).find((t) => t.id === tacheId);
  if (!tache) return { ecritures: [] };
  const liste = tachesDuModele(modele, config).filter((t) => t.phase === tache.phase);
  const i = liste.findIndex((t) => t.id === tacheId);
  const j = i + sens;
  if (j < 0 || j >= liste.length) return { ecritures: [] };
  [liste[i], liste[j]] = [liste[j], liste[i]];
  const place = new Map(liste.map((t, k) => [t.id, k + 1]));
  return ecrireTachesModele(modele, modele.taches.map((t) => (place.has(t.id) ? { ...t, ordre: place.get(t.id) } : t)));
}

/** Création des modèles de départ (premier lancement) : les identifiants sont fixes, donc le même plan rejoué n'en fait jamais deux. */
export function planInitialiserModeles({ racine = false } = {}) {
  return { ecritures: (racine ? MODELES_JEROME : MODELES_NEUTRES).map(({ id, ...donnees }) => ecritureCreer(C.projetsModeles, id, structuredClone(donnees), MARQUES_CREATION)) };
}

// ---------------------------------------------------------------- liens

/** Le projet d'une affaire (au plus un). Les anciens projets d'extraction (nature `extraction`, supprimée le 18/10/2026) ne comptent pas comme « son projet » : ils restent lisibles dans la liste des projets, sans bloquer la création du vrai projet. */
export const projetDeAffaire = (projets, affaireId) => (projets || []).find((p) => affaireId && p.affaireId === affaireId && p.nature !== 'extraction') ?? null;

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

/** Projets qu'on peut lier à une affaire : sans affaire, pas archivés, par ordre alphabétique. */
export const projetsLiables = (projets) => (projets || []).filter((p) => !p.affaireId && !p.archive).sort((a, b) => normaliser(a.titre).localeCompare(normaliser(b.titre)));

/**
 * Crée le projet d'une affaire gagnée : il reprend le titre, la personne, l'organisation, l'offre, l'adresse GitHub et le dossier de l'affaire
 * (`valeurs` peut en changer). Même plan : l'affaire reçoit `projetId`. Refus : { erreurs, ecritures: [] }.
 */
export function planCreerProjetDepuisAffaire({ affaire, projets = [], valeurs = {}, modele = null }, ctx) {
  const erreurs = validerLienAffaire({ affaire, projets });
  if (Object.keys(erreurs).length) return { erreurs, ecritures: [] };
  const id = ctx.nouvelId(C.projets);
  const fiche = nouveauProjet({
    titre: affaire.titre, personneId: affaire.personneId, organisationId: affaire.organisationId, offreId: affaire.offreId,
    urlGithub: affaire.urlGithub, urlDossier: affaire.urlDossier, ...valeurs, affaireId: affaire.id,
    ...(modele ? { modeleId: modele.id } : {}),
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

export const CRITERES_PROJETS_VIDES = Object.freeze({ recherche: '', phases: [], statuts: [], enRetard: false });

/** Critères complets : les clés manquantes reprennent leur valeur vide (comme `criteresComplets` du CRM). */
export function criteresProjetsComplets(c = {}) {
  return {
    recherche: c.recherche ?? '',
    phases: [...(c.phases ?? [])],
    statuts: [...(c.statuts ?? [])],
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
  return [k.phases.length, k.statuts.length, k.enRetard ? 1 : 0].filter(Boolean).length;
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
 * `modele` (facultatif) : le projet part avec les tâches du modèle (dates calculées d'après le début du projet).
 */
export function planCreerProjet(valeurs, ctx, { modele = null } = {}) {
  const id = ctx.nouvelId(C.projets);
  const fiche = nouveauProjet(modele ? { ...valeurs, modeleId: modele.id } : valeurs, ctx);
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
export const planTerminerProjet = (projet, ctx, options = {}) => planResultatProjet(projet.id, terminerProjet(projet, ctx, options), ctx);
export const planRouvrirProjet = (projet, ctx) => planResultatProjet(projet.id, rouvrirProjet(projet, ctx), ctx);
export const planAjouterFacture = (projet, valeurs, ctx) => planResultatProjet(projet.id, ajouterFacture(projet, valeurs, ctx), ctx);
export const planModifierFacture = (projet, id, valeurs, ctx) => planResultatProjet(projet.id, modifierFacture(projet, id, valeurs, ctx), ctx);
export const planMarquerFacturePayee = (projet, id, options, ctx) => planResultatProjet(projet.id, marquerFacturePayee(projet, id, options, ctx), ctx);
export const planRemettreFactureAPayer = (projet, id, ctx) => planResultatProjet(projet.id, remettreFactureAPayer(projet, id, ctx), ctx);
export const planAbandonnerFacture = (projet, id, raison, ctx) => planResultatProjet(projet.id, abandonnerFacture(projet, id, raison, ctx), ctx);
export const planSupprimerFacture = (projet, id, ctx) => planResultatProjet(projet.id, supprimerFacture(projet, id, ctx), ctx);
export const planArchiverProjet = (projet, archive, ctx) => planResultatProjet(projet.id, archiverProjet(projet, archive, ctx), ctx);

/**
 * Suppression définitive d'un projet (l'archivage est la voie normale). Sont supprimés : le projet, ses tâches et son fil.
 * Est gardée, avec son lien vidé : l'affaire d'origine (`projetId`). Aucun autre projet n'est modifié.
 * `taches` : projets_taches du projet ; `liens` : notes, événements et activités qui portent son `projetId` ([{ collection, id, projetId }]) ;
 * `affaire` : l'affaire liée (lue par l'appelant).
 * Même confirmation que le CRM : taper le titre (`confirmationValide`).
 */
export function planSupprimerProjet({ projet, taches = [], liens = [], affaire = null }) {
  const detachements = [
    ...(affaire && affaire.projetId === projet.id ? modifierSiPatch(C.affaires, affaire.id, { projetId: null }, MARQUES_MODIFICATION) : []),
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
