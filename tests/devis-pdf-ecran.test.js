// Écrans du PDF d'un devis (règles pures de js/modules/devis/pdf.js + garde-fous de texte). Aucun navigateur.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as P from '../js/modules/devis/pdf.js';
import { pdfAReessayer as regleServeur, DELAI_EN_COURS_MS } from '../functions/src/coeur/devis.js';

const lire = (chemin) => readFileSync(fileURLToPath(new URL(`../${chemin}`, import.meta.url)), 'utf8');
const MAINTENANT = Date.parse('2026-10-25T10:00:00Z');

describe('PDF devis : règles du navigateur', () => {
  test('S1 pdfAReessayer donne la même réponse que la règle du serveur (même règle, deux copies)', () => {
    const cas = [null, undefined, {}, { statut: 'brouillon' }, { statut: 'brouillon', pdf: { statut: 'echec' } }, { statut: 'en_attente_envoi' }, { statut: 'envoye', pdf: null },
      { statut: 'accepte', pdf: { statut: 'ok' } }, { statut: 'accepte', pdf: { statut: 'echec' } }, { statut: 'refuse', pdf: { statut: 'en_cours' } }];
    for (const d of cas) assert.equal(P.pdfAReessayer(d), regleServeur(d), JSON.stringify(d));
    assert.equal(P.DELAI_EN_COURS_MS, DELAI_EN_COURS_MS);
  });

  test('S2 etatPdfDevis : aucun (brouillon), pret, en_cours (récent), a_reessayer (échec, jamais fait, en cours abandonné)', () => {
    assert.equal(P.etatPdfDevis(null), 'aucun');
    assert.equal(P.etatPdfDevis({ statut: 'brouillon' }), 'aucun');
    assert.equal(P.etatPdfDevis({ statut: 'envoye', pdf: { statut: 'ok' } }), 'pret');
    assert.equal(P.etatPdfDevis({ statut: 'envoye', pdf: { statut: 'echec', message: 'x' } }), 'a_reessayer');
    assert.equal(P.etatPdfDevis({ statut: 'en_attente_envoi' }), 'a_reessayer');
    assert.equal(P.etatPdfDevis({ statut: 'envoye', pdf: { statut: 'en_cours', demarreLe: new Date(MAINTENANT - 60_000) } }, MAINTENANT), 'en_cours');
    assert.equal(P.etatPdfDevis({ statut: 'envoye', pdf: { statut: 'en_cours', demarreLe: { toMillis: () => MAINTENANT - 11 * 60_000 } } }, MAINTENANT), 'a_reessayer');
    assert.equal(P.etatPdfDevis({ statut: 'envoye', pdf: { statut: 'en_cours', demarreLe: { seconds: (MAINTENANT - 1000) / 1000 } } }, MAINTENANT), 'en_cours');
    assert.equal(P.etatPdfDevis({ statut: 'envoye', pdf: { statut: 'en_cours' } }, MAINTENANT), 'en_cours', 'sans date de départ on attend');
  });

  test('S3 routePdf et messages', () => {
    assert.equal(P.routePdf('abc'), 'devis/pdf/abc');
    assert.equal(P.routePdf('abc', true), 'devis/pdf/abc/brouillon');
    assert.equal(P.messageApresEnregistrement({ affaireId: 'a1' }), 'PDF enregistré dans l’affaire');
    assert.match(P.messageApresEnregistrement({ affaireId: null }), /n’a pas d’affaire/);
  });

  test('S4 le module sert les routes devis/pdf/<id> et …/brouillon ; les écrans n’écrivent jamais le champ pdf', () => {
    const index = lire('js/modules/devis/index.js');
    assert.match(index, /pdf: \(conteneur, segs\) => rendrePdfDevis\(conteneur, segs\[1\] \?\? '', segs\[2\] === 'brouillon'\)/);
    for (const f of ['pdf-ecran.js', 'pdf-indicateur.js']) {
      const t = lire(`js/modules/devis/${f}`).replace(/\/\/.*$/gm, '');
      assert.ok(!/setDoc|updateDoc|addDoc|writeBatch|CRM\.executer/.test(t), `${f} n'écrit rien dans Firestore`);
    }
    const donnees = lire('js/modules/devis/donnees.js');
    assert.match(donnees, /pdfLien: 'devisPdfLien'/);
    assert.match(donnees, /appeler\('pdf', \{ devisId, brouillon: true \}\)/);
  });
});
