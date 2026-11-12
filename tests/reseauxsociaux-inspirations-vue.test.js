// Écran Inspirations en liste dense (13/11/2026) : règles pures de la vue (sources + résumés de veille, filtres, vue à plat, compteurs, textes) et contrôles statiques des fichiers d'écran. Données fictives uniquement.
// Les parcours à l'écran sont dans tests/e2e/reseauxsociaux-inspirations-dense.spec.js.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as V from '../js/modules/reseauxsociaux/inspirations-vue-logique.js';
import * as P from '../js/modules/reseauxsociaux/pistes-logique.js';
import { ICONES } from '../js/os/ui.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const source = (id, extra = {}) => ({ id, type: 'site', nom: `Source ${id}`, url: 'https://exemple.test', pourquoi: '', piliers: [], formats: [], ordre: 0, ...extra });
const piste = (id, extra = {}) => ({ id, sourceId: 's1', angle: `Angle ${id}`, note: '', pilier: null, format: null, etat: 'nouvelle', ideeId: null, creeLe: new Date(`2026-11-0${id.length}T10:00:00Z`), ...extra });

describe('V1 sources affichées : fiches réelles + résumés de veille repérés tout seuls', () => {
  test('V1 un contenu de veille à l’état « résumé » devient une source virtuelle (identifiant veille-<id>) ; ni « nouveau », ni « échec » ; pas de doublon avec une fiche liée', () => {
    const contenus = [{ id: 'c1', titre: 'Résumé - Un épisode', etat: 'resume' }, { id: 'c2', titre: 'Pas fini', etat: 'nouveau' }, { id: 'c3', titre: 'Cassé', etat: 'echec' }, { id: 'c4', titre: 'Déjà une fiche', etat: 'résumée' }, { id: 'c5', titre: 'Accent', etat: 'Résumé' }];
    const reelles = [source('s1'), source('fiche-c4', { type: 'veille', veilleContenuId: 'c4' })];
    const liste = V.sourcesAffichees(reelles, contenus);
    assert.deepEqual(liste.map((s) => [s.id, s.virtuelle]), [['fiche-c4', false], ['s1', false], ['veille-c5', true], ['veille-c1', true]]); // fiches d’abord (ordre puis nom), résumés repérés ensuite (par titre)
    const v = liste.find((s) => s.id === 'veille-c1');
    assert.deepEqual([v.type, v.nom, v.veilleContenuId, v.url], ['veille', 'Résumé - Un épisode', 'c1', '']);
  });
  test('V1b sans module Veille (aucun contenu) : seulement les fiches ; une fiche sans type est un profil', () => {
    assert.deepEqual(V.sourcesAffichees([{ id: 'a', nom: 'Alice', url: 'https://linkedin.com/in/a' }], []).map((s) => [s.id, s.type]), [['a', 'profil']]);
    assert.deepEqual(V.sourcesAffichees([], undefined), []);
  });
  test('V1c une fiche créée au premier lot (id veille-<id>) remplace la source virtuelle : jamais deux lignes', () => {
    const liste = V.sourcesAffichees([source('veille-c1', { type: 'veille', nom: 'Résumé - Un épisode' })], [{ id: 'c1', titre: 'Résumé - Un épisode', etat: 'resume' }]);
    assert.deepEqual(liste.map((s) => [s.id, s.virtuelle]), [['veille-c1', false]]);
  });
});

