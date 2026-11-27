// Or du village (27/11/2026, étapes 6a et 6b de docs/accueil-village.md) : le cœur commun à la maison (functions/src/index.js, villageOr) et à la plateforme des clients
// (functions-plateforme/src/village.js ; ce dossier coeur/ y est copié tel quel par scripts/preparer-fonctions.js).
// L'écran ne dit jamais « donne-moi 10 pièces » : il dit « regarde telle facture » (ou tel devis). Le serveur va lire LUI-MÊME la donnée (statut, date, pas un test),
// puis crédite le portefeuille de l'utilisateur dans une transaction, une seule fois par élément pour toute la maison (registre village_gains/{clé}).
// Ce fichier n'importe ni firebase-functions, ni firebase-admin, ni rien de ../base/ (absent chez les clients) : la base Firestore, l'horloge et la fabrique de dates sont reçues.
// Jamais d'exception pour un refus métier : toujours un objet simple { ok, gagne, or?, raison? }.
// 6b, achats : `acheter` retire l'or ET crée l'objet acheté (ou ajoute une parcelle) dans la MÊME transaction : pas d'or sans objet, pas d'objet sans or, jamais de solde négatif.
// 7, récolte : `ramasser` lit l'objet (champ ou enclos) et le portefeuille, décide avec la règle pure etatRecolte à l'heure du SERVEUR, puis écrit l'or et le nouveau `depuis`
// dans la MÊME transaction (deux clics ou deux onglets ne paient qu'une fois). Aucune date n'est lue dans la demande ; rien n'est écrit dans village_gains.
import {
  GAINS, PRIX, PARCELLES_MAX, OBJETS_MAX, MODELES_DECORATION, ARTICLES_EN_VENTE, TAILLES, SORTES_RECOLTE,
  etatRecolte, departApresRecolte, cleDeGain, fraisPourGain, paiementRecent, parcellesValables, damierDe, manque, casesEnregistrees,
} from '../../partage/village-jeu-regles.js';
import { COLLECTIONS } from './donnees.js';

export const C_VILLAGE = 'village_utilisateurs';
export const C_GAINS = 'village_gains';
const UID = /^[A-Za-z0-9_-]{1,128}$/;
const EMAIL = /^[^\s@]{1,128}@[^\s@]{1,125}$/;
const entierPositif = (v) => (Number.isInteger(v) && v >= 0 ? v : 0);
const SORTES_JEU = ['decoration', 'champ', 'enclos'];
/** Lecture des bâtiments d'un utilisateur à l'achat : au-delà, l'achat est refusé (`trop_objets`), jamais à moitié compté. */
const LECTURE_BATIMENTS = 250;
const caseValable = (v) => Number.isInteger(v) && v >= 0 && v <= 23;
/** Identifiant d'un objet acheté accepté par `ramasser` (jamais élargi : une maison « b-… » ou un chemin ne passe pas). */
const ID_OBJET = /^o-[a-z0-9-]{1,60}$/;

