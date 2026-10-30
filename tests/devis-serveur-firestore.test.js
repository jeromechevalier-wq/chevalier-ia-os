// C2, C3, C5, C6 sur l'ÉMULATEUR Firestore (SDK d'administration réel : vraies transactions, Timestamps) : les numéros restent uniques même
// quand dix finalisations partent en même temps, et les dates des devis restent des dates (Timestamp) après chaque transition.
// Lancé avec les émulateurs (npm run test:module devis) ; ignoré si l'émulateur n'est pas démarré. Projet de démonstration, jamais de données réelles.
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { initializeApp, deleteApp } from '../functions/node_modules/firebase-admin/lib/esm/app/index.js';
import { getFirestore, Timestamp } from '../functions/node_modules/firebase-admin/lib/esm/firestore/index.js';
import { creerAccesFirestore, avecBase, COLLECTIONS as C } from '../functions/src/coeur/donnees.js';
import * as S from '../functions/src/coeur/devis.js';
import { modifierLignesDevis, annulerDerniereModificationDevis, creerDevisDepuisModele } from '../functions/src/coeur/metier.js';
import { restaurerOperation } from '../functions/src/coeur/restaurer.js';
import { executerEcritures } from '../functions/src/coeur/ecriture.js';
import { nouveauDevis } from '../functions/partage/devis.js';

const emulateur = process.env.FIRESTORE_EMULATOR_HOST;
// Projet propre à ce fichier : les fichiers de test tournent en parallèle sur le même émulateur et ne doivent pas se vider l'un l'autre.
const PROJET = 'demo-chevalier-devis-serveur';
const ACTEUR = 'jerome.chevalier@gmail.com';
const MAINTENANT = new Date('2026-10-24T10:00:00Z');
const ctx = () => ({ acteur: ACTEUR, via: 'ecran', maintenant: MAINTENANT });

/** Un brouillon complet, avec des dates en Timestamp comme Firestore les rend (et non en Date). */
function brouillon(id, extra = {}) {
  const d = nouveauDevis({ destinataires: [{ email: 'client@exemple.test' }], affaireId: 'aff1' }, { id, maintenant: MAINTENANT, auteur: ACTEUR }, { marge: 20, margeDevis: 20 });
  return { ...d, creeLe: Timestamp.fromDate(MAINTENANT), sections: [{ id: `s-${id}`, titre: 'Travaux', lignes: [{ id: `l-${id}`, libelle: 'Article', unite: 'u', quantite: 2, prixAchat: 10 }] }], ...extra };
}

