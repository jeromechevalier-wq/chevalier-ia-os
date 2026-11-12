// Volet « Inspirations » du module Réseaux sociaux (12/11/2026) : profils, exemples de posts, adresses LinkedIn, ordre, règles pures sans navigateur ni émulateur.
// Les parcours à l'écran sont dans tests/e2e/reseauxsociaux-idees.spec.js. Données fictives uniquement (Alice Exemple).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../js/modules/reseauxsociaux/logique.js';
import * as I from '../js/modules/reseauxsociaux/idees-logique.js';
import * as N from '../js/modules/reseauxsociaux/inspirations-logique.js';

const profil = (id, ordre, extra = {}) => ({ id, nom: `Profil ${id}`, url: 'https://www.linkedin.com/in/alice-exemple', pourquoi: '', piliers: [], formats: [], ordre, ...extra });

describe('adresses LinkedIn', () => {
  test('https et domaine linkedin.com (ou sous-domaine, ou lnkd.in) acceptés ; schéma ajouté ou remonté en https', () => {
    assert.equal(N.normaliserUrlLinkedin('https://www.linkedin.com/in/alice-exemple'), 'https://www.linkedin.com/in/alice-exemple');
    assert.equal(N.normaliserUrlLinkedin('linkedin.com/in/alice-exemple'), 'https://linkedin.com/in/alice-exemple');
    assert.equal(N.normaliserUrlLinkedin('  http://fr.linkedin.com/in/alice-exemple '), 'https://fr.linkedin.com/in/alice-exemple');
    assert.equal(N.normaliserUrlLinkedin('https://lnkd.in/abc123'), 'https://lnkd.in/abc123');
  });
  test('refusées : autre schéma (javascript, data, mailto), autre domaine (même déguisé), identifiants dans l’adresse, espaces, vide', () => {
    for (const mauvaise of ['javascript:alert(1)', 'data:text/html,x', 'mailto:alice@exemple.test', 'https://exemple.test/in/alice', 'https://linkedin.com.exemple.test/in/a', 'https://notlinkedin.com/in/a',
      'https://alice:mdp@www.linkedin.com/in/a', 'ftp://www.linkedin.com/in/a', 'linkedin.com/in/a b', '', '   ', null, undefined]) {
      assert.equal(N.normaliserUrlLinkedin(mauvaise), null, String(mauvaise));
    }
  });
});

