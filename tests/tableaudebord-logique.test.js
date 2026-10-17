// Logique pure du module Tableau de bord (js/modules/tableaudebord/logique.js), sans navigateur ni Firebase : critères R2, R3, R5, R6 et R12 du brief.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import * as L from '../js/modules/tableaudebord/logique.js';

const MAINTENANT = Date.parse('2026-10-17T10:00:00Z');
const MIN = L.MINUTE;
const J = L.JOUR;
const ind = (extra = {}) => ({
  id: 'x', tableau: 'technique', famille: 'cles', nom: 'Indicateur', type: 'etat', niveau: 'vert', message: 'Répond', valeur: null, unite: null,
  echeanceMs: null, releveMs: MAINTENANT - 10 * MIN, perimeApresMinutes: 2 * 24 * 60, methode: 'auto', procedure: 'Protocole', ...extra,
});

describe('R12 niveau effectif', () => {
  test('R12 sans échéance ni péremption, le niveau écrit par le script est repris tel quel', () => {
    for (const n of ['vert', 'orange', 'rouge']) assert.equal(L.niveauEffectif(ind({ niveau: n }), MAINTENANT), n);
  });
  test('R2 un indicateur vert dont le relevé est périmé devient gris « Relevé trop ancien »', () => {
    const vieux = ind({ niveau: 'vert', releveMs: MAINTENANT - 3 * J, perimeApresMinutes: 2 * 24 * 60 });
    assert.equal(L.niveauEffectif(vieux, MAINTENANT), 'gris');
    assert.equal(L.LIBELLES.gris, 'Relevé trop ancien');
    assert.equal(L.niveauEffectif(ind({ niveau: 'orange', releveMs: MAINTENANT - 3 * J }), MAINTENANT), 'gris', 'orange périmé : gris aussi');
  });
  test('R2 un indicateur rouge reste rouge même périmé', () => {
    assert.equal(L.niveauEffectif(ind({ niveau: 'rouge', releveMs: MAINTENANT - 30 * J }), MAINTENANT), 'rouge');
  });
  test('R12 la limite de péremption : exactement à la limite = encore valable, une minute de plus = trop ancien', () => {
    const base = { niveau: 'vert', perimeApresMinutes: 60 };
    assert.equal(L.niveauEffectif(ind({ ...base, releveMs: MAINTENANT - 60 * MIN }), MAINTENANT), 'vert');
    assert.equal(L.niveauEffectif(ind({ ...base, releveMs: MAINTENANT - 61 * MIN }), MAINTENANT), 'gris');
  });
  test('R12 releveLe ou perimeApresMinutes absent : jamais « trop ancien »', () => {
    assert.equal(L.niveauEffectif(ind({ releveMs: null }), MAINTENANT), 'vert');
    assert.equal(L.niveauEffectif(ind({ perimeApresMinutes: null, releveMs: MAINTENANT - 900 * J }), MAINTENANT), 'vert');
  });
  test('R3 une échéance dans 12 jours donne « À surveiller » même si le script a écrit « vert »', () => {
    const i = ind({ niveau: 'vert', echeanceMs: MAINTENANT + 12 * J });
    assert.equal(L.niveauEffectif(i, MAINTENANT), 'orange');
    assert.equal(L.LIBELLES.orange, 'À surveiller');
    assert.equal(L.texteEcheance(i.echeanceMs, MAINTENANT), 'Échéance dans 12 jours');
  });
  test('R3 une échéance passée donne « Panne » même si le script a écrit « vert »', () => {
    const i = ind({ niveau: 'vert', echeanceMs: MAINTENANT - 2 * J });
    assert.equal(L.niveauEffectif(i, MAINTENANT), 'rouge');
    assert.equal(L.LIBELLES.rouge, 'Panne');
    assert.equal(L.texteEcheance(i.echeanceMs, MAINTENANT), 'Échéance dépassée depuis 2 jours');
  });
  test('R12 bornes de l\'échéance : 30 jours pile = vert, un peu moins = orange, 0 = orange, un peu passée = rouge', () => {
    assert.equal(L.niveauDeEcheance(MAINTENANT + 30 * J, MAINTENANT), null);
    assert.equal(L.niveauDeEcheance(MAINTENANT + 30 * J - 1, MAINTENANT), 'orange');
    assert.equal(L.niveauDeEcheance(MAINTENANT, MAINTENANT), 'orange');
    assert.equal(L.niveauDeEcheance(MAINTENANT - 1, MAINTENANT), 'rouge');
    assert.equal(L.niveauDeEcheance(null, MAINTENANT), null);
  });
  test('R12 le plus grave l\'emporte : script rouge + échéance lointaine = rouge ; script orange + échéance dépassée = rouge', () => {
    assert.equal(L.niveauEffectif(ind({ niveau: 'rouge', echeanceMs: MAINTENANT + 200 * J }), MAINTENANT), 'rouge');
    assert.equal(L.niveauEffectif(ind({ niveau: 'orange', echeanceMs: MAINTENANT - J }), MAINTENANT), 'rouge');
    assert.equal(L.niveauEffectif(ind({ niveau: 'orange', echeanceMs: MAINTENANT + 200 * J }), MAINTENANT), 'orange');
  });
  test('R12 échéance proche + relevé périmé : orange devient gris (le gris ne masque que ce qui n\'est pas rouge)', () => {
    assert.equal(L.niveauEffectif(ind({ niveau: 'vert', echeanceMs: MAINTENANT + 5 * J, releveMs: MAINTENANT - 9 * J }), MAINTENANT), 'gris');
    assert.equal(L.niveauEffectif(ind({ niveau: 'vert', echeanceMs: MAINTENANT - J, releveMs: MAINTENANT - 9 * J }), MAINTENANT), 'rouge');
  });
  test('R12 une mesure sans niveau n\'a pas de pastille ; l\'échéance s\'applique pourtant à une mesure', () => {
    const mesure = ind({ type: 'mesure', niveau: null, valeur: 42, unite: 'jours' });
    assert.equal(L.niveauEffectif(mesure, MAINTENANT), null);
    assert.equal(L.niveauEffectif({ ...mesure, releveMs: MAINTENANT - 90 * J }, MAINTENANT), null, 'même périmée : pas de pastille');
    assert.equal(L.niveauEffectif({ ...mesure, echeanceMs: MAINTENANT + 3 * J }, MAINTENANT), 'orange');
    assert.equal(L.niveauEffectif({ ...mesure, echeanceMs: MAINTENANT - 3 * J }, MAINTENANT), 'rouge');
  });
  test('R12 un niveau inconnu est traité comme absent (jamais de couleur inventée)', () => {
    assert.equal(L.niveauEffectif(ind({ niveau: 'violet' }), MAINTENANT), null);
  });
});

