// Lecture du CRM pour le serveur MCP : mêmes règles que l'écran (partage/logique.js), sans aucune écriture.
// Toutes les fonctions reçoivent l'accès aux données (Firestore ou mémoire) et renvoient des valeurs JSON (dates en texte).
import * as L from '../../partage/logique.js';
import * as PL from '../../partage/projets.js';
import * as DA from '../../partage/devis-articles.js';
import * as DF from '../../partage/devis-familles.js';
import * as DV from '../../partage/devis-vocabulaire.js';
import * as D from '../../partage/devis.js';
import { COLLECTIONS as C } from './donnees.js';
import { serialiser } from './serialisation.js';
import { ditHorsTaxes, ditPourAssistant, sansModeMarge } from './voix.js';
import { lireConfig } from './config.js';
import { structureCourte, phraseTotaux } from './recapitulatif.js';

export const MAX_LIGNES = 200;
const borne = (liste, limite = MAX_LIGNES) => ({ total: liste.length, tronque: liste.length > limite, elements: liste.slice(0, limite) });
const nomDe = (liste, id) => (id ? liste.find((x) => x.id === id)?.nom ?? null : null);
const introuvable = (genre) => { throw new Error(`${genre} introuvable`); };

async function toutes(donnees) {
  const [personnes, organisations, affaires, activites] = await Promise.all(
    [C.personnes, C.organisations, C.affaires, C.activites].map((nom) => donnees.liste(nom)),
  );
  return { personnes, organisations, affaires, activites };
}

const lienActivite = (a) => a.affaireId ?? a.personneId ?? a.organisationId ?? null;

// ---------------------------------------------------------------- chercher

export async function chercher(donnees, { texte, types, limite }) {
  const voulus = new Set(types?.length ? types : ['personnes', 'organisations', 'affaires']);
  if (L.normaliserNom(texte).length < L.MIN_LETTRES) return { resultats: [], total: 0, message: `Saisir au moins ${L.MIN_LETTRES} lettres.` };
  const { personnes, organisations, affaires } = await toutes(donnees);
  const max = Math.min(limite ?? L.MAX_SUGGESTIONS, 50);
  const groupes = {
    personnes: personnes.filter((p) => !p.archive).map((p) => {
      const o = organisations.find((x) => x.id === p.organisationId);
      return { id: p.id, libelle: p.nom, sousTitre: o?.nom || L.premierEmail(p) || '', extra: [o?.nom, ...(p.emails || []).map((e) => e.valeur)].filter(Boolean) };
    }),
    organisations: organisations.filter((o) => !o.archive).map((o) => ({ id: o.id, libelle: o.nom, sousTitre: o.ville || '' })),
    affaires: affaires.filter((a) => !a.archive).map((a) => {
      const p = personnes.find((x) => x.id === a.personneId);
      const o = organisations.find((x) => x.id === a.organisationId);
      return { id: a.id, libelle: a.titre, sousTitre: [o?.nom, p?.nom].filter(Boolean).join(' · '), extra: [o?.nom, p?.nom].filter(Boolean) };
    }),
  };
  const resultats = [];
  let total = 0;
  for (const type of ['personnes', 'organisations', 'affaires']) {
    if (!voulus.has(type)) continue;
    const r = L.rechercherSuggestions(texte, groupes[type], { max });
    total += r.total;
    for (const el of r.resultats) resultats.push({ type, id: el.id, libelle: el.libelle, sousTitre: el.sousTitre });
  }
  return { resultats, total };
}

// ---------------------------------------------------------------- fiches

async function fil(donnees, champ, id, activites) {
  const [notes, evenements] = await Promise.all([C.notes, C.evenements].map((nom) => donnees.liste(nom, { champ, valeur: id })));
  // Sans la copie en double (I5 : note épinglée d'un projet créé depuis une affaire = copie de celle de l'affaire).
  return L.entreesHistorique({ activites, notes: L.sansCopiesDeNote(notes, { [champ]: id }), evenements }, 'tous')
    .map((e) => ({ genre: e.genre, date: e.date ? e.date.toISOString() : null, ...serialiser(e.element) }));
}

