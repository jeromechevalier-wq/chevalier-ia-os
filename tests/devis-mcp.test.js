// Outils MCP du module Devis (24/10/2026, révisés le 25/10/2026) : lister_devis, lire_devis, brouillons, finaliser_devis, copie, changer_statut_devis, nouvelle_version_devis, archiver_devis, supprimer_devis, enregistrer_envoi_devis.
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

// ---------------------------------------------------------------- Révision du MCP Devis (25/10/2026) : copie, envois, statut, nouvelle version, archive, suppression, restauration
const TOTAUX = { totalHt: 96, ttc: 115.2, lignes: [], sections: [] };
const finalise = (id, statut, extra = {}) => devisEnregistre(id, { statut, numero: 'DEV-2026-10-01-001', finaliseLe: new Date('2026-10-02T08:00:00Z'), totaux: TOTAUX, destinataires: EMAIL, ...extra });
const auditDe = (s, id) => s.collections.crm_audit.filter((l) => l.collection === 'devis_devis' && l.docId === id);

describe('N1 copie : e-mails en copie d’un brouillon, mêmes règles que l’écran', () => {
  test('N1 création avec copie, lecture, remplacement, retrait, et journal', async () => {
    const s = await demarrer();
    const ids = await articlesDeBase(s);
    const r = ok(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', destinataires: EMAIL, copie: [' compta@exemple.test ', 'patron@exemple.test'], lignes: [{ articleId: ids.a, quantite: 1 }] }));
    assert.deepEqual(s.doc('devis_devis', r.id).copie, ['compta@exemple.test', 'patron@exemple.test'], 'espaces ôtés');
    assert.deepEqual(ok(await s.appeler('lecteur', 'lire_devis', { id: r.id })).copie, ['compta@exemple.test', 'patron@exemple.test']);
    const m = ok(await s.appeler('biblio', 'modifier_devis_brouillon', { id: r.id, copie: ['autre@exemple.test'] }));
    assert.deepEqual(m.champsModifies, ['copie']);
    assert.deepEqual(s.doc('devis_devis', r.id).copie, ['autre@exemple.test'], 'la liste remplace l’actuelle');
    ok(await s.appeler('biblio', 'modifier_devis_brouillon', { id: r.id, copie: [] }));
    assert.deepEqual(s.doc('devis_devis', r.id).copie, []);
    assert.equal(auditDe(s, r.id).filter((l) => l.outil === 'modifier_devis_brouillon').length, 2);
    const sans = ok(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1' }));
    assert.deepEqual(s.doc('devis_devis', sans.id).copie, [], 'sans copie donnée : liste vide');
  });

  test('N1 refus sans écriture : adresse invalide, doublon, adresse déjà destinataire, trop d’adresses', async () => {
    const s = await demarrer({ devis: [devisEnregistre('d1', { destinataires: EMAIL, copie: [] })] });
    refuse(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', copie: ['pas-un-mail'] }), /copie invalide/);
    refuse(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', copie: ['a@exemple.test', 'A@exemple.test'] }), /deux fois en copie/);
    refuse(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', destinataires: EMAIL, copie: ['CLIENT@exemple.test'] }), /déjà destinataire/);
    refuse(await s.appeler('biblio', 'modifier_devis_brouillon', { id: 'd1', copie: ['client@exemple.test'] }), /déjà destinataire/);
    refuse(await s.appeler('biblio', 'modifier_devis_brouillon', { id: 'd1', copie: Array.from({ length: 11 }, (_, i) => `x${i}@exemple.test`) }));
    assert.equal(s.collections.devis_devis.length, 1, 'aucun refus ne crée de devis');
    assert.deepEqual(s.doc('devis_devis', 'd1').copie, [], 'ni ne modifie');
    ok(await s.appeler('biblio', 'modifier_devis_brouillon', { id: 'd1', copie: ['c@exemple.test'] }));
    refuse(await s.appeler('biblio', 'modifier_devis_brouillon', { id: 'd1', destinataires: ['c@exemple.test'] }), /déjà destinataire/);
    assert.deepEqual(s.doc('devis_devis', 'd1').destinataires, EMAIL);
  });
});

describe('N2 lister_devis et lire_devis : champs récents, sans prix d’achat ni chemin de stockage', () => {
  test('N2 archive, dates, envois, copie et état du PDF sont lisibles ; le chemin du fichier ne sort jamais', async () => {
    const envoi = { date: new Date('2026-10-04T09:00:00Z'), destinataires: EMAIL, copie: ['cc@exemple.test'] };
    const d = finalise('e1', 'accepte', {
      envoyeLe: new Date('2026-10-04T09:00:00Z'), accepteLe: new Date('2026-10-06T09:00:00Z'), archive: true, archiveLe: new Date('2026-10-07T09:00:00Z'), copie: ['cc@exemple.test'], envois: [envoi, { ...envoi, date: new Date('2026-10-05T09:00:00Z') }],
      pdf: { statut: 'ok', chemin: 'devis/a1/e1/secret-chemin.pdf', sha256: 'abcdef', nom: 'Devis DEV.pdf', genereLe: new Date('2026-10-02T09:00:00Z'), tentatives: 1 },
    });
    const s = await demarrer({ devis: [d] });
    const liste = ok(await s.appeler('lecteur', 'lister_devis', { archives: true }));
    const l = liste.devis[0];
    assert.equal(l.archive, true);
    assert.ok(l.archiveLe);
    assert.ok(l.envoyeLe);
    assert.equal(l.nombreEnvois, 2);
    assert.equal(l.pdf.statut, 'ok');
    assert.equal(l.pdf.nom, 'Devis DEV.pdf');
    assert.doesNotMatch(JSON.stringify(liste), /prixAchat|marge|coefficient|modeMarge|secret-chemin|abcdef/i);
    const lu = ok(await s.appeler('lecteur', 'lire_devis', { id: 'e1' }));
    assert.deepEqual(lu.copie, ['cc@exemple.test']);
    assert.equal(lu.envois.length, 2);
    assert.deepEqual(lu.envois[0].destinataires, EMAIL);
    assert.deepEqual(lu.envois[0].copie, ['cc@exemple.test']);
    assert.ok(lu.envoyeLe && lu.archiveLe);
    assert.equal(lu.pdf.statut, 'ok');
    assert.doesNotMatch(JSON.stringify(lu), /secret-chemin|abcdef/, 'ni chemin de stockage ni empreinte du PDF');
  });

  test('N2 un vieux devis sans copie ni envois rend des listes vides et un PDF nul', async () => {
    const s = await demarrer({ devis: [devisEnregistre('o1')] });
    const lu = ok(await s.appeler('lecteur', 'lire_devis', { id: 'o1' }));
    assert.deepEqual(lu.copie, []);
    assert.deepEqual(lu.envois, []);
    assert.equal(lu.pdf, null);
    assert.equal(lu.archiveLe, null);
  });
});

describe('N3 changer_statut_devis : aperçu puis code, mêmes transitions que l’écran, non restaurable', () => {
  test('N3 marquer_envoye : aperçu sans écriture, mauvais code refusé, puis le statut change et la ligne de journal est écrite', async () => {
    const s = await demarrer({ devis: [finalise('f1', 'en_attente_envoi')] });
    const avant = JSON.stringify(s.doc('devis_devis', 'f1'));
    const a = ok(await s.appeler('code', 'changer_statut_devis', { id: 'f1', action: 'marquer_envoye' }));
    assert.equal(a.apercu, true);
    assert.equal(a.change, false);
    assert.equal(a.statutActuel, 'en_attente_envoi');
    assert.equal(a.statutApres, 'envoye');
    assert.equal(a.totalHT, 96);
    assert.ok(a.code);
    assert.equal(JSON.stringify(s.doc('devis_devis', 'f1')), avant, 'l’aperçu n’écrit rien');
    assert.equal(s.collections.crm_audit.filter((l) => l.docId === 'f1').length, 0);
    refuse(await s.appeler('code', 'changer_statut_devis', { id: 'f1', action: 'marquer_envoye', codeConfirmation: 'FAUX-CODE' }), /code incorrect/);
    const a2 = ok(await s.appeler('code', 'changer_statut_devis', { id: 'f1', action: 'marquer_envoye' }));
    const r = ok(await s.appeler('code', 'changer_statut_devis', { id: 'f1', action: 'marquer_envoye', codeConfirmation: a2.code }));
    assert.equal(r.change, true);
    assert.equal(r.statut, 'envoye');
    const d = s.doc('devis_devis', 'f1');
    assert.equal(d.statut, 'envoye');
    assert.ok(d.envoyeLe);
    const ligne = auditDe(s, 'f1')[0];
    assert.equal(ligne.outil, 'devisChangerStatut');
    assert.equal(ligne.via, 'mcp');
    assert.equal(ligne.operationId, r.operationId);
    refuse(await s.appeler('code', 'changer_statut_devis', { id: 'f1', action: 'marquer_envoye', codeConfirmation: a2.code }), /pas possible/, 'déjà envoyé');
  });

  test('N3 accepter : les autres versions vivantes passent à « Remplacé » (annoncé dans l’aperçu) ; refuser ; refus hors transition sans code', async () => {
    const s = await demarrer({ devis: [
      finalise('v1', 'envoye', { envoyeLe: new Date('2026-10-03T08:00:00Z') }),
      finalise('v2', 'en_attente_envoi', { racineId: 'v1', version: 2 }),
      finalise('r1', 'envoye'),
      finalise('g1', 'en_attente_envoi', { racineId: 'g1' }),
    ] });
    const a = ok(await s.appeler('code', 'changer_statut_devis', { id: 'v1', action: 'accepter' }));
    assert.deepEqual(a.remplaceraAussi.map((v) => v.id), ['v2']);
    assert.match(a.consigne, /Remplacé/);
    const r = ok(await s.appeler('code', 'changer_statut_devis', { id: 'v1', action: 'accepter', codeConfirmation: a.code }));
    assert.equal(r.statut, 'accepte');
    assert.deepEqual(r.remplaces, ['v2']);
    assert.equal(s.doc('devis_devis', 'v2').statut, 'remplace');
    assert.ok(s.doc('devis_devis', 'v1').accepteLe);
    assert.equal(auditDe(s, 'v2')[0].outil, 'devisChangerStatut', 'la version remplacée a sa ligne aussi');
    const b = ok(await s.appeler('code', 'changer_statut_devis', { id: 'r1', action: 'refuser' }));
    ok(await s.appeler('code', 'changer_statut_devis', { id: 'r1', action: 'refuser', codeConfirmation: b.code }));
    assert.equal(s.doc('devis_devis', 'r1').statut, 'refuse');
    assert.ok(s.doc('devis_devis', 'r1').refuseLe);
    const codes = (s.collections.mcp_codes ?? []).length;
    refuse(await s.appeler('code', 'changer_statut_devis', { id: 'g1', action: 'accepter' }), /pas possible pour un devis « Finalisé »/);
    refuse(await s.appeler('code', 'changer_statut_devis', { id: 'v1', action: 'refuser' }), /pas possible/);
    refuse(await s.appeler('code', 'changer_statut_devis', { id: 'inconnu', action: 'accepter' }), /introuvable/i);
    refuse(await s.appeler('code', 'changer_statut_devis', { id: 'g1', action: 'supprimer' }));
    assert.equal((s.collections.mcp_codes ?? []).length, codes, 'aucun code n’est émis pour une transition impossible');
  });

  test('N3 le code d’une action ne vaut pas pour une autre ; le devis modifié entre-temps invalide le code ; droits : Claude Code seulement', async () => {
    const s = await demarrer({ devis: [finalise('f1', 'envoye')] });
    const a = ok(await s.appeler('code', 'changer_statut_devis', { id: 'f1', action: 'accepter' }));
    refuse(await s.appeler('code', 'changer_statut_devis', { id: 'f1', action: 'refuser', codeConfirmation: a.code }), /aucun aperçu/);
    const b = ok(await s.appeler('code', 'changer_statut_devis', { id: 'f1', action: 'accepter' }));
    s.doc('devis_devis', 'f1').objet = 'Changé entre-temps';
    refuse(await s.appeler('code', 'changer_statut_devis', { id: 'f1', action: 'accepter', codeConfirmation: b.code }), /a changé/);
    assert.equal(s.doc('devis_devis', 'f1').statut, 'envoye');
    for (const jeton of ['lecteur', 'biblio']) refuse(await s.appeler(jeton, 'changer_statut_devis', { id: 'f1', action: 'accepter' }));
  });

  test('N3 le changement de statut ne se restaure pas : le message propose la nouvelle version', async () => {
    const s = await demarrer({ devis: [finalise('f1', 'envoye')] });
    const a = ok(await s.appeler('code', 'changer_statut_devis', { id: 'f1', action: 'refuser' }));
    const r = ok(await s.appeler('code', 'changer_statut_devis', { id: 'f1', action: 'refuser', codeConfirmation: a.code }));
    assert.match(r.detail, /nouvelle_version_devis/);
    refuse(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r.operationId, apercu: false }), /nouvelle_version_devis/);
    assert.equal(s.doc('devis_devis', 'f1').statut, 'refuse');
  });
});

describe('N4 nouvelle_version_devis', () => {
  test('N4 depuis un devis envoyé : nouveau brouillon v2 du même numéro, journal écrit, et la restauration le supprime', async () => {
    const s = await demarrer({ devis: [finalise('f1', 'envoye', { envois: [{ date: new Date('2026-10-04T09:00:00Z'), destinataires: EMAIL, copie: [] }], pdf: { statut: 'ok', chemin: 'x.pdf' } })] });
    const r = ok(await s.appeler('biblio', 'nouvelle_version_devis', { id: 'f1' }));
    assert.equal(r.statut, 'brouillon');
    assert.equal(r.version, 2);
    assert.equal(r.numero, 'DEV-2026-10-01-001');
    const d = s.doc('devis_devis', r.id);
    assert.equal(d.racineId, 'f1');
    assert.equal(d.envois, undefined, 'l’historique des envois reste sur la version envoyée');
    assert.equal(d.pdf, undefined);
    assert.equal(s.doc('devis_devis', 'f1').statut, 'envoye', 'la version de départ ne change pas');
    const ligne = auditDe(s, r.id)[0];
    assert.equal(ligne.outil, 'devisNouvelleVersion');
    assert.equal(ligne.action, 'creer');
    assert.equal(ligne.via, 'mcp');
    assert.equal(ligne.acteur, 'hermes-bibliothecaire');
    const apercu = ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r.operationId }));
    assert.equal(apercu.apercu, true);
    assert.equal(s.doc('devis_devis', r.id).version, 2, 'l’aperçu n’écrit rien');
    ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r.operationId, apercu: false }));
    assert.equal(s.doc('devis_devis', r.id), undefined, 'le brouillon est supprimé');
    assert.ok(s.doc('devis_devis', 'f1'));
  });

  test('N4 refusé depuis un brouillon, un devis signé ou inconnu, et quand un brouillon de la racine existe déjà ; le lecteur ne peut pas', async () => {
    const s = await demarrer({ devis: [devisEnregistre('b1'), finalise('a1', 'accepte'), finalise('f1', 'en_attente_envoi')] });
    refuse(await s.appeler('biblio', 'nouvelle_version_devis', { id: 'b1' }), /encore un brouillon/);
    refuse(await s.appeler('biblio', 'nouvelle_version_devis', { id: 'a1' }), /pas de nouvelle version/);
    refuse(await s.appeler('biblio', 'nouvelle_version_devis', { id: 'inconnu' }), /introuvable/i);
    refuse(await s.appeler('lecteur', 'nouvelle_version_devis', { id: 'f1' }));
    ok(await s.appeler('biblio', 'nouvelle_version_devis', { id: 'f1' }));
    refuse(await s.appeler('biblio', 'nouvelle_version_devis', { id: 'f1' }), /brouillon existe déjà/);
    assert.equal(s.collections.devis_devis.length, 4);
  });
});

