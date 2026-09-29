// Tests B : logique métier pure (node --test, sans navigateur).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/modules/crm/logique.js';

const JEROME = 'jerome.chevalier@gmail.com';
const ctx = (iso = '2026-10-15T08:00:00Z') => ({ maintenant: new Date(iso), auteur: JEROME });

function fiche(p = {}) {
  return {
    ...L.nouvelleFiche({ nom: 'Test', source: 'Flyer' }, ctx('2026-10-01T08:00:00Z')),
    id: p.id || 'f',
    creeLe: new Date('2026-10-01T08:00:00Z'),
    ...p,
  };
}

describe('B1 En retard', () => {
  const auj = '2026-10-15';
  test('B1 vrai si la date de prochaine action est passée', () => {
    assert.equal(L.estEnRetard(fiche({ dateProchaineAction: '2026-10-14' }), auj), true);
  });
  test("B1 faux si la date est aujourd'hui", () => {
    assert.equal(L.estEnRetard(fiche({ dateProchaineAction: '2026-10-15' }), auj), false);
  });
  test('B1 faux si la date est à venir ou absente', () => {
    assert.equal(L.estEnRetard(fiche({ dateProchaineAction: '2026-10-16' }), auj), false);
    assert.equal(L.estEnRetard(fiche({ dateProchaineAction: null }), auj), false);
  });
  test('B1 faux pour une fiche archivée', () => {
    assert.equal(L.estEnRetard(fiche({ dateProchaineAction: '2026-10-01', archive: true, etape: 'facture_payee' }), auj), false);
  });
  test('B1 faux pour une fiche perdue', () => {
    assert.equal(L.estEnRetard(fiche({ dateProchaineAction: '2026-10-01', etape: 'perdu' }), auj), false);
  });
});

describe('B2 Sans action prévue', () => {
  test('B2 fiche active sans date de prochaine action détectée', () => {
    assert.equal(L.estSansAction(fiche({ dateProchaineAction: null })), true);
    assert.equal(L.estSansAction(fiche({ dateProchaineAction: '2026-10-20' })), false);
  });
  test('B2 fiches Pas maintenant, perdues et archivées exclues', () => {
    assert.equal(L.estSansAction(fiche({ etape: 'pas_maintenant', dateReveil: '2027-01-01' })), false);
    assert.equal(L.estSansAction(fiche({ etape: 'perdu', raisonPerdu: 'Prix' })), false);
    assert.equal(L.estSansAction(fiche({ etape: 'facture_payee', archive: true })), false);
  });
  test("B2 bloc À faire : retard, aujourd'hui, sans action, réveil", () => {
    const auj = '2026-10-15';
    const fiches = [
      fiche({ id: 'r', nom: 'Retard', dateProchaineAction: '2026-10-10', prochaineAction: 'Relancer' }),
      fiche({ id: 'a', nom: 'Aujourdhui', dateProchaineAction: auj, prochaineAction: 'Appeler' }),
      fiche({ id: 's', nom: 'Sans', dateProchaineAction: null }),
      fiche({ id: 'p', nom: 'Reveil', etape: 'pas_maintenant', dateReveil: auj }),
      fiche({ id: 'q', nom: 'Dort', etape: 'pas_maintenant', dateReveil: '2026-12-01' }),
      fiche({ id: 'x', nom: 'Perdu', etape: 'perdu', dateProchaineAction: '2026-10-01' }),
    ];
    const r = L.aFaire(fiches, auj);
    assert.deepEqual(r.enRetard.map((x) => x.fiche.id), ['r']);
    assert.deepEqual(r.aujourdhui.map((x) => x.fiche.id).sort(), ['a', 'p']);
    assert.equal(r.aujourdhui.find((x) => x.fiche.id === 'p').action, 'Reprendre contact');
    assert.deepEqual(r.sansAction.map((x) => x.id), ['s']);
  });
});

