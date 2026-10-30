// Outil MCP annuler_derniere_modification_devis (30/10/2026, cadrage-devis-fluide.md 4.1) : défait la dernière modification d'un brouillon, UN seul niveau,
// avec la logique de restaurer_depuis_audit, et répond en une phrase ce qui a été remis. De bout en bout par le protocole MCP, sur des données fictives en mémoire.
// N1 lignes ; N2 en-tête ; N3 écran ; N4 changé depuis ; N5 pas brouillon ; N6 rien à annuler ; N7 un seul niveau ; N8 noms dans le journal ; N9 devis créé ;
// N10 profils ; N11 aucune fuite de prix d'achat ni de marge ; N12 aperçu/annulation de la phrase avec prix ; N13 annulations successives de modifications successives.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { creerGestionnaire } from '../functions/src/mcp/gestionnaire.js';
import { empreinte, creerMagasin } from '../functions/src/securite/jetons.js';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { creerLimiteur } from '../functions/src/securite/limites.js';
import { collections as base, MAINTENANT } from './_donnees-essai.js';

const JETONS = { lecteur: `cia_${'L'.repeat(43)}`, biblio: `cia_${'H'.repeat(43)}`, code: `cia_${'C'.repeat(43)}` };
const entree = (jeton, nom, profil) => ({ jeton: nom, acteur: nom, profil, empreinte: empreinte(jeton), actif: true });
const EMAIL = ['client@exemple.test'];

const arrets = [];
afterEach(async () => { while (arrets.length) await arrets.pop()(); });

const lg = (id, libelle, quantite, prixAchat, extra = {}) => ({ id, libelle, unite: 'u', quantite, prixAchat, ...extra });
/** 1 Cuisine (1.1 Prise double ×3 à 9,60 €, 1.2 Plan de travail ×3,5 à 120 €, 1.3 Évier ×1 à 60 €), 2 Salle de bain (2.1 Carrelage ×10 à 60 €). Marge 20 % : prix de vente = prix d'achat × 1,2. */
const devisDeBase = (extra = {}) => ({
  id: 'd1', racineId: 'd1', version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', organisationId: 'org1', personneId: null, objet: 'Cuisine et salle de bain', destinataires: EMAIL,
  modeMarge: 'majoration', marge: 20, tauxTvaDefaut: 20, regimeTva: 'assujetti', archive: false, creeLe: new Date('2026-10-01T08:00:00Z'), expireLe: '2026-12-30',
  sections: [
    { id: 's1', titre: 'Cuisine', lignes: [lg('l11', 'Prise double', 3, 8), lg('l12', 'Plan de travail', 3.5, 100), lg('l13', 'Évier', 1, 50)] },
    { id: 's2', titre: 'Salle de bain', lignes: [lg('l21', 'Carrelage', 10, 50)] },
  ], ...extra,
});