describe('N5 archiver_devis', () => {
  test('N5 archive un devis signé, le désarchive, refuse le reste ; la restauration défait l’archivage même sur un devis finalisé', async () => {
    const s = await demarrer({ devis: [finalise('s1', 'accepte'), finalise('e1', 'envoye'), devisEnregistre('b1')] });
    refuse(await s.appeler('biblio', 'archiver_devis', { id: 'e1', archive: true }), /signé ou refusé/);
    refuse(await s.appeler('biblio', 'archiver_devis', { id: 'b1', archive: true }), /signé ou refusé/);
    refuse(await s.appeler('biblio', 'archiver_devis', { id: 's1', archive: false }), /pas archivé/);
    refuse(await s.appeler('lecteur', 'archiver_devis', { id: 's1', archive: true }));
    refuse(await s.appeler('biblio', 'archiver_devis', { id: 's1' }));
    const r = ok(await s.appeler('biblio', 'archiver_devis', { id: 's1', archive: true }));
    assert.equal(r.archive, true);
    assert.equal(s.doc('devis_devis', 's1').archive, true);
    assert.ok(s.doc('devis_devis', 's1').archiveLe);
    assert.equal(ok(await s.appeler('lecteur', 'lister_devis', {})).devis.some((d) => d.id === 's1'), false, 'archivé : exclu de la liste');
    refuse(await s.appeler('biblio', 'archiver_devis', { id: 's1', archive: true }), /déjà archivé/);
    const ligne = auditDe(s, 's1')[0];
    assert.equal(ligne.outil, 'devisArchiver');
    assert.equal(ligne.operationId, r.operationId);
    ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r.operationId, apercu: false }));
    assert.equal(s.doc('devis_devis', 's1').archive, false, 'le devis signé redevient non archivé');
    assert.equal(s.doc('devis_devis', 's1').statut, 'accepte');
    const d = ok(await s.appeler('biblio', 'archiver_devis', { id: 's1', archive: true }));
    const des = ok(await s.appeler('biblio', 'archiver_devis', { id: 's1', archive: false }));
    assert.equal(s.doc('devis_devis', 's1').archive, false);
    assert.notEqual(d.operationId, des.operationId);
  });

  test('N5 une restauration de force ne remet pas un ancien statut si le devis a changé de statut depuis', async () => {
    const s = await demarrer({ devis: [finalise('r1', 'refuse')] });
    const r = ok(await s.appeler('biblio', 'archiver_devis', { id: 'r1', archive: true }));
    s.doc('devis_devis', 'r1').statut = 'accepte'; // statut changé depuis (ici : à la main, pour le test)
    refuse(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r.operationId, apercu: false, forcer: true }), /statut de ce devis a changé/);
    assert.equal(s.doc('devis_devis', 'r1').archive, true);
  });
});

