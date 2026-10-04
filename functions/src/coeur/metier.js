// Actions métier des outils d'écriture : lisent ce qu'il faut, contrôlent (doublons, liens, valeurs permises, confirmation), appellent les PLANS
// de logique.js (les mêmes que l'écran) et confient l'écriture au moteur (`c.ecrire`, qui journalise). Aucun accès direct à Firestore pour écrire.
// `c` : { donnees, acteur, maintenant, ecrire({ operations, parametres, suppression }), restaurer({ operationId, apercu, forcer }) }.
import * as L from '../../partage/logique.js';
import { COLLECTIONS as C } from './donnees.js';

/** Propriétaire des fiches créées par un agent, sauf si l'appel en donne un autre (plan-mcp.md, écart 11). */
export const PROPRIETAIRE_PAR_DEFAUT = 'jerome.chevalier@gmail.com';

/** Saisie refusée : l'appelant doit corriger et recommencer (code : saisie_invalide | introuvable | doublon | confirmation | integrite). */
export class ErreurMetier extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ErreurMetier';
    this.code = code;
    this.details = details;
  }
}
const refuser = (code, message, details) => { throw new ErreurMetier(code, message, details); };

async function contexte(c, proprietaire) {
  const reglages = await c.donnees.document(C.parametres, 'reglages');
  return {
    maintenant: c.maintenant,
    auteur: c.acteur,
    proprietaire: proprietaire || PROPRIETAIRE_PAR_DEFAUT,
    aujourdhui: L.aujourdhuiParis(c.maintenant),
    delaiPaiementJours: reglages?.delaiPaiementJours ?? L.REGLAGES_DEPART.delaiPaiementJours,
    nouvelId: (nom) => c.donnees.nouvelId(nom),
  };
}

const lire = async (c, collection, id, genre) => (await c.donnees.document(collection, id)) || refuser('introuvable', `${genre} introuvable : ${id}`);
const lireSiDonne = async (c, collection, id, genre) => (id ? lire(c, collection, id, genre) : null);

async function etiquettesConnues(c) {
  return new Set(((await c.donnees.document(C.parametres, 'etiquettes'))?.items || []).map((e) => e.id));
}
async function verifierEtiquettes(c, ids) {
  if (!ids?.length) return;
  const connues = await etiquettesConnues(c);
  const inconnues = ids.filter((i) => !connues.has(i));
  if (inconnues.length) refuser('saisie_invalide', `Étiquette(s) inconnue(s) : ${inconnues.join(', ')} (voir lire_reglages, etiquettes).`);
}
async function verifierOffre(c, offreId) {
  if (!offreId) return;
  const offres = (await c.donnees.document(C.parametres, 'offres'))?.items || [];
  if (!offres.some((o) => o.id === offreId)) refuser('saisie_invalide', `Offre inconnue : ${offreId} (voir lire_reglages, offres).`);
}
const verifierMessages = (erreurs) => {
  if (Object.keys(erreurs || {}).length) refuser('saisie_invalide', Object.values(erreurs).join(' '), { erreurs });
};
const jourValide = (jour) => /^\d{4}-\d{2}-\d{2}$/.test(jour) && !Number.isNaN(Date.parse(`${jour}T12:00:00Z`));
const texte = (v) => L.nettoyerEspaces(v);

function sortie(r, extra = {}) {
  return {
    operationId: r.operationId, ...extra, ecritures: r.ecritures.length,
    ...(r.auditIncomplet ? { auditIncomplet: true, avertissement: r.avertissement } : {}),
  };
}

function refuserDoublons(doublons, genre, libelle) {
  if (!doublons.length) return;
  const liste = doublons.slice(0, 5).map((d) => `${d.nom} (id ${d.id})`).join(', ');
  refuser('doublon', `${genre} existante possible : ${liste}. Si c'est bien ${libelle}, recommencer avec forcer: true.`, { doublons: doublons.map((d) => ({ id: d.id, nom: d.nom })) });
}

// ---------------------------------------------------------------- personnes