describe('V2 filtres et regroupement', () => {
  const sources = [source('s1'), source('s2', { type: 'profil', nom: 'Alice' }), source('s3', { type: 'veille', nom: 'Vide' })];
  const pistes = [piste('a', { pilier: 'cas_concrets', format: 'carrousel' }), piste('bb', { pilier: 'pedagogie', note: 'Une FACTURE' }), piste('ccc', { sourceId: 's2', etat: 'ecartee' }), piste('dddd', { etat: 'retenue', ideeId: 'i1' })];
  const idees = [{ id: 'i1', etat: 'dans_buffer' }];
  const lignes = (criteres) => V.filtrerSources(sources, pistes, idees, { ...V.criteresInspirations(), ...criteres });
  test('V2 sans filtre : toutes les sources, avec leurs compteurs calculés (postée = idée « Dans Buffer »)', () => {
    const l = lignes({});
    assert.deepEqual(l.map((x) => [x.source.id, x.pistes.length, x.total]), [['s1', 3, 3], ['s2', 1, 1], ['s3', 0, 0]]);
    assert.deepEqual(l[0].compteurs, { pistes: 3, retenues: 1, postees: 1 });
    assert.equal(V.libelleCompteurs(l[0].compteurs), '3 pistes · 1 retenue · 1 postée');
    assert.equal(V.libelleCompteurs(l[2].compteurs), '0 piste · 0 retenue · 0 postée');
  });
  test('V2b filtres de source et de piste : type, pilier, format, état (la marque affichée), sans piste', () => {
    assert.deepEqual(lignes({ types: ['profil', 'veille'] }).map((x) => x.source.id), ['s2', 's3']);
    assert.deepEqual(lignes({ piliers: ['cas_concrets'] }).map((x) => [x.source.id, x.pistes.map((p) => p.id)]), [['s1', ['a']]]);
    assert.deepEqual(lignes({ formats: ['carrousel'] }).map((x) => x.source.id), ['s1']);
    assert.deepEqual(lignes({ etats: ['postee'] }).map((x) => x.pistes.map((p) => p.id)), [['dddd']]);
    assert.deepEqual(lignes({ etats: ['ecartee'] }).map((x) => x.source.id), ['s2']);
    assert.deepEqual(lignes({ sansPiste: true }).map((x) => x.source.id), ['s3']);
    assert.equal(V.nombreFiltresInspirations({ types: ['site'], piliers: ['a', 'b'], sansPiste: true, recherche: 'x' }), 4);
  });
  test('V2c recherche : sans casse ni accents, dans le nom de la source (toutes ses pistes restent) ou dans l’angle et la note d’une piste (seule celle-là reste)', () => {
    assert.deepEqual(lignes({ recherche: 'ALICE' }).map((x) => [x.source.id, x.pistes.length]), [['s2', 1]]);
    assert.equal(lignes({ recherche: 'facturés' }).length, 0);
    assert.equal(lignes({ recherche: 'FACTURÉ' }).length, 1, 'l’accent ne change rien');
    assert.deepEqual(lignes({ recherche: 'facture' }).map((x) => [x.source.id, x.pistes.map((p) => p.id)]), [['s1', ['bb']]]);
  });
  test('V2d vue à plat : toutes les pistes gardées, la plus récente d’abord, chacune avec sa source', () => {
    const plat = V.pistesAPlat(lignes({}));
    assert.deepEqual(plat.map((x) => x.piste.id), ['dddd', 'ccc', 'bb', 'a']);
    assert.equal(plat[1].source.id, 's2');
  });
});

describe('V3 textes et coupe', () => {
  test('V3 couper : caractères réels (jamais au milieu d’un emoji), « … » seulement si coupé', () => {
    assert.equal(V.couper('abc', 5), 'abc');
    assert.equal(V.couper('😀'.repeat(10), 4), '😀😀😀…');
    assert.equal(V.couper('  a   b  ', 10), 'a b');
  });
  test('V3b chiffres d’un exemple : seuls les chiffres présents s’écrivent ; écart à la moyenne calculé', () => {
    assert.equal(V.chiffresExemple({}, {}), '');
    assert.equal(V.chiffresExemple({ reactions: 1200, commentaires: 45 }, { moyenneReactions: 400, moyenneCommentaires: 15 }).replace(/[\u202f\u00a0]/g, ' '), '1 200 réactions · 45 commentaires · × 3 la moyenne');
    assert.equal(V.chiffresExemple({ reactions: 1, commentaires: 0 }, {}), '1 réaction · 0 commentaire');
  });
  test('V3c étiquette de lot : jour de Paris + voie', () => {
    assert.equal(V.etiquetteLot('collage', new Date('2026-11-13T10:00:00Z')), '2026-11-13-collage');
  });
});

