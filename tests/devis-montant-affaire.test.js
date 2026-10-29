// Montant de l'affaire (29/10/2026, règle D17) : la somme HT des devis ACCEPTÉS est écrite par le serveur dans `montantDevisHt` de l'affaire ;
// le montant estimé (`montant`, saisi à la main) n'est jamais touché. Tous les écrans lisent le résultat avec `montantAffaire` (js/modules/crm/logique.js).
// Accès aux données EN MÉMOIRE (comme devis-serveur.test.js). Les noms des tests commencent par le numéro du cas.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { creerAccesMemoire, COLLECTIONS as C } from '../functions/src/coeur/donnees.js';
import * as S from '../functions/src/coeur/devis.js';
import { nouveauDevis, montantAccepteHt } from '../functions/partage/devis.js';
import * as L from '../functions/partage/logique.js';
import * as LEcran from '../js/modules/crm/logique.js';

const ACTEUR = 'jerome.chevalier@gmail.com';
const MAINTENANT = new Date('2026-10-29T10:00:00Z');
const ctx = () => ({ acteur: ACTEUR, via: 'ecran', maintenant: MAINTENANT });

function monde({ affaire = { id: 'aff1', titre: 'Rénovation', montant: 1500 }, devis = [] } = {}) {
  const collections = { [C.devis]: devis, [C.affaires]: affaire ? [affaire] : [], [C.devisCompteurs]: [], [C.devisParametres]: [{ id: 'reglages', regimeTva: 'assujetti' }], [C.audit]: [], [C.auditAvant]: [] };
  return { collections, donnees: creerAccesMemoire(collections) };
}
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

describe('N1 montantAccepteHt : la règle pure', () => {
  const d = (statutDevis, ht, extra = {}) => ({ statut: statutDevis, totaux: { ht }, ...extra });
  test('N1 aucun devis accepté (ou rien du tout) : null, jamais 0', () => {
    assert.equal(montantAccepteHt([]), null);
    assert.equal(montantAccepteHt(undefined), null);
    assert.equal(montantAccepteHt([d('envoye', 100), d('refuse', 200), d('remplace', 300), d('brouillon', 400), d('en_attente_envoi', 500)]), null);
  });
  test('N1 la somme HT des devis acceptés, au centime (pas d’erreur de virgule flottante) ; archivés et totaux illisibles écartés', () => {
    assert.equal(montantAccepteHt([d('accepte', 0.1), d('accepte', 0.2), d('accepte', 100.05)]), 100.35);
    assert.equal(montantAccepteHt([d('accepte', 1000), d('accepte', 500, { archive: true }), d('envoye', 9999)]), 1000);
    assert.equal(montantAccepteHt([d('accepte', 1000), { statut: 'accepte', totaux: {} }, { statut: 'accepte' }, d('accepte', Number.NaN)]), 1000);
    assert.equal(montantAccepteHt([d('accepte', 0)]), 0); // un devis accepté à 0 € est une vraie valeur
  });
});

