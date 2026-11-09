// Fin du menu du portail devis seul (09/11/2026) : Devis · Clients · Catalogue · Relances · Statistiques. Aucun navigateur.
// Le nom d'un test commence par le numéro du critère (M1 à M4 : menu et routes ; S1 à S6 : statistiquesDevis). Exemples chiffrés : 100 €.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { PORTAILS, ecranSocleDeRoute } from '../js/os/portail.js';
import { blocsDuMenu, MODULES_DECLARES } from '../js/os/registre.js';
import { statistiquesDevis, moisDeLaPeriode, libelleMois, PERIODES, PERIODE_DEFAUT } from '../js/modules/devis/statistiques.js';

const PORTAIL = PORTAILS['portail-devis'];
const chemins = (bloc) => bloc.sections.flat().map((e) => e.chemin);

describe('menu du portail', () => {
  test('M1 le menu du portail : cinq écrans dans l\'ordre voulu', () => {
    assert.deepEqual([...PORTAIL.menu], ['devis/liste', 'crm/personnes', 'devis/bordereau', 'devis/relances', 'devis/statistiques']);
  });
  test('M2 blocsDuMenu avec visibles + supplements : Devis, Clients, Catalogue, Relances, Statistiques, dans cet ordre ; « Clients » seulement ici', () => {
    const bloc = blocsDuMenu(['devis'], { visibles: PORTAIL.menu, supplements: PORTAIL.supplements }).find((b) => b.id === 'devis');
    assert.deepEqual(chemins(bloc), [...PORTAIL.menu]);
    assert.deepEqual(bloc.sections.flat().map((e) => e.libelle), ['Devis', 'Clients', 'Catalogue', 'Relances', 'Statistiques']);
    // Le menu normal ne change pas : ni Statistiques, ni Clients, et « Personnes » garde son mot.
    const complet = blocsDuMenu(['affaires', 'projets', 'devis']);
    assert.ok(!complet.flatMap((b) => b.sections.flat()).some((e) => /Clients|Statistiques|Relances/.test(e.libelle)));
    assert.ok(complet.flatMap((b) => b.entrees).some((e) => e.chemin === 'crm/personnes' && e.libelle === 'Personnes'));
    const sansSupplement = blocsDuMenu(['devis']).find((b) => b.id === 'devis');
    assert.deepEqual(chemins(sansSupplement), ['devis/liste']);
  });
  test('M3 ecranSocleDeRoute : personnes et organisations, avec ou sans fiche ; un identifiant tapé à la main est refusé', () => {
    assert.deepEqual(ecranSocleDeRoute(['crm', 'personnes']), { vue: 'personnes', id: null });
    assert.deepEqual(ecranSocleDeRoute(['crm', 'personnes', 'abc_DEF-123']), { vue: 'personnes', id: 'abc_DEF-123' });
    assert.deepEqual(ecranSocleDeRoute(['crm', 'organisations', 'o1']), { vue: 'organisations', id: 'o1' });
    for (const s of [['crm', 'affaires'], ['crm', 'accueil'], ['crm', 'journal'], ['devis', 'liste'], ['crm'], [], undefined, ['crm', 'personnes', 'a/b'], ['crm', 'personnes', 'x y'], ['crm', 'personnes', '<img>'], ['crm', 'personnes', '..'], ['crm', 'personnes', ''], ['crm', 'personnes', 'a'.repeat(129)], ['crm', 'personnes', 'a', 'b']]) {
      assert.equal(ecranSocleDeRoute(s), null, JSON.stringify(s));
    }
  });
  test('M4 chaque icône du menu du portail, de Statistiques et de ses écrans existe dans ICONES (sinon le SVG est vide)', async () => {
    const { ICONES } = await import('../js/os/ui.js');
    for (const s of PORTAIL.supplements) assert.ok(s.icone in ICONES, `supplément ${s.chemin} : icône « ${s.icone} »`);
    const devis = MODULES_DECLARES.find((m) => m.id === 'devis');
    for (const route of PORTAIL.menu) {
      const e = devis.ecrans.find((x) => x.route === route) ?? PORTAIL.supplements.find((x) => x.chemin === route);
      assert.ok(e, route);
      assert.ok((e.icone) in ICONES, `${route} : icône « ${e.icone} »`);
    }
    for (const f of ['../js/modules/devis/statistiques-ecran.js', '../js/os/portail-socle.js']) {
      const noms = [...readFileSync(new URL(f, import.meta.url), 'utf8').matchAll(/icone\(\s*'([a-z0-9-]+)'/g)].map((m) => m[1]);
      for (const n of noms) assert.ok(n in ICONES, `${f} : icône « ${n} »`);
    }
  });
  test('M5 l\'écran Statistiques ne demande aucun autre module (ni Affaires ni CRM de données)', () => {
    const src = readFileSync(new URL('../js/modules/devis/statistiques-ecran.js', import.meta.url), 'utf8') + readFileSync(new URL('../js/modules/devis/statistiques.js', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /import[^;]*['"][^'"]*(crm\/donnees|projets|affaires)/);
  });
});

const AUJOURDHUI = '2026-11-09';
const stat = (liste, plus = {}) => statistiquesDevis(liste, { aujourdhui: AUJOURDHUI, ...plus });
const devis = (id, statut, plus = {}) => ({ id, statut, totaux: { ht: 100, tva: 20, ttc: 120 }, creeLe: '2026-10-01', finaliseLe: '2026-10-02', envoyeLe: '2026-10-03', accepteLe: '2026-10-20', refuseLe: '2026-10-21', ...plus });
const mois = (s, m) => s.mois.find((x) => x.mois === m);

describe('statistiquesDevis', () => {
  test('S1 un signé de 100 € HT et un refusé de 100 € HT, tous deux envoyés : CA signé 100 €, taux de transformation 50 %', () => {
    const s = stat([devis('a', 'accepte'), devis('b', 'refuse')]);
    assert.equal(s.caSigneHt, 100);
    assert.equal(s.tauxTransformation, 50);
    assert.equal(s.signes, 1);
    assert.equal(s.sortis, 2);
    assert.deepEqual([s.parStatut.accepte, s.parStatut.refuse], [1, 1]);
    assert.deepEqual(mois(s, '2026-10'), { mois: '2026-10', signes: 1, envoyes: 2, devis: 2, caSigneHt: 100 });
  });
  test('S2 un devis archivé compte ; brouillon, refusé, remplacé, envoyé et finalisé n\'entrent jamais dans le CA ; sans affaire inclus', () => {
    const s = stat([devis('a', 'accepte', { archive: true }), devis('b', 'accepte', { affaireId: 'aff1' }), devis('c', 'accepte', { affaireId: null }),
      devis('br', 'brouillon'), devis('r', 'refuse'), devis('re', 'remplace'), devis('e', 'envoye'), devis('f', 'en_attente_envoi')]);
    assert.equal(s.caSigneHt, 300);
    assert.equal(s.signes, 3);
    assert.deepEqual(s.parStatut, { brouillon: 1, en_attente_envoi: 1, envoye: 1, accepte: 3, refuse: 1, remplace: 1 });
    assert.equal(s.tauxTransformation, 60); // 3 signés sur 5 sortis (3 signés + 1 refusé + 1 envoyé) ; remplacé, finalisé et brouillon n'y sont pas
  });
  test('S3 les devis de test sont exclus de tout (CA, statuts, taux)', () => {
    const s = stat([devis('t1', 'accepte', { test: true }), devis('t2', 'envoye', { test: true }), devis('a', 'accepte')]);
    assert.equal(s.caSigneHt, 100);
    assert.equal(s.nbDevis, 1);
    assert.equal(s.tauxTransformation, 100);
  });
  test('S4 ancien devis sans champ récent : retombe sur la date suivante ; sans aucune date il est compté à part ; total illisible : compte mais ajoute 0 €', () => {
    const ancien = { id: 'o', statut: 'accepte', totaux: { ht: 100 }, finaliseLe: '2026-09-15' }; // ni accepteLe ni envoyeLe
    const sansDate = { id: 'sd', statut: 'accepte', totaux: { ht: 100 } };
    const sansTotal = devis('st', 'accepte', { totaux: undefined });
    const negatif = devis('ng', 'accepte', { totaux: { ht: -100 } });
    const s = stat([ancien, sansDate, sansTotal, negatif, null, undefined, 'x', { id: 'z', statut: 'inconnu' }]);
    assert.equal(mois(s, '2026-09').caSigneHt, 100);
    assert.equal(s.sansDate, 1);
    assert.equal(s.caSigneHt, 100);
    assert.equal(s.signes, 3); // ancien + sansTotal + négatif
    assert.deepEqual(stat(undefined).mois.map((m) => m.devis), new Array(12).fill(0));
  });
  test('S5 période vide : zéros partout, taux « — » (null), jamais de division par zéro ; 12 mois par défaut, jusqu\'au mois courant', () => {
    const s = stat([]);
    assert.equal(s.nbDevis, 0);
    assert.equal(s.caSigneHt, 0);
    assert.equal(s.tauxTransformation, null);
    assert.equal(s.periode, PERIODE_DEFAUT);
    assert.equal(s.mois.length, 12);
    assert.deepEqual([s.mois[0].mois, s.mois[11].mois], ['2025-12', '2026-11']);
    const horsPeriode = stat([devis('vieux', 'accepte', { accepteLe: '2024-01-10' }), devis('futur', 'accepte', { accepteLe: '2027-03-10' })]);
    assert.equal(horsPeriode.nbDevis, 0);
    assert.equal(horsPeriode.caSigneHt, 0);
    assert.equal(stat([devis('b', 'brouillon')]).tauxTransformation, null); // un brouillon n'est pas un devis envoyé
  });
  test('S6 sélecteur de période : 6 mois, 3 mois, année en cours ; période inconnue = défaut ; un devis hors période est écarté', () => {
    assert.deepEqual(moisDeLaPeriode(AUJOURDHUI, '3-mois'), ['2026-09', '2026-10', '2026-11']);
    assert.equal(moisDeLaPeriode(AUJOURDHUI, '6-mois').length, 6);
    assert.deepEqual(moisDeLaPeriode(AUJOURDHUI, 'annee'), ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08', '2026-09', '2026-10', '2026-11']);
    assert.equal(moisDeLaPeriode(AUJOURDHUI, 'n’importe quoi').length, 12);
    assert.deepEqual(moisDeLaPeriode('pas une date'), []);
    assert.deepEqual(PERIODES.map((p) => p.id), ['12-mois', '6-mois', '3-mois', 'annee']);
    const ancien = devis('j', 'accepte', { accepteLe: '2026-02-10' });
    assert.equal(stat([ancien], { periode: '12-mois' }).caSigneHt, 100);
    assert.equal(stat([ancien], { periode: '3-mois' }).caSigneHt, 0);
    assert.equal(stat([ancien], { periode: 'annee' }).caSigneHt, 100);
    assert.equal(libelleMois('2026-10'), 'oct. 2026');
  });
  test('S7 dates en formes variées (Date, { seconds }, texte) et pas de centime perdu : 3 × 33,33 €', () => {
    const ht = (v) => ({ ht: v });
    const s = stat([devis('a', 'accepte', { accepteLe: new Date('2026-10-05T10:00:00Z'), totaux: ht(33.33) }), devis('b', 'accepte', { accepteLe: { seconds: Date.parse('2026-10-06T10:00:00Z') / 1000 }, totaux: ht(33.33) }), devis('c', 'accepte', { accepteLe: '2026-10-07', totaux: ht(33.34) })]);
    assert.equal(s.caSigneHt, 100);
  });
});