describe('N6 enregistrer_envoi_devis : historique des envois, les deux dates sont gardées', () => {
  test('N6 deux envois : envoyeLe garde le premier, envois en compte deux ; refus hors statut « Envoyé » ; restauration du dernier', async () => {
    const s = await demarrer({ devis: [finalise('f1', 'en_attente_envoi'), finalise('e1', 'envoye', { envoyeLe: new Date('2026-10-03T08:00:00Z') })] });
    refuse(await s.appeler('biblio', 'enregistrer_envoi_devis', { id: 'f1', destinataires: EMAIL }), /Marque d.abord le devis comme envoyé/);
    refuse(await s.appeler('biblio', 'enregistrer_envoi_devis', { id: 'e1', destinataires: ['pas-un-mail'] }), /pas valide/);
    refuse(await s.appeler('biblio', 'enregistrer_envoi_devis', { id: 'e1', destinataires: [] }));
    refuse(await s.appeler('lecteur', 'enregistrer_envoi_devis', { id: 'e1', destinataires: EMAIL }));
    assert.equal(s.doc('devis_devis', 'e1').envois, undefined, 'les refus n’écrivent rien');
    const premier = s.doc('devis_devis', 'e1').envoyeLe.getTime();
    const r1 = ok(await s.appeler('biblio', 'enregistrer_envoi_devis', { id: 'e1', destinataires: EMAIL, copie: ['cc@exemple.test', 'CLIENT@exemple.test'] }));
    assert.equal(r1.nombreEnvois, 1);
    assert.deepEqual(r1.dernierEnvoi, { destinataires: EMAIL, copie: ['cc@exemple.test'] }, 'une adresse déjà destinataire est ôtée de la copie');
    s.horloge.t += 86_400_000;
    const r2 = ok(await s.appeler('code', 'enregistrer_envoi_devis', { id: 'e1', destinataires: ['autre@exemple.test'] }));
    assert.equal(r2.nombreEnvois, 2);
    const d = s.doc('devis_devis', 'e1');
    assert.equal(d.envoyeLe.getTime(), premier, 'la date du premier envoi ne bouge pas');
    assert.equal(d.envois.length, 2);
    assert.notEqual(new Date(d.envois[0].date).getTime(), new Date(d.envois[1].date).getTime(), 'chaque envoi garde sa date');
    assert.equal(d.statut, 'envoye');
    const lu = ok(await s.appeler('lecteur', 'lire_devis', { id: 'e1' }));
    assert.equal(lu.envois.length, 2);
    assert.equal(auditDe(s, 'e1').filter((l) => l.outil === 'devisEnregistrerEnvoi').length, 2);
    ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r2.operationId, apercu: false }));
    assert.equal(s.doc('devis_devis', 'e1').envois.length, 1, 'le dernier envoi est retiré, pas le premier');
  });
});

