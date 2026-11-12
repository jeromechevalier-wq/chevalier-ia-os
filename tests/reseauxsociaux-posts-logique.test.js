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
    const tous = P.fusionnerPosts([post('a'), post('b'), { statut: 'publie' }, null], [classement('a', 'cas_concrets', 'video', ['finance']), { id: 'b', pilier: 'inconnu', format: 'zzz', services: ['rien'] }]);
    assert.deepEqual(ids(tous), ['a', 'b']);
    assert.deepEqual([tous[0].classe, tous[0].classement], [true, { pilier: 'cas_concrets', format: 'video', services: ['finance'] }]);
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
    const plan = R.planClasserPost(null, { pilier: 'cas_concrets', format: 'video', services: ['production'], texte: 'copie interdite', statut: 'publie', stats: { impressions: 1 } }, { id: 'post-fictif-1' });
    assert.equal(plan.ecritures.length, 1);
    const e = plan.ecritures[0];
    assert.deepEqual([e.type, e.collection, e.id], ['creer', 'reseauxsociaux_posts', 'post-fictif-1']);
    assert.deepEqual(e.donnees, { pilier: 'cas_concrets', format: 'video', services: ['production'] });
    assert.deepEqual(e.horodater, ['creeLe', 'modifieLe']);
  });

  test('E4 reclasser le même post écrit une modification (pas de création) qui garde la date de création', () => {
    const plan = R.planClasserPost({ id: 'post-fictif-1', pilier: 'cas_concrets', format: 'video', services: [] }, { pilier: 'pedagogie', format: 'texte', services: [] }, { id: 'post-fictif-1' });
    const e = plan.ecritures[0];
    assert.deepEqual([e.type, e.collection, e.id], ['modifier', 'reseauxsociaux_posts', 'post-fictif-1']);
    assert.deepEqual(e.patch, { pilier: 'pedagogie', format: 'texte', services: [] });
    assert.deepEqual(e.horodater, ['modifieLe']);
  });

  test('E3 « Enregistrer » reste grisé tant que rien n’a changé (classementModifie)', () => {
    const base = { pilier: 'cas_concrets', format: 'video', services: ['finance', 'production'] };
    assert.equal(P.classementModifie(base, { ...base }), false);
    assert.equal(P.classementModifie(base, { ...base, services: ['production', 'finance'] }), false); // l'ordre des cases ne compte pas
    assert.equal(P.classementModifie(base, { ...base, pilier: 'pedagogie' }), true);
    assert.equal(P.classementModifie(base, { ...base, services: ['finance'] }), true);
    assert.equal(P.classementModifie(null, { pilier: null, format: null, services: [] }), false);
    assert.equal(P.classementModifie(null, { pilier: 'cas_concrets', format: null, services: [] }), true);
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
    const { lignes } = P.statistiques(P.fusionnerPosts(jeu, [classement('u1', 'cas_concrets', 'video')]));
    assert.deepEqual(ids(lignes), ['u1', 'u2', 'u3', 'u4']);
    assert.deepEqual([lignes[2].portee, lignes[2].commentaires, lignes[2].tauxEngagement, lignes[3].impressions], [null, null, null, null]);
    assert.deepEqual([lignes[0].pilier, lignes[0].format, lignes[1].pilier], ['cas_concrets', 'video', null]);
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
      [classement('a', 'demarche_offre', 'texte'), classement('b', 'cas_concrets', 'video')]));
    assert.deepEqual(ids(P.trierStatistiques(lignes, 'texte', 'asc')), ['b', 'a', 'c']);
    assert.deepEqual(ids(P.trierStatistiques(lignes, 'pilier', 'asc')), ['b', 'a', 'c']); // Cas concrets avant Ma démarche et mon offre ; c sans pilier à la fin
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