const resumeAffaire = (a) => ({ id: a.id, titre: a.titre, etape: a.etape, statut: L.statutAffiche(a), archive: !!a.archive });

export async function lirePersonne(donnees, { id, avecFil }) {
  const personne = await donnees.document(C.personnes, id);
  if (!personne) introuvable('Personne');
  const [organisation, affaires, activites] = await Promise.all([
    personne.organisationId ? donnees.document(C.organisations, personne.organisationId) : null,
    donnees.liste(C.affaires, { champ: 'personneId', valeur: id }),
    donnees.liste(C.activites, { champ: 'personneId', valeur: id }),
  ]);
  return serialiser({
    personne: { ...personne, adresses: L.adressesDe(personne) },
    organisation: organisation ? { id: organisation.id, nom: organisation.nom } : null,
    affaires: affaires.map(resumeAffaire),
    activites,
    ...(avecFil ? { fil: await fil(donnees, 'personneId', id, activites) } : {}),
  });
}

export async function lireOrganisation(donnees, { id, avecFil }) {
  const organisation = await donnees.document(C.organisations, id);
  if (!organisation) introuvable('Organisation');
  const [personnes, affaires, activites] = await Promise.all([
    donnees.liste(C.personnes, { champ: 'organisationId', valeur: id }),
    donnees.liste(C.affaires, { champ: 'organisationId', valeur: id }),
    donnees.liste(C.activites, { champ: 'organisationId', valeur: id }),
  ]);
  return serialiser({
    organisation: { ...organisation, emails: L.contactsOrganisation(organisation, 'emails'), telephones: L.contactsOrganisation(organisation, 'telephones'), adresses: L.adressesDe(organisation) },
    personnes: personnes.map((p) => ({ id: p.id, nom: p.nom, archive: !!p.archive })),
    affaires: affaires.map(resumeAffaire),
    activites,
    ...(avecFil ? { fil: await fil(donnees, 'organisationId', id, activites) } : {}),
  });
}

// L'ancien champ « description » (texte libre, supprimé par I5 : remplacé par la note épinglée) peut rester dans les fiches anciennes : il est ignoré, jamais lu.
const sansDescription = ({ description: _ancienChamp, ...fiche }) => fiche;

export async function lireAffaire(donnees, { id, avecFil }) {
  const brute = await donnees.document(C.affaires, id);
  if (!brute) introuvable('Affaire');
  // `montant` = le montant estimé saisi ; `montantDevisHt` = le montant calculé d'après les devis, avec `montantDevisNature` (accepte | propose) et `montantDevisDetail` (écrits par le serveur) ; `montantAffiche` = celui que montre l'écran (le calcul d'abord).
  const affaire = { ...sansDescription(brute), statut: L.statutAffiche(brute), montantAffiche: L.montantAffaire(brute) };
  const [personne, organisation, activites] = await Promise.all([
    affaire.personneId ? donnees.document(C.personnes, affaire.personneId) : null,
    affaire.organisationId ? donnees.document(C.organisations, affaire.organisationId) : null,
    donnees.liste(C.activites, { champ: 'affaireId', valeur: id }),
  ]);
  return serialiser({
    affaire,
    personne: personne ? { id: personne.id, nom: personne.nom } : null,
    organisation: organisation ? { id: organisation.id, nom: organisation.nom } : null,
    activites,
    ...(avecFil ? { fil: await fil(donnees, 'affaireId', id, activites) } : {}),
  });
}

// ---------------------------------------------------------------- listes

