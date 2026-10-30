// Outil MCP modifier_lignes_devis (30/10/2026) : plusieurs opérations sur les lignes et sections d'un brouillon, par numéro, tout ou rien, un seul operationId.
// De bout en bout par le protocole MCP, sur des données fictives en mémoire. M2 quantité par numéro ; M3 numéros lus avant l'appel ; M4 tout ou rien ; M5 attendu ; M6 changement important ;
// M7 devis finalisé et lecteur ; M8 un seul operationId ; S sous-sections ; A ajouter ; R réponse sans prix d'achat ni marge ; V cas vides.
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

/** Un devis déjà enregistré (marge 20 % : prix de vente = prix d'achat × 1,2). */
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

const lg = (id, libelle, quantite, prixAchat, extra = {}) => ({ id, libelle, unite: 'u', quantite, prixAchat, ...extra });
/** 1 Cuisine (1.1 Prise double ×3 à 9,60 €, 1.2 Plan de travail ×3,5 à 120 €, 1.3 Évier ×1 à 60 €), 2 Salle de bain (2.1 Carrelage ×10 à 60 €). */
const devisDeBase = (extra = {}) => devisEnregistre('d1', {
  sections: [
    { id: 's1', titre: 'Cuisine', lignes: [lg('l11', 'Prise double', 3, 8), lg('l12', 'Plan de travail', 3.5, 100), lg('l13', 'Évier', 1, 50)] },
    { id: 's2', titre: 'Salle de bain', lignes: [lg('l21', 'Carrelage', 10, 50)] },
  ], ...extra,
});
/** 1 Cuisine (1.1 Prise double, 1.2 sous-section Plomberie avec 1.2.1 Siphon), 2 Salle de bain. */
const devisAvecSousSection = () => devisEnregistre('d2', {
  sections: [
    { id: 's1', titre: 'Cuisine', lignes: [lg('l11', 'Prise double', 3, 8)] },
    { id: 's1b', titre: 'Plomberie', niveau: 2, lignes: [lg('l1b', 'Siphon', 1, 10)] },
    { id: 's2', titre: 'Salle de bain', lignes: [lg('l21', 'Carrelage', 10, 50)] },
  ],
});
const lignesDe = (s, id = 'd1') => s.doc('devis_devis', id).sections.map((x) => [x.id, x.lignes.map((l) => l.id)]);
const op = (action, extra = {}) => ({ action, ...extra });
const modifier = (s, operations, id = 'd1', jeton = 'biblio') => s.appeler(jeton, 'modifier_lignes_devis', { id, operations });
const compterAudit = (s) => (s.collections.crm_audit ?? []).length;

describe('M2 modifier une quantité par son numéro', () => {
  test('M2 « 1.2 » change la quantité de cette ligne seulement, qui garde son identifiant ; la réponse donne avant, après, numéros et totaux', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    const r = ok(await modifier(s, [op('modifier', { ligne: '1.2', attendu: 'Plan de travail', quantite: 4 })]));
    assert.equal(s.doc('devis_devis', 'd1').sections[0].lignes[1].quantite, 4);
    assert.equal(s.doc('devis_devis', 'd1').sections[0].lignes[1].id, 'l12');
    assert.deepEqual(s.doc('devis_devis', 'd1').sections[0].lignes.map((l) => l.quantite), [3, 4, 1]);
    assert.equal(s.doc('devis_devis', 'd1').sections[1].lignes[0].quantite, 10);
    const o = r.operations[0];
    assert.equal(o.action, 'modifier');
    assert.deepEqual(o.ligne, { id: 'l12', numeroAvant: '1.2', numeroApres: '1.2', libelle: 'Plan de travail' });
    assert.deepEqual(o.avant, { libelle: 'Plan de travail', quantite: 3.5, prixVente: 120 });
    assert.deepEqual(o.apres, { libelle: 'Plan de travail', quantite: 4, prixVente: 120 });
    assert.equal(r.totalHT, 28.8 + 480 + 60 + 600);
    assert.match(r.phraseTotaux, /^Total hors taxes : 1\s168,80\s€\. Total TTC : /);
    assert.deepEqual(r.sections[0].lignes.map((l) => [l.numero, l.quantite]), [['1.1', '3 u'], ['1.2', '4 u'], ['1.3', '1 u']]);
  });
  test('M2 prixVente (euros hors taxes) règle le prix de la ligne ; remplacerPar change l’article en gardant la quantité et l’identifiant de la ligne', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    const ids = await articlesDeBase(s);
    const r = ok(await modifier(s, [
      op('modifier', { ligne: '1.1', attendu: 'Prise double', prixVente: 10 }),
      op('modifier', { ligne: '2.1', attendu: 'Carrelage', remplacerPar: { articleId: ids.b } }),
    ]));
    assert.equal(r.operations[0].apres.prixVente, 10);
    assert.equal(r.operations[0].changementImportant, false, '9,60 -> 10 : moins de 20 %');
    const l = s.doc('devis_devis', 'd1').sections[1].lignes[0];
    assert.equal(l.id, 'l21');
    assert.equal(l.libelle, 'Plinthe');
    assert.equal(l.quantite, 10);
    assert.equal(r.operations[1].apres.prixVente, 36);
  });
});

