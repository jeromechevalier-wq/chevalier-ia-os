// Sauvegarde complète des achats en .zip (26/11/2026) : un test par critère (le nom commence par son numéro).
//  Z5 le créateur de zip (js/os/zip.js) : CRC32 sur un texte connu, structure (en-têtes locaux, répertoire central, fin), relecture complète ;
//  Z2 la logique (js/modules/achatscommun/sauvegarde-logique.js) : seulement les modules allumés, une table en échec = aucun fichier et un message qui la nomme ;
//  Z1, Z3, Z4 : verrous sur le code (nom de l'archive, chaque module inscrit sa table et range sa section sous « Sauvegardes séparées », titres précis).
// Le parcours dans le navigateur : tests/e2e/achats-sauvegarde-zip.spec.js.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crc32, creerZip, dateDos } from '../js/os/zip.js';
import { ouvrirZip, lireEntree } from '../js/modules/reseauxsociaux/zip.js';
import { rassemblerSauvegarde, nomFichierSauvegarde, jourDeParis, texteEchec, enumerer, ErreurSauvegarde } from '../js/modules/achatscommun/sauvegarde-logique.js';

const RACINE = new URL('..', import.meta.url).pathname;
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const octets = (t) => new TextEncoder().encode(t);
const texte = (o) => new TextDecoder('utf-8', { ignoreBOM: true }).decode(o); // garde la marque d'ordre (BOM) des CSV

/** Lecture minimale, écrite ici sans le code de l'appli : la liste des entrées du répertoire central et leurs données (méthode « stored »). */
function relireMinimal(zip) {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const fin = zip.length - 22;
  assert.equal(v.getUint32(fin, true), 0x06054b50, 'signature de fin du répertoire central');
  const total = v.getUint16(fin + 10, true);
  const tailleRep = v.getUint32(fin + 12, true);
  const debutRep = v.getUint32(fin + 16, true);
  assert.equal(debutRep + tailleRep, fin, 'le répertoire central finit juste avant l’enregistrement de fin');
  const entrees = [];
  let p = debutRep;
  for (let n = 0; n < total; n++) {
    assert.equal(v.getUint32(p, true), 0x02014b50, 'signature d’une entrée du répertoire central');
    assert.equal(v.getUint16(p + 10, true), 0, 'méthode 0 (stored)');
    assert.equal(v.getUint16(p + 8, true) & 0x0800, 0x0800, 'noms en UTF-8');
    const crc = v.getUint32(p + 16, true);
    const taille = v.getUint32(p + 24, true);
    const longNom = v.getUint16(p + 28, true);
    const decalage = v.getUint32(p + 42, true);
    const nom = texte(zip.subarray(p + 46, p + 46 + longNom));
    assert.equal(v.getUint32(decalage, true), 0x04034b50, `en-tête local de ${nom}`);
    assert.equal(v.getUint32(decalage + 14, true), crc, `même CRC dans l’en-tête local de ${nom}`);
    const debut = decalage + 30 + v.getUint16(decalage + 26, true) + v.getUint16(decalage + 28, true);
    const donnees = zip.subarray(debut, debut + taille);
    assert.equal(crc32(donnees), crc, `CRC correct pour ${nom}`);
    entrees.push({ nom, contenu: texte(donnees) });
    p += 46 + longNom;
  }
  return entrees;
}

