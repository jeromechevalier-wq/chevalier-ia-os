// Montant de l'affaire (29/10/2026, règle D17, docs/montant-affaire.md) : le serveur écrit dans l'affaire le montant calculé d'après les devis (`montantDevisHt`, `montantDevisNature`, `montantDevisDetail`) :
// somme HT des devis acceptés, sinon HT du devis proposé le plus récent. Le montant saisi à la main (`montant`) n'est jamais touché. Tous les écrans lisent le résultat avec `montantAffaire` (js/modules/crm/logique.js).
// Accès aux données EN MÉMOIRE (comme devis-serveur.test.js). Les noms des tests commencent par le numéro du cas.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { creerAccesMemoire, COLLECTIONS as C } from '../functions/src/coeur/donnees.js';
import * as S from '../functions/src/coeur/devis.js';
import { nouveauDevis, montantAccepteHt, montantDesDevis } from '../functions/partage/devis.js';
import * as L from '../functions/partage/logique.js';
import * as LEcran from '../js/modules/crm/logique.js';

const ACTEUR = 'jerome.chevalier@gmail.com';
const MAINTENANT = new Date('2026-10-29T10:00:00Z');
const ctx = () => ({ acteur: ACTEUR, via: 'ecran', maintenant: MAINTENANT });

function monde({ affaire = { id: 'aff1', titre: 'Rénovation', montant: 1500 }, devis = [] } = {}) {
  const collections = { [C.devis]: devis, [C.affaires]: affaire ? [affaire] : [], [C.devisCompteurs]: [], [C.devisParametres]: [{ id: 'reglages', regimeTva: 'assujetti' }], [C.audit]: [], [C.auditAvant]: [] };
  return { collections, donnees: creerAccesMemoire(collections) };
}
const leDevis = (m, id) => m.collections[C.devis].find((d) => d.id === id);
const affaireDe = (m, id = 'aff1') => m.collections[C.affaires].find((a) => a.id === id);
/** Brouillon dont le HT final est `quantite` x 12 € (prix d'achat 10 €, marge 20 %). */
function brouillon(id, quantite, extra = {}) {
  const d = nouveauDevis({ destinataires: [{ email: 'client@exemple.test' }], affaireId: 'aff1' }, { id, maintenant: MAINTENANT, auteur: ACTEUR }, { marge: 20, margeDevis: 20 });
  return { ...d, sections: [{ id: `s-${id}`, titre: 'Travaux', lignes: [{ id: `l-${id}`, libelle: 'Article', unite: 'u', quantite, prixAchat: 10 }] }], ...extra };
}
const statut = (m, devisId, action) => S.changerStatut({ donnees: m.donnees, ctx: ctx(), devisId, action });
/** Finalise puis marque envoyé : le devis est prêt à être accepté. */
async function envoye(m, id) {
  await S.finaliser({ donnees: m.donnees, ctx: ctx(), devisId: id });
  await statut(m, id, 'marquer_envoye');
}