describe('M3 numéros lus avant l’appel', () => {
  test('M3 « supprime 1.2 et 1.3 » retire les deux lignes vues, même si la première suppression décale la seconde ; ajouter dans le même appel garde la place', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    const ids = await articlesDeBase(s);
    const r = ok(await modifier(s, [
      op('supprimer', { ligne: '1.2', attendu: 'Plan de travail' }),
      op('supprimer', { ligne: '1.3', attendu: 'Évier' }),
      op('modifier', { ligne: '2.1', attendu: 'Carrelage', quantite: 12 }),
      op('ajouter', { section: '1', reference: 'pli', quantite: 2, apres: '1.1' }),
    ]));
    assert.deepEqual(lignesDe(s)[0][1].length, 2);
    assert.deepEqual(lignesDe(s)[0][1].filter((x) => x !== 'l11').length, 1, 'la ligne ajoutée après 1.1');
    assert.equal(lignesDe(s)[0][1][0], 'l11');
    assert.ok(!lignesDe(s)[0][1].includes('l12') && !lignesDe(s)[0][1].includes('l13'));
    assert.deepEqual(r.operations.map((o) => [o.action, o.ligne.numeroAvant, o.ligne.numeroApres]), [['supprimer', '1.2', null], ['supprimer', '1.3', null], ['modifier', '2.1', '2.1'], ['ajouter', null, '1.2']]);
    assert.ok(ids.b);
  });
});

describe('M4 tout ou rien', () => {
  test('M4 une opération fausse parmi cinq : rien n’est écrit (ni devis ni journal), et le message dit laquelle', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    const avant = structuredClone(s.doc('devis_devis', 'd1'));
    const audit = compterAudit(s);
    const r = await modifier(s, [
      op('modifier', { ligne: '1.1', attendu: 'Prise double', quantite: 9 }),
      op('supprimer', { ligne: '1.3', attendu: 'Évier' }),
      op('renommerSection', { section: '2', titre: 'Salle d’eau' }),
      op('ajouterSection', { titre: 'Extérieur' }),
      op('modifier', { ligne: '1.9', attendu: 'Rien', quantite: 1 }),
    ]);
    refuse(r, /Opération 5.*Le devis n'a pas de ligne 1\.9.*Rien n'a été écrit/);
    assert.deepEqual(s.doc('devis_devis', 'd1'), avant);
    assert.equal(compterAudit(s), audit);
  });
  test('M4 un article inconnu ou une quantité impossible dans la dernière opération n’écrit rien non plus', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    const avant = structuredClone(s.doc('devis_devis', 'd1'));
    refuse(await modifier(s, [op('supprimer', { ligne: '1.1', attendu: 'Prise double' }), op('ajouter', { section: '1', reference: 'inconnue', quantite: 1 })]), /Opération 2.*Aucun article actif/);
    refuse(await modifier(s, [op('supprimer', { ligne: '1.1', attendu: 'Prise double' }), op('modifier', { ligne: '1.2', attendu: 'Plan de travail', quantite: 0 })]), /positive|supérieur|0/i);
    assert.deepEqual(s.doc('devis_devis', 'd1'), avant);
  });
  test('M4 deux opérations sur la même ligne se suivent ; toucher une ligne déjà supprimée par l’appel est refusé', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    refuse(await modifier(s, [op('supprimer', { ligne: '1.1', attendu: 'Prise double' }), op('modifier', { ligne: '1.1', attendu: 'Prise double', quantite: 2 })]), /Opération 2.*n'existe plus à ce stade/);
    assert.equal(s.doc('devis_devis', 'd1').sections[0].lignes.length, 3);
    ok(await modifier(s, [op('modifier', { ligne: '1.1', attendu: 'Prise double', quantite: 4 }), op('modifier', { ligne: '1.1', attendu: 'Prise double', prixVente: 11 })]));
    const l = s.doc('devis_devis', 'd1').sections[0].lignes[0];
    assert.equal(l.quantite, 4);
  });
});

