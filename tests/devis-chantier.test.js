// Tests H (module Devis, chantier et émetteur) : bloc « Chantier », durée, validations, mentions de l'émetteur, gabarit. node --test, sans navigateur.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { OPTIONS_FINALISATION, EMETTEUR_ESSAI, completerPourFinaliser } from './jeu-finalisation.js';
import * as D from '../js/modules/devis/logique.js';
import { devisHtml } from '../js/modules/devis/document.js';

const ctx = { maintenant: new Date('2026-10-24T10:00:00Z'), auteur: 'moi@exemple.test', nouvelId: (n) => `${n}_1` };
const reglages = { modeMarge: 'majoration', marge: 20, margeDevis: 20, tauxTvaDefaut: 20, regimeTva: 'assujetti', dureeValiditeJours: 90 };
const ligne = (id, prixAchat, quantite) => ({ id, libelle: `Article ${id}`, unite: 'u', quantite, prixAchat });
const chantierComplet = {
  adresse: { ligne1: '12 rue des Tests', codePostal: '75011', ville: 'Paris' },
  debutTravaux: '2026-11-03',
  dureeEstimee: { valeur: 3, unite: 'semaine' },
  finChantierAu: '2026-12-19',
};
const brouillon = (extra = {}) => ({
  ...D.nouveauDevis({ affaireId: 'a1', destinataires: [{ email: 'client@exemple.test' }] }, ctx, reglages),
  sections: [{ id: 's1', titre: 'Travaux', lignes: [ligne('l1', 100, 2)] }],
  ...extra,
});
// Depuis le 31/10/2026 la finalisation exige l'entreprise, un client, le début et la durée des travaux : le jeu d'essai est complété pour figer, puis le chantier
// est remis tel que le test le décrit (absent, partiel…) pour vérifier ce que le DOCUMENT imprime. Les règles de finalisation ont leurs propres tests (devis-finalisation-mentions.test.js).
const fige = (extra = {}) => {
  const r = D.figerPourFinalisation(completerPourFinaliser(brouillon({ ...extra, chantier: undefined })), { emetteur: EMETTEUR_ESSAI, numero: 'DEV-2026-10-24-001', finaliseLe: '2026-10-24T10:00:00Z', reglages });
  assert.deepEqual(r.erreurs, []);
  const { chantier: _chantier, ...sans } = r.devis;
  return extra.chantier === undefined ? sans : { ...sans, chantier: extra.chantier };
};
const emetteurComplet = {
  nom: 'Atelier Test', forme: 'SARL', siret: '123 456 789 00012', tva: 'FR00123456789', email: 'contact@atelier.test', telephone: '01 23 45 67 89',
  adresse: { ligne1: '3 rue de l\'Atelier', codePostal: '69001', ville: 'Lyon' },
  assuranceTexte: 'Assurance décennale : Assureur Test, contrat numéro : 123, territorialité : France métropolitaine.',
  mediateur: { nom: 'Médiateur Test', email: 'mediation@exemple.test', site: 'mediation.exemple.test' },
  couleur: '#1a73e8', paiement: { delaiJours: 30, modes: ['Virement'], iban: 'FR76 0000 0000 0000' }, cgv: { texte: 'Article 1\nArticle 2', afficher: false },
};
const html = (devis, emetteur) => devisHtml(D.vueClient(devis, { clientNom: 'Mme Dupont' }), { emetteur });