describe('Transitions des devis sur Firestore (émulateur)', { skip: emulateur ? false : 'émulateur Firestore non démarré (lancer npm run test:module devis)' }, () => {
  let app;
  let db;
  let donnees;
  const brut = async (nom, id) => { const d = await db.collection(nom).doc(id).get(); return d.exists ? d.data() : null; };
  const poser = (id, extra) => { const { id: _i, ...reste } = brouillon(id, extra); return db.collection(C.devis).doc(id).set(reste); };

  before(() => {
    assert.ok(PROJET.startsWith('demo-'), 'projet de démonstration uniquement');
    app = initializeApp({ projectId: PROJET }, 'test-devis-serveur');
    db = getFirestore(app);
    donnees = creerAccesFirestore({ db });
  });
  after(async () => { await deleteApp(app); });
  beforeEach(async () => {
    for (const nom of [C.devis, C.devisCompteurs, C.devisParametres, C.audit, C.auditAvant, C.affaires, 'clients/a/crm_affaires', 'clients/a/devis_devis', 'clients/a/devis_compteurs', 'clients/a/crm_audit', 'clients/a/crm_audit_avant']) {
      for (const d of (await db.collection(nom).get()).docs) await d.ref.delete();
    }
  });

  test('C2 dix finalisations simultanées reçoivent dix numéros différents, et le compteur vaut 10', async () => {
    const ids = Array.from({ length: 10 }, (_, i) => `d${i}`);
    await Promise.all(ids.map((id) => poser(id)));
    const rs = await Promise.all(ids.map((id) => S.finaliser({ donnees, ctx: ctx(), devisId: id })));
    const numeros = rs.map((r) => r.numero).sort();
    assert.equal(new Set(numeros).size, 10);
    assert.deepEqual(numeros, ids.map((_, i) => `DEV-2026-10-24-${String(i + 1).padStart(3, '0')}`));
    assert.equal((await brut(C.devisCompteurs, 'global')).valeur, 10);
    for (const id of ids) assert.equal((await brut(C.devis, id)).statut, 'en_attente_envoi');
  });

  test('C2 les dates déjà dans le devis restent des Timestamp après la finalisation, et le journal est écrit dans la même transaction', async () => {
    await poser('d1');
    const r = await S.finaliser({ donnees, ctx: ctx(), devisId: 'd1' });
    const d = await brut(C.devis, 'd1');
    assert.ok(d.creeLe instanceof Timestamp, 'creeLe reste une date');
    assert.ok(d.finaliseLe instanceof Timestamp);
    assert.equal(d.numero, r.numero);
    const lignes = (await db.collection(C.audit).get()).docs.map((x) => x.data());
    assert.equal(lignes.length, 1);
    assert.equal(lignes[0].outil, 'devisFinaliser');
    assert.equal(lignes[0].operationId, r.operationId);
  });

  test('C3 la version 2 garde le numéro, le compteur ne bouge pas, la version 1 passe à Remplacé (dates intactes)', async () => {
    await poser('v1');
    const r1 = await S.finaliser({ donnees, ctx: ctx(), devisId: 'v1' });
    await S.changerStatut({ donnees, ctx: ctx(), devisId: 'v1', action: 'marquer_envoye' });
    const nv = await S.nouvelleVersion({ donnees, ctx: ctx(), devisId: 'v1' });
    const v2 = await brut(C.devis, nv.devis.id);
    assert.equal(v2.numero, r1.numero);
    assert.ok(v2.creeLe instanceof Timestamp || v2.creeLe instanceof Date || v2.creeLe?.toDate, 'la date de création de v2 est une vraie date');
    const r2 = await S.finaliser({ donnees, ctx: ctx(), devisId: nv.devis.id });
    assert.equal(r2.numero, r1.numero);
    assert.equal((await brut(C.devisCompteurs, 'global')).valeur, 1);
    const v1 = await brut(C.devis, 'v1');
    assert.equal(v1.statut, 'remplace');
    assert.ok(v1.creeLe instanceof Timestamp && v1.envoyeLe instanceof Timestamp && v1.finaliseLe instanceof Timestamp);
  });

  test('C4 un devis invalide : rien n’est écrit (ni compteur, ni journal)', async () => {
    const { id: _i, ...reste } = nouveauDevis({}, { id: 'vide', maintenant: MAINTENANT, auteur: ACTEUR }, {});
    await db.collection(C.devis).doc('vide').set({ ...reste, creeLe: Timestamp.fromDate(MAINTENANT) });
    const r = await S.finaliser({ donnees, ctx: ctx(), devisId: 'vide' });
    assert.equal(r.ok, false);
    assert.equal(await brut(C.devisCompteurs, 'global'), null);
    assert.equal((await db.collection(C.audit).get()).size, 0);
    assert.equal((await brut(C.devis, 'vide')).statut, 'brouillon');
  });

  test('C5 une transition interdite est refusée sans écriture ; une permise écrit la date en Timestamp', async () => {
    await poser('b1', { statut: 'brouillon', numero: null });
    await assert.rejects(() => S.changerStatut({ donnees, ctx: ctx(), devisId: 'b1', action: 'accepter' }), (e) => e.code === 'transition_interdite');
    assert.equal((await brut(C.devis, 'b1')).statut, 'brouillon');
    assert.equal((await db.collection(C.audit).get()).size, 0);
    await poser('d1', { statut: 'en_attente_envoi', numero: 'DEV-2026-10-01-001' });
    await S.changerStatut({ donnees, ctx: ctx(), devisId: 'd1', action: 'marquer_envoye' });
    const d = await brut(C.devis, 'd1');
    assert.equal(d.statut, 'envoye');
    assert.ok(d.envoyeLe instanceof Timestamp);
    // 5 signé aussi depuis « Finalisé » (30/10/2026) : statut et date écrits, comme depuis « Envoyé »
    await poser('d2', { statut: 'en_attente_envoi', numero: 'DEV-2026-10-01-002' });
    await S.changerStatut({ donnees, ctx: ctx(), devisId: 'd2', action: 'accepter' });
    const s = await brut(C.devis, 'd2');
    assert.equal(s.statut, 'accepte');
    assert.ok(s.accepteLe instanceof Timestamp);
  });

  test('C6 deux demandes simultanées de nouvelle version : une seule réussit', async () => {
    await poser('v1', { statut: 'envoye', numero: 'DEV-2026-10-01-001' });
    const rs = await Promise.allSettled([S.nouvelleVersion({ donnees, ctx: ctx(), devisId: 'v1' }), S.nouvelleVersion({ donnees, ctx: ctx(), devisId: 'v1' })]);
    assert.equal(rs.filter((r) => r.status === 'fulfilled').length, 1);
    const tous = (await db.collection(C.devis).get()).docs.map((x) => x.data());
    assert.equal(tous.filter((x) => x.statut === 'brouillon').length, 1);
  });

  test('C7 dans l’espace d’un client (clients/a), le numéro et le compteur vivent sous clients/a ; l’espace de Jérôme n’est pas touché', async () => {
    const { id: _i, ...reste } = brouillon('da');
    await db.doc('clients/a/devis_devis/da').set(reste);
    const dansA = avecBase(donnees, 'clients/a');
    const r = await S.finaliser({ donnees: dansA, ctx: { acteur: 'alice@exemple.test', via: 'ecran', maintenant: MAINTENANT }, devisId: 'da' });
    assert.equal(r.numero, 'DEV-2026-10-24-001');
    assert.equal((await db.doc('clients/a/devis_compteurs/global').get()).data().valeur, 1);
    assert.equal(await brut(C.devisCompteurs, 'global'), null);
    assert.equal((await db.collection('clients/a/crm_audit').get()).size, 1);
    assert.equal((await db.collection(C.audit).get()).size, 0);
  });

  test('C8 le montant de l’affaire (somme HT des devis acceptés) est écrit dans la transaction : deux acceptations simultanées donnent la somme, le montant estimé reste intact', async () => {
    await db.collection(C.affaires).doc('aff1').set({ titre: 'Rénovation', montant: 1500 });
    const gros = [{ id: 's', titre: 'Travaux', lignes: [{ id: 'l', libelle: 'Article', unite: 'u', quantite: 100, prixAchat: 10 }] }]; // 100 x 12 = 1 200 € HT
    await poser('d1', { statut: 'envoye', numero: 'DEV-2026-10-01-001', sections: gros, totaux: { ht: 1200, ttc: 1440 } });
    await poser('d2', { statut: 'envoye', numero: 'DEV-2026-10-01-002', totaux: { ht: 600, ttc: 720 } });
    await Promise.all([S.changerStatut({ donnees, ctx: ctx(), devisId: 'd1', action: 'accepter' }), S.changerStatut({ donnees, ctx: ctx(), devisId: 'd2', action: 'accepter' })]);
    const affaire = await brut(C.affaires, 'aff1');
    assert.equal(affaire.montantDevisHt, 1800);
    assert.equal(affaire.montant, 1500);
    await S.archiver({ donnees, ctx: ctx(), devisId: 'd1', archive: true });
    assert.equal((await brut(C.affaires, 'aff1')).montantDevisHt, 600);
    await S.archiver({ donnees, ctx: ctx(), devisId: 'd2', archive: true });
    assert.equal((await brut(C.affaires, 'aff1')).montantDevisHt, null);
    assert.equal((await brut(C.affaires, 'aff1')).montant, 1500);
    assert.ok((await db.collection(C.audit).get()).docs.some((x) => x.data().collection === C.affaires), 'le journal garde les écritures de l’affaire');
  });

  test('C8 finaliser un brouillon : l’affaire reçoit le montant « proposé » (HT, nature, détail) dans la même transaction, le montant saisi reste intact', async () => {
    await db.collection(C.affaires).doc('aff1').set({ titre: 'Rénovation', montant: 1500 });
    await poser('d1'); // 2 x (10 € + 20 %) = 24 € HT
    const r = await S.finaliser({ donnees, ctx: ctx(), devisId: 'd1' });
    const affaire = await brut(C.affaires, 'aff1');
    assert.equal(affaire.montantDevisHt, 24);
    assert.equal(affaire.montantDevisNature, 'propose');
    assert.deepEqual(affaire.montantDevisDetail, [{ numero: r.numero, version: 1, ht: 24, compte: true }]);
    assert.equal(affaire.montant, 1500);
  });

  test('C8 sur le vrai Firestore, un changement qui ne modifie pas le montant (marquer envoyé) n’écrit ni l’affaire ni une ligne de journal pour elle', async () => {
    await db.collection(C.affaires).doc('aff1').set({ titre: 'Rénovation', montant: 1500 });
    await poser('d1');
    await S.finaliser({ donnees, ctx: ctx(), devisId: 'd1' });
    const lignesAffaire = async () => (await db.collection(C.audit).get()).docs.filter((x) => x.data().collection === C.affaires).length;
    const avant = await lignesAffaire();
    assert.equal(avant, 1, 'la finalisation a écrit l’affaire une fois');
    await S.changerStatut({ donnees, ctx: ctx(), devisId: 'd1', action: 'marquer_envoye' });
    assert.equal(await lignesAffaire(), avant, 'Firestore range les champs d’une map par nom : la comparaison du détail doit quand même voir « identique »');
  });

  test('C8 recalcul général sur le vrai Firestore : un ancien devis signé est compté, le montant saisi reste, un second passage ne trouve plus rien', async () => {
    await db.collection(C.affaires).doc('aff1').set({ titre: 'Rénovation', montant: 1500 });
    await poser('v1', { statut: 'accepte', numero: 'DEV-2026-09-01-001', finaliseLe: Timestamp.fromDate(new Date('2026-09-01T10:00:00Z')), totaux: { ht: 1200, ttc: 1440 } });
    const apercu = await S.recalculerMontantsAffaires({ donnees, ctx: ctx(), appliquer: false });
    assert.equal(apercu.total, 1);
    assert.equal((await brut(C.affaires, 'aff1')).montantDevisHt, undefined, 'l’aperçu n’écrit rien');
    const r = await S.recalculerMontantsAffaires({ donnees, ctx: ctx(), appliquer: true });
    assert.equal(r.operations.length, 1);
    const a = await brut(C.affaires, 'aff1');
    assert.deepEqual([a.montant, a.montantDevisHt, a.montantDevisNature], [1500, 1200, 'accepte']);
    assert.equal((await S.recalculerMontantsAffaires({ donnees, ctx: ctx(), appliquer: true })).total, 0);
  });

  test('C8 dans l’espace d’un client, seule l’affaire du client reçoit le montant ; celle de Jérôme n’est pas touchée', async () => {
    await db.collection(C.affaires).doc('aff1').set({ titre: 'Chez Jérôme', montant: 10 });
    await db.doc('clients/a/crm_affaires/aff1').set({ titre: 'Chez le client', montant: 20 });
    const { id: _i, ...reste } = brouillon('da', { statut: 'envoye', numero: 'DEV-2026-10-01-001', totaux: { ht: 600, ttc: 720 } });
    await db.doc('clients/a/devis_devis/da').set(reste);
    await S.changerStatut({ donnees: avecBase(donnees, 'clients/a'), ctx: { acteur: 'alice@exemple.test', via: 'ecran', maintenant: MAINTENANT }, devisId: 'da', action: 'accepter' });
    assert.equal((await db.doc('clients/a/crm_affaires/aff1').get()).data().montantDevisHt, 600);
    assert.equal((await brut(C.affaires, 'aff1')).montantDevisHt, undefined);
  });
  // modifier_lignes_devis (PR A2) : le devis est lu DANS la transaction, il n'y a plus de fenêtre entre la lecture et l'écriture.
  test('C9 dix modifier_lignes_devis simultanés sur dix lignes différentes : aucune modification perdue, dix lignes de journal', async () => {
    const lignes = Array.from({ length: 10 }, (_, i) => ({ id: `l${i}`, libelle: `Article ${i}`, unite: 'u', quantite: 1, prixAchat: 10 }));
    await poser('dc', { sections: [{ id: 's1', titre: 'Travaux', lignes }] });
    const c = { donnees, acteur: ACTEUR, maintenant: MAINTENANT, noterOperation: () => {} };
    const rs = await Promise.all(lignes.map((l, i) => modifierLignesDevis(c, { id: 'dc', operations: [{ action: 'modifier', ligne: `1.${i + 1}`, attendu: l.libelle, quantite: i + 2 }] })));
    assert.equal(new Set(rs.map((r) => r.operationId)).size, 10);
    assert.deepEqual((await brut(C.devis, 'dc')).sections[0].lignes.map((l) => l.quantite), lignes.map((_, i) => i + 2));
    assert.equal((await db.collection(C.audit).get()).docs.filter((d) => d.data().outil === 'modifier_lignes_devis').length, 10);
  });

  test('C9 deux suppressions de la même ligne : la seconde relit le devis à jour dans sa transaction et refuse (attendu), au lieu d’écraser', async () => {
    await poser('dd', { sections: [{ id: 's1', titre: 'Travaux', lignes: [{ id: 'la', libelle: 'Prise double', unite: 'u', quantite: 1, prixAchat: 10 }, { id: 'lb', libelle: 'Plinthe', unite: 'u', quantite: 1, prixAchat: 10 }] }] });
    const c = { donnees, acteur: ACTEUR, maintenant: MAINTENANT, noterOperation: () => {} };
    const resultats = await Promise.allSettled([
      modifierLignesDevis(c, { id: 'dd', operations: [{ action: 'supprimer', ligne: '1.1', attendu: 'Prise double' }] }),
      modifierLignesDevis(c, { id: 'dd', operations: [{ action: 'supprimer', ligne: '1.1', attendu: 'Prise double' }] }),
    ]);
    assert.equal(resultats.filter((r) => r.status === 'fulfilled').length, 1);
    assert.match(String(resultats.find((r) => r.status === 'rejected').reason.message), /(est maintenant|n'a pas de ligne)/);
    assert.deepEqual((await brut(C.devis, 'dd')).sections[0].lignes.map((l) => l.id), ['lb'], 'la Plinthe n’est pas supprimée par le second appel');
  });

  // annuler_derniere_modification_devis (PR A3) : vraies transactions, Timestamps dans le journal et les copies « avant ».
  test('C10 annuler la dernière modification : la quantité revient, l’annulation est au journal sous son nom, la deuxième annulation répond « déjà annulé »', async () => {
    await poser('de', { sections: [{ id: 's1', titre: 'Travaux', lignes: [{ id: 'la', libelle: 'Prise double', unite: 'u', quantite: 3, prixAchat: 10 }] }] });
    const contexte = (t) => ({ acteur: ACTEUR, jeton: 'essai', via: 'mcp', maintenant: new Date(MAINTENANT.getTime() + t) });
    const cDe = (t) => {
      const ctxMcp = contexte(t);
      return { donnees, acteur: ACTEUR, maintenant: ctxMcp.maintenant, noterOperation: () => {}, restaurer: (a) => restaurerOperation({ donnees, ctx: ctxMcp, ...a }) };
    };
    await modifierLignesDevis(cDe(1000), { id: 'de', operations: [{ action: 'modifier', ligne: '1.1', attendu: 'Prise double', quantite: 5 }] });
    assert.equal((await brut(C.devis, 'de')).sections[0].lignes[0].quantite, 5);
    const r = await annulerDerniereModificationDevis(cDe(2000), { id: 'de' });
    assert.match(r.phrase, /^J’ai remis la ligne 1\.1 à 3 u\.$/);
    assert.equal((await brut(C.devis, 'de')).sections[0].lignes[0].quantite, 3);
    const lignes = (await db.collection(C.audit).get()).docs.map((d) => d.data()).filter((l) => l.docId === 'de');
    assert.deepEqual(lignes.sort((a, b) => a.date.toMillis() - b.date.toMillis()).map((l) => [l.outil, l.action]), [['modifier_lignes_devis', 'modifier'], ['annuler_derniere_modification_devis', 'restaurer']]);
    await assert.rejects(annulerDerniereModificationDevis(cDe(3000), { id: 'de' }), /déjà annulé/);
    assert.equal((await brut(C.devis, 'de')).sections[0].lignes[0].quantite, 3);
  });

  // creer_devis_depuis_modele : création sur le vrai émulateur ; le journal dit « creer » (Timestamps) et l'annulation de ce devis neuf est refusée avec le bon message.
  test('C11 un devis créé depuis un modèle : le modèle ne bouge pas, le journal dit « creer », annuler_derniere_modification_devis répond « rien à annuler »', async () => {
    await poser('dm', { sections: [{ id: 's1', titre: 'Travaux', lignes: [{ id: 'la', libelle: 'Prise double', unite: 'u', quantite: 3, prixAchat: 8, articleId: 'prise' }, { id: 'lb', libelle: 'Ligne libre', unite: 'u', quantite: 1, prixAchat: 5 }] }] });
    await db.collection(C.devisArticles).doc('prise').set({ code: 'PRI', libelle: 'Prise double', unite: 'u', prixAchat: 10, tauxTva: 20, actif: true });
    const avant = await brut(C.devis, 'dm');
    const ctxMcp = { acteur: ACTEUR, jeton: 'essai', via: 'mcp', maintenant: new Date(MAINTENANT.getTime() + 1000) };
    const c = { donnees, acteur: ACTEUR, maintenant: ctxMcp.maintenant, noterOperation: () => {}, ecrire: ({ operations, parametres }) => executerEcritures({ donnees, ctx: ctxMcp, outil: 'creer_devis_depuis_modele', parametres, operations }), restaurer: (a) => restaurerOperation({ donnees, ctx: ctxMcp, ...a }) };
    const r = await creerDevisDepuisModele(c, { modeleId: 'dm' });
    assert.deepEqual(r.aReviser.map((x) => x.motif), ['ligne_libre']);
    assert.deepEqual(await brut(C.devis, 'dm'), avant, 'le modèle n’est pas modifié');
    const nouveau = await brut(C.devis, r.id);
    assert.deepEqual(nouveau.sections[0].lignes.map((l) => [l.libelle, l.quantite, l.prixAchat]), [['Prise double', 3, 10]]);
    const lignes = (await db.collection(C.audit).get()).docs.map((d) => d.data()).filter((l) => l.docId === r.id);
    assert.deepEqual(lignes.map((l) => [l.outil, l.action]), [['creer_devis_depuis_modele', 'creer']]);
    await assert.rejects(annulerDerniereModificationDevis({ ...c, maintenant: new Date(MAINTENANT.getTime() + 2000) }, { id: r.id }), /vient d’être créé, rien à annuler : utilise supprimer_devis/);
  });
});