export async function listerAffaires(donnees, { etape, statut, archive, personneId, organisationId, recherche, enRetard, sansAction, limite }, maintenant) {
  const { personnes, organisations, affaires, activites } = await toutes(donnees);
  const aujourdhui = L.aujourdhuiParis(maintenant);
  const criteres = {
    recherche: recherche || '',
    etapes: etape ? [etape] : [],
    statuts: statut ? [statut] : [],
    personnes: personneId ? [personneId] : [],
    organisations: organisationId ? [organisationId] : [],
    archives: !!archive,
    enRetard: !!enRetard,
    sansAction: !!sansAction,
  };
  const gardees = L.filtrerAffaires(affaires, criteres, { activites, personnes, organisations, aujourdhui });
  const lignes = gardees.map((a) => ({ ...sansDescription(a), statut: L.statutAffiche(a), montantAffiche: L.montantAffaire(a), personne: nomDe(personnes, a.personneId), organisation: nomDe(organisations, a.organisationId) }));
  const { total, tronque, elements } = borne(lignes, Math.min(limite ?? MAX_LIGNES, MAX_LIGNES));
  return serialiser({ total, tronque, affaires: elements });
}

export async function listerActivites(donnees, { affaireId, personneId, organisationId, fait, enRetard, limite }, maintenant) {
  const lien = affaireId ? { champ: 'affaireId', valeur: affaireId }
    : personneId ? { champ: 'personneId', valeur: personneId }
      : organisationId ? { champ: 'organisationId', valeur: organisationId } : null;
  const aujourdhui = L.aujourdhuiParis(maintenant);
  let activites = await donnees.liste(C.activites, lien || undefined);
  if (fait !== undefined) activites = activites.filter((a) => !!a.fait === fait);
  if (enRetard) activites = activites.filter((a) => L.estActiviteEnRetard(a, aujourdhui));
  activites = L.trierActivites(activites);
  const { total, tronque, elements } = borne(activites, Math.min(limite ?? MAX_LIGNES, MAX_LIGNES));
  return serialiser({ total, tronque, activites: elements.map((a) => ({ ...a, lien: lienActivite(a) })) });
}

export async function listerDocuments(donnees, { affaireId, projetId }) {
  // Sans filtre : affaires puis projets ; avec un filtre : seulement la source demandée.
  const affaires = projetId ? [] : affaireId ? [await donnees.document(C.affaires, affaireId)].filter(Boolean) : await donnees.liste(C.affaires);
  const projets = affaireId ? [] : projetId ? [await donnees.document(C.projets, projetId)].filter(Boolean) : await donnees.liste(C.projets);
  const ligne = (d, index) => ({ index, libelle: d.libelle ?? null, url: d.url ?? null, ...(d.note ? { note: d.note } : {}), favori: d.favori === true, ...(d.ajouteLe ? { ajouteLe: d.ajouteLe } : {}) });
  const documents = [
    ...affaires.flatMap((a) => (a.documents || []).map((d, index) => ({ affaireId: a.id, titreAffaire: a.titre, ...ligne(d, index) }))),
    ...projets.flatMap((p) => (p.documents || []).map((d, index) => ({ projetId: p.id, titreProjet: p.titre, ...ligne(d, index) }))),
  ];
  // Fichiers déposés chez nous (onglet « Documents ») : id, nom, taille, date, qui. Le chemin du stockage n'est jamais donné. Le plus récent d'abord.
  const cible = affaireId ? { champ: 'cibleId', valeur: affaireId } : projetId ? { champ: 'cibleId', valeur: projetId } : undefined;
  const ms = (d) => (typeof d?.toMillis === 'function' ? d.toMillis() : d instanceof Date ? d.getTime() : typeof d?.seconds === 'number' ? d.seconds * 1000 : 0);
  const fichiers = (await donnees.liste(C.documentsStockes, cible))
    .filter((f) => ['affaire', 'projet'].includes(f.cibleType) && !f.supprimeLe && (affaireId ? f.cibleType === 'affaire' : projetId ? f.cibleType === 'projet' : true))
    .sort((a, b) => ms(b.creeLe) - ms(a.creeLe))
    .map((f) => ({ id: f.id, [f.cibleType === 'affaire' ? 'affaireId' : 'projetId']: f.cibleId, nom: f.nom, taille: f.taille ?? null, typeMime: f.typeMime ?? null, creeLe: f.creeLe ?? null, creePar: f.creePar ?? null }));
  return serialiser({ total: documents.length, documents, totalFichiers: fichiers.length, fichiers });
}