describe('N1 montantDesDevis : la règle pure', () => {
  const d = (id, statutDevis, ht, extra = {}) => ({ id, statut: statutDevis, numero: `DEV-${id}`, version: 1, finaliseLe: new Date('2026-10-20T10:00:00Z'), totaux: { ht }, ...extra });
  test('N1 aucun devis qui compte (rien, brouillons, refusés, remplacés, archivés) : null, jamais 0', () => {
    assert.equal(montantDesDevis([]), null);
    assert.equal(montantDesDevis(undefined), null);
    assert.equal(montantDesDevis([d('a', 'brouillon', 400), d('b', 'refuse', 200), d('c', 'remplace', 300), d('e', 'accepte', 50, { archive: true }), d('n', 'envoye', -10)]), null); // un total négatif est ignoré
  });
  test('N1 devis acceptés : leur somme HT au centime (pas d’erreur de virgule), détail avec les numéros ; les archivés et les totaux illisibles sont écartés', () => {
    const r = montantDesDevis([d('a', 'accepte', 0.1), d('b', 'accepte', 0.2, { finaliseLe: new Date('2026-10-21T10:00:00Z') }), d('c', 'accepte', 100.05), d('x', 'accepte', 9, { archive: true }), { id: 'y', statut: 'accepte', totaux: {} }, d('z', 'accepte', Number.NaN)]);
    assert.equal(r.montant, 100.35);
    assert.equal(r.nature, 'accepte');
    assert.deepEqual(r.detail.map((l) => [l.numero, l.ht, l.compte]), [['DEV-b', 0.2, true], ['DEV-c', 100.05, true], ['DEV-a', 0.1, true]]);
    assert.equal(montantDesDevis([d('a', 'accepte', 0)]).montant, 0); // un devis accepté à 0 € est une vraie valeur
  });
  test('N1 les devis acceptés passent avant les devis proposés', () => {
    const r = montantDesDevis([d('p', 'envoye', 9999, { finaliseLe: new Date('2026-10-25T10:00:00Z') }), d('a', 'accepte', 1200)]);
    assert.deepEqual([r.montant, r.nature, r.detail.length], [1200, 'accepte', 1]);
  });
  test('N1 sans devis accepté : le devis proposé le plus récent SEUL (deux offres ne s’additionnent jamais), les autres sont listés « non comptés »', () => {
    const r = montantDesDevis([
      d('v1', 'envoye', 900, { finaliseLe: new Date('2026-10-20T10:00:00Z') }),
      d('v2', 'en_attente_envoi', 1200, { finaliseLe: new Date('2026-10-22T10:00:00Z'), version: 2 }),
      d('refus', 'refuse', 5000, { finaliseLe: new Date('2026-10-23T10:00:00Z') }),
    ]);
    assert.deepEqual([r.montant, r.nature], [1200, 'propose']);
    assert.deepEqual(r.detail.map((l) => [l.numero, l.version, l.ht, l.compte]), [['DEV-v2', 2, 1200, true], ['DEV-v1', 1, 900, false]]);
  });
  test('N1 à date égale : la version la plus haute, puis l’identifiant ; dates Firestore (Timestamp) ou texte comprises', () => {
    const t = { toMillis: () => Date.parse('2026-10-22T10:00:00Z') };
    assert.equal(montantDesDevis([d('a', 'envoye', 1, { finaliseLe: t }), d('b', 'envoye', 2, { finaliseLe: '2026-10-22T10:00:00Z', version: 2 })]).montant, 2);
    assert.equal(montantDesDevis([d('a', 'envoye', 1), d('b', 'envoye', 2)]).montant, 2); // même date, même version : id le plus grand
  });
  test('N1 montantAccepteHt reste la somme HT des acceptés seulement', () => {
    assert.equal(montantAccepteHt([d('a', 'envoye', 100), d('b', 'accepte', 40)]), 40);
    assert.equal(montantAccepteHt([d('a', 'envoye', 100)]), null);
  });
});

