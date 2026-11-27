// Photos du métier du client sur la page de connexion d'une maison (27/11/2026).
// Les photos ne sont JAMAIS dans le dépôt (public) : elles sont copiées dans maison/ (dossier ignoré par git) juste avant le déploiement
// d'une maison, par scripts/copier-photos-maison.js, et servies à une adresse fixe : /maison/connexion-1.jpg à -3.jpg.
// Seule la page de connexion NEUTRE d'une maison les cherche (connexionNeutre) : chez Jérôme, rien n'est demandé, la page reste comme avant.
// Recherche : la 1re photo d'abord (une seule requête si la maison n'en a pas), puis les 2 suivantes. Une réponse qui n'est pas une image
// (404, page HTML, coupure réseau) = pas de photo : la page garde son apparence, sans image cassée.
// Ce fichier ne lit ni Firebase ni le stockage du navigateur.

export const ADRESSES_PHOTOS_CONNEXION = Object.freeze(['/maison/connexion-1.jpg', '/maison/connexion-2.jpg', '/maison/connexion-3.jpg']);
/** Durée d'affichage de chaque photo avant le fondu vers la suivante (grand écran seulement). */
export const DUREE_PHOTO_MS = 7000;

/** Vrai si la réponse est une vraie image (statut 2xx et type image/…). */
export function estImage(reponse) {
  if (!reponse || !reponse.ok) return false;
  const type = String(reponse.headers?.get?.('content-type') || '').toLowerCase();
  return type.startsWith('image/');
}

async function existe(adresse, chercher) {
  try {
    return estImage(await chercher(adresse, { method: 'HEAD', cache: 'no-cache' }));
  } catch {
    return false;
  }
}

/** Adresses des photos présentes, dans l'ordre (0 à 3). Sans connexion-1.jpg, on ne cherche pas les autres. */
export async function chercherPhotosConnexion(chercher = globalThis.fetch?.bind(globalThis)) {
  if (typeof chercher !== 'function') return [];
  const [premiere, ...autres] = ADRESSES_PHOTOS_CONNEXION;
  if (!(await existe(premiere, chercher))) return [];
  const presentes = await Promise.all(autres.map((a) => existe(a, chercher)));
  return [premiere, ...autres.filter((_, i) => presentes[i])];
}

/**
 * Ajoute le panneau de photos à côté du formulaire (`ecran` = .connexion-ecran). Rien si `adresses` est vide ou si l'écran a déjà été remplacé.
 * Les images sont décoratives (alt vide). Une image qui ne se charge pas est retirée ; s'il n'en reste aucune, le panneau disparaît.
 */
export function monterPhotosConnexion(ecran, adresses, { document: doc = globalThis.document, fenetre = globalThis.window } = {}) {
  if (!ecran?.isConnected || !adresses?.length || ecran.querySelector('.connexion-photos')) return null;
  const panneau = doc.createElement('div');
  panneau.className = 'connexion-photos';
  panneau.setAttribute('aria-hidden', 'true');
  panneau.dataset.photos = String(adresses.length);
  const images = adresses.map((src, i) => {
    const img = doc.createElement('img');
    img.className = 'connexion-photo' + (i === 0 ? ' visible' : '');
    img.alt = '';
    img.decoding = 'async';
    img.src = src;
    img.addEventListener('error', () => {
      img.remove();
      if (!panneau.querySelector('.connexion-photo')) { panneau.remove(); ecran.classList.remove('avec-photos'); }
      else if (!panneau.querySelector('.connexion-photo.visible')) panneau.querySelector('.connexion-photo').classList.add('visible');
    });
    panneau.append(img);
    return img;
  });
  const voile = doc.createElement('div');
  voile.className = 'connexion-photos-voile';
  panneau.append(voile);
  ecran.append(panneau);
  ecran.classList.add('avec-photos');
  const reduire = fenetre?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  if (images.length > 1 && !reduire && typeof fenetre?.setInterval === 'function') {
    const minuteur = fenetre.setInterval(() => {
      if (!panneau.isConnected) { fenetre.clearInterval(minuteur); return; }
      if (!fenetre.matchMedia?.('(min-width: 768px)')?.matches) return; // téléphone : la première photo reste seule
      const restantes = [...panneau.querySelectorAll('.connexion-photo')];
      const i = restantes.findIndex((im) => im.classList.contains('visible'));
      restantes.forEach((im) => im.classList.remove('visible'));
      restantes[(i + 1) % restantes.length]?.classList.add('visible');
    }, DUREE_PHOTO_MS);
  }
  return panneau;
}

/** Cherche les photos puis monte le panneau (sans rien bloquer : le formulaire est déjà affiché). */
export async function ajouterPhotosConnexion(ecran, chercher) {
  const adresses = await chercherPhotosConnexion(chercher);
  return monterPhotosConnexion(ecran, adresses);
}