describe('B3 Boutons de date', () => {
  test('B3 Demain, +3 jours, +1 semaine, +2 semaines', () => {
    assert.equal(L.dateRapide('demain', '2026-10-15'), '2026-10-16');
    assert.equal(L.dateRapide('3j', '2026-10-15'), '2026-10-18');
    assert.equal(L.dateRapide('1sem', '2026-10-15'), '2026-10-22');
    assert.equal(L.dateRapide('2sem', '2026-10-15'), '2026-10-29');
  });
  test('B3 changement de mois et d’année', () => {
    assert.equal(L.dateRapide('demain', '2026-10-31'), '2026-11-01');
    assert.equal(L.dateRapide('3j', '2026-02-27'), '2026-03-02');
    assert.equal(L.dateRapide('2sem', '2026-12-25'), '2027-01-08');
    assert.equal(L.dateRapide('demain', '2028-02-28'), '2028-02-29');
  });
  test("B3 passage à l'heure d'hiver et d'été (Europe/Paris)", () => {
    // Nuit du 24 au 25 octobre 2026 : 23 h 30 UTC le 24 = 1 h 30 à Paris le 25.
    const auj = L.aujourdhuiParis(new Date('2026-10-24T23:30:00Z'));
    assert.equal(auj, '2026-10-25');
    assert.equal(L.dateRapide('demain', auj), '2026-10-26');
    assert.equal(L.dateRapide('1sem', '2026-10-22'), '2026-10-29');
    // Passage à l'heure d'été le 29 mars 2026.
    assert.equal(L.aujourdhuiParis(new Date('2026-03-28T23:30:00Z')), '2026-03-29');
    assert.equal(L.dateRapide('demain', '2026-03-28'), '2026-03-29');
    assert.equal(L.dateRapide('3j', '2026-03-27'), '2026-03-30');
    // 22 h 30 UTC le 31 décembre = 23 h 30 à Paris, encore le 31.
    assert.equal(L.aujourdhuiParis(new Date('2026-12-31T22:30:00Z')), '2026-12-31');
  });
  test('B3 heure de rendez vous interprétée à Paris, été comme hiver', () => {
    assert.equal(L.dateHeureParisVersDate('2026-07-10T14:30').toISOString(), '2026-07-10T12:30:00.000Z');
    assert.equal(L.dateHeureParisVersDate('2026-12-10T14:30').toISOString(), '2026-12-10T13:30:00.000Z');
  });
});

describe('B4 Suggestions douces', () => {
  const auj = '2026-10-15';
  test('B4 Proposition envoyée : Relancer la proposition à +3 jours', () => {
    assert.deepEqual(L.suggestionPourEtape('proposition_envoyee', auj, 30), { action: 'Relancer la proposition', date: '2026-10-18' });
  });
  test("B4 Gagné : Envoyer la facture aujourd'hui", () => {
    assert.deepEqual(L.suggestionPourEtape('gagne', auj, 30), { action: 'Envoyer la facture', date: auj });
  });
  test('B4 Facture envoyée : Vérifier le paiement au délai réglable', () => {
    assert.deepEqual(L.suggestionPourEtape('facture_envoyee', auj, 30), { action: 'Vérifier le paiement', date: '2026-11-14' });
    assert.deepEqual(L.suggestionPourEtape('facture_envoyee', auj, 45), { action: 'Vérifier le paiement', date: '2026-11-29' });
  });
  test('B4 aucune suggestion pour les autres étapes', () => {
    for (const e of ['premier_contact', 'rdv_fixe', 'facture_payee', 'perdu', 'pas_maintenant']) {
      assert.equal(L.suggestionPourEtape(e, auj, 30), null);
    }
  });
});

