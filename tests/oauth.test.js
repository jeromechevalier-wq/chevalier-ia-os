// Tests de la connexion OAuth du serveur MCP (téléphone, claude.ai) : métadonnées, enregistrement, page de consentement, code + PKCE,
// renouvellement avec rotation, révocation, et surtout : les jetons « cia_… » (Hermes, Claude Code) continuent de fonctionner comme avant.
// Un vrai client MCP (SDK officiel) appelle le gestionnaire sur un serveur HTTP local ; Google est remplacé par un vérificateur factice.
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Client } from '../functions/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StreamableHTTPClientTransport } from '../functions/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
import { creerGestionnaire } from '../functions/src/mcp/gestionnaire.js';
import { empreinte, creerMagasin, trouverJeton } from '../functions/src/securite/jetons.js';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { creerRouteurOauth, validerDemande } from '../functions/src/oauth/routeur.js';
import { acteurDuCompte } from '../functions/src/oauth/magasin.js';
import { COMPTES_AUTORISES, DUREES, EMETTEUR, RESSOURCE } from '../functions/src/oauth/config.js';
import { CONFIG_FIREBASE, pageAutorisation } from '../functions/src/oauth/page.js';
import { collections } from './_donnees-essai.js';

const RACINE = new URL('../', import.meta.url);
const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
const APPLI = 'https://chevalier-ia-os.web.app';
const JERO = 'jerome.chevalier@gmail.com';
const HERMES = `cia_${'H'.repeat(43)}`;

const SECRET = JSON.stringify([{ jeton: 'hermes-bibliothecaire', acteur: 'hermes-bibliothecaire', profil: 'bibliothecaire', empreinte: empreinte(HERMES), actif: true }]);

// Identités Google factices : le « jeton d'identité » dit tout (ce que Google garantirait en vrai).
const IDENTITES = {
  'ID-JEROME': { email: JERO, emailVerifie: true, fournisseur: 'google.com' },
  'ID-CHARLES': { email: 'jeromebot.chevalierbot@gmail.com', emailVerifie: true, fournisseur: 'google.com' },
  'ID-INCONNU': { email: 'intrus@gmail.com', emailVerifie: true, fournisseur: 'google.com' },
  'ID-NON-VERIFIE': { email: JERO, emailVerifie: false, fournisseur: 'google.com' },
  'ID-MOT-DE-PASSE': { email: JERO, emailVerifie: true, fournisseur: 'password' },
};

let serveur, base, donnees, horloge, lignesJournal, panneFirestore;
const maintenant = () => horloge;

