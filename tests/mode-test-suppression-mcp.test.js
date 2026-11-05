// Mode test, PR 4 : l'outil MCP supprimer_tous_les_tests (aperçu chiffré, code à usage unique, plafond, rôles, annotations). Par le protocole MCP, sur des données fictives en mémoire.
// Exemples chiffrés : un devis de test à 100 € HT. Le nom de chaque test commence par le numéro du critère du brief (6a à 6h).
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { creerGestionnaire } from '../functions/src/mcp/gestionnaire.js';
import { empreinte, creerMagasin } from '../functions/src/securite/jetons.js';
import { creerLimiteur } from '../functions/src/securite/limites.js';
import { creerAccesMemoire, COLLECTIONS as C } from '../functions/src/coeur/donnees.js';
import * as S from '../functions/src/coeur/devis.js';
import { nouveauDevis } from '../functions/partage/devis.js';
import { collections as base, MAINTENANT } from './_donnees-essai.js';
import { EMETTEUR_ESSAI, completerPourFinaliser } from './jeu-finalisation.js';

const JETONS = { lecteur: `cia_${'L'.repeat(43)}`, biblio: `cia_${'H'.repeat(43)}`, code: `cia_${'C'.repeat(43)}` };
const entree = (jeton, nom, profil, extra = {}) => ({ jeton: nom, acteur: nom, profil, empreinte: empreinte(jeton), actif: true, ...extra });
const arrets = [];
afterEach(async () => { while (arrets.length) await arrets.pop()(); });

/** Un devis déjà finalisé (statut, totaux figés), rattaché à l'affaire `affaireId`. `ht` : total hors taxes figé. */
const devisFige = (id, { ht, statut = 'accepte', affaireId = 'a1', racineId = id, version = 1, test, articleId = 'art1', numero = `DEV-2026-10-01-${id}` } = {}) => ({
  id, racineId, version, numero, statut, affaireId, organisationId: 'org1', personneId: null, objet: `Objet ${id}`, nom: '', destinataires: [{ email: 'client@exemple.test' }],
  modeMarge: 'majoration', marge: 0, tauxTvaDefaut: 20, regimeTva: 'assujetti', archive: false, creeLe: new Date('2026-10-01T08:00:00Z'), finaliseLe: new Date('2026-10-02T08:00:00Z'),
  expireLe: '2027-01-22', totaux: { ht, ttc: ht * 1.2, tva: ht * 0.2 },
  sections: [{ id: `s-${id}`, titre: '', lignes: [{ id: `l-${id}`, articleId, libelle: 'Forfait', unite: 'forfait', quantite: 1, prixAchat: ht, prixVente: ht }] }],
  ...(test === undefined ? {} : { test }),
});
const brouillonEnregistre = (id, extra = {}) => ({ ...devisFige(id, { ht: 0, statut: 'brouillon' }), numero: null, finaliseLe: null, totaux: undefined, ...extra });

