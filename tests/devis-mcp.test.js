// Outils MCP du module Devis (24/10/2026) : lister_devis, lire_devis, creer_devis_brouillon, modifier_devis_brouillon, finaliser_devis.
// De bout en bout par le protocole MCP, sur des données fictives en mémoire (aucun service Google, aucune donnée réelle).
// M1 liste filtrée sans marge ; M2 lecture ; M3 création d'un brouillon (totaux chiffrés à la main) ; M4 modification refusée hors brouillon ;
// M5 finalisation en deux temps ; M6 droits par profil ; M7 trace d'audit.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { creerGestionnaire } from '../functions/src/mcp/gestionnaire.js';
import { empreinte, creerMagasin } from '../functions/src/securite/jetons.js';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { creerLimiteur } from '../functions/src/securite/limites.js';
import { empreinteApercu } from '../functions/src/securite/codes.js';
import { canonique, sansId } from '../functions/src/coeur/canonique.js';
import { collections as base, MAINTENANT } from './_donnees-essai.js';

const JETONS = { lecteur: `cia_${'L'.repeat(43)}`, biblio: `cia_${'H'.repeat(43)}`, code: `cia_${'C'.repeat(43)}` };
const entree = (jeton, nom, profil, extra = {}) => ({ jeton: nom, acteur: nom, profil, empreinte: empreinte(jeton), actif: true, ...extra });
const EMAIL = ['client@exemple.test'];

const arrets = [];
afterEach(async () => { while (arrets.length) await arrets.pop()(); });

/** Un devis déjà enregistré (pour les tests de liste), avec un prix d'achat et une marge qui ne doivent jamais sortir de lister_devis. */
const devisEnregistre = (id, extra = {}) => ({
  id, racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', organisationId: 'org1', personneId: null, objet: `Objet ${id}`, destinataires: EMAIL,
  modeMarge: 'majoration', marge: 20, tauxTvaDefaut: 20, regimeTva: 'assujetti', archive: false, creeLe: new Date('2026-10-01T08:00:00Z'), expireLe: '2026-12-30',
  sections: [{ id: `s-${id}`, titre: '', lignes: [{ id: `l-${id}`, libelle: 'Peinture', unite: 'm²', quantite: 10, prixAchat: 8 }] }], ...extra,
});

async function demarrer({ devis = [], jetonsExtra = {} } = {}) {
  const collections = structuredClone(base);
  Object.assign(collections, { devis_articles: [], devis_devis: devis.map((d) => structuredClone(d)), devis_compteurs: [], devis_parametres: [{ id: 'reglages', regimeTva: 'assujetti', marge: 20, modeMarge: 'majoration' }] });
  const donnees = creerAccesMemoire(collections);
  const horloge = { t: MAINTENANT.getTime() };
  const secret = JSON.stringify([entree(JETONS.lecteur, 'lecteur-essai', 'lecteur'), entree(JETONS.biblio, 'hermes-bibliothecaire', 'bibliothecaire'), entree(JETONS.code, 'claude-code-jerome', 'claude-code', jetonsExtra.code)]);
  const magasin = creerMagasin({ lire: async () => secret, dureeCacheMs: 0 });
  const limiteur = creerLimiteur({ donnees, maintenant: () => horloge.t });
  const gestionnaire = creerGestionnaire({ magasin, donnees, limiteur, maintenant: () => horloge.t, journal: () => {} });
  const serveur = createServer((req, res) => {
    const m = [];
    req.on('data', (x) => m.push(x));
    req.on('end', () => {
      const texte = Buffer.concat(m).toString('utf8');
      try { req.body = texte ? JSON.parse(texte) : undefined; } catch { req.body = undefined; }
      gestionnaire(req, res);
    });
  });
  await new Promise((fin) => serveur.listen(0, '127.0.0.1', fin));
  arrets.push(() => new Promise((fin) => serveur.close(fin)));
  const url = `http://127.0.0.1:${serveur.address().port}/mcp`;
  let n = 0;
  const appeler = async (jeton, nom, args = {}) => {
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${JETONS[jeton]}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method: 'tools/call', params: { name: nom, arguments: args } }),
    });
    const corps = await r.json();
    if (corps.error) return { isError: true, texte: corps.error.message };
    const texte = corps.result.content?.[0]?.text ?? '';
    let data;
    try { data = JSON.parse(texte); } catch { data = undefined; }
    return { isError: !!corps.result.isError, texte, data };
  };
  return { collections, appeler, horloge, doc: (nom, id) => collections[nom]?.find((d) => d.id === id) };
}
const ok = (r) => { assert.equal(r.isError, false, r.texte); return r.data; };
const refuse = (r, motif) => { assert.equal(r.isError, true, `devait être refusé : ${r.texte}`); if (motif) assert.match(r.texte, motif); };

