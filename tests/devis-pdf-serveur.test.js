// Tests P (module Devis, briques serveur du PDF) : rangement dans Cloud Storage (chemins, lien signé court) contre un FAUX espace de stockage ; la conversion par Chromium est testée dans devis-pdf-chromium.test.js. node --test.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { creerStockage, nomFichierDevis, libelleDocumentDevis, nettoyerNom, cheminPdfDevis, cheminAppartientALEspace, DUREE_LIEN_MINUTES, NOM_PDF_BROUILLON } from '../functions/src/devis/stockage.js';

const FAUX_PDF = Buffer.from('%PDF-1.4\nfaux document\n%%EOF');

/** Faux « bucket » de firebase-admin : file(chemin).save / exists / getSignedUrl. */
function fauxBucket({ casse = false } = {}) {
  const objets = new Map();
  const signatures = [];
  return {
    objets, signatures,
    file: (chemin) => ({
      async save(contenu, options) { if (casse) throw new Error('403 /interne/secret'); objets.set(chemin, { contenu, options }); },
      async exists() { return [objets.has(chemin)]; },
      async getSignedUrl(options) { signatures.push({ chemin, options }); return [`https://stockage.exemple.test/${encodeURIComponent(chemin)}?sig=ESSAI`]; },
    }),
  };
}

describe('P3 Stockage : chemins par espace et par affaire', () => {
  test('P3 chez Jérôme à la racine, chez un client sous clients/<client>/ ; le brouillon a un nom fixe', () => {
    assert.equal(cheminPdfDevis({ espace: '', affaireId: 'aff1', devisId: 'd1', nomFichier: 'a.pdf' }), 'devis/aff1/d1/a.pdf');
    assert.equal(cheminPdfDevis({ espace: 'clients/dupont/', affaireId: 'aff1', devisId: 'd1', nomFichier: 'a.pdf' }), 'clients/dupont/devis/aff1/d1/a.pdf');
    assert.equal(cheminPdfDevis({ affaireId: 'aff1', devisId: 'd1', brouillon: true, nomFichier: 'ignore.pdf' }), `devis/aff1/d1/${NOM_PDF_BROUILLON}`);
    assert.equal(cheminPdfDevis({ devisId: 'd1', nomFichier: 'a.pdf' }), 'devis/sans-affaire/d1/a.pdf');
  });
  test('P3 un identifiant piégé ne sort jamais du dossier ; un espace invalide est refusé', () => {
    const c = cheminPdfDevis({ affaireId: '../../autre', devisId: 'x/../y', nomFichier: '../../z.pdf' });
    assert.ok(!c.includes('..') && c.startsWith('devis/'), c);
    assert.throws(() => cheminPdfDevis({ espace: 'clients/../x/', devisId: 'd1' }), /espace invalide/);
    assert.throws(() => cheminPdfDevis({ espace: 'autre/', devisId: 'd1' }), /espace invalide/);
  });
  test('P3 un chemin n\'appartient qu\'à son espace', () => {
    assert.ok(cheminAppartientALEspace('devis/a/b/c.pdf', ''));
    assert.ok(!cheminAppartientALEspace('clients/x/devis/a/b/c.pdf', ''));
    assert.ok(cheminAppartientALEspace('clients/x/devis/a/b/c.pdf', 'clients/x/'));
    assert.ok(!cheminAppartientALEspace('clients/y/devis/a/b/c.pdf', 'clients/x/'));
    assert.ok(!cheminAppartientALEspace('devis/../marques/x/c.pdf', ''));
    assert.ok(!cheminAppartientALEspace('devis/a/b/c.png', ''));
    assert.ok(!cheminAppartientALEspace(undefined, ''));
  });
});

