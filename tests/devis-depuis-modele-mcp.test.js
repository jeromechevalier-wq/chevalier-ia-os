// Outil MCP creer_devis_depuis_modele (30/10/2026, cadrage-devis-fluide.md PR 15) : un NOUVEAU brouillon copié d'un devis existant, aux prix du catalogue d'aujourd'hui.
// De bout en bout par le protocole MCP, sur des données fictives en mémoire. P1 copie fidèle ; P2 prix du jour ; P3 article désactivé ; P4 ligne libre ; P5 ajustements (numéros du modèle) ;
// P6 tout ou rien ; P7 lecteur refusé ; P8 aucune fuite ; P9 modèle introuvable ; P10 modèle sans ligne ; P11 identifiants renouvelés ; P12 annulation refusée juste après ; P13 client ; P14 texte et sauts.
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

const art = (id, libelle, prixAchat, extra = {}) => ({ id, code: id.toUpperCase(), libelle, unite: 'u', prixAchat, tauxTva: 20, actif: true, ...extra });
// Catalogue d'AUJOURD'HUI : la prise coûte 10 € (8 € dans le modèle), l'évier est désactivé.
const ARTICLES = [art('prise', 'Prise double', 10), art('plan', 'Plan de travail', 100), art('evier', 'Évier', 50, { actif: false }), art('carre', 'Carrelage', 50)];
const lg = (id, libelle, quantite, prixAchat, extra = {}) => ({ id, libelle, unite: 'u', quantite, prixAchat, ...extra });
/** Le modèle, finalisé (n'importe quel statut se lit) : 1.1 Prise ×3 (vendue 9,60 € dans le modèle), 1.2 Plan ×3,5 avec prix forcé, 1.3 Évier (article désactivé), 1.4 ligne libre ; 2.1 Carrelage ×10. */
const modeleDeBase = (extra = {}) => ({
  id: 'm1', racineId: 'm1', version: 1, numero: 'DEV-2026-10-01-001', statut: 'en_attente_envoi', affaireId: 'a1', organisationId: 'org1', personneId: null, objet: 'Cuisine et salle de bain', destinataires: EMAIL, copie: ['copie@exemple.test'],
  remise: { type: 'pourcentage', valeur: 10 }, acomptes: [{ id: 'ac1', type: 'pourcentage', valeur: 30 }], chantier: { adresse: '1 rue du Chantier' },
  modeMarge: 'majoration', marge: 35, tauxTvaDefaut: 20, regimeTva: 'assujetti', archive: false, creeLe: new Date('2026-10-01T08:00:00Z'), expireLe: '2026-12-30',
  sections: [
    { id: 's1', titre: 'Cuisine', lignes: [lg('l11', 'Prise double', 3, 8, { articleId: 'prise' }), lg('l12', 'Plan de travail', 3.5, 100, { articleId: 'plan', prixVente: 999 }), lg('l13', 'Évier', 1, 50, { articleId: 'evier' }), lg('l14', 'Dépose ancienne cuisine', 1, 40)] },
    { id: 's2', titre: 'Salle de bain', lignes: [lg('l21', 'Carrelage', 10, 50, { articleId: 'carre' })] },
  ], ...extra,
});