before(async () => {
  const magasin = creerMagasin({ lire: async () => SECRET, dureeCacheMs: 0 });
  donnees = creerAccesMemoire(structuredClone(collections));
  const lire = donnees.document;
  donnees.document = async (...a) => { if (panneFirestore) throw new Error('Firestore en panne : détail interne'); return lire(...a); };
  const oauth = creerRouteurOauth({
    donnees,
    verifierIdToken: async (jeton) => { const i = IDENTITES[jeton]; if (!i) throw new Error('jeton Google invalide'); return i; },
    maintenant,
    limitePostParMinute: 1_000_000, // le frein a son propre test, plus bas
  });
  const gestionnaire = creerGestionnaire({ magasin, donnees, oauth, maintenant, journal: (e) => { lignesJournal.push(e); } });
  serveur = createServer((req, res) => {
    const morceaux = [];
    req.on('data', (m) => morceaux.push(m));
    req.on('end', () => {
      const t = Buffer.concat(morceaux).toString('utf8');
      const type = req.headers['content-type'] || '';
      try {
        if (!t) req.body = undefined;
        else if (type.includes('application/x-www-form-urlencoded')) req.body = Object.fromEntries(new URLSearchParams(t));
        else req.body = JSON.parse(t);
      } catch { req.body = undefined; }
      gestionnaire(req, res);
    });
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${serveur.address().port}`;
});
after(() => serveur.close());
beforeEach(async () => {
  horloge = Date.parse('2026-10-10T08:00:00Z');
  lignesJournal = [];
  panneFirestore = false;
  await donnees.appliquer((await donnees.liste('mcp_oauth')).map((d) => ({ type: 'delete', collection: 'mcp_oauth', id: d.id })));
});

// --- outils de test -----------------------------------------------------------------------------------------------------------------
const pkce = () => {
  const verifier = randomBytes(32).toString('base64url');
  return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') };
};
const demandeValide = (p = pkce(), extra = {}) => ({ response_type: 'code', client_id: 'cli_essai', redirect_uri: CALLBACK, code_challenge: p.challenge, code_challenge_method: 'S256', state: 'etat-1', resource: RESSOURCE, ...extra });
const approuver = (corps, { origine = APPLI } = {}) => fetch(`${base}/oauth/approve`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', ...(origine ? { Origin: origine } : {}) }, body: JSON.stringify(corps),
});
const jeton = (champs) => fetch(`${base}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(champs) });
const mcp = (bearer, corps = { jsonrpc: '2.0', id: 1, method: 'tools/list' }) => fetch(`${base}/mcp`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify(corps),
});
async function client(bearer) {
  const c = new Client({ name: 'essai', version: '1.0.0' });
  await c.connect(new StreamableHTTPClientTransport(new URL(`${base}/mcp`), { requestInit: { headers: { Authorization: `Bearer ${bearer}` } } }));
  return c;
}
/** Parcours complet jusqu'au code : le code est lu dans l'adresse de retour, comme le ferait claude.ai. */
async function obtenirCode({ identite = 'ID-JEROME', p = pkce(), demande } = {}) {
  const r = await approuver({ ...(demande || demandeValide(p)), decision: 'allow', id_token: identite });
  assert.equal(r.status, 200, await r.clone().text());
  const adresse = new URL((await r.json()).redirect);
  return { code: adresse.searchParams.get('code'), adresse, p };
}
async function ouvrirSession({ identite, p = pkce() } = {}) {
  const { code } = await obtenirCode({ identite, p });
  const r = await jeton({ grant_type: 'authorization_code', code, redirect_uri: CALLBACK, client_id: 'cli_essai', code_verifier: p.verifier });
  assert.equal(r.status, 200, await r.clone().text());
  return r.json();
}
const documents = (prefixe) => (donnees.liste ? donnees.liste('mcp_oauth').then((l) => l.filter((d) => d.id.startsWith(prefixe))) : []);

describe('Métadonnées et 401 : de quoi claude.ai a besoin pour démarrer la connexion', () => {
  test('/mcp sans jeton : 401 avec l’adresse des métadonnées (resource_metadata), et toujours la même réponse', async () => {
    const reponses = [];
    for (const j of [undefined, `cia_${'Z'.repeat(43)}`, `cia_a_${'Z'.repeat(43)}`, 'nimporte quoi']) {
      const r = await mcp(j);
      assert.equal(r.status, 401);
      assert.equal(r.headers.get('www-authenticate'), `Bearer resource_metadata="${EMETTEUR}/.well-known/oauth-protected-resource/mcp"`);
      reponses.push(await r.text());
    }
    assert.equal(new Set(reponses).size, 1);
    assert.equal(reponses[0], '{"error":"non_autorise"}');
  });
  test('ressource protégée : « resource » = l’adresse exacte du serveur MCP, un seul serveur d’autorisation, aux deux adresses', async () => {
    for (const chemin of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
      const r = await fetch(`${base}${chemin}`);
      assert.equal(r.status, 200);
      assert.equal(r.headers.get('cache-control'), 'no-store');
      const m = await r.json();
      assert.equal(m.resource, 'https://chevalier-ia-os.web.app/mcp');
      assert.deepEqual(m.authorization_servers, ['https://chevalier-ia-os.web.app']);
    }
  });
  test('serveur d’autorisation : PKCE S256 seul, client public, code + renouvellement, adresses sous l’émetteur', async () => {
    const m = await (await fetch(`${base}/.well-known/oauth-authorization-server`)).json();
    assert.equal(m.issuer, EMETTEUR);
    assert.deepEqual(m.code_challenge_methods_supported, ['S256']);
    assert.deepEqual(m.token_endpoint_auth_methods_supported, ['none']);
    assert.deepEqual(m.grant_types_supported, ['authorization_code', 'refresh_token']);
    assert.deepEqual(m.response_types_supported, ['code']);
    for (const k of ['authorization_endpoint', 'token_endpoint', 'registration_endpoint']) assert.ok(m[k].startsWith(`${EMETTEUR}/oauth/`), k);
    assert.equal(m.client_id_metadata_document_supported, undefined, 'pas de CIMD : Claude utilise l’enregistrement dynamique');
  });
  test('métadonnées : seul GET est accepté', async () => {
    const r = await fetch(`${base}/.well-known/oauth-authorization-server`, { method: 'POST' });
    assert.equal(r.status, 405);
  });
});

describe('Enregistrement du client (DCR)', () => {
  const enregistrer = (corps) => fetch(`${base}/oauth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
  test('adresse de retour de Claude : accepté, client public sans secret', async () => {
    const r = await enregistrer({ client_name: 'Claude', redirect_uris: [CALLBACK], grant_types: ['authorization_code', 'refresh_token'], response_types: ['code'], token_endpoint_auth_method: 'none' });
    assert.equal(r.status, 201);
    const c = await r.json();
    assert.match(c.client_id, /^cli_[A-Za-z0-9_-]{20,}$/);
    assert.deepEqual(c.redirect_uris, [CALLBACK]);
    assert.equal(c.token_endpoint_auth_method, 'none');
    assert.equal(c.client_secret, undefined);
  });
  test('adresse de retour inconnue, vide, ou client avec secret : refusé', async () => {
    for (const corps of [
      { redirect_uris: ['https://attaquant.example/rappel'] },
      { redirect_uris: [CALLBACK, 'https://attaquant.example/rappel'] },
      { redirect_uris: ['http://localhost:3118/callback'] },
      { redirect_uris: [] },
      {},
      { redirect_uris: [CALLBACK], token_endpoint_auth_method: 'client_secret_basic' },
    ]) assert.equal((await enregistrer(corps)).status, 400, JSON.stringify(corps));
  });
});

describe('ChatGPT (20/10/2026) : adresse de retour acceptée, nommée chatgpt-<compte>', () => {
  const CHATGPT = 'https://chatgpt.com/connector/oauth/abc123_DEF-456';
  const enregistrer = (corps) => fetch(`${base}/oauth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(corps) });
  test('enregistrement : l’adresse de ChatGPT (avec identifiant) et l’ancienne adresse fixe sont acceptées', async () => {
    for (const uri of [CHATGPT, 'https://chatgpt.com/connector_platform_oauth_redirect']) {
      const r = await enregistrer({ client_name: 'ChatGPT', redirect_uris: [uri], token_endpoint_auth_method: 'none' });
      assert.equal(r.status, 201, uri);
      assert.deepEqual((await r.json()).redirect_uris, [uri]);
    }
  });
  test('enregistrement : adresses imitant ChatGPT refusées (autre hôte, sous-domaine, chemin voisin, http, identifiant vide ou piégé)', async () => {
    for (const uri of ['https://chatgpt.com.pirate.example/connector/oauth/x', 'https://pirate.chatgpt.com/connector/oauth/x', 'https://chatgpt.com/connector/oauth/',
      'https://chatgpt.com/connector/oauth/a/b', 'https://chatgpt.com/connector/oauth/a?x=1', 'https://chatgpt.com/autre', 'http://chatgpt.com/connector/oauth/x', 'https://chatgpt.com@pirate.example/connector/oauth/x']) {
      assert.equal((await enregistrer({ redirect_uris: [uri] })).status, 400, uri);
    }
  });
  test('parcours complet depuis ChatGPT : la page dit ChatGPT, le compte autorisé obtient un jeton, l’acteur est chatgpt-<compte>, les droits sont ceux de Claude', async () => {
    const p = pkce();
    const demande = demandeValide(p, { redirect_uri: CHATGPT });
    const page = await (await fetch(`${base}/oauth/authorize?${new URLSearchParams(demande)}`)).text();
    assert.match(page, /Autoriser ChatGPT à accéder à Chevalier IA OS/);
    const { code, adresse } = await obtenirCode({ demande, p });
    assert.equal(adresse.origin + adresse.pathname, CHATGPT);
    const r = await jeton({ grant_type: 'authorization_code', code, redirect_uri: CHATGPT, client_id: 'cli_essai', code_verifier: p.verifier });
    assert.equal(r.status, 200, await r.clone().text());
    const t = await r.json();
    const c = await client(t.access_token);
    const qui = JSON.parse((await c.callTool({ name: 'qui_suis_je', arguments: {} })).content[0].text);
    assert.equal(qui.acteur, 'chatgpt-jerome-chevalier');
    assert.equal(qui.profil, 'claude-code');
    await c.close();
    const r2 = await jeton({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: 'cli_essai' });
    const c2 = await client((await r2.json()).access_token);
    assert.equal(JSON.parse((await c2.callTool({ name: 'qui_suis_je', arguments: {} })).content[0].text).acteur, 'chatgpt-jerome-chevalier');
    await c2.close();
  });
  test('un autre compte Google que ceux de Jérôme reste refusé, même depuis ChatGPT', async () => {
    const r = await approuver({ ...demandeValide(pkce(), { redirect_uri: CHATGPT }), decision: 'allow', id_token: 'ID-INCONNU' });
    assert.equal(r.status, 403);
    assert.equal((await documents('code_')).length, 0);
  });
});