async function demarrer({ devis = [] } = {}) {
  const collections = structuredClone(base);
  Object.assign(collections, { devis_articles: [], devis_devis: devis.map((d) => structuredClone(d)), devis_compteurs: [], devis_parametres: [{ id: 'reglages', regimeTva: 'assujetti', marge: 20, modeMarge: 'majoration' }] });
  const donnees = creerAccesMemoire(collections);
  const horloge = { t: MAINTENANT.getTime() };
  const secret = JSON.stringify([entree(JETONS.lecteur, 'lecteur-essai', 'lecteur'), entree(JETONS.biblio, 'hermes-bibliothecaire', 'bibliothecaire'), entree(JETONS.code, 'claude-code-jerome', 'claude-code')]);
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
    horloge.t += 1000; // chaque appel a sa propre heure : le journal se range dans l'ordre des appels
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
const refuse = (r, motif) => { assert.equal(r.isError, true, `devait être refusé : ${r.texte}`); if (motif) assert.match(r.texte, motif); return r.texte; };

const op = (action, extra = {}) => ({ action, ...extra });
const modifier = (s, operations, id = 'd1', jeton = 'biblio') => s.appeler(jeton, 'modifier_lignes_devis', { id, operations });
const annuler = (s, id = 'd1', jeton = 'biblio') => s.appeler(jeton, 'annuler_derniere_modification_devis', { id });
const quantites = (s, id = 'd1') => s.doc('devis_devis', id).sections.flatMap((x) => x.lignes.map((l) => l.quantite));
const journalDe = (s, id = 'd1') => (s.collections.crm_audit ?? []).filter((l) => l.docId === id);

/** Une modification faite à l'écran : ligne de journal et copie « avant », puis le document change (comme le fait modifierBrouillonDevis). */
function modifierALEcran(s, id, patch) {
  const avant = structuredClone(s.doc('devis_devis', id));
  const { id: _i, ...sansId } = avant;
  const apres = { ...sansId, ...patch };
  s.horloge.t += 1000;
  const ligne = {
    id: `ecran-${s.horloge.t}`, operationId: `op-ecran-${s.horloge.t}`, ordre: 1, date: new Date(s.horloge.t), acteur: 'jerome@exemple.test', jeton: 'ecran', via: 'ecran', outil: 'modifierBrouillonDevis',
    collection: 'devis_devis', docId: id, action: 'modifier', statut: 'succes', champsModifies: Object.keys(patch), parametresRecus: [],
  };
  (s.collections.crm_audit ??= []).push(ligne);
  (s.collections.crm_audit_avant ??= []).push({ id: ligne.id, operationId: ligne.operationId, collection: 'devis_devis', docId: id, avant: sansId, apres, expireAt: new Date(s.horloge.t + 86_400_000) });
  Object.assign(s.doc('devis_devis', id), patch);
}

describe('N1 annuler une modification de lignes', () => {
  test('N1 la quantité d’une ligne revient à ce qu’elle était, la phrase le dit, et l’annulation s’écrit au journal sans rien effacer', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    ok(await modifier(s, [op('modifier', { ligne: '1.2', attendu: 'Plan de travail', quantite: 4 })]));
    assert.deepEqual(quantites(s), [3, 4, 1, 10]);
    const avantJournal = journalDe(s).length;
    const r = ok(await annuler(s));
    assert.deepEqual(quantites(s), [3, 3.5, 1, 10]);
    assert.equal(r.annule, true);
    assert.equal(r.phrase, 'J’ai remis la ligne 1.2 à 3,5 u.');
    assert.equal(r.totalHT, 28.8 + 420 + 60 + 600);
    assert.match(r.phraseTotaux, /^Total hors taxes : /);
    assert.deepEqual(r.sections[0].lignes.map((l) => [l.numero, l.quantite]), [['1.1', '3 u'], ['1.2', '3,5 u'], ['1.3', '1 u']]);
    const j = journalDe(s);
    assert.equal(j.length, avantJournal + 1, 'une ligne de plus, aucune effacée');
    const derniere = j.at(-1);
    assert.equal(derniere.outil, 'annuler_derniere_modification_devis');
    assert.equal(derniere.action, 'restaurer');
    assert.equal(derniere.operationId, r.operationId);
    assert.equal(j.some((l) => l.outil === 'modifier_lignes_devis' && l.operationId === r.operationAnnulee), true, 'la modification annulée reste au journal');
  });
  test('N1 une ligne supprimée revient avec son numéro ; une ligne ajoutée disparaît', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    ok(await modifier(s, [op('supprimer', { ligne: '1.3', attendu: 'Évier' })]));
    const r = ok(await annuler(s));
    assert.deepEqual(quantites(s), [3, 3.5, 1, 10]);
    assert.equal(r.phrase, 'J’ai remis la ligne 1.3 « Évier ».');
    ok(await modifier(s, [op('ajouterSection', { titre: 'Garage' })]));
    assert.equal(s.doc('devis_devis', 'd1').sections.length, 3);
    const r2 = ok(await annuler(s));
    assert.equal(s.doc('devis_devis', 'd1').sections.length, 2);
    assert.match(r2.phrase, /J’ai retiré la section « Garage »/);
  });
});

describe('N2 annuler une modification d’en-tête', () => {
  test('N2 modifier_devis_brouillon (objet) puis annulation : l’objet revient', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    ok(await s.appeler('biblio', 'modifier_devis_brouillon', { id: 'd1', objet: 'Autre objet' }));
    assert.equal(s.doc('devis_devis', 'd1').objet, 'Autre objet');
    const r = ok(await annuler(s));
    assert.equal(s.doc('devis_devis', 'd1').objet, 'Cuisine et salle de bain');
    assert.match(r.phrase, /^J’ai remis l’objet\./);
  });
});

