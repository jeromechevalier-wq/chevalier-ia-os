// Tests du MCP des clients (functions/src/clients/) : un lien par client, comptes lus dans les membres, profil déduit du rôle, outils limités aux modules
// actifs, et surtout l'ÉTANCHÉITÉ entre clients (plan M1 à M15 de docs/mcp-multi-clients-en-reserve.md).
// Un vrai client MCP (SDK officiel) appelle le gestionnaire sur un serveur HTTP local ; la base est en mémoire ; Google est remplacé par un vérificateur factice.
// Deux clients de test, « a » et « b », avec des données reconnaissables (noms inventés) ; « sans-mcp » a le module éteint, « dormant » est désactivé.
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { z } from '../functions/node_modules/zod/index.js';
import { Client } from '../functions/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StreamableHTTPClientTransport } from '../functions/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
import { creerAccesMemoire, avecBase } from '../functions/src/coeur/donnees.js';
import { creerLimiteur, LIMITES_PAR_DEFAUT } from '../functions/src/securite/limites.js';
import { creerEspaces } from '../functions/src/clients/espaces.js';
import { creerRouteurOauthClients } from '../functions/src/clients/routeur-oauth.js';
import { creerGestionnaireClients, outilsDesModules, OUTILS_PAR_OPTION, NOM_SERVEUR_CLIENT } from '../functions/src/clients/gestionnaire.js';
import { OUTILS } from '../functions/src/mcp/outils/index.js';
import { EMETTEUR_PLATEFORME as EMETTEUR } from '../functions/src/clients/config.js';
import { collections } from './_donnees-essai.js';

const CLAUDE = 'https://claude.ai/api/mcp/auth_callback';
const CHATGPT = 'https://chatgpt.com/connector/oauth/abc123_DEF-456';
const ALICE = 'alice@exemple.test'; // éditrice chez A
const LEA = 'lea@exemple.test'; // lectrice chez A
const CLARA = 'clara@exemple.test'; // éditrice chez A, lectrice chez B
const BOB = 'bob@exemple.test'; // éditeur chez B
const ZOE = 'zoe@exemple.test'; // chez personne
const IDENTITES = {
  'ID-ALICE': { email: ALICE, emailVerifie: true, fournisseur: 'google.com' },
  'ID-LEA': { email: LEA, emailVerifie: true, fournisseur: 'google.com' },
  'ID-CLARA': { email: CLARA, emailVerifie: true, fournisseur: 'google.com' },
  'ID-BOB': { email: BOB, emailVerifie: true, fournisseur: 'google.com' },
  'ID-ZOE': { email: ZOE, emailVerifie: true, fournisseur: 'google.com' },
  'ID-ALICE-NON-VERIFIEE': { email: ALICE, emailVerifie: false, fournisseur: 'google.com' },
  'ID-ALICE-MOT-DE-PASSE': { email: ALICE, emailVerifie: true, fournisseur: 'password' },
  'ID-ALICE-MAJUSCULES': { email: 'Alice@Exemple.TEST', emailVerifie: true, fournisseur: 'google.com' },
};

/** Données d'un client : le jeu d'essai du CRM, avec des noms propres à ce client (pour reconnaître d'où vient une donnée). */
function donneesClient(client, marqueur) {
  const copie = structuredClone(collections);
  const jeu = {};
  for (const [nom, docs] of Object.entries(copie)) {
    jeu[`clients/${client}/${nom}`] = docs.map((d) => {
      const t = JSON.stringify(d).replaceAll('Camille Durand', `Camille ${marqueur}`).replaceAll('Atelier des Lilas', `Atelier ${marqueur}`).replaceAll('Site vitrine', `Site ${marqueur}`);
      return JSON.parse(t, (k, v) => (typeof v === 'string' && /^\d{4}-\d\d-\d\dT/.test(v) ? new Date(v) : v));
    });
  }
  return jeu;
}
const tout = (...ensembles) => Object.assign({}, ...ensembles);
const fichier = (client, nom, extra = {}) => ({ id: client, actif: true, nom, couleur: '#336699', ...extra });
/** Même jeu d'essai, avec des réglages précis : « a » a les deux options allumées, « c » n'a rien réglé (valeurs neutres : suivi des paiements et extraction éteints, dossier Drive et célébrations allumés). */
function avecReglages(jeu, client, reglages) {
  const nom = `clients/${client}/crm_parametres`;
  return { [nom]: jeu[nom].map((d) => (d.id === 'reglages' ? { ...d, ...reglages } : d)) };
}
function baseInitiale() {
  const a = donneesClient('a', 'ALPHA');
  return tout(
    a, avecReglages(a, 'a', { suiviPaiements: true }), donneesClient('b', 'BRAVO'), donneesClient('c', 'CHARLIE'),
    {
      marques: [
        fichier('a', 'Cabinet Alpha', { logo: 'https://exemple.test/alpha.png' }), fichier('b', 'Atelier Bravo', { couleur: '#aa3355' }),
        fichier('sans-mcp', 'Sans MCP'), fichier('dormant', 'Dormant', { actif: false }), fichier('c', 'Cabinet Charlie'),
      ],
      clients: [
        { id: 'a', modules: { affaires: true, projets: true, mcp: true } },
        { id: 'b', modules: { affaires: true, projets: false, mcp: true } },
        { id: 'sans-mcp', modules: { affaires: true, projets: true, mcp: false } },
        { id: 'dormant', modules: { affaires: true, mcp: true } },
        { id: 'c', modules: { affaires: true, projets: true, mcp: true } },
      ],
      'clients/b/crm_notes': [...donneesClient('b', 'BRAVO')['clients/b/crm_notes'], { id: 'n-seulement-b', texte: 'Note qui n’existe que chez Bravo.', personneId: 'p1' }],
      'clients/b/crm_activites': [...donneesClient('b', 'BRAVO')['clients/b/crm_activites'], { id: 'ac-seulement-b', titre: 'Activité qui n’existe que chez Bravo', type: 'tache', date: '2026-10-20', fait: false, personneId: 'p1' }],
      'clients/a/membres': [{ id: ALICE, role: 'editeur', nom: 'Alice' }, { id: LEA, role: 'lecteur' }, { id: CLARA, role: 'editeur' }],
      'clients/b/membres': [{ id: BOB, role: 'editeur' }, { id: CLARA, role: 'lecteur' }],
      'clients/sans-mcp/membres': [{ id: ALICE, role: 'editeur' }],
      'clients/dormant/membres': [{ id: ALICE, role: 'editeur' }],
      'clients/c/membres': [{ id: ALICE, role: 'editeur' }],
    },
  );
}

let serveur, base, donnees, lignesJournal, horloge, panne, panneReglages;
const maintenant = () => horloge;

