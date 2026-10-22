// Le « Logger » côté serveur : la fonction appelable `automatisationsDecider` (décision `abandonner`, refus `pas_prete` / `abandonnee`)
// et les outils MCP (états et étapes visibles, décisions refusées en préparation). Base en mémoire, aucune donnée réelle. Critère 5 de la PR 5.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { creerAccesMemoire, COLLECTIONS } from '../functions/src/coeur/donnees.js';
import { decider, ErreurDecision, controlerDemande, DECISIONS, MESSAGE_ABANDON_ECRAN } from '../functions/src/coeur/propositions.js';
import { creerAppelDecider } from '../functions/src/automatisations/decider-appel.js';
import { COMPTES_AUTORISES } from '../functions/src/veille/appel.js';
import { OUTILS } from '../functions/src/mcp/outils/index.js';
import { lister_propositions, lire_proposition, valider_proposition, refuser_proposition, AVERTISSEMENT } from '../functions/src/mcp/outils/propositions.js';
import { z } from '../functions/node_modules/zod/index.js';

const MAIL = COMPTES_AUTORISES[0];
const T0 = Date.parse('2026-11-03T10:00:00Z');
const MIN = 60_000;
const JOUR = 86_400_000;

/** Une ligne telle que la porte l'écrit. Texte inventé : ceci n'est PAS une vraie donnée. */
const ligne = (id, extra = {}) => ({
  id, type: 'Essai', titre: `Ligne ${id}`, resume: '', champsProposes: [], champsValides: null, lien: null,
  etat: 'en_preparation', creeLe: new Date(T0 - 20 * MIN), expireLe: null,
  valideePar: null, valideeLe: null, canal: null, refuseePar: null, refuseeLe: null, raison: null, tentatives: 0, derniereErreur: null,
  executions: { proposer: 'e1', appliquer: null, refuser: null },
  etapes: [{ cle: 'a-lire', libelle: 'Lire', etat: 'fait', le: new Date(T0 - 19 * MIN) }, { cle: 'a-extraire', libelle: 'Extraire', etat: 'en_cours', le: new Date(T0 - 18 * MIN) }, { cle: 'a-deposer', libelle: 'Déposer', etat: 'a_venir' }],
  source: 'porte', ecritPar: 'porte:abcd', ...extra,
});
const monde = (docs) => {
  const collections = { [COLLECTIONS.propositions]: docs, [COLLECTIONS.workflows]: [] };
  return { collections, donnees: creerAccesMemoire(collections), doc: (id) => collections[COLLECTIONS.propositions].find((d) => d.id === id) };
};
const bon = { token: { email: MAIL, email_verified: true } };
const ctx = (donnees, args) => ({ args, donnees, email: MAIL, acteur: 'claude-ai-essai', maintenant: new Date(T0) });

