// Profils de droits du serveur MCP : lecture / ecriture / complet, anciens noms (lecteur / bibliothecaire / claude-code) gardés comme ALIAS DURABLES.
// De bout en bout par le protocole MCP, sur des données fictives en mémoire. Le nom de chaque test commence par le numéro du critère du brief.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { creerGestionnaire } from '../functions/src/mcp/gestionnaire.js';
import { OUTILS, outilsAutorises, annotationsDe } from '../functions/src/mcp/outils/index.js';
import { PROFILS, ALIAS_PROFILS, profilCanonique, analyserSecret, empreinte, creerMagasin } from '../functions/src/securite/jetons.js';
import { creerLimiteur } from '../functions/src/securite/limites.js';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { PROFIL_OAUTH } from '../functions/src/oauth/config.js';
import { PROFIL_PAR_ROLE } from '../functions/src/clients/config.js';
import { ROLES } from '../js/os/membres.js';
import { collections as base, MAINTENANT } from './_donnees-essai.js';

const RACINE = fileURLToPath(new URL('..', import.meta.url));
const JETONS = { lecteur: `cia_${'L'.repeat(43)}`, biblio: `cia_${'H'.repeat(43)}`, code: `cia_${'C'.repeat(43)}` };
const entree = (jeton, nom, profil) => ({ jeton: nom, acteur: nom, profil, empreinte: empreinte(jeton), actif: true });
const SECRET_ANCIEN = [entree(JETONS.lecteur, 'lecteur-essai', 'lecteur'), entree(JETONS.biblio, 'hermes-bibliothecaire', 'bibliothecaire'), entree(JETONS.code, 'claude-code-jerome', 'claude-code')];
const SECRET_NOUVEAU = [entree(JETONS.lecteur, 'lecteur-essai', 'lecture'), entree(JETONS.biblio, 'hermes-bibliothecaire', 'ecriture'), entree(JETONS.code, 'claude-code-jerome', 'complet')];

const arrets = [];
afterEach(async () => { while (arrets.length) await arrets.pop()(); });

/** Un serveur MCP complet sur un secret donné (JSON), des données en mémoire et un journal HTTP capturé. */
async function monter(secret, { collections = structuredClone(base), jetons = JETONS } = {}) {
  const lignesJournal = [];
  const donnees = creerAccesMemoire(collections);
  const gestionnaire = creerGestionnaire({
    magasin: creerMagasin({ lire: async () => JSON.stringify(secret), dureeCacheMs: 0 }), donnees, limiteur: creerLimiteur({ donnees }),
    maintenant: () => MAINTENANT.getTime(), journal: (e) => { lignesJournal.push(e); },
  });
  const serveur = createServer((req, res) => {
    const m = [];
    req.on('data', (x) => m.push(x));
    req.on('end', () => { try { req.body = JSON.parse(Buffer.concat(m).toString('utf8')); } catch { req.body = undefined; } gestionnaire(req, res); });
  });
  await new Promise((fin) => serveur.listen(0, '127.0.0.1', fin));
  arrets.push(() => new Promise((fin) => serveur.close(fin)));
  const url = `http://127.0.0.1:${serveur.address().port}/mcp`;
  let n = 0;
  const brut = (jeton, methode, params) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method: methode, params }),
  });
  const liste = async (cle) => ((await (await brut(jetons[cle], 'tools/list')).json()).result.tools.map((t) => t.name)).sort();
  const appeler = async (cle, nom, args = {}) => {
    const corps = await (await brut(jetons[cle], 'tools/call', { name: nom, arguments: args })).json();
    if (corps.error) return { isError: true, texte: corps.error.message };
    const texte = corps.result.content?.[0]?.text ?? '';
    let data;
    try { data = JSON.parse(texte); } catch { data = undefined; }
    return { isError: !!corps.result.isError, texte, data };
  };
  return { collections, brut, liste, appeler, lignesJournal, jetons };
}
const noms = (profil) => outilsAutorises(profil, OUTILS).map((o) => o.nom).sort();

