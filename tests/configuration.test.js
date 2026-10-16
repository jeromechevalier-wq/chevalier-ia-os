// Ménage du CRM (2026-10-16) : étapes de vente et phases de projet configurables, options (suivi des paiements, extraction de valeur…),
// objectifs, modèles d'affaires, membres assignables. Logique pure, partagée par l'écran et le serveur MCP : node --test configuration.test.js
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/modules/crm/logique.js';
import * as P from '../js/modules/projets/logique.js';

const JEROME = 'jerome.chevalier@gmail.com';
const ctx = (config, extra = {}) => {
  let n = 0;
  return { maintenant: new Date('2026-10-20T09:00:00Z'), auteur: JEROME, config, nouvelId: (nom) => `${nom}_${++n}`, ...extra };
};
const affaire = (config, extra = {}) => ({ ...L.nouvelleAffaire({ titre: 'Test' }, ctx(config)), id: 'a1', ...extra });
const projet = (config, extra = {}) => ({ ...P.nouveauProjet({ titre: 'Chantier' }, ctx(config)), id: 'pr1', ...extra });
const avecOptions = (config, options) => ({ ...config, options: { ...config.options, ...options } });

describe('Configuration : six emplacements, valeurs de départ, migration douce', () => {
  test('six emplacements d’étapes et de phases, identifiants fixes ; neutre ≠ Jérôme', () => {
    assert.equal(L.NB_EMPLACEMENTS, 6);
    for (const c of [L.CONFIG_NEUTRE, L.CONFIG_JEROME]) {
      assert.equal(c.etapes.length, 6);
      assert.equal(c.phases.length, 6);
      assert.ok(c.etapes.find((e) => e.id === c.roleGagnee).actif);
      assert.ok(c.phases.find((p) => p.id === c.roleCloture).actif);
    }
    assert.deepEqual(L.CONFIG_NEUTRE.etapes.map((e) => e.id), ['etape_1', 'etape_2', 'etape_3', 'etape_4', 'etape_5', 'etape_6']);
    assert.deepEqual(L.CONFIG_NEUTRE.phases.map((e) => e.id), ['phase_1', 'phase_2', 'phase_3', 'phase_4', 'phase_5', 'phase_6']);
    const texte = JSON.stringify([L.CONFIG_NEUTRE, L.MODELES_AFFAIRE_NEUTRES, P.MODELES_NEUTRES, L.FILTRES_NEUTRES, L.ETIQUETTES_NEUTRES, L.SOURCES_NEUTRES, L.SECTEURS_NEUTRES]);
    assert.ok(!/premier_contact|rdv_fixe|proposition_envoyee|lancement|decouverte|Audit|Accompagnement|Réseau entrepreneuses|Flyer|Charles|Jérôme|jerome/i.test(texte), 'rien de Jérôme dans les valeurs neutres');
  });

  test('migration douce : sans aucun document de configuration, la racine garde ses identifiants et ses noms', () => {
    const c = L.construireConfig({}, { racine: true });
    assert.deepEqual(c.etapes.map((e) => [e.id, e.libelle, e.actif]), L.CONFIG_JEROME.etapes.map((e) => [e.id, e.libelle, e.actif]));
    assert.equal(c.roleGagnee, 'gagne');
    assert.equal(c.roleCloture, 'cloture');
    assert.equal(c.options.suiviPaiements, true);
    assert.equal(c.options.extractionValeur, true);
    // une affaire existante de Jérôme (document tel qu’en 2.3.3) reste valide
    const ancienne = { id: 'x', titre: 'Ancienne', etape: 'gagne', statut: 'gagnee', datesEtapes: { gagne: new Date('2026-10-02T10:00:00Z') }, encaissements: [], montant: 500 };
    assert.equal(L.libelleEtape(ancienne.etape, c), 'Gagné');
    assert.equal(L.statutPourEtape(ancienne.etape, c), 'gagnee');
    assert.equal(L.CALCULS.ca_signe.calculer({ affaires: [ancienne], config: c }, '2026-10'), 500);
  });

  test('sans configuration, un espace client part du jeu neutre, options éteintes', () => {
    const c = L.construireConfig({}, { racine: false });
    assert.equal(c.roleGagnee, 'etape_5');
    assert.equal(c.options.suiviPaiements, false);
    assert.equal(c.options.extractionValeur, false);
    assert.equal(c.options.boutonsDepot, false);
    assert.equal(c.options.celebrations, false);
    assert.equal(c.options.clotureBloquee, true);
    assert.deepEqual(c.membres, []);
  });

  test('la configuration enregistrée l’emporte : nom, description, couleur, actif, rôle, options', () => {
    const c = L.construireConfig({
      etapes: { items: [{ libelle: '  Prise   de contact ', description: 'Premier échange', couleur: '#112233', actif: true }, {}, {}, { actif: false }, { libelle: 'Signé', actif: true }], roleGagnee: 'etape_5' },
      phases: { items: [], roleCloture: 'phase_3' },
      reglages: { suiviPaiements: true, extractionValeur: 'oui', debutActivite: '2026-03' },
    }, { racine: false, membres: [{ id: 'a@x.fr', libelle: 'A', email: 'a@x.fr' }] });
    assert.deepEqual([c.etapes[0].libelle, c.etapes[0].description, c.etapes[0].couleur], ['Prise de contact', 'Premier échange', '#112233']);
    assert.equal(c.etapes[3].actif, false);
    assert.equal(c.etapes[4].libelle, 'Signé');
    assert.equal(c.roleGagnee, 'etape_5');
    assert.equal(c.roleCloture, 'phase_3');
    assert.equal(c.options.suiviPaiements, true);
    assert.equal(c.options.extractionValeur, false, 'une valeur qui n’est pas vrai/faux est ignorée');
    assert.equal(c.debutActivite, '2026-03');
    assert.equal(c.membres.length, 1);
  });

  test('un rôle porté par une étape désactivée ou inconnue retombe sur une étape active', () => {
    const c = L.construireConfig({ etapes: { items: [{}, {}, {}, {}, { actif: false }], roleGagnee: 'etape_5' } }, { racine: false });
    assert.notEqual(c.roleGagnee, 'etape_5');
    assert.ok(c.etapes.find((e) => e.id === c.roleGagnee).actif);
    assert.equal(L.construireConfig({ etapes: { roleGagnee: 'nimporte' } }, { racine: false }).roleGagnee, 'etape_5');
  });
});

