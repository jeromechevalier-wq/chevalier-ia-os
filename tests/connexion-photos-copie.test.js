// Script scripts/copier-photos-maison.js (27/11/2026) : copie 1 à 3 photos JPEG d'un dossier HORS du dépôt vers maison/ (connexion-1.jpg…),
// retire les métadonnées, remplace les photos d'une maison précédente, refuse tout le reste. Images d'essai fabriquées ici (jamais de vraie photo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { copierPhotosMaison, retirerPhotosMaison, lirePhotosSource, nettoyerJpeg, estJpeg, orientationExif, lireArguments, OCTETS_MAX } from '../scripts/copier-photos-maison.js';
import { verifierPhotosMaison } from '../scripts/verifier-photos-maison.js';

const SCRIPT = fileURLToPath(new URL('../scripts/copier-photos-maison.js', import.meta.url));
const VERIFIER = fileURLToPath(new URL('../scripts/verifier-photos-maison.js', import.meta.url));
// Identifiants de projets d'essai (jamais ceux d'un vrai client).
const PROJET_A = 'maison-essai-a';
const PROJET_B = 'maison-essai-b';
const segment = (marqueur, contenu) => { const b = Buffer.alloc(4); b[0] = 0xff; b[1] = marqueur; b.writeUInt16BE(contenu.length + 2, 2); return Buffer.concat([b, contenu]); };
/** Petit « JPEG » d'essai : SOI, APP0 (JFIF), APP1 (faux EXIF avec une fausse position GPS), COM, DQT, SOS + données, EOI. */
function jpegEssai(etiquette = 'A', { exif = true } = {}) {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1')),
    ...(exif ? [segment(0xe1, Buffer.from('Exif\0\0GPS-ESSAI-43.9', 'latin1')), segment(0xfe, Buffer.from('commentaire'))] : []),
    segment(0xdb, Buffer.alloc(65, 1)),
    segment(0xda, Buffer.from([1, 1, 0, 0, 63, 0])),
    Buffer.from(`image-${etiquette}`), Buffer.from([0xff, 0xd9]),
  ]);
}
/** Racine de dépôt factice (le script écrit dans <racine>/maison) et dossier source hors de cette racine. */
function bac() {
  const base = mkdtempSync(join(tmpdir(), 'photos-maison-'));
  const racine = join(base, 'depot'); const source = join(base, 'photos');
  mkdirSync(racine); mkdirSync(source);
  return { base, racine, source, fin: () => rmSync(base, { recursive: true, force: true }) };
}

test('2 copie 3 photos dans maison/connexion-1..3.jpg, par ordre de nom, métadonnées retirées, image intacte', () => {
  const b = bac();
  try {
    writeFileSync(join(b.source, 'b-isolation.jpg'), jpegEssai('B'));
    writeFileSync(join(b.source, 'a-charpente.JPEG'), jpegEssai('A'));
    writeFileSync(join(b.source, 'c-pierre.jpg'), jpegEssai('C'));
    writeFileSync(join(b.source, 'SOURCE.md'), '# sources');
    const copies = copierPhotosMaison(b.source, { racine: b.racine, projet: PROJET_A });
    assert.deepEqual(copies.map((c) => [c.source, c.fichier]), [['a-charpente.JPEG', 'maison/connexion-1.jpg'], ['b-isolation.jpg', 'maison/connexion-2.jpg'], ['c-pierre.jpg', 'maison/connexion-3.jpg']]);
    assert.deepEqual(readdirSync(join(b.racine, 'maison')).sort(), ['.projet', 'connexion-1.jpg', 'connexion-2.jpg', 'connexion-3.jpg']);
    const copie = readFileSync(join(b.racine, 'maison/connexion-1.jpg'));
    assert.ok(estJpeg(copie));
    assert.ok(!copie.includes('GPS-ESSAI'), 'les métadonnées EXIF sont retirées');
    assert.ok(!copie.includes('commentaire'));
    assert.ok(copie.includes('JFIF') && copie.includes('image-A'), 'l’en-tête JFIF et l’image restent');
    assert.deepEqual(copie, jpegEssai('A', { exif: false }));
  } finally { b.fin(); }
});

