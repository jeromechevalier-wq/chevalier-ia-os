// Audit des actions de l'écran (04/10/2026) : chaque action écrit, dans le même lot que les données, une ligne dans crm_audit et une copie
// dans crm_audit_avant, au même schéma que le serveur MCP. Données fictives en mémoire. Le lot de l'écran est simulé ici ; le vrai (Firestore,
// règles) est couvert par les tests de règles et par les parcours du navigateur.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../functions/partage/logique.js';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { restaurerOperation } from '../functions/src/coeur/restaurer.js';
import * as lecture from '../functions/src/coeur/lecture.js';

const JEROME = 'jerome.chevalier@gmail.com';
const T0 = new Date('2026-10-05T10:00:00Z');

/** Simule le lot de l'écran : applique les écritures (données, ligne d'audit, copie) comme donnees.js, `horodater` -> heure, `signer` -> compte. */
function ecran(collections) {
  let n = 0;
  const nouvelId = (nom) => `${nom.replace(/^crm_/, '').slice(0, 5)}${++n}`;
  const lire = (nom, id) => collections[nom]?.find((d) => d.id === id) ?? null;
  const donnees = creerAccesMemoire(collections);
  const executer = async (ecritures, outil, maintenant) => {
    const avants = {};
    for (const e of ecritures.filter((x) => x.type !== 'creer')) { const d = lire(e.collection, e.id); avants[`${e.collection}/${e.id}`] = d ? (({ id, ...r }) => structuredClone(r))(d) : null; }
    const operationId = nouvelId('op');
    const audit = L.construireAudit(ecritures, avants, { acteur: JEROME, outil, operationId, maintenant, horodatage: maintenant, nouvelId });
    const tout = ecritures.flatMap((e, i) => [e, ...audit[i]]);
    const lot = [];
    for (const e of tout) {
      const marques = {};
      for (const c of e.horodater || []) marques[c] = maintenant;
      for (const c of e.signer || []) marques[c] = JEROME;
      if (e.type === 'creer') lot.push({ type: 'set', collection: e.collection, id: e.id, donnees: { ...e.donnees, ...marques } });
      else if (e.type === 'modifier') lot.push({ type: 'update', collection: e.collection, id: e.id, donnees: { ...e.patch, ...marques } });
      else lot.push({ type: 'delete', collection: e.collection, id: e.id });
    }
    await donnees.appliquer(lot); // tout ou rien, comme un lot Firestore
    return operationId;
  };
  const ctxPlan = (maintenant) => ({ maintenant, auteur: JEROME, aujourdhui: L.aujourdhuiParis(maintenant), nouvelId });
  return { collections, donnees, executer, ctxPlan, lire };
}

