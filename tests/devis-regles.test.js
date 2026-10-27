// C1 : règles Firestore des devis (devis_devis, devis_compteurs, et le journal crm_actions_lancements), dans les DEUX jeux de règles (base de Jérôme et plateforme clients).
// Émulateur, projets de démonstration. Cas : créer un brouillon OK ; créer avec numéro refusé ; modifier un brouillon OK ; modifier un finalisé refusé ;
// passer un brouillon à finalisé depuis le navigateur refusé ; supprimer refusé ; un autre espace refusé ; compteurs refusés.
import assert from 'node:assert/strict';
import { test, describe, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, collection, getDoc, getDocs, setDoc, updateDoc, deleteDoc, setLogLevel } from 'firebase/firestore';

setLogLevel('error');

const [hote, port] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
const regles = (nom) => readFileSync(fileURLToPath(new URL(`../${nom}`, import.meta.url)), 'utf8');

const JEROME = 'jerome.chevalier@gmail.com';
const ALICE = 'alice@exemple.test'; // éditrice chez a
const LEA = 'lea@exemple.test'; // lectrice chez a
const BOB = 'bob@exemple.test'; // éditeur chez b seulement

const brouillon = (id, extra = {}) => ({ racineId: id, version: 1, statut: 'brouillon', numero: null, sections: [], archive: false, ...extra });
const finalise = (id, extra = {}) => ({ racineId: id, version: 1, statut: 'en_attente_envoi', numero: 'DEV-2026-10-24-001', sections: [], archive: false, ...extra });

/**
 * Les mêmes cas pour les deux jeux de règles. `ref(db, id)` : où vit le devis ; `refCompteur(db)` : où vit le compteur ;
 * `ecrivain` : qui peut écrire ; `lecteur` : qui ne peut que lire (null = personne de tel dans ce jeu) ; `autre` : un utilisateur d'un autre espace.
 */
