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

describe('R5c renommer un fichier à l\'écran : le nom saisi + l\'extension d\'origine', async () => {
  const { nomRenomme, nomSansExtension } = await import('../js/modules/crm/fichiers-regles.js');
  test('R5c l\'extension d\'origine est toujours remise, sans être doublée si elle est retapée (majuscules comprises)', () => {
    assert.equal(nomRenomme('5033842879837545388.jpg', 'Carte nationale d’identité Samuel'), 'Carte nationale d’identité Samuel.jpg');
    assert.equal(nomRenomme('photo.jpg', 'CNI Samuel.jpg'), 'CNI Samuel.jpg');
    assert.equal(nomRenomme('photo.jpg', 'CNI Samuel.JPG'), 'CNI Samuel.jpg');
    assert.equal(nomRenomme('photo.jpg', '  CNI  '), 'CNI.jpg');
    assert.equal(nomRenomme('archive.tar.zip', 'x'), 'x.zip');
    // extension en majuscules (photos de téléphone) : reprise telle quelle, donc « Renommer » sans rien changer rend exactement l'ancien nom
    assert.equal(nomRenomme('IMG_1234.JPG', 'IMG_1234'), 'IMG_1234.JPG');
    assert.equal(nomRenomme('IMG_1234.JPG', 'Chantier.jpg'), 'Chantier.JPG');
    // rien de tapé, ou seulement l'extension : pas de nom (l'écran n'appelle pas le serveur)
    assert.equal(nomRenomme('photo.jpg', ''), '');
    assert.equal(nomRenomme('photo.jpg', '   '), '');
    assert.equal(nomRenomme('photo.jpg', '.jpg'), '');
  });
  test('R5c la fenêtre propose le nom sans l\'extension', () => {
    assert.equal(nomSansExtension('5033842879837545388.jpg'), '5033842879837545388');
    assert.equal(nomSansExtension('Rapport v2.final.pdf'), 'Rapport v2.final');
  });
});
