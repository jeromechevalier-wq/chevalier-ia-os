// Liste des devis : fonctions pures de js/modules/devis/liste.js. Chaque test commence par le numéro du critère (L1 à L7).
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import * as Li from '../js/modules/devis/liste.js';

const AUJOURDHUI = '2026-10-24';
const MAINT = Date.parse('2026-10-24T10:00:00Z');
const d = (id, extra = {}) => ({ id, racineId: id, version: 1, statut: 'brouillon', numero: null, creeLe: new Date('2026-10-01T09:00:00Z'), modifieLe: new Date('2026-10-01T09:00:00Z'), expireLe: '2026-12-30', sections: [], ...extra });
const ids = (l) => l.map((x) => x.id);

describe('L1 tri', () => {
  const liste = [
    d('a', { modifieLe: new Date('2026-10-02T09:00:00Z'), numero: 'DEV-2026-10-02-001' }),
    d('b', { modifieLe: { seconds: Date.parse('2026-10-05T09:00:00Z') / 1000, nanoseconds: 0 }, numero: 'DEV-2026-10-05-002' }),
    d('c', { modifieLe: { toDate: () => new Date('2026-10-03T09:00:00Z') } }),
  ];
  test('L1 par défaut : modifié le plus récent d’abord (Date, Timestamp et { seconds } mélangés)', () => {
    assert.deepEqual(ids(Li.trier(liste)), ['b', 'c', 'a']);
  });
  test('L1 sens croissant, tri par numéro et par total ; l’original n’est pas modifié', () => {
    assert.deepEqual(ids(Li.trier(liste, { critere: 'modifie', sens: 'asc' })), ['a', 'c', 'b']);
    assert.deepEqual(ids(Li.trier(liste, { critere: 'numero', sens: 'asc' })), ['c', 'a', 'b']);
    const totaux = [d('x', { totaux: { ht: 100, ttc: 120 } }), d('y', { totaux: { ht: 300, ttc: 360 } })];
    assert.deepEqual(ids(Li.trier(totaux, { critere: 'ttc' })), ['y', 'x']);
    assert.deepEqual(ids(liste), ['a', 'b', 'c']);
  });
  test('L1 égalité : ordre toujours le même (identifiant)', () => {
    assert.deepEqual(ids(Li.trier([d('z'), d('m'), d('b')])), ['b', 'm', 'z']);
  });
  test('L1 initiales et « il y a »', () => {
    assert.equal(Li.initialesDe('jerome.chevalier@gmail.com'), 'JC');
    assert.equal(Li.initialesDe('ingrid@x.fr'), 'I');
    assert.equal(Li.initialesDe(''), '');
    assert.equal(Li.depuis(MAINT - 30000, MAINT), 'à l’instant');
    assert.equal(Li.depuis(MAINT - 5 * 60000, MAINT), 'il y a 5 min');
    assert.equal(Li.depuis(MAINT - 3 * 3600000, MAINT), 'il y a 3 h');
    assert.equal(Li.depuis(MAINT - 2 * 86400000, MAINT), 'il y a 2 j');
    assert.equal(Li.depuis(MAINT - 90 * 86400000, MAINT), 'il y a 3 mois');
    assert.equal(Li.depuis(null, MAINT), '');
  });
});