describe('B5 Objectifs du mois', () => {
  const mois = '2026-10';
  // Fiches créées en août, sauf mention contraire.
  const f5 = (p) => fiche({ creeLe: new Date('2026-08-01T10:00:00Z'), ...p });
  const fiches = [
    f5({ id: '1', dateInterviewJtbd: '2026-10-02', creeLe: new Date('2026-09-30T21:30:00Z') }), // 23 h 30 à Paris le 30/09 : septembre
    f5({ id: '2', dateInterviewJtbd: '2026-10-31', creeLe: new Date('2026-09-30T22:30:00Z') }), // 0 h 30 à Paris le 01/10 : octobre
    f5({ id: '3', dateInterviewJtbd: '2026-09-30', creeLe: new Date('2026-10-31T22:59:00Z') }), // 23 h 59 à Paris le 31/10 : octobre
    f5({ id: '4', creeLe: new Date('2026-10-31T23:30:00Z') }), // 0 h 30 le 1er novembre à Paris
    f5({ id: '5', rdvTenu: true, dateRdvTenu: new Date('2026-10-10T09:00:00Z') }),
    f5({ id: '6', rdvTenu: true, dateRdvTenu: new Date('2026-09-30T22:15:00Z') }), // 0 h 15 le 1er octobre
    f5({ id: '7', rdvTenu: false, dateRdvTenu: new Date('2026-10-10T09:00:00Z') }),
    f5({ id: '8', datesEtapes: { proposition_envoyee: new Date('2026-10-05T10:00:00Z') } }),
    f5({ id: '9', datesEtapes: { proposition_envoyee: new Date('2026-09-05T10:00:00Z') } }),
    f5({ id: '10', encaissements: [
      { date: new Date('2026-10-03T10:00:00Z'), montant: 600 },
      { date: new Date('2026-09-20T10:00:00Z'), montant: 900 },
    ] }),
    f5({ id: '11', encaissements: [{ date: new Date('2026-10-31T22:00:00Z'), montant: 450.5 }] }),
  ];
  const obj = (id) => L.OBJECTIFS_DEPART.find((o) => o.id === id);

  test('B5 six objectifs de départ avec les bonnes cibles', () => {
    assert.deepEqual(L.OBJECTIFS_DEPART.map((o) => [o.id, o.type, o.cible]), [
      ['interviews_jtbd', 'calcule', 10], ['nouveaux_contacts', 'calcule', 10], ['rdv_tenus', 'calcule', 4],
      ['propositions_envoyees', 'calcule', 3], ['ca_encaisse', 'calcule', 1000], ['flyers', 'manuel', 100],
    ]);
  });
  test('B5 Interviews JTBD réalisées dans le mois', () => {
    assert.equal(L.valeurObjectif(obj('interviews_jtbd'), { fiches, mois }), 2);
  });
  test('B5 Nouveaux contacts (bornes du mois à Paris)', () => {
    assert.equal(L.valeurObjectif(obj('nouveaux_contacts'), { fiches, mois }), 2);
    assert.equal(L.valeurObjectif(obj('nouveaux_contacts'), { fiches, mois: '2026-11' }), 1);
  });
  test('B5 Rendez vous tenus', () => {
    assert.equal(L.valeurObjectif(obj('rdv_tenus'), { fiches, mois }), 2);
  });
  test('B5 Propositions envoyées', () => {
    assert.equal(L.valeurObjectif(obj('propositions_envoyees'), { fiches, mois }), 1);
  });
  test("B5 Chiffre d'affaires encaissé", () => {
    assert.equal(L.valeurObjectif(obj('ca_encaisse'), { fiches, mois }), 1050.5);
    assert.equal(L.valeurObjectif(obj('ca_encaisse'), { fiches, mois: '2026-09' }), 900);
  });
  test('B5 Flyers distribués (saisie manuelle du mois)', () => {
    const saisies = [
      { objectifId: 'flyers', mois: '2026-10', valeur: 40 },
      { objectifId: 'flyers', mois: '2026-09', valeur: 90 },
    ];
    assert.equal(L.valeurObjectif(obj('flyers'), { fiches, saisies, mois }), 40);
    assert.equal(L.valeurObjectif(obj('flyers'), { fiches, saisies, mois: '2026-08' }), 0);
    assert.equal(L.idSaisie('flyers', '2026-10'), 'flyers_2026-10');
  });
  test('B5 mois courant, navigation et objectif franchi', () => {
    assert.equal(L.moisCourant(new Date('2026-10-31T23:30:00Z')), '2026-11');
    assert.equal(L.decalerMois('2026-01', -1), '2025-12');
    assert.equal(L.decalerMois('2026-12', 1), '2027-01');
    assert.equal(L.progression(50, 100), 50);
    const o = [obj('flyers')];
    assert.deepEqual(L.objectifsFranchis({ flyers: 95 }, { flyers: 105 }, o).map((x) => x.id), ['flyers']);
    assert.deepEqual(L.objectifsFranchis({ flyers: 100 }, { flyers: 110 }, o), []);
  });
});