test('2 une nouvelle copie remplace les photos de la maison d’avant (pas de photo restante d’un autre client) ; --retirer vide maison/', () => {
  const b = bac();
  try {
    for (const n of ['1.jpg', '2.jpg', '3.jpg']) writeFileSync(join(b.source, n), jpegEssai(n));
    copierPhotosMaison(b.source, { racine: b.racine, projet: PROJET_A });
    const autre = join(b.base, 'autre'); mkdirSync(autre);
    writeFileSync(join(autre, 'seule.jpg'), jpegEssai('SEULE'));
    writeFileSync(join(b.racine, 'maison', 'LISEZMOI.txt'), 'garde');
    copierPhotosMaison(autre, { racine: b.racine, projet: PROJET_A });
    assert.deepEqual(readdirSync(join(b.racine, 'maison')).sort(), ['.projet', 'LISEZMOI.txt', 'connexion-1.jpg']);
    assert.ok(readFileSync(join(b.racine, 'maison/connexion-1.jpg')).includes('image-SEULE'));
    assert.equal(retirerPhotosMaison({ racine: b.racine }), 1);
    assert.deepEqual(readdirSync(join(b.racine, 'maison')), ['LISEZMOI.txt']);
    assert.equal(retirerPhotosMaison({ racine: join(b.base, 'vide') }), 0);
  } finally { b.fin(); }
});

test('2 refus clairs, et rien n’est touché : source dans le dépôt, plus de 3 photos, pas de JPEG, faux JPEG, plus de 2 Mo, dossier absent', () => {
  const b = bac();
  try {
    mkdirSync(join(b.racine, 'maison'));
    writeFileSync(join(b.racine, 'maison/connexion-1.jpg'), jpegEssai('AVANT'));
    const dansDepot = join(b.racine, 'photos'); mkdirSync(dansDepot); writeFileSync(join(dansDepot, 'a.jpg'), jpegEssai());
    assert.throws(() => copierPhotosMaison(dansDepot, { racine: b.racine, projet: PROJET_A }), /dans le dépôt/);
    assert.throws(() => copierPhotosMaison(join(b.base, 'absent'), { racine: b.racine, projet: PROJET_A }), /introuvable/);
    assert.throws(() => copierPhotosMaison(b.source, { racine: b.racine, projet: PROJET_A }), /aucune photo/);
    writeFileSync(join(b.source, 'faux.jpg'), Buffer.from('<script>alert(1)</script>'));
    assert.throws(() => copierPhotosMaison(b.source, { racine: b.racine, projet: PROJET_A }), /faux\.jpg : ce n’est pas un JPEG/);
    rmSync(join(b.source, 'faux.jpg'));
    writeFileSync(join(b.source, 'gros.jpg'), jpegEssai(Buffer.alloc(OCTETS_MAX, 0x41).toString('latin1')));
    assert.throws(() => copierPhotosMaison(b.source, { racine: b.racine, projet: PROJET_A }), /plus de 2 Mo/);
    rmSync(join(b.source, 'gros.jpg'));
    for (const n of ['1.jpg', '2.jpg', '3.jpg', '4.jpg']) writeFileSync(join(b.source, n), jpegEssai(n));
    assert.throws(() => copierPhotosMaison(b.source, { racine: b.racine, projet: PROJET_A }), /4 photos : 3 au plus/);
    assert.ok(readFileSync(join(b.racine, 'maison/connexion-1.jpg')).includes('image-AVANT'), 'un refus ne retire pas les photos déjà en place');
    assert.throws(() => lirePhotosSource('', { racine: b.racine }), /manquant/);
    assert.throws(() => nettoyerJpeg(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00])), /tronqué/);
  } finally { b.fin(); }
});

test('2 en ligne de commande : sans argument, usage (code 2) ; source refusée, code 1 et message « Échec »', () => {
  const sans = spawnSync(process.execPath, [SCRIPT], { encoding: 'utf8' });
  assert.equal(sans.status, 2);
  assert.match(sans.stderr, /Usage/);
  const b = bac();
  try {
    const refus = spawnSync(process.execPath, [SCRIPT, '--projet', PROJET_A, join(b.base, 'absent')], { encoding: 'utf8' });
    assert.equal(refus.status, 1);
    assert.match(refus.stderr, /Échec : dossier introuvable/);
    assert.ok(!existsSync(join(b.racine, 'maison')));
  } finally { b.fin(); }
});

// ---------------------------------------------------------------- corrections de la relecture Fable (C1, C3 à C5)