/** Trois articles du bordereau : 50 € +20 % = 60 €, 30 € +20 % = 36 €, 100 € à marge 0 = 100 €. */
async function articlesDeBase(s) {
  const a = ok(await s.appeler('biblio', 'creer_article', { libelle: 'Carrelage', prixAchat: 50, unite: 'm²', code: 'CAR' }));
  const b = ok(await s.appeler('biblio', 'creer_article', { libelle: 'Plinthe', prixAchat: 30, unite: 'ml', code: 'PLI' }));
  const c = ok(await s.appeler('biblio', 'creer_article', { libelle: 'Forfait pose', prixAchat: 100, unite: 'forfait', marge: 0, reference: 'POSE-1' }));
  return { a: a.id, b: b.id, c: c.id };
}
const lignesDeBase = (ids) => [{ articleId: ids.a, quantite: 10 }, { reference: 'pli', quantite: 5 }, { reference: 'pose-1', quantite: 1 }];

describe('M1 lister_devis : filtres, statut « expiré » calculé, jamais de marge ni de prix d’achat', () => {
  const devis = [
    devisEnregistre('d1', { objet: 'Cuisine Lilas', creeLe: new Date('2026-10-01T08:00:00Z') }),
    devisEnregistre('d2', { objet: 'Salle de bain', statut: 'en_attente_envoi', numero: 'DEV-2026-09-20-001', expireLe: '2026-10-01', creeLe: new Date('2026-09-20T08:00:00Z'), totaux: { totalHt: 80, ttc: 96, lignes: [], sections: [] } }),
    devisEnregistre('d3', { objet: 'Terrasse', statut: 'accepte', numero: 'DEV-2026-09-01-001', organisationId: 'org2', affaireId: 'a2', creeLe: new Date('2026-09-01T08:00:00Z'), totaux: { totalHt: 500, ttc: 600, lignes: [], sections: [] } }),
    devisEnregistre('d4', { objet: 'Ancien', archive: true, creeLe: new Date('2026-08-01T08:00:00Z') }),
  ];

  test('M1 la liste montre numéro, version, statut, objet, client et totaux ; un devis en attente dont la date est passée est « expire »', async () => {
    const s = await demarrer({ devis });
    const r = ok(await s.appeler('lecteur', 'lister_devis', {}));
    assert.deepEqual(r.devis.map((d) => d.id), ['d1', 'd2', 'd3'], 'du plus récent au plus ancien, archivés exclus');
    const d2 = r.devis.find((d) => d.id === 'd2');
    assert.equal(d2.statut, 'expire');
    assert.equal(d2.statutLibelle, 'Expiré');
    assert.equal(d2.numero, 'DEV-2026-09-20-001');
    assert.equal(d2.version, 1);
    assert.equal(d2.totalHT, 80);
    assert.equal(d2.totalTTC, 96);
    assert.deepEqual(d2.client, { type: 'organisation', id: 'org1', nom: 'Atelier des Lilas' });
    assert.equal(r.devis.find((d) => d.id === 'd1').totalHT, 96, 'un brouillon est recalculé : 10 × (8 € + 20 %)');
  });

  test('M1 les filtres statut, affaire, texte et limite', async () => {
    const s = await demarrer({ devis });
    const ids = async (args) => ok(await s.appeler('biblio', 'lister_devis', args)).devis.map((d) => d.id);
    assert.deepEqual(await ids({ statut: 'brouillon' }), ['d1']);
    assert.deepEqual(await ids({ statut: 'expire' }), ['d2']);
    assert.deepEqual(await ids({ statut: 'accepte' }), ['d3']);
    assert.deepEqual(await ids({ affaireId: 'a2' }), ['d3']);
    assert.deepEqual(await ids({ texte: 'salle bain' }), ['d2']);
    assert.deepEqual(await ids({ texte: 'boulangerie' }), ['d3'], 'le texte cherche aussi dans le nom du client');
    assert.deepEqual(await ids({ texte: 'dev-2026-09-01' }), ['d3'], 'et dans le numéro');
    assert.deepEqual(await ids({ archives: true, texte: 'ancien' }), ['d4']);
    const un = ok(await s.appeler('lecteur', 'lister_devis', { limite: 1 }));
    assert.equal(un.devis.length, 1);
    assert.equal(un.tronque, true);
    assert.equal(un.total, 3);
  });

  test('M1 la sortie ne contient ni prix d’achat ni marge', async () => {
    const s = await demarrer({ devis });
    const r = await s.appeler('lecteur', 'lister_devis', { archives: true });
    assert.doesNotMatch(r.texte, /prixAchat|marge|coefficient|modeMarge/i);
  });
});

