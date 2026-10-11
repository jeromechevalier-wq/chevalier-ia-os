// Outils d'administration de la plateforme clients (chantier 13) : partie commune à « nouveau-client » et « donnees-client ».
// Ces outils sont lancés À LA MAIN par Jérôme, avec ses propres identifiants Google. Ils contournent les règles Firestore et Storage
// (comme le serveur MCP) : toute l'isolation entre clients est donc écrite ici, dans le code, et testée (tests/outil-client.test.js).
// Aucun secret dans ce dossier : les identifiants viennent de l'environnement de Jérôme (gcloud auth application-default login).
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { IDS_MODULES, verifierActivation } from '../../js/os/registre.js';
import { normaliserCouleur } from '../../js/os/marque.js';

export const PROJET_PLATEFORME = 'chevalier-ia-app';
export const PROJET_ESSAI = 'demo-chevalier-ia-os';
/** Le CRM de Jérôme : ces outils ne le touchent jamais. */
export const PROJETS_INTERDITS = Object.freeze(['chevalier-ia-os']);

export const ROLES = Object.freeze(['editeur', 'lecteur']);
export const MAX_IMAGES = 4;
export const TAILLE_MAX_IMAGE = 2 * 1024 * 1024; // 2 Mo par image

const ID_CLIENT = /^[a-z0-9][a-z0-9_-]{0,39}$/;
/** Mots qui ne peuvent pas être un identifiant de client : noms de collections, mots d'ordre des outils, valeurs « tout le monde ». */
export const IDENTIFIANTS_RESERVES = Object.freeze([
  'marques', 'clients', 'membres', 'tous', 'tout', 'all', 'null', 'undefined', 'admin', 'espace',
  'creer', 'afficher', 'exporter', 'supprimer', 'ajouter-membre', 'retirer-membre', 'changer-role',
  'activer-module', 'desactiver-module', 'desactiver-client', 'reactiver-client',
]);

/** Erreur « normale » (entrée invalide, refus) : on affiche son message, sans trace technique. */
export class ErreurOutil extends Error {
  constructor(messages) {
    const liste = Array.isArray(messages) ? messages : [messages];
    super(liste.join('\n'));
    this.messages = liste;
  }
}

/** Renvoie le message d'erreur d'un identifiant de client, ou null s'il est bon. Garde-fou n° 1 : jamais plusieurs clients à la fois. */
export function erreurIdentifiant(id) {
  if (typeof id !== 'string' || id.trim() === '') return "L'identifiant du client est vide.";
  if (id !== id.trim()) return `L'identifiant « ${id} » contient des espaces au début ou à la fin.`;
  if (IDENTIFIANTS_RESERVES.includes(id)) return `« ${id} » est un mot réservé : ce ne peut pas être un identifiant de client.`;
  if (!ID_CLIENT.test(id)) {
    return `L'identifiant « ${id} » n'est pas valide : 1 à 40 caractères, seulement des minuscules sans accent, des chiffres, « - » et « _ », en commençant par une lettre ou un chiffre.`;
  }
  return null;
}

export function exigerIdentifiant(id) {
  const e = erreurIdentifiant(id);
  if (e) throw new ErreurOutil(e);
  return id;
}

/** Chemins qu'un outil a le droit de toucher pour ce client (utilisé avant chaque suppression). */
export function cheminAutorise(client, chemin) {
  exigerIdentifiant(client);
  return chemin === `clients/${client}` || chemin.startsWith(`clients/${client}/`) || chemin === `marques/${client}`;
}
export function prefixeStorage(client) {
  exigerIdentifiant(client);
  return `marques/${client}/`;
}
export function fichierStorageAutorise(client, nom) {
  return typeof nom === 'string' && nom.startsWith(prefixeStorage(client)) && !nom.includes('..');
}

// ------------------------------------------------------------------------------------------------ validation de saisies

const EMAIL = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;

