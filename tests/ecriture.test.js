// Tests du moteur d'écriture et de l'audit en trois lots (étape 4, plan-mcp.md 5.2 et 5.9 : tests 1, 2, 3, 7, 8). Données fictives en mémoire,
// pannes injectées en enveloppant l'accès aux données. Le même moteur est rejoué sur l'émulateur Firestore (ecriture-firestore.test.js).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { executerEcritures, ErreurEcriture, JOURS_COPIES, MAX_PARAMETRES } from '../functions/src/coeur/ecriture.js';
import { restaurerOperation } from '../functions/src/coeur/restaurer.js';
import * as lecture from '../functions/src/coeur/lecture.js';
import { collections as base, MAINTENANT } from './_donnees-essai.js';

const nouveau = () => {
  const collections = structuredClone(base);
  return { collections, donnees: creerAccesMemoire(collections) };
};
const ctx = (extra = {}) => ({ acteur: 'hermes-bibliothecaire', jeton: 'hermes-bibliothecaire', via: 'mcp', maintenant: MAINTENANT, ...extra });
const doc = (collections, nom, id) => collections[nom].find((d) => d.id === id);
const lignesAudit = (collections, operationId) => (collections.crm_audit || []).filter((l) => l.operationId === operationId).sort((a, b) => a.ordre - b.ordre);

/** Enveloppe l'accès : `avant(appel, nom, ecritures, options)` peut lever une erreur pour simuler une panne. */
function avecPannes(donnees, avant) {
  let appel = 0;
  return { ...donnees, async appliquer(ecritures, options) { appel += 1; await avant(appel, ecritures, options, donnees); return donnees.appliquer(ecritures, options); } };
}
const touche = (ecritures, nom) => ecritures.some((e) => e.collection === nom);
const panne = (msg = 'panne simulée') => Object.assign(new Error(msg), { code: 14 });

