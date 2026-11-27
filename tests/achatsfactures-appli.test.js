// « L'application Factures » (27/11/2026, maquette v3) : logique pure (js/modules/achatsfactures/logique-appli.js), lectures et actions avec un FAUX client (donnees-appli.js),
// et verrous écrits : durées des animations (les mêmes dans le code et la feuille de style), écouteurs du clavier retirés à la sortie du plein écran, règle générale dans les consignes.
// Aucun réseau, aucune donnée réelle. L'écran lui-même est vu dans un navigateur : tests/e2e/achatsfactures-appli.spec.js (un test par critère).
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  DUREES, COURBE_ENTREE, VUES_APPLI, JOURS_ALERTE_IBAN, initiales, masquerIban, ibanLisible, sirenFacture, jourParis, changementIbanRecent, changementDansConfirmations, fournisseursDuVolet, fournisseurDeFacture, etatFournisseurFacture, motifChangementIban, MESSAGE_IBAN_RETIRE,
  verifierChantierFiche, champsChantierModifies, semaineIso, chiffresTableau, libelleMois, delaiLisible, bilanDuJour, texteBilan, correspond,
  preparerModeEmploi, plusSelonModeEmploi, lignesSelonModeEmploi, saisieSelonModeEmploi, OBJET_DU_VOLET,
} from '../js/modules/achatsfactures/logique-appli.js';
import { creerDonneesAppli } from '../js/modules/achatsfactures/donnees-appli.js';

const lire = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const MAINTENANT = new Date('2026-11-27T10:00:00Z');
const IBAN_A = 'FR7630006000011234567890189';
const IBAN_B = 'FR1420041010050500013M02606';

describe('7 IBAN changé récemment (confirmations d\'IBAN existantes, aucune table nouvelle)', () => {
  const conf = (o) => ({ id: 'c1', fournisseur_id: 'fo1', siren: '500000005', iban: IBAN_A, confirme_le: '2026-06-01T08:00:00Z', revoque_le: null, motif_revocation: null, ...o });
  test('7 une confirmation active et ancienne : aucune alerte ; liste illisible (null) ou SIREN absent : jamais d\'alerte inventée', () => {
    assert.equal(changementIbanRecent([conf()], '500000005', MAINTENANT), null);
    assert.equal(changementIbanRecent(null, '500000005', MAINTENANT), null);
    assert.equal(changementIbanRecent([conf()], null, MAINTENANT), null);
  });
  test('7 une confirmation révoquée il y a moins de 60 jours : alerte avec la date et le motif ; plus ancienne : plus d\'alerte ; un autre SIREN ne compte pas', () => {
    const rev = conf({ revoque_le: '2026-11-20T09:00:00Z', motif_revocation: 'IBAN remplacé' });
    assert.deepEqual(changementIbanRecent([rev], '500000005', MAINTENANT), { date: '2026-11-20T09:00:00Z', motif: 'IBAN remplacé' });
    assert.equal(changementIbanRecent([conf({ revoque_le: '2026-08-01T09:00:00Z' })], '500000005', MAINTENANT), null);
    assert.equal(changementIbanRecent([rev], '500000021', MAINTENANT), null);
    assert.equal(JOURS_ALERTE_IBAN, 60);
  });
  test('7 un IBAN différent confirmé récemment après un premier IBAN : alerte ; le tout premier IBAN confirmé n\'est pas un changement', () => {
    const second = conf({ id: 'c2', iban: IBAN_B, confirme_le: '2026-11-25T09:00:00Z' });
    assert.deepEqual(changementIbanRecent([conf(), second], '500000005', MAINTENANT), { date: '2026-11-25T09:00:00Z', motif: '' });
    assert.equal(changementIbanRecent([conf({ confirme_le: '2026-11-25T09:00:00Z' })], '500000005', MAINTENANT), null);
  });
  test('C8 une révocation ne compte pas si le MÊME IBAN a une confirmation active plus récente (il a été reconfirmé) ; un autre IBAN reconfirmé ne l\'efface pas', () => {
    const rev = conf({ revoque_le: '2026-11-20T09:00:00Z', motif_revocation: 'Erreur de saisie' });
    const reconfirme = conf({ id: 'c2', confirme_le: '2026-11-21T09:00:00Z' });
    assert.equal(changementIbanRecent([rev, reconfirme], '500000005', MAINTENANT), null);
    assert.equal(changementDansConfirmations([rev, reconfirme], MAINTENANT), null);
    // Une confirmation active du même IBAN mais PLUS ANCIENNE que la confirmation révoquée ne l'efface pas ; ni celle d'un autre IBAN (qui est, elle, un changement).
    assert.deepEqual(changementDansConfirmations([conf({ confirme_le: '2026-07-01T08:00:00Z', revoque_le: '2026-11-20T09:00:00Z', motif_revocation: 'm' }), conf({ id: 'c0', confirme_le: '2026-01-01T08:00:00Z' })], MAINTENANT), { date: '2026-11-20T09:00:00Z', motif: 'm' });
    assert.deepEqual(changementDansConfirmations([rev, conf({ id: 'c3', iban: IBAN_B, confirme_le: '2026-11-22T09:00:00Z' })], MAINTENANT), { date: '2026-11-22T09:00:00Z', motif: '' });
  });
  test('C8 les confirmations d\'un fournisseur ne sont pas retriées par SIREN : un fournisseur sans SIREN (ou une confirmation rattachée par sa fiche seulement) garde son alerte', () => {
    const rev = conf({ siren: null, fournisseur_id: 'fo7', revoque_le: '2026-11-20T09:00:00Z', motif_revocation: 'm' });
    const [sansSiren] = fournisseursDuVolet({ fournisseurs: [{ id: 'fo7', siren: null, nom: 'Sans Siren' }], agences: [], ibans: [rev], factures: [] }, MAINTENANT);
    assert.deepEqual(sansSiren.changement, { date: '2026-11-20T09:00:00Z', motif: 'm' });
    const [autreSiren] = fournisseursDuVolet({ fournisseurs: [{ id: 'fo7', siren: '500000021', nom: 'Siren corrigé' }], agences: [], ibans: [conf({ fournisseur_id: 'fo7', revoque_le: '2026-11-20T09:00:00Z' })], factures: [] }, MAINTENANT);
    assert.equal(autreSiren.changement?.date, '2026-11-20T09:00:00Z');
    assert.equal(changementDansConfirmations(null, MAINTENANT), null);
  });
  test('C3 changement d\'IBAN signalé : le motif ne contient jamais l\'IBAN entier, seulement sa forme masquée ; sans IBAN annoncé, rien de plus', () => {
    const motif = motifChangementIban('FR48 1027 8000 0100 0200 0000 001');
    assert.equal(motif, 'Changement d’IBAN signalé depuis la fiche du fournisseur. Nouvel IBAN annoncé : FR48 •••• 0001.');
    assert.doesNotMatch(motif.replace(/\s/g, ''), /FR4810278000010002000000001/);
    assert.doesNotMatch(motif, /1027|8000|0200/);
    assert.equal(motifChangementIban(''), 'Changement d’IBAN signalé depuis la fiche du fournisseur.');
    assert.equal(motifChangementIban(null), 'Changement d’IBAN signalé depuis la fiche du fournisseur.');
    assert.equal(MESSAGE_IBAN_RETIRE, 'Ancien IBAN retiré : le nouveau sera confirmé à la prochaine facture');
  });
});