describe('N2 chaque transition d’un devis met le montant de l’affaire à jour', () => {
  test('N2 finaliser : le devis devient « proposé » (HT, nature, détail) ; le montant saisi reste intact ; le journal garde la ligne de l’affaire', async () => {
    const m = monde({ devis: [brouillon('d1', 100)] }); // 100 x 12 = 1 200 € HT
    assert.equal(affaireDe(m).montantDevisHt, undefined, 'un brouillon ne compte pas');
    await S.finaliser({ donnees: m.donnees, ctx: ctx(), devisId: 'd1' });
    assert.equal(affaireDe(m).montantDevisHt, 1200);
    assert.equal(affaireDe(m).montantDevisNature, 'propose');
    assert.deepEqual(affaireDe(m).montantDevisDetail.map((l) => [l.numero, l.ht, l.compte]), [[leDevis(m, 'd1').numero, 1200, true]]);
    assert.equal(affaireDe(m).montant, 1500, 'le montant saisi n’est jamais écrasé');
    const ligne = m.collections[C.audit].find((l) => l.collection === C.affaires && l.outil === 'devisFinaliser');
    assert.ok(ligne, 'le journal a une ligne pour l’affaire');
    assert.deepEqual(ligne.champsModifies, ['montantDevisHt', 'montantDevisNature', 'montantDevisDetail']);
  });
  test('N2 marquer envoyé : le montant ne change pas, donc l’affaire n’est pas réécrite ; accepter : il passe à « accepte »', async () => {
    const m = monde({ devis: [brouillon('d1', 100)] });
    await S.finaliser({ donnees: m.donnees, ctx: ctx(), devisId: 'd1' });
    const nbAvant = m.collections[C.audit].filter((l) => l.collection === C.affaires).length;
    await statut(m, 'd1', 'marquer_envoye');
    assert.equal(m.collections[C.audit].filter((l) => l.collection === C.affaires).length, nbAvant);
    await statut(m, 'd1', 'accepter');
    assert.deepEqual([affaireDe(m).montantDevisHt, affaireDe(m).montantDevisNature], [1200, 'accepte']);
    assert.equal(affaireDe(m).montant, 1500);
  });
  test('N2 deux devis proposés : le plus récent seul ; accepter l’ancien : les devis acceptés prennent le dessus', async () => {
    const m = monde({ devis: [brouillon('d1', 100), brouillon('d2', 50)] });
    await S.finaliser({ donnees: m.donnees, ctx: { ...ctx(), maintenant: new Date('2026-10-28T10:00:00Z') }, devisId: 'd1' });
    await S.finaliser({ donnees: m.donnees, ctx: { ...ctx(), maintenant: new Date('2026-10-29T09:00:00Z') }, devisId: 'd2' });
    assert.deepEqual([affaireDe(m).montantDevisHt, affaireDe(m).montantDevisNature], [600, 'propose']);
    assert.deepEqual(affaireDe(m).montantDevisDetail.map((l) => l.compte), [true, false]);
    await statut(m, 'd1', 'marquer_envoye');
    await statut(m, 'd1', 'accepter');
    assert.deepEqual([affaireDe(m).montantDevisHt, affaireDe(m).montantDevisNature], [1200, 'accepte']);
  });
  test('N2 deux devis acceptés (deux racines) : la somme', async () => {
    const m = monde({ affaire: { id: 'aff1', titre: 'Rénovation' }, devis: [brouillon('d1', 100), brouillon('d2', 50)] });
    await envoye(m, 'd1'); await envoye(m, 'd2');
    await statut(m, 'd1', 'accepter');
    await statut(m, 'd2', 'accepter');
    assert.equal(affaireDe(m).montantDevisHt, 1800);
    assert.equal(affaireDe(m).montant, undefined);
  });
  test('N2 deux acceptations lancées ensemble (le vrai essai de concurrence est C8, sur l’émulateur) : le total final est la somme des deux', async () => {
    const m = monde({ devis: [brouillon('d1', 100), brouillon('d2', 50)] });
    await envoye(m, 'd1'); await envoye(m, 'd2');
    await Promise.all([statut(m, 'd1', 'accepter'), statut(m, 'd2', 'accepter')]);
    assert.equal(affaireDe(m).montantDevisHt, 1800);
  });
  test('N2 nouvelle version : v1 reste proposée (le brouillon v2 ne compte pas) ; finaliser v2 remplace v1 et c’est v2 qui compte', async () => {
    const m = monde({ devis: [brouillon('v1', 100)] });
    await envoye(m, 'v1');
    const v2 = await S.nouvelleVersion({ donnees: m.donnees, ctx: ctx(), devisId: 'v1' });
    const id2 = v2.devis.id;
    assert.equal(affaireDe(m).montantDevisHt, 1200, 'le brouillon v2 ne change rien');
    m.collections[C.devis].find((d) => d.id === id2).sections[0].lignes[0].quantite = 50;
    await S.finaliser({ donnees: m.donnees, ctx: { ...ctx(), maintenant: new Date('2026-10-30T10:00:00Z') }, devisId: id2 });
    assert.equal(leStatut(m, 'v1'), 'remplace');
    assert.deepEqual([affaireDe(m).montantDevisHt, affaireDe(m).montantDevisNature], [600, 'propose']);
    assert.equal(affaireDe(m).montantDevisDetail.length, 1);
  });
  test('N2b un devis FINALISÉ jamais envoyé : le refuser ou l’archiver fait disparaître le montant calculé (retour au montant saisi)', async () => {
    for (const sortie of ['refuser', 'archiver']) {
      const m = monde({ devis: [brouillon('d1', 100)] });
      await S.finaliser({ donnees: m.donnees, ctx: ctx(), devisId: 'd1' });
      assert.deepEqual([affaireDe(m).montantDevisHt, affaireDe(m).montantDevisNature], [1200, 'propose'], 'finalisé : compté comme proposé');
      if (sortie === 'refuser') await statut(m, 'd1', 'refuser');
      else await S.archiver({ donnees: m.donnees, ctx: ctx(), devisId: 'd1', archive: true });
      assert.deepEqual([affaireDe(m).montantDevisHt, affaireDe(m).montantDevisNature, affaireDe(m).montantDevisDetail], [null, null, null], sortie);
      assert.equal(LEcran.montantAffaire(affaireDe(m)), 1500, sortie);
    }
  });
  test('N2c un devis archivé ne change plus de statut (sinon un signé archivé serait ignoré du montant)', async () => {
    const m = monde({ devis: [brouillon('d1', 100)] });
    await S.finaliser({ donnees: m.donnees, ctx: ctx(), devisId: 'd1' });
    await S.archiver({ donnees: m.donnees, ctx: ctx(), devisId: 'd1', archive: true });
    await assert.rejects(() => S.changerStatut({ donnees: m.donnees, ctx: ctx(), devisId: 'd1', action: 'marquer_envoye' }), (e) => e.code === 'transition_interdite' && /archivé/.test(e.message));
    assert.equal(leStatut(m, 'd1'), 'en_attente_envoi');
  });
  test('N2 refuser le seul devis proposé : le montant calculé disparaît (null) et l’écran retombe sur le montant saisi', async () => {
    const m = monde({ devis: [brouillon('d1', 100)] });
    await envoye(m, 'd1');
    await statut(m, 'd1', 'refuser');
    assert.deepEqual([affaireDe(m).montantDevisHt, affaireDe(m).montantDevisNature, affaireDe(m).montantDevisDetail], [null, null, null]);
    assert.equal(LEcran.montantAffaire(affaireDe(m)), 1500);
  });
});
const leStatut = (m, id) => m.collections[C.devis].find((d) => d.id === id).statut;

