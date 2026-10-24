// C9 : la couche de données du navigateur pour les devis (js/modules/devis/brouillon.js, donnees.js). Aucun écran.
// brouillon.js est pur (testé ici en vrai) ; donnees.js importe le SDK par une adresse web (vérifié par le texte, comme les autres modules).
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as B from '../js/modules/devis/brouillon.js';
import { MODULES_DECLARES } from '../js/os/registre.js';

const lire = (chemin) => readFileSync(fileURLToPath(new URL(`../${chemin}`, import.meta.url)), 'utf8');
const sansCommentaires = (t) => t.replace(/\/\/.*$/gm, '');
const MAINTENANT = new Date('2026-10-24T10:00:00Z');
const ctx = () => ({ nouvelId: (nom) => `${nom}-1`, maintenant: MAINTENANT, auteur: 'jerome@exemple.test', proprietaire: 'jerome@exemple.test' });
const REGLAGES = { modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 10, regimeTva: 'franchise', dureeValiditeJours: 30 };

describe('C9 brouillons : plans d’écriture du navigateur', () => {
  test('C9 créer un brouillon : version 1, sans numéro, racine = id, réglages du module repris ; c’est ce que les règles Firestore acceptent', () => {
    const plan = B.planCreerBrouillon({ affaireId: 'aff1', destinataires: [{ email: 'client@exemple.test' }] }, ctx(), REGLAGES);
    assert.deepEqual(plan.erreurs, {});
    assert.equal(plan.id, 'devis_devis-1');
    assert.equal(plan.ecritures.length, 1);
    const e = plan.ecritures[0];
    assert.equal(e.type, 'creer');
    assert.equal(e.collection, 'devis_devis');
    assert.equal(e.id, plan.id);
    assert.equal(e.donnees.statut, 'brouillon');
    assert.equal(e.donnees.numero, null);
    assert.equal(e.donnees.version, 1);
    assert.equal(e.donnees.racineId, plan.id);
    assert.equal('finaliseLe' in e.donnees, false);
    assert.equal('id' in e.donnees, false, 'l’identifiant est le nom du document, pas une donnée');
    assert.deepEqual([e.donnees.marge, e.donnees.tauxTvaDefaut, e.donnees.regimeTva, e.donnees.dureeValiditeJours], [25, 10, 'franchise', 30]);
    assert.equal(e.donnees.expireLe, '2026-11-23');
    assert.deepEqual(e.horodater, ['creeLe', 'modifieLe']);
    assert.equal(plan.devis.id, plan.id);
  });
  test('C9 modifier un brouillon : le patch passe tel quel, avec les marques de modification', () => {
    const plan = B.planModifierBrouillon({ id: 'd1', statut: 'brouillon' }, { marge: 30, sections: [] });
    assert.deepEqual(plan.erreurs, {});
    assert.deepEqual(plan.patch, { marge: 30, sections: [] });
    assert.equal(plan.ecritures[0].type, 'modifier');
    assert.equal(plan.ecritures[0].id, 'd1');
    assert.deepEqual(plan.ecritures[0].horodater, ['modifieLe']);
    assert.deepEqual(B.planModifierBrouillon({ id: 'd1', statut: 'brouillon' }, { marge: undefined }).ecritures, []);
  });
  test('C9 modifier un devis qui n’est plus un brouillon est refusé côté navigateur, sans écriture (pour chaque autre statut)', () => {
    for (const statut of ['en_attente_envoi', 'envoye', 'accepte', 'refuse', 'remplace', undefined]) {
      const plan = B.planModifierBrouillon({ id: 'd1', statut }, { marge: 30 });
      assert.equal(plan.erreurs.general, B.MESSAGE_PAS_BROUILLON, String(statut));
      assert.deepEqual(plan.ecritures, []);
    }
    assert.equal(B.planModifierBrouillon(null, { marge: 30 }).erreurs.general, B.MESSAGE_INTROUVABLE);
  });
  test('C9 un patch qui touche le numéro, la racine, la version, le statut, la finalisation ou l’archive est refusé', () => {
    for (const champ of ['numero', 'racineId', 'version', 'statut', 'finaliseLe', 'finalisation', 'totaux', 'archive', 'id']) {
      const plan = B.planModifierBrouillon({ id: 'd1', statut: 'brouillon' }, { marge: 30, [champ]: 'x' });
      assert.match(plan.erreurs.general, new RegExp(champ), champ);
      assert.deepEqual(plan.ecritures, [], champ);
    }
  });
});