describe('Page d’autorisation (GET /oauth/authorize)', () => {
  const page = (params) => fetch(`${base}/oauth/authorize?${new URLSearchParams(params)}`);
  test('demande valide : page de connexion + consentement, jamais encadrable ni mise en cache', async () => {
    const r = await page(demandeValide());
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type'), /text\/html/);
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    const html = await r.text();
    assert.match(html, /Se connecter avec Google/);
    assert.match(html, /supprimer/, 'le consentement dit clairement que les droits incluent la suppression');
  });
  test('demande invalide : page d’erreur, JAMAIS de redirection (adresse de retour inconnue, PKCE absent ou faible, ressource inconnue)', async () => {
    const p = pkce();
    for (const [nom, params] of [
      ['adresse inconnue', demandeValide(p, { redirect_uri: 'https://attaquant.example/rappel' })],
      ['adresse proche', demandeValide(p, { redirect_uri: `${CALLBACK}/../x` })],
      ['sans PKCE', (() => { const d = demandeValide(p); delete d.code_challenge; return d; })()],
      ['PKCE « plain »', demandeValide(p, { code_challenge_method: 'plain' })],
      ['mauvais type', demandeValide(p, { response_type: 'token' })],
      ['ressource inconnue', demandeValide(p, { resource: 'https://autre.example/mcp' })],
      ['client invalide', demandeValide(p, { client_id: 'x y<script>' })],
    ]) {
      const r = await fetch(`${base}/oauth/authorize?${new URLSearchParams(params)}`, { redirect: 'manual' });
      assert.equal(r.status, 400, nom);
      assert.equal(r.headers.get('location'), null, nom);
    }
  });
  test('« resource » : l’adresse de Claude avec ou sans barre finale passe ; un autre site est refusé', async () => {
    for (const resource of [RESSOURCE, `${RESSOURCE}/`, EMETTEUR]) assert.equal((await page(demandeValide(pkce(), { resource }))).status, 200, resource);
    assert.equal((await page(demandeValide(pkce(), { resource: 'https://chevalier-ia-os.web.app.attaquant.example/mcp' }))).status, 400);
    assert.equal((await page(demandeValide(pkce(), { resource: 'pas une adresse' }))).status, 400);
  });
  test('une valeur piégée (state) ne peut pas refermer la balise du script ni injecter du HTML', async () => {
    const piege = '</script><script>alert(1)</script><img src=x onerror=alert(2)>';
    const html = await (await page(demandeValide(pkce(), { state: piege }))).text();
    assert.ok(!html.includes('</script><script>alert(1)'));
    assert.ok(!html.includes('<img src=x'));
    assert.ok(html.includes('\\u003c/script\\u003e'));
  });
  test('le script de la page est une syntaxe valide (module)', () => {
    const html = pageAutorisation({ client_id: 'c', redirect_uri: CALLBACK, code_challenge: 'x'.repeat(43) });
    const m = /<script type="module">([\s\S]*?)<\/script>/.exec(html);
    const dossier = mkdtempSync(join(tmpdir(), 'oauth-page-'));
    writeFileSync(join(dossier, 'page.mjs'), m[1]);
    execFileSync(process.execPath, ['--check', join(dossier, 'page.mjs')]);
  });
  test('la configuration Firebase de la page est celle de l’appli (même projet, même domaine de connexion)', () => {
    const appli = readFileSync(new URL('js/os/firebase-config.js', RACINE), 'utf8');
    for (const [cle, valeur] of Object.entries(CONFIG_FIREBASE)) assert.ok(appli.includes(`${cle}: "${valeur}"`), cle);
  });
});

