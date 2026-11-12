// Bloc « À relancer » de l'Accueil : logique pure (sélection, motifs, modèles de texte, activité « J'ai relancé »).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/modules/crm/logique.js';

const AUJ = '2026-11-20';
const il = (n) => L.ajouterJours(AUJ, -n); // « il y a n jours », AAAA-MM-JJ
const aff = (o = {}) => ({ id: 'a1', titre: 'Cuisine', statut: 'ouverte', etape: 'premier_contact', archive: false, personneId: 'p1', organisationId: null, dateEntreeEtape: il(10), datesEtapes: {}, creeLe: il(30), ...o });
const per = (o = {}) => ({ id: 'p1', nom: 'Marie Durand', prenom: 'Marie', archive: false, oppositionProspection: false, creeLe: il(60), ...o });
const act = (o = {}) => ({ id: 'x1', type: 'appel', fait: true, date: il(3), dateFait: il(3), affaireId: 'a1', personneId: null, ...o });
const dev = (o = {}) => ({ id: 'd1', numero: 'DEV-1', statut: 'envoye', envoyeLe: il(9), affaireId: 'a1', personneId: 'p1', archive: false, ...o });
const calc = (d) => L.aRelancer({ personnes: [], affaires: [], activites: [], devis: [], ...d }, AUJ);

