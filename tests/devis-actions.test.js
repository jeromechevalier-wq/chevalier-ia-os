// Actions d'un devis (menu « … » de la liste, de l'éditeur et de la visualisation) et panneau « Historique » : fonctions pures de liste.js et historique-logique.js.
// Chaque test commence par le numéro du critère (1 à 7, voir le brief « simplifier les actions d’un devis »).
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import * as Li from '../js/modules/devis/liste.js';
import * as H from '../js/modules/devis/historique-logique.js';

const d = (statut, extra = {}) => ({ id: 'x', racineId: 'x', version: 1, statut, numero: statut === 'brouillon' ? null : 'DEV-2026-10-24-001', creeLe: new Date('2026-10-01T09:00:00Z'), ...extra });
const cles = (liste) => liste.filter((e) => e.cle).map((e) => e.cle);
const entree = (liste, cle) => liste.find((e) => e.cle === cle);
const libelles = (liste) => liste.filter((e) => e.libelle).map((e) => e.libelle);

describe('1 menu d’un brouillon', () => {
  test('1 un brouillon propose « Éditer le devis » et « Voir le devis », plus « Voir la fiche », « Voir » ni « Modifier : version actuelle »', () => {
    const l = Li.entreesActionsDevis(d('brouillon'));
    assert.equal(entree(l, 'editer').libelle, 'Éditer le devis');
    assert.equal(entree(l, 'editer').actif, true);
    assert.equal(entree(l, 'voir').libelle, 'Voir le devis');
    assert.equal(entree(l, 'voir').actif, true);
    const tout = libelles(l).join(' | ');
    for (const interdit of ['Voir la fiche', 'Modifier : version actuelle', 'Modifier : nouvelle variante']) assert.ok(!tout.includes(interdit), interdit);
    assert.ok(!libelles(l).includes('Voir'));
  });
  test('1 le reste du menu : Passer à, Dupliquer, Envoyer par e-mail, Archiver (grisé avec sa phrase), Supprimer (danger)', () => {
    const l = Li.entreesActionsDevis(d('brouillon'));
    assert.deepEqual(cles(l), ['statut:finaliser', 'editer', 'voir', 'dupliquer', 'envoyer_email', 'archiver', 'supprimer']);
    assert.equal(entree(l, 'statut:finaliser').libelle, 'Passer à « Finalisé »');
    assert.equal(entree(l, 'archiver').actif, false);
    assert.ok(l.some((e) => e.texte === Li.MESSAGE_ARCHIVE_IMPOSSIBLE), 'la phrase d’explication suit « Archiver »');
    assert.equal(entree(l, 'supprimer').danger, true);
  });
});

describe('2 devis finalisé', () => {
  for (const statut of ['en_attente_envoi', 'envoye', 'refuse']) {
    test(`2 ${statut} : « Éditer le devis » est grisé avec une explication ; « Créer une nouvelle version » est proposé`, () => {
      const l = Li.entreesActionsDevis(d(statut));
      assert.equal(entree(l, 'editer').actif, false);
      assert.ok(l.some((e) => e.texte === Li.MESSAGE_NON_EDITABLE));
      assert.equal(entree(l, 'nouvelle_version').libelle, 'Créer une nouvelle version');
      assert.equal(entree(l, 'nouvelle_version').actif, true);
      assert.equal(entree(l, 'supprimer'), undefined, 'seul un brouillon se supprime');
    });
  }
  for (const statut of ['accepte', 'remplace']) {
    test(`2 ${statut} : pas d’édition et pas de nouvelle version`, () => {
      const l = Li.entreesActionsDevis(d(statut));
      assert.equal(entree(l, 'editer').actif, false);
      assert.equal(entree(l, 'nouvelle_version'), undefined);
    });
  }
  test('2 un brouillon n’a pas de « Créer une nouvelle version » (il se modifie directement)', () => {
    assert.equal(entree(Li.entreesActionsDevis(d('brouillon')), 'nouvelle_version'), undefined);
  });
});

