// « Préparer l'e-mail » d'un devis (25/10/2026) : un workflow n8n crée un BROUILLON dans le Gmail du compte, PDF joint. Ni l'appli ni n8n n'envoient jamais l'e-mail :
// la personne l'envoie elle-même depuis Gmail, puis touche « Marquer comme envoyé » à la main.
//
// Trois morceaux, le même code chez Jérôme et chez les clients (`donnees` est déjà cadré sur l'espace, `avecBase` chez un client) :
//  1. demanderPreparation  : la fonction appelable (écran). Contrôle le devis, note la demande dans le journal `crm_actions_lancements`, puis demande à n8n.
//  2. lireEmailPourDemande : action de porte `devis.lireEmail` (n8n relit ce qu'il doit mettre dans le brouillon : adresses, sujet, message, lien du PDF).
//  3. noterEmailPrepare    : action de porte `devis.noterEmailPrepare` (n8n dit « fait » ou « raté ») : écrit `emailPrepare` sur le devis et clôt la ligne du journal.
// Le journal des demandes ne contient JAMAIS le contenu d'un e-mail : client, devis, identifiant de demande, statut, dates, durée, et un court message d'état.
import * as E from '../../partage/devis-email.js';
import { COLLECTIONS as C } from './donnees.js';
import { ErreurDevis, lireDevis, journal, modifier } from './devis.js';
import { MESSAGE_NON_BRANCHE, ErreurSortieN8n } from './n8n-sortie.js';

export const DELAI_ANTI_DOUBLON_MS = 3 * 60_000;
export const AGE_MAX_LECTURE_MS = 15 * 60_000;
export const AGE_MAX_NOTE_MS = 60 * 60_000;
export const MAX_MESSAGE_ETAT = 200;
export const STATUTS_DEMANDE = Object.freeze({ DEMANDEE: 'demandee', OK: 'ok', ECHEC: 'echec' });
export const MESSAGE_DEMANDE_INCONNUE = 'Demande inconnue ou trop ancienne.';
const MOTIF_DEMANDE = /^[a-z0-9][a-z0-9_-]{0,99}$/;

const enMs = (v) => (v == null ? null : v instanceof Date ? v.getTime() : typeof v.toMillis === 'function' ? v.toMillis() : typeof v.toDate === 'function' ? v.toDate().getTime() : typeof v === 'number' ? v : null);

/** Adresses du devis nettoyées ; une adresse que Gmail n'accepterait pas est écartée (le brouillon se crée avec les autres, ou le devis est refusé s'il n'en reste aucune). */
function adressesUtilisables(liste) {
  const vues = new Set();
  const sortie = [];
  for (const a of E.adressesDuDevis(liste)) {
    if (!E.adresseSure(a) || vues.has(a.toLowerCase())) continue;
    vues.add(a.toLowerCase());
    sortie.push(a);
  }
  return sortie;
}

/** Ce qu'il faut pour préparer un e-mail : un devis finalisé (ou envoyé : renvoi), au moins un destinataire, un PDF « ok ». Lève ErreurDevis sinon. */
export function controlerPourEmail(devis) {
  if (devis.statut === 'brouillon') throw new ErreurDevis('brouillon', E.MESSAGE_FINALISER_D_ABORD);
  const possible = E.emailPossible(devis.statut);
  if (!possible.actif) throw new ErreurDevis('statut_interdit', possible.raison);
  const destinataires = adressesUtilisables(devis.destinataires);
  if (!destinataires.length) throw new ErreurDevis('sans_destinataire', 'Ce devis n’a pas de destinataire : ajoute une adresse e-mail dans le devis, puis réessaie.');
  if (devis.pdf?.statut !== 'ok' || typeof devis.pdf?.chemin !== 'string') {
    throw new ErreurDevis('pdf_pas_pret', devis.pdf?.statut === 'en_cours' ? E.MESSAGE_PDF_EN_COURS : devis.pdf?.statut === 'echec' ? E.MESSAGE_PDF_ECHEC : E.MESSAGE_PDF_PAS_PRET);
  }
  const copie = adressesUtilisables(devis.copie).filter((c) => !destinataires.some((a) => a.toLowerCase() === c.toLowerCase()));
  return { destinataires, copie };
}

// ---------------------------------------------------------------- 1. la demande (fonction appelable)
/**
 * `espace` : 'interne' (Jérôme) ou l'identifiant du client. `sortie` : { branche(espace), demander(espace, { devisId, demandeId }) } (n8n-sortie.js).
 * `genererId()` : identifiant de demande (minuscules, chiffres, - et _). Rend { ok: true, demandeId } ; la suite est asynchrone (n8n écrit le résultat par la porte).
 */