describe('profils de droits du serveur MCP', () => {
  test('1 PROFILS, ALIAS_PROFILS et profilCanonique : nouveaux noms, anciens alias, tout le reste refusé', () => {
    assert.deepEqual(PROFILS, ['lecture', 'ecriture', 'complet']);
    assert.deepEqual({ ...ALIAS_PROFILS }, { lecteur: 'lecture', bibliothecaire: 'ecriture', 'claude-code': 'complet' });
    for (const p of PROFILS) assert.equal(profilCanonique(p), p);
    for (const [ancien, nouveau] of Object.entries(ALIAS_PROFILS)) assert.equal(profilCanonique(ancien), nouveau);
    for (const x of ['root', '', null, undefined, 42, 'Bibliothecaire', 'LECTURE', 'constructor', '__proto__', 'toString', ['complet']]) assert.equal(profilCanonique(x), null, String(x));
  });

  test('2 analyserSecret : un ancien nom devient le nom canonique ; un nom inconnu ou en majuscules est refusé et compté', () => {
    for (const [ancien, nouveau] of Object.entries(ALIAS_PROFILS)) {
      const r = analyserSecret(JSON.stringify([entree(JETONS.code, 'x-essai', ancien)]));
      assert.equal(r.entrees[0].profil, nouveau);
      assert.equal(r.invalides, 0);
    }
    assert.equal(analyserSecret(JSON.stringify([entree(JETONS.code, 'x-essai', 'ecriture')])).entrees[0].profil, 'ecriture');
    for (const mauvais of ['root', 'Bibliothecaire']) {
      const r = analyserSecret(JSON.stringify([entree(JETONS.code, 'x-essai', mauvais)]));
      assert.equal(r.entrees.length, 0, mauvais);
      assert.equal(r.invalides, 1, mauvais);
    }
  });

  test('3 outilsAutorises : lecture, ecriture et complet = les listes de D3d ; un alias ou un profil inconnu ne reçoit rien ; readOnlyHint pour la lecture seulement', () => {
    const lecture = noms('lecture'), ecriture = noms('ecriture'), complet = noms('complet');
    assert.equal(complet.length, OUTILS.length);
    assert.ok(lecture.length > 0 && lecture.every((n) => ecriture.includes(n)) && ecriture.every((n) => complet.includes(n)));
    const reserves = complet.filter((n) => !ecriture.includes(n));
    assert.deepEqual(reserves, [...new Set(['finaliser_devis', 'changer_statut_devis', 'recalculer_montants_affaires', 'recalculer_usage_articles', 'restaurer_depuis_audit', ...complet.filter((n) => n.startsWith('supprimer_'))])].sort());
    for (const n of ecriture) assert.ok(!n.startsWith('supprimer_') && n !== 'restaurer_depuis_audit', n);
    assert.ok(ecriture.includes('creer_personne') && !lecture.includes('creer_personne'));
    assert.deepEqual(outilsAutorises('bibliothecaire', OUTILS), []);
    assert.deepEqual(outilsAutorises('claude-code', OUTILS), []);
    assert.deepEqual(outilsAutorises('root', OUTILS), []);
    for (const o of OUTILS) assert.equal(annotationsDe(o).readOnlyHint, lecture.includes(o.nom), o.nom);
  });

  for (const [titre, secret] of [['ANCIENS noms dans le secret', SECRET_ANCIEN], ['NOUVEAUX noms dans le secret', SECRET_NOUVEAU]]) {
    test(`4-5 bout en bout, ${titre} : mêmes droits, qui_suis_je canonique, refus des outils réservés`, async () => {
      const s = await monter(secret);
      assert.deepEqual(await s.liste('lecteur'), noms('lecture'));
      assert.deepEqual(await s.liste('biblio'), noms('ecriture'));
      assert.deepEqual(await s.liste('code'), noms('complet'));
      const moi = await s.appeler('biblio', 'qui_suis_je');
      assert.equal(moi.data.profil, 'ecriture');
      assert.equal(moi.data.acteur, 'hermes-bibliothecaire');
      assert.equal((await s.appeler('code', 'qui_suis_je')).data.profil, 'complet');
      assert.equal((await s.appeler('lecteur', 'qui_suis_je')).data.profil, 'lecture');
      const avant = structuredClone(s.collections);
      for (const outil of ['supprimer_personne', 'restaurer_depuis_audit', 'finaliser_devis']) {
        const r = await s.appeler('biblio', outil, { id: 'p1', operationId: 'x' });
        assert.equal(r.isError, true, outil);
        assert.match(r.texte, /not found/i, `${outil} : refusé comme outil inconnu pour ce profil, pas pour des arguments invalides`);
      }
      assert.equal((await s.appeler('lecteur', 'creer_personne', { nom: 'Essai' })).isError, true);
      assert.deepEqual(s.collections, avant, 'rien d’écrit par un refus');
      assert.ok((await s.liste('code')).includes('supprimer_personne'));
    });
  }

  test('5 les listes d’outils sont identiques avec les anciens et les nouveaux noms', async () => {
    const a = await monter(SECRET_ANCIEN), b = await monter(SECRET_NOUVEAU);
    for (const cle of ['lecteur', 'biblio', 'code']) assert.deepEqual(await a.liste(cle), await b.liste(cle), cle);
  });

  test('6 un profil inconnu (root, admin, Bibliothecaire) : 401 non_autorise, identique à un jeton faux, code jeton dans le journal', async () => {
    for (const mauvais of ['root', 'admin', 'Bibliothecaire']) {
      const s = await monter([entree(JETONS.code, 'client-essai', mauvais)]);
      const r = await s.brut(JETONS.code, 'tools/list');
      const faux = await s.brut(`cia_${'Z'.repeat(43)}`, 'tools/list');
      assert.equal(r.status, 401, mauvais);
      const texte = await r.text();
      assert.equal(texte, await faux.text());
      assert.equal(texte, '{"error":"non_autorise"}');
      assert.ok(s.lignesJournal.some((l) => l.code === 'jeton'), `code jeton dans le journal (${mauvais})`);
    }
  });

  test('cas vide : un secret sans aucune entrée valide refuse tout le monde (401)', async () => {
    const s = await monter([]);
    for (const cle of ['lecteur', 'biblio', 'code']) assert.equal((await s.brut(s.jetons[cle], 'tools/list')).status, 401, cle);
  });

  test('7 marquer_test sur un devis FINALISÉ : profils ecriture et bibliothecaire refusés (profil complet), claude-code et complet passent avec l’aperçu et le code', async () => {
    const devis = { id: 'v1', racineId: 'v1', version: 1, numero: 'DEV-2026-10-01-v1', statut: 'accepte', affaireId: 'a1', organisationId: 'org1', personneId: null, objet: 'Objet v1', nom: '', destinataires: [{ email: 'client@exemple.test' }], modeMarge: 'majoration', marge: 0, tauxTvaDefaut: 20, regimeTva: 'assujetti', archive: false, creeLe: new Date('2026-10-01T08:00:00Z'), finaliseLe: new Date('2026-10-02T08:00:00Z'), expireLe: '2027-01-22', totaux: { ht: 1200, ttc: 1440, tva: 240 }, sections: [{ id: 's-v1', titre: '', lignes: [{ id: 'l-v1', articleId: 'art1', libelle: 'Forfait', unite: 'forfait', quantite: 1, prixAchat: 1200, prixVente: 1200 }] }] };
    for (const [titre, secret] of [['anciens', SECRET_ANCIEN], ['nouveaux', SECRET_NOUVEAU]]) {
      const collections = structuredClone(base);
      Object.assign(collections, { devis_articles: [], devis_devis: [structuredClone(devis)], devis_compteurs: [], devis_usage_articles: [], projets_projets: [], projets_taches: [], projets_modeles: [], devis_parametres: [{ id: 'reglages', regimeTva: 'assujetti', marge: 0, modeMarge: 'majoration' }] });
      collections.crm_parametres.push({ id: 'etiquettes', items: [] });
      const s = await monter(secret, { collections });
      const avant = structuredClone(collections.devis_devis);
      const r = await s.appeler('biblio', 'marquer_test', { type: 'devis', id: 'v1' });
      assert.equal(r.isError, true, titre);
      assert.match(r.texte, /profil complet/, titre);
      assert.deepEqual(collections.devis_devis, avant, `rien d’écrit (${titre})`);
      const apercu = await s.appeler('code', 'marquer_test', { type: 'devis', id: 'v1' });
      assert.equal(apercu.isError, false, apercu.texte);
      assert.equal(apercu.data.apercu, true);
      assert.deepEqual(collections.devis_devis, avant, 'aperçu : rien d’écrit');
      const fait = await s.appeler('code', 'marquer_test', { type: 'devis', id: 'v1', codeConfirmation: apercu.data.code });
      assert.equal(fait.isError, false, fait.texte);
      assert.equal(collections.devis_devis.find((d) => d.id === 'v1').test, true);
    }
  });

  test('8 OAuth : PROFIL_OAUTH = complet ; PROFIL_PAR_ROLE = rôles vers profils canoniques, mêmes clés que ROLES', () => {
    assert.equal(PROFIL_OAUTH, 'complet');
    assert.deepEqual({ ...PROFIL_PAR_ROLE }, { lecteur: 'lecture', editeur: 'complet' });
    assert.deepEqual(Object.keys(PROFIL_PAR_ROLE).sort(), Object.keys(ROLES).sort());
    for (const p of Object.values(PROFIL_PAR_ROLE)) assert.ok(PROFILS.includes(p), p);
  });

  test('9 journal HTTP : l’appel d’un jeton déclaré bibliothecaire porte le profil ecriture, jamais le secret ni le jeton', async () => {
    const s = await monter(SECRET_ANCIEN);
    await s.appeler('biblio', 'qui_suis_je');
    const ligne = s.lignesJournal.find((l) => l.acteur === 'hermes-bibliothecaire');
    assert.ok(ligne, 'ligne de journal');
    assert.equal(ligne.profil, 'ecriture');
    const tout = JSON.stringify(s.lignesJournal);
    for (const j of Object.values(JETONS)) assert.equal(tout.includes(j), false);
    assert.equal(tout.includes('Bearer'), false);
  });

  test('10 outils/creer-jeton.js : écrit le nom canonique (aussi pour un ancien nom), refuse un profil inconnu, ne montre jamais le jeton dans la ligne', () => {
    const lancer = (...args) => execFileSync('node', ['outils/creer-jeton.js', ...args], { cwd: RACINE, stdio: 'pipe' }).toString();
    for (const [saisi, ecrit] of [['ecriture', 'ecriture'], ['bibliothecaire', 'ecriture'], ['lecteur', 'lecture'], ['claude-code', 'complet'], ['complet', 'complet']]) {
      const sortie = lancer('n8n-devis', saisi);
      const jeton = /cia_[A-Za-z0-9_-]{43}/.exec(sortie)[0];
      const ligne = JSON.parse(/\{.*\}/.exec(sortie.split('LIGNE')[1])[0]);
      assert.equal(ligne.profil, ecrit, saisi);
      assert.equal(ligne.empreinte, empreinte(jeton));
      assert.equal(JSON.stringify(ligne).includes(jeton), false);
    }
    assert.throws(() => lancer('x-essai', 'root'), (e) => e.status === 1);
  });

  test('12 aucun fichier de functions/src (hors securite/jetons.js) ne garde un ancien nom de profil comme valeur', () => {
    const fichiers = [];
    const parcourir = (dir) => { for (const f of readdirSync(dir)) { const p = join(dir, f); if (statSync(p).isDirectory()) parcourir(p); else if (p.endsWith('.js')) fichiers.push(p); } };
    parcourir(join(RACINE, 'functions/src'));
    const trouves = [];
    for (const f of fichiers) {
      if (f.endsWith(join('securite', 'jetons.js'))) continue;
      readFileSync(f, 'utf8').split('\n').forEach((l, i) => {
        if (/['"](lecteur|bibliothecaire|claude-code)['"]/.test(l) && !/\b(role|rôle|roles)\b/i.test(l)) trouves.push(`${f}:${i + 1}`);
      });
    }
    assert.deepEqual(trouves, []);
  });
});
