// « Mon espace » (2.8.0) : un ÉDITEUR d'un espace client règle lui-même le nom, la couleur, le logo, les images, le texte d'accueil et les membres de son espace.
// Les règles Firestore et Storage interdisent toute écriture de marques/<client> depuis un navigateur : c'est CETTE fonction (côté serveur, compte dédié) qui écrit, après avoir vérifié l'appelant.
// Séparé de index.js pour pouvoir l'essayer sans Cloud Functions : `db` et `bucket` sont injectés (comme appels.js). Modèle : automatisationsRenommer.
//  - le client reçu est une CIBLE à vérifier, jamais une confiance : l'appelant doit avoir clients/<client>/membres/<son e-mail> avec le rôle « editeur » ;
//  - UN SEUL refus neutre « Action non autorisée. » (espace inexistant, non-membre, lecteur, fiche désactivée) : on ne dit rien de plus ;
//  - liste FIXE de champs écrits (jamais « actif », jamais « modules ») ; chaque appel n'écrit que les champs envoyés ;
//  - les images : le chemin Storage est construit ICI, jamais d'un nom reçu ; type contrôlé par les premiers octets ; ordre : envoyer, écrire la fiche, supprimer l'ancien.
import { logger } from 'firebase-functions';
import { normaliserCouleur } from '../serveur/partage/marque.js';
import { emailNormalise, ROLES } from '../serveur/partage/membres.js';
import { Refus } from './appels.js';

export const NOM_MAX = 80;
export const ACCUEIL_MAX = 500;
export const MAX_IMAGES = 4;
export const MAX_MEMBRES = 20;
export const EMAIL_MAX = 120;
export const OCTETS_LOGO = 2 * 1024 * 1024;
export const OCTETS_IMAGE = Math.floor(1.5 * 1024 * 1024);
export const OCTETS_APPEL = 3 * 1024 * 1024;
const CACHE = 'public, max-age=3600'; // comme l'outil de Jérôme : le nom unique de chaque fichier évite les logos périmés
const MOTIF_ID = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const MOTIF_EMAIL = /^[^\s@/]+@[^\s@/]+\.[^\s@/]+$/;
const ROLES_OK = Object.keys(ROLES);

export const MESSAGES = Object.freeze({
  refusNeutre: 'Action non autorisée.',
  dernierEditeur: 'Il faut garder au moins un éditeur.',
  dejaMembre: 'Cette personne est déjà dans l’espace',
  limiteMembres: 'Limite atteinte : contacte ton administrateur',
});

const refuser = (code, message) => new Refus(code, message);
const REFUS_NEUTRE = () => refuser('permission-denied', MESSAGES.refusNeutre);
const DEMANDE_INVALIDE = () => refuser('invalid-argument', 'Demande invalide.');

/** Adresse publique d'un fichier de marque (même format que scripts/plateforme/commun.js, que l'outil de Jérôme utilise). */
export function urlPublique(nomBucket, chemin) {
  return `https://firebasestorage.googleapis.com/v0/b/${nomBucket}/o/${encodeURIComponent(chemin)}?alt=media`;
}

/** Chemin Storage d'une adresse publique, seulement s'il est bien dans marques/<client>/ de CE bucket ; sinon null (on ne supprime jamais ailleurs). */
export function cheminDeUrl(url, nomBucket, client) {
  const debut = `https://firebasestorage.googleapis.com/v0/b/${nomBucket}/o/`;
  if (typeof url !== 'string' || !url.startsWith(debut)) return null;
  const reste = url.slice(debut.length).split('?')[0];
  let chemin;
  try { chemin = decodeURIComponent(reste); } catch { return null; }
  return chemin.startsWith(`marques/${client}/`) && !chemin.includes('..') && !chemin.endsWith('/') ? chemin : null;
}

