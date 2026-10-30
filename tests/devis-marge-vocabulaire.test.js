// « Marge » : un seul vocabulaire, un seul mode de calcul, « hors taxes » à voix haute (décisions de Jérôme, 29 et 30/10/2026). Tests purs, sans réseau.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { OUTILS } from '../functions/src/mcp/outils/index.js';
import { ditHorsTaxes, ErreurMetier } from '../functions/src/coeur/metier.js';
import * as D from '../js/modules/devis/logique.js';
import * as Ed from '../js/modules/devis/editeur-logique.js';

const ligne = (id, extra = {}) => ({ id, libelle: id, quantite: 1, unite: 'u', prixAchat: 100, ...extra });
const devis = (sections, extra = {}) => ({ statut: 'brouillon', modeMarge: 'majoration', marge: 25, sections, ...extra });

describe('M1 les deux modes de calcul ont leurs noms et leurs exemples chiffrés', () => {
  test('M1a « Calcul artisan » (défaut) et « Calcul comptable », avec l’exemple : achat 100 €, 25 % → 125 € et 133,33 €', () => {
    assert.deepEqual(D.MODES_MARGE.map((m) => [m.id, m.libelle]), [['majoration', 'Calcul artisan'], ['marge_vente', 'Calcul comptable']]);
    assert.equal(D.prixVenteUnitaire(100, 25, 'majoration'), 125);
    assert.equal(D.prixVenteUnitaire(100, 25, 'marge_vente'), 133.33);
    assert.match(D.MODES_MARGE[0].exemple, /125 €/);
    assert.match(D.MODES_MARGE[1].exemple, /133,33 €/);
  });
  test('M1b un devis neuf montre le calcul des marges ; le mode vient des réglages', () => {
    const d = D.nouveauDevis({}, { nouvelId: () => 'd1', maintenant: new Date('2026-10-30T10:00:00Z'), auteur: 'x' }, { modeMarge: 'marge_vente', margeDevis: 20 });
    assert.equal(d.affichage.afficherMarges, true);
    assert.equal(d.modeMarge, 'marge_vente');
  });
});

describe('M2 l’assistant n’a aucun accès au mode de calcul de la marge', () => {
  test('M2a aucun outil n’a de paramètre modeMarge, aucune description ne parle du mode', () => {
    for (const o of OUTILS) {
      assert.equal('modeMarge' in (o.schema ?? {}), false, `${o.nom} : paramètre modeMarge`);
      assert.doesNotMatch(String(o.description), /modeMarge|marge_vente|majoration|mode de marge/i, `${o.nom} : description`);
    }
  });
});

describe('M3 « hors taxes » en toutes lettres pour l’assistant', () => {
  test('M3a aucune description d’outil ne contient « HT » seul ; TTC reste TTC', () => {
    for (const o of OUTILS) assert.doesNotMatch(String(o.description), /\bHT\b/, o.nom);
    assert.equal(ditHorsTaxes('Total HT : 10 € ; TTC : 12 €'), 'Total hors taxes : 10 € ; TTC : 12 €');
    assert.equal(ditHorsTaxes('totalHT'), 'totalHT', 'les noms de champs ne changent pas');
  });
  test('M3b les erreurs renvoyées à l’assistant disent « hors taxes »', () => {
    assert.equal(new ErreurMetier('saisie_invalide', 'dépasser le total HT du devis').message, 'dépasser le total hors taxes du devis');
  });
});

describe('M5 les lignes qui ont leur propre marge', () => {
  const d = devis([
    { id: 's1', titre: 'A', lignes: [ligne('a'), ligne('b', { marge: 40 }), ligne('c', { marge: 25 }), ligne('t', { type: 'texte', prixAchat: 0, marge: 99 }), { id: 'sp', type: 'saut' }] },
    { id: 's2', titre: 'B', marge: 10, lignes: [ligne('d'), ligne('e', { marge: 25 })] },
  ]);
  test('M5a on compte les lignes dont la marge appliquée n’est pas celle du devis (texte et saut exclus)', () => {
    assert.equal(Ed.nombreLignesAvecMargePropre(d), 2, 'b (40 %) et d (marge de sa section, 10 %)');
  });
  test('M5b cas vide : aucune ligne concernée, rien à appliquer', () => {
    assert.equal(Ed.nombreLignesAvecMargePropre(devis([{ id: 's', lignes: [ligne('a'), ligne('c', { marge: 25 })] }])), 0);
    assert.equal(Ed.nombreLignesAvecMargePropre(devis([])), 0);
    assert.equal(Ed.nombreLignesAvecMargePropre(undefined), 0);
  });
  test('M5c « Appliquer à toutes les lignes » : les marges propres sont retirées, rien d’autre ne bouge, le compte tombe à 0', () => {
    const r = Ed.appliquerMargeDuDevisAuxLignes(d);
    assert.equal(r.nombre, 2);
    const apres = { ...d, sections: r.sections };
    assert.equal(Ed.nombreLignesAvecMargePropre(apres), 0);
    const lignes = r.sections.flatMap((s) => s.lignes);
    assert.deepEqual(lignes.map((l) => l.id), ['a', 'b', 'c', 't', 'sp', 'd', 'e'], 'aucune ligne supprimée');
    assert.ok(lignes.filter((l) => l.prixAchat !== undefined).every((l) => l.prixAchat === (l.type === 'texte' ? 0 : 100)), 'prix d’achat intacts');
    assert.equal(lignes.find((l) => l.id === 't').marge, 99, 'une ligne texte n’est pas touchée');
    assert.equal(D.prixVenteDeLigne(apres, r.sections[0], r.sections[0].lignes[1]), 125, 'b suit maintenant la marge du devis (25 % sur 100 €)');
    assert.equal(d.sections[0].lignes[1].marge, 40, 'l’original n’est pas modifié');
  });
});