describe('Consentement (POST /oauth/approve) : seul un compte Google autorisé obtient un code', () => {
  test('sans en-tête Origin ou depuis un autre site : refusé (403), rien n’est créé', async () => {
    for (const origine of [null, 'https://attaquant.example']) {
      const r = await approuver({ ...demandeValide(), decision: 'allow', id_token: 'ID-JEROME' }, { origine });
      assert.equal(r.status, 403);
    }
    assert.equal((await documents('code_')).length, 0);
  });
  test('compte non autorisé, adresse non vérifiée, connexion autre que Google, jeton Google invalide : refusé, aucun code', async () => {
    const statuts = {};
    for (const id of ['ID-INCONNU', 'ID-NON-VERIFIE', 'ID-MOT-DE-PASSE', 'ID-FAUX', '']) {
      statuts[id] = (await approuver({ ...demandeValide(), decision: 'allow', id_token: id })).status;
    }
    assert.deepEqual(statuts, { 'ID-INCONNU': 403, 'ID-NON-VERIFIE': 403, 'ID-MOT-DE-PASSE': 403, 'ID-FAUX': 401, '': 401 });
    assert.equal((await documents('code_')).length, 0);
  });
  test('demande invalide revérifiée côté serveur (la page peut être falsifiée) : adresse de retour piégée refusée', async () => {
    const r = await approuver({ ...demandeValide(pkce(), { redirect_uri: 'https://attaquant.example/rappel' }), decision: 'allow', id_token: 'ID-JEROME' });
    assert.equal(r.status, 400);
    assert.equal((await documents('code_')).length, 0);
  });
  test('la page envoie exactement la demande que le serveur lui a donnée à valider (rien de plus) : le code est délivré', async () => {
    const { demande } = validerDemande(demandeValide());
    assert.deepEqual(Object.keys(demande).sort(), ['client_id', 'code_challenge', 'redirect_uri', 'resource', 'state']);
    const r = await approuver({ ...demande, decision: 'allow', id_token: 'ID-JEROME' });
    assert.equal(r.status, 200);
  });
  test('refus de l’utilisateur : retour vers Claude avec access_denied et le state, sans code', async () => {
    const r = await approuver({ ...demandeValide(), decision: 'deny' });
    const a = new URL((await r.json()).redirect);
    assert.equal(a.origin + a.pathname, CALLBACK);
    assert.equal(a.searchParams.get('error'), 'access_denied');
    assert.equal(a.searchParams.get('state'), 'etat-1');
    assert.equal(a.searchParams.get('code'), null);
  });
  test('compte autorisé : code à usage unique renvoyé à Claude avec le state ; seule l’empreinte du code est gardée', async () => {
    const { code, adresse } = await obtenirCode();
    assert.equal(adresse.origin + adresse.pathname, CALLBACK);
    assert.equal(adresse.searchParams.get('state'), 'etat-1');
    assert.match(code, /^cia_c_[A-Za-z0-9_-]{43}$/);
    const stockes = JSON.stringify(await donnees.liste('mcp_oauth'));
    assert.ok(!stockes.includes(code), 'le code n’est jamais stocké en clair');
    assert.ok(stockes.includes(createHash('sha256').update(code).digest('hex')));
  });
  test('le second compte autorisé (liste des règles Firestore) peut aussi se connecter, avec son propre nom d’acteur', async () => {
    const t = await ouvrirSession({ identite: 'ID-CHARLES' });
    const c = await client(t.access_token);
    assert.equal(JSON.parse((await c.callTool({ name: 'qui_suis_je', arguments: {} })).content[0].text).acteur, 'claude-ai-jeromebot-chevalierbot');
    await c.close();
  });
});