export async function creerPersonne(c, args) {
  const { forcer, proprietaire, ...valeurs } = args;
  verifierMessages(L.validerPersonne(valeurs));
  await verifierEtiquettes(c, valeurs.etiquettes);
  await lireSiDonne(c, C.organisations, valeurs.organisationId, 'Organisation');
  if (!forcer) refuserDoublons(L.trouverDoublonsPersonne(await c.donnees.liste(C.personnes), { nom: valeurs.nom, emails: valeurs.emails }), 'Personne', 'une autre personne');
  const plan = L.planCreerPersonne(valeurs, await contexte(c, proprietaire));
  return sortie(await c.ecrire({ operations: plan.ecritures, parametres: args }), { id: plan.id });
}

export async function modifierPersonne(c, args) {
  const { id, forcer, ...champs } = args;
  const p = await lire(c, C.personnes, id, 'Personne');
  const patch = {};
  if (champs.nom !== undefined) {
    verifierMessages(L.validerPersonne({ nom: champs.nom }));
    Object.assign(patch, L.patchNomAffiche(champs.nom));
  }
  if (champs.emails !== undefined) {
    verifierMessages(L.validerPersonne({ nom: 'x', emails: champs.emails }));
    Object.assign(patch, L.patchEmails(champs.emails));
  }
  if (champs.telephones !== undefined) Object.assign(patch, L.patchTelephones(champs.telephones));
  if (champs.organisationId !== undefined) {
    await lireSiDonne(c, C.organisations, champs.organisationId, 'Organisation');
    patch.organisationId = champs.organisationId || null;
  }
  if (champs.etiquettes !== undefined) { await verifierEtiquettes(c, champs.etiquettes); patch.etiquettes = [...champs.etiquettes]; }
  if (champs.roles !== undefined) {
    if (!champs.roles.length) refuser('saisie_invalide', 'Au moins un rôle est nécessaire.');
    patch.roles = [...champs.roles];
  }
  for (const cle of ['ville', 'source', 'linkedin', 'siteWeb']) if (champs[cle] !== undefined) patch[cle] = texte(champs[cle]);
  if (champs.dateInterviewJtbd !== undefined) {
    if (champs.dateInterviewJtbd !== null && !jourValide(champs.dateInterviewJtbd)) refuser('saisie_invalide', 'dateInterviewJtbd : attendu AAAA-MM-JJ.');
    patch.dateInterviewJtbd = champs.dateInterviewJtbd;
  }
  if (champs.archive !== undefined) patch.archive = champs.archive;
  if (!Object.keys(patch).length) refuser('saisie_invalide', 'Aucun champ à modifier.');
  if (!forcer && (patch.nom || patch.emails)) {
    const nom = patch.nom && L.normaliserNom(patch.nom) !== L.normaliserNom(p.nom) ? patch.nom : '';
    const emails = patch.emails || [];
    refuserDoublons(L.trouverDoublonsPersonne(await c.donnees.liste(C.personnes), { nom, emails }, { sauf: id }), 'Personne', 'une autre personne');
  }
  const plan = L.planMajPersonne(id, patch);
  return sortie(await c.ecrire({ operations: plan.ecritures, parametres: args }), { id, champsModifies: Object.keys(patch) });
}

// ---------------------------------------------------------------- organisations

export async function creerOrganisation(c, args) {
  const { forcer, proprietaire, ...valeurs } = args;
  verifierMessages(L.validerOrganisation(valeurs));
  await verifierEtiquettes(c, valeurs.etiquettes);
  if (!forcer) refuserDoublons(L.trouverDoublonsOrganisation(await c.donnees.liste(C.organisations), valeurs.nom), 'Organisation', 'une autre organisation');
  const plan = L.planCreerOrganisation(valeurs, await contexte(c, proprietaire));
  return sortie(await c.ecrire({ operations: plan.ecritures, parametres: args }), { id: plan.id });
}

