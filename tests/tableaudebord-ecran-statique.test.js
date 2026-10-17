// Contrôles par le texte du module Tableau de bord (écrans en lecture seule) : R11 (aucune écriture), règles de requête, identité, branchement dans la coque.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODULES_DECLARES, moduleDeclare, blocsDuMenu } from '../js/os/registre.js';
import { MODULES } from '../js/os/modules.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOSSIER = 'js/modules/tableaudebord';
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const fichiers = readdirSync(join(RACINE, DOSSIER)).filter((f) => f.endsWith('.js'));
const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/([^:'"])\/\/.*$/gm, '$1');

describe('R11 aucune écriture', () => {
  test('R11 aucune API d\'écriture Firestore (setDoc, updateDoc, addDoc, deleteDoc, writeBatch, runTransaction) dans js/modules/tableaudebord/', () => {
    assert.ok(fichiers.length >= 4, fichiers.join());
    for (const f of fichiers) {
      const t = sansCommentaires(lire(`${DOSSIER}/${f}`));
      assert.doesNotMatch(t, /\b(setDoc|updateDoc|addDoc|deleteDoc|writeBatch|runTransaction)\b/, f);
      assert.doesNotMatch(t, /firebase-functions|httpsCallable|firebase-storage|\bfetch\s*\(/, `${f} : aucun appel au serveur`);
    }
  });
  test('R11 les imports Firestore du module se limitent à la lecture (collection, onSnapshot)', () => {
    const t = lire(`${DOSSIER}/donnees.js`);
    const [, liste] = /import \{([^}]*)\} from 'https:\/\/www\.gstatic\.com\/firebasejs\/[^/]+\/firebase-firestore\.js'/.exec(t);
    assert.deepEqual(liste.split(',').map((x) => x.trim()).filter(Boolean).sort(), ['collection', 'onSnapshot']);
  });
  test('R11 aucun bouton d\'action dans l\'écran : seulement « Réessayer » et les filtres (ni rafraîchir, ni saisie, ni suppression)', () => {
    const ecran = lire(`${DOSSIER}/ecran.js`);
    assert.doesNotMatch(ecran, /Rafraîchir|Saisir|Enregistrer|Supprimer|Retirer|type: 'date'|<input|h\('input'/);
  });
});

describe('règles du dépôt appliquées au module', () => {
  test('pas de orderBy, limit ni where : la requête lit la collection entière et l\'écran trie (D4)', () => {
    for (const f of fichiers) assert.doesNotMatch(sansCommentaires(lire(`${DOSSIER}/${f}`)), /\b(orderBy|limit|where)\s*\(/, f);
  });
  test('le module lit le chemin de la coque (cheminCollection) et ne filtre jamais sur le champ « proprietaire »', () => {
    const d = lire(`${DOSSIER}/donnees.js`);
    assert.match(d, /cheminCollection\(base, 'tableaudebord_indicateurs'\)/);
    for (const f of fichiers) assert.doesNotMatch(sansCommentaires(lire(`${DOSSIER}/${f}`)), /proprietaire/, f);
  });
  test('le module exporte demarrer, arreter, afficher (la coque les appelle)', () => {
    const t = lire(`${DOSSIER}/index.js`);
    for (const nom of ['demarrer', 'arreter', 'afficher']) assert.match(t, new RegExp(`export function ${nom}\\b`));
  });
  test('aucun mot d\'identité propre à Jérôme dans le module (tests/identite-client.test.js)', () => {
    for (const f of fichiers) assert.doesNotMatch(lire(`${DOSSIER}/${f}`), /Chevalier|Jérôme|Charles/, f);
  });
  test('vocabulaire : jamais « répertoire »', () => {
    for (const f of [...fichiers.map((x) => `${DOSSIER}/${x}`), 'css/tableaudebord.css']) assert.doesNotMatch(lire(f), /répertoire/i, f);
  });
});

describe('R1 branchement dans la coque', () => {
  test('R1 le module est déclaré juste après automatisations, avec ses trois collections, sans réservation aux clients', () => {
    const ids = MODULES_DECLARES.map((m) => m.id);
    assert.equal(ids.indexOf('tableaudebord'), ids.indexOf('automatisations') + 1);
    const m = moduleDeclare('tableaudebord');
    assert.equal(m.nom, 'Tableau de bord');
    assert.equal(m.reserveAuxClients, undefined);
    assert.deepEqual(m.collections, ['tableaudebord_indicateurs', 'tableaudebord_releves', 'tableaudebord_demandes']);
    assert.deepEqual(m.ecrans.map((e) => [e.route, e.libelle]), [['tableaudebord/general', 'Général'], ['tableaudebord/technique', 'Technique']]);
    assert.deepEqual(m.reglages.sections, []);
    assert.ok(m.reglages.resume.startsWith('Le tableau de bord se lit'));
  });
  test('R1 chez Jérôme (racine), le menu contient le bloc « Tableau de bord » dont la première entrée est « Général »', () => {
    const racine = MODULES.find((m) => m.id === 'tableaudebord');
    assert.equal(racine.libelle, 'Tableau de bord');
    assert.equal(typeof racine.monter, 'function');
    assert.equal(racine.entrees[0].libelle, 'Général');
    assert.equal(racine.entrees[0].chemin, 'tableaudebord/general');
    const bloc = blocsDuMenu(MODULES.map((m) => m.id)).find((b) => b.id === 'tableaudebord');
    assert.deepEqual(bloc.entrees.map((e) => e.libelle), ['Général', 'Technique']);
  });
  test('R1 la feuille de style est chargée au premier affichage, comme Automatisations', () => {
    assert.match(lire(`${DOSSIER}/index.js`), /css\/tableaudebord\.css/);
  });
});
