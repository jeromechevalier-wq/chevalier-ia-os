// L'appel sortant vers n8n de « Préparer l'e-mail » : UN SEUL fichier (functions/src/coeur/n8n-sortie.js) a le droit de faire un POST vers n8n, vers une adresse de NOTRE n8n, au chemin « /webhook/… ».
// Ces tests ne lancent rien : ils lisent le code (borne) et font parler la sortie avec un faux n8n.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as N from '../functions/src/coeur/n8n-sortie.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
/** Code sans commentaires : on cherche des appels réels, pas des mots dans une explication. */
const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
function fichiersJs(dossier, sortie = []) {
  for (const n of readdirSync(join(RACINE, dossier))) {
    const chemin = `${dossier}/${n}`;
    if (n === 'node_modules' || n === 'partage' || (n === 'serveur' && dossier === 'functions-plateforme')) continue; // copies générées, ignorées par git
    if (statSync(join(RACINE, chemin)).isDirectory()) fichiersJs(chemin, sortie);
    else if (/\.js$/.test(n)) sortie.push(chemin);
  }
  return sortie;
}
const FICHIER_SORTIE = 'functions/src/coeur/n8n-sortie.js';
const TOUS = ['functions/src', 'functions-plateforme/src', 'scripts', 'js'].flatMap((d) => fichiersJs(d));

