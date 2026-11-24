// Couche d'accès à la base (js/os/supabase.js) : faux réseau en mémoire, aucun appel réel. Adresses, clés et jetons ci-dessous : inventés (domaine réservé « .invalid »).
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test, describe } from 'node:test';
import { creerClient, adresseHttps, ErreurBase, MESSAGE_RECONNEXION, PAGES_MAX, TAILLE_PAGE } from '../js/os/supabase.js';

const BASE = ['https', '://base-essai.invalid'].join('');
const connexion = () => ({ adresseBase: BASE, clePublique: 'cle-publique-inventee', espace: 'essai', webhooks: {} });
const badgeBon = async () => ({ jeton: 'badge-inventé', claims: { role: 'authenticated', espace_base: 'essai' } });

function fauxReseau(repondre) {
  const appels = [];
  const f = async (url, init) => {
    appels.push({ url: new URL(url), init });
    const r = await repondre(new URL(url), init, appels.length);
    return { ok: r.status >= 200 && r.status < 300, status: r.status, headers: { get: (n) => (r.entetes && r.entetes[n]) || null }, json: async () => r.corps };
  };
  f.appels = appels;
  return f;
}
const client = (rep, extra = {}) => { const f = fauxReseau(rep); return { f, c: creerClient({ lireConnexion: connexion, obtenirBadge: badgeBon, fetchImpl: f, ...extra }) }; };

describe('lecture', () => {
  test('colonnes nommées, filtres, tri : bonne adresse, en-têtes apikey et Bearer', async () => {
    const { f, c } = client(() => ({ status: 200, corps: [{ id: 'a' }] }));
    const r = await c.lire('factures', { colonnes: ['id', 'statut'], filtres: [['statut', 'eq', 'a_valider'], ['id', 'in', ['x', 'y"z']]], tri: [{ col: 'created_at', asc: false }, 'id'] });
    assert.deepEqual(r.lignes, [{ id: 'a' }]);
    assert.equal(r.tronque, false);
    const { url, init } = f.appels[0];
    assert.equal(url.origin, BASE);
    assert.equal(url.pathname, '/rest/v1/factures');
    assert.equal(url.searchParams.get('select'), 'id,statut');
    assert.equal(url.searchParams.get('statut'), 'eq.a_valider');
    assert.equal(url.searchParams.get('id'), 'in.("x","y\\"z")');
    assert.equal(url.searchParams.get('order'), 'created_at.desc,id.asc');
    assert.equal(init.headers.apikey, 'cle-publique-inventee');
    assert.equal(init.headers.Authorization, 'Bearer badge-inventé');
  });
  test('refuse l’étoile, les noms douteux et les opérateurs inconnus : rien n’est envoyé', async () => {
    const { f, c } = client(() => ({ status: 200, corps: [] }));
    await assert.rejects(c.lire('factures', { colonnes: ['*'] }), /refusé/);
    await assert.rejects(c.lire('factures', { colonnes: [] }), /nommer/);
    await assert.rejects(c.lire('factures; drop', { colonnes: ['id'] }), /refusé/);
    await assert.rejects(c.lire('factures', { colonnes: ['id'], filtres: [['id', 'ou', 1]] }), /inconnu/);
    await assert.rejects(c.lire('factures', { colonnes: ['id'], filtres: [['id) or (1', 'eq', 1]] }), /refusé/);
    assert.equal(f.appels.length, 0);
  });
  test('page par page : s’arrête à la première page non pleine', async () => {
    const { f, c } = client((u) => ({ status: 200, corps: Number(u.searchParams.get('offset')) === 0 ? Array.from({ length: 3 }, (_, i) => ({ i })) : [{ i: 99 }] }));
    const r = await c.lire('t', { colonnes: ['i'], tailleLot: 3, tri: ['i'] });
    assert.equal(r.lignes.length, 4);
    assert.equal(r.tronque, false);
    assert.deepEqual(f.appels.map((a) => a.url.searchParams.get('offset')), ['0', '3']);
  });
  test('plafond de 20 pages DIT à voix haute (jamais une liste coupée en silence)', async () => {
    const { f, c } = client(() => ({ status: 200, corps: Array.from({ length: TAILLE_PAGE }, (_, i) => ({ i })) }));
    const r = await c.lire('t', { colonnes: ['i'], tri: ['i'] });
    assert.equal(f.appels.length, PAGES_MAX);
    assert.equal(r.lignes.length, PAGES_MAX * TAILLE_PAGE);
    assert.equal(r.tronque, true);
    assert.match(r.message, /20 pages/);
  });
  test('cas vide : liste vide, pas tronquée, pas de message', async () => {
    const { c } = client(() => ({ status: 200, corps: [] }));
    assert.deepEqual(await c.lire('t', { colonnes: ['i'] }), { lignes: [], tronque: false, message: '' });
  });
  test('réponse qui n’est pas une liste : erreur, pas une liste vide', async () => {
    const { c } = client(() => ({ status: 200, corps: { message: 'x' } }));
    await assert.rejects(c.lire('t', { colonnes: ['i'] }), (e) => e.code === 'reponse');
  });
});

