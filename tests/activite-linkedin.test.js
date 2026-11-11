// Type d'activité « linkedin » (nuit du 11/11/2026) : B1 à B7, un test par critère. Données fictives uniquement.
// B3 et B4 : règles pures puis outil MCP creer_activite, de bout en bout par le protocole (serveur sur données en mémoire).
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import * as L from '../js/modules/crm/logique.js';
import * as LM from '../functions/partage/logique.js';
import * as PL from '../functions/partage/projets.js';
import { OUTILS_ECRITURE } from '../functions/src/mcp/outils/ecriture.js';
import { proprietaireParDefaut } from '../functions/src/coeur/metier.js';
import { creerGestionnaire } from '../functions/src/mcp/gestionnaire.js';
import { empreinte, creerMagasin } from '../functions/src/securite/jetons.js';
import { creerLimiteur, LIMITES_PAR_DEFAUT } from '../functions/src/securite/limites.js';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { collections as base, MAINTENANT } from './_donnees-essai.js';

const JETONS = { lecteur: `cia_${'L'.repeat(43)}`, biblio: `cia_${'H'.repeat(43)}`, code: `cia_${'C'.repeat(43)}` };
const entree = (jeton, nom, profil, extra = {}) => ({ jeton: nom, acteur: nom, profil, empreinte: empreinte(jeton), actif: true, ...extra });
const REGLAGES = { id: 'etiquettes', items: [{ id: 'chaud', nom: 'Prospect chaud', ordre: 1 }] };

const arrets = [];
afterEach(async () => { while (arrets.length) await arrets.pop()(); });