describe('N7 supprimer_devis : brouillon seulement, aperçu puis code, PDF brouillon retiré, restaurable', () => {
  const lien = (id) => `https://chevalier-ia-os.web.app/#/devis/pdf/${id}/brouillon`;

  test('N7 aperçu sans écriture, mauvais code refusé, puis suppression ; le document « PDF brouillon » de l’affaire est retiré, les autres restent ; le devis se restaure', async () => {
    const s = await demarrer({ devis: [devisEnregistre('b1', { destinataires: EMAIL })] });
    s.doc('crm_affaires', 'a1').documents.push({ libelle: 'Devis brouillon – Objet.pdf', url: lien('b1'), ajouteLe: '2026-10-05T08:00:00Z' });
    const documentsAvant = s.doc('crm_affaires', 'a1').documents.length;
    const a = ok(await s.appeler('code', 'supprimer_devis', { id: 'b1' }));
    assert.equal(a.apercu, true);
    assert.equal(a.supprime, false);
    assert.equal(a.documentPdfBrouillonRetire, true);
    assert.equal(a.totalHT, 96);
    assert.ok(a.code);
    assert.ok(s.doc('devis_devis', 'b1'), 'l’aperçu ne supprime rien');
    assert.equal(s.doc('crm_affaires', 'a1').documents.length, documentsAvant);
    refuse(await s.appeler('code', 'supprimer_devis', { id: 'b1', codeConfirmation: 'FAUX-CODE' }), /code incorrect/);
    assert.ok(s.doc('devis_devis', 'b1'));
    const b = ok(await s.appeler('code', 'supprimer_devis', { id: 'b1' }));
    const r = ok(await s.appeler('code', 'supprimer_devis', { id: 'b1', codeConfirmation: b.code }));
    assert.equal(r.supprime, true);
    assert.equal(r.documentAffaireRetire, true);
    assert.equal(r.fichierBrouillon, 'aucun', 'pas de stockage branché dans l’essai');
    assert.equal(s.doc('devis_devis', 'b1'), undefined);
    assert.equal(s.doc('crm_affaires', 'a1').documents.length, documentsAvant - 1);
    assert.ok(s.doc('crm_affaires', 'a1').documents.some((d) => d.url === 'https://exemple.test/devis'), 'les autres documents restent');
    const lignes = s.collections.crm_audit.filter((l) => l.operationId === r.operationId);
    assert.deepEqual(lignes.map((l) => [l.outil, l.collection, l.action]).sort(), [['devisSupprimer', 'crm_affaires', 'modifier'], ['devisSupprimer', 'devis_devis', 'supprimer']]);
    assert.ok(lignes.every((l) => s.doc('crm_audit_avant', l.id)), 'copies avant gardées');
    refuse(await s.appeler('code', 'supprimer_devis', { id: 'b1', codeConfirmation: b.code }), /introuvable/i, 'le devis n’existe plus');
    ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r.operationId, apercu: false }));
    assert.equal(s.doc('devis_devis', 'b1').statut, 'brouillon', 'le brouillon est de retour avec le même identifiant');
    assert.equal(s.doc('crm_affaires', 'a1').documents.length, documentsAvant, 'et le document de l’affaire aussi');
  });

  test('N7 un devis finalisé ne se supprime pas (aucun code émis) ; droits : Claude Code seulement ; un devis modifié après l’aperçu invalide le code', async () => {
    const s = await demarrer({ devis: [finalise('f1', 'en_attente_envoi'), devisEnregistre('b1')] });
    const codes = (s.collections.mcp_codes ?? []).length;
    refuse(await s.appeler('code', 'supprimer_devis', { id: 'f1' }), /Seul un brouillon/);
    refuse(await s.appeler('code', 'supprimer_devis', { id: 'inconnu' }), /introuvable/i);
    for (const jeton of ['lecteur', 'biblio']) refuse(await s.appeler(jeton, 'supprimer_devis', { id: 'b1' }));
    assert.equal((s.collections.mcp_codes ?? []).length, codes);
    const a = ok(await s.appeler('code', 'supprimer_devis', { id: 'b1' }));
    ok(await s.appeler('biblio', 'modifier_devis_brouillon', { id: 'b1', objet: 'Changé après l’aperçu' }));
    refuse(await s.appeler('code', 'supprimer_devis', { id: 'b1', codeConfirmation: a.code }), /a changé/);
    assert.ok(s.doc('devis_devis', 'b1'));
    assert.ok(s.doc('devis_devis', 'f1'));
  });

  test('N7 le plafond de suppressions du jeton s’applique, et le devis reste', async () => {
    const s = await demarrer({ devis: [devisEnregistre('b1'), devisEnregistre('b2')], jetonsExtra: { code: { limites: { suppressionsParJour: 1 } } } });
    const a1 = ok(await s.appeler('code', 'supprimer_devis', { id: 'b1' }));
    ok(await s.appeler('code', 'supprimer_devis', { id: 'b1', codeConfirmation: a1.code }));
    const a2 = ok(await s.appeler('code', 'supprimer_devis', { id: 'b2' }));
    refuse(await s.appeler('code', 'supprimer_devis', { id: 'b2', codeConfirmation: a2.code }), /Plafond atteint/);
    assert.ok(s.doc('devis_devis', 'b2'));
  });

  test('N7 le fichier PDF brouillon est effacé du stockage quand il est branché, et un échec du stockage ne bloque pas', async () => {
    const { supprimer } = await import('../functions/src/coeur/devis.js');
    for (const [panne, attendu] of [[false, 'supprime'], [true, 'echec']]) {
      const s = await demarrer({ devis: [devisEnregistre('b1')] });
      const appels = [];
      const stockage = { supprimerBrouillon: async (p) => { appels.push(p); if (panne) throw new Error('Stockage : panne'); } };
      const avertis = [];
      const r = await supprimer({ donnees: creerAccesMemoire(s.collections), ctx: { acteur: 'x', jeton: 'x', via: 'mcp', maintenant: MAINTENANT }, devisId: 'b1', stockage, espace: '', avertir: (a) => avertis.push(a) });
      assert.equal(r.fichierBrouillon, attendu);
      assert.deepEqual(appels, [{ espace: '', affaireId: 'a1', devisId: 'b1' }]);
      assert.equal(s.doc('devis_devis', 'b1'), undefined, 'le devis est supprimé même si le fichier ne l’est pas');
      assert.equal(avertis.length, panne ? 1 : 0);
    }
  });
});