describe('P5 Stockage : envoi et lien signé', () => {
  test('P5 le PDF est enregistré en privé, sans cache ; un PDF vide est refusé', async () => {
    const b = fauxBucket();
    const s = creerStockage({ bucket: b });
    await s.envoyer('devis/a/b/c.pdf', FAUX_PDF);
    const o = b.objets.get('devis/a/b/c.pdf');
    assert.equal(o.options.contentType, 'application/pdf');
    assert.match(o.options.metadata.cacheControl, /private/);
    assert.ok(await s.existe('devis/a/b/c.pdf'));
    assert.ok(!(await s.existe('devis/a/b/autre.pdf')));
    await assert.rejects(s.envoyer('devis/a/b/vide.pdf', Buffer.alloc(0)), /PDF vide/);
  });
  test('P5 lien signé : version 4, lecture seule, 5 minutes', async () => {
    const b = fauxBucket();
    const s = creerStockage({ bucket: b, maintenant: () => 1_000_000 });
    const url = await s.lienSigne('devis/a/b/c.pdf', { nomAffiche: 'DEV-1 v1 – Objet.pdf' });
    assert.match(url, /^https:\/\//);
    const { options } = b.signatures[0];
    assert.equal(options.version, 'v4');
    assert.equal(options.action, 'read');
    assert.equal(options.expires, 1_000_000 + DUREE_LIEN_MINUTES * 60_000);
    assert.equal(DUREE_LIEN_MINUTES, 5);
    assert.match(options.responseDisposition, /^inline; filename="DEV-1 v1 _ Objet\.pdf"$/); // aucun caractère hors ASCII dans l'en-tête
  });
  test('P5 une panne : message lisible « Stockage : … », sans chemin interne ni détail', async () => {
    const s = creerStockage({ bucket: fauxBucket({ casse: true }) });
    await assert.rejects(s.envoyer('devis/a/b/c.pdf', FAUX_PDF), (e) => /^Stockage : /.test(e.message) && !/interne|secret|403|devis\/a/.test(e.message));
    assert.throws(() => creerStockage({ bucket: null }), /Stockage/);
  });
});

describe('P4 noms', () => {
  test('P4 noms nettoyés : pas de /, 120 caractères au plus', () => {
    assert.equal(nettoyerNom('a/b\\c\nd'), 'a b c d');
    assert.ok(nettoyerNom('x'.repeat(300)).length <= 120);
  });
  test('P4 un nom long garde son extension', () => {
    const n = nettoyerNom(`${'a'.repeat(300)}.pdf`);
    assert.ok(n.length <= 120 && n.endsWith('.pdf'));
  });
});

describe('P6 nomFichierDevis et libellé du document de l\'affaire', () => {
  test('P6 forme DEV-… vN - Objet.pdf', () => {
    assert.equal(nomFichierDevis({ numero: 'DEV-2026-10-24-001', version: 2, objet: 'Rénovation toiture' }), 'DEV-2026-10-24-001 v2 - Rénovation toiture.pdf');
  });
  test('P6 objet nettoyé et tronqué, sans objet', () => {
    const n = nomFichierDevis({ numero: 'DEV-1', version: 1, objet: 'a/b\\c ' + 'z'.repeat(200) });
    assert.ok(!/[\/\\]/.test(n.replace(/\.pdf$/, '')));
    assert.ok(n.length <= 124 && n.endsWith('.pdf'));
    assert.equal(nomFichierDevis({ numero: 'DEV-1', version: 3 }), 'DEV-1 v3.pdf');
  });
  test('P6 libellé de l\'affaire : « Devis DEV-… v1 – Objet.pdf » et « Devis brouillon – Objet – JJ-MM-AAAA HHhMM.pdf » (heure de Paris)', () => {
    assert.equal(libelleDocumentDevis({ numero: 'DEV-2026-10-24-001', version: 1, objet: 'Cuisine' }), 'Devis DEV-2026-10-24-001 v1 – Cuisine.pdf');
    const hiver = new Date('2026-10-26T13:32:00Z'); // heure d'hiver française (UTC+1) depuis le 25/10 : 14 h 32
    const ete = new Date('2026-07-14T22:05:00Z'); // été (UTC+2) : 15/07 à 00 h 05, le jour change
    assert.equal(libelleDocumentDevis({ numero: null, version: 1, objet: 'Cuisine', brouillon: true, date: hiver }), 'Devis brouillon – Cuisine – 26-10-2026 14h32.pdf');
    assert.equal(libelleDocumentDevis({ brouillon: true, date: ete }), 'Devis brouillon – 15-07-2026 00h05.pdf');
    assert.notEqual(libelleDocumentDevis({ brouillon: true, objet: 'Cuisine', date: hiver }), libelleDocumentDevis({ brouillon: true, objet: 'Salon', date: hiver }), 'deux brouillons d’objets différents : noms distincts');
    assert.equal(libelleDocumentDevis({ numero: 'DEV-2026-10-24-001', version: 1, objet: 'Cuisine', date: hiver }), 'Devis DEV-2026-10-24-001 v1 – Cuisine.pdf', 'le PDF finalisé n’a pas d’horodatage');
    const long = libelleDocumentDevis({ brouillon: true, objet: 'x'.repeat(300), date: hiver });
    assert.ok(long.length <= 124 && long.endsWith(' – 26-10-2026 14h32.pdf'), 'objet raccourci, horodatage gardé');
    assert.ok(!/[\/\\]/.test(libelleDocumentDevis({ brouillon: true, objet: 'a/b\\c', date: hiver })));
  });
});