describe('V4 écran : contrôles statiques', () => {
  const fichiers = ['inspirations-ecran.js', 'pistes-ecran.js'].map((f) => [f, lire(`js/modules/reseauxsociaux/${f}`)]);
  const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  test('V4 jamais de HTML construit à la main : ni innerHTML, ni insertAdjacentHTML, ni écriture directe d’une chaîne dans le DOM', () => {
    for (const [f, t] of fichiers) assert.doesNotMatch(sansCommentaires(t), /innerHTML|outerHTML|insertAdjacentHTML|document\.write/, f);
  });
  test('V4b toute icône utilisée existe dans ICONES (icone() rend un svg vide sinon)', () => {
    const noms = new Set();
    for (const [, t] of fichiers) {
      for (const m of t.matchAll(/icone\(\s*'([a-z0-9-]+)'/g)) noms.add(m[1]);
      for (const m of t.matchAll(/icone\(\s*[^'\n]*\?\s*'([a-z0-9-]+)'\s*:\s*'([a-z0-9-]+)'/g)) { noms.add(m[1]); noms.add(m[2]); }
      for (const m of t.matchAll(/(?:ICONE_TYPE|MARQUES)\s*=\s*(?:Object\.freeze\()?\{([^}]*)\}/g)) for (const n of m[1].matchAll(/:\s*'([a-z0-9-]+)'/g)) noms.add(n[1]);
      for (const m of t.matchAll(/boutonIcone\('[a-z-]+',\s*'([a-z0-9-]+)'/g)) noms.add(m[1]);
      for (const m of t.matchAll(/bouton\('[a-z-]+',\s*'([a-z0-9-]+)'/g)) noms.add(m[1]);
      for (const m of t.matchAll(/\[\s*'(?:main|claude|source|plat)',\s*'[^']*',\s*'([a-z0-9-]+)'\s*\]/g)) noms.add(m[1]);
    }
    assert.ok(noms.size >= 12, `icônes trouvées : ${[...noms]}`);
    for (const n of noms) assert.ok(n in ICONES, `icône inconnue : ${n}`);
  });
  test('V4c aucun champ « extrait » rempli depuis une piste ou une source externe : l’écran des pistes ne le cite pas', () => {
    assert.doesNotMatch(sansCommentaires(lire('js/modules/reseauxsociaux/pistes-ecran.js')), /extrait/);
  });
  test('V4d les liens sont revalidés à l’affichage (https) avant d’être posés en href', () => {
    assert.match(lire('js/modules/reseauxsociaux/pistes-ecran.js'), /I\.normaliserUrlWeb\(piste\.url\)/);
    assert.match(lire('js/modules/reseauxsociaux/inspirations-ecran.js'), /N\.normaliserUrlSource\(source\.type, source\.url\)/);
    assert.match(lire('js/modules/reseauxsociaux/inspirations-ecran.js'), /N\.normaliserUrlLinkedin\(e\.url\)/);
  });
  test('V4e le prompt ne nomme personne en dur : le nom vient du compte connecté (donnees.js), « moi » à défaut', () => {
    const t = lire('js/modules/reseauxsociaux/pistes-ecran.js');
    assert.match(t, /auteur: D\.etat\.auteur/);
    assert.doesNotMatch(sansCommentaires(t), /Chevalier|Jérôme/);
    const p = P.construirePromptPistes({ source: source('s1'), auteur: '' });
    assert.match(p, /pour moi/);
    assert.match(P.construirePromptPistes({ source: source('s1'), auteur: 'Alice Exemple' }), /pour Alice Exemple à partir/);
    // Le compte connecté porte son nom dans `nom` (auth.js chez Jérôme, membres.js chez un client), pas `displayName` : sans cela le prompt dirait toujours « moi ».
    assert.match(lire('js/modules/reseauxsociaux/donnees.js'), /compte\?\.nom/);
    assert.match(lire('js/os/firebase-config.js'), /nom: "/);
    assert.match(lire('js/os/membres.js'), /nom: membre\.nom/);
  });
  test('V4f la carte « Inspirations » d’Aujourd’hui ne montre que les profils', () => {
    assert.match(lire('js/modules/reseauxsociaux/aujourdhui.js'), /N\.typeSource\(p\) === 'profil' && N\.normaliserUrlLinkedin\(p\.url\)/);
  });
});
