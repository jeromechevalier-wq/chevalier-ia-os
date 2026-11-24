// Modules Achats, étape « coquilles » (24/11/2026, PR 4) : les cinq modules déclarés (`seulJerome`), leur bloc de menu « Achats », l'état de l'accès à la base,
// le branchement des réglages et de la couche d'accès (js/os/acces-base.js), et les verrous (réseau, mots interdits, aucun module n'en exige un autre).
// Les écrans sont aussi vus dans un navigateur : tests/e2e/achats-coquilles.spec.js.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  MODULES_DECLARES, IDS_MODULES, GROUPES_MENU, blocsDuMenu, reglagesDesModules, interrupteursDuClient, modulesActifsDuClient, verifierActivation, moduleDeclare, moduleDeRoute,
} from '../js/os/registre.js';
import { MODULES, MODULES_CLIENT } from '../js/os/modules.js';
import { TEXTES_ACCES, texteAcces } from '../js/modules/achatscommun/etat.js';
import { ETAPES_DEPLOIEMENT_ACHATS } from '../js/modules/achatscommun/deploiement.js';
import { problemesEtapes, etapesVisibles, calculerPage } from '../js/os/deploiement.js';

const RACINE = new URL('..', import.meta.url).pathname;
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const sansComm = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\s\/\/ .*$/gm, '');
const ACHATS = ['achatsfournisseurs', 'achatschantiers', 'achatsarticles', 'achatsfactures', 'tableauachats'];
const ROUTES = { achatsfournisseurs: 'achatsfournisseurs/liste', achatschantiers: 'achatschantiers/liste', achatsarticles: 'achatsarticles/liste', achatsfactures: 'achatsfactures/liste', tableauachats: 'tableauachats/tableau' };
const LIBELLES = ['Fournisseurs', 'Chantiers', 'Articles', 'Factures', 'Tableau de bord 2'];
const fichiersDe = (dossier) => readdirSync(join(RACINE, dossier)).filter((f) => f.endsWith('.js')).map((f) => `${dossier}/${f}`);
const DOSSIERS = [...ACHATS.map((m) => `js/modules/${m}`), 'js/modules/achatscommun'];

describe('A1 déclaration : cinq modules réservés à un seul compte, jamais chez un client', () => {
  test('A1 chacun est déclaré seulJerome, dans le groupe « achats », sans donnée Firebase, sans outil d\'assistant, sans dépendance (vendable seul)', () => {
    for (const id of ACHATS) {
      const m = moduleDeclare(id);
      assert.ok(m, id);
      assert.equal(m.seulJerome, true, id);
      assert.equal(m.groupe, 'achats', id);
      assert.equal(m.prefixe, id);
      assert.deepEqual(m.collections, [], id);
      assert.deepEqual(m.outilsMcp, [], id);
      assert.deepEqual(m.dependances, [], id);
      assert.deepEqual(m.ecrans.map((e) => e.route), [ROUTES[id]], id);
      assert.equal(m.entreeMenu, ROUTES[id], id);
      assert.equal(moduleDeRoute(id)?.id, id);
    }
    assert.deepEqual(ACHATS.map((id) => moduleDeclare(id).libelleMenu), LIBELLES);
  });
  test('A1 jamais activables ni nommables chez un client : hors de IDS_MODULES et de MODULES_CLIENT, refusés par l\'activation, aucun interrupteur', () => {
    for (const id of ACHATS) {
      assert.ok(!IDS_MODULES.includes(id), id);
      assert.ok(!MODULES_CLIENT.some((m) => m.id === id), id);
      assert.ok(MODULES.some((m) => m.id === id && m.seulJerome === true && typeof m.monter === 'function'), id);
      const r = modulesActifsDuClient({ modules: { [id]: true, veille: true } });
      assert.ok(!r.actifs.includes(id) && r.actifs.includes('veille'), id);
      assert.ok(r.erreurs.some((e) => e.includes(id)), `« ${id} » est signalé comme module inconnu`);
      assert.equal(verifierActivation([id]).ok, false, id);
    }
    assert.equal(modulesActifsDuClient({ modules: Object.fromEntries(ACHATS.map((id) => [id, true])) }).actifs.length, 0);
    assert.ok(!interrupteursDuClient(IDS_MODULES).some((l) => l.id === 'achats' || ACHATS.includes(l.id)), 'aucun interrupteur « Modules actifs »');
    assert.ok(!blocsDuMenu(IDS_MODULES).some((b) => b.id === 'achats'), 'jamais dans le menu d\'un client');
    assert.ok(!reglagesDesModules(IDS_MODULES).some((r) => r.id === 'achats'), 'jamais dans les Réglages d\'un client');
  });
  test('A1 le montage existe pour chaque module (sinon la coque planterait) et js/main.js reste celui d\'avant : la Console et les Achats passent par le même filtre', () => {
    const montages = sansComm(lire('js/os/modules.js'));
    for (const id of ACHATS) assert.match(montages, new RegExp(`${id}: \\(\\) => import\\('\\.\\./modules/${id}/index\\.js'\\)`), id);
    assert.match(lire('js/main.js'), /MODULES_TOUS\.filter\(\(m\) => !m\.seulJerome \|\| peutVoirConsole\(compte\)\)/);
  });
});

