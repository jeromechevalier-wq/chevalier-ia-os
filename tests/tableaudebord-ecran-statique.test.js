// Contrôles par le texte du module Tableau de bord : R11 et S9 (aucune écriture dans la base depuis l'écran ; seul appel serveur : la fonction `tableaudebordSaisir`), règles de requête, identité, branchement dans la coque.
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
      assert.doesNotMatch(t, /firebase-storage|\bfetch\s*\(/, `${f} : aucun autre appel au serveur`);
      // Seul donnees.js parle au serveur, et seulement par httpsCallable (la saisie) : aucun autre fichier du module n'y touche.
      if (f !== 'donnees.js') assert.doesNotMatch(t, /firebase-functions|httpsCallable|getFunctions/, `${f} : l'appel au serveur est dans donnees.js seulement`);
    }
  });
  test('S9 le seul appel au serveur est httpsCallable, et il appelle exactement la fonction « tableaudebordSaisir »', () => {
    const t = sansCommentaires(lire(`${DOSSIER}/donnees.js`));
    assert.deepEqual([...t.matchAll(/httpsCallable\(fonctions\(\), '([A-Za-z]+)'\)/g)].map((m) => m[1]), ['tableaudebordSaisir']);
    assert.equal((t.match(/httpsCallable\(/g) || []).length, 1);
    const [, liste] = /import \{([^}]*)\} from 'https:\/\/www\.gstatic\.com\/firebasejs\/[^/]+\/firebase-functions\.js'/.exec(t);
    assert.deepEqual(liste.split(',').map((x) => x.trim()).filter(Boolean).sort(), ['getFunctions', 'httpsCallable']);
  });
  test('R11 les imports Firestore du module se limitent à la lecture (collection, onSnapshot, query, where)', () => {
    const t = lire(`${DOSSIER}/donnees.js`);
    const [, liste] = /import \{([^}]*)\} from 'https:\/\/www\.gstatic\.com\/firebasejs\/[^/]+\/firebase-firestore\.js'/.exec(t);
    assert.deepEqual(liste.split(',').map((x) => x.trim()).filter(Boolean).sort(), ['collection', 'onSnapshot', 'query', 'where']);
  });
  test('R11 boutons de l\'écran : « Réessayer », les filtres, et la saisie (Saisir, Enregistrer, Annuler) ; ni rafraîchir, ni suppression', () => {
    const ecran = lire(`${DOSSIER}/ecran.js`);
    assert.doesNotMatch(ecran, /Rafraîchir|Supprimer|Retirer|<input/);
    assert.match(ecran, /Enregistrer/);
    assert.match(ecran, /Annuler/);
    assert.match(lire(`${DOSSIER}/logique.js`), /Saisir la date/);
    assert.match(lire(`${DOSSIER}/logique.js`), /Saisir la valeur/);
    // Deux champs seulement, dans la zone de saisie : la date (ou le nombre) et la note facultative.
    assert.equal((ecran.match(/h\('input'/g) || []).length, 2);
    assert.equal((ecran.match(/h\('form'/g) || []).length, 1);
  });
  test('S9 l\'écran ne parle à la base que par donnees.js : il appelle seulement D.saisir (aucun autre accès en écriture)', () => {
    const ecran = sansCommentaires(lire(`${DOSSIER}/ecran.js`));
    const appels = new Set([...ecran.matchAll(/\bD\.([A-Za-z]+)/g)].map((m) => m[1]));
    assert.ok(appels.has('saisir'));
    assert.ok(![...appels].some((x) => /^(ecrire|ajouter|supprimer|maj|modifier)/.test(x)));
  });
});

describe('règles du dépôt appliquées au module', () => {
  test('S9 pas de orderBy ni limit ; au plus UNE condition where (saisie == true, historique), jamais dans un autre fichier que donnees.js ; l\'écran trie (D4)', () => {
    for (const f of fichiers) assert.doesNotMatch(sansCommentaires(lire(`${DOSSIER}/${f}`)), /\b(orderBy|limit)\s*\(/, f);
    const total = fichiers.map((f) => [...sansCommentaires(lire(`${DOSSIER}/${f}`)).matchAll(/\bwhere\s*\(([^)]*)\)/g)].map((m) => [f, m[1]])).flat();
    assert.deepEqual(total, [['donnees.js', "'saisie', '==', true"]]);
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
    assert.equal(m.nom, 'Maintenance');
    assert.equal(m.reserveAuxClients, undefined);
    assert.deepEqual(m.collections, ['tableaudebord_indicateurs', 'tableaudebord_releves', 'tableaudebord_demandes']);
    assert.deepEqual(m.ecrans.map((e) => [e.route, e.libelle]), [['tableaudebord/general', 'Général'], ['tableaudebord/technique', 'Technique']]);
    assert.deepEqual(m.reglages.sections, []);
    assert.ok(m.reglages.resume.startsWith('La maintenance se lit'));
  });
  test('R1 chez Jérôme (racine), le menu contient le bloc « Maintenance » dont la première entrée est « Général »', () => {
    const racine = MODULES.find((m) => m.id === 'tableaudebord');
    assert.equal(racine.libelle, 'Maintenance');
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