describe('Propriétaire par défaut sur le serveur de Jérôme (point 2)', () => {
  test('P2 une connexion Google crée une fiche au nom du compte connecté (Jérôme ou Charles, comme à l’écran)', async () => {
    for (const [identite, email] of [['ID-JEROME', JERO], ['ID-CHARLES', 'jeromebot.chevalierbot@gmail.com']]) {
      const t = await ouvrirSession({ identite });
      const c = await client(t.access_token);
      const r = JSON.parse((await c.callTool({ name: 'creer_personne', arguments: { nom: `Fiche de ${identite}` } })).content[0].text);
      assert.equal((await donnees.liste('crm_personnes')).find((d) => d.id === r.id).proprietaire, email);
      await c.close();
    }
  });
});

describe('Jetons (POST /oauth/token) : code + PKCE, puis accès à /mcp', () => {
  test('parcours complet : le jeton d’accès ouvre /mcp avec TOUS les droits (profil claude-code, suppression comprise), acteur nommé d’après le compte', async () => {
    const t = await ouvrirSession();
    assert.equal(t.token_type, 'Bearer');
    assert.equal(t.expires_in, 3600);
    assert.match(t.access_token, /^cia_a_[A-Za-z0-9_-]{43}$/);
    assert.match(t.refresh_token, /^cia_r_[A-Za-z0-9_-]{43}$/);
    const c = await client(t.access_token);
    const qui = JSON.parse((await c.callTool({ name: 'qui_suis_je', arguments: {} })).content[0].text);
    assert.equal(qui.acteur, 'claude-ai-jerome-chevalier');
    assert.equal(qui.profil, 'claude-code');
    assert.ok(qui.outils.includes('supprimer_personne') && qui.outils.includes('restaurer_depuis_audit') && qui.outils.includes('creer_personne'));
    await c.close();
  });
  test('réponse du jeton : jamais mise en cache', async () => {
    const p = pkce();
    const { code } = await obtenirCode({ p });
    const r = await jeton({ grant_type: 'authorization_code', code, redirect_uri: CALLBACK, client_id: 'cli_essai', code_verifier: p.verifier });
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.headers.get('pragma'), 'no-cache');
  });
  test('mauvaise preuve PKCE, mauvais client, mauvaise adresse de retour : invalid_grant (même message), et le code est brûlé', async () => {
    const messages = new Set();
    for (const [nom, change] of [
      ['verifier', { code_verifier: randomBytes(32).toString('base64url') }],
      ['verifier court', { code_verifier: 'court' }],
      ['client', { client_id: 'cli_autre' }],
      ['adresse', { redirect_uri: 'https://claude.com/api/mcp/auth_callback' }],
    ]) {
      const p = pkce();
      const { code } = await obtenirCode({ p });
      const r = await jeton({ grant_type: 'authorization_code', code, redirect_uri: CALLBACK, client_id: 'cli_essai', code_verifier: p.verifier, ...change });
      assert.equal(r.status, 400, nom);
      const j = await r.json();
      assert.equal(j.error, 'invalid_grant', nom);
      messages.add(j.error_description);
      const encore = await jeton({ grant_type: 'authorization_code', code, redirect_uri: CALLBACK, client_id: 'cli_essai', code_verifier: p.verifier });
      assert.equal(encore.status, 400, `${nom} : le code ne sert plus après une tentative ratée`);
    }
    assert.equal(messages.size, 1, 'jamais de détail sur la raison du refus');
  });
  test('code expiré (plus de 60 s) ou inconnu : invalid_grant', async () => {
    const p = pkce();
    const { code } = await obtenirCode({ p });
    horloge += (DUREES.codeS + 1) * 1000;
    assert.equal((await jeton({ grant_type: 'authorization_code', code, redirect_uri: CALLBACK, client_id: 'cli_essai', code_verifier: p.verifier })).status, 400);
    assert.equal((await jeton({ grant_type: 'authorization_code', code: `cia_c_${'A'.repeat(43)}`, redirect_uri: CALLBACK, client_id: 'cli_essai', code_verifier: p.verifier })).status, 400);
  });
  test('code rejoué : refusé, ET la connexion déjà ouverte avec ce code est coupée (jeton d’accès et de renouvellement)', async () => {
    const p = pkce();
    const { code } = await obtenirCode({ p });
    const champs = { grant_type: 'authorization_code', code, redirect_uri: CALLBACK, client_id: 'cli_essai', code_verifier: p.verifier };
    const t = await (await jeton(champs)).json();
    assert.equal((await mcp(t.access_token)).status, 200);
    assert.equal((await jeton(champs)).status, 400);
    assert.equal((await mcp(t.access_token)).status, 401, 'la connexion est coupée');
    assert.equal((await jeton({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: 'cli_essai' })).status, 400);
  });
  test('type de demande inconnu, corps vide : erreurs OAuth normales ; GET refusé', async () => {
    assert.equal((await (await jeton({ grant_type: 'client_credentials' })).json()).error, 'unsupported_grant_type');
    assert.equal((await fetch(`${base}/oauth/token`, { method: 'POST' })).status, 400);
    assert.equal((await fetch(`${base}/oauth/token`)).status, 405);
    assert.equal((await fetch(`${base}/oauth/inconnu`)).status, 404);
  });
});