describe('A2 menu : un seul bloc « Achats »', () => {
  test('A2 le groupe « achats » réunit les cinq modules, dans l\'ordre voulu ; un seul bloc de menu, une seule section', () => {
    const g = GROUPES_MENU.find((x) => x.id === 'achats');
    assert.equal(g.libelleMenu, 'Achats');
    assert.deepEqual(g.modules, ACHATS);
    const blocs = blocsDuMenu(ACHATS);
    assert.equal(blocs.length, 1);
    assert.equal(blocs[0].id, 'achats');
    assert.equal(blocs[0].libelle, 'Achats');
    assert.deepEqual(blocs[0].sections.map((s) => s.map((e) => e.libelle)), [LIBELLES]);
    assert.deepEqual(blocs[0].entrees.map((e) => e.chemin), ACHATS.map((id) => ROUTES[id]));
  });
  test('A2 chaque module reste vendable seul : un seul module actif donne un bloc « Achats » à une seule entrée', () => {
    for (const id of ACHATS) {
      const blocs = blocsDuMenu([id]);
      assert.equal(blocs.length, 1, id);
      assert.deepEqual(blocs[0].sections.flat().map((e) => e.chemin), [ROUTES[id]], id);
    }
  });
  test('A2 Réglages : un élément « Achats » sans section (résumé affiché), qui ouvre le premier écran', () => {
    const [item] = reglagesDesModules(ACHATS);
    assert.equal(item.id, 'achats');
    assert.equal(item.libelle, 'Achats');
    assert.deepEqual(item.sections, []);
    assert.match(item.resume, /Réglages > Connexion à la base/);
    assert.equal(item.ouvrir, 'achatsfournisseurs/liste');
  });
  test('A2 le menu de Jérôme : le bloc vient entre Maintenance et Console, et la page Réglages garde son ordre', () => {
    const ids = MODULES.map((m) => m.id);
    assert.ok(ids.indexOf('tableaudebord') < ids.indexOf('achatsfournisseurs') && ids.indexOf('tableauachats') < ids.indexOf('console'));
    assert.deepEqual(reglagesDesModules(ids).map((r) => r.libelle).slice(-4), ['Maintenance', 'Achats', 'Connecter mon ChatGPT', 'Console']);
  });
});

describe('A3 l\'état de l\'accès : textes fixes, sans secret ni nom', () => {
  test('A3 les quatre états disent ce qu\'il faut, et un état inconnu n\'est jamais muet', () => {
    assert.equal(TEXTES_ACCES.connecte, 'Connecté à la base');
    assert.match(TEXTES_ACCES['non-regle'], /Connexion à la base non réglée.*Réglages > Connexion à la base/);
    assert.match(TEXTES_ACCES.reconnexion, /^Reconnecte-toi/);
    assert.match(TEXTES_ACCES.illisible, /réessaie/);
    assert.equal(texteAcces('nimporte'), TEXTES_ACCES.illisible);
    assert.equal(texteAcces(undefined), TEXTES_ACCES.illisible);
    assert.ok(Object.isFrozen(TEXTES_ACCES));
  });
  test('A3 l\'écran commun a un « Réessayer » (cas d\'erreur), un lien vers le réglage (cas non réglé) et un chargement', () => {
    const e = lire('js/modules/achatscommun/ecran-etat.js');
    assert.match(e, /dataset: \{ action: 'reessayer' \}/);
    assert.match(e, /lien\('reglages\/base'\)/);
    assert.match(e, /dataset: \{ etat: 'chargement' \}/);
    assert.match(e, /verifierAcces/);
  });
});

