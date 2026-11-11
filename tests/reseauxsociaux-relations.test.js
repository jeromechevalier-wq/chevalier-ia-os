// Module Réseaux sociaux, écran « Relations » (nuit du 11/11/2026) : règles pures et tests de source, sans navigateur ni émulateur.
// Un test par critère du cahier ; le nom commence par son numéro (F1 à F7). Données fictives uniquement (Alice Exemple, exemple.test).
// Le parcours à l'écran (colonnes, badge, filtres, bandeau des catégories) : tests/e2e/reseauxsociaux-relations.spec.js.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as RL from '../js/modules/reseauxsociaux/relations-logique.js';
import { CATEGORIES } from '../js/modules/reseauxsociaux/logique.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');

const MAINTENANT = new Date('2026-11-11T10:00:00Z'); // 11 novembre 2026, 11 h à Paris
const jour = (n) => new Date(MAINTENANT.getTime() - n * 86400000).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
const personne = (id, nom, extra = {}) => ({ id, nom, etiquettes: [], source: '', archive: false, organisationId: null, ...extra });
const echange = (id, personneId, nJours, extra = {}) => ({ id, personneId, type: 'linkedin', fait: true, date: jour(nJours), sens: 'envoye', voix: 1, ...extra });
const colonneDe = (relations, id) => relations.find((r) => r.personne.id === id)?.etape;
const badgeDe = (relations, id) => relations.find((r) => r.personne.id === id)?.badge;