export async function modifierOrganisation(c, args) {
  const { id, forcer, ...champs } = args;
  const o = await lire(c, C.organisations, id, 'Organisation');
  const patch = {};
  if (champs.nom !== undefined) { verifierMessages(L.validerOrganisation({ nom: champs.nom })); patch.nom = texte(champs.nom); }
  for (const cle of ['adresse', 'ville', 'siteWeb', 'secteur']) if (champs[cle] !== undefined) patch[cle] = texte(champs[cle]);
  if (champs.taille !== undefined) {
    if (champs.taille !== '' && !L.TAILLES.includes(champs.taille)) refuser('saisie_invalide', `Taille inconnue (valeurs : ${L.TAILLES.join(', ')} ou vide).`);
    patch.taille = champs.taille;
  }
  if (champs.etiquettes !== undefined) { await verifierEtiquettes(c, champs.etiquettes); patch.etiquettes = [...champs.etiquettes]; }
  if (champs.archive !== undefined) patch.archive = champs.archive;
  if (!Object.keys(patch).length) refuser('saisie_invalide', 'Aucun champ à modifier.');
  if (!forcer && patch.nom && L.normaliserNom(patch.nom) !== L.normaliserNom(o.nom)) {
    refuserDoublons(L.trouverDoublonsOrganisation(await c.donnees.liste(C.organisations), patch.nom, { sauf: id }), 'Organisation', 'une autre organisation');
  }
  const plan = L.planMajOrganisation(id, patch);
  return sortie(await c.ecrire({ operations: plan.ecritures, parametres: args }), { id, champsModifies: Object.keys(patch) });
}

// ---------------------------------------------------------------- affaires

const verifierEtape = (etape) => { if (!L.ETAPES.some((e) => e.id === etape)) refuser('saisie_invalide', `Étape inconnue : ${etape} (valeurs : ${L.ETAPES.map((e) => e.id).join(', ')}).`); };
const verifierPriorite = (p) => { if (!L.PRIORITES.some((x) => x.id === p)) refuser('saisie_invalide', `Priorité inconnue : ${p} (valeurs : ${L.PRIORITES.map((x) => x.id).join(', ')}).`); };

export async function creerAffaire(c, args) {
  const { proprietaire, ...valeurs } = args;
  if (valeurs.etape !== undefined) verifierEtape(valeurs.etape);
  if (valeurs.priorite !== undefined) verifierPriorite(valeurs.priorite);
  verifierMessages(L.validerUrlGithub(valeurs.urlGithub));
  verifierMessages(L.validerUrlDossier(valeurs.urlDossier));
  await verifierOffre(c, valeurs.offreId);
  const personne = await lireSiDonne(c, C.personnes, valeurs.personneId, 'Personne');
  const organisation = await lireSiDonne(c, C.organisations, valeurs.organisationId || personne?.organisationId, 'Organisation');
  const plan = L.planCreerAffaire(valeurs, { personnes: personne ? [personne] : [], organisations: organisation ? [organisation] : [] }, await contexte(c, proprietaire));
  verifierMessages(L.validerAffaire({ titre: plan.titre }));
  return sortie(await c.ecrire({ operations: plan.ecritures, parametres: args }), { id: plan.id, titre: plan.titre });
}