describe('Configuration : contrôle avant enregistrement', () => {
  const six = () => L.CONFIG_NEUTRE.etapes.map((e) => ({ ...e }));
  test('une configuration valide passe', () => {
    assert.deepEqual(L.validerEmplacements(six(), 'etape_5', { genre: 'etape' }).erreurs, {});
  });
  test('au moins 3 emplacements actifs', () => {
    const items = six().map((e, i) => ({ ...e, actif: i < 2 }));
    assert.match(L.validerEmplacements(items, 'etape_1', { genre: 'etape' }).erreurs.general, /au moins 3/);
  });
  test('un emplacement actif a un nom ; deux actifs ne portent pas le même nom', () => {
    const items = six();
    items[1].libelle = '   ';
    assert.ok(L.validerEmplacements(items, 'etape_5').erreurs.etape_2);
    const doublon = six();
    doublon[1].libelle = doublon[0].libelle.toUpperCase();
    assert.ok(L.validerEmplacements(doublon, 'etape_5').erreurs.etape_2);
  });
  test('on ne désactive que ce qui est vide ; l’emplacement qui porte un rôle ne se désactive pas', () => {
    const items = six();
    items[3].actif = false;
    const r = L.validerEmplacements(items, 'etape_5', { comptes: { etape_4: 2 } });
    assert.match(r.erreurs.etape_4, /contient 2 fiches/);
    assert.deepEqual(L.validerEmplacements(items, 'etape_5', { comptes: { etape_4: 0 } }).erreurs, {});
    const role = six();
    role[4].actif = false;
    assert.match(L.validerEmplacements(role, 'etape_5').erreurs.role, /ne peut pas être désactivée/);
    assert.ok(L.validerEmplacements(six(), 'inconnue').erreurs.role);
  });
  test('comptage des fiches : toutes les affaires, archivées et perdues comprises', () => {
    assert.deepEqual(L.comptesParEtape([{ etape: 'a' }, { etape: 'a', archive: true }, { etape: 'b', statut: 'perdue' }]), { a: 2, b: 1 });
    assert.deepEqual(P.comptesParPhase([{ phase: 'p' }, { phase: 'p', archive: true, nature: 'extraction' }]), { p: 2 });
  });
  test('action suggérée : titre obligatoire, délai entier de 0 à 365, type connu pour une étape', () => {
    const items = six();
    items[0].action = { type: 'tache', titre: '', delaiJours: 3 };
    assert.ok(L.validerEmplacements(items, 'etape_5').erreurs.etape_1);
    items[0].action = { type: 'tache', titre: 'Rappeler', delaiJours: 400 };
    assert.ok(L.validerEmplacements(items, 'etape_5').erreurs.etape_1);
    items[0].action = { type: 'fax', titre: 'Rappeler', delaiJours: 2 };
    assert.ok(L.validerEmplacements(items, 'etape_5').erreurs.etape_1);
    items[0].action = { type: 'appel', titre: 'Rappeler', delaiJours: 2 };
    assert.deepEqual(L.validerEmplacements(items, 'etape_5').erreurs, {});
    const phases = L.CONFIG_NEUTRE.phases.map((p) => ({ ...p, action: p.id === 'phase_1' ? { titre: 'Préparer', delaiJours: 1 } : null }));
    assert.deepEqual(L.validerEmplacements(phases, 'phase_4', { genre: 'phase' }).erreurs, {});
  });
  test('le document enregistré se relit à l’identique (aller-retour)', () => {
    const items = six();
    items[0].action = { type: 'email', titre: 'Écrire', delaiJours: 5 };
    items[0].description = ' Une   explication ';
    const doc = L.documentEmplacements(items, 'etape_5', 'etape');
    assert.equal(doc.roleGagnee, 'etape_5');
    const c = L.construireConfig({ etapes: doc }, { racine: false });
    assert.deepEqual(c.etapes[0].action, { type: 'email', titre: 'Écrire', delaiJours: 5 });
    assert.equal(c.etapes[0].description, 'Une explication');
    assert.equal(L.documentEmplacements(L.CONFIG_NEUTRE.phases, 'phase_4', 'phase').roleCloture, 'phase_4');
  });
});