describe('C9 donnees.js : ce que le navigateur lit, écrit et appelle', () => {
  const t = lire('js/modules/devis/donnees.js');
  const code = sansCommentaires(t);
  test('C9 un abonnement à la liste des devis, et les fonctions attendues sont exportées', () => {
    assert.match(code, /onSnapshot\(collection\(db, chemin\(B\.COLLECTION_DEVIS\)\)/);
    for (const nom of ['creerBrouillon', 'modifierBrouillon', 'finaliser', 'changerStatut', 'nouvelleVersion', 'archiver', 'estPretDevis', 'devisParId', 'versionsDe']) {
      assert.match(code, new RegExp(`export (?:async )?(?:function|const) ${nom}\\b`), nom);
    }
    assert.match(code, /import \* as B from '\.\/brouillon\.js'/);
  });
  test('C9 le navigateur n’écrit un devis que par les plans de brouillon (jamais setDoc/updateDoc/deleteDoc sur devis_devis), ne supprime rien et ne touche jamais le compteur', () => {
    assert.doesNotMatch(code, /deleteDoc|ecritureSupprimer|type: 'supprimer'/);
    assert.doesNotMatch(code, /devis_compteurs/);
    assert.equal((code.match(/setDoc\(/g) || []).length, 1, 'seul setDoc existant : les réglages du module');
    assert.doesNotMatch(code, /updateDoc|addDoc|writeBatch|runTransaction/);
  });
  test('C9 les quatre transitions appellent les quatre fonctions du serveur, et le client n’est envoyé que chez un client (jamais chez Jérôme)', () => {
    for (const [nom, fonction] of [['finaliser', 'devisFinaliser'], ['changerStatut', 'devisChangerStatut'], ['nouvelleVersion', 'devisNouvelleVersion'], ['archiver', 'devisArchiver']]) {
      assert.match(code, new RegExp(`${nom}: '${fonction}'`), fonction);
    }
    assert.match(code, /const client = base \? base\.split\('\/'\)\[1\] : undefined;/);
    assert.match(code, /httpsCallable\(fonctions\(\), FONCTIONS\[operation\]\)\(client \? \{ client, \.\.\.demande \} : demande\)/);
  });
  test('C9 le texte des erreurs du serveur est rendu tel quel quand il est lisible, sinon un message qui dit quoi faire', () => {
    assert.match(code, /CODES_LISIBLES = \['permission-denied', 'invalid-argument', 'failed-precondition', 'not-found', 'unauthenticated'\]/);
    assert.match(t, /Vérifie ta connexion internet, puis réessaie/);
  });
  test('C9 le mot « CRM » n’apparaît dans aucun texte affiché par ces fichiers', () => {
    for (const f of ['js/modules/devis/donnees.js', 'js/modules/devis/brouillon.js']) {
      const visible = lire(f).split('\n').filter((l) => !/^\s*(\/\/|import )/.test(l)).join('\n').replace(/\/\/.*$/gm, '').replace(/\bCRM\.[a-zA-Z]+/g, '').replace(/\.\.\/crm\//g, '');
      assert.doesNotMatch(visible, /CRM/, f);
    }
  });
});

describe('C9 registre : devis_devis est déclarée, pas devis_compteurs', () => {
  const devis = MODULES_DECLARES.find((m) => m.id === 'devis');
  test('C9 le module devis déclare devis_devis (suivie par l’export complet), jamais devis_compteurs', () => {
    assert.deepEqual(devis.collections, ['devis_articles', 'devis_parametres', 'devis_devis']);
    assert.match(lire('js/modules/crm/donnees.js'), /'devis_articles', 'devis_parametres', 'devis_devis',/);
    assert.doesNotMatch(sansCommentaires(lire('js/modules/crm/donnees.js')), /devis_compteurs/);
    assert.doesNotMatch(sansCommentaires(lire('js/os/registre.js')), /devis_compteurs/);
  });
  test('C9 le journal sait nommer un devis', () => {
    assert.match(lire('js/modules/crm/logique.js'), /devis_devis: \['devis', 'devis'\]/);
  });
});