describe('Z5 créateur de zip (js/os/zip.js)', () => {
  test('Z5 CRC32 d’un texte connu : « 123456789 » = CBF43926, « » = 0', () => {
    assert.equal(crc32(octets('123456789')), 0xCBF43926);
    assert.equal(crc32(new Uint8Array(0)), 0);
    assert.equal(crc32(octets('The quick brown fox jumps over the lazy dog')), 0x414FA339);
  });

  test('Z5 structure : en-têtes locaux, répertoire central et fin ; contenu identique relu par une lecture minimale', () => {
    const fichiers = [
      { nom: 'fournisseurs-2026-11-26.csv', contenu: '﻿Fournisseur;SIREN\r\nÉlec Sud;123456789\r\n' },
      { nom: 'chantiers-2026-11-26.csv', contenu: '﻿Code;Nom\r\n' },
      { nom: 'vide.csv', contenu: '' },
    ];
    const zip = creerZip(fichiers, { date: new Date(2026, 10, 26, 14, 30, 20) });
    assert.ok(zip instanceof Uint8Array);
    assert.equal(new DataView(zip.buffer).getUint32(0, true), 0x04034b50, 'commence par un en-tête local');
    assert.deepEqual(relireMinimal(zip), fichiers);
  });

  test('Z5 relu par le lecteur de zip de l’appli (import LinkedIn) : mêmes noms, mêmes octets, CRC vérifié', async () => {
    const fichiers = [{ nom: 'factures-2026-11-26.csv', contenu: 'Numéro;HT\r\nF-1;100,00\r\n' }, { nom: 'articles-2026-11-26.csv', contenu: 'a;b\r\n' }];
    const blob = new Blob([creerZip(fichiers)]);
    const archive = await ouvrirZip(blob);
    assert.deepEqual(archive.entrees.map((e) => e.nom), fichiers.map((f) => f.nom));
    for (const [i, e] of archive.entrees.entries()) assert.equal(texte(await lireEntree(blob, e)), fichiers[i].contenu);
  });

  test('Z5 archive vide valide ; nom vide ou en double refusé ; date au format MS-DOS', () => {
    const vide = creerZip([]);
    assert.equal(vide.length, 22);
    assert.deepEqual(relireMinimal(vide), []);
    assert.throws(() => creerZip([{ nom: '', contenu: 'x' }]), /pas de nom/);
    assert.throws(() => creerZip([{ nom: 'a.csv', contenu: '1' }, { nom: 'a.csv', contenu: '2' }]), /double/);
    const d = dateDos(new Date(2026, 10, 26, 14, 30, 20));
    assert.equal(d.jour, ((2026 - 1980) << 9) | (11 << 5) | 26);
    assert.equal(d.heure, (14 << 11) | (30 << 5) | 10);
  });
});

describe('Z2 logique de la sauvegarde complète', () => {
  const insc = (module, table, contenu = `${table};\r\n`, message = '') => ({ module, table, fabriquer: async () => ({ nom: `${module}.csv`, contenu, message }) });
  const panne = (module, table, erreur = new Error('panne réseau')) => ({ module, table, fabriquer: async () => { throw erreur; } });

  test('Z2 seulement les tables des modules allumés (un module éteint n’est pas dans le zip)', async () => {
    const r = await rassemblerSauvegarde([insc('achatsfournisseurs', 'Fournisseurs'), insc('achatsarticles', 'Articles'), insc('achatsfactures', 'Factures')], { actifs: ['achatsfournisseurs', 'achatsfactures', 'crm'] });
    assert.deepEqual(r.fichiers.map((f) => f.nom), ['achatsfournisseurs.csv', 'achatsfactures.csv']);
    assert.deepEqual(r.tables, ['Fournisseurs', 'Factures']);
    assert.deepEqual(r.avertissements, []);
  });

  test('Z2 une table en échec : aucun fichier, le message nomme la table', async () => {
    await assert.rejects(rassemblerSauvegarde([insc('achatsfournisseurs', 'Fournisseurs'), panne('achatschantiers', 'Chantiers')]), (e) => {
      assert.ok(e instanceof ErreurSauvegarde);
      assert.deepEqual(e.tables, ['Chantiers']);
      assert.equal(e.message, 'Sauvegarde non téléchargée : la table Chantiers n’a pas pu être lue. Vérifie ta connexion à la base, puis réessaie.');
      return true;
    });
  });

  test('Z2 plusieurs tables en échec, avec la raison lisible de la couche d’accès', async () => {
    const lisible = Object.assign(new Error('Reconnecte-toi : ton accès à la base n’est pas à jour.'), { name: 'ErreurBase' });
    await assert.rejects(rassemblerSauvegarde([panne('a', 'Fournisseurs', lisible), insc('b', 'Chantiers'), panne('c', 'Articles')]), (e) => {
      assert.deepEqual(e.tables, ['Fournisseurs', 'Articles']);
      assert.match(e.message, /^Sauvegarde non téléchargée : les tables Fournisseurs et Articles n’ont pas pu être lues\. Reconnecte-toi/);
      return true;
    });
    assert.equal(texteEchec(['A', 'B', 'C']), 'Sauvegarde non téléchargée : les tables A, B et C n’ont pas pu être lues. Vérifie ta connexion à la base, puis réessaie.');
    assert.equal(enumerer(['A']), 'A');
  });

  test('Z2 un fichier mal formé compte comme un échec ; aucun module allumé : message clair', async () => {
    await assert.rejects(rassemblerSauvegarde([{ module: 'a', table: 'Factures', fabriquer: async () => ({ nom: '', contenu: 'x' }) }]), /la table Factures/);
    await assert.rejects(rassemblerSauvegarde([insc('a', 'A')], { actifs: [] }), /Aucun module Achats n’est allumé/);
  });

  test('Z2 une liste peut-être incomplète reste dans le zip mais est signalée (avertissement)', async () => {
    const r = await rassemblerSauvegarde([insc('a', 'A', 'x', 'Liste incomplète.'), insc('b', 'B', 'y', 'Liste incomplète.')]);
    assert.deepEqual(r.avertissements, ['Liste incomplète.']);
  });
});

