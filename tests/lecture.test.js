// Tests de la lecture du CRM par le serveur MCP (étape 3) : mêmes règles que l'écran, aucune écriture, aucune donnée réelle.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import * as L from '../functions/partage/logique.js';
import { creerAccesMemoire, avecBase } from '../functions/src/coeur/donnees.js';
import * as lecture from '../functions/src/coeur/lecture.js';
import { serialiser } from '../functions/src/coeur/serialisation.js';
import { OUTILS } from '../functions/src/mcp/outils/index.js';
import { OUTILS_LECTURE } from '../functions/src/mcp/outils/lecture.js';
import { OUTILS_PROPOSITIONS_LECTURE } from '../functions/src/mcp/outils/propositions.js';
import { qui_suis_je } from '../functions/src/mcp/outils/identite.js';
import { collections, MAINTENANT } from './_donnees-essai.js';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const donnees = creerAccesMemoire(collections);
const ids = (liste) => liste.map((x) => x.id);

describe('Plus de pause : une ancienne donnée « en_pause » est rendue comme ouverte / active', () => {
  const base = structuredClone(collections);
  base.crm_affaires = [...base.crm_affaires, { ...structuredClone(base.crm_affaires[0]), id: 'vieille', statut: 'en_pause', dateReveil: '2026-12-01', archive: false }];
  base.projets_projets = [...(base.projets_projets || []), { id: 'pr-vieux', titre: 'Vieux projet', statut: 'en_pause', phase: 'lancement', archive: false, affaireId: null, personneId: null, organisationId: null, factures: [] }];
  const d = creerAccesMemoire(base);
  test('lire_affaire et lister_affaires rendent « ouverte » ; lire_projet et lister_projets rendent « actif »', async () => {
    assert.equal((await lecture.lireAffaire(d, { id: 'vieille' })).affaire.statut, 'ouverte');
    const l = (await lecture.listerAffaires(d, {}, MAINTENANT)).affaires.find((x) => x.id === 'vieille');
    assert.equal(l.statut, 'ouverte');
    assert.equal((await lecture.lireProjet(d, { id: 'pr-vieux' })).projet.statut, 'actif');
    assert.equal((await lecture.listerProjets(d, {}, MAINTENANT)).projets.find((x) => x.id === 'pr-vieux').statut, 'actif');
  });
  test('un filtre statut ouverte / actif les trouve', async () => {
    assert.ok(ids((await lecture.listerAffaires(d, { statut: 'ouverte' }, MAINTENANT)).affaires).includes('vieille'));
    assert.ok(ids((await lecture.listerProjets(d, { statut: 'actif' }, MAINTENANT)).projets).includes('pr-vieux'));
  });
});

describe('Copie partagée de logique.js (test 12)', () => {
  test('functions/partage/logique.js est identique, octet pour octet, à js/modules/crm/logique.js', () => {
    assert.equal(readFileSync(join(RACINE, 'functions/partage/logique.js'), 'utf8'), readFileSync(join(RACINE, 'js/modules/crm/logique.js'), 'utf8'));
  });
  test('logique.js ne dépend d’aucune API de navigateur ni de Firebase (elle s’exécute telle quelle sous Node)', () => {
    const t = readFileSync(join(RACINE, 'js/modules/crm/logique.js'), 'utf8');
    assert.doesNotMatch(t, /^import /m);
    assert.doesNotMatch(t, /\b(window|document|localStorage|navigator)\b\./);
  });
});