describe('N3 archiver un devis accepté', () => {
  test('N3 archivé : retour au devis proposé s’il y en a un, sinon au montant saisi ; désarchivé : il compte de nouveau', async () => {
    const m = monde({ devis: [brouillon('d1', 100)] });
    await envoye(m, 'd1'); await statut(m, 'd1', 'accepter');
    assert.equal(affaireDe(m).montantDevisHt, 1200);
    await S.archiver({ donnees: m.donnees, ctx: ctx(), devisId: 'd1', archive: true });
    assert.equal(affaireDe(m).montantDevisHt, null);
    assert.equal(LEcran.montantAffaire(affaireDe(m)), 1500, 'l’écran retombe sur le montant saisi');
    await S.archiver({ donnees: m.donnees, ctx: ctx(), devisId: 'd1', archive: false });
    assert.deepEqual([affaireDe(m).montantDevisHt, affaireDe(m).montantDevisNature], [1200, 'accepte']);
    assert.equal(affaireDe(m).montant, 1500);
  });
  test('N3 un devis accepté archivé parmi deux : il ne reste que l’autre', async () => {
    const m = monde({ devis: [brouillon('d1', 100), brouillon('d2', 50)] });
    await envoye(m, 'd1'); await envoye(m, 'd2');
    await statut(m, 'd1', 'accepter'); await statut(m, 'd2', 'accepter');
    await S.archiver({ donnees: m.donnees, ctx: ctx(), devisId: 'd1', archive: true });
    assert.equal(affaireDe(m).montantDevisHt, 600);
  });
});