// ---------------------------------------------------------------- projets (2.1) et factures (2.2)

const resumeFacturation = (p) => ({ ...PL.totauxFactures(p), aPayer: PL.facturesAPayer(p).length, impaye: PL.aUnImpaye(p) });

export async function listerProjets(donnees, { phase, statut, archive, affaireId, personneId, organisationId, recherche, enRetard, limite }, maintenant, espace = {}) {
  const config = await lireConfig(donnees, espace);
  const [projets, taches, personnes, organisations] = await Promise.all([C.projets, C.projetsTaches, C.personnes, C.organisations].map((nom) => donnees.liste(nom)));
  const criteres = { recherche: recherche || '', phases: phase ? [phase] : [], statuts: statut ? [statut] : [], enRetard: !!enRetard };
  let gardes = PL.filtrerProjets(projets, criteres, { personnes, organisations, taches, aujourdhui: L.aujourdhuiParis(maintenant), archives: !!archive });
  if (affaireId) gardes = gardes.filter((p) => p.affaireId === affaireId);
  if (personneId) gardes = gardes.filter((p) => p.personneId === personneId);
  if (organisationId) gardes = gardes.filter((p) => p.organisationId === organisationId);
  const lignes = L.trier(gardes, (p) => L.normaliser(p.titre)).map((p) => ({
    ...sansDescription(p), statut: PL.statutProjetAffiche(p), personne: nomDe(personnes, p.personneId), organisation: nomDe(organisations, p.organisationId),
    avancement: PL.progressionProjet(PL.tachesDuProjet(taches, p.id, config)), facturation: config.options.suiviPaiements ? resumeFacturation(p) : null,
  }));
  const { total, tronque, elements } = borne(lignes, Math.min(limite ?? MAX_LIGNES, MAX_LIGNES));
  return serialiser({ total, tronque, projets: elements });
}

export async function lireProjet(donnees, { id, avecFil }, espace = {}) {
  const config = await lireConfig(donnees, espace);
  const brut = await donnees.document(C.projets, id);
  if (!brut) introuvable('Projet');
  const projet = { ...sansDescription(brut), statut: PL.statutProjetAffiche(brut) };
  const [affaire, personne, organisation, taches] = await Promise.all([
    projet.affaireId ? donnees.document(C.affaires, projet.affaireId) : null,
    projet.personneId ? donnees.document(C.personnes, projet.personneId) : null,
    projet.organisationId ? donnees.document(C.organisations, projet.organisationId) : null,
    donnees.liste(C.projetsTaches, { champ: 'projetId', valeur: id }),
  ]);
  return serialiser({
    projet,
    affaire: affaire ? { id: affaire.id, titre: affaire.titre, etape: affaire.etape, statut: L.statutAffiche(affaire) } : null,
    personne: personne ? { id: personne.id, nom: personne.nom } : null,
    organisation: organisation ? { id: organisation.id, nom: organisation.nom } : null,
    livrables: PL.tachesDuProjet(taches, id, config), // le stockage garde le nom « projets_taches » (aucune migration)
    avancement: PL.progressionProjet(taches),
    facturation: config.options.suiviPaiements ? resumeFacturation(projet) : null,
    ...(avecFil ? { fil: await fil(donnees, 'projetId', id, []) } : {}),
  });
}

export async function listerModelesProjet(donnees) {
  const modeles = await donnees.liste(C.projetsModeles);
  return serialiser({ total: modeles.length, modeles: [...modeles].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0)).map(({ taches, ...m }) => ({ ...m, livrables: taches || [] })) });
}

// ---------------------------------------------------------------- réglages