describe('5, 6 et 8 fournisseurs du volet et fournisseur d\'une facture', () => {
  const lu = {
    fournisseurs: [{ id: 'fo2', siren: '500000021', nom: 'Zinc et Fer', statut: 'actif' }, { id: 'fo1', siren: '500000005', nom: 'Point Q Matériaux', statut: 'actif' }],
    agences: [{ id: 'ag1', fournisseur_id: 'fo1', siret: '50000000500008', nom_agence: 'Agence Nord', ville: 'Valmoran', actif: true, fusionne_dans: null }, { id: 'ag9', fournisseur_id: 'fo1', siret: null, nom_agence: 'Ancienne', ville: 'Valmoran', actif: false, fusionne_dans: 'ag1' }],
    ibans: [{ id: 'c1', fournisseur_id: 'fo1', siren: '500000005', iban: IBAN_A, confirme_le: '2026-06-01T08:00:00Z', revoque_le: null }],
    factures: [
      { id: 'a', fournisseur_siren: '500000005', date_facture: '2026-11-20', statut: 'a_valider', email_expediteur: null, iban_normalise: null },
      { id: 'b', fournisseur_siren: '500000005', date_facture: '2026-10-02', statut: 'acceptee', email_expediteur: 'compta@point-q.example', iban_normalise: IBAN_A },
    ],
  };
  test('6 une fiche par fournisseur, triée par nom : agences (sans les fusionnées), IBAN confirmé, nombre de factures, dernière facture, e-mail', () => {
    const [pq, zf] = fournisseursDuVolet(lu, MAINTENANT);
    assert.equal(pq.nom, 'Point Q Matériaux');
    assert.deepEqual(pq.agences.map((a) => a.id), ['ag1']);
    assert.equal(pq.iban, IBAN_A);
    assert.equal(pq.confirmation.id, 'c1');
    assert.equal(pq.nbFactures, 2);
    assert.equal(pq.derniere, '2026-11-20');
    assert.equal(pq.email, 'compta@point-q.example');
    assert.equal(pq.changement, null);
    assert.equal(zf.nbFactures, 0);
    assert.equal(zf.iban, null);
    assert.equal(zf.confirmation, null);
  });
  test('6 lectures facultatives en échec : « non lu » au lieu d\'un chiffre inventé', () => {
    const [pq] = fournisseursDuVolet({ ...lu, ibans: null, factures: null }, MAINTENANT).filter((x) => x.id === 'fo1');
    assert.equal(pq.ibansLus, false);
    assert.equal(pq.nbFactures, null);
    assert.equal(pq.derniere, null);
    assert.equal(pq.changement, null);
  });
  test('6 sans confirmation, l\'IBAN montré est celui de la dernière facture acceptée (dit « jamais confirmé » par l\'écran)', () => {
    const [pq] = fournisseursDuVolet({ ...lu, ibans: [] }, MAINTENANT).filter((x) => x.id === 'fo1');
    assert.equal(pq.confirmation, null);
    assert.equal(pq.iban, IBAN_A);
  });
  test('C6 SIREN non lu : repli sur l\'agence reliée (agence → fournisseur), puis sur le nom exact ; sinon « non reconnu », jamais « nouveau » ; un SIREN lu mais inconnu ne se rattrape pas par le nom', () => {
    const liste = fournisseursDuVolet(lu, MAINTENANT);
    assert.equal(fournisseurDeFacture({ fournisseur_siren: null, extraction: null, etablissement_id: 'ag1', fournisseur: 'Nom mal lu' }, liste).id, 'fo1');
    assert.equal(fournisseurDeFacture({ fournisseur_siren: null, extraction: null, fournisseur: ' point q MATERIAUX ' }, liste).id, 'fo1');
    assert.equal(fournisseurDeFacture({ fournisseur_siren: null, extraction: { fournisseur: { nom: 'Zinc et Fer', siret: null, siren: null } } }, liste).id, 'fo2');
    assert.equal(fournisseurDeFacture({ fournisseur_siren: null, extraction: null, fournisseur: 'Point Q' }, liste), null); // nom EXACT seulement
    assert.equal(fournisseurDeFacture({ fournisseur_siren: '999999999', fournisseur: 'Point Q Matériaux' }, liste), null); // même nom, autre SIREN : pas la même entreprise
    assert.equal(fournisseurDeFacture({ fournisseur_siren: '999999999', etablissement_id: 'ag1' }, liste).id, 'fo1'); // l'agence reliée fait foi
    const homonymes = [...liste, { ...liste[0], id: 'fo3', siren: '500000039' }];
    assert.equal(fournisseurDeFacture({ fournisseur_siren: null, fournisseur: liste[0].nom }, homonymes), null); // deux fournisseurs du même nom : on ne devine pas
    assert.deepEqual(etatFournisseurFacture({ fournisseur_siren: '500000005' }, liste).etat, 'connu');
    assert.deepEqual(etatFournisseurFacture({ fournisseur_siren: '999999999' }, liste), { etat: 'nouveau', fournisseur: null });
    assert.deepEqual(etatFournisseurFacture({ fournisseur_siren: null, extraction: null, fournisseur: 'Inconnu au bataillon' }, liste), { etat: 'non-reconnu', fournisseur: null });
    assert.equal(etatFournisseurFacture({ fournisseur_siren: null, extraction: null, fournisseur: 'Zinc et Fer' }, liste).fournisseur.id, 'fo2');
  });
  test('5 et 8 le fournisseur d\'une facture se trouve par son SIREN (colonne, sinon lecture automatique) ; SIREN inconnu, ou ni SIREN ni nom : null', () => {
    const liste = fournisseursDuVolet(lu, MAINTENANT);
    assert.equal(fournisseurDeFacture({ fournisseur_siren: '500000005' }, liste).id, 'fo1');
    assert.equal(fournisseurDeFacture({ fournisseur_siren: null, extraction: { fournisseur: { siret: '50000002100005' } } }, liste).id, 'fo2');
    assert.equal(fournisseurDeFacture({ fournisseur_siren: '999999999' }, liste), null);
    assert.equal(fournisseurDeFacture({ fournisseur_siren: null, extraction: null }, liste), null);
    assert.equal(sirenFacture({ fournisseur_siren: '123456789' }), '123456789');
  });
  test('6 petits outils : initiales, IBAN masqué (jamais entier dans une liste), IBAN lisible, recherche sans accents', () => {
    assert.equal(initiales('Point Q Matériaux'), 'PM');
    assert.equal(initiales('Électricité du Sud'), 'ÉS');
    assert.equal(initiales(''), '?');
    assert.equal(masquerIban(IBAN_A), 'FR76 •••• 0189');
    assert.equal(masquerIban(null), '—');
    assert.equal(ibanLisible('fr76 3000 6000011234567890189'), 'FR76 3000 6000 0112 3456 7890 189');
    assert.equal(correspond('Électro Services', 'electro'), true);
    assert.equal(correspond('Électro Services', 'bois'), false);
  });
});