export async function demanderPreparation({ donnees, ctx, devisId, espace, sortie, genererId = idDeDemande }) {
  if (typeof devisId !== 'string' || !devisId || devisId.length > 200 || devisId.includes('/')) throw new ErreurDevis('demande_invalide', 'Identifiant de devis manquant ou invalide.');
  if (!(await sortie.branche(espace))) throw new ErreurDevis('non_branche', MESSAGE_NON_BRANCHE);
  const demandeId = genererId();
  const maintenant = ctx.maintenant;
  await donnees.transaction(async (tx) => {
    const devis = await lireDevis(tx, devisId);
    controlerPourEmail(devis);
    const precedentes = await tx.liste(C.actionsLancements, { champ: 'devisId', valeur: devisId });
    for (const p of precedentes) {
      if (p.action !== 'devis.preparerEmail' || p.statut === STATUTS_DEMANDE.ECHEC) continue; // un échec se réessaie tout de suite
      const age = maintenant.getTime() - (enMs(p.demandeLe) ?? 0);
      if (age < DELAI_ANTI_DOUBLON_MS) {
        throw new ErreurDevis('deja_demande', p.statut === STATUTS_DEMANDE.OK
          ? 'Un brouillon vient d’être créé pour ce devis : regarde dans ton Gmail. Tu pourras en demander un autre dans quelques minutes.'
          : 'Une préparation est déjà en cours pour ce devis : patiente quelques instants (3 minutes au plus), puis réessaie.');
      }
    }
    tx.ecrire([{
      type: 'set', collection: C.actionsLancements, id: demandeId,
      donnees: { action: 'devis.preparerEmail', client: espace, devisId, demandeId, statut: STATUTS_DEMANDE.DEMANDEE, demandeLe: maintenant },
    }]);
  });
  try {
    await sortie.demander(espace, { devisId, demandeId });
  } catch (e) {
    const message = e instanceof ErreurSortieN8n && e.genre === 'non_branche' ? MESSAGE_NON_BRANCHE : 'n8n n’a pas pris la demande.';
    await clore({ donnees, demandeId, statut: STATUTS_DEMANDE.ECHEC, message, maintenant: new Date() }).catch(() => {});
    if (e instanceof ErreurSortieN8n && e.genre === 'non_branche') throw new ErreurDevis('non_branche', MESSAGE_NON_BRANCHE);
    throw new ErreurDevis('n8n_indisponible', 'La demande n’a pas pu partir. Réessaie dans un instant : rien n’a été créé dans ton Gmail.');
  }
  return { ok: true, demandeId };
}

/** Clôt la ligne du journal (hors devis) : statut, date, durée, court message. Sans effet si elle n'est plus « demandee ». */
async function clore({ donnees, demandeId, statut, message, maintenant }) {
  await donnees.transaction(async (tx) => {
    const ligne = await tx.document(C.actionsLancements, demandeId);
    if (!ligne || ligne.statut !== STATUTS_DEMANDE.DEMANDEE) return;
    tx.ecrire([{ type: 'update', collection: C.actionsLancements, id: demandeId, donnees: { statut, termineLe: maintenant, dureeMs: Math.max(0, maintenant.getTime() - (enMs(ligne.demandeLe) ?? maintenant.getTime())), ...(message ? { message } : {}) } }]);
  });
}

