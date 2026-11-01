// Réglage « Gestion des déchets » (Réglages > Devis, 01/11/2026). node --test, sans navigateur. Chaque nom commence par le numéro du point.
//  D1 le réglage existe, vaut « oui » par défaut, se relit et s'enregistre (clé recopiée : l'enregistrement est un setDoc sans fusion) ;
//  D2 absent ou bizarre = actif (jamais `=== true`) ; D3 l'aperçu et l'impression n'impriment pas le bloc quand il est éteint ;
//  D4 le PDF OFFICIEL du serveur n'imprime pas le bloc quand il est éteint, et reste identique quand il est actif ou absent ;
//  D5 aucun outil MCP d'écriture ne connaît le champ `dechets` ni le réglage ; `lire_reglages_devis` renvoie la clé (voir devis-mcp.test.js).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as A from '../js/modules/devis/articles.js';
import * as D from '../js/modules/devis/logique.js';
import { htmlDuDevis } from '../js/modules/devis/html-devis.js';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { fabriquerPdfDevis } from '../functions/src/devis/pdf-service.js';
import { nouveauDevis } from '../functions/partage/devis.js';
import { EMETTEUR_ESSAI, completerPourFinaliser } from './jeu-finalisation.js';

const PHRASE = 'Gestion des déchets';
const DECHETS = { types: ['inertes'], volumeMin: 2, volumeMax: 4, unite: 'm3', coutTtcParM3: 100 };
const MAINTENANT = new Date('2026-11-01T10:00:00Z');
const devis = (extra = {}) => ({ ...completerPourFinaliser(nouveauDevis({ destinataires: [{ email: 'c@exemple.test' }], organisationId: 'org1', objet: 'Site web' }, { id: 'd1', maintenant: MAINTENANT, auteur: 'moi@exemple.test' }, { marge: 20, margeDevis: 20 })), sections: [{ id: 's1', titre: 'Création', lignes: [{ id: 'l1', libelle: 'Maquette', unite: 'u', quantite: 1, prixAchat: 100 }] }], dechets: DECHETS, ...extra });

describe('D1 le réglage', () => {
  test('D1 « oui » par défaut, listé dans les clés, recopié à l’enregistrement (oui comme non)', () => {
    assert.equal(A.REGLAGES_DEVIS_DEFAUT.gestionDechets, true);
    assert.ok(A.CLES_REGLAGES_DEVIS.includes('gestionDechets'));
    assert.equal(A.reglagesDevis(null).gestionDechets, true);
    const non = A.validerReglagesDevis({ gestionDechets: false });
    assert.deepEqual(non.erreurs, {});
    assert.equal(non.reglages.gestionDechets, false);
    assert.equal(A.reglagesDevis(non.reglages).gestionDechets, false, 'se relit à l’identique');
    // Une autre valeur enregistrée ensuite (écran sans cette clé) ne la ressuscite pas.
    assert.equal(A.validerReglagesDevis({ marge: 25 }, { actuels: non.reglages }).reglages.gestionDechets, false);
    assert.equal(A.validerReglagesDevis({}).reglages.gestionDechets, true);
  });
  test('D2 absent, vide ou bizarre = actif ; seul « false » éteint', () => {
    for (const brut of [undefined, null, {}, { gestionDechets: 'non' }, { gestionDechets: 0 }, { gestionDechets: true }]) assert.equal(A.reglagesDevis(brut).gestionDechets, true, JSON.stringify(brut));
    assert.equal(A.reglagesDevis({ gestionDechets: false }).gestionDechets, false);
    assert.equal(D.gestionDechetsActive(undefined), true);
    assert.equal(D.gestionDechetsActive({}), true);
    assert.equal(D.gestionDechetsActive({ gestionDechets: false }), false);
  });
});

describe('D3 aperçu et impression', () => {
  test('D3 réglage actif : le bloc est imprimé ; case du devis cochée ou réglage éteint : il ne l’est pas, et les données restent', () => {
    const d = devis();
    assert.ok(htmlDuDevis(d).includes(PHRASE), 'sans réglages passés : comme avant');
    assert.ok(htmlDuDevis(d, { reglages: { gestionDechets: true } }).includes(PHRASE));
    assert.ok(!htmlDuDevis(d, { reglages: { gestionDechets: false } }).includes(PHRASE));
    const coche = devis({ affichage: { cacherDechets: true } });
    assert.ok(!htmlDuDevis(coche, { reglages: { gestionDechets: true } }).includes(PHRASE));
    assert.deepEqual(coche.dechets, DECHETS);
    assert.deepEqual(D.affichageAvecReglages({ cacherDechets: false, afficherEmail: true }, { gestionDechets: false }), { cacherDechets: true, afficherEmail: true });
  });
});

describe('D4 PDF officiel du serveur', () => {
  async function pdf(reglages) {
    const d = devis();
    const donnees = creerAccesMemoire({
      devis_devis: [{ ...d, id: 'd1' }],
      devis_parametres: [{ id: 'reglages', entreprise: EMETTEUR_ESSAI, ...reglages }],
      crm_organisations: [{ id: 'org1', nom: 'Client Essai' }], crm_personnes: [],
    });
    const vus = [];
    const r = await fabriquerPdfDevis({
      donnees, baseLien: 'https://exemple.test', devisId: 'd1', brouillon: true, ctx: { maintenant: MAINTENANT },
      convertir: async (html) => { vus.push(html); return { pdf: Buffer.from('%PDF-1.4 faux'), sha256: 'a'.repeat(64) }; },
      stockage: { envoyer: async () => {}, existe: async () => true, lienSigne: async () => 'https://exemple.test/x' },
    });
    assert.equal(r.statut, 'ok', r.message);
    return vus[0];
  }
  test('D4 réglage éteint : pas de bloc dans le PDF ; actif ou absent : le bloc est imprimé comme avant', async () => {
    assert.ok(!(await pdf({ gestionDechets: false })).includes(PHRASE));
    assert.ok((await pdf({ gestionDechets: true })).includes(PHRASE));
    assert.ok((await pdf({})).includes(PHRASE));
  });
});

describe('D5 serveur et MCP', () => {
  test('D5 aucun outil d’écriture ni la finalisation ne lit `dechets` ou le réglage côté serveur', () => {
    for (const f of ['functions/src/coeur/devis.js', 'functions/src/coeur/ecriture.js', 'functions/src/coeur/metier.js']) {
      let source = '';
      try { source = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'); } catch { continue; }
      assert.ok(!/gestionDechets/.test(source), `${f} ne lit pas le réglage`);
    }
  });
});
