// Écrans du PDF d'un devis (règles pures de js/modules/devis/pdf.js + garde-fous de texte). Aucun navigateur.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as P from '../js/modules/devis/pdf.js';
import { pdfAReessayer as regleServeur, DELAI_EN_COURS_MS } from '../functions/src/coeur/devis.js';

const lire = (chemin) => readFileSync(fileURLToPath(new URL(`../${chemin}`, import.meta.url)), 'utf8');
const MAINTENANT = Date.parse('2026-10-25T10:00:00Z');

describe('PDF devis : bouton de retour', () => {
  test('R1 le retour ramène à la page d\'origine : devis (éditeur ou visualisation), liste, ou à défaut le devis lui-même', () => {
    assert.deepEqual(P.cibleRetourPdf({ devisId: 'd1', origine: 'devis/voir/d1' }), { route: 'devis/voir/d1', libelle: 'Retour au devis' });
    assert.deepEqual(P.cibleRetourPdf({ devisId: 'd1', brouillon: true, origine: 'devis/editeur/d1' }), { route: 'devis/editeur/d1', libelle: 'Retour au devis' });
    assert.deepEqual(P.cibleRetourPdf({ devisId: 'd1', origine: 'devis/liste' }), { route: 'devis/liste', libelle: 'Retour aux devis' });
    assert.deepEqual(P.cibleRetourPdf({ devisId: 'd1' }), { route: 'devis/voir/d1', libelle: 'Retour au devis' });
    assert.deepEqual(P.cibleRetourPdf({ devisId: 'd1', brouillon: true }), { route: 'devis/editeur/d1', libelle: 'Retour au devis' });
    // une origine qui concerne un AUTRE devis ne sert pas : on revient au devis du PDF
    assert.deepEqual(P.cibleRetourPdf({ devisId: 'd1', origine: 'devis/voir/d2' }), { route: 'devis/voir/d1', libelle: 'Retour au devis' });
  });
});

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
    assert.equal(P.etatPdfDevis({ statut: 'envoye', pdf: { statut: 'en_cours' } }, MAINTENANT), 'a_reessayer', 'sans date de départ : abandonné, comme le serveur');
  });

  test('S3 routePdf et messages', () => {
    assert.equal(P.routePdf('abc'), 'devis/pdf/abc');
    assert.equal(P.routePdf('abc', true), 'devis/pdf/abc/brouillon');
    assert.equal(P.messageApresEnregistrement({ affaireId: 'a1' }), 'PDF brouillon prêt');
    assert.match(P.messageApresEnregistrement({ affaireId: null }), /n’a pas d’affaire/);
    assert.match(P.messageApresEnregistrement({ affaireId: null }), /dans son onglet Devis\.$/);
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

describe('PDF devis : plus aucune copie dans le Drive (décision du 27/10/2026)', () => {
  const code = (f) => lire(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  test('1 l’écran du PDF ne parle plus à Drive ni à Google : ni zone Drive, ni autorisation, ni mémoire de copie', () => {
    const t = code('js/modules/devis/pdf-ecran.js');
    assert.ok(!/google|drive|localStorage|copierDansDrive|zoneDrive|creerDossier/i.test(t));
    assert.match(t, /Rien ne s’est ouvert \?/);
    assert.match(t, /data-action|dataset: \{ action: 'ouvrir-pdf'/);
    assert.match(lire('js/modules/devis/pdf-ecran.js'), /export const MESSAGE_PAS_DE_BROUILLON/);
  });
  test('2 le module Devis ne s’inscrit plus au dossier de travail, et les fichiers de la copie n’existent plus', () => {
    const index = code('js/modules/devis/index.js');
    assert.ok(!/DossierAffaire|apresDossierDeTravail|retirerCrochetDossier|essaiCors|firebaseConfig/.test(index));
    for (const f of ['js/modules/devis/drive-copie.js', 'js/modules/devis/dossier-travail.js', 'js/modules/crm/dossier-externe.js']) assert.equal(existsSync(fileURLToPath(new URL(`../${f}`, import.meta.url))), false, f);
    const lanceurs = code('js/modules/crm/lanceurs.js');
    assert.ok(!/apresDossierAffaire|creerDossierDeLAffaire|dossier-externe/.test(lanceurs));
    assert.ok(!/lienStablePdfNavigateur|BASE_LIEN_/.test(code('js/modules/devis/pdf.js')));
  });
  test('4 textes : « PDF brouillon prêt », « PDF prêt », et l’onglet Devis remplace les liens du G-Drive', () => {
    assert.equal(P.MESSAGE_PDF_RANGE_AFFAIRE, 'PDF brouillon prêt');
    assert.match(P.MESSAGE_PDF_RANGE_SANS_AFFAIRE, /pour que le PDF apparaisse dans son onglet Devis\.$/);
    assert.ok(lire('js/modules/devis/pdf-indicateur.js').includes("toast('PDF prêt')"));
  });
});
