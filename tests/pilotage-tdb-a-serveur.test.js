// Tableau de bord, partie A : validation du réglage (onglets, sections, types, formats, couleurs, règles, liens, textes) et service (lecture PAR ONGLET, aucune fuite par la structure,
// colonnes déclarées seulement, une requête par SQL identique, un texte ne lit pas la base). Tout en mémoire : faux Postgres, aucun réseau. Noms de vues et adresses fictifs (@example.test).
// Un test par critère ; le nom commence par le numéro du point du brief : A1 onglets et sections, A2 types de tuile, A3 formats et couleurs nommés, A5 graphiques, A6 serveur.
import './_fiche-essai.js'; // chantier 0 : fiche reglages_maison des essais (comptes d'avant), branchée en mémoire sur le serveur
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { validerReglages, ErreurPilotage, TUILES_MAX, TUILES_TOTAL_MAX, REGLAGE_MAX } from '../functions/src/pilotage/reglages.js';
import { creerServicePilotage, filtrerColonnes } from '../functions/src/pilotage/service.js';
import { creerAppelPilotageLire } from '../functions/src/pilotage/appel.js';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { COMPTE_JEROME } from './_reglages-maison-essai.js'; // chantier 0, navigateur : la source des adresses des essais (js/ n'en contient plus)
const ADMINISTRATEURS = [COMPTE_JEROME];
import { COMPTES_AUTORISES as LIRE_COMPTES_AUTORISES } from '../functions/src/veille/appel.js';
const COMPTES_AUTORISES = await LIRE_COMPTES_AUTORISES(); // chantier 0 : liste lue dans la fiche reglages_maison/maison (celle des essais : _fiche-essai.js)

const JEROME = ADMINISTRATEURS[0];
const BOT = COMPTES_AUTORISES.find((c) => !ADMINISTRATEURS.includes(c));
const OPTION = JSON.stringify({ xAxis: { type: 'category' }, yAxis: {}, series: [{ type: 'bar' }] });
const refus = (fn, motif) => assert.throws(fn, (e) => e instanceof ErreurPilotage && e.code === 'invalid-argument' && (!motif || motif.test(e.message)), `attendu : refus ${motif ?? ''}`);

const graphique = (id, en = {}) => ({ id, titre: `Graphique ${id}`, vue: `v_exemple_${id}`, option: OPTION, ...en });
const chiffre = (id, en = {}) => ({ id, type: 'chiffre', titre: `Chiffre ${id}`, vue: `v_exemple_${id}`, valeur: { colonne: 'total', format: 'euros0' }, ...en });
const tableau = (id, en = {}) => ({ id, type: 'tableau', titre: `Tableau ${id}`, vue: `v_exemple_${id}`, colonnes: [{ colonne: 'nom', titre: 'Nom' }, { colonne: 'taux', titre: 'Taux', format: 'pourcent0' }], ...en });
const texte = (id, t = 'Bonjour') => ({ id, type: 'texte', titre: `Texte ${id}`, texte: t });
const reglage = (tuiles, onglets, groupes = {}) => ({ groupes, tableau: { titre: 'Tableau test', tuiles, ...(onglets ? { onglets } : {}) } });
const deuxOnglets = () => reglage([chiffre('c1'), tableau('t1'), texte('x1', 'Voir [le détail](#detail).'), graphique('g1')], [
  { id: 'resume', titre: 'Résumé', intro: 'Ce qui compte.', tuiles: ['c1', 'x1'] },
  { id: 'detail', titre: 'Détail', tuiles: ['t1'], sections: [{ id: 'sec', titre: 'Graphiques', intro: 'Les courbes.', tuiles: ['g1'] }] },
]);