before(async () => {
  donnees = creerAccesMemoire(baseInitiale());
  const lire = donnees.document;
  donnees.document = async (...a) => {
    if (panne || (panneReglages && String(a[0]).endsWith('/crm_parametres'))) throw new Error('Firestore en panne : détail interne');
    return lire(...a);
  };
  const oauth = creerRouteurOauthClients({
    donnees,
    espaces: creerEspaces({ donnees }),
    verifierIdToken: async (jeton) => { const i = IDENTITES[jeton]; if (!i) throw new Error('jeton Google invalide'); return i; },
    maintenant,
    limitePostParMinute: 1_000_000,
  });
  const gestionnaire = creerGestionnaireClients({ donnees, oauth, limiteur: creerLimiteur({ donnees, maintenant }), maintenant, journal: (e) => { lignesJournal.push(e); } });
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
beforeEach(() => { horloge = Date.parse('2026-10-16T08:00:00Z'); lignesJournal = []; panne = false; panneReglages = false; });

/** Remet la base dans son état de départ (les tests qui écrivent ou éteignent un module la restaurent). */
async function reinitialiser() {
  const neuf = baseInitiale();
  for (const nom of new Set([...Object.keys(neuf), ...['mcp_oauth', 'mcp_limites', 'clients/a/mcp_codes', 'clients/a/crm_audit', 'clients/a/crm_audit_avant']])) {
    const ecritures = [
      ...(await donnees.liste(nom)).map((d) => ({ type: 'delete', collection: nom, id: d.id })),
      ...(neuf[nom] || []).map((d) => ({ type: 'set', collection: nom, id: d.id, donnees: d })),
    ];
    if (ecritures.length) await donnees.appliquer(ecritures);
  }
}

// --- outils de test -----------------------------------------------------------------------------------------------------------------
const pkce = () => { const verifier = randomBytes(32).toString('base64url'); return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }; };
const demande = (client, p = pkce(), extra = {}) => ({ response_type: 'code', client_id: 'cli_essai', redirect_uri: CLAUDE, code_challenge: p.challenge, code_challenge_method: 'S256', state: 'etat-1', resource: `${EMETTEUR}/mcp/${client}`, ...extra });
const approuver = (client, corps, origine = EMETTEUR) => fetch(`${base}/oauth/${client}/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(origine ? { Origin: origine } : {}) }, body: JSON.stringify(corps) });
const jeton = (client, champs) => fetch(`${base}/oauth/${client}/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(champs) });
const brut = (lien, bearer, corps = { jsonrpc: '2.0', id: 1, method: 'tools/list' }) => fetch(`${base}${lien}`, {
  method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) }, body: JSON.stringify(corps),
});
async function assistant(lien, bearer) {
  const c = new Client({ name: 'essai', version: '1.0.0' });
  await c.connect(new StreamableHTTPClientTransport(new URL(`${base}${lien}`), { requestInit: { headers: { Authorization: `Bearer ${bearer}` } } }));
  return c;
}
/** Parcours complet : approbation, échange du code. Renvoie les jetons ({ access_token, refresh_token }). */
async function connecter(client, identite, { redirect = CLAUDE } = {}) {
  const p = pkce();
  const r = await approuver(client, { ...demande(client, p, { redirect_uri: redirect }), decision: 'allow', id_token: identite });
  assert.equal(r.status, 200, await r.clone().text());
  const code = new URL((await r.json()).redirect).searchParams.get('code');
  const t = await jeton(client, { grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: 'cli_essai', code_verifier: p.verifier });
  assert.equal(t.status, 200, await t.clone().text());
  return t.json();
}
const noms = (liste) => liste.tools.map((t) => t.name).sort();
const donneesDe = async (client) => Object.fromEntries(await Promise.all(Object.keys(baseInitiale()).filter((n) => n.startsWith(`clients/${client}/`) && !n.endsWith('/membres')).map(async (n) => [n, await donnees.liste(n)])));
const resultat = (r) => JSON.parse(r.content[0].text);
/** Un appel refusé par le serveur : soit une erreur de protocole, soit un résultat d'erreur (le SDK rend « outil inconnu » ainsi). */
const refuse = async (c, name, args) => { try { const r = await c.callTool({ name, arguments: args }); return r.isError === true; } catch { return true; } };
/** Suppression en deux temps, comme un assistant : aperçu (rien n'est supprimé), puis rappel avec le code. Rend la réponse de la suppression réelle. */
const supprimer = async (c, name, args) => {
  const apercu = await c.callTool({ name, arguments: args });
  assert.ok(!apercu.isError, apercu.content[0].text);
  const a = resultat(apercu);
  assert.equal(a.apercu, true);
  assert.match(a.code, /^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
  return resultat(await c.callTool({ name, arguments: { ...args, codeConfirmation: a.code } }));
};
const MOTS_ECRITURE = /^(creer_|modifier_|ajouter_|changer_|terminer_|marquer_|mettre_|rouvrir_|joindre_|retirer_|archiver_|reprendre_|abandonner_)/;
const SUPPRESSIONS = /^(supprimer_|restaurer_)/;

describe('Adresses : un lien par client, rien ne dit si un client existe', () => {
  test('/mcp/<client> sans jeton : 401 avec les métadonnées de CE client ; client inconnu, désactivé ou sans module : même réponse', async () => {
    const corps = [];
    for (const c of ['a', 'b', 'inconnu', 'dormant', 'sans-mcp']) {
      const r = await brut(`/mcp/${c}`);
      assert.equal(r.status, 401, c);
      assert.equal(r.headers.get('www-authenticate'), `Bearer resource_metadata="${EMETTEUR}/.well-known/oauth-protected-resource/mcp/${c}"`);
      corps.push(await r.text());
    }
    assert.equal(new Set(corps).size, 1);
    assert.equal(corps[0], '{"error":"non_autorise"}');
  });
  test('M5 majuscules, chemins, caractères spéciaux dans le lien : refusés comme un jeton mauvais', async () => {
    for (const lien of ['/mcp/A', '/mcp/a%2Fb', '/mcp/..', '/mcp/a/b', '/mcp/a%20', '/mcp/-a', '/mcp/' + 'x'.repeat(41), '/mcp', '/mcp/']) {
      const r = await brut(lien, 'nimporte');
      assert.ok([401, 404].includes(r.status), `${lien} -> ${r.status}`);
    }
  });
  test('métadonnées : ressource et serveur d\'autorisation propres au client, aucun accès à la base', async () => {
    panne = true; // si la route lisait la base, elle échouerait
    for (const c of ['a', 'inconnu']) {
      const res = await (await fetch(`${base}/.well-known/oauth-protected-resource/mcp/${c}`)).json();
      assert.deepEqual(res, { resource: `${EMETTEUR}/mcp/${c}`, authorization_servers: [`${EMETTEUR}/mcp/${c}`], bearer_methods_supported: ['header'] });
      const m = await (await fetch(`${base}/.well-known/oauth-authorization-server/mcp/${c}`)).json();
      assert.equal(m.issuer, `${EMETTEUR}/mcp/${c}`);
      assert.equal(m.authorization_endpoint, `${EMETTEUR}/oauth/${c}/authorize`);
      assert.equal(m.token_endpoint, `${EMETTEUR}/oauth/${c}/token`);
      assert.equal(m.registration_endpoint, `${EMETTEUR}/oauth/${c}/register`);
      assert.deepEqual(m.code_challenge_methods_supported, ['S256']);
    }
    assert.equal((await fetch(`${base}/.well-known/oauth-protected-resource/mcp/A`)).status, 404);
  });
  test('un jeton « cia_… » (Hermes, Claude Code) n\'ouvre aucun client ; une origine de navigateur inconnue est refusée', async () => {
    assert.equal((await brut('/mcp/a', `cia_${'H'.repeat(43)}`)).status, 401);
    const r = await fetch(`${base}/mcp/a`, { method: 'POST', headers: { Origin: 'https://pirate.example', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 403);
  });
  test('GET sur le lien d\'un client : 405 (POST seulement)', async () => {
    assert.equal((await fetch(`${base}/mcp/a`)).status, 405);
  });
});

describe('Connexion : comptes lus dans les membres, un seul refus pour tout', () => {
  test('un membre de A obtient un code sur A ; l\'adresse de retour reçoit code et state', async () => {
    const t = await connecter('a', 'ID-ALICE');
    assert.match(t.access_token, /^cia_a_/);
    assert.match(t.refresh_token, /^cia_r_/);
  });
  test('refus identique (statut et corps) : non-membre, membre d\'un AUTRE client, client inconnu, désactivé, module éteint, adresse non vérifiée, connexion non Google', async () => {
    const essais = [
      ['a', 'ID-ZOE'], ['a', 'ID-BOB'], ['b', 'ID-ALICE'], ['inconnu', 'ID-ALICE'], ['dormant', 'ID-ALICE'], ['sans-mcp', 'ID-ALICE'],
      ['a', 'ID-ALICE-NON-VERIFIEE'], ['a', 'ID-ALICE-MOT-DE-PASSE'],
    ];
    const corps = new Set();
    await reinitialiser();
    for (const [client, identite] of essais) {
      const r = await approuver(client, { ...demande(client), decision: 'allow', id_token: identite });
      assert.equal(r.status, 403, `${client} ${identite}`);
      corps.add(await r.text());
    }
    assert.equal(corps.size, 1, [...corps].join(' | '));
    assert.match([...corps][0], /n'a pas accès à cet espace/);
    assert.equal((await donnees.liste('mcp_oauth')).length, 0, 'aucun code créé');
  });
  test('l\'adresse e-mail est comparée sans tenir compte des majuscules', async () => {
    const t = await connecter('a', 'ID-ALICE-MAJUSCULES');
    const c = await assistant('/mcp/a', t.access_token);
    assert.equal(resultat(await c.callTool({ name: 'qui_suis_je', arguments: {} })).acteur, 'claude-ai-alice');
    await c.close();
  });
  test('jeton d\'identité Google invalide : 401 ; origine inconnue : 403 ; décision « refuser » : retour à l\'assistant avec access_denied', async () => {
    assert.equal((await approuver('a', { ...demande('a'), decision: 'allow', id_token: 'faux' })).status, 401);
    assert.equal((await approuver('a', { ...demande('a'), decision: 'allow', id_token: 'ID-ALICE' }, 'https://pirate.example')).status, 403);
    const r = await approuver('a', { ...demande('a'), decision: 'deny' });
    assert.equal(new URL((await r.json()).redirect).searchParams.get('error'), 'access_denied');
  });
  test('adresses de retour : Claude et ChatGPT acceptés, toute autre refusée (autorisation et enregistrement)', async () => {
    for (const ok of [CLAUDE, 'https://claude.com/api/mcp/auth_callback', CHATGPT, 'https://chatgpt.com/connector_platform_oauth_redirect']) {
      const r = await approuver('a', { ...demande('a', pkce(), { redirect_uri: ok }), decision: 'deny' });
      assert.equal(r.status, 200, ok);
    }
    for (const mauvaise of ['https://pirate.example/cb', 'https://chatgpt.com.pirate.example/connector/oauth/x', 'https://chatgpt.com/connector/oauth/', 'https://chatgpt.com/autre', 'http://claude.ai/api/mcp/auth_callback', 'https://claude.ai/api/mcp/auth_callback/../x']) {
      const r = await approuver('a', { ...demande('a', pkce(), { redirect_uri: mauvaise }), decision: 'allow', id_token: 'ID-ALICE' });
      assert.equal(r.status, 400, mauvaise);
      const e = await fetch(`${base}/oauth/a/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: [mauvaise] }) });
      assert.equal(e.status, 400, mauvaise);
    }
    const bon = await fetch(`${base}/oauth/a/register`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ redirect_uris: [CHATGPT], client_name: 'ChatGPT' }) });
    assert.equal(bon.status, 201);
  });
  test('noms d\'acteur : claude-ai-<compte> pour Claude, chatgpt-<compte> pour ChatGPT', async () => {
    for (const [redirect, attendu] of [[CLAUDE, 'claude-ai-alice'], [CHATGPT, 'chatgpt-alice']]) {
      const t = await connecter('a', 'ID-ALICE', { redirect });
      const c = await assistant('/mcp/a', t.access_token);
      const moi = resultat(await c.callTool({ name: 'qui_suis_je', arguments: {} }));
      assert.equal(moi.acteur, attendu);
      assert.equal(moi.serveur.nom, 'espace-client'); // jamais le nom du serveur de Jérôme chez un client
      await c.close();
    }
  });
  test('l\'échange du code ne marche qu\'avec le client du lien : un code obtenu sur A est refusé sur B', async () => {
    const p = pkce();
    const r = await approuver('a', { ...demande('a', p), decision: 'allow', id_token: 'ID-CLARA' }); // Clara est membre de A ET de B
    const code = new URL((await r.json()).redirect).searchParams.get('code');
    const t = await jeton('b', { grant_type: 'authorization_code', code, redirect_uri: CLAUDE, client_id: 'cli_essai', code_verifier: p.verifier });
    assert.equal(t.status, 400);
    assert.equal((await t.json()).error, 'invalid_grant');
  });
});

describe('Rôles : le profil vient du rôle du membre', () => {
  test('M6 lecteur : outils de lecture seulement ; un outil d\'écriture appelé quand même est refusé', async () => {
    const t = await connecter('a', 'ID-LEA');
    const c = await assistant('/mcp/a', t.access_token);
    const liste = noms(await c.listTools());
    assert.ok(liste.includes('chercher') && liste.includes('lister_projets') && liste.includes('qui_suis_je'));
    assert.deepEqual(liste.filter((n) => MOTS_ECRITURE.test(n) || SUPPRESSIONS.test(n)), []);
    assert.equal(resultat(await c.callTool({ name: 'qui_suis_je', arguments: {} })).profil, 'lecteur');
    const avant = await donneesDe('a');
    assert.ok(await refuse(c, 'creer_personne', { nom: 'Intrus' }));
    assert.ok(await refuse(c, 'supprimer_personne', { id: 'p1', confirmationNom: 'Camille ALPHA' }));
    assert.ok(await refuse(c, 'restaurer_depuis_audit', { operationId: 'op-quelconque', apercu: false }), 'le lecteur ne peut pas restaurer');
    assert.deepEqual(await donneesDe('a'), avant);
    await c.close();
  });
  test('M7 éditeur : lecture, écriture, suppression et restauration (listées et appelables), profil claude-code', async () => {
    await reinitialiser();
    const t = await connecter('a', 'ID-ALICE');
    const c = await assistant('/mcp/a', t.access_token);
    const liste = noms(await c.listTools());
    assert.ok(liste.includes('creer_personne') && liste.includes('modifier_projet'));
    assert.ok(liste.includes('supprimer_personne') && liste.includes('restaurer_depuis_audit'));
    assert.equal(resultat(await c.callTool({ name: 'qui_suis_je', arguments: {} })).profil, 'claude-code');
    await c.close();
    await reinitialiser();
  });
  test('M7a éditeur chez A : supprimer_personne avec la confirmation du nom -> operationId, la personne disparaît de A, audit « supprimer » signé claude-ai-alice', async () => {
    await reinitialiser();
    const t = await connecter('a', 'ID-ALICE');
    const c = await assistant('/mcp/a', t.access_token);
    const r = await supprimer(c, 'supprimer_personne', { id: 'p1', choix: 'conserver', confirmationNom: 'Camille ALPHA' });
    assert.ok(r.operationId, JSON.stringify(r));
    assert.ok(!(await donnees.liste('clients/a/crm_personnes')).some((p) => p.id === 'p1'));
    const audit = (await donnees.liste('clients/a/crm_audit')).filter((l) => l.operationId === r.operationId);
    assert.ok(audit.some((l) => l.action === 'supprimer' && l.acteur === 'claude-ai-alice'), JSON.stringify(audit));
    assert.ok(audit.every((l) => l.acteur === 'claude-ai-alice' && l.via === 'mcp'), 'canal mcp sur chaque ligne');
    const ligne = audit.find((l) => l.action === 'supprimer' && l.collection === 'crm_personnes');
    const copie = await donnees.document('clients/a/crm_audit_avant', ligne.id);
    assert.equal(copie.avant.nom, 'Camille ALPHA', 'la copie « avant » est gardée');
    assert.equal(copie.apres, null);
    await c.close();
    await reinitialiser();
  });
  test('M7b éditeur de A : une note ou une activité qui n\'existe que chez B est introuvable chez A (même avec le code), et B ne change pas', async () => {
    await reinitialiser();
    const ta = await connecter('a', 'ID-CLARA');
    const ca = await assistant('/mcp/a', ta.access_token);
    const avantB = await donneesDe('b');
    for (const [outil, id] of [['supprimer_note', 'n-seulement-b'], ['supprimer_activite', 'ac-seulement-b']]) {
      for (const args of [{ id }, { id, codeConfirmation: 'ABCD-2345' }]) {
        const r = await ca.callTool({ name: outil, arguments: args });
        assert.equal(r.isError, true, `${outil} ${JSON.stringify(args)}`);
        assert.match(r.content[0].text, /introuvable/);
      }
    }
    assert.deepEqual(await donneesDe('b'), avantB);
    assert.ok((await donnees.liste('clients/b/crm_notes')).some((n) => n.id === 'n-seulement-b'));
    assert.deepEqual(await donnees.liste('clients/a/mcp_codes'), [], 'aucun code émis pour une fiche introuvable');
    await ca.close();
    await reinitialiser();
  });
  test('M7b-bis Clara, lectrice chez B (éditrice chez A) : la suppression chez B est refusée et B ne change pas', async () => {
    await reinitialiser();
    const tb = await connecter('b', 'ID-CLARA');
    const cb = await assistant('/mcp/b', tb.access_token);
    assert.equal(resultat(await cb.callTool({ name: 'qui_suis_je', arguments: {} })).profil, 'lecteur');
    const avantB = await donneesDe('b');
    assert.ok(await refuse(cb, 'supprimer_personne', { id: 'p1', choix: 'conserver', confirmationNom: 'Camille BRAVO' }));
    assert.ok(await refuse(cb, 'supprimer_note', { id: 'n1' }));
    assert.deepEqual(await donneesDe('b'), avantB);
    assert.deepEqual(await donnees.liste('clients/b/mcp_codes'), [], 'aucun code émis chez B');
    await cb.close();
    await reinitialiser();
  });
  test('M7c restaurer_depuis_audit avec l\'operationId de M7a chez A : la personne réapparaît', async () => {
    await reinitialiser();
    const t = await connecter('a', 'ID-ALICE');
    const c = await assistant('/mcp/a', t.access_token);
    const { operationId } = await supprimer(c, 'supprimer_personne', { id: 'p1', choix: 'conserver', confirmationNom: 'Camille ALPHA' });
    assert.ok(!(await donnees.liste('clients/a/crm_personnes')).some((p) => p.id === 'p1'));
    const r = await c.callTool({ name: 'restaurer_depuis_audit', arguments: { operationId, apercu: false } });
    assert.ok(!r.isError, r.content[0].text);
    assert.ok((await donnees.liste('clients/a/crm_personnes')).some((p) => p.id === 'p1' && p.nom === 'Camille ALPHA'));
    await c.close();
    await reinitialiser();
  });
  test('M7d le même operationId chez B (éditeur de B) : refus «identifiant inconnu», B inchangé', async () => {
    await reinitialiser();
    const ta = await connecter('a', 'ID-ALICE');
    const ca = await assistant('/mcp/a', ta.access_token);
    const { operationId } = await supprimer(ca, 'supprimer_personne', { id: 'p1', choix: 'conserver', confirmationNom: 'Camille ALPHA' });
    await ca.close();
    const tb = await connecter('b', 'ID-BOB');
    const cb = await assistant('/mcp/b', tb.access_token);
    const avantB = await donneesDe('b');
    const r = await cb.callTool({ name: 'restaurer_depuis_audit', arguments: { operationId, apercu: false } });
    assert.equal(r.isError, true);
    assert.match(JSON.stringify(r.content), /identifiant inconnu/); // le serveur dit « Aucune écriture réussie pour cette opération (identifiant inconnu… ) » : même réponse que pour un operationId qui n'existe pas
    assert.deepEqual(await donneesDe('b'), avantB);
    assert.ok(!(await donnees.liste('clients/a/crm_personnes')).some((p) => p.id === 'p1'), 'A est resté comme après la suppression');
    await cb.close();
    await reinitialiser();
  });
  test('M7e connexion avec une adresse de retour ChatGPT : acteur chatgpt-<compte> et suppression journalisée avec cet acteur', async () => {
    await reinitialiser();
    const t = await connecter('a', 'ID-ALICE', { redirect: CHATGPT });
    const c = await assistant('/mcp/a', t.access_token);
    assert.equal(resultat(await c.callTool({ name: 'qui_suis_je', arguments: {} })).acteur, 'chatgpt-alice');
    const r = await supprimer(c, 'supprimer_personne', { id: 'p1', choix: 'conserver', confirmationNom: 'Camille ALPHA' });
    const audit = (await donnees.liste('clients/a/crm_audit')).filter((l) => l.operationId === r.operationId);
    assert.ok(audit.some((l) => l.action === 'supprimer' && l.acteur === 'chatgpt-alice'), JSON.stringify(audit));
    await c.close();
    await reinitialiser();
  });
  test('un éditeur écrit dans SON espace, avec son nom d\'acteur dans l\'audit ; son rôle est relu à chaque appel (rétrogradé = lecture seule)', async () => {
    await reinitialiser();
    const t = await connecter('a', 'ID-ALICE');
    const c = await assistant('/mcp/a', t.access_token);
    const r = resultat(await c.callTool({ name: 'creer_personne', arguments: { nom: 'Nouvelle Personne Alpha' } }));
    assert.ok(r.operationId);
    const personnes = await donnees.liste('clients/a/crm_personnes');
    assert.ok(personnes.some((p) => p.nom === 'Nouvelle Personne Alpha'));
    const audit = (await donnees.liste('clients/a/crm_audit')).filter((l) => l.operationId === r.operationId);
    assert.ok(audit.length > 0 && audit.every((l) => l.acteur === 'claude-ai-alice' && l.via === 'mcp'));
    await c.close();
    await donnees.appliquer([{ type: 'set', collection: 'clients/a/membres', id: ALICE, donnees: { role: 'lecteur' } }]);
    const c2 = await assistant('/mcp/a', t.access_token);
    assert.equal(resultat(await c2.callTool({ name: 'qui_suis_je', arguments: {} })).profil, 'lecteur');
    assert.deepEqual(noms(await c2.listTools()).filter((n) => MOTS_ECRITURE.test(n)), []);
    await c2.close();
    await reinitialiser();
  });
});

describe('Suppressions MCP : double confirmation, plafond par document, annotations, nom de serveur', () => {
  const noms10 = (a) => a.noms.filter((n) => !n.startsWith('et '));
  /** Une personne « p-gros » avec `n` notes, dans l'espace A (la suppression avec choix « conserver » emporte ses notes). */
  const personneAvecNotes = async (id, nom, n) => {
    await donnees.appliquer([
      { type: 'set', collection: 'clients/a/crm_personnes', id, donnees: { nom, creeLe: new Date('2026-09-01T00:00:00Z') } },
      ...Array.from({ length: n }, (_, k) => ({ type: 'set', collection: 'clients/a/crm_notes', id: `${id}-n${k}`, donnees: { texte: `Note ${k} de ${nom}`, personneId: id } })),
    ]);
  };
  const compteurJour = async () => (await donnees.liste('mcp_limites')).find((d) => d.id.startsWith('a__'))?.jour?.n ?? 0;

  test('1 le premier appel rend un aperçu (nombre par type, 10 premiers noms, « et N autres ») et un code, sans rien supprimer ; la suppression exige ce code, une seule fois', async () => {
    await reinitialiser();
    await personneAvecNotes('p-gros', 'Gros Dossier', 14);
    const t = await connecter('a', 'ID-ALICE');
    const c = await assistant('/mcp/a', t.access_token);
    const avant = await donneesDe('a');
    const args = { id: 'p-gros', choix: 'conserver', confirmationNom: 'Gros Dossier' };
    const rep = await c.callTool({ name: 'supprimer_personne', arguments: args });
    const a = resultat(rep);
    assert.equal(a.apercu, true); assert.equal(a.supprime, false);
    assert.deepEqual(a.supprimes, { crm_personnes: 1, crm_notes: 14 });
    assert.equal(a.total, 15);
    assert.equal(a.noms.length, 11); assert.equal(noms10(a).length, 10);
    assert.match(a.noms[0], /Gros Dossier/); assert.equal(a.noms[10], 'et 5 autres');
    assert.match(a.consigne, /RIEN n'a été supprimé/);
    assert.deepEqual(await donneesDe('a'), avant, 'aucune donnée touchée par l\'aperçu');
    assert.equal((await donnees.liste('clients/a/crm_audit')).length, avant['clients/a/crm_audit'].length, 'aucune ligne d\'audit pour un aperçu');
    // refus : sans code autre que celui reçu, code faux, code d'une autre fiche
    const faux = await c.callTool({ name: 'supprimer_personne', arguments: { ...args, codeConfirmation: 'ZZZZ-2222' } });
    assert.equal(faux.isError, true); assert.match(faux.content[0].text, /code incorrect/);
    // un code faux consomme le code : il faut un nouvel aperçu
    const r2 = await c.callTool({ name: 'supprimer_personne', arguments: { ...args, codeConfirmation: a.code } });
    assert.equal(r2.isError, true); assert.match(r2.content[0].text, /aucun aperçu en cours/);
    const b = resultat(await c.callTool({ name: 'supprimer_personne', arguments: args }));
    const autreFiche = await c.callTool({ name: 'supprimer_note', arguments: { id: 'n1', codeConfirmation: b.code } });
    assert.equal(autreFiche.isError, true, 'le code d\'une autre fiche ne vaut pas');
    const reel = resultat(await c.callTool({ name: 'supprimer_personne', arguments: { ...args, codeConfirmation: b.code } }));
    assert.equal(reel.supprime, true);
    assert.deepEqual(reel.supprimes, { crm_personnes: 1, crm_notes: 14 });
    assert.ok(reel.noms.length <= 11, 'la réponse ne déverse pas toute la liste');
    assert.match(reel.detail, new RegExp(`lire_audit avec operationId ${reel.operationId}`));
    assert.ok(!(await donnees.liste('clients/a/crm_personnes')).some((p) => p.id === 'p-gros'));
    const rejeu = await c.callTool({ name: 'supprimer_personne', arguments: { ...args, codeConfirmation: b.code } });
    assert.equal(rejeu.isError, true, 'le code est à usage unique');
    await c.close();
    await reinitialiser();
  });
  test('1 un code expiré (5 minutes) ou devenu faux parce que le contenu a changé depuis l\'aperçu est refusé', async () => {
    await reinitialiser();
    await personneAvecNotes('p-gros', 'Gros Dossier', 3);
    const t = await connecter('a', 'ID-ALICE');
    const c = await assistant('/mcp/a', t.access_token);
    const args = { id: 'p-gros', choix: 'conserver', confirmationNom: 'Gros Dossier' };
    const a = resultat(await c.callTool({ name: 'supprimer_personne', arguments: args }));
    horloge += 6 * 60_000;
    const r = await c.callTool({ name: 'supprimer_personne', arguments: { ...args, codeConfirmation: a.code } });
    assert.equal(r.isError, true); assert.match(r.content[0].text, /expiré/);
    const b = resultat(await c.callTool({ name: 'supprimer_personne', arguments: args }));
    await donnees.appliquer([{ type: 'set', collection: 'clients/a/crm_notes', id: 'p-gros-ajout', donnees: { texte: 'Ajoutée après l\'aperçu', personneId: 'p-gros' } }]);
    const r2 = await c.callTool({ name: 'supprimer_personne', arguments: { ...args, codeConfirmation: b.code } });
    assert.equal(r2.isError, true); assert.match(r2.content[0].text, /a changé depuis l'aperçu/);
    assert.ok((await donnees.liste('clients/a/crm_personnes')).some((p) => p.id === 'p-gros'), 'rien supprimé');
    await c.close();
    await reinitialiser();
  });
  test('1 le code d\'un autre acteur du même client, ou d\'un autre outil pour le même identifiant, est refusé ; le bon code passe ensuite', async () => {
    await reinitialiser();
    await donnees.appliquer([
      { type: 'set', collection: 'clients/a/crm_notes', id: 'dup1', donnees: { texte: 'Note jumelle', personneId: 'p1' } },
      { type: 'set', collection: 'clients/a/crm_activites', id: 'dup1', donnees: { titre: 'Activité jumelle', type: 'tache', date: '2026-10-20', fait: false, personneId: 'p1' } },
    ]);
    const alice = await assistant('/mcp/a', (await connecter('a', 'ID-ALICE')).access_token);
    const clara = await assistant('/mcp/a', (await connecter('a', 'ID-CLARA')).access_token);
    const code = resultat(await alice.callTool({ name: 'supprimer_note', arguments: { id: 'dup1' } })).code;
    const parClara = await clara.callTool({ name: 'supprimer_note', arguments: { id: 'dup1', codeConfirmation: code } });
    assert.equal(parClara.isError, true, 'le code d\'Alice ne vaut pas pour Clara');
    // le refus de Clara n'a rien consommé du code d'Alice
    const autreOutil = await alice.callTool({ name: 'supprimer_activite', arguments: { id: 'dup1', codeConfirmation: code } });
    assert.equal(autreOutil.isError, true, 'le code d\'un outil ne vaut pas pour un autre, même identifiant');
    assert.ok((await donnees.liste('clients/a/crm_notes')).some((n) => n.id === 'dup1') && (await donnees.liste('clients/a/crm_activites')).some((n) => n.id === 'dup1'));
    const code2 = resultat(await alice.callTool({ name: 'supprimer_note', arguments: { id: 'dup1' } })).code;
    assert.equal(resultat(await alice.callTool({ name: 'supprimer_note', arguments: { id: 'dup1', codeConfirmation: code2 } })).supprime, true);
    assert.ok((await donnees.liste('clients/a/crm_activites')).some((n) => n.id === 'dup1'), 'l\'activité jumelle est restée');
    await alice.close(); await clara.close();
    await reinitialiser();
  });
  test('2 le plafond est de 50 suppressions par jour, compté par document supprimé ; une restauration qui supprime compte aussi ; le refus ne supprime rien', async () => {
    assert.deepEqual(LIMITES_PAR_DEFAUT, { requetesParMinute: 120, ecrituresParHeure: 500, suppressionsParJour: 50 });
    await reinitialiser();
    await personneAvecNotes('p-30', 'Trente Docs', 29); // 30 documents
    await personneAvecNotes('p-25', 'Vingt-cinq Docs', 24); // 25 documents
    await personneAvecNotes('p-20', 'Vingt Docs', 19); // 20 documents
    const t = await connecter('a', 'ID-ALICE');
    const c = await assistant('/mcp/a', t.access_token);
    const sup = (id, nom) => ({ id, choix: 'conserver', confirmationNom: nom });
    assert.equal(await compteurJour(), 0);
    const r1 = await supprimer(c, 'supprimer_personne', sup('p-30', 'Trente Docs'));
    assert.equal(r1.supprime, true);
    assert.equal(await compteurJour(), 30, 'un compte par document, pas par appel');
    // 30 + 25 > 50 : refusé, rien supprimé, rien compté
    const a25 = resultat(await c.callTool({ name: 'supprimer_personne', arguments: sup('p-25', 'Vingt-cinq Docs') }));
    assert.equal(a25.depassePlafond, true, 'l\'aperçu prévient avant de donner un code'); assert.equal(a25.code, undefined); assert.equal(a25.suppressionsRestantesAujourdhui, 20); assert.equal(a25.total, 25);
    // un code obtenu quand il restait de la place ne passe plus une fois la place prise
    const a20 = resultat(await c.callTool({ name: 'supprimer_personne', arguments: sup('p-20', 'Vingt Docs') }));
    assert.ok(a20.code);
    await personneAvecNotes('p-1', 'Un Seul', 0);
    const consomme = await supprimer(c, 'supprimer_personne', sup('p-1', 'Un Seul'));
    assert.equal(consomme.supprime, true);
    assert.equal(await compteurJour(), 31);
    await personneAvecNotes('p-19', 'Dix-neuf Docs', 18); // 19 documents : passe (31 + 19 = 50)
    await supprimer(c, 'supprimer_personne', sup('p-19', 'Dix-neuf Docs'));
    assert.equal(await compteurJour(), 50);
    const refus = await c.callTool({ name: 'supprimer_personne', arguments: { ...sup('p-20', 'Vingt Docs'), codeConfirmation: a20.code } });
    assert.equal(refus.isError, true); assert.match(refus.content[0].text, /Plafond atteint.*50 suppressions par jour/);
    assert.ok((await donnees.liste('clients/a/crm_personnes')).some((p) => p.id === 'p-25' || p.id === 'p-20'));
    assert.equal(await compteurJour(), 50);
    // restaurer une SUPPRESSION ne compte pas ; restaurer une CRÉATION (= supprimer) compte et est refusé au plafond
    const rest = await c.callTool({ name: 'restaurer_depuis_audit', arguments: { operationId: r1.operationId, apercu: false } });
    assert.ok(!rest.isError, rest.content[0].text);
    assert.equal(await compteurJour(), 50, 'recréer des documents n\'est pas une suppression');
    const cree = resultat(await c.callTool({ name: 'creer_personne', arguments: { nom: 'Créée puis défaite' } }));
    const defaire = await c.callTool({ name: 'restaurer_depuis_audit', arguments: { operationId: cree.operationId, apercu: false } });
    assert.equal(defaire.isError, true); assert.match(defaire.content[0].text, /Plafond atteint.*50 suppressions par jour/);
    assert.ok((await donnees.liste('clients/a/crm_personnes')).some((p) => p.nom === 'Créée puis défaite'));
    // le lendemain (jour de Paris), ça repart ; la restauration de la création compte alors pour ses documents
    horloge += 24 * 3_600_000;
    await c.close();
    const c2 = await assistant('/mcp/a', (await connecter('a', 'ID-ALICE')).access_token);
    const defaire2 = await c2.callTool({ name: 'restaurer_depuis_audit', arguments: { operationId: cree.operationId, apercu: false } });
    assert.ok(!defaire2.isError, defaire2.content[0].text);
    assert.ok(await compteurJour() >= 1, 'la restauration qui supprime compte comme suppression');
    assert.ok(!(await donnees.liste('clients/a/crm_personnes')).some((p) => p.nom === 'Créée puis défaite'));
    await c2.close();
    await reinitialiser();
  });
  test('3 chaque outil porte ses annotations : lecture seule pour la lecture, destructif pour supprimer_* et restaurer_depuis_audit, ni l\'un ni l\'autre pour les écritures', async () => {
    const t = await connecter('a', 'ID-ALICE');
    const c = await assistant('/mcp/a', t.access_token);
    const { tools } = await c.listTools();
    assert.ok(tools.length > 20);
    for (const o of tools) {
      assert.ok(o.annotations, `${o.name} sans annotations`);
      assert.equal(o.annotations.openWorldHint, false, o.name);
      if (/^(supprimer_|restaurer_depuis_audit)/.test(o.name)) assert.deepEqual([o.annotations.readOnlyHint, o.annotations.destructiveHint], [false, true], o.name);
      else if (/^(chercher|lire_|lister_|qui_suis_je)/.test(o.name)) assert.deepEqual([o.annotations.readOnlyHint, o.annotations.destructiveHint], [true, false], o.name);
      else assert.deepEqual([o.annotations.readOnlyHint, o.annotations.destructiveHint], [false, false], o.name);
    }
    await c.close();
    const tl = await connecter('a', 'ID-LEA');
    const cl = await assistant('/mcp/a', tl.access_token);
    assert.ok((await cl.listTools()).tools.every((o) => o.annotations.readOnlyHint === true), 'tout ce que voit un lecteur est en lecture seule');
    await cl.close();
  });
  test('4 le serveur d\'un espace client se présente sous un nom neutre, pas « chevalier-ia-os »', async () => {
    const t = await connecter('a', 'ID-ALICE');
    const c = await assistant('/mcp/a', t.access_token);
    assert.equal(c.getServerVersion().name, 'espace-client');
    assert.equal(NOM_SERVEUR_CLIENT, 'espace-client');
    await c.close();
  });
});

describe('Modules : les outils suivent les modules actifs du client', () => {
  test('M8 client sans le module projets : aucun outil de projet, ni listé ni appelable ; avec : tous', async () => {
    const ta = await connecter('a', 'ID-ALICE');
    const tb = await connecter('b', 'ID-BOB');
    const ca = await assistant('/mcp/a', ta.access_token);
    const cb = await assistant('/mcp/b', tb.access_token);
    const projetsA = noms(await ca.listTools()).filter((n) => /projet/.test(n));
    const projetsB = noms(await cb.listTools()).filter((n) => /projet/.test(n));
    assert.ok(projetsA.includes('lister_projets') && projetsA.includes('creer_projet'));
    assert.deepEqual(projetsB, []);
    assert.ok(await refuse(cb, 'lister_projets', {}));
    await ca.close(); await cb.close();
  });
  test('outilsDesModules : communs seuls sans module ; CRM seul = outils de l\'affaire ; tout est déclaré au registre', () => {
    const seuls = (actifs) => outilsDesModules(actifs, OUTILS).map((o) => o.nom);
    assert.deepEqual(seuls([]), ['qui_suis_je']);
    assert.ok(seuls(['affaires']).includes('chercher') && !seuls(['affaires']).includes('lister_projets'));
    assert.equal(seuls(['affaires', 'projets']).length, OUTILS.length);
  });
  test('M9 module « mcp » éteint, ou client désactivé : l\'accès déjà accordé est coupé tout de suite, et la connexion n\'est plus possible', async () => {
    await reinitialiser();
    const t = await connecter('a', 'ID-ALICE');
    assert.equal((await brut('/mcp/a', t.access_token)).status, 200);
    await donnees.appliquer([{ type: 'set', collection: 'clients', id: 'a', donnees: { modules: { affaires: true, projets: true, mcp: false } } }]);
    assert.equal((await brut('/mcp/a', t.access_token)).status, 401, 'module éteint');
    assert.equal((await approuver('a', { ...demande('a'), decision: 'allow', id_token: 'ID-ALICE' })).status, 403);
    assert.equal((await jeton('a', { grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: 'cli_essai' })).status, 400);
    await donnees.appliquer([{ type: 'set', collection: 'clients', id: 'a', donnees: { modules: { affaires: true, projets: true, mcp: true } } }]);
    const t2 = await connecter('a', 'ID-ALICE');
    assert.equal((await brut('/mcp/a', t2.access_token)).status, 200);
    await donnees.appliquer([{ type: 'set', collection: 'marques', id: 'a', donnees: { actif: false, nom: 'Cabinet Alpha' } }]);
    assert.equal((await brut('/mcp/a', t2.access_token)).status, 401, 'client désactivé');
    await reinitialiser();
  });
  test('un membre retiré perd l\'accès tout de suite (même jeton, même connexion)', async () => {
    await reinitialiser();
    const t = await connecter('a', 'ID-LEA');
    assert.equal((await brut('/mcp/a', t.access_token)).status, 200);
    await donnees.appliquer([{ type: 'delete', collection: 'clients/a/membres', id: LEA }]);
    assert.equal((await brut('/mcp/a', t.access_token)).status, 401);
    await reinitialiser();
  });
  test('panne de la base : 503 (et non 401 : le client ne doit pas croire son jeton mauvais)', async () => {
    const t = await connecter('a', 'ID-ALICE');
    panne = true;
    assert.equal((await brut('/mcp/a', t.access_token)).status, 503);
  });
});

describe('Étanchéité entre clients (plan M1 à M15)', () => {
  test('M1 toutes les lectures de A ne montrent que des données de A (et B seulement des siennes)', async () => {
    const ta = await connecter('a', 'ID-ALICE');
    const tb = await connecter('b', 'ID-BOB');
    for (const [lien, token, present, absent] of [['/mcp/a', ta.access_token, 'ALPHA', 'BRAVO'], ['/mcp/b', tb.access_token, 'BRAVO', 'ALPHA']]) {
      const c = await assistant(lien, token);
      const lectures = [['chercher', { texte: 'Camille' }], ['lister_affaires', {}], ['lire_personne', { id: 'p1', avecFil: true }], ['lire_organisation', { id: 'org1' }], ['lire_affaire', { id: 'a1', avecFil: true }],
        ['lister_activites', {}], ['lister_documents', {}], ['lire_reglages', {}], ['lire_audit', {}]];
      if (lien === '/mcp/a') lectures.push(['lister_projets', {}], ['lister_modeles_projet', {}]);
      let texte = '';
      for (const [nom, args] of lectures) {
        const r = await c.callTool({ name: nom, arguments: args });
        texte += JSON.stringify(r.content);
      }
      assert.ok(texte.includes(present), `${lien} : données propres absentes`);
      assert.ok(!texte.includes(absent), `${lien} : donnée de l'autre client`);
      await c.close();
    }
  });
  test('M2 un identifiant de client glissé dans les paramètres, l\'en-tête ou le corps est ignoré : seule l\'adresse compte', async () => {
    const ta = await connecter('a', 'ID-ALICE');
    for (const extra of [{ client: 'b' }, { clientId: 'b' }, { base: 'clients/b' }, { collection: 'clients/b/crm_personnes' }, { chemin: 'clients/b/crm_personnes/p1' }]) {
      const r = await brut('/mcp/a', ta.access_token, { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'lister_affaires', arguments: extra, ...extra }, ...extra });
      const t = await r.text();
      assert.ok(!t.includes('BRAVO'), JSON.stringify(extra));
    }
    const r = await fetch(`${base}/mcp/a?client=b&clientId=b`, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${ta.access_token}`, 'X-Client': 'b', 'X-Client-Id': 'b' }, body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'lire_personne', arguments: { id: 'p1' } } }) });
    const t = await r.text();
    assert.ok(t.includes('ALPHA') && !t.includes('BRAVO'));
  });
  test('M3 et M12 le lien d\'un autre client : refus neutre, même avec un jeton valable ailleurs (Clara est membre des deux : le lien décide)', async () => {
    const ta = await connecter('a', 'ID-ALICE');
    const refus = await brut('/mcp/b', ta.access_token);
    assert.equal(refus.status, 401);
    assert.equal(await refus.text(), '{"error":"non_autorise"}');
    assert.equal(await (await brut('/mcp/inconnu', ta.access_token)).text(), '{"error":"non_autorise"}');
    // M10 : Clara, éditrice chez A et lectrice chez B ; chaque lien lui donne SON espace et SON rôle.
    const tc = await connecter('a', 'ID-CLARA');
    const sur = async (client, token) => { const c = await assistant(`/mcp/${client}`, token); const t = JSON.stringify((await c.callTool({ name: 'lister_affaires', arguments: {} })).content) + resultat(await c.callTool({ name: 'qui_suis_je', arguments: {} })).profil; await c.close(); return t; };
    const chezA = await sur('a', tc.access_token);
    assert.ok(chezA.includes('ALPHA') && !chezA.includes('BRAVO') && chezA.endsWith('claude-code'));
    assert.equal((await brut('/mcp/b', tc.access_token)).status, 401, 'le jeton de A ne vaut pas sur B, même pour un compte membre des deux');
    const tcb = await connecter('b', 'ID-CLARA');
    const chezB = await sur('b', tcb.access_token);
    assert.ok(chezB.includes('BRAVO') && !chezB.includes('ALPHA') && chezB.endsWith('lecteur'));
    assert.equal((await brut('/mcp/a', tcb.access_token)).status, 401);
  });
  test('M4 un document de B demandé par A (lecture, modification) : « introuvable », aucune écriture chez B', async () => {
    await reinitialiser();
    const avantB = await donneesDe('b');
    const ta = await connecter('a', 'ID-ALICE');
    const c = await assistant('/mcp/a', ta.access_token);
    // Mêmes identifiants chez B (p1, a1…) : seule l'adresse distingue les clients ; on crée aussi un document qui n'existe QUE chez B.
    await donnees.appliquer([{ type: 'set', collection: 'clients/b/crm_personnes', id: 'seulement-b', donnees: { nom: 'Fantôme BRAVO', emails: [], archive: false } }]);
    const avantB2 = await donneesDe('b');
    for (const [nom, args] of [['lire_personne', { id: 'seulement-b' }], ['modifier_personne', { id: 'seulement-b', nom: 'Piraté' }], ['modifier_organisation', { id: 'seulement-b', nom: 'Piraté' }], ['ajouter_note', { personneId: 'seulement-b', texte: 'Piraté' }]]) {
      const r = await c.callTool({ name: nom, arguments: args }).catch((e) => ({ isError: true, content: [{ text: String(e.message) }] }));
      assert.ok(r.isError || /introuvable/i.test(JSON.stringify(r)), `${nom} : ${JSON.stringify(r).slice(0, 200)}`);
      assert.ok(!JSON.stringify(r).includes('Fantôme'), nom);
    }
    assert.deepEqual(await donneesDe('b'), avantB2);
    assert.notDeepEqual(avantB2, avantB);
    await c.close();
    await reinitialiser();
  });
  test('M5 identifiants et noms de collection douteux : refusés, aucun accès hors de clients/<client>/', async () => {
    const ta = await connecter('a', 'ID-ALICE');
    const c = await assistant('/mcp/a', ta.access_token);
    const avantB = await donneesDe('b');
    for (const id of ['../b/crm_personnes/p1', '../../clients/b/crm_personnes/p1', 'clients/b/crm_personnes/p1', '..', '.', 'p1/../../b', '__x__', 'P1', 'p1 ', '%2e%2e']) {
      for (const nom of ['lire_personne', 'lire_affaire', 'lire_organisation']) {
        const r = await c.callTool({ name: nom, arguments: { id } }).catch((e) => ({ isError: true, content: [{ text: String(e.message) }] }));
        assert.ok(r.isError || /introuvable/i.test(JSON.stringify(r)), `${nom} ${id}`);
        assert.ok(!JSON.stringify(r).includes('BRAVO'), `${nom} ${id}`);
      }
      await c.callTool({ name: 'modifier_personne', arguments: { id, nom: 'X' } }).catch(() => {});
    }
    assert.deepEqual(await donneesDe('b'), avantB);
    await c.close();
  });
  test('M11 jeton de renouvellement rejoué : toute la connexion est coupée (jeton d\'accès compris) ; connexion révoquée à la main : refus', async () => {
    const t = await connecter('a', 'ID-ALICE');
    const r1 = await jeton('a', { grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: 'cli_essai' });
    assert.equal(r1.status, 200);
    const t2 = await r1.json();
    assert.equal((await brut('/mcp/a', t2.access_token)).status, 200);
    assert.equal((await jeton('a', { grant_type: 'refresh_token', refresh_token: t.refresh_token, client_id: 'cli_essai' })).status, 400); // rejoué
    assert.equal((await brut('/mcp/a', t2.access_token)).status, 401);
    const t3 = await connecter('a', 'ID-LEA');
    assert.equal((await brut('/mcp/a', t3.access_token)).status, 200);
    for (const d of await donnees.liste('mcp_oauth')) if (d.id.startsWith('connexion_') && d.email === LEA) await donnees.appliquer([{ type: 'update', collection: 'mcp_oauth', id: d.id, donnees: { revoque: true } }]);
    assert.equal((await brut('/mcp/a', t3.access_token)).status, 401);
  });
  test('M11 bis : un jeton d\'accès expire au bout d\'une heure', async () => {
    const t = await connecter('a', 'ID-ALICE');
    horloge += 3601 * 1000;
    assert.equal((await brut('/mcp/a', t.access_token)).status, 401);
  });
  test('M13 les plafonds sont séparés : un compteur par client et par compte, hors des données des clients', async () => {
    await reinitialiser();
    const ta = await connecter('a', 'ID-ALICE');
    const tb = await connecter('b', 'ID-BOB');
    const ca = await assistant('/mcp/a', ta.access_token);
    const cb = await assistant('/mcp/b', tb.access_token);
    await ca.callTool({ name: 'creer_personne', arguments: { nom: 'Compteur Alpha' } });
    await cb.callTool({ name: 'creer_personne', arguments: { nom: 'Compteur Bravo' } });
    await cb.callTool({ name: 'creer_personne', arguments: { nom: 'Compteur Bravo 2' } });
    const limites = await donnees.liste('mcp_limites');
    assert.deepEqual(limites.map((l) => l.id).sort(), ['a__claude-ai-alice', 'b__claude-ai-bob']);
    assert.equal(limites.find((l) => l.id === 'a__claude-ai-alice').heure.n, 1);
    assert.equal(limites.find((l) => l.id === 'b__claude-ai-bob').heure.n, 2);
    await ca.close(); await cb.close();
    await reinitialiser();
  });
  test('M14 le journal porte le client, l\'acteur et le rôle ; rien d\'un autre client, aucune donnée', async () => {
    lignesJournal = [];
    const ta = await connecter('a', 'ID-ALICE');
    const c = await assistant('/mcp/a', ta.access_token);
    await c.callTool({ name: 'lire_personne', arguments: { id: 'p1' } });
    await c.close();
    const appels = lignesJournal.filter((l) => l.outil === 'lire_personne');
    assert.ok(appels.length > 0);
    for (const l of appels) assert.deepEqual([l.client, l.acteur, l.profil, l.role], ['a', 'claude-ai-alice', 'claude-code', 'editeur']);
    assert.ok(!JSON.stringify(lignesJournal).includes('BRAVO') && !JSON.stringify(lignesJournal).includes('ALPHA'));
    const { journaliser } = await import('../functions/src/securite/journaux.js');
    const lignes = [];
    journaliser({ client: 'a', acteur: 'claude-ai-alice', jeton: 'a__claude-ai-alice', profil: 'lecteur', role: 'lecteur', statut: 200, secret: 'NE PAS ECRIRE' }, (l) => lignes.push(l));
    assert.match(lignes[0], /"client":"a"/);
    assert.ok(!lignes[0].includes('NE PAS ECRIRE'));
  });
  test('garde-fou : aucun outil du serveur n\'accepte un paramètre « client », « clientId », « projet », « chemin », « collection » ou « base »', () => {
    const interdits = ['client', 'clientId', 'projet', 'chemin', 'collection', 'base'];
    for (const o of OUTILS) for (const cle of Object.keys(o.schema ?? {})) assert.ok(!interdits.includes(cle), `${o.nom} : paramètre « ${cle} »`);
  });
  test('avecBase : la base est fixe, un nom de collection est un simple nom, un identifiant n\'est jamais un chemin', async () => {
    const brute = creerAccesMemoire({ 'clients/a/crm_personnes': [{ id: 'p1', nom: 'A' }], 'clients/b/crm_personnes': [{ id: 'p1', nom: 'B' }] });
    const a = avecBase(brute, 'clients/a');
    assert.equal((await a.document('crm_personnes', 'p1')).nom, 'A');
    assert.deepEqual((await a.liste('crm_personnes')).map((d) => d.nom), ['A']);
    for (const mauvais of ['clients/b/crm_personnes', '../b', 'Crm', '', 'a b', 'crm_personnes/x', undefined]) {
      assert.throws(() => a.liste(mauvais), /Nom de collection invalide/);
      assert.throws(() => a.nouvelId(mauvais), /Nom de collection invalide/);
    }
    for (const id of ['../b', 'x/y', '..', '.', '']) {
      assert.equal(await a.document('crm_personnes', id), null);
      await assert.rejects(async () => a.appliquer([{ type: 'set', collection: 'crm_personnes', id, donnees: { nom: 'X' } }]), /Identifiant de document invalide/);
    }
    for (const base_ of ['clients/B', 'clients/', 'clients/a/x', 'autre/a', '', 'clients/a b', 'clients/-a', undefined]) assert.throws(() => avecBase(brute, base_), /Base de client invalide/);
    await a.appliquer([{ type: 'update', collection: 'crm_personnes', id: 'p1', donnees: { nom: 'A2' } }]);
    assert.equal((await brute.document('clients/a/crm_personnes', 'p1')).nom, 'A2');
    assert.equal((await brute.document('clients/b/crm_personnes', 'p1')).nom, 'B');
    assert.equal(a.nouvelId('crm_personnes').startsWith('crm_'.slice(0, 0)), true);
  });
  test('M15 balayage final : rien de B sous A et inversement ; aucune écriture hors clients/<client>/… sauf mcp_oauth et mcp_limites', async () => {
    const attendu = baseInitiale();
    const toutes = new Set([...Object.keys(attendu), 'mcp_oauth', 'mcp_limites', 'clients/a/mcp_codes', 'clients/a/crm_audit', 'clients/a/crm_audit_avant', 'clients/b/crm_audit', 'clients/b/crm_audit_avant']);
    for (const nom of toutes) {
      const docs = await donnees.liste(nom);
      const texte = JSON.stringify(docs);
      if (nom.startsWith('clients/a/')) assert.ok(!texte.includes('BRAVO') && !texte.includes('Atelier Bravo'), nom);
      if (nom.startsWith('clients/b/') && !nom.endsWith('/membres')) assert.ok(!texte.includes('ALPHA'), nom);
    }
    for (const nom of ['crm_personnes', 'crm_affaires', 'crm_audit', 'projets_projets', 'crm_notes', 'crm_organisations']) assert.deepEqual(await donnees.liste(nom), [], `${nom} à la racine`);
    // la base de B n'a jamais été touchée par les essais de A (le jeu de départ + le document « seulement-b » ajouté puis retiré par reinitialiser)
    assert.deepEqual((await donneesDe('b')), Object.fromEntries(Object.entries(attendu).filter(([n]) => n.startsWith('clients/b/') && !n.endsWith('/membres'))));
  });
});

describe('Écran d\'autorisation : aux couleurs du client, neutre pour tout ce qui est refusé', () => {
  const autoriser = (client, extra = {}) => fetch(`${base}/oauth/${client}/authorize?${new URLSearchParams({ ...demande(client), ...extra })}`);
  test('client actif avec le module : nom, couleur, logo du client et adresse d\'envoi propre au client ; pas de nom de Jérôme', async () => {
    const r = await autoriser('a');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('x-frame-options'), 'DENY');
    const t = await r.text();
    assert.match(t, /Autoriser Claude à accéder à Cabinet Alpha \?/);
    assert.match(t, /#336699/);
    assert.match(t, /https:\/\/exemple\.test\/alpha\.png/);
    assert.match(t, /\/oauth\/a\/approve/);
    assert.match(t, /chevalier-ia-app/);
    assert.ok(!t.includes('Chevalier IA OS') && !t.includes('chevalier-ia-os') && !t.includes('et <strong>supprimer</strong>') && /éditeur<\/strong> : les consulter, en créer, les modifier et les <strong>supprimer<\/strong> \(récupérable\)/.test(t) && !/jamais supprimer/.test(t));
    const tb = await (await autoriser('b')).text();
    assert.match(tb, /Atelier Bravo/);
    assert.match(tb, /#aa3355/);
    assert.ok(!tb.includes('Cabinet Alpha') && !tb.includes('#336699'));
    const chatgpt = await (await autoriser('a', { redirect_uri: CHATGPT })).text();
    assert.match(chatgpt, /Autoriser ChatGPT à accéder à Cabinet Alpha \?/);
  });
  test('client inconnu, désactivé ou module éteint : la même page d\'erreur, sans nom ni couleur', async () => {
    const pages = [];
    for (const c of ['inconnu', 'dormant', 'sans-mcp']) {
      const r = await autoriser(c);
      assert.equal(r.status, 400, c);
      pages.push((await r.text()).replace(/inconnu|dormant|sans-mcp/g, 'X'));
    }
    assert.equal(new Set(pages).size, 1);
    assert.match(pages[0], /n&#39;est pas disponible/);
    assert.ok(!pages[0].includes('Dormant') && !/#336699|#aa3355/.test(pages[0]));
    assert.equal((await autoriser('A')).status, 404);
  });
  test('demande mal formée ou adresse de retour étrangère : page d\'erreur, jamais de redirection', async () => {
    assert.equal((await autoriser('a', { redirect_uri: 'https://pirate.example/cb' })).status, 400);
    assert.equal((await autoriser('a', { code_challenge_method: 'plain' })).status, 400);
    assert.equal((await autoriser('a', { resource: 'https://pirate.example/mcp/a' })).status, 400);
  });
  test('un nom de client piégé (balise, guillemets) est échappé dans la page', async () => {
    await donnees.appliquer([{ type: 'set', collection: 'marques', id: 'a', donnees: fichier('a', '</title><script>alert(1)</script>"\'', { couleur: 'red;}</style><script>', logo: 'javascript:alert(1)' }) }]);
    const t = await (await autoriser('a')).text();
    assert.ok(!t.includes('<script>alert(1)'));
    assert.ok(!t.includes('javascript:'));
    assert.ok(!t.includes('red;}'));
    await reinitialiser();
  });
});

describe('Propriétaire par défaut : la personne connectée, jamais Jérôme chez un client', () => {
  const JEROME = 'jerome.chevalier@gmail.com';
  /** Crée les quatre sortes de fiche SANS propriétaire et rend les propriétaires écrits. */
  async function creerQuatre(c, suffixe) {
    const p = resultat(await c.callTool({ name: 'creer_personne', arguments: { nom: `Personne Defaut ${suffixe}` } }));
    const o = resultat(await c.callTool({ name: 'creer_organisation', arguments: { nom: `Organisation Defaut ${suffixe}` } }));
    const a = resultat(await c.callTool({ name: 'creer_affaire', arguments: { titre: `Affaire Defaut ${suffixe}` } }));
    const pr = resultat(await c.callTool({ name: 'creer_projet', arguments: { titre: `Projet Defaut ${suffixe}` } }));
    const lire = async (nom, id) => (await donnees.liste(`clients/a/${nom}`)).find((d) => d.id === id);
    return [(await lire('crm_personnes', p.id)).proprietaire, (await lire('crm_organisations', o.id)).proprietaire, (await lire('crm_affaires', a.id)).proprietaire, (await lire('projets_projets', pr.id)).proprietaire];
  }
  test('P1 un éditeur crée une personne, une organisation, une affaire et un projet sans propriétaire : c\'est son e-mail, jamais celui de Jérôme, avec Claude comme avec ChatGPT', async () => {
    await reinitialiser();
    for (const [redirect, suffixe] of [[CLAUDE, 'Claude'], [CHATGPT, 'ChatGPT']]) {
      const t = await connecter('a', 'ID-ALICE', { redirect });
      const c = await assistant('/mcp/a', t.access_token);
      assert.deepEqual(await creerQuatre(c, suffixe), [ALICE, ALICE, ALICE, ALICE], suffixe);
      await c.close();
    }
    // L'e-mail est celui de la connexion (en minuscules), pas l'acteur tronqué (« claude-ai-alice »).
    const t = await connecter('a', 'ID-ALICE-MAJUSCULES');
    const c = await assistant('/mcp/a', t.access_token);
    assert.deepEqual(await creerQuatre(c, 'Majuscules'), [ALICE, ALICE, ALICE, ALICE]);
    await c.close();
    const tout = JSON.stringify(await donnees.liste('clients/a/crm_personnes'));
    assert.ok(!tout.includes(JEROME), 'aucune trace de Jérôme dans les fiches créées');
    await reinitialiser();
  });
  test('P1 l\'e-mail n\'est pas écrit dans le journal des appels ni rendu par qui_suis_je', async () => {
    await reinitialiser();
    const t = await connecter('a', 'ID-ALICE');
    const c = await assistant('/mcp/a', t.access_token);
    const qui = JSON.stringify(resultat(await c.callTool({ name: 'qui_suis_je', arguments: {} })));
    assert.ok(!qui.includes(ALICE), qui);
    await c.close();
    await reinitialiser();
  });
  test('P3 un propriétaire fourni est écrit tel quel, même étranger à l\'espace (aucune validation, comme avant)', async () => {
    await reinitialiser();
    const t = await connecter('a', 'ID-ALICE');
    const c = await assistant('/mcp/a', t.access_token);
    const r = resultat(await c.callTool({ name: 'creer_personne', arguments: { nom: 'Personne Etrangere', proprietaire: 'etranger@autre.example' } }));
    assert.equal((await donnees.liste('clients/a/crm_personnes')).find((d) => d.id === r.id).proprietaire, 'etranger@autre.example');
    await c.close();
    await reinitialiser();
  });
  test('P4 cas d\'erreur : une connexion sans e-mail (document abîmé) est refusée comme un jeton inconnu, rien n\'est écrit', async () => {
    await reinitialiser();
    const t = await connecter('a', 'ID-ALICE');
    const connexions = (await donnees.liste('mcp_oauth')).filter((d) => d.id.startsWith('connexion_'));
    assert.equal(connexions.length, 1);
    const { email, ...sansEmail } = connexions[0];
    await donnees.appliquer([{ type: 'set', collection: 'mcp_oauth', id: connexions[0].id, donnees: sansEmail }]);
    const avant = (await donnees.liste('clients/a/crm_personnes')).length;
    const r = await brut('/mcp/a', t.access_token, { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'creer_personne', arguments: { nom: 'Sans Courriel' } } });
    assert.equal(r.status, 401);
    assert.equal((await donnees.liste('clients/a/crm_personnes')).length, avant);
    await reinitialiser();
  });
});

describe('Jérôme : son serveur ne change pas', () => {
  test('le serveur de Jérôme garde ses adresses, sa liste de comptes et son profil unique', async () => {
    const c = await import('../functions/src/oauth/config.js');
    assert.equal(c.RESSOURCE, 'https://chevalier-ia-os.web.app/mcp');
    assert.equal(c.PROFIL_OAUTH, 'claude-code');
    assert.deepEqual(c.COMPTES_AUTORISES, ['jerome.chevalier@gmail.com', 'jeromebot.chevalierbot@gmail.com']);
    const { pageAutorisation } = await import('../functions/src/oauth/page.js');
    const p = pageAutorisation({ client_id: 'x', redirect_uri: 'https://claude.ai/api/mcp/auth_callback', code_challenge: 'c'.repeat(43) });
    assert.match(p, /Autoriser Claude à accéder à Chevalier IA OS \?/);
    assert.match(p, /\/oauth\/approve/);
    assert.match(p, /supprimer<\/strong>/);
  });
});

// --- textes des outils et liste selon les options (2.11.0) ----------------------------------------------------------------------------------
const OUTILS_FACTURES = ['abandonner_facture', 'ajouter_facture', 'marquer_facture_payee'];
const OUTIL_SUPPRIME = 'extraire_valeur_projet'; // supprimé le 18/10/2026 avec la fonctionnalité « Extraction de valeur »
const reglerOptions = (client, options) => donnees.appliquer([{ type: 'set', collection: `clients/${client}/crm_parametres`, id: 'reglages', donnees: { id: 'reglages', delaiPaiementJours: 45, ...options } }]);
const outilsDe = async (client, identite = 'ID-ALICE') => {
  const t = await connecter(client, identite);
  const c = await assistant(`/mcp/${client}`, t.access_token);
  return { c, liste: noms(await c.listTools()) };
};
/** Tous les textes d'un outil : nom, description, et description de chaque paramètre (schéma compris, y compris les paramètres imbriqués). */
const textesDe = (o) => JSON.stringify([o.nom, o.description, o.schema ? z.toJSONSchema(z.object(o.schema)) : null]);
const TEXTE_DE_JEROME = /\b(premier_contact|rdv_fixe|proposition_envoyee|gagne|lancement|decouverte|cloture)\b|Accompagnement|jerome\.chevalier|Jérôme|\bAudit\b/;

describe('Textes des outils : valables pour tout espace (Partie A)', () => {
  test('D1a aucun outil ne cite une étape, une phase, une offre ou une adresse propre à Jérôme (le test échoue bien sur l\'ancien texte)', () => {
    // Garde-fou du test lui-même : l'expression reconnaît les anciens textes, et laisse passer les mots légitimes.
    for (const ancien of ['Étapes : premier_contact, rdv_fixe, proposition_envoyee, gagne', 'défaut : jerome.chevalier@gmail.com', 'Le propriétaire est Jérôme par défaut', 'Phase de départ : lancement', '(Audit, Accompagnement, Étude…)', 'phases decouverte, cloture']) {
      assert.match(ancien, TEXTE_DE_JEROME, ancien);
    }
    for (const permis of ['une affaire gagnée', 'nature livraison', 'lire_audit : le journal d\'audit', 'phase de clôture']) assert.doesNotMatch(permis, TEXTE_DE_JEROME, permis);
    assert.ok(OUTILS.length >= 50);
    for (const o of OUTILS) assert.doesNotMatch(textesDe(o), TEXTE_DE_JEROME, `${o.nom} : ${textesDe(o).match(TEXTE_DE_JEROME)?.[0]}`);
  });

  test('D1b sur un espace client, lire_reglages rend etape_1…, phase_1… et leurs noms, sans identifiant de Jérôme', async () => {
    const { c } = await outilsDe('c');
    const r = resultat(await c.callTool({ name: 'lire_reglages', arguments: {} }));
    const idsEtapes = r.configuration.etapes.map((e) => e.id);
    assert.deepEqual(idsEtapes, ['etape_1', 'etape_2', 'etape_3', 'etape_4', 'etape_5', 'etape_6']);
    assert.equal(r.configuration.etapes[0].libelle, 'Nouveau contact');
    assert.deepEqual(r.configuration.phases.map((p) => p.id), ['phase_1', 'phase_2', 'phase_3', 'phase_4', 'phase_5', 'phase_6']);
    assert.ok(r.referentiels.etapes.length > 0 && r.referentiels.projets.phases.length > 0);
    assert.doesNotMatch(JSON.stringify({ configuration: r.configuration, referentiels: r.referentiels }), TEXTE_DE_JEROME);
    await c.close();
  });

  test('D1c lister_affaires et creer_projet renvoient vers lire_reglages (vu par un vrai client MCP)', async () => {
    const { c } = await outilsDe('c');
    const outils = (await c.listTools()).tools;
    const texte = (nom) => outils.find((o) => o.name === nom).description;
    assert.match(texte('lister_affaires'), /lire_reglages/);
    assert.match(texte('creer_projet'), /lire_reglages/);
    for (const o of outils) assert.doesNotMatch(JSON.stringify(o), TEXTE_DE_JEROME, o.name);
    await c.close();
  });
});

describe('Outils factures : listés selon les options de l\'espace (Partie B)', () => {
  test('D3a options éteintes : aucun des 3 outils de factures (liste et qui_suis_je) ; ajouter_facture refusé, base identique, aucune ligne d\'audit', async () => {
    await reinitialiser();
    const { c, liste } = await outilsDe('c');
    for (const n of OUTILS_FACTURES) assert.ok(!liste.includes(n), n);
    assert.ok(liste.includes('creer_projet') && liste.includes('lister_projets'));
    const qui = resultat(await c.callTool({ name: 'qui_suis_je', arguments: {} }));
    for (const n of OUTILS_FACTURES) assert.ok(!qui.outils.includes(n), `qui_suis_je : ${n}`);
    const avant = await donneesDe('c');
    for (const n of OUTILS_FACTURES) assert.ok(await refuse(c, n, { projetId: 'x', id: 'x', factureId: 'x', montant: 100, raison: 'x' }), n);
    assert.deepEqual(await donneesDe('c'), avant, 'aucune écriture');
    assert.equal((await donnees.liste('clients/c/crm_audit')).length, avant['clients/c/crm_audit'].length, 'aucune ligne d\'audit');
    assert.ok(lignesJournal.some((l) => l.outil === 'inconnu'), 'le journal ne nomme pas un outil qui n\'est pas proposé');
    await c.close();
  });

  test('D3a2 seul le suivi des paiements donne des outils ; un ancien réglage « extractionValeur » resté dans la base n\'en donne aucun', async () => {
    try {
      await reglerOptions('c', { suiviPaiements: true });
      let o = await outilsDe('c');
      assert.deepEqual(OUTILS_FACTURES.filter((n) => o.liste.includes(n)), OUTILS_FACTURES);
      await o.c.close();
      await reglerOptions('c', { suiviPaiements: false, extractionValeur: true });
      o = await outilsDe('c');
      assert.deepEqual(OUTILS_FACTURES.filter((n) => o.liste.includes(n)), []);
      assert.ok(!o.liste.includes(OUTIL_SUPPRIME), 'X6 extraire_valeur_projet n\'existe plus');
      await o.c.close();
    } finally { await reinitialiser(); }
  });

  test('D3b options allumées : les 3 outils de factures sont listés et une facture s\'ajoute comme avant', async () => {
    await reinitialiser();
    const { c, liste } = await outilsDe('a');
    for (const n of OUTILS_FACTURES) assert.ok(liste.includes(n), n);
    assert.ok(!liste.includes(OUTIL_SUPPRIME), 'X6 extraire_valeur_projet n\'existe plus, même option ancienne allumée');
    const projet = resultat(await c.callTool({ name: 'creer_projet', arguments: { titre: 'Projet de facture' } }));
    const f = resultat(await c.callTool({ name: 'ajouter_facture', arguments: { projetId: projet.id, montant: 300, libelle: 'Acompte 30 %' } }));
    assert.ok(f.operationId);
    const factures = (await donnees.liste('clients/a/projets_factures').catch(() => [])).concat(await donnees.liste('clients/a/projets_projets'));
    assert.ok(JSON.stringify(factures).includes('Acompte 30 %'), 'la facture est enregistrée');
    await c.close();
    await reinitialiser();
  });

  test('D3c lire_reglages indique configuration.options.suiviPaiements (faux sur c, vrai sur a) et plus extractionValeur', async () => {
    const eteint = await outilsDe('c');
    const allume = await outilsDe('a');
    const oe = resultat(await eteint.c.callTool({ name: 'lire_reglages', arguments: {} })).configuration.options;
    const oa = resultat(await allume.c.callTool({ name: 'lire_reglages', arguments: {} })).configuration.options;
    assert.equal(oe.suiviPaiements, false);
    assert.equal('extractionValeur' in oe, false);
    assert.equal(oa.suiviPaiements, true);
    assert.equal('extractionValeur' in oa, false);
    await eteint.c.close(); await allume.c.close();
  });

  test('D3d table option -> outils : exactement les trois outils de factures, déclarée dans le gestionnaire des clients', () => {
    assert.deepEqual(Object.keys(OUTILS_PAR_OPTION).sort(), ['suiviPaiements']);
    assert.deepEqual(Object.values(OUTILS_PAR_OPTION).flat().sort(), OUTILS_FACTURES);
    for (const n of OUTILS_FACTURES) assert.ok(OUTILS.some((o) => o.nom === n), n);
    assert.ok(!OUTILS.some((o) => o.nom === OUTIL_SUPPRIME), 'X6 l\'outil est supprimé du serveur');
  });

  test('D3e lecture des réglages en panne : 503 « indisponible », aucun outil servi, jamais « tous les outils »', async () => {
    const t = await connecter('c', 'ID-ALICE');
    panneReglages = true;
    for (const corps of [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }, { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'qui_suis_je', arguments: {} } }]) {
      const r = await brut('/mcp/c', t.access_token, corps);
      assert.equal(r.status, 503);
      const texte = await r.text();
      assert.match(texte, /indisponible/);
      assert.doesNotMatch(texte, /ajouter_facture|Firestore|détail interne/);
    }
    assert.ok(lignesJournal.some((l) => l.code === 'reglages_illisibles' && l.statut === 503));
  });

  test('D3f on allume l\'option entre deux appels : le deuxième listTools montre les outils (aucun cache)', async () => {
    await reinitialiser();
    try {
      const t = await connecter('c', 'ID-ALICE');
      const c1 = await assistant('/mcp/c', t.access_token);
      assert.ok(!noms(await c1.listTools()).includes('ajouter_facture'));
      await c1.close();
      await reglerOptions('c', { suiviPaiements: true });
      const c2 = await assistant('/mcp/c', t.access_token);
      const liste = noms(await c2.listTools());
      for (const n of OUTILS_FACTURES) assert.ok(liste.includes(n), n);
      await c2.close();
      await reglerOptions('c', { suiviPaiements: false });
      const c3 = await assistant('/mcp/c', t.access_token);
      for (const n of OUTILS_FACTURES) assert.ok(!noms(await c3.listTools()).includes(n), `éteint à nouveau : ${n}`);
      await c3.close();
    } finally { await reinitialiser(); }
  });
});