describe('Affaires : étapes configurables', () => {
  const N = L.CONFIG_NEUTRE;
  test('une nouvelle affaire commence à la première étape active ; une étape désactivée est refusée', () => {
    const a = L.nouvelleAffaire({ titre: 'x' }, ctx(N));
    assert.equal(a.etape, 'etape_1');
    assert.equal(a.statut, 'ouverte');
    const c = L.construireConfig({ etapes: { items: [{ actif: false }] } }, { racine: false });
    assert.equal(L.nouvelleAffaire({ titre: 'x' }, ctx(c)).etape, 'etape_2');
    assert.equal(L.nouvelleAffaire({ titre: 'x', etape: 'etape_6' }, ctx(N)).etape, 'etape_1', 'étape désactivée : retombe sur la première');
    assert.ok(L.changementEtape(affaire(N), 'etape_6', ctx(N)).erreurs.etape);
    assert.ok(L.changementEtape(affaire(N), 'gagne', ctx(N)).erreurs.etape, 'un identifiant de Jérôme n’existe pas chez un client');
  });
  test('l’étape « vente gagnée » est configurable : statut, événement, date de signature', () => {
    const c = L.construireConfig({ etapes: { roleGagnee: 'etape_3' } }, { racine: false });
    const r = L.changementEtape(affaire(c), 'etape_3', ctx(c));
    assert.equal(r.patch.statut, 'gagnee');
    assert.ok(r.evenements.some((e) => e.type === 'affaire_gagnee'));
    assert.equal(L.changementEtape(affaire(c), 'etape_5', ctx(c)).patch.statut, 'ouverte', 'la 5e n’est plus la vente gagnée');
  });
  test('regagner une affaire rouverte met à jour la date de signature (le chiffre signé suit le dernier passage)', () => {
    const premiere = L.changementEtape(affaire(N), 'etape_5', ctx(N, { maintenant: new Date('2026-09-10T10:00:00Z') }));
    const a = { ...affaire(N), ...premiere.patch };
    const rouverte = { ...a, ...L.changementEtape(a, 'etape_2', ctx(N, { maintenant: new Date('2026-09-20T10:00:00Z') })).patch };
    const seconde = L.changementEtape(rouverte, 'etape_5', ctx(N, { maintenant: new Date('2026-10-05T10:00:00Z') }));
    assert.equal(seconde.patch.datesEtapes.etape_5.toISOString(), '2026-10-05T10:00:00.000Z');
    assert.equal(seconde.evenements.some((e) => e.type === 'affaire_gagnee'), false, 'l’événement « gagnée » n’est écrit qu’une fois');
    assert.equal(seconde.patch.datesEtapes.etape_2.toISOString(), '2026-09-20T10:00:00.000Z');
  });
  test('compter par étape : les étapes actives, même vides', () => {
    const r = L.compterParEtape([{ etape: 'etape_1' }], N);
    assert.deepEqual(r.map((e) => [e.id, e.nombre]), [['etape_1', 1], ['etape_2', 0], ['etape_3', 0], ['etape_4', 0], ['etape_5', 0]]);
  });
});