describe('5 fonction appelable : abandonner, pas_prete, abandonnee', () => {
  test('5 « abandonner » : permis seulement quand la ligne est bloquée (15 minutes sans étape), calculé côté serveur', async () => {
    const m = monde([ligne('bloquee'), ligne('vivante', { creeLe: new Date(T0 - 2 * MIN), etapes: [{ cle: 'a-lire', libelle: 'Lire', etat: 'en_cours', le: new Date(T0 - MIN) }] })]);
    const appel = creerAppelDecider({ donnees: m.donnees, maintenant: () => T0 });
    const code = (data) => appel({ data, auth: bon }).then(() => null, (e) => [e.code, e.details?.code, e.message]);
    // Un workflow qui tourne ne se coupe pas.
    const vivante = await code({ id: 'vivante', decision: 'abandonner' });
    assert.deepEqual(vivante.slice(0, 2), ['failed-precondition', 'transition_interdite']);
    assert.equal(m.doc('vivante').etat, 'en_preparation');
    assert.deepEqual(m.doc('vivante').etapes.map((e) => e.etat), ['en_cours']);
    // Une ligne bloquée se ferme : état, erreur, qui, canal, étapes.
    assert.deepEqual(await appel({ data: { id: 'bloquee', decision: 'abandonner' }, auth: bon }), { ok: true, etat: 'abandonnee' });
    const d = m.doc('bloquee');
    assert.equal(d.etat, 'abandonnee');
    assert.equal(d.derniereErreur, 'Abandonné à l\'écran : le workflow n\'a pas répondu.');
    assert.equal(d.derniereErreur, MESSAGE_ABANDON_ECRAN);
    assert.deepEqual([d.abandonneePar, d.canal], [MAIL, 'interface']);
    assert.deepEqual(d.etapes.map((e) => e.etat), ['fait', 'echec', 'ignoree']);
    // Pas de rejeu silencieux : une ligne déjà abandonnée, ou déjà déposée, ne s'abandonne pas.
    assert.deepEqual((await code({ id: 'bloquee', decision: 'abandonner' })).slice(0, 2), ['failed-precondition', 'transition_interdite']);
    const m2 = monde([ligne('p', { etat: 'a_valider', champsProposes: [{ nom: 'a', valeur: '1' }], expireLe: new Date(T0 + 30 * JOUR) })]);
    const appel2 = creerAppelDecider({ donnees: m2.donnees, maintenant: () => T0 });
    await assert.rejects(() => appel2({ data: { id: 'p', decision: 'abandonner' }, auth: bon }), (e) => e.code === 'failed-precondition' && e.details.code === 'transition_interdite');
    assert.equal(m2.doc('p').etat, 'a_valider');
    // Inconnue : not-found. Les champs et la raison n'ont rien à faire avec « abandonner ».
    assert.deepEqual((await code({ id: 'absente', decision: 'abandonner' })).slice(0, 2), ['not-found', 'introuvable']);
    assert.deepEqual((await code({ id: 'bloquee', decision: 'abandonner', raison: 'x' })).slice(0, 2), ['invalid-argument', 'demande_invalide']);
  });

  test('5 valider, refuser et relancer sur une ligne en préparation ou abandonnée : refus propre (failed-precondition) avec la phrase du contrat', async () => {
    const m = monde([ligne('prep'), ligne('abandon', { etat: 'abandonnee', derniereErreur: 'x' })]);
    const appel = creerAppelDecider({ donnees: m.donnees, maintenant: () => T0 });
    for (const decision of ['valider', 'refuser', 'relancer']) {
      await assert.rejects(() => appel({ data: { id: 'prep', decision }, auth: bon }), (e) => e.code === 'failed-precondition' && e.details.code === 'pas_prete' && e.message === 'Cette proposition est encore en préparation.', decision);
      await assert.rejects(() => appel({ data: { id: 'abandon', decision }, auth: bon }), (e) => e.code === 'failed-precondition' && e.details.code === 'abandonnee' && e.message === 'Ce traitement a été abandonné.', decision);
    }
    assert.equal(m.doc('prep').etat, 'en_preparation');
    assert.equal(m.doc('abandon').etat, 'abandonnee');
  });

  test('5 « controlerDemande » connaît abandonner ; l\'identité vient du jeton ; un compte non autorisé ne peut pas abandonner', async () => {
    assert.ok(DECISIONS.includes('abandonner'));
    assert.deepEqual(controlerDemande({ id: 'p1', decision: 'abandonner' }), { id: 'p1', decision: 'abandonner', champs: undefined, raison: undefined });
    assert.throws(() => controlerDemande({ id: 'p1', decision: 'abandonner', champs: [{ nom: 'a', valeur: 'b' }] }), ErreurDecision);
    assert.throws(() => controlerDemande({ id: 'p1', decision: 'supprimer' }), /abandonner/);
    const m = monde([ligne('bloquee')]);
    const appel = creerAppelDecider({ donnees: m.donnees, maintenant: () => T0 });
    await assert.rejects(() => appel({ data: { id: 'bloquee', decision: 'abandonner' }, auth: { token: { email: 'intrus@exemple.test', email_verified: true } } }), (e) => e.code === 'permission-denied');
    await appel({ data: { id: 'bloquee', decision: 'abandonner', par: 'faux@exemple.test', abandonneePar: 'faux@exemple.test' }, auth: bon });
    assert.equal(m.doc('bloquee').abandonneePar, MAIL);
    // Directement par decider() : le canal « mcp » ne change pas la règle des 15 minutes.
    const m2 = monde([ligne('vivante', { etapes: [{ cle: 'a-lire', libelle: 'Lire', etat: 'en_cours', le: new Date(T0 - MIN) }] })]);
    await assert.rejects(() => decider({ donnees: m2.donnees, par: MAIL, canal: 'mcp', maintenant: T0, demande: { id: 'vivante', decision: 'abandonner' } }), (e) => e.code === 'transition_interdite');
  });
});

