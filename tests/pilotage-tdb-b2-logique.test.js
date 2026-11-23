// Tableau de bord, partie B2 (écran des filtres) : règles pures de l'écran (mémoire des choix, clé `filtres` de la requête, pastilles, croisement, CSV, format euros4)
// et contrôles statiques (pas de sessionStorage, une seule fonction appelée, oubli à la déconnexion). Sans navigateur ni réseau. Le nom de chaque test commence par B2.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, describe } from 'node:test';
import * as FL from '../js/modules/pilotage/filtres-logique.js';
import * as F from '../js/modules/pilotage/formats.js';

const lire = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
const DEFAUT_PERIODE = { raccourci: '12_mois', du: '2025-11-23', au: '2026-11-23' };
const PERIODE = { id: 'periode', libelle: 'Période', type: 'periode', multiple: false, choix: [], tronquee: false, applique: DEFAUT_PERIODE, defaut: DEFAUT_PERIODE }; // `defaut` = relevé par l'écran à la première lecture
const LIEU = { id: 'lieu', libelle: 'Lieu', type: 'liste', multiple: true, choix: [], valeurs: ['Nord', 'Sud', 'Est'], tronquee: false };
const ETAT = { id: 'etat', libelle: 'État', type: 'liste', multiple: false, choix: [{ valeur: 'ouvert', libelle: 'Ouvert' }, { valeur: 'clos', libelle: 'Clos' }], tronquee: false };
const MONTANT = { id: 'montant', libelle: 'Montant', type: 'intervalle', multiple: false, choix: [], tronquee: false };
const ALERTE = { id: 'alerte', libelle: 'Avec alerte', type: 'oui_non', multiple: false, choix: [], tronquee: false };
const avec = (d, applique) => ({ ...d, applique });

describe('B2.2 la requête n\'envoie `filtres` que s\'il y a un choix', () => {
  test('B2.2a sans choix : ni onglet ni filtres -> undefined ; avec onglet seul -> { onglet } ; la requête d\'avant', () => {
    assert.equal(FL.argumentsDeLecture(null, undefined), undefined);
    assert.equal(FL.argumentsDeLecture(null, {}), undefined);
    assert.deepEqual(FL.argumentsDeLecture('suivi', {}), { onglet: 'suivi' });
  });
  test('B2.2b avec un choix : la clé `filtres` est ajoutée, avec les valeurs de forme requête', () => {
    assert.deepEqual(FL.argumentsDeLecture('suivi', { lieu: ['Nord'] }), { onglet: 'suivi', filtres: { lieu: ['Nord'] } });
    assert.deepEqual(FL.argumentsDeLecture(null, { periode: { raccourci: 'tout' } }), { filtres: { periode: { raccourci: 'tout' } } });
  });
  test('B2.2c l\'écran affiche la valeur APPLIQUÉE : versRequete en rend la forme à envoyer (raccourci gardé, sinon dates)', () => {
    assert.deepEqual(FL.versRequete('periode', PERIODE.applique), { raccourci: '12_mois' });
    assert.deepEqual(FL.versRequete('periode', { du: '2026-01-01', au: '2026-02-01' }), { du: '2026-01-01', au: '2026-02-01' });
    assert.deepEqual(FL.versRequete('periode', undefined), { raccourci: 'tout' });
    assert.deepEqual(FL.versRequete('liste', undefined), []);
    assert.deepEqual(FL.versRequete('intervalle', { min: 3 }), { min: 3 });
    assert.equal(FL.versRequete('oui_non', true), true);
    assert.equal(FL.versRequete('oui_non', undefined), null);
  });
});

