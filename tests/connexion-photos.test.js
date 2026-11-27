// Photos du métier du client sur la page de connexion d'une maison (27/11/2026) : logique de recherche des photos (sans navigateur ni réseau),
// verrous statiques (photos jamais dans le dépôt, maison/ ignoré par git, seule la page neutre cherche les photos).
// Parcours dans le navigateur : tests/e2e/connexion-photos.spec.js (captures dans tests/e2e/captures/connexion-photos/). Script de copie : tests/connexion-photos-copie.test.js.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ADRESSES_PHOTOS_CONNEXION, chercherPhotosConnexion, estImage, adresseVersionnee, nombrePhotosPourEcran, ajouterPhotosConnexion } from '../js/os/connexion-photos.js';

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8');
const reponse = (status, type) => ({ ok: status >= 200 && status < 300, status, headers: { get: (n) => (n.toLowerCase() === 'content-type' ? type : null) } });

/** Faux fetch : `presentes` = adresses qui répondent une image ; les autres répondent `absente` (404 par défaut). Note chaque appel. */
function fauxFetch(presentes, absente = () => reponse(404, 'text/plain')) {
  const appels = [];
  const f = async (adresse, options) => { appels.push({ adresse, methode: options?.method }); return presentes.includes(adresse) ? reponse(200, 'image/jpeg') : absente(adresse); };
  f.appels = appels;
  return f;
}

test('1 adresses fixes du site : /maison/connexion-1.jpg à -3.jpg', () => {
  assert.deepEqual([...ADRESSES_PHOTOS_CONNEXION], ['/maison/connexion-1.jpg', '/maison/connexion-2.jpg', '/maison/connexion-3.jpg']);
});

test('1 pas de photo (404) : liste vide et UNE seule requête HEAD (les suivantes ne sont pas demandées)', async () => {
  const f = fauxFetch([]);
  assert.deepEqual(await chercherPhotosConnexion(f), []);
  assert.deepEqual(f.appels, [{ adresse: '/maison/connexion-1.jpg', methode: 'HEAD' }]);
});

test('1 réponse qui n’est pas une image (page HTML d’une réécriture), coupure réseau ou fetch absent : pas de photo', async () => {
  assert.deepEqual(await chercherPhotosConnexion(fauxFetch([], () => reponse(200, 'text/html; charset=utf-8'))), []);
  assert.deepEqual(await chercherPhotosConnexion(async () => { throw new TypeError('Failed to fetch'); }), []);
  assert.deepEqual(await chercherPhotosConnexion(null), []);
  assert.equal(estImage(reponse(200, 'IMAGE/JPEG')), true);
  assert.equal(estImage(reponse(304, 'image/jpeg')), false);
  assert.equal(estImage(null), false);
});

test('1 trois photos : les trois adresses dans l’ordre ; deux photos (1 et 3) : seulement celles-là', async () => {
  assert.deepEqual(await chercherPhotosConnexion(fauxFetch([...ADRESSES_PHOTOS_CONNEXION])), [...ADRESSES_PHOTOS_CONNEXION]);
  assert.deepEqual(await chercherPhotosConnexion(fauxFetch(['/maison/connexion-1.jpg', '/maison/connexion-3.jpg'])), ['/maison/connexion-1.jpg', '/maison/connexion-3.jpg']);
  // Sans la première, les autres ne comptent pas (une seule requête quand la maison n'a pas de photos).
  assert.deepEqual(await chercherPhotosConnexion(fauxFetch(['/maison/connexion-2.jpg'])), []);
});

test('1 seule la page de connexion NEUTRE (maison d’un client) cherche les photos : la page de Jérôme n’en demande jamais', () => {
  const shell = lire('js/os/shell.js');
  const debut = shell.indexOf('export function afficherConnexion');
  const neutre = shell.indexOf('if (connexionNeutre())', debut);
  const finNeutre = shell.indexOf('return;', neutre);
  const appel = shell.indexOf('ajouterPhotosConnexion(', debut);
  assert.ok(debut > 0 && neutre > debut && appel > neutre && appel < finNeutre, 'ajouterPhotosConnexion doit être appelé dans la branche connexionNeutre() seulement');
  assert.equal(shell.split('ajouterPhotosConnexion(').length - 1, 1);
});