describe('M5 la garde « attendu »', () => {
  test('M5 un libellé différent : refus, rien d’écrit, la ligne actuelle est rappelée ; une paraphrase proche (pluriel, casse) passe ; attendu absent : refus', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    const avant = structuredClone(s.doc('devis_devis', 'd1'));
    refuse(await modifier(s, [op('supprimer', { ligne: '1.3', attendu: 'Lavabo' })]), /La ligne 1\.3 est maintenant « Évier », pas « Lavabo »/);
    refuse(await modifier(s, [op('supprimer', { ligne: '1.3' })]), /recopie ce que tu as lu \(attendu\)/);
    assert.deepEqual(s.doc('devis_devis', 'd1'), avant);
    ok(await modifier(s, [op('modifier', { ligne: '1.1', attendu: 'prises doubles', quantite: 5 })]));
    assert.equal(s.doc('devis_devis', 'd1').sections[0].lignes[0].quantite, 5);
  });
  test('M5 « 1,2 » et « 1-2 » visent la même ligne ; « 12 » est refusé avec l’aide à la saisie ; une section ne passe pas pour une ligne', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    ok(await modifier(s, [op('modifier', { ligne: '1,2', attendu: 'Plan de travail', quantite: 1 })]));
    ok(await modifier(s, [op('modifier', { ligne: '1-2', attendu: 'Plan de travail', quantite: 2 })]));
    assert.equal(s.doc('devis_devis', 'd1').sections[0].lignes[1].quantite, 2);
    refuse(await modifier(s, [op('modifier', { ligne: '12', attendu: 'Plan de travail', quantite: 1 })]), /pas de section 12/);
    refuse(await modifier(s, [op('modifier', { ligne: '1', attendu: 'Cuisine', quantite: 1 })]), /désigne une section/);
  });
});

describe('M6 changementImportant calculé par le serveur', () => {
  test('M6 suppression, quantité ×2 ou ÷2, prix ±20 % : vrai ; quantité ×1,5, prix +10 % : faux ; total du devis ±20 % : clé de premier niveau', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    const r = ok(await modifier(s, [
      op('modifier', { ligne: '1.1', attendu: 'Prise double', quantite: 6 }), // ×2
      op('modifier', { ligne: '1.2', attendu: 'Plan de travail', quantite: 1.75 }), // ÷2
      op('modifier', { ligne: '1.3', attendu: 'Évier', quantite: 1.5 }), // ×1,5
      op('modifier', { ligne: '2.1', attendu: 'Carrelage', prixVente: 66 }), // +10 %
    ]));
    assert.deepEqual(r.operations.map((o) => o.changementImportant), [true, true, false, false]);
    const r2 = ok(await modifier(s, [op('modifier', { ligne: '2.1', attendu: 'Carrelage', prixVente: 79.2 }), op('supprimer', { ligne: '1.3', attendu: 'Évier' })]));
    assert.deepEqual(r2.operations.map((o) => o.changementImportant), [true, true], 'prix +20 % exactement (66 -> 79,20), suppression');
    assert.equal(r2.changementImportant, true);
    assert.match(r2.consigne, /redis à l'utilisateur/);
  });
  test('M6 le total du devis qui bouge de 20 % lève la clé de premier niveau sans qu’aucune ligne ne soit « importante » ; un petit changement ne lève rien', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    const ids = await articlesDeBase(s);
    const gros = ok(await modifier(s, [op('ajouter', { section: '2', articleId: ids.a, quantite: 6 })])); // +360 € sur 1168,80 € hors taxes
    assert.equal(gros.operations[0].changementImportant, false);
    assert.equal(gros.totalChangementImportant, true);
    assert.equal(gros.changementImportant, true);
    const petit = ok(await modifier(s, [op('modifier', { ligne: '1.1', attendu: 'Prise double', quantite: 4 })]));
    assert.equal(petit.totalChangementImportant, false);
    assert.equal(petit.changementImportant, false);
    assert.equal(petit.consigne, undefined);
  });
});

