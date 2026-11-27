// Accueil « village » d'une maison (26/11/2026) : champ facultatif `besoins` de reglages_maison/ecran (js/os/maison-village.js). Sans réseau ni navigateur.
// Parcours dans le navigateur : tests/e2e/maison-village.spec.js (captures dans tests/e2e/captures/maison-village/).
import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lireBesoinsMaison, cibleValide, dessinBatiment, terrainCoins, couperEnLignes, BATIMENTS, BOITE_BATIMENT, BESOINS_MAX, COMPTEURS, textePastille, pastilleBulle, avecDelai, CATALOGUE, T, iso, ETIQUETTE_Y, ETIQUETTE_HAUTEUR_MAX, NOM_MAX, PHRASE_MAX } from '../js/os/maison-village.js';
import {
  CASE, DAMIER_DEPART, TAILLE_GRANDE, COORD_MAX, centreBloc, ecranVersGrille, blocSousPoint, dansDamier, casesDuBloc, clesBesoins, besoinsServis, lireBatiments, batimentValable,
  rangerVillage, occupation, blocLibre, premierBlocLibre, vueVillage, formesDamier, lignesDamier, decorLibre, docDeplacement, docCacher, docRenommer, RE_URL_LIEN,
  adresseExterne, docLien, LIENS_MAX,
} from '../js/os/village-damier.js';
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