/** Bloc APP1 EXIF minimal avec une orientation (étiquette 0x0112), en ordre Intel (II) ou Motorola (MM). */
function exifOrientation(orientation, ordre = 'II') {
  const le = ordre === 'II';
  const t = Buffer.alloc(8 + 2 + 12 + 4);
  t.write(ordre, 0, 'latin1');
  const u16 = (v, o) => (le ? t.writeUInt16LE(v, o) : t.writeUInt16BE(v, o));
  const u32 = (v, o) => (le ? t.writeUInt32LE(v, o) : t.writeUInt32BE(v, o));
  u16(0x2a, 2); u32(8, 4); u16(1, 8);
  u16(0x0112, 10); u16(3, 12); u32(1, 14); u16(orientation, 18);
  return segment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), t]));
}
const SOI = Buffer.from([0xff, 0xd8]);
const EOI = Buffer.from([0xff, 0xd9]);
const APP0 = segment(0xe0, Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1'));
const DQT = segment(0xdb, Buffer.alloc(65, 1));
const SOS = segment(0xda, Buffer.from([1, 1, 0, 0, 63, 0]));

test('C3 orientation EXIF : photo couchée (6, 8…) refusée avec la marche à suivre ; orientation 1 ou absente acceptée', () => {
  for (const ordre of ['II', 'MM']) {
    assert.equal(orientationExif(exifOrientation(6, ordre).subarray(4)), 6);
    assert.equal(orientationExif(exifOrientation(1, ordre).subarray(4)), 1);
    assert.throws(() => nettoyerJpeg(Buffer.concat([SOI, APP0, exifOrientation(6, ordre), DQT, SOS, Buffer.from('img'), EOI])), /orientation EXIF 6.*Tourne la photo avec Aperçu/);
  }
  assert.throws(() => nettoyerJpeg(Buffer.concat([SOI, exifOrientation(8), SOS, Buffer.from('img'), EOI])), /orientation EXIF 8/);
  const droite = nettoyerJpeg(Buffer.concat([SOI, APP0, exifOrientation(1), DQT, SOS, Buffer.from('img'), EOI]));
  assert.deepEqual(droite, Buffer.concat([SOI, APP0, DQT, SOS, Buffer.from('img'), EOI]), 'APP1 retiré, le reste intact');
  // Bloc APP1 qui n'est pas un EXIF (XMP) : pas d'orientation, retiré quand même.
  assert.equal(orientationExif(Buffer.from('http://ns.adobe.com/xap/1.0/\0<x/>', 'latin1')), 1);
  // Par le script : le nom de la photo et la consigne dans le message, et rien n'est copié.
  const b = bac();
  try {
    writeFileSync(join(b.source, 'telephone.jpg'), Buffer.concat([SOI, exifOrientation(6), SOS, Buffer.from('img'), EOI]));
    assert.throws(() => copierPhotosMaison(b.source, { racine: b.racine, projet: PROJET_A }), /telephone\.jpg : photo tournée.*Aperçu/);
    assert.ok(!existsSync(join(b.racine, 'maison')));
  } finally { b.fin(); }
});

test('C4 tout ce qui suit la fin de l’image principale (seconde image, vidéo d’un téléphone récent) est coupé ; JPEG progressif (plusieurs passes) gardé entier', () => {
  const principale = Buffer.concat([SOI, APP0, DQT, SOS, Buffer.from([1, 2, 0xff, 0x00, 3, 0xff, 0xd3, 4]), EOI]);
  const suite = Buffer.concat([SOI, exifOrientation(1), Buffer.from('ftypmp42 VIDEO-ESSAI GPS-ESSAI'), EOI]);
  assert.deepEqual(nettoyerJpeg(Buffer.concat([principale, suite])), principale, 'FF 00 et FF D3 (dans les données) ne sont pas des fins ; la suite est coupée');
  // Progressif : SOS, données, DHT, SOS, données, EOI : les deux passes restent.
  const dht = segment(0xc4, Buffer.alloc(20, 2));
  const progressif = Buffer.concat([SOI, APP0, DQT, SOS, Buffer.from('passe1'), dht, SOS, Buffer.from('passe2'), EOI]);
  assert.deepEqual(nettoyerJpeg(Buffer.concat([progressif, Buffer.from('APRES-LA-FIN')])), progressif);
  // Vignette EXIF (un petit JPEG complet, avec sa propre fin FF D9) dans APP1 : retirée avec APP1, l'image principale reste entière.
  const vignette = segment(0xe1, Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), SOI, Buffer.from('vignette'), EOI]));
  assert.deepEqual(nettoyerJpeg(Buffer.concat([SOI, APP0, vignette, DQT, SOS, Buffer.from('img'), EOI])), Buffer.concat([SOI, APP0, DQT, SOS, Buffer.from('img'), EOI]));
  assert.throws(() => nettoyerJpeg(Buffer.concat([SOI, APP0, SOS, Buffer.from('sans fin')])), /tronqué/);
});