describe('N2 accepter un devis écrit le montant dans l’affaire', () => {
  test('N2 accepté : montantDevisHt = son HT, le montant estimé reste intact, et le journal garde la ligne de l’affaire', async () => {
    const m = monde({ devis: [brouillon('d1', 100)] }); // 100 x 12 = 1 200 € HT
    await envoye(m, 'd1');
    assert.equal(affaireDe(m).montantDevisHt, undefined, 'avant l’acceptation, rien n’est écrit');
    const r = await statut(m, 'd1', 'accepter');
    assert.equal(r.ok, true);
    assert.equal(affaireDe(m).montantDevisHt, 1200);
    assert.equal(affaireDe(m).montant, 1500, 'le montant estimé n’est jamais écrasé');
    const ligneJournal = m.collections[C.audit].find((l) => l.collection === C.affaires && l.outil === 'devisChangerStatut');
    assert.ok(ligneJournal, 'le journal a une ligne pour l’affaire');
    assert.deepEqual(ligneJournal.champsModifies, ['montantDevisHt']);
    const copie = m.collections[C.auditAvant].find((l) => l.docId === 'aff1');
    assert.equal(copie.avant.montantDevisHt, undefined);
    assert.equal(copie.apres.montantDevisHt, 1200);
  });
  test('N2 deux devis acceptés (deux racines) : la somme ; une affaire sans montant estimé reçoit aussi le montant', async () => {
    const m = monde({ affaire: { id: 'aff1', titre: 'Rénovation' }, devis: [brouillon('d1', 100), brouillon('d2', 50)] });
    await envoye(m, 'd1'); await envoye(m, 'd2');
    await statut(m, 'd1', 'accepter');
    assert.equal(affaireDe(m).montantDevisHt, 1200);
    await statut(m, 'd2', 'accepter');
    assert.equal(affaireDe(m).montantDevisHt, 1800); // 1 200 + 600
    assert.equal(affaireDe(m).montant, undefined);
  });
  test('N2 deux acceptations lancées ensemble (le vrai essai de concurrence est C8, sur l’émulateur) : le total final est la somme des deux', async () => {
    const m = monde({ devis: [brouillon('d1', 100), brouillon('d2', 50)] });
    await envoye(m, 'd1'); await envoye(m, 'd2');
    await Promise.all([statut(m, 'd1', 'accepter'), statut(m, 'd2', 'accepter')]);
    assert.equal(affaireDe(m).montantDevisHt, 1800);
  });
  test('N2 accepter la v2 d’un devis : la v1 passe à « Remplacé » et seule la v2 compte', async () => {
    const m = monde({ devis: [brouillon('v1', 100)] });
    await envoye(m, 'v1');
    const v2 = await S.nouvelleVersion({ donnees: m.donnees, ctx: ctx(), devisId: 'v1' });
    const id2 = v2.devis.id;
    m.collections[C.devis].find((d) => d.id === id2).sections[0].lignes[0].quantite = 50;
    await envoye(m, id2);
    await statut(m, id2, 'accepter');
    assert.equal(leStatut(m, 'v1'), 'remplace');
    assert.equal(affaireDe(m).montantDevisHt, 600);
  });
});
const leStatut = (m, id) => m.collections[C.devis].find((d) => d.id === id).statut;

describe('N3 archiver un devis accepté fait revenir le montant estimé', () => {
  test('N3 archivé : montantDevisHt revient à null (le montant estimé s’affiche de nouveau) ; désarchivé : il compte encore', async () => {
    const m = monde({ devis: [brouillon('d1', 100)] });
    await envoye(m, 'd1'); await statut(m, 'd1', 'accepter');
    assert.equal(affaireDe(m).montantDevisHt, 1200);
    await S.archiver({ donnees: m.donnees, ctx: ctx(), devisId: 'd1', archive: true });
    assert.equal(affaireDe(m).montantDevisHt, null);
    assert.equal(LEcran.montantAffaire(affaireDe(m)), 1500, 'l’écran retombe sur le montant estimé');
    assert.equal(LEcran.montantVientDesDevis(affaireDe(m)), false);
    await S.archiver({ donnees: m.donnees, ctx: ctx(), devisId: 'd1', archive: false });
    assert.equal(affaireDe(m).montantDevisHt, 1200);
    assert.equal(affaireDe(m).montant, 1500);
  });
  test('N3 archiver un devis accepté parmi deux : il ne reste que l’autre', async () => {
    const m = monde({ devis: [brouillon('d1', 100), brouillon('d2', 50)] });
    await envoye(m, 'd1'); await envoye(m, 'd2');
    await statut(m, 'd1', 'accepter'); await statut(m, 'd2', 'accepter');
    await S.archiver({ donnees: m.donnees, ctx: ctx(), devisId: 'd1', archive: true });
    assert.equal(affaireDe(m).montantDevisHt, 600);
  });
});

