// Accueil « village » d'une maison (26/11/2026) : champ facultatif `besoins` de reglages_maison/ecran (js/os/maison-village.js). Sans réseau ni navigateur.
// Parcours dans le navigateur : tests/e2e/maison-village.spec.js (captures dans tests/e2e/captures/maison-village/).
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { lireBesoinsMaison, cibleValide, planVillage, dessinBatiment, couperEnLignes, BATIMENTS, BOITE_BATIMENT, NOM_MAX, PHRASE_MAX } from '../js/os/maison-village.js';
import { remplirComptesMaison, viderComptesMaison, besoinsEcranBrut } from '../js/os/comptes-maison.js';

const FACTURES = Object.freeze({ nom: 'Factures', phrase: 'Valider mes factures fournisseurs', batiment: 'banque', cible: '#/achatsfactures/liste' });
const lire = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

beforeEach(() => viderComptesMaison());

test('V1 un besoin bien formé est gardé tel quel (nom, phrase, bâtiment, cible)', () => {
  const r = lireBesoinsMaison([FACTURES]);
  assert.deepEqual(r.besoins, [{ ...FACTURES }]);
  assert.deepEqual(r.avertissements, []);
});

test('V2 deux besoins peuvent mener au même module (vues différentes) ; au-delà de 3 besoins valables, seuls les 3 premiers sont gardés', () => {
  const liste = [
    FACTURES,
    { nom: 'À payer', phrase: 'Voir ce qui reste à payer', batiment: 'bureau', cible: '#/achatsfactures/liste' },
    { nom: 'Achats', phrase: 'Payer moins cher mes articles', batiment: 'entrepot', cible: '#/tableauachats/tableau' },
    { nom: 'Chantiers', phrase: 'Suivre mes chantiers', batiment: 'atelier', cible: '#/achatschantiers/liste' },
  ];
  const r = lireBesoinsMaison(liste);
  assert.deepEqual(r.besoins.map((b) => b.nom), ['Factures', 'À payer', 'Achats']);
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

test('V6 bâtiment absent ou inconnu : le bureau ; chaque dessin connu reste dans la boîte prévue autour de son centre', () => {
  assert.equal(lireBesoinsMaison([{ ...FACTURES, batiment: undefined }]).besoins[0].batiment, 'bureau');
  assert.equal(lireBesoinsMaison([{ ...FACTURES, batiment: 'chateau' }]).besoins[0].batiment, 'bureau');
  for (const b of BATIMENTS) {
    const f = dessinBatiment(b);
    assert.ok(f.length > 5, b);
    for (const x of f) {
      const pts = x.poly || [[x.cercle[0], x.cercle[1]]];
      for (const [px, py] of pts) {
        assert.ok(Number.isFinite(px) && Number.isFinite(py), b);
        assert.ok(px > BOITE_BATIMENT.gauche && px < BOITE_BATIMENT.droite && py > BOITE_BATIMENT.haut && py < 50, `${b} : ${px}, ${py}`);
      }
    }
  }
  assert.deepEqual(dessinBatiment('inconnu'), dessinBatiment('bureau'));
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

test('V8 plan serré : la vue entoure tous les bâtiments et leurs étiquettes sans grand vide ; en ligne sur ordinateur, en colonne sur téléphone', () => {
  for (const n of [1, 2, 3]) {
    for (const colonne of [false, true]) {
      const { places, vue } = planVillage(n, { colonne });
      assert.equal(places.length, n);
      for (const p of places) {
        assert.ok(p.x + BOITE_BATIMENT.gauche >= vue.x && p.x + BOITE_BATIMENT.droite <= vue.x + vue.largeur);
        assert.ok(p.y + BOITE_BATIMENT.haut >= vue.y && p.y + BOITE_BATIMENT.bas <= vue.y + vue.hauteur);
      }
      // aucun grand vide : la vue ne dépasse les bâtiments que d'une petite marge
      const surplusX = vue.largeur - (Math.max(...places.map((p) => p.x)) - Math.min(...places.map((p) => p.x)) + BOITE_BATIMENT.droite - BOITE_BATIMENT.gauche);
      const surplusY = vue.hauteur - (Math.max(...places.map((p) => p.y)) - Math.min(...places.map((p) => p.y)) + BOITE_BATIMENT.bas - BOITE_BATIMENT.haut);
      assert.ok(surplusX <= 20 && surplusY <= 20, `${n} ${colonne}`);
    }
  }
  const ligne = planVillage(3).places;
  assert.ok(ligne.every((p) => p.y === ligne[0].y) && ligne[0].x < ligne[2].x); // côte à côte
  const col = planVillage(3, { colonne: true }).places;
  assert.ok(col[0].y < col[1].y && col[1].y < col[2].y); // l'un sous l'autre
  const v3 = planVillage(3, { colonne: true }).vue;
  assert.ok(v3.hauteur > v3.largeur);
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
  assert.match(ecran, /textContent = besoin\.nom/);
  const main = lire('js/main.js');
  assert.match(main, /portail \? \{ besoins: \[\], avertissements: \[\] \} : lireBesoinsMaison\(besoinsEcranBrut\(\)\)/);
  assert.match(main, /besoinsVillage\.length && segs\.length === 1 && segs\[0\] === ROUTE_VILLAGE/);
});