test('V2 deux besoins peuvent mener au même module (vues différentes) ; 5 besoins valables sont tous gardés ; au-delà de 12, les 12 premiers (un avertissement par besoin en trop)', () => {
  const liste = [
    FACTURES,
    { nom: 'À payer', phrase: 'Voir ce qui reste à payer', batiment: 'bureau', cible: '#/achatsfactures/liste' },
    { nom: 'Achats', phrase: 'Payer moins cher mes articles', batiment: 'entrepot', cible: '#/tableauachats/tableau' },
    { nom: 'Chantiers', phrase: 'Suivre mes chantiers', batiment: 'atelier', cible: '#/achatschantiers/liste' },
    { nom: 'Fournisseurs', phrase: 'Mes fournisseurs', batiment: 'maison', cible: '#/achatsfournisseurs/liste' },
  ];
  const r = lireBesoinsMaison(liste);
  assert.deepEqual(r.besoins.map((b) => b.nom), ['Factures', 'À payer', 'Achats', 'Chantiers', 'Fournisseurs']);
  assert.equal(r.besoins[0].cible, r.besoins[1].cible);
  assert.deepEqual(r.avertissements, []);
  const quinze = Array.from({ length: 15 }, (_, i) => ({ nom: `B${i + 1}`, cible: '#/crm/accueil' }));
  const q = lireBesoinsMaison(quinze);
  assert.deepEqual(q.besoins.map((b) => b.nom), quinze.slice(0, 12).map((b) => b.nom));
  assert.equal(q.avertissements.length, 3);
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

test('V6 bâtiment absent ou inconnu : le bureau ; chaque bâtiment du catalogue se dessine sans erreur et tient dans son bloc de 2 x 2 cases (même empreinte, toit sous la hauteur maximale)', () => {
  assert.equal(lireBesoinsMaison([{ ...FACTURES, batiment: undefined }]).besoins[0].batiment, 'bureau');
  assert.equal(lireBesoinsMaison([{ ...FACTURES, batiment: 'chateau' }]).besoins[0].batiment, 'bureau');
  for (const ancien of ['bureau', 'banque', 'entrepot', 'atelier', 'maison']) assert.ok(BATIMENTS.includes(ancien), ancien); // les identifiants de la PR 715 restent valables
  for (const nouveau of ['marche', 'poste', 'phare', 'grue', 'radio', 'beffroi', 'clients', 'garage']) assert.ok(BATIMENTS.includes(nouveau), nouveau);
  const demiParcelle = CASE * TAILLE_GRANDE * T * 1.8; // demi-largeur d'un bloc 2 x 2 à l'écran (80), étendue à l'ombre et aux accessoires : la borne d'avant (144)
  assert.equal(demiParcelle, 144);
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

test('V8 vue serrée : elle entoure le losange du terrain, le toit d’une maison au fond et l’étiquette de celle de devant, sans grand vide ; une seule vue quel que soit le nombre de maisons', () => {
  const coins = terrainCoins();
  const vue = vueVillage(DAMIER_DEPART);
  for (const [x, y] of coins) assert.ok(x >= vue.x && x <= vue.x + vue.largeur && y >= vue.y && y <= vue.y + vue.hauteur);
  const fond = iso(...centreBloc(0, 0, 2, DAMIER_DEPART));
  const devant = iso(...centreBloc(6, 6, 2, DAMIER_DEPART));
  assert.ok(fond[1] + BOITE_BATIMENT.haut >= vue.y);
  assert.ok(devant[1] + ETIQUETTE_Y + ETIQUETTE_HAUTEUR_MAX <= vue.y + vue.hauteur);
  // aucun grand vide : à gauche et à droite, le losange touche presque le bord de la vue ; en haut, le toit du fond touche presque la vue
  const xs = coins.map((c) => c[0]);
  assert.ok(vue.largeur - (Math.max(...xs) - Math.min(...xs)) <= 20);
  assert.ok(Math.min(coins[0][1], fond[1] + BOITE_BATIMENT.haut) - vue.y <= 10);
  assert.ok(vue.y + vue.hauteur - Math.max(coins[2][1], devant[1] + ETIQUETTE_Y + ETIQUETTE_HAUTEUR_MAX) <= 30);
  // même taille de bâtiment : sa boîte fait moins d'un tiers de la largeur du losange
  const largeurTerrain = coins[1][0] - coins[3][0];
  assert.ok((BOITE_BATIMENT.droite - BOITE_BATIMENT.gauche) / largeurTerrain < 0.34);
  assert.deepEqual(vueVillage(), vueVillage(DAMIER_DEPART)); // la vue ne dépend que du damier, pas du nombre de maisons
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

test('V17 rangement d’office : jusqu’à 4 besoins, cases 1-1, 1-5, 5-1, 5-5 dans cet ordre (le haut au fond, le bas devant) ; BESOINS_MAX = 12 ; 13 besoins : 12 maisons', () => {
  const besoins = (n) => Array.from({ length: n }, (_, i) => ({ nom: `B${i + 1}`, phrase: '', batiment: 'bureau', cible: `#/m${i + 1}/vue` }));
  for (const n of [1, 2, 3, 4]) {
    const { maisons } = rangerVillage({ besoins: besoins(n) });
    assert.deepEqual(maisons.map((m) => `${m.c}-${m.l}`), ['1-1', '1-5', '5-1', '5-5'].slice(0, n));
  }
  const [h, g, d, b] = rangerVillage({ besoins: besoins(4) }).maisons.map((m) => iso(...centreBloc(m.c, m.l, 2)));
  assert.ok(h[1] < g[1] && g[1] === d[1] && d[1] < b[1] && g[0] < h[0] && h[0] < d[0]);
  assert.equal(BESOINS_MAX, 12);
  const treize = lireBesoinsMaison(besoins(13)).besoins;
  assert.equal(rangerVillage({ besoins: treize }).maisons.length, 12);
});

test('V18 douze besoins valables sont tous gardés ; le treizième est ignoré avec un avertissement', () => {
  const treize = Array.from({ length: 13 }, (_, i) => ({ nom: `N${i + 1}`, phrase: `Besoin ${i + 1}`, cible: '#/crm/accueil' }));
  assert.equal(lireBesoinsMaison(treize.slice(0, 12)).besoins.length, 12);
  assert.deepEqual(lireBesoinsMaison(treize.slice(0, 12)).avertissements, []);
  const r = lireBesoinsMaison(treize);
  assert.deepEqual(r.besoins.map((b) => b.nom), treize.slice(0, 12).map((b) => b.nom));
  assert.equal(r.avertissements.length, 1);
  assert.match(r.avertissements[0], /n° 13 ignoré \(12 au plus\)/);
});

test('V19 décor des cases libres : même dessin à chaque appel, chaque pied sur le terrain, jamais sur une case occupée, moins de décor quand il y a plus de maisons', () => {
  const coins = terrainCoins();
  const [haut, droite, bas] = coins;
  const dansTerrain = ([x, y]) => Math.abs(x) / (droite[0] - haut[0]) + Math.abs(y) / (bas[1] - haut[1]) * 2 <= 1.02;
  const vide = decorLibre(new Map());
  assert.deepEqual(vide, decorLibre(new Map())); // déterministe
  assert.ok(vide.length >= 8);
  for (const o of vide) {
    const pied = o.formes[0].ellipse ? [o.formes[0].ellipse[0], o.formes[0].ellipse[1]] : [o.formes[0].cercle[0], o.formes[0].cercle[1]];
    assert.ok(dansTerrain(pied), `pied ${o.case}`);
  }
  let avant = vide.length;
  for (const n of [1, 4, 8, 12]) {
    const besoins = Array.from({ length: n }, (_, i) => ({ nom: `B${i}`, cible: `#/m${i}/v` }));
    const prises = occupation(rangerVillage({ besoins }).maisons);
    const decor = decorLibre(prises);
    for (const o of decor) assert.ok(!prises.has(o.case), `décor sur la case occupée ${o.case}`);
    // de 5 à 9 maisons, places espacées ; à partir de 10, blocs serrés : le décor n'est comparé qu'au terrain vide
    assert.ok(decor.length <= vide.length, `${n} maisons`);
    avant = decor.length;
  }
  assert.ok(avant < vide.length);
  assert.equal(formesDamier().length, 3); // tranche, herbe ; plus de sentiers en croix
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
  // la lecture réutilise le module Factures (aucune route nouvelle) et s'arrête au bout de 20 s (base lente à se réveiller, 26/11/2026)
  const compteurs = lire('js/os/village-compteurs.js');
  assert.match(compteurs, /compterFacturesAValider\(\)/);
  assert.match(compteurs, /DELAI_COMPTEUR = 20000/);
  assert.ok(!/fetch\(/.test(compteurs));
});

test('V28 un compteur qui répond après 5 s (base lente) est gardé ; au-delà de 20 s, ou en erreur : null (pas de pastille, jamais « 0 »)', async () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const lent = (ms, valeur) => () => new Promise((r) => { setTimeout(() => r(valeur), ms); });
    const cinq = avecDelai(lent(5000, 12), 20000);
    mock.timers.tick(5000);
    assert.equal(await cinq, 12);
    const trop = avecDelai(lent(25000, 12), 20000);
    mock.timers.tick(20000);
    assert.equal(await trop, null);
    mock.timers.tick(5000); // la réponse tardive n'y change rien
    await assert.rejects(avecDelai(() => Promise.reject(new Error('panne')), 20000), /panne/); // l'erreur remonte : lireCompteur la change en null
  } finally {
    mock.timers.reset();
  }
  const compteurs = lire('js/os/village-compteurs.js');
  assert.match(compteurs, /avecDelai\(lire, delai\)/);
  assert.match(compteurs, /catch \(e\)[\s\S]*return null;/);
});

test('V29 pendant la lecture, la bulle montre l’indicateur gris « Compte en cours » ; puis la pastille ; illisible : rien', () => {
  assert.deepEqual(pastilleBulle('factures_a_valider', undefined), { attente: true, texte: 'Compte en cours' });
  assert.deepEqual(pastilleBulle('factures_a_valider', 12), { attente: false, texte: '12 à valider', zero: false });
  assert.deepEqual(pastilleBulle('factures_a_valider', 0), { attente: false, texte: 'Rien à valider', zero: true });
  for (const n of [null, -1, 1.5, NaN, '12']) assert.equal(pastilleBulle('factures_a_valider', n), null);
  const ecran = lire('js/os/village-ecran.js');
  assert.match(ecran, /'bulle-attente'/);
  assert.match(lire('css/os.css'), /\.village-pastille-attente \{[^}]*animation/);
});

test('V30 une seule lecture par affichage du village, lancée au montage (jamais au survol ni au focus)', () => {
  const ecran = lire('js/os/village-ecran.js').replace(/^\s*\/\/.*$/gm, '');
  assert.equal((ecran.match(/lireCompteur\(/g) || []).length, 1);
  const montage = ecran.slice(ecran.indexOf('export function monterVillage'));
  assert.match(montage, /lireCompteur\(b\.compteur\)/);
  assert.ok(!/const rendre = \(\) => \{[^}]*lireCompteur/.test(montage)); // le passage téléphone / ordinateur ne relit pas
});

test('V31 aucun title ni <title> SVG sur les bâtiments (pas d’infobulle grise en double) ; l’aria-label reste', () => {
  const ecran = lire('js/os/village-ecran.js').replace(/^\s*\/\/.*$/gm, '').replace(/\/\/.*$/gm, '');
  assert.ok(!/el\('title'|createElement(NS)?\([^)]*'title'|setAttribute\('title'|\.title\s*=/.test(ecran));
  assert.match(ecran, /g\.setAttribute\('aria-label', besoin\.phrase \? `\$\{besoin\.nom\} : \$\{besoin\.phrase\}` : besoin\.nom\)/);
});

// ---------------------------------------------------------------- étape 1 de docs/accueil-village.md (27/11/2026) : roue dentée de l'accueil, Mairie, Console
// Parcours dans le navigateur : tests/e2e/maison-village-mairie.spec.js (captures dans tests/e2e/captures/maison-village-mairie/).

test('1.3 aucun son dans l’accueil village (ni Audio, ni AudioContext, ni <audio>) ; le choix « Animations » reste local (pas de Firestore)', () => {
  for (const f of ['js/os/village-reglages.js', 'js/os/village-ecran.js']) {
    const texte = lire(f);
    assert.ok(!/Audio|<audio/.test(texte), f);
    assert.ok(!/innerHTML/.test(texte.replace(/^\s*\/\/.*$/gm, '')), f);
  }
  const reglages = lire('js/os/village-reglages.js');
  assert.match(reglages, /export const CLE_ANIMATIONS = 'accueil-animations';/);
  assert.match(reglages, /\(choixAnimations \?\? lirePreference\(CLE_ANIMATIONS, 'oui'\)\) === 'non'/); // sans stockage (navigation privée), le choix de la visite est respecté
  const code = reglages.replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/firestore|setDoc|updateDoc/i.test(code));
  assert.ok(!/title/.test(code.replace(/titre/g, '')), 'pas d’attribut title sur la roue');
});

test('1.4 la Mairie des réglages et la Console : dessins hors catalogue, dans la boîte d’un bâtiment, différents de la Maison commune', async () => {
  const { BATIMENTS_FIXES, dessinBatimentFixe } = await import('../js/os/village-batiments.js');
  assert.deepEqual(Object.keys(BATIMENTS_FIXES), ['mairie-reglages', 'console']);
  for (const id of Object.keys(BATIMENTS_FIXES)) {
    assert.ok(!BATIMENTS.includes(id), `${id} ne doit pas être un bâtiment de besoin`);
    assert.ok(BATIMENTS_FIXES[id].nom && BATIMENTS_FIXES[id].phrase && BATIMENTS_FIXES[id].accessoires, id);
    const f = dessinBatimentFixe(id);
    assert.ok(f.length > 5, id);
    for (const x of f) {
      const pts = x.poly || x.ligne || (x.cercle ? [[x.cercle[0] - x.cercle[2], x.cercle[1]], [x.cercle[0] + x.cercle[2], x.cercle[1]]] : [[x.ellipse[0] - x.ellipse[2], x.ellipse[1]], [x.ellipse[0] + x.ellipse[2], x.ellipse[1]]]);
      for (const [px, py] of pts) {
        assert.ok(Number.isFinite(px) && Number.isFinite(py), id);
        assert.ok(px > BOITE_BATIMENT.gauche && px < BOITE_BATIMENT.droite && py > BOITE_BATIMENT.haut && py < BOITE_BATIMENT.bas, `${id} : ${px}, ${py}`);
      }
    }
  }
  assert.notEqual(JSON.stringify(dessinBatimentFixe('mairie-reglages')), JSON.stringify(dessinBatiment('mairie')));
  assert.notEqual(JSON.stringify(dessinBatimentFixe('console')), JSON.stringify(dessinBatiment('radio')));
  assert.deepEqual(dessinBatimentFixe('inconnu'), []);
  assert.deepEqual(dessinBatimentFixe('toString'), []); // jamais une propriété héritée
  assert.deepEqual(dessinBatimentFixe('mairie'), []); // la Maison commune n'est pas un bâtiment fixe
});

test('1.4 2.13 les îlots Mairie et Console ne sont pas des bâtiments de besoin ; la Console suit le même contrôle que le menu', () => {
  const ecran = lire('js/os/village-ecran.js');
  assert.match(ecran, /export function monterVillage\(conteneur, besoins, \{ aller, console: avecConsole = false, donnees = null, or = null, petites = null \}\)/); // étape 2 : + `donnees` (rangement) ; 6a : + `or` (compteur d'or) ; 3c : + `petites`
  assert.match(ecran, /const enfants = \[defile, bulle\.element, \.\.\.fixes, /); // étape 2 : le dessin est dans `defile` (seul à défiler sur téléphone)
  const ilot = ecran.slice(ecran.indexOf('function ilot('), ecran.indexOf('export function monterVillage'));
  assert.ok(!/'batiment'|'etiquette'|'batiment-nom'|data-parcelle|dataset\.parcelle|data-maison|dataset\.maison/.test(ilot));
  const main = lire('js/main.js');
  assert.match(main, /console: MODULES\.some\(\(m\) => m\.id === 'console'\)/);
  assert.match(main, /retourVillage: besoinsVillage\.length \? ROUTE_VILLAGE : null/);
  assert.match(lire('js/os/reglages.js'), /c\.retourVillage \? h\('a', \{[^}]*dataset: \{ action: 'retour-village' \}/);
});

// ---------------------------------------------------------------- étape 2 de docs/accueil-village.md (27/11/2026) : village rangé par chaque utilisateur (damier 8 x 8)
// Parcours dans le navigateur : tests/e2e/maison-village-damier.spec.js (captures dans tests/e2e/captures/maison-village-damier/).
const besoinsN = (n) => Array.from({ length: n }, (_, i) => ({ nom: `Besoin ${i + 1}`, phrase: '', batiment: 'bureau', cible: `#/module${i + 1}/vue` }));
const HOTE_ESSAI = ['exemple', 'test'].join('.');

test('2.1 rangement d’office avec 1, 4, 5, 8 et 12 besoins : autant de maisons, aucune case partagée, toutes dans le damier', () => {
  for (const n of [1, 4, 5, 8, 12]) {
    const { maisons, cachees, sansPlace } = rangerVillage({ besoins: besoinsN(n) });
    assert.equal(maisons.length, n, `${n}`);
    assert.deepEqual([cachees.length, sansPlace.length], [0, 0]);
    const cases = maisons.flatMap((m) => casesDuBloc(m.c, m.l, m.taille));
    assert.equal(new Set(cases).size, cases.length, `${n} : case partagée`);
    for (const m of maisons) assert.ok(dansDamier(m.c, m.l, m.taille, DAMIER_DEPART), `${n} : ${m.c}-${m.l}`);
    assert.ok(maisons.every((m) => m.enregistree === false && m.taille === TAILLE_GRANDE));
  }
  assert.deepEqual(rangerVillage({ besoins: besoinsN(4) }).maisons.map((m) => `${m.c}-${m.l}`), ['1-1', '1-5', '5-1', '5-5']);
  assert.deepEqual(DAMIER_DEPART, { colonnes: 8, lignes: 8 });
  assert.equal(COORD_MAX, 23);
});

test('2.2 une grande maison occupe 2 x 2 cases ; géométrie du damier (centre d’un bloc, passage écran → grille)', () => {
  assert.deepEqual(casesDuBloc(1, 1, 2), ['1-1', '1-2', '2-1', '2-2']);
  const prises = occupation(rangerVillage({ besoins: besoinsN(3) }).maisons);
  assert.equal(prises.size, 12);
  assert.deepEqual(centreBloc(1, 1, 2, DAMIER_DEPART), [-5, -5]);
  assert.deepEqual(centreBloc(5, 5, 2, DAMIER_DEPART), [5, 5]);
  assert.equal(CASE * DAMIER_DEPART.colonnes, 20); // le terrain garde sa taille (20 x 20 unités)
  for (const [gx, gy] of [[-5, -5], [3.75, -1.25], [0, 0], [7.5, 2.5]]) {
    const [x, y] = ecranVersGrille(...iso(gx, gy));
    assert.ok(Math.abs(x - gx) < 1e-9 && Math.abs(y - gy) < 1e-9);
  }
  assert.deepEqual(blocSousPoint(-5, -5, 2, DAMIER_DEPART), { c: 1, l: 1 });
  assert.deepEqual(blocSousPoint(-4.2, -5.8, 2, DAMIER_DEPART), { c: 1, l: 1 });
  assert.deepEqual(blocSousPoint(20, 0, 2, DAMIER_DEPART), { c: 11, l: 3 }); // hors du damier : rendu tel quel
  assert.equal(dansDamier(7, 0, 2, DAMIER_DEPART), false);
  assert.equal(dansDamier(6, 6, 2, DAMIER_DEPART), true);
  assert.equal(blocLibre(prises, 1, 1, 2, DAMIER_DEPART), false);
  assert.equal(blocLibre(prises, 3, 3, 2, DAMIER_DEPART), true);
  // vue, terrain et quadrillage : 18 lignes (9 + 9), terrain sans sentiers
  assert.equal(lignesDamier().length, 18);
  const [haut, droite, bas, gauche] = terrainCoins();
  assert.deepEqual(formesDamier()[2].poly, [haut, droite, bas, gauche]);
});

test('2.3 2.5 une place enregistrée est reprise ; un conflit ou une place hors du damier est rangé d’office ; plus de place : sansPlace', () => {
  const besoins = besoinsN(3);
  const cles = clesBesoins(besoins);
  const batiments = new Map([[`b-${cles[0]}`, { sorte: 'besoin', c: 3, l: 3 }], [`b-${cles[1]}`, { sorte: 'besoin', c: 4, l: 4 }], [`b-${cles[2]}`, { sorte: 'besoin', c: 7, l: 7 }]]);
  const { maisons } = rangerVillage({ besoins, batiments });
  assert.deepEqual(maisons.map((m) => [`${m.c}-${m.l}`, m.enregistree]), [['3-3', true], ['1-5', false], ['5-1', false]]);
  // 16 grandes maisons au plus sur le damier de départ : la 17e (au-delà de BESOINS_MAX, cas théorique) n'a pas de place
  const dixSept = rangerVillage({ besoins: besoinsN(17) });
  assert.equal(dixSept.maisons.length, 16);
  assert.equal(dixSept.sansPlace.length, 1);
  assert.equal(premierBlocLibre(occupation(dixSept.maisons), 2, DAMIER_DEPART), null);
});

test('2.7 visible ou non : `cache` de l’utilisateur, sinon `depart: false` du besoin ; les cachées sont rendues pour la roue', () => {
  const besoins = [{ ...FACTURES }, { nom: 'Achats', phrase: '', batiment: 'marche', cible: '#/tableauachats/tableau' }, { nom: 'Chantiers', phrase: '', batiment: 'grue', cible: '#/achatschantiers/liste', depart: false }];
  let r = rangerVillage({ besoins });
  assert.deepEqual(r.maisons.map((m) => m.besoin.nom), ['Factures', 'Achats']);
  assert.deepEqual(r.cachees.map((c) => [c.besoin.nom, c.raison]), [['Chantiers', 'depart']]);
  const batiments = new Map([['b-achatsfactures-liste', { sorte: 'besoin', c: 1, l: 1, cache: true }], ['b-achatschantiers-liste', { sorte: 'besoin', cache: false }]]);
  r = rangerVillage({ besoins, batiments });
  assert.deepEqual(r.maisons.map((m) => m.besoin.nom), ['Achats', 'Chantiers']);
  assert.deepEqual(r.cachees.map((c) => [c.besoin.nom, c.raison]), [['Factures', 'cache']]);
  // lireBesoinsMaison garde `depart: false` et un `id` valable, rien d'autre ; un besoin sans ces champs reste comme avant (V1)
  const lu = lireBesoinsMaison([{ ...FACTURES, depart: false, id: 'factures' }, { ...FACTURES, nom: 'B', depart: 'non', id: 'Mauvais id' }, { ...FACTURES, nom: 'C', id: 'factures' }]);
  assert.deepEqual(lu.besoins[0], { ...FACTURES, depart: false, id: 'factures' });
  assert.deepEqual(lu.besoins[1], { ...FACTURES, nom: 'B' });
  assert.deepEqual(lu.besoins[2], { ...FACTURES, nom: 'C' }); // identifiant en double : ignoré
  assert.equal(lu.avertissements.length, 2);
});

test('2.4 2.8 fabriques d’écriture : déplacer, cacher, renommer gardent les autres champs ; nom vide ou d’origine = champ retiré', () => {
  const [m] = rangerVillage({ besoins: [{ ...FACTURES }], batiments: new Map([['b-achatsfactures-liste', { sorte: 'besoin', c: 3, l: 3, nom: 'Mes factures' }]]) }).maisons;
  assert.equal(m.nom, 'Mes factures');
  assert.deepEqual(docDeplacement(m, 5, 1), { sorte: 'besoin', c: 5, l: 1, nom: 'Mes factures' });
  assert.deepEqual(docCacher(m, true), { sorte: 'besoin', c: 3, l: 3, nom: 'Mes factures', cache: true });
  assert.deepEqual(docRenommer(m, '  Banque   du  mois '), { sorte: 'besoin', c: 3, l: 3, nom: 'Banque du mois' });
  assert.deepEqual(docRenommer(m, ''), { sorte: 'besoin', c: 3, l: 3 });
  assert.deepEqual(docRenommer(m, 'Factures'), { sorte: 'besoin', c: 3, l: 3 });
  assert.equal(docRenommer(m, 'N'.repeat(60)).nom.length, 40);
  for (const d of [docDeplacement(m, 5, 1), docCacher(m, false), docRenommer(m, 'X'), docRenommer(m, '')]) assert.ok(batimentValable(m.id, d), JSON.stringify(d));
});

test('2.9 un besoin dont le module n’est pas allumé n’a pas de maison ; un document orphelin (besoin disparu) est ignoré', () => {
  const besoins = [{ ...FACTURES }, { nom: 'Devis', phrase: '', batiment: 'atelier', cible: '#/devis/liste' }, { nom: 'Réglages', phrase: '', batiment: 'mairie', cible: '#/reglages' }];
  assert.deepEqual(besoinsServis(besoins, ['achatsfactures', 'reglages']).map((b) => b.nom), ['Factures', 'Réglages']);
  assert.deepEqual(besoinsServis(besoins, []), []);
  const r = rangerVillage({ besoins: [{ ...FACTURES }], batiments: new Map([['b-inconnu', { sorte: 'besoin', c: 1, l: 1 }]]) });
  assert.deepEqual(r.maisons.map((m) => `${m.id} ${m.c}-${m.l}`), ['b-achatsfactures-liste 1-1']);
  const main = lire('js/main.js');
  assert.match(main, /besoinsVillage = besoinsServis\(village\.besoins, \[\.\.\.MODULES\.map\(\(m\) => m\.prefixe\), 'reglages'\]\);/);
  assert.match(main, /donnees: creerDonneesVillage\(\{ base: '', uid: session\.compte\.uid \}\)/);
});

test('2.9 clés des besoins : `id` s’il est valable, sinon la cible simplifiée ; « -2 », « -3 » pour les doublons ; toujours un identifiant permis par les règles', () => {
  const cles = clesBesoins([{ cible: '#/achatsfactures/liste' }, { cible: '#/achatsfactures/liste' }, { cible: '#/achatsfactures/liste' }, { id: 'factures', cible: '#/x' }, { id: 'Mauvais', cible: '#/Crm_Vue/a' }, { cible: `#/${'a'.repeat(190)}` }]);
  assert.deepEqual(cles.slice(0, 5), ['achatsfactures-liste', 'achatsfactures-liste-2', 'achatsfactures-liste-3', 'factures', 'crm-vue-a']);
  for (const c of cles) assert.match(`b-${c}`, /^b-[a-z0-9-]{1,60}$/);
});

test('pannes lireBatiments : un document mal formé est ignoré (mêmes contrôles que les règles), les autres restent', () => {
  const docs = [
    { id: 'b-ok', sorte: 'besoin', c: 1, l: 1, modifieLe: { seconds: 1 } },
    { id: 'b-trop', sorte: 'besoin', c: 1, l: 1, couleur: 'rouge' },
    { id: 'b-place', sorte: 'besoin', c: 1 },
    { id: 'b-loin', sorte: 'besoin', c: 24, l: 0 },
    { id: 'l-ok', sorte: 'lien', nom: 'Site', url: `https://${HOTE_ESSAI}/a`, batiment: 'phare', c: 0, l: 0 },
    { id: 'l-http', sorte: 'lien', nom: 'Site', url: `${['http', ''].join(':')}//${HOTE_ESSAI}/a`, batiment: 'phare', c: 0, l: 0 },
    { id: 'p-ok', sorte: 'petite', parent: 'b-ok', nom: 'Petite', cible: '#/achatschantiers/liste/x' },
    { id: 'p-ext', sorte: 'petite', parent: 'b-ok', nom: 'Petite', cible: `https://${HOTE_ESSAI}` },
    { id: 'B-maj', sorte: 'besoin' },
    null,
  ];
  const { parId, avertissements } = lireBatiments(docs);
  assert.deepEqual([...parId.keys()], ['b-ok', 'l-ok', 'p-ok']);
  assert.deepEqual(parId.get('b-ok'), { sorte: 'besoin', c: 1, l: 1 }); // `modifieLe` n'est pas gardé
  assert.equal(avertissements.length, 6);
  // même expression d'adresse que les règles (les « \/ » du code JavaScript sont des « / » dans les règles)
  assert.ok(lire('firestore.rules').includes(`d.url.matches('${RE_URL_LIEN.source.replaceAll('\\/', '/')}')`), 'expression d’adresse identique dans les règles');
});

test('sûreté aucun innerHTML ni son dans les fichiers du village ; village-damier.js n’importe aucun module métier ; seul village-donnees.js parle à Firestore', () => {
  const fichiers = ['js/os/village-damier.js', 'js/os/village-donnees.js', 'js/os/village-glisser.js', 'js/os/village-liste.js', 'js/os/village-reglages.js', 'js/os/village-ecran.js', 'js/os/village-petites.js', 'js/os/village-petites-lecture.js', 'js/os/village-boutique.js']; // 3c : + les petites maisons ; 6b : + la boutique
  for (const f of fichiers) {
    const code = lire(f).replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(code), `${f} : HTML injecté`);
    assert.ok(!/Audio|<audio/.test(code), `${f} : son`);
    if (f !== 'js/os/village-donnees.js') assert.ok(!/firebase-firestore|setDoc|writeBatch|getDocs/.test(code), `${f} : Firestore`);
  }
  assert.ok(!/modules\//.test(lire('js/os/village-damier.js').replace(/^\s*\/\/.*$/gm, '')));
  // 3c : village-petites.js n'a ni module ni Firebase ; village-petites-lecture.js ne charge un module que par import() dynamique, pannes sous MODE_EMULATEURS seulement
  const petites = lire('js/os/village-petites.js').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/modules\/|firebase/i.test(petites));
  const lecture = lire('js/os/village-petites-lecture.js').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/from '[^']*modules\//.test(lecture), 'aucun import statique d’un module');
  assert.match(lecture, /import\('\.\.\/modules\/achatschantiers\/donnees\.js'\)/);
  assert.match(lecture, /if \(!MODE_EMULATEURS\) return false;/);
  for (const f of ['js/os/village-ecran.js', 'js/os/village-glisser.js', 'js/os/village-reglages.js', 'js/os/village-liste.js']) assert.ok(!/modules\//.test(lire(f).replace(/^\s*\/\/.*$/gm, '')), f);
  const donnees = lire('js/os/village-donnees.js');
  assert.match(donnees, /if \(!MODE_EMULATEURS\) return false;/); // pannes simulées : émulateurs seulement
  assert.match(donnees, /modifieLe: serverTimestamp\(\)/);
  assert.match(donnees, /cheminCollection\(base, 'village_utilisateurs'\)/);
  // pas de déplacement au clavier (décision du 27/11/2026) ; le clic attend 280 ms, l'appui long 600 ms
  const gestes = lire('js/os/village-glisser.js');
  assert.match(gestes, /DELAI_CLIC = 280/);
  assert.match(gestes, /DELAI_APPUI_LONG = 600/);
  assert.ok(!/ArrowLeft|ArrowRight|ArrowUp|ArrowDown/.test(gestes));
});

test('I rangement d’office de 5 à 9 maisons : toujours une case libre entre deux maisons ; 10 à 12 : toutes placées', () => {
  for (let n = 5; n <= 12; n++) {
    const besoins = Array.from({ length: n }, (_, i) => ({ nom: `B${i}`, cible: `#/m${i}/v` }));
    const { maisons, sansPlace } = rangerVillage({ besoins });
    assert.equal(maisons.length, n, `${n} maisons`);
    assert.equal(sansPlace.length, 0);
    if (n > 9) continue;
    for (const a of maisons) for (const b of maisons) {
      if (a === b) continue;
      const ecart = Math.max(Math.max(a.c, b.c) - Math.min(a.c, b.c) - TAILLE_GRANDE, Math.max(a.l, b.l) - Math.min(a.l, b.l) - TAILLE_GRANDE);
      assert.ok(ecart >= 1, `${n} maisons : ${a.c}-${a.l} et ${b.c}-${b.l} se touchent`);
    }
  }
});

test('F G D un document mal formé est noté comme ignoré ; un nom se coupe à 40 caractères sans couper un emoji ; une adresse avec " \' < > ` \\ [ ] est refusée', () => {
  const { parId, ignores } = lireBatiments([{ id: 'b-bon', sorte: 'besoin', c: 1, l: 1 }, { id: 'b-mal', sorte: 'besoin', c: 'x' }]);
  assert.deepEqual([...parId.keys()], ['b-bon']);
  assert.deepEqual([...ignores], ['b-mal']);
  const maison = { id: 'b-a', c: 1, l: 1, besoin: { nom: 'A' }, donnees: {} };
  const nom = docRenommer(maison, `${'a'.repeat(37)}😀😀`).nom; // 37 + 2 + 2 unités : le second emoji ne tient plus
  assert.equal(nom, `${'a'.repeat(37)}😀`);
  assert.ok(nom.length <= 40);
  assert.ok(batimentValable('b-a', { sorte: 'besoin', c: 1, l: 1, nom: docRenommer(maison, '😀'.repeat(30)).nom })); // 20 emojis = 40 unités : accepté
  for (const fin of ['a"b', "a'b", '<b>', 'a`b', 'a\\b', 'a[0]']) assert.equal(RE_URL_LIEN.test(`https://exemple.test/${fin}`), false, fin);
  assert.equal(RE_URL_LIEN.test('https://exemple.test/a-b_c.d?e=1&f=(2)*+,;:@$!#x~%20^|{}'), true);
});

// ---------------------------------------------------------------- étape 3b : liens externes (27/11/2026)

test('3.2 adresseExterne : « monsite.fr » reçoit https:// ; http, javascript, data, ftp, identifiants et hôte sans point sont refusés avec un message ; le résultat passe les règles', () => {
  const ok = (saisie, attendu) => { const r = adresseExterne(saisie); assert.equal(r.ok, true, saisie); assert.equal(r.url, attendu, saisie); assert.ok(RE_URL_LIEN.test(r.url), saisie); };
  ok('monsite.fr', 'https://monsite.fr/');
  ok('  https://exemple.test/page?x=1#a  ', 'https://exemple.test/page?x=1#a');
  ok('www.café.fr', 'https://www.xn--caf-dma.fr/');
  ok('monsite.fr:8080/x', 'https://monsite.fr:8080/x');
  ok("https://exemple.test/l'atelier <b>", 'https://exemple.test/l%27atelier%20%3Cb%3E'); // encodés, jamais refusés en silence
  const non = (saisie, message) => { const r = adresseExterne(saisie); assert.equal(r.ok, false, saisie); assert.equal('url' in r, false); assert.match(r.message, message, saisie); };
  non('http://monsite.fr', /doit commencer par https:\/\//);
  non('javascript:alert(1)', /doit commencer par https:\/\//);
  non('JaVaScRiPt:alert(1)', /doit commencer par https:\/\//);
  non('data:text/html,<b>x</b>', /doit commencer par https:\/\//);
  non('ftp://monsite.fr', /doit commencer par https:\/\//);
  non('https://moi:secret@monsite.fr', /ni nom d’utilisateur ni mot de passe/);
  non('https://localhost', /pas valable/);
  non('https://monsite.fr:99999', /pas valable/);
  non('', /Écris l’adresse/);
  non(`https://monsite.fr/${'x'.repeat(300)}`, /300 caractères/);
  assert.equal(adresseExterne(undefined).ok, false);
});

test('3.1 docLien et rangerVillage : un lien est une grande maison rangée après les besoins ; sa place enregistrée est gardée ; sans place libre, au premier bloc libre', () => {
  const d = docLien({ nom: '  Mon   site ', url: 'monsite.fr', batiment: 'inconnu', c: 3, l: 3 });
  assert.deepEqual(d, { sorte: 'lien', nom: 'Mon site', url: 'https://monsite.fr/', batiment: 'bureau', c: 3, l: 3 });
  assert.ok(batimentValable('l-abc', d));
  assert.equal(docLien({ nom: '', url: 'monsite.fr', batiment: 'banque', c: 0, l: 0 }), null);
  assert.equal(docLien({ nom: 'A', url: 'http://monsite.fr', batiment: 'banque', c: 0, l: 0 }), null);
  const batiments = new Map([['l-b', { ...d, c: 1, l: 1 }], ['l-a', { sorte: 'lien', nom: 'Fournisseur', url: 'https://f.test/', batiment: 'entrepot', c: 6, l: 6 }]]);
  const { maisons } = rangerVillage({ besoins: [FACTURES], batiments });
  assert.deepEqual(maisons.map((m) => m.id), ['b-achatsfactures-liste', 'l-a', 'l-b']); // besoins d'abord, puis les liens par identifiant (heure de création)
  const lien = maisons.find((m) => m.id === 'l-b');
  assert.equal(lien.sorte, 'lien');
  assert.equal(lien.url, 'https://monsite.fr/');
  assert.equal(lien.invalide, false);
  assert.deepEqual([lien.c, lien.l, lien.taille, lien.enregistree], [1, 1, TAILLE_GRANDE, true]);
  assert.equal(maisons.find((m) => m.id === 'b-achatsfactures-liste').enregistree, false); // la place d'office (1-1) était prise : premier bloc libre
  assert.equal(new Set(maisons.flatMap((m) => casesDuBloc(m.c, m.l, m.taille))).size, 12); // aucune case partagée
  // le déplacement d'un lien garde tous ses champs
  assert.deepEqual(docDeplacement(lien, 4, 4), { ...d, c: 4, l: 4 });
  assert.equal(LIENS_MAX, 6);
});

test('3.2 un lien dont l’adresse passe les règles mais plus le contrôle est marqué invalide (jamais ouvert) ; un document refusé par les règles est ignoré', () => {
  const batiments = new Map([['l-x', { sorte: 'lien', nom: 'Local', url: 'https://localhost/', batiment: 'banque', c: 0, l: 0 }]]);
  assert.equal(rangerVillage({ besoins: [], batiments }).maisons[0].invalide, true);
  const { parId, ignores } = lireBatiments([{ id: 'l-y', sorte: 'lien', nom: 'Piège', url: 'javascript:alert(1)', batiment: 'banque', c: 0, l: 0 }]);
  assert.equal(parId.size, 0);
  assert.deepEqual([...ignores], ['l-y']);
});

test('3.3 3.4 3.5 3.6 sûreté des liens : nouvel onglet sans lien avec l’appli, adresse par textContent ou setAttribute, image du catalogue seulement, aucun envoi de fichier', () => {
  const ecran = lire('js/os/village-ecran.js').replace(/^\s*\/\/.*$/gm, '');
  assert.match(ecran, /window\.open\(maison\.url, '_blank', 'noopener,noreferrer'\)/);
  assert.match(ecran, /g\.setAttribute\('rel', 'noopener noreferrer'\)/);
  assert.match(ecran, /g\.setAttribute\('target', '_blank'\)/);
  assert.match(ecran, /adresse\.textContent = /);
  assert.ok(!/location\.(href|assign|replace)/.test(ecran));
  const liste = lire('js/os/village-liste.js');
  assert.match(liste, /rel: externe && !externe\.invalide \? 'noopener noreferrer'/);
  const reglages = lire('js/os/village-reglages.js').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/type: 'file'|type="file"|FileReader|showOpenFilePicker/.test(reglages), 'aucun envoi de fichier');
  assert.match(reglages, /BATIMENTS\.map\(\(id\)/); // les vignettes viennent du catalogue, rien d'autre
  assert.match(lire('js/os/village-glisser.js'), /e\.preventDefault\(\); \/\/ la maison d'un lien externe/);
});

test('3a-bis les fonctions du village sont identiques dans firestore.rules et firestore.plateforme.rules', () => {
  const bloc = (f) => {
    const m = lire(f).match(/ {4}function villageCase[\s\S]*?\n {4}function villageBatimentValide\(id\) \{[\s\S]*?\n {4}\}\n {4}function villageSorteJeu[\s\S]*?\n {4}function villageObjetDeplace\(id\) \{[\s\S]*?\n {4}\}\n/);
    assert.ok(m, f);
    return m[0];
  };
  assert.equal(bloc('firestore.plateforme.rules'), bloc('firestore.rules'));
  assert.match(lire('firestore.plateforme.rules'), /match \/clients\/\{client\}\/village_utilisateurs\/\{uid\}\/batiments\/\{id\} \{\n\s+allow read: if connecte\(\) && request\.auth\.uid == uid && roleDe\(client\) in \['editeur', 'lecteur'\];\n\s+allow create: if connecte\(\) && request\.auth\.uid == uid && roleDe\(client\) in \['editeur', 'lecteur'\] && villageBatimentValide\(id\);\n\s+allow update: if connecte\(\) && request\.auth\.uid == uid && roleDe\(client\) in \['editeur', 'lecteur'\]\n\s+&& \(villageSorteJeu\(resource\.data\) \? villageObjetDeplace\(id\) : villageBatimentValide\(id\)\);\n\s+allow delete: if connecte\(\) && request\.auth\.uid == uid && roleDe\(client\) in \['editeur', 'lecteur'\] && !villageSorteJeu\(resource\.data\);\n\s+\}/);
});

// ---------------------------------------------------------------- étape 4 : petites maisons « vue filtrée » (étape 3c, 27/11/2026, js/os/village-petites.js)
// Parcours dans le navigateur : tests/e2e/maison-village-petites.spec.js (captures dans tests/e2e/captures/maison-village-petites/).
const P = await import('../js/os/village-petites.js');
const LC = await import('../js/modules/achatschantiers/logique.js');
const LP = await import('../js/modules/projets/logique.js');
const CHANTIERS_B = { nom: 'Chantiers', phrase: '', batiment: 'grue', cible: '#/achatschantiers/liste' };
const chantier = (id, statut, archive = false, nom = `Chantier ${id}`) => ({ id, nom, code: `CH-${id}`, statut, archive });
const lus = (chantiers) => new Map([['achatschantiers', { etat: 'ok', liste: LC.elementsVillage(chantiers) }]]);
const docP = (parent, cible, nom = 'Petite') => ({ sorte: 'petite', parent, nom, cible });
const ranger4 = ({ besoins = [FACTURES, CHANTIERS_B], batiments = new Map(), elements = new Map(), modules = ['achatschantiers', 'projets'] } = {}) => {
  const { maisons } = rangerVillage({ besoins, batiments });
  return { maisons, ...P.rangerPetites({ maisons, batiments, elements, modules }) };
};
const voisine = (grande, p) => P.casesVoisines(grande.c, grande.l).some(({ c, l }) => c === p.c && l === p.l);

test('4.1 docPetite et rangerPetites : une petite manuelle se pose sur une case voisine libre (1 x 1), dans l’ordre fixe ; le document passe batimentValable ; 12 au plus', () => {
  const d = P.docPetite({ parent: 'b-achatschantiers-liste', nom: '  Atelier   B ', cible: '#/achatschantiers/liste/c2' });
  assert.deepEqual(d, { sorte: 'petite', parent: 'b-achatschantiers-liste', nom: 'Atelier B', cible: '#/achatschantiers/liste/c2' });
  assert.ok(batimentValable('p-abc-1234', d));
  assert.equal(P.docPetite({ parent: 'b-x', nom: 'x', cible: `https://${HOTE_ESSAI}` }), null);
  assert.equal(P.docPetite({ parent: 'b-x', nom: 'x', cible: 'javascript:alert(1)' }), null);
  assert.equal(P.docPetite({ parent: 'l-abc', nom: 'x', cible: '#/achatschantiers/liste/c2' }), null);
  assert.equal(P.docPetite({ parent: 'b-x', nom: '', cible: '#/achatschantiers/liste/c2' }).nom, 'Petite maison');
  // 12 cases voisines, toutes différentes, toutes autour du bloc 2 x 2, aucune dans le bloc
  const v = P.casesVoisines(3, 3);
  assert.equal(new Set(v.map(({ c, l }) => `${c}-${l}`)).size, 12);
  for (const { c, l } of v) assert.ok(c >= 2 && c <= 5 && l >= 2 && l <= 5 && !(c >= 3 && c <= 4 && l >= 3 && l <= 4));
  const batiments = new Map([['p-a', docP('b-achatschantiers-liste', '#/achatschantiers/liste/c2', 'Atelier B')]]);
  const r = ranger4({ batiments, elements: lus([chantier('c2', 'en_preparation')]) });
  const grande = r.maisons.find((m) => m.id === 'b-achatschantiers-liste');
  assert.equal(r.petites.length, 1);
  const [p] = r.petites;
  assert.equal(p.taille, 1);
  assert.equal(p.auto, false);
  assert.equal(p.parent, grande.id);
  const premiere = P.casesVoisines(grande.c, grande.l).find(({ c, l }) => dansDamier(c, l, 1));
  assert.deepEqual([p.c, p.l], [premiere.c, premiere.l]); // la première case voisine libre, dans l'ordre fixe
  // 12 au plus : seules les manuelles réellement rangées comptent
  const douze = new Map(Array.from({ length: 12 }, (_, i) => [`p-${String(i).padStart(2, '0')}`, docP('b-achatschantiers-liste', `#/achatschantiers/liste/c${i}`)]));
  const r12 = ranger4({ batiments: douze, elements: lus(Array.from({ length: 12 }, (_, i) => chantier(`c${i}`, 'termine'))) });
  assert.equal(P.nombreManuelles(r12), 12);
  assert.equal(P.peutAjouterPetite(r12), false);
  assert.equal(P.PETITES_MAX, 12);
  assert.equal(P.peutAjouterPetite(ranger4({ batiments: douze, elements: lus([]) })), true); // éléments disparus : ils ne comptent pas, les documents restent
});

test('4.2 les adresses : chantier → #/achatschantiers/liste/<id>, projet → #/projets/projets/<id> ; un identifiant mal formé est ignoré ; toutes passent cibleValide', () => {
  const ch = LC.elementsVillage([chantier('c1', 'en_cours'), { id: 'mal formé', nom: 'X', statut: 'en_cours' }, { id: 'c9', nom: 'Sans code', code: null, statut: 'suspendu', archive: true }]);
  assert.deepEqual(ch, [
    { id: 'c1', nom: 'Chantier c1', sousTitre: 'CH-c1 · En cours', cible: '#/achatschantiers/liste/c1', automatique: true, archive: false },
    { id: 'c9', nom: 'Sans code', sousTitre: 'Suspendu', cible: '#/achatschantiers/liste/c9', automatique: false, archive: true },
  ]);
  const pr = LP.elementsVillage([{ id: 'pr1', titre: 'Projet essai', statut: 'actif' }, { id: 'pr2', titre: 'Fini', statut: 'termine', archive: true }, { id: '../x', titre: 'X' }]);
  assert.deepEqual(pr.map((e) => [e.cible, e.automatique, e.archive, e.sousTitre]), [['#/projets/projets/pr1', false, false, 'Actif'], ['#/projets/projets/pr2', false, true, 'Terminé']]);
  for (const e of [...ch, ...pr]) assert.ok(cibleValide(e.cible), e.cible);
  assert.deepEqual(LC.chantierSeul([chantier('c1', 'en_cours'), chantier('c2', 'termine', true)], 'c2').map((c) => c.id), ['c2']);
  assert.deepEqual(LC.chantierSeul([chantier('c1', 'en_cours')], 'zz'), []);
  assert.equal(P.moduleDeCible('#/achatschantiers/liste/c1'), 'achatschantiers');
  assert.equal(P.sourcePour({ sorte: 'besoin', besoin: CHANTIERS_B }).un, 'ce chantier');
  assert.equal(P.sourcePour({ sorte: 'besoin', besoin: FACTURES }), null);
  assert.equal(P.sourcePour({ sorte: 'lien', besoin: { nom: 'x' } }), null);
});

test('4.3 la grande maison change de place : ses petites sont recalculées autour de la nouvelle place ; une petite ne bloque jamais une grande', () => {
  const docs = new Map([['p-a', docP('b-achatschantiers-liste', '#/achatschantiers/liste/c2')]]);
  const elements = lus([chantier('c1', 'en_cours'), chantier('c2', 'en_preparation')]);
  const avant = ranger4({ batiments: docs, elements });
  const deplace = new Map(docs).set('b-achatschantiers-liste', { sorte: 'besoin', c: 4, l: 4 });
  const apres = ranger4({ batiments: deplace, elements });
  const grandeAvant = avant.maisons.find((m) => m.id === 'b-achatschantiers-liste');
  const grandeApres = apres.maisons.find((m) => m.id === 'b-achatschantiers-liste');
  assert.notDeepEqual([grandeAvant.c, grandeAvant.l], [grandeApres.c, grandeApres.l]);
  assert.equal(avant.petites.length, 2);
  assert.equal(apres.petites.length, 2);
  for (const p of avant.petites) assert.ok(voisine(grandeAvant, p));
  for (const p of apres.petites) assert.ok(voisine(grandeApres, p));
  // une grande peut toujours aller sur la case d'une petite : la place des grandes ne regarde que les grandes
  const grandes = occupation(apres.maisons);
  for (const p of apres.petites) {
    assert.ok(!grandes.has(`${p.c}-${p.l}`));
    assert.ok(blocLibre(grandes, p.c, p.l, 1));
  }
  // aucune petite ne partage une case avec une grande ni avec une autre petite
  const toutes = occupation([...apres.maisons, ...apres.petites]);
  assert.equal(toutes.size, apres.maisons.length * 4 + apres.petites.length);
});

test('4.4 un chantier en cours a sa petite maison automatique à côté de la maison des chantiers ; 6 au plus ; maison des chantiers cachée : aucune', () => {
  const r = ranger4({ elements: lus([chantier('c1', 'en_cours'), chantier('c2', 'en_preparation')]) });
  assert.deepEqual(r.petites.map((p) => [p.id, p.auto, p.parent, p.cible]), [['a-achatschantiers-c1', true, 'b-achatschantiers-liste', '#/achatschantiers/liste/c1']]);
  assert.equal(r.petites[0].donnees, null); // jamais un document
  assert.ok(voisine(r.maisons.find((m) => m.id === 'b-achatschantiers-liste'), r.petites[0]));
  const huit = ranger4({ elements: lus(Array.from({ length: 8 }, (_, i) => chantier(`c${i}`, 'en_cours'))) });
  assert.equal(huit.petites.length + huit.sansPlace.length, P.AUTO_MAX);
  assert.equal(P.AUTO_MAX, 6);
  const cachee = ranger4({ batiments: new Map([['b-achatschantiers-liste', { sorte: 'besoin', cache: true }]]), elements: lus([chantier('c1', 'en_cours')]) });
  assert.deepEqual(cachee.petites, []);
  // module Chantiers éteint : aucune
  assert.deepEqual(ranger4({ elements: lus([chantier('c1', 'en_cours')]), modules: ['projets'] }).petites, []);
  // projets : jamais d'automatique (P4)
  const projets = ranger4({ besoins: [{ nom: 'Projets', phrase: '', batiment: 'atelier', cible: '#/projets/projets' }], elements: new Map([['projets', { etat: 'ok', liste: LP.elementsVillage([{ id: 'pr1', titre: 'P', statut: 'actif' }]) }]]) });
  assert.deepEqual(projets.petites, []);
});

test('4.5 chantier terminé, suspendu ou archivé : plus d’automatique ; la manuelle reste (archivé compris) ; pas de doublon manuelle/automatique', () => {
  for (const c of [chantier('c1', 'termine'), chantier('c1', 'suspendu'), chantier('c1', 'en_preparation'), chantier('c1', 'en_cours', true)]) {
    assert.deepEqual(ranger4({ elements: lus([c]) }).petites, [], JSON.stringify(c));
    const r = ranger4({ batiments: new Map([['p-a', docP('b-achatschantiers-liste', '#/achatschantiers/liste/c1')]]), elements: lus([c]) });
    assert.deepEqual(r.petites.map((p) => [p.id, p.auto]), [['p-a', false]]);
  }
  // en cours avec une manuelle : la manuelle seule
  const r = ranger4({ batiments: new Map([['p-a', docP('b-achatschantiers-liste', '#/achatschantiers/liste/c1')]]), elements: lus([chantier('c1', 'en_cours')]) });
  assert.deepEqual(r.petites.map((p) => p.id), ['p-a']);
});

test('4.6 élément absent d’une lecture réussie : la manuelle n’est pas montrée ; lecture en panne : aucune automatique, toutes les manuelles ; lecture en cours : rien', () => {
  const docs = new Map([['p-a', docP('b-achatschantiers-liste', '#/achatschantiers/liste/c9')], ['p-b', docP('b-achatschantiers-liste', '#/achatschantiers/liste/c2')]]);
  const ok = ranger4({ batiments: docs, elements: lus([chantier('c1', 'en_cours'), chantier('c2', 'termine')]) });
  assert.deepEqual(ok.petites.map((p) => p.id).sort(), ['a-achatschantiers-c1', 'p-b']);
  const panne = ranger4({ batiments: docs, elements: new Map([['achatschantiers', { etat: 'erreur' }]]) });
  assert.deepEqual(panne.petites.map((p) => p.id), ['p-a', 'p-b']);
  assert.ok(panne.petites.every((p) => !p.auto));
  assert.deepEqual(ranger4({ batiments: docs }).petites, []); // lecture en cours
  // une manuelle dont la grande est cachée n'est pas montrée et ne compte pas
  const cachee = ranger4({ batiments: new Map([...docs, ['b-achatschantiers-liste', { sorte: 'besoin', cache: true }]]), elements: new Map([['achatschantiers', { etat: 'erreur' }]]) });
  assert.equal(P.nombreManuelles(cachee), 0);
});

// ---- étape 6b : objets et damier (boutique, 27/11/2026 : js/os/village-damier.js, js/os/village-jeu-regles.js, js/os/village-petites.js)
// Parcours dans le navigateur : tests/e2e/village-or-boutique.spec.js (captures dans tests/e2e/captures/village-or-boutique/).
const D6 = await import('../js/os/village-damier.js');
const RJ = await import('../js/os/village-jeu-regles.js');
const date = { toMillis: () => 1 };

test('6.6f lireBatiments garde un objet acheté bien formé (avec ou sans dates) ; ignore un identifiant x-1, un modèle inconnu, un champ en trop, une place absente, c 24', () => {
  const bons = [
    { id: 'o-abc123', sorte: 'decoration', modele: 'arbre', c: 2, l: 3, acheteLe: date, depuis: date, modifieLe: date },
    { id: 'o-def456', sorte: 'decoration', modele: 'banc', c: 0, l: 0 },
    { id: 'o-ghi789', sorte: 'champ', c: 4, l: 4, depuis: new Date(0) },
  ];
  const mauvais = [
    { id: 'x-1', sorte: 'decoration', modele: 'arbre', c: 1, l: 1 },
    { id: 'o-m1', sorte: 'decoration', modele: 'statue', c: 1, l: 1 },
    { id: 'o-m2', sorte: 'decoration', modele: 'arbre', c: 1, l: 1, prix: 20 },
    { id: 'o-m3', sorte: 'decoration', modele: 'arbre' },
    { id: 'o-m4', sorte: 'decoration', modele: 'arbre', c: 24, l: 0 },
    { id: 'o-m5', sorte: 'champ', modele: 'arbre', c: 1, l: 1 },
    { id: 'o-m6', sorte: 'decoration', modele: 'arbre', c: 1, l: 1, depuis: 'hier' },
  ];
  const { parId, ignores } = lireBatiments([...bons, ...mauvais]);
  assert.deepEqual([...parId.keys()], ['o-abc123', 'o-def456', 'o-ghi789']);
  assert.equal(parId.get('o-abc123').modifieLe, undefined);
  assert.deepEqual([...ignores].sort(), mauvais.map((d) => d.id).sort());
});

test('6.6g rangerVillage : objets à leur place ; un objet sur une maison enregistrée est montré au premier bloc libre (deplaceAffiche) ; maisons sans objet ; un objet enregistré passe avant une maison d’office', () => {
  const batiments = new Map([
    ['b-achatsfactures-liste', { sorte: 'besoin', c: 3, l: 3 }],
    ['o-a', { sorte: 'decoration', modele: 'arbre', c: 7, l: 7 }],
    ['o-b', { sorte: 'decoration', modele: 'banc', c: 4, l: 4 }], // sur la maison
  ]);
  const r = rangerVillage({ besoins: [FACTURES], batiments });
  assert.deepEqual(r.maisons.map((m) => m.id), ['b-achatsfactures-liste']);
  assert.deepEqual(r.objets.map((o) => [o.id, o.c, o.l, o.enregistree, o.deplaceAffiche, o.taille]), [['o-a', 7, 7, true, false, 1], ['o-b', 0, 0, false, true, 1]]);
  assert.deepEqual(r.objetsSansPlace, []);
  // un objet enregistré sur la place d'office de la première maison (1, 1) : la maison va ailleurs, l'objet reste
  const office = rangerVillage({ besoins: [FACTURES], batiments: new Map([['o-a', { sorte: 'decoration', modele: 'arbre', c: 1, l: 1 }]]) });
  assert.deepEqual(office.objets.map((o) => [o.c, o.l, o.enregistree]), [[1, 1, true]]);
  assert.ok(!casesDuBloc(office.maisons[0].c, office.maisons[0].l, 2).includes('1-1'));
  // hors du damier montré : au premier bloc libre, jamais écrit
  const hors = rangerVillage({ besoins: [], batiments: new Map([['o-z', { sorte: 'decoration', modele: 'arbre', c: 20, l: 20 }]]) });
  assert.equal(hors.objets[0].deplaceAffiche, true);
  assert.ok(dansDamier(hors.objets[0].c, hors.objets[0].l, 1, DAMIER_DEPART));
});

test('6.4g damierPourPlaces : vide 8 x 8 ; maison à c 9 : 12 x 12 ; objet 1 x 1 à c 9 : 10 x 10 ; 24 au plus', () => {
  assert.deepEqual(D6.damierPourPlaces(new Map()), { colonnes: 8, lignes: 8 });
  assert.deepEqual(D6.damierPourPlaces(new Map([['b-x', { sorte: 'besoin', c: 9, l: 0 }]])), { colonnes: 12, lignes: 12 });
  assert.deepEqual(D6.damierPourPlaces([{ sorte: 'decoration', c: 9, l: 0 }]), { colonnes: 10, lignes: 10 });
  assert.deepEqual(D6.damierPourPlaces([{ sorte: 'lien', c: 23, l: 23 }]), { colonnes: 24, lignes: 24 });
  assert.deepEqual(D6.damierPourPlaces([{ sorte: 'petite', parent: 'b-x' }, { sorte: 'besoin' }]), { colonnes: 8, lignes: 8 });
});

test('6.6h cases prises : la même règle que le serveur (casesEnregistrees) ; TAILLE_MAISON === TAILLE_GRANDE', () => {
  assert.equal(RJ.TAILLE_MAISON, TAILLE_GRANDE);
  const batiments = new Map([
    ['b-achatsfactures-liste', { sorte: 'besoin', c: 0, l: 0 }],
    ['l-site', { sorte: 'lien', nom: 'Site', url: 'https://exemple.test', batiment: 'bureau', c: 4, l: 0 }],
    ['o-a', { sorte: 'decoration', modele: 'arbre', c: 7, l: 7 }],
    ['p-x', { sorte: 'petite', parent: 'b-achatsfactures-liste', nom: 'x', cible: '#/achatschantiers/liste/c1' }],
  ]);
  const r = rangerVillage({ besoins: [FACTURES], batiments });
  const ecran = [...occupation([...r.maisons, ...r.objets]).keys()].sort();
  assert.deepEqual([...RJ.casesEnregistrees([...batiments.values()])].sort(), ecran);
});

test('6.6j caseLibreDevant : la case libre la plus devant (c + l), puis la plus proche du milieu ; null si tout est pris', () => {
  const vide = new Map();
  assert.deepEqual(D6.caseLibreDevant(vide), { c: 7, l: 7 });
  assert.deepEqual(D6.caseLibreDevant(vide, { colonnes: 10, lignes: 10 }), { c: 9, l: 9 });
  const prises = new Map([['7-7', 'x']]);
  assert.deepEqual(D6.caseLibreDevant(prises), { c: 6, l: 7 });
  const pleines = new Map();
  for (let c = 0; c < 8; c++) for (let l = 0; l < 8; l++) pleines.set(`${c}-${l}`, 'x');
  assert.equal(D6.caseLibreDevant(pleines), null);
  pleines.delete('0-0');
  assert.deepEqual(D6.caseLibreDevant(pleines), { c: 0, l: 0 });
});

test('6.6i une petite maison ne se pose jamais sur une décoration (rangerPetites reçoit les objets)', () => {
  const besoins = [FACTURES, CHANTIERS_B];
  const sans = ranger4({ besoins, batiments: new Map([['p-a', docP('b-achatschantiers-liste', '#/achatschantiers/liste/c1')]]), elements: lus([chantier('c1', 'en_cours')]) });
  const premiere = sans.petites[0];
  assert.ok(premiere);
  const batiments = new Map([['p-a', docP('b-achatschantiers-liste', '#/achatschantiers/liste/c1')], ['o-a', { sorte: 'decoration', modele: 'arbre', c: premiere.c, l: premiere.l }]]);
  const rv = rangerVillage({ besoins, batiments });
  assert.deepEqual(rv.objets.map((o) => `${o.c}-${o.l}`), [`${premiere.c}-${premiere.l}`]);
  const r = P.rangerPetites({ maisons: rv.maisons, batiments, elements: lus([chantier('c1', 'en_cours')]), modules: ['achatschantiers'], objets: rv.objets });
  assert.ok(r.petites.length >= 1);
  for (const p of r.petites) assert.notEqual(`${p.c}-${p.l}`, `${premiere.c}-${premiere.l}`);
});
