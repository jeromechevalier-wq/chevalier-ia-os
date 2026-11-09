// Tests « moderne » (module Devis, nouvelle mise en page du devis, 09/11/2026) : js/modules/devis/document.js, pdf-service.js (logo de l'espace). node --test, sans navigateur ni émulateur.
// Chaque nom de test commence par le numéro du point du brief : 1 mise en page, 2 logo (écran + PDF), 3 chez Jérôme ET chez les clients, 4 couleur du tableau, 5 sans logo / logo trop gros / brouillon.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EMETTEUR_ESSAI, completerPourFinaliser } from './jeu-finalisation.js';
import * as D from '../js/modules/devis/logique.js';
import { devisHtml, paletteDevis, COULEUR_DEVIS_DEFAUT } from '../js/modules/devis/document.js';
import { logoEnDataUrl, mimeDesOctets, LOGO_OCTETS_MAX, AVERTISSEMENTS_LOGO } from '../functions/src/devis/pdf-service.js';

const ctx = { maintenant: new Date('2026-10-24T10:00:00Z'), auteur: 'moi@exemple.test', nouvelId: (n) => `${n}_1` };
const reglages = { modeMarge: 'majoration', marge: 20, margeDevis: 20, tauxTvaDefaut: 20, regimeTva: 'assujetti', dureeValiditeJours: 90 };
const ligne = (id, prixAchat, quantite, extra = {}) => ({ id, libelle: `Article ${id}`, unite: 'u', quantite, prixAchat, ...extra });

/** Devis finalisé d'essai : achats distinctifs (123,45 et 67,89), marge 20 % (jamais visible), deux taux de TVA. */
function devisFige(extra = {}, reg = reglages) {
  const base = {
    ...D.nouveauDevis({ affaireId: 'a1', destinataires: [{ email: 'client@exemple.test' }] }, ctx, reglages),
    objet: 'Rénovation de la toiture',
    adresses: { commanditaire: { id: 'a', texte: '1 rue du Test\n75000 Ville' }, facturation: null, chantier: { id: 'b', texte: '2 rue du Chantier' } },
    conditionsPaiement: '30 % à la commande, solde à la réception',
    modesPaiement: ['Virement bancaire', 'Chèque'],
    sections: [
      { id: 's1', titre: 'Toiture', lignes: [ligne('l1', 123.45, 3, { description: 'Dépose\net repose' }), ligne('l2', 67.89, 7, { tauxTva: 10 })] },
      { id: 's2', titre: 'Zinguerie', lignes: [ligne('l3', 10, 2), ligne('l4', 20, 1), ligne('l5', 30, 1)] },
    ],
    ...extra,
  };
  const r = D.figerPourFinalisation(completerPourFinaliser({ ...base, chantier: undefined }), { emetteur: EMETTEUR_ESSAI, numero: 'DEV-2026-10-24-001', finaliseLe: '2026-10-24T10:00:00Z', reglages: reg });
  assert.deepEqual(r.erreurs, []);
  const { chantier: _chantier, ...sans } = r.devis; // le jeu d'essai de finalisation ajoute un chantier : le document d'essai n'en a pas, sauf si le test en donne un
  return base.chantier === undefined ? sans : { ...sans, chantier: base.chantier };
}
const vue = () => D.vueClient(devisFige(), { clientNom: 'Copropriété Essai' });
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 7)]);
const LOGO_HTTPS = 'https://firebasestorage.googleapis.com/v0/b/essai/o/marques%2Fa%2Flogo-1.png?alt=media';