describe('Z1, Z3, Z4 : verrous sur le code', () => {
  const MODULES = { achatsfournisseurs: 'fichierFournisseurs', achatschantiers: 'fichierChantiers', achatsarticles: 'fichierArticles', achatsfactures: 'fichierFactures', tableauachats: 'fichierSauvegarde' };

  test('Z1 nom de l’archive avec la date de Paris', () => {
    assert.equal(nomFichierSauvegarde('2026-11-26'), 'sauvegarde-achats-2026-11-26.zip');
    assert.equal(jourDeParis(new Date('2026-11-26T23:30:00Z')), '2026-11-27'); // minuit passé à Paris
  });

  test('Z1 chaque module inscrit SON fichier (celui de son bouton) ; le bouton de module le réutilise (même contenu)', () => {
    for (const [m, fonction] of Object.entries(MODULES)) {
      const index = lire(`js/modules/${m}/index.js`);
      assert.match(index, new RegExp(`zoneSauvegardesAchats\\(page, \\{ module: '${m}'`), m);
      assert.match(index, new RegExp(`fabriquer: \\(\\) => ${fonction}\\(`), m);
      assert.match(lire(`js/modules/${m}/export.js`), new RegExp(`export async function ${fonction}\\(`), m);
      assert.doesNotMatch(index, /from '\.\.\/achats(?!commun)[a-z]+\//, `${m} n’importe aucun autre module`);
    }
  });

  test('Z3 les sections des modules sont rangées dans la zone « Sauvegardes séparées » (détails repliés)', () => {
    const code = lire('js/modules/achatscommun/sauvegarde.js');
    assert.match(code, /h\('details', \{ class: 'sauvegardes-separees'/);
    assert.match(code, /h\('summary'[^)]*\}, 'Sauvegardes séparées'\)/);
    assert.doesNotMatch(code, /open: true/, 'replié au départ');
    assert.match(lire('js/os/reglages.js'), /!el\.parentElement\?\.closest\('details'\)/, 'pas de raccourci vers une section repliée');
  });

  test('Z4 titres précis : « Sauvegarde des chantiers », « Sauvegarde des factures »', () => {
    assert.match(lire('js/modules/achatschantiers/export.js'), /'Sauvegarde des chantiers'\)/);
    assert.match(lire('js/modules/achatsfactures/export.js'), /'Sauvegarde des factures'\)/);
    for (const m of Object.keys(MODULES)) assert.doesNotMatch(lire(`js/modules/${m}/export.js`), /icone\('download', \{ taille: 18 \}\), 'Sauvegarde'\)/, m);
  });
});