describe('B6 Encaissements', () => {
  test('B6 passage en Facture payée ajoute un encaissement et archive', () => {
    const f = fiche({ etape: 'facture_envoyee', montant: 1200, offreId: 'audit' });
    const p = L.changementEtape(f, 'facture_payee', ctx());
    assert.equal(p.archive, true);
    assert.equal(p.encaissements.length, 1);
    assert.equal(p.encaissements[0].montant, 1200);
    assert.equal(p.encaissements[0].offreId, 'audit');
    assert.ok(p.historique.some((h) => h.type === 'encaissement'));
  });
  test('B6 montant modifiable dans la boîte de dialogue', () => {
    const f = fiche({ etape: 'facture_envoyee', montant: 1200 });
    const p = L.changementEtape(f, 'facture_payee', ctx(), { montantEncaisse: 1100 });
    assert.equal(p.encaissements[0].montant, 1100);
  });
  test('B6 "Nouvelle affaire" conserve encaissements, notes et historique', () => {
    const f = fiche({ etape: 'facture_envoyee', montant: 1200, offreId: 'audit', notes: 'Compte rendu', dateRdv: '2026-10-10T10:00', prochaineAction: 'X', dateProchaineAction: '2026-10-20' });
    const payee = { ...f, ...L.changementEtape(f, 'facture_payee', ctx()) };
    const p = L.nouvelleAffaire(payee, ctx('2026-11-01T08:00:00Z'));
    const apres = { ...payee, ...p };
    assert.equal(apres.etape, 'premier_contact');
    assert.equal(apres.archive, false);
    assert.equal(apres.encaissements.length, 1);
    assert.equal(apres.notes, 'Compte rendu');
    assert.equal(apres.offreId, null);
    assert.equal(apres.montant, null);
    assert.equal(apres.dureeJours, null);
    assert.equal(apres.prochaineAction, '');
    assert.equal(apres.dateProchaineAction, null);
    assert.equal(apres.dateRdv, null);
    assert.ok(apres.historique.length >= payee.historique.length + 1);
    assert.ok(L.peutDemarrerNouvelleAffaire(payee));
  });
  test('B6 changement d’étape : datesEtapes renseignée une seule fois, historique limité à 200', () => {
    let f = fiche();
    f = { ...f, ...L.changementEtape(f, 'rdv_fixe', ctx('2026-10-02T08:00:00Z')) };
    f = { ...f, ...L.changementEtape(f, 'premier_contact', ctx('2026-10-03T08:00:00Z')) };
    f = { ...f, ...L.changementEtape(f, 'rdv_fixe', ctx('2026-10-04T08:00:00Z')) };
    assert.equal(f.datesEtapes.rdv_fixe.toISOString(), '2026-10-02T08:00:00.000Z');
    assert.equal(f.dateEntreeEtape.toISOString(), '2026-10-04T08:00:00.000Z');
    assert.equal(f.historique.length, 3);
    const longue = Array.from({ length: 250 }, (_, i) => ({ texte: String(i) }));
    const h = L.ajouterHistorique(longue, { texte: 'fin' });
    assert.equal(h.length, 200);
    assert.equal(h.at(-1).texte, 'fin');
  });
  test('B6 raison obligatoire pour Perdu, date de réveil pour Pas maintenant', () => {
    const f = fiche();
    assert.throws(() => L.changementEtape(f, 'perdu', ctx()));
    assert.throws(() => L.changementEtape(f, 'pas_maintenant', ctx()));
    assert.equal(L.changementEtape(f, 'perdu', ctx(), { raisonPerdu: 'Prix' }).raisonPerdu, 'Prix');
    assert.equal(L.changementEtape(f, 'pas_maintenant', ctx(), { dateReveil: '2027-01-10' }).dateReveil, '2027-01-10');
  });
});

