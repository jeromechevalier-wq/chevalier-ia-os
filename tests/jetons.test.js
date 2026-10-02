// Tests de la sécurité des jetons du serveur MCP (étape 2) : format, empreinte, lecture du secret, révocation, génération.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PROFILS, empreinte, extraireBearer, analyserSecret, trouverJeton, creerMagasin, FORMAT_JETON } from '../functions/src/securite/jetons.js';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const JETON_A = `cia_${'A'.repeat(43)}`;
const JETON_B = `cia_${'B'.repeat(43)}`;
const entree = (jeton, extra = {}) => ({ jeton: 'hermes-bibliothecaire', acteur: 'hermes-bibliothecaire', profil: 'bibliothecaire', empreinte: empreinte(jeton), actif: true, ...extra });

describe('Jetons : format et lecture', () => {
  test('l’en-tête Bearer est extrait ; tout autre format est refusé', () => {
    assert.equal(extraireBearer(`Bearer ${JETON_A}`), JETON_A);
    for (const x of [undefined, '', 'Basic abc', `bearer ${JETON_A}`, 'Bearer', `Bearer ${JETON_A} extra`]) assert.equal(extraireBearer(x), null, String(x));
  });
  test('le secret est lu en tableau JSON ou en une entrée par ligne ; une entrée mal formée est ignorée et comptée', () => {
    const e1 = entree(JETON_A);
    const e2 = entree(JETON_B, { jeton: 'claude-code-jerome', acteur: 'claude-code-jerome', profil: 'claude-code' });
    assert.equal(analyserSecret(JSON.stringify([e1, e2])).entrees.length, 2);
    const lignes = analyserSecret(`${JSON.stringify(e1)}\n\n${JSON.stringify(e2)}\n{pas du json\n`);
    assert.equal(lignes.entrees.length, 2);
    assert.equal(lignes.invalides, 1);
    assert.equal(analyserSecret(JSON.stringify({ ...e1, profil: 'root' })).entrees.length, 0, 'profil inconnu refusé');
    assert.equal(analyserSecret(JSON.stringify({ ...e1, empreinte: 'abc' })).entrees.length, 0);
    assert.equal(analyserSecret(JSON.stringify({ ...e1, actif: 'oui' })).entrees.length, 0);
  });
  test('seuls les trois profils du plan existent', () => {
    assert.deepEqual(PROFILS, ['lecteur', 'bibliothecaire', 'claude-code']);
  });
});

describe('Jetons : vérification', () => {
  const { entrees } = analyserSecret(JSON.stringify([entree(JETON_A), entree(JETON_B, { jeton: 'ancien', acteur: 'ancien', actif: false })]));
  test('un jeton connu et actif est reconnu', () => {
    assert.equal(trouverJeton(entrees, JETON_A).acteur, 'hermes-bibliothecaire');
  });
  test('jeton inconnu, absent, mal formé ou révoqué : refusé (même résultat, aucun détail)', () => {
    for (const x of [`cia_${'C'.repeat(43)}`, undefined, null, '', 'cia_court', JETON_A.toLowerCase(), JETON_B]) assert.equal(trouverJeton(entrees, x), null, String(x));
  });
  test('le format attendu est « cia_ » + 43 caractères', () => {
    assert.match(JETON_A, FORMAT_JETON);
    assert.doesNotMatch(`${JETON_A}x`, FORMAT_JETON);
  });
});

describe('Jetons : cache de 60 s et révocation', () => {
  test('une révocation est prise en compte à l’expiration du cache, sans redéploiement', async () => {
    let heure = 0;
    let contenu = JSON.stringify([entree(JETON_A)]);
    let lectures = 0;
    const magasin = creerMagasin({ lire: async () => { lectures += 1; return contenu; }, maintenant: () => heure });
    assert.ok(trouverJeton((await magasin.entrees()).entrees, JETON_A));
    contenu = JSON.stringify([entree(JETON_A, { actif: false })]);
    heure = 59_000;
    assert.ok(trouverJeton((await magasin.entrees()).entrees, JETON_A), 'encore en cache');
    assert.equal(lectures, 1);
    heure = 60_000;
    assert.equal(trouverJeton((await magasin.entrees()).entrees, JETON_A), null, 'révoqué après 60 s');
    assert.equal(lectures, 2);
  });
  test('si le secret devient illisible, on ne sert jamais une copie périmée (échec fermé)', async () => {
    let heure = 0;
    let panne = false;
    const magasin = creerMagasin({ lire: async () => { if (panne) throw new Error('indisponible'); return JSON.stringify([entree(JETON_A)]); }, maintenant: () => heure });
    await magasin.entrees();
    panne = true;
    heure = 61_000;
    await assert.rejects(() => magasin.entrees());
  });
});

describe('outils/creer-jeton.js', () => {
  const lancer = (...args) => execFileSync('node', ['outils/creer-jeton.js', ...args], { cwd: RACINE, encoding: 'utf8' });
  test('génère un jeton valide ; la ligne ne contient que l’empreinte, jamais le jeton', () => {
    const sortie = lancer('hermes-bibliothecaire', 'bibliothecaire');
    const jeton = /cia_[A-Za-z0-9_-]{43}/.exec(sortie)[0];
    const ligne = JSON.parse(/\{"jeton".*\}/.exec(sortie)[0]);
    assert.match(jeton, FORMAT_JETON);
    assert.equal(ligne.empreinte, empreinte(jeton));
    assert.equal(ligne.profil, 'bibliothecaire');
    assert.equal(ligne.actif, true);
    assert.equal(JSON.stringify(ligne).includes(jeton), false);
    assert.ok(trouverJeton(analyserSecret(JSON.stringify(ligne)).entrees, jeton));
  });
  test('deux appels donnent deux jetons différents ; un profil ou un nom invalide est refusé', () => {
    assert.notEqual(/cia_[A-Za-z0-9_-]{43}/.exec(lancer('a-b', 'lecteur'))[0], /cia_[A-Za-z0-9_-]{43}/.exec(lancer('a-b', 'lecteur'))[0]);
    assert.throws(() => execFileSync('node', ['outils/creer-jeton.js', 'a-b', 'root'], { cwd: RACINE, stdio: 'pipe' }));
    assert.throws(() => execFileSync('node', ['outils/creer-jeton.js', 'A B', 'lecteur'], { cwd: RACINE, stdio: 'pipe' }));
  });
});