describe('Écriture avec audit : le cas normal', () => {
  test('créer, modifier et supprimer : données écrites, lignes d’audit « succes », copies avant et après gardées', async () => {
    const { collections, donnees } = nouveau();
    const r = await executerEcritures({
      donnees, ctx: ctx(), outil: 'essai', parametres: { texte: 'abc' },
      operations: [
        { type: 'creer', collection: 'crm_personnes', id: 'pNeuve', donnees: { nom: 'Nouvelle Personne' } },
        { type: 'modifier', collection: 'crm_affaires', id: 'a1', patch: { montant: 1200 } },
        { type: 'supprimer', collection: 'crm_notes', id: 'n2' },
      ],
    });
    assert.ok(r.operationId);
    assert.deepEqual(r.ecritures.map((e) => e.action), ['creer', 'modifier', 'supprimer']);
    assert.equal(doc(collections, 'crm_personnes', 'pNeuve').nom, 'Nouvelle Personne');
    assert.equal(doc(collections, 'crm_affaires', 'a1').montant, 1200);
    assert.equal(doc(collections, 'crm_affaires', 'a1').titre, 'Site vitrine Atelier des Lilas', 'les autres champs sont conservés');
    assert.equal(doc(collections, 'crm_notes', 'n2'), undefined);

    const lignes = lignesAudit(collections, r.operationId);
    assert.deepEqual(lignes.map((l) => [l.ordre, l.action, l.collection, l.docId, l.statut]), [
      [1, 'creer', 'crm_personnes', 'pNeuve', 'succes'], [2, 'modifier', 'crm_affaires', 'a1', 'succes'], [3, 'supprimer', 'crm_notes', 'n2', 'succes'],
    ]);
    assert.deepEqual(lignes[1].champsModifies, ['montant']);
    const copie = (l) => doc(collections, 'crm_audit_avant', l.id);
    assert.equal(copie(lignes[0]).avant, null);
    assert.equal(copie(lignes[0]).apres.nom, 'Nouvelle Personne');
    assert.equal(copie(lignes[1]).avant.montant, undefined);
    assert.equal(copie(lignes[1]).apres.montant, 1200);
    assert.equal(copie(lignes[2]).avant.texte, 'Premier contact par e-mail.');
    assert.equal(copie(lignes[2]).apres, null);
    assert.ok(!('id' in copie(lignes[2]).avant), 'l’identifiant est le nom du document, pas une donnée');
  });

  test('test 3 : l’acteur est celui du jeton (auteur, jeton, canal) dans l’audit ; signer et via marquent les documents', async () => {
    const { collections, donnees } = nouveau();
    const r = await executerEcritures({
      donnees, ctx: ctx(), outil: 'essai',
      operations: [{ type: 'creer', collection: 'crm_notes', donnees: { texte: 'x' }, horodater: ['creeLe'], signer: ['creePar'] }],
    });
    const [l] = lignesAudit(collections, r.operationId);
    assert.equal(l.acteur, 'hermes-bibliothecaire');
    assert.equal(l.jeton, 'hermes-bibliothecaire');
    assert.equal(l.via, 'mcp');
    const note = doc(collections, 'crm_notes', l.docId);
    assert.equal(note.creePar, 'hermes-bibliothecaire');
    assert.equal(note.via, 'mcp');
    assert.equal(note.creeLe.getTime(), MAINTENANT.getTime());
    // un autre jeton écrit le sien
    const r2 = await executerEcritures({ donnees, ctx: ctx({ acteur: 'claude-code-jerome', jeton: 'claude-code-jerome' }), outil: 'essai', operations: [{ type: 'modifier', collection: 'crm_notes', id: 'n1', patch: { texte: 'y' }, signer: ['modifiePar'] }] });
    assert.equal(lignesAudit(collections, r2.operationId)[0].acteur, 'claude-code-jerome');
    assert.equal(doc(collections, 'crm_notes', 'n1').modifiePar, 'claude-code-jerome');
    assert.equal(doc(collections, 'crm_notes', 'n1').via, undefined, 'via marque la création, pas les modifications');
  });

  test('la trace ne contient pas le contenu : paramètres reçus = noms seulement ; contenu et copies dans crm_audit_avant, avec date expireAt à +90 jours (champ inerte)', async () => {
    const { collections, donnees } = nouveau();
    const r = await executerEcritures({ donnees, ctx: ctx(), outil: 'essai', parametres: { nom: 'Marie Secrète', note: 'x'.repeat(5000) }, operations: [{ type: 'creer', collection: 'crm_personnes', donnees: { nom: 'Marie Secrète' } }] });
    const [l] = lignesAudit(collections, r.operationId);
    assert.deepEqual(l.parametresRecus, ['nom', 'note']);
    assert.doesNotMatch(JSON.stringify(collections.crm_audit), /Marie Secr/, 'aucun contenu de fiche dans crm_audit (conservé sans limite)');
    const c = doc(collections, 'crm_audit_avant', l.id);
    assert.equal(c.expireAt.getTime(), MAINTENANT.getTime() + JOURS_COPIES * 86_400_000);
    assert.ok(c.parametres.length <= MAX_PARAMETRES + 1);
    assert.match(c.parametres, /Marie Secr/);
  });

  test('plan vide ou modifications sans champ : ni écriture ni trace', async () => {
    const { collections, donnees } = nouveau();
    const avantTraces = (collections.crm_audit || []).length;
    const r = await executerEcritures({ donnees, ctx: ctx(), outil: 'essai', operations: [{ type: 'modifier', collection: 'crm_notes', id: 'n1', patch: {} }] });
    assert.equal(r.operationId, null);
    assert.equal((collections.crm_audit || []).length, avantTraces);
  });

  test('lire_audit relit les lignes écrites (même schéma que le journal)', async () => {
    const { donnees } = nouveau();
    const r = await executerEcritures({ donnees, ctx: ctx(), outil: 'creer_note', operations: [{ type: 'creer', collection: 'crm_notes', donnees: { texte: 'z' } }] });
    const audit = await lecture.lireAudit(donnees, { operationId: r.operationId });
    assert.equal(audit.total, 1);
    assert.equal(audit.lignes[0].outil, 'creer_note');
    assert.equal(audit.aVerifier, 0);
  });
});