test('4 dépôt public : maison/ est ignoré par git et aucune photo n’y est suivie', () => {
  assert.match(lire('.gitignore'), /^\/maison\/$/m);
  const suivis = execFileSync('git', ['ls-files', 'maison'], { cwd: new URL('..', import.meta.url), encoding: 'utf8' }).trim();
  assert.equal(suivis, '', 'aucun fichier de maison/ ne doit être dans le dépôt');
  // firebase.json publie la racine : maison/ n'est pas dans la liste « ignore » (sinon les photos ne partiraient pas).
  const conf = JSON.parse(lire('firebase.json'));
  assert.equal(conf.hosting.public, '.');
  assert.ok(!conf.hosting.ignore.some((m) => m.startsWith('maison')), 'maison/ doit être publié par Firebase Hosting');
});

test('4 paquet de la plateforme clients : maison/ n’en fait pas partie (les photos d’une maison ne partent jamais dans l’immeuble)', async () => {
  const { ELEMENTS_PUBLIES } = await import('../scripts/hebergement.js');
  assert.ok(!ELEMENTS_PUBLIES.includes('maison'));
});

// ---------------------------------------------------------------- corrections de la relecture Fable (C2, C6)

const avecEntetes = (entetes) => ({ ok: true, status: 200, headers: { get: (n) => entetes[n.toLowerCase()] ?? null } });

test('C2 cache d’un an sur une adresse fixe : l’image est demandée avec ?v= tiré de l’ETag (sinon du Last-Modified) de la réponse HEAD', async () => {
  assert.equal(adresseVersionnee('/maison/connexion-1.jpg', avecEntetes({ etag: '"a1b2c3"' })), '/maison/connexion-1.jpg?v=a1b2c3');
  assert.equal(adresseVersionnee('/maison/connexion-1.jpg', avecEntetes({ etag: 'W/"a1b2"' })), '/maison/connexion-1.jpg?v=a1b2');
  assert.equal(adresseVersionnee('/maison/connexion-2.jpg', avecEntetes({ 'last-modified': 'Fri, 27 Nov 2026 08:00:00 GMT' })),
    '/maison/connexion-2.jpg?v=Fri%2C%2027%20Nov%202026%2008%3A00%3A00%20GMT');
  assert.equal(adresseVersionnee('/maison/connexion-3.jpg', avecEntetes({})), '/maison/connexion-3.jpg');
  // Une photo remplacée (nouvel ETag) donne une nouvelle adresse : le navigateur ne ressert pas l'ancienne de son cache.
  const f = async (a) => avecEntetes({ 'content-type': 'image/jpeg', etag: `"${a.slice(-5, -4)}-v2"` });
  assert.deepEqual(await chercherPhotosConnexion(f), ['/maison/connexion-1.jpg?v=1-v2', '/maison/connexion-2.jpg?v=2-v2', '/maison/connexion-3.jpg?v=3-v2']);
});

/** Faux window : largeur d'écran simulée pour matchMedia. */
const fenetreDe = (largeur) => ({ matchMedia: (q) => {
  const min = /min-width:\s*(\d+)px/.exec(q); const max = /max-width:\s*(\d+)px/.exec(q);
  return { matches: (!min || largeur >= Number(min[1])) && (!max || largeur <= Number(max[1])) && !/reduced-motion/.test(q) };
} });

test('C6 téléphone : une seule photo demandée (une montrée) ; très petit écran : aucune demande ; grand écran : les trois', async () => {
  assert.equal(nombrePhotosPourEcran(fenetreDe(340)), 0);
  assert.equal(nombrePhotosPourEcran(fenetreDe(359)), 0);
  assert.equal(nombrePhotosPourEcran(fenetreDe(360)), 1);
  assert.equal(nombrePhotosPourEcran(fenetreDe(390)), 1);
  assert.equal(nombrePhotosPourEcran(fenetreDe(767)), 1);
  assert.equal(nombrePhotosPourEcran(fenetreDe(768)), 3);
  assert.deepEqual(await chercherPhotosConnexion(fauxFetch([...ADRESSES_PHOTOS_CONNEXION]), { nombre: 1 }), ['/maison/connexion-1.jpg']);
  // ajouterPhotosConnexion : on ne compte que les demandes (écran détaché : rien n'est monté). Grand écran (3 demandes) : parcours e2e.
  for (const [largeur, attendu] of [[340, []], [390, ['/maison/connexion-1.jpg']]]) {
    const f = fauxFetch([...ADRESSES_PHOTOS_CONNEXION]);
    assert.equal(await ajouterPhotosConnexion({ isConnected: false }, f, { fenetre: fenetreDe(largeur), document: {} }), null);
    assert.deepEqual(f.appels.map((a) => a.adresse), attendu, `largeur ${largeur}`);
  }
});
