// Script scripts/copier-photos-maison.js (27/11/2026) : copie 1 à 3 photos JPEG d'un dossier HORS du dépôt vers maison/ (connexion-1.jpg…),
// retire les métadonnées, remplace les photos d'une maison précédente, refuse tout le reste. Images d'essai fabriquées ici (jamais de vraie photo).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { copierPhotosMaison, retirerPhotosMaison, lirePhotosSource, nettoyerJpeg, estJpeg, OCTETS_MAX } from '../scripts/copier-photos-maison.js';

const SCRIPT = fileURLToPath(new URL('../scripts/copier-photos-maison.js', import.meta.url));
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
    const copies = copierPhotosMaison(b.source, { racine: b.racine });
    assert.deepEqual(copies.map((c) => [c.source, c.fichier]), [['a-charpente.JPEG', 'maison/connexion-1.jpg'], ['b-isolation.jpg', 'maison/connexion-2.jpg'], ['c-pierre.jpg', 'maison/connexion-3.jpg']]);
    assert.deepEqual(readdirSync(join(b.racine, 'maison')).sort(), ['connexion-1.jpg', 'connexion-2.jpg', 'connexion-3.jpg']);
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
    copierPhotosMaison(b.source, { racine: b.racine });
    const autre = join(b.base, 'autre'); mkdirSync(autre);
    writeFileSync(join(autre, 'seule.jpg'), jpegEssai('SEULE'));
    writeFileSync(join(b.racine, 'maison', 'LISEZMOI.txt'), 'garde');
    copierPhotosMaison(autre, { racine: b.racine });
    assert.deepEqual(readdirSync(join(b.racine, 'maison')).sort(), ['LISEZMOI.txt', 'connexion-1.jpg']);
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
    assert.throws(() => copierPhotosMaison(dansDepot, { racine: b.racine }), /dans le dépôt/);
    assert.throws(() => copierPhotosMaison(join(b.base, 'absent'), { racine: b.racine }), /introuvable/);
    assert.throws(() => copierPhotosMaison(b.source, { racine: b.racine }), /aucune photo/);
    writeFileSync(join(b.source, 'faux.jpg'), Buffer.from('<script>alert(1)</script>'));
    assert.throws(() => copierPhotosMaison(b.source, { racine: b.racine }), /faux\.jpg : ce n’est pas un JPEG/);
    rmSync(join(b.source, 'faux.jpg'));
    writeFileSync(join(b.source, 'gros.jpg'), Buffer.concat([jpegEssai(), Buffer.alloc(OCTETS_MAX)]));
    assert.throws(() => copierPhotosMaison(b.source, { racine: b.racine }), /plus de 2 Mo/);
    rmSync(join(b.source, 'gros.jpg'));
    for (const n of ['1.jpg', '2.jpg', '3.jpg', '4.jpg']) writeFileSync(join(b.source, n), jpegEssai(n));
    assert.throws(() => copierPhotosMaison(b.source, { racine: b.racine }), /4 photos : 3 au plus/);
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
    const refus = spawnSync(process.execPath, [SCRIPT, join(b.base, 'absent')], { encoding: 'utf8' });
    assert.equal(refus.status, 1);
    assert.match(refus.stderr, /Échec : dossier introuvable/);
    assert.ok(!existsSync(join(b.racine, 'maison')));
  } finally { b.fin(); }
});