describe('un profil qui inspire', () => {
  test('champs rangés : nom, url, pourquoi, piliers et formats connus (ordre des listes, sans doublon), ordre', () => {
    const n = N.normaliserInspiration({ nom: ' Alice  Exemple ', url: 'linkedin.com/in/alice-exemple', pourquoi: 'Des accroches courtes', piliers: ['claude', 'cas_concrets', 'cas_concrets', 'inconnu'], formats: ['video', 'texte', 'xx'], ordre: 3, extra: 1 });
    assert.deepEqual(n, { nom: 'Alice Exemple', url: 'https://linkedin.com/in/alice-exemple', pourquoi: 'Des accroches courtes', piliers: ['cas_concrets', 'pedagogie'], formats: ['texte', 'video'], ordre: 3 });
  });
  test('validation : nom et adresse obligatoires, 500 caractères au plus pour « ce qui m’inspire »', () => {
    assert.match(N.validerInspiration({ nom: '', url: 'linkedin.com/in/a' }), /nom/);
    assert.match(N.validerInspiration({ nom: 'Alice', url: 'https://exemple.test' }), /adresse/);
    assert.match(N.validerInspiration({ nom: 'Alice', url: 'linkedin.com/in/a', pourquoi: 'x'.repeat(501) }), /500/);
    assert.equal(N.validerInspiration({ nom: 'Alice', url: 'linkedin.com/in/a', pourquoi: 'x'.repeat(500) }), null);
  });
  test('un nouveau profil se met en fin de liste ; une modification garde son ordre', () => {
    const creation = N.planEnregistrerInspiration(null, { nom: 'Alice', url: 'linkedin.com/in/a' }, { id: 'n1', autres: [profil('a', 0), profil('b', 4)] }).ecritures[0];
    assert.deepEqual([creation.type, creation.collection, creation.id, creation.donnees.ordre], ['creer', 'reseauxsociaux_inspirations', 'n1', 5]);
    assert.deepEqual(creation.horodater, ['creeLe', 'modifieLe']);
    const premier = N.planEnregistrerInspiration(null, { nom: 'Alice', url: 'linkedin.com/in/a' }, { id: 'n2', autres: [] }).ecritures[0];
    assert.equal(premier.donnees.ordre, 0);
    const modif = N.planEnregistrerInspiration(profil('a', 2), { pourquoi: 'Nouveau' }, { id: 'a' }).ecritures[0];
    assert.deepEqual([modif.type, modif.patch.ordre, modif.patch.pourquoi, modif.patch.nom], ['modifier', 2, 'Nouveau', 'Profil a']);
    assert.deepEqual(modif.horodater, ['modifieLe']);
  });
  test('refus lisible avec le bon type d’erreur', () => {
    assert.throws(() => N.planEnregistrerInspiration(null, { nom: '', url: '' }, { id: 'x' }), I.ErreurClaire);
  });
  test('ranger : monter ou descendre échange deux profils et renumérote ; en bout de liste, aucune écriture', () => {
    const liste = [profil('c', 2), profil('a', 0), profil('b', 1)];
    const monter = N.planDeplacerInspiration(liste, 'c', -1).ecritures;
    assert.deepEqual(monter.map((e) => [e.id, e.patch.ordre]).sort(), [['b', 2], ['c', 1]]);
    const descendre = N.planDeplacerInspiration(liste, 'a', 1).ecritures;
    assert.deepEqual(descendre.map((e) => [e.id, e.patch.ordre]).sort(), [['a', 1], ['b', 0]]);
    assert.deepEqual(N.planDeplacerInspiration(liste, 'a', -1).ecritures, []);
    assert.deepEqual(N.planDeplacerInspiration(liste, 'c', 1).ecritures, []);
    assert.deepEqual(N.planDeplacerInspiration(liste, 'inconnu', 1).ecritures, []);
    assert.ok(monter.every((e) => e.collection === 'reseauxsociaux_inspirations' && e.type === 'modifier'));
  });
  test('ordres en double ou manquants : renumérotés sans perte', () => {
    const liste = [profil('a', 0), profil('b', 0), profil('c', undefined)];
    assert.deepEqual(N.trierInspirations(liste).map((p) => p.id), ['a', 'b', 'c']); // même ordre : par nom ; ordre absent = 0
    const plan = N.planDeplacerInspiration(liste, 'a', 1).ecritures;
    assert.deepEqual(plan.map((e) => [e.id, e.patch.ordre]).sort(), [['a', 1], ['c', 2]]); // b garde 0 : rien à écrire
  });
});