describe('3 une seule source pour la liste, l’éditeur et la visualisation', () => {
  test('3 l’éditeur et la visualisation proposent les mêmes entrées que la liste, moins celles qui ont déjà leur bouton (Envoyer) ou qui sont l’écran courant', () => {
    for (const statut of ['brouillon', 'en_attente_envoi', 'envoye', 'accepte', 'refuse', 'remplace']) {
      const liste = Li.entreesActionsDevis(d(statut));
      const editeur = Li.entreesActionsDevis(d(statut), { exclure: ['envoyer_email', 'editer'] });
      const visualisation = Li.entreesActionsDevis(d(statut), { exclure: ['envoyer_email', 'voir'] });
      assert.deepEqual(cles(editeur), cles(liste).filter((c) => !['envoyer_email', 'editer'].includes(c)), `${statut} éditeur`);
      assert.deepEqual(cles(visualisation), cles(liste).filter((c) => !['envoyer_email', 'voir'].includes(c)), `${statut} visualisation`);
      // mêmes textes, même état grisé ou non
      for (const e of editeur.filter((x) => x.cle)) assert.deepEqual(e, entree(liste, e.cle), `${statut} ${e.cle}`);
    }
  });
  test('3 aucun séparateur en tête, en queue ou doublé', () => {
    for (const statut of ['brouillon', 'envoye', 'accepte']) {
      const l = Li.entreesActionsDevis(d(statut), { exclure: ['envoyer_email', 'editer', 'voir', 'dupliquer'] });
      assert.notEqual(l[0]?.separateur, true);
      assert.notEqual(l.at(-1)?.separateur, true);
      l.forEach((e, i) => { if (e.separateur) assert.notEqual(l[i - 1]?.separateur, true); });
    }
  });
  test('3 sans éditeur, les entrées d’édition sont grisées « bientôt disponible » (même règle partout)', () => {
    const l = Li.entreesActionsDevis(d('brouillon'), { editeur: false });
    assert.equal(entree(l, 'editer').actif, false);
    assert.match(entree(l, 'editer').libelle, /bientôt disponible/);
  });
});

describe('5 panneau « Historique »', () => {
  const v1 = d('remplace', { id: 'v1', racineId: 'v1', version: 1, finaliseLe: new Date('2026-10-02T09:00:00Z') });
  const v2 = d('brouillon', { id: 'v2', racineId: 'v1', version: 2, numero: v1.numero });
  test('5 les versions du devis sont rangées de la plus ancienne à la plus récente, la courante est marquée', () => {
    const v = H.versionsHistorique(v2, [v2, v1, d('brouillon', { id: 'autre', racineId: 'autre' })]);
    assert.deepEqual(v.map((x) => [x.id, x.version, x.courante]), [['v1', 1, false], ['v2', 2, true]]);
    assert.equal(v[0].libelleStatut, 'Remplacé');
  });
  test('5 un devis seul a une seule version : lui-même', () => {
    assert.deepEqual(H.versionsHistorique(d('brouillon'), []).map((x) => [x.id, x.courante]), [['x', true]]);
  });
  test('5 les dates existantes seulement, dans l’ordre de la vie du devis ; « Archivé » sans date', () => {
    const l = H.datesHistorique(d('accepte', { finaliseLe: new Date('2026-10-02T10:00:00Z'), envoyeLe: new Date('2026-10-03T10:00:00Z'), accepteLe: new Date('2026-10-05T10:00:00Z'), archive: true }));
    assert.deepEqual(l.map((x) => x.cle), ['cree', 'finalise', 'envoye', 'accepte', 'archive']);
    assert.equal(l[0].jour, '01/10/2026');
    assert.equal(l.at(-1).jour, '');
  });
  test('5 les envois par e-mail : aucun pour un brouillon, une ligne par envoi sinon', () => {
    assert.deepEqual(H.contenuHistorique(d('brouillon', { envoyeLe: new Date('2026-10-03T10:00:00Z') })).envois, []);
    const c = H.contenuHistorique(d('envoye', { envoyeLe: new Date('2026-10-03T10:00:00Z'), envois: [{ date: new Date('2026-10-03T10:00:00Z'), destinataires: ['client@exemple.fr'] }] }));
    assert.equal(c.envois.length, 1);
    assert.match(c.envois[0].texte, /^Envoyé le 03\/10\/2026/);
    assert.match(c.envois[0].texte, /client@exemple\.fr/);
  });
  test('6 cas vide : un devis sans date connue ni envoi donne des listes vides, sans erreur', () => {
    const c = H.contenuHistorique({ id: 'z', statut: 'envoye' });
    assert.deepEqual([c.envois.length, c.dates.length, c.versions.length], [0, 0, 1]);
    assert.doesNotThrow(() => H.contenuHistorique(null));
  });
});

describe('Archivage (menu « … »)', () => {
  test('Archiver (signé ou refusé), Désarchiver (archivé), sinon grisé avec la raison du serveur', () => {
    const a = Li.archivageDevis(d('accepte'));
    assert.deepEqual([a.libelle, a.action, a.actif], ['Archiver', 'archiver', true]);
    assert.equal(Li.archivageDevis(d('refuse')).action, 'archiver');
    const r = Li.archivageDevis(d('accepte', { archive: true }));
    assert.deepEqual([r.libelle, r.action, r.icone, r.actif], ['Désarchiver', 'desarchiver', 'archive-restore', true]);
    const g = Li.archivageDevis(d('envoye'));
    assert.deepEqual([g.actif, g.raison], [false, 'Seul un devis signé ou refusé peut être archivé.']);
  });
});