function lesCas({ nom, projet, fichier, preparer, ref, refCompteur, refLancement, refVoisine, ecrivain, lecteur, autre }) {
  describe(`C1 Règles des devis : ${nom}`, () => {
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
        await setDoc(ref(db, 'bro'), brouillon('bro', { titre: 'avant' }));
        await setDoc(ref(db, 'fin'), finalise('fin', { titre: 'avant' }));
        await setDoc(refCompteur(db), { valeur: 5 });
        await setDoc(refLancement(db, 'dernier-fin'), { action: 'devis.preparerEmail', devisId: 'fin', demandeId: 'dem_1', statut: 'demandee' });
      });
    });
    const db = (email) => env.authenticatedContext(`uid-${email}`, { email, email_verified: true }).firestore();

    test('C1a créer un brouillon neuf (sans numéro, version 1) est permis, et les membres le lisent', async () => {
      await assertSucceeds(setDoc(ref(db(ecrivain), 'nouveau'), brouillon('nouveau')));
      await assertSucceeds(getDoc(ref(db(ecrivain), 'nouveau')));
      if (lecteur) await assertSucceeds(getDoc(ref(db(lecteur), 'fin')));
    });
    test('C1b créer un devis avec un numéro, finalisé, daté de finalisation, de mauvaise version ou de mauvaise racine est refusé', async () => {
      const d = db(ecrivain);
      await assertFails(setDoc(ref(d, 'n1'), brouillon('n1', { numero: 'DEV-2026-10-24-009' })));
      await assertFails(setDoc(ref(d, 'n2'), finalise('n2', { numero: null })));
      await assertFails(setDoc(ref(d, 'n3'), brouillon('n3', { finaliseLe: new Date() })));
      await assertFails(setDoc(ref(d, 'n4'), brouillon('n4', { version: 2 })));
      await assertFails(setDoc(ref(d, 'n5'), brouillon('n5', { racineId: 'bro' })));
    });
    test('C1c modifier un brouillon (contenu, archive) reste permis', async () => {
      const d = db(ecrivain);
      await assertSucceeds(updateDoc(ref(d, 'bro'), { titre: 'après', sections: [{ id: 's1', lignes: [] }] }));
      await assertSucceeds(setDoc(ref(d, 'bro'), brouillon('bro', { titre: 'remplacé en entier' })));
    });
    test('C1d modifier un devis finalisé est refusé, même un champ anodin', async () => {
      const d = db(ecrivain);
      await assertFails(updateDoc(ref(d, 'fin'), { titre: 'après' }));
      await assertFails(updateDoc(ref(d, 'fin'), { statut: 'brouillon' })); // le « retour en brouillon » est refusé aussi
      await assertFails(setDoc(ref(d, 'fin'), brouillon('fin')));
    });
    test('C1e passer un brouillon à finalisé (statut, numéro, version, racine ou date de finalisation) depuis le navigateur est refusé', async () => {
      const d = db(ecrivain);
      await assertFails(updateDoc(ref(d, 'bro'), { statut: 'en_attente_envoi' }));
      await assertFails(updateDoc(ref(d, 'bro'), { statut: 'en_attente_envoi', numero: 'DEV-2026-10-24-001', finaliseLe: new Date() }));
      await assertFails(updateDoc(ref(d, 'bro'), { numero: 'DEV-2026-10-24-001' }));
      await assertFails(updateDoc(ref(d, 'bro'), { version: 2 }));
      await assertFails(updateDoc(ref(d, 'bro'), { racineId: 'autre' }));
      await assertFails(updateDoc(ref(d, 'bro'), { finaliseLe: new Date() }));
    });
    test('C1f supprimer un devis est refusé (brouillon comme finalisé)', async () => {
      const d = db(ecrivain);
      await assertFails(deleteDoc(ref(d, 'bro')));
      await assertFails(deleteDoc(ref(d, 'fin')));
    });
    test('C1g un autre espace n’a aucun accès aux devis (lecture, création, modification), et un lecteur ne peut qu’en lire', async () => {
      const d = db(autre);
      await assertFails(getDoc(ref(d, 'bro')));
      await assertFails(setDoc(ref(d, 'nouveau'), brouillon('nouveau')));
      await assertFails(updateDoc(ref(d, 'bro'), { titre: 'pirate' }));
      if (lecteur) {
        await assertFails(setDoc(ref(db(lecteur), 'nouveau'), brouillon('nouveau')));
        await assertFails(updateDoc(ref(db(lecteur), 'bro'), { titre: 'lecteur' }));
      }
    });
    test('C1h le compteur de numéros est fermé : ni lecture ni écriture depuis un navigateur, même par un éditeur', async () => {
      const d = db(ecrivain);
      await assertFails(getDoc(refCompteur(d)));
      await assertFails(setDoc(refCompteur(d), { valeur: 99 }));
      await assertFails(updateDoc(refCompteur(d), { valeur: 99 }));
      await assertFails(deleteDoc(refCompteur(d)));
      await assertFails(setDoc(refCompteur(db(autre)), { valeur: 1 }));
    });
    test('C1j le journal des demandes « Préparer l’e-mail » (crm_actions_lancements) est fermé aux navigateurs : ni lecture, ni liste, ni écriture, pour personne', async () => {
      for (const qui of [ecrivain, lecteur, autre].filter(Boolean)) {
        const d = db(qui);
        await assertFails(getDoc(refLancement(d, 'dernier-fin')));
        await assertFails(getDocs(collection(d, refLancement(d, 'x').parent.path)));
        await assertFails(setDoc(refLancement(d, 'dernier-fin'), { action: 'devis.preparerEmail', devisId: 'fin', statut: 'echec' })); // truquer l'anti-doublon
        await assertFails(setDoc(refLancement(d, 'nouvelle'), { action: 'devis.preparerEmail', devisId: 'fin', statut: 'ok' }));
        await assertFails(updateDoc(refLancement(d, 'dernier-fin'), { statut: 'ok' }));
        await assertFails(deleteDoc(refLancement(d, 'dernier-fin')));
      }
      const anonyme = env.unauthenticatedContext().firestore();
      await assertFails(getDoc(refLancement(anonyme, 'dernier-fin')));
      await assertFails(setDoc(refLancement(anonyme, 'x'), { statut: 'ok' }));
    });
    test('C1k les collections voisines ne changent pas : l’écrivain lit et écrit toujours une collection ordinaire, le lecteur la lit', async () => {
      await assertSucceeds(setDoc(refVoisine(db(ecrivain), 'p1'), { nom: 'Test' }));
      await assertSucceeds(getDoc(refVoisine(db(ecrivain), 'p1')));
      if (lecteur) {
        await assertSucceeds(getDoc(refVoisine(db(lecteur), 'p1')));
        await assertFails(setDoc(refVoisine(db(lecteur), 'p2'), { nom: 'Test' }));
      }
      await assertFails(getDoc(refVoisine(db(autre), 'p1')));
    });
  });
}

