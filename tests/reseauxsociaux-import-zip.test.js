// Import LinkedIn : lecteur de ZIP et de CSV (tests purs, sur une archive FICTIVE fabriquée par le test). Critères G6 et G7 du cahier.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ouvrirZip, lireEntree, lireFichiersUtiles, empreinteArchive, nomDeFichier, ErreurArchive, TAILLE_MAX_ARCHIVE } from '../js/modules/reseauxsociaux/zip.js';
import { lireCsv, lireTable, COLONNES_MESSAGES, REQUISES_MESSAGES, COLONNES_RELATIONS, REQUISES_RELATIONS } from '../js/modules/reseauxsociaux/csv.js';
import { fabriquerZip, blob, archiveFictive } from './_archive-linkedin-fictive.js';

const texte = (octets) => new TextDecoder().decode(octets);

test('G7 zip : une entrée stockée (méthode 0) et une entrée compressée (méthode 8) se lisent à l’identique', async () => {
  const contenu = 'a,b\n1,2\n'.repeat(500);
  for (const methode of [0, 8]) {
    const b = blob(fabriquerZip([{ nom: 'messages.csv', contenu }], { methodeParDefaut: methode }));
    const zip = await ouvrirZip(b);
    assert.equal(zip.entrees.length, 1);
    assert.equal(zip.entrees[0].methode, methode);
    assert.equal(texte(await lireEntree(b, zip.entrees[0])), contenu);
  }
});

test('G7 zip : entrées dans un sous-dossier ou en majuscules, trouvées par leur nom de fichier ; aucune autre entrée n’est lue', async () => {
  const b = archiveFictive({ racine: 'Export-2026/DONNEES/' });
  const lus = await lireFichiersUtiles(b, ['messages.csv', 'connections.csv', 'profile.csv']);
  assert.match(texte(lus['messages.csv']), /CONVERSATION ID/);
  assert.match(texte(lus['connections.csv']), /First Name/);
  assert.match(texte(lus['profile.csv']), /Headline/);
  assert.equal(nomDeFichier('Export/MESSAGES.CSV'), 'messages.csv');
  const sans = await lireFichiersUtiles(blob(fabriquerZip([{ nom: 'Autre.txt', contenu: 'x' }])), ['messages.csv']);
  assert.equal(sans['messages.csv'], undefined);
});

test('G7 zip : le fichier le moins profond gagne quand deux entrées portent le même nom', async () => {
  const b = blob(fabriquerZip([{ nom: 'a/b/messages.csv', contenu: 'profond' }, { nom: 'messages.csv', contenu: 'haut' }]));
  assert.equal(texte((await lireFichiersUtiles(b, ['messages.csv']))['messages.csv']), 'haut');
});

test('G7 zip : ZIP64 refusé avec un message lisible', async () => {
  const octets = fabriquerZip([{ nom: 'messages.csv', contenu: 'x' }]);
  // Un répertoire annonçant « 0xFFFF entrées » est la marque d'un ZIP64.
  const faux = new Uint8Array(octets);
  const dv = new DataView(faux.buffer);
  dv.setUint16(faux.length - 22 + 10, 0xFFFF, true);
  await assert.rejects(ouvrirZip(blob(faux)), (e) => e instanceof ErreurArchive && e.code === 'zip64' && /ZIP64/.test(e.message));
});