describe('6 fiche chantier : seulement ce qui a changé part au serveur', () => {
  const origine = { id: 'c1', nom: 'Villa Orvaline', code: 'CH-1', client: 'Client fictif', adresse: null };
  test('6 contrôle de forme (nom et code obligatoires, longueurs) et champs modifiés (un texte vidé = null)', () => {
    assert.equal(verifierChantierFiche({ nom: ' ', code: 'CH-1', client: '', adresse: '' }), 'Le nom du chantier est obligatoire.');
    assert.equal(verifierChantierFiche({ nom: 'A', code: '', client: '', adresse: '' }), 'Le code du chantier ne peut pas être vide.');
    assert.match(verifierChantierFiche({ nom: 'x'.repeat(201), code: 'C', client: '', adresse: '' }), /trop long/);
    assert.equal(verifierChantierFiche({ nom: 'Villa', code: 'CH-1', client: '', adresse: '' }), null);
    assert.deepEqual(champsChantierModifies(origine, { nom: 'Villa Orvaline', code: 'CH-1', client: 'Client fictif', adresse: '' }), {});
    assert.deepEqual(champsChantierModifies(origine, { nom: ' Villa Neuve ', code: 'CH-1', client: '', adresse: '2 rue des essais' }), { nom: 'Villa Neuve', client: null, adresse: '2 rue des essais' });
  });
});

