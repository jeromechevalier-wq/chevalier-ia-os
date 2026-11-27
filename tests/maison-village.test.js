// Accueil « village » d'une maison (26/11/2026) : champ facultatif `besoins` de reglages_maison/ecran (js/os/maison-village.js). Sans réseau ni navigateur.
// Parcours dans le navigateur : tests/e2e/maison-village.spec.js (captures dans tests/e2e/captures/maison-village/).
import { test, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lireBesoinsMaison, cibleValide, dessinBatiment, terrainCoins, couperEnLignes, BATIMENTS, BOITE_BATIMENT, BESOINS_MAX, COMPTEURS, textePastille, pastilleBulle, avecDelai, CATALOGUE, T, iso, ETIQUETTE_Y, ETIQUETTE_HAUTEUR_MAX, NOM_MAX, PHRASE_MAX } from '../js/os/maison-village.js';
import {
  CASE, DAMIER_DEPART, TAILLE_GRANDE, COORD_MAX, centreBloc, ecranVersGrille, blocSousPoint, dansDamier, casesDuBloc, clesBesoins, besoinsServis, lireBatiments, batimentValable,
  rangerVillage, occupation, blocLibre, premierBlocLibre, vueVillage, formesDamier, lignesDamier, decorLibre, docDeplacement, docCacher, docRenommer, RE_URL_LIEN,
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
  assert.match(ecran, /export function monterVillage\(conteneur, besoins, \{ aller, console: avecConsole = false, donnees = null \}\)/); // étape 2 : + `donnees` (rangement)
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
  const fichiers = ['js/os/village-damier.js', 'js/os/village-donnees.js', 'js/os/village-glisser.js', 'js/os/village-liste.js', 'js/os/village-reglages.js', 'js/os/village-ecran.js'];
  for (const f of fichiers) {
    const code = lire(f).replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/innerHTML|outerHTML|insertAdjacentHTML|document\.write/.test(code), `${f} : HTML injecté`);
    assert.ok(!/Audio|<audio/.test(code), `${f} : son`);
    if (f !== 'js/os/village-donnees.js') assert.ok(!/firebase-firestore|setDoc|writeBatch|getDocs/.test(code), `${f} : Firestore`);
  }
  assert.ok(!/modules\//.test(lire('js/os/village-damier.js').replace(/^\s*\/\/.*$/gm, '')));
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
