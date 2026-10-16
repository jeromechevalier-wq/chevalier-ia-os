// Registre des modules (chantier 7) : déclarations, modules actifs d'un client, dépendances, et CRM de Jérôme inchangé.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  MODULES_DECLARES, IDS_MODULES, OUTILS_COMMUNS, moduleDeclare, moduleDeRoute, lireModulesDemandes, verifierActivation,
  modulesActifsDuClient, moduleAccessible, premiereRoute, ecransActifs,
} from '../js/os/registre.js';
import { MODULES } from '../js/os/modules.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');

describe('registre : déclarations', () => {
  test('chaque module déclare nom, écrans (route, libellé, icône), collections, outils MCP et dépendances', () => {
    for (const m of MODULES_DECLARES) {
      assert.match(m.id, /^[a-z]+$/);
      assert.ok(m.nom && m.libelleMenu && m.iconeMenu && m.prefixe, m.id);
      assert.ok(m.ecrans.length > 0 && (m.collections.length > 0 || m.id === 'mcp') && (m.outilsMcp.length > 0 || ['journal', 'veille', 'mcp'].includes(m.id)), m.id); // « mcp » n'a ni données ni outil à lui : il allume le lien du client
      for (const e of m.ecrans) {
        assert.ok(e.route.startsWith(`${m.prefixe}/`) && e.libelle && e.icone, `${m.id} ${e.route}`);
      }
      assert.ok(Array.isArray(m.dependances));
    }
  });
  test('identifiants, préfixes de route, routes, collections et outils sont uniques (aucun partage entre modules)', () => {
    const unique = (liste) => assert.equal(new Set(liste).size, liste.length, liste.join());
    unique(MODULES_DECLARES.map((m) => m.id));
    unique(MODULES_DECLARES.map((m) => m.prefixe));
    unique(MODULES_DECLARES.flatMap((m) => m.ecrans.map((e) => e.route)));
    unique(MODULES_DECLARES.flatMap((m) => m.collections));
    unique([...OUTILS_COMMUNS, ...MODULES_DECLARES.flatMap((m) => m.outilsMcp)]);
  });
  test("une dépendance est toujours déclarée avant ce qui en dépend ; projets exige affaires", () => {
    MODULES_DECLARES.forEach((m, i) => m.dependances.forEach((d) => assert.ok(MODULES_DECLARES.findIndex((x) => x.id === d) < i, `${m.id} -> ${d}`)));
    assert.deepEqual(moduleDeclare('projets').dependances, ['affaires']);
    assert.deepEqual(moduleDeclare('affaires').dependances, []);
  });
  test('les déclarations sont figées (personne ne les modifie en route)', () => {
    assert.throws(() => { 'use strict'; MODULES_DECLARES[0].id = 'x'; }, TypeError);
    assert.throws(() => { 'use strict'; MODULES_DECLARES[0].ecrans.push({}); }, TypeError);
  });
  test('les collections déclarées sont exactement celles que le code du CRM et de Projets lit (sauvegarde complète)', () => {
    const declarees = MODULES_DECLARES.filter((m) => m.reserveAuxClients !== true).flatMap((m) => m.collections).sort();
    const source = lire('js/modules/crm/donnees.js');
    const bloc = source.match(/COLLECTIONS_CRM = \[([\s\S]*?)\]/)[1];
    const lues = [...bloc.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    assert.deepEqual(declarees, lues);
  });
  test('moduleDeclare / moduleDeRoute', () => {
    assert.equal(moduleDeclare('projets').prefixe, 'projets');
    assert.equal(moduleDeclare('inconnu'), null);
    assert.equal(moduleDeRoute('crm').id, 'affaires');
    assert.equal(moduleDeRoute('reglages'), null);
    assert.equal(moduleDeRoute('espace'), null);
  });
});

describe('registre : modules actifs d\'un client', () => {
  test('aucune fiche, aucun champ, champ vide ou illisible : aucun module actif (comportement défini)', () => {
    for (const fiche of [null, undefined, {}, { modules: null }, { modules: {} }, 'texte', 12, []]) {
      assert.deepEqual(modulesActifsDuClient(fiche).actifs, [], JSON.stringify(fiche));
    }
    assert.equal(modulesActifsDuClient({ modules: {} }).erreurs.length, 0);
  });
  test('champ qui n\'est pas un objet : aucun module actif et une erreur claire', () => {
    for (const modules of [['affaires'], 'affaires', true, 3]) {
      const r = modulesActifsDuClient({ modules });
      assert.deepEqual(r.actifs, []);
      assert.match(r.erreurs[0], /doit être un objet/);
    }
  });
  test('{ affaires: true, projets: false } : seulement affaires', () => {
    assert.deepEqual(modulesActifsDuClient({ modules: { affaires: true, projets: false } }), { actifs: ['affaires'], erreurs: [] });
  });
  test('seul `true` active : "true", 1, "oui", null, objets ne comptent pas', () => {
    for (const v of ['true', 1, 'oui', null, {}, [], 'on']) {
      assert.deepEqual(modulesActifsDuClient({ modules: { affaires: v } }).actifs, [], String(v));
    }
  });
  test('les deux modules actifs, dans l\'ordre de démarrage, quel que soit l\'ordre dans la fiche', () => {
    assert.deepEqual(modulesActifsDuClient({ modules: { projets: true, affaires: true } }).actifs, ['affaires', 'projets']);
  });
  test('projets sans affaires : refusé proprement (pas activé, erreur lisible), jamais d\'exception', () => {
    for (const modules of [{ projets: true }, { projets: true, affaires: false }]) {
      const r = modulesActifsDuClient({ modules });
      assert.deepEqual(r.actifs, []);
      assert.equal(r.erreurs.length, 1);
      assert.match(r.erreurs[0], /Projets.*sans.*Affaires/);
    }
  });
  test('verifierActivation (pour l\'outil « nouveau client » du chantier 13) : ok / refus', () => {
    assert.deepEqual(verifierActivation(['affaires', 'projets']), { ok: true, actifs: ['affaires', 'projets'], erreurs: [] });
    assert.deepEqual(verifierActivation([]), { ok: true, actifs: [], erreurs: [] });
    const refus = verifierActivation(['projets']);
    assert.equal(refus.ok, false);
    assert.deepEqual(refus.actifs, []);
  });
  test('module inconnu : ignoré, signalé, n\'active rien (pas de module fantôme)', () => {
    const r = modulesActifsDuClient({ modules: { affaires: true, factures: true, __proto__x: true } });
    assert.deepEqual(r.actifs, ['affaires']);
    assert.ok(r.erreurs.some((e) => /Module inconnu : « factures »/.test(e)));
    assert.deepEqual(lireModulesDemandes({ modules: { constructor: true, toString: true } }).demandes, []);
  });
  test('moduleAccessible : un module non activé est introuvable, même par son adresse', () => {
    assert.equal(moduleAccessible('crm', ['affaires']), true);
    assert.equal(moduleAccessible('projets', ['affaires']), false);
    assert.equal(moduleAccessible('projets', []), false);
    assert.equal(moduleAccessible('reglages', ['affaires', 'projets']), false);
    assert.equal(moduleAccessible('espace', ['affaires', 'projets']), false);
    assert.equal(moduleAccessible(undefined, ['affaires']), false);
  });
  test('premiereRoute et ecransActifs', () => {
    assert.equal(premiereRoute([]), null);
    assert.equal(premiereRoute(['affaires']), 'crm/accueil');
    assert.equal(premiereRoute(['projets']), 'projets/projets');
    assert.deepEqual(ecransActifs([]), []);
    assert.deepEqual(ecransActifs(['affaires']).map((e) => e.route), ['crm/accueil', 'crm/personnes', 'crm/organisations', 'crm/affaires', 'crm/journal']);
    assert.equal(ecransActifs(['affaires', 'projets']).length, 8);
  });
});

describe('registre : le CRM de Jérôme est strictement inchangé', () => {
  // Copie exacte du contenu de js/os/modules.js avant le chantier 7 (id « crm » devenu « affaires » : identifiant interne seulement).
  const AVANT = [
    { id: 'affaires', libelle: 'CRM', icone: 'users', prefixe: 'crm', entrees: [
      { chemin: 'crm/accueil', libelle: 'Accueil', icone: 'house' },
      { chemin: 'crm/personnes', libelle: 'Personnes', icone: 'user' },
      { chemin: 'crm/organisations', libelle: 'Organisations', icone: 'building-2' },
      { chemin: 'crm/affaires', libelle: 'Affaires', icone: 'briefcase' },
      { chemin: 'crm/journal', libelle: 'Journal', icone: 'history' },
    ] },
    { id: 'projets', libelle: 'Projets', icone: 'folder-kanban', prefixe: 'projets', entrees: [
      { chemin: 'projets/projets', libelle: 'Projets', icone: 'folder-kanban' },
      { chemin: 'projets/archives', libelle: 'Archives', icone: 'archive' },
      { chemin: 'projets/modeles', libelle: 'Modèles', icone: 'copy' },
    ] },
    // Ajout voulu (veille vendable en module, étape 1, 2026-10-14) : le menu du CRM gagne « Veille » après Projets. Rien d'autre ne change.
    { id: 'veille', libelle: 'Veille', icone: 'globe', prefixe: 'veille', entrees: [
      { chemin: 'veille/contenus', libelle: 'Contenus', icone: 'file-text' },
      { chemin: 'veille/sources', libelle: 'Sources', icone: 'link' },
    ] },
  ];
  test('MODULES (menu, routes, libellés, icônes, ordre) est identique à celui d\'avant', () => {
    const maintenant = MODULES.map(({ monter, ...reste }) => { assert.equal(typeof monter, 'function'); return reste; });
    assert.deepEqual(maintenant, AVANT);
  });
  test('main.js démarre TOUS les modules à la racine (cheminBase vide) et ne lit pas les modules actifs', () => {
    const main = lire('js/main.js');
    assert.match(main, /for \(const m of MODULES\)/);
    assert.match(main, /cheminBase: ''/);
    assert.ok(!/registre|modulesActifs|espace-modules/.test(main.replace(/\/\/.*$/gm, '')));
  });
  test('le menu du CRM n\'a pas changé : mêmes modules, Réglages à la fin', () => {
    const shell = lire('js/os/shell.js');
    assert.match(shell, /modules = MODULES/);
  });
});

describe('routage chez un client (préfixe espace/<client>) et CRM de Jérôme sans préfixe', async () => {
  const { routeDepuisHash, lien, estSousPrefixe, ROUTE_DEFAUT } = await import('../js/os/router.js');
  const { routeDansEspace, cleEspace, estRouteEspace } = await import('../js/os/marque.js');

  test('sans préfixe (CRM de Jérôme) : exactement le comportement d\'avant', () => {
    assert.equal(routeDepuisHash(''), ROUTE_DEFAUT);
    assert.equal(routeDepuisHash('#/'), ROUTE_DEFAUT);
    assert.equal(routeDepuisHash('#/crm/personnes/'), 'crm/personnes');
    assert.equal(routeDepuisHash('#/crm/personnes/ab%20c'), 'crm/personnes/ab c');
    assert.equal(routeDepuisHash('#/reglages'), 'reglages');
    assert.equal(lien('crm/accueil', ''), '#/crm/accueil');
    assert.equal(lien('crm/personnes/x', ''), '#/crm/personnes/x');
  });
  test('avec préfixe : la route rendue est celle du module, sans le préfixe', () => {
    assert.equal(routeDepuisHash('#/espace/acme/crm/personnes/p1', 'espace/acme'), 'crm/personnes/p1');
    assert.equal(routeDepuisHash('#/espace/Acme/crm/personnes', 'espace/acme'), 'crm/personnes');
    assert.equal(routeDepuisHash('#/espace/acme', 'espace/acme'), '');
    assert.equal(routeDepuisHash('#/espace/acme/', 'espace/acme'), '');
    assert.equal(routeDepuisHash('#/crm/accueil', 'espace/acme'), ''); // hors de l'espace : rien
    assert.equal(routeDepuisHash('#/espace/acmeX/crm', 'espace/acme'), '');
    assert.equal(lien('crm/accueil', 'espace/acme'), '#/espace/acme/crm/accueil');
    assert.equal(lien('#/crm/accueil', 'espace/acme'), '#/espace/acme/crm/accueil');
  });
  test('estSousPrefixe', () => {
    assert.equal(estSousPrefixe('#/espace/acme/crm', 'espace/acme'), true);
    assert.equal(estSousPrefixe('#/espace/acme', 'espace/acme'), true);
    assert.equal(estSousPrefixe('#/espace/acmeX', 'espace/acme'), false);
    assert.equal(estSousPrefixe('#/crm/personnes', 'espace/acme'), false);
    assert.equal(estSousPrefixe('#/crm/personnes', ''), false);
  });
  test('routeDansEspace / cleEspace : l\'écran change, le client non', () => {
    assert.deepEqual(routeDansEspace('espace/Acme'), { client: 'acme', reste: '' });
    assert.deepEqual(routeDansEspace('espace/acme/crm/personnes/p1'), { client: 'acme', reste: 'crm/personnes/p1' });
    for (const r of ['', 'espace', 'crm/accueil', 'espace/a b', 'espace/-x', 'espace/é/crm', null]) assert.equal(routeDansEspace(r), null, String(r));
    assert.equal(cleEspace('espace/Acme/crm/personnes'), 'espace/acme');
    assert.equal(cleEspace('espace/acme'), 'espace/acme');
    assert.equal(cleEspace('espace'), 'espace');
    assert.equal(cleEspace('crm/accueil'), '');
    assert.equal(estRouteEspace('espace/acme/projets/projets'), true);
  });
});