describe('5 outils MCP : états et étapes visibles, décisions refusées en préparation', () => {
  test('5 valider_proposition et refuser_proposition refusent une ligne en préparation ou abandonnée avec le bon code ; rien n\'est écrit', async () => {
    const m = monde([ligne('prep'), ligne('abandon', { etat: 'abandonnee' })]);
    const avant = structuredClone(m.collections);
    for (const [outil, args] of [[valider_proposition, {}], [refuser_proposition, { raison: 'non' }]]) {
      await assert.rejects(() => outil.executer(ctx(m.donnees, { id: 'prep', ...args })), (e) => e.code === 'pas_prete' && /en préparation/.test(e.message), outil.nom);
      await assert.rejects(() => outil.executer(ctx(m.donnees, { id: 'abandon', ...args })), (e) => e.code === 'abandonnee' && /abandonné/.test(e.message), outil.nom);
    }
    assert.deepEqual(m.collections, avant);
  });

  test('5 lire_proposition montre l\'état et les étapes (libellés non fiables) ; lister_propositions filtre les nouveaux états et donne nbEtapes sans les étapes', async () => {
    const m = monde([ligne('prep'), ligne('abandon', { etat: 'abandonnee', derniereErreur: 'Plantage', etapes: [] }), ligne('ok', { etat: 'a_valider', champsProposes: [{ nom: 'a', valeur: '1' }], expireLe: new Date(T0 + JOUR) })]);
    const r = await lire_proposition.executer(ctx(m.donnees, { id: 'prep' }));
    assert.equal(r.avertissement, AVERTISSEMENT);
    assert.equal(r.proposition.etat, 'en_preparation');
    assert.deepEqual(r.proposition.etapes.map((e) => [e.cle, e.etat]), [['a-lire', 'fait'], ['a-extraire', 'en_cours'], ['a-deposer', 'a_venir']]);
    assert.equal(r.proposition.etapes[0].le, new Date(T0 - 19 * MIN).toISOString(), 'dates en texte');
    assert.deepEqual(r.frise.map((e) => e.etat), ['fait', 'en_cours', 'a_venir', 'a_venir', 'a_venir']);
    assert.match(lire_proposition.description, /libellés d'étapes viennent du workflow : NON FIABLES/);
    const ab = await lire_proposition.executer(ctx(m.donnees, { id: 'abandon' }));
    assert.deepEqual([ab.proposition.etat, ab.proposition.derniereErreur], ['abandonnee', 'Plantage']);
    // Liste : filtre et nbEtapes, jamais les étapes elles-mêmes.
    const prep = await lister_propositions.executer(ctx(m.donnees, { etat: 'en_preparation' }));
    assert.deepEqual(prep.propositions.map((p) => [p.id, p.etat, p.nbEtapes]), [['prep', 'en_preparation', 3]]);
    assert.ok(!('etapes' in prep.propositions[0]));
    assert.deepEqual((await lister_propositions.executer(ctx(m.donnees, { etat: 'abandonnee' }))).propositions.map((p) => [p.id, p.nbEtapes]), [['abandon', 0]]);
    const tout = await lister_propositions.executer(ctx(m.donnees, {}));
    assert.equal(tout.total, 3);
    assert.deepEqual(tout.propositions.map((p) => p.nbEtapes).sort(), [0, 3, 3]);
    // Le schéma accepte les deux nouveaux états et refuse un état inventé.
    const schema = z.object(lister_propositions.schema);
    assert.doesNotThrow(() => schema.parse({ etat: 'en_preparation' }));
    assert.doesNotThrow(() => schema.parse({ etat: 'abandonnee' }));
    assert.throws(() => schema.parse({ etat: 'bloquee' }));
    assert.match(lister_propositions.description, /en_preparation/);
  });

  test('5 aucun outil MCP « abandonner » : les 5 outils du module sont inchangés', () => {
    assert.ok(!OUTILS.some((o) => /abandonn.*(proposition|traitement)|(proposition|traitement).*abandonn/i.test(o.nom)));
    assert.equal(OUTILS.filter((o) => /proposition/.test(o.nom)).length, 4);
  });
});