describe('M7 droits et statut', () => {
  test('M7 un devis finalisé est refusé (nouvelle version d’abord) ; un lecteur ne peut ni voir ni appeler l’outil', async () => {
    const s = await demarrer({ devis: [devisDeBase({ statut: 'en_attente_envoi', numero: 'DEV-2026-10-01-001' })] });
    refuse(await modifier(s, [op('supprimer', { ligne: '1.1', attendu: 'Prise double' })]), /n’est plus un brouillon/);
    refuse(await modifier(s, [op('supprimer', { ligne: '1.1', attendu: 'Prise double' })], 'd1', 'lecteur'));
    assert.equal(s.doc('devis_devis', 'd1').sections[0].lignes.length, 3);
    refuse(await modifier(s, [], 'inconnu'), /Aucune opération/);
  });
  test('M7 le profil claude-code peut aussi l’appeler ; les deux profils d’écriture le déclarent, le lecteur non', async () => {
    const { OUTILS, annotationsDe } = await import('../functions/src/mcp/outils/index.js');
    const o = OUTILS.find((x) => x.nom === 'modifier_lignes_devis');
    assert.deepEqual(o.profils, ['bibliothecaire', 'claude-code']);
    assert.equal(annotationsDe(o).destructiveHint, true);
    assert.equal(annotationsDe(o).readOnlyHint, false);
    const s = await demarrer({ devis: [devisDeBase()] });
    ok(await modifier(s, [op('supprimer', { ligne: '1.3', attendu: 'Évier' })], 'd1', 'code'));
  });
});

describe('M8 un seul operationId', () => {
  test('M8 plusieurs opérations = une opération du journal (une ligne de devis), lisible par lire_audit ; restaurer_depuis_audit remet tout', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    const avant = structuredClone(s.doc('devis_devis', 'd1'));
    const r = ok(await modifier(s, [
      op('supprimer', { ligne: '1.3', attendu: 'Évier' }), op('modifier', { ligne: '1.1', attendu: 'Prise double', quantite: 6 }), op('renommerSection', { section: '2', titre: 'Salle d’eau' }),
    ]));
    assert.match(r.operationId, /./);
    const audit = ok(await s.appeler('lecteur', 'lire_audit', { docId: 'd1' }));
    const lignes = audit.lignes.filter((l) => l.operationId === r.operationId);
    assert.equal(lignes.length, 1);
    assert.equal(lignes[0].outil, 'modifier_lignes_devis');
    assert.equal(lignes[0].acteur, 'hermes-bibliothecaire');
    ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r.operationId, apercu: false }));
    assert.deepEqual(s.doc('devis_devis', 'd1').sections, avant.sections);
  });
});