describe('badge, reconnexion et erreurs', () => {
  test('sans la mention role : un rafraîchissement forcé, puis « Reconnecte-toi » (jamais une liste vide)', async () => {
    const demandes = [];
    const f = fauxReseau(() => ({ status: 200, corps: [] }));
    const c = creerClient({ lireConnexion: connexion, obtenirBadge: async (forcer) => { demandes.push(Boolean(forcer)); return { jeton: 'j', claims: {} }; }, fetchImpl: f });
    await assert.rejects(c.lire('t', { colonnes: ['i'] }), (e) => e.code === 'reconnexion' && e.message === MESSAGE_RECONNEXION);
    assert.deepEqual(demandes, [false, true]);
    assert.equal(f.appels.length, 0, 'aucun appel avec un badge sans mention');
  });
  test('mention absente puis présente après rafraîchissement : ça passe', async () => {
    let n = 0;
    const f = fauxReseau(() => ({ status: 200, corps: [] }));
    const c = creerClient({ lireConnexion: connexion, obtenirBadge: async (forcer) => ({ jeton: forcer ? 'neuf' : 'vieux', claims: forcer ? { role: 'authenticated', espace_base: 'essai' } : {} }), fetchImpl: f });
    await c.lire('t', { colonnes: ['i'] });
    assert.equal(f.appels[0].init.headers.Authorization, 'Bearer neuf');
    assert.equal(n, 0);
  });
  test('401 et 403 de la base : « Reconnecte-toi »', async () => {
    for (const statut of [401, 403]) {
      const { c } = client(() => ({ status: statut, corps: { message: 'jwt' } }));
      await assert.rejects(c.lire('t', { colonnes: ['i'] }), (e) => e.code === 'reconnexion' && e.statut === statut);
    }
  });
  test('erreur 500 et réseau coupé : messages en français', async () => {
    await assert.rejects(client(() => ({ status: 500, corps: {} })).c.lire('t', { colonnes: ['i'] }), /souci/);
    const c = creerClient({ lireConnexion: connexion, obtenirBadge: badgeBon, fetchImpl: async () => { throw new Error('coupé'); } });
    await assert.rejects(c.lire('t', { colonnes: ['i'] }), (e) => e.code === 'reseau' && /impossible/.test(e.message));
  });
  test('connexion non réglée : l’erreur de lireConnexion remonte', async () => {
    const c = creerClient({ lireConnexion: () => { throw new Error('Connexion à la base non réglée'); }, obtenirBadge: badgeBon, fetchImpl: fauxReseau(() => ({ status: 200, corps: [] })) });
    await assert.rejects(c.lire('t', { colonnes: ['i'] }), /non réglée/);
  });
  test('MODE_EMULATEURS : aucun appel réseau réel sans faux réseau explicite', async () => {
    const c = creerClient({ lireConnexion: connexion, obtenirBadge: badgeBon, modeEmulateurs: true });
    await assert.rejects(c.lire('t', { colonnes: ['i'] }), (e) => e.code === 'mode_test');
  });
});

