// Les vérifications automatiques d'une facture (« Nos contrôles ») : fonctions PURES, sans aucun appel externe (module Achats « Factures », 25/11/2026, PR 8a).
// La lecture du PDF (IA) et la recherche dans l'annuaire officiel sont faites par n8n et rangées dans `facture.extraction` : ici on ne fait que les lire.
// Recopié de l'appli d'origine : les règles et les messages ne changent pas. UNE différence voulue : l'identité du destinataire attendu (nom, SIREN, SIRET, mots de l'adresse)
// n'est PAS écrite dans ce fichier (dépôt public, aucune donnée d'un client) : elle est donnée par l'appelant (`identite`). Sans elle, le contrôle « Destinataire »
// est « indisponible » (gris, jamais vert) avec une phrase qui le dit.
import { dateFr } from './logique.js';

const euros = (n) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });

// ---------- Outils ----------

/** Minuscules, sans accents, sans ponctuation. */
export const normaliser = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/** Clé de Luhn (utilisée par les SIRET). */
export function luhnValide(chiffres) {
  if (!/^\d+$/.test(chiffres)) return false;
  let somme = 0;
  for (let i = 0; i < chiffres.length; i++) {
    let n = Number(chiffres[chiffres.length - 1 - i]);
    if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; }
    somme += n;
  }
  return somme % 10 === 0;
}

/** Début des SIRET de La Poste : règle publique, ils ne répondent pas à la clé de Luhn. */
export const PREFIXE_SIRET_EXCEPTION = '356000000';

/** SIRET valide : 14 chiffres et clé de Luhn (exception : les SIRET de La Poste n'y répondent pas). */
export function siretValide(siret) {
  const s = siret.replace(/\s/g, '');
  if (!/^\d{14}$/.test(s)) return false;
  if (s.startsWith(PREFIXE_SIRET_EXCEPTION)) return true;
  return luhnValide(s);
}

const FORMES = new Set(['sas', 'sasu', 'sarl', 'eurl', 'sa', 'sci', 'snc', 'scop', 'ets', 'etablissements', 'ste', 'societe', 'entreprise', 'et', 'de', 'du', 'des']);
const jetons = (s) => normaliser(s).split(' ').filter((m) => m && !FORMES.has(m));

function dice(a, b) {
  const paires = (s) => { const r = []; for (let i = 0; i < s.length - 1; i++) r.push(s.slice(i, i + 2)); return r; };
  const pa = paires(a), pb = paires(b);
  if (!pa.length || !pb.length) return a === b ? 1 : 0;
  let commun = 0;
  const reste = [...pb];
  for (const p of pa) { const i = reste.indexOf(p); if (i >= 0) { commun++; reste.splice(i, 1); } }
  return (2 * commun) / (pa.length + pb.length);
}

/** Comparaison souple de deux noms d'entreprise : majuscules, accents et forme juridique ignorés ; un nom contenu dans l'autre ou très proche compte comme identique. */
export function nomsCoherents(a, b) {
  const ja = jetons(a), jb = jetons(b);
  if (!ja.length || !jb.length) return false;
  const [court, long] = ja.length <= jb.length ? [ja, jb] : [jb, ja];
  if (court.every((m) => long.includes(m))) return true;
  return dice(ja.join(''), jb.join('')) >= 0.85;
}

// ---------- 1. Totaux ----------
/** `avoir` : les montants sont comparés en valeur absolue (un avoir peut être lu avec des montants négatifs ; la base les garde positifs). */
export function controleTotaux(x, avoir = false) {
  const base = { id: 'totaux', titre: 'Totaux' };
  if (!x) return { ...base, etat: 'indisponible', phrase: 'Analyse non disponible pour cette facture.' };
  const { montant_ht: ht0, montant_tva: tva0, montant_ttc: ttc0 } = x;
  const ht = avoir && ht0 != null ? Math.abs(ht0) : ht0, tva = avoir && tva0 != null ? Math.abs(tva0) : tva0, ttc = avoir && ttc0 != null ? Math.abs(ttc0) : ttc0;
  if (ht == null || tva == null || ttc == null) return { ...base, etat: 'indisponible', phrase: 'Un des montants (HT, TVA ou TTC) n’a pas pu être lu.' };
  const ecartCentimes = Math.abs(Math.round(ht * 100) + Math.round(tva * 100) - Math.round(ttc * 100));
  if (ecartCentimes <= 2) return { ...base, etat: 'ok', phrase: `HT + TVA = TTC : ${euros(ht)} + ${euros(tva)} = ${euros(ttc)}.` };
  return { ...base, etat: 'anomalie', phrase: `HT + TVA fait ${euros(ht + tva)}, mais le TTC écrit est ${euros(ttc)} : écart de ${euros(ecartCentimes / 100)}.` };
}