describe('E6 matrice pilier × format', () => {
  // 10 posts publiés ou programmés + un brouillon (hors compte). Classés des deux côtés : 7 ; sans pilier : 2 ; sans format : 1 (dont 1 sans rien).
  const spec = [
    ['cas_concrets', 'video'], ['cas_concrets', 'video'], ['cas_concrets', 'texte'], ['pedagogie', 'carrousel'], ['pedagogie', 'animation'],
    ['actu_ia', 'texte'], ['demarche_offre', 'image'], [null, 'texte'], [null, null], ['pedagogie', null],
  ];
  const brut = spec.map((_, i) => post(`e${i}`, i % 2 ? 'programme' : 'publie', { prevuLe: i % 2 ? '2026-11-17T05:08:00Z' : null, publieLe: i % 2 ? null : '2026-11-03T05:08:00Z' }));
  brut.push(post('brouillon-1', 'brouillon'));
  const classements = spec.map(([pi, fo], i) => classement(`e${i}`, pi, fo));
  const m = P.matrice(P.fusionnerPosts(brut, classements));
  const ligne = (id) => m.lignes.find((l) => l.id === id);

  test('E6 une case = nombre de posts et part du total classé (arrondie à l’unité) ; colonnes dans l’ordre texte, image, carrousel, vidéo, animation', () => {
    assert.deepEqual(m.colonnes.map((c) => c.id), ['texte', 'image', 'carrousel', 'video', 'animation']);
    assert.deepEqual([m.total, m.classes], [10, 7]);
    assert.deepEqual(ligne('cas_concrets').cases.map((c) => [c.nombre, c.part]), [[1, 14], [0, 0], [0, 0], [2, 29], [0, 0]]);
    assert.deepEqual(ligne('pedagogie').cases.map((c) => c.nombre), [0, 0, 1, 0, 1]);
    assert.deepEqual(ligne('actu_ia').cases.map((c) => c.nombre), [1, 0, 0, 0, 0]);
    assert.deepEqual(ligne('demarche_offre').cases.map((c) => c.nombre), [0, 1, 0, 0, 0]);
  });

  test('E6 totaux : chaque ligne face à la cible de son pilier (25, 35, 15, 25), chaque colonne ; cible de 50 % de vidéos sur vidéo + animation', () => {
    assert.deepEqual(m.lignes.map((l) => [l.id, l.nombre, l.part, l.cible]), [['cas_concrets', 3, 43, 25], ['pedagogie', 2, 29, 35], ['actu_ia', 1, 14, 15], ['demarche_offre', 1, 14, 25]]);
    assert.deepEqual(m.colonnes.map((c) => [c.id, c.nombre]), [['texte', 2], ['image', 1], ['carrousel', 1], ['video', 2], ['animation', 1]]);
    assert.deepEqual(m.video, { formats: ['video', 'animation'], nombre: 3, part: 43, cible: 50 });
    assert.equal(m.lignes.reduce((t, l) => t + l.nombre, 0), m.classes);
  });

  test('E6 un post sans pilier ou sans format est compté à part (« n sans pilier, n sans format »), jamais dans une case', () => {
    assert.deepEqual([m.sansPilier, m.sansFormat], [2, 2]);
    assert.equal(m.lignes.reduce((t, l) => t + l.cases.reduce((u, c) => u + c.nombre, 0), 0), 7);
  });

  test('E6 les anciens identifiants de pilier sont lus comme les nouveaux (pme, claude, actu_ia, proximite, offre) ; une écriture n’utilise que les nouveaux', () => {
    assert.deepEqual(['pme', 'claude', 'actu_ia', 'proximite', 'offre', 'inconnu', null].map(R.convertirPilier), ['cas_concrets', 'pedagogie', 'actu_ia', 'demarche_offre', 'demarche_offre', null, null]);
    const anciens = P.fusionnerPosts([post('a'), post('b')], [classement('a', 'proximite', 'texte'), classement('b', 'offre', 'texte')]);
    assert.deepEqual(anciens.map((p) => p.classement.pilier), ['demarche_offre', 'demarche_offre']);
    assert.equal(R.libellePilier('claude'), 'Pédagogie et méthodes');
    const mAnciens = P.matrice(P.fusionnerPosts([post('a'), post('b')], [classement('a', 'proximite', 'texte'), classement('b', 'offre', 'texte')]));
    assert.equal(mAnciens.lignes.find((l) => l.id === 'demarche_offre').nombre, 2);
    assert.equal(P.classementModifie({ pilier: 'pme', format: 'texte' }, { pilier: 'cas_concrets', format: 'texte' }), false);
    assert.equal(R.normaliserClassement({ pilier: 'pme' }).pilier, 'cas_concrets');
  });

  test('E6 « Prochain post à imaginer » : les 3 cases les plus utiles (écart de la ligne + écart de la colonne), chacune avec une phrase', () => {
    assert.equal(m.suggestions.length, 3);
    // Pédagogie : 35 - 29 = 6 ; Démarche : 25 - 14 = 11 ; Actu : 15 - 14 = 1 ; Cas concrets : 25 - 43 = -18. Colonnes vidéo : (50 - 43) / 2 = 3,5 ; autres : -2,33.
    assert.deepEqual(m.suggestions.map((s) => [s.pilier, s.format]), [['demarche_offre', 'video'], ['demarche_offre', 'animation'], ['pedagogie', 'video']]);
    assert.equal(m.suggestions[0].titre, 'Ma démarche et mon offre × Vidéo 9:16');
    assert.match(m.suggestions[0].phrase, /Ma démarche et mon offre est à 14 % \(cible 25 %\), les vidéos à 43 % \(cible 50 %\) et cette case est encore vide\./);
  });

  test('E6 une suggestion tient compte du retard de la ligne : le pilier le plus en retard sur sa cible passe en premier', () => {
    const jeu = ['cas_concrets', 'cas_concrets', 'cas_concrets', 'cas_concrets', 'pedagogie'].map((pi, i) => post(`s${i}`, 'publie', { publieLe: '2026-11-03T05:08:00Z' }));
    const sug = P.matrice(P.fusionnerPosts(jeu, jeu.map((p, i) => classement(p.id, i < 4 ? 'cas_concrets' : 'pedagogie', 'texte')))).suggestions;
    assert.equal(sug[0].pilier, 'demarche_offre'); // 0 % pour 25 % de cible
  });

  test('E6 cas vide : aucun post, aucune division par zéro, aucune suggestion ; posts non classés : matrice à zéro et suggestions quand même', () => {
    const vide = P.matrice([]);
    assert.deepEqual([vide.total, vide.classes, vide.sansPilier, vide.sansFormat, vide.video.part, vide.suggestions], [0, 0, 0, 0, 0, []]);
    assert.ok(vide.lignes.every((l) => l.part === 0 && l.cases.every((c) => c.nombre === 0 && c.part === 0)));
    const nonClasses = P.matrice(P.fusionnerPosts([post('n1'), post('n2', 'programme', { prevuLe: '2026-11-17T05:08:00Z' })], []));
    assert.deepEqual([nonClasses.total, nonClasses.classes, nonClasses.sansPilier, nonClasses.sansFormat], [2, 0, 2, 2]);
    assert.equal(nonClasses.suggestions.length, 3);
  });

  test('E6 la part de vidéos du contrôle éditorial garde sa règle : fichier vidéo de Buffer ou classé « Vidéo 9:16 » / « Animation 16:9 »', () => {
    assert.equal(P.estVideo({ video: false, classement: { format: 'animation' } }), true);
    assert.equal(P.estVideo({ video: false, classement: { format: 'image' } }), false);
    assert.equal(P.estVideo({ video: true, classement: { format: null } }), true);
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
    ], [classement('p2', 'cas_concrets'), classement('p3', null, 'texte'), classement('p4', 'pedagogie', 'video')], NOW_HIVER);
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
    const points = codes(P.controlesEditoriaux(six, six.map((p) => classement(p.id, 'cas_concrets', 'video')), NOW_HIVER), 'e').map((p) => p.texte);
    assert.ok(points.includes('Le pilier « Cas concrets » pèse 100 % des posts classés (cible 25 %).'));
    assert.ok(points.some((t) => t.startsWith('Le pilier « Pédagogie et méthodes » pèse 0 %')));
    assert.ok(!points.some((t) => t.includes('Actu IA')), 'Actu IA : 0 % face à 15 % = exactement 15 points, pas plus');
    // Sous 5 posts classés : le contrôle se tait.
    const quatre = six.slice(0, 4);
    assert.equal(codes(P.controlesEditoriaux(quatre, quatre.map((p) => classement(p.id, 'cas_concrets', 'video')), NOW_HIVER), 'e').length, 0);
  });

  test('E7 aucun contrôle en échec : liste vide (l’écran dit « Tout est en ordre. »)', () => {
    // Un post programmé, classé et en vidéo sur chaque créneau des 21 prochains jours ; texte court.
    const creneaux = R.creneauxAVenir(NOW_HIVER, [], 21);
    const posts = creneaux.map((c, i) => post(`p${i}`, 'programme', { prevuLe: L.dateHeureParisVersDate(`${c.date}T${c.heure}`).toISOString(), video: true }));
    assert.ok(posts.length >= 4);
    // Piliers répartis selon la cible (avec 6 posts ou plus, un seul pilier « pèse 100 % » et le point e s'allume).
    const piliers = ['cas_concrets', 'pedagogie', 'demarche_offre', 'cas_concrets', 'actu_ia', 'pedagogie', 'demarche_offre', 'cas_concrets', 'demarche_offre', 'pedagogie'];
    assert.deepEqual(P.controlesEditoriaux(posts, posts.map((p, i) => classement(p.id, piliers[i % piliers.length], 'video')), NOW_HIVER), []);
  });
});