export async function lireReglages(donnees, espace = {}) {
  const config = await lireConfig(donnees, espace);
  const docs = Object.fromEntries((await donnees.liste(C.parametres)).map((d) => [d.id, d]));
  const tri = (items) => [...(items || [])].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
  return serialiser({
    offres: tri(docs.offres?.items),
    secteurs: docs.listes?.secteurs || [],
    sources: docs.listes?.sources || [],
    etiquettes: tri(docs.etiquettes?.items),
    reglages: L.reglagesEffectifs(docs.reglages, { racine: espace.racine ?? !donnees.base }),
    // Configuration de l'espace : étapes de vente et phases de projet (six emplacements, actifs ou non), rôles, options (interrupteurs).
    configuration: {
      etapes: config.etapes.map(({ id, libelle, description, actif, action }) => ({ id, libelle, description, actif, action, roleGagnee: id === config.roleGagnee })),
      phases: config.phases.map(({ id, libelle, description, actif, action }) => ({ id, libelle, description, actif, action, roleCloture: id === config.roleCloture })),
      options: config.options,
    },
    referentiels: {
      etapes: L.etapesActives(config).map(({ id, libelle }) => ({ id, libelle })),
      statuts: L.STATUTS,
      typesContact: L.TYPES_CONTACT,
      typesActivite: L.TYPES_ACTIVITE,
      priorites: L.PRIORITES,
      raisonsPerdue: L.RAISONS_PERDUE,
      tailles: L.TAILLES,
      projets: { phases: PL.phasesActives(config).map(({ id, libelle }) => ({ id, libelle })), statuts: PL.STATUTS_PROJET.map(({ id, libelle }) => ({ id, libelle })), assignes: config.membres.map(({ id, libelle }) => ({ id, libelle })), statutsFacture: config.options.suiviPaiements ? PL.STATUTS_FACTURE.map(({ id, libelle }) => ({ id, libelle })) : [] },
    },
  });
}

// ---------------------------------------------------------------- audit

export async function lireAudit(donnees, { acteur, docId, operationId, depuis, incompletes, limite }) {
  const filtre = operationId ? { champ: 'operationId', valeur: operationId }
    : docId ? { champ: 'docId', valeur: docId }
      : acteur ? { champ: 'acteur', valeur: acteur } : undefined;
  let lignes = await donnees.liste(C.audit, filtre);
  if (acteur) lignes = lignes.filter((l) => l.acteur === acteur);
  if (docId) lignes = lignes.filter((l) => l.docId === docId);
  if (operationId) lignes = lignes.filter((l) => l.operationId === operationId);
  if (depuis) {
    // Un jour seul (AAAA-MM-JJ) veut dire « depuis minuit, heure de Paris » (versDate le lirait comme midi).
    const seuil = L.versDate(/^\d{4}-\d{2}-\d{2}$/.test(depuis) ? `${depuis}T00:00` : depuis);
    if (!seuil) throw new Error('Date « depuis » illisible (attendu : AAAA-MM-JJ ou date ISO)');
    lignes = lignes.filter((l) => (L.versDate(l.date)?.getTime() ?? 0) >= seuil.getTime());
  }
  if (incompletes) lignes = lignes.filter((l) => l.statut === 'en_cours');
  lignes.sort((a, b) => (L.versDate(b.date)?.getTime() ?? 0) - (L.versDate(a.date)?.getTime() ?? 0) || (a.ordre ?? 0) - (b.ordre ?? 0));
  const { total, tronque, elements } = borne(lignes, Math.min(limite ?? MAX_LIGNES, MAX_LIGNES));
  return serialiser({ total, tronque, lignes: sansModeMarge(elements), aVerifier: lignes.filter((l) => l.statut === 'en_cours').length });
}

// ---------------------------------------------------------------- Devis : bordereau

/** Les articles du bordereau, comme l'écran : actifs par défaut (statut : 'actifs' | 'desactives' | 'tous'), triés par libellé. */
export async function listerArticles(donnees, { statut, limite }) {
  const toutes = await donnees.liste(C.devisArticles);
  const lignes = DA.filtrerArticles(toutes, { statut: statut ?? 'actifs' });
  const { total, tronque, elements } = borne(lignes, Math.min(limite ?? MAX_LIGNES, MAX_LIGNES));
  return serialiser({ total, tronque, articles: DA.avecCalculOuvrage(elements, toutes, await reglagesDevis(donnees)) });
}