describe('Chantier et émetteur du devis', () => {
  test('H1b le bloc Chantier : deux paragraphes (adresse, puis dates), sans ligne vide, interligne 1,5 réglé en feuille de style', () => {
    const h = html(fige({ chantier: chantierComplet }));
    const bloc = /<div class="chantier">(.*?)<\/div>/.exec(h)[1];
    assert.equal((bloc.match(/<p>/g) ?? []).length, 2);
    assert.match(bloc, /<p>12 rue des Tests<br>75011 Paris<\/p><p>Début des travaux/);
    assert.ok(!bloc.includes('<br><br>'));
    assert.match(h, /\.chantier \{[^}]*line-height: 1\.5/);
    const sansAdresse = /<div class="chantier">(.*?)<\/div>/.exec(html(fige({ chantier: { debutTravaux: '2026-11-03' } })))[1];
    assert.equal((sansAdresse.match(/<p>/g) ?? []).length, 1);
  });
  test('H1 le bloc Chantier est imprimé en entier, ou ligne par ligne si partiel, et absent sans chantier', () => {
    const h = html(fige({ chantier: chantierComplet }));
    assert.match(h, /<h2>Chantier<\/h2>/);
    assert.ok(h.includes('12 rue des Tests'));
    assert.ok(h.includes('75011 Paris'));
    assert.ok(h.includes('Début des travaux : 03/11/2026'));
    assert.ok(h.includes('Durée estimée : 3 semaines'));
    assert.ok(h.includes('Fin de chantier au plus tard le 19/12/2026'));
    const partiel = html(fige({ chantier: { debutTravaux: '2026-11-03' } }));
    assert.ok(partiel.includes('Début des travaux : 03/11/2026'));
    assert.ok(!partiel.includes('Durée estimée'));
    assert.ok(!partiel.includes('Fin de chantier'));
    assert.ok(!html(fige()).includes('<h2>Chantier</h2>'));
    assert.equal(D.chantierDeVue({}), null);
  });

  test('H2 la durée prend le bon pluriel et la bonne unité française', () => {
    const t = (valeur, unite) => D.dureeEnTexte({ valeur, unite });
    assert.equal(t(1, 'semaine'), '1 semaine');
    assert.equal(t(3, 'semaine'), '3 semaines');
    assert.equal(t(1, 'jour'), '1 jour');
    assert.equal(t(5, 'jour'), '5 jours');
    assert.equal(t(1, 'heure'), '1 heure');
    assert.equal(t(8, 'heure'), '8 heures');
    assert.equal(t(1, 'mois'), '1 mois');
    assert.equal(t(2, 'mois'), '2 mois');
    assert.equal(t(1, 'annee'), '1 an');
    assert.equal(t(2, 'annee'), '2 ans');
    assert.equal(t(1.5, 'jour'), '1,5 jour');
    assert.equal(t(0, 'jour'), null);
    assert.equal(t(2, 'siècle'), null);
  });

  test('H3 chaque erreur de chantier donne un message, et un chantier correct ou absent n\'en donne aucun', () => {
    const msgs = (c) => D.erreursChantier(c); // le format du chantier ; sa présence (début, durée) est exigée par erreursFinalisation (B4)
    assert.deepEqual(msgs(undefined), []);
    assert.deepEqual(msgs(chantierComplet), []);
    assert.deepEqual(D.erreursFinalisation(completerPourFinaliser(brouillon({ chantier: chantierComplet })), OPTIONS_FINALISATION), []);
    const un = (c, motif) => { const m = msgs(c); assert.equal(m.length, 1, JSON.stringify(m)); assert.match(m[0], motif); };
    un({ debutTravaux: '03/11/2026' }, /début des travaux est illisible/);
    un({ debutTravaux: '2026-02-30' }, /début des travaux est illisible/);
    un({ finChantierAu: 'bientôt' }, /fin de chantier est illisible/);
    un({ dureeEstimee: { valeur: 0, unite: 'jour' } }, /supérieur à zéro/);
    un({ dureeEstimee: { valeur: -2, unite: 'jour' } }, /supérieur à zéro/);
    un({ dureeEstimee: { valeur: 1.234, unite: 'jour' } }, /deux décimales/);
    un({ dureeEstimee: { valeur: 2, unite: 'siècle' } }, /unité/);
    un({ debutTravaux: '2026-12-01', finChantierAu: '2026-11-01' }, /avant le début/);
    un({ adresse: { codePostal: '7501' } }, /5 chiffres/);
    assert.deepEqual(msgs({ dureeEstimee: { valeur: 1.25, unite: 'jour' } }), []);
  });

  test('H4 erreursEmetteur liste les mentions manquantes et les champs à mettre en rouge', () => {
    assert.deepEqual(D.erreursEmetteur(emetteurComplet), { mentions: [], champs: [], nombre: 0 });
    const vide = D.erreursEmetteur({});
    assert.deepEqual(vide.champs, ['nom', 'siret', 'adresse', 'email', 'telephone', 'assurance', 'mediateur']);
    assert.equal(vide.nombre, vide.mentions.length);
    assert.equal(vide.nombre, 6);
    assert.ok(vide.mentions.every((m) => typeof m === 'string' && m.length > 10));
    // Un e-mail OU un téléphone suffit.
    assert.equal(D.erreursEmetteur({ ...emetteurComplet, email: '' }).nombre, 0);
    assert.deepEqual(D.erreursEmetteur({ ...emetteurComplet, email: '', telephone: '' }).champs, ['email', 'telephone']);
    // Assurance seulement pour un métier du bâtiment.
    const sansAss = { ...emetteurComplet, assuranceTexte: undefined }; // texte par défaut : il garde des crochets, donc incomplet
    assert.deepEqual(D.erreursEmetteur(sansAss).champs, ['assurance']);
    assert.deepEqual(D.erreursEmetteur(sansAss).mentions, [D.MESSAGE_ASSURANCE_CROCHETS]);
    assert.deepEqual(D.erreursEmetteur({ ...emetteurComplet, assuranceTexte: 'Décennale chez [Assureur]' }).champs, ['assurance']); // un crochet reste
    assert.deepEqual(D.erreursEmetteur({ ...emetteurComplet, assuranceTexte: '   ' }).champs, ['assurance']); // vide = texte par défaut, donc des crochets
    // Anciens champs (sans assuranceTexte) : le texte est reconstruit, sans crochet, donc complet.
    assert.deepEqual(D.erreursEmetteur({ ...sansAss, assurance: { garantie: 'Décennale', assureur: 'Assureur SA' } }).champs, []);
    assert.deepEqual(D.erreursEmetteur(sansAss, { metierBatiment: false }).champs, []);
    assert.deepEqual(D.erreursEmetteur({ ...sansAss, metierBatiment: false }).champs, []);
    assert.deepEqual(D.erreursEmetteur({ ...emetteurComplet, mediateur: { nom: 'X' } }).champs, ['mediateur']);
    assert.deepEqual(D.erreursEmetteur(null).champs.length, 7);
  });

  test('H5 tout texte saisi est échappé, aucune balise script ne sort', () => {
    const s = '<script>alert(1)</script>';
    const emetteur = {
      ...emetteurComplet, nom: s, forme: s, siret: s, tva: s, email: s, telephone: s, site: s, registreMetiers: s, adresse: { ligne1: s, codePostal: s, ville: s },
      assuranceTexte: s, coordonneesBancaires: s, mentionEmetteur: s, mediateur: { nom: s, email: s, site: s },
      paiement: { delaiJours: 30, modes: [s], iban: s }, cgv: { texte: s, afficher: true },
    };
    const devis = fige({ objet: s, chantier: { adresse: { ligne1: s, codePostal: '75011', ville: s }, debutTravaux: '2026-11-03' } });
    const h = html(devis, emetteur);
    assert.ok(!h.includes('<script'));
    assert.ok(h.includes('&lt;script&gt;'));
  });

  test('H6 aucune ressource externe sans logo fourni ; logo https accepté ; couleur invalide donne le gris', () => {
    const h = html(fige({ chantier: chantierComplet }), emetteurComplet);
    assert.ok(!/<img|<link|<script|url\(|@import|src=|href=/i.test(h));
    assert.ok(h.includes('--accent: #1a73e8'));
    const avecLogo = html(fige(), { ...emetteurComplet, logo: 'https://exemple.test/logo.png' });
    assert.ok(avecLogo.includes('<img src="https://exemple.test/logo.png"'));
    const data = html(fige(), { ...emetteurComplet, logo: 'data:image/png;base64,AAAA' });
    assert.ok(data.includes('<img src="data:image/png;base64,AAAA"'));
    for (const logo of ['http://exemple.test/logo.png', 'javascript:alert(1)', 'https://x.test/"onerror="y']) {
      assert.ok(!html(fige(), { ...emetteurComplet, logo }).includes('<img'), logo);
    }
    for (const couleur of ['red', '#12', 'url(x)', '#12345g', '#1a73e8; background:url(http://x)', undefined]) {
      const c = html(fige(), { ...emetteurComplet, couleur });
      assert.ok(c.includes('--accent: #666666'), String(couleur));
      assert.ok(!c.includes('url('), String(couleur));
    }
  });

  test('H7 l\'annexe des conditions générales n\'existe que si afficher est vrai, sur une page à part', () => {
    const texte = 'Clause un\nClause deux';
    const sans = html(fige(), { ...emetteurComplet, cgv: { texte, afficher: false } });
    assert.ok(!sans.includes('Clause un'));
    assert.ok(!sans.includes('Conditions générales de vente'));
    const avec = html(fige(), { ...emetteurComplet, cgv: { texte, afficher: true } });
    assert.ok(avec.includes('Conditions générales de vente'));
    assert.ok(avec.includes('Clause un<br>Clause deux'));
    assert.match(avec, /class="cgv"/);
    assert.ok(avec.includes('page-break-before: always'));
    assert.ok(!html(fige(), { ...emetteurComplet, cgv: { texte: '  ', afficher: true } }).includes('class="cgv"'));
  });

  test('H8 la vue client expose le chantier sans fuite de prix d\'achat ni de marge', () => {
    const devis = fige({ chantier: chantierComplet });
    const v = D.vueClient(devis, { clientNom: 'Mme Dupont' });
    assert.deepEqual(v.chantier.lignes, ['12 rue des Tests\n75011 Paris', 'Début des travaux : 03/11/2026', 'Durée estimée : 3 semaines', 'Fin de chantier au plus tard le 19/12/2026']);
    const json = JSON.stringify(v);
    assert.ok(!/prixAchat|marge|coefficient|modeMarge/i.test(json));
    assert.equal(D.vueClient(fige(), {}).chantier, undefined);
    // Le gabarit ne montre aucune valeur d'achat (100 achetés, 120 vendus).
    assert.ok(!html(devis, emetteurComplet).includes('100,00'));
  });

  test('H9 la nouvelle version conserve le chantier, sans lien avec l\'original', () => {
    const f = fige({ chantier: chantierComplet });
    const v2 = D.nouvelleVersion(f, { id: 'devis_2', creeLe: new Date('2026-10-25T10:00:00Z') });
    assert.deepEqual(v2.chantier, chantierComplet);
    v2.chantier.debutTravaux = '2027-01-01';
    assert.equal(f.chantier.debutTravaux, '2026-11-03');
    assert.equal(v2.statut, 'brouillon');
  });

  test('H10 régressions : adresse {texte}, titre noir sans couleur, délai 0', () => {
    const devis = fige({});
    const h = html(devis, { nom: 'Atelier Test', adresse: { texte: '3 rue Z\n69001 Lyon' } });
    assert.ok(h.includes('3 rue Z') && h.includes('69001 Lyon'));
    assert.match(h, /--accent-titre: #1b1b1b/);
    assert.match(html(devis, { nom: 'A', couleur: '#aa1122' }), /--accent-titre: #aa1122/);
    assert.ok(html(devis, { nom: 'A', paiement: { delaiJours: 0 } }).includes('Paiement à réception'));
  });
});