describe('R5 R12 tri', () => {
  const liste = [
    ind({ id: 'v1', nom: 'Zèbre', niveau: 'vert' }),
    ind({ id: 'r1', nom: 'Beta', niveau: 'rouge' }),
    ind({ id: 'o1', nom: 'Cèdre', niveau: 'orange' }),
    ind({ id: 'g1', nom: 'Delta', niveau: 'vert', releveMs: MAINTENANT - 9 * J }),
    ind({ id: 's1', nom: 'Mesure', type: 'mesure', niveau: null, valeur: 3 }),
    ind({ id: 'r2', nom: 'Alpha', niveau: 'rouge' }),
    ind({ id: 'v2', nom: 'ébène', niveau: 'vert' }),
  ];
  test('R5 rouge, orange, gris, vert, puis sans pastille ; à égalité, ordre alphabétique du nom (accents ignorés)', () => {
    assert.deepEqual(L.trier(liste, MAINTENANT).map((i) => i.id), ['r2', 'r1', 'o1', 'g1', 'v2', 'v1', 's1']);
  });
  test('R12 trier ne modifie pas la liste reçue', () => {
    const avant = liste.map((i) => i.id);
    L.trier(liste, MAINTENANT);
    assert.deepEqual(liste.map((i) => i.id), avant);
  });
  test('R12 compter : un compteur par niveau affiché, plus « sans pastille »', () => {
    assert.deepEqual(L.compter(liste, MAINTENANT), { rouge: 2, orange: 1, gris: 1, vert: 2, sans: 1 });
  });
  test('R6 la liste « à traiter » exclut le vert et le sans pastille, du plus grave au moins grave', () => {
    assert.deepEqual(L.listeATraiter(liste, MAINTENANT).map((i) => i.id), ['r2', 'r1', 'o1', 'g1']);
  });
});