describe('2 et 10 tableau de bord des factures et bilan de fin de pile', () => {
  const f = (o) => ({ fournisseur: 'Point Q Matériaux', statut: 'acceptee', montant_ttc: 120, type_document: 'facture', archivee_le: null, created_at: '2026-11-20T08:00:00Z', date_decision: '2026-11-22T08:00:00Z', ...o });
  const factures = [
    f({ id: 1 }), f({ id: 2, fournisseur: 'Zinc et Fer', montant_ttc: 1000, date_decision: '2026-11-27T09:00:00Z', created_at: '2026-11-26T09:00:00Z' }),
    f({ id: 3, statut: 'refusee', date_decision: '2026-11-27T09:30:00Z' }), f({ id: 4, statut: 'a_valider', date_decision: null }), f({ id: 5, statut: 'a_valider', date_decision: null, archivee_le: '2026-11-01T00:00:00Z' }),
    f({ id: 6, date_decision: '2026-10-30T08:00:00Z', montant_ttc: 999 }), f({ id: 7, type_document: 'avoir', montant_ttc: 20, date_decision: '2026-11-23T08:00:00Z' }),
  ];
  test('2 chiffres du mois : à valider (hors archives), validées, refusées, montant (avoir en négatif), délai moyen, top 3, quatre semaines', () => {
    const c = chiffresTableau(factures, MAINTENANT);
    assert.equal(c.mois, '2026-11');
    assert.equal(libelleMois(c.mois), 'Novembre 2026');
    assert.equal(c.aValider, 1);
    assert.equal(c.accepteesMois, 3);
    assert.equal(c.refuseesMois, 1);
    assert.equal(c.centimesMois, 12000 + 100000 - 2000);
    assert.deepEqual(c.top3, [{ nom: 'Zinc et Fer', centimes: 100000 }, { nom: 'Point Q Matériaux', centimes: 10000 }]);
    assert.deepEqual(c.semaines.map((s) => s.libelle), ['S45', 'S46', 'S47', 'S48']);
    assert.deepEqual(c.semaines.map((s) => s.centimes), [0, 0, 12000, 100000 - 2000]); // le 22/11 est un dimanche (S47), l'avoir du 23/11 un lundi (S48)
    assert.ok(Math.abs(c.delaiMoyenJours - (2 + 1 + 3) / 3) < 1e-9);
  });
  test('2 cas vide : tout à zéro, délai « — » (jamais un nombre inventé)', () => {
    const c = chiffresTableau([], MAINTENANT);
    assert.deepEqual([c.aValider, c.accepteesMois, c.refuseesMois, c.centimesMois, c.delaiMoyenJours, c.top3.length], [0, 0, 0, 0, null, 0]);
    assert.equal(delaiLisible(null), '—');
    assert.equal(delaiLisible(1.8), '1,8 jour');
    assert.equal(delaiLisible(2), '2 jours');
  });
  test('2 semaine ISO et jour de Paris', () => {
    assert.deepEqual(semaineIso('2026-11-27'), { annee: 2026, semaine: 48 });
    assert.deepEqual(semaineIso('2027-01-01'), { annee: 2026, semaine: 53 });
    assert.equal(jourParis('2026-11-27T23:30:00Z'), '2026-11-28');
    assert.equal(jourParis('2026-11-27'), '2026-11-27');
    assert.equal(jourParis(null), null);
  });
  test('10 bilan du jour : décisions du jour seulement, phrase au singulier et au pluriel, rien de traité', () => {
    const b = bilanDuJour(factures, MAINTENANT);
    assert.deepEqual(b, { acceptees: 1, refusees: 1, centimes: 100000 });
    assert.match(texteBilan(b), /^2 factures traitées aujourd’hui · 1 validée \(1[\s ]000,00[\s ]€\) · 1 refusée$/u);
    assert.equal(texteBilan({ acceptees: 0, refusees: 0, centimes: 0 }), 'Aucune facture traitée aujourd’hui.');
    assert.match(texteBilan({ acceptees: 2, refusees: 0, centimes: 24000 }, 'pendant cette séance'), /^2 factures traitées pendant cette séance · 2 validées/);
  });
});