export async function modifierAffaire(c, args) {
  const { id, ...champs } = args;
  await lire(c, C.affaires, id, 'Affaire');
  const patch = {};
  if (champs.titre !== undefined) { verifierMessages(L.validerAffaire({ titre: champs.titre })); patch.titre = texte(champs.titre); }
  if (champs.personneId !== undefined) { await lireSiDonne(c, C.personnes, champs.personneId, 'Personne'); patch.personneId = champs.personneId || null; }
  if (champs.organisationId !== undefined) { await lireSiDonne(c, C.organisations, champs.organisationId, 'Organisation'); patch.organisationId = champs.organisationId || null; }
  if (champs.montant !== undefined) patch.montant = champs.montant;
  if (champs.priorite !== undefined) { verifierPriorite(champs.priorite); patch.priorite = champs.priorite; }
  if (champs.offreId !== undefined) { await verifierOffre(c, champs.offreId); patch.offreId = champs.offreId || null; }
  if (champs.dureeJours !== undefined) patch.dureeJours = champs.dureeJours;
  for (const cle of ['source', 'besoin']) if (champs[cle] !== undefined) patch[cle] = cle === 'besoin' ? String(champs[cle]).trim() : texte(champs[cle]);
  if (champs.urlGithub !== undefined) { const r = L.majUrlGithub(champs.urlGithub); verifierMessages(r.erreurs); Object.assign(patch, r.patch); }
  if (champs.urlDossier !== undefined) { const r = L.majUrlDossier(champs.urlDossier); verifierMessages(r.erreurs); Object.assign(patch, r.patch); }
  if (champs.archive !== undefined) patch.archive = champs.archive;
  if (!Object.keys(patch).length) refuser('saisie_invalide', 'Aucun champ à modifier (l’étape et le statut passent par changer_etape, marquer_perdue, mettre_en_pause, rouvrir_affaire).');
  const plan = L.planMajAffaire(id, patch);
  return sortie(await c.ecrire({ operations: plan.ecritures, parametres: args }), { id, champsModifies: Object.keys(patch) });
}

/** Applique un plan de règle d'affaire ; une erreur de règle (saisie) est rendue telle quelle, sans écriture. */
async function appliquerRegle(c, plan, args, extra = () => ({})) {
  if (plan.erreurs && Object.keys(plan.erreurs).length) refuser('saisie_invalide', Object.values(plan.erreurs).join(' '), { erreurs: plan.erreurs });
  if (!plan.ecritures.length) return { operationId: null, rien: true, message: 'Rien à changer : l’affaire est déjà dans cet état.' };
  return sortie(await c.ecrire({ operations: plan.ecritures, parametres: args }), extra(plan));
}

export async function changerEtape(c, args) {
  const a = await lire(c, C.affaires, args.id, 'Affaire');
  const plan = L.planChangerEtape(a, args.etape, await contexte(c), { montantEncaisse: args.montantEncaisse });
  return appliquerRegle(c, plan, args, (p) => ({ id: a.id, etape: p.patch.etape, statut: p.patch.statut, suggestion: p.suggestion ?? null }));
}
export async function marquerPerdue(c, args) {
  const a = await lire(c, C.affaires, args.id, 'Affaire');
  return appliquerRegle(c, L.planMarquerPerdue(a, { raison: args.raison, detail: args.detail }, await contexte(c)), args, () => ({ id: a.id, statut: 'perdue' }));
}
export async function mettreEnPause(c, args) {
  const a = await lire(c, C.affaires, args.id, 'Affaire');
  if (args.dateReveil && !jourValide(args.dateReveil)) refuser('saisie_invalide', 'dateReveil : attendu AAAA-MM-JJ.');
  return appliquerRegle(c, L.planMettreEnPause(a, { dateReveil: args.dateReveil }, await contexte(c)), args, () => ({ id: a.id, statut: 'en_pause', dateReveil: args.dateReveil }));
}
export async function rouvrirAffaire(c, args) {
  const a = await lire(c, C.affaires, args.id, 'Affaire');
  return appliquerRegle(c, L.planRouvrirAffaire(a, await contexte(c)), args, () => ({ id: a.id, statut: L.statutPourEtape(a.etape) }));
}
export async function ajouterEncaissement(c, args) {
  const a = await lire(c, C.affaires, args.id, 'Affaire');
  if (args.date && !jourValide(args.date)) refuser('saisie_invalide', 'date : attendu AAAA-MM-JJ.');
  return appliquerRegle(c, L.planEncaisser(a, { montant: args.montant, date: args.date }, await contexte(c)), args, () => ({ id: a.id, montant: args.montant }));
}

export async function joindreLien(c, args) {
  const a = await lire(c, C.affaires, args.affaireId, 'Affaire');
  const r = L.ajouterDocument(a, args.libelle, args.url);
  verifierMessages(r.erreurs);
  const plan = L.planMajAffaire(a.id, r.patch);
  return sortie(await c.ecrire({ operations: plan.ecritures, parametres: args }), { affaireId: a.id, documents: r.patch.documents.length });
}