describe('Contrôles avant tout lot (aucune trace, aucune donnée)', () => {
  const sansTrace = async (operations, code) => {
    const { collections, donnees } = nouveau();
    const copie = structuredClone(collections);
    await assert.rejects(() => executerEcritures({ donnees, ctx: ctx(), outil: 'essai', operations }), (e) => e instanceof ErreurEcriture && e.code === code);
    assert.deepEqual(collections, copie);
  };
  test('modifier ou supprimer un document inconnu : introuvable', async () => {
    await sansTrace([{ type: 'modifier', collection: 'crm_notes', id: 'zzz', patch: { texte: 'x' } }], 'introuvable');
    await sansTrace([{ type: 'supprimer', collection: 'crm_notes', id: 'zzz' }], 'introuvable');
  });
  test('créer un document dont l’identifiant existe déjà : conflit', async () => {
    await sansTrace([{ type: 'creer', collection: 'crm_notes', id: 'n1', donnees: { texte: 'x' } }], 'conflit');
  });
  test('le même document deux fois, une collection non écrivable (audit, limites, copies, paramètres), un type inconnu : plan invalide', async () => {
    await sansTrace([{ type: 'modifier', collection: 'crm_notes', id: 'n1', patch: { a: 1 } }, { type: 'supprimer', collection: 'crm_notes', id: 'n1' }], 'plan_invalide');
    for (const c of ['crm_audit', 'crm_audit_avant', 'mcp_limites', 'crm_parametres', 'crm_prospects']) await sansTrace([{ type: 'creer', collection: c, id: 'x', donnees: {} }], 'plan_invalide');
    await sansTrace([{ type: 'effacer', collection: 'crm_notes', id: 'n1' }], 'plan_invalide');
    await sansTrace([{ type: 'supprimer', collection: 'crm_notes', id: 'a/b' }], 'plan_invalide');
  });
  test('plus de 1 000 écritures en une opération : refusé', async () => {
    const operations = Array.from({ length: 1001 }, (_, i) => ({ type: 'creer', collection: 'crm_notes', id: `m${i}`, donnees: { texte: 'x' } }));
    await sansTrace(operations, 'plan_invalide');
  });
});