/** Identifiant d'un objet acheté : « o- » + 20 caractères en minuscules et chiffres (sans import : le cœur est copié chez les clients). */
export function idObjet() {
  return `o-${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
}

/** Date Firestore (Timestamp), Date ou nombre -> millisecondes ; null sinon. */
function enMs(v) {
  if (v && typeof v.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : null;
  return null;
}

/** Portefeuille propre à partir des données brutes du document (absent : tout à 0 ; une valeur qui n'est pas un entier positif vaut 0).
 * `version` monte de 1 à chaque écriture : l'écran garde le solde de la version la plus haute (une lecture lente n'écrase jamais un gain plus récent). */
export function portefeuilleDe(donnees) {
  const d = donnees && typeof donnees === 'object' ? donnees : {};
  return { or: entierPositif(d.or), gagne: entierPositif(d.gagne), parcelles: parcellesValables(d.parcelles), version: entierPositif(d.version) };
}

/** Lit le portefeuille d'un utilisateur, dans une transaction (`tx`) ou directement. Utilisé aussi par les achats (6b) et les ramassages (7). */
export async function lirePortefeuille({ db, racine = '', uid, tx = null }) {
  const ref = db.doc(`${racine}${C_VILLAGE}/${uid}`);
  const instantane = tx ? await tx.get(ref) : await ref.get();
  return portefeuilleDe(instantane.exists ? instantane.data() : null);
}

/**
 * `db` : Firestore d'administration ; `racine` : '' (maison) ou 'clients/<client>/' ; `verifierAchat` : async (id) => 'acceptee' | 'autre' | 'trop_ancien' | 'indisponible'
 * (absent chez les clients : pas de base des achats) ; `maintenant` : () => ms ; `horodatage(ms)` : la valeur de date à écrire (Timestamp.fromMillis chez l'appelant) ;
 * `fabriquerId` : () => identifiant d'un objet acheté (remplacé dans les tests).
 */
export function creerVillageOr({ db, racine = '', verifierAchat = null, maintenant = Date.now, horodatage, fabriquerId = idObjet }) {
  if (typeof horodatage !== 'function') throw new Error('creerVillageOr : horodatage manquant');
  if (racine !== '' && !/^clients\/[A-Za-z0-9][A-Za-z0-9_-]*\/$/.test(racine)) throw new Error('creerVillageOr : racine invalide');

  /**
   * Dernière trace du journal (crm_audit, même racine) qui a fait la bonne nouvelle, lue DANS la transaction. `requetes` : [champ, valeur] en plus de `docId`
   * (égalités seules : aucun index composé à créer) ; `garder` filtre les lignes. Rend la plus récente, ou null.
   */
  async function derniereTrace(tx, docId, requetes, garder) {
    const lignes = [];
    for (const [champ, valeur] of requetes) {
      const q = db.collection(`${racine}${COLLECTIONS.audit}`).where('docId', '==', docId).where(champ, '==', valeur);
      for (const d of (await tx.get(q)).docs) { const l = d.data(); if (garder(l)) lignes.push(l); }
    }
    lignes.sort((a, b) => (enMs(b.date) ?? 0) - (enMs(a.date) ?? 0));
    return lignes[0] ?? null;
  }
  /** « Pas d'or pour l'assistant, un collègue ne prend pas l'or d'un autre » : la dernière trace est celle de l'écran (via « ecran ») et de l'appelant lui-même. */
  const parLAppelant = (trace, acteur) => !!trace && trace.via === 'ecran' && String(trace.acteur ?? '').toLowerCase() === acteur;
  const champs = (l) => (Array.isArray(l.champsModifies) ? l.champsModifies : []);

  /** Vérifie la bonne nouvelle dans la donnée elle-même, DANS la transaction (tx.get) : rien n'est lu avant. Rend { cle } si elle rapporte, sinon { raison }. */
  async function verifierDansTx(tx, source, id, projetId, acteur) {
    const quand = maintenant();
    if (source === 'devis-signe') {
      const snap = await tx.get(db.doc(`${racine}${COLLECTIONS.devis}/${id}`));
      if (!snap.exists) return { raison: 'pas_valide' };
      const d = snap.data();
      if (d.statut !== 'accepte') return { raison: 'pas_valide' };
      if (d.test === true) return { raison: 'test' };
      if (!fraisPourGain(source, enMs(d.accepteLe), quand)) return { raison: 'trop_ancien' };
      // Signé par l'appelant, à l'écran : la ligne « devisChangerStatut » qui a posé accepteLe (le serveur l'écrit avec acteur et via : écran ou assistant).
      const trace = await derniereTrace(tx, id, [['outil', 'devisChangerStatut']], (l) => champs(l).includes('accepteLe'));
      if (!parLAppelant(trace, acteur)) return { raison: 'pas_valide' };
      // La clé vient du DOCUMENT (toutes les versions d'un devis partagent leur racine) : jamais de la demande.
      const cle = cleDeGain(source, { id: typeof d.racineId === 'string' && d.racineId ? d.racineId : id });
      return cle ? { cle } : { raison: 'pas_valide' };
    }
    // facture-payee (facture de projet)
    const snap = await tx.get(db.doc(`${racine}${COLLECTIONS.projets}/${projetId}`));
    if (!snap.exists) return { raison: 'pas_valide' };
    const p = snap.data();
    if (p.test === true) return { raison: 'test' };
    const f = Array.isArray(p.factures) ? p.factures.find((x) => x && x.id === id) : null;
    if (!f || f.statut !== 'payee') return { raison: 'pas_valide' };
    if (!paiementRecent(f.datePaiement, quand)) return { raison: 'trop_ancien' };
    // Dernier « marquer payée » du projet : l'écran (outil marquerFacturePayee ; acteur = e-mail connecté, imposé par les règles) ou l'assistant (via « mcp »).
    const trace = await derniereTrace(tx, projetId, [['outil', 'marquerFacturePayee'], ['via', 'mcp']], (l) => l.outil === 'marquerFacturePayee' || champs(l).includes('factures'));
    if (!parLAppelant(trace, acteur)) return { raison: 'pas_valide' };
    return { cle: cleDeGain(source, { id, projetId }) };
  }

  /** `acteur` : l'e-mail de l'appelant (de sa connexion, jamais de la demande). */
  async function gain({ uid, acteur, source, id, projetId, lectureSeule = false } = {}) {
    if (typeof uid !== 'string' || !UID.test(uid)) return { ok: false, raison: 'demande' };
    if (!Object.hasOwn(GAINS, source) || !cleDeGain(source, { id, projetId })) return { ok: false, raison: 'demande' };
    if (lectureSeule) return { ok: true, gagne: 0, raison: 'lecture_seule' };
    const qui = typeof acteur === 'string' ? acteur.trim().toLowerCase() : '';
    if (!EMAIL.test(qui)) return { ok: false, raison: 'demande' };
    // facture-validee : la base des achats (maison seulement), hors de Firestore ; la fraîcheur est vérifiée par le vérificateur.
    // Limite acceptée (D14) : la base ne dit pas par quelle voie (écran ou assistant) la facture a été acceptée.
    let cleAchat = null;
    if (source === 'facture-validee') {
      if (typeof verifierAchat !== 'function') return { ok: true, gagne: 0, raison: 'indisponible' };
      let etat;
      try { etat = await verifierAchat(id); } catch { etat = 'indisponible'; }
      if (etat !== 'acceptee') return { ok: true, gagne: 0, raison: etat === 'autre' ? 'pas_valide' : etat === 'trop_ancien' ? 'trop_ancien' : 'indisponible' };
      cleAchat = cleDeGain(source, { id });
    }
    const pieces = GAINS[source];
    const refPorte = db.doc(`${racine}${C_VILLAGE}/${uid}`);
    // La transaction lit tout (la donnée vérifiée, le journal, le registre, le portefeuille) puis écrit (Firestore peut la relancer : elle relit alors tout).
    // `create` : deux annonces en même temps (même de deux comptes) ne paient qu'une fois.
    return db.runTransaction(async (tx) => {
      const v = cleAchat ? { cle: cleAchat } : await verifierDansTx(tx, source, id, projetId, qui);
      if (!v.cle) return { ok: true, gagne: 0, raison: v.raison };
      const refGain = db.doc(`${racine}${C_GAINS}/${v.cle}`);
      const deja = await tx.get(refGain);
      if (deja.exists) return { ok: true, gagne: 0, raison: 'deja' };
      const p = await lirePortefeuille({ db, racine, uid, tx });
      const quand = horodatage(maintenant());
      const or = p.or + pieces;
      const version = p.version + 1;
      tx.create(refGain, { uid, source, pieces, le: quand });
      tx.set(refPorte, { or, gagne: p.gagne + pieces, parcelles: p.parcelles, version, modifieLe: quand }, { merge: true });
      return { ok: true, gagne: pieces, or, version };
    });
  }

  /**
   * Achat (6b, 7). `article` : 'parcelle' ; 'decoration' (avec `modele`) ; 'champ' ou 'enclos' (sans `modele`, 2 x 2 cases) ; pour un objet, la case `c`, `l`
   * (coin du bloc) est proposée par l'écran et revérifiée ici. L'objet rendu d'un champ ou d'un enclos porte `depuisMs` (le JSON n'a pas de Timestamp).
   * Réponse : { ok: false, raison: 'demande' } si la demande est mal formée ; sinon { ok: true, achete, raison?, manque?, or?, parcelles?, version?, objet? }.
   * Ordre : toutes les lectures (portefeuille, puis bâtiments pour une décoration), puis les contrôles (maximum / trop_objets, pas_assez, case, case_prise),
   * puis les écritures. Le portefeuille est lu ET écrit à chaque achat : Firestore met deux achats simultanés en série (aucun solde négatif).
   */
  async function acheter({ uid, article, modele, c, l, lectureSeule = false } = {}) {
    if (typeof uid !== 'string' || !UID.test(uid)) return { ok: false, raison: 'demande' };
    if (typeof article !== 'string' || !ARTICLES_EN_VENTE.includes(article)) return { ok: false, raison: 'demande' };
    if (article === 'decoration' && !MODELES_DECORATION.includes(modele)) return { ok: false, raison: 'demande' };
    if ((article === 'champ' || article === 'enclos') && modele !== undefined) return { ok: false, raison: 'demande' };
    if (article !== 'parcelle' && (!caseValable(c) || !caseValable(l))) return { ok: false, raison: 'demande' };
    if (lectureSeule) return { ok: true, achete: false, raison: 'lecture_seule' };
    const refPorte = db.doc(`${racine}${C_VILLAGE}/${uid}`);
    return db.runTransaction(async (tx) => {
      const p = await lirePortefeuille({ db, racine, uid, tx });
      const refus = (raison, plus = {}) => ({ ok: true, achete: false, raison, ...plus, or: p.or, parcelles: p.parcelles, version: p.version });
      const t = maintenant();
      const quand = horodatage(t);
      if (article === 'parcelle') {
        if (p.parcelles >= PARCELLES_MAX) return refus('maximum');
        if (p.or < PRIX.parcelle) return refus('pas_assez', { manque: manque(PRIX.parcelle, p.or) });
        const or = p.or - PRIX.parcelle;
        const parcelles = p.parcelles + 1;
        const version = p.version + 1;
        tx.set(refPorte, { or, gagne: p.gagne, parcelles, version, modifieLe: quand }, { merge: true });
        return { ok: true, achete: true, or, parcelles, version };
      }
      // objet du jeu : décoration (1 x 1), champ ou enclos (2 x 2)
      const taille = TAILLES[article];
      const prix = PRIX[article];
      const lus = (await tx.get(db.collection(`${racine}${C_VILLAGE}/${uid}/batiments`).limit(LECTURE_BATIMENTS))).docs.map((d) => d.data() || {});
      const objets = lus.filter((d) => SORTES_JEU.includes(d.sorte)).length;
      if (lus.length >= LECTURE_BATIMENTS || objets >= OBJETS_MAX) return refus('trop_objets');
      if (p.or < prix) return refus('pas_assez', { manque: manque(prix, p.or) });
      const damier = damierDe(p.parcelles);
      if (c + taille > damier.colonnes || l + taille > damier.lignes) return refus('case');
      const prises = casesEnregistrees(lus);
      for (let i = 0; i < taille; i++) for (let j = 0; j < taille; j++) if (prises.has(`${c + i}-${l + j}`)) return refus('case_prise');
      const id = fabriquerId();
      const or = p.or - prix;
      const version = p.version + 1;
      tx.set(refPorte, { or, gagne: p.gagne, parcelles: p.parcelles, version, modifieLe: quand }, { merge: true });
      // `create` : un identifiant déjà pris fait échouer la transaction, sans rien écraser.
      if (article === 'decoration') {
        tx.create(db.doc(`${racine}${C_VILLAGE}/${uid}/batiments/${id}`), { sorte: 'decoration', modele, c, l, acheteLe: quand, depuis: quand, modifieLe: quand });
        return { ok: true, achete: true, or, parcelles: p.parcelles, version, objet: { id, sorte: 'decoration', modele, c, l } };
      }
      tx.create(db.doc(`${racine}${C_VILLAGE}/${uid}/batiments/${id}`), { sorte: article, c, l, acheteLe: quand, depuis: quand, modifieLe: quand });
      return { ok: true, achete: true, or, parcelles: p.parcelles, version, objet: { id, sorte: article, c, l, depuisMs: t } };
    });
  }

  /**
   * Récolte (7) d'un champ ou d'un enclos de l'appelant (`objet` : son identifiant « o-… », sous village_utilisateurs/<uid de la connexion>/batiments).
   * Réponse : { ok: false, raison: 'demande' } ; { ok: true, ramasse: 0, raison: 'lecture_seule' | 'objet' | 'pas_pret', … } ; { ok: true, ramasse, or, parcelles, version, depuisMs }.
   * L'heure est celle du serveur (`maintenant`), lue une fois par passage de la transaction.
   */
  async function ramasser({ uid, objet, lectureSeule = false } = {}) {
    if (typeof uid !== 'string' || !UID.test(uid)) return { ok: false, raison: 'demande' };
    if (typeof objet !== 'string' || !ID_OBJET.test(objet)) return { ok: false, raison: 'demande' };
    if (lectureSeule) return { ok: true, ramasse: 0, raison: 'lecture_seule' };
    const refPorte = db.doc(`${racine}${C_VILLAGE}/${uid}`);
    const refObjet = db.doc(`${racine}${C_VILLAGE}/${uid}/batiments/${objet}`);
    return db.runTransaction(async (tx) => {
      const p = await lirePortefeuille({ db, racine, uid, tx });
      const snap = await tx.get(refObjet);
      const base = { or: p.or, parcelles: p.parcelles, version: p.version };
      const d = snap.exists ? snap.data() || {} : null;
      const depuisMs = d ? enMs(d.depuis) : null;
      if (!d || !SORTES_RECOLTE.includes(d.sorte) || depuisMs === null) return { ok: true, ramasse: 0, raison: 'objet', ...base };
      const t = maintenant();
      const e = etatRecolte(d.sorte, depuisMs, t);
      if (!e.pret || !(e.pieces > 0)) return { ok: true, ramasse: 0, raison: 'pas_pret', depuisMs, ...base };
      const nouveau = departApresRecolte(d.sorte, depuisMs, t);
      const quand = horodatage(t);
      const or = p.or + e.pieces;
      const version = p.version + 1;
      tx.set(refPorte, { or, gagne: p.gagne + e.pieces, parcelles: p.parcelles, version, modifieLe: quand }, { merge: true });
      tx.update(refObjet, { depuis: horodatage(nouveau), modifieLe: quand });
      return { ok: true, ramasse: e.pieces, or, parcelles: p.parcelles, version, depuisMs: nouveau };
    });
  }

  return { gain, acheter, ramasser };
}