describe('F1 F2 colonnes et badges', () => {
  const personnes = [
    personne('p1', 'Alice Exemple'), personne('p2', 'Bastien Exemple'), personne('p3', 'Chloé Exemple'),
    personne('p4', 'David Exemple'), personne('p5', 'Emma Exemple'), personne('p6', 'Farid Exemple', { etiquettes: ['partenaire'] }),
  ];
  const activites = [
    echange('a1', 'p1', 3), { id: 'r1', personneId: 'p1', type: 'rendez_vous', fait: false, date: jour(-2) }, // un rendez-vous à venir
    echange('a2', 'p2', 3, { fait: false }), // un échange pas fait ne compte pas
    echange('a3', 'p3', 4, { voix: 2, sens: 'envoye' }), // les deux ont écrit
    echange('a4', 'p4', 2, { sens: 'recu' }), // un message reçu sans réponse
    echange('a5', 'p5', 3), // un seul message envoyé, il y a 3 jours
  ];
  const relations = RL.construireRelations(personnes, activites, MAINTENANT);

  test('F1 chaque personne est dans la bonne colonne ; une personne sans activité reste à écrire ; le compte d’une colonne vaut son nombre de cartes', () => {
    assert.equal(relations.length, 6);
    assert.deepEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].map((id) => colonneDe(relations, id)), ['rendez_vous', 'a_ecrire', 'en_echange', 'a_ecrire', 'en_attente', 'a_ecrire']);
    const groupes = RL.grouperParColonne(relations);
    assert.deepEqual(Object.keys(groupes), ['a_ecrire', 'en_attente', 'en_echange', 'rendez_vous']);
    assert.deepEqual(Object.values(groupes).map((l) => l.length), [3, 1, 1, 1]);
    assert.equal(Object.values(groupes).reduce((n, l) => n + l.length, 0), relations.length);
    assert.equal(RL.texteCompteRelations(1), '1 relation');
    assert.equal(RL.texteCompteRelations(3), '3 relations');
    assert.equal(RL.texteCompteRelations(0), 'Aucune relation');
  });

  test('F1 il y a quatre colonnes au plus (règle d’interface)', () => {
    assert.ok(RL.COLONNES_RELATIONS.length <= 4);
    assert.deepEqual(RL.COLONNES_RELATIONS.map((c) => c.libelle), ['À écrire', 'En attente', 'En échange', 'Rendez-vous']);
  });

  test('F2 « À relancer » à 9 jours (un seul message envoyé), absent à 6 jours, absent avec deux messages envoyés ; « À répondre » pour un message reçu', () => {
    const a = (acts) => RL.construireRelations([personne('x', 'Xavier Exemple')], acts, MAINTENANT)[0];
    const neuf = a([echange('b1', 'x', 9)]);
    assert.deepEqual([neuf.etape, neuf.badge, neuf.jours], ['en_attente', 'relancer', 9]);
    assert.equal(a([echange('b1', 'x', 6)]).badge, null);
    assert.equal(a([echange('b1', 'x', 7)]).badge, 'relancer'); // la limite : 7 jours pleins
    assert.equal(a([echange('b1', 'x', 15), echange('b2', 'x', 9)]).badge, null); // deux messages envoyés : on laisse respirer
    assert.equal(badgeDe(relations, 'p4'), 'repondre');
    assert.equal(badgeDe(relations, 'p5'), null);
  });

  test('F2 « Hors cible » n’a jamais de relance mais garde « À répondre »', () => {
    const horsCible = personne('h', 'Hélène Exemple', { etiquettes: ['hors_cible'] });
    assert.equal(RL.construireRelations([horsCible], [echange('c1', 'h', 20)], MAINTENANT)[0].badge, null);
    assert.equal(RL.construireRelations([horsCible], [echange('c1', 'h', 20, { sens: 'recu' })], MAINTENANT)[0].badge, 'repondre');
  });

  test('F2 le calcul suit le jour de l’échange (date), jamais l’instant d’import (dateFait)', () => {
    const importe = echange('d1', 'x', 12, { dateFait: MAINTENANT }); // importé aujourd'hui, échange d'il y a 12 jours
    const r = RL.construireRelations([personne('x', 'Xavier Exemple')], [importe], MAINTENANT)[0];
    assert.equal(r.badge, 'relancer');
    assert.equal(r.jours, 12);
    assert.equal(r.dernier, jour(12));
  });

  test('F2 les cartes à badge viennent en premier (« À répondre » puis « À relancer »), puis les plus anciennes', () => {
    const liste = RL.construireRelations([personne('a', 'Zoé Exemple'), personne('b', 'Yann Exemple'), personne('c', 'Xénia Exemple')],
      [echange('e1', 'a', 10), echange('e2', 'b', 2, { sens: 'recu' }), echange('e3', 'c', 3)], MAINTENANT);
    assert.deepEqual(liste.map((r) => r.personne.id), ['b', 'a', 'c']);
  });
});