describe('lectures et actions du volet (faux client : aucune table nouvelle, seulement des actions qui existent)', () => {
  function faux({ panne = [] } = {}) {
    const lectures = []; const appels = [];
    const tables = {
      fournisseurs: [{ id: 'fo1', siren: '500000005', nom: 'Point Q Matériaux', statut: 'actif' }],
      etablissements_fournisseur: [{ id: 'ag1', fournisseur_id: 'fo1', siret: '50000000500008', nom_agence: 'Agence Nord', ville: 'Valmoran', actif: true, fusionne_dans: null }],
      ibans_confirmes: [], factures: [], chantiers: [{ id: 'c2', nom: 'Zed', archive: false }, { id: 'c1', nom: 'Alpha', archive: true }],
      articles_fournisseur: [{ id: 'ar1', fournisseur_id: 'fo1', reference: 'R-1', designation: 'Ciment', unite: 'sac' }],
    };
    const client = { lire: async (table, options) => { lectures.push({ table, options }); if (panne.includes(table)) throw new Error('panne'); return { lignes: tables[table] ?? [], tronque: false, message: '' }; } };
    const actions = { appelerActionMetier: async (action, champs) => { appels.push({ action, champs }); return { ok: true, agence_id: 'ag2' }; } };
    return { d: creerDonneesAppli({ client, actions }), lectures, appels };
  }
  test('3 fournisseurs : tables déjà lues par les écrans Achats, colonnes nommées et tri ; agences, IBAN et factures facultatifs (échec = vide ou null)', async () => {
    const { d, lectures } = faux();
    const lu = await d.lireFournisseurs();
    assert.equal(lu.fournisseurs.length, 1);
    assert.equal(lu.agences.length, 1);
    assert.deepEqual(lu.ibans, []);
    for (const l of lectures) { assert.ok(Array.isArray(l.options.colonnes) && l.options.colonnes.length > 0 && !l.options.colonnes.includes('*'), l.table); assert.ok(l.options.tri?.length, l.table); }
    assert.deepEqual([...new Set(lectures.map((l) => l.table))].sort(), ['chantiers', 'etablissements_fournisseur', 'factures', 'fournisseurs', 'ibans_confirmes']);
    const panne = await faux({ panne: ['ibans_confirmes', 'factures'] }).d.lireFournisseurs();
    assert.equal(panne.ibans, null);
    assert.equal(panne.factures, null);
    await assert.rejects(() => faux({ panne: ['fournisseurs'] }).d.lireFournisseurs());
  });
  test('3 chantiers non archivés seulement ; articles avec le nom de leur fournisseur', async () => {
    const { d } = faux();
    assert.deepEqual((await d.lireChantiers()).map((c) => c.id), ['c2']);
    assert.deepEqual(await d.lireArticles(), [{ id: 'ar1', fournisseur_id: 'fo1', reference: 'R-1', designation: 'Ciment', unite: 'sac', fournisseur: 'Point Q Matériaux' }]);
  });
  test('6, 7 et 8 écritures : `creer_agence`, `revoquer_iban` (motif obligatoire), `modifier_chantier` (rien d\'envoyé si rien n\'a changé) ; jamais d\'identité dans le corps', async () => {
    const { d, appels } = faux();
    await d.creerFournisseur({ nom_fournisseur: ' Zinc et Fer ', siret: '500 000 021 00005', siren: '', nom_agence: 'Agence Sud', ville: 'Valmoran' });
    await d.revoquerIban('c1', ' IBAN remplacé depuis la fiche ');
    await assert.rejects(() => d.revoquerIban('c1', 'x'), /3 à 500/);
    await assert.rejects(() => d.revoquerIban('', 'motif correct'), /introuvable/);
    const origine = { id: 'c1', nom: 'Villa', code: 'CH-1', client: null, adresse: null };
    assert.equal(await d.enregistrerChantier(origine, { nom: 'Villa', code: 'CH-1', client: '', adresse: '' }), false);
    assert.equal(await d.enregistrerChantier(origine, { nom: 'Villa 2', code: 'CH-1', client: '', adresse: '' }), true);
    assert.deepEqual(appels, [
      { action: 'creer_agence', champs: { nom_fournisseur: 'Zinc et Fer', siret: '50000002100005', nom_agence: 'Agence Sud', ville: 'Valmoran' } },
      { action: 'revoquer_iban', champs: { id: 'c1', motif: 'IBAN remplacé depuis la fiche' } },
      { action: 'modifier_chantier', champs: { id: 'c1', champs: { nom: 'Villa 2' } } },
    ]);
    assert.doesNotMatch(JSON.stringify(appels), /email|uid|utilisateur/);
  });
});