describe('corrections de la relecture', () => {
  test('badge d’un autre espace (ou sans espace) : « Reconnecte-toi », rien n’est envoyé', async () => {
    for (const claims of [{ role: 'authenticated', espace_base: 'autre' }, { role: 'authenticated' }]) {
      const f = fauxReseau(() => ({ status: 200, corps: [] }));
      const c = creerClient({ lireConnexion: connexion, obtenirBadge: async () => ({ jeton: 'j', claims }), fetchImpl: f });
      await assert.rejects(c.lire('t', { colonnes: ['i'] }), (e) => e.code === 'reconnexion');
      assert.equal(f.appels.length, 0);
    }
  });
  test('refus SQL 400 « acces_base_refuse » : « Reconnecte-toi » ; autres détails exposés dans `detail`', async () => {
    await assert.rejects(client(() => ({ status: 400, corps: { details: 'acces_base_refuse' } })).c.appeler('f'), (e) => e.code === 'reconnexion' && e.detail === 'acces_base_refuse');
    for (const d of ['ticket_trop_de_demandes', 'favori_cle_inconnue']) {
      await assert.rejects(client(() => ({ status: 400, corps: { message: 'm', details: d } })).c.appeler('f'), (e) => e.code === 'refus' && e.detail === d);
    }
  });
  test('2e page sans tri : refusée ; avec tri : lue', async () => {
    const pleine = (u) => ({ status: 200, corps: Array.from({ length: 2 }, (_, i) => ({ i })) });
    await assert.rejects(client(pleine).c.lire('t', { colonnes: ['i'], tailleLot: 2 }), /sans tri/);
    const { f, c } = client((u) => ({ status: 200, corps: Number(u.searchParams.get('offset')) ? [{ i: 9 }] : [{ i: 1 }, { i: 2 }] }));
    assert.equal((await c.lire('t', { colonnes: ['i'], tailleLot: 2, tri: ['i'] })).lignes.length, 3);
    assert.equal(f.appels[0].init.headers.Prefer, 'count=exact');
  });
  test('tailleLot borné à 1000 ; arrêt d’après Content-Range (total atteint)', async () => {
    const { f, c } = client(() => ({ status: 200, corps: Array.from({ length: 1000 }, (_, i) => ({ i })), entetes: { 'Content-Range': '0-999/1000' } }));
    const r = await c.lire('t', { colonnes: ['i'], tailleLot: 5000 });
    assert.equal(f.appels.length, 1);
    assert.equal(f.appels[0].url.searchParams.get('limit'), '1000');
    assert.equal(r.tronque, false);
  });
  test('noms réservés refusés comme colonnes ; null et undefined refusés comme valeurs de filtre ; « * » littéral dans like', async () => {
    const { f, c } = client(() => ({ status: 200, corps: [] }));
    for (const nom of ['select', 'order', 'limit', 'offset', 'and', 'or', 'not']) {
      await assert.rejects(c.lire('t', { colonnes: [nom] }), /réservé/, nom);
      await assert.rejects(c.lire('t', { colonnes: ['i'], filtres: [[nom, 'eq', 1]] }), /réservé/, nom);
    }
    await assert.rejects(c.lire('t', { colonnes: ['i'], filtres: [['i', 'eq', null]] }), /valeur/);
    await assert.rejects(c.lire('t', { colonnes: ['i'], filtres: [['i', 'eq', undefined]] }), /valeur/);
    assert.equal(f.appels.length, 0);
    await c.lire('t', { colonnes: ['i'], filtres: [['i', 'is', null], ['n', 'ilike', 'a*b']] });
    assert.equal(f.appels[0].url.searchParams.get('i'), 'is.null');
    assert.equal(f.appels[0].url.searchParams.get('n'), 'ilike.a\\*b');
  });
  test('les appels refusent les redirections', async () => {
    const { f, c } = client(() => ({ status: 200, corps: [] }));
    await c.appeler('f');
    assert.equal(f.appels[0].init.redirect, 'error');
  });
});

