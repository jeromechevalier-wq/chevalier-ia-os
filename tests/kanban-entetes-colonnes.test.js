// En-têtes de colonne des Kanbans (Affaires et Devis) : « 3 affaires · 2 000 € » puis « 1 affaire [TEST] · 100 € ». Fonctions pures.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { texteEnteteColonne } from '../js/modules/crm/logique.js';
import { totauxColonneDevis } from '../js/modules/devis/liste.js';

const nbsp = (s) => s.replace(/[  ]/g, ' ');
const t = (x) => ({ principal: nbsp(x.principal), tests: x.tests && { ...x.tests, montant: x.tests.montant && nbsp(x.tests.montant) } });

describe('1 texteEnteteColonne', () => {
  test('1 nombre d’abord, singulier/pluriel, « devis » invariable, montant nul omis, ligne tests nulle à 0 test, montant des tests nul omis', () => {
    assert.deepEqual(t(texteEnteteColonne({ nombre: 14, montant: 552.47, nombreTests: 2, montantTests: 500 }, 'affaire')), { principal: '14 affaires · 552,47 €', tests: { nombre: '2 affaires', montant: '500 €' } });
    assert.deepEqual(t(texteEnteteColonne({ nombre: 1, montant: 100, nombreTests: 0, montantTests: 0 }, 'affaire')), { principal: '1 affaire · 100 €', tests: null });
    assert.deepEqual(t(texteEnteteColonne({ nombre: 0, montant: 0, nombreTests: 0, montantTests: 0 }, 'affaire')), { principal: '0 affaire', tests: null });
    assert.deepEqual(t(texteEnteteColonne({ nombre: 3, montant: 220, nombreTests: 1, montantTests: 100 }, 'devis')), { principal: '3 devis · 220 €', tests: { nombre: '1 devis', montant: '100 €' } });
    assert.deepEqual(t(texteEnteteColonne({ nombre: 2, montant: 0, nombreTests: 2, montantTests: 0 }, 'devis')), { principal: '2 devis', tests: { nombre: '2 devis', montant: null } });
    assert.deepEqual(t(texteEnteteColonne({ nombre: 1, montant: 0, nombreTests: 1, montantTests: 0 }, 'affaire')), { principal: '1 affaire', tests: { nombre: '1 affaire', montant: null } });
  });
});

describe('3 totauxColonneDevis', () => {
  const fige = (id, ht, extra = {}) => ({ id, statut: 'envoye', totaux: { ht, tva: ht * 0.2, ttc: ht * 1.2 }, sections: [], ...extra });
  test('3 HT figé des finalisés, HT calculé d’un brouillon, test exclu du réel et compté à part, total illisible = 0, centimes exacts', () => {
    assert.deepEqual(totauxColonneDevis([]), { nombre: 0, montant: 0, nombreTests: 0, montantTests: 0 });
    assert.deepEqual(totauxColonneDevis([fige('a', 100), fige('b', 120), fige('t', 100, { test: true })]), { nombre: 3, montant: 220, nombreTests: 1, montantTests: 100 });
    assert.deepEqual(totauxColonneDevis([fige('c', 0.1), fige('d', 0.2)]).montant, 0.3); // 0,1 + 0,2 exact
    const brouillon = { id: 'br', statut: 'brouillon', modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20, regimeTva: 'assujetti', sections: [{ id: 's', titre: 'x', lignes: [{ id: 'l', libelle: 'Carrelage', quantite: 2, unite: 'm²', prixAchat: 50 }] }] };
    assert.equal(totauxColonneDevis([brouillon]).montant, 125);
    assert.equal(totauxColonneDevis([{ id: 'x', statut: 'brouillon', sections: 'illisible' }]).montant, 0);
  });
});