describe('verrous écrits', () => {
  const css = lire('css/achatsfactures-appli.css');
  const appli = lire('js/modules/achatsfactures/appli.js');
  test('11 durées des animations : les mêmes dans le code (DUREES) et dans la feuille de style, celles de la maquette', () => {
    assert.deepEqual({ ...DUREES }, { tampon: 350, sortie: 700, passer: 550, entree: 450, annuler: 3200, pulse: 500, fin: 500 });
    assert.equal(COURBE_ENTREE, 'cubic-bezier(.2,.8,.2,1)');
    assert.match(css, /\.af-sort-valide \.af-tampon-v, \.af-sort-refuse \.af-tampon-r \{ animation: af-tampon \.35s ease forwards; \}/);
    assert.match(css, /@keyframes af-tampon \{ to \{ opacity: 1; transform: rotate\(-12deg\) scale\(1\); \} \}/);
    assert.match(css, /\.af-tampon \{[^}]*transform: rotate\(-12deg\) scale\(1\.6\)/);
    assert.match(css, /animation: af-sort-gauche \.7s ease forwards/);
    assert.match(css, /\.af-sort-passe \.af-carte \{ animation: af-sort-bas \.55s ease forwards; \}/);
    assert.match(css, /\.af-carte\.af-entre \{ animation: af-entre \.45s cubic-bezier\(\.2,\.8,\.2,1\); \}/);
    assert.match(css, /\.af-pastille\.af-pulse \{ animation: af-pulse \.5s ease; \}/);
    assert.match(css, /@keyframes af-pulse \{ 40% \{ transform: scale\(1\.18\); \} \}/);
    assert.match(css, /\.af-fin \{[^}]*animation: af-entre \.5s ease/);
  });
  test('11 animations réduites : la feuille les coupe et le code n\'attend pas', () => {
    assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*animation: none !important/);
    assert.match(lire('js/modules/achatsfactures/pile.js'), /if \(reduireAnimations\(\) \|\| !courant\) \{ puis\(\); return; \}/);
  });
  test('11 feuille de l\'appli : aucune couleur écrite en dur (seulement les variables des thèmes), aucune taille ni poids de texte en dur', () => {
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/);
    assert.doesNotMatch(css, /rgba?\(/);
    assert.doesNotMatch(css, /font-size: *\d+px|font-weight: *[5-9]00\b|font: *[^;}]*?\b\d+px\b/);
  });
  test('9 plein écran : chaque écouteur posé à l\'entrée du mode est retiré à la sortie, et l\'arrêt de l\'écran sort du mode', () => {
    for (const evenement of ['keydown', 'fullscreenchange']) {
      const poses = [...appli.matchAll(new RegExp(`document\\.addEventListener\\('${evenement}', (\\w+)(, true)?\\)`, 'g'))].map((m) => `${m[1]}${m[2] ?? ''}`);
      const retires = [...appli.matchAll(new RegExp(`document\\.removeEventListener\\('${evenement}', (\\w+)(, true)?\\)`, 'g'))].map((m) => `${m[1]}${m[2] ?? ''}`);
      assert.equal(poses.length, 1, evenement);
      assert.deepEqual(retires, poses, evenement);
    }
    assert.match(appli, /arrets\.push\(\(\) => \{ sortirFocus\(\{ sansFocus: true \}\); pile\.arreter\(\); volet\.arreter\(\); \}\);/);
    assert.doesNotMatch(appli, /window\.addEventListener/);
  });
  test('C1 double clic sur « Annuler » : le message fermé ne rejoue pas son action, et la pile garde les annulations en cours ; le bilan de la séance ne descend jamais sous zéro', () => {
    const pile = lire('js/modules/achatsfactures/pile.js');
    assert.match(lire('js/os/ui.js'), /let joue = false;[^\n]*\n  let ferme = false;/);
    assert.match(lire('js/os/ui.js'), /onclick: \(\) => \{ if \(joue\) return; joue = true; fermer\(\); action\.surClic\(\); \}/);
    assert.match(pile, /if \(annulations\.includes\(id\) \|\| !traitees\.has\(id\)\) return;\n    annulations\.push\(id\);/);
    assert.match(pile, /seance\.acceptees = Math\.max\(0, seance\.acceptees - 1\)/);
    assert.match(pile, /seance\.refusees = Math\.max\(0, seance\.refusees - 1\)/);
  });
  test('C5 volet : l\'écouteur de la touche Échap et le blocage du défilement posés à l\'ouverture sont retirés à la fermeture et à l\'arrêt de l\'écran', () => {
    const volet = lire('js/modules/achatsfactures/volet.js');
    assert.equal([...volet.matchAll(/document\.addEventListener\('keydown', surTouche, true\)/g)].length, 1);
    assert.match(volet, /const liberer = \(\) => \{ document\.removeEventListener\('keydown', surTouche, true\); document\.documentElement\.classList\.remove\(CLASSE_PAGE_FIGEE\); \};/);
    assert.match(volet, /remplir\(corps\);\n    liberer\(\);/);
    assert.match(volet, /arreter: \(\) => \{ vivant = false; liberer\(\); \}/);
    assert.match(css, /html\.af-volet-ouvert \{ overflow: hidden; \}/);
    assert.match(css, /\.af-haut \{[^}]*padding-top: var\(--af-encoche\)/);
    assert.match(css, /--af-encoche: env\(safe-area-inset-top, 0px\)/);
  });
  test('1 routes de l\'appli et coque : pile, tableau, réglages ; la coque cache son menu sur ces trois écrans seulement', () => {
    assert.deepEqual([...VUES_APPLI], ['pile', 'tableau', 'reglages']);
    const coque = lire('js/os/shell.js');
    assert.match(coque, /export const PAGES_APPLICATION = \['achatsfactures\/pile', 'achatsfactures\/tableau', 'achatsfactures\/reglages'\];/);
    assert.match(coque, /coquille\.classList\.toggle\('mode-appli', modeAppli\);/);
    assert.match(lire('css/os.css'), /\.coquille\.mode-appli \.menu, \.coquille\.mode-appli \.barre-haut, \.coquille\.mode-appli \.voile-menu \{ display: none; \}/);
  });
  test('12 la règle générale des applications de module est écrite dans docs/consignes-ui.md', () => {
    const doc = lire('docs/consignes-ui.md');
    const debut = doc.indexOf('## Applications de module : le même haut de page partout (27/11/2026)');
    assert.ok(debut > 0, 'titre de la règle absent');
    const regle = doc.slice(debut, doc.indexOf('\n## ', debut + 5));
    assert.ok(/en haut à gauche[^\n]*🏠 › nom de l’appli/i.test(regle), 'maison › nom de l’appli, en haut à gauche');
    assert.ok(/en haut à droite[^\n]*icône statistiques[^\n]*roue dentée/i.test(regle), 'statistiques puis roue dentée, en haut à droite');
    assert.ok(regle.includes('ne montrent QUE cette appli'), 'menu et réglages : seulement cette appli');
  });
});