describe('1 mise en page « moderne »', () => {
  test('1 grand « DEVIS » en haut à droite, logo carré à gauche, émetteur et destinataire côte à côte, bandeaux de section et total en couleur', () => {
    const h = devisHtml(vue(), { logo: LOGO_HTTPS, emetteur: EMETTEUR_ESSAI });
    assert.match(h, /<div class="haut"><img class="logo-devis"[^>]*><div class="titre-devis"><h1>Devis<\/h1><\/div><\/div>/);
    assert.match(h, /<div class="parties"><div class="emetteur">.*<div class="destinataire">/s);
    assert.match(h, /\.logo-devis \{[^}]*width: 26mm; height: 26mm/);
    assert.match(h, /\.lignes \.bandeau td \{[^}]*background: var\(--accent-clair\)/);
    assert.match(h, /\.totaux \.net td \{[^}]*background: var\(--accent-clair\)/);
    assert.match(h, /h1 \{[^}]*Georgia|\.serif, h1[^{]*\{[^}]*Georgia/);
    assert.ok(h.includes('Numéro') && h.includes('Total net HT') && h.includes('Net à payer'), 'tout le contenu d’avant est toujours là');
  });
  test('1 l’écran (aperçu) et le PDF serveur appellent la MÊME fonction : aucun gabarit à part', () => {
    assert.match(readFileSync(new URL('../js/modules/devis/html-devis.js', import.meta.url), 'utf8'), /devisHtml\(vue,/);
    assert.match(readFileSync(new URL('../functions/src/devis/pdf-service.js', import.meta.url), 'utf8'), /devisHtml\(vue,/);
  });
  test('1 aucune ressource réseau dans le CSS (pas de police externe, pas d’url())', () => {
    const h = devisHtml(vue(), { emetteur: EMETTEUR_ESSAI });
    assert.ok(!/url\(|@import|<link|<script/i.test(h));
  });
});

describe('2 logo : écran et PDF', () => {
  test('2 le logo de l’espace (https) passé par l’appelant s’affiche en haut à gauche ; celui de « Mon entreprise » passe avant', () => {
    assert.ok(devisHtml(vue(), { logo: LOGO_HTTPS, emetteur: EMETTEUR_ESSAI }).includes(`<img class="logo-devis" src="${LOGO_HTTPS.replace(/&/g, '&amp;')}"`));
    const propre = 'data:image/png;base64,iVBORw0KGgo=';
    const h = devisHtml(vue(), { logo: LOGO_HTTPS, emetteur: { ...EMETTEUR_ESSAI, logo: propre } });
    assert.ok(h.includes(propre) && !h.includes('firebasestorage'));
  });
  test('2 le serveur transforme le logo en data:image PNG, JPEG ou WebP (type lu dans les premiers octets, jamais dans un nom)', () => {
    const r = logoEnDataUrl(PNG);
    assert.match(r.logo, /^data:image\/png;base64,[A-Za-z0-9+/=]+$/);
    assert.equal(mimeDesOctets(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2])), 'image/jpeg');
    assert.equal(mimeDesOctets(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')])), 'image/webp');
    assert.match(devisHtml(vue(), { emetteur: { ...EMETTEUR_ESSAI, logo: r.logo } }), /<img class="logo-devis" src="data:image\/png;base64,/);
  });
});

describe('4 la couleur du tableau suit « Mon entreprise »', () => {
  test('4 sans couleur ou couleur invalide : bleu marine ; avec une couleur : elle devient la couleur principale', () => {
    assert.equal(COULEUR_DEVIS_DEFAUT, '#1B2A4A');
    for (const couleur of [undefined, '', 'red', '#12', 'url(x)', '#1a73e8; background:url(x)']) {
      assert.deepEqual(paletteDevis(couleur), { principale: '#1B2A4A', claire: '#2A8FD8' }, String(couleur));
      assert.match(devisHtml(vue(), { emetteur: { ...EMETTEUR_ESSAI, couleur } }), /--accent: #1B2A4A; --accent-clair: #2A8FD8;/);
    }
    const p = paletteDevis('#AA1122');
    assert.equal(p.principale, '#aa1122');
    assert.match(p.claire, /^#[0-9a-f]{6}$/);
    assert.notEqual(p.claire, p.principale);
    assert.match(devisHtml(vue(), { emetteur: { ...EMETTEUR_ESSAI, couleur: '#AA1122' } }), new RegExp(`--accent: #aa1122; --accent-clair: ${p.claire};`));
  });
});

describe('5 sans logo, logo trop gros, brouillon', () => {
  test('5 sans logo : aucune image, le titre reste à droite et le devis est complet', () => {
    const h = devisHtml(vue(), { emetteur: EMETTEUR_ESSAI });
    assert.ok(!h.includes('<img'));
    assert.ok(h.includes('<h1>Devis</h1>') && h.includes('Net à payer'));
  });
  test('5 logo trop lourd (> 2 Mo), d’un autre format (SVG, texte) ou vide : aucune data:, une raison et un message clair', () => {
    const gros = Buffer.concat([PNG, Buffer.alloc(LOGO_OCTETS_MAX)]);
    assert.deepEqual(logoEnDataUrl(gros), { raison: 'trop_lourd' });
    assert.deepEqual(logoEnDataUrl(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), { raison: 'format' });
    assert.deepEqual(logoEnDataUrl(Buffer.from('MZ exécutable')), { raison: 'format' });
    assert.deepEqual(logoEnDataUrl(Buffer.alloc(0)), { raison: 'illisible' });
    assert.deepEqual(logoEnDataUrl('pas un buffer'), { raison: 'illisible' });
    for (const m of Object.values(AVERTISSEMENTS_LOGO)) assert.match(m, /sans logo/);
    assert.equal(logoEnDataUrl(Buffer.concat([PNG, Buffer.alloc(LOGO_OCTETS_MAX - PNG.length)])).raison, undefined, 'pile au plafond : accepté');
  });
  test('5 brouillon : le filigrane BROUILLON est conservé avec la nouvelle mise en page (et absent d’un devis finalisé)', () => {
    const h = devisHtml(vue(), { brouillon: true, logo: LOGO_HTTPS, emetteur: EMETTEUR_ESSAI });
    assert.ok(h.includes('<div class="filigrane">BROUILLON</div>'));
    assert.ok(!devisHtml(vue(), { emetteur: EMETTEUR_ESSAI }).includes('class="filigrane"'));
  });
});