describe('un exemple de post : le lien et l’analyse, JAMAIS le texte', () => {
  const saisie = { profilId: 'p1', url: 'https://www.linkedin.com/posts/alice-exemple_cas-concret-123', date: '2026-11-03', accroche: 'Une facture oubliée coûte cher', extrait: 'Une facture oubliée', structure: 'Accroche, histoire, leçon', longueur: '1 200 caractères', format: 'carrousel', pilier: 'cas_concrets', service: 'finance', pourquoi: 'Chiffre dès la première ligne' };
  test('les champs sont une liste fermée : un champ « texte » ou « contenu » n’est jamais écrit', () => {
    const n = N.normaliserExemple({ ...saisie, texte: 'LE TEXTE COMPLET DU POST', contenu: 'autre copie', corps: 'encore' });
    assert.deepEqual(Object.keys(n).sort(), ['accroche', 'date', 'extrait', 'format', 'longueur', 'pilier', 'pourquoi', 'profilId', 'service', 'structure', 'url']);
    assert.ok(!JSON.stringify(n).includes('TEXTE COMPLET'));
    const ecriture = N.planEnregistrerExemple(null, { ...saisie, texte: 'LE TEXTE COMPLET DU POST' }, { id: 'e1' }).ecritures[0];
    assert.ok(!JSON.stringify(ecriture).includes('TEXTE COMPLET'));
    assert.deepEqual([ecriture.type, ecriture.collection, ecriture.id], ['creer', 'reseauxsociaux_exemples', 'e1']);
    assert.deepEqual(ecriture.horodater, ['creeLe', 'modifieLe']);
  });
  test('500 caractères au plus par champ d’analyse (validation lisible, rien d’écrit au-delà)', () => {
    for (const c of N.CHAMPS_ANALYSE) {
      assert.equal(N.validerExemple({ ...saisie, [c.id]: 'x'.repeat(500) }), null, c.id);
      assert.match(N.validerExemple({ ...saisie, [c.id]: 'x'.repeat(501) }), /500/, c.id);
      assert.equal(N.normaliserExemple({ ...saisie, [c.id]: 'x'.repeat(900) })[c.id].length, 500, c.id);
    }
  });
  test('extrait facultatif de 400 caractères : coupé à 400, refusé au-delà à la validation, vide si absent', () => {
    assert.equal(N.normaliserExemple({ ...saisie, extrait: undefined }).extrait, '');
    assert.equal(N.normaliserExemple({ ...saisie, extrait: 'x'.repeat(800) }).extrait.length, 400);
    assert.equal(N.validerExemple({ ...saisie, extrait: 'x'.repeat(400) }), null);
    assert.match(N.validerExemple({ ...saisie, extrait: 'x'.repeat(401) }), /400/);
  });
  test('validation : profil et lien LinkedIn obligatoires, date réelle', () => {
    assert.match(N.validerExemple({ ...saisie, profilId: '' }), /profil/);
    assert.match(N.validerExemple({ ...saisie, url: 'https://exemple.test/post' }), /lien/);
    assert.match(N.validerExemple({ ...saisie, url: '' }), /lien/);
    assert.match(N.validerExemple({ ...saisie, date: '2026-02-30' }), /date/);
    assert.equal(N.validerExemple({ ...saisie, date: '' }), null);
    assert.equal(N.normaliserJour('2026-11-03'), '2026-11-03');
    assert.equal(N.normaliserJour('03/11/2026'), null);
  });
  test('format, pilier (même ancien) et service inconnus deviennent null', () => {
    const n = N.normaliserExemple({ ...saisie, format: 'gif', pilier: 'offre', service: 'cuisine' });
    assert.deepEqual([n.format, n.pilier, n.service], [null, 'demarche_offre', null]);
  });
  test('modifier un exemple garde les champs non fournis', () => {
    const plan = N.planEnregistrerExemple({ id: 'e1', ...N.normaliserExemple(saisie) }, { pourquoi: 'Autre raison' }, { id: 'e1' }).ecritures[0];
    assert.equal(plan.type, 'modifier');
    assert.deepEqual([plan.patch.pourquoi, plan.patch.accroche, plan.patch.url], ['Autre raison', saisie.accroche, saisie.url]);
  });
  test('les exemples d’un profil : le plus récent d’abord, les sans-date à la fin', () => {
    const e = [{ id: '1', profilId: 'p1', date: '2026-10-01' }, { id: '2', profilId: 'p1', date: null }, { id: '3', profilId: 'p2', date: '2026-11-01' }, { id: '4', profilId: 'p1', date: '2026-11-03' }];
    assert.deepEqual(N.exemplesDe(e, 'p1').map((x) => x.id), ['4', '1', '2']);
    assert.deepEqual(N.exemplesDe(e, 'p3'), []);
  });
  test('le module garde la liste des champs de l’analyse ', () => {
    assert.deepEqual(N.CHAMPS_ANALYSE.map((c) => c.id), ['accroche', 'structure', 'longueur', 'pourquoi']);
    assert.ok(R.COLLECTIONS.includes('reseauxsociaux_exemples'));
  });
});