describe('chercher', () => {
  test('accents et casse ignorés ; une personne se trouve par son nom, son organisation ou son e-mail', async () => {
    assert.deepEqual((await lecture.chercher(donnees, { texte: 'elodie', types: ['personnes'] })).resultats.map((r) => r.id), ['p2']);
    assert.ok((await lecture.chercher(donnees, { texte: 'elodie' })).resultats.some((r) => r.type === 'affaires' && r.id === 'a2'), 'ses affaires aussi, par le nom de la personne');
    assert.ok((await lecture.chercher(donnees, { texte: 'LILAS' })).resultats.some((r) => r.id === 'org1'));
    assert.ok((await lecture.chercher(donnees, { texte: 'camille@exemple' })).resultats.some((r) => r.id === 'p1'));
  });
  test('moins de 2 lettres : aucun résultat et un message ; les fiches archivées ne sont jamais proposées', async () => {
    const court = await lecture.chercher(donnees, { texte: 'a' });
    assert.deepEqual(court.resultats, []);
    assert.match(court.message, /2 lettres/);
    assert.equal((await lecture.chercher(donnees, { texte: 'archiv' })).resultats.length, 0);
  });
  test('le filtre par type limite les résultats', async () => {
    const r = await lecture.chercher(donnees, { texte: 'lilas', types: ['affaires'] });
    assert.ok(r.resultats.every((x) => x.type === 'affaires'));
    assert.deepEqual(ids(r.resultats).sort(), ['a1', 'a3']);
  });
  test('parité avec l’écran : même ordre et mêmes résultats que rechercherSuggestions sur les mêmes données', async () => {
    const attendu = L.rechercherSuggestions('atelier', collections.crm_affaires.filter((a) => !a.archive).map((a) => ({
      id: a.id, libelle: a.titre,
      sousTitre: [collections.crm_organisations.find((o) => o.id === a.organisationId)?.nom, collections.crm_personnes.find((p) => p.id === a.personneId)?.nom].filter(Boolean).join(' · '),
      extra: [collections.crm_organisations.find((o) => o.id === a.organisationId)?.nom, collections.crm_personnes.find((p) => p.id === a.personneId)?.nom].filter(Boolean),
    }))).resultats.map((r) => r.id);
    const obtenu = (await lecture.chercher(donnees, { texte: 'atelier', types: ['affaires'] })).resultats.map((r) => r.id);
    assert.deepEqual(obtenu, attendu);
  });
});

describe('Fiches', () => {
  test('lire_personne : fiche, organisation, affaires et activités ; le fil n’est joint que sur demande', async () => {
    const sans = await lecture.lirePersonne(donnees, { id: 'p1' });
    assert.equal(sans.personne.nom, 'Camille Durand');
    assert.deepEqual(sans.organisation, { id: 'org1', nom: 'Atelier des Lilas' });
    assert.deepEqual(ids(sans.affaires).sort(), ['a1', 'a3']);
    assert.equal(sans.fil, undefined);
    const avec = await lecture.lirePersonne(donnees, { id: 'p1', avecFil: true });
    assert.ok(avec.fil.length >= 3);
    const dates = avec.fil.map((e) => e.date);
    assert.deepEqual(dates, [...dates].sort().reverse(), 'du plus récent au plus ancien');
    assert.ok(avec.fil.some((e) => e.genre === 'note') && avec.fil.some((e) => e.genre === 'evenement') && avec.fil.some((e) => e.genre === 'activite'));
  });
  test('lire_affaire et lire_organisation', async () => {
    const a = await lecture.lireAffaire(donnees, { id: 'a1', avecFil: true });
    assert.equal(a.personne.nom, 'Camille Durand');
    assert.equal(a.organisation.nom, 'Atelier des Lilas');
    assert.deepEqual(ids(a.activites).sort(), ['ac1', 'ac3']);
    const o = await lecture.lireOrganisation(donnees, { id: 'org1' });
    assert.deepEqual(ids(o.personnes), ['p1']);
    assert.deepEqual(ids(o.affaires).sort(), ['a1', 'a3']);
  });
  test('identifiant inconnu : erreur claire, sans détail technique', async () => {
    await assert.rejects(() => lecture.lirePersonne(donnees, { id: 'zzz' }), /Personne introuvable/);
    await assert.rejects(() => lecture.lireAffaire(donnees, { id: 'zzz' }), /Affaire introuvable/);
    await assert.rejects(() => lecture.lireOrganisation(donnees, { id: 'zzz' }), /Organisation introuvable/);
  });
  test('les dates sortent en texte ISO (jamais de Timestamp)', async () => {
    const a = await lecture.lireAffaire(donnees, { id: 'a1' });
    assert.equal(a.affaire.creeLe, '2026-09-10T08:00:00.000Z');
    assert.equal(JSON.stringify(a).includes('"seconds"'), false);
  });
});