describe('adresses : https seulement, vérifié par la couche elle-même', () => {
  test('adresseHttps accepte https, refuse le reste', () => {
    assert.equal(adresseHttps(BASE).origin, BASE);
    for (const mauvaise of ['http://a.invalid', 'ftp://a.invalid', 'javascript:alert(1)', 'a.invalid', '', null, undefined, 'data:text/html,x', '//a.invalid']) {
      assert.throws(() => adresseHttps(mauvaise), (e) => e instanceof ErreurBase && e.code === 'adresse', String(mauvaise));
    }
  });
  test('une adresse de base en http est refusée avant tout envoi (le badge ne part jamais)', async () => {
    const f = fauxReseau(() => ({ status: 200, corps: [] }));
    const c = creerClient({ lireConnexion: () => ({ ...connexion(), adresseBase: 'http://base-essai.invalid' }), obtenirBadge: badgeBon, fetchImpl: f });
    await assert.rejects(c.lire('t', { colonnes: ['i'] }), (e) => e.code === 'adresse');
    await assert.rejects(c.appeler('une_fonction'), (e) => e.code === 'adresse');
    assert.equal(f.appels.length, 0);
  });
  test('clé publique absente : refus', async () => {
    const c = creerClient({ lireConnexion: () => ({ ...connexion(), clePublique: '' }), obtenirBadge: badgeBon, fetchImpl: fauxReseau(() => ({ status: 200, corps: [] })) });
    await assert.rejects(c.lire('t', { colonnes: ['i'] }), /clé publique/);
  });
});

describe('fonctions, ticket, lien de PDF, test de connexion', () => {
  test('appeler : POST sur la fonction, arguments nommés', async () => {
    const { f, c } = client(() => ({ status: 200, corps: [1] }));
    assert.deepEqual(await c.appeler('lister_favoris_os', { p_objet: 'x' }), [1]);
    assert.equal(f.appels[0].url.pathname, '/rest/v1/rpc/lister_favoris_os');
    assert.equal(f.appels[0].init.method, 'POST');
    assert.deepEqual(JSON.parse(f.appels[0].init.body), { p_objet: 'x' });
    await assert.rejects(c.appeler('x/../y'), /refusé/);
  });
  test('demanderTicket : appelle demander_ticket_n8n avec l’usage ; accepte une chaîne ; refuse une réponse vide', async () => {
    const { f, c } = client(() => ({ status: 200, corps: 'ticket-inventé' }));
    assert.equal(await c.demanderTicket('actions'), 'ticket-inventé');
    assert.equal(f.appels[0].url.pathname, '/rest/v1/rpc/demander_ticket_n8n');
    assert.deepEqual(JSON.parse(f.appels[0].init.body), { p_usage: 'actions' });
    await assert.rejects(client(() => ({ status: 200, corps: null })).c.demanderTicket('actions'), (e) => e.code === 'reponse');
  });
  test('lienPdf : lien signé relatif complété avec l’adresse de la base ; chemins douteux refusés ; lien d’une autre origine refusé', async () => {
    const { f, c } = client(() => ({ status: 200, corps: { signedURL: '/object/sign/factures/a/b%20c.pdf?token=zzz' } }));
    const lien = await c.lienPdf('factures', 'a/b c.pdf', 600);
    assert.equal(lien, `${BASE}/storage/v1/object/sign/factures/a/b%20c.pdf?token=zzz`);
    assert.equal(f.appels[0].url.pathname, '/storage/v1/object/sign/factures/a/b%20c.pdf');
    assert.deepEqual(JSON.parse(f.appels[0].init.body), { expiresIn: 600 });
    await assert.rejects(c.lienPdf('factures', '../secret.pdf'), /refusé/);
    await assert.rejects(c.lienPdf('factures', '/a.pdf'), /refusé/);
    const autre = client(() => ({ status: 200, corps: { signedURL: 'https://autre.invalid/x' } })).c;
    await assert.rejects(autre.lienPdf('factures', 'a.pdf'), /refusé/);
    await assert.rejects(client(() => ({ status: 200, corps: {} })).c.lienPdf('factures', 'a.pdf'), (e) => e.code === 'reponse');
  });
  test('tester : appelle lister_favoris_os (une liste vide ne suffit pas à dire « ça marche » : un refus est une erreur)', async () => {
    const { f, c } = client(() => ({ status: 200, corps: [] }));
    assert.deepEqual(await c.tester(), { ok: true });
    assert.equal(f.appels[0].url.pathname, '/rest/v1/rpc/lister_favoris_os');
    const refus = client(() => ({ status: 400, corps: { message: 'refus', details: 'acces_base_refuse' } })).c;
    await assert.rejects(refus.tester(), (e) => e.code === 'reconnexion');
  });
});