describe('R12 regroupement par famille', () => {
  const liste = [
    ind({ id: 'a', famille: 'sauvegardes', nom: 'Copie base' }),
    ind({ id: 'b', famille: 'cles', nom: 'Clé B', niveau: 'orange' }),
    ind({ id: 'c', famille: 'automatisations', nom: 'Workflows' }),
    ind({ id: 'd', famille: 'cles', nom: 'Clé A', niveau: 'rouge' }),
    ind({ id: 'e', famille: 'zoo', nom: 'Bêtes' }),
    ind({ id: 'f', famille: null, nom: 'Sans famille' }),
  ];
  test('R5 clés d\'abord, puis le reste par ordre alphabétique du titre affiché', () => {
    const g = L.regrouperParFamille(liste, MAINTENANT);
    assert.deepEqual(g.map((x) => x.titre), ['Clés et autorisations', 'Automatisations', 'Autres', 'Sauvegardes', 'Zoo']);
    assert.deepEqual(g[0].indicateurs.map((i) => i.id), ['d', 'b'], 'dans un bloc : rouge avant orange');
  });
  test('R12 les compteurs d\'un bloc viennent de l\'ensemble, même quand un filtre masque des lignes', () => {
    const visibles = L.filtrer(liste, { traiter: true }, MAINTENANT);
    const g = L.regrouperParFamille(visibles, MAINTENANT, liste);
    assert.equal(g.length, 1);
    assert.deepEqual(g[0].compteurs, { rouge: 1, orange: 1, gris: 0, vert: 0, sans: 0 });
    assert.equal(L.regrouperParFamille(liste, MAINTENANT).find((x) => x.famille === 'cles').compteurs.rouge, 1);
  });
  test('R12 nomFamille : nom connu, code avec majuscule, « Autres » sans famille', () => {
    assert.equal(L.nomFamille('cles'), 'Clés et autorisations');
    assert.equal(L.nomFamille('finance'), 'Finance');
    assert.equal(L.nomFamille(null), 'Autres');
  });
});

describe('R5 filtres combinés', () => {
  const liste = [
    ind({ id: 'k1', famille: 'cles', niveau: 'vert' }),
    ind({ id: 'k2', famille: 'cles', niveau: 'rouge' }),
    ind({ id: 's1', famille: 'sauvegardes', niveau: 'vert' }),
    ind({ id: 's2', famille: 'sauvegardes', niveau: 'vert', releveMs: MAINTENANT - 9 * J }),
  ];
  test('R5 « À traiter » masque les verts ; combiné avec une famille, les deux conditions s\'ajoutent', () => {
    assert.deepEqual(L.filtrer(liste, { traiter: true }, MAINTENANT).map((i) => i.id), ['k2', 's2']);
    assert.deepEqual(L.filtrer(liste, { traiter: false, famille: 'sauvegardes' }, MAINTENANT).map((i) => i.id), ['s1', 's2']);
    assert.deepEqual(L.filtrer(liste, { traiter: true, famille: 'sauvegardes' }, MAINTENANT).map((i) => i.id), ['s2']);
    assert.deepEqual(L.filtrer(liste, { traiter: true, famille: 'cles' }, MAINTENANT).map((i) => i.id), ['k2']);
  });
  test('R5 chaque liste ne propose que les valeurs possibles', () => {
    assert.deepEqual(L.famillesPossibles(liste, {}, MAINTENANT).map((f) => f.valeur), ['cles', 'sauvegardes']);
    const seulementCles = liste.filter((i) => i.id !== 's2');
    assert.deepEqual(L.famillesPossibles(seulementCles, { traiter: true }, MAINTENANT).map((f) => f.valeur), ['cles']);
  });
});

