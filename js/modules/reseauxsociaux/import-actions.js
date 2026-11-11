// Actions de l'écran Import : vérifier la boîte mail (fonction du serveur), lire l'archive LinkedIn dans le navigateur, puis écrire dans le CRM par le journal commun.
// Les règles (appariement, deux voix, jamais d'écrasement, plan d'écriture) vivent dans import-logique.js (pur, testé). Ici : seulement les lectures et les écritures réelles.
// Rien de l'archive ne quitte le navigateur ; le texte des messages n'est jamais écrit dans la base. Aucun tri ni plafond dans les requêtes (règle D4) : tout tri se fait dans le navigateur.
import { collection, doc, getDocs, query, where } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { db, app, auth } from '../../os/firebase.js';
import { estChezClient } from '../../os/contexte.js';
import { executer } from '../../os/journal-donnees.js';
import * as L from '../crm/logique.js';
import * as D from './donnees.js';
import * as I from './import-logique.js';
import { ouvrirZip, lireFichiersUtiles, empreinteArchive } from './zip.js';

export const MESSAGE_BOITE_ABSENTE = 'La vérification de la boîte mail n’est pas encore branchée. Dépose l’archive à la main.';
export const MESSAGE_BOITE_INDISPONIBLE = 'La boîte mail ne répond pas pour le moment. Tu peux déposer l’archive à la main.';

const erreurLisible = (message) => Object.assign(new Error(message), { saisie: true });

// ---------------------------------------------------------------- 1. la boîte mail

/**
 * Demande au serveur si le mail de LinkedIn annonçant l'archive est arrivé (fonction `reseauxsociauxBoite`, qui interroge la boîte de l'assistant).
 * Rend { trouve, lien (https sur linkedin.com, sinon null), recuLe (ISO ou null) }. Lève une erreur au message lisible : « pas branchée » (fonction absente ou n'importe quelle erreur
 * chez un client : un appel à une fonction non déployée ne donne pas toujours le même code) ou « ne répond pas » (réponse du serveur).
 */
export async function verifierBoite() {
  let r;
  try {
    r = (await httpsCallable(getFunctions(app, 'europe-west9'), 'reseauxsociauxBoite')({})).data;
  } catch (e) {
    console.warn('boîte mail indisponible', e?.code);
    throw new Error(!estChezClient() && e?.code === 'functions/failed-precondition' ? MESSAGE_BOITE_INDISPONIBLE : MESSAGE_BOITE_ABSENTE);
  }
  const trouve = r?.trouve === true;
  const recuLe = typeof r?.recuLe === 'string' && !Number.isNaN(new Date(r.recuLe).getTime()) ? r.recuLe : null;
  return { trouve, lien: trouve ? I.lienLinkedinSur(r?.lien) : null, recuLe: trouve ? recuLe : null };
}

// ---------------------------------------------------------------- 2. l'import

const contexteEcriture = () => {
  const maintenant = new Date();
  return {
    maintenant,
    auteur: auth.currentUser?.email || '',
    aujourdhui: L.aujourdhuiParis(maintenant),
    nouvelId: (nom) => doc(collection(db, D.chemin(nom))).id,
  };
};

/** Les fiches personnes et les activités LinkedIn déjà écrites, lues À FRAIS (l'écran ne dépend pas de ce que le CRM a chargé : il marche aussi quand Affaires est éteint). */
async function lireExistant() {
  try {
    const [personnes, activites] = await Promise.all([
      getDocs(collection(db, D.chemin('crm_personnes'))),
      getDocs(query(collection(db, D.chemin('crm_activites')), where('type', '==', 'linkedin'))),
    ]);
    const vers = (snap) => snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }));
    return { personnes: vers(personnes), activites: vers(activites) };
  } catch (e) {
    console.warn('lecture des fiches impossible', e?.code);
    throw erreurLisible('Je n’ai pas pu lire tes fiches pour le moment. Rien n’a été écrit : recommence dans un instant.');
  }
}

/** Trace d'un échec APRÈS lecture complète du fichier (jamais avant : un fichier illisible ne laisse aucune trace). Meilleur effort : une erreur ici ne cache pas l'erreur d'origine. */
async function noterEchec(infos, message) {
  try { await executer(I.planEchec({ ...infos, erreur: message }, contexteEcriture()).ecritures, 'importLinkedin'); } catch (e) { console.warn('trace de l’échec non écrite', e); }
}

/** Retrouve (ou crée au clic) l'étiquette « À classer » : jamais une migration, seulement au moment où un import crée une personne. Rend l'identifiant ou null. */
async function etiquetteAClasser() {
  const chercher = () => D.etat.etiquettes?.find((e) => e.nom === I.NOM_CATEGORIE_A_CLASSER)?.id ?? null;
  try { await D.creerCategories([I.NOM_CATEGORIE_A_CLASSER]); } catch (e) { console.warn('étiquette « À classer » non créée', e?.message); }
  return chercher();
}

/**
 * Lit l'archive (un fichier .zip choisi ou déposé), puis écrit dans le CRM sans autre validation (décision de Jérôme).
 * `surEtape('lecture' | 'ecriture')` sert à l'affichage. Rend { resultat, lu, sansEtiquette }.
 * Les erreurs portent un message lisible (`saisie: true`) ; aucune écriture n'a lieu quand le fichier est illisible, trop gros, déjà importé, ou que la lecture des fiches échoue.
 */
export async function lancerImport(fichier, { surEtape = () => {} } = {}) {
  surEtape('lecture');
  const zip = await ouvrirZip(fichier);
  const empreinte = await empreinteArchive(zip);
  const infos = { fichier: I.nomFichierPropre(fichier.name), octets: fichier.size, empreinte };
  const date = I.dejaImporte(empreinte, D.etat.imports);
  if (date) throw erreurLisible(`Cette archive a déjà été importée le ${date}.`);
  const fichiers = await lireFichiersUtiles(fichier, I.FICHIERS_UTILES, zip);
  const texte = (octets) => (octets ? new TextDecoder('utf-8').decode(octets) : null);
  let archive; let proprietaire;
  try {
    archive = I.lireArchive({ messagesCsv: texte(fichiers['messages.csv']) ?? undefined, connexionsCsv: texte(fichiers['connections.csv']), profilCsv: texte(fichiers['profile.csv']) });
    proprietaire = I.trouverProprietaire(archive.conversations, archive.profil);
  } catch (e) {
    if (e.ecrireEchec) await noterEchec(infos, e.message);
    throw e;
  }
  const { personnes, activites } = await lireExistant();
  const parametres = { archive, proprietaire, personnes, activites, ...infos };
  let plan = I.construirePlan({ ...parametres, etiquetteId: null }, contexteEcriture());
  let sansEtiquette = false;
  if (plan.resultat.personnesCreees > 0) {
    const etiquetteId = await etiquetteAClasser();
    sansEtiquette = !etiquetteId;
    if (etiquetteId) plan = I.construirePlan({ ...parametres, etiquetteId }, contexteEcriture());
  }
  surEtape('ecriture');
  try {
    await executer(plan.ecritures, 'importLinkedin'); // le document d'import est la dernière écriture
  } catch (e) {
    if (e.saisie) throw e; // « L’opération s’est arrêtée en cours de route : N éléments sur M ont été traités. Recommence-la pour la terminer. »
    console.warn('import non écrit', e);
    const message = 'L’import n’a pas abouti : rien n’a été écrit. Recommence dans un instant.';
    await noterEchec(infos, message);
    throw erreurLisible(message);
  }
  return { resultat: plan.resultat, lu: plan.lu, sansEtiquette };
}