describe('B7 Filtres et recherche', () => {
  const auj = '2026-10-15'; // jeudi
  const base = [
    fiche({ id: 'a', nom: 'Marie Durand', entreprise: 'Fleurs de Provence', ville: 'Manosque', etape: 'rdv_fixe', roles: ['prospect'], source: 'Réseau entrepreneuses', secteur: 'Commerce local', priorite: 'chaud', offreId: 'audit', dateProchaineAction: '2026-10-12' }),
    fiche({ id: 'b', nom: 'Hélène Martin', entreprise: 'Éco Services', ville: 'Forcalquier', etape: 'premier_contact', roles: ['interview_jtbd'], source: 'LinkedIn', secteur: 'Services', priorite: 'froid', dateInterviewJtbd: null }),
    fiche({ id: 'c', nom: 'Paul Roux', ville: 'manosque', etape: 'proposition_envoyee', roles: ['prospect', 'interview_jtbd'], source: 'Flyer', secteur: 'Artisanat', priorite: 'tiede', offreId: 'accompagnement', dateInterviewJtbd: '2026-10-01', dateProchaineAction: '2026-10-18', notes: 'Très intéressé par l’atelier', notesRapides: [{ id: 'n', texte: 'Rappeler après les vacances' }] }),
    fiche({ id: 'd', nom: 'Zoé Blanc', etape: 'facture_payee', archive: true, priorite: 'chaud', source: 'Réseau entrepreneuses' }),
    fiche({ id: 'e', nom: 'Luc Noir', etape: 'pas_maintenant', dateReveil: '2027-01-05', priorite: 'chaud', source: 'Flyer', dateProchaineAction: '2026-10-25' }),
  ];
  const ids = (c) => L.filtrer(base, c, { aujourdhui: auj }).map((f) => f.id).sort();

  test('B7 sans filtre : les archivés sont masqués', () => {
    assert.deepEqual(ids({}), ['a', 'b', 'c', 'e']);
  });
  test('B7 chaque filtre seul', () => {
    assert.deepEqual(ids({ etapes: ['rdv_fixe'] }), ['a']);
    assert.deepEqual(ids({ roles: ['interview_jtbd'] }), ['b', 'c']);
    assert.deepEqual(ids({ sources: ['Flyer'] }), ['c', 'e']);
    assert.deepEqual(ids({ secteurs: ['Services'] }), ['b']);
    assert.deepEqual(ids({ villes: ['Manosque'] }), ['a', 'c']);
    assert.deepEqual(ids({ priorites: ['chaud'] }), ['a', 'e']);
    assert.deepEqual(ids({ offres: ['accompagnement'] }), ['c']);
    assert.deepEqual(ids({ enRetard: true }), ['a']);
    assert.deepEqual(ids({ sansAction: true }), ['b']);
    assert.deepEqual(ids({ jtbd: 'faite' }), ['c']);
    assert.deepEqual(ids({ jtbd: 'non_faite' }), ['a', 'b', 'e']);
    assert.deepEqual(ids({ archives: true }), ['d']);
  });
  test('B7 filtres combinés (ET entre critères, OU dans un critère)', () => {
    assert.deepEqual(ids({ priorites: ['chaud'], sources: ['Réseau entrepreneuses'] }), ['a']);
    assert.deepEqual(ids({ etapes: ['rdv_fixe', 'premier_contact'], villes: ['Forcalquier'] }), ['b']);
    assert.deepEqual(ids({ roles: ['interview_jtbd'], jtbd: 'non_faite' }), ['b']);
    assert.deepEqual(ids({ archives: true, priorites: ['chaud'] }), ['d']);
  });
  test('B7 recherche insensible aux accents et à la casse', () => {
    assert.deepEqual(ids({ recherche: 'helene' }), ['b']);
    assert.deepEqual(ids({ recherche: 'ECO services' }), ['b']);
    assert.deepEqual(ids({ recherche: 'fleurs' }), ['a']);
    assert.deepEqual(ids({ recherche: 'MANOSQUE' }), ['a', 'c']);
    assert.deepEqual(ids({ recherche: 'atelier' }), ['c']); // notes
    assert.deepEqual(ids({ recherche: 'vacances' }), ['c']); // notes rapides
    assert.deepEqual(ids({ recherche: 'introuvable' }), []);
  });
  test('B7 les 4 filtres enregistrés de départ', () => {
    const f = Object.fromEntries(L.FILTRES_DEPART.map((x) => [x.id, x.criteres]));
    assert.equal(L.FILTRES_DEPART.length, 4);
    // Dimanche de la semaine du jeudi 15/10 : 18/10 ; retard du 12/10 inclus ; 25/10 exclu.
    assert.equal(L.dimancheDeLaSemaine(auj), '2026-10-18');
    assert.equal(L.dimancheDeLaSemaine('2026-10-18'), '2026-10-18');
    assert.deepEqual(ids(f.relancer_semaine), ['a', 'c']);
    assert.deepEqual(ids(f.chauds), ['a', 'e']);
    assert.deepEqual(ids(f.reseau_entrepreneuses), ['a']);
    assert.deepEqual(ids(f.jtbd_a_faire), ['b']);
  });
  test('B7 pastilles et suppression d’un critère', () => {
    const c = { priorites: ['chaud'], enRetard: true, recherche: 'x' };
    const p = L.pastillesFiltres(c);
    assert.deepEqual(p.map((x) => x.libelle), ['Priorité : Chaud', 'En retard', 'Recherche : x']);
    const c2 = L.retirerCritere(c, 'priorites', 'chaud');
    assert.deepEqual(c2.priorites, []);
    assert.equal(L.filtreEstVide(L.retirerCritere(L.retirerCritere(c2, 'enRetard', true), 'recherche', 'x')), true);
    assert.deepEqual(L.criteresAEnregistrer({ priorites: ['chaud'], recherche: 'x' }), { priorites: ['chaud'] });
  });
  test('B7 tri de la Liste', () => {
    const t = L.trierFiches(base, 'nom', 'asc').map((f) => f.id);
    assert.deepEqual(t, ['b', 'e', 'a', 'c', 'd']);
    assert.deepEqual(L.trierFiches(base, 'nom', 'desc').map((f) => f.id), ['d', 'c', 'a', 'e', 'b']);
  });
});