describe('Renouvellement et durée de connexion', () => {
  const renouveler = (t, extra = {}) => jeton({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: 'cli_essai', ...extra });
  test('rotation : un nouveau jeton d’accès ET un nouveau jeton de renouvellement ; l’ancien jeton de renouvellement est consommé', async () => {
    const t1 = await ouvrirSession();
    const r = await renouveler(t1);
    assert.equal(r.status, 200);
    const t2 = await r.json();
    assert.notEqual(t2.refresh_token, t1.refresh_token);
    assert.notEqual(t2.access_token, t1.access_token);
    assert.equal((await mcp(t2.access_token)).status, 200);
  });
  test('un ancien jeton de renouvellement rejoué (vol possible) coupe toute la connexion', async () => {
    const t1 = await ouvrirSession();
    const t2 = await (await renouveler(t1)).json();
    assert.equal((await renouveler(t1)).status, 400);
    assert.equal((await mcp(t2.access_token)).status, 401);
    assert.equal((await renouveler(t2)).status, 400);
  });
  test('jeton d’accès : valable une heure, puis 401 ; le renouvellement en donne un neuf', async () => {
    const t = await ouvrirSession();
    horloge += 3599 * 1000;
    assert.equal((await mcp(t.access_token)).status, 200);
    horloge += 2 * 1000;
    assert.equal((await mcp(t.access_token)).status, 401);
    assert.equal((await mcp((await (await renouveler(t)).json()).access_token)).status, 200);
  });
  test('30 jours glissants : un usage repousse l’échéance ; 30 jours sans usage et il faut se reconnecter', async () => {
    let t = await ouvrirSession();
    for (let i = 0; i < 3; i++) { // 3 renouvellements espacés de 20 jours : 60 jours au total, toujours connecté
      horloge += 20 * 86_400_000;
      const r = await renouveler(t);
      assert.equal(r.status, 200, `renouvellement ${i + 1}`);
      t = await r.json();
    }
    horloge += 31 * 86_400_000;
    assert.equal((await renouveler(t)).status, 400);
  });
  test('mauvais client ou jeton inventé : invalid_grant', async () => {
    const t = await ouvrirSession();
    assert.equal((await renouveler(t, { client_id: 'cli_autre' })).status, 400);
    assert.equal((await jeton({ grant_type: 'refresh_token', refresh_token: `cia_r_${'B'.repeat(43)}` })).status, 400);
  });
  test('ménage : on ne garde qu’une génération d’avance (pas d’accumulation de documents à chaque renouvellement)', async () => {
    let t = await ouvrirSession();
    for (let i = 0; i < 6; i++) t = await (await renouveler(t)).json();
    assert.equal((await documents('connexion_')).length, 1);
    assert.ok((await documents('refresh_')).length <= 2);
    assert.ok((await documents('acces_')).length <= 2);
  });
});