describe('L2 filtre statut et période', () => {
  const liste = [
    d('b1'),
    d('f1', { statut: 'en_attente_envoi', finaliseLe: new Date('2026-09-10T08:00:00Z') }),
    d('e1', { statut: 'envoye', finaliseLe: '2026-10-10' }),
    d('s1', { statut: 'accepte', finaliseLe: '2026-10-20' }),
  ];
  test('L2 statuts cochés : l’un ou l’autre ; rien de coché = tout', () => {
    assert.deepEqual(ids(Li.filtrer(liste, { statuts: ['brouillon', 'accepte'], aujourdhui: AUJOURDHUI })), ['b1', 's1']);
    assert.equal(Li.filtrer(liste, { aujourdhui: AUJOURDHUI }).length, 4);
  });
  test('L2 période sur « En date du » (finalisation, sinon création), bornes incluses', () => {
    assert.equal(Li.dateDuDevis(liste[0]), '2026-10-01');
    assert.equal(Li.dateDuDevis(liste[1]), '2026-09-10');
    assert.deepEqual(ids(Li.filtrer(liste, { du: '2026-10-01', au: '2026-10-10', aujourdhui: AUJOURDHUI })), ['b1', 'e1']);
    assert.deepEqual(ids(Li.filtrer(liste, { du: '2026-10-11', aujourdhui: AUJOURDHUI })), ['s1']);
    assert.deepEqual(ids(Li.filtrer(liste, { au: '2026-09-30', aujourdhui: AUJOURDHUI })), ['f1']);
  });
  test('L2 les filtres se combinent ; le filtre « Expiré » reconnaît un devis périmé', () => {
    assert.deepEqual(ids(Li.filtrer(liste, { statuts: ['envoye'], du: '2026-10-01', aujourdhui: AUJOURDHUI })), ['e1']);
    const perime = d('p', { statut: 'envoye', expireLe: '2026-10-01' });
    assert.deepEqual(ids(Li.filtrer([perime], { statuts: ['expire'], aujourdhui: AUJOURDHUI })), ['p']);
    assert.deepEqual(ids(Li.filtrer([perime], { statuts: ['envoye'], aujourdhui: AUJOURDHUI })), []);
  });
});

describe('L2 périodes', () => {
  test('L2 périodes prêtes : bornes depuis aujourd’hui', () => {
    assert.deepEqual(Li.bornesDePeriode('30j', '2026-10-24'), { du: '2026-09-24', au: '' });
    assert.deepEqual(Li.bornesDePeriode('mois', '2026-10-24'), { du: '2026-10-01', au: '' });
    assert.deepEqual(Li.bornesDePeriode('annee', '2026-10-24'), { du: '2026-01-01', au: '' });
    assert.deepEqual(Li.bornesDePeriode('toutes', '2026-10-24'), { du: '', au: '' });
  });
});

describe('L3 recherche', () => {
  const liste = [d('a', { numero: 'DEV-2026-10-02-001' }), d('b', { numero: 'DEV-2026-10-05-002' }), d('c')];
  const noms = (x) => ({ a: { client: 'Société Étoile', affaire: 'Rénovation cuisine' }, b: { client: 'Dupont', affaire: 'Salle de bain' }, c: {} }[x.id]);
  test('L3 par numéro, client ou affaire, sans accent ni majuscule', () => {
    assert.deepEqual(ids(Li.rechercher(liste, '002', noms)), ['b']);
    assert.deepEqual(ids(Li.rechercher(liste, 'societe etoile', noms)), ['a']);
    assert.deepEqual(ids(Li.rechercher(liste, 'SALLE', noms)), ['b']);
    assert.deepEqual(ids(Li.rechercher(liste, 'dupont bain', noms)), ['b']);
  });
  test('L3 texte vide = tout ; rien de trouvé = liste vide', () => {
    assert.equal(Li.rechercher(liste, '  ', noms).length, 3);
    assert.deepEqual(Li.rechercher(liste, 'zzz', noms), []);
  });
});

describe('L4 pagination', () => {
  const liste = Array.from({ length: 60 }, (_, i) => d(`d${i}`));
  test('L4 25 par défaut ; libellé « 1 à 25 sur 60 éléments »', () => {
    const p = Li.paginer(liste);
    assert.equal(p.lignes.length, 25);
    assert.equal(p.libelle, '1 à 25 sur 60 éléments');
    assert.equal(p.pages, 3);
  });
  test('L4 dernière page, page hors bornes ramenée, tailles 10 et 50', () => {
    assert.equal(Li.paginer(liste, 3).libelle, '51 à 60 sur 60 éléments');
    assert.equal(Li.paginer(liste, 99).page, 3);
    assert.equal(Li.paginer(liste, -4).page, 1);
    assert.equal(Li.paginer(liste, 1, 10).lignes.length, 10);
    assert.equal(Li.paginer(liste, 1, 50).pages, 2);
    assert.equal(Li.paginer(liste, 1, 7).parPage, 25, 'taille inconnue = défaut');
  });
  test('L4 « 1 à 2 sur 2 éléments », un seul, aucun', () => {
    assert.equal(Li.paginer([d('a'), d('b')]).libelle, '1 à 2 sur 2 éléments');
    assert.equal(Li.paginer([d('a')]).libelle, '1 à 1 sur 1 élément');
    assert.equal(Li.paginer([]).libelle, '0 élément');
    assert.equal(Li.paginer([]).pages, 1);
  });
});