test('G6 zip : pas un zip, fichier tronqué, trop gros, entrée abîmée : messages lisibles, jamais une erreur technique', async () => {
  await assert.rejects(ouvrirZip(blob(new TextEncoder().encode('Ceci est un texte, pas une archive .zip du tout, loin de là.'))), (e) => e.code === 'pasUnZip' && /pas une archive/.test(e.message));
  await assert.rejects(ouvrirZip(blob(new Uint8Array(5))), (e) => e.code === 'pasUnZip');
  const octets = fabriquerZip([{ nom: 'messages.csv', contenu: 'a,b\n'.repeat(1000) }]);
  await assert.rejects(ouvrirZip(blob(octets.slice(0, octets.length - 40))), (e) => e instanceof ErreurArchive); // tronqué : plus de fin de fichier lisible
  // Taille simulée au-delà de la limite : le fichier n'est même pas lu.
  const enorme = { size: TAILLE_MAX_ARCHIVE + 1, slice() { throw new Error('ne doit pas lire'); } };
  await assert.rejects(ouvrirZip(enorme), (e) => e.code === 'trop' && /trop grosse/.test(e.message) && /archive rapide/.test(e.message));
  // Une entrée dont les octets ont été abîmés : la somme de contrôle le détecte.
  const b = fabriquerZip([{ nom: 'messages.csv', contenu: 'abcdefgh'.repeat(10), methode: 0 }]);
  const abime = new Uint8Array(b);
  abime[30 + 'messages.csv'.length + 3] ^= 0xFF;
  const zip = await ouvrirZip(blob(abime));
  await assert.rejects(lireEntree(blob(abime), zip.entrees[0]), (e) => e.code === 'abime');
  // Une entrée annonçant une taille énorme est refusée sans être décompressée.
  await assert.rejects(lireEntree(blob(b), { ...zip.entrees[0], octets: 1e10 }), (e) => e.code === 'trop');
});

test('G7 zip : l’empreinte change avec le contenu et reste la même pour la même archive', async () => {
  const a1 = await ouvrirZip(archiveFictive());
  const a2 = await ouvrirZip(archiveFictive());
  const b1 = await ouvrirZip(blob(fabriquerZip([{ nom: 'messages.csv', contenu: 'autre' }])));
  const e1 = await empreinteArchive(a1);
  assert.match(e1, /^[0-9a-f]{64}$/);
  assert.equal(e1, await empreinteArchive(a2));
  assert.notEqual(e1, await empreinteArchive(b1));
});

test('G7 csv : guillemets doublés, retour à la ligne dans un champ, BOM, fin de ligne Windows', () => {
  const lignes = lireCsv('﻿a,b,c\r\n"un ""mot""","ligne 1\nligne 2",fin\r\n\r\nx,,z');
  assert.deepEqual(lignes, [['a', 'b', 'c'], ['un "mot"', 'ligne 1\nligne 2', 'fin'], ['x', '', 'z']]);
  assert.deepEqual(lireCsv(''), []);
});

test('G7 csv : lignes de notes avant l’en-tête, en-têtes en anglais et en français', () => {
  const t = lireTable(lireCsv('Notes:\n"Une phrase, avec virgule"\n\nFirst Name,Last Name,URL,Email Address\nAlice,Exemple,https://www.linkedin.com/in/alice-exemple,\n'), COLONNES_RELATIONS, REQUISES_RELATIONS);
  assert.equal(t.indexEntete, 2); // les lignes vides ne comptent pas
  assert.deepEqual(t.lignes, [{ prenom: 'Alice', nom: 'Exemple', url: 'https://www.linkedin.com/in/alice-exemple' }]);
  const fr = lireTable(lireCsv('Prénom,Nom,URL\nAlice,Exemple,https://www.linkedin.com/in/alice-exemple\n'), COLONNES_RELATIONS, REQUISES_RELATIONS);
  assert.equal(fr.lignes[0].prenom, 'Alice');
  const msg = lireTable(lireCsv('ID de la conversation,De,À,Date,Dossier\nc1,Alice,Moi,2026-11-01 10:00:00 UTC,INBOX\n'), COLONNES_MESSAGES, REQUISES_MESSAGES);
  assert.equal(msg.lignes[0].conversation, 'c1');
  assert.equal(msg.lignes[0].urlDe, '', 'une colonne facultative absente donne une chaîne vide');
  assert.equal(lireTable(lireCsv('x,y\n1,2\n'), COLONNES_MESSAGES, REQUISES_MESSAGES), null, 'sans les colonnes requises : null');
});