// PR 2b (27/11/2026) : le « + » et les champs cadenassés (avec leur phrase) sont lus dans le MODE D'EMPLOI de la base (migration 013) ; la base fait foi.
// Sans mode d'emploi (ancienne base, migrations pas appliquées, porte pas republiée : 403), l'écran reste exactement comme avant.
describe('Mode d’emploi de la base (PR 2b)', () => {
  const PHRASE = 'Phrase fictive du cadenas, écrite par la base.';
  const OBJETS = [{ objet: 'chantiers', creer: true, phrase_sans_creer: null }, { objet: 'fournisseurs', creer: false, phrase_sans_creer: 'Phrase fictive : on ne crée pas ici.' }];
  const CHAMPS = [
    { objet: 'chantiers', champ: 'nom', modifiable: 'non', phrase_cadenas: PHRASE, archive_le: null },
    { objet: 'chantiers', champ: 'code', modifiable: 'oui', phrase_cadenas: null, archive_le: null },
    { objet: 'chantiers', champ: 'client', modifiable: 'non', phrase_cadenas: PHRASE, archive_le: '2026-11-27T00:00:00Z' }, // archivée : ignorée
    { objet: 'chantiers', champ: 'statut', modifiable: 'oui', phrase_cadenas: null, archive_le: null },
  ];
  const LIGNES = [
    { cle: 'nom', champBase: 'nom', libelle: 'Nom', valeur: 'A', modifiable: true }, { cle: 'code', champBase: 'code', libelle: 'Code', valeur: 'B', modifiable: true },
    { cle: 'client', champBase: 'client', libelle: 'Client', valeur: 'C', modifiable: true }, { cle: 'statut', champBase: 'statut', libelle: 'Statut', valeur: 'D' },
    { cle: 'resume', libelle: 'Résumé', valeur: 'E' },
  ];

  test('MD2 la base fait foi : un champ « non » est fermé avec sa phrase ; « oui » ne rouvre jamais un champ que l’écran ne sait pas écrire ; le « + » suit la base', () => {
    const mode = preparerModeEmploi(OBJETS, CHAMPS);
    const l = lignesSelonModeEmploi(mode, 'chantiers', LIGNES);
    assert.deepEqual(l.map((x) => [x.cle, !!x.modifiable, x.cadenas ?? null]), [['nom', false, PHRASE], ['code', true, null], ['client', true, null], ['statut', false, null], ['resume', false, null]]);
    assert.deepEqual(plusSelonModeEmploi(mode, 'fournisseurs', true), { montrer: false, phrase: 'Phrase fictive : on ne crée pas ici.' });
    assert.deepEqual(plusSelonModeEmploi(mode, 'chantiers', false), { montrer: false, phrase: null }, 'la base autorise, mais l’écran n’a pas de « + » : rien n’apparaît');
    assert.deepEqual(plusSelonModeEmploi(mode, 'articles_fournisseur', true), { montrer: true, phrase: null }, 'pas de ligne pour cette table : comme avant');
    assert.equal(OBJET_DU_VOLET.articles, 'articles_fournisseur');
  });

  test('MD3 sans mode d’emploi : les lignes et le « + » restent exactement comme avant', () => {
    for (const mode of [null, preparerModeEmploi([], []), preparerModeEmploi(null, null)]) {
      assert.equal(lignesSelonModeEmploi(mode, 'chantiers', LIGNES), LIGNES, 'même objet, rien de changé');
      assert.deepEqual(plusSelonModeEmploi(mode, 'fournisseurs', true), { montrer: true, phrase: null });
    }
  });

  test('MD3 lecture : tables nommées, colonnes nommées, tables du volet seulement ; table absente, 403 « lecture refusée », tables vides ou lecture coupée = null, sans erreur', async () => {
    const lectures = [];
    const client = (comportement) => ({ lire: async (table, options) => { lectures.push({ table, options }); return comportement(table); } });
    const avec = creerDonneesAppli({ client: client((t) => ({ lignes: t === 'mode_emploi_objets' ? OBJETS : CHAMPS, tronque: false })), actions: {} });
    const mode = await avec.lireModeEmploi();
    assert.equal(mode.get('fournisseurs').creer, false);
    assert.deepEqual(lectures.map((x) => x.table).sort(), ['mode_emploi_champs', 'mode_emploi_objets']);
    for (const x of lectures) {
      assert.ok(x.options.colonnes.length && x.options.tri.length, 'colonnes et tri nommés');
      assert.deepEqual(x.options.filtres, [['objet', 'in', ['fournisseurs', 'chantiers', 'articles_fournisseur']]]);
    }
    const erreur = (statut) => Object.assign(new Error('refus'), { statut });
    for (const comportement of [() => { throw erreur(404); }, () => { throw erreur(403); }, () => ({ lignes: [], tronque: false }), () => ({ lignes: OBJETS, tronque: true })]) {
      assert.equal(await creerDonneesAppli({ client: client(comportement), actions: {} }).lireModeEmploi(), null);
    }
    // définitif (absent : 403, 404, vide) ou passager (réseau, lecture coupée : l'écran réessaiera à l'ouverture suivante)
    const essai = async (comportement) => creerDonneesAppli({ client: client(comportement), actions: {} }).lireModeEmploi({ essai: true });
    assert.deepEqual(await essai(() => { throw erreur(403); }), { mode: null, definitif: true });
    assert.deepEqual(await essai(() => { throw erreur(404); }), { mode: null, definitif: true });
    assert.deepEqual(await essai(() => ({ lignes: [], tronque: false })), { mode: null, definitif: true });
    assert.deepEqual(await essai(() => { throw new Error('réseau'); }), { mode: null, definitif: false });
    assert.deepEqual(await essai(() => { throw erreur(401); }), { mode: null, definitif: false }, 'badge périmé : passager');
    assert.deepEqual(await essai(() => ({ lignes: OBJETS, tronque: true })), { mode: null, definitif: false });
  });

  test('MD2 « tant_que_vide » ouvert tant que la valeur est vide ; une saisie ne garde que les champs que la base laisse modifier (fiche ouverte avant l’arrivée du mode d’emploi)', () => {
    const mode = preparerModeEmploi(OBJETS, [...CHAMPS, { objet: 'chantiers', champ: 'adresse', modifiable: 'tant_que_vide', phrase_cadenas: PHRASE, archive_le: null }]);
    const lignes = [{ cle: 'adresse', champBase: 'adresse', libelle: 'Adresse', valeur: '—', modifiable: true }];
    assert.equal(lignesSelonModeEmploi(mode, 'chantiers', lignes)[0].modifiable, true, 'vide : se remplit');
    assert.deepEqual(lignesSelonModeEmploi(mode, 'chantiers', [{ ...lignes[0], valeur: '1 rue fictive' }]).map((l) => [l.modifiable, l.cadenas]), [[false, PHRASE]], 'rempli : cadenassé');
    assert.deepEqual(saisieSelonModeEmploi(mode, 'chantiers', LIGNES, { nom: 'Saisi', code: 'X', client: 'Y' }), { code: 'X', client: 'Y' }, 'le nom cadenassé n’est jamais envoyé');
    assert.deepEqual(saisieSelonModeEmploi(null, 'chantiers', LIGNES, { nom: 'Saisi', code: 'X' }), { nom: 'Saisi', code: 'X' }, 'sans mode d’emploi : comme avant');
  });
});