describe('N4 ce qui ne doit pas changer l’affaire', () => {
  test('N4 un brouillon créé, supprimé ou en nouvelle version, et l’archivage d’un devis refusé : l’affaire n’est pas réécrite', async () => {
    const m = monde({ devis: [brouillon('d1', 100), brouillon('d3', 10)] });
    await envoye(m, 'd1');
    const nb = () => m.collections[C.audit].filter((l) => l.collection === C.affaires).length;
    const avant = nb();
    await S.nouvelleVersion({ donnees: m.donnees, ctx: ctx(), devisId: 'd1' });
    await S.supprimer({ donnees: m.donnees, ctx: ctx(), devisId: 'd3' });
    assert.equal(nb(), avant);
    await statut(m, 'd1', 'refuser');
    const avantArchive = nb();
    await S.archiver({ donnees: m.donnees, ctx: ctx(), devisId: 'd1', archive: true });
    assert.equal(nb(), avantArchive, 'un devis refusé archivé ne change pas le montant (déjà null)');
  });
  test('N4 aucune migration : un devis accepté AVANT cette fonction ne change pas l’affaire tant qu’aucun de ses devis ne change', async () => {
    const ancien = { ...brouillon('vieux', 100), statut: 'accepte', accepteLe: new Date('2026-09-01T10:00:00Z'), finaliseLe: new Date('2026-08-30T10:00:00Z'), numero: 'DEV-2026-09-01-001', totaux: { ht: 1200, ttc: 1440 } };
    const m = monde({ devis: [ancien, brouillon('d2', 50)] });
    const avant = JSON.stringify(m.collections[C.affaires]);
    await S.supprimer({ donnees: m.donnees, ctx: ctx(), devisId: 'd2' }); // un brouillon supprimé : l'ancien devis accepté n'est PAS recalculé (rien ne change pour l'affaire)
    assert.equal(JSON.stringify(m.collections[C.affaires]), avant);
    m.collections[C.devis].push(brouillon('d2', 50));
    await envoye(m, 'd2');
    await statut(m, 'd2', 'accepter');
    assert.equal(affaireDe(m).montantDevisHt, 1800, 'à la première transition, l’ancien devis accepté compte aussi');
  });
  test('N4 une affaire introuvable (supprimée) : la transition réussit, rien n’est inventé ni recréé', async () => {
    const m = monde({ affaire: null, devis: [brouillon('d1', 100)] });
    await envoye(m, 'd1');
    assert.equal((await statut(m, 'd1', 'accepter')).ok, true);
    assert.equal(m.collections[C.affaires].length, 0);
  });
  test('N4 un devis d’une autre affaire ne compte pas', async () => {
    const m = monde({ devis: [brouillon('d1', 100), { ...brouillon('d2', 50), affaireId: 'autre' }] });
    await envoye(m, 'd1'); await envoye(m, 'd2');
    await statut(m, 'd2', 'accepter');
    await statut(m, 'd1', 'accepter');
    assert.equal(affaireDe(m).montantDevisHt, 1200);
  });
});

