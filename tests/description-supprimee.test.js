// I5 (21/10/2026) : le champ « description » des affaires et des projets est supprimé ; à la création, une note épinglée VIDE le remplace.
// Logique pure (node --test, sans navigateur ni Firebase) : quelles notes épinglées une fiche montre, l'historique, le texte copié vers le projet.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/modules/crm/logique.js';

const note = (id, extra = {}) => ({ id, texte: `Texte ${id}`, affaireId: 'a1', creeLe: new Date('2026-10-10T10:00:00Z'), ...extra });

describe('I5 note épinglée de départ', () => {
  test('I5 une note vide n’entre jamais dans l’historique (écran et lecture du serveur MCP), même épinglée', () => {
    const notes = [note('vide', { texte: '', epinglee: true }), note('blanc', { texte: '  \n ' }), note('pleine')];
    assert.deepEqual(L.entreesHistorique({ notes }).map((e) => e.element.id), ['pleine']);
    assert.deepEqual(L.entreesHistorique({ notes }, 'notes').map((e) => e.element.id), ['pleine']);
    assert.equal(L.estNoteVide({ texte: ' ' }), true);
    assert.equal(L.estNoteVide({ texte: 'x' }), false);
  });

  test('I5 la note vide n’apparaît que sur SA fiche (affaire ou projet), jamais sur la personne, l’organisation ou le projet lié', () => {
    const vide = note('v', { texte: '', epinglee: true, personneId: 'p1' });
    const videProjet = note('vp', { texte: '', epinglee: true, personneId: 'p1', projetId: 'pr1' });
    const notes = [vide, videProjet];
    assert.deepEqual(L.notesEpinglees(notes, { affaireId: 'a1' }).map((n) => n.id), ['v']);
    assert.deepEqual(L.notesEpinglees(notes, { projetId: 'pr1' }).map((n) => n.id), ['vp']);
    assert.deepEqual(L.notesEpinglees(notes, { personneId: 'p1' }), []);
    assert.deepEqual(L.notesEpinglees(notes), []);
    // Désépinglée : elle ne revient pas.
    assert.deepEqual(L.notesEpinglees([{ ...vide, epinglee: false }], { affaireId: 'a1' }), []);
  });

  test('I5 (a) deux vraies notes épinglées « OK » de la même affaire, sans lien de copie : les deux restent (Points clés et historique)', () => {
    const n1 = note('ok1', { texte: 'OK', epinglee: true, creeLe: new Date('2026-10-01') });
    const n2 = note('ok2', { texte: 'OK', epinglee: true, creeLe: new Date('2026-10-02') });
    const visibles = L.sansCopiesDeNote([n1, n2], { affaireId: 'a1' });
    assert.deepEqual(L.notesEpinglees(visibles, { affaireId: 'a1' }).map((n) => n.id), ['ok2', 'ok1']);
    assert.deepEqual(L.entreesHistorique({ notes: visibles }).map((e) => e.element.id), ['ok2', 'ok1']);
    // Même avec une note de projet au même texte, sans lien de copie : rien n'est masqué.
    assert.equal(L.sansCopiesDeNote([n1, note('p', { texte: 'OK', epinglee: true, projetId: 'pr1' })], { affaireId: 'a1' }).length, 2);
  });

  test('I5 texte copié vers le projet : la note épinglée de l’affaire la plus ANCIENNE qui a un texte ; jamais une note d’un projet ni une note non épinglée', () => {
    const notes = [
      note('ancienne', { texte: 'Ancienne', epinglee: true, creeLe: new Date('2026-10-01') }),
      note('recente', { texte: '  Récente  ', epinglee: true, creeLe: new Date('2026-10-03') }),
      note('vide', { texte: '', epinglee: true, creeLe: new Date('2026-10-04') }),
      note('libre', { texte: 'Pas épinglée', creeLe: new Date('2026-10-05') }),
      note('projet', { texte: 'Note d’un projet', epinglee: true, projetId: 'pr9', creeLe: new Date('2026-10-06') }),
    ];
    assert.equal(L.texteNoteEpingleeAffaire(notes, 'a1'), 'Ancienne');
    assert.equal(L.texteNoteEpingleeAffaire(notes.slice(1), 'a1'), 'Récente');
    assert.equal(L.texteNoteEpingleeAffaire([note('vide', { texte: '', epinglee: true })], 'a1'), '');
    assert.equal(L.texteNoteEpingleeAffaire([], 'a1'), '');
  });

  test('I5 l’écriture de la note de départ passe par le moteur commun : création dans crm_notes, horodatée, épinglée, avec ses liens et son auteur', () => {
    let n = 0;
    const ctx = { maintenant: new Date(), auteur: 'jerome.chevalier@gmail.com', nouvelId: (nom) => `${nom}_${++n}` };
    const e = L.ecritureNoteDeDepart({ personneId: 'p1', organisationId: 'o1', affaireId: 'a1' }, ctx);
    assert.deepEqual([e.type, e.collection, e.id, e.horodater], ['creer', 'crm_notes', 'crm_notes_1', ['creeLe', 'modifieLe']]);
    assert.deepEqual(e.donnees, { texte: '', personneId: 'p1', organisationId: 'o1', affaireId: 'a1', auteur: 'jerome.chevalier@gmail.com', epinglee: true });
    // Le journal des écritures (audit) la décrit comme toute autre création de note.
    const audit = L.construireAudit([e], [null], { acteur: 'jerome.chevalier@gmail.com', outil: 'creerAffaire', operationId: 'op1', maintenant: new Date(), horodatage: 'H', nouvelId: (nom) => `${nom}_${++n}` });
    assert.equal(audit[0][0].collection, 'crm_audit');
    assert.equal(audit[0][0].donnees.docId, 'crm_notes_1');
  });

  test('I5 (b) originale de l’affaire + copie du projet (copieDeNoteId) au même texte : une seule s’affiche, celle de la fiche ouverte (sinon l’originale)', () => {
    const originale = note('orig', { texte: 'Besoin : une appli.', epinglee: true, creeLe: new Date('2026-10-01') });
    const copie = note('copie', { texte: 'Besoin : une appli.', epinglee: true, projetId: 'pr1', copieDeNoteId: 'orig', creeLe: new Date('2026-10-05') });
    const libre = note('libre', { texte: 'Besoin : une appli.', creeLe: new Date('2026-10-06') });
    const ids = (liste) => liste.map((n) => n.id).sort();
    assert.deepEqual(ids(L.sansCopiesDeNote([originale, copie, libre], { affaireId: 'a1' })), ['libre', 'orig']);
    assert.deepEqual(ids(L.sansCopiesDeNote([copie, { ...originale, deAffaire: true }, libre], { projetId: 'pr1' })), ['copie', 'libre']);
    assert.deepEqual(ids(L.sansCopiesDeNote([originale, copie], { personneId: 'p1' })), ['orig'], 'ailleurs : l’originale');
    assert.deepEqual(ids(L.sansCopiesDeNote([originale, { ...copie, texte: 'Modifiée' }], { affaireId: 'a1' })), ['copie', 'orig'], 'textes différents : les deux');
    assert.deepEqual(ids(L.sansCopiesDeNote([originale, { ...copie, epinglee: false }], { affaireId: 'a1' })), ['copie', 'orig'], 'copie désépinglée : les deux');
    assert.deepEqual(L.sansCopiesDeNote([]), []);
  });

  test('I5 textes d’invitation de la note vide', () => {
    assert.equal(L.INVITATION_NOTE_AFFAIRE, 'Cette affaire concerne… (le besoin du client, ce qu’on lui propose, où on en est)');
    assert.equal(L.INVITATION_NOTE_PROJET, 'Ce projet concerne… (ce qu’on construit, pour qui, où on en est)');
  });
});
