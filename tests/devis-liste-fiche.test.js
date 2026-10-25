// Fiche d'un devis : fonctions pures de js/modules/devis/fiche.js. Chaque test commence par le numéro du point du brief (F1 à F8).
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import * as Fi from '../js/modules/devis/fiche.js';
import { famillesDe } from '../js/modules/devis/familles.js';

const MAINT = Date.parse('2026-10-24T10:00:00Z');
const FAMILLES = famillesDe(null); // famille-1 Fournitures, famille-2 Main d'œuvre, famille-7 Divers…
// Devis finalisé : 10 × 60 + 5 × 36 + 1 × 100 = 880 € HT ; achats 10 × 40 + 5 × 20 + 60 = 560 € ; marge brute 320 €.
const devis = (extra = {}) => ({
  id: 'd1', racineId: 'd1', version: 1, numero: 'DEV-2026-10-24-001', statut: 'accepte', modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20, regimeTva: 'assujetti',
  sections: [{ id: 's1', titre: 'Cuisine', lignes: [
    { id: 'l1', libelle: 'Carrelage', familleId: 'famille-1', type: 'fourniture', quantite: 10, unite: 'm²', prixAchat: 40, prixVente: 60, tauxTva: 20 },
    { id: 'l2', libelle: 'Pose', familleId: 'famille-2', type: 'main_oeuvre', quantite: 5, unite: 'h', prixAchat: 20, prixVente: 36, tauxTva: 10 },
    { id: 'l3', libelle: 'Divers', familleId: 'famille-7', type: 'divers', quantite: 1, unite: 'u', prixAchat: 60, prixVente: 100, tauxTva: 20 },
  ] }],
  creeLe: new Date('2026-10-01T09:00:00Z'), modifieLe: new Date('2026-10-24T05:00:00Z'), expireLe: '2026-11-23', ...extra,
});

describe('F3 identité', () => {
  test('F3 « Modifié il y a … » : minutes, heures, jours ; « à l’instant » ; rien si la date est inconnue', () => {
    assert.equal(Fi.libelleModifie({ modifieLe: new Date(MAINT - 5 * 60000) }, MAINT), 'Modifié il y a 5 min');
    assert.equal(Fi.libelleModifie({ modifieLe: new Date(MAINT - 5 * 3600000) }, MAINT), 'Modifié il y a 5 h');
    assert.equal(Fi.libelleModifie({ modifieLe: { seconds: (MAINT - 3 * 86400000) / 1000, nanoseconds: 0 } }, MAINT), 'Modifié il y a 3 j');
    assert.equal(Fi.libelleModifie({ modifieLe: new Date(MAINT - 20000) }, MAINT), 'Modifié à l’instant');
    assert.equal(Fi.libelleModifie({}, MAINT), '');
    assert.equal(Fi.libelleModifie({ creeLe: new Date(MAINT - 2 * 3600000) }, MAINT), 'Modifié il y a 2 h'); // retombe sur la création
  });
  test('F3 adresse du chantier : celle du chantier d’abord, sinon celle des adresses ; sur une ligne', () => {
    assert.equal(Fi.adresseChantier({ chantier: { adresse: { ligne1: '12 rue des Lilas', codePostal: '49000', ville: 'Angers' } } }), '12 rue des Lilas, 49000 Angers');
    assert.equal(Fi.adresseChantier({ adresses: { chantier: '12 rue des Lilas\n75000 Paris' } }), '12 rue des Lilas, 75000 Paris');
    assert.equal(Fi.adresseChantier({}), '');
  });
  test('F3 titre et dates', () => {
    assert.equal(Fi.titreFiche({ numero: 'DEV-2026-10-24-001' }), 'Devis n° DEV-2026-10-24-001');
    assert.equal(Fi.titreFiche({ numero: null }), 'Brouillon');
    assert.deepEqual(Fi.datesFiche(devis({ finaliseLe: '2026-10-24' })), { date: '24/10/2026', validite: '23/11/2026' });
    assert.deepEqual(Fi.datesFiche({}), { date: '', validite: '' });
  });
});