/** Démarre un serveur MCP complet (jetons, plafonds, moteur d'écriture) sur des données fraîches. */
async function demarrer({ limites = {}, jetonsExtra = {}, stockage = null } = {}) {
  const collections = structuredClone(base);
  collections.crm_parametres.push(structuredClone(REGLAGES), { id: 'offres', items: [{ id: 'o1', nom: 'Site vitrine', ordre: 1 }] });
  const donnees = creerAccesMemoire(collections);
  const horloge = { t: MAINTENANT.getTime() };
  const lignesJournal = [];
  const secret = JSON.stringify([
    entree(JETONS.lecteur, 'lecteur-essai', 'lecteur'),
    entree(JETONS.biblio, 'hermes-bibliothecaire', 'bibliothecaire', jetonsExtra.biblio),
    entree(JETONS.code, 'claude-code-jerome', 'claude-code', jetonsExtra.code),
  ]);
  const magasin = creerMagasin({ lire: async () => secret, dureeCacheMs: 0 });
  const limiteur = creerLimiteur({ donnees, maintenant: () => horloge.t });
  const gestionnaire = creerGestionnaire({ magasin, donnees, limiteur, stockage, maintenant: () => horloge.t, journal: (e) => lignesJournal.push(e) });
  const serveur = createServer((req, res) => {
    const m = [];
    req.on('data', (x) => m.push(x));
    req.on('end', () => {
      const texte = Buffer.concat(m).toString('utf8');
      try { req.body = texte ? JSON.parse(texte) : undefined; } catch { req.body = undefined; }
      gestionnaire(req, res);
    });
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  arrets.push(() => new Promise((ok) => serveur.close(ok)));
  const url = `http://127.0.0.1:${serveur.address().port}/mcp`;
  let n = 0;
  const brut = (jeton, methode, params) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(jeton ? { Authorization: `Bearer ${JETONS[jeton] ?? jeton}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method: methode, params }),
  });
  /** Appelle un outil : { isError, texte, data } (data = JSON de la réponse quand elle en est). */
  const appeler = async (jeton, nom, args = {}) => {
    const r = await brut(jeton, 'tools/call', { name: nom, arguments: args });
    const corps = await r.json();
    if (corps.error) return { isError: true, texte: corps.error.message, erreurProtocole: true };
    const texte = corps.result.content?.[0]?.text ?? '';
    let data;
    try { data = JSON.parse(texte); } catch { data = undefined; }
    return { isError: !!corps.result.isError, texte, data };
  };
  /** Suppression en deux temps (double confirmation) : aperçu, puis rappel avec le code. Rend la réponse du second appel (ou du premier s'il est refusé). */
  const supprimer = async (jeton, nom, args) => {
    const apercu = await appeler(jeton, nom, args);
    if (apercu.isError) return apercu;
    assert.equal(apercu.data.apercu, true, apercu.texte);
    return appeler(jeton, nom, { ...args, codeConfirmation: apercu.data.code });
  };
  const vue = () => Object.fromEntries(Object.entries(collections).filter(([k]) => !['crm_audit', 'crm_audit_avant', 'mcp_limites', 'mcp_codes'].includes(k)).map(([k, v]) => [k, structuredClone(v).sort((a, b) => a.id.localeCompare(b.id))]));
  return { collections, donnees, appeler, supprimer, brut, horloge, lignesJournal, vue, doc: (nom, id) => collections[nom]?.find((d) => d.id === id) };
}
const ok = (r) => { assert.equal(r.isError, false, r.texte); return r.data; };
const refuse = (r, motif) => { assert.equal(r.isError, true, `devait être refusé : ${r.texte}`); if (motif) assert.match(r.texte, motif); };

const ctx = (iso = '2026-10-15T08:00:00Z') => ({ maintenant: new Date(iso), auteur: 'essai', config: L.CONFIG_JEROME });

describe('B1 à B3 : règles pures', () => {
  test('B1 TYPES_ACTIVITE contient linkedin en dernier, avec son libellé et son titre par défaut', () => {
    assert.equal(L.TYPES_ACTIVITE.at(-1).id, 'linkedin');
    assert.equal(L.TYPES_ACTIVITE[0].id, 'appel');
    assert.equal(L.libelleTypeActivite('linkedin'), 'LinkedIn');
    assert.equal(L.titreActiviteParDefaut('linkedin'), 'Échange LinkedIn');
    assert.deepEqual(L.TYPES_ACTIVITE.map((t) => t.id), LM.TYPES_ACTIVITE.map((t) => t.id)); // la copie du serveur dit la même chose
  });

  test('B3 nouvelleActivite garde sens, voix, cleImport, fait et dateFait pour linkedin ; dateFait absent = maintenant', () => {
    const dateFait = new Date('2026-09-30T10:00:00Z');
    const a = L.nouvelleActivite({ type: 'linkedin', titre: 'Résumé', sens: 'recu', voix: 2, cleImport: 'abc', fait: true, dateFait }, ctx());
    assert.deepEqual([a.sens, a.voix, a.cleImport, a.fait, a.dateFait], ['recu', 2, 'abc', true, dateFait]);
    const b = L.nouvelleActivite({ type: 'linkedin', titre: 'Résumé', fait: true }, ctx());
    assert.deepEqual([b.fait, b.dateFait], [true, ctx().maintenant]);
  });

  test('B3 les autres types ignorent ces champs ; valeurs invalides ignorées sans erreur', () => {
    const a = L.nouvelleActivite({ type: 'appel', titre: 'x', sens: 'recu', voix: 2, cleImport: 'abc', fait: true, dateFait: new Date() }, ctx());
    assert.deepEqual([a.fait, a.dateFait, 'sens' in a, 'voix' in a, 'cleImport' in a], [false, null, false, false, false]);
    const b = L.nouvelleActivite({ type: 'linkedin', titre: 'x', sens: 'x', voix: 3, cleImport: 'a'.repeat(81) }, ctx());
    assert.deepEqual([b.fait, b.dateFait, 'sens' in b, 'voix' in b, 'cleImport' in b], [false, null, false, false, false]);
    assert.deepEqual(L.validerActivite({ type: 'linkedin', date: '2026-10-15' }), {});
  });

  test('B5 la saisie à la main n\'impose aucune limite de longueur (250 caractères acceptés)', () => {
    assert.deepEqual(L.validerSaisieActivite({ type: 'linkedin', date: '2026-10-15', titre: 'a'.repeat(250) }), {});
    assert.equal(L.nouvelleActivite({ type: 'linkedin', titre: 'a'.repeat(250) }, ctx()).titre.length, 250);
  });

  test('B6 un modèle ou une action suggérée peut choisir LinkedIn ; un type inconnu garde son repli', () => {
    assert.deepEqual(L.validerActiviteModele({ titre: 'Écrire', type: 'linkedin' }), {});
    const c = L.construireConfig({ etapes: { items: [{ action: { type: 'linkedin', titre: 'Relancer' } }, { action: { type: 'pigeon', titre: 'Relancer' } }, { action: { titre: 'Sans type' } }] } }, { racine: true });
    assert.deepEqual(c.etapes.slice(0, 3).map((e) => e.action.type), ['linkedin', 'tache', 'tache']);
  });
});

describe('B4 et B7 : serveur MCP', () => {
  test('B4 creer_activite accepte linkedin : créée FAITE par défaut, à faire avec fait:false, les autres types restent à faire', async () => {
    const s = await demarrer();
    const a = ok(await s.appeler('biblio', 'creer_activite', { type: 'linkedin', titre: 'Échange sur un salon', personneId: 'p2', sens: 'recu', voix: 2 }));
    const d = s.doc('crm_activites', a.id);
    assert.deepEqual([d.type, d.fait, d.sens, d.voix], ['linkedin', true, 'recu', 2]);
    assert.ok(d.dateFait, 'dateFait posée');
    const b = ok(await s.appeler('biblio', 'creer_activite', { type: 'linkedin', titre: 'À planifier', personneId: 'p2', fait: false }));
    assert.deepEqual([s.doc('crm_activites', b.id).fait, s.doc('crm_activites', b.id).dateFait], [false, null]);
    const c = ok(await s.appeler('biblio', 'creer_activite', { type: 'appel', titre: 'Rappeler', personneId: 'p2', fait: true, sens: 'recu' }));
    const dc = s.doc('crm_activites', c.id);
    assert.deepEqual([dc.fait, 'sens' in dc], [false, false]);
  });

  test('B4 cas d\'erreur : 201 caractères refusés pour linkedin, 200 acceptés, 201 acceptés pour un appel ; sens invalide refusé', async () => {
    const s = await demarrer();
    refuse(await s.appeler('biblio', 'creer_activite', { type: 'linkedin', titre: 'a'.repeat(201), personneId: 'p2' }), /200 caractères au plus/);
    ok(await s.appeler('biblio', 'creer_activite', { type: 'linkedin', titre: 'a'.repeat(200), personneId: 'p2' }));
    ok(await s.appeler('biblio', 'creer_activite', { type: 'appel', titre: 'a'.repeat(201), personneId: 'p2' }));
    refuse(await s.appeler('biblio', 'creer_activite', { type: 'linkedin', titre: 'x', personneId: 'p2', sens: 'x' }));
    refuse(await s.appeler('biblio', 'creer_activite', { type: 'linkedin', titre: 'x', personneId: 'p2', voix: 3 }));
  });

  test('B7 la liste des outils annonce le type linkedin (profil bibliothécaire)', async () => {
    const s = await demarrer();
    const liste = (await (await s.brut('biblio', 'tools/list')).json()).result.tools;
    const o = liste.find((t) => t.name === 'creer_activite');
    assert.ok(o.description.includes('linkedin'));
    assert.deepEqual(o.inputSchema.properties.type.enum.at(-1), 'linkedin');
    assert.ok('sens' in o.inputSchema.properties && 'voix' in o.inputSchema.properties && 'fait' in o.inputSchema.properties);
  });
});