describe('Listes', () => {
  test('lister_affaires : par défaut les non archivées ; archive=true les archivées', async () => {
    assert.deepEqual(ids((await lecture.listerAffaires(donnees, {}, MAINTENANT)).affaires).sort(), ['a1', 'a2', 'a3']);
    assert.deepEqual(ids((await lecture.listerAffaires(donnees, { archive: true }, MAINTENANT)).affaires), ['a4']);
  });
  test('lister_affaires : filtres étape, statut, personne, organisation et recherche, avec noms résolus', async () => {
    assert.deepEqual(ids((await lecture.listerAffaires(donnees, { etape: 'gagne' }, MAINTENANT)).affaires), ['a2']);
    assert.deepEqual(ids((await lecture.listerAffaires(donnees, { statut: 'perdue' }, MAINTENANT)).affaires), ['a3']);
    assert.deepEqual(ids((await lecture.listerAffaires(donnees, { personneId: 'p1' }, MAINTENANT)).affaires).sort(), ['a1', 'a3']);
    assert.deepEqual(ids((await lecture.listerAffaires(donnees, { organisationId: 'org2' }, MAINTENANT)).affaires), ['a2']);
    const r = (await lecture.listerAffaires(donnees, { recherche: 'boulangerie' }, MAINTENANT)).affaires;
    assert.deepEqual(ids(r), ['a2']);
    assert.equal(r[0].organisation, 'Boulangerie Martin');
    assert.equal(r[0].personne, 'Élodie Bernard');
  });
  test('lister_affaires : « en retard » et « sans action » comme sur l’écran (jour courant de Paris)', async () => {
    assert.deepEqual(ids((await lecture.listerAffaires(donnees, { enRetard: true }, MAINTENANT)).affaires), ['a1']);
    assert.deepEqual(ids((await lecture.listerAffaires(donnees, { sansAction: true }, MAINTENANT)).affaires), []);
  });
  test('parité avec l’écran : mêmes affaires que filtrerAffaires sur les mêmes critères', async () => {
    const criteres = { etapes: ['proposition_envoyee', 'gagne'], archives: false };
    const attendu = ids(L.filtrerAffaires(collections.crm_affaires, criteres, {
      activites: collections.crm_activites, personnes: collections.crm_personnes, organisations: collections.crm_organisations, aujourdhui: L.aujourdhuiParis(MAINTENANT),
    })).sort();
    const obtenu = [...ids((await lecture.listerAffaires(donnees, { etape: 'gagne' }, MAINTENANT)).affaires), ...ids((await lecture.listerAffaires(donnees, { etape: 'proposition_envoyee' }, MAINTENANT)).affaires)].sort();
    assert.deepEqual(obtenu, attendu);
  });
  test('la limite tronque et le signale', async () => {
    const r = await lecture.listerAffaires(donnees, { limite: 2 }, MAINTENANT);
    assert.equal(r.affaires.length, 2);
    assert.equal(r.total, 3);
    assert.equal(r.tronque, true);
  });
  test('lister_activites : par lien, faites ou à faire, en retard ; triées par date', async () => {
    assert.deepEqual(ids((await lecture.listerActivites(donnees, { affaireId: 'a1' }, MAINTENANT)).activites), ['ac3', 'ac1']);
    assert.deepEqual(ids((await lecture.listerActivites(donnees, { fait: false }, MAINTENANT)).activites), ['ac1', 'ac2', 'ac4']);
    assert.deepEqual(ids((await lecture.listerActivites(donnees, { fait: true }, MAINTENANT)).activites), ['ac3']);
    assert.deepEqual(ids((await lecture.listerActivites(donnees, { enRetard: true }, MAINTENANT)).activites), ['ac1']);
    assert.deepEqual(ids((await lecture.listerActivites(donnees, { personneId: 'p2' }, MAINTENANT)).activites).sort(), ['ac2', 'ac4']);
  });
  test('lister_documents : tous ou ceux d’une affaire', async () => {
    const tous = await lecture.listerDocuments(donnees, {});
    assert.equal(tous.total, 1);
    assert.deepEqual(tous.documents[0], { affaireId: 'a1', titreAffaire: 'Site vitrine Atelier des Lilas', index: 0, libelle: 'Devis', url: 'https://exemple.test/devis', favori: false });
    assert.equal((await lecture.listerDocuments(donnees, { affaireId: 'a2' })).total, 0);
    assert.equal((await lecture.listerDocuments(donnees, { projetId: 'inconnu' })).total, 0, 'un projet inconnu ne renvoie rien');
  });
  test('I10 lister_documents renvoie la date d’ajout (ajouteLe) quand elle existe, et rien pour un ancien document', async () => {
    const faux = { liste: async () => [{ id: 'a9', titre: 'Essai', documents: [{ libelle: 'Neuf', url: 'https://exemple.test/n', ajouteLe: '2026-10-21T20:30:00.000Z' }, { libelle: 'Ancien', url: 'https://exemple.test/a' }] }], document: async () => null };
    const r = await lecture.listerDocuments(faux, {});
    assert.equal(r.documents[0].ajouteLe, '2026-10-21T20:30:00.000Z');
    assert.equal('ajouteLe' in r.documents[1], false);
  });
});