describe('A1 onglets et sections (validation)', () => {
  test('A1.1 un réglage sans onglets reste valide et ne gagne pas de clé « onglets » (une page unique, comme avant)', () => {
    const v = validerReglages(reglage([graphique('a')]));
    assert.equal(v.tableau.onglets, undefined);
    assert.equal(v.tableau.tuiles[0].type, 'graphique');
  });
  test('A1.2 des onglets avec intro et sections sont normalisés ; chaque tuile est placée une fois', () => {
    const v = validerReglages(deuxOnglets());
    assert.deepEqual(v.tableau.onglets.map((o) => o.id), ['resume', 'detail']);
    assert.equal(v.tableau.onglets[0].intro, 'Ce qui compte.');
    assert.deepEqual(v.tableau.onglets[1].sections, [{ id: 'sec', titre: 'Graphiques', intro: 'Les courbes.', tuiles: ['g1'] }]);
  });
  test('A1.3 pas de sous-onglets : une section ne porte pas de sections ; la clé est ignorée et ne passe pas dans le réglage normalisé', () => {
    const r = deuxOnglets();
    r.tableau.onglets[1].sections[0].sections = [{ id: 'x', titre: 'Sous', tuiles: [] }];
    assert.equal(validerReglages(r).tableau.onglets[1].sections[0].sections, undefined);
  });
  test('A1.4 une tuile inconnue, placée deux fois ou placée nulle part est refusée ; idem identifiant d\'onglet ou de section en double, onglet vide', () => {
    const base = () => deuxOnglets();
    let r = base(); r.tableau.onglets[0].tuiles.push('fantome'); refus(() => validerReglages(r), /n'existe pas/);
    r = base(); r.tableau.onglets[0].tuiles.push('t1'); refus(() => validerReglages(r), /déjà placée/);
    r = base(); r.tableau.onglets[1].tuiles = []; r.tableau.onglets[1].sections = []; refus(() => validerReglages(r), /vide/);
    r = base(); r.tableau.tuiles.push(graphique('g2')); refus(() => validerReglages(r), /dans aucun onglet/);
    r = base(); r.tableau.onglets[1].id = 'resume'; refus(() => validerReglages(r), /déjà pris/);
    r = base(); r.tableau.onglets[0].sections = [{ id: 'sec', titre: 'A', tuiles: [] }]; refus(() => validerReglages(r), /déjà pris/);
  });
  test('A1.5 plafond de 20 tuiles PAR onglet et de 80 au total ; sans onglets, 20 au total', () => {
    const tuiles = Array.from({ length: TUILES_MAX + 1 }, (_, i) => texte(`t${i}`));
    refus(() => validerReglages(reglage(tuiles)), /Trop de tuiles/);
    refus(() => validerReglages(reglage(tuiles, [{ id: 'o', titre: 'O', tuiles: tuiles.map((t) => t.id) }])), /trop de tuiles/);
    const quatre = Array.from({ length: 4 * TUILES_MAX }, (_, i) => texte(`u${i}`));
    const onglets = [0, 1, 2, 3].map((k) => ({ id: `o${k}`, titre: `O${k}`, tuiles: quatre.slice(k * TUILES_MAX, (k + 1) * TUILES_MAX).map((t) => t.id) }));
    assert.equal(validerReglages(reglage(quatre, onglets)).tableau.tuiles.length, 4 * TUILES_MAX);
    assert.ok(TUILES_TOTAL_MAX >= 4 * TUILES_MAX);
    refus(() => validerReglages(reglage([...quatre, texte('de-trop')], onglets)), /Trop de tuiles/);
  });
  test('A1.6 la taille du réglage (300 000 caractères) n\'est pas relevée', () => { assert.equal(REGLAGE_MAX, 300_000); });
  test('A1.7 titre d\'onglet, de section et intro passent par les motifs interdits : adresse, « < » et script refusés ; longueur bornée', () => {
    for (const mal of ['<b>x</b>', 'https://exemple.test', 'javascript:alert(1)', 'a'.repeat(61)]) {
      const r = deuxOnglets(); r.tableau.onglets[0].titre = mal; refus(() => validerReglages(r));
    }
    const r = deuxOnglets(); r.tableau.onglets[1].sections[0].intro = 'voir <i>ça</i>'; refus(() => validerReglages(r), /refusé/);
    const s = deuxOnglets(); s.tableau.onglets[0].intro = 'x'.repeat(501); refus(() => validerReglages(s), /trop long/);
  });
  test('A1.8 prototype pollution : un onglet, une section ou une tuile nommé __proto__ est refusé (motif d\'identifiant), le réglage reste propre', () => {
    const r = deuxOnglets(); r.tableau.onglets[0].id = '__proto__'; refus(() => validerReglages(r), /identifiant/);
    assert.equal({}.polluee, undefined);
  });
});

describe('A2 types de tuile (validation)', () => {
  test('A2.1 champs obligatoires par type : graphique = vue + option ; chiffre, tableau, phrases = vue sans option ; texte = ni vue ni option', () => {
    assert.ok(validerReglages(reglage([graphique('a')])));
    const sansOption = graphique('a'); delete sansOption.option; refus(() => validerReglages(reglage([sansOption])), /option/);
    refus(() => validerReglages(reglage([chiffre('a', { option: OPTION })])), /pas d'option/);
    refus(() => validerReglages(reglage([tableau('a', { option: OPTION })])), /pas d'option/);
    refus(() => validerReglages(reglage([{ id: 'p', type: 'phrases', titre: 'P', colonnes: ['phrase'], vue: 'v_exemple_p', option: OPTION }])), /pas d'option/);
    const sansVue = chiffre('a'); delete sansVue.vue; refus(() => validerReglages(reglage([sansVue])), /vue/);
    refus(() => validerReglages(reglage([{ ...texte('x'), vue: 'v_exemple_x' }])), /ne lit rien/);
    refus(() => validerReglages(reglage([{ ...texte('x'), option: OPTION }])), /pas d'option/);
    refus(() => validerReglages(reglage([{ id: 'x', type: 'texte', titre: 'X' }])), /texte/);
  });
  test('A2.2 un type inconnu, une largeur inconnue et un « i » trop long ou dangereux sont refusés', () => {
    refus(() => validerReglages(reglage([chiffre('a', { type: 'camembert' })])), /type inconnu/);
    refus(() => validerReglages(reglage([chiffre('a', { largeur: 'enorme' })])), /largeur/);
    for (const l of ['tiers', 'moitie', 'deux-tiers', 'pleine']) assert.equal(validerReglages(reglage([chiffre('a', { largeur: l })])).tableau.tuiles[0].largeur, l);
    refus(() => validerReglages(reglage([chiffre('a', { aide: 'x'.repeat(301) })])), /trop long/);
    refus(() => validerReglages(reglage([chiffre('a', { aide: '<script>' })])), /refusé/);
    assert.equal(validerReglages(reglage([chiffre('a', { aide: 'Somme à décider.' })])).tableau.tuiles[0].aide, 'Somme à décider.');
  });
  test('A2.3 chiffre : seuils rangés, un seul dernier sans « jusqua », couleurs de la liste, libellé filtré ; variation avec « hausse » bon ou mauvais', () => {
    const ok = validerReglages(reglage([chiffre('a', { seuils: [{ jusqua: 0, couleur: 'bon', libelle: 'Rien n\'attend' }, { couleur: 'attention', libelle: 'Des factures attendent' }], variation: { colonne: 'total', periodeColonne: 'mois', periodeFormat: 'mois_annee', hausse: 'mauvais' } })]));
    assert.equal(ok.tableau.tuiles[0].seuils.length, 2);
    assert.equal(ok.tableau.tuiles[0].variation.hausse, 'mauvais');
    refus(() => validerReglages(reglage([chiffre('a', { seuils: [{ jusqua: 5, couleur: 'bon' }, { jusqua: 2, couleur: 'mauvais' }] })])), /plus petit/);
    refus(() => validerReglages(reglage([chiffre('a', { seuils: [{ couleur: 'bon' }, { jusqua: 2, couleur: 'mauvais' }] })])), /dernier seuil/);
    refus(() => validerReglages(reglage([chiffre('a', { seuils: [{ jusqua: 1, couleur: '#ff0000' }] })])), /couleur inconnue/);
    refus(() => validerReglages(reglage([chiffre('a', { seuils: [{ jusqua: 1, couleur: 'bon', libelle: '<b>' }] })])), /refusé/);
    refus(() => validerReglages(reglage([chiffre('a', { variation: { colonne: 'total', periodeColonne: 'mois', hausse: 'peut-etre' } })])), /hausse/);
    refus(() => validerReglages(reglage([chiffre('a', { valeur: { colonne: 'Total; drop', format: 'euros0' } })])), /colonne/);
    refus(() => validerReglages(reglage([chiffre('a', { valeur: { colonne: 'total', format: 'dollars' } })])), /format inconnu/);
  });
  test('A2.4 tableau : colonnes, format, règles (liste fermée « >= > <= < = »), parPage ; « < » est permis comme opérateur mais refusé comme texte', () => {
    const ok = validerReglages(reglage([tableau('a', { parPage: 10, colonnes: [{ colonne: 'taux', titre: 'Taux', format: 'pourcent0', regles: [{ si: '>=', valeur: 100, couleur: 'mauvais' }, { si: '>=', valeur: 90, couleur: 'attention' }, { si: '<', valeur: 90, couleur: 'bon' }, { si: '=', valeur: null, couleur: 'neutre' }] }] })]));
    assert.equal(ok.tableau.tuiles[0].colonnes[0].regles.length, 4);
    assert.equal(ok.tableau.tuiles[0].parPage, 10);
    assert.equal(validerReglages(reglage([tableau('a')])).tableau.tuiles[0].parPage, 20);
    refus(() => validerReglages(reglage([tableau('a', { colonnes: [{ colonne: 'x', regles: [{ si: '!=', valeur: 1, couleur: 'bon' }] }] })])), /« si »/);
    refus(() => validerReglages(reglage([tableau('a', { colonnes: [{ colonne: 'x', regles: [{ si: '<', valeur: '<b>', couleur: 'bon' }] }] })])), /refusé/);
    refus(() => validerReglages(reglage([tableau('a', { colonnes: [{ colonne: 'x', titre: 'a < b' }] })])), /refusé/);
    refus(() => validerReglages(reglage([tableau('a', { colonnes: [] })])), /colonnes/);
    refus(() => validerReglages(reglage([tableau('a', { parPage: 0 })])), /parPage/);
    refus(() => validerReglages(reglage([tableau('a', { parPage: 101 })])), /parPage/);
  });
  test('A2.5 phrases : 1 à 5 colonnes de texte', () => {
    assert.deepEqual(validerReglages(reglage([{ id: 'p', type: 'phrases', titre: 'Le point', vue: 'v_exemple_p', colonnes: ['phrase_a', 'phrase_b'] }])).tableau.tuiles[0].colonnes, ['phrase_a', 'phrase_b']);
    refus(() => validerReglages(reglage([{ id: 'p', type: 'phrases', titre: 'P', vue: 'v_exemple_p', colonnes: [] }])), /colonnes/);
    refus(() => validerReglages(reglage([{ id: 'p', type: 'phrases', titre: 'P', vue: 'v_exemple_p', colonnes: ['a', 'b', 'c', 'd', 'e', 'f'] }])), /colonnes/);
  });
  test('A2.6 texte : balisage permis, adresse, « < » et lien non interne refusés ; longueur bornée', () => {
    assert.ok(validerReglages(reglage([texte('x', '**Gras**, *italique*\nLigne deux.')])));
    refus(() => validerReglages(reglage([texte('x', '<b>gras</b>')])), /refusé/);
    refus(() => validerReglages(reglage([texte('x', 'voir https://exemple.test')])), /refusé/);
    refus(() => validerReglages(reglage([texte('x', 'a'.repeat(2001))])), /trop long/);
    refus(() => validerReglages(reglage([texte('x', '[ici](autre-chose)')])), /seuls les liens vers un onglet/);
  });
  test('A2.7 liens : seulement { onglet } vers un onglet qui existe (chiffre, colonne de tableau, texte) ; une adresse ou un onglet inconnu est refusé', () => {
    const o = (tuiles) => [{ id: 'detail', titre: 'Détail', tuiles: tuiles.map((t) => t.id) }];
    const c = chiffre('c', { lien: { onglet: 'detail' } });
    assert.ok(validerReglages(reglage([c], o([c]))));
    const inconnu = chiffre('c', { lien: { onglet: 'nulle-part' } });
    refus(() => validerReglages(reglage([inconnu], o([inconnu]))), /ne mène à aucun onglet/);
    const adresse = chiffre('c', { lien: { onglet: 'detail', adresse: 'https://exemple.test' } });
    assert.equal(validerReglages(reglage([adresse], o([adresse]))).tableau.tuiles[0].lien.adresse, undefined); // la clé est écartée
    const web = chiffre('c', { lien: 'https://exemple.test' });
    refus(() => validerReglages(reglage([web], o([web]))), /aucune adresse web/);
    const t = tableau('t', { colonnes: [{ colonne: 'nom', lien: { onglet: 'nulle-part' } }] });
    refus(() => validerReglages(reglage([t], o([t]))), /ne mène à aucun onglet/);
    const x = texte('x', 'Voir [là](#nulle-part).');
    refus(() => validerReglages(reglage([x], o([x]))), /ne mène à aucun onglet/);
    refus(() => validerReglages(reglage([chiffre('c', { lien: { onglet: 'detail' } })])), /ne mène à aucun onglet/); // pas d'onglets du tout
  });
});

describe('A3 formats et couleurs nommés (validation)', () => {
  test('A3.1 les dix formats sont permis, un nom inconnu est refusé (valeur, colonne, formats du graphique, période)', () => {
    for (const f of ['euros0', 'euros2', 'euros_abrege', 'pourcent0', 'pourcent1', 'entier', 'jours', 'date', 'date_heure', 'mois_annee']) {
      assert.ok(validerReglages(reglage([chiffre('a', { valeur: { colonne: 'total', format: f } })])), f);
    }
    refus(() => validerReglages(reglage([tableau('a', { colonnes: [{ colonne: 'x', format: 'monnaie' }] })])), /format inconnu/);
    refus(() => validerReglages(reglage([chiffre('a', { variation: { colonne: 'total', periodeColonne: 'mois', periodeFormat: 'trimestre', hausse: 'bon' } })])), /format inconnu/);
  });
  test('A3.2 une couleur est un NOM de la liste : jamais un code (#, rgb, mot libre)', () => {
    for (const c of ['bon', 'attention', 'mauvais', 'neutre']) assert.ok(validerReglages(reglage([chiffre('a', { seuils: [{ couleur: c }] })])));
    for (const c of ['#fff', 'rgb(0,0,0)', 'rouge', '']) refus(() => validerReglages(reglage([chiffre('a', { seuils: [{ couleur: c }] })])), /couleur inconnue/);
  });
});

describe('A5 graphiques (validation)', () => {
  test('A5.1 formats du graphique : seulement axeY, axeX, infobulle, etiquettes, avec un nom de la liste', () => {
    const v = validerReglages(reglage([graphique('g', { formats: { axeY: 'euros_abrege', infobulle: 'euros0', etiquettes: 'pourcent0', axeX: 'mois_annee' } })]));
    assert.equal(v.tableau.tuiles[0].formats.axeY, 'euros_abrege');
    refus(() => validerReglages(reglage([graphique('g', { formats: { axeZ: 'euros0' } })])), /n'existe pas/);
    refus(() => validerReglages(reglage([graphique('g', { formats: { axeY: 'fonction(x){}' } })])), /format inconnu/);
  });
  test('A5.2 couleurs nommées dans l\'option : « @bon », « @attention », « @mauvais », « @neutre » permis ; une autre « @… » refusée', () => {
    const opt = (c) => JSON.stringify({ series: [{ type: 'bar', itemStyle: { color: c } }] });
    for (const c of ['@bon', '@attention', '@mauvais', '@neutre']) assert.ok(validerReglages(reglage([graphique('g', { option: opt(c) })])), c);
    refus(() => validerReglages(reglage([graphique('g', { option: opt('@pourpre') })])), /couleur nommée/);
  });
  test('A5.3 le dangereux reste refusé dans une option de graphique (liens, images, « < », javascript:)', () => {
    for (const mal of ['https://exemple.test/x.png', 'image://exemple', '<img src=x>', 'javascript:alert(1)']) {
      refus(() => validerReglages(reglage([graphique('g', { option: JSON.stringify({ title: { text: mal } }) })])), /refusé/);
    }
  });
});

// ---------- Service ----------
const jeton = (email, verifie = true) => ({ auth: { token: { email, email_verified: verifie } } });
const code = (p) => p.then(() => null, (e) => e.code);
function fauxPostgres(lignes = () => [{ nom: 'Alpha', taux: 95, total: 100, secret: 'a-ne-pas-sortir', mois: '2026-10-01' }]) {
  const etat = { ouvertures: 0, requetes: [] };
  return {
    etat,
    connecter: async () => { etat.ouvertures += 1; return { interroger: async (sql) => { etat.requetes.push(sql); return lignes(sql); }, fermer: async () => {} }; },
  };
}
async function monter(reglages, pg = fauxPostgres()) {
  const donnees = creerAccesMemoire({ pilotage_parametres: [{ id: 'reglages', ...reglages, version: 1, modifieLe: new Date(0) }] });
  const service = creerServicePilotage({ donnees: () => donnees, connecter: pg.connecter, maintenant: () => 1_000_000 });
  return { pg, service, lire: creerAppelPilotageLire({ service }) };
}

describe('A6 service : lecture par onglet et contrat étendu', () => {
  test('A6.1 sans « onglet » : le PREMIER onglet est lu (rien d\'autre), la structure et l\'onglet lu sont rendus', async () => {
    const m = await monter(deuxOnglets());
    const r = await m.lire({ ...jeton(BOT), data: {} });
    assert.equal(r.onglet, 'resume');
    assert.deepEqual(r.tuiles.map((t) => t.id), ['c1', 'x1']);
    assert.deepEqual(r.onglets.map((o) => o.id), ['resume', 'detail']);
    assert.deepEqual(m.pg.etat.requetes, ['select * from "v_exemple_c1" limit 1']); // un grand chiffre sans variation lit 1 ligne ; le texte ne lit rien, l'autre onglet n'est pas lu
  });
  test('A6.2 « onglet » demandé : seul cet onglet est lu (tuiles directes puis sections)', async () => {
    const m = await monter(deuxOnglets());
    const r = await m.lire({ ...jeton(BOT), data: { onglet: 'detail' } });
    assert.equal(r.onglet, 'detail');
    assert.deepEqual(r.tuiles.map((t) => t.id).sort(), ['g1', 't1']);
    assert.equal(m.pg.etat.requetes.length, 2);
    assert.ok(!m.pg.etat.requetes.some((q) => q.includes('c1')));
  });
  test('A6.3 un onglet inconnu, mal formé ou un NOM DE VUE : invalid-argument, rien n\'est lu', async () => {
    const m = await monter(deuxOnglets());
    for (const o of ['nulle-part', 'v_exemple_t1', '../x', 12, {}, 'a'.repeat(50)]) assert.equal(await code(m.lire({ ...jeton(BOT), data: { onglet: o } })), 'invalid-argument', String(o));
    assert.equal(m.pg.etat.requetes.length, 0);
  });
  test('A6.4 contrat étendu : chaque tuile porte type, largeur, aide et la configuration de son type ; un graphique garde option et formats', async () => {
    const r0 = reglage([chiffre('c', { largeur: 'tiers', aide: 'Aide.', seuils: [{ couleur: 'bon' }], lien: { onglet: 'o' } }), tableau('t', { parPage: 5 }), { id: 'p', type: 'phrases', titre: 'P', vue: 'v_exemple_p', colonnes: ['nom'] }, graphique('g', { formats: { axeY: 'euros0' } }), texte('x', '**Gras**')], [{ id: 'o', titre: 'O', tuiles: ['c', 't', 'p', 'g', 'x'] }]);
    const m = await monter(r0);
    const r = await m.lire({ ...jeton(BOT), data: {} });
    const par = Object.fromEntries(r.tuiles.map((t) => [t.id, t]));
    assert.equal(par.c.type, 'chiffre'); assert.equal(par.c.largeur, 'tiers'); assert.equal(par.c.aide, 'Aide.'); assert.deepEqual(par.c.valeur, { colonne: 'total', format: 'euros0' }); assert.deepEqual(par.c.lien, { onglet: 'o' });
    assert.equal(par.t.type, 'tableau'); assert.equal(par.t.parPage, 5); assert.equal(par.t.colonnes.length, 2);
    assert.deepEqual(par.p.colonnes, ['nom']);
    assert.equal(par.g.type, 'graphique'); assert.deepEqual(par.g.formats, { axeY: 'euros0' }); assert.equal(typeof par.g.option, 'object');
    assert.equal(par.x.texte, '**Gras**'); assert.deepEqual(par.x.lignes, []);
  });
  test('A6.5 un réglage sans onglets : tout est lu comme avant, sans « onglets » dans la réponse ; « onglet » est ignoré', async () => {
    const m = await monter(reglage([graphique('a'), chiffre('b')]));
    const r = await m.lire({ ...jeton(BOT), data: { onglet: 'quoi-que-ce-soit' } });
    assert.equal(r.tuiles.length, 2);
    assert.equal(r.onglets, undefined);
  });
  test('A6.6 colonnes : chiffre, tableau et phrases ne rendent QUE les colonnes déclarées (« select * » filtré après lecture) ; un graphique garde toutes les colonnes', async () => {
    const r0 = reglage([chiffre('c', { variation: { colonne: 'total', periodeColonne: 'mois', hausse: 'bon' } }), tableau('t'), { id: 'p', type: 'phrases', titre: 'P', vue: 'v_exemple_p', colonnes: ['nom'] }, graphique('g')], [{ id: 'o', titre: 'O', tuiles: ['c', 't', 'p', 'g'] }]);
    const m = await monter(r0);
    const r = await m.lire({ ...jeton(BOT), data: {} });
    const par = Object.fromEntries(r.tuiles.map((t) => [t.id, t]));
    assert.deepEqual(Object.keys(par.c.lignes[0]).sort(), ['mois', 'total']);
    assert.deepEqual(Object.keys(par.t.lignes[0]).sort(), ['nom', 'taux']);
    assert.deepEqual(Object.keys(par.p.lignes[0]), ['nom']);
    assert.ok('secret' in par.g.lignes[0]);
    for (const id of ['c', 't', 'p']) assert.ok(!JSON.stringify(par[id]).includes('a-ne-pas-sortir'), id);
  });
  test('A6.7 une seule requête par SQL identique dans un même appel (deux tuiles sur la même vue, même tri, même limite)', async () => {
    const m = await monter(reglage([graphique('a', { vue: 'v_exemple_commune' }), tableau('b', { vue: 'v_exemple_commune', limite: 200 }), graphique('c', { vue: 'v_exemple_commune' })], [{ id: 'o', titre: 'O', tuiles: ['a', 'b', 'c'] }]));
    const r = await m.lire({ ...jeton(BOT), data: {} });
    assert.equal(r.tuiles.length, 3);
    assert.equal(m.pg.etat.requetes.length, 1);
    assert.equal(m.pg.etat.ouvertures, 1);
  });
  test('A6.8 un texte ne lit jamais la base, même seul dans un onglet', async () => {
    const m = await monter(reglage([texte('x')], [{ id: 'o', titre: 'O', tuiles: ['x'] }]));
    const r = await m.lire({ ...jeton(BOT), data: {} });
    assert.equal(r.tuiles[0].texte, 'Bonjour');
    assert.equal(m.pg.etat.ouvertures, 0);
    assert.equal(m.pg.etat.requetes.length, 0);
  });
  test('A6.9 tuile en panne : reste dans « tuiles » avec sa configuration et lignes: [], « erreurs » ne porte que des tuiles visibles', async () => {
    const pg = fauxPostgres(() => { throw new Error('boom hote-secret'); });
    const m = await monter(reglage([chiffre('c')], [{ id: 'o', titre: 'O', tuiles: ['c'] }]), pg);
    const r = await m.lire({ ...jeton(BOT), data: {} });
    assert.deepEqual(r.tuiles[0].lignes, []);
    assert.equal(r.tuiles[0].type, 'chiffre');
    assert.deepEqual(r.erreurs, [{ id: 'c', message: 'Cette tuile n\'a pas pu être lue.' }]);
    assert.ok(!JSON.stringify(r).includes('hote-secret'));
  });
  test('A6.10 budget : le budget global de 40 s est inchangé', async () => {
    const { BUDGET_LECTURE_MS } = await import('../functions/src/pilotage/service.js');
    assert.equal(BUDGET_LECTURE_MS, 40_000);
  });
});

describe('A6 aucune fuite par la structure (tuiles interdites)', () => {
  const r0 = () => reglage([
    chiffre('pour_tous', { lien: { onglet: 'secret' } }),
    tableau('cache', { visiblePour: [JEROME], colonnes: [{ colonne: 'nom', lien: { onglet: 'secret' } }] }),
    graphique('cache2', { visiblePour: [JEROME] }),
    { ...texte('texte_a_lien', 'Voir [le secret](#secret) et [le public](#public).') },
    chiffre('sec_a', { visiblePour: [JEROME] }),
  ], [
    { id: 'public', titre: 'Public', tuiles: ['pour_tous', 'texte_a_lien'], sections: [{ id: 'sec-cachee', titre: 'Section cachée', tuiles: ['cache'] }, { id: 'sec-ok', titre: 'Section visible', tuiles: ['pour_tous2'].filter(() => false) }] },
    { id: 'secret', titre: 'Secret', tuiles: ['cache2', 'sec_a'] },
  ]);
  test('A6.11 compte non administrateur : tuiles interdites retirées PARTOUT (ids, sections vides, onglets vides) et lien vers un onglet invisible retiré', async () => {
    const m = await monter(r0());
    const r = await m.lire({ ...jeton(BOT), data: {} });
    assert.deepEqual(r.onglets.map((o) => o.id), ['public']);
    assert.deepEqual(r.onglets[0].tuiles, ['pour_tous', 'texte_a_lien']);
    assert.equal(r.onglets[0].sections, undefined); // « Section cachée » n'est pas listée : son titre ne fuit pas
    const texteJson = JSON.stringify(r);
    for (const interdit of ['"cache"', '"cache2"', '"sec_a"', '"Secret"', 'sec-cachee']) assert.ok(!texteJson.includes(interdit), interdit);
    assert.ok(!texteJson.includes('Section cachée'));
    assert.ok(!texteJson.includes('"secret"'));
    const par = Object.fromEntries(r.tuiles.map((t) => [t.id, t]));
    assert.equal(par.pour_tous.lien, undefined); // le lien menait à l'onglet « secret », invisible
    assert.equal(par.texte_a_lien.texte, 'Voir le secret et [le public](#public).'); // le lien invisible redevient du texte simple
    assert.ok(!m.pg.etat.requetes.some((q) => q.includes('cache') || q.includes('sec_a')));
  });
  test('A6.12 demander un onglet entièrement interdit : même réponse qu\'un onglet inconnu (invalid-argument), rien n\'est lu', async () => {
    const m = await monter(r0());
    assert.equal(await code(m.lire({ ...jeton(BOT), data: { onglet: 'secret' } })), 'invalid-argument');
    assert.equal(await code(m.lire({ ...jeton(BOT), data: { onglet: 'nulle-part' } })), 'invalid-argument');
    assert.equal(m.pg.etat.requetes.length, 0);
  });
  test('A6.13 Jérôme (éditeur de son réglage) voit tout : les deux onglets, la section, les liens', async () => {
    const m = await monter(r0());
    const r = await m.lire({ ...jeton(JEROME), data: {} });
    assert.deepEqual(r.onglets.map((o) => o.id), ['public', 'secret']);
    assert.equal(r.onglets[0].sections.length, 1);
    const par = Object.fromEntries(r.tuiles.map((t) => [t.id, t]));
    assert.deepEqual(par.pour_tous.lien, { onglet: 'secret' });
    const s = await m.lire({ ...jeton(JEROME), data: { onglet: 'secret' } });
    assert.deepEqual(s.tuiles.map((t) => t.id).sort(), ['cache2', 'sec_a']);
  });
  test('A6.14 un compte non autorisé ou sans e-mail vérifié n\'obtient rien, pas même la structure', async () => {
    const m = await monter(r0());
    assert.equal(await code(m.lire({ ...jeton('intrus@example.test'), data: {} })), 'permission-denied');
    assert.equal(await code(m.lire({ ...jeton(BOT, false), data: {} })), 'permission-denied');
    assert.equal(await code(m.lire({ data: {} })), 'unauthenticated');
    assert.equal(m.pg.etat.requetes.length, 0);
  });
  test('A6.15 groupe inconnu ou liste vide : la tuile est interdite pour tous, la structure ne la montre pas', async () => {
    const rg = reglage([chiffre('a', { visiblePour: ['fantome'] }), chiffre('b', { visiblePour: [] }), chiffre('c')], [{ id: 'o', titre: 'O', tuiles: ['a', 'b', 'c'] }]);
    const m = await monter(rg);
    const r = await m.lire({ ...jeton(BOT), data: {} });
    assert.deepEqual(r.onglets[0].tuiles, ['c']);
    assert.deepEqual(r.tuiles.map((t) => t.id), ['c']);
  });
  test('A6.16 aperçu (Jérôme seul) : toutes les tuiles du brouillon, structure complète ; refusé pour les autres', async () => {
    const m = await monter(reglage([chiffre('a')]));
    const brouillon = r0();
    const r = await m.lire({ ...jeton(JEROME), data: { apercu: brouillon, onglet: 'secret' } });
    assert.deepEqual(r.tuiles.map((t) => t.id).sort(), ['cache2', 'sec_a']);
    assert.deepEqual(r.onglets.map((o) => o.id), ['public', 'secret']);
    assert.equal(await code(m.lire({ ...jeton(BOT), data: { apercu: brouillon } })), 'permission-denied');
  });
});

describe('A7 relecture Fable : tolérance, SQL du chiffre, limites, liens, colonnes', () => {
  test('A7.1 un réglage ENREGISTRÉ avec un titre « Marge:taux » ou « < 20 % » reste lu ; strict à l\'enregistrement', async () => {
    const reg = reglage([chiffre('a', { titre: 'Marge:taux' }), chiffre('b', { titre: '< 20 %' })], [{ id: 'o', titre: 'O', tuiles: ['a', 'b'] }]);
    reg.tableau.titre = 'Durée (h:mm)';
    const m = await monter(reg);
    const r = await m.lire({ ...jeton(BOT), data: {} });
    assert.deepEqual(r.tuiles.map((t) => t.titre), ['Marge:taux', '< 20 %']);
    assert.equal(r.titre, 'Durée (h:mm)');
    refus(() => validerReglages(reg));
  });
  test('A7.2 grand chiffre : avec variation « order by période desc limit 2 » ; sans variation « limit 1 » et respecte le tri ; au plus 2 lignes rendues', async () => {
    const avec = chiffre('c', { variation: { colonne: 'total', periodeColonne: 'mois', hausse: 'bon' } });
    const sans = chiffre('d', { tri: { colonne: 'total', sens: 'asc' } });
    const m = await monter(reglage([avec, sans], [{ id: 'o', titre: 'O', tuiles: ['c', 'd'] }]), fauxPostgres((sql) => [{ total: 1, mois: 'a' }, { total: 2, mois: 'b' }, { total: 3, mois: 'c' }].slice(0, Number(/limit (\d+)$/.exec(sql)[1]))));
    const r = await m.lire({ ...jeton(BOT), data: {} });
    assert.ok(m.pg.etat.requetes.includes('select * from "v_exemple_c" order by "mois" desc nulls last limit 2'));
    assert.ok(m.pg.etat.requetes.includes('select * from "v_exemple_d" order by "total" asc limit 1'));
    for (const t of r.tuiles) assert.ok(t.lignes.length <= 2, t.id);
  });
  test('A7.3 tableau : 500 lignes par défaut et la limite appliquée est renvoyée', async () => {
    const m = await monter(reglage([tableau('t'), tableau('u', { limite: 50 })], [{ id: 'o', titre: 'O', tuiles: ['t', 'u'] }]));
    const r = await m.lire({ ...jeton(BOT), data: {} });
    assert.ok(m.pg.etat.requetes.includes('select * from "v_exemple_t" limit 500'));
    const par = Object.fromEntries(r.tuiles.map((t) => [t.id, t]));
    assert.equal(par.t.limite, 500);
    assert.equal(par.u.limite, 50);
  });
  test('A7.4 lien de texte : « voir [a]b](#secret) » est refusé ; un lien complet reste permis', () => {
    refus(() => validerReglages(reglage([texte('x', 'voir [a]b](#secret)')])));
    refus(() => validerReglages(reglage([texte('x', 'voir [a](https://x.fr)')])));
    assert.doesNotThrow(() => validerReglages(reglage([texte('x', 'Voir [le détail](#detail).'), texte('y')], [{ id: 'detail', titre: 'D', tuiles: ['y'] }, { id: 'o', titre: 'O', tuiles: ['x'] }])));
  });
  test('A7.5 colonnes « __proto__ », « constructor », « prototype » refusées (colonne, tri) ; « hasOwn » filtre les colonnes', async () => {
    for (const c of ['__proto__', 'constructor', 'prototype']) {
      refus(() => validerReglages(reglage([tableau('t', { colonnes: [{ colonne: c, titre: 'X' }] })])));
      refus(() => validerReglages(reglage([graphique('g', { tri: { colonne: c, sens: 'asc' } })])));
    }
    const sortie = filtrerColonnes(chiffre('c'), [Object.assign(Object.create({ total: 'herite' }), { mois: 'x' })]);
    assert.ok(!('total' in sortie[0]));
  });
  test('A7.6 texte multi-lignes : « Note:\\nSuite » n\'est pas refusé', () => {
    assert.doesNotThrow(() => validerReglages(reglage([texte('x', 'Note:\nSuite')])));
  });
});