lesCas({
  nom: 'base de Jérôme (firestore.rules)',
  projet: 'demo-chevalier-devis-os',
  fichier: 'firestore.rules',
  preparer: async () => {},
  ref: (db, id) => doc(db, 'devis_devis', id),
  refCompteur: (db) => doc(db, 'devis_compteurs', 'global'),
  refLancement: (db, id) => doc(db, 'crm_actions_lancements', id),
  refVoisine: (db, id) => doc(db, 'crm_personnes', id),
  ecrivain: JEROME,
  lecteur: null,
  autre: 'inconnu@exemple.test', // un compte qui n'est pas dans la liste des deux comptes autorisés
});

lesCas({
  nom: 'plateforme clients (firestore.plateforme.rules)',
  projet: 'demo-chevalier-devis-plateforme',
  fichier: 'firestore.plateforme.rules',
  preparer: async (db) => {
    await setDoc(doc(db, 'clients', 'a', 'membres', ALICE), { role: 'editeur' });
    await setDoc(doc(db, 'clients', 'a', 'membres', LEA), { role: 'lecteur' });
    await setDoc(doc(db, 'clients', 'b', 'membres', BOB), { role: 'editeur' });
  },
  ref: (db, id) => doc(db, 'clients', 'a', 'devis_devis', id),
  refCompteur: (db) => doc(db, 'clients', 'a', 'devis_compteurs', 'global'),
  refLancement: (db, id) => doc(db, 'clients', 'a', 'crm_actions_lancements', id),
  refVoisine: (db, id) => doc(db, 'clients', 'a', 'crm_personnes', id),
  ecrivain: ALICE,
  lecteur: LEA,
  autre: BOB,
});

describe('C1 Cohérence des deux jeux de règles', () => {
  test('C1i les deux fichiers de règles disent la même chose des devis (mêmes champs gardés, compteur fermé, pas de suppression)', () => {
    for (const f of ['firestore.rules', 'firestore.plateforme.rules']) {
      const t = regles(f);
      assert.match(t, /hasAny\(\['numero', 'racineId', 'version', 'statut', 'finaliseLe'\]\)/, f);
      assert.match(t, /devis_compteurs/, f);
      if (f === 'firestore.plateforme.rules') assert.match(t, /return collection in \['devis_devis', 'devis_compteurs', 'crm_actions_lancements'\];/, f); // hors de la règle générale d'écriture
      assert.match(t, /match \/(?:clients\/\{client\}\/)?crm_actions_lancements\/\{id\} \{\s+allow read, write: if false;/, f);
      assert.match(t, /match \/(?:clients\/\{client\}\/)?devis_devis\/\{id\} \{[^}]*allow delete: if false;/s, f);
    }
  });
});