/** Type d'une image d'après ses PREMIERS OCTETS (jamais d'après un nom ni un type annoncé) : png, jpg, webp, ou null (SVG, GIF, texte… refusés). */
export function typeDesOctets(octets) {
  if (octets.length >= 8 && octets.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', mime: 'image/png' };
  if (octets.length >= 3 && octets[0] === 0xff && octets[1] === 0xd8 && octets[2] === 0xff) return { ext: 'jpg', mime: 'image/jpeg' };
  if (octets.length >= 12 && octets.subarray(0, 4).toString('latin1') === 'RIFF' && octets.subarray(8, 12).toString('latin1') === 'WEBP') return { ext: 'webp', mime: 'image/webp' };
  return null;
}

/** Image reçue { donnees: <base64> } -> { octets, ext, mime } ; refus clair sinon. */
function lireImage(valeur, { maxOctets, nom }) {
  const base64 = valeur && typeof valeur === 'object' ? valeur.donnees : null;
  if (typeof base64 !== 'string' || !base64 || base64.length > Math.ceil(OCTETS_APPEL * 4 / 3) + 16 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) throw refuser('invalid-argument', `${nom} : fichier illisible. Choisis un PNG, un JPG ou un WebP.`);
  const octets = Buffer.from(base64, 'base64');
  const type = typeDesOctets(octets);
  if (!type) throw refuser('invalid-argument', `${nom} : ce fichier n’est pas un PNG, un JPG ou un WebP. Choisis une autre image.`);
  if (octets.length > maxOctets) throw refuser('invalid-argument', `${nom} : fichier trop lourd (${Math.round(maxOctets / 1024 / 1024 * 10) / 10} Mo au plus). Choisis une image plus légère.`);
  return { octets, ...type };
}

/** Identité de l'appelant : e-mail vérifié obligatoire, en minuscules. */
function emailDe(auth) {
  const jeton = auth?.token;
  if (!auth?.uid || !jeton || jeton.email_verified !== true || typeof jeton.email !== 'string') throw refuser('unauthenticated', 'Connexion requise.');
  return jeton.email.toLowerCase();
}

/** Adresse d'un membre à ajouter, retirer ou changer : bien formée, en minuscules, 120 caractères au plus. */
function adresseMembre(valeur) {
  const e = emailNormalise(valeur);
  if (!e || e.length > EMAIL_MAX || !MOTIF_EMAIL.test(e)) throw refuser('invalid-argument', 'Cette adresse n’est pas valide : écris une adresse Google complète, par exemple prenom@gmail.com.');
  return e;
}
const roleMembre = (valeur) => {
  if (!ROLES_OK.includes(valeur)) throw refuser('invalid-argument', 'Le rôle doit être « éditeur » ou « lecteur ».');
  return valeur;
};

const equipeDe = (membres) => [...membres].map((m) => ({ email: m.email, role: m.role })).sort((a, b) => a.email.localeCompare(b.email));

/** Marque telle que la page la lit (sans « actif »). */
const marquePublique = (d) => ({ nom: d.nom ?? '', couleur: d.couleur ?? '', accueil: d.accueil ?? '', logo: d.logo ?? null, images: Array.isArray(d.images) ? d.images.filter((x) => typeof x === 'string') : [] });

/** Vérifie l'appelant et l'espace : renvoie { email, marque } ou lève LE refus neutre. */
async function exigerEditeur({ db, auth, client }) {
  const email = emailDe(auth);
  if (typeof client !== 'string' || !MOTIF_ID.test(client)) throw DEMANDE_INVALIDE();
  const membre = await db.doc(`clients/${client}/membres/${email}`).get();
  if (!membre.exists || membre.get('role') !== 'editeur') throw REFUS_NEUTRE();
  const marque = await db.doc(`marques/${client}`).get();
  if (!marque.exists || marque.get('actif') !== true) throw REFUS_NEUTRE();
  return { email };
}

/** Envoie un fichier, puis le supprime si la suite échoue ; les suppressions ne bloquent jamais la réponse (un fichier orphelin est sans danger). */
async function supprimerFichier(bucket, chemin) {
  if (!chemin) return;
  try { await bucket.file(chemin).delete({ ignoreNotFound: true }); } catch (e) { logger.warn('Espace : ancien fichier non supprimé', { chemin, detail: e?.message }); }
}

/** Champs de texte reçus -> { nom?, couleur?, accueil? } validés ; seuls les champs présents sont lus. */
function lireTextes(donnees) {
  const champs = {};
  if (donnees.nom !== undefined) {
    if (typeof donnees.nom !== 'string') throw refuser('invalid-argument', 'Le nom doit être un texte.');
    const nom = donnees.nom.replace(/\s+/g, ' ').trim();
    if (!nom) throw refuser('invalid-argument', 'Le nom ne peut pas être vide : écris le nom de ton espace.');
    if ([...nom].length > NOM_MAX) throw refuser('invalid-argument', `Le nom est trop long (${NOM_MAX} caractères au plus).`);
    champs.nom = nom;
  }
  if (donnees.couleur !== undefined) {
    const couleur = normaliserCouleur(donnees.couleur);
    if (!couleur) throw refuser('invalid-argument', 'Cette couleur n’est pas valide : choisis-la avec le sélecteur.');
    champs.couleur = couleur;
  }
  if (donnees.accueil !== undefined) {
    if (typeof donnees.accueil !== 'string') throw refuser('invalid-argument', 'Le texte d’accueil doit être un texte.');
    if ([...donnees.accueil].length > ACCUEIL_MAX) throw refuser('invalid-argument', `Le texte d’accueil est trop long (${ACCUEIL_MAX} caractères au plus).`);
    champs.accueil = donnees.accueil; // stocké tel quel, affiché comme texte (jamais comme HTML)
  }
  return champs;
}

// ---------------------------------------------------------------- réglages de l'espace (marque)

/**
 * Enregistre nom, couleur, texte d'accueil et logo (les seuls champs présents). `logo` : absent = inchangé, null = retiré, { donnees } = nouveau fichier.
 * Ordre pour un nouveau logo : 1) envoyer le fichier, 2) écrire la fiche, 3) supprimer l'ancien. Si 2 échoue, le nouveau fichier est supprimé.
 */
async function enregistrer({ db, bucket, nomBucket, client, email, donnees, maintenant }) {
  const champs = lireTextes(donnees);
  const logoDemande = donnees.logo;
  if (logoDemande !== undefined && logoDemande !== null && (typeof logoDemande !== 'object')) throw DEMANDE_INVALIDE();
  const logo = logoDemande ? lireImage(logoDemande, { maxOctets: OCTETS_LOGO, nom: 'Logo' }) : null;
  if (!Object.keys(champs).length && logoDemande === undefined) throw refuser('invalid-argument', 'Rien à enregistrer.');

  let nouveau = null;
  if (logo) {
    nouveau = `marques/${client}/logo-${maintenant}.${logo.ext}`;
    await bucket.file(nouveau).save(logo.octets, { contentType: logo.mime, resumable: false, metadata: { cacheControl: CACHE } });
  }
  let ancien = null;
  let marque;
  try {
    marque = await db.runTransaction(async (t) => {
      const refMarque = db.doc(`marques/${client}`);
      const refClient = db.doc(`clients/${client}`);
      const fiche = await t.get(refMarque);
      const ficheClient = champs.nom !== undefined ? await t.get(refClient) : null; // toutes les lectures avant les écritures
      if (!fiche.exists || fiche.get('actif') !== true) throw REFUS_NEUTRE();
      const ecrits = { ...champs };
      ancien = fiche.get('logo') ?? null;
      if (nouveau) ecrits.logo = urlPublique(nomBucket, nouveau);
      else if (logoDemande === null) ecrits.logo = null;
      t.update(refMarque, ecrits);
      if (ficheClient) {
        if (ficheClient.exists) t.update(refClient, { nom: champs.nom });
        else t.set(refClient, { nom: champs.nom }, { merge: true });
      }
      return marquePublique({ ...fiche.data(), ...ecrits });
    });
  } catch (e) {
    if (nouveau) await supprimerFichier(bucket, nouveau);
    throw e;
  }
  if (nouveau || logoDemande === null) await supprimerFichier(bucket, cheminDeUrl(ancien, nomBucket, client));
  const champsEcrits = [...Object.keys(champs), ...(logoDemande !== undefined ? ['logo'] : [])];
  logger.info('Espace : réglages modifiés', { email, client, champs: champsEcrits });
  return { ok: true, marque };
}

// ---------------------------------------------------------------- images de la page de connexion

/** Ajoute UNE image (4 au plus). Ordre : fichier, fiche (dans une transaction : deux ajouts en même temps ne s'écrasent pas), rien à supprimer. */
async function ajouterImage({ db, bucket, nomBucket, client, email, donnees, maintenant }) {
  const image = lireImage(donnees.image, { maxOctets: OCTETS_IMAGE, nom: 'Image' });
  const chemin = `marques/${client}/image-${maintenant}.${image.ext}`;
  await bucket.file(chemin).save(image.octets, { contentType: image.mime, resumable: false, metadata: { cacheControl: CACHE } });
  let marque;
  try {
    marque = await db.runTransaction(async (t) => {
      const ref = db.doc(`marques/${client}`);
      const fiche = await t.get(ref);
      if (!fiche.exists || fiche.get('actif') !== true) throw REFUS_NEUTRE();
      const images = marquePublique(fiche.data()).images;
      if (images.length >= MAX_IMAGES) throw refuser('failed-precondition', `Il y a déjà ${MAX_IMAGES} images : retire-en une avant d’en ajouter une autre.`);
      const suite = [...images, urlPublique(nomBucket, chemin)];
      t.update(ref, { images: suite });
      return marquePublique({ ...fiche.data(), images: suite });
    });
  } catch (e) {
    await supprimerFichier(bucket, chemin);
    throw e;
  }
  logger.info('Espace : réglages modifiés', { email, client, champs: ['images'] });
  return { ok: true, marque };
}

const urlImageDemandee = (donnees) => {
  if (typeof donnees.url !== 'string' || donnees.url.length > 2000) throw DEMANDE_INVALIDE();
  return donnees.url;
};

/** Retire une image (reconnue par son adresse) : fiche d'abord, fichier ensuite. */
async function retirerImage({ db, bucket, nomBucket, client, email, donnees }) {
  const url = urlImageDemandee(donnees);
  const marque = await db.runTransaction(async (t) => {
    const ref = db.doc(`marques/${client}`);
    const fiche = await t.get(ref);
    if (!fiche.exists || fiche.get('actif') !== true) throw REFUS_NEUTRE();
    const images = marquePublique(fiche.data()).images;
    if (!images.includes(url)) throw refuser('not-found', 'Cette image n’est plus dans l’espace. Recharge la page.');
    const suite = images.filter((x) => x !== url);
    t.update(ref, { images: suite });
    return marquePublique({ ...fiche.data(), images: suite });
  });
  await supprimerFichier(bucket, cheminDeUrl(url, nomBucket, client));
  logger.info('Espace : réglages modifiés', { email, client, champs: ['images'] });
  return { ok: true, marque };
}

/** Met une image en première place (la première sert de fond à la page de connexion). */
async function imagePremiere({ db, client, email, donnees }) {
  const url = urlImageDemandee(donnees);
  const marque = await db.runTransaction(async (t) => {
    const ref = db.doc(`marques/${client}`);
    const fiche = await t.get(ref);
    if (!fiche.exists || fiche.get('actif') !== true) throw REFUS_NEUTRE();
    const images = marquePublique(fiche.data()).images;
    if (!images.includes(url)) throw refuser('not-found', 'Cette image n’est plus dans l’espace. Recharge la page.');
    const suite = [url, ...images.filter((x) => x !== url)];
    t.update(ref, { images: suite });
    return marquePublique({ ...fiche.data(), images: suite });
  });
  logger.info('Espace : réglages modifiés', { email, client, champs: ['images'] });
  return { ok: true, marque };
}

// ---------------------------------------------------------------- membres

/**
 * Ajout, retrait ou changement de rôle : UNE transaction écrit clients/<client>/membres/<e-mail> ET clients/<client>.equipe.
 * Les contrôles (« dernier éditeur », limite, doublon) sont dans la MÊME transaction : deux éditeurs qui agissent en même temps ne peuvent pas laisser l'espace sans éditeur.
 */
async function changerMembres({ db, client, email, action, donnees }) {
  const cible = adresseMembre(donnees.email);
  const role = action === 'membre-retirer' ? null : roleMembre(donnees.role);
  const nom = typeof donnees.nom === 'string' ? donnees.nom.replace(/\s+/g, ' ').trim().slice(0, NOM_MAX) : '';
  const resultat = await db.runTransaction(async (t) => {
    const refClient = db.doc(`clients/${client}`);
    const liste = await t.get(db.collection(`clients/${client}/membres`));
    const ficheClient = await t.get(refClient); // toutes les lectures avant les écritures
    const membres = liste.docs.map((d) => ({ email: d.id, role: d.get('role'), nom: d.get('nom') ?? '' })).filter((m) => ROLES_OK.includes(m.role));
    const moi = membres.find((m) => m.email === email);
    if (!moi || moi.role !== 'editeur') throw REFUS_NEUTRE(); // reverifié dans la transaction : un éditeur retiré à l'instant n'agit plus
    const existant = membres.find((m) => m.email === cible);
    let apres = membres;
    let retire = null;
    const refMembre = db.doc(`clients/${client}/membres/${cible}`);
    if (action === 'membre-ajouter') {
      if (existant) throw refuser('already-exists', MESSAGES.dejaMembre);
      if (membres.length >= MAX_MEMBRES) throw refuser('resource-exhausted', MESSAGES.limiteMembres);
      t.set(refMembre, nom ? { role, nom } : { role });
      apres = [...membres, { email: cible, role }];
    } else if (action === 'membre-role') {
      if (!existant) throw refuser('not-found', 'Cette personne n’est plus dans l’espace. Recharge la page.');
      t.update(refMembre, { role });
      apres = membres.map((m) => (m.email === cible ? { ...m, role } : m));
    } else {
      if (!existant) throw refuser('not-found', 'Cette personne n’est plus dans l’espace. Recharge la page.');
      t.delete(refMembre);
      apres = membres.filter((m) => m.email !== cible);
      retire = { email: cible, role: existant.role, nom: existant.nom };
    }
    if (!apres.some((m) => m.role === 'editeur')) throw refuser('failed-precondition', MESSAGES.dernierEditeur);
    const equipe = equipeDe(apres);
    if (ficheClient.exists) t.update(refClient, { equipe });
    else t.set(refClient, { equipe }, { merge: true });
    return { equipe, retire };
  });
  logger.info('Espace : membres modifiés', { email, client, action, membre: cible, role });
  return { ok: true, equipe: resultat.equipe, retire: resultat.retire };
}

// ---------------------------------------------------------------- point d'entrée

const ACTIONS = {
  enregistrer, 'image-ajouter': ajouterImage, 'image-retirer': retirerImage, 'image-premiere': imagePremiere,
  'membre-ajouter': changerMembres, 'membre-role': changerMembres, 'membre-retirer': changerMembres,
};

/**
 * La fonction appelable. Données : { client, action, … } ; actions : enregistrer, image-ajouter, image-retirer, image-premiere, membre-ajouter, membre-role, membre-retirer.
 * `db` et `bucket` sont injectés (Firestore et le bucket de la plateforme) ; `nomBucket` sert à fabriquer et à relire les adresses publiques.
 */
export async function reglerEspace({ db, bucket, nomBucket = bucket?.name, auth, donnees, maintenant = Date.now() }) {
  const d = donnees && typeof donnees === 'object' ? donnees : {};
  const { email } = await exigerEditeur({ db, auth, client: d.client });
  const faire = Object.hasOwn(ACTIONS, d.action) ? ACTIONS[d.action] : null;
  if (!faire) throw DEMANDE_INVALIDE();
  return faire({ db, bucket, nomBucket, client: d.client, email, donnees: d, action: d.action, maintenant });
}