/** « prenom@exemple.fr:editeur » -> { email, role } ou lève ErreurOutil. Les majuscules sont REFUSÉES (la règle compare en minuscules). */
export function lireMembre(texte) {
  const t = String(texte ?? '').trim();
  const coupe = t.lastIndexOf(':');
  if (coupe < 1) throw new ErreurOutil(`Membre « ${t} » : écrire adresse:rôle, par exemple prenom@exemple.fr:editeur (rôles : ${ROLES.join(' ou ')}).`);
  return { email: verifierEmail(t.slice(0, coupe)), role: verifierRole(t.slice(coupe + 1)) };
}
export function verifierEmail(texte) {
  const e = String(texte ?? '').trim();
  if (e.length > 254 || !EMAIL.test(e)) throw new ErreurOutil(`« ${e} » n'est pas une adresse e-mail valide.`);
  if (e !== e.toLowerCase()) throw new ErreurOutil(`L'adresse « ${e} » doit être écrite en minuscules : ${e.toLowerCase()}`);
  return e;
}
export function verifierRole(texte) {
  const r = String(texte ?? '').trim();
  if (!ROLES.includes(r)) throw new ErreurOutil(`Rôle « ${r} » inconnu : ${ROLES.join(' ou ')}.`);
  return r;
}

/** « affaires,projets » -> liste vérifiée avec le registre des modules (projets exige affaires). « aucun » = liste vide. */
export function lireModules(texte) {
  const brut = String(texte ?? '').trim();
  if (brut === '' || brut === 'aucun') return [];
  const ids = [...new Set(brut.split(',').map((m) => m.trim()).filter(Boolean))];
  const inconnus = ids.filter((m) => !IDS_MODULES.includes(m));
  if (inconnus.length) throw new ErreurOutil(`Module inconnu : ${inconnus.map((m) => `« ${m} »`).join(', ')}. Modules connus : ${IDS_MODULES.join(', ')}.`);
  return verifierListeModules(ids);
}
/** Vérifie les dépendances entre modules ; renvoie la liste dans l'ordre de démarrage. */
export function verifierListeModules(ids) {
  const v = verifierActivation(ids);
  if (!v.ok) throw new ErreurOutil(v.erreurs);
  return v.actifs;
}
/**
 * Le journal des workflows retrouve les workflows d'un client par une étiquette n8n « client-<identifiant> ». Un nom d'étiquette n8n
 * fait 24 caractères au plus (« client- » en prend 7) : l'identifiant d'un client qui active ce module tient donc en 17 caractères.
 * Un client à nom long garde son identifiant long pour tout le reste ; on refuse seulement d'activer le journal tant qu'il n'est pas raccourci.
 */
export const LONGUEUR_MAX_ID_JOURNAL = 17;
export function verifierModulesPourClient(id, actifs) {
  if (actifs.includes('journal') && id.length > LONGUEUR_MAX_ID_JOURNAL) {
    throw new ErreurOutil(`Le module « journal » exige un identifiant de client de ${LONGUEUR_MAX_ID_JOURNAL} caractères au plus (« ${id} » en a ${id.length}) : n8n limite le nom d'une étiquette à 24 caractères, et l'étiquette est « client-${id} ». Choisissez un identifiant plus court (par exemple « ${id.slice(0, LONGUEUR_MAX_ID_JOURNAL).replace(/[-_]+$/, '')} »).`);
  }
  return actifs;
}
/** Liste de modules actifs -> objet écrit dans clients/<client>.modules (tous les modules connus, true ou false). */
export function objetModules(actifs) {
  return Object.fromEntries(IDS_MODULES.map((id) => [id, actifs.includes(id)]));
}
export function modulesActifsDe(objet) {
  return IDS_MODULES.filter((id) => objet && typeof objet === 'object' && objet[id] === true);
}

export function verifierCouleur(texte) {
  const c = normaliserCouleur(texte);
  if (!c) throw new ErreurOutil(`Couleur « ${texte} » invalide : écrire #rgb ou #rrggbb, par exemple #336699.`);
  return c;
}

// ------------------------------------------------------------------------------------------------ lecture de la ligne de commande

/**
 * Lecture simple de la ligne de commande. `valeurs` = options qui attendent une valeur ; `repetables` = celles qu'on peut écrire plusieurs fois ;
 * `drapeaux` = options sans valeur. Tout le reste est refusé (une faute de frappe ne doit jamais être ignorée en silence).
 */