describe('R6 phrase d\'état global et compteurs', () => {
  const c = (rouge, orange, gris, vert, sans = 0) => ({ rouge, orange, gris, vert, sans });
  test('R6 « Tout fonctionne » / « Tout marche, quelques points à surveiller » / « Une panne à traiter » / « N pannes à traiter »', () => {
    assert.equal(L.phraseGlobale(c(0, 0, 0, 14)), 'Tout fonctionne');
    assert.equal(L.phraseGlobale(c(0, 1, 0, 13)), 'Tout marche, quelques points à surveiller');
    assert.equal(L.phraseGlobale(c(0, 0, 2, 12)), 'Tout marche, quelques points à surveiller', 'le gris compte comme un point à surveiller');
    assert.equal(L.phraseGlobale(c(1, 3, 0, 10)), 'Une panne à traiter');
    assert.equal(L.phraseGlobale(c(3, 0, 0, 11)), '3 pannes à traiter');
  });
  test('R6 aucun indicateur : pas de phrase (l\'écran montre son état vide)', () => {
    assert.equal(L.phraseGlobale(c(0, 0, 0, 0)), '');
  });
  test('R6 niveau de la phrase : le plus grave présent', () => {
    assert.equal(L.niveauGlobal(c(1, 0, 0, 0)), 'rouge');
    assert.equal(L.niveauGlobal(c(0, 0, 1, 0)), 'orange');
    assert.equal(L.niveauGlobal(c(0, 0, 0, 5)), 'vert');
  });
  test('R6 mots des compteurs (singulier et pluriel)', () => {
    assert.equal(L.libelleCompteur('rouge', 1), '1 panne');
    assert.equal(L.libelleCompteur('rouge', 2), '2 pannes');
    assert.equal(L.libelleCompteur('orange', 3), '3 À surveiller');
    assert.equal(L.libelleCompteur('gris', 1), '1 relevé trop ancien');
    assert.equal(L.libelleCompteur('gris', 2), '2 relevés trop anciens');
    assert.equal(L.libelleCompteur('vert', 4), '4 OK');
  });
});

describe('R7 onglets', () => {
  test('R7 Général et Technique toujours ; Finance et Stocks seulement si un indicateur les porte', () => {
    assert.deepEqual(L.ongletsVisibles([]).map((t) => t.id), ['general', 'technique']);
    assert.deepEqual(L.ongletsVisibles([ind()]).map((t) => t.id), ['general', 'technique']);
    assert.deepEqual(L.ongletsVisibles([ind({ tableau: 'finance' })]).map((t) => t.id), ['general', 'technique', 'finance']);
    assert.deepEqual(L.ongletsVisibles([ind({ tableau: 'stocks' }), ind({ tableau: 'finance' })]).map((t) => t.id), ['general', 'technique', 'finance', 'stocks']);
  });
});

describe('R12 textes « il y a … »', () => {
  test('R12 depuis : à l\'instant, minutes, heures, jours (arrondi vers le bas)', () => {
    assert.equal(L.depuis(MAINTENANT - 20000, MAINTENANT), 'à l’instant');
    assert.equal(L.depuis(MAINTENANT - MIN, MAINTENANT), 'il y a 1 min');
    assert.equal(L.depuis(MAINTENANT - 59 * MIN, MAINTENANT), 'il y a 59 min');
    assert.equal(L.depuis(MAINTENANT - 60 * MIN, MAINTENANT), 'il y a 1 h');
    assert.equal(L.depuis(MAINTENANT - 23 * 60 * MIN - 59 * MIN, MAINTENANT), 'il y a 23 h');
    assert.equal(L.depuis(MAINTENANT - 24 * 60 * MIN, MAINTENANT), 'il y a 1 j');
    assert.equal(L.depuis(MAINTENANT - 9 * J, MAINTENANT), 'il y a 9 j');
  });
  test('R12 depuis : date dans le futur (horloge décalée) = à l\'instant ; date inconnue = « date inconnue »', () => {
    assert.equal(L.depuis(MAINTENANT + 5 * MIN, MAINTENANT), 'à l’instant');
    assert.equal(L.depuis(null, MAINTENANT), 'date inconnue');
    assert.equal(L.depuis(undefined, MAINTENANT), 'date inconnue');
  });
  test('R12 texte de l\'échéance : jours restants, moins de 24 h, dépassée', () => {
    assert.equal(L.texteEcheance(null, MAINTENANT), '');
    assert.equal(L.texteEcheance(MAINTENANT + 12 * J, MAINTENANT), 'Échéance dans 12 jours');
    assert.equal(L.texteEcheance(MAINTENANT + 12 * J - 60000, MAINTENANT), 'Échéance dans 12 jours');
    assert.equal(L.texteEcheance(MAINTENANT + 3 * 60 * MIN, MAINTENANT), 'Échéance dans moins de 24 h');
    assert.equal(L.texteEcheance(MAINTENANT - 3 * 60 * MIN, MAINTENANT), 'Échéance dépassée depuis moins de 24 h');
    assert.equal(L.texteEcheance(MAINTENANT - J, MAINTENANT), 'Échéance dépassée depuis 1 jour');
  });
  test('R12 texte d\'une valeur de mesure', () => {
    assert.equal(L.texteValeur(1240, '€'), `${new Intl.NumberFormat('fr-FR').format(1240)} €`);
    assert.equal(L.texteValeur(12, null), '12');
    assert.equal(L.texteValeur(null, 'jours'), '');
  });
});