/** Réglages du module Devis (marge, mode) : valeurs par défaut si le document n'existe pas encore. */
async function reglagesDevis(donnees) {
  try { return await donnees.document('devis_parametres', 'reglages'); } catch { return null; }
}

/** Recherche dans le code et le libellé des articles ACTIFS (accents et casse ignorés). */
export async function chercherArticle(donnees, { texte, limite }) {
  if (L.normaliserNom(texte).length < L.MIN_LETTRES) return { articles: [], total: 0, message: `Saisir au moins ${L.MIN_LETTRES} lettres.` };
  const toutes = await donnees.liste(C.devisArticles);
  const lignes = DA.filtrerArticles(toutes, { recherche: texte, statut: 'actifs' });
  const { total, tronque, elements } = borne(lignes, Math.min(limite ?? 20, MAX_LIGNES));
  return serialiser({ total, tronque, articles: DA.avecCalculOuvrage(elements, toutes, await reglagesDevis(donnees)) });
}

/**
 * Les mots de l'utilisateur -> l'article du bordereau (moteur partagé `interpreter`, le même chez Jérôme et chez les clients).
 * Règles lues dans `devis_vocabulaire` de l'espace (absente ou vide = décisions fondées sur le catalogue seul). Jamais de prix d'achat ni de marge dans la sortie.
 * `limite` tronque les candidats APRÈS la décision (sinon la décision changerait avec `limite`), sans descendre sous les articles cités par la question.
 */
export async function rechercherArticleParPhrase(donnees, { phrase, limite }) {
  const [articles, regles, reglages] = await Promise.all([donnees.liste(C.devisArticles), donnees.liste(C.devisVocabulaire), reglagesDevis(donnees)]);
  const r = DV.interpreter(phrase, { regles, articles, reglages });
  // Jamais moins de candidats que d'articles cités par la question (sinon l'assistant lirait un article absent de la liste).
  const cites = r.decision === 'proposer' ? Math.min(DV.SEUILS.maxChoixQuestion, r.candidats.filter((c) => c.score >= DV.SEUILS.proposer).length) : 0;
  return serialiser({ ...r, candidats: r.candidats.slice(0, Math.max(limite ?? 3, cites)) });
}

/** Réglages du module Devis (marge, mode, TVA, durée de validité, étapes, « Mon entreprise ») et familles d'articles, comme les écrans « Réglages des devis » et « Familles d'articles ». Lecture seule. */
export async function lireReglagesDevis(donnees) {
  const lire = async (id) => { try { return await donnees.document(C.devisParametres, id); } catch { return null; } };
  const [reglages, familles] = await Promise.all([lire(DA.ID_REGLAGES), lire(DF.ID_DOCUMENT_FAMILLES)]);
  // Le mode de calcul de la marge (artisan / comptable) n'est jamais montré à l'assistant : il s'applique sans être dit ni demandé (décision du 30/10/2026).
  const { modeMarge: _mode, ...visibles } = DA.reglagesDevis(reglages);
  return serialiser({ reglages: visibles, familles: DF.famillesDe(familles) });
}

// ---------------------------------------------------------------- Devis (24/10/2026)
// Les mêmes calculs que l'écran (partage/devis.js). « Expiré » n'est jamais stocké : il est calculé ici, comme à l'écran.
// Règle de visibilité : lister_devis ne montre que les totaux (jamais de prix d'achat ni de marge) ; lire_devis montre les lignes comme lister_articles montre
// les articles (prix d'achat et marge compris : c'est la vue de l'artisan, jamais celle du client).

const statutAffiche = (devis, aujourdhui) => (D.estExpire(devis, aujourdhui) ? 'expire' : devis.statut);
const libelleStatut = (id) => D.STATUTS_DEVIS.find((x) => x.id === id)?.libelle ?? id;

/** Le client d'un devis : l'organisation d'abord, sinon la personne (même ordre que l'écran). */
function clientDe(devis, organisations, personnes) {
  const o = devis.organisationId ? organisations.find((x) => x.id === devis.organisationId) : null;
  if (o) return { type: 'organisation', id: o.id, nom: o.nom };
  const p = devis.personneId ? personnes.find((x) => x.id === devis.personneId) : null;
  return p ? { type: 'personne', id: p.id, nom: p.nom } : null;
}