describe('F4 F6 sélection et filtres', () => {
  const personnes = [
    personne('p1', 'Alice Exemple', { organisationId: 'o1' }), personne('p2', 'Bastien Exemple', { etiquettes: ['cible'] }), personne('p3', 'Chloé Exemple', { source: 'LinkedIn' }),
    personne('p4', 'David Exemple', { etiquettes: ['partenaire'] }), personne('p5', 'Emma Exemple', { archive: true, etiquettes: ['cible'] }),
    personne('p6', 'Farid Exemple', { test: true, etiquettes: ['relais'] }), personne('p7', 'Gaëlle Exemple', { etiquettes: ['prospect_chaud'] }),
    personne('p8', 'Hugo Exemple'), personne('p9', 'Inès Exemple'),
  ];
  const activites = [
    echange('a1', 'p1', 9), // à relancer
    echange('a3', 'p3', 2, { sens: 'recu' }), // à répondre
    echange('a9', 'p9', 1), // personne sans catégorie ni source, mais avec un échange LinkedIn
    { id: 'r8', personneId: 'p8', type: 'rendez_vous', fait: false, date: jour(-1) }, // un rendez-vous seul ne fait pas entrer
  ];
  const toutes = RL.construireRelations(personnes, activites, MAINTENANT);
  const ids = (liste) => liste.map((r) => r.personne.id).sort();
  const orga = (p) => (p.organisationId === 'o1' ? 'Atelier Fictif' : '');

  test('F6 une personne archivée n’est pas affichée ; une personne de test n’est affichée que si le filtre le permet', () => {
    assert.ok(!ids(toutes).includes('p5'));
    assert.ok(ids(toutes).includes('p6')); // construite, mais écartée par le filtre « Tests » (défaut : sans les tests)
    assert.ok(!ids(RL.filtrerRelations(toutes, {}, orga)).includes('p6'));
    assert.deepEqual(ids(RL.filtrerRelations(toutes, { tests: 'seulement' }, orga)), ['p6']);
    assert.ok(ids(RL.filtrerRelations(toutes, { tests: 'inclure' }, orga)).includes('p6'));
  });

  test('F6 une personne avec l’étiquette Partenaire mais sans activité est dans « À écrire » ; une étiquette qui n’est pas une catégorie ne suffit pas', () => {
    assert.equal(colonneDe(toutes, 'p4'), 'a_ecrire');
    assert.ok(!ids(toutes).includes('p7')); // « Prospect chaud » n'est pas une catégorie de ce module
    assert.ok(!ids(toutes).includes('p8')); // un rendez-vous seul ne suffit pas
    assert.ok(ids(toutes).includes('p9')); // un échange LinkedIn suffit
    assert.ok(ids(toutes).includes('p3')); // la source LinkedIn suffit aussi
    assert.deepEqual(RL.categoriesDe(personnes[3]), ['partenaire']);
    assert.deepEqual(RL.categoriesDe(personnes[0]), []);
  });

  test('F4 « À relancer seulement » ne garde que les cartes à badge de relance ; « À répondre seulement » les autres ; les filtres et la recherche se combinent', () => {
    assert.deepEqual(ids(RL.filtrerRelations(toutes, { aRelancer: true }, orga)), ['p1']);
    assert.deepEqual(ids(RL.filtrerRelations(toutes, { aRepondre: true }, orga)), ['p3']);
    assert.deepEqual(ids(RL.filtrerRelations(toutes, { aRelancer: true, aRepondre: true }, orga)), ['p1', 'p3']);
    assert.deepEqual(ids(RL.filtrerRelations(toutes, { aRelancer: true, recherche: 'bastien' }, orga)), []); // combinés : rien ne correspond aux deux
    assert.deepEqual(ids(RL.filtrerRelations(toutes, { aRelancer: true, recherche: 'ALICE' }, orga)), ['p1']);
  });

  test('F4 la recherche porte sur le nom et sur l’organisation, sans tenir compte de la casse ni des accents', () => {
    assert.deepEqual(ids(RL.filtrerRelations(toutes, { recherche: 'atelier fictif' }, orga)), ['p1']);
    assert.deepEqual(ids(RL.filtrerRelations(toutes, { recherche: 'chloe' }, orga)), ['p3']);
  });

  test('F4 le filtre « Catégorie » garde les personnes qui portent l’une des catégories cochées ; « Sans catégorie » garde les autres', () => {
    assert.deepEqual(ids(RL.filtrerRelations(toutes, { categories: ['cible'] }, orga)), ['p2']);
    assert.deepEqual(ids(RL.filtrerRelations(toutes, { categories: ['cible', 'partenaire'] }, orga)), ['p2', 'p4']);
    assert.deepEqual(ids(RL.filtrerRelations(toutes, { categories: [RL.SANS_CATEGORIE] }, orga)), ['p1', 'p3', 'p9']);
  });

  test('F4 le nombre de filtres posés ignore la recherche ; des critères mal formés reprennent le défaut', () => {
    assert.equal(RL.nombreFiltres({ recherche: 'a' }), 0);
    assert.equal(RL.nombreFiltres({ categories: ['cible', 'relais'], aRelancer: true, tests: 'seulement' }), 4);
    assert.deepEqual(RL.criteresRelations({ categories: 'x', tests: 'n’importe quoi', aRelancer: 'oui' }), { recherche: '', categories: [], aRelancer: false, aRepondre: false, tests: 'exclure' });
  });
});