describe('Objectifs : indicateurs au choix et explications', () => {
  const N = L.CONFIG_NEUTRE;
  const gagnee = (montant, iso, extra = {}) => ({ id: `g${montant}`, etape: 'etape_5', statut: 'gagnee', montant, datesEtapes: { etape_5: new Date(iso) }, ...extra });
  test('CA signé : le montant des affaires gagnées, au mois de la signature (fuseau de Paris)', () => {
    const affaires = [
      gagnee(1000, '2026-10-10T10:00:00Z'), gagnee(500, '2026-09-30T22:30:00Z'), gagnee(300, '2026-10-31T23:30:00Z'), gagnee(null, '2026-10-12T10:00:00Z'),
      gagnee(700, '2026-10-12T10:00:00Z', { statut: 'perdue' }), gagnee(900, '2026-10-12T10:00:00Z', { etape: 'etape_2' }),
    ];
    const d = { affaires, config: avecOptions({ ...N, debutActivite: '2026-01' }, {}) };
    assert.equal(L.CALCULS.ca_signe.calculer(d, '2026-10'), 1500 - 500 + 500, 'octobre : 1000 + 500 (30/09 à 22h30 UTC = 1er/10 à Paris) ; 300 (31/10 23h30 UTC = 1er/11 à Paris) sort du mois');
    assert.equal(L.CALCULS.ca_signe.calculer(d, '2026-11'), 300);
    assert.equal(L.CALCULS.ca_signe.calculer(d, '2026-09'), 0);
  });
  test('CA signé : rien avant le début d’activité ; une affaire sans montant ne compte pas', () => {
    const affaires = [gagnee(800, '2026-02-10T10:00:00Z'), gagnee(null, '2026-03-10T10:00:00Z')];
    assert.equal(L.CALCULS.ca_signe.calculer({ affaires, config: { ...N, debutActivite: '2026-03' } }, '2026-02'), 0);
    assert.equal(L.CALCULS.ca_signe.calculer({ affaires, config: { ...N, debutActivite: '2026-03' } }, '2026-03'), 0);
    assert.equal(L.CALCULS.ca_signe.calculer({ affaires, config: N }, '2026-02'), 800);
  });
  test('CA facturé (factures non abandonnées, au mois d’envoi) et CA encaissé (factures payées, au mois du paiement)', () => {
    const projets = [{ factures: [
      { statut: 'a_payer', montant: 100, dateEnvoi: '2026-10-03' },
      { statut: 'payee', montant: 200, dateEnvoi: '2026-09-20', datePaiement: '2026-10-05' },
      { statut: 'abandonnee', montant: 400, dateEnvoi: '2026-10-04' },
    ] }];
    assert.equal(L.CALCULS.ca_facture.calculer({ projets }, '2026-10'), 100);
    assert.equal(L.CALCULS.ca_facture.calculer({ projets }, '2026-09'), 200);
    assert.equal(L.CALCULS.ca_encaisse.calculer({ projets, affaires: [] }, '2026-10'), 200);
  });
  test('passages à l’étape : le choix suit les renommages ; étape désactivée = objectif indisponible', () => {
    const objectif = { id: 'o', type: 'calcule', calcul: 'passages_etape', etapeId: 'etape_3', cible: 2 };
    const affaires = [{ datesEtapes: { etape_3: new Date('2026-10-02T10:00:00Z') } }, { datesEtapes: { etape_3: new Date('2026-09-02T10:00:00Z') } }];
    assert.equal(L.valeurObjectif(objectif, { donnees: { affaires }, mois: '2026-10' }), 1);
    assert.equal(L.libelleObjectif(objectif, N), 'Passages à l’étape : Proposition');
    const renomme = L.construireConfig({ etapes: { items: [{}, {}, { libelle: 'Devis envoyé' }] } }, { racine: false });
    assert.equal(L.libelleObjectif(objectif, renomme), 'Passages à l’étape : Devis envoyé');
    assert.equal(L.objectifDisponible(objectif, renomme), true);
    const desactive = L.construireConfig({ etapes: { items: [{}, {}, { actif: false }] } }, { racine: false });
    assert.equal(L.objectifDisponible(objectif, desactive), false);
    assert.deepEqual(L.objectifsActifsTries([objectif], desactive), []);
  });
  test('facturé et encaissé n’existent que si le suivi des paiements est allumé', () => {
    const facture = { id: 'f', type: 'calcule', calcul: 'ca_facture', cible: 1 };
    const signe = { id: 's', type: 'calcule', calcul: 'ca_signe', cible: 1 };
    assert.equal(L.objectifDisponible(facture, N), false);
    assert.equal(L.objectifDisponible(signe, N), true);
    assert.equal(L.objectifDisponible(facture, avecOptions(N, { suiviPaiements: true })), true);
    assert.deepEqual(L.calculsProposables(N, []).map((c) => c.id), ['nouveaux_contacts', 'rdv_tenus', 'passages_etape', 'ca_signe']);
    assert.deepEqual(L.calculsProposables(avecOptions(N, { suiviPaiements: true }), []).map((c) => c.id), ['nouveaux_contacts', 'rdv_tenus', 'passages_etape', 'ca_signe', 'ca_facture', 'ca_encaisse']);
    assert.ok(!L.calculsProposables(N, [signe]).some((c) => c.id === 'ca_signe'), 'chaque indicateur une fois');
    assert.ok(L.calculsProposables(N, [{ calcul: 'passages_etape' }]).some((c) => c.id === 'passages_etape'), '« passages à l’étape » peut être ajouté pour plusieurs étapes');
  });
  test('départ neutre d’un nouvel espace : contacts, rendez-vous, passages à une étape ; pas de chiffre d’affaires ni de flyers', () => {
    const depart = L.objectifsDepart(N);
    assert.deepEqual(depart.map((o) => o.calcul ?? o.id), ['nouveaux_contacts', 'rdv_tenus', 'passages_etape']);
    assert.equal(depart[2].etapeId, 'etape_3');
    assert.ok(depart.every((o) => L.objectifDisponible(o, N)));
    assert.ok(!JSON.stringify(depart).includes('flyers'));
    assert.ok(L.OBJECTIFS_JEROME.some((o) => o.id === 'flyers'), 'Flyers reste chez Jérôme');
  });
  test('chaque indicateur calculé porte un texte d’explication en lecture seule', () => {
    for (const [id, c] of Object.entries(L.CALCULS)) assert.ok(typeof c.explication === 'string' && c.explication.length > 20, id);
  });
  test('l’indicateur historique de Jérôme « Propositions envoyées » continue de compter', () => {
    const affaires = [{ datesEtapes: { proposition_envoyee: new Date('2026-10-02T10:00:00Z') } }];
    assert.equal(L.valeurObjectif({ type: 'calcule', calcul: 'propositions_envoyees' }, { donnees: { affaires }, mois: '2026-10' }), 1);
  });
});

