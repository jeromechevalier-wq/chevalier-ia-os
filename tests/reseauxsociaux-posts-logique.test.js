// Écran « Posts » du module Réseaux sociaux (nuit du 11/11/2026) : règles pures et tests de texte, sans navigateur ni émulateur.
// Un test par critère du cahier ; le nom commence par son numéro (E1 à E10). Données fictives uniquement (Alice Exemple, exemple.test).
// Les parcours à l'écran (clic sur une carte, écriture, journal) sont dans tests/e2e/reseauxsociaux-posts.spec.js.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import * as R from '../js/modules/reseauxsociaux/logique.js';
import * as P from '../js/modules/reseauxsociaux/posts-logique.js';
import * as L from '../js/modules/crm/logique.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const sansCommentaires = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');

/** Un post tel que la fonction Buffer le rend (forme du contrat 2.2). */
const post = (id, statut = 'publie', extra = {}) => ({
  id, statut, statutBuffer: statut, texte: `Texte du post ${id}`, prevuLe: null, publieLe: null, lien: null, video: false, image: false, stats: null, statsLuesLe: null, ...extra,
});
const stats = (impressions, portee, reactions, commentaires, tauxEngagement) => ({ impressions, portee, reactions, commentaires, tauxEngagement });
const classement = (id, pilier = null, format = null, services = []) => ({ id, pilier, format, services });
const ids = (liste) => liste.map((p) => p.id);

describe('E1 colonnes du Kanban', () => {
  test('E1 trois colonnes : un brouillon, un programmé, un publié (chacun dans la sienne) ; un autre statut est compté à part', () => {
    const tous = P.fusionnerPosts([post('b1', 'brouillon'), post('p1', 'programme', { prevuLe: '2026-11-17T05:08:00Z' }), post('u1', 'publie', { publieLe: '2026-11-03T05:08:00Z' }), post('x1', 'autre')], []);
    const c = P.colonnesPosts(tous);
    assert.deepEqual([ids(c.brouillons), ids(c.programmes), ids(c.publies), c.autres], [['b1'], ['p1'], ['u1'], 1]);
  });

  test('E1 programmés du plus proche au plus lointain, publiés du plus récent au plus ancien ; le sens inversé retourne les trois colonnes ; sans date : à la fin', () => {
    const tous = P.fusionnerPosts([
      post('p2', 'programme', { prevuLe: '2026-11-24T05:08:00Z' }), post('p1', 'programme', { prevuLe: '2026-11-17T05:08:00Z' }),
      post('u1', 'publie', { publieLe: '2026-10-27T05:08:00Z' }), post('u2', 'publie', { publieLe: '2026-11-03T05:08:00Z' }), post('u0', 'publie'),
      post('b1', 'brouillon'), post('b2', 'brouillon', { prevuLe: '2026-12-01T05:08:00Z' }),
    ], []);
    const naturel = P.colonnesPosts(tous, 'desc');
    assert.deepEqual([ids(naturel.programmes), ids(naturel.publies), ids(naturel.brouillons)], [['p1', 'p2'], ['u2', 'u1', 'u0'], ['b2', 'b1']]);
    const inverse = P.colonnesPosts(tous, 'asc');
    assert.deepEqual([ids(inverse.programmes), ids(inverse.publies), ids(inverse.brouillons)], [['p2', 'p1'], ['u1', 'u2', 'u0'], ['b2', 'b1']]);
  });

  test('E1 fusion : un post sans document est « pas encore classé » ; un classement inconnu est rangé ; les posts sans identifiant sont ignorés', () => {
    const tous = P.fusionnerPosts([post('a'), post('b'), { statut: 'publie' }, null], [classement('a', 'pme', 'video', ['finance']), { id: 'b', pilier: 'inconnu', format: 'zzz', services: ['rien'] }]);
    assert.deepEqual(ids(tous), ['a', 'b']);
    assert.deepEqual([tous[0].classe, tous[0].classement], [true, { pilier: 'pme', format: 'video', services: ['finance'] }]);
    assert.deepEqual([tous[1].classe, tous[1].classement], [true, { pilier: null, format: null, services: [] }]);
    assert.equal(P.fusionnerPosts([post('c')], []).at(0).classe, false);
  });
});