describe('Construction des lignes d’audit de l’écran (fonctions pures)', () => {
  const contexte = { acteur: JEROME, outil: 'essai', operationId: 'op1', maintenant: T0, horodatage: T0, nouvelId: (() => { let n = 0; return (c) => `${c}_${++n}`; })() };

  test('une ligne et une copie par écriture, au même ordre ; schéma du serveur MCP (canal ecran, statut succes, noms de champs seulement)', () => {
    const ecritures = [
      { type: 'creer', collection: 'crm_notes', id: 'n1', donnees: { texte: 'Bonjour' }, horodater: ['creeLe'] },
      { type: 'modifier', collection: 'crm_affaires', id: 'a1', patch: { montant: 5 }, horodater: ['modifieLe'], signer: ['modifiePar'] },
      { type: 'supprimer', collection: 'crm_activites', id: 'x1' },
    ];
    const audit = L.construireAudit(ecritures, { 'crm_affaires/a1': { titre: 'T', montant: 1 }, 'crm_activites/x1': { titre: 'À faire' } }, contexte);
    assert.equal(audit.length, 3);
    const [[l1, c1], [l2, c2], [l3, c3]] = audit;
    assert.deepEqual([l1.collection, l1.id.startsWith('crm_audit_'), l1.horodater, c1.collection, c1.id], ['crm_audit', true, ['date'], 'crm_audit_avant', l1.id]);
    assert.deepEqual([l1.donnees.action, l2.donnees.action, l3.donnees.action], ['creer', 'modifier', 'supprimer']);
    assert.deepEqual(l1.donnees.champsModifies.sort(), ['creeLe', 'texte']);
    assert.deepEqual(l2.donnees.champsModifies.sort(), ['modifieLe', 'modifiePar', 'montant']);
    assert.deepEqual(l3.donnees.champsModifies, []);
    for (const [l, i] of [[l1, 1], [l2, 2], [l3, 3]]) assert.deepEqual([l.donnees.ordre, l.donnees.acteur, l.donnees.via, l.donnees.jeton, l.donnees.statut, l.donnees.operationId, l.donnees.outil], [i, JEROME, 'ecran', 'ecran', 'succes', 'op1', 'essai']);
    assert.equal(c1.donnees.avant, null);
    assert.deepEqual(c1.donnees.apres, { texte: 'Bonjour', creeLe: T0 });
    assert.deepEqual(c2.donnees.avant, { titre: 'T', montant: 1 });
    assert.deepEqual(c2.donnees.apres, { titre: 'T', montant: 5, modifieLe: T0, modifiePar: JEROME }, 'champs fusionnés, marques résolues');
    assert.equal(c3.donnees.apres, null);
    assert.deepEqual(c3.donnees.avant, { titre: 'À faire' });
    assert.equal(c1.donnees.expireAt.getTime(), T0.getTime() + 90 * 86_400_000);
    assert.doesNotMatch(JSON.stringify(audit.map(([l]) => l.donnees)), /Bonjour|À faire/, 'aucun contenu dans les lignes du journal');
  });

  test('aucune écriture : aucune ligne', () => {
    assert.deepEqual(L.construireAudit([], {}, contexte), []);
  });
});