describe('S1 un seul fichier fait un POST vers n8n', () => {
  test('S1 parmi tout le code (fonctions, plateforme, scripts, appli), seul n8n-sortie.js envoie un POST et parle de n8n', () => {
    const posteurs = TOUS.filter((f) => /method\s*:\s*['"`]POST['"`]|\.post\s*\(/i.test(code(lire(f))) && /n8n/i.test(code(lire(f))));
    assert.deepEqual(posteurs, [FICHIER_SORTIE]);
  });
  test('S1 ce fichier : un seul point de sortie réseau, un seul POST, aucun autre verbe, hôte et chemin fixés, aucune variable d’environnement, rien d’écrit dans les journaux', () => {
    const c = code(lire(FICHIER_SORTIE));
    assert.equal((c.match(/\bfetchImpl\s*\(/g) || []).length, 1);
    assert.deepEqual([...c.matchAll(/method\s*:\s*['"`]([A-Za-z]+)['"`]/g)].map((m) => m[1]), ['POST']);
    assert.ok(!/['"`](PUT|PATCH|DELETE|GET|HEAD)['"`]/.test(c));
    assert.match(c, /HOTE_N8N = 'n8n\.chevalier-ia\.fr'/);
    assert.match(c, /redirect: 'error'/);
    assert.ok(!/process\.env|console\.|logger\./.test(c));
    assert.ok(!/\/run|\/activate|\/deactivate|\/credentials|\/users|\/variables|api\/v1/.test(c), 'jamais l’API d’administration de n8n');
  });
  test('S1 les autres fichiers de « Préparer l’e-mail » ne font aucun appel réseau', () => {
    for (const f of ['functions/src/coeur/devis-email.js', 'functions/src/devis-email-appel.js', 'scripts/porte/actions-devis.js', 'js/modules/devis/email-preparer.js', 'js/modules/devis/email-preparer-ecran.js']) {
      assert.ok(!/\bfetch\s*\(|fetchImpl\s*\(|XMLHttpRequest|https?\.request|axios|undici/.test(code(lire(f))), f);
    }
  });
  test('S1 aucun webhook, secret ni adresse de n8n réelle n’est écrit dans le dépôt : seulement les NOMS des secrets', () => {
    for (const f of ['functions/src/coeur/n8n-sortie.js', 'functions/src/coeur/devis-email.js', 'functions/src/devis-email-appel.js', 'functions/src/index.js', 'functions-plateforme/src/index.js', 'functions-plateforme/src/devis.js', 'scripts/porte/actions-devis.js', 'js/modules/devis/donnees.js', 'js/modules/devis/email-preparer.js', 'js/modules/devis/email-preparer-ecran.js', 'docs/ajouter-un-bouton-workflow.md', 'docs/porte-cles.md']) {
      const t = lire(f);
      const urls = [...t.matchAll(/https:\/\/n8n\.chevalier-ia\.fr\/webhook\/[A-Za-z0-9_/-]+/g)].map((m) => m[0]);
      assert.deepEqual(urls, [], `${f} ne doit contenir aucune adresse de webhook`);
    }
    assert.equal(N.SECRET_URL, 'N8N_DEVIS_EMAIL_URL');
    assert.equal(N.SECRET_CLE, 'N8N_DEVIS_EMAIL_SECRET');
  });
});

describe('S2 la sortie : ce qu’elle accepte et ce qu’elle envoie', () => {
  const URL = 'https://n8n.chevalier-ia.fr/webhook/essai-faux-webhook';
  const sortie = (secrets, extra = {}) => {
    const appels = [];
    const lectures = [];
    const s = N.creerSortieN8n({
      lireSecret: async (nom) => { lectures.push(nom); if (!(nom in secrets)) throw new Error('absent'); return secrets[nom]; },
      fetchImpl: extra.fetchImpl ?? (async (url, options) => { appels.push({ url, options }); return { ok: true, status: 200 }; }),
      maintenant: extra.maintenant ?? (() => 1000),
    });
    return { s, appels, lectures };
  };
  test('S2 seule une adresse https de NOTRE n8n, au chemin « /webhook/… », sans identifiant ni paramètre, est acceptée', () => {
    assert.equal(N.adresseSure(URL), URL);
    assert.equal(N.adresseSure(`  ${URL}\n`), URL);
    for (const mauvaise of [
      'http://n8n.chevalier-ia.fr/webhook/x', 'https://autre.exemple.test/webhook/x', 'https://n8n.chevalier-ia.fr.evil.test/webhook/x', 'https://n8n.chevalier-ia.fr:8443/webhook/x',
      'https://user:mdp@n8n.chevalier-ia.fr/webhook/x', 'https://n8n.chevalier-ia.fr/webhook/x?a=1', 'https://n8n.chevalier-ia.fr/webhook/x#y', 'https://n8n.chevalier-ia.fr/rest/workflows',
      'https://n8n.chevalier-ia.fr/api/v1/workflows', 'https://n8n.chevalier-ia.fr/webhook/', 'https://n8n.chevalier-ia.fr/webhook/../rest/login', 'https://n8n.chevalier-ia.fr/webhook/a b', '', 'webhook', null, undefined,
    ]) assert.equal(N.adresseSure(mauvaise), null, String(mauvaise));
  });
  test('S2 le POST : adresse du secret, en-tête secret, corps JSON fixe { action, espace, devisId, demandeId }, aucune redirection suivie', async () => {
    const { s, appels } = sortie({ [N.SECRET_URL]: URL, [N.SECRET_CLE]: ' mon-secret \n' });
    await s.demander('interne', { devisId: 'dv1', demandeId: 'dem_1' });
    assert.equal(appels.length, 1);
    assert.equal(appels[0].url, URL);
    assert.equal(appels[0].options.method, 'POST');
    assert.deepEqual(appels[0].options.headers, { 'Content-Type': 'application/json', 'X-Chevalier-Secret': 'mon-secret' });
    assert.equal(appels[0].options.redirect, 'error');
    assert.deepEqual(JSON.parse(appels[0].options.body), { action: 'devis.preparerEmail', espace: 'interne', devisId: 'dv1', demandeId: 'dem_1' });
    assert.ok(appels[0].options.signal, 'arrêt au bout d’un délai');
  });
  test('S2 les noms de secrets : sans suffixe chez Jérôme, « _<client> » chez un client ; un nom de client douteux ne mène à aucun secret', async () => {
    assert.equal(N.nomDuSecret(N.SECRET_URL, 'interne'), 'N8N_DEVIS_EMAIL_URL');
    assert.equal(N.nomDuSecret(N.SECRET_URL, 'audrey'), 'N8N_DEVIS_EMAIL_URL_audrey');
    for (const mauvais of ['', 'A', '../x', 'a/b', 'a b', 'x'.repeat(41), undefined]) assert.throws(() => N.nomDuSecret(N.SECRET_URL, mauvais), (e) => e.genre === 'non_branche');
    const { s, lectures } = sortie({});
    assert.equal(await s.branche('../x').catch(() => false), false);
    assert.deepEqual(lectures, []);
  });
  test('S2 « branché » = adresse ET secret valides ; réponse gardée une minute (un secret manquant n’est pas relu à chaque clic) ; n8n 401/403 = refusé, 5xx ou coupure = indisponible', async () => {
    let t = 1000;
    const { s, lectures } = sortie({ [N.SECRET_URL]: URL, [N.SECRET_CLE]: 's' }, { maintenant: () => t });
    assert.equal(await s.branche('interne'), true);
    await s.branche('interne');
    assert.equal(lectures.length, 2, 'adresse et secret lus une seule fois');
    t += 61_000;
    await s.branche('interne');
    assert.equal(lectures.length, 4);
    for (const [statut, genre] of [[401, 'refuse'], [403, 'refuse'], [500, 'indisponible'], [404, 'indisponible']]) {
      const x = sortie({ [N.SECRET_URL]: URL, [N.SECRET_CLE]: 's' }, { fetchImpl: async () => ({ ok: false, status: statut }) });
      await assert.rejects(x.s.demander('interne', { devisId: 'a', demandeId: 'b' }), (e) => e.name === 'ErreurSortieN8n' && e.genre === genre, String(statut));
    }
    const coupure = sortie({ [N.SECRET_URL]: URL, [N.SECRET_CLE]: 's' }, { fetchImpl: async () => { throw new Error('réseau'); } });
    await assert.rejects(coupure.s.demander('interne', { devisId: 'a', demandeId: 'b' }), (e) => e.genre === 'indisponible' && !/réseau|webhook/.test(e.message));
    const absent = sortie({});
    await assert.rejects(absent.s.demander('interne', { devisId: 'a', demandeId: 'b' }), (e) => e.genre === 'non_branche' && e.message === N.MESSAGE_NON_BRANCHE);
    assert.equal(absent.appels.length, 0);
  });
  test('S2 un secret avec un retour à la ligne au milieu ou vide n’est pas utilisable', async () => {
    for (const secret of ['', '   ', 'a\nb', 'x'.repeat(501)]) assert.equal(await sortie({ [N.SECRET_URL]: URL, [N.SECRET_CLE]: secret }).s.branche('interne'), false, JSON.stringify(secret).slice(0, 20));
  });
});