describe('F5 catégories à créer', () => {
  test('F5 les catégories manquantes se calculent par le nom (les étiquettes existantes ne comptent pas, la casse et les accents non plus)', () => {
    assert.deepEqual(RL.nomsCategoriesManquantes([]), CATEGORIES.map((c) => c.nom));
    assert.deepEqual(RL.nomsCategoriesManquantes([{ id: 'partenaire', nom: 'Partenaire' }, { id: 'x', nom: 'a classer' }]), ['Cible', 'Relais', 'Hors cible']);
    assert.deepEqual(RL.nomsCategoriesManquantes(CATEGORIES.map((c) => ({ id: c.id, nom: c.nom }))), []);
  });

  test('F5 l’écran n’écrit les étiquettes que par creerCategories (un seul appel, au clic, après confirmation), jamais par creerEtiquette du CRM', () => {
    const src = sansCommentaires(lire('js/modules/reseauxsociaux/relations-ecran.js'));
    assert.equal((src.match(/D\.creerCategories\(/g) || []).length, 1);
    assert.doesNotMatch(src, /creerEtiquette|majParametre|setDoc|executer\(/);
    assert.match(src, /confirmer\(/);
    assert.ok(src.indexOf('confirmer(') < src.indexOf('D.creerCategories('), 'la confirmation vient avant l’écriture');
    assert.match(src, /etiquettesDisponibles === false/); // paramètres illisibles ou document absent : aucun bouton
    assert.match(src, /etiquettesDisponibles === null/); // pas encore lus : rien
  });
});

describe('F3 F7 cartes et mise en page', () => {
  test('F3 les cartes ne sont pas déplaçables (ni draggable, ni dépôt) et le nom ouvre la fiche de la personne', () => {
    const src = sansCommentaires(lire('js/modules/reseauxsociaux/relations-ecran.js'));
    assert.doesNotMatch(src, /draggable|ondrag|ondrop|dataTransfer/);
    assert.match(src, /lien\(`crm\/personnes\/\$\{p\.id\}`\)/);
    assert.match(src, /estNoyau\(\)/); // sans Affaires la fiche n'est pas servie : le nom reste du texte
  });

  test('F7 le CSS de l’écran n’écrit aucune taille ni aucun poids de texte en dur (variables de tokens.css), et un seul fichier de style propre', () => {
    const css = sansCommentaires(lire('css/reseauxsociaux-relations.css'));
    assert.doesNotMatch(css, /font-size\s*:\s*[\d.]+(px|rem|em)/);
    assert.doesNotMatch(css, /font-weight\s*:\s*\d/);
    assert.doesNotMatch(css, /font\s*:\s*[^;]*\d+(px|rem)/);
  });

  test('F7 un seul bouton jaune (« + Relation »), la recherche et les vues viennent de la barre commune du CRM', () => {
    const src = sansCommentaires(lire('js/modules/reseauxsociaux/relations-ecran.js'));
    assert.equal((src.match(/bouton-principal/g) || []).length, 1);
    assert.match(src, /barreListe\(/);
    assert.match(src, /basculeVues\(/);
    assert.doesNotMatch(src, /type:\s*['"]search['"]/);
    assert.doesNotMatch(src, /class:\s*[`'"]bascule-vue/);
  });

  test('Les textes visibles ne contiennent ni « CRM » ni nom propre', () => {
    const src = lire('js/modules/reseauxsociaux/relations-ecran.js').split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
    const textes = [...src.matchAll(/'([^'\n]{6,})'/g)].map((m) => m[1]).filter((t) => /\s/.test(t) && /[A-Za-zÀ-ÿ]{3}/.test(t));
    for (const t of textes) assert.doesNotMatch(t, /\bCRM\b|Jérôme|Jerome/, t);
  });
});