describe('Réglages et audit', () => {
  test('lire_reglages : listes triées, réglages fusionnés avec les valeurs de départ, référentiels', async () => {
    const r = await lecture.lireReglages(donnees);
    assert.deepEqual(r.offres.map((o) => o.id), ['o1', 'o2']);
    assert.equal(r.reglages.delaiPaiementJours, 45);
    assert.equal(r.reglages.debutActivite, L.REGLAGES_JEROME.debutActivite);
    assert.ok(r.referentiels.etapes.some((e) => e.id === 'gagne'));
    assert.equal(r.configuration.etapes.length, 6, 'six emplacements d’étapes, actifs ou non');
    assert.deepEqual(r.configuration.etapes.filter((e) => e.roleGagnee).map((e) => e.id), ['gagne']);
    assert.deepEqual(r.configuration.phases.filter((p) => p.roleCloture).map((p) => p.id), ['cloture']);
    assert.equal(r.configuration.options.suiviPaiements, true, 'à la racine : les valeurs de Jérôme tant que rien n’est enregistré');
    assert.deepEqual(r.referentiels.projets.assignes.map((a) => a.id), ['jerome', 'charles']);
    assert.deepEqual(r.referentiels.statuts.map((s) => s.id), ['ouverte', 'gagnee', 'perdue']);
  });
  test('lire_reglages sur une base vide : valeurs de départ, aucune erreur', async () => {
    const r = await lecture.lireReglages(creerAccesMemoire({}));
    assert.deepEqual(r.offres, []);
    assert.deepEqual(r.reglages, JSON.parse(JSON.stringify(L.REGLAGES_JEROME)));
    const client = await lecture.lireReglages(creerAccesMemoire({}), { racine: false });
    const parBase = await lecture.lireReglages(avecBase(creerAccesMemoire({}), 'clients/acme'));
    assert.deepEqual(parBase.configuration, client.configuration, 'le serveur des clients (accès avecBase) lit une configuration neutre sans rien préciser');
    assert.deepEqual(client.reglages, JSON.parse(JSON.stringify(L.REGLAGES_NEUTRES)));
    assert.equal(client.configuration.options.suiviPaiements, false);
    assert.deepEqual(client.referentiels.etapes.map((e) => e.id), ['etape_1', 'etape_2', 'etape_3', 'etape_4', 'etape_5']);
    assert.equal('natures' in client.referentiels.projets, false, 'plus de filtre « Nature »');
  });
  test('lire_audit : filtres acteur, document, opération, date ; lignes « en_cours » signalées', async () => {
    assert.deepEqual(ids((await lecture.lireAudit(donnees, { acteur: 'claude-code-jerome' })).lignes), ['au3', 'au2'], 'du plus récent au plus ancien');
    assert.deepEqual(ids((await lecture.lireAudit(donnees, { docId: 'p1' })).lignes), ['au1']);
    assert.deepEqual(ids((await lecture.lireAudit(donnees, { operationId: 'op2' })).lignes), ['au3', 'au2']);
    assert.deepEqual(ids((await lecture.lireAudit(donnees, { depuis: '2026-10-05' })).lignes), ['au3', 'au2']);
    const incompletes = await lecture.lireAudit(donnees, { incompletes: true });
    assert.deepEqual(ids(incompletes.lignes), ['au2']);
    assert.equal((await lecture.lireAudit(donnees, {})).aVerifier, 1);
    await assert.rejects(() => lecture.lireAudit(donnees, { depuis: 'pas une date' }), /illisible/);
  });
  test('lire_audit sur une base sans audit : liste vide', async () => {
    const r = await lecture.lireAudit(creerAccesMemoire({}), {});
    assert.deepEqual(r, { total: 0, tronque: false, lignes: [], aVerifier: 0 });
  });
});

describe('Serialisation', () => {
  test('Timestamp (toDate ou seconds/nanoseconds) et Date en texte ISO, récursivement ; le reste est inchangé', () => {
    const ts = { toDate: () => new Date('2026-10-01T00:00:00Z') };
    const brut = { a: ts, b: { seconds: 1790000000, nanoseconds: 0 }, c: [new Date('2026-10-02T00:00:00Z')], d: '2026-10-03', e: null, f: 3 };
    const s = serialiser(brut);
    assert.equal(s.a, '2026-10-01T00:00:00.000Z');
    assert.equal(s.b, new Date(1790000000 * 1000).toISOString());
    assert.deepEqual(s.c, ['2026-10-02T00:00:00.000Z']);
    assert.equal(s.d, '2026-10-03');
    assert.equal(s.e, null);
    assert.equal(s.f, 3);
  });
});