function idDeDemande() {
  const octets = globalThis.crypto.getRandomValues(new Uint8Array(12));
  return `dem_${[...octets].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

// ---------------------------------------------------------------- 2 et 3. les actions de porte
async function lireDemande(tx, { devisId, demandeId, maintenant, ageMax, accepte }) {
  if (typeof demandeId !== 'string' || !MOTIF_DEMANDE.test(demandeId)) throw new ErreurDevis('demande_inconnue', MESSAGE_DEMANDE_INCONNUE);
  const ligne = await tx.document(C.actionsLancements, demandeId);
  // Un seul message pour « inconnue », « autre devis » et « trop ancienne » : on ne laisse pas tester les identifiants.
  if (!ligne || ligne.action !== 'devis.preparerEmail' || ligne.devisId !== devisId) throw new ErreurDevis('demande_inconnue', MESSAGE_DEMANDE_INCONNUE);
  if (maintenant.getTime() - (enMs(ligne.demandeLe) ?? 0) > ageMax) throw new ErreurDevis('demande_inconnue', MESSAGE_DEMANDE_INCONNUE);
  if (!accepte.includes(ligne.statut)) throw new ErreurDevis('demande_close', 'Cette demande est déjà terminée.');
  return ligne;
}

/**
 * Ce que n8n met dans le brouillon. Renvoie SEULEMENT : { numero, version, objet, destinataires, copie, sujet, message, pdf: { nom, lienSigne, octets } }.
 * Jamais de prix d'achat, de marge, de chemin de stockage ni d'empreinte. `pdf({ chemin, nom })` rend { lienSigne, octets } (lien de lecture signé de 10 minutes).
 */
export async function lireEmailPourDemande({ donnees, devisId, demandeId, maintenant = new Date(), pdf }) {
  const { devis, contact } = await donnees.transaction(async (tx) => {
    const d = await lireDevis(tx, devisId);
    await lireDemande(tx, { devisId, demandeId, maintenant, ageMax: AGE_MAX_LECTURE_MS, accepte: [STATUTS_DEMANDE.DEMANDEE] });
    const personne = d.personneId ? await tx.document(C.personnes, d.personneId) : null;
    return { devis: d, contact: typeof personne?.nom === 'string' ? personne.nom : '' };
  });
  const { destinataires, copie } = controlerPourEmail(devis);
  const variables = { contact, numero: devis.numero || '', objet: devis.objet || '' };
  let fichier;
  try { fichier = await pdf({ chemin: devis.pdf.chemin, nom: E.nomPieceJointe(devis.pdf.nom) }); } catch { throw new ErreurDevis('pdf_indisponible', 'Le lien de lecture du PDF n’a pas pu être créé. Réessaie dans un instant.'); }
  return {
    numero: devis.numero ?? null,
    version: devis.version ?? 1,
    objet: devis.objet ?? '',
    destinataires,
    copie,
    sujet: E.objetParDefaut(variables),
    message: E.messageParDefaut(variables),
    pdf: { nom: E.nomPieceJointe(devis.pdf.nom), lienSigne: fichier.lienSigne, octets: fichier.octets },
  };
}

/** Message d'état court et sans donnée de client : pas de retour à la ligne, adresses e-mail masquées, 200 caractères au plus. */
export function messageEtatPropre(m) {
  return String(m ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/[^\s@]+@[^\s@]+/g, '[adresse]').replace(/\s+/g, ' ').trim().slice(0, MAX_MESSAGE_ETAT);
}

/**
 * n8n dit ce qu'il est advenu : écrit `emailPrepare` sur le devis (une transaction, avec sa ligne de journal crm_audit) et clôt la ligne du journal des demandes.
 * N'écrit JAMAIS `envois` et ne change JAMAIS le statut du devis : le client envoie lui-même, puis touche « Marquer comme envoyé ».
 * Rejouer la même note ne change rien (`deja: true`).
 */
export async function noterEmailPrepare({ donnees, ctx, devisId, demandeId, statut, brouillonGmailId, message }) {
  if (statut !== STATUTS_DEMANDE.OK && statut !== STATUTS_DEMANDE.ECHEC) throw new ErreurDevis('demande_invalide', 'Le statut doit être « ok » ou « echec ».');
  if (message !== undefined && (typeof message !== 'string' || message.length > MAX_MESSAGE_ETAT)) throw new ErreurDevis('demande_invalide', `Le message doit faire ${MAX_MESSAGE_ETAT} caractères au plus.`);
  if (brouillonGmailId !== undefined && !/^[A-Za-z0-9_-]{1,100}$/.test(String(brouillonGmailId))) throw new ErreurDevis('demande_invalide', 'Identifiant de brouillon Gmail invalide.');
  const propre = messageEtatPropre(message);
  return donnees.transaction(async (tx) => {
    const devis = await lireDevis(tx, devisId);
    const ligne = await lireDemande(tx, { devisId, demandeId, maintenant: ctx.maintenant, ageMax: AGE_MAX_NOTE_MS, accepte: [STATUTS_DEMANDE.DEMANDEE, STATUTS_DEMANDE.OK, STATUTS_DEMANDE.ECHEC] });
    if (ligne.statut !== STATUTS_DEMANDE.DEMANDEE) {
      if (ligne.statut === statut) return { ok: true, deja: true };
      throw new ErreurDevis('demande_close', 'Cette demande est déjà terminée.');
    }
    const emailPrepare = { le: ctx.maintenant, demandeId, canal: 'n8n', statut };
    const changement = modifier(devis, { emailPrepare });
    const j = journal({ donnees, ctx, outil: 'porteDevisNoterEmailPrepare', parametres: { devisId, demandeId, statut }, changements: [changement] });
    tx.ecrire([
      changement.ecriture,
      {
        type: 'update', collection: C.actionsLancements, id: demandeId,
        donnees: {
          statut, termineLe: ctx.maintenant, dureeMs: Math.max(0, ctx.maintenant.getTime() - (enMs(ligne.demandeLe) ?? ctx.maintenant.getTime())),
          ...(propre ? { message: propre } : {}), ...(brouillonGmailId ? { brouillonGmailId: String(brouillonGmailId) } : {}),
        },
      },
      ...j.ecritures,
    ]);
    return { ok: true, deja: false, operationId: j.operationId };
  });
}

/** Les deux actions de porte vues par la porte (scripts/porte/actions-devis.js) : `donnees` est cadré sur l'espace de la clé, `pdf` dépend du stockage. */
export function creerServiceDevisPorte({ donnees, pdf, maintenant = () => new Date() }) {
  return {
    lireEmail: ({ devisId, demandeId }) => lireEmailPourDemande({ donnees, devisId, demandeId, maintenant: maintenant(), pdf }),
    noterEmailPrepare: ({ devisId, demandeId, statut, brouillonGmailId, message }, auteur) => noterEmailPrepare({
      donnees, ctx: { acteur: auteur, via: 'porte', maintenant: maintenant() }, devisId, demandeId, statut, brouillonGmailId, message,
    }),
  };
}
