// Accueil « village » d'une maison (26/11/2026) : champ facultatif `besoins` de reglages_maison/ecran (js/os/maison-village.js). Sans réseau ni navigateur.
// Parcours dans le navigateur : tests/e2e/maison-village.spec.js (captures dans tests/e2e/captures/maison-village/).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lireBesoinsMaison, cibleValide, planVillage, dessinBatiment, decorParcelle, formesTerrain, terrainCoins, couperEnLignes, BATIMENTS, BOITE_BATIMENT, BESOINS_MAX, DECORS, COMPTEURS, textePastille, CATALOGUE, DEMI_PARCELLE, T, ETIQUETTE_Y, ETIQUETTE_HAUTEUR_MAX, NOM_MAX, PHRASE_MAX } from '../js/os/maison-village.js';
import { teintes } from '../js/os/village-batiments.js';
import { remplirComptesMaison, viderComptesMaison, besoinsEcranBrut } from '../js/os/comptes-maison.js';

const FACTURES = Object.freeze({ nom: 'Factures', phrase: 'Valider mes factures fournisseurs', batiment: 'banque', cible: '#/achatsfactures/liste' });
const lire = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

beforeEach(() => viderComptesMaison());

test('V1 un besoin bien formé est gardé tel quel (nom, phrase, bâtiment, cible)', () => {
  const r = lireBesoinsMaison([FACTURES]);
  assert.deepEqual(r.besoins, [{ ...FACTURES }]);
  assert.deepEqual(r.avertissements, []);
});

test('V2 deux besoins peuvent mener au même module (vues différentes) ; au-delà de 4 besoins valables, seuls les 4 premiers sont gardés', () => {
  const liste = [
    FACTURES,
    { nom: 'À payer', phrase: 'Voir ce qui reste à payer', batiment: 'bureau', cible: '#/achatsfactures/liste' },
    { nom: 'Achats', phrase: 'Payer moins cher mes articles', batiment: 'entrepot', cible: '#/tableauachats/tableau' },
    { nom: 'Chantiers', phrase: 'Suivre mes chantiers', batiment: 'atelier', cible: '#/achatschantiers/liste' },
    { nom: 'Fournisseurs', phrase: 'Mes fournisseurs', batiment: 'maison', cible: '#/achatsfournisseurs/liste' },
  ];
  const r = lireBesoinsMaison(liste);
  assert.deepEqual(r.besoins.map((b) => b.nom), ['Factures', 'À payer', 'Achats', 'Chantiers']);
  assert.equal(r.besoins[0].cible, r.besoins[1].cible);
  assert.equal(r.avertissements.length, 1);
});

test('V3 sans réglage (absent, null), liste vide ou valeur qui n’est pas une liste : aucun besoin (accueil d’avant)', () => {
  for (const brut of [undefined, null, []]) assert.deepEqual(lireBesoinsMaison(brut), { besoins: [], avertissements: [] });
  for (const brut of ['Factures', 3, { nom: 'Factures' }, true]) {
    const r = lireBesoinsMaison(brut);
    assert.deepEqual(r.besoins, []);
    assert.equal(r.avertissements.length, 1);
  }
});

test('V4 une entrée mal formée est ignorée, les autres restent', () => {
  const r = lireBesoinsMaison([null, 'Factures', ['x'], { phrase: 'sans nom', cible: '#/crm/accueil' }, { nom: '   ', cible: '#/crm/accueil' }, { nom: 'Sans cible' }, FACTURES]);
  assert.deepEqual(r.besoins.map((b) => b.nom), ['Factures']);
  assert.equal(r.avertissements.length, 6);
});

test('V5 cible : seulement une route interne « #/… » ; javascript:, http, //, espaces, ? et caractères spéciaux sont refusés', () => {
  for (const ok of ['#/achatsfactures/liste', '#/crm/accueil', '#/tableauachats/tableau', '#/devis']) assert.ok(cibleValide(ok), ok);
  const refus = ['javascript:alert(1)', 'JavaScript:alert(1)', '#/javascript:alert(1)', 'http://exemple.test', 'https://exemple.test/#/crm', '//exemple.test', '#//exemple.test',
    '/crm/accueil', 'crm/accueil', '#crm/accueil', '#/', '#/crm/ accueil', '#/crm/accueil?x=1', '#/crm/<b>', '#/crm/../reglages', '#/crm//accueil', ` #/crm`, '#/crm\n', 42, null, undefined, {}, `#/${'a'.repeat(250)}`];
  for (const non of refus) assert.ok(!cibleValide(non), String(non));
  const r = lireBesoinsMaison([{ ...FACTURES, cible: 'javascript:alert(1)' }, { ...FACTURES, cible: 'https://exemple.test' }]);
  assert.deepEqual(r.besoins, []);
});