describe('N4 ce qui ne doit pas toucher l’affaire', () => {
  test('N4 refuser, archiver un devis refusé, finaliser, marquer envoyé, créer une version, supprimer un brouillon : l’affaire n’est pas réécrite', async () => {
    const m = monde({ devis: [brouillon('d1', 100), brouillon('d2', 50), brouillon('d3', 10)] });
    const avant = JSON.stringify(m.collections[C.affaires]);
    await envoye(m, 'd1');
    await statut(m, 'd1', 'refuser');
    await S.archiver({ donnees: m.donnees, ctx: ctx(), devisId: 'd1', archive: true });
    await envoye(m, 'd2');
    await S.nouvelleVersion({ donnees: m.donnees, ctx: ctx(), devisId: 'd2' });
    await S.supprimer({ donnees: m.donnees, ctx: ctx(), devisId: 'd3' });
    assert.equal(JSON.stringify(m.collections[C.affaires]), avant);
    assert.equal(m.collections[C.audit].some((l) => l.collection === C.affaires), false);
  });
  test('N4 aucune migration : un devis accepté AVANT cette fonction ne change pas l’affaire tant qu’un de ses devis n’est pas accepté ou archivé', async () => {
    const ancien = { ...brouillon('vieux', 100), statut: 'accepte', accepteLe: new Date('2026-09-01T10:00:00Z'), numero: 'DEV-2026-09-01-001', totaux: { ht: 1200, ttc: 1440 } };
    const m = monde({ devis: [ancien, brouillon('d2', 50)] });
    const avant = JSON.stringify(m.collections[C.affaires]);
    await envoye(m, 'd2');
    assert.equal(JSON.stringify(m.collections[C.affaires]), avant, 'rien n’est recalculé tant qu’on n’accepte pas');
    await statut(m, 'd2', 'accepter');
    assert.equal(affaireDe(m).montantDevisHt, 1800, 'à la prochaine acceptation, l’ancien devis accepté compte aussi');
  });
  test('N4 une affaire introuvable (supprimée) : l’acceptation réussit, rien n’est inventé ni recréé', async () => {
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

describe('N5 montantAffaire : la lecture commune à tous les écrans', () => {
  test('N5 devis acceptés d’abord, sinon le montant estimé, sinon null ; le montant estimé n’est jamais perdu', () => {
    assert.equal(LEcran.montantAffaire({ montant: 1500 }), 1500);
    assert.equal(LEcran.montantAffaire({ montant: 1500, montantDevisHt: null }), 1500);
    assert.equal(LEcran.montantAffaire({ montant: 1500, montantDevisHt: 1200 }), 1200);
    assert.equal(LEcran.montantAffaire({ montant: 1500, montantDevisHt: 0 }), 0);
    assert.equal(LEcran.montantAffaire({ montantDevisHt: 800 }), 800);
    assert.equal(LEcran.montantAffaire({}), null);
    assert.equal(LEcran.montantAffaire({ montant: null }), null);
    assert.equal(LEcran.montantAffaire({ montant: '' }), null);
    assert.equal(LEcran.montantAffaire(undefined), null);
    assert.equal(LEcran.montantAffaire({ montant: 1500, montantDevisHt: -5000 }), 1500, 'une valeur négative écrite à la main est ignorée');
    assert.equal(LEcran.montantVientDesDevis({ montantDevisHt: 0 }), true);
    assert.equal(LEcran.montantVientDesDevis({ montantDevisHt: null, montant: 5 }), false);
  });
  test('N5 le total de colonne et le chiffre d’affaires signé du mois comptent le même montant que la fiche', () => {
    const gagnee = { etape: 'etape_5', statut: 'gagnee', datesEtapes: { etape_5: new Date('2026-10-10T10:00:00Z') } };
    const affaires = [{ id: 'a', montant: 1500, montantDevisHt: 1200, ...gagnee }, { id: 'b', montant: 300, ...gagnee }, { id: 'c', ...gagnee }];
    assert.deepEqual(LEcran.totauxColonne(affaires), { nombre: 3, montant: 1500 });
    assert.equal(LEcran.CALCULS.ca_signe.calculer({ affaires, config: LEcran.CONFIG_NEUTRE }, '2026-10'), 1500); // 1 200 (devis acceptés) + 300 (estimé) + 0
  });
  test('N5 la copie du serveur (functions/partage) lit pareil que l’écran', () => {
    assert.equal(L.montantAffaire({ montant: 1500, montantDevisHt: 1200 }), 1200);
    assert.equal(L.montantAffaire({ montant: 1500 }), 1500);
  });
});

describe('N6 restaurer_depuis_audit ne défait pas un archivage de devis signé', () => {
  test('N6 l’opération d’archivage (devis + affaire) est refusée, même avec forcer ; rien n’est écrit', async () => {
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