async function demarrer({ devis = [], articles = [] } = {}) {
  const collections = structuredClone(base);
  Object.assign(collections, { devis_articles: articles.map((x) => structuredClone(x)), devis_devis: devis.map((d) => structuredClone(d)), devis_compteurs: [], devis_parametres: [{ id: 'reglages', regimeTva: 'assujetti', marge: 20, modeMarge: 'majoration' }] });
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
const depuis = (s, args = {}, jeton = 'biblio') => s.appeler(jeton, 'creer_devis_depuis_modele', { modeleId: 'm1', ...args });
const journalDe = (s, id) => (s.collections.crm_audit ?? []).filter((l) => l.docId === id);
const lignesDe = (d) => d.sections.flatMap((x) => x.lignes);

describe('creer_devis_depuis_modele', () => {
  test('P1 copie fidèle : mêmes lignes, mêmes quantités, nouveau brouillon sans numéro ; rien de ce qui appartient au modèle (adresses, destinataires, chantier, acomptes, remise)', async () => {
    const s = await demarrer({ devis: [modeleDeBase()], articles: ARTICLES });
    const avant = structuredClone(s.doc('devis_devis', 'm1'));
    const r = ok(await depuis(s));
    const nouveau = s.doc('devis_devis', r.id);
    assert.equal(nouveau.statut, 'brouillon');
    assert.equal(nouveau.numero, null);
    assert.equal(nouveau.version, 1);
    assert.deepEqual(nouveau.sections.map((x) => x.titre), ['Cuisine', 'Salle de bain']);
    assert.deepEqual(lignesDe(nouveau).map((l) => [l.libelle, l.quantite]), [['Prise double', 3], ['Plan de travail', 3.5], ['Carrelage', 10]]);

    assert.deepEqual(nouveau.copie ?? [], []);
    assert.ok(!nouveau.remise);
    assert.ok(!nouveau.acomptes || nouveau.acomptes.length === 0);
    assert.notEqual(nouveau.chantier?.adresse, '1 rue du Chantier');
    assert.deepEqual(s.doc('devis_devis', 'm1'), avant, 'le modèle n’est jamais modifié');
    assert.equal(r.modeleId, 'm1');
    assert.match(r.phraseTotaux, /hors taxes/);
  });

  test('P2 prix du jour : la prise est vendue au prix du catalogue d’aujourd’hui avec la marge des réglages (jamais celle du modèle) ; un prix de vente forcé n’est pas repris', async () => {
    const s = await demarrer({ devis: [modeleDeBase()], articles: ARTICLES });
    const r = ok(await depuis(s));
    const nouveau = s.doc('devis_devis', r.id);
    assert.equal(nouveau.marge, 20, 'marge des réglages du jour, pas les 35 % du modèle');
    const prise = lignesDe(nouveau)[0];
    assert.equal(prise.prixAchat, 10);
    assert.equal(prise.prixVente, undefined);
    // 3 prises à 10 € d'achat +20 % = 36 ; plan 3,5 × 100 × 1,2 = 420 ; carrelage 10 × 50 × 1,2 = 600 : total 1056 hors taxes (pas de prix forcé à 999).
    assert.equal(r.totalHT, 1056);
    assert.equal(r.totalTTC, 1267.2);
  });

  test('P3 article désactivé ou supprimé : la ligne n’est pas copiée et elle est listée dans aReviser avec son numéro du modèle', async () => {
    const s = await demarrer({ devis: [modeleDeBase()], articles: ARTICLES });
    const r = ok(await depuis(s));
    assert.ok(!lignesDe(s.doc('devis_devis', r.id)).some((l) => l.libelle === 'Évier'));
    assert.deepEqual(r.aReviser.find((x) => x.libelle === 'Évier'), { numero: '1.3', libelle: 'Évier', motif: 'article_retire' });
    const s2 = await demarrer({ devis: [modeleDeBase()], articles: ARTICLES.filter((a) => a.id !== 'carre') }); // article supprimé du catalogue
    const r2 = ok(await depuis(s2));
    assert.deepEqual(r2.aReviser.find((x) => x.libelle === 'Carrelage'), { numero: '2.1', libelle: 'Carrelage', motif: 'article_retire' });
  });

  test('P4 ligne libre : non copiée, listée', async () => {
    const s = await demarrer({ devis: [modeleDeBase()], articles: ARTICLES });
    const r = ok(await depuis(s));
    assert.ok(!lignesDe(s.doc('devis_devis', r.id)).some((l) => l.libelle === 'Dépose ancienne cuisine'));
    assert.deepEqual(r.aReviser.find((x) => x.libelle === 'Dépose ancienne cuisine'), { numero: '1.4', libelle: 'Dépose ancienne cuisine', motif: 'ligne_libre' });
  });

  test('P5 ajustements : les numéros sont ceux du MODÈLE, même si des lignes ne sont pas copiées ; une seule ligne de journal', async () => {
    const s = await demarrer({ devis: [modeleDeBase()], articles: ARTICLES });
    const r = ok(await depuis(s, { ajustements: [
      { action: 'modifier', ligne: '1.1', attendu: 'Prise double', quantite: 5 },
      { action: 'supprimer', ligne: '2.1', attendu: 'Carrelage' },
    ] }));
    assert.deepEqual(lignesDe(s.doc('devis_devis', r.id)).map((l) => [l.libelle, l.quantite]), [['Prise double', 5], ['Plan de travail', 3.5]]);
    assert.equal(journalDe(s, r.id).length, 1);
    assert.ok(r.operationId);
  });

  test('P6 tout ou rien : un ajustement faux (mauvais « attendu », ligne non copiée, trop d’ajustements) n’écrit aucun devis', async () => {
    const s = await demarrer({ devis: [modeleDeBase()], articles: ARTICLES });
    const avant = s.collections.devis_devis.length;
    refuse(await depuis(s, { ajustements: [{ action: 'modifier', ligne: '1.1', attendu: 'Prise double', quantite: 5 }, { action: 'supprimer', ligne: '2.1', attendu: 'Autre chose' }] }));
    refuse(await depuis(s, { ajustements: [{ action: 'modifier', ligne: '1.3', attendu: 'Évier', quantite: 2 }] }), /n'est pas copiée/);
    refuse(await depuis(s, { ajustements: [{ action: 'modifier', ligne: '1.4', attendu: 'Dépose ancienne cuisine', quantite: 2 }] }), /n'est pas copiée/);
    const trop = Array.from({ length: 31 }, () => ({ action: 'modifier', ligne: '1.1', attendu: 'Prise double', quantite: 2 }));
    assert.equal((await depuis(s, { ajustements: trop })).isError, true);
    assert.equal(s.collections.devis_devis.length, avant, 'aucun devis créé');
    assert.equal((s.collections.crm_audit ?? []).filter((l) => l.outil === 'creer_devis_depuis_modele' && l.statut !== 'echec').length, 0, 'aucune création au journal');
  });

  test('P7 le profil lecteur est refusé ; claude-code est accepté', async () => {
    const s = await demarrer({ devis: [modeleDeBase()], articles: ARTICLES });
    assert.equal((await depuis(s, {}, 'lecteur')).isError, true);
    ok(await depuis(s, {}, 'code'));
  });

  test('P8 aucun prix d’achat ni marge dans la réponse', async () => {
    const s = await demarrer({ devis: [modeleDeBase()], articles: ARTICLES });
    const r = await depuis(s);
    ok(r);
    assert.doesNotMatch(r.texte, /prixAchat|marge|modeMarge|coefficient/i);
  });

  test('P9 modèle introuvable : refusé, rien d’écrit', async () => {
    const s = await demarrer({ devis: [modeleDeBase()], articles: ARTICLES });
    refuse(await depuis(s, { modeleId: 'inconnu' }), /introuvable/);
    assert.equal(s.collections.devis_devis.length, 1);
  });

  test('P10 cas vide : un modèle sans ligne donne un brouillon vide, sans aReviser', async () => {
    const s = await demarrer({ devis: [modeleDeBase({ sections: [] })], articles: ARTICLES });
    const r = ok(await depuis(s));
    assert.equal(r.lignes, 0);
    assert.deepEqual(r.aReviser, []);
    assert.equal(r.totalHT, 0);
  });

  test('P11 les identifiants de lignes et de sections sont renouvelés', async () => {
    const s = await demarrer({ devis: [modeleDeBase()], articles: ARTICLES });
    const r = ok(await depuis(s));
    const nouveau = s.doc('devis_devis', r.id);
    const anciens = new Set(['s1', 's2', 'l11', 'l12', 'l13', 'l14', 'l21']);
    for (const x of nouveau.sections) assert.ok(!anciens.has(x.id), x.id);
    for (const l of lignesDe(nouveau)) assert.ok(!anciens.has(l.id), l.id);
  });

  test('P12 le journal dit « creer » sous le bon nom, et annuler_derniere_modification_devis répond « rien à annuler : utilise supprimer_devis »', async () => {
    const s = await demarrer({ devis: [modeleDeBase()], articles: ARTICLES });
    const r = ok(await depuis(s));
    const lignes = journalDe(s, r.id);
    assert.deepEqual(lignes.map((l) => [l.outil, l.action]), [['creer_devis_depuis_modele', 'creer']]);
    refuse(await s.appeler('biblio', 'annuler_derniere_modification_devis', { id: r.id }), /vient d’être créé, rien à annuler : utilise supprimer_devis/);
  });

  test('P13 client : l’affaire donne le client ; organisationId et personneId ensemble sont refusés', async () => {
    const s = await demarrer({ devis: [modeleDeBase({ organisationId: 'org1', affaireId: 'a1' })], articles: ARTICLES });
    refuse(await depuis(s, { organisationId: 'org1', personneId: 'p1' }), /un seul client/);
    const r = ok(await depuis(s, { affaireId: 'a1' }));
    assert.equal(s.doc('devis_devis', r.id).affaireId, 'a1');
  });

  test('P14 lignes de texte listées dans aReviser, sauts de page gardés', async () => {
    const texte = { id: 'lt', libelle: 'Chantier de la rue des Lilas', type: 'texte', quantite: 1, unite: '', prixAchat: 0, marge: 0 };
    const saut = { id: 'sp', type: 'saut', libelle: '' };
    const modele = modeleDeBase({ sections: [{ id: 's1', titre: 'Cuisine', lignes: [lg('l11', 'Prise double', 3, 8, { articleId: 'prise' }), texte, saut] }] });
    const s = await demarrer({ devis: [modele], articles: ARTICLES });
    const r = ok(await depuis(s));
    assert.equal(r.aReviser.find((x) => x.libelle === 'Chantier de la rue des Lilas')?.motif, 'texte');
    const lignes = lignesDe(s.doc('devis_devis', r.id));
    assert.ok(lignes.some((l) => l.type === 'texte'));
    assert.ok(lignes.some((l) => l.type === 'saut'));
  });
});