describe('F4 conditions et totaux', () => {
  test('F4 sans acompte ni moyen de paiement : aucune condition', () => {
    assert.deepEqual(Fi.conditionsFiche(devis()), []);
  });
  test('F4 acompte, texte libre et moyens de paiement sont lus dans la vue client', () => {
    const c = Fi.conditionsFiche(devis({ acompte: { type: 'pourcentage', valeur: 30, moment: 'signature' }, conditionsPaiement: 'Solde à 30 jours.', modesPaiement: ['Chèque', 'Espèces'] }));
    assert.equal(c.length, 4);
    assert.match(c[0], /Acompte de 30,00\s%/);
    assert.match(c[1], /Reste à facturer/);
    assert.equal(c[2], 'Solde à 30 jours.');
    assert.equal(c[3], 'Moyens de paiement acceptés : Chèque, Espèces');
  });
  test('F4 totaux calculés par totauxDevis : 880 € HT, TVA 20 % sur 700 et 10 % sur 180', () => {
    const t = Fi.totauxFiche(devis({ statut: 'en_attente_envoi', totaux: undefined })); // prix de vente figés sur les lignes
    assert.equal(t.ht, 880);
    assert.deepEqual(t.tvaParTaux.map((x) => [x.taux, x.baseHT, x.montant]), [[20, 700, 140], [10, 180, 18]]);
    assert.equal(t.tva, 158);
    assert.equal(t.ttc, 1038);
    assert.equal(t.netAPayer, 1038);
  });
  test('F4 un brouillon se recalcule avec sa marge (25 % sur les achats : 500 + 125 + 75 = 700 € HT)', () => {
    const t = Fi.totauxFiche(devis({ statut: 'brouillon', numero: null }));
    assert.deepEqual([t.ht, t.tva, t.ttc], [700, 127.5, 827.5]);
  });
  test('F4 un devis finalisé garde ses totaux figés', () => {
    const t = Fi.totauxFiche(devis({ totaux: { ht: 500, tva: 100, ttc: 600, netAPayer: 550, tvaParTaux: [{ taux: 20, baseHT: 500, montant: 100 }] } }));
    assert.deepEqual([t.ht, t.tva, t.ttc, t.netAPayer], [500, 100, 600, 550]);
  });
  test('F4 cas vide : un devis sans ligne a des totaux à 0 et aucune TVA', () => {
    const t = Fi.totauxFiche(devis({ sections: [] }));
    assert.deepEqual([t.ht, t.tva, t.ttc, t.netAPayer, t.tvaParTaux.length], [0, 0, 0, 0, 0]);
  });
});

describe('F7 ventilation par famille', () => {
  test('F7 10 × 60 + 5 × 36 + 100 = 880 € HT ; achats 560 € ; marge brute 320 €', () => {
    const v = Fi.ventilationParFamille(devis(), [], FAMILLES);
    assert.equal(v.vide, false);
    assert.deepEqual(v.familles.map((f) => [f.nom, f.ht, f.achat, f.marge]), [['Fournitures', 600, 400, 200], ['Main d’œuvre', 180, 100, 80], ['Divers', 100, 60, 40]]);
    assert.deepEqual(v.total, { ht: 880, ttc: 1038, achat: 560, marge: 320 });
    assert.deepEqual(v.familles.map((f) => f.ttc), [720, 198, 120]); // 600 + 20 % ; 180 + 10 % ; 100 + 20 %
  });
  test('F7 parts en % (une décimale) pour chaque onglet', () => {
    const v = Fi.ventilationParFamille(devis(), [], FAMILLES);
    assert.deepEqual(Fi.lignesVentilation(v, 'ht').map((l) => [l.nom, l.montant, l.part]), [['Fournitures', 600, 68.2], ['Main d’œuvre', 180, 20.5], ['Divers', 100, 11.4]]);
    assert.deepEqual(Fi.lignesVentilation(v, 'marge').map((l) => [l.montant, l.part]), [[200, 62.5], [80, 25], [40, 12.5]]);
    assert.equal(Fi.partEnPourcent(5, 0), 0);
    assert.equal(Fi.partEnPourcent(1, 3), 33.3);
  });
  test('F7 une sous-famille compte dans sa famille de premier niveau ; une ligne sans famille va dans « Sans famille » ; l’article donne la famille d’une ancienne ligne', () => {
    const familles = [...FAMILLES, { id: 'f-carrelage', nom: 'Carrelage', actif: true, parentId: 'famille-1' }];
    const d = devis({ sections: [{ id: 's', titre: '', lignes: [
      { id: 'a', libelle: 'Faïence', familleId: 'f-carrelage', quantite: 2, prixAchat: 10, prixVente: 15 },
      { id: 'b', libelle: 'Ancienne ligne', articleId: 'art1', quantite: 1, prixAchat: 20, prixVente: 30 },
      { id: 'c', libelle: 'Ligne libre', type: 'libre', quantite: 1, prixAchat: 5, prixVente: 8 },
    ] }] });
    const v = Fi.ventilationParFamille(d, [{ id: 'art1', familleId: 'famille-2' }], familles);
    assert.deepEqual(v.familles.map((f) => [f.nom, f.ht]), [['Fournitures', 30], ['Main d’œuvre', 30], ['Sans famille', 8]]);
  });
  test('F7 cas vide : aucune ligne = « Aucun résultat » (liste vide) et marge nulle', () => {
    const v = Fi.ventilationParFamille(devis({ sections: [] }), [], FAMILLES);
    assert.equal(v.vide, true);
    assert.deepEqual(Fi.lignesVentilation(v, 'ht'), []);
    assert.deepEqual(v.total, { ht: 0, ttc: 0, achat: 0, marge: 0 });
    assert.equal(Fi.ventilationParFamille(devis({ sections: [{ id: 's', titre: 'Vide', lignes: [] }] }), [], FAMILLES).vide, true);
  });
  test('F7 la remise est donnée à part ; les montants des familles restent avant remise', () => {
    const v = Fi.ventilationParFamille(devis({ remise: { type: 'pourcentage', valeur: 10 } }), [], FAMILLES);
    assert.equal(v.total.ht, 880);
    assert.equal(v.remiseHt, 88);
  });
});

