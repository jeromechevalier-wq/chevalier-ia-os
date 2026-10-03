// Lecture du CRM pour le serveur MCP : mêmes règles que l'écran (partage/logique.js), sans aucune écriture.
// Toutes les fonctions reçoivent l'accès aux données (Firestore ou mémoire) et renvoient des valeurs JSON (dates en texte).
import * as L from '../../partage/logique.js';
import { COLLECTIONS as C } from './donnees.js';
import { serialiser } from './serialisation.js';

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
  return L.entreesHistorique({ activites, notes, evenements }, 'tous')
    .map((e) => ({ genre: e.genre, date: e.date ? e.date.toISOString() : null, ...serialiser(e.element) }));
}

const resumeAffaire = (a) => ({ id: a.id, titre: a.titre, etape: a.etape, statut: a.statut, archive: !!a.archive });

export async function lirePersonne(donnees, { id, avecFil }) {
  const personne = await donnees.document(C.personnes, id);
  if (!personne) introuvable('Personne');
  const [organisation, affaires, activites] = await Promise.all([
    personne.organisationId ? donnees.document(C.organisations, personne.organisationId) : null,
    donnees.liste(C.affaires, { champ: 'personneId', valeur: id }),
    donnees.liste(C.activites, { champ: 'personneId', valeur: id }),
  ]);
  return serialiser({
    personne,
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
    organisation,
    personnes: personnes.map((p) => ({ id: p.id, nom: p.nom, archive: !!p.archive })),
    affaires: affaires.map(resumeAffaire),
    activites,
    ...(avecFil ? { fil: await fil(donnees, 'organisationId', id, activites) } : {}),
  });
}

export async function lireAffaire(donnees, { id, avecFil }) {
  const affaire = await donnees.document(C.affaires, id);
  if (!affaire) introuvable('Affaire');
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
  const lignes = gardees.map((a) => ({ ...a, personne: nomDe(personnes, a.personneId), organisation: nomDe(organisations, a.organisationId) }));
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

export async function listerDocuments(donnees, { affaireId }) {
  const affaires = affaireId ? [await donnees.document(C.affaires, affaireId)].filter(Boolean) : await donnees.liste(C.affaires);
  const documents = affaires.flatMap((a) => (a.documents || []).map((d, index) => ({
    affaireId: a.id, titreAffaire: a.titre, index, libelle: d.libelle ?? null, url: d.url ?? null,
  })));
  return serialiser({ total: documents.length, documents });
}

// ---------------------------------------------------------------- réglages

export async function lireReglages(donnees) {
  const docs = Object.fromEntries((await donnees.liste(C.parametres)).map((d) => [d.id, d]));
  const tri = (items) => [...(items || [])].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
  return serialiser({
    offres: tri(docs.offres?.items),
    secteurs: docs.listes?.secteurs || [],
    sources: docs.listes?.sources || [],
    etiquettes: tri(docs.etiquettes?.items),
    reglages: { ...L.REGLAGES_DEPART, ...(docs.reglages || {}) },
    referentiels: {
      etapes: L.ETAPES.map(({ id, libelle }) => ({ id, libelle })),
      statuts: L.STATUTS,
      roles: L.ROLES,
      typesContact: L.TYPES_CONTACT,
      typesActivite: L.TYPES_ACTIVITE,
      priorites: L.PRIORITES,
      raisonsPerdue: L.RAISONS_PERDUE,
      tailles: L.TAILLES,
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
  return serialiser({ total, tronque, lignes: elements, aVerifier: lignes.filter((l) => l.statut === 'en_cours').length });
}
