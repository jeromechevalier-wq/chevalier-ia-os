// Onglet « Documents » v2 (I10) : la date et l'heure d'ajout d'un document (logique pure, node --test).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/modules/crm/logique.js';

describe('I10 date et heure d\'ajout d\'un document', () => {
  test('I10 ajouterDocument garde la date d\'ajout donnée ; sans date (serveur MCP, anciens documents), aucun champ', () => {
    const avec = L.ajouterDocument({ documents: [] }, 'Plan', 'https://exemple.fr/plan', false, '', '2026-10-21T20:30:00.000Z');
    assert.deepEqual(avec.patch.documents, [{ libelle: 'Plan', url: 'https://exemple.fr/plan', ajouteLe: '2026-10-21T20:30:00.000Z' }]);
    const sans = L.ajouterDocument({ documents: [] }, 'Plan', 'https://exemple.fr/plan');
    assert.deepEqual(sans.patch.documents, [{ libelle: 'Plan', url: 'https://exemple.fr/plan' }]);
    const invalide = L.ajouterDocument({ documents: [] }, 'Plan', 'https://exemple.fr/plan', false, '', 'pas une date');
    assert.equal('ajouteLe' in invalide.patch.documents[0], false, 'une date illisible n\'est pas enregistrée');
  });

  test('I10 liensEtDocuments rend la date d\'ajout (vide pour un ancien document) et l\'affichage est « jj/mm/aaaa hh:mm » à l\'heure de Paris', () => {
    const lignes = L.liensEtDocuments({ documents: [{ libelle: 'Neuf', url: 'https://exemple.fr/n', ajouteLe: '2026-10-21T20:30:00.000Z' }, { libelle: 'Ancien', url: 'https://exemple.fr/a' }] });
    assert.equal(lignes[0].ajouteLe, '2026-10-21T20:30:00.000Z');
    assert.equal(lignes[1].ajouteLe, '');
    assert.equal(L.formatDateHeure(lignes[0].ajouteLe), '21/10/2026 22:30');
    assert.equal(L.formatDateHeure(lignes[1].ajouteLe), '');
  });

  test('I10 modifier le nom ou la note, mettre une étoile : la date d\'ajout est gardée', () => {
    const entite = { documents: [{ libelle: 'Neuf', url: 'https://exemple.fr/n', ajouteLe: '2026-10-21T20:30:00.000Z' }] };
    const [ligne] = L.liensEtDocuments(entite);
    assert.equal(L.modifierLien(entite, ligne, { libelle: 'Renommé', note: 'x' }).documents[0].ajouteLe, '2026-10-21T20:30:00.000Z');
    assert.equal(L.basculerFavoriLien(entite, ligne).documents[0].ajouteLe, '2026-10-21T20:30:00.000Z');
  });
});