export function lireArguments(argv, { valeurs = [], repetables = [], drapeaux = [] }) {
  const positionnels = [];
  const options = {};
  const erreurs = [];
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (!a.startsWith('--')) { positionnels.push(a); continue; }
    const [nom, ...reste] = a.slice(2).split('=');
    const enLigne = reste.length ? reste.join('=') : undefined;
    if (drapeaux.includes(nom)) {
      if (enLigne !== undefined) erreurs.push(`L'option --${nom} ne prend pas de valeur.`);
      options[nom] = true;
    } else if (valeurs.includes(nom) || repetables.includes(nom)) {
      const v = enLigne ?? argv[++i];
      if (v === undefined || (enLigne === undefined && String(v).startsWith('--'))) { erreurs.push(`L'option --${nom} attend une valeur.`); if (enLigne === undefined && v !== undefined) i -= 1; continue; }
      if (repetables.includes(nom)) (options[nom] ??= []).push(v);
      else if (nom in options) erreurs.push(`L'option --${nom} est écrite deux fois.`);
      else options[nom] = v;
    } else {
      erreurs.push(`Option inconnue : --${nom}`);
    }
  }
  if (erreurs.length) throw new ErreurOutil(erreurs);
  return { positionnels, options };
}

// ------------------------------------------------------------------------------------------------ connexion à la base

/**
 * Détermine la base visée. Émulateur si FIRESTORE_EMULATOR_HOST est défini (tests) ; sinon la VRAIE base (identifiants de Jérôme).
 * Le projet du CRM de Jérôme est toujours refusé.
 */
export function cible(options, env = process.env) {
  const emulateur = Boolean(env.FIRESTORE_EMULATOR_HOST);
  const projet = options.projet || env.GCLOUD_PROJECT || (emulateur ? PROJET_ESSAI : PROJET_PLATEFORME);
  if (PROJETS_INTERDITS.includes(projet)) {
    throw new ErreurOutil(`Le projet « ${projet} » est le CRM de Jérôme : ces outils ne le touchent jamais. Le projet des clients est « ${PROJET_PLATEFORME} ».`);
  }
  const bucket = options.bucket || `${projet}.firebasestorage.app`;
  return { projet, bucket, emulateur };
}

/** Ouvre Firestore et Storage pour la cible. Une appli par (projet, bucket), réutilisée entre deux appels. */
export function ouvrir({ projet, bucket }) {
  const nom = `outil-${projet}-${bucket}`;
  const app = getApps().find((a) => a.name === nom) || initializeApp({ projectId: projet, storageBucket: bucket }, nom);
  return { db: getFirestore(app), bucket: getStorage(app).bucket(bucket) };
}

/** Traduit les erreurs de connexion les plus fréquentes en phrases compréhensibles. */
export function traduireErreur(e) {
  const m = String(e?.message || e);
  if (/Could not load the default credentials|default credentials|Unable to detect a Project Id/i.test(m)) {
    return ["Impossible de se connecter à Google : l'ordinateur ne connaît pas encore vos identifiants.", "Lancez une fois : gcloud auth application-default login   (voir docs/nouveau-client.md, étape 2)."];
  }
  if (/PERMISSION_DENIED|permission|403/i.test(m) && !/Cloud Firestore API has not been used/i.test(m)) {
    return ["Google refuse l'accès : le compte connecté n'a pas les droits sur ce projet.", `Détail technique : ${m.split('\n')[0]}`, "Voir docs/nouveau-client.md, « Erreurs fréquentes »."];
  }
  if (/invalid_grant|reauth|Reauthentication/i.test(m)) {
    return ['La connexion à Google a expiré.', 'Relancez : gcloud auth application-default login'];
  }
  if (/The specified bucket does not exist|bucket does not exist/i.test(m)) {
    return ["Le dossier de stockage (bucket) n'existe pas : Storage est-il activé ? Sinon, indiquez son nom avec --bucket.", `Détail technique : ${m.split('\n')[0]}`];
  }
  return [m.split('\n')[0]];
}

export const JSON_JOLI = (v) => JSON.stringify(v, null, 2);

/** Sortie : en test, on la capture ; en usage réel, console.log. */
export function creerSortie(ecrireLigne = (l) => console.log(l)) {
  const lignes = [];
  return { lignes, out: (l = '') => { lignes.push(l); ecrireLigne(l); } };
}

/** Adresse publique d'un fichier de marque (lisible sans connexion grâce aux règles Storage, sans jeton). */
export function urlPublique(bucket, chemin) {
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${encodeURIComponent(chemin)}?alt=media`;
}

/** Date du jour AAAA-MM-JJ. */
export const aujourdhui = (d = new Date()) => d.toISOString().slice(0, 10);