// ---------- 2. SIRET du fournisseur ----------
export function controleSiret(x) {
  const base = { id: 'siret', titre: 'SIRET du fournisseur' };
  if (!x) return { ...base, etat: 'indisponible', phrase: 'Analyse non disponible pour cette facture.' };
  const siret = x.fournisseur.siret?.replace(/\s/g, '') ?? '';
  if (!siret) {
    // La loi exige le SIREN, pas le SIRET : un SIREN valide seul est une alerte (agence pas identifiée), aucun numéro lisible est une anomalie.
    const sirenBrut = (x.fournisseur.siren ?? '').replace(/\D/g, '');
    if (sirenDe(x)) return { ...base, etat: 'alerte', phrase: 'La facture ne donne que le SIREN : l’agence du fournisseur n’est pas identifiée avec certitude, choisis-la ou confirme-la.' };
    if (sirenBrut) return { ...base, etat: 'anomalie', phrase: `Le SIREN ${sirenBrut} n’est pas valide (numéro impossible).` };
    return { ...base, etat: 'anomalie', phrase: 'Aucun SIREN ni SIRET du fournisseur trouvé sur la facture.' };
  }
  if (!siretValide(siret)) return { ...base, etat: 'anomalie', phrase: `Le SIRET ${siret} n’est pas valide (numéro impossible).` };
  const a = x.annuaire;
  if (!a || !a.interroge || a.disponible === false) return { ...base, etat: 'indisponible', aConfirmer: true, phrase: 'Ce contrôle n’a pas été fait (l’annuaire officiel était indisponible).' };
  if (a.trouve === false) return { ...base, etat: 'anomalie', phrase: `Le SIRET ${siret} n’existe pas dans l’annuaire officiel des entreprises.` };
  if (a.actif === false) return { ...base, etat: 'anomalie', phrase: `Cette entreprise est fermée (${a.denomination ?? siret}) dans l’annuaire officiel.` };
  if (a.actif == null) return { ...base, etat: 'indisponible', aConfirmer: true, phrase: 'Ce contrôle n’a pas été fait : l’annuaire officiel ne dit pas si l’entreprise est active.' };
  const nom = x.fournisseur.nom;
  const denomination = a.denomination;
  if (!nom || !denomination) return { ...base, etat: 'alerte', phrase: 'Entreprise active, mais le nom n’a pas pu être comparé : à vérifier.' };
  if (!nomsCoherents(nom, denomination)) return { ...base, etat: 'alerte', phrase: `Entreprise active, mais le nom sur la facture (« ${nom} ») est différent de l’annuaire (« ${denomination} »).` };
  return { ...base, etat: 'ok', phrase: `Entreprise active dans l’annuaire officiel : ${denomination}.` };
}

// ---------- 3. Destinataire ----------
/**
 * `identite` : { nom, noms: [...], siren, siret, adresseMots: [...] } de l'espace qui reçoit les factures, donnée par l'appelant (jamais écrite ici).
 * Sans identité (null) : « indisponible » (gris, jamais vert, pas « à confirmer »), avec la phrase qui explique pourquoi.
 */