describe('Projets : phases configurables, clôture, options', () => {
  const N = L.CONFIG_NEUTRE;
  const JC = L.CONFIG_JEROME;
  const facture = (statut = 'a_payer') => ({ id: 'f1', libelle: 'Acompte', montant: 300, dateEnvoi: '2026-10-01', datePaiement: statut === 'payee' ? '2026-10-10' : null, statut });

  test('un projet commence à la première phase active ; une phase désactivée est refusée', () => {
    assert.equal(projet(N).phase, 'phase_1');
    assert.equal(P.nouveauProjet({ titre: 'x', phase: 'phase_5' }, ctx(N)).phase, 'phase_1');
    assert.ok(P.changementPhase(projet(N), 'phase_6', ctx(N)).erreurs.phase);
    assert.ok(P.validerProjet({ titre: 'x', phase: 'lancement' }, N).phase, 'un identifiant de Jérôme n’existe pas chez un client');
    assert.deepEqual(P.validerProjet({ titre: 'x', phase: 'phase_2' }, N), {});
  });
  test('la phase « clôture » est configurable (pas forcément la dernière)', () => {
    const c = L.construireConfig({ phases: { roleCloture: 'phase_2' } }, { racine: false });
    const fin = P.terminerProjet(projet(c), ctx(c));
    assert.equal(fin.patch.phase, 'phase_2');
    assert.equal(fin.patch.statut, 'termine');
    assert.equal(P.estPhaseCloture('phase_4', c), false);
    // chez Jérôme : toujours « cloture »
    assert.equal(P.terminerProjet(projet(JC), ctx(JC)).patch.phase, 'cloture');
  });
  test('suivi des paiements éteint : la clôture n’est jamais bloquée, et les factures sont refusées', () => {
    const p = projet(N, { factures: [facture()] });
    assert.equal(P.blocageCloture(p, N), null);
    assert.deepEqual(P.terminerProjet(p, ctx(N)).erreurs, {});
    assert.equal(P.changementPhase(p, 'phase_4', ctx(N)).erreurs.factures, undefined);
    const r = P.ajouterFacture(projet(N), { montant: 100 }, ctx(N));
    assert.equal(r.erreurs.factures, P.MESSAGE_SUIVI_ETEINT);
    assert.deepEqual(r.patch, {});
    for (const f of [() => P.marquerFacturePayee(p, 'f1', {}, ctx(N)), () => P.abandonnerFacture(p, 'f1', 'x', ctx(N)), () => P.supprimerFacture(p, 'f1', ctx(N)), () => P.remettreFactureAPayer(p, 'f1', ctx(N)), () => P.modifierFacture(p, 'f1', { montant: 5 }, ctx(N))]) {
      assert.equal(f().erreurs.factures, P.MESSAGE_SUIVI_ETEINT);
    }
  });
  test('suivi allumé : clôture bloquée tant qu’une facture est à payer, sauf si la règle est éteinte (réglable oui/non)', () => {
    const avec = avecOptions(N, { suiviPaiements: true });
    const p = projet(avec, { factures: [facture()] });
    assert.ok(P.terminerProjet(p, ctx(avec)).erreurs.factures);
    assert.ok(P.changementPhase(p, 'phase_4', ctx(avec)).erreurs.factures);
    const libre = avecOptions(N, { suiviPaiements: true, clotureBloquee: false });
    assert.deepEqual(P.terminerProjet(p, ctx(libre)).erreurs, {});
    assert.equal(P.terminerProjet(p, ctx(libre)).patch.statut, 'termine');
    // la sortie « impayé » reste disponible quand la règle est active
    const impaye = P.terminerProjet(p, ctx(avec), { impaye: { raison: 'Client disparu' } });
    assert.equal(impaye.patch.factures[0].statut, 'abandonnee');
  });
  test('extraction de valeur éteinte : aucun plan n’en crée ; allumée : comme avant', () => {
    const off = N;
    const on = avecOptions(L.construireConfig({ etapes: { roleGagnee: 'etape_5' } }, { racine: false }), { extractionValeur: true });
    const a = affaire(on, { etape: 'etape_2' });
    assert.equal(P.planChangerEtapeAvecExtraction({ affaire: a, etape: 'etape_5' }, ctx(off)).extraction, null);
    assert.ok(P.planChangerEtapeAvecExtraction({ affaire: a, etape: 'etape_5' }, ctx(on)).extraction);
    assert.equal(P.planMarquerPerdueAvecExtraction({ affaire: a, saisie: { raison: 'Prix' } }, ctx(off)).extraction, null);
    assert.ok(P.planMarquerPerdueAvecExtraction({ affaire: a, saisie: { raison: 'Prix' } }, ctx(on)).extraction);
    assert.equal(P.planTerminerProjetAvecExtraction({ projet: projet(off) }, ctx(off)).extraction, null);
    assert.ok(P.planTerminerProjetAvecExtraction({ projet: projet(on) }, ctx(on)).extraction);
    const manuel = P.planExtraireProjet({ projet: projet(off) }, ctx(off));
    assert.ok(manuel.erreurs.projet);
    assert.deepEqual(manuel.ecritures, []);
    assert.ok(P.planExtraireProjet({ projet: projet(on) }, ctx(on)).extraction);
    // l’extraction d’un espace client tombe dans des phases qui existent
    const phases = new Set(P.phasesActives(on).map((p) => p.id));
    const ecr = P.planTerminerProjetAvecExtraction({ projet: projet(on) }, ctx(on)).ecritures.filter((e) => e.collection === 'projets_taches');
    assert.equal(ecr.length, 4);
    assert.ok(ecr.every((e) => phases.has(e.donnees.phase)));
  });
  test('action suggérée d’une phase : aucune par défaut, jamais créée toute seule', () => {
    assert.equal(P.changementPhase(projet(N), 'phase_2', ctx(N)).suggestion, null);
    const c = L.construireConfig({ phases: { items: [{}, { action: { titre: 'Point d’étape', delaiJours: 7 } }] } }, { racine: false });
    const r = P.changementPhase(projet(c), 'phase_2', ctx(c));
    assert.deepEqual(r.suggestion, { type: 'tache', titre: 'Point d’étape', date: '2026-10-27' });
    const plan = P.planChangerPhase(projet(c), 'phase_2', ctx(c));
    assert.equal(plan.ecritures.some((e) => e.collection === 'projets_taches'), false);
    assert.ok(!P.changementPhase(projet(c), 'phase_1', ctx(c)).suggestion, 'pas de changement, pas de suggestion');
  });
  test('modèles neutres de projet : valides, sur des phases du jeu neutre', () => {
    for (const m of P.MODELES_NEUTRES) {
      assert.deepEqual(P.validerModele(m), {});
      for (const t of m.taches) assert.deepEqual(P.validerTacheModele(t, N), {});
    }
    const plan = P.planCreerProjet({ titre: 'Essai' }, ctx(N), { modele: P.MODELES_NEUTRES[0] });
    assert.deepEqual(plan.ecritures.filter((e) => e.collection === 'projets_taches').map((e) => e.donnees.phase), ['phase_1', 'phase_2', 'phase_3']);
    assert.deepEqual(P.planInitialiserModeles({ racine: false }).ecritures.map((e) => e.id), ['projet-type']);
    assert.deepEqual(P.planInitialiserModeles({ racine: true }).ecritures.map((e) => e.id), ['audit', 'accompagnement', 'extraction']);
  });
});