describe('N8 journal et restauration des devis : couverture', () => {
  test('N8 lire_audit retrouve les opérations sur un devis (collection devis_devis) ; création, modification et nouvelle version se restaurent', async () => {
    const s = await demarrer({ devis: [finalise('e1', 'envoye')] });
    const nv = ok(await s.appeler('biblio', 'nouvelle_version_devis', { id: 'e1' }));
    const mod = ok(await s.appeler('biblio', 'modifier_devis_brouillon', { id: nv.id, objet: 'V2' }));
    const audit = ok(await s.appeler('lecteur', 'lire_audit', { docId: nv.id }));
    assert.deepEqual(audit.lignes.map((l) => l.outil).sort(), ['devisNouvelleVersion', 'modifier_devis_brouillon']);
    assert.ok(audit.lignes.every((l) => l.collection === 'devis_devis'));
    ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: mod.operationId, apercu: false }));
    assert.notEqual(s.doc('devis_devis', nv.id).objet, 'V2', 'la modification est défaite');
    ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: nv.operationId, apercu: false }));
    assert.equal(s.doc('devis_devis', nv.id), undefined);
  });
});

describe('N9 lire_reglages_devis et journal du bordereau', () => {
  test('N9 le lecteur lit les réglages du module Devis et les familles d’articles ; sans document, ce sont les valeurs par défaut', async () => {
    const s = await demarrer();
    const r = ok(await s.appeler('lecteur', 'lire_reglages_devis', {}));
    assert.equal(r.reglages.marge, 20);
    assert.equal(r.reglages.modeMarge, 'majoration');
    assert.equal(r.reglages.regimeTva, 'assujetti');
    assert.ok(r.reglages.dureeValiditeJours > 0);
    assert.ok(Array.isArray(r.familles) && r.familles.length >= 7, 'au moins les sept familles de départ');
    assert.ok(r.familles.every((f) => f.id && f.nom));
    s.collections.devis_parametres.length = 0;
    const defaut = ok(await s.appeler('lecteur', 'lire_reglages_devis', {}));
    assert.equal(typeof defaut.reglages.marge, 'number', 'document absent : valeurs par défaut');
  });

  test('N9 un article créé par l’assistant a sa ligne de journal (devis_articles) et se restaure', async () => {
    const s = await demarrer();
    const a = ok(await s.appeler('biblio', 'creer_article', { libelle: 'Peinture', prixAchat: 12, unite: 'm²', code: 'PEI' }));
    const ligne = s.collections.crm_audit.find((l) => l.docId === a.id);
    assert.equal(ligne.collection, 'devis_articles');
    assert.equal(ligne.outil, 'creer_article');
    const audit = ok(await s.appeler('lecteur', 'lire_audit', { docId: a.id }));
    assert.equal(audit.lignes.length, 1);
    ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: a.operationId ?? ligne.operationId, apercu: false }));
    assert.equal(s.doc('devis_articles', a.id), undefined);
  });
});