export function controleDestinataire(x, identite = null) {
  const base = { id: 'destinataire', titre: 'Destinataire' };
  if (!x) return { ...base, etat: 'indisponible', phrase: 'Analyse non disponible pour cette facture.' };
  if (!identite || !identite.siren) return { ...base, etat: 'indisponible', phrase: 'L’identité de l’espace n’est pas réglée : le destinataire n’est pas vérifié.' };
  const estNomConnu = (nom) => {
    const n = normaliser(nom);
    return (identite.noms ?? []).some((c) => normaliser(c) === n);
  };
  const d = x.destinataire;
  const siren = d.siren?.replace(/\D/g, '') || (d.siret ? d.siret.replace(/\D/g, '').slice(0, 9) : '');
  const siret = d.siret?.replace(/\D/g, '') ?? '';
  if (siret === identite.siret || (siren === identite.siren && !siret)) return { ...base, etat: 'ok', phrase: `Le numéro (${siret || siren}) est bien celui de ${identite.nom}.` };
  if (siren === identite.siren) return { ...base, etat: 'ok', phrase: `Le SIREN ${siren} est bien celui de ${identite.nom}.` };
  if (siren) return { ...base, etat: 'anomalie', phrase: `Le destinataire a un autre numéro (${siret || siren}) : ${d.nom ?? 'nom non lu'}.` };
  const nomOk = !!d.nom && estNomConnu(d.nom);
  const adresse = d.adresse ? normaliser(d.adresse) : '';
  const adresseOk = !!adresse && (identite.adresseMots ?? []).some((m) => adresse.includes(m));
  if (nomOk || adresseOk) {
    const quoi = nomOk && adresseOk ? 'le nom et l’adresse' : nomOk ? 'le nom' : 'l’adresse';
    return { ...base, etat: 'alerte', phrase: `Seul ${quoi} correspond : aucun numéro SIREN ou SIRET du destinataire sur la facture.` };
  }
  if (!d.nom && !d.adresse) return { ...base, etat: 'indisponible', phrase: 'Le destinataire n’a pas pu être lu sur la facture.' };
  return { ...base, etat: 'anomalie', phrase: `La facture est adressée à « ${d.nom ?? 'inconnu'} », pas à ${identite.nom}.` };
}

// ---------- 4. Doublon ----------
/** SIREN du fournisseur : les 9 premiers chiffres d'un SIRET de 14 chiffres, sinon le SIREN de 9 chiffres ; la clé de Luhn doit être bonne ; null sinon (un SIRET à 13 chiffres ne donne rien). Même règle que la base (migration 008). */
export function sirenDe(x) {
  const siret = (x?.fournisseur.siret ?? '').replace(/\D/g, '');
  const siren = (x?.fournisseur.siren ?? '').replace(/\D/g, '');
  const candidat = siret.length === 14 ? siret.slice(0, 9) : siren.length === 9 ? siren : null;
  return candidat && luhnValide(candidat) ? candidat : null;
}

/** Numéro normalisé : chaque groupe de caractères qui n'est ni lettre ni chiffre devient UN tiret, tirets de début et de fin retirés, majuscules ;
 *  zéros de tête retirés seulement si le numéro est entièrement numérique. « A-1 » ≠ « A1 », « 2026-1-12 » ≠ « 2026-11-2 », « 0012 » = « 12 ». null si vide.
 *  Même règle que la base (migration 008). */
export function numeroNormalise(n) {
  let v = (n ?? '').replace(/[^A-Za-z0-9]+/g, '-').replace(/^-+|-+$/g, '').toUpperCase();
  if (/^[0-9]+$/.test(v)) v = v.replace(/^0+/, '') || '0';
  return v || null;
}

/** Rouge : même fournisseur (SIREN) et même numéro qu'une facture déjà acceptée (la base refuserait d'ailleurs l'acceptation).
 *  Orange : même numéro qu'une facture encore à valider, ou, sans numéro lu, même montant TTC et même date qu'une facture non refusée.
 *  Gris : SIREN non lu, ou ni numéro ni repli possible. Les factures refusées ne comptent pas. */