async function demarrer({ devis = [], jetonsExtra = {}, fiches = (c) => c } = {}) {
  const collections = structuredClone(base);
  Object.assign(collections, {
    devis_articles: [], devis_devis: devis.map((d) => structuredClone(d)), devis_compteurs: [], devis_usage_articles: [], projets_projets: [], projets_taches: [], projets_modeles: [],
    devis_parametres: [{ id: 'reglages', regimeTva: 'assujetti', marge: 0, modeMarge: 'majoration', entreprise: EMETTEUR_ESSAI }],
  });
  collections.crm_parametres.push({ id: 'etiquettes', items: [] });
  collections.crm_affaires.push(
    { id: 'a5', titre: 'Gagnée 5', personneId: 'p2', organisationId: 'org2', etape: 'gagne', statut: 'gagnee', archive: false, creeLe: new Date('2026-09-12T08:00:00Z') },
    { id: 'a6', titre: 'Gagnée 6', personneId: 'p2', organisationId: 'org2', etape: 'gagne', statut: 'gagnee', archive: false, creeLe: new Date('2026-09-12T08:00:00Z') },
    { id: 'a7', titre: 'Gagnée 7', personneId: 'p2', organisationId: 'org2', etape: 'gagne', statut: 'gagnee', archive: false, creeLe: new Date('2026-09-12T08:00:00Z') },
  );
  fiches(collections);
  const donnees = creerAccesMemoire(collections);
  const horloge = { t: MAINTENANT.getTime() };
  const secret = JSON.stringify([
    entree(JETONS.lecteur, 'lecteur-essai', 'lecteur'),
    entree(JETONS.biblio, 'hermes-bibliothecaire', 'bibliothecaire', jetonsExtra.biblio),
    entree(JETONS.code, 'claude-code-jerome', 'claude-code', jetonsExtra.code),
  ]);
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
  const brut = (jeton, methode, params) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${JETONS[jeton]}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method: methode, params }),
  });
  const appeler = async (jeton, nom, args = {}) => {
    const corps = await (await brut(jeton, 'tools/call', { name: nom, arguments: args })).json();
    if (corps.error) return { isError: true, texte: corps.error.message };
    const texte = corps.result.content?.[0]?.text ?? '';
    let data;
    try { data = JSON.parse(texte); } catch { data = undefined; }
    return { isError: !!corps.result.isError, texte, data };
  };
  /** Aperçu puis code, comme un assistant : rend la réponse du second appel. */
  const avecCode = async (jeton, nom, args) => {
    const apercu = await appeler(jeton, nom, args);
    assert.equal(apercu.isError, false, apercu.texte);
    assert.equal(apercu.data.apercu, true, apercu.texte);
    return appeler(jeton, nom, { ...args, codeConfirmation: apercu.data.code });
  };
  const doc = (nom, id) => collections[nom]?.find((d) => d.id === id);
  const lignesAudit = (outil) => collections.crm_audit.filter((l) => l.outil === outil);
  return { collections, donnees, appeler, avecCode, brut, horloge, doc, lignesAudit };
}
const ok = (r) => { assert.equal(r.isError, false, r.texte); return r.data; };
const refuse = (r, motif) => { assert.equal(r.isError, true, `devait être refusé : ${r.texte}`); if (motif) assert.match(r.texte, motif); };

const testsEnBase = (c) => {
  c.crm_personnes.push({ id: 'pt', nom: 'Paul Essai', test: true, organisationId: null });
  c.crm_affaires.push({ id: 'at', titre: 'Affaire essai', test: true, personneId: 'pt', organisationId: null, etape: 'premier_contact', statut: 'ouverte', archive: false });
  c.crm_notes.push({ id: 'nr', texte: 'Note réelle', affaireId: 'at', personneId: 'p1' });
  c.devis_devis.push(brouillonEnregistre('b1', { test: true, affaireId: 'at' }), { ...devisFige('t1', { ht: 100, statut: 'finalise', affaireId: 'at', test: true, numero: 'TEST-001' }) });
  c.devis_compteurs.push({ id: 'test', valeur: 1 });
};
const noms = async (s, j) => (await (await s.brut(j, 'tools/list')).json()).result.tools;
const NOM = 'supprimer_tous_les_tests';