test('V6 bâtiment absent ou inconnu : le bureau ; chaque bâtiment du catalogue se dessine sans erreur et tient dans sa parcelle (même empreinte, toit sous la hauteur maximale)', () => {
  assert.equal(lireBesoinsMaison([{ ...FACTURES, batiment: undefined }]).besoins[0].batiment, 'bureau');
  assert.equal(lireBesoinsMaison([{ ...FACTURES, batiment: 'chateau' }]).besoins[0].batiment, 'bureau');
  for (const ancien of ['bureau', 'banque', 'entrepot', 'atelier', 'maison']) assert.ok(BATIMENTS.includes(ancien), ancien); // les identifiants de la PR 715 restent valables
  for (const nouveau of ['marche', 'poste', 'phare', 'grue', 'radio', 'beffroi', 'clients', 'garage']) assert.ok(BATIMENTS.includes(nouveau), nouveau);
  const demiParcelle = DEMI_PARCELLE * T * 2; // demi-largeur d'une parcelle à l'écran
  for (const b of BATIMENTS) {
    assert.match(b, /^[a-z][a-z-]*$/);
    assert.ok(CATALOGUE[b].nom && CATALOGUE[b].besoin && CATALOGUE[b].accessoires, b);
    const f = dessinBatiment(b);
    assert.ok(f.length > 5, b);
    for (const x of f) {
      const pts = x.poly || x.ligne || (x.cercle ? [[x.cercle[0] - x.cercle[2], x.cercle[1]], [x.cercle[0] + x.cercle[2], x.cercle[1]]] : [[x.ellipse[0] - x.ellipse[2], x.ellipse[1]], [x.ellipse[0] + x.ellipse[2], x.ellipse[1]]]);
      for (const [px, py] of pts) {
        assert.ok(Number.isFinite(px) && Number.isFinite(py), b);
        assert.ok(px > BOITE_BATIMENT.gauche && px < BOITE_BATIMENT.droite && py > BOITE_BATIMENT.haut && py < BOITE_BATIMENT.bas, `${b} : ${px}, ${py}`);
        assert.ok(Math.abs(px) < demiParcelle, `${b} déborde de sa parcelle`);
      }
    }
  }
  assert.deepEqual(dessinBatiment('inconnu'), dessinBatiment('bureau'));
  assert.deepEqual(dessinBatiment('toString'), dessinBatiment('bureau')); // jamais une propriété héritée
  // règle des faces : gauche = 86 % de la lumière du dessus, droite = 70 %
  assert.deepEqual(teintes('#C8A064'), { dessus: '#C8A064', gauche: '#AC8A56', droite: '#8C7046' });
});

test('V7 textes : espaces resserrés, nom et phrase coupés à une longueur raisonnable, phrase facultative ; la phrase tient en deux lignes au plus', () => {
  const [b] = lireBesoinsMaison([{ nom: `  ${'N'.repeat(80)}  `, phrase: `  ${'mot '.repeat(60)}`, cible: '#/crm/accueil' }]).besoins;
  assert.equal(b.nom.length, NOM_MAX);
  assert.ok(b.nom.endsWith('…'));
  assert.ok(b.phrase.length <= PHRASE_MAX);
  assert.equal(lireBesoinsMaison([{ nom: 'Factures', phrase: 12, cible: '#/crm/accueil' }]).besoins[0].phrase, '');
  assert.deepEqual(couperEnLignes('Valider mes factures fournisseurs', 24, 2), ['Valider mes factures', 'fournisseurs']);
  const longue = couperEnLignes('Valider toutes mes factures fournisseurs avant la fin du mois prochain', 24, 2);
  assert.equal(longue.length, 2);
  assert.ok(longue.every((l) => l.length <= 24));
  assert.ok(longue[1].endsWith('…'));
});

