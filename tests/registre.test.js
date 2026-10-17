// Registre des modules (chantier 7) : déclarations, modules actifs d'un client, dépendances, et CRM de Jérôme inchangé.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  MODULES_DECLARES, IDS_MODULES, OUTILS_COMMUNS, moduleDeclare, moduleDeRoute, lireModulesDemandes, verifierActivation,
  modulesActifsDuClient, moduleAccessible, premiereRoute, ecransActifs,
  ANCIENS_IDENTIFIANTS, ANCIENS_PREFIXES, identifiantActuel, routeModernisee,
  GROUPES_MENU, INTERRUPTEURS, modulesDeNom, groupeDuModule, blocsDuMenu, reglagesDesModules,
  SECTIONS_ESPACE, sectionsEspaceVisibles, interrupteursDuClient, cibleReglages,
} from '../js/os/registre.js';
import { MODULES } from '../js/os/modules.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');

describe('registre : déclarations', () => {
  test('chaque module déclare nom, écrans (route, libellé, icône), collections, outils MCP et dépendances', () => {
    for (const m of MODULES_DECLARES) {
      assert.match(m.id, /^[a-z]+$/);
      assert.ok(m.nom && m.libelleMenu && m.iconeMenu && m.prefixe, m.id);
      assert.ok(m.ecrans.length > 0 && (m.collections.length > 0 || m.id === 'mcp') && (m.outilsMcp.length > 0 || ['automatisations', 'veille', 'tableaudebord', 'mcp'].includes(m.id)), m.id); // « mcp » n'a ni données ni outil à lui : il allume le lien du client
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
    // Exception voulue (16/10/2026) : le module Automatisations ne copie que l'historique de n8n (refaisable depuis n8n, volumineux) ; ses collections
    // (workflows, executions, sync) ne sont pas dans l'export JSON du CRM. À reprendre si Jérôme veut les sauvegarder.
    const SANS_SAUVEGARDE = ['automatisations', 'tableaudebord']; // tableaudebord (17/10/2026) : relevés refaits chaque jour par les scripts de surveillance
    const declarees = MODULES_DECLARES.filter((m) => m.reserveAuxClients !== true && !SANS_SAUVEGARDE.includes(m.id)).flatMap((m) => m.collections).sort();
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
    assert.equal(ecransActifs(['affaires', 'projets']).length, 7);
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
      // « Modèles » est sorti du menu (chantier ménage du CRM, 2026-10-16) : il se règle dans les Réglages (modèles de projets et modèles d'affaires).
    ] },
    // Ajout voulu (veille vendable en module, étape 1, 2026-10-14) : le menu du CRM gagne « Veille » après Projets.
    { id: 'veille', libelle: 'Veille', icone: 'globe', prefixe: 'veille', entrees: [
      { chemin: 'veille/contenus', libelle: 'Contenus', icone: 'file-text' },
      { chemin: 'veille/sources', libelle: 'Sources', icone: 'link' },
    ] },
    // Ajout voulu (16/10/2026) : le module n8n (ex-« journal », menu « Automatisations ») n'est plus réservé aux clients ; il est chez Jérôme aussi (règle « tout module existe d'abord chez Jérôme »).
    { id: 'automatisations', libelle: 'Automatisations', icone: 'activity', prefixe: 'automatisations', entrees: [
      { chemin: 'automatisations/historique', libelle: 'Historique', icone: 'activity' },
    ] },
    // Ajout voulu (17/10/2026) : le module Tableau de bord (écrans en lecture seule) est chez Jérôme dès le départ ; ses onglets Finance et Stocks ne sont pas dans le menu.
    { id: 'tableaudebord', libelle: 'Tableau de bord', icone: 'layout-dashboard', prefixe: 'tableaudebord', entrees: [
      { chemin: 'tableaudebord/general', libelle: 'Général', icone: 'house' },
      { chemin: 'tableaudebord/technique', libelle: 'Technique', icone: 'settings' },
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

describe('renommage « journal » -> « automatisations » : compatibilité des fiches client et des adresses', () => {
  test('l\'ancien identifiant n\'est plus un module, seulement un alias', () => {
    assert.ok(!IDS_MODULES.includes('journal'));
    assert.equal(moduleDeclare('journal'), null);
    assert.equal(moduleDeRoute('journal'), null);
    assert.deepEqual({ ...ANCIENS_IDENTIFIANTS }, { journal: 'automatisations' });
    assert.equal(identifiantActuel('journal'), 'automatisations');
    assert.equal(identifiantActuel('affaires'), 'affaires');
    assert.equal(identifiantActuel('constructor'), 'constructor');
  });
  test('une fiche écrite avant le renommage (journal: true) active toujours le module, sans erreur', () => {
    const r = modulesActifsDuClient({ modules: { affaires: true, journal: true } });
    assert.deepEqual(r.actifs, ['affaires', 'automatisations']);
    assert.deepEqual(r.erreurs, []);
    assert.deepEqual(modulesActifsDuClient({ modules: { journal: true } }).actifs, ['automatisations']);
    assert.equal(premiereRoute(modulesActifsDuClient({ modules: { journal: true } }).actifs), 'automatisations/historique');
  });
  test('la nouvelle clé gagne sur l\'ancienne, qu\'elle soit vraie ou fausse', () => {
    assert.deepEqual(modulesActifsDuClient({ modules: { journal: true, automatisations: false } }).actifs, []);
    assert.deepEqual(modulesActifsDuClient({ modules: { journal: false, automatisations: true } }).actifs, ['automatisations']);
    assert.deepEqual(modulesActifsDuClient({ modules: { journal: true, automatisations: true } }).actifs, ['automatisations']);
  });
  test('« journal: false », ou autre chose que true, n\'active rien', () => {
    for (const v of [false, 'true', 1, null, {}]) assert.deepEqual(modulesActifsDuClient({ modules: { journal: v } }).actifs, [], String(v));
    assert.deepEqual(modulesActifsDuClient({ modules: { journal: false } }).erreurs, []);
  });
  test('un autre module inconnu reste signalé', () => {
    assert.ok(modulesActifsDuClient({ modules: { journalisme: true } }).erreurs.some((e) => /journalisme/.test(e)));
  });
  test('les anciennes adresses journal/… sont redirigées vers automatisations/… ; le Journal du CRM (crm/journal) ne bouge pas', () => {
    assert.deepEqual({ ...ANCIENS_PREFIXES }, { journal: 'automatisations' });
    assert.equal(routeModernisee('journal/historique'), 'automatisations/historique');
    assert.equal(routeModernisee('journal'), 'automatisations');
    assert.equal(routeModernisee('crm/journal'), 'crm/journal');
    assert.equal(routeModernisee('automatisations/historique'), 'automatisations/historique');
    assert.equal(routeModernisee('journaux/x'), 'journaux/x');
    assert.equal(routeModernisee(''), '');
    assert.equal(routeModernisee('constructor/x'), 'constructor/x');
  });
  test('le module Automatisations n\'est plus réservé aux clients : il figure dans le menu du CRM de Jérôme, avec le libellé « Automatisations »', () => {
    assert.ok(MODULES.some((m) => m.id === 'automatisations' && m.libelle === 'Automatisations'));
    assert.notEqual(moduleDeclare('automatisations').reserveAuxClients, true); // (« mcp » reste réservé aux clients : c'est voulu)
  });
  test('espace-modules.js redirige les anciens liens avant de chercher le module', () => {
    const t = lire('js/os/espace-modules.js');
    assert.match(t, /routeModernisee\(route\)/);
    assert.ok(t.indexOf('routeModernisee(route)') < t.indexOf('moduleAccessible(segs[0]'));
  });
});

describe('menu CRM unique (méthode A, 2.6.0) : un seul groupe « CRM », deux modules techniques', () => {
  const LIBELLES = (b) => b.entrees.map((e) => e.libelle);
  test('affaires et projets restent deux modules techniques, réunis dans le groupe « crm » ; les autres modules ont leur propre bloc', () => {
    assert.deepEqual(GROUPES_MENU.map((g) => g.id), ['crm']);
    assert.deepEqual(GROUPES_MENU[0].modules, ['affaires', 'projets']);
    assert.equal(moduleDeclare('affaires').groupe, 'crm');
    assert.equal(moduleDeclare('projets').groupe, 'crm');
    assert.equal(groupeDuModule('affaires').id, 'crm');
    assert.equal(groupeDuModule('veille'), null);
    for (const m of MODULES_DECLARES.filter((x) => x.groupe)) assert.ok(GROUPES_MENU.some((g) => g.id === m.groupe && g.modules.includes(m.id)), m.id);
  });
  test('menu du CRM : Accueil, Personnes, Organisations, Affaires, Projets, Journal, Archives, dans cet ordre, dans UN seul bloc « CRM »', () => {
    const blocs = blocsDuMenu(['affaires', 'projets']);
    assert.equal(blocs.length, 1);
    assert.equal(blocs[0].libelle, 'CRM');
    assert.deepEqual(LIBELLES(blocs[0]), ['Accueil', 'Personnes', 'Organisations', 'Affaires', 'Projets', 'Journal', 'Archives']);
    assert.deepEqual(blocs[0].entrees.map((e) => e.chemin), ['crm/accueil', 'crm/personnes', 'crm/organisations', 'crm/affaires', 'projets/projets', 'crm/journal', 'projets/archives']);
    assert.ok(!LIBELLES(blocs[0]).includes('Modèles'), '« Modèles » est dans les Réglages');
  });
  test('les routes (donc les signets et les liens) sont celles d\'avant : aucune adresse ne change', () => {
    const routes = blocsDuMenu(IDS_MODULES).flatMap((b) => b.entrees.map((e) => e.chemin));
    for (const r of ['crm/accueil', 'crm/personnes', 'crm/organisations', 'crm/affaires', 'crm/journal', 'projets/projets', 'projets/archives', 'veille/contenus', 'automatisations/historique']) assert.ok(routes.includes(r), r);
    assert.equal(moduleDeRoute('crm').id, 'affaires');
    assert.equal(moduleDeRoute('projets').id, 'projets');
  });
  test('un client avec « affaires » seul : le bloc CRM existe sans Projets ni Archives', () => {
    const [bloc] = blocsDuMenu(['affaires']);
    assert.deepEqual(LIBELLES(bloc), ['Accueil', 'Personnes', 'Organisations', 'Affaires', 'Journal']);
  });
  test('aucun module actif : aucun bloc ; les autres modules gardent chacun leur bloc, après le CRM', () => {
    assert.deepEqual(blocsDuMenu([]), []);
    assert.deepEqual(blocsDuMenu(['mcp', 'affaires', 'veille', 'projets', 'automatisations']).map((b) => b.id), ['crm', 'veille', 'automatisations', 'mcp']);
  });
  test('un seul interrupteur « crm » : active affaires ET projets ; une valeur précise l\'emporte ; l\'ancien réglage ne change pas', () => {
    assert.deepEqual(INTERRUPTEURS.crm, ['affaires', 'projets']);
    assert.deepEqual(modulesDeNom('crm'), ['affaires', 'projets']);
    assert.deepEqual(modulesDeNom('veille'), ['veille']);
    assert.deepEqual(modulesDeNom('journal'), ['automatisations']);
    assert.deepEqual(modulesActifsDuClient({ modules: { crm: true } }), { actifs: ['affaires', 'projets'], erreurs: [] });
    assert.deepEqual(modulesActifsDuClient({ modules: { crm: true, veille: true, mcp: true } }).actifs, ['affaires', 'projets', 'veille', 'mcp']);
    assert.deepEqual(modulesActifsDuClient({ modules: { crm: false } }), { actifs: [], erreurs: [] });
    assert.deepEqual(modulesActifsDuClient({ modules: { crm: true, projets: false } }).actifs, ['affaires']);
    assert.deepEqual(modulesActifsDuClient({ modules: { affaires: true, projets: false } }).actifs, ['affaires']); // client réglé avant la 2.6.0 : inchangé
    assert.deepEqual(modulesActifsDuClient({ modules: { affaires: true, projets: true } }).actifs, ['affaires', 'projets']);
    // crm à true mais affaires explicitement à false : les projets seraient seuls, ce qui est refusé comme avant
    const r = modulesActifsDuClient({ modules: { crm: true, affaires: false } });
    assert.deepEqual(r.actifs, []);
    assert.match(r.erreurs[0], /Projets.*sans.*Affaires/);
    assert.deepEqual(modulesActifsDuClient({ modules: { crm: 'true' } }).actifs, [], 'seul `true` allume');
    assert.deepEqual(modulesActifsDuClient({ modules: { crm: true, factures: true } }).erreurs, ['Module inconnu : « factures ».']);
    assert.ok(!IDS_MODULES.includes('crm'), '« crm » est un interrupteur, pas un module technique : aucune donnée, aucune route à lui');
  });
  test('l\'interface déclare un interrupteur par bloc (CRM = affaires + projets)', () => {
    const lignes = interrupteursDuClient(['affaires', 'projets', 'mcp']);
    assert.deepEqual(lignes.map((l) => [l.id, l.actif, l.complet]), [['crm', true, true], ['veille', false, false], ['automatisations', false, false], ['tableaudebord', false, false], ['mcp', true, true]]);
    assert.deepEqual(interrupteursDuClient(['affaires']).find((l) => l.id === 'crm'), { id: 'crm', libelle: 'CRM', modules: ['affaires', 'projets'], actif: true, complet: false });
    assert.deepEqual(interrupteursDuClient([]).filter((l) => l.actif), []);
  });
});

describe('Réglages à menu latéral (2.6.0) : ce que chaque module déclare', () => {
  const lireModule = (dossier) => readdirSync(join(RACINE, 'js/modules', dossier)).filter((f) => f.endsWith('.js')).map((f) => lire(`js/modules/${dossier}/${f}`)).join('\n');
  const SOURCES = { affaires: 'crm', projets: 'projets', mcp: 'mcp' };

  test('chaque module déclare ses réglages : des sections (id « reglages-… », libellé) ou un résumé s\'il n\'en a pas', () => {
    for (const m of MODULES_DECLARES) {
      assert.ok(m.reglages && Array.isArray(m.reglages.sections), `${m.id} : reglages manquant`);
      if (!m.reglages.sections.length) assert.ok(m.reglages.resume, `${m.id} : aucun réglage, il faut un résumé`);
      for (const s of m.reglages.sections) assert.ok(/^reglages-[a-z-]+$/.test(s.id) && s.libelle, `${m.id} ${s.id}`);
    }
    const ids = MODULES_DECLARES.flatMap((m) => m.reglages.sections.map((s) => s.id));
    assert.equal(new Set(ids).size, ids.length, 'identifiants de section uniques entre modules');
  });
  test('chaque section déclarée existe dans le code du module, et chaque section que le module écrit est déclarée', () => {
    for (const [idModule, dossier] of Object.entries(SOURCES)) {
      const code = lireModule(dossier);
      const declarees = moduleDeclare(idModule).reglages.sections.map((s) => s.id);
      for (const id of declarees) assert.ok(code.includes(`'${id}'`), `${idModule} : « ${id} » déclarée mais absente du code`);
      const ecrites = [...code.matchAll(/(?:section|h\('section', \{ class: 'carte-section', id:)\(?\s*'(reglages-[a-z-]+)'/g)].map((x) => x[1]);
      for (const id of ecrites) assert.ok(declarees.includes(id), `${idModule} : « ${id} » écrite mais pas déclarée dans registre.js`);
    }
  });
  test('Réglages du CRM : un seul élément « CRM » pour affaires + projets, sections rangées dans l\'ordre du groupe, modèles de projets compris', () => {
    const [crm] = reglagesDesModules(['affaires', 'projets']);
    assert.equal(crm.id, 'crm');
    assert.equal(crm.libelle, 'CRM');
    assert.deepEqual(crm.modules, ['affaires', 'projets']);
    const ids = crm.sections.map((s) => s.id);
    assert.deepEqual(ids, GROUPES_MENU[0].ordreReglages.filter((id) => ids.includes(id)));
    assert.ok(ids.includes('reglages-modeles-projets') && ids.includes('reglages-etapes') && ids.includes('reglages-objectifs'));
    assert.ok(ids.indexOf('reglages-modeles-affaire') < ids.indexOf('reglages-modeles-projets'), 'les deux familles de modèles côte à côte');
    assert.equal(crm.ouvrir, 'crm/accueil');
    assert.ok(!reglagesDesModules(['affaires'])[0].sections.some((s) => s.id === 'reglages-modeles-projets'), 'projets éteint : pas de modèles de projets');
  });
  test('un élément par module actif, dans l\'ordre du menu ; un module sans réglage a un résumé', () => {
    const items = reglagesDesModules(['affaires', 'projets', 'veille', 'automatisations', 'mcp']);
    assert.deepEqual(items.map((i) => i.id), ['crm', 'veille', 'automatisations', 'mcp']);
    assert.deepEqual(items.map((i) => i.libelle), ['CRM', 'Veille', 'Automatisations', 'Assistant (MCP)']);
    assert.match(items[1].resume, /Aucun réglage/);
    assert.deepEqual(items[1].sections, []);
    assert.deepEqual(reglagesDesModules([]), []);
  });
  test('réglages de l\'espace : « Mon espace » pour tous, membres et modules réservés aux éditeurs, membres seulement chez un client', () => {
    assert.deepEqual(SECTIONS_ESPACE.map((s) => s.id), ['espace', 'membres', 'modules']);
    const ids = (o) => sectionsEspaceVisibles(o).map((s) => s.id);
    assert.deepEqual(ids({ chezClient: true, editeur: true }), ['espace', 'membres', 'modules']);
    assert.deepEqual(ids({ chezClient: true, editeur: false }), ['espace'], 'un lecteur ne voit pas les sections réservées aux éditeurs');
    assert.deepEqual(ids({ chezClient: false, editeur: true }), ['espace', 'modules'], 'à la racine il n\'y a pas de membres à gérer');
  });
  test('cibleReglages : arrivée sur la première section d\'espace ; section inconnue ou interdite = null', () => {
    const espaces = sectionsEspaceVisibles({ chezClient: true, editeur: false });
    const modules = reglagesDesModules(['affaires', 'projets']);
    assert.deepEqual(cibleReglages(['reglages'], { espaces, modules }), { type: 'espace', id: 'espace' });
    assert.deepEqual(cibleReglages(['reglages', 'crm'], { espaces, modules }), { type: 'module', id: 'crm' });
    assert.deepEqual(cibleReglages(['reglages', 'espace'], { espaces, modules }), { type: 'espace', id: 'espace' });
    assert.equal(cibleReglages(['reglages', 'membres'], { espaces, modules }), null);
    assert.equal(cibleReglages(['reglages', 'inconnu'], { espaces, modules }), null);
  });
  test('la coque ne connaît aucun module : js/os/reglages.js n\'importe rien de js/modules et ne cite aucun module par son nom', () => {
    const source = lire('js/os/reglages.js').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/modules\//.test(source.replace(/\.\/modules\.js/g, '')), 'aucun import de js/modules/…');
    for (const mot of ['crm', 'projets', 'affaires', 'veille', 'automatisations']) assert.ok(!new RegExp(`['"\`]${mot}['"\`]`).test(source), mot);
  });
  test('main.js et espace-modules.js passent par la même page (monterReglages) ; aucune section n\'est écrite dans main.js', () => {
    assert.match(lire('js/main.js'), /monterReglages/);
    assert.match(lire('js/os/espace-modules.js'), /monterReglages/);
    assert.ok(!/reglages: false/.test(lire('js/os/espace-modules.js')), 'les Réglages existent aussi chez un client');
    assert.ok(!/carte-section/.test(lire('js/main.js')));
  });
  test('rien n\'est déplacé : les collections et les documents de réglages du CRM sont ceux d\'avant (aucune migration)', () => {
    assert.deepEqual(moduleDeclare('affaires').collections, ['crm_personnes', 'crm_organisations', 'crm_affaires', 'crm_activites', 'crm_notes', 'crm_evenements', 'crm_parametres']);
    assert.deepEqual(moduleDeclare('projets').collections, ['projets_projets', 'projets_taches', 'projets_modeles']);
    assert.ok(!/firestore|setDoc|updateDoc|getDoc/.test(lire('js/os/reglages.js')), 'la page Réglages de la coque ne lit ni n\'écrit aucune donnée');
  });
});