describe('E2 cartes', () => {
  test('E2 les cartes ne sont pas déplaçables : ni draggable, ni dépôt, ni glisser dans le code de l’écran', () => {
    const src = sansCommentaires(lire('js/modules/reseauxsociaux/posts-ecran.js'));
    assert.doesNotMatch(src, /draggable|ondrag|ondrop|dataTransfer/);
    assert.match(src, /carte-affaire carte-post/);
  });

  test('E2 le chiffre d’un publié : « 1 240 impressions · 31 réactions » ; sans chiffres : « Pas encore de chiffres »', () => {
    assert.match(P.libelleChiffres(stats(1240, 900, 31, 4, 2.9)), /^1\s240 impressions · 31 réactions$/);
    assert.equal(P.libelleChiffres(null), 'Pas encore de chiffres');
    assert.equal(P.libelleChiffres(stats(null, null, null, null, null)), '— impressions · — réactions'); // une valeur absente n'est jamais un zéro inventé
  });

  test('E2 date de la carte : « Mardi 17 nov. 6h08 » (heure de Paris, été comme hiver), « Publié le 3 novembre 2026 », « Sans date prévue »', () => {
    assert.equal(P.libelleDatePrevue('2026-11-17T05:08:00Z'), 'Mardi 17 nov. 6h08'); // hiver
    assert.equal(P.libelleDatePrevue('2026-10-22T04:08:00Z'), 'Jeudi 22 oct. 6h08'); // été
    assert.equal(P.libelleDateCarte(post('a', 'programme', { prevuLe: '2026-11-17T05:08:00Z' })), 'Mardi 17 nov. 6h08');
    assert.equal(P.libelleDateCarte(post('a', 'publie', { publieLe: '2026-11-03T05:08:00Z' })), 'Publié le 3 novembre 2026');
    assert.equal(P.libelleDateCarte(post('a', 'brouillon')), 'Sans date prévue');
  });

  test('E2 début du texte : première ligne non vide, 80 caractères, « … » si coupé', () => {
    assert.equal(P.debutPost('\n\n  Première ligne  \nDeuxième ligne'), 'Première ligne');
    const long = 'a'.repeat(120);
    assert.equal(P.debutPost(long, 80).length, 80);
    assert.ok(P.debutPost(long, 80).endsWith('…'));
    assert.equal(P.debutPost(''), '');
  });
});