export async function retirerDocument(c, args) {
  const a = await lire(c, C.affaires, args.affaireId, 'Affaire');
  const documents = a.documents || [];
  const index = args.index !== undefined ? args.index : documents.findIndex((d) => d.url === args.url);
  if (args.index === undefined && args.url === undefined) refuser('saisie_invalide', 'Donner index ou url du document à retirer (lister_documents).');
  if (!Number.isInteger(index) || index < 0 || index >= documents.length) refuser('introuvable', 'Document introuvable sur cette affaire (lister_documents donne l’index).');
  if (args.url !== undefined && documents[index].url !== args.url) refuser('saisie_invalide', 'L’url ne correspond pas au document à cet index (la liste a peut-être changé : relire lister_documents).');
  const plan = L.planMajAffaire(a.id, L.supprimerDocument(a, index));
  return sortie(await c.ecrire({ operations: plan.ecritures, parametres: args }), { affaireId: a.id, documents: documents.length - 1 });
}

// ---------------------------------------------------------------- notes et activités

/** Liens à poser sur une note ou une activité : comme l'écran (une affaire porte aussi sa personne et son organisation). */
async function liensCreation(c, { affaireId, personneId, organisationId }) {
  if (!affaireId && !personneId && !organisationId) refuser('saisie_invalide', 'Rattacher à une affaire, une personne ou une organisation (affaireId, personneId ou organisationId).');
  if (affaireId) return L.liensAffaire(await lire(c, C.affaires, affaireId, 'Affaire'));
  if (personneId) {
    const p = await lire(c, C.personnes, personneId, 'Personne');
    return { personneId, organisationId: p.organisationId ?? null, affaireId: null };
  }
  await lire(c, C.organisations, organisationId, 'Organisation');
  return { personneId: null, organisationId, affaireId: null };
}

export async function ajouterNote(c, args) {
  verifierMessages(L.validerNote(args.texte));
  const plan = L.planCreerNote(args.texte, await liensCreation(c, args), await contexte(c));
  return sortie(await c.ecrire({ operations: plan.ecritures, parametres: args }), { id: plan.id });
}

export async function modifierNote(c, args) {
  verifierMessages(L.validerNote(args.texte));
  await lire(c, C.notes, args.id, 'Note');
  const plan = L.planMajNote(args.id, args.texte);
  return sortie(await c.ecrire({ operations: plan.ecritures, parametres: args }), { id: args.id });
}

export async function creerActivite(c, args) {
  const ctx = await contexte(c);
  const valeurs = { type: args.type || 'tache', titre: args.titre, date: args.date || ctx.aujourdhui, heure: args.heure, ...await liensCreation(c, args) };
  verifierMessages(L.validerActivite(valeurs));
  if (!jourValide(valeurs.date)) refuser('saisie_invalide', 'date : attendu AAAA-MM-JJ.');
  const plan = L.planCreerActivite(valeurs, ctx);
  return sortie(await c.ecrire({ operations: plan.ecritures, parametres: args }), { id: plan.id });
}

export async function terminerActivite(c, args) {
  const a = await lire(c, C.activites, args.id, 'Activité');
  const plan = L.planActiviteFaite(a, await contexte(c));
  if (!plan.ecritures.length) return { operationId: null, rien: true, message: 'Rien à changer : l’activité est déjà faite.' };
  return sortie(await c.ecrire({ operations: plan.ecritures, parametres: args }), { id: a.id });
}

// ---------------------------------------------------------------- suppressions (profil Claude Code)

/** Activités, notes et événements portant un lien `champ` = id, dans le format attendu par les plans de suppression. */
async function liensDe(c, champ, id) {
  const noms = [C.activites, C.notes, C.evenements];
  const listes = await Promise.all(noms.map((nom) => c.donnees.liste(nom, { champ, valeur: id })));
  return listes.flatMap((docs, i) => docs.map((d) => ({ collection: noms[i], id: d.id, personneId: d.personneId ?? null, organisationId: d.organisationId ?? null, affaireId: d.affaireId ?? null })));
}