describe('Test 1 : l’audit est écrit même si l’écriture échoue', () => {
  test('lot 2 en panne : aucune donnée changée, ligne d’audit « echec » avec le message, copies présentes', async () => {
    const { collections, donnees } = nouveau();
    const copie = structuredClone(collections.crm_affaires);
    const casse = avecPannes(donnees, (n, ecr, opt) => { if (opt?.attendus?.length) throw panne('disque plein'); });
    await assert.rejects(
      () => executerEcritures({ donnees: casse, ctx: ctx(), outil: 'modifier_affaire', operations: [{ type: 'modifier', collection: 'crm_affaires', id: 'a1', patch: { montant: 5 } }] }),
      (e) => e.code === 'ecriture_echouee' && e.details.partiel === false && /rien n’a été écrit/.test(e.message) && !!e.details.operationId,
    );
    assert.deepEqual(collections.crm_affaires, copie);
    const lignes = collections.crm_audit.filter((l) => l.outil === 'modifier_affaire' && l.operationId !== 'op2');
    assert.equal(lignes.length, 1);
    assert.equal(lignes[0].statut, 'echec');
    assert.match(lignes[0].erreur, /disque plein/);
    assert.ok(doc(collections, 'crm_audit_avant', lignes[0].id), 'la copie « avant » existe');
  });

  test('document modifié entre la lecture et l’écriture (par l’écran, par exemple) : conflit, rien d’écrit, audit « echec »', async () => {
    const { collections, donnees } = nouveau();
    const concurrent = avecPannes(donnees, async (n, ecr, opt, reel) => {
      if (opt?.attendus?.length) await reel.appliquer([{ type: 'update', collection: 'crm_affaires', id: 'a1', donnees: { titre: 'Changé par l’écran' } }]);
    });
    let operationId;
    await assert.rejects(
      () => executerEcritures({ donnees: concurrent, ctx: ctx(), outil: 'modifier_affaire', operations: [{ type: 'modifier', collection: 'crm_affaires', id: 'a1', patch: { montant: 5 } }] }),
      (e) => { operationId = e.details.operationId; return e.code === 'conflit' && /recommencer/.test(e.message); },
    );
    assert.equal(doc(collections, 'crm_affaires', 'a1').titre, 'Changé par l’écran');
    assert.equal(doc(collections, 'crm_affaires', 'a1').montant, undefined);
    assert.equal(lignesAudit(collections, operationId)[0].statut, 'echec');
  });

  test('lot 2 en deux paquets, le second échoue : le premier reste écrit (« succes »), le reste « echec », erreur partielle avec l’opération à restaurer', async () => {
    const { collections, donnees } = nouveau();
    const operations = Array.from({ length: 450 }, (_, i) => ({ type: 'creer', collection: 'crm_notes', id: `m${i}`, donnees: { texte: `n${i}` } }));
    const casse = avecPannes(donnees, (n, ecr, opt) => { if (opt?.attendus?.length && opt.attendus.some((a) => a.id === 'm449')) throw panne(); });
    let erreur;
    try { await executerEcritures({ donnees: casse, ctx: ctx(), outil: 'masse', operations }); } catch (e) { erreur = e; }
    assert.equal(erreur.code, 'ecriture_echouee');
    assert.equal(erreur.details.partiel, true);
    assert.equal(erreur.details.appliquees, 400);
    assert.equal(erreur.details.total, 450);
    assert.match(erreur.message, /400 document\(s\) sur 450/);
    assert.equal(collections.crm_notes.filter((n) => n.id.startsWith('m')).length, 400);
    const lignes = lignesAudit(collections, erreur.details.operationId);
    assert.equal(lignes.length, 450);
    assert.equal(lignes.filter((l) => l.statut === 'succes').length, 400);
    assert.equal(lignes.filter((l) => l.statut === 'echec').length, 50);
    // …et on peut défaire ce qui a été écrit
    const r = await restaurerOperation({ donnees, ctx: ctx(), operationId: erreur.details.operationId, apercu: false });
    assert.equal(r.ecritures.length, 400);
    assert.equal(collections.crm_notes.filter((n) => n.id.startsWith('m')).length, 0);
  });

  test('lot 3 en panne : l’écriture est faite, la réponse le dit (avertissement) et la ligne reste « en_cours » pour lire_audit', async () => {
    const { collections, donnees } = nouveau();
    const casse = avecPannes(donnees, (n, ecr) => { if (ecr.every((e) => e.type === 'update' && e.collection === 'crm_audit')) throw panne(); });
    const r = await executerEcritures({ donnees: casse, ctx: ctx(), outil: 'creer_note', operations: [{ type: 'creer', collection: 'crm_notes', id: 'nx', donnees: { texte: 't' } }] });
    assert.equal(r.auditIncomplet, true);
    assert.match(r.avertissement, new RegExp(r.operationId));
    assert.equal(doc(collections, 'crm_notes', 'nx').texte, 't');
    const audit = await lecture.lireAudit(donnees, { incompletes: true });
    assert.ok(audit.lignes.some((l) => l.operationId === r.operationId));
    assert.ok(audit.aVerifier >= 1);
  });
});

describe('Test 2 : rien n’est écrit si le lot 1 échoue (pas d’audit = pas de donnée)', () => {
  test('journal en panne : aucune donnée, aucune ligne, erreur « audit_indisponible »', async () => {
    const { collections, donnees } = nouveau();
    const copie = structuredClone(collections);
    const casse = avecPannes(donnees, (n, ecr) => { if (touche(ecr, 'crm_audit')) throw panne('journal indisponible'); });
    await assert.rejects(
      () => executerEcritures({ donnees: casse, ctx: ctx(), outil: 'creer_note', operations: [{ type: 'creer', collection: 'crm_notes', id: 'nx', donnees: { texte: 't' } }] }),
      (e) => e.code === 'audit_indisponible' && /rien n’a été écrit/.test(e.message),
    );
    assert.deepEqual(collections, copie);
  });

  test('lot 1 en deux paquets, le second échoue : aucune donnée, et les lignes du premier paquet sont marquées « echec »', async () => {
    const { collections, donnees } = nouveau();
    const operations = Array.from({ length: 250 }, (_, i) => ({ type: 'creer', collection: 'crm_notes', id: `m${i}`, donnees: { texte: 'x' } }));
    let paquetsJournal = 0;
    const casse = avecPannes(donnees, (n, ecr) => { if (touche(ecr, 'crm_audit_avant')) { paquetsJournal += 1; if (paquetsJournal === 2) throw panne(); } });
    await assert.rejects(() => executerEcritures({ donnees: casse, ctx: ctx(), outil: 'masse', operations }), (e) => e.code === 'audit_indisponible');
    assert.equal(collections.crm_notes.filter((n) => n.id.startsWith('m')).length, 0);
    const lignes = collections.crm_audit.filter((l) => l.outil === 'masse');
    assert.equal(lignes.length, 200);
    assert.ok(lignes.every((l) => l.statut === 'echec'));
  });
});