describe('B8 Statistiques', () => {
  const fiches = [
    fiche({ etape: 'premier_contact' }), fiche({ etape: 'premier_contact' }),
    fiche({ etape: 'gagne' }), fiche({ etape: 'perdu', raisonPerdu: 'Prix' }),
    fiche({ etape: 'facture_payee', archive: true, encaissements: [{ date: new Date('2026-10-02T10:00:00Z'), montant: 500 }] }),
    fiche({ etape: 'facture_payee', archive: true, encaissements: [{ date: new Date('2026-05-02T10:00:00Z'), montant: 300 }, { date: new Date('2026-08-02T10:00:00Z'), montant: 200 }] }),
  ];
  test('B8 comptage des fiches par étape', () => {
    const c = Object.fromEntries(L.compterParEtape(fiches).map((e) => [e.id, e.nombre]));
    assert.deepEqual(c, { premier_contact: 2, rdv_fixe: 0, proposition_envoyee: 0, gagne: 1, facture_envoyee: 0, facture_payee: 2, perdu: 1, pas_maintenant: 0 });
  });
  test("B8 chiffre d'affaires par mois sur 6 mois", () => {
    const ca = L.caParMois(fiches, '2026-10', 6);
    assert.deepEqual(ca.map((m) => m.mois), ['2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10']);
    assert.deepEqual(ca.map((m) => m.montant), [300, 0, 0, 200, 0, 500]);
  });
  test('B8 payées du mois pour la colonne du Kanban', () => {
    const f = [fiche({ etape: 'facture_payee', archive: true, dateEntreeEtape: new Date('2026-10-05T10:00:00Z') }), fiche({ etape: 'facture_payee', archive: true, dateEntreeEtape: new Date('2026-09-05T10:00:00Z') })];
    assert.equal(L.payeesDuMois(f, '2026-10').length, 1);
  });
});