describe('M2 lire_devis : un devis complet côté artisan', () => {
  test('M2 le lecteur lit lignes, prix de vente, totaux et ce qui manque avant de finaliser', async () => {
    const s = await demarrer({ devis: [devisEnregistre('d1', { destinataires: [], remise: { type: 'pourcentage', valeur: 10 } })] });
    const d = ok(await s.appeler('lecteur', 'lire_devis', { id: 'd1' }));
    assert.equal(d.id, 'd1');
    assert.equal(d.statut, 'brouillon');
    assert.deepEqual(d.affaire, { id: 'a1', titre: 'Site vitrine Atelier des Lilas' });
    assert.equal(d.client.nom, 'Atelier des Lilas');
    const ligne = d.sections[0].lignes[0];
    assert.equal(ligne.prixAchat, 8);
    assert.equal(ligne.prixVenteUnitaire, 9.6);
    assert.equal(ligne.totalHT, 96);
    assert.equal(d.sections[0].sousTotalHT, 96);
    assert.equal(d.totaux.totalBrutHT, 96);
    assert.equal(d.totaux.remiseHT, 9.6);
    assert.equal(d.totaux.totalHT, 86.4);
    assert.ok(!d.erreursFinalisation.some((e) => /destinataire/.test(e)), 'le destinataire n’est plus obligatoire (impression et remise en main propre)');
  });

  test('M2 un devis inconnu est refusé', async () => {
    const s = await demarrer();
    refuse(await s.appeler('lecteur', 'lire_devis', { id: 'inconnu' }), /introuvable/i);
  });
});