// ─── Verrou : seuls js/os/supabase.js et js/os/actions-metier.js parlent au réseau ───
describe('verrou réseau : un appel au réseau n’existe que dans les deux fichiers de la couche d’accès', () => {
  const racine = new URL('..', import.meta.url).pathname;
  const MOTS = /\bfetch\s*\(|XMLHttpRequest|sendBeacon|\bWebSocket\b|\bEventSource\b/;
  const AUTORISES = ['js/os/supabase.js', 'js/os/actions-metier.js'];
  // Décision prise seul : js/os/pwa.js lit déjà « version.json » (adresse relative, même site) pour détecter une nouvelle version : exception exacte, verrouillée ci-dessous.
  const EXCEPTION_PWA = 'js/os/pwa.js';
  const fichiers = (dossier, sortie = []) => {
    for (const nom of readdirSync(dossier)) {
      const chemin = join(dossier, nom);
      if (statSync(chemin).isDirectory()) fichiers(chemin, sortie);
      else if (/\.(js|mjs|html)$/.test(nom)) sortie.push(chemin.slice(racine.length).replaceAll('\\', '/'));
    }
    return sortie;
  };
  test('aucun autre fichier de js/ ne contient fetch(, XMLHttpRequest, sendBeacon, WebSocket ou EventSource', () => {
    const trouves = fichiers(join(racine, 'js')).filter((f) => !AUTORISES.includes(f) && f !== EXCEPTION_PWA && MOTS.test(readFileSync(join(racine, f), 'utf8')));
    assert.deepEqual(trouves, []);
  });
  test('exception de pwa.js : un seul fetch( relatif vers version.json, aucun autre mot réseau', () => {
    const s = readFileSync(join(racine, EXCEPTION_PWA), 'utf8');
    assert.equal([...s.matchAll(/\bfetch\s*\(/g)].length, 1);
    assert.match(s, /fetch\(`version\.json\?t=/);
    assert.doesNotMatch(s, /XMLHttpRequest|sendBeacon|\bWebSocket\b|\bEventSource\b/);
  });
  test('les deux fichiers de la couche ne contiennent aucune adresse en dur (ni http, ni https)', () => {
    for (const f of AUTORISES) assert.doesNotMatch(readFileSync(join(racine, f), 'utf8'), /https?:\/\//, f);
  });
  test('seul actions-metier.js peut envoyer à un webhook : supabase.js ne connaît pas les webhooks', () => {
    assert.doesNotMatch(readFileSync(join(racine, 'js/os/supabase.js'), 'utf8'), /webhooks/);
  });
});