describe('Restauration d’une opération', () => {
  const faire = (donnees, operations, c = ctx()) => executerEcritures({ donnees, ctx: c, outil: 'essai', operations });

  test('modification annulée : la copie « avant » revient ; création annulée : le document disparaît ; suppression annulée : même identifiant', async () => {
    const { collections, donnees } = nouveau();
    const original = structuredClone(doc(collections, 'crm_personnes', 'p2'));
    const r = await faire(donnees, [
      { type: 'modifier', collection: 'crm_personnes', id: 'p2', patch: { ville: 'Brest' } },
      { type: 'creer', collection: 'crm_notes', id: 'nx', donnees: { texte: 't' } },
      { type: 'supprimer', collection: 'crm_activites', id: 'ac4' },
    ]);
    assert.equal(doc(collections, 'crm_personnes', 'p2').ville, 'Brest');
    const originalAc4 = structuredClone(base.crm_activites.find((a) => a.id === 'ac4'));
    const apercu = await restaurerOperation({ donnees, ctx: ctx(), operationId: r.operationId });
    assert.equal(apercu.apercu, true);
    assert.deepEqual(apercu.lignes.map((l) => l.action), ['recreer', 'supprimer', 'remplacer'], 'rejoué à l’envers : la dernière écriture est défaite en premier');
    assert.equal(doc(collections, 'crm_personnes', 'p2').ville, 'Brest', 'l’aperçu n’écrit rien');
    const fait = await restaurerOperation({ donnees, ctx: ctx(), operationId: r.operationId, apercu: false });
    assert.equal(fait.restauree, true);
    assert.deepEqual(doc(collections, 'crm_personnes', 'p2'), original);
    assert.equal(doc(collections, 'crm_notes', 'nx'), undefined);
    assert.deepEqual(doc(collections, 'crm_activites', 'ac4'), originalAc4, 'recréée à l’identique, même identifiant');
    // la restauration laisse sa propre trace
    const traces = collections.crm_audit.filter((l) => l.operationId === fait.operationRestauration);
    assert.equal(traces.length, 3);
    assert.ok(traces.every((l) => l.action === 'restaurer' && l.outil === 'restaurer_depuis_audit' && l.statut === 'succes'));
  });

  test('test 7 : restauration refusée si le document a changé depuis ; forcer: true la permet', async () => {
    const { collections, donnees } = nouveau();
    const r = await faire(donnees, [{ type: 'modifier', collection: 'crm_personnes', id: 'p2', patch: { ville: 'Brest' } }]);
    await donnees.appliquer([{ type: 'update', collection: 'crm_personnes', id: 'p2', donnees: { ville: 'Rennes' } }]); // quelqu'un d'autre
    const apercu = await restaurerOperation({ donnees, ctx: ctx(), operationId: r.operationId });
    assert.equal(apercu.conflits, 1);
    assert.equal(apercu.lignes[0].action, 'conflit');
    await assert.rejects(() => restaurerOperation({ donnees, ctx: ctx(), operationId: r.operationId, apercu: false }), (e) => e.code === 'restauration_refusee' && /forcer/.test(e.message));
    assert.equal(doc(collections, 'crm_personnes', 'p2').ville, 'Rennes', 'rien n’a été touché');
    await restaurerOperation({ donnees, ctx: ctx(), operationId: r.operationId, apercu: false, forcer: true });
    assert.equal(doc(collections, 'crm_personnes', 'p2').ville, undefined, 'état d’avant rétabli');
  });

  test('un document supprimé puis recréé par quelqu’un d’autre : conflit (on n’écrase pas)', async () => {
    const { donnees } = nouveau();
    const r = await faire(donnees, [{ type: 'supprimer', collection: 'crm_notes', id: 'n2' }]);
    await donnees.appliquer([{ type: 'set', collection: 'crm_notes', id: 'n2', donnees: { texte: 'autre chose' } }]);
    await assert.rejects(() => restaurerOperation({ donnees, ctx: ctx(), operationId: r.operationId, apercu: false }), (e) => e.code === 'restauration_refusee');
  });

  test('test 8 : copie « avant » manquante : message clair, rien n’est touché', async () => {
    const { collections, donnees } = nouveau();
    const r = await faire(donnees, [{ type: 'supprimer', collection: 'crm_notes', id: 'n2' }]);
    collections.crm_audit_avant = []; // copies absentes (simulation)
    await assert.rejects(() => restaurerOperation({ donnees, ctx: ctx(), operationId: r.operationId, apercu: false }), (e) => e.code === 'copie_expiree' && /manquent/.test(e.message) && /sauvegarde/.test(e.message));
    assert.equal(doc(collections, 'crm_notes', 'n2'), undefined);
  });

  test('opération inconnue ou entièrement en échec : introuvable', async () => {
    const { donnees } = nouveau();
    await assert.rejects(() => restaurerOperation({ donnees, ctx: ctx(), operationId: 'inconnue' }), (e) => e.code === 'introuvable');
  });

  test('écriture jamais arrivée (ligne « en_cours ») : « rien à faire » ; arrivée : défaite', async () => {
    const { collections, donnees } = nouveau();
    // lot 3 en panne : les deux lignes restent « en_cours »
    const casse = avecPannes(donnees, (n, ecr) => { if (ecr.every((e) => e.type === 'update' && e.collection === 'crm_audit')) throw panne(); });
    const r = await executerEcritures({ donnees: casse, ctx: ctx(), outil: 'essai', operations: [{ type: 'modifier', collection: 'crm_personnes', id: 'p2', patch: { ville: 'Brest' } }] });
    assert.equal(collections.crm_audit.find((l) => l.operationId === r.operationId).statut, 'en_cours');
    await restaurerOperation({ donnees, ctx: ctx(), operationId: r.operationId, apercu: false });
    assert.equal(doc(collections, 'crm_personnes', 'p2').ville, undefined);
    const encore = await restaurerOperation({ donnees, ctx: ctx(), operationId: r.operationId, apercu: false });
    assert.equal(encore.rienAFaire, true, 'seconde restauration : déjà dans l’état d’avant');
  });

  test('une restauration se restaure aussi (on revient à l’état d’avant la restauration)', async () => {
    const { collections, donnees } = nouveau();
    const r = await faire(donnees, [{ type: 'modifier', collection: 'crm_personnes', id: 'p2', patch: { ville: 'Brest' } }]);
    const rest = await restaurerOperation({ donnees, ctx: ctx(), operationId: r.operationId, apercu: false });
    assert.equal(doc(collections, 'crm_personnes', 'p2').ville, undefined);
    await restaurerOperation({ donnees, ctx: ctx(), operationId: rest.operationRestauration, apercu: false });
    assert.equal(doc(collections, 'crm_personnes', 'p2').ville, 'Brest');
  });

  test('une opération de plus de 400 documents se restaure par paquets', async () => {
    const { collections, donnees } = nouveau();
    const r = await faire(donnees, Array.from({ length: 450 }, (_, i) => ({ type: 'creer', collection: 'crm_notes', id: `m${i}`, donnees: { texte: `n${i}` } })));
    assert.equal(collections.crm_notes.filter((n) => n.id.startsWith('m')).length, 450);
    await restaurerOperation({ donnees, ctx: ctx(), operationId: r.operationId, apercu: false });
    assert.equal(collections.crm_notes.filter((n) => n.id.startsWith('m')).length, 0);
  });
});