describe('L5 regroupement par colonne', () => {
  test('L5 un devis par colonne de son statut ; l’ordre reçu est gardé', () => {
    const liste = [d('b1'), d('b2'), d('f1', { statut: 'en_attente_envoi' }), d('e1', { statut: 'envoye' }), d('s1', { statut: 'accepte' }), d('r1', { statut: 'refuse' }), d('x1', { statut: 'remplace' })];
    const cols = Li.regrouperParColonne(liste, AUJOURDHUI);
    assert.deepEqual(cols.map((c) => c.libelle), ['Brouillon', 'Envoyé', 'Devis signé', 'Devis refusé']);
    assert.deepEqual(cols.map((c) => ids(c.devis)), [['b1', 'b2'], ['f1', 'e1'], ['s1'], ['r1']], 'finalisé dans Envoyé ; remplacé hors tableau');
  });
  test('L5 colonnes toujours présentes, même vides ; statut inconnu = Brouillon', () => {
    const cols = Li.regrouperParColonne([d('q', { statut: 'bizarre' })], AUJOURDHUI);
    assert.equal(cols.length, 4);
    assert.deepEqual(ids(cols[0].devis), ['q']);
    assert.equal(Li.regrouperParColonne([], AUJOURDHUI).every((c) => c.devis.length === 0), true);
  });
});

describe('L6 expiré calculé', () => {
  test('L6 finalisé ou envoyé dont la validité est dépassée s’affiche « Expiré », sans toucher au devis', () => {
    const f = d('f', { statut: 'en_attente_envoi', expireLe: '2026-10-23' });
    assert.equal(Li.statutAffiche(f, AUJOURDHUI), 'expire');
    assert.equal(f.statut, 'en_attente_envoi');
    assert.equal(Li.statutAffiche(d('e', { statut: 'envoye', expireLe: '2026-10-24' }), AUJOURDHUI), 'envoye', 'le jour même, encore valable');
    assert.equal(Li.statutAffiche(d('s', { statut: 'accepte', expireLe: '2026-01-01' }), AUJOURDHUI), 'accepte');
    assert.equal(Li.statutAffiche(d('b', { expireLe: '2026-01-01' }), AUJOURDHUI), 'brouillon');
    assert.equal(Li.libelleStatut('expire'), 'Expiré');
  });
  test('L6 le devis expiré n’est plus dans le Tableau mais dans les Archives', () => {
    const f = d('f', { statut: 'en_attente_envoi', expireLe: '2026-10-01' });
    const cols = Li.regrouperParColonne([f], AUJOURDHUI);
    assert.deepEqual(cols.map((c) => c.devis.length), [0, 0, 0, 0]);
    assert.equal(Li.estHorsTableau(f, AUJOURDHUI), true);
    assert.equal(Li.estDansArchives(f, AUJOURDHUI), true);
    assert.equal(Li.estDansArchives(d('x', { statut: 'remplace' }), AUJOURDHUI), true);
    assert.equal(Li.estDansArchives(d('a', { statut: 'accepte', archive: true }), AUJOURDHUI), true);
    assert.equal(Li.estDansArchives(d('e', { statut: 'envoye' }), AUJOURDHUI), false);
    assert.equal(Li.estHorsTableau(d('e', { statut: 'envoye' }), AUJOURDHUI), false);
  });
});