describe('Révocation : couper l’accès du téléphone', () => {
  test('mettre `revoque: true` sur la connexion, ou supprimer son document, coupe tout de suite l’accès (aucun cache)', async () => {
    for (const methode of ['drapeau', 'suppression']) {
      const t = await ouvrirSession();
      assert.equal((await mcp(t.access_token)).status, 200);
      const [connexion] = (await documents('connexion_')).slice(-1);
      if (methode === 'drapeau') await donnees.appliquer([{ type: 'update', collection: 'mcp_oauth', id: connexion.id, donnees: { revoque: true } }]);
      else await donnees.appliquer([{ type: 'delete', collection: 'mcp_oauth', id: connexion.id }]);
      assert.equal((await mcp(t.access_token)).status, 401, methode);
      assert.equal((await jeton({ grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: 'cli_essai' })).status, 400, methode);
    }
  });
  test('panne de Firestore : /mcp répond 503 (jamais 401, le client ne doit pas croire son jeton mauvais), sans détail interne', async () => {
    const t = await ouvrirSession();
    panneFirestore = true;
    const r = await mcp(t.access_token);
    panneFirestore = false;
    assert.equal(r.status, 503);
    assert.equal(await r.text(), '{"error":"indisponible"}');
  });
});

describe('Les jetons « cia_… » (Hermes, Claude Code) ne changent pas', () => {
  test('un jeton en en-tête fonctionne exactement comme avant, avec son profil limité (bibliothécaire : pas de suppression)', async () => {
    const c = await client(HERMES);
    const qui = JSON.parse((await c.callTool({ name: 'qui_suis_je', arguments: {} })).content[0].text);
    assert.equal(qui.acteur, 'hermes-bibliothecaire');
    assert.equal(qui.profil, 'bibliothecaire');
    assert.ok(!qui.outils.includes('supprimer_personne'));
    await c.close();
  });
  test('un jeton d’accès OAuth n’est jamais pris pour un jeton « cia_… » de la liste (formats distincts)', () => {
    assert.equal(trouverJeton([{ jeton: 'x', acteur: 'x', profil: 'lecteur', empreinte: empreinte(`cia_a_${'A'.repeat(43)}`), actif: true }], `cia_a_${'A'.repeat(43)}`), null);
  });
  test('l’authentification OAuth ne remplace pas le jeton : un jeton inconnu reste refusé, GET sur /mcp reste refusé (405)', async () => {
    assert.equal((await mcp(`cia_${'Q'.repeat(43)}`)).status, 401);
    assert.equal((await fetch(`${base}/mcp`, { headers: { Authorization: `Bearer ${HERMES}` } })).status, 405);
  });
});