describe('N2b réglages numériques', () => {
  test('N2b un taux de TVA annulé est dit (les nombres sont comparés, pas seulement les textes)', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    ok(await s.appeler('biblio', 'modifier_devis_brouillon', { id: 'd1', tauxTvaDefaut: 10 }));
    const r = ok(await annuler(s));
    assert.equal(s.doc('devis_devis', 'd1').tauxTvaDefaut, 20);
    assert.match(r.phrase, /taux de TVA/);
  });
  test('N2b une opération qui touche aussi un autre document n’est pas annulée d’ici', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    ok(await modifier(s, [op('modifier', { ligne: '1.1', attendu: 'Prise double', quantite: 5 })]));
    const derniere = journalDe(s).at(-1);
    s.collections.crm_audit.push({ ...derniere, id: 'autre-doc', ordre: 2, collection: 'crm_affaires', docId: 'a1', action: 'modifier' });
    s.collections.crm_audit_avant.push({ id: 'autre-doc', operationId: derniere.operationId, collection: 'crm_affaires', docId: 'a1', avant: {}, apres: {} });
    s.collections.crm_audit.at(-1).docId = 'd1'; // retrouvée par le devis, mais elle écrit l'affaire
    refuse(await annuler(s), /autre document/);
    assert.equal(quantites(s)[0], 5);
  });
});

describe('N3 la dernière modification vient de l’écran', () => {
  test('N3 refus net, le devis n’est pas touché, rien n’est écrit', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    ok(await modifier(s, [op('modifier', { ligne: '1.1', attendu: 'Prise double', quantite: 5 })]));
    modifierALEcran(s, 'd1', { objet: 'Changé à l’écran' });
    const n = journalDe(s).length;
    refuse(await annuler(s), /vient de l’écran, je ne l’annule pas/);
    assert.equal(s.doc('devis_devis', 'd1').objet, 'Changé à l’écran');
    assert.equal(journalDe(s).length, n);
  });
});

describe('N4 le devis a changé depuis', () => {
  test('N4 phrase « a changé depuis » (jamais le message qui propose forcer), rien n’est écrit', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    ok(await modifier(s, [op('modifier', { ligne: '1.2', attendu: 'Plan de travail', quantite: 4 })]));
    s.doc('devis_devis', 'd1').objet = 'Modifié sans ligne de journal'; // le document bouge sans trace
    const n = journalDe(s).length;
    const texte = refuse(await annuler(s), /a changé depuis/);
    assert.doesNotMatch(texte, /forcer/);
    assert.equal(journalDe(s).length, n);
    assert.deepEqual(quantites(s), [3, 4, 1, 10]);
  });
});

describe('N5 devis finalisé, N6 rien à annuler', () => {
  test('N5 un devis qui n’est plus un brouillon est refusé', async () => {
    const s = await demarrer({ devis: [devisDeBase({ statut: 'en_attente_envoi', numero: 'DEV-2026-10-01-001' })] });
    refuse(await annuler(s), /n’est plus un brouillon/);
  });
  test('N5 devis introuvable', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    refuse(await annuler(s, 'inconnu'), /introuvable/);
  });
  test('N6 un brouillon sans aucune ligne au journal : « Rien à annuler »', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    refuse(await annuler(s), /Rien à annuler/);
  });
  test('N6 les écritures échouées sont ignorées', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    s.horloge.t += 1000;
    (s.collections.crm_audit ??= []).push({ id: 'echec1', operationId: 'op-echec', ordre: 1, date: new Date(s.horloge.t), acteur: 'x', jeton: 'x', via: 'mcp', outil: 'modifier_lignes_devis', collection: 'devis_devis', docId: 'd1', action: 'modifier', statut: 'echec' });
    refuse(await annuler(s), /Rien à annuler/);
  });
});

describe('N7 un seul niveau', () => {
  test('N7 deux annulations de suite : la deuxième répond « déjà annulé » et ne remonte pas plus loin', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    ok(await modifier(s, [op('modifier', { ligne: '1.1', attendu: 'Prise double', quantite: 5 })]));
    ok(await modifier(s, [op('modifier', { ligne: '1.2', attendu: 'Plan de travail', quantite: 4 })]));
    ok(await annuler(s));
    assert.deepEqual(quantites(s), [5, 3.5, 1, 10]);
    const n = journalDe(s).length;
    refuse(await annuler(s), /déjà annulé/);
    assert.deepEqual(quantites(s), [5, 3.5, 1, 10], 'la première modification n’est pas défaite');
    assert.equal(journalDe(s).length, n);
  });
  test('N13 une nouvelle modification après l’annulation s’annule de nouveau', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    ok(await modifier(s, [op('modifier', { ligne: '1.1', attendu: 'Prise double', quantite: 5 })]));
    ok(await annuler(s));
    ok(await modifier(s, [op('modifier', { ligne: '1.1', attendu: 'Prise double', quantite: 7 })]));
    assert.equal(quantites(s)[0], 7);
    ok(await annuler(s));
    assert.equal(quantites(s)[0], 3);
  });
});