describe('Lecture seule (garantie)', () => {
  test('aucun outil de lecture ni la couche de lecture ne contient d’écriture Firestore', () => {
    for (const f of ['functions/src/coeur/lecture.js', 'functions/src/mcp/outils/lecture.js']) {
      assert.doesNotMatch(readFileSync(join(RACINE, f), 'utf8'), /\.(set|update|delete|add|create)\(|batch\(|runTransaction|FieldValue|serverTimestamp/, f);
    }
  });
  test('la couche de lecture n’appelle jamais les méthodes d’écriture de l’accès aux données ; seuls le moteur, la restauration et les limites y ont droit', () => {
    for (const f of ['functions/src/coeur/lecture.js', 'functions/src/mcp/outils/lecture.js', 'functions/src/mcp/outils/identite.js']) {
      assert.doesNotMatch(readFileSync(join(RACINE, f), 'utf8'), /\b(appliquer|mettreAJour|nouvelId)\b/, f);
    }
    const dossier = join(RACINE, 'functions/src');
    const parcourir = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? parcourir(join(d, e.name)) : [join(d, e.name)]));
    // Les actions métier (metier.js) et le gestionnaire ne font que tirer des identifiants et confier l'écriture au moteur : jamais appliquer/mettreAJour.
    // oauth/magasin.js : seulement sa propre collection fermée `mcp_oauth` (jetons OAuth) ; un test statique (D8) vérifie qu'il ne touche à aucune donnée du CRM.
    // coeur/devis.js : les quatre transitions des devis (finaliser, changer de statut, nouvelle version, archiver), UNE transaction chacune (numéro, devis, version remplacée et journal
    // ensemble) ; il tire des identifiants mais n'utilise ni appliquer ni mettreAJour, et seul lui (avec donnees.js) appelle `.transaction(`.
    const autorises = ['coeur/donnees.js', 'coeur/ecriture.js', 'coeur/restaurer.js', 'securite/limites.js', 'securite/codes.js', 'oauth/magasin.js', 'coeur/propositions.js', 'coeur/devis.js'];
    // coeur/propositions.js : la décision d'une proposition (file « À valider »), une seule lecture-modification-écriture atomique, sans le moteur d'audit (voir functions/src/mcp/outils/propositions.js).
    for (const f of parcourir(dossier).filter((x) => /\.appliquer\(|\.mettreAJour\(/.test(readFileSync(x, 'utf8')))) {
      assert.ok(autorises.some((a) => f.endsWith(a)), `écriture hors du moteur : ${f}`);
    }
    for (const f of parcourir(dossier).filter((x) => /\.transaction\(/.test(readFileSync(x, 'utf8')))) {
      assert.ok(['coeur/donnees.js', 'coeur/devis.js', 'coeur/devis-email.js'].some((a) => f.endsWith(a)), `transaction hors de coeur/devis.js : ${f}`); // devis-email.js : « Préparer l'e-mail » (la demande, la lecture et la note du résultat : une transaction chacune, journal compris)
    }
    for (const f of parcourir(dossier).filter((x) => /\.nouvelId\(/.test(readFileSync(x, 'utf8')))) {
      assert.ok([...autorises, 'coeur/metier.js'].some((a) => f.endsWith(a)), `identifiants tirés hors du moteur et de metier.js : ${f}`);
    }
  });
  test('tous les outils de lecture sont ouverts aux trois profils, et ne sont pas les seuls outils enregistrés', () => {
    const lecteurs = [qui_suis_je, ...OUTILS_LECTURE, ...OUTILS_PROPOSITIONS_LECTURE];
    const noms = lecteurs.map((o) => o.nom).sort();
    assert.deepEqual(noms, ['chercher', 'chercher_article', 'diagnostiquer_fichiers', 'lire_affaire', 'lire_audit', 'lire_devis', 'lire_organisation', 'lire_personne', 'lire_projet', 'lire_proposition', 'lire_reglages', 'lire_reglages_devis', 'lister_activites', 'lister_affaires', 'lister_articles', 'lister_automatisations', 'lister_devis', 'lister_documents', 'lister_modeles_projet', 'lister_projets', 'lister_propositions', 'qui_suis_je']);
    for (const o of lecteurs) assert.deepEqual(o.profils, ['lecteur', 'bibliothecaire', 'claude-code'], o.nom);
    for (const o of OUTILS.filter((x) => !noms.includes(x.nom))) assert.ok(!o.profils.includes('lecteur'), `${o.nom} : le lecteur n’a aucun droit d’écriture`);
  });
  test('le code des fonctions ne référence jamais l’ancienne collection crm_prospects', () => {
    const dossier = join(RACINE, 'functions/src');
    const parcourir = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? parcourir(join(d, e.name)) : [join(d, e.name)]));
    for (const f of parcourir(dossier)) assert.doesNotMatch(readFileSync(f, 'utf8'), /crm_prospects/, f);
  });
});
