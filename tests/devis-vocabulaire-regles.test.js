// Règles Firestore du dictionnaire de vocabulaire (devis_vocabulaire), dans les DEUX jeux de règles (base de Jérôme et plateforme clients). Motif : devis-regles.test.js.
// Émulateur, projets de démonstration. Cas : lecture par les membres ; création d'une règle manuelle seulement ; refus des règles apprises ou à compteurs non nuls ;
// modification limitée (statut, article, note, conflit, marques) ; refus de toucher aux compteurs, à l'origine, à l'expression ; jamais de suppression ; autre espace refusé.
import assert from 'node:assert/strict';
import { test, describe, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, deleteField, setLogLevel } from 'firebase/firestore';

setLogLevel('error');

const [hote, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
const regles = (nom) => readFileSync(fileURLToPath(new URL(`../${nom}`, import.meta.url)), 'utf8');

const JEROME = 'jerome.chevalier@gmail.com';
const ALICE = 'alice@exemple.test'; // éditrice chez a
const LEA = 'lea@exemple.test'; // lectrice chez a
const BOB = 'bob@exemple.test'; // éditeur chez b seulement

const manuelle = (extra = {}) => ({ cle: 'prise double', expression: 'prises doubles', articleId: 'art1', articleLibelle: 'Prise 2P+T', statut: 'active', origine: 'manuelle', confirmations: 0, contradictions: 0, conflit: false, exemples: [], ...extra });
const apprise = (extra = {}) => manuelle({ origine: 'apprise_question', statut: 'a_confirmer', confirmations: 1, derniereConfirmationLe: '2026-10-28', exemples: ['mets 3 prises doubles'], ...extra });

function lesCas({ nom, projet, fichier, preparer, ref, habitudes, ecrivain, lecteur, autre }) {
  describe(`V4 Règles du vocabulaire : ${nom}`, () => {
    let env;
    before(async () => {
      env = await initializeTestEnvironment({ projectId: projet, firestore: { rules: regles(fichier), host: hote, port: Number(port) } });
    });
    after(async () => { await env?.cleanup(); });
    beforeEach(async () => {
      await env.clearFirestore();
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore();
        await preparer(db);
        await setDoc(ref(db, 'prise_double'), manuelle());
        await setDoc(ref(db, 'tableau'), apprise({ cle: 'tableau', expression: 'tableau' }));
      });
    });
    const db = (email) => env.authenticatedContext(`uid-${email}`, { email, email_verified: true }).firestore();

    test('V4a les membres lisent les règles du vocabulaire (le lecteur aussi)', async () => {
      await assertSucceeds(getDoc(ref(db(ecrivain), 'prise_double')));
      if (lecteur) await assertSucceeds(getDoc(ref(db(lecteur), 'prise_double')));
    });
    test('V4b un éditeur crée une règle manuelle (active ou désactivée, compteurs à zéro, sans conflit)', async () => {
      const d = db(ecrivain);
      await assertSucceeds(setDoc(ref(d, 'spot'), manuelle({ cle: 'spot', expression: 'spots', note: 'ok', creeLe: new Date(), creePar: 'x', modifieLe: new Date(), modifiePar: 'x' })));
      await assertSucceeds(setDoc(ref(d, 'spot2'), manuelle({ statut: 'desactivee' })));
    });
    test('V4c créer une règle apprise, à confirmer, ou à compteurs non nuls, ou en conflit, ou sans origine est refusé depuis le navigateur', async () => {
      const d = db(ecrivain);
      await assertFails(setDoc(ref(d, 'n1'), manuelle({ origine: 'apprise_question' })));
      await assertFails(setDoc(ref(d, 'n2'), manuelle({ origine: 'apprise_correction' })));
      await assertFails(setDoc(ref(d, 'n3'), manuelle({ statut: 'a_confirmer' })));
      await assertFails(setDoc(ref(d, 'n4'), manuelle({ confirmations: 3 })));
      await assertFails(setDoc(ref(d, 'n5'), manuelle({ contradictions: 1 })));
      await assertFails(setDoc(ref(d, 'n6'), manuelle({ conflit: true })));
      await assertFails(setDoc(ref(d, 'n9'), manuelle({ exemples: ['mets 3 prises doubles'] })));
      await assertFails(setDoc(ref(d, 'n10'), manuelle({ derniereConfirmationLe: '2026-10-28' })));
      await assertFails(setDoc(ref(d, 'n11'), manuelle({ derniereUtilisationLe: '2026-10-28' })));
      await assertFails(setDoc(ref(d, 'n12'), manuelle({ confirmations: '0' })));
      const sansOrigine = manuelle(); delete sansOrigine.origine;
      await assertFails(setDoc(ref(d, 'n7'), sansOrigine));
      const sansStatut = manuelle(); delete sansStatut.statut;
      await assertFails(setDoc(ref(d, 'n8'), sansStatut));
    });
    test('V4d activer, désactiver, changer l’article, annoter et lever un conflit sont permis', async () => {
      const d = db(ecrivain);
      await assertSucceeds(updateDoc(ref(d, 'prise_double'), { statut: 'desactivee', modifieLe: new Date(), modifiePar: 'x' }));
      await assertSucceeds(updateDoc(ref(d, 'prise_double'), { statut: 'active' }));
      await assertSucceeds(updateDoc(ref(d, 'prise_double'), { articleId: 'art2', articleLibelle: 'Prise 16A' }));
      await assertSucceeds(updateDoc(ref(d, 'prise_double'), { note: 'jamais le 4 rangées' }));
      await assertSucceeds(updateDoc(ref(d, 'prise_double'), { conflit: false }));
    });
    test('V4e une règle apprise à confirmer peut être validée (a_confirmer vers active) : c’est le but de la revue', async () => {
      await assertSucceeds(updateDoc(ref(db(ecrivain), 'tableau'), { statut: 'active', modifieLe: new Date(), modifiePar: 'x' }));
    });
    test('V4f modifier les compteurs, l’origine, l’expression, la clé, les exemples ou les dates du serveur est refusé', async () => {
      const d = db(ecrivain);
      for (const champ of [{ confirmations: 9 }, { contradictions: 5 }, { origine: 'manuelle' }, { expression: 'autre' }, { cle: 'autre' },
        { exemples: ['x'] }, { derniereConfirmationLe: '2026-10-29' }, { derniereUtilisationLe: new Date() }, { creeLe: new Date() }, { creePar: 'x' }]) {
        await assertFails(updateDoc(ref(d, 'tableau'), champ));
      }
      await assertFails(updateDoc(ref(d, 'tableau'), { statut: 'active', confirmations: 9 })); // un champ permis ne couvre pas un champ interdit
      await assertFails(updateDoc(ref(d, 'tableau'), { confirmations: deleteField() }));
      await assertFails(updateDoc(ref(d, 'tableau'), { origine: deleteField() }));
      await assertFails(setDoc(ref(d, 'tableau'), { confirmations: 9, origine: 'manuelle' }, { merge: true })); // fusion sur une règle apprise
      await assertFails(setDoc(ref(d, 'tableau'), manuelle({ cle: 'tableau', expression: 'tableau' }))); // remplacer en entier = changer l'origine, les compteurs…
    });
    test('V4j validation humaine : les champs valideLe, validePar, revoirLe, suggestionTraiteeLe sont modifiables ; un champ non listé reste refusé', async () => {
      const d = db(ecrivain);
      await assertSucceeds(updateDoc(ref(d, 'tableau'), { statut: 'active', valideLe: '2026-10-30', validePar: 'humain', revoirLe: '2027-04-30' }));
      await assertSucceeds(updateDoc(ref(d, 'tableau'), { suggestionTraiteeLe: '2026-11-02' }));
      await assertFails(updateDoc(ref(d, 'tableau'), { valideLe: '2026-10-30', suggestion: { raison: 'x' } })); // la suggestion est écrite par le serveur seulement
      await assertFails(updateDoc(ref(d, 'tableau'), { valideLe: '2026-10-30', motInconnu: 1 }));
      await assertFails(updateDoc(ref(d, 'tableau'), { validePar: 'serveur' })); // pas de fausse validation par une mise à jour
      await assertFails(updateDoc(ref(d, 'tableau'), { valideLe: 42 }));
      await assertFails(updateDoc(ref(d, 'tableau'), { revoirLe: 'bientôt' }));
      await assertFails(updateDoc(ref(d, 'tableau'), { suggestionTraiteeLe: 7 }));
    });
    test('V4k création : un mot manuel est validé par un humain (valideLe, revoirLe, validePar humain permis) ; suggestion, autre validePar et suggestionTraiteeLe refusés', async () => {
      const d = db(ecrivain);
      await assertSucceeds(setDoc(ref(d, 'v1'), manuelle({ valideLe: '2026-10-30', validePar: 'humain', revoirLe: '2027-04-30' })));
      await assertFails(setDoc(ref(d, 'v2'), manuelle({ validePar: 'reponses' })));
      await assertFails(setDoc(ref(d, 'v3'), manuelle({ validePar: 'serveur' })));
      await assertFails(setDoc(ref(d, 'v4'), manuelle({ suggestion: { raison: 'x' } })));
      await assertFails(setDoc(ref(d, 'v5'), manuelle({ suggestionTraiteeLe: '2026-10-30' })));
      await assertFails(setDoc(ref(d, 'v6'), manuelle({ valideLe: 'hier' })));
      await assertFails(setDoc(ref(d, 'v7'), manuelle({ revoirLe: 42 })));
    });
    test('V4l devis_habitudes : les membres lisent, personne n’écrit depuis un navigateur (même un éditeur), les autres espaces n’y lisent pas', async () => {
      const h = (d, id) => habitudes(d, id);
      await env.withSecurityRulesDisabled(async (ctx) => { await setDoc(h(ctx.firestore(), 'h1'), { cles: ['a', 'b'], nom: 'x' }); });
      await assertSucceeds(getDoc(h(db(ecrivain), 'h1')));
      if (lecteur) await assertSucceeds(getDoc(h(db(lecteur), 'h1')));
      await assertFails(setDoc(h(db(ecrivain), 'h2'), { cles: ['a'] }));
      await assertFails(updateDoc(h(db(ecrivain), 'h1'), { nom: 'y' }));
      await assertFails(deleteDoc(h(db(ecrivain), 'h1')));
      if (lecteur) await assertFails(setDoc(h(db(lecteur), 'h3'), { cles: ['a'] }));
      await assertFails(getDoc(h(db(autre), 'h1')));
    });
    test('V4g supprimer une règle est refusé', async () => {
      await assertFails(deleteDoc(ref(db(ecrivain), 'prise_double')));
      await assertFails(deleteDoc(ref(db(ecrivain), 'tableau')));
    });
    test('V4h un autre espace (ou un compte non autorisé) n’a aucun accès, et un lecteur ne peut qu’en lire', async () => {
      const d = db(autre);
      await assertFails(getDoc(ref(d, 'prise_double')));
      await assertFails(setDoc(ref(d, 'nouveau'), manuelle()));
      await assertFails(updateDoc(ref(d, 'prise_double'), { statut: 'desactivee' }));
      await assertFails(deleteDoc(ref(d, 'prise_double')));
      if (lecteur) {
        await assertFails(setDoc(ref(db(lecteur), 'nouveau'), manuelle()));
        await assertFails(updateDoc(ref(db(lecteur), 'prise_double'), { statut: 'desactivee' }));
      }
      await assertFails(getDoc(ref(env.unauthenticatedContext().firestore(), 'prise_double')));
    });
  });
}