describe('R12 la logique ne dépend de rien', () => {
  test('R12 logique.js n\'importe rien (ni Firebase, ni navigateur) et ne lit jamais l\'heure elle-même', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('../js/modules/tableaudebord/logique.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
    assert.doesNotMatch(source, /^\s*import\s/m);
    assert.doesNotMatch(source, /Date\.now|new Date|document\.|window\./);
  });
});

describe('identifiant HTML d\'une famille', () => {
  test('une famille venue de la base avec espace, guillemet ou & donne un id valide', () => {
    const id = L.idFamille('clés & jetons "x"');
    assert.match(id, /^td-f-[a-z0-9-]+$/i);
    assert.doesNotMatch(id, /[\s"&']/);
    assert.equal(L.idFamille('cles'), 'td-f-cles');
    assert.equal(L.idFamille(''), 'td-f-autres');
  });
});

describe('saisie et historique des saisies (logique pure)', () => {
  test('S6 seuls les indicateurs manuel et semi se saisissent ; le bouton dit « date » pour un état, « valeur » pour une mesure', () => {
    assert.equal(L.peutSaisir({ methode: 'manuel' }), true);
    assert.equal(L.peutSaisir({ methode: 'semi' }), true);
    for (const m of ['auto', null, undefined, 'autre']) assert.equal(L.peutSaisir({ methode: m }), false, String(m));
    assert.equal(L.peutSaisir(undefined), false);
    assert.equal(L.libelleSaisie({ type: 'etat' }), 'Saisir la date');
    assert.equal(L.libelleSaisie({ type: 'mesure' }), 'Saisir la valeur');
  });
  test('S7 saisiesRecentes : seulement saisie === true, du plus récent au plus ancien, 200 au plus, sans modifier la liste reçue', () => {
    const liste = [
      { id: 'a', saisie: true, releveMs: 1000 }, { id: 'script', saisie: false, releveMs: 9999, saisiPar: 'github:x' }, { id: 'b', saisie: true, releveMs: 3000 },
      { id: 'c', saisie: true, releveMs: 2000 }, { id: 'sans', releveMs: 5000 }, { id: 'inconnue', saisie: true, releveMs: null },
    ];
    const copie = JSON.stringify(liste);
    assert.deepEqual(L.saisiesRecentes(liste).map((s) => s.id), ['b', 'c', 'a', 'inconnue']);
    assert.equal(JSON.stringify(liste), copie);
    const beaucoup = Array.from({ length: 250 }, (_, i) => ({ id: `s${i}`, saisie: true, releveMs: i }));
    const r = L.saisiesRecentes(beaucoup);
    assert.equal(r.length, 200);
    assert.equal(r[0].id, 's249');
    assert.equal(r.at(-1).id, 's50');
    assert.equal(L.MAX_SAISIES_AFFICHEES, 200);
  });
  test('S7 texteAvantApres : dates en jour/mois/année, valeurs avec unité, « avant » inconnu', () => {
    const jour = (s) => Date.parse(`${s}T00:00:00Z`);
    assert.equal(L.texteAvantApres({ avantEcheanceMs: jour('2026-12-01'), apresEcheanceMs: jour('2027-05-01') }), '01/12/2026 → 01/05/2027');
    assert.equal(L.texteAvantApres({ avantEcheanceMs: null, apresEcheanceMs: jour('2027-05-01') }), 'aucune date → 01/05/2027');
    assert.equal(L.texteAvantApres({ avantValeur: 42, apresValeur: 37.5 }, 'bouteilles'), '42 bouteilles → 37,5 bouteilles');
    assert.equal(L.texteAvantApres({ avantValeur: null, apresValeur: 0 }), 'aucune valeur → 0');
  });
  test('S7 dateHeure : « 17/10/2026 à 12:15 » (fuseau de Paris), date inconnue sinon', () => {
    assert.equal(L.dateHeure(Date.parse('2026-10-17T10:15:00Z'), 'Europe/Paris'), '17/10/2026 à 12:15');
    assert.equal(L.dateHeure(null), 'date inconnue');
  });
});