const confirmer = (saisie, nom, genre) => {
  if (!L.confirmationValide(saisie, nom)) {
    refuser('confirmation', `Suppression non confirmée : confirmationNom doit être exactement ${genre} (lire la fiche pour le connaître). Rien n'a été supprimé.`);
  }
};
const compter = (ecritures, type) => {
  const par = {};
  for (const e of ecritures.filter((x) => x.type === type)) par[e.collection] = (par[e.collection] || 0) + 1;
  return par;
};
const resumeSuppression = (r, plan, extra = {}) => sortie(r, { supprimes: compter(plan.ecritures, 'supprimer'), detaches: compter(plan.ecritures, 'modifier'), restaurable: 'restaurer_depuis_audit (90 jours)', ...extra });

export async function supprimerPersonne(c, args) {
  const p = await lire(c, C.personnes, args.id, 'Personne');
  confirmer(args.confirmationNom, p.nom, 'le nom de la personne');
  const affaires = await c.donnees.liste(C.affaires, { champ: 'personneId', valeur: args.id });
  const liens = await liensDe(c, 'personneId', args.id);
  if (args.choix === 'affaires') for (const a of affaires) liens.push(...await liensDe(c, 'affaireId', a.id));
  let plan;
  try { plan = L.planSupprimerPersonne({ personneId: args.id, choix: args.choix, affaires, liens }); } catch (e) {
    refuser('saisie_invalide', `${e.message} Cette personne a ${affaires.length} affaire(s) : choix = "affaires" (les supprimer aussi) ou "conserver" (les garder sans personne).`);
  }
  return resumeSuppression(await c.ecrire({ operations: plan.ecritures, parametres: { id: args.id, choix: args.choix }, suppression: true }), plan);
}

export async function supprimerOrganisation(c, args) {
  const o = await lire(c, C.organisations, args.id, 'Organisation');
  confirmer(args.confirmationNom, o.nom, 'le nom de l’organisation');
  const [personnes, affaires] = await Promise.all([
    c.donnees.liste(C.personnes, { champ: 'organisationId', valeur: args.id }),
    c.donnees.liste(C.affaires, { champ: 'organisationId', valeur: args.id }),
  ]);
  const plan = L.planSupprimerOrganisation({ organisationId: args.id, personnes, affaires, liens: await liensDe(c, 'organisationId', args.id) });
  if (plan.refus) refuser('integrite', plan.refus);
  return resumeSuppression(await c.ecrire({ operations: plan.ecritures, parametres: { id: args.id }, suppression: true }), plan);
}

export async function supprimerAffaire(c, args) {
  const a = await lire(c, C.affaires, args.id, 'Affaire');
  confirmer(args.confirmationNom, a.titre, 'le titre de l’affaire');
  const plan = L.planSupprimerAffaire({ affaireId: args.id, liens: await liensDe(c, 'affaireId', args.id) });
  return resumeSuppression(await c.ecrire({ operations: plan.ecritures, parametres: { id: args.id }, suppression: true }), plan);
}

export async function supprimerNote(c, args) {
  await lire(c, C.notes, args.id, 'Note');
  const plan = L.planSupprimerNote(args.id);
  return resumeSuppression(await c.ecrire({ operations: plan.ecritures, parametres: { id: args.id }, suppression: true }), plan);
}

export async function supprimerActivite(c, args) {
  await lire(c, C.activites, args.id, 'Activité');
  const plan = L.planSupprimerActivite(args.id);
  return resumeSuppression(await c.ecrire({ operations: plan.ecritures, parametres: { id: args.id }, suppression: true }), plan);
}

export async function restaurer(c, args) {
  return c.restaurer({ operationId: args.operationId, apercu: args.apercu !== false, forcer: args.forcer === true });
}