describe('N7 recalcul général (outil recalculer_montants_affaires)', () => {
  const ancien = (id, affaireId, extra = {}) => ({ ...brouillon(id, 100, { affaireId }), statut: 'accepte', accepteLe: new Date('2026-09-01T10:00:00Z'), finaliseLe: new Date('2026-08-30T10:00:00Z'), numero: `DEV-2026-09-01-${id}`, totaux: { ht: 1200, ttc: 1440 }, ...extra });
  const monde3 = () => {
    const m = monde({ devis: [ancien('001', 'aff1'), ancien('002', 'aff2', { statut: 'envoye', accepteLe: undefined })] });
    m.collections[C.affaires].push({ id: 'aff2', titre: 'Deuxième', montant: 700 }); // devis proposé, jamais calculé
    m.collections[C.affaires].push({ id: 'aff3', titre: 'Périmée', montant: 300, montantDevisHt: 999, montantDevisNature: 'accepte', montantDevisDetail: [{ numero: 'DEV-X', version: 1, ht: 999, compte: true }] }); // plus aucun devis
    m.collections[C.affaires].push({ id: 'aff4', titre: 'Sans devis', montant: 50 });
    return m;
  };
  test('N7 l’aperçu liste les affaires à corriger (avant, après) et n’écrit RIEN', async () => {
    const m = monde3();
    const avant = JSON.stringify(m.collections);
    const r = await S.recalculerMontantsAffaires({ donnees: m.donnees, ctx: ctx(), appliquer: false });
    assert.equal(JSON.stringify(m.collections), avant);
    assert.equal(r.total, 3);
    assert.deepEqual(r.lignes.map((l) => [l.affaireId, l.avant.ht, l.apres.ht, l.apres.nature]), [['aff1', null, 1200, 'accepte'], ['aff2', null, 1200, 'propose'], ['aff3', 999, null, null]]);
  });
  test('N7 appliqué : seuls montantDevisHt, montantDevisNature et montantDevisDetail changent (le montant saisi jamais), une ligne de journal par affaire corrigée', async () => {
    const m = monde3();
    const r = await S.recalculerMontantsAffaires({ donnees: m.donnees, ctx: ctx(), appliquer: true });
    assert.equal(r.operations.length, 3);
    assert.deepEqual(['aff1', 'aff2', 'aff3', 'aff4'].map((id) => affaireDe(m, id).montant), [1500, 700, 300, 50], 'le montant saisi est intact');
    assert.deepEqual([affaireDe(m, 'aff1').montantDevisHt, affaireDe(m, 'aff1').montantDevisNature], [1200, 'accepte']);
    assert.deepEqual([affaireDe(m, 'aff2').montantDevisHt, affaireDe(m, 'aff2').montantDevisNature], [1200, 'propose']);
    assert.deepEqual([affaireDe(m, 'aff3').montantDevisHt, affaireDe(m, 'aff3').montantDevisNature, affaireDe(m, 'aff3').montantDevisDetail], [null, null, null], 'calcul périmé : remis à zéro');
    assert.equal(Object.keys(affaireDe(m, 'aff4')).sort().join(), 'id,montant,titre', 'une affaire sans devis n’est pas touchée');
    const lignes = m.collections[C.audit].filter((l) => l.outil === 'devisRecalculMontant');
    assert.deepEqual(lignes.map((l) => l.docId).sort(), ['aff1', 'aff2', 'aff3']);
    assert.ok(lignes.every((l) => l.collection === C.affaires && l.champsModifies.every((c) => c.startsWith('montantDevis'))));
  });
  test('N7 le journal du recalcul ne se restaure pas (restaurer_depuis_audit refuse, même avec forcer) et l’écriture d’après un aperçu ne reprend que les affaires données', async () => {
    const m = monde3();
    const { restaurerOperation } = await import('../functions/src/coeur/restaurer.js');
    const r = await S.recalculerMontantsAffaires({ donnees: m.donnees, ctx: ctx(), appliquer: true, affaireIds: ['aff2'] });
    assert.deepEqual([r.operations.length, affaireDe(m, 'aff1').montantDevisHt, affaireDe(m, 'aff2').montantDevisNature], [1, undefined, 'propose'], 'seule l’affaire donnée est écrite');
    for (const forcer of [false, true]) {
      await assert.rejects(() => restaurerOperation({ donnees: m.donnees, ctx: ctx(), operationId: r.operations[0], apercu: false, forcer }), (e) => e.code === 'restauration_refusee');
    }
  });
  test('N7 idempotent : relancé, il ne trouve plus rien et n’écrit ni affaire ni journal', async () => {
    const m = monde3();
    await S.recalculerMontantsAffaires({ donnees: m.donnees, ctx: ctx(), appliquer: true });
    const avant = JSON.stringify(m.collections);
    const r = await S.recalculerMontantsAffaires({ donnees: m.donnees, ctx: ctx(), appliquer: true });
    assert.deepEqual([r.total, r.operations.length], [0, 0]);
    assert.equal(JSON.stringify(m.collections), avant);
  });
  test('N7 un devis dont l’affaire n’existe plus est ignoré : rien n’est créé', async () => {
    const m = monde({ affaire: null, devis: [ancien('001', 'aff1')] });
    const r = await S.recalculerMontantsAffaires({ donnees: m.donnees, ctx: ctx(), appliquer: true });
    assert.equal(r.total, 0);
    assert.equal(m.collections[C.affaires].length, 0);
  });
});