describe('M3 creer_devis_brouillon : lignes tirées des articles, totaux justes, jamais de numéro', () => {
  test('M3 10 × 60 + 5 × 36 + 100 = 880 brut, remise 10 % = 792 HT (TVA 20 % : 950,40 TTC)', async () => {
    const s = await demarrer();
    const ids = await articlesDeBase(s);
    const r = ok(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', objet: ' Pose  de carrelage ', destinataires: EMAIL, lignes: lignesDeBase(ids), remise: { type: 'pourcentage', valeur: 10 } }));
    assert.equal(r.statut, 'brouillon');
    assert.equal(r.numero, null);
    assert.equal(r.lignes, 3);
    assert.equal(r.totalHT, 792);
    assert.equal(r.totalTTC, 950.4);
    const d = s.doc('devis_devis', r.id);
    assert.equal(d.statut, 'brouillon');
    assert.equal(d.numero, null);
    assert.equal(d.version, 1);
    assert.equal(d.objet, 'Pose de carrelage');
    assert.equal(d.organisationId, 'org1', 'le client vient de l’affaire');
    assert.deepEqual(d.destinataires, EMAIL);
    assert.deepEqual(d.sections[0].lignes.map((l) => [l.libelle, l.quantite, l.prixAchat]), [['Carrelage', 10, 50], ['Plinthe', 5, 30], ['Forfait pose', 1, 100]]);
    const lu = ok(await s.appeler('lecteur', 'lire_devis', { id: r.id }));
    assert.equal(lu.totaux.totalBrutHT, 880);
    assert.equal(lu.totaux.remiseHT, 88);
    assert.equal(lu.totaux.totalHT, 792);
    assert.deepEqual(lu.erreursFinalisation, [], 'prêt à finaliser');
  });

  test('M3 sections, destinataire repris de la fiche, et refus sans écriture : article inconnu ou désactivé, quantité nulle, référence ambiguë, remise trop forte, affaire inconnue', async () => {
    const s = await demarrer();
    const ids = await articlesDeBase(s);
    const ok1 = ok(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a2', personneId: 'p2', sections: [{ titre: 'Sol', lignes: [{ articleId: ids.a, quantite: 2 }] }, { titre: 'Finitions', lignes: [{ reference: 'PLI', quantite: 4 }] }] }));
    const d = s.doc('devis_devis', ok1.id);
    assert.deepEqual(d.sections.map((x) => x.titre), ['Sol', 'Finitions']);
    assert.deepEqual(d.destinataires, ['elodie@exemple.test'], 'sans adresse donnée, la première adresse de la fiche du client');
    const avant = s.collections.devis_devis.length;
    refuse(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', lignes: [{ articleId: 'nope', quantite: 1 }] }), /introuvable/i);
    refuse(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', lignes: [{ reference: 'zzz', quantite: 1 }] }), /Aucun article actif/);
    refuse(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', lignes: [{ articleId: ids.a, reference: 'CAR', quantite: 1 }] }), /OU/);
    refuse(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', lignes: [{ articleId: ids.a, quantite: 0 }] }));
    refuse(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', lignes: [{ articleId: ids.a, quantite: 1.2345 }] }));
    refuse(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', organisationId: 'org1', personneId: 'p1' }), /un seul client/);
    refuse(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', lignes: [{ articleId: ids.a }] }), /supérieur à zéro/);
    refuse(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', lignes: lignesDeBase(ids), remise: { type: 'pourcentage', valeur: 100 } }), /100 % exclu/);
    refuse(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', lignes: lignesDeBase(ids), remise: { type: 'montant', valeur: 5000 } }), /dépasser le total/);
    refuse(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', destinataires: ['pas-un-mail'] }), /invalide/);
    refuse(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'inconnue' }), /introuvable/i);
    ok(await s.appeler('biblio', 'creer_article', { libelle: 'Autre plinthe', prixAchat: 12, code: 'PLI2', reference: 'PLI' }));
    refuse(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', lignes: [{ reference: 'pli', quantite: 1 }] }), /Plusieurs articles/);
    ok(await s.appeler('biblio', 'desactiver_article', { id: ids.b }));
    refuse(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', lignes: [{ articleId: ids.b, quantite: 1 }] }), /désactivé/);
    assert.equal(s.collections.devis_devis.length, avant, 'aucun refus n’écrit');
  });
});

describe('M4 modifier_devis_brouillon : seulement un brouillon', () => {
  test('M4 modification d’un brouillon (lignes ajoutées, remise retirée, objet) puis refus sur un devis finalisé', async () => {
    const s = await demarrer({ devis: [devisEnregistre('f1', { statut: 'en_attente_envoi', numero: 'DEV-2026-10-01-001', totaux: { totalHt: 96, ttc: 115.2, lignes: [], sections: [] } })] });
    const ids = await articlesDeBase(s);
    const r = ok(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', destinataires: EMAIL, lignes: [{ articleId: ids.a, quantite: 10 }], remise: { type: 'pourcentage', valeur: 10 } }));
    assert.equal(r.totalHT, 540);
    const m = ok(await s.appeler('biblio', 'modifier_devis_brouillon', { id: r.id, ajouterLignes: [{ reference: 'PLI', quantite: 5 }, { reference: 'POSE-1', quantite: 1 }], objet: 'Carrelage' }));
    assert.equal(m.totalHT, 792, '880 brut - 10 %');
    assert.deepEqual(m.champsModifies.sort(), ['objet', 'sections']);
    const m2 = ok(await s.appeler('biblio', 'modifier_devis_brouillon', { id: r.id, remise: null }));
    assert.equal(m2.totalHT, 880);
    assert.equal(s.doc('devis_devis', r.id).remise, null);
    const m3 = ok(await s.appeler('biblio', 'modifier_devis_brouillon', { id: r.id, lignes: [{ articleId: ids.c, quantite: 2 }] }));
    assert.equal(m3.totalHT, 200, 'lignes remplace tout le contenu');
    refuse(await s.appeler('biblio', 'modifier_devis_brouillon', { id: r.id, lignes: [{ articleId: ids.a, quantite: 1 }], ajouterLignes: [{ articleId: ids.a, quantite: 1 }] }), /pas les deux/);
    refuse(await s.appeler('biblio', 'modifier_devis_brouillon', { id: r.id }), /Aucun champ/);
    const avant = JSON.stringify(s.doc('devis_devis', 'f1'));
    refuse(await s.appeler('biblio', 'modifier_devis_brouillon', { id: 'f1', objet: 'Autre' }), /n’est plus un brouillon/);
    refuse(await s.appeler('code', 'modifier_devis_brouillon', { id: 'f1', ajouterLignes: [{ articleId: ids.a, quantite: 1 }] }), /n’est plus un brouillon/);
    assert.equal(JSON.stringify(s.doc('devis_devis', 'f1')), avant, 'un devis finalisé ne bouge pas');
    refuse(await s.appeler('biblio', 'modifier_devis_brouillon', { id: 'inconnu', objet: 'x' }), /introuvable/i);
  });
});

describe('M5 finaliser_devis : aperçu sans écriture, puis écriture avec le bon code', () => {
  async function brouillonPret(s) {
    const ids = await articlesDeBase(s);
    return ok(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', objet: 'Carrelage', destinataires: EMAIL, lignes: lignesDeBase(ids), remise: { type: 'pourcentage', valeur: 10 } }));
  }

  test('M5 le premier appel ne finalise rien (aperçu et code) ; le second, avec le code, attribue le numéro et fige les totaux', async () => {
    const s = await demarrer();
    const { id } = await brouillonPret(s);
    const avant = JSON.stringify(s.doc('devis_devis', id));
    const apercu = ok(await s.appeler('code', 'finaliser_devis', { id }));
    assert.equal(apercu.apercu, true);
    assert.equal(apercu.finalise, false);
    assert.equal(apercu.totalHT, 792);
    assert.equal(apercu.totalTTC, 950.4);
    assert.match(apercu.numero, /attribué/);
    assert.ok(apercu.code);
    assert.equal(JSON.stringify(s.doc('devis_devis', id)), avant, 'l’aperçu n’écrit rien');
    assert.equal(s.collections.devis_compteurs.length, 0, 'aucun numéro consommé');
    refuse(await s.appeler('code', 'finaliser_devis', { id, codeConfirmation: 'FAUX-CODE' }), /code incorrect/);
    assert.equal(s.doc('devis_devis', id).statut, 'brouillon');
    const second = ok(await s.appeler('code', 'finaliser_devis', { id }));
    const f = ok(await s.appeler('code', 'finaliser_devis', { id, codeConfirmation: second.code }));
    assert.equal(f.finalise, true);
    assert.equal(f.numero, 'DEV-2026-10-05-001');
    assert.equal(f.totalHT, 792);
    const d = s.doc('devis_devis', id);
    assert.equal(d.statut, 'en_attente_envoi');
    assert.equal(d.numero, 'DEV-2026-10-05-001');
    assert.equal(d.totaux.totalHt, 792);
    assert.equal(d.sections[0].lignes[0].prixVente, 60, 'prix figé');
    assert.equal(s.collections.devis_compteurs[0].valeur, 1);
    refuse(await s.appeler('code', 'finaliser_devis', { id, codeConfirmation: second.code }), /déjà finalisé/);
    const lu = ok(await s.appeler('lecteur', 'lire_devis', { id }));
    assert.equal(lu.numero, 'DEV-2026-10-05-001');
    assert.equal(lu.statut, 'en_attente_envoi');
    assert.equal(lu.erreursFinalisation, undefined);
  });

  test('M5 un devis sans ligne est refusé, avec la liste des erreurs, sans code ni écriture ; sans adresse e-mail il est accepté', async () => {
    const s = await demarrer();
    const ids = await articlesDeBase(s);
    const r = ok(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', lignes: [{ articleId: ids.a, quantite: 1 }] })); // organisation sans e-mail : aucun destinataire
    const avant = JSON.stringify(s.collections.devis_devis);
    const rep = await s.appeler('code', 'finaliser_devis', { id: r.id });
    ok(rep); // sans adresse e-mail le devis peut être finalisé : l'aperçu est montré (c'est la finalisation qui exigera l'accord)
    assert.equal(JSON.stringify(s.collections.devis_devis), avant); // l'aperçu n'écrit rien
    assert.equal(rep.data.finalise, false);
    const vide = ok(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', destinataires: EMAIL }));
    refuse(await s.appeler('code', 'finaliser_devis', { id: vide.id }), /au moins une ligne/);
  });

  test('M5 si le devis change après l’aperçu, le code ne vaut plus', async () => {
    const s = await demarrer();
    const { id } = await brouillonPret(s);
    const apercu = ok(await s.appeler('code', 'finaliser_devis', { id }));
    ok(await s.appeler('biblio', 'modifier_devis_brouillon', { id, objet: 'Changé après l’aperçu' }));
    refuse(await s.appeler('code', 'finaliser_devis', { id, codeConfirmation: apercu.code }), /a changé depuis l’aperçu|a changé depuis l'aperçu/);
    assert.equal(s.doc('devis_devis', id).statut, 'brouillon');
  });
});

describe('M6 droits par profil', () => {
  test('M6 le lecteur lit mais ne crée, ne modifie ni ne finalise ; le bibliothécaire écrit des brouillons mais ne finalise pas ; Claude Code finalise', async () => {
    const s = await demarrer({ devis: [devisEnregistre('d1', { destinataires: EMAIL })] });
    const avant = JSON.stringify(s.collections.devis_devis);
    for (const outil of ['creer_devis_brouillon', 'modifier_devis_brouillon', 'finaliser_devis']) refuse(await s.appeler('lecteur', outil, { id: 'd1', affaireId: 'a1' }));
    refuse(await s.appeler('biblio', 'finaliser_devis', { id: 'd1' }));
    assert.equal(JSON.stringify(s.collections.devis_devis), avant, 'aucun refus n’écrit');
    ok(await s.appeler('lecteur', 'lister_devis', {}));
    ok(await s.appeler('lecteur', 'lire_devis', { id: 'd1' }));
    ok(await s.appeler('biblio', 'modifier_devis_brouillon', { id: 'd1', objet: 'Modifié par Hermes' }));
    const apercu = ok(await s.appeler('code', 'finaliser_devis', { id: 'd1' }));
    assert.equal(ok(await s.appeler('code', 'finaliser_devis', { id: 'd1', codeConfirmation: apercu.code })).finalise, true);
  });
});

describe('M7 trace d’audit', () => {
  test('M7 chaque écriture laisse sa ligne (acteur, outil, canal mcp) ; la finalisation aussi, et elle ne se défait pas avec restaurer_depuis_audit', async () => {
    const s = await demarrer();
    const ids = await articlesDeBase(s);
    const r = ok(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', destinataires: EMAIL, lignes: [{ articleId: ids.a, quantite: 1 }] }));
    ok(await s.appeler('biblio', 'modifier_devis_brouillon', { id: r.id, objet: 'Suivi' }));
    const apercu = ok(await s.appeler('code', 'finaliser_devis', { id: r.id }));
    const f = ok(await s.appeler('code', 'finaliser_devis', { id: r.id, codeConfirmation: apercu.code }));
    const lignes = s.collections.crm_audit.filter((l) => l.collection === 'devis_devis' && l.docId === r.id);
    assert.deepEqual(lignes.map((l) => [l.outil, l.action]).sort(), [['creer_devis_brouillon', 'creer'], ['devisFinaliser', 'modifier'], ['modifier_devis_brouillon', 'modifier']].sort());
    assert.deepEqual(lignes.map((l) => l.acteur).sort(), ['claude-code-jerome', 'hermes-bibliothecaire', 'hermes-bibliothecaire']);
    assert.ok(lignes.every((l) => l.via === 'mcp'));
    const fin = lignes.find((l) => l.outil === 'devisFinaliser');
    assert.equal(fin.operationId, f.operationId);
    assert.ok(s.doc('crm_audit_avant', fin.id), 'copie avant/après gardée');
    refuse(await s.appeler('code', 'restaurer_depuis_audit', { operationId: f.operationId, apercu: false }), /ne se défait pas/);
    assert.equal(s.doc('devis_devis', r.id).statut, 'en_attente_envoi');
    const creation = lignes.find((l) => l.outil === 'creer_devis_brouillon');
    refuse(await s.appeler('code', 'restaurer_depuis_audit', { operationId: creation.operationId }), /n’est plus un brouillon/);
    const neuf = ok(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', destinataires: EMAIL }));
    const op = s.collections.crm_audit.find((l) => l.docId === neuf.id).operationId;
    assert.equal(ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: op })).apercu, true, 'la création d’un brouillon reste restaurable (aperçu)');
  });
});

describe('Relecture : garde-fous supplémentaires', () => {
  const prets = async (s) => {
    const ids = await articlesDeBase(s);
    return ok(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', objet: 'X', destinataires: EMAIL, lignes: [{ articleId: ids.a, quantite: 1 }] }));
  };

  test('R1 un devis finalisé à l’écran après sa création ne se restaure pas, même avec forcer', async () => {
    const s = await demarrer();
    const r = await prets(s);
    const creation = s.collections.crm_audit.find((l) => l.docId === r.id && l.outil === 'creer_devis_brouillon');
    s.doc('devis_devis', r.id).statut = 'en_attente_envoi'; // finalisation faite à l’écran
    refuse(await s.appeler('code', 'restaurer_depuis_audit', { operationId: creation.operationId, apercu: false, forcer: true }), /n’est plus un brouillon/);
    assert.ok(s.doc('devis_devis', r.id), 'le devis est toujours là');
    assert.equal(s.doc('devis_devis', r.id).statut, 'en_attente_envoi');
  });

  test('R2 changer de client d’un brouillon recalcule les adresses ; les deux clients ensemble sont refusés', async () => {
    const s = await demarrer();
    s.collections.crm_organisations.find((o) => o.id === 'org1').adresses = [{ id: 'x', libelle: 'Siège', adresse: '1 rue des Lilas', parDefaut: true }];
    s.collections.crm_organisations.find((o) => o.id === 'org2').adresses = [{ id: 'y', libelle: 'Siège', adresse: '2 rue du Pain', parDefaut: true }];
    const r = ok(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', destinataires: EMAIL }));
    assert.equal(s.doc('devis_devis', r.id).adresses.commanditaire.texte, '1 rue des Lilas');
    assert.equal(s.doc('devis_devis', r.id).adresses.chantier.texte, '1 rue des Lilas');
    refuse(await s.appeler('biblio', 'modifier_devis_brouillon', { id: r.id, organisationId: 'org2', personneId: 'p2' }), /un seul client/);
    ok(await s.appeler('biblio', 'modifier_devis_brouillon', { id: r.id, organisationId: 'org2' }));
    const d = s.doc('devis_devis', r.id);
    assert.equal(d.organisationId, 'org2');
    assert.equal(d.personneId, null);
    assert.equal(d.adresses.commanditaire.texte, '2 rue du Pain');
    assert.equal(d.adresses.facturation.texte, '2 rue du Pain');
    assert.equal(d.adresses.chantier.texte, '2 rue du Pain', 'le chantier suivait l’ancien client');
    assert.deepEqual(d.destinataires, EMAIL, 'les destinataires déjà choisis restent');
  });

  test('R3 l’empreinte de l’aperçu ne dépend pas de l’ordre des clés', () => {
    const a = { id: 'd1', objet: 'x', sections: [{ id: 's', lignes: [{ id: 'l', quantite: 1, prixAchat: 2 }] }] };
    const b = { sections: [{ lignes: [{ prixAchat: 2, quantite: 1, id: 'l' }], id: 's' }], objet: 'x', id: 'autre' };
    const e = (d) => empreinteApercu([JSON.stringify({ devis: canonique(sansId(d)) })]);
    assert.equal(e(a), e(b));
  });

  test('R3 un réglage qui joue sur le figeage (régime de TVA) change le code : il ne vaut plus', async () => {
    const s = await demarrer();
    const r = await prets(s);
    const apercu = ok(await s.appeler('code', 'finaliser_devis', { id: r.id }));
    s.doc('devis_parametres', 'reglages').regimeTva = 'franchise';
    refuse(await s.appeler('code', 'finaliser_devis', { id: r.id, codeConfirmation: apercu.code }), /a changé/);
    assert.equal(s.doc('devis_devis', r.id).statut, 'brouillon');
  });

  test('R4 le plafond d’écriture est vérifié avant de consommer le code : après un refus, le même code sert encore', async () => {
    const s = await demarrer({ jetonsExtra: { code: { limites: { ecrituresParHeure: 1 } } } });
    const r1 = await prets(s);
    const r2 = ok(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', destinataires: EMAIL, lignes: [{ reference: 'car', quantite: 2 }] }));
    const a1 = ok(await s.appeler('code', 'finaliser_devis', { id: r1.id }));
    ok(await s.appeler('code', 'finaliser_devis', { id: r1.id, codeConfirmation: a1.code }));
    const a2 = ok(await s.appeler('code', 'finaliser_devis', { id: r2.id }));
    refuse(await s.appeler('code', 'finaliser_devis', { id: r2.id, codeConfirmation: a2.code }), /Plafond atteint/);
    assert.equal(s.doc('devis_devis', r2.id).statut, 'brouillon');
    assert.equal(s.collections.mcp_codes.length, 1, 'le code n’a pas été consommé');
    s.horloge.t += 2 * 3_600_000; // le plafond se libère (le code, lui, a expiré : nouvel aperçu)
    const a3 = ok(await s.appeler('code', 'finaliser_devis', { id: r2.id }));
    assert.equal(ok(await s.appeler('code', 'finaliser_devis', { id: r2.id, codeConfirmation: a3.code })).finalise, true);
  });

  test('R5 le journal de la finalisation porte l’identifiant du jeton', async () => {
    const s = await demarrer();
    const r = await prets(s);
    const a = ok(await s.appeler('code', 'finaliser_devis', { id: r.id }));
    const f = ok(await s.appeler('code', 'finaliser_devis', { id: r.id, codeConfirmation: a.code }));
    const ligne = s.collections.crm_audit.find((l) => l.operationId === f.operationId);
    assert.equal(ligne.jeton, 'claude-code-jerome');
    assert.equal(ligne.acteur, 'claude-code-jerome');
  });

  test('R7 le moteur refuse la modification si le devis n’est plus un brouillon au moment d’écrire (exigerStatut)', async () => {
    const { executerEcritures } = await import('../functions/src/coeur/ecriture.js');
    const s = await demarrer({ devis: [devisEnregistre('f1', { statut: 'en_attente_envoi' })] });
    const donnees = creerAccesMemoire(s.collections);
    await assert.rejects(() => executerEcritures({ donnees, ctx: { acteur: 'x', jeton: 'x', via: 'mcp', maintenant: MAINTENANT }, outil: 'essai', operations: [{ type: 'modifier', collection: 'devis_devis', id: 'f1', patch: { objet: 'Z' }, exigerStatut: 'brouillon' }] }), /n'a plus le statut/);
    assert.notEqual(s.doc('devis_devis', 'f1').objet, 'Z');
  });
});