describe('E8 filtres et recherche', () => {
  const tous = P.fusionnerPosts([
    post('a', 'publie', { texte: 'Un devis fait en dix minutes' }), post('b', 'publie', { texte: 'Évènement à Manosque' }), post('c', 'programme', { texte: 'Claude au quotidien' }), post('d', 'brouillon', { texte: 'Autre sujet' }),
  ], [classement('a', 'cas_concrets', 'video', ['commercial']), classement('b', 'demarche_offre', 'image', []), classement('c', 'pedagogie', 'texte', ['direction', 'finance'])]);

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
    assert.deepEqual(ids(P.filtrerPosts(tous, { piliers: ['cas_concrets', 'pedagogie'] })), ['a', 'c']);
    assert.deepEqual(ids(P.filtrerPosts(tous, { piliers: ['cas_concrets', 'pedagogie'], formats: ['texte'] })), ['c']);
    assert.deepEqual(ids(P.filtrerPosts(tous, { services: ['finance', 'commercial'] })), ['a', 'c']);
    assert.deepEqual(ids(P.filtrerPosts(tous, { formats: ['image'], services: ['finance'] })), []);
    assert.deepEqual(ids(P.filtrerPosts(tous, {})), ['a', 'b', 'c', 'd']);
  });

  test('E8 le nombre de filtres (pastille du bouton) ne compte pas la recherche', () => {
    assert.equal(P.nombreFiltres({ recherche: 'abc', piliers: ['cas_concrets'], formats: ['video', 'image'], services: [], nonClasses: true }), 4);
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

// Décision de Jérôme du 12/11/2026 : les statistiques reflètent ce qui est PUBLIÉ et ce qui est PROGRAMMÉ AVEC UNE DATE de publication dans Buffer.
describe('E11 base de calcul unique (R.postsComptes)', () => {
  const NOW = new Date('2026-11-03T04:00:00Z');
  const brouillonClasse = post('bro', 'brouillon', { prevuLe: '2026-11-17T05:08:00Z', video: true });
  const sansDate = post('psd', 'programme', { video: true });
  const daté = post('pda', 'programme', { prevuLe: '2026-11-17T05:08:00Z', video: true });
  const publie = post('pub', 'publie', { publieLe: '2026-11-03T05:08:00Z' });
  const publieSansDate = post('pubsd', 'publie');
  const tous = [brouillonClasse, sansDate, daté, publie, publieSansDate];
  const classes = tous.map((p) => classement(p.id, 'cas_concrets', 'video'));
  const fusion = P.fusionnerPosts(tous, classes);

  test('E11 un brouillon ne compte jamais, même classé et daté', () => {
    assert.deepEqual(ids(R.postsComptes([brouillonClasse])), []);
  });
  test('E11 un programmé sans date ne compte pas ; un programmé daté compte ; un publié compte', () => {
    assert.deepEqual(ids(R.postsComptes([sansDate])), []);
    assert.deepEqual(ids(R.postsComptes([daté])), ['pda']);
    assert.deepEqual(ids(R.postsComptes([publie])), ['pub']);
    assert.deepEqual(ids(R.postsComptes([{ ...daté, statut: 'autre' }])), []);
  });
  test('E11 un publié sans date compte quand même, mais il est signalé (base et contrôle éditorial)', () => {
    assert.deepEqual(ids(R.postsComptes([publieSansDate])), ['pubsd']);
    assert.equal(R.baseDeCalcul(tous).publiesSansDate, 1);
    const g = P.controlesEditoriaux(tous, classes, NOW).filter((p) => p.code === 'g');
    assert.deepEqual(g.map((p) => p.postId), ['pubsd']);
  });
  test('E11 la matrice ne compte que les posts comptés et le dit dans sa base', () => {
    const m = P.matrice(fusion);
    assert.equal(m.total, 3);
    assert.equal(m.classes, 3);
    assert.deepEqual([m.base.publies, m.base.programmesAvecDate, m.base.programmesSansDate, m.base.brouillons], [2, 1, 1, 1]);
  });
  test('E11 phrase de base : « Base : n posts publiés + n programmés avec date. n programmés sans date et n brouillons ne sont pas comptés. »', () => {
    assert.equal(R.phraseBase(fusion), 'Base : 2 posts publiés + 1 programmé avec date. 1 programmé sans date et 1 brouillon ne sont pas comptés.');
    assert.equal(R.phraseBase([]), 'Base : 0 post publié + 0 programmé avec date. 0 programmé sans date et 0 brouillon ne sont pas comptés.');
  });
  test('E11 contrôle éditorial : un post programmé sans date est signalé (« est programmé sans date de publication dans Buffer »)', () => {
    const f = P.controlesEditoriaux(tous, classes, NOW).filter((p) => p.code === 'f');
    assert.equal(f.length, 1);
    assert.equal(f[0].postId, 'psd');
    assert.ok(f[0].texte.includes('est programmé sans date de publication dans Buffer'));
  });
  test('E11 un programmé sans date non classé n’ajoute pas de message « pas de pilier » (il ne compte pas)', () => {
    assert.equal(P.controlesEditoriaux([post('x', 'programme')], [], NOW).filter((p) => p.code === 'c').length, 0);
  });
  test('E11 cohérence : la matrice et le contrôle éditorial disent le même total (part de vidéos et piliers sur les mêmes posts)', () => {
    // 6 posts comptés (vidéo) + brouillons et programmés sans date NON vidéo : s'ils comptaient, la part de vidéos tomberait sous 50 %.
    const bons = Array.from({ length: 6 }, (_, i) => post(`ok${i}`, 'publie', { publieLe: `2026-10-${10 + i}T05:08:00Z`, video: true }));
    const exclus = [post('b1', 'brouillon'), post('b2', 'brouillon'), post('s1', 'programme'), post('s2', 'programme'), post('s3', 'programme')];
    const piliers = ['cas_concrets', 'pedagogie', 'demarche_offre', 'cas_concrets', 'actu_ia', 'pedagogie'];
    const cl = bons.map((p, i) => classement(p.id, piliers[i], 'video'));
    const m = P.matrice(P.fusionnerPosts([...bons, ...exclus], cl));
    assert.equal(m.total, 6);
    assert.equal(m.video.nombre, 6);
    const points = P.controlesEditoriaux([...bons, ...exclus], cl, NOW);
    assert.equal(points.filter((p) => p.code === 'd').length, 0, 'la part de vidéos du contrôle est calculée sur les 6 posts comptés, comme la matrice');
    assert.equal(points.filter((p) => p.code === 'f').length, 3);
  });
  test('E11 les statistiques et les créneaux utilisent la même règle : un brouillon ou un programmé sans date ne remplit pas un créneau', () => {
    assert.deepEqual(ids(P.statistiques(fusion).lignes).sort(), ['pub', 'pubsd']);
    const creneau = R.creneauxAVenir(NOW, [{ ...sansDate, prevuLe: null, publieLe: null }, { ...brouillonClasse, prevuLe: '2026-11-03T05:08:00Z' }])[0];
    assert.equal(creneau.post, null);
    const rempli = R.creneauxAVenir(NOW, [{ ...daté, prevuLe: '2026-11-03T05:08:00Z' }])[0];
    assert.equal(rempli.post?.id, 'pda');
  });
  test('E11 aucun autre filtre de statut pour les calculs : le code des statistiques passe par postsComptes', () => {
    const src = sansCommentaires(lire('js/modules/reseauxsociaux/posts-logique.js'));
    assert.ok(!/statut === 'publie' \|\| [a-z.]*statut === 'programme'/.test(src));
    assert.ok(/postsComptes\(posts\)/.test(src));
    assert.ok(/postsComptes\(posts\)/.test(sansCommentaires(lire('js/modules/reseauxsociaux/logique.js'))));
  });
});

describe('Aujourd’hui : derniers posts publiés et liens (13/11/2026)', () => {
  test('derniersPostsPublies rend les 3 plus récents publiés, du plus récent au plus ancien ; dernierPostPublie reste le premier', () => {
    const posts = [post('a', 'publie', { publieLe: '2026-11-01T05:08:00.000Z' }), post('b', 'programme', { prevuLe: '2026-11-20T05:08:00.000Z' }),
      post('c', 'publie', { publieLe: '2026-11-10T05:08:00.000Z' }), post('d', 'publie', { publieLe: '2026-11-05T05:08:00.000Z' }), post('e', 'publie', { publieLe: '2026-10-01T05:08:00.000Z' })];
    assert.deepEqual(R.derniersPostsPublies(posts).map((p) => p.id), ['c', 'd', 'a']);
    assert.equal(R.dernierPostPublie(posts).id, 'c');
    assert.deepEqual(R.derniersPostsPublies([]), []);
  });
  test('libelleJourHeure : jour et heure de Paris (hiver et été) ; vide sans date', () => {
    assert.equal(R.libelleJourHeure('2026-11-17T05:08:00.000Z'), 'mardi 17 novembre · 6 h 08');
    assert.equal(R.libelleJourHeure('2026-07-14T04:08:00.000Z'), 'mardi 14 juillet · 6 h 08');
    assert.equal(R.libelleJourHeure(null), '');
  });
  test('adressePostLinkedin : seulement une adresse https', () => {
    assert.equal(R.adressePostLinkedin({ lien: 'https://www.linkedin.com/feed/update/urn:li:share:1/' }), 'https://www.linkedin.com/feed/update/urn:li:share:1/');
    assert.equal(R.adressePostLinkedin({ lien: 'javascript:alert(1)' }), null);
    assert.equal(R.adressePostLinkedin({ lien: null }), null);
    assert.equal(R.adressePostLinkedin(null), null);
  });
  test('nombrePublies21Jours : fenêtre glissante, aujourd’hui inclus, il y a 21 jours exclu, futur et non publiés écartés', () => {
    const maintenant = new Date('2026-11-12T10:00:00.000Z'); // jeudi 12 novembre, Paris
    const publie = (id, publieLe) => post(id, 'publie', { publieLe });
    const posts = [publie('auj', '2026-11-12T05:08:00.000Z'), publie('j20', '2026-10-23T12:00:00.000Z'), publie('j21', '2026-10-22T12:00:00.000Z'),
      publie('futur', '2026-11-13T05:08:00.000Z'), post('prog', 'programme', { prevuLe: '2026-11-12T05:08:00.000Z' }), publie('sans', null)];
    assert.equal(R.nombrePublies21Jours(posts, maintenant), 2); // aujourd'hui et il y a 20 jours seulement
    assert.equal(R.nombrePublies21Jours([], maintenant), 0);
  });
  test('niveauRythme : 6 et plus vert, 3 à 5 orange, moins de 3 rouge', () => {
    assert.deepEqual([0, 2, 3, 5, 6, 9, 12].map(R.niveauRythme), ['rouge', 'rouge', 'orange', 'orange', 'vert', 'vert', 'vert']);
  });
});