describe('A4 Réglages > Déploiement : « absent chez les clients »', () => {
  test('A4 l\'étape est valable, à cocher à la main, portée par un module Achats (donc jamais montrée chez un client), sans mot interdit', () => {
    assert.deepEqual(problemesEtapes(ETAPES_DEPLOIEMENT_ACHATS), []);
    const [e] = ETAPES_DEPLOIEMENT_ACHATS;
    assert.equal(e.type, 'manuel');
    assert.ok(ACHATS.includes(e.module));
    assert.match(e.libelle, /absents chez les clients/);
    assert.doesNotMatch(JSON.stringify(ETAPES_DEPLOIEMENT_ACHATS), /Jérôme|CRM|dépôt|du client|au client|@|https?:/);
    assert.deepEqual(etapesVisibles(ETAPES_DEPLOIEMENT_ACHATS, ['affaires', 'devis']).map((x) => x.id), [], 'un espace sans module Achats ne la voit pas');
    assert.deepEqual(etapesVisibles(ETAPES_DEPLOIEMENT_ACHATS, ['achatsfournisseurs']).map((x) => x.id), ['achats-plateforme']);
    assert.equal(calculerPage({ etapes: ETAPES_DEPLOIEMENT_ACHATS, actifs: ['achatsfournisseurs'] }).groupes[0].lignes[0].couleur, 'gris');
  });
  test('A4 le module déclare la ligne par son API (la coque ne cite aucun module)', () => {
    assert.match(lire('js/modules/achatsfournisseurs/index.js'), /export function controlesDeploiement\(\)/);
  });
});

describe('A5 verrous du code', () => {
  test('A5 aucun appel réseau (fetch, XMLHttpRequest, sendBeacon, WebSocket, EventSource), même en commentaire, dans les modules Achats ni dans acces-base.js', () => {
    const fichiers = [...DOSSIERS.flatMap(fichiersDe), 'js/os/acces-base.js'];
    assert.ok(fichiers.length >= 14);
    for (const f of fichiers) assert.doesNotMatch(lire(f), /\bfetch\s*\(|XMLHttpRequest|sendBeacon|\bWebSocket\b|\bEventSource\b/, f);
  });
  test('A5 aucune adresse https écrite dans ces fichiers (hors commentaires), aucun mot du nom d\'un client ou de Jérôme dans ce que l\'écran montre', () => {
    for (const f of [...DOSSIERS.flatMap(fichiersDe), 'js/os/acces-base.js']) {
      const code = sansComm(lire(f));
      assert.doesNotMatch(code, /https?:\/\//, f);
      assert.doesNotMatch(code, /Chevalier|Jérôme|Jerome|Charles|Hermes|Claude Code/, f);
    }
  });
  test('A5 aucun module Achats n\'importe un autre module (ni Pilotage) : seulement achatscommun et la coque', () => {
    for (const dossier of DOSSIERS) {
      for (const f of fichiersDe(dossier)) {
        for (const m of lire(f).matchAll(/from '([^']+)'/g)) {
          const cible = m[1];
          if (!cible.startsWith('.')) continue;
          const resolu = join('/', dossier, cible).slice(1);
          if (resolu.startsWith('js/modules/')) assert.ok(resolu.startsWith(`${dossier}/`) || resolu.startsWith('js/modules/achatscommun/'), `${f} importe ${cible}`);
        }
        assert.doesNotMatch(lire(f), /pilotage/i, f);
      }
    }
    assert.ok(statSync(join(RACINE, 'js/modules/achatscommun')).isDirectory());
    assert.ok(!MODULES_DECLARES.some((m) => m.id === 'achatscommun'), 'achatscommun n\'est pas un module');
  });
  test('A5 acces-base.js : un seul crochet de test, réservé au mode émulateurs ; le badge vient de Firebase Auth ; testerAvec essaie les valeurs données', () => {
    const t = lire('js/os/acces-base.js');
    const code = sansComm(t);
    assert.deepEqual([...new Set([...code.matchAll(/window\.(__\w+)/g)].map((m) => m[1]))], ['__accesBase']);
    assert.match(code, /MODE_EMULATEURS \? window\.__accesBase : null/);
    assert.match(code, /import \{ auth, MODE_EMULATEURS \} from '\.\/firebase\.js'/);
    assert.match(code, /auth\.currentUser/);
    assert.match(code, /getIdTokenResult\(Boolean\(forcer\)\)/);
    assert.match(code, /export async function testerAvec\(connexion\)[\s\S]*lireConnexion: \(\) => connexion/);
    assert.match(code, /chargerConnexion\(\)/);
    assert.deepEqual([...code.matchAll(/^export (?:async )?(?:function|const) (\w+)/gm)].map((m) => m[1]).sort(), ['actionsBase', 'clientBase', 'connexionPrete', 'obtenirBadge', 'testerAvec', 'verifierAcces']);
  });
  test('A5 le badge simulé du crochet porte exactement ce que la couche exige : le crochet ne sert que sous MODE_EMULATEURS (hors émulateurs, ignoré)', () => {
    const code = sansComm(lire('js/os/acces-base.js'));
    assert.match(code, /const c = MODE_EMULATEURS \? window\.__accesBase : null;/);
    assert.match(code, /if \(c\) return \{ jeton: String\(c\.jeton \?\? 'jeton-simule'\), claims: \{ \.\.\.\(c\.claims \?\? \{\}\) \} \};/);
  });
});