describe('6 supprimer_tous_les_tests', () => {
  test('6a seul le profil code voit l’outil et peut l’appeler', async () => {
    const s = await demarrer({ fiches: testsEnBase });
    assert.equal((await noms(s, 'lecteur')).some((t) => t.name === NOM), false);
    assert.equal((await noms(s, 'biblio')).some((t) => t.name === NOM), false);
    assert.equal((await noms(s, 'code')).some((t) => t.name === NOM), true);
    refuse(await s.appeler('lecteur', NOM, {}));
    refuse(await s.appeler('biblio', NOM, {}));
  });
  test('6b premier appel : aperçu chiffré avec code, rien d’écrit', async () => {
    const s = await demarrer({ fiches: testsEnBase });
    const avant = JSON.stringify(s.collections);
    const lignesAvant = s.collections.crm_audit.length;
    const r = ok(await s.appeler('code', NOM, {}));
    assert.equal(r.apercu, true);
    assert.equal(r.supprime, false);
    assert.equal(r.total, 4);
    assert.deepEqual(r.comptes.devis, 2);
    assert.ok(r.noms.length <= 11 && r.noms.some((n) => n.includes('Paul Essai')));
    assert.ok(Array.isArray(r.relies) && r.relies.some((x) => x.id === 'nr'));
    assert.ok(r.code);
    assert.equal(JSON.stringify(s.collections.crm_personnes), JSON.stringify(JSON.parse(avant).crm_personnes));
    assert.equal(s.collections.crm_audit.length, lignesAvant, 'aucune ligne de journal pour un aperçu');
    assert.equal(s.doc('crm_personnes', 'pt').nom, 'Paul Essai');
  });
  test('6c un mauvais code est refusé (« code incorrect »), rien n’est écrit, le code est brûlé', async () => {
    const s = await demarrer({ fiches: testsEnBase });
    const a = ok(await s.appeler('code', NOM, {}));
    refuse(await s.appeler('code', NOM, { codeConfirmation: 'AAAA-AAAA' }), /code incorrect/);
    assert.ok(s.doc('crm_personnes', 'pt'));
    refuse(await s.appeler('code', NOM, { codeConfirmation: a.code }), /aucun aperçu en cours/);
    assert.ok(s.doc('crm_personnes', 'pt'));
  });
  test('6d une fiche de test ajoutée entre l’aperçu et le code : refus « a changé »', async () => {
    const s = await demarrer({ fiches: testsEnBase });
    const a = ok(await s.appeler('code', NOM, {}));
    s.collections.crm_personnes.push({ id: 'p9', nom: 'Autre essai', test: true });
    refuse(await s.appeler('code', NOM, { codeConfirmation: a.code }), /a changé/);
    assert.ok(s.doc('crm_personnes', 'pt') && s.doc('crm_personnes', 'p9'));
  });
  test('6e bon code : tout est supprimé, compteur TEST- remis, deux operationIds, lien de la note réelle vidé', async () => {
    const s = await demarrer({ fiches: testsEnBase });
    const r = ok(await s.avecCode('code', NOM, {}));
    assert.equal(r.supprime, true);
    assert.equal(r.total, 4);
    assert.equal(r.compteurTestRemis, true);
    assert.ok(r.operationIds.devisFinalises && r.operationIds.reste);
    for (const [coll, id] of [['crm_personnes', 'pt'], ['crm_affaires', 'at'], ['devis_devis', 'b1'], ['devis_devis', 't1']]) assert.equal(s.doc(coll, id), undefined, id);
    assert.equal(s.doc('crm_notes', 'nr').affaireId, null);
    assert.equal(s.doc('devis_compteurs', 'test').valeur, 0);
    assert.equal(s.lignesAudit(NOM).length >= 4, true);
  });
  test('6f plafond : 3 suppressions par jour et 4 documents de test : depassePlafond, aucun code, rien d’écrit', async () => {
    const s = await demarrer({ fiches: testsEnBase, jetonsExtra: { code: { limites: { suppressionsParJour: 3 } } } });
    const r = ok(await s.appeler('code', NOM, {}));
    assert.equal(r.depassePlafond, true);
    assert.equal(r.suppressionsRestantesAujourdhui, 3);
    assert.equal(r.code, undefined);
    assert.match(r.consigne, /Réglages > Mes tests/);
    assert.ok(s.doc('crm_personnes', 'pt'));
    assert.equal(s.collections.mcp_codes?.length ?? 0, 0);
  });
  test('6g base sans aucun test : rien: true, aucun code émis', async () => {
    const s = await demarrer({});
    const r = ok(await s.appeler('code', NOM, {}));
    assert.equal(r.rien, true);
    assert.equal(r.code, undefined);
    assert.equal(s.collections.mcp_codes?.length ?? 0, 0);
  });
  test('6h annotations : destructiveHint vrai, readOnlyHint faux', async () => {
    const s = await demarrer({});
    const t = (await noms(s, 'code')).find((x) => x.name === NOM);
    assert.equal(t.annotations.destructiveHint, true);
    assert.equal(t.annotations.readOnlyHint, false);
  });
});
