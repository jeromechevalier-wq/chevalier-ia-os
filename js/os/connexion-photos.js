// Photos du métier du client sur la page de connexion d'une maison (27/11/2026).
// Les photos ne sont JAMAIS dans le dépôt (public) : elles sont copiées dans maison/ (dossier ignoré par git) juste avant le déploiement
// d'une maison, par scripts/copier-photos-maison.js, et servies à une adresse fixe : /maison/connexion-1.jpg à -3.jpg.
// Seule la page de connexion NEUTRE d'une maison les cherche (connexionNeutre) : chez Jérôme, rien n'est demandé, la page reste comme avant.
// Recherche : la 1re photo d'abord (une seule requête si la maison n'en a pas), puis les 2 suivantes sur grand écran seulement
// (téléphone : une seule photo montrée, donc une seule demandée ; très petit écran : aucune). Une réponse qui n'est pas une image
// (404, page HTML, coupure réseau) = pas de photo : la page garde son apparence, sans image cassée.
// Cache : les .jpg sont gardés un an par le navigateur (firebase.json) et l'adresse est fixe ; l'image est donc demandée avec ?v=<ETag ou
// Last-Modified de la réponse HEAD>, pour qu'une photo remplacée au déploiement suivant soit bien rechargée.
// Ce fichier ne lit ni Firebase ni le stockage du navigateur.

export const ADRESSES_PHOTOS_CONNEXION = Object.freeze(['/maison/connexion-1.jpg', '/maison/connexion-2.jpg', '/maison/connexion-3.jpg']);
/** Durée d'affichage de chaque photo avant le fondu vers la suivante (grand écran seulement). */
export const DUREE_PHOTO_MS = 7000;
/** Grand écran (photos à droite du formulaire, jusqu'à 3 en fondu) ; en dessous, une seule photo derrière un voile. */
export const ECRAN_LARGE = '(min-width: 768px)';
/** Très petit écran : aucune photo, aucune demande. */
export const ECRAN_TRES_PETIT = '(max-width: 359px)';

/** Vrai si la réponse est une vraie image (statut 2xx et type image/…). */
export function estImage(reponse) {
  if (!reponse || !reponse.ok) return false;
  const type = String(reponse.headers?.get?.('content-type') || '').toLowerCase();
  return type.startsWith('image/');
}