export function controleDoublon(f, autres) {
  const base = { id: 'doublon', titre: 'Doublon' };
  const siren = f.fournisseur_siren ?? sirenDe(f.extraction);
  // Gris, mais jamais vert : si on ne peut pas chercher un doublon, accepter demande un motif.
  if (!siren) return { ...base, etat: 'indisponible', aConfirmer: true, phrase: 'Doublon non vérifiable : le SIRET du fournisseur n’a pas pu être lu (ou n’est pas valide).' };
  if (autres === null) return { ...base, etat: 'indisponible', aConfirmer: true, phrase: 'Vérification indisponible : les factures précédentes de ce fournisseur n’ont pas pu être lues. Réessaie avant d’accepter.' };
  const numero = f.numero_normalise ?? numeroNormalise(f.numero ?? f.extraction?.numero);
  const candidates = autres.filter((a) => a.id !== f.id && a.statut !== 'refusee');
  if (numero) {
    const memes = candidates.filter((a) => (a.numero_normalise ?? numeroNormalise(a.numero)) === numero);
    const acceptee = memes.find((a) => a.statut === 'acceptee');
    if (acceptee) return { ...base, etat: 'anomalie', phrase: `Doublon : la facture n° ${acceptee.numero ?? numero} de ce fournisseur est déjà acceptée.` };
    if (memes.length) return { ...base, etat: 'alerte', phrase: `Doublon possible : la facture n° ${memes[0].numero ?? numero} de ce fournisseur, avec le même numéro, attend aussi d’être validée.` };
    return { ...base, etat: 'ok', phrase: 'Aucun doublon trouvé.' };
  }
  if (f.montant_ttc != null && f.date_facture) {
    const m = candidates.find((a) => a.montant_ttc != null && Math.round(a.montant_ttc * 100) === Math.round(f.montant_ttc * 100) && a.date_facture === f.date_facture);
    if (m) return { ...base, etat: 'alerte', phrase: `Doublon possible : même montant et même date que la facture n° ${m.numero ?? 'sans numéro'}.` };
  }
  return { ...base, etat: 'indisponible', aConfirmer: true, phrase: 'Doublon non vérifiable : le numéro de facture n’a pas pu être lu.' };
}

// ---------- Outils IBAN ----------
/** Longueur d'un IBAN selon le pays (liste du registre IBAN, recopiée de mémoire : un pays absent de la liste est traité comme « format invalide »). */
const LONGUEUR_IBAN = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28,
  EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26,
  IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30, NL: 18,
  NO: 15, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, SA: 24, SC: 31, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25, SV: 28, TL: 23, TN: 24,
  TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
};