describe('R1 À relancer : sélection', () => {
  test('R1-1 une affaire ouverte sans mouvement depuis 7 jours ou plus sort (motif A), avec son ancienneté', () => {
    const r = calc({ affaires: [aff({ dateEntreeEtape: il(7), creeLe: il(40) })], personnes: [per()] });
    assert.deepEqual(r.map((l) => [l.motif, l.type, l.id, l.jours]), [['A', 'affaire', 'a1', 7]]);
    assert.equal(calc({ affaires: [aff({ dateEntreeEtape: il(6) })], personnes: [per({ creeLe: il(1) })] }).length, 0);
  });
  test('R1-2 la dernière activité faite, l’étape ou l’envoi d’un devis comptent comme mouvement', () => {
    assert.equal(calc({ affaires: [aff()], activites: [act({ dateFait: il(2) })], personnes: [per()] }).filter((l) => l.motif === 'A').length, 0);
    assert.equal(calc({ affaires: [aff({ dateEntreeEtape: il(20), datesEtapes: { x: il(3) } })], personnes: [per()] }).filter((l) => l.motif === 'A').length, 0);
    assert.equal(calc({ affaires: [aff({ dateEntreeEtape: il(20) })], devis: [dev({ statut: 'accepte', envoyeLe: il(1) })], personnes: [per()] }).filter((l) => l.motif === 'A').length, 0);
  });
  test('R1-3 une activité prévue (non faite) écarte l’affaire : elle est déjà dans « À faire »', () => {
    assert.equal(calc({ affaires: [aff({ dateEntreeEtape: il(20) })], activites: [act({ fait: false, dateFait: null, date: il(-3) })], personnes: [per()] }).length, 0);
  });
  test('R1-4 affaire gagnée, perdue, archivée ou de test : jamais', () => {
    for (const o of [{ statut: 'gagnee' }, { statut: 'perdue' }, { archive: true }, { test: true }]) {
      assert.equal(calc({ affaires: [aff({ dateEntreeEtape: il(20), ...o })], personnes: [per()] }).filter((l) => l.motif === 'A').length, 0, JSON.stringify(o));
    }
  });
  test('R1-5 devis « envoyé » depuis 7 jours ou plus (motif B) ; accepté, refusé, brouillon ou archivé : jamais', () => {
    assert.deepEqual(calc({ affaires: [aff()], devis: [dev({ envoyeLe: il(7) })], personnes: [per()] }).map((l) => [l.motif, l.id, l.jours, l.joursEnvoi]), [['B', 'd1', 7, 7]]);
    assert.equal(calc({ devis: [dev({ envoyeLe: il(6) })] }).length, 0);
    for (const o of [{ statut: 'accepte' }, { statut: 'refuse' }, { statut: 'brouillon' }, { archive: true }, { test: true }]) {
      assert.equal(calc({ devis: [dev(o)] }).length, 0, JSON.stringify(o));
    }
  });
  test('R1-6 une relance faite depuis l’envoi repart de zéro : la ligne du devis sort', () => {
    assert.equal(calc({ affaires: [aff()], devis: [dev()], activites: [act({ dateFait: il(0) })], personnes: [per()] }).length, 0);
    assert.equal(calc({ devis: [dev({ affaireId: null })], activites: [act({ affaireId: null, personneId: 'p1', dateFait: il(1) })], personnes: [per()] }).length, 0);
  });
  test('R1-6b devis expiré : jamais ; envoi relancé dans Devis (dernier contact) ou activité sur la personne seule : la ligne sort', () => {
    assert.equal(calc({ affaires: [aff()], devis: [dev({ expire: true })], personnes: [per()] }).filter((l) => l.motif === 'B').length, 0);
    assert.equal(calc({ affaires: [aff({ dateEntreeEtape: il(1) })], devis: [dev({ dernierContactMs: Date.parse(`${il(1)}T12:00:00Z`) })], personnes: [per()] }).filter((l) => l.motif === 'B').length, 0);
    assert.equal(calc({ affaires: [aff()], devis: [dev()], activites: [act({ affaireId: null, personneId: 'p1', dateFait: il(1) })], personnes: [per()] }).filter((l) => l.motif === 'B').length, 0);
  });
  test('R1-6c devis dont le client est une organisation, sans personne ni affaire : « J’ai relancé » (activité sur l’organisation) le fait sortir', () => {
    const d = dev({ affaireId: null, personneId: null, organisationId: 'o1' });
    assert.equal(calc({ devis: [d] }).length, 1);
    assert.equal(calc({ devis: [d], activites: [act({ affaireId: null, organisationId: 'o1', dateFait: il(0) })] }).length, 0);
  });
  test('R1-6d une activité prévue sur la personne seule écarte l’affaire (elle est dans « À faire »)', () => {
    assert.equal(calc({ affaires: [aff({ dateEntreeEtape: il(20) })], personnes: [per()], activites: [act({ fait: false, dateFait: null, affaireId: null, personneId: 'p1', date: il(-2) })] }).length, 0);
  });
  test('R1-7 personne d’une affaire ouverte sans activité depuis 14 jours (motif C) ; 13 jours : non ; sans affaire ouverte : non', () => {
    const base = { affaires: [aff({ dateEntreeEtape: il(1) })], personnes: [per({ creeLe: il(14) })] };
    assert.deepEqual(calc(base).map((l) => [l.motif, l.type, l.id, l.jours]), [['C', 'personne', 'p1', 14]]);
    assert.equal(calc({ ...base, personnes: [per({ creeLe: il(13) })] }).length, 0);
    assert.equal(calc({ ...base, affaires: [] }).length, 0);
    assert.equal(calc({ ...base, activites: [act({ affaireId: null, personneId: 'p1', type: 'linkedin', dateFait: il(5) })] }).length, 0);
  });
  test('R1-8 une affaire ou une personne n’apparaît qu’une fois : B avant A avant C', () => {
    const r = calc({ affaires: [aff({ dateEntreeEtape: il(20) })], devis: [dev({ envoyeLe: il(12) })], personnes: [per({ creeLe: il(60) })] });
    assert.deepEqual(r.map((l) => l.motif), ['B']);
    const r2 = calc({ affaires: [aff({ dateEntreeEtape: il(20) })], personnes: [per({ creeLe: il(60) })] });
    assert.deepEqual(r2.map((l) => l.motif), ['A']);
    const deux = calc({ affaires: [aff()], devis: [dev({ id: 'd1', envoyeLe: il(20) }), dev({ id: 'd2', envoyeLe: il(9) })], personnes: [per()] });
    assert.deepEqual(deux.map((l) => l.id), ['d1']);
  });
  test('R1-9 opposition à la prospection, personne ou fiche de test, archivée : exclues sur tous les motifs', () => {
    const o = per({ oppositionProspection: true });
    assert.equal(calc({ affaires: [aff({ dateEntreeEtape: il(20) })], devis: [dev()], personnes: [o] }).length, 0);
    assert.equal(calc({ affaires: [aff({ dateEntreeEtape: il(1) })], personnes: [per({ test: true, creeLe: il(60) })] }).length, 0);
    assert.equal(calc({ affaires: [aff({ dateEntreeEtape: il(1) })], personnes: [per({ archive: true, creeLe: il(60) })] }).length, 0);
  });
  test('R1-10 le plus ancien d’abord', () => {
    const r = calc({
      affaires: [aff({ id: 'a1', dateEntreeEtape: il(8), personneId: null }), aff({ id: 'a2', titre: 'Bain', dateEntreeEtape: il(30), personneId: null }), aff({ id: 'a3', titre: 'Toit', dateEntreeEtape: il(15), personneId: null })],
    });
    assert.deepEqual(r.map((l) => l.id), ['a2', 'a3', 'a1']);
  });
  test('R1-11 les seuils sont des constantes nommées', () => {
    assert.deepEqual([L.SEUIL_AFFAIRE_QUI_DORT, L.SEUIL_DEVIS_SANS_REPONSE, L.SEUIL_PERSONNE_SANS_ACTIVITE, L.LIGNES_A_RELANCER], [7, 7, 14, 10]);
  });
  test('R1-12 module Devis éteint (aucun devis), aucune donnée : liste vide sans erreur', () => {
    assert.deepEqual(L.aRelancer({}, AUJ), []);
    assert.deepEqual(calc({ affaires: [aff({ dateEntreeEtape: il(1) })], personnes: [per({ creeLe: il(1) })] }), []);
  });
});