/** Adresse de l'image avec sa version (?v=…) tirée de l'ETag, sinon du Last-Modified de la réponse ; l'adresse seule si aucun des deux. */
export function adresseVersionnee(adresse, reponse) {
  const lire = (n) => String(reponse?.headers?.get?.(n) || '').trim();
  const version = lire('etag').replace(/^W\//, '').replace(/"/g, '') || lire('last-modified');
  return version ? `${adresse}?v=${encodeURIComponent(version)}` : adresse;
}

/** Adresse versionnée de la photo si elle existe, sinon null. */
async function trouver(adresse, chercher) {
  try {
    const reponse = await chercher(adresse, { method: 'HEAD', cache: 'no-cache' });
    return estImage(reponse) ? adresseVersionnee(adresse, reponse) : null;
  } catch {
    return null;
  }
}

/**
 * Adresses des photos présentes, dans l'ordre (0 à `nombre`), avec leur version (?v=…). Sans connexion-1.jpg, on ne cherche pas les autres.
 */
export async function chercherPhotosConnexion(chercher = globalThis.fetch?.bind(globalThis), { nombre = ADRESSES_PHOTOS_CONNEXION.length } = {}) {
  if (typeof chercher !== 'function' || nombre < 1) return [];
  const [premiere, ...autres] = ADRESSES_PHOTOS_CONNEXION.slice(0, nombre);
  const p = await trouver(premiere, chercher);
  if (!p) return [];
  const trouvees = await Promise.all(autres.map((a) => trouver(a, chercher)));
  return [p, ...trouvees.filter(Boolean)];
}

/** Nombre de photos à demander selon l'écran : 0 (très petit), 1 (téléphone), 3 (grand écran). */
export function nombrePhotosPourEcran(fenetre = globalThis.window) {
  const correspond = (q) => Boolean(fenetre?.matchMedia?.(q)?.matches);
  if (correspond(ECRAN_TRES_PETIT)) return 0;
  return correspond(ECRAN_LARGE) ? ADRESSES_PHOTOS_CONNEXION.length : 1;
}

function creerImage(doc, panneau, ecran, src, visible) {
  const img = doc.createElement('img');
  img.className = 'connexion-photo' + (visible ? ' visible' : '');
  img.alt = '';
  img.decoding = 'async';
  img.src = src;
  img.addEventListener('error', () => {
    img.remove();
    if (!panneau.querySelector('.connexion-photo')) { panneau.remove(); ecran.classList.remove('avec-photos', 'photos-ouvertes'); }
    else if (!panneau.querySelector('.connexion-photo.visible')) panneau.querySelector('.connexion-photo').classList.add('visible');
  });
  panneau.insertBefore(img, panneau.querySelector('.connexion-photos-voile'));
  return img;
}

function demarrerDefilement(panneau, fenetre) {
  if (panneau.dataset.defilement || panneau.querySelectorAll('.connexion-photo').length < 2) return;
  if (fenetre?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches || typeof fenetre?.setInterval !== 'function') return;
  panneau.dataset.defilement = 'oui';
  const minuteur = fenetre.setInterval(() => {
    if (!panneau.isConnected) { fenetre.clearInterval(minuteur); return; }
    if (!fenetre.matchMedia?.(ECRAN_LARGE)?.matches) return; // écran devenu étroit : la photo affichée reste seule
    const restantes = [...panneau.querySelectorAll('.connexion-photo')];
    const i = restantes.findIndex((im) => im.classList.contains('visible'));
    restantes.forEach((im) => im.classList.remove('visible'));
    restantes[(i + 1) % restantes.length]?.classList.add('visible');
  }, DUREE_PHOTO_MS);
}

/**
 * Ajoute le panneau de photos à côté du formulaire (`ecran` = .connexion-ecran). Rien si `adresses` est vide ou si l'écran a déjà été remplacé.
 * Les images sont décoratives (alt vide). Une image qui ne se charge pas est retirée ; s'il n'en reste aucune, le panneau disparaît.
 * Ouverture douce : la classe avec-photos pose une colonne de photos de largeur nulle (le formulaire ne bouge pas), puis photos-ouvertes
 * l'élargit avec une transition (css/os.css, coupée si l'utilisateur a demandé moins d'animations).
 */
export function monterPhotosConnexion(ecran, adresses, { document: doc = globalThis.document, fenetre = globalThis.window } = {}) {
  if (!ecran?.isConnected || !adresses?.length || ecran.querySelector('.connexion-photos')) return null;
  const panneau = doc.createElement('div');
  panneau.className = 'connexion-photos';
  panneau.setAttribute('aria-hidden', 'true');
  const voile = doc.createElement('div');
  voile.className = 'connexion-photos-voile';
  panneau.append(voile);
  adresses.forEach((src, i) => creerImage(doc, panneau, ecran, src, i === 0));
  panneau.dataset.photos = String(adresses.length);
  ecran.append(panneau);
  ecran.classList.add('avec-photos');
  void ecran.offsetWidth; // l'état de départ (colonne de photos fermée) est calculé avant l'ouverture : la transition peut jouer
  ecran.classList.add('photos-ouvertes');
  demarrerDefilement(panneau, fenetre);
  return panneau;
}

/** Ajoute des photos à un panneau déjà monté (les suivantes, arrivées après la première) et lance le fondu s'il y en a plusieurs. */
export function completerPhotosConnexion(panneau, adresses, { document: doc = globalThis.document, fenetre = globalThis.window } = {}) {
  if (!panneau?.isConnected || !adresses?.length) return panneau || null;
  const ecran = panneau.parentElement;
  adresses.forEach((src) => creerImage(doc, panneau, ecran, src, false));
  panneau.dataset.photos = String(panneau.querySelectorAll('.connexion-photo').length);
  demarrerDefilement(panneau, fenetre);
  return panneau;
}

/**
 * Cherche les photos puis monte le panneau (sans rien bloquer : le formulaire est déjà affiché). Le panneau apparaît dès que la
 * première photo a répondu ; les suivantes (grand écran) s'y ajoutent quand elles arrivent.
 */
export async function ajouterPhotosConnexion(ecran, chercher = globalThis.fetch?.bind(globalThis), { fenetre = globalThis.window, document: doc = globalThis.document } = {}) {
  const nombre = nombrePhotosPourEcran(fenetre);
  if (!nombre || typeof chercher !== 'function') return null;
  const premiere = await trouver(ADRESSES_PHOTOS_CONNEXION[0], chercher);
  if (!premiere) return null;
  const panneau = monterPhotosConnexion(ecran, [premiere], { document: doc, fenetre });
  if (!panneau || nombre < 2) return panneau;
  const suivantes = await Promise.all(ADRESSES_PHOTOS_CONNEXION.slice(1, nombre).map((a) => trouver(a, chercher)));
  return completerPhotosConnexion(panneau, suivantes.filter(Boolean), { document: doc, fenetre });
}