/** IBAN normalisé : majuscules, sans espaces ni ponctuation ; null si vide. Même règle que la base (migration 007). */
export function normaliserIban(v) {
  const n = (v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return n || null;
}

/** Reste de la division par 97 du nombre formé en déplaçant les 4 premiers caractères à la fin (lettres = 10 à 35). */
function mod97(iban) {
  const r = iban.slice(4) + iban.slice(0, 4);
  let reste = 0;
  for (const c of r) {
    const v = c >= 'A' ? String(c.charCodeAt(0) - 55) : c;
    for (const d of v) reste = (reste * 10 + Number(d)) % 97;
  }
  return reste;
}

/** IBAN au bon format : pays connu, longueur du pays, clé de contrôle (modulo 97). Ne prouve rien sur le titulaire du compte. */
export function ibanValide(brut) {
  const iban = normaliserIban(brut);
  if (!iban || !/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false;
  const longueur = LONGUEUR_IBAN[iban.slice(0, 2)];
  return longueur !== undefined && iban.length === longueur && mod97(iban) === 1;
}

const ibanFacture = (f) => f.iban_normalise ?? normaliserIban(f.extraction?.iban);
const aucunIban = 'Aucun IBAN lu sur cette facture';

// `ibansConfirmes` : une liste de confirmations ; null = lecture impossible (jamais de vert sur les contrôles d'IBAN) ; undefined n'est accepté que par les deux contrôles d'IBAN pris seuls (= aucune confirmation).
const confirmationsDe = (liste, iban) => (liste ?? []).filter((c) => normaliserIban(c.iban) === iban);
const indisponibleSiVerrou = (c, liste) =>
  liste === null && c.etat === 'ok' ? { ...c, etat: 'indisponible', aConfirmer: true, phrase: 'Vérification indisponible : la liste des IBAN confirmés n’a pas pu être lue. Réessaie avant d’accepter.' } : c;

// ---------- 5. IBAN ----------
export function controleIban(f) {
  const base = { id: 'iban', titre: 'IBAN' };
  const iban = ibanFacture(f);
  if (!iban) return { ...base, etat: 'indisponible', phrase: aucunIban };
  if (!ibanValide(iban)) return { ...base, etat: 'anomalie', phrase: 'IBAN invalide : le format ne respecte pas la norme. L’IBAN a peut-être été mal lu : compare avec le PDF.' };
  if (!iban.startsWith('FR')) return { ...base, etat: 'alerte', phrase: `IBAN étranger (${iban.slice(0, 2)}) : à vérifier. Le format est correct.` };
  return { ...base, etat: 'ok', phrase: 'Format de l’IBAN correct. Cela ne prouve pas à qui appartient le compte.' };
}

// ---------- 6. IBAN et historique du fournisseur ----------
/** Compare l'IBAN aux IBAN des factures ACCEPTÉES du même SIREN (une facture non acceptée ne sert jamais de référence : sinon une fausse facture se validerait elle-même). */
export function controleIbanHistorique(f, memeFournisseur, ibansConfirmes) {
  return indisponibleSiVerrou(historique(f, memeFournisseur, ibansConfirmes), ibansConfirmes);
}
function historique(f, memeFournisseur, ibansConfirmes) {
  const base = { id: 'iban-historique', titre: 'IBAN et historique du fournisseur' };
  const iban = ibanFacture(f);
  if (!iban) return { ...base, etat: 'indisponible', phrase: aucunIban };
  const siren = f.fournisseur_siren ?? sirenDe(f.extraction);
  if (!siren) return { ...base, etat: 'indisponible', phrase: 'SIRET du fournisseur non lu : impossible de retrouver ses factures précédentes.' };
  // IBAN confirmé à la main : la confirmation d'un autre SIREN est traitée par « IBAN partagé » ; ici seule celle de CE fournisseur compte.
  const mesConfirmations = confirmationsDe(ibansConfirmes, iban).filter((c) => c.siren === siren);
  const active = mesConfirmations.find((c) => !c.revoque_le);
  if (active) return { ...base, etat: 'ok', phrase: `IBAN confirmé à la main pour ce fournisseur${active.confirme_le ? ` le ${dateFr(active.confirme_le)}` : ''}${active.moyen_verification ? ` (${active.moyen_verification})` : ''}.` };
  const derniere = [...mesConfirmations].sort((a, b) => (b.revoque_le ?? '').localeCompare(a.revoque_le ?? ''))[0];
  if (derniere) return { ...base, etat: 'anomalie', phrase: `Cet IBAN a été révoqué le ${dateFr(derniere.revoque_le ?? null)}${derniere.motif_revocation ? ` (${derniere.motif_revocation})` : ''} : appelle avant d’accepter.` };
  if (memeFournisseur === null) return { ...base, etat: 'indisponible', aConfirmer: true, phrase: 'Vérification indisponible : les factures précédentes de ce fournisseur n’ont pas pu être lues. Réessaie avant d’accepter.' };
  const connus = new Set(memeFournisseur.filter((a) => a.id !== f.id && a.statut === 'acceptee').map((a) => normaliserIban(a.iban_normalise)).filter((x) => !!x));
  if (connus.size === 0) return { ...base, etat: 'alerte', phrase: 'Premier IBAN vu pour ce fournisseur : aucune facture acceptée ne permet de le comparer.' };
  if (connus.has(iban)) return { ...base, etat: 'ok', phrase: 'Même IBAN que sur les factures déjà acceptées de ce fournisseur.' };
  return { ...base, etat: 'anomalie', phrase: 'L’IBAN a changé depuis les factures précédentes de ce fournisseur : appelle-le sur un numéro que tu connais déjà avant d’accepter.' };
}

// ---------- 7. IBAN partagé ----------
/** `ailleurs` : factures d'un AUTRE SIREN portant le même IBAN (lues par l'écran, tous statuts). `memeFournisseur` : factures du même SIREN (sert à savoir si je suis le « titulaire connu » de cet IBAN :
 *  une facture ACCEPTÉE de mon SIREN porte déjà cet IBAN).
 *  Même IBAN chez un autre SIREN : facture acceptée → rouge (titulaire connu ou non) ; facture à valider → orange ;
 *  seulement des factures refusées → vert si je suis le titulaire connu, sinon ORANGE (un refus ne doit pas effacer la mémoire d'un IBAN frauduleux, ni accuser le vrai titulaire). */
export function controleIbanPartage(f, ailleurs, memeFournisseur = [], ibansConfirmes) {
  const r = indisponibleSiVerrou(partage(f, ailleurs, memeFournisseur, ibansConfirmes), ibansConfirmes);
  // Cet IBAN a été confirmé puis révoqué pour un AUTRE SIREN : au moins orange, jamais vert (la révocation dit que quelque chose n'allait pas).
  const iban = ibanFacture(f), siren = f.fournisseur_siren ?? sirenDe(f.extraction);
  if (r.etat === 'ok' && iban && siren && confirmationsDe(ibansConfirmes, iban).some((c) => c.revoque_le && c.siren !== siren)) return { ...r, etat: 'alerte', phrase: 'Cet IBAN a été confirmé puis révoqué pour un autre fournisseur : appelle avant d’accepter.' };
  return r;
}
function partage(f, ailleurs, memeFournisseur, ibansConfirmes) {
  const base = { id: 'iban-partage', titre: 'IBAN partagé' };
  const iban = ibanFacture(f);
  if (!iban) return { ...base, etat: 'indisponible', phrase: aucunIban };
  const siren = f.fournisseur_siren ?? sirenDe(f.extraction);
  if (!siren) return { ...base, etat: 'indisponible', phrase: 'SIRET du fournisseur non lu : impossible de savoir si cet IBAN appartient à un autre fournisseur.' };
  // Cet IBAN a été confirmé (et pas révoqué) pour un AUTRE SIREN : anomalie, quoi qu'il arrive aux factures.
  if (confirmationsDe(ibansConfirmes, iban).some((c) => !c.revoque_le && c.siren !== siren)) return { ...base, etat: 'anomalie', phrase: 'Cet IBAN a été confirmé à la main pour un autre fournisseur : appelle avant d’accepter.' };
  if (ailleurs === null) return { ...base, etat: 'indisponible', aConfirmer: true, phrase: 'Vérification indisponible : la recherche de cet IBAN chez d’autres fournisseurs a échoué ou est incomplète. Réessaie avant d’accepter.' };
  const autres = ailleurs.filter((a) => a.id !== f.id && a.fournisseur_siren && a.fournisseur_siren !== siren && normaliserIban(a.iban_normalise) === iban);
  if (autres.length === 0) return { ...base, etat: 'ok', phrase: 'Cet IBAN n’apparaît sur aucune facture d’un autre fournisseur.' };
  const acceptees = autres.filter((a) => a.statut === 'acceptee');
  if (acceptees.length > 0) {
    // Les noms cités viennent seulement des factures acceptées (jamais d'une facture à valider ou refusée).
    const noms = [...new Set(acceptees.map((a) => a.fournisseur?.trim()).filter((x) => !!x))];
    const qui = noms.length ? ` (${noms.slice(0, 2).join(', ')})` : '';
    return { ...base, etat: 'anomalie', phrase: `Cet IBAN apparaît aussi sur une facture acceptée d’un autre fournisseur${qui} : appelle avant d’accepter.` };
  }
  if (autres.some((a) => a.statut === 'a_valider')) return { ...base, etat: 'alerte', phrase: 'Cet IBAN apparaît aussi sur une facture encore à valider d’un autre fournisseur : appelle avant d’accepter.' };
  const titulaireConnu = !!memeFournisseur && memeFournisseur.some((a) => a.id !== f.id && a.statut === 'acceptee' && normaliserIban(a.iban_normalise) === iban);
  if (titulaireConnu) return { ...base, etat: 'ok', phrase: 'Cet IBAN est déjà celui de ce fournisseur (facture acceptée) ; la facture d’un autre fournisseur qui le porte a été refusée.' };
  return { ...base, etat: 'alerte', phrase: 'Cet IBAN figure sur une facture refusée d’un autre fournisseur : appelle avant d’accepter.' };
}

// ---------- 8. Adresse d'envoi ----------
const adresseMail = (v) => (v ?? '').trim().toLowerCase() || null;

/** Signal faible (jamais une preuve). Référence : adresses d'envoi des factures ACCEPTÉES du même SIREN. */
export function controleAdresseEnvoi(f, memeFournisseur) {
  const base = { id: 'adresse-envoi', titre: 'Adresse d’envoi' };
  const adresse = adresseMail(f.email_expediteur);
  if (!adresse) return { ...base, etat: 'indisponible', phrase: 'Adresse d’envoi non connue pour cette facture.' };
  if (!(f.fournisseur_siren ?? sirenDe(f.extraction))) return { ...base, etat: 'indisponible', phrase: 'SIRET du fournisseur non lu : impossible de retrouver ses factures précédentes.' };
  if (memeFournisseur === null) return { ...base, etat: 'indisponible', phrase: 'Vérification indisponible : les factures précédentes de ce fournisseur n’ont pas pu être lues.' };
  const connues = new Set(memeFournisseur.filter((a) => a.id !== f.id && a.statut === 'acceptee').map((a) => adresseMail(a.email_expediteur)).filter((x) => !!x));
  if (connues.size === 0) return { ...base, etat: 'indisponible', phrase: 'Pas d’historique pour comparer l’adresse d’envoi.' };
  if (connues.has(adresse)) return { ...base, etat: 'ok', phrase: 'Facture envoyée depuis une adresse déjà utilisée pour ce fournisseur.' };
  return { ...base, etat: 'alerte', phrase: 'À vérifier : l’e-mail d’envoi est nouveau pour ce fournisseur.' };
}

// ---------- 9. Lignes ----------
/** Compare la somme des lignes lues au total HT.
 *  Gris simple : lignes non lues ou aucune ligne (cas normal d'une facture lue avant les lignes, d'un scan…), sans motif exigé.
 *  Gris « à confirmer » (traité comme une alerte, jamais vert) : lecture des lignes en échec (`lignes` null) ou état des lignes absent de la base.
 *  Vert : lignes lues et somme égale au total HT. Orange (jamais rouge) : somme différente. Pour un avoir, la valeur absolue de la somme est comparée au total HT. */
export function controleLignes(f, lignes) {
  const base = { id: 'lignes', titre: 'Lignes' };
  if (lignes === null) return { ...base, etat: 'indisponible', aConfirmer: true, phrase: 'Vérification indisponible : les lignes de cette facture n’ont pas pu être lues. Réessaie avant d’accepter.' };
  const etat = f.lignes_etat;
  if (etat !== 'non_lues' && etat !== 'lues' && etat !== 'somme_ecart') return { ...base, etat: 'indisponible', aConfirmer: true, phrase: 'Vérification indisponible : l’état de lecture des lignes est inconnu. Compare avec le PDF avant d’accepter.' };
  if (etat === 'non_lues') return { ...base, etat: 'indisponible', phrase: 'Lignes non lues : le détail des articles n’a pas pu être lu sur cette facture.' };
  // État « lues » ou « somme_ecart » mais aucune ligne en base : incohérent, jamais vert.
  if (lignes.length === 0) return { ...base, etat: 'indisponible', aConfirmer: true, phrase: 'Les lignes de cette facture sont annoncées comme lues, mais aucune n’a pu être affichée : compare avec le PDF avant d’accepter.' };
  if (f.montant_ht == null || f.lignes_somme_ht == null) return { ...base, etat: 'indisponible', aConfirmer: true, phrase: 'Lignes lues, mais le total HT n’a pas pu être lu : comparaison impossible. Compare avec le PDF.' };
  if (etat === 'lues') return { ...base, etat: 'ok', phrase: `${lignes.length} ligne${lignes.length > 1 ? 's' : ''} lue${lignes.length > 1 ? 's' : ''} : leur somme correspond au total HT.` };
  if (f.lignes_somme_ht == null || f.montant_ht == null) return { ...base, etat: 'alerte', phrase: 'La somme des lignes ne correspond pas au total HT.' };
  const ecart = Math.abs(Math.round(Math.abs(f.lignes_somme_ht) * 100) - Math.round(Math.abs(f.montant_ht) * 100)) / 100;
  return { ...base, etat: 'alerte', phrase: `La somme des lignes ne correspond pas au total HT : écart de ${euros(ecart)}.` };
}

// ---------- Vérifications pas encore développées ----------
export const CONTROLES_BIENTOT = ['Taux de TVA', 'Dates', 'N° de TVA intracommunautaire']
  .map((titre) => ({ id: `bientot-${normaliser(titre).replace(/ /g, '-')}`, titre, etat: 'indisponible', phrase: 'Bientôt disponible.', bientot: true }));

/** Message qui explique pourquoi la lecture automatique n'a rien donné (null si tout va bien). */
export function problemeLecture(f) {
  if (f.extraction_erreur === 'pdf_trop_gros') return 'PDF trop gros pour la lecture automatique : à vérifier à la main.';
  if (f.extraction_erreur) return 'La lecture automatique a échoué : à vérifier à la main.';
  if (!f.extraction) return 'Analyse non disponible pour cette facture.';
  return null;
}

/** Les neuf vérifications actives (les quatre dernières avant « Lignes » ont besoin des autres factures : même fournisseur, ou même IBAN chez un autre fournisseur ; « Lignes » a besoin des lignes lues, null si leur lecture a échoué).
 *  `identite` : voir `controleDestinataire` (null = destinataire non vérifié). */
export function controlerFacture(f, memeFournisseur, ailleursIban, lignes, ibansConfirmes, identite = null) {
  const x = f.extraction_erreur ? null : f.extraction;
  const probleme = problemeLecture(f);
  const liste = [controleTotaux(x, f.type_document === 'avoir'), controleSiret(x), controleDestinataire(x, identite)];
  const lues = probleme ? liste.map((c) => ({ ...c, phrase: probleme })) : liste;
  const doublon = controleDoublon({ id: f.id, numero: f.numero ?? null, montant_ttc: f.montant_ttc ?? null, date_facture: f.date_facture ?? null, fournisseur_siren: f.fournisseur_siren, numero_normalise: f.numero_normalise, extraction: x }, memeFournisseur);
  const e = { id: f.id, fournisseur_siren: f.fournisseur_siren, iban_normalise: f.iban_normalise, email_expediteur: f.email_expediteur, extraction: x };
  const ibans = [controleIban(e), controleIbanHistorique(e, memeFournisseur, ibansConfirmes), controleIbanPartage(e, ailleursIban, memeFournisseur, ibansConfirmes)];
  return [...lues, doublon, ...ibans.map((c) => (probleme ? { ...c, phrase: probleme } : c)), controleAdresseEnvoi(e, memeFournisseur), controleLignes(f, lignes)];
}

/** Phrase de synthèse en haut des vérifications. Ne dit jamais « facture sûre ». */
export function synthese(controles) {
  const actifs = controles.filter((c) => !c.bientot);
  const anomalies = actifs.filter((c) => c.etat === 'anomalie').length;
  const points = anomalies + actifs.filter((c) => c.etat === 'alerte' || (c.aConfirmer && c.etat === 'indisponible')).length;
  const grises = actifs.filter((c) => c.etat === 'indisponible' && !c.aConfirmer).length;
  if (points > 0) return `${points} point${points > 1 ? 's' : ''} à vérifier avant d’accepter${anomalies > 0 ? ` (dont ${anomalies} anomalie${anomalies > 1 ? 's' : ''})` : ''}.`;
  if (grises === actifs.length && points === 0) return 'Aucune vérification n’a pu être faite : regarde la facture à la main.';
  if (grises > 0) return `Aucun point d’attention détecté par l’outil, mais ${grises} vérification${grises > 1 ? 's n’ont' : ' n’a'} pas pu être faite${grises > 1 ? 's' : ''}.`;
  return 'Aucun point d’attention détecté par l’outil.';
}

export const nombreAnomalies = (c) => c.filter((x) => x.etat === 'anomalie').length;

// ---------- Points affichés (alertes de la décision) : utilisés par la pastille des cartes ----------
export const TEXTE_MAX = 300;
export const ALERTES_MAX = 20;

/** Alertes réellement affichées : les vérifications actives en orange (« alerte ») ou rouge (« anomalie »), et les grises « à confirmer » (vérification impossible sur un point grave : orange). Les autres grises sont ignorées. */
export function alertesAffichees(controles) {
  return controles
    .filter((c) => !c.bientot && (c.etat === 'alerte' || c.etat === 'anomalie' || c.aConfirmer))
    .map((c) => ({ code: c.id.slice(0, TEXTE_MAX), niveau: c.etat === 'anomalie' ? 'rouge' : 'orange', message: (c.phrase.startsWith(c.titre) ? c.phrase : `${c.titre} : ${c.phrase}`).slice(0, TEXTE_MAX) }))
    .slice(0, ALERTES_MAX);
}