/** Totaux d'un devis : figés à la finalisation, recalculés tant que c'est un brouillon. */
const totauxDe = (devis) => (devis.statut !== 'brouillon' && devis.totaux ? devis.totaux : D.totauxDevis(devis));

/** Résumé d'un devis : numéro, version, statut, objet, client, totaux HT et TTC, dates. Jamais de prix d'achat ni de marge. */
function resumeDevis(devis, { organisations, personnes, aujourdhui }) {
  const t = totauxDe(devis);
  const statut = statutAffiche(devis, aujourdhui);
  return {
    id: devis.id, numero: devis.numero ?? null, version: devis.version ?? 1, racineId: devis.racineId ?? devis.id,
    statut, statutLibelle: libelleStatut(statut), objet: devis.objet ?? '', nom: devis.nom ?? '', affaireId: devis.affaireId ?? null,
    client: clientDe(devis, organisations, personnes), totalHT: t.totalHt, totalTTC: t.ttc,
    creeLe: devis.creeLe ?? null, expireLe: devis.expireLe ?? null, finaliseLe: devis.finaliseLe ?? null, envoyeLe: devis.envoyeLe ?? null,
    accepteLe: devis.accepteLe ?? null, refuseLe: devis.refuseLe ?? null, archive: devis.archive === true, archiveLe: devis.archiveLe ?? null,
    nombreEnvois: Array.isArray(devis.envois) ? devis.envois.length : 0, pdf: pdfDe(devis),
  };
}

/** État du PDF du devis, sans chemin de stockage ni empreinte : { statut: 'ok' | 'en_cours' | 'echec', nom?, genereLe?, message? } ; null tant qu'aucun PDF n'a été demandé. */
function pdfDe(devis) {
  const p = devis.pdf;
  if (!p || typeof p !== 'object') return null;
  return { statut: p.statut ?? null, ...(p.nom ? { nom: p.nom } : {}), ...(p.genereLe ? { genereLe: p.genereLe } : {}), ...(p.message ? { message: p.message } : {}) };
}

/** Les devis, du plus récent au plus ancien. Filtres : statut (brouillon, en_attente_envoi, envoye, accepte, refuse, expire, remplace ; expire = calculé), affaire, texte (numéro, objet, client). Archivés exclus sauf `archives: true`. */
export async function listerDevis(donnees, { statut, affaireId, texte, archives, limite }, maintenant = new Date()) {
  const aujourdhui = L.aujourdhuiParis(maintenant);
  const [devis, organisations, personnes] = await Promise.all([C.devis, C.organisations, C.personnes].map((nom) => donnees.liste(nom)));
  const contexte = { organisations, personnes, aujourdhui };
  const mots = L.normaliserNom(texte ?? '').split(/\s+/).filter(Boolean);
  const lignes = devis
    .filter((d) => (archives === true || d.archive !== true) && (!affaireId || d.affaireId === affaireId))
    .map((d) => resumeDevis(d, contexte))
    .filter((r) => (!statut || statut === 'tous' || r.statut === statut))
    .filter((r) => {
      if (!mots.length) return true;
      const cible = L.normaliserNom(`${r.numero ?? ''} ${r.objet} ${r.nom} ${r.client?.nom ?? ''}`);
      return mots.every((m) => cible.includes(m));
    })
    .sort((a, b) => (L.versDate(b.creeLe)?.getTime() ?? 0) - (L.versDate(a.creeLe)?.getTime() ?? 0) || String(b.id).localeCompare(String(a.id)));
  const { total, tronque, elements } = borne(lignes, Math.min(limite ?? MAX_LIGNES, MAX_LIGNES));
  return serialiser({ total, tronque, devis: elements });
}