describe('F2 boutons de la fiche', () => {
  test('F2 brouillon : « Modifier » est le bouton principal ; pas de « marquer envoyé » ; annuler = Supprimer, actif', () => {
    const a = Fi.actionsFiche(devis({ statut: 'brouillon', numero: null }));
    assert.equal(a.principal, 'modifier');
    assert.equal(a.modifier.actif, true);
    assert.equal(a.voirDevis, null);
    assert.equal(a.marquerEnvoye.actif, false);
    assert.deepEqual([a.annuler.action, a.annuler.actif, a.annuler.raison], ['supprimer', true, undefined]);
  });
  test('F2 finalisé : « Marquer comme envoyé » et « Envoyer par e-mail » sont permis ; Facturer reste grisé', () => {
    const a = Fi.actionsFiche(devis({ statut: 'en_attente_envoi' }));
    assert.equal(a.principal, null);
    assert.equal(a.marquerEnvoye.actif, true);
    assert.equal(a.envoyerEmail.actif, true);
    assert.equal(Fi.actionsFiche(devis({ statut: 'brouillon' })).envoyerEmail.actif, true, 'un brouillon : on propose de le finaliser d’abord');
    assert.equal(Fi.actionsFiche(devis({ statut: 'envoye' })).envoyerEmail.actif, true, 'renvoi');
    assert.deepEqual([Fi.actionsFiche(devis({ statut: 'accepte' })).envoyerEmail.actif, Fi.actionsFiche(devis({ statut: 'refuse' })).envoyerEmail.actif], [false, false]);
    assert.deepEqual([a.facturer.actif, a.facturer.raison], [false, 'Bientôt disponible']);
    assert.equal(a.voirDevis.actif, true);
    assert.equal(a.modifier, null);
  });
  test('F2 envoyé : Annuler = Refuser ; signé ou refusé : Annuler = Archiver ; remplacé : grisé', () => {
    assert.equal(Fi.actionsFiche(devis({ statut: 'envoye' })).annuler.action, 'refuser');
    assert.equal(Fi.actionsFiche(devis({ statut: 'accepte' })).annuler.action, 'archiver');
    assert.equal(Fi.actionsFiche(devis({ statut: 'refuse' })).annuler.action, 'archiver');
    const r = Fi.actionsFiche(devis({ statut: 'remplace' }));
    assert.equal(r.annuler.actif, false);
    assert.equal(Fi.actionsFiche(devis({ statut: 'accepte', archive: true })).annuler.actif, false); // déjà archivé
  });
  test('F9 archivage : Archiver (signé ou refusé), Désarchiver (archivé), sinon grisé avec la raison du serveur', () => {
    assert.deepEqual([Fi.archivageFiche(devis({ statut: 'accepte' })).libelle, Fi.archivageFiche(devis({ statut: 'accepte' })).actif], ['Archiver', true]);
    assert.equal(Fi.archivageFiche(devis({ statut: 'refuse' })).action, 'archiver');
    const d = Fi.archivageFiche(devis({ statut: 'accepte', archive: true }));
    assert.deepEqual([d.libelle, d.action, d.icone, d.actif], ['Désarchiver', 'desarchiver', 'archive-restore', true]);
    const g = Fi.archivageFiche(devis({ statut: 'envoye' }));
    assert.deepEqual([g.actif, g.raison], [false, 'Seul un devis signé ou refusé peut être archivé.']);
  });
  test('F2 Aperçu PDF : actif seulement avec un lien https ; sinon grisé « PDF pas encore généré »', () => {
    assert.deepEqual(Fi.actionsFiche(devis()).apercuPdf, { actif: false, raison: 'PDF pas encore généré' });
    assert.equal(Fi.actionsFiche(devis({ pdf: 'https://exemple.fr/devis.pdf' })).apercuPdf.lien, 'https://exemple.fr/devis.pdf');
    assert.equal(Fi.actionsFiche(devis({ pdf: { lien: 'https://exemple.fr/d.pdf' } })).apercuPdf.actif, true);
    assert.equal(Fi.actionsFiche(devis({ pdf: 'javascript:alert(1)' })).apercuPdf.actif, false);
    assert.equal(Fi.actionsFiche(devis({ pdf: { url: 'http://exemple.fr/d.pdf' } })).apercuPdf.actif, false);
  });
  test('F2 l’éditeur indisponible grise Modifier et Dupliquer', () => {
    const a = Fi.actionsFiche(devis({ statut: 'brouillon' }), { editeur: false });
    assert.equal(a.modifier.actif, false);
    assert.equal(a.dupliquer.actif, false);
  });
});