describe('B9 Export CSV et rappel', () => {
  const fiches = [
    fiche({ id: 'x1', nom: 'Marie "la fleuriste" Durand', entreprise: 'Fleurs; Provence', notes: 'Ligne 1\nLigne 2', montant: 1200.5, roles: ['prospect', 'interview_jtbd'], etape: 'rdv_fixe', offreId: 'audit' }),
    fiche({ id: 'x2', nom: 'Paul', entreprise: 'Simple' }),
  ];
  const csv = L.versCsv(fiches, { offres: L.OFFRES_DEPART });
  test('B9 BOM UTF 8 et séparateur point virgule', () => {
    assert.equal(csv.charCodeAt(0), 0xfeff);
    const entete = csv.slice(1).split('\r\n')[0];
    assert.ok(entete.startsWith('Identifiant;Prénom et nom;Entreprise;Rôles;'));
    assert.equal(entete.split(';').length, L.COLONNES_CSV.length);
  });
  test('B9 en têtes complets', () => {
    const entete = csv.slice(1).split('\r\n')[0].split(';');
    for (const libelle of ['Prénom et nom', 'Étape', 'Source', 'Priorité', 'Montant (€)', 'Notes', 'Notes rapides', 'Historique', 'Encaissements', 'Opposition à la prospection']) {
      assert.ok(entete.includes(libelle), libelle);
    }
  });
  test('B9 guillemets, points virgules et retours à la ligne échappés', () => {
    assert.equal(L.echapperCsv('a"b'), '"a""b"');
    assert.equal(L.echapperCsv('a;b'), '"a;b"');
    assert.equal(L.echapperCsv('a\nb'), '"a\nb"');
    assert.equal(L.echapperCsv('simple'), 'simple');
    assert.ok(csv.includes('"Marie ""la fleuriste"" Durand"'));
    assert.ok(csv.includes('"Fleurs; Provence"'));
    assert.ok(csv.includes('"Ligne 1\nLigne 2"'));
    assert.ok(csv.includes(';1200,5;'));
    assert.ok(csv.includes(';Rendez vous fixé;'));
    assert.ok(csv.includes('Prospect, Interviewé JTBD'));
    assert.ok(csv.includes(';Audit;'));
  });
  test('B9 une ligne par fiche', () => {
    // Les retours à la ligne internes sont entre guillemets : on compte les enregistrements.
    const enregistrements = csv.slice(1).trimEnd().split(/\r\n(?=(?:[^"]*"[^"]*")*[^"]*$)/);
    assert.equal(enregistrements.length, 1 + fiches.length);
  });
  test("B9 rappel d'export affiché sans export ou après 30 jours, masqué sinon", () => {
    const maintenant = new Date('2026-10-15T10:00:00Z');
    assert.equal(L.rappelExportVisible(null, maintenant), true);
    assert.equal(L.rappelExportVisible(undefined, maintenant), true);
    assert.equal(L.rappelExportVisible(new Date('2026-09-10T10:00:00Z'), maintenant), true);
    assert.equal(L.rappelExportVisible(new Date('2026-09-20T10:00:00Z'), maintenant), false);
    assert.equal(L.rappelExportVisible({ seconds: Date.parse('2026-10-14T10:00:00Z') / 1000, nanoseconds: 0 }, maintenant), false);
  });
});

describe('Autres règles de la fiche', () => {
  test('validation des champs obligatoires', () => {
    const e = L.validerFiche({ nom: '', roles: [], source: '', etape: 'premier_contact', priorite: 'tiede', datePremierContact: '2026-10-01', email: 'pas-un-email' });
    assert.deepEqual(Object.keys(e).sort(), ['email', 'nom', 'roles', 'source']);
    assert.deepEqual(L.validerFiche(L.nouvelleFiche({ nom: 'Ok', source: 'Flyer' }, ctx())), {});
  });
  test('Fait : vide l’action, historise, met à jour le dernier échange', () => {
    const f = fiche({ prochaineAction: 'Appeler', dateProchaineAction: '2026-10-15' });
    const p = L.actionFaite(f, ctx('2026-10-15T09:00:00Z'));
    assert.equal(p.prochaineAction, '');
    assert.equal(p.dateProchaineAction, null);
    assert.equal(p.historique.at(-1).texte, 'Action faite : Appeler');
    assert.equal(p.dateDernierEchange.toISOString(), '2026-10-15T09:00:00.000Z');
  });
  test('Fait sur un réveil : la fiche reprend en Premier contact', () => {
    const f = fiche({ etape: 'pas_maintenant', dateReveil: '2026-10-15' });
    const p = L.actionFaite(f, ctx(), { reprise: true });
    assert.equal(p.etape, 'premier_contact');
    assert.equal(p.dateReveil, null);
  });
  test('Rendez vous tenu : date du rendez vous si renseignée, sinon maintenant', () => {
    const f = fiche({ dateRdv: '2026-10-12T14:30' });
    assert.equal(L.marquerRdvTenu(f, true, ctx()).dateRdvTenu.toISOString(), '2026-10-12T12:30:00.000Z');
    assert.equal(L.marquerRdvTenu(fiche(), true, ctx()).dateRdvTenu.toISOString(), '2026-10-15T08:00:00.000Z');
    assert.deepEqual(L.marquerRdvTenu(f, false, ctx()), { rdvTenu: false, dateRdvTenu: null });
  });
  test('Notes : jamais modifiées par une action automatique, seulement par "Copier dans Notes"', () => {
    const f = fiche({ notes: 'Texte libre', prochaineAction: 'A', dateProchaineAction: '2026-10-10', etape: 'proposition_envoyee', montant: 100 });
    const patchs = [
      L.actionFaite(f, ctx()), L.emailEnvoye(f, ctx()), L.marquerRdvTenu(f, true, ctx()),
      L.changementEtape(f, 'gagne', ctx()), L.changementEtape(f, 'facture_payee', ctx()),
      L.nouvelleAffaire(f, ctx()), L.ajouterNoteRapide(f, 'dictée', { ...ctx(), id: 'n1' }),
      L.marquerOpposition(true, ctx()),
    ];
    for (const p of patchs) assert.equal('notes' in p, false);
    const avecNote = { ...f, ...L.ajouterNoteRapide(f, 'dictée', { ...ctx(), id: 'n1' }) };
    assert.equal(L.copierNoteDansNotes(avecNote, 'n1').notes, 'Texte libre\n\ndictée');
    assert.deepEqual(L.supprimerNoteRapide(avecNote, 'n1').notesRapides, []);
  });
  test('Opposition à la prospection : bouton email désactivé', () => {
    assert.equal(L.emailActif(fiche({ email: 'a@b.fr' })), true);
    assert.equal(L.emailActif(fiche({ email: '' })), false);
    assert.equal(L.emailActif(fiche({ email: 'a@b.fr', oppositionProspection: true })), false);
    const p = L.marquerOpposition(true, ctx());
    assert.equal(p.oppositionProspection, true);
    assert.ok(p.dateOpposition instanceof Date);
  });
});