describe('S sous-sections faites à l’écran', () => {
  test('S ajouter dans une section de niveau 1 qui a des sous-sections pose la ligne avant la première sous-section ; le niveau est préservé', async () => {
    const s = await demarrer({ devis: [devisAvecSousSection()] });
    const ids = await articlesDeBase(s);
    const r = ok(await modifier(s, [op('ajouter', { section: '1', articleId: ids.a, quantite: 2 })], 'd2'));
    const d = s.doc('devis_devis', 'd2');
    assert.deepEqual(d.sections.map((x) => [x.id, x.niveau ?? 1, x.lignes.length]), [['s1', 1, 2], ['s1b', 2, 1], ['s2', 1, 1]]);
    assert.deepEqual(r.sections.map((x) => x.numero), ['1', '1.3', '2'], 'les lignes de la section 1 passent avant la sous-section (1.1, 1.2), qui devient 1.3');
    assert.equal(r.operations[0].ligne.numeroApres, '1.2');
  });
  test('S supprimerSection d’une section qui a des sous-sections : refusée, avec le renvoi à l’écran ; ajouterSection entre une section et ses sous-sections : refusé', async () => {
    const s = await demarrer({ devis: [devisAvecSousSection()] });
    const avant = structuredClone(s.doc('devis_devis', 'd2'));
    refuse(await modifier(s, [op('supprimerSection', { section: '1', attendu: 'Cuisine' })], 'd2'), /a des sous-sections.*à l'écran/);
    refuse(await modifier(s, [op('ajouterSection', { titre: 'Électricité', apres: '1' })], 'd2'), /sous-sections.*à l'écran/);
    assert.deepEqual(s.doc('devis_devis', 'd2'), avant);
  });
  test('S une section ajoutée est de niveau 1 (pas de champ niveau), à la fin ou après une section sans sous-section ; renommer une sous-section est autorisé ; supprimer une sous-section aussi', async () => {
    const s = await demarrer({ devis: [devisAvecSousSection()] });
    const r = ok(await modifier(s, [op('ajouterSection', { titre: 'Extérieur' }), op('ajouterSection', { titre: 'Garage', apres: '2' }), op('renommerSection', { section: '1.2', titre: 'Eau' })], 'd2'));
    const d = s.doc('devis_devis', 'd2');
    assert.deepEqual(d.sections.map((x) => x.titre), ['Cuisine', 'Eau', 'Salle de bain', 'Garage', 'Extérieur']);
    assert.ok(d.sections.every((x) => !('niveau' in x && x.id !== 's1b')), 'aucune section créée n’écrit de niveau');
    assert.equal(d.sections[1].niveau, 2);
    assert.deepEqual(r.operations.map((o) => o.ligne.numeroApres), ['4', '3', '1.2']);
    ok(await modifier(s, [op('supprimerSection', { section: '1.2', attendu: 'Eau' })], 'd2'));
    assert.equal(s.doc('devis_devis', 'd2').sections.length, 4);
  });
});

describe('A ajouter, supprimer une section', () => {
  test('A ajouter après une ligne précise, avec un prix de vente ; la ligne est copiée de l’article ; une ligne d’une autre section pour apres est refusée', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    const ids = await articlesDeBase(s);
    const r = ok(await modifier(s, [op('ajouter', { section: '1', articleId: ids.b, quantite: 4, prixVente: 40, apres: '1.1' })]));
    const l = s.doc('devis_devis', 'd1').sections[0].lignes[1];
    assert.equal(l.libelle, 'Plinthe');
    assert.equal(l.articleId, ids.b);
    assert.equal(r.operations[0].apres.prixVente, 40);
    assert.equal(r.operations[0].ligne.numeroApres, '1.2');
    assert.equal(r.operations[0].avant, null);
    refuse(await modifier(s, [op('ajouter', { section: '1', articleId: ids.b, quantite: 1, apres: '2.1' })]), /n'est pas dans la section 1/);
    refuse(await modifier(s, [op('ajouter', { section: 'Cuisine', articleId: ids.b, quantite: 1 })]), /Je n'ai pas compris « Cuisine »/);
  });
  test('A supprimerSection retire la section ET ses lignes, marquée changement important, avec le nombre de lignes', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    const r = ok(await modifier(s, [op('supprimerSection', { section: '1', attendu: 'Cuisine' })]));
    assert.deepEqual(s.doc('devis_devis', 'd1').sections.map((x) => x.id), ['s2']);
    assert.equal(r.operations[0].changementImportant, true);
    assert.equal(r.operations[0].lignesSupprimees, 3);
    assert.deepEqual(r.operations[0].ligne, { id: 's1', numeroAvant: '1', numeroApres: null, libelle: 'Cuisine' });
    assert.equal(r.sections[0].numero, '1', 'Salle de bain devient la section 1');
  });
});

describe('R la réponse ne dit jamais le prix d’achat ni la marge', () => {
  test('R aucune clé ni valeur de marge, de coefficient ou de prix d’achat dans la réponse (verrou comme N2) ; le mode de marge non plus', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    const r = ok(await modifier(s, [op('modifier', { ligne: '1.1', attendu: 'Prise double', quantite: 6, prixVente: 10 }), op('supprimer', { ligne: '1.3', attendu: 'Évier' })]));
    assert.doesNotMatch(JSON.stringify(r), /prixAchat|marge|coefficient|modeMarge|majoration/i);
    const { OUTILS_ECRITURE } = await import('../functions/src/mcp/outils/ecriture.js');
    assert.doesNotMatch(OUTILS_ECRITURE.find((o) => o.nom === 'modifier_lignes_devis').description, /marge|prix d'achat|prixAchat|majoration/i);
    for (const o of r.operations) assert.deepEqual(Object.keys(o.avant ?? { libelle: 1, quantite: 1, prixVente: 1 }).sort(), ['libelle', 'prixVente', 'quantite']);
  });
});

describe('V cas vide et cas d’erreur', () => {
  test('V liste vide, 31 opérations, devis inconnu et devis sans ligne : refusés avec un message clair, rien d’écrit', async () => {
    const s = await demarrer({ devis: [devisDeBase(), devisEnregistre('vide', { sections: [] })] });
    refuse(await modifier(s, []), /Aucune opération/);
    const trente = Array.from({ length: 30 }, () => op('renommerSection', { section: '1', titre: 'Cuisine' }));
    ok(await modifier(s, trente));
    refuse(await modifier(s, [...trente, op('renommerSection', { section: '1', titre: 'X' })]), /Too big.*<=30 items|30 au plus/);
    refuse(await modifier(s, [op('supprimer', { ligne: '1.1', attendu: 'x' })], 'inconnu'), /Devis introuvable/);
    refuse(await modifier(s, [op('supprimer', { ligne: '1.2', attendu: 'x' })], 'vide'), /Le devis est vide|n'a pas de ligne 1\.2/);
  });
});

describe('Cas limites relus par Fable', () => {
  test('une section sans titre (tête d’un devis fait de lignes à plat) se supprime et se renomme par son numéro ; une section titrée garde sa garde', async () => {
    const s = await demarrer({ devis: [devisEnregistre('d3', { sections: [{ id: 'sec-debut', titre: '', lignes: [lg('la', 'Prise', 1, 8)] }, { id: 's2', titre: 'Cuisine', lignes: [] }] })] });
    refuse(await modifier(s, [op('supprimerSection', { section: '2', attendu: 'Salon' })], 'd3'), /maintenant « Cuisine »/);
    ok(await modifier(s, [op('supprimerSection', { section: '1', attendu: '(sans titre)' })], 'd3'));
    assert.deepEqual(s.doc('devis_devis', 'd3').sections.map((x) => x.id), ['s2']);
  });
  test('deux ajouts « après 1.1 » dans un même appel se suivent dans l’ordre donné ; renommerSection accepte attendu et le vérifie', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    const ids = await articlesDeBase(s);
    ok(await modifier(s, [op('ajouter', { section: '1', articleId: ids.a, quantite: 1, apres: '1.1' }), op('ajouter', { section: '1', articleId: ids.b, quantite: 2, apres: '1.1' })]));
    assert.deepEqual(s.doc('devis_devis', 'd1').sections[0].lignes.map((l) => l.libelle), ['Prise double', 'Carrelage', 'Plinthe', 'Plan de travail', 'Évier']);
    refuse(await modifier(s, [op('renommerSection', { section: '2', attendu: 'Cuisine', titre: 'X' })]), /maintenant « Salle de bain »/);
    ok(await modifier(s, [op('renommerSection', { section: '2', attendu: 'Salle de bain', titre: 'Salle d’eau' })]));
  });
});