describe('L7 actions permises par statut', () => {
  const act = (statut, options = {}) => Li.actionsPermises(d('x', { statut }), options);
  const sansEditeur = { editeur: false };
  const actions = (statut) => act(statut).statuts.map((s) => s.action);
  test('L7 changements de statut : exactement les transitions du serveur', () => {
    assert.deepEqual(actions('brouillon'), ['finaliser']);
    assert.deepEqual(actions('en_attente_envoi'), ['marquer_envoye', 'accepter', 'refuser']);
    assert.deepEqual(actions('envoye'), ['accepter', 'refuser']);
    for (const s of ['accepte', 'refuse', 'remplace']) assert.deepEqual(actions(s), [], s);
  });
  test('L7 un devis archivé ne propose aucun changement de statut', () => {
    for (const s of ['en_attente_envoi', 'envoye']) assert.deepEqual(Li.actionsPermises(d('x', { statut: s, archive: true })).statuts, [], s);
  });
  test('L7 Supprimer : seulement un brouillon (le serveur a la fonction devisSupprimer) ; grisé « bientôt » si la suppression est coupée', () => {
    assert.equal(act('brouillon').supprimer.actif, true);
    assert.equal(Li.actionsPermises(d('x'), { suppression: false }).supprimer.actif, false);
    assert.equal(Li.actionsPermises(d('x'), { suppression: false }).supprimer.raison, Li.MESSAGE_BIENTOT);
    assert.equal(Li.actionsPermises(d('x'), { suppression: true }).supprimer.actif, true);
    assert.equal(Li.actionsPermises(d('x', { statut: 'envoye' }), { suppression: true }).supprimer.actif, false);
  });
  test('L7 Éditer : actif pour tout statut (un devis finalisé s’ouvre en lecture seule sur le même écran) ; Créer une nouvelle version pour finalisé, envoyé ou refusé ; grisés sans éditeur, actifs avec', () => {
    assert.equal(act('brouillon', sansEditeur).editer.raison, Li.MESSAGE_BIENTOT);
    assert.equal(act('brouillon').editer.actif, true, 'l’éditeur existe : actif par défaut');
    for (const s of ['en_attente_envoi', 'envoye', 'refuse']) {
      assert.equal(act(s, sansEditeur).nouvelleVersion.raison, Li.MESSAGE_BIENTOT, s);
      assert.equal(act(s).nouvelleVersion.actif, true, s);
      assert.equal(act(s).editer.actif, true, `${s} : l’onglet Édition s’ouvre, en lecture seule`);
    }
    for (const s of ['brouillon', 'accepte', 'remplace']) assert.equal(act(s).nouvelleVersion.actif, false, s);
  });
  test('L7 Voir toujours possible ; Facturer grisé « bientôt », Préparer l’e-mail permis sauf devis signé, refusé ou remplacé ; Dupliquer actif avec l’éditeur, grisé sans', () => {
    for (const s of ['brouillon', 'envoye', 'accepte', 'remplace']) {
      const a = act(s);
      assert.equal(a.voir.actif, true, s);
      assert.equal(a.dupliquer.actif, true, s);
      assert.equal(a.dupliquerPrixDuJour.actif, true, s);
      assert.equal(act(s, sansEditeur).dupliquer.raison, Li.MESSAGE_BIENTOT, s);
      assert.equal(act(s, sansEditeur).dupliquerPrixDuJour.raison, Li.MESSAGE_BIENTOT, s);
      assert.equal(a.facturer.actif, false, s); assert.equal(a.facturer.raison, Li.MESSAGE_BIENTOT);
      assert.equal(a.envoyer.actif, ['brouillon', 'envoye'].includes(s), `${s} envoyer`);
    }
  });
});

describe('L8 pastille de la carte du Tableau (gris, vert, rouge)', () => {
  const ok = { pdf: { statut: 'ok' } };
  test('L8 brouillon et finalisé : gris ; envoyé et signé avec PDF rangé : vert', () => {
    assert.equal(Li.couleurPastilleDevis(d('a'), AUJOURDHUI, MAINT), 'grise');
    assert.equal(Li.couleurPastilleDevis(d('a', { statut: 'en_attente_envoi', ...ok }), AUJOURDHUI, MAINT), 'grise');
    assert.equal(Li.couleurPastilleDevis(d('a', { statut: 'envoye', ...ok }), AUJOURDHUI, MAINT), 'verte');
    assert.equal(Li.couleurPastilleDevis(d('a', { statut: 'accepte', ...ok }), AUJOURDHUI, MAINT), 'verte');
  });
  test('L8 PDF non rangé, refusé ou expiré : rouge', () => {
    assert.equal(Li.couleurPastilleDevis(d('a', { statut: 'envoye' }), AUJOURDHUI, MAINT), 'rouge');
    assert.equal(Li.couleurPastilleDevis(d('a', { statut: 'refuse', ...ok }), AUJOURDHUI, MAINT), 'rouge');
    assert.equal(Li.couleurPastilleDevis(d('a', { statut: 'envoye', expireLe: '2026-10-01', ...ok }), AUJOURDHUI, MAINT), 'rouge');
  });
});