describe('E3 E4 classement d’un post (plan d’écriture)', () => {
  test('E3 le classement écrit pilier, format, services et horodate ; jamais le texte, la date, le statut ni un chiffre de Buffer', () => {
    const plan = R.planClasserPost(null, { pilier: 'pme', format: 'video', services: ['production'], texte: 'copie interdite', statut: 'publie', stats: { impressions: 1 } }, { id: 'post-fictif-1' });
    assert.equal(plan.ecritures.length, 1);
    const e = plan.ecritures[0];
    assert.deepEqual([e.type, e.collection, e.id], ['creer', 'reseauxsociaux_posts', 'post-fictif-1']);
    assert.deepEqual(e.donnees, { pilier: 'pme', format: 'video', services: ['production'] });
    assert.deepEqual(e.horodater, ['creeLe', 'modifieLe']);
  });

  test('E4 reclasser le même post écrit une modification (pas de création) qui garde la date de création', () => {
    const plan = R.planClasserPost({ id: 'post-fictif-1', pilier: 'pme', format: 'video', services: [] }, { pilier: 'claude', format: 'texte', services: [] }, { id: 'post-fictif-1' });
    const e = plan.ecritures[0];
    assert.deepEqual([e.type, e.collection, e.id], ['modifier', 'reseauxsociaux_posts', 'post-fictif-1']);
    assert.deepEqual(e.patch, { pilier: 'claude', format: 'texte', services: [] });
    assert.deepEqual(e.horodater, ['modifieLe']);
  });

  test('E3 « Enregistrer » reste grisé tant que rien n’a changé (classementModifie)', () => {
    const base = { pilier: 'pme', format: 'video', services: ['finance', 'production'] };
    assert.equal(P.classementModifie(base, { ...base }), false);
    assert.equal(P.classementModifie(base, { ...base, services: ['production', 'finance'] }), false); // l'ordre des cases ne compte pas
    assert.equal(P.classementModifie(base, { ...base, pilier: 'claude' }), true);
    assert.equal(P.classementModifie(base, { ...base, services: ['finance'] }), true);
    assert.equal(P.classementModifie(null, { pilier: null, format: null, services: [] }), false);
    assert.equal(P.classementModifie(null, { pilier: 'pme', format: null, services: [] }), true);
  });

  test('E4 l’écriture relit le document avant d’écrire (création ou modification), par le journal, jamais par setDoc', () => {
    const src = sansCommentaires(lire('js/modules/reseauxsociaux/posts-actions.js'));
    assert.match(src, /getDoc\(/);
    assert.match(src, /executer\(plan\.ecritures\)/);
    assert.doesNotMatch(src, /setDoc|addDoc|updateDoc|writeBatch/);
  });
});

describe('E5 tableau des statistiques', () => {
  const jeu = [
    post('u1', 'publie', { publieLe: '2026-11-03T05:08:00Z', stats: stats(1240, 900, 31, 4, 2.9) }),
    post('u2', 'publie', { publieLe: '2026-10-27T05:08:00Z', stats: stats(10, 9, 1, 0, 1) }),
    post('u3', 'publie', { publieLe: '2026-10-20T04:08:00Z', stats: stats(500, null, 20, null, null) }), // valeurs absentes
    post('u4', 'publie', { publieLe: '2026-10-13T04:08:00Z' }), // aucune métrique
    post('p1', 'programme', { prevuLe: '2026-11-17T05:08:00Z' }), // jamais dans le tableau
  ];

  test('E5 une ligne par post publié, du plus récent au plus ancien ; les valeurs absentes restent null (jamais 0)', () => {
    const { lignes } = P.statistiques(P.fusionnerPosts(jeu, [classement('u1', 'pme', 'video')]));
    assert.deepEqual(ids(lignes), ['u1', 'u2', 'u3', 'u4']);
    assert.deepEqual([lignes[2].portee, lignes[2].commentaires, lignes[2].tauxEngagement, lignes[3].impressions], [null, null, null, null]);
    assert.deepEqual([lignes[0].pilier, lignes[0].format, lignes[1].pilier], ['pme', 'video', null]);
  });

  test('E5 moyenne exacte : chaque colonne ne compte que les posts qui ont la valeur ; null si personne ne l’a', () => {
    const { moyenne } = P.statistiques(P.fusionnerPosts(jeu, []));
    assert.equal(moyenne.impressions, (1240 + 10 + 500) / 3);
    assert.equal(moyenne.portee, (900 + 9) / 2);
    assert.equal(moyenne.reactions, (31 + 1 + 20) / 3);
    assert.equal(moyenne.commentaires, (4 + 0) / 2);
    assert.equal(moyenne.tauxEngagement, (2.9 + 1) / 2);
    assert.deepEqual(P.statistiques(P.fusionnerPosts([post('u9')], [])).moyenne, { impressions: null, portee: null, reactions: null, commentaires: null, tauxEngagement: null });
  });

  test('E5 colonnes triables : chiffres croissants ou décroissants, les valeurs absentes toujours à la fin', () => {
    const { lignes } = P.statistiques(P.fusionnerPosts(jeu, []));
    assert.deepEqual(ids(P.trierStatistiques(lignes, 'impressions', 'desc')), ['u1', 'u3', 'u2', 'u4']);
    assert.deepEqual(ids(P.trierStatistiques(lignes, 'impressions', 'asc')), ['u2', 'u3', 'u1', 'u4']);
    assert.deepEqual(ids(P.trierStatistiques(lignes, 'portee', 'asc')), ['u2', 'u1', 'u3', 'u4']);
    assert.deepEqual(ids(P.trierStatistiques(lignes, 'date', 'asc')), ['u4', 'u3', 'u2', 'u1']);
    assert.deepEqual(ids(P.trierStatistiques(lignes, 'date', 'desc')), ['u1', 'u2', 'u3', 'u4']);
  });

  test('E5 tri par texte, pilier et format (valeurs absentes à la fin)', () => {
    const { lignes } = P.statistiques(P.fusionnerPosts(
      [post('a', 'publie', { publieLe: '2026-11-03T05:08:00Z', texte: 'Banane' }), post('b', 'publie', { publieLe: '2026-11-02T05:08:00Z', texte: 'Abricot' }), post('c', 'publie', { publieLe: '2026-11-01T05:08:00Z', texte: 'Cerise' })],
      [classement('a', 'offre', 'texte'), classement('b', 'pme', 'video')]));
    assert.deepEqual(ids(P.trierStatistiques(lignes, 'texte', 'asc')), ['b', 'a', 'c']);
    assert.deepEqual(ids(P.trierStatistiques(lignes, 'pilier', 'asc')), ['b', 'a', 'c']); // Cas concrets avant Offre ; c sans pilier à la fin
    assert.deepEqual(ids(P.trierStatistiques(lignes, 'format', 'desc')), ['b', 'a', 'c']); // sens inversé : c reste à la fin
  });

  test('E5 formats : nombres à la française, « — » quand la valeur manque, taux avec une décimale', () => {
    assert.match(R.formaterNombre(1240), /^1\s240$/);
    assert.equal(R.formaterNombre(null), '—');
    assert.equal(P.formaterTaux(null), '—');
    assert.match(P.formaterTaux(2.9), /^2,9\s%$/);
    assert.match(P.formaterMoyenne(1750 / 3), /^583$/);
    assert.equal(P.formaterMoyenne(null), '—');
  });
});

describe('E6 équilibre des piliers', () => {
  // 10 posts publiés ou programmés : 9 classés (pme 3, claude 2, actu_ia 2, proximite 1, offre 1), 1 sans pilier ; 4 vidéos ; plus un brouillon (hors compte).
  const piliers = ['pme', 'pme', 'pme', 'claude', 'claude', 'actu_ia', 'actu_ia', 'proximite', 'offre', null];
  const brut = piliers.map((p, i) => post(`e${i}`, i % 2 ? 'programme' : 'publie', { prevuLe: i % 2 ? '2026-11-17T05:08:00Z' : null, publieLe: i % 2 ? null : '2026-11-03T05:08:00Z', video: i < 2 }));
  brut.push(post('brouillon-1', 'brouillon'));
  const classements = piliers.map((p, i) => (p ? classement(`e${i}`, p, i === 2 || i === 3 ? 'video' : 'texte') : null)).filter(Boolean);
  const eq = P.equilibre(P.fusionnerPosts(brut, classements));

  test('E6 parts exactes à l’unité près sur les posts classés, cibles de la ligne éditoriale, posts sans pilier à part', () => {
    assert.deepEqual([eq.total, eq.classes, eq.sansPilier], [10, 9, 1]);
    assert.deepEqual(eq.piliers.map((p) => [p.id, p.nombre, p.part, p.cible]), [['pme', 3, 33, 30], ['claude', 2, 22, 25], ['actu_ia', 2, 22, 15], ['proximite', 1, 11, 20], ['offre', 1, 11, 10]]);
  });

  test('E6 part de vidéos face à 50 % : fichier vidéo de Buffer ou classé « Vidéo 9:16 » / « Animation 16:9 », sur tous les posts publiés et programmés', () => {
    assert.deepEqual(eq.video, { nombre: 4, total: 10, part: 40, cible: 50 });
    assert.equal(P.estVideo({ video: false, classement: { format: 'animation' } }), true);
    assert.equal(P.estVideo({ video: false, classement: { format: 'image' } }), false);
    assert.equal(P.estVideo({ video: true, classement: { format: null } }), true);
  });

  test('E6 aucun post : parts à zéro, aucune division par zéro', () => {
    const vide = P.equilibre([]);
    assert.deepEqual([vide.total, vide.classes, vide.sansPilier, vide.video.part], [0, 0, 0, 0]);
    assert.ok(vide.piliers.every((p) => p.part === 0));
  });
});

describe('E7 contrôle éditorial', () => {
  const NOW_ETE = new Date('2026-10-22T03:00:00Z'); // jeudi 22/10/2026, 5 h à Paris (heure d'été, avant le changement du 25/10)
  const NOW_HIVER = new Date('2026-11-03T04:00:00Z'); // mardi 03/11/2026, 5 h à Paris (heure d'hiver)
  const codes = (points, code) => points.filter((p) => p.code === code);

  test('E7 (a) heure d’été : le créneau du jeudi 22 octobre à 6 h 08 attend un post, et celui d’un post programmé à 6 h 08 de Paris est pris', () => {
    const sans = P.controlesEditoriaux([], [], NOW_ETE);
    assert.equal(codes(sans, 'a')[0].texte, 'Le créneau du jeudi 22 octobre à 6 h 08 attend un post.');
    const avec = P.controlesEditoriaux([post('p1', 'programme', { prevuLe: '2026-10-22T04:08:00Z' })], [], NOW_ETE); // 04:08 UTC = 6 h 08 Paris (été)
    assert.ok(!codes(avec, 'a').some((p) => p.texte.includes('jeudi 22 octobre')));
    assert.equal(codes(avec, 'a')[0].texte, 'Le créneau du mardi 27 octobre à 6 h 08 attend un post.');
  });

  test('E7 (a) heure d’hiver : un post à 05:08 UTC prend le créneau du mardi 3 novembre ; à 03:50 UTC (4 h 50 à Paris, 78 minutes d’écart) il ne le prend pas', () => {
    assert.equal(codes(P.controlesEditoriaux([], [], NOW_HIVER), 'a')[0].texte, 'Le créneau du mardi 3 novembre à 6 h 08 attend un post.');
    const pris = P.controlesEditoriaux([post('p1', 'programme', { prevuLe: '2026-11-03T05:08:00Z' })], [], NOW_HIVER);
    assert.equal(codes(pris, 'a')[0].texte, 'Le créneau du jeudi 5 novembre à 6 h 08 attend un post.');
    const decale = P.controlesEditoriaux([post('p1', 'programme', { prevuLe: '2026-11-03T03:50:00Z' })], [], NOW_HIVER);
    assert.equal(codes(decale, 'a')[0].texte, 'Le créneau du mardi 3 novembre à 6 h 08 attend un post.');
  });

  test('E7 (a) un post programmé à 7 h 30 (Paris) ne prend pas le créneau de 6 h 08', () => {
    const points = P.controlesEditoriaux([post('p1', 'programme', { prevuLe: '2026-11-03T06:30:00Z' })], [], NOW_HIVER);
    assert.equal(codes(points, 'a')[0].texte, 'Le créneau du mardi 3 novembre à 6 h 08 attend un post.');
  });

  test('E7 (b) un texte programmé ou en brouillon au-dessus de 3 000 caractères : « Ce texte dépasse la limite de LinkedIn de N caractères » ; un publié n’est pas contrôlé', () => {
    const points = P.controlesEditoriaux([
      post('p1', 'programme', { prevuLe: '2026-11-03T05:08:00Z', texte: 'x'.repeat(3050) }),
      post('b1', 'brouillon', { texte: `${'y'.repeat(3000)}z` }),
      post('b2', 'brouillon', { texte: 'z'.repeat(3000) }), // pile à la limite : accepté
      post('u1', 'publie', { publieLe: '2026-10-27T05:08:00Z', texte: 'w'.repeat(4000) }),
    ], [], NOW_HIVER);
    const b = codes(points, 'b');
    assert.equal(b.length, 2);
    assert.match(b[0].texte, /^Ce texte dépasse la limite de LinkedIn de 50 caractères : « x+… »$/);
    assert.match(b[1].texte, /^Ce texte dépasse la limite de LinkedIn de 1 caractère : « y+… »$/);
    assert.deepEqual(b.map((p) => p.postId), ['p1', 'b1']);
  });

  test('E7 (b) un emoji compte pour un caractère, comme chez LinkedIn', () => {
    const texte = '😀'.repeat(3000);
    assert.equal(P.longueurTexte(texte), 3000);
    assert.equal(codes(P.controlesEditoriaux([post('b1', 'brouillon', { texte })], [], NOW_HIVER), 'b').length, 0);
  });

  test('E7 (c) un post programmé sans pilier ou sans format est signalé, avec ce qui manque ; un post classé en entier ne l’est pas', () => {
    const points = P.controlesEditoriaux([
      post('p1', 'programme', { prevuLe: '2026-11-03T05:08:00Z', texte: 'Sans rien' }),
      post('p2', 'programme', { prevuLe: '2026-11-05T05:08:00Z', texte: 'Sans format' }),
      post('p3', 'programme', { prevuLe: '2026-11-10T05:08:00Z', texte: 'Sans pilier' }),
      post('p4', 'programme', { prevuLe: '2026-11-12T05:08:00Z', texte: 'Complet' }),
      post('b1', 'brouillon', { texte: 'Brouillon libre' }), // un brouillon n'est pas contrôlé
    ], [classement('p2', 'pme'), classement('p3', null, 'texte'), classement('p4', 'claude', 'video')], NOW_HIVER);
    assert.deepEqual(codes(points, 'c').map((p) => p.texte), [
      'Le post programmé « Sans rien » n’a pas encore de pilier ni de format.',
      'Le post programmé « Sans format » n’a pas encore de format.',
      'Le post programmé « Sans pilier » n’a pas encore de pilier.',
    ]);
  });

  test('E7 (d) part de vidéos des 8 derniers posts publiés et programmés sous 50 % ; à 50 % ou plus, rien', () => {
    const huit = (nbVideos) => Array.from({ length: 10 }, (_, i) => post(`u${i}`, 'publie', { publieLe: `2026-10-${String(10 + i).padStart(2, '0')}T05:08:00Z`, video: i >= 10 - nbVideos })); // les plus récents d'abord
    const sous = codes(P.controlesEditoriaux(huit(3), [], NOW_HIVER), 'd');
    assert.deepEqual(sous.map((p) => p.texte), ['La part de vidéos est de 38 % sur les 8 derniers posts (objectif 50 %).']);
    assert.equal(codes(P.controlesEditoriaux(huit(4), [], NOW_HIVER), 'd').length, 0); // 4 sur 8 = 50 %
    assert.equal(codes(P.controlesEditoriaux(huit(8), [], NOW_HIVER), 'd').length, 0);
    assert.equal(codes(P.controlesEditoriaux([], [], NOW_HIVER), 'd').length, 0); // aucun post : rien à juger
  });

  test('E7 (d) seuls les 8 derniers comptent : les anciens posts (sans vidéo) ne tirent pas la part vers le bas', () => {
    const recents = Array.from({ length: 8 }, (_, i) => post(`r${i}`, 'publie', { publieLe: `2026-11-0${i + 1}T05:08:00Z`, video: true }));
    const anciens = Array.from({ length: 5 }, (_, i) => post(`a${i}`, 'publie', { publieLe: `2026-09-0${i + 1}T05:08:00Z` }));
    assert.equal(codes(P.controlesEditoriaux([...recents, ...anciens], [], NOW_HIVER), 'd').length, 0);
  });

  test('E7 (e) un pilier à plus de 15 points de sa cible est signalé (à partir de 5 posts classés) ; l’écart exact de 15 points ne l’est pas', () => {
    const six = Array.from({ length: 6 }, (_, i) => post(`u${i}`, 'publie', { publieLe: `2026-11-0${i + 1}T05:08:00Z`, video: true }));
    const points = codes(P.controlesEditoriaux(six, six.map((p) => classement(p.id, 'pme', 'video')), NOW_HIVER), 'e').map((p) => p.texte);
    assert.ok(points.includes('Le pilier « Cas concrets » pèse 100 % des posts classés (cible 30 %).'));
    assert.ok(points.some((t) => t.startsWith('Le pilier « Claude au quotidien » pèse 0 %')));
    assert.ok(!points.some((t) => t.includes('Actu IA')), 'Actu IA : 0 % face à 15 % = exactement 15 points, pas plus');
    // Sous 5 posts classés : le contrôle se tait.
    const quatre = six.slice(0, 4);
    assert.equal(codes(P.controlesEditoriaux(quatre, quatre.map((p) => classement(p.id, 'pme', 'video')), NOW_HIVER), 'e').length, 0);
  });

  test('E7 aucun contrôle en échec : liste vide (l’écran dit « Tout est en ordre. »)', () => {
    // Un post programmé, classé et en vidéo sur chaque créneau des 14 prochains jours ; texte court.
    const creneaux = R.creneauxAVenir(NOW_HIVER, [], 14);
    const posts = creneaux.map((c, i) => post(`p${i}`, 'programme', { prevuLe: L.dateHeureParisVersDate(`${c.date}T${c.heure}`).toISOString(), video: true }));
    assert.ok(posts.length >= 4);
    assert.deepEqual(P.controlesEditoriaux(posts, posts.map((p) => classement(p.id, 'pme', 'video')), NOW_HIVER), []);
  });
});

describe('E8 filtres et recherche', () => {
  const tous = P.fusionnerPosts([
    post('a', 'publie', { texte: 'Un devis fait en dix minutes' }), post('b', 'publie', { texte: 'Évènement à Manosque' }), post('c', 'programme', { texte: 'Claude au quotidien' }), post('d', 'brouillon', { texte: 'Autre sujet' }),
  ], [classement('a', 'pme', 'video', ['commercial']), classement('b', 'proximite', 'image', []), classement('c', 'claude', 'texte', ['direction', 'finance'])]);

  test('E8 « Non classés seulement » montre les posts sans document de classement', () => {
    assert.deepEqual(ids(P.filtrerPosts(tous, { nonClasses: true })), ['d']);
    assert.deepEqual(ids(P.filtrerPosts(tous, { nonClasses: false })), ['a', 'b', 'c', 'd']);
  });

  test('E8 la recherche porte sur le texte, sans tenir compte des accents ni des majuscules', () => {
    assert.deepEqual(ids(P.filtrerPosts(tous, { recherche: 'EVENEMENT' })), ['b']);
    assert.deepEqual(ids(P.filtrerPosts(tous, { recherche: 'devis' })), ['a']);
    assert.deepEqual(ids(P.filtrerPosts(tous, { recherche: 'introuvable' })), []);
  });

  test('E8 pilier, format et service : « ou » dans un groupe, « et » entre groupes ; rien de coché = tout', () => {
    assert.deepEqual(ids(P.filtrerPosts(tous, { piliers: ['pme', 'claude'] })), ['a', 'c']);
    assert.deepEqual(ids(P.filtrerPosts(tous, { piliers: ['pme', 'claude'], formats: ['texte'] })), ['c']);
    assert.deepEqual(ids(P.filtrerPosts(tous, { services: ['finance', 'commercial'] })), ['a', 'c']);
    assert.deepEqual(ids(P.filtrerPosts(tous, { formats: ['image'], services: ['finance'] })), []);
    assert.deepEqual(ids(P.filtrerPosts(tous, {})), ['a', 'b', 'c', 'd']);
  });

  test('E8 le nombre de filtres (pastille du bouton) ne compte pas la recherche', () => {
    assert.equal(P.nombreFiltres({ recherche: 'abc', piliers: ['pme'], formats: ['video', 'image'], services: [], nonClasses: true }), 4);
    assert.equal(P.nombreFiltres({ recherche: 'abc' }), 0);
  });
});

describe('E9 E10 écran : texte de Buffer, messages, interface', () => {
  const src = lire('js/modules/reseauxsociaux/posts-ecran.js');
  const code = sansCommentaires(src);

  test('E9 le texte de Buffer est toujours posé comme texte : jamais d’innerHTML, de insertAdjacentHTML ni de document.write', () => {
    for (const f of ['posts-ecran.js', 'posts-logique.js', 'posts-actions.js']) assert.doesNotMatch(sansCommentaires(lire(`js/modules/reseauxsociaux/${f}`)), /innerHTML|outerHTML|insertAdjacentHTML|document\.write/, f);
  });

  test('E9 l’erreur de Buffer (dont « Buffer n’est pas branché sur cet espace. » chez un client) s’affiche avec « Réessayer » ; le cas vide a sa phrase', () => {
    assert.match(code, /Réessayer/);
    assert.match(code, /chargerBuffer\(\{ force: true \}\)/);
    assert.match(code, /Aucun post pour le moment\. Écris-en un dans Buffer, il apparaîtra ici\./);
    assert.match(code, /Tout est en ordre\./);
    assert.equal(R.MESSAGE_BUFFER_ABSENT, 'Buffer n’est pas branché sur cet espace.');
  });

  test('E9 le fichier n’ajoute ni orderBy, ni limit, ni where, ni appel de fonction : tri et filtres se font dans le navigateur (règle D4)', () => {
    for (const f of ['posts-ecran.js', 'posts-logique.js', 'posts-actions.js']) {
      const s = sansCommentaires(lire(`js/modules/reseauxsociaux/${f}`));
      assert.doesNotMatch(s, /orderBy|limit\(|where\(|httpsCallable|firebase-functions/, f);
    }
  });

  test('E10 la barre est celle des écrans de liste : recherche avec loupe, bouton Filtres, vues Kanban | Statistiques, un seul bouton jaune « + Post » qui ouvre Buffer', () => {
    assert.match(code, /barreListe\(/);
    assert.match(code, /basculeVues\(/);
    assert.match(code, /\['kanban', 'Kanban', 'square-kanban'\], \['stats', 'Statistiques', 'chart-column'\]/);
    assert.doesNotMatch(code, /type:\s*['"]search['"]|class:\s*[`'"]bascule-vue/);
    assert.match(code, /lienBuffer\(\{ libelle: '\+ Post' \}\)/);
    assert.match(code, /h\('button', \{ type: 'button', class: 'bouton bouton-secondaire', dataset: \{ action: 'actualiser-buffer' \}/);
  });

  test('E10 trois colonnes seulement (quatre au plus) ; les cartes réutilisent les classes du CRM', () => {
    assert.equal((code.match(/colonne\('(brouillons|programmes|publies)'/g) || []).length, 3);
    assert.match(code, /carte-affaire carte-post/);
  });

  test('E10 aucun mot « CRM » ni texte propre à Jérôme dans ce que l’utilisateur voit', () => {
    const textes = [...code.matchAll(/'([^'\n]{3,})'/g)].map((m) => m[1]).filter((t) => /[ a-zéèà]/.test(t) && !/^[./#\w:-]+$/.test(t));
    for (const t of textes) assert.doesNotMatch(t, /\bCRM\b|Jérôme/, t);
    assert.doesNotMatch(sansCommentaires(lire('js/modules/reseauxsociaux/posts-logique.js')), /\bCRM\b|Jérôme/);
  });

  test('E10 le CSS : aucune taille ni poids de texte en dur (variables de tokens.css), pas de barre de défilement horizontale de page', () => {
    const css = sansCommentaires(lire('css/reseauxsociaux-posts.css'));
    assert.doesNotMatch(css, /font-size:\s*\d|font-weight:\s*\d|font-weight:\s*(bold|bolder)/);
    assert.match(css, /var\(--fs-|var\(--poids-/);
  });

  test('E10 la feuille de style de l’écran est ajoutée au premier affichage, sans toucher à index.html ni à index.js du module', () => {
    assert.match(code, /css\/reseauxsociaux-posts\.css/);
    assert.doesNotMatch(lire('index.html'), /reseauxsociaux-posts/);
  });
});