describe('R2 À relancer : brouillons et activité faite', () => {
  const ligne = (motif, extra = {}) => ({ motif, titre: 'Cuisine', jours: 12, joursEnvoi: 12, ...extra });
  test('R2-0 un titre coupé au milieu d’un emoji ne fait pas planter l’adresse e-mail', () => {
    const r = L.liensUtilesRelance({ motif: 'A', type: 'affaire', titre: 'Cuisine \ud83d', personneId: 'p1' }, { id: 'p1', emails: [{ valeur: 'a@b.fr' }] }, []);
    assert.equal(r.length, 1);
    assert.ok(!r[0].href.includes('\n'));
  });
  test('R2-1 trois modèles, vouvoiement, prénom et signature', () => {
    for (const m of ['A', 'B', 'C']) {
      const t = L.brouillonRelance(ligne(m), { prenom: 'Marie', signature: 'Jérôme' });
      assert.match(t, /^Bonjour Marie,/);
      assert.match(t, /vous/);
      assert.match(t, /Bien cordialement,\nJérôme$/);
    }
    assert.match(L.brouillonRelance(ligne('B'), { prenom: 'Marie' }), /il y a 12 jours/);
    assert.match(L.brouillonRelance(ligne('A')), /« Cuisine »/);
  });
  test('R2-2 sans prénom : « Bonjour, »', () => {
    assert.match(L.brouillonRelance(ligne('C'), { signature: 'Jérôme' }), /^Bonjour,\n/);
  });
  test('R2-3 « J’ai relancé » crée une activité email déjà faite liée à l’affaire et à la personne, plus un événement du journal', () => {
    const ctx = { maintenant: new Date('2026-11-20T09:00:00Z'), aujourdhui: AUJ, auteur: 'a@b.fr', nouvelId: (n) => `${n}-1` };
    const plan = L.planRelanceFaite({ titre: 'Cuisine', personneId: 'p1', organisationId: null, affaireId: 'a1' }, ctx);
    assert.equal(plan.ecritures.length, 2);
    const a = plan.ecritures[0].donnees ?? plan.ecritures[0].data ?? plan.ecritures[0];
    const texte = JSON.stringify(plan.ecritures);
    assert.match(texte, /"type":"email"/);
    assert.match(texte, /"fait":true/);
    assert.match(texte, /"affaireId":"a1"/);
    assert.match(texte, /activite_faite/);
    assert.ok(a);
  });
  test('R2-4 les textes de l’écran ne disent jamais « CRM »', () => {
    assert.ok(!/CRM/.test(Object.values(L.MOTIFS_RELANCE).join(' ') + L.brouillonRelance(ligne('B'))));
    assert.equal(L.texteAnciennete(1), 'il y a 1 jour');
    assert.equal(L.texteAnciennete(12), 'il y a 12 jours');
  });
});