describe('Tâches : « Confiée à » issue des membres de l’espace', () => {
  const MEMBRES = [{ id: 'ines@x.fr', libelle: 'Ines', email: 'ines@x.fr' }, { id: 'paul@x.fr', libelle: 'Paul', email: 'paul@x.fr' }];
  const C2 = { ...L.CONFIG_NEUTRE, membres: MEMBRES };
  const C1 = { ...L.CONFIG_NEUTRE, membres: [MEMBRES[0]] };
  const tache = (config, valeurs, extra = {}) => P.nouvelleTache({ titre: 't', projetId: 'pr1', ...valeurs }, ctx(config, extra));

  test('à la racine : Jérôme et Charles, Jérôme par défaut (comme avant)', () => {
    assert.deepEqual(L.MEMBRES_JEROME.map((m) => m.id), ['jerome', 'charles']);
    assert.equal(tache(L.CONFIG_JEROME, {}).assigneA, 'jerome');
    assert.equal(tache(L.CONFIG_JEROME, { assigneA: 'charles' }).assigneA, 'charles');
  });
  test('par défaut : l’auteur s’il est membre, sinon le premier membre ; le nom est mémorisé', () => {
    assert.equal(tache(C2, {}, { auteur: 'paul@x.fr' }).assigneA, 'paul@x.fr');
    assert.equal(tache(C2, {}, { auteur: 'claude-code' }).assigneA, 'ines@x.fr');
    assert.equal(tache(C2, { assigneA: 'paul@x.fr' }).assigneNom, 'Paul');
    assert.equal(tache(C2, { assigneA: 'inconnu@x.fr' }).assigneA, 'ines@x.fr', 'quelqu’un qui n’est pas membre est ignoré');
  });
  test('un seul membre : pas de choix à proposer', () => {
    assert.equal(P.choixAssigneVisible(C1), false);
    assert.equal(P.choixAssigneVisible(C2), true);
    assert.equal(P.choixAssigneVisible(L.CONFIG_JEROME), true);
    assert.equal(P.choixAssigneVisible(L.CONFIG_NEUTRE), false, 'aucun membre connu : pas de choix');
  });
  test('un membre retiré : sa tâche n’est jamais supprimée, elle garde son nom + « (ancien membre) »', () => {
    const t = tache(C2, { assigneA: 'paul@x.fr' });
    assert.equal(P.libelleAssigne(t.assigneA, C2, t.assigneNom), 'Paul');
    assert.equal(P.libelleAssigne(t.assigneA, C1, t.assigneNom), 'Paul (ancien membre)');
    assert.equal(P.libelleAssigne('sophie.martin@x.fr', C1, ''), 'sophie.martin (ancien membre)');
    // les tâches existantes restent modifiables sans toucher à l’assigné : réassigner à un membre actuel est permis, à un ancien membre non
    const existante = { ...t, id: 't9' };
    assert.deepEqual(P.planMajTache({ tache: existante, patch: { titre: 'Autre titre' }, config: C1 }).erreurs, {});
    assert.ok(P.planMajTache({ tache: existante, patch: { assigneA: 'paul@x.fr' }, config: C1 }).erreurs.assigneA);
    const re = P.planMajTache({ tache: existante, patch: { assigneA: 'ines@x.fr' }, config: C1 });
    assert.deepEqual(re.patch, { assigneA: 'ines@x.fr', assigneNom: 'Ines' });
    assert.ok(!re.ecritures.some((e) => e.type === 'supprimer'));
  });
});