/**
 * Un devis complet côté artisan : en-tête, client, affaire, sections et lignes (avec prix de vente et total de chaque ligne), remise, chantier, totaux.
 * Acomptes : `acomptes` est la liste normalisée ({ type: pourcentage | montantHt | montantTtc, valeur, moment, texteMoment? }), même pour un ancien devis à acompte unique (`acompte`, gardé tel quel) ;
 * `totaux.acomptesTTC` donne le montant TTC de chaque acompte retenu, `totaux.acompteTTC` leur somme.
 */
export async function lireDevis(donnees, { id, format, avecPrix }, maintenant = new Date()) {
  const devis = await donnees.document(C.devis, id);
  if (!devis) introuvable('Devis');
  const [organisations, personnes] = await Promise.all([C.organisations, C.personnes].map((nom) => donnees.liste(nom)));
  const aujourdhui = L.aujourdhuiParis(maintenant);
  const t = totauxDe(devis);
  const parLigne = new Map(t.lignes.map((l) => [l.id, l]));
  const affaire = devis.affaireId ? await donnees.document(C.affaires, devis.affaireId) : null;
  const { sections, totaux: _figes, modeMarge: _mode, ...reste } = devis; // le mode de calcul de la marge n'est jamais montré à l'assistant
  // Récapitulatif court (pour redire le devis à voix haute) : numéro, intitulé et quantité, jamais de prix d'achat ni de marge ; les prix de vente seulement si avecPrix.
  if (format === 'recapitulatif') {
    const resume = resumeDevis(devis, { organisations, personnes, aujourdhui });
    const structure = structureCourte(sections, { prixParLigne: avecPrix === true ? parLigne : undefined });
    return serialiser({
      id: devis.id, numero: resume.numero ?? null, version: devis.version ?? 1, statut: resume.statut, objet: devis.objet ?? '', client: resume.client,
      sections: structure, totalHT: t.totalHt, totalTTC: t.ttc, phraseTotaux: phraseTotaux(t.totalHt, t.ttc),
      ...(structure.some((s) => s.lignes.length) ? {} : { message: "Ce devis n'a encore aucune ligne." }),
    });
  }
  const numeros = D.numerosDevis(sections ?? []);
  return serialiser({
    ...reste,
    ...resumeDevis(devis, { organisations, personnes, aujourdhui }),
    affaire: affaire ? { id: affaire.id, titre: affaire.titre } : null,
    // E-mails en copie et historique des envois par e-mail ({ date, destinataires, copie }, du plus ancien au plus récent) : envoyeLe est la date du PREMIER envoi.
    copie: Array.isArray(devis.copie) ? devis.copie : [],
    envois: (Array.isArray(devis.envois) ? devis.envois : []).map((e) => ({ date: e?.date ?? null, destinataires: e?.destinataires ?? [], copie: e?.copie ?? [] })),
    sections: (sections ?? []).map((s, i) => ({
      ...s,
      numero: numeros[i].numero,
      sousTotalHT: t.sections.find((x) => x.id === s.id)?.sousTotalHT ?? 0,
      lignes: (s.lignes ?? []).map((l, j) => ({ ...l, ...(numeros[i].lignes[j] ? { numero: numeros[i].lignes[j] } : {}), prixVenteUnitaire: parLigne.get(l.id)?.prixVenteUnitaire ?? null, totalHT: parLigne.get(l.id)?.totalHT ?? 0, venduAPerte: parLigne.get(l.id)?.venduAPerte ?? false })),
    })),
    acomptes: D.listeAcomptes(devis),
    totaux: { totalBrutHT: t.totalBrutHt, remiseHT: t.remiseHt, totalHT: t.totalHt, tvaParTaux: t.tvaParTaux, tva: t.tva, totalTTC: t.ttc, acompteTTC: t.acompteTtc, acomptesTTC: t.acomptesTtc ?? (t.acompteTtc == null ? [] : [t.acompteTtc]), resteAFacturerTTC: t.resteAFacturerTtc, netAPayer: t.netAPayer, mentions: (t.mentions ?? []).map(ditHorsTaxes) },
    ...(devis.statut === 'brouillon' ? { erreursFinalisation: D.erreursFinalisation(devis).map(ditPourAssistant) } : {}),
  });
}