test('C5 profil de couleur (APP2 ICC) et en-tête Adobe (APP14) gardés ; seuls APP1 (EXIF, XMP), APP13 (Photoshop, IPTC) et les commentaires sont retirés', () => {
  const icc = segment(0xe2, Buffer.from('ICC_PROFILE\0\x01\x01profil-display-p3', 'latin1'));
  const adobe = segment(0xee, Buffer.from('Adobe\0\x64\0\0\0\0\x01', 'latin1'));
  const iptc = segment(0xed, Buffer.from('Photoshop 3.0\0IPTC-AUTEUR', 'latin1'));
  const com = segment(0xfe, Buffer.from('commentaire'));
  const xmp = segment(0xe1, Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta>GPS-ESSAI</x:xmpmeta>', 'latin1'));
  const propre = nettoyerJpeg(Buffer.concat([SOI, APP0, exifOrientation(1), xmp, icc, iptc, adobe, com, DQT, SOS, Buffer.from('img'), EOI]));
  assert.deepEqual(propre, Buffer.concat([SOI, APP0, icc, adobe, DQT, SOS, Buffer.from('img'), EOI]));
  for (const absent of ['Exif', 'GPS-ESSAI', 'IPTC-AUTEUR', 'commentaire']) assert.ok(!propre.includes(absent), absent);
});

test('C1 le projet Firebase est obligatoire et noté dans maison/.projet ; le garde-fou refuse les photos d’une autre maison', () => {
  const b = bac();
  try {
    writeFileSync(join(b.source, 'a.jpg'), jpegEssai('A'));
    assert.throws(() => copierPhotosMaison(b.source, { racine: b.racine }), /projet Firebase manquant \(--projet <id>\)/);
    assert.throws(() => copierPhotosMaison(b.source, { racine: b.racine, projet: '../autre' }), /invalide/);
    assert.ok(!existsSync(join(b.racine, 'maison')), 'projet refusé : rien n’est copié');
    // Sans photo : rien à vérifier.
    assert.deepEqual(verifierPhotosMaison(PROJET_B, { racine: b.racine }), { photos: 0, projetNote: '' });
    copierPhotosMaison(b.source, { racine: b.racine, projet: PROJET_A });
    assert.equal(readFileSync(join(b.racine, 'maison/.projet'), 'utf8'), `${PROJET_A}\n`);
    assert.deepEqual(verifierPhotosMaison(PROJET_A, { racine: b.racine }), { photos: 1, projetNote: PROJET_A });
    // On a oublié --retirer (ou de recopier) avant de déployer une autre maison : refus.
    assert.throws(() => verifierPhotosMaison(PROJET_B, { racine: b.racine }), new RegExp(`celles du projet ${PROJET_A}, pas de ${PROJET_B}`));
    // Photos sans note (copie interrompue, ou posées à la main) : refus.
    rmSync(join(b.racine, 'maison/.projet'));
    assert.throws(() => verifierPhotosMaison(PROJET_A, { racine: b.racine }), /sans projet noté/);
    // --retirer vide aussi la note : plus rien à vérifier, n'importe quel projet peut partir.
    copierPhotosMaison(b.source, { racine: b.racine, projet: PROJET_A });
    retirerPhotosMaison({ racine: b.racine });
    assert.deepEqual(readdirSync(join(b.racine, 'maison')), []);
    assert.equal(verifierPhotosMaison(PROJET_B, { racine: b.racine }).photos, 0);
    assert.throws(() => verifierPhotosMaison('', { racine: b.racine }), /manquant/);
  } finally { b.fin(); }
  assert.deepEqual(lireArguments(['--projet', PROJET_A, '/x']), { projet: PROJET_A, retirer: false, source: '/x' });
  assert.deepEqual(lireArguments(['/x', '--projet', PROJET_A]), { projet: PROJET_A, retirer: false, source: '/x' });
  assert.throws(() => lireArguments(['/x', '/y']), /en trop/);
});

test('C1 maison/.projet n’est jamais publié : firebase.json ignore les fichiers qui commencent par un point', () => {
  const conf = JSON.parse(readFileSync(new URL('../firebase.json', import.meta.url), 'utf8'));
  assert.ok(conf.hosting.ignore.includes('**/.*'));
});

test('C1 en ligne de commande : copie sans --projet refusée ; vérificateur : usage (code 2), refus (code 1), OK (code 0)', () => {
  const b = bac();
  try {
    writeFileSync(join(b.source, 'a.jpg'), jpegEssai('A'));
    const sansProjet = spawnSync(process.execPath, [SCRIPT, b.source], { encoding: 'utf8' });
    assert.equal(sansProjet.status, 1);
    assert.match(sansProjet.stderr, /Échec : identifiant du projet Firebase manquant/);
    const usage = spawnSync(process.execPath, [VERIFIER], { encoding: 'utf8' });
    assert.equal(usage.status, 2);
    assert.match(usage.stderr, /Usage : node scripts\/verifier-photos-maison\.js/);
    // Le vrai dépôt : son dossier maison/ est vide ou absent sur la machine de test, ou contient les photos d'une maison notée ; on vérifie
    // seulement que le script répond, sans rien supposer de ce qu'il contient.
    const reel = spawnSync(process.execPath, [VERIFIER, PROJET_B], { encoding: 'utf8' });
    assert.ok([0, 1].includes(reel.status), reel.stderr);
  } finally { b.fin(); }
});
