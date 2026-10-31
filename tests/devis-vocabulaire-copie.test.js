// K13 : la copie PRÉPARÉE du moteur du dictionnaire se charge et répond comme la source (PR C6a de docs/cadrage-vocabulaire-cibles.md).
// Le moteur importe `familles.js` : sans la réécriture de cet import par scripts/preparer-fonctions.js, le serveur des clients ne chargerait plus et TOUS les outils tomberaient.
// Ce test charge les deux copies (`npm run preparer` les écrit ; test:fonctions le lance d'abord) et les compare à la source.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as Source from '../js/modules/devis/vocabulaire.js';

const COPIES = [['functions/partage/devis-vocabulaire.js', 'chez Jérôme'], ['functions-plateforme/serveur/partage/devis-vocabulaire.js', 'chez les clients']];
const REGLAGES = { marge: 20, modeMarge: 'majoration' };
const articles = [
  { id: 'p1', libelle: 'Prise simple 16 A', prixAchat: 4, unite: 'u', actif: true, familleId: 'famille-1-8' },
  { id: 'p2', libelle: 'Prise étanche 16 A', prixAchat: 6, unite: 'u', actif: true, familleId: 'famille-1-8' },
  { id: 'g1', libelle: 'Gaine ICTA 20 mm', prixAchat: 1, unite: 'm', actif: true, familleId: 'famille-1-9' },
];
const regles = [{ id: 'elec', cle: 'elec', expression: 'elec', articleId: '', articleLibelle: '', cibles: [{ genre: 'famille', id: 'famille-1-8', libelle: 'Électricité' }], statut: 'active', conflit: false }];

describe('K13 copie préparée du moteur', () => {
  for (const [chemin, ou] of COPIES) {
    test(`K13 la copie ${ou} (${chemin}) se charge (import des familles résolu) et répond comme la source, familles comprises`, async (t) => {
      const fichier = fileURLToPath(new URL(`../${chemin}`, import.meta.url));
      if (!existsSync(fichier)) { t.skip('copie absente : lancer `npm run preparer` (test:fonctions le fait)'); return; }
      const copie = await import(fichier);
      assert.equal(typeof copie.interpreter, 'function');
      for (const phrase of ['elec etanche', 'elec', 'gaine', 'prise 16 A', '3 elec simple']) {
        assert.deepEqual(copie.interpreter(phrase, { regles, articles, reglages: REGLAGES }), Source.interpreter(phrase, { regles, articles, reglages: REGLAGES }), phrase);
      }
      const r = copie.interpreter('elec etanche', { regles, articles, reglages: REGLAGES });
      assert.equal(r.candidats[0].articleId, 'p2'); // la famille « Électricité » est comprise par la copie : preuve que `familles.js` est bien chargé
      assert.equal(r.portee.nombreArticles, 2);
    });
  }
});