describe('N8 noms dans le journal', () => {
  test('N8 restaurer_depuis_audit garde son nom ; l’annulation écrit le sien', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    const m = ok(await modifier(s, [op('modifier', { ligne: '1.1', attendu: 'Prise double', quantite: 5 })]));
    ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: m.operationId, apercu: false }));
    assert.equal(quantites(s)[0], 3);
    const j = journalDe(s).filter((l) => l.action === 'restaurer');
    assert.deepEqual(j.map((l) => l.outil), ['restaurer_depuis_audit']);
    ok(await modifier(s, [op('modifier', { ligne: '1.1', attendu: 'Prise double', quantite: 6 })]));
    ok(await annuler(s));
    assert.deepEqual(journalDe(s).filter((l) => l.action === 'restaurer').map((l) => l.outil), ['restaurer_depuis_audit', 'annuler_derniere_modification_devis']);
  });
  test('N8 après restaurer_depuis_audit, l’annulation répond « déjà annulé » (on reconnaît l’action, pas le nom)', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    const m = ok(await modifier(s, [op('modifier', { ligne: '1.1', attendu: 'Prise double', quantite: 5 })]));
    ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: m.operationId, apercu: false }));
    refuse(await annuler(s), /déjà annulé/);
  });
});

describe('N9 devis créé', () => {
  test('N9 un devis qui vient d’être créé : rien à annuler, on renvoie vers supprimer_devis', async () => {
    const s = await demarrer({ devis: [] });
    const article = ok(await s.appeler('biblio', 'creer_article', { libelle: 'Carrelage', prixAchat: 50, unite: 'm²', code: 'CAR' }));
    const c = ok(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a1', objet: 'Neuf', destinataires: EMAIL, lignes: [{ articleId: article.id, quantite: 2 }] }));
    refuse(await annuler(s, c.id), /vient d’être créé.*supprimer_devis/);
  });
});

describe('N10 profils', () => {
  test('N10 le bibliothécaire et Claude Code peuvent annuler ; le lecteur ne voit pas l’outil et ne peut pas l’appeler', async () => {
    for (const profil of ['biblio', 'code']) {
      const s = await demarrer({ devis: [devisDeBase()] });
      ok(await modifier(s, [op('modifier', { ligne: '1.1', attendu: 'Prise double', quantite: 5 })], 'd1', profil));
      ok(await annuler(s, 'd1', profil));
      assert.equal(quantites(s)[0], 3, profil);
    }
    const s = await demarrer({ devis: [devisDeBase()] });
    ok(await modifier(s, [op('modifier', { ligne: '1.1', attendu: 'Prise double', quantite: 5 })]));
    refuse(await annuler(s, 'd1', 'lecteur'));
    assert.equal(quantites(s)[0], 5);
  });
});

describe('N11 aucune fuite de prix d’achat ni de marge', () => {
  test('N11 la réponse (prix de vente et en-tête compris) ne contient ni prix d’achat ni marge', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    ok(await modifier(s, [op('modifier', { ligne: '1.2', attendu: 'Plan de travail', prixVente: 150 })]));
    ok(await s.appeler('biblio', 'modifier_devis_brouillon', { id: 'd1', marge: 35 }));
    const r = await annuler(s);
    ok(r);
    assert.doesNotMatch(r.texte, /prixAchat|marge|modeMarge|prix d’achat/i);
    assert.match(r.data.phrase, /au prix de/);
    const r2 = await annuler(s); // déjà annulé : le refus ne dit rien non plus
    assert.doesNotMatch(r2.texte, /prixAchat|marge/i);
  });
  test('N12 la phrase d’un prix annulé donne le prix de vente hors taxes, jamais le prix d’achat', async () => {
    const s = await demarrer({ devis: [devisDeBase()] });
    ok(await modifier(s, [op('modifier', { ligne: '1.2', attendu: 'Plan de travail', prixVente: 150 })]));
    const r = ok(await annuler(s));
    assert.match(r.phrase, /^J’ai remis la ligne 1\.2 au prix de 120,00\s€ hors taxes\.$/);
    assert.doesNotMatch(r.phrase, /100/);
  });
});