describe('B2.3 mémoire des choix et filtres inconnus', () => {
  test('B2.3a un filtre mémorisé que la réponse ne connaît plus est ignoré (purge)', () => {
    assert.deepEqual(FL.purger({ lieu: ['Nord'], disparu: [1] }, [LIEU]), { lieu: ['Nord'] });
    assert.deepEqual(FL.purger(undefined, [LIEU]), {});
  });
  test('B2.3b « Tout » = { raccourci: "tout" } explicite quand la période a un défaut appliqué ; rien à retenir sinon', () => {
    assert.deepEqual(FL.poser({}, PERIODE, { raccourci: 'tout' }), { periode: { raccourci: 'tout' } });
    assert.deepEqual(FL.poser({ periode: { raccourci: 'tout' } }, { ...PERIODE, defaut: undefined, applique: { raccourci: 'tout' } }, { raccourci: 'tout' }), {}); // pas de défaut : « tout » est ce que fait le serveur
    assert.deepEqual(FL.poser({ periode: { raccourci: 'tout' } }, PERIODE, { raccourci: '12_mois' }), {}); // retour au défaut : plus rien à envoyer
  });
  test('B2.3c une liste vide = clé absente, sauf pour écraser un défaut (liste vide envoyée)', () => {
    assert.deepEqual(FL.poser({ lieu: ['Nord'] }, LIEU, []), {});
    assert.deepEqual(FL.poser({}, { ...LIEU, defaut: ['Nord'], applique: ['Nord'] }, []), { lieu: [] });
  });
  test('B2.3d oui_non : indifférent = null explicite quand une valeur est appliquée, sinon clé absente', () => {
    assert.deepEqual(FL.poser({}, { ...ALERTE, defaut: true, applique: true }, null), { alerte: null });
    assert.deepEqual(FL.poser({ alerte: false }, ALERTE, null), {});
    assert.deepEqual(FL.poser({}, ALERTE, false), { alerte: false });
  });
  test('B2.3e la fenêtre : seuls les filtres MODIFIÉS sont retenus (un défaut non touché n\'est pas mémorisé)', () => {
    const decls = [PERIODE, LIEU, MONTANT];
    const m = FL.fusionner({}, decls, { periode: { raccourci: '12_mois' }, lieu: ['Sud', 'Nord'], montant: {} });
    assert.deepEqual(m, { lieu: ['Sud', 'Nord'] });
    assert.deepEqual(FL.fusionner(m, decls, { periode: { du: '2026-01-01', au: '2026-03-01' } }), { lieu: ['Sud', 'Nord'], periode: { du: '2026-01-01', au: '2026-03-01' } });
  });
  test('B2.3f « Tout effacer » : la période passe à « tout » (elle a un défaut), les filtres sans défaut ne sont plus envoyés', () => {
    const decls = [PERIODE, avec(LIEU, ['Nord']), avec(ALERTE, true), MONTANT];
    assert.deepEqual(FL.toutEffacer({ lieu: ['Nord'], alerte: true }, decls), { periode: { raccourci: 'tout' } }); // les filtres sans défaut reviennent simplement à « rien envoyé »
    assert.deepEqual(FL.toutEffacer({}, [{ ...avec(LIEU, ['Nord']), defaut: ['Nord'] }]), { lieu: [] }); // un défaut est écrasé par une liste vide explicite
  });
  test('B2.3g la mémoire est en mémoire du module, jamais dans le navigateur ni dans l\'adresse', () => {
    for (const f of ['ecran.js', 'filtres-ecran.js', 'filtres-logique.js', 'donnees.js']) assert.doesNotMatch(lire(`js/modules/pilotage/${f}`), /sessionStorage|localStorage|location\.(hash|search)/, f);
    assert.match(lire('js/modules/pilotage/ecran.js'), /export function oublierFiltresPilotage\(\) \{ memoireFiltres = new Map\(\)/);
  });
  test('B2.3h la déconnexion oublie les filtres du tableau de bord (main.js)', () => {
    assert.match(lire('js/main.js'), /import\('\.\/modules\/pilotage\/ecran\.js'\)\.then\(\(m\) => m\.oublierFiltresPilotage\(\)\)/);
  });
});

describe('B2.4 pastilles des filtres actifs', () => {
  test('B2.4a un filtre sans valeur appliquée n\'a pas de pastille ; une période, une pastille ; une liste, une pastille par valeur', () => {
    const decls = [PERIODE, avec(LIEU, ['Nord', 'Sud']), avec(ETAT, ['clos']), avec(MONTANT, { min: 100, max: 500 }), avec(ALERTE, false), { ...LIEU, id: 'autre', libelle: 'Autre' }];
    const ps = FL.pastilles(decls);
    assert.deepEqual(ps.map((p) => p.texte), ['Période : Les 12 derniers mois', 'Lieu : Nord', 'Lieu : Sud', 'État : Clos', 'Montant : de 100 à 500', 'Avec alerte : non']);
    assert.equal(new Set(ps.map((p) => p.cle)).size, ps.length);
    assert.equal(FL.nombreActifs(decls), 5);
  });
  test('B2.4b une plage de dates s\'écrit à la française ; un intervalle ouvert aussi', () => {
    assert.equal(FL.pastilles([avec(PERIODE, { du: '2026-03-01', au: '2026-03-31' })])[0].texte, 'Période : du 01/03/2026 au 31/03/2026');
    assert.equal(FL.pastilles([avec(MONTANT, { min: 1500 })])[0].texte, `Montant : à partir de 1${F.ESPACE_MILLIERS}500`);
    assert.equal(FL.pastilles([avec(MONTANT, { max: 20 })])[0].texte, 'Montant : jusqu\'à 20');
  });
  test('B2.4c la croix retire UNE valeur d\'une liste, tout le filtre sinon (période -> « tout »)', () => {
    const decls = [avec(PERIODE, PERIODE.applique), avec(LIEU, ['Nord', 'Sud'])];
    const [, nord] = FL.pastilles(decls);
    assert.deepEqual(FL.retirerPastille({}, decls, nord), { lieu: ['Sud'] });
    assert.deepEqual(FL.retirerPastille({}, decls, FL.pastilles(decls)[0]), { periode: { raccourci: 'tout' } });
  });
  test('B2.4d les libellés viennent du serveur : texte brut, jamais de HTML (rien n\'est interprété ici, l\'écran pose du texte)', () => {
    const ps = FL.pastilles([avec({ ...LIEU, libelle: '<img src=x onerror=alert(1)>' }, ['<b>x</b>'])]);
    assert.equal(ps[0].texte, '<img src=x onerror=alert(1)> : <b>x</b>');
    for (const f of ['filtres-ecran.js', 'filtres-logique.js', 'ecran.js']) assert.doesNotMatch(lire(`js/modules/pilotage/${f}`), /innerHTML|insertAdjacentHTML|outerHTML/, f);
  });
});

describe('B2.5 croisement : un clic sur un graphique règle un filtre', () => {
  test('B2.5a la valeur est lue dans la donnée de la série (name) : texte ou nombre, rien d\'autre', () => {
    assert.equal(FL.lireValeurClic({ name: 'Nord', value: [1, 2] }), 'Nord');
    assert.equal(FL.lireValeurClic({ name: 2026 }), 2026);
    assert.equal(FL.lireValeurClic({ name: '' }), undefined);
    assert.equal(FL.lireValeurClic({ name: { a: 1 } }), undefined);
    assert.equal(FL.lireValeurClic(null), undefined);
  });
  test('B2.5b la valeur est validée contre le type : liste fermée ou liste complète -> doit en faire partie (forme du choix) ; liste tronquée -> acceptée', () => {
    assert.equal(FL.valeurDeCroisement(LIEU, 'Nord'), 'Nord');
    assert.equal(FL.valeurDeCroisement(LIEU, 'Ouest'), undefined);
    assert.equal(FL.valeurDeCroisement(ETAT, 'clos'), 'clos');
    assert.equal(FL.valeurDeCroisement({ ...LIEU, tronquee: true }, 'Ouest'), 'Ouest');
    assert.equal(FL.valeurDeCroisement({ ...LIEU, valeurs: [3, 4] }, '3'), 3); // la forme de la liste fait foi (le nom du graphique est un texte)
    assert.equal(FL.valeurDeCroisement(MONTANT, 'x'), undefined); // pas une liste
    assert.equal(FL.valeurDeCroisement({ ...LIEU, valeurs: undefined }, 'x'.repeat(201)), undefined);
  });
  test('B2.5c un clic règle le filtre ; un second clic sur la même valeur le retire ; une valeur inconnue est ignorée', () => {
    const premier = FL.appliquerCroisement({}, LIEU, 'Nord');
    assert.deepEqual(premier.memoire, { lieu: ['Nord'] });
    const second = FL.appliquerCroisement(premier.memoire, avec(LIEU, ['Nord']), 'Nord');
    assert.deepEqual(second.memoire, {});
    assert.deepEqual(FL.appliquerCroisement({ lieu: ['Nord'] }, avec(LIEU, ['Nord']), 'Sud').memoire, { lieu: ['Sud'] });
    assert.equal(FL.appliquerCroisement({}, LIEU, 'Ouest'), null);
  });
  test('B2.5d le curseur « main » est posé sur une COPIE de l\'option (jamais de fonction, l\'original intact)', () => {
    const option = { series: [{ type: 'bar' }, { type: 'line' }] };
    const c = FL.rendreCliquable(option);
    assert.deepEqual(c.series.map((s) => s.cursor), ['pointer', 'pointer']);
    assert.equal(option.series[0].cursor, undefined);
    assert.equal(FL.rendreCliquable({ series: { type: 'pie' } }).series.cursor, 'pointer');
    assert.deepEqual(FL.rendreCliquable(undefined), {});
  });
  test('B2.5e le gestionnaire est générique : posé dans ecran.js, jamais décrit dans le réglage', () => {
    assert.match(lire('js/modules/pilotage/ecran.js'), /instance\.on\('click'/);
    assert.doesNotMatch(lire('js/modules/pilotage/logique.js'), /on\('click'/);
  });
});

describe('B2.6 filtre refusé par le serveur', () => {
  test('B2.6 donnees.js distingue « filtre refusé » (details.raison) de « onglet inconnu », et n\'envoie `filtres` que s\'ils existent', () => {
    const d = lire('js/modules/pilotage/donnees.js');
    assert.match(d, /e\?\.details\?\.raison === 'filtre'/);
    assert.match(d, /ongletInconnu: Boolean\(onglet\) && refus && !filtreRefuse/);
    assert.match(d, /filtres && Object\.keys\(filtres\)\.length \? \{ filtres \} : \{\}/);
    assert.equal((d.match(/httpsCallable\(fonctions\(\), 'pilotageLire'\)/g) ?? []).length, 1);
  });
  test('B2.6b l\'écran vide la mémoire de l\'onglet et relit une fois, avec « Filtres réinitialisés. »', () => {
    const e = lire('js/modules/pilotage/ecran.js');
    assert.match(e, /e\?\.filtreRefuse && choixDeLOnglet\(\)/);
    assert.match(e, /memoireFiltres\.delete\(cleOnglet\(\)\);\n\s+noteFiltres = FL\.MESSAGE_FILTRES_REINITIALISES/);
    assert.equal(FL.MESSAGE_FILTRES_REINITIALISES, 'Filtres réinitialisés.');
  });
});

describe('B2.8 export CSV', () => {
  const COLS = [{ colonne: 'nom', titre: 'Nom' }, { colonne: 'montant', titre: 'Montant' }, { colonne: 'note' }];
  test('B2.8a point-virgule, BOM UTF-8, fin de ligne CRLF, en-têtes = titres de colonnes, nombres à la française', () => {
    const csv = FL.construireCsv(COLS, [{ nom: 'Chantier A', montant: 1234.5, note: 'ok' }, { nom: 'B', montant: '12.30', note: null }]);
    assert.equal(csv, '﻿Nom;Montant;note\r\nChantier A;1234,5;ok\r\nB;12,30;\r\n');
  });
  test('B2.8b guillemets, point-virgule, retour à la ligne : cellule entre guillemets, guillemets doublés', () => {
    assert.equal(FL.celluleCsv('a;b'), '"a;b"');
    assert.equal(FL.celluleCsv('dit "oui"'), '"dit ""oui"""');
    assert.equal(FL.celluleCsv('ligne1\nligne2'), '"ligne1\nligne2"');
    assert.equal(FL.celluleCsv(true), 'oui');
  });
  test('B2.8c une formule est neutralisée (apostrophe devant) ; un nombre négatif seul reste un nombre', () => {
    for (const t of ['=SOMME(A1)', '+1+1', '-cmd|x', '@SUM(1)', '\t=1', '\r=1']) assert.ok(FL.celluleCsv(t).replace(/^"/, '').startsWith("'"), JSON.stringify(t));
    assert.equal(FL.celluleCsv(-5), '-5');
    assert.equal(FL.celluleCsv('-5,5'), '-5,5');
    assert.equal(FL.celluleCsv('=1;2'), '"\'=1;2"');
  });
  test('B2.8d le nom du fichier ne porte que l\'identifiant de la tuile et la date', () => {
    assert.equal(FL.nomFichierCsv('chantiers', new Date(2026, 10, 23)), 'tableau-chantiers-2026-11-23.csv');
    assert.equal(FL.nomFichierCsv('Dupont & Fils / secret', new Date(2026, 10, 3)), 'tableau-tableau-2026-11-03.csv');
  });
  test('B2.8e le bouton passe par la fonction `telecharger` existante de l\'appli', () => {
    const x = lire('js/modules/pilotage/export.js');
    assert.match(x, /import \{ telecharger \} from '\.\.\/crm\/composants\.js'/);
    assert.match(x, /telecharger\(nomFichierCsv\(idTuile\), construireCsv\(colonnes, lignes\), 'text\/csv;charset=utf-8'\)/);
    assert.match(lire('js/modules/pilotage/blocs.js'), /action: 'exporter-csv'/);
  });
});

describe('B2.9 format euros4', () => {
  test('B2.9 quatre décimales, virgule, espace insécable avant « € » ; les autres formats ne changent pas', () => {
    const B = F.ESPACE_INSECABLE;
    assert.equal(F.formater('euros4', 0.0009), `0,0009${B}€`);
    assert.equal(F.formater('euros4', '0.12'), `0,1200${B}€`);
    assert.equal(F.formater('euros4', 1234.5), `1${F.ESPACE_MILLIERS}234,5000${B}€`);
    assert.equal(F.formater('euros2', 0.0009), `0,00${B}€`);
    assert.ok(F.FORMATS.includes('euros4'));
  });
});

describe('B2.7 mention et repère sur une tuile', () => {
  test('B2.7 la mention « non filtré par… » est posée en texte dans la carte (ecran.js) avec son repère de test', () => {
    const e = lire('js/modules/pilotage/ecran.js');
    assert.match(e, /h\('p', \{ class: 'aide pilotage-mention', dataset: \{ role: 'mention-non-filtre' \} \}, t\.mentionNonFiltre\)/);
  });
});