test('V8 plan serré : la vue entoure le losange du terrain, les toits et les étiquettes, sans grand vide ; chaque bâtiment garde la même taille quel que soit le nombre de besoins', () => {
  const coins = terrainCoins();
  for (const n of [1, 2, 3, 4]) {
    const { places, vue } = planVillage(n);
    assert.equal(places.length, n);
    for (const [x, y] of coins) assert.ok(x >= vue.x && x <= vue.x + vue.largeur && y >= vue.y && y <= vue.y + vue.hauteur);
    for (const p of places) {
      assert.ok(p.y + BOITE_BATIMENT.haut >= vue.y && p.y + ETIQUETTE_Y + ETIQUETTE_HAUTEUR_MAX <= vue.y + vue.hauteur);
    }
    // aucun grand vide : à gauche et à droite, le losange touche presque le bord de la vue
    const xs = coins.map((c) => c[0]);
    assert.ok(vue.largeur - (Math.max(...xs) - Math.min(...xs)) <= 20, `largeur ${n}`);
    // en hauteur : le toit le plus haut et le bas du terrain (ou de l'étiquette la plus basse) touchent presque la vue
    const haut = Math.min(coins[0][1], ...places.map((p) => p.y + BOITE_BATIMENT.haut));
    assert.ok(haut - vue.y <= 10, `haut ${n}`);
  }
  // même taille : un bâtiment est un quart du terrain (sa boîte fait moins d'un tiers de la largeur du losange), quel que soit n
  const largeurTerrain = coins[1][0] - coins[3][0];
  assert.ok((BOITE_BATIMENT.droite - BOITE_BATIMENT.gauche) / largeurTerrain < 0.34);
  assert.deepEqual(planVillage(1).vue, planVillage(4).vue);
});

test('V9 le champ `besoins` de la fiche `ecran` est rangé à la connexion (copie) et oublié à la déconnexion', () => {
  const fiche = { personnes: [], comptes_jerome_seul: [], besoins: [{ ...FACTURES }] };
  remplirComptesMaison(fiche);
  const lu = besoinsEcranBrut();
  assert.deepEqual(lu, [{ ...FACTURES }]);
  lu[0].nom = 'changé';
  assert.equal(besoinsEcranBrut()[0].nom, 'Factures'); // copie : rien ne remonte
  fiche.besoins[0].nom = 'changé aussi';
  assert.equal(besoinsEcranBrut()[0].nom, 'Factures');
  viderComptesMaison();
  assert.equal(besoinsEcranBrut(), undefined);
  remplirComptesMaison({ personnes: [] });
  assert.equal(besoinsEcranBrut(), undefined);
});

test('V10 sûreté : l’écran du village pose les textes par textContent, jamais innerHTML ; main.js ne montre le village qu’avec des besoins, hors portail', () => {
  const ecran = lire('js/os/village-ecran.js').replace(/^\s*\/\/.*$/gm, ''); // sans les commentaires
  assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(ecran));
  assert.match(ecran, /textContent = contenu/);
  assert.match(ecran, /textContent = b\.nom/);
  const main = lire('js/main.js');
  assert.match(main, /portail \? \{ besoins: \[\], avertissements: \[\] \} : lireBesoinsMaison\(besoinsEcranBrut\(\)\)/);
  assert.match(main, /besoinsVillage\.length && segs\.length === 1 && segs\[0\] === ROUTE_VILLAGE/);
});

test('V17 le terrain a toujours 4 parcelles (haut, gauche, droite, bas) ; les besoins les occupent dans cet ordre fixe, les autres reçoivent un décor', () => {
  for (const n of [1, 2, 3, 4]) {
    const { parcelles, places } = planVillage(n);
    assert.equal(parcelles.length, 4);
    assert.deepEqual(parcelles.map((p) => p.nom), ['haut', 'gauche', 'droite', 'bas']);
    assert.deepEqual(parcelles.map((p) => p.occupee), [0, 1, 2, 3].map((i) => i < n));
    assert.deepEqual(places.map((p) => p.nom), ['haut', 'gauche', 'droite', 'bas'].slice(0, n));
    assert.deepEqual(parcelles.filter((p) => !p.occupee).map((p) => p.decor), DECORS.slice(0, 4 - n));
  }
  // le haut est au fond, le bas devant ; gauche et droite de part et d'autre
  const [h, g, d, b] = planVillage(4).parcelles;
  assert.ok(h.y < g.y && g.y === d.y && d.y < b.y && g.x < h.x && h.x < d.x);
  // hors bornes : ramené entre 1 et 4
  assert.equal(planVillage(0).places.length, 1);
  assert.equal(planVillage(9).places.length, BESOINS_MAX);
  assert.equal(BESOINS_MAX, 4);
});