describe('N5 la lecture commune à tous les écrans', () => {
  test('N5 montantAffaire : calculé d’abord, sinon saisi, sinon null ; une valeur négative ou illisible est ignorée', () => {
    assert.equal(LEcran.montantAffaire({ montant: 1500 }), 1500);
    assert.equal(LEcran.montantAffaire({ montant: 1500, montantDevisHt: null }), 1500);
    assert.equal(LEcran.montantAffaire({ montant: 1500, montantDevisHt: 1200 }), 1200);
    assert.equal(LEcran.montantAffaire({ montant: 1500, montantDevisHt: 0 }), 0);
    assert.equal(LEcran.montantAffaire({ montant: 1500, montantDevisHt: -5000 }), 1500);
    assert.equal(LEcran.montantAffaire({ montantDevisHt: 800 }), 800);
    assert.equal(LEcran.montantAffaire({}), null);
    assert.equal(LEcran.montantAffaire({ montant: '' }), null);
    assert.equal(LEcran.montantAffaire(undefined), null);
  });
  test('N5 natureMontant et libellés : accepté, proposé (sans nature écrite : accepté), ou estimé', () => {
    assert.equal(LEcran.natureMontant({ montant: 5 }), 'estime');
    assert.equal(LEcran.natureMontant({ montantDevisHt: 10, montantDevisNature: 'propose' }), 'propose');
    assert.equal(LEcran.natureMontant({ montantDevisHt: 10, montantDevisNature: 'accepte' }), 'accepte');
    assert.equal(LEcran.natureMontant({ montantDevisHt: 10 }), 'accepte');
    assert.deepEqual(LEcran.LIBELLES_MONTANT, { accepte: 'Montant accepté HT', propose: 'Montant proposé HT', estime: 'Montant estimé' });
  });
  test('N5 l’infobulle donne les vrais devis et les vraies additions', () => {
    const accepte = { montant: 1500, montantDevisHt: 2748.8, montantDevisNature: 'accepte', montantDevisDetail: [{ numero: 'DEV-2026-10-27-011', version: 1, ht: 2148.8, compte: true }, { numero: 'DEV-2026-10-28-012', version: 2, ht: 600, compte: true }] };
    assert.equal(LEcran.detailMontant(accepte), 'Devis acceptés : DEV-2026-10-27-011 : 2 148,80 € HT + DEV-2026-10-28-012 v2 : 600 € HT = 2 748,80 € HT.\nTon montant estimé (1 500 €) est gardé : il revient si plus aucun devis ne compte.');
    const propose = { montantDevisHt: 1200, montantDevisNature: 'propose', montantDevisDetail: [{ numero: 'DEV-B', version: 2, ht: 1200, compte: true }, { numero: 'DEV-A', version: 1, ht: 900, compte: false }] };
    assert.equal(LEcran.detailMontant(propose), 'Devis proposé le plus récent : DEV-B v2 : 1 200 € HT.\nNon compté (devis proposé plus ancien) : DEV-A : 900 € HT.\nAucun devis n’est encore accepté.');
    assert.equal(LEcran.detailMontant({ montant: 5 }), '');
    assert.equal(LEcran.detailMontant({ montantDevisHt: 10 }), 'Montant calculé d’après les devis : 10 € HT (le détail n’est pas disponible).'); // détail absent : on le dit, sans phrase vide
    assert.match(LEcran.detailMontant({ montantDevisHt: 99, montantDevisNature: 'accepte', montantDevisDetail: [{ numero: 'DEV-A', version: 1, ht: 10, compte: true }] }), /\(détail incomplet\) ; total : 99 € HT/); // jamais une addition fausse
  });
  test('N5 le total de colonne et le chiffre d’affaires signé du mois comptent le même montant que la fiche', () => {
    const gagnee = { etape: 'etape_5', statut: 'gagnee', datesEtapes: { etape_5: new Date('2026-10-10T10:00:00Z') } };
    const affaires = [{ id: 'a', montant: 1500, montantDevisHt: 1200, ...gagnee }, { id: 'b', montant: 300, ...gagnee }, { id: 'c', ...gagnee }];
    assert.deepEqual(LEcran.totauxColonne(affaires), { nombre: 3, montant: 1500 });
    assert.equal(LEcran.CALCULS.ca_signe.calculer({ affaires, config: LEcran.CONFIG_NEUTRE }, '2026-10'), 1500);
  });
  test('N5 la copie du serveur (functions/partage) lit pareil que l’écran', () => {
    assert.equal(L.montantAffaire({ montant: 1500, montantDevisHt: 1200 }), 1200);
    assert.equal(L.natureMontant({ montantDevisHt: 1, montantDevisNature: 'propose' }), 'propose');
  });
});

describe('N6 restaurer_depuis_audit ne défait pas une transition de devis qui a recalculé l’affaire', () => {
  test('N6 l’opération (devis + affaire) est refusée, même avec forcer ; rien n’est écrit', async () => {
    const { restaurerOperation } = await import('../functions/src/coeur/restaurer.js');
    const m = monde({ devis: [brouillon('d1', 100)] });
    await envoye(m, 'd1'); await statut(m, 'd1', 'accepter');
    const r = await S.archiver({ donnees: m.donnees, ctx: ctx(), devisId: 'd1', archive: true });
    const avant = JSON.stringify(m.collections[C.affaires]);
    for (const forcer of [false, true]) {
      await assert.rejects(() => restaurerOperation({ donnees: m.donnees, ctx: ctx(), operationId: r.operationId, apercu: false, forcer }), (e) => e.code === 'restauration_refusee');
    }
    assert.equal(JSON.stringify(m.collections[C.affaires]), avant);
  });
});