describe('Journaux et secrets', () => {
  test('aucun code, jeton, state, adresse de retour ni jeton Google dans les journaux, et aucun jeton en clair dans la base', async () => {
    const p = pkce();
    const { code } = await obtenirCode({ p });
    const t = await (await jeton({ grant_type: 'authorization_code', code, redirect_uri: CALLBACK, client_id: 'cli_essai', code_verifier: p.verifier })).json();
    await mcp(t.access_token);
    await mcp(`cia_a_${'N'.repeat(43)}`);
    await approuver({ ...demandeValide(), decision: 'allow', id_token: 'ID-INCONNU' });
    const journal = JSON.stringify(lignesJournal);
    for (const secret of [code, t.access_token, t.refresh_token, p.verifier, p.challenge, 'etat-1', 'ID-JEROME', 'ID-INCONNU', CALLBACK]) assert.ok(!journal.includes(secret), `journal : ${secret.slice(0, 12)}…`);
    assert.ok(lignesJournal.some((l) => l.code === 'oauth_jeton_emis'));
    const base_ = JSON.stringify(await donnees.liste('mcp_oauth'));
    for (const secret of [code, t.access_token, t.refresh_token, p.verifier]) assert.ok(!base_.includes(secret), 'jamais de jeton en clair dans Firestore');
  });
  test('l’acteur d’une connexion respecte le format des noms de jetons (lettres minuscules, chiffres, tirets)', () => {
    for (const email of [JERO, 'JeromeBot.ChevalierBot@gmail.com', 'a+b@x.fr', '@x.fr']) assert.match(acteurDuCompte(email), /^[a-z0-9][a-z0-9-]{1,40}$/);
  });
});

describe('Cohérence avec le reste du dépôt', () => {
  test('les comptes autorisés du serveur sont exactement ceux de compteAutorise() dans firestore.rules', () => {
    const regles = readFileSync(new URL('firestore.rules', RACINE), 'utf8');
    const bloc = /request\.auth\.token\.email in \[([\s\S]*?)\]/.exec(regles)[1];
    const dansRegles = [...bloc.matchAll(/"([^"]+)"/g)].map((m) => m[1]).sort();
    assert.deepEqual([...COMPTES_AUTORISES].sort(), dansRegles);
  });
  test('frein : au-delà de la limite de requêtes POST par minute et par instance, 429', async () => {
    const oauth = creerRouteurOauth({ donnees, verifierIdToken: async () => { throw new Error('non'); }, limitePostParMinute: 3 });
    const petit = createServer((req, res) => {
      const morceaux = [];
      req.on('data', (m) => morceaux.push(m));
      req.on('end', () => { req.body = {}; oauth.traiter(req, res); });
    });
    await new Promise((ok) => petit.listen(0, '127.0.0.1', ok));
    try {
      const statuts = [];
      for (let i = 0; i < 5; i++) statuts.push((await fetch(`http://127.0.0.1:${petit.address().port}/oauth/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status);
      assert.deepEqual(statuts, [400, 400, 400, 429, 429]);
    } finally { petit.close(); }
  });
});