test('V18 quatre besoins valables sont tous gardés ; le cinquième est ignoré avec un avertissement', () => {
  const cinq = ['A', 'B', 'C', 'D', 'E'].map((nom) => ({ nom, phrase: `Besoin ${nom}`, cible: '#/crm/accueil' }));
  assert.equal(lireBesoinsMaison(cinq.slice(0, 4)).besoins.length, 4);
  assert.deepEqual(lireBesoinsMaison(cinq.slice(0, 4)).avertissements, []);
  const r = lireBesoinsMaison(cinq);
  assert.deepEqual(r.besoins.map((b) => b.nom), ['A', 'B', 'C', 'D']);
  assert.equal(r.avertissements.length, 1);
  assert.match(r.avertissements[0], /n° 5 ignoré \(4 au plus\)/);
});

test('V19 décor : même dessin à chaque affichage, chaque forme reste dans le terrain ; lavande, bosquet et potager ont chacun leur dessin', () => {
  const coins = terrainCoins();
  const [haut, droite, bas, gauche] = coins;
  const dansTerrain = ([x, y]) => Math.abs(x) / (droite[0] - haut[0]) + Math.abs(y) / (bas[1] - haut[1]) * 2 <= 1.02;
  const pieds = (f) => (f.poly ? f.poly : f.ligne ? f.ligne : f.cercle ? [[f.cercle[0], f.cercle[1]]] : [[f.ellipse[0], f.ellipse[1]]]);
  for (const n of [1, 2, 3, 4]) {
    for (const p of planVillage(n).parcelles) {
      const d1 = decorParcelle(p);
      assert.deepEqual(d1, decorParcelle(p), `${n} ${p.nom}`); // déterministe
      for (const f of d1.sol) for (const pt of pieds(f)) assert.ok(dansTerrain(pt), `${p.nom} ${p.decor} sol ${pt}`);
      for (const o of d1.objets) assert.ok(dansTerrain(o.formes[0].ellipse), `${p.nom} ${p.decor} pied d'arbre`); // le pied (ombre) de chaque arbre est sur le terrain
    }
  }
  const libres = planVillage(1).parcelles.filter((p) => !p.occupee).map((p) => JSON.stringify(decorParcelle(p)));
  assert.equal(new Set(libres).size, 3);
  assert.ok(formesTerrain().length >= 5); // tranche, herbe, deux sentiers en croix
});

test('V26 compteur : champ facultatif d’une liste fermée (factures_a_valider) ; inconnu = ignoré avec un avertissement ; pastille jamais inventée', () => {
  assert.deepEqual(COMPTEURS, ['factures_a_valider']);
  const r = lireBesoinsMaison([{ ...FACTURES, compteur: 'factures_a_valider' }, { ...FACTURES, nom: 'Autre', compteur: 'tout_le_reste' }]);
  assert.equal(r.besoins[0].compteur, 'factures_a_valider');
  assert.equal('compteur' in r.besoins[1], false);
  assert.equal(r.avertissements.length, 1);
  assert.equal(textePastille('factures_a_valider', 12), '12 à valider');
  assert.equal(textePastille('factures_a_valider', 0), 'Rien à valider');
  for (const n of [null, undefined, -1, 1.5, NaN, '12']) assert.equal(textePastille('factures_a_valider', n), null); // lecture illisible : pas de pastille, jamais « 0 »
  // la lecture réutilise le module Factures (aucune route nouvelle) et s'arrête au bout de 3 s
  const compteurs = lire('js/os/village-compteurs.js');
  assert.match(compteurs, /compterFacturesAValider\(\)/);
  assert.match(compteurs, /DELAI_COMPTEUR = 3000/);
  assert.ok(!/fetch\(/.test(compteurs));
});