describe('R3 À relancer : liens utiles', () => {
  const l = (o = {}) => ({ motif: 'A', type: 'affaire', titre: 'Cuisine', personneId: 'p1', affaireId: 'a1', devisId: null, ...o });
  const p = (o = {}) => ({ id: 'p1', linkedin: '', emails: [], telephones: [], ...o });
  const ids = (r) => r.map((x) => x.id);
  test('R3-1 sans profil, adresse ni téléphone : aucun lien', () => {
    assert.deepEqual(L.liensUtilesRelance(l(), p(), []), []);
    assert.deepEqual(L.liensUtilesRelance(l(), null, []), []);
  });
  test('R3-2 avec tout : e-mail d’abord (sujet prérempli, sans corps), puis LinkedIn et Appeler', () => {
    const r = L.liensUtilesRelance(l(), p({ linkedin: 'https://www.linkedin.com/in/marie', emails: [{ valeur: 'marie@exemple.fr' }], telephones: [{ valeur: '06 12 34 56 78' }] }), []);
    assert.deepEqual(ids(r), ['email', 'linkedin', 'appeler']);
    assert.equal(r[0].href, 'mailto:marie@exemple.fr?subject=Cuisine');
    assert.ok(!r[0].href.includes('body'));
    assert.equal(r[2].href, 'tel:0612345678');
    assert.equal(r[1].externe, true);
  });
  test('R3-3 si le dernier échange était sur LinkedIn, LinkedIn passe en premier', () => {
    const per = p({ linkedin: 'https://linkedin.com/in/marie', emails: [{ valeur: 'marie@exemple.fr' }] });
    const acts = [{ id: 'x', type: 'email', fait: true, dateFait: '2026-11-01', affaireId: 'a1' }, { id: 'y', type: 'linkedin', fait: true, dateFait: '2026-11-10', personneId: 'p1' }];
    assert.deepEqual(ids(L.liensUtilesRelance(l(), per, acts)), ['linkedin', 'email']);
  });
  test('R3-4 adresses LinkedIn refusées : autre site, http, faux domaine, identifiants, texte, javascript:', () => {
    for (const u of ['https://exemple.fr/in/x', 'http://www.linkedin.com/in/x', 'https://www.linkedin.com.pirate.fr/in/x', 'https://linkedin.com@pirate.fr/', 'https://user:pw@www.linkedin.com/in/x', 'marie', 'javascript:alert(1)', 'https://fr.linkedin.com/in/x', '']) {
      assert.equal(L.lienLinkedinStrict(u), null, u);
      assert.deepEqual(L.liensUtilesRelance(l(), p({ linkedin: u }), []), [], u);
    }
    assert.equal(L.lienLinkedinStrict('https://linkedin.com/in/marie'), 'https://linkedin.com/in/marie');
  });
  test('R3-5 e-mail invalide ou téléphone sans chiffre : pas de lien ; sujet d’un devis', () => {
    assert.deepEqual(L.liensUtilesRelance(l(), p({ emails: [{ valeur: 'pas-un-mail' }], telephones: [{ valeur: 'abc' }] }), []), []);
    const r = L.liensUtilesRelance(l({ motif: 'B', type: 'devis', titre: 'Devis DEV-1', devisId: 'd1', lien: 'devis/voir/d1' }), p({ emails: [{ valeur: 'a@b.fr' }] }), []);
    assert.deepEqual(ids(r), ['email', 'devis']);
    assert.equal(r[0].href, 'mailto:a@b.fr?subject=Votre%20devis%20DEV-1');
    assert.equal(r[1].href, '#/devis/voir/d1');
    assert.deepEqual(ids(L.liensUtilesRelance(l({ motif: 'B', type: 'devis', titre: 'Devis DEV-1', lien: 'https://pirate.fr' }), p(), [])), []); // une route qui ne vient pas de Devis est refusée
  });
});