describe('Modèles d’affaires (nouveauté)', () => {
  const N = L.CONFIG_NEUTRE;
  const modele = L.MODELES_AFFAIRE_NEUTRES[0];
  test('le modèle neutre est valide', () => {
    assert.deepEqual(L.validerModeleAffaire(modele, N), {});
    for (const a of modele.activites) assert.deepEqual(L.validerActiviteModele(a), {});
  });
  test('validations : nom, priorité, étape active, montant, activités', () => {
    assert.ok(L.validerModeleAffaire({ nom: ' ' }, N).nom);
    assert.ok(L.validerModeleAffaire({ nom: 'x', priorite: 'tres' }, N).priorite);
    assert.ok(L.validerModeleAffaire({ nom: 'x', etape: 'etape_6' }, N).etape);
    assert.ok(L.validerModeleAffaire({ nom: 'x', montant: -4 }, N).montant);
    assert.ok(L.validerActiviteModele({ type: 'tache', titre: '' }).titre);
    assert.ok(L.validerActiviteModele({ type: 'fax', titre: 'x' }).type);
    assert.ok(L.validerActiviteModele({ type: 'tache', titre: 'x', delaiJours: 99999 }).delaiJours);
  });
  test('une affaire née d’un modèle : valeurs reprises, ce que l’on saisit l’emporte, activités types créées avec leurs dates', () => {
    const m = { ...modele, offreId: 'o1', priorite: 'chaud', montant: 900, besoin: 'Site', etape: 'etape_2' };
    const plan = L.planCreerAffaire({ titre: 'Boulangerie', montant: '1500' }, { modele: m }, ctx(N));
    const fiche = plan.ecritures[0].donnees;
    assert.deepEqual([fiche.offreId, fiche.priorite, fiche.montant, fiche.besoin, fiche.etape], ['o1', 'chaud', 1500, 'Site', 'etape_2']);
    const activites = plan.ecritures.filter((e) => e.collection === 'crm_activites').map((e) => e.donnees);
    assert.deepEqual(activites.map((a) => [a.type, a.titre, a.date, a.affaireId]), [
      ['rendez_vous', 'Premier rendez-vous', '2026-10-27', plan.id], ['tache', 'Envoyer la proposition', '2026-11-03', plan.id],
    ]);
    // sans modèle : comme avant, aucune activité
    assert.equal(L.planCreerAffaire({ titre: 'x' }, {}, ctx(N)).ecritures.some((e) => e.collection === 'crm_activites'), false);
    // une étape de départ devenue inactive est ignorée
    const vieux = { ...modele, etape: 'etape_6' };
    assert.equal(L.planCreerAffaire({ titre: 'x' }, { modele: vieux }, ctx(N)).ecritures[0].donnees.etape, 'etape_1');
  });
  test('modèle propre à enregistrer', () => {
    const m = L.nouveauModeleAffaire({ nom: '  Site   web ', priorite: 'inconnue', montant: '', activites: [{ id: 'a', type: 'zzz', titre: ' Appeler ', delaiJours: '' }] }, { id: 'm1', ordre: 2 });
    assert.deepEqual(m, { id: 'm1', nom: 'Site web', offreId: null, etape: null, priorite: 'tiede', montant: null, besoin: '', activites: [{ id: 'a', type: 'tache', titre: 'Appeler', delaiJours: 0 }], actif: true, ordre: 2 });
    assert.deepEqual(L.modelesAffaireActifs([{ id: 'b', ordre: 2 }, { id: 'a', ordre: 1 }, { id: 'c', ordre: 3, actif: false }]).map((x) => x.id), ['a', 'b']);
  });
});