describe('Actions de l’écran dans le journal, puis restauration par le serveur', () => {
  const base = () => ({ crm_personnes: [], crm_organisations: [], crm_affaires: [], crm_activites: [], crm_notes: [], crm_evenements: [] });

  test('créer une personne, son affaire, changer l’étape : chaque action laisse sa ligne ; lire_audit les voit avec le canal « ecran »', async () => {
    const e = ecran(base());
    const c = e.ctxPlan(T0);
    const pp = L.planCreerPersonne({ nom: 'Camille Durand' }, c);
    const op1 = await e.executer(pp.ecritures, 'creerPersonne', T0);
    const pa = L.planCreerAffaire({ titre: 'Site', personneId: pp.id }, { personnes: e.collections.crm_personnes, organisations: [] }, c);
    const op2 = await e.executer(pa.ecritures, 'creerAffaire', T0);
    const a = e.lire('crm_affaires', pa.id);
    const op3 = await e.executer(L.planChangerEtape(a, 'rdv_fixe', e.ctxPlan(new Date('2026-10-06T08:00:00Z'))).ecritures, 'changerEtape', new Date('2026-10-06T08:00:00Z'));
    const tout = await lecture.lireAudit(e.donnees, { acteur: JEROME });
    assert.equal(tout.total, 2 + 2 + 2, 'personne+événement, affaire+événement, changement d’étape+son événement');
    assert.ok(tout.lignes.every((l) => l.via === 'ecran' && l.statut === 'succes'));
    assert.deepEqual([...new Set(tout.lignes.map((l) => l.outil))].sort(), ['changerEtape', 'creerAffaire', 'creerPersonne']);
    assert.equal(tout.aVerifier, 0);
    const parDoc = await lecture.lireAudit(e.donnees, { docId: pa.id });
    assert.deepEqual(parDoc.lignes.map((l) => l.action).sort(), ['creer', 'modifier'], 'l’historique d’un document : sa création et son changement d’étape');
    assert.ok(op1 && op2 && op3 && new Set([op1, op2, op3]).size === 3, 'une opération par action');
  });

  test('supprimer une personne avec ses affaires dans l’écran, puis restaurer_depuis_audit : tout revient à l’identique (mêmes identifiants, mêmes liens)', async () => {
    const e = ecran(base());
    const c = e.ctxPlan(T0);
    const pp = L.planCreerPersonne({ nom: 'Camille Durand' }, c);
    await e.executer(pp.ecritures, 'creerPersonne', T0);
    const pa = L.planCreerAffaire({ titre: 'Site', personneId: pp.id }, { personnes: e.collections.crm_personnes, organisations: [] }, c);
    await e.executer(pa.ecritures, 'creerAffaire', T0);
    await e.executer(L.planCreerNote('Une note', { affaireId: pa.id, personneId: pp.id }, c).ecritures, 'creerNote', T0);
    await e.executer(L.planCreerActivite({ type: 'appel', date: '2026-10-09', affaireId: pa.id, personneId: pp.id }, c).ecritures, 'creerActivite', T0);
    const avant = structuredClone(e.collections);
    const liens = ['crm_activites', 'crm_notes', 'crm_evenements'].flatMap((nom) => e.collections[nom].map((d) => ({ collection: nom, id: d.id, personneId: d.personneId ?? null, organisationId: d.organisationId ?? null, affaireId: d.affaireId ?? null })));
    const t1 = new Date('2026-10-07T09:00:00Z');
    const suppr = L.planSupprimerPersonne({ personneId: pp.id, choix: 'affaires', affaires: e.collections.crm_affaires, liens });
    const op = await e.executer(suppr.ecritures, 'supprimerPersonne', t1);
    assert.equal(e.lire('crm_personnes', pp.id), null);
    assert.equal(e.collections.crm_affaires.length, 0);
    const apercu = await restaurerOperation({ donnees: e.donnees, ctx: { acteur: 'claude-code-jerome', jeton: 'claude-code-jerome', via: 'mcp', maintenant: new Date('2026-10-07T10:00:00Z') }, operationId: op });
    assert.equal(apercu.conflits, 0);
    assert.equal(apercu.aDefaire, suppr.ecritures.length, 'chaque suppression de l’écran est annulable par le moteur du serveur');
    await restaurerOperation({ donnees: e.donnees, ctx: { acteur: 'claude-code-jerome', jeton: 'claude-code-jerome', via: 'mcp', maintenant: new Date('2026-10-07T10:00:00Z') }, operationId: op, apercu: false });
    const trie = (o) => Object.fromEntries(Object.entries(o).filter(([k]) => !['crm_audit', 'crm_audit_avant'].includes(k)).map(([k, v]) => [k, [...v].sort((a, b) => a.id.localeCompare(b.id))]));
    assert.deepEqual(trie(e.collections), trie(avant));
  });

  test('une modification de l’écran se restaure ; si le document a encore changé depuis, la restauration refuse', async () => {
    const e = ecran(base());
    const c = e.ctxPlan(T0);
    const pp = L.planCreerPersonne({ nom: 'Élodie Bernard' }, c);
    await e.executer(pp.ecritures, 'creerPersonne', T0);
    const avant = structuredClone(e.lire('crm_personnes', pp.id));
    const t1 = new Date('2026-10-07T09:00:00Z');
    const op = await e.executer(L.planMajPersonne(pp.id, { ville: 'Brest' }).ecritures, 'majPersonne', t1);
    await e.executer(L.planMajPersonne(pp.id, { ville: 'Rennes' }).ecritures, 'majPersonne', new Date('2026-10-07T11:00:00Z'));
    const ctxRestau = { acteur: 'claude-code-jerome', jeton: 'claude-code-jerome', via: 'mcp', maintenant: new Date('2026-10-08T10:00:00Z') };
    await assert.rejects(() => restaurerOperation({ donnees: e.donnees, ctx: ctxRestau, operationId: op, apercu: false }), (err) => err.code === 'restauration_refusee');
    await restaurerOperation({ donnees: e.donnees, ctx: ctxRestau, operationId: op, apercu: false, forcer: true });
    assert.deepEqual(e.lire('crm_personnes', pp.id), avant);
  });
});