lesCas({
  nom: 'base de Jérôme (firestore.rules)',
  projet: 'demo-chevalier-vocab-os',
  fichier: 'firestore.rules',
  preparer: async () => {},
  ref: (db, id) => doc(db, 'devis_vocabulaire', id),
  habitudes: (db, id) => doc(db, 'devis_habitudes', id),
  ecrivain: JEROME,
  lecteur: null,
  autre: 'inconnu@exemple.test',
});

lesCas({
  nom: 'plateforme clients (firestore.plateforme.rules)',
  projet: 'demo-chevalier-vocab-plateforme',
  fichier: 'firestore.plateforme.rules',
  preparer: async (db) => {
    await setDoc(doc(db, 'clients', 'a', 'membres', ALICE), { role: 'editeur' });
    await setDoc(doc(db, 'clients', 'a', 'membres', LEA), { role: 'lecteur' });
    await setDoc(doc(db, 'clients', 'b', 'membres', BOB), { role: 'editeur' });
  },
  ref: (db, id) => doc(db, 'clients', 'a', 'devis_vocabulaire', id),
  habitudes: (db, id) => doc(db, 'clients', 'a', 'devis_habitudes', id),
  ecrivain: ALICE,
  lecteur: LEA,
  autre: BOB,
});

describe('V4 Cohérence des deux jeux de règles', () => {
  test('V4i les deux fichiers portent le même texte des fonctions vocabulaireManuelNeuf et vocabulaireRevise, la collection ne se supprime pas, et reste hors du joker', () => {
    const extraire = (t, nom) => (t.match(new RegExp(`function ${nom}\\(\\) \\{[\\s\\S]*?\\n    \\}`)) || [''])[0];
    const j = regles('firestore.rules');
    const p = regles('firestore.plateforme.rules');
    for (const nom of ['vocabulaireManuelNeuf', 'vocabulaireRevise']) {
      assert.ok(extraire(j, nom).length > 40, nom);
      assert.equal(extraire(j, nom), extraire(p, nom), `${nom} : même texte dans les deux fichiers`);
    }
    for (const t of [j, p]) {
      assert.match(t, /hasOnly\(\['statut', 'articleId', 'articleLibelle', 'note', 'conflit', 'modifieLe', 'modifiePar', 'via', 'valideLe', 'validePar', 'revoirLe', 'suggestionTraiteeLe'\]\)/);
      assert.match(t, /match \/(?:clients\/\{client\}\/)?devis_vocabulaire\/\{id\} \{[^}]*allow delete: if false;/s);
    }
    assert.match(j, /'crm_actions_lancements', 'devis_vocabulaire'(, 'documents_stockes')?(, 'devis_habitudes')?\]\)/);
    assert.match(j, /match \/devis_habitudes\/\{id\} \{\s+allow read: if compteAutorise\(\);\s+allow write: if false;/);
    assert.match(p, /function collectionDesDocuments\(collection\) \{\s+return collection in \['documents_stockes', 'devis_habitudes'\];/);
    assert.match(p, /match \/clients\/\{client\}\/devis_habitudes\/\{id\} \{[^}]*allow write: if false;/s);
    assert.match(p, /return collection in \['devis_articles', 'devis_vocabulaire'\];/);
  });
});
