// Module Pilotage : les deux fonctions appelables (accès, visibilité des tuiles, cache, secret absent, aucune fuite) et le service. Tout en mémoire : faux Postgres, base en mémoire, aucun réseau.
// Adresses @example.test et noms de vues fictifs ; les « secrets » ci-dessous sont de fausses valeurs.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { creerAppelPilotageLire, creerAppelPilotageEnregistrer, ligneDeJournalPilotage } from '../functions/src/pilotage/appel.js';
import { creerServicePilotage, MESSAGE_TUILE } from '../functions/src/pilotage/service.js';
import { creerConnecteurPostgres, ErreurPostgres } from '../functions/src/pilotage/postgres.js';
import { ADMINISTRATEURS } from '../functions/partage/administrateur.js';
import { COMPTES_AUTORISES } from '../functions/src/veille/appel.js';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { restaurerOperation, COLLECTIONS_RESERVEES_SUPER_ADMINS } from '../functions/src/coeur/restaurer.js';
import { COLLECTIONS_ECRITES } from '../functions/src/coeur/ecriture.js';

const JEROME = ADMINISTRATEURS[0]; // l'administrateur du dépôt (js/os/administrateur.js) : lu depuis la source, jamais recopié ici
const BOT = COMPTES_AUTORISES.find((c) => !ADMINISTRATEURS.includes(c)); // le compte d'assistant : autorisé, mais pas administrateur
const OPTION = JSON.stringify({ xAxis: { type: 'category' }, yAxis: {}, series: [{ type: 'bar' }] });
const FAUX_SECRET = { hote: 'hote-secret.example.test', port: 6543, base: 'base_secrete', utilisateur: 'utilisateur_secret', mot_de_passe: 'mdp-secret-0123', ca: '-----BEGIN CERTIFICATE-----\nFAUX\n-----END CERTIFICATE-----' };
const VALEURS_SECRETES = ['hote-secret.example.test', 'base_secrete', 'utilisateur_secret', 'mdp-secret-0123', 'FAUX'];

const tuile = (id, en = {}) => ({ id, titre: `Titre ${id}`, vue: `v_${id}`, option: OPTION, ...en });
const reglagesDe = (tuiles, groupes = {}) => ({ groupes, tableau: { titre: 'Tableau test', tuiles } });
const jeton = (email, verifie = true) => ({ auth: { token: { email, email_verified: verifie } } });
const code = (promesse) => promesse.then(() => null, (e) => e.code);

/** Faux Postgres : enregistre chaque ouverture, chaque requête et chaque fermeture. */
function fauxPostgres({ lignes = (sql) => [{ sql_vue: sql.length }], echoue = () => false, delaiMs = 0 } = {}) {
  const etat = { ouvertures: 0, fermetures: 0, requetes: [] };
  let file = Promise.resolve();
  const connecter = async () => {
    etat.ouvertures += 1;
    return {
      async interroger(sql) {
        etat.requetes.push(sql);
        if (delaiMs) { file = file.then(() => new Promise((ok) => setTimeout(ok, delaiMs))); await file; } // lecture lente, une à la fois comme sur la vraie connexion
        if (echoue(sql)) throw new ErreurPostgres('requete', '42P01');
        return lignes(sql);
      },
      async fermer() { etat.fermetures += 1; },
    };
  };
  return { etat, connecter };
}

async function monter({ reglages, pg = fauxPostgres(), maintenant = () => 1_000_000 } = {}) {
  const collections = reglages ? { pilotage_parametres: [{ id: 'reglages', ...reglages, version: 1, modifieLe: new Date(0) }] } : {};
  const donnees = creerAccesMemoire(collections);
  const journal = [];
  const service = creerServicePilotage({ donnees: () => donnees, connecter: pg.connecter, maintenant });
  return {
    collections, pg, journal, service,
    lire: creerAppelPilotageLire({ service, journal: (e) => journal.push(e) }),
    enregistrer: creerAppelPilotageEnregistrer({ service, journal: (e) => journal.push(e) }),
  };
}

describe('1 accès à pilotageLire', () => {
  test('1.1 sans connexion : unauthenticated « Connexion nécessaire. »', async () => {
    const m = await monter({ reglages: reglagesDe([tuile('a')]) });
    await assert.rejects(m.lire({ data: {} }), (e) => e.code === 'unauthenticated' && e.message === 'Connexion nécessaire.');
    assert.equal(m.pg.etat.ouvertures, 0);
  });
  test('1.2 e-mail non vérifié : refusé', async () => {
    const m = await monter({ reglages: reglagesDe([tuile('a')]) });
    assert.equal(await code(m.lire({ ...jeton(JEROME, false), data: {} })), 'permission-denied');
  });
  test('1.3 compte inconnu : refusé, même pour une lecture simple', async () => {
    const m = await monter({ reglages: reglagesDe([tuile('a')]) });
    await assert.rejects(m.lire({ ...jeton('intrus@example.test'), data: {} }), (e) => e.code === 'permission-denied' && e.message === 'Ce compte n\'a pas accès au Pilotage.');
    assert.equal(m.pg.etat.requetes.length, 0);
    const refus = m.journal.find((l) => l.statut === 'refus');
    assert.ok(refus, 'une ligne de journal du serveur est laissée');
    assert.ok(!/example\.test|intrus/.test(JSON.stringify(refus)), 'sans adresse');
    assert.ok(!/example\.test|intrus/.test(ligneDeJournalPilotage(refus)));
  });
  test('1.4 le compte du bot lit les tuiles visibles de tous, mais n\'a pas apercu ni exporter ni l\'enregistrement', async () => {
    const m = await monter({ reglages: reglagesDe([tuile('a')]) });
    const r = await m.lire({ ...jeton(BOT), data: {} });
    assert.equal(r.tuiles.length, 1);
    assert.equal(await code(m.lire({ ...jeton(BOT), data: { exporter: true } })), 'permission-denied');
    assert.equal(await code(m.lire({ ...jeton(BOT), data: { apercu: reglagesDe([tuile('a')]) } })), 'permission-denied');
    assert.equal(await code(m.enregistrer({ ...jeton(BOT), data: { reglages: reglagesDe([tuile('a')]) } })), 'permission-denied');
  });
  test('1.5 inconnu, e-mail non vérifié de Jérôme et visiteur : apercu, exporter et enregistrement refusés', async () => {
    const m = await monter({ reglages: reglagesDe([tuile('a')]) });
    const attendu = [['permission-denied', jeton('intrus@example.test')], ['permission-denied', jeton(JEROME, false)], ['unauthenticated', {}]];
    for (const [codeAttendu, requete] of attendu) {
      assert.equal(await code(m.lire({ ...requete, data: { exporter: true } })), codeAttendu);
      assert.equal(await code(m.lire({ ...requete, data: { apercu: reglagesDe([tuile('a')]) } })), codeAttendu);
      assert.equal(await code(m.enregistrer({ ...requete, data: { reglages: reglagesDe([tuile('a')]) } })), codeAttendu);
    }
    assert.equal(m.pg.etat.requetes.length, 0);
    assert.equal(m.collections.pilotage_parametres[0].version, 1); // rien d'écrit
  });
  test('1.6 « éditeur client » simulé (compte inconnu) et lecteur : refusés partout', async () => {
    const m = await monter({ reglages: reglagesDe([tuile('a')]) });
    for (const email of ['editeur@client.example.test', 'lecteur@client.example.test']) {
      assert.equal(await code(m.lire({ ...jeton(email), data: {} })), 'permission-denied');
      assert.equal(await code(m.enregistrer({ ...jeton(email), data: { reglages: reglagesDe([]) } })), 'permission-denied');
    }
  });
});

describe('2 visibilité des tuiles (filtre côté serveur)', () => {
  const reglages = reglagesDe([
    tuile('pour_tous'),
    tuile('par_adresse', { visiblePour: ['Chef@Example.test'] }),
    tuile('par_groupe', { visiblePour: ['equipe'] }),
    tuile('groupe_inconnu', { visiblePour: ['fantome'] }),
  ], { equipe: [BOT] });

  test('2.1 une tuile sans visiblePour est visible par tous les appelants autorisés', async () => {
    const m = await monter({ reglages });
    const r = await m.lire({ ...jeton(BOT), data: {} });
    assert.ok(r.tuiles.some((t) => t.id === 'pour_tous'));
  });
  test('2.2 par groupe : le membre voit la tuile ; par adresse et groupe inconnu : jamais lues, ni renvoyées, ni dans erreurs', async () => {
    const m = await monter({ reglages });
    const r = await m.lire({ ...jeton(BOT), data: {} });
    assert.deepEqual(r.tuiles.map((t) => t.id).sort(), ['par_groupe', 'pour_tous']);
    assert.equal(m.pg.etat.requetes.length, 2);
    assert.ok(!m.pg.etat.requetes.some((s) => /par_adresse|groupe_inconnu/.test(s)), 'une tuile interdite n\'est jamais lue dans la base');
    assert.ok(!JSON.stringify(r).includes('par_adresse') && !JSON.stringify(r).includes('groupe_inconnu'));
  });
  test('2.3 par adresse (insensible à la casse) : Jérôme est nommé en majuscules dans le réglage', async () => {
    const m = await monter({ reglages: reglagesDe([tuile('perso', { visiblePour: [JEROME.toUpperCase()] })]) });
    const r = await m.lire({ ...jeton(JEROME), data: {} });
    assert.deepEqual(r.tuiles.map((t) => t.id), ['perso']);
  });
  test('2.4 une tuile interdite ne produit aucune erreur même si la base tomberait en panne', async () => {
    const pg = fauxPostgres({ echoue: () => true });
    const m = await monter({ reglages, pg });
    const r = await m.lire({ ...jeton(BOT), data: {} });
    assert.deepEqual(r.erreurs.map((e) => e.id).sort(), ['par_groupe', 'pour_tous']);
  });
  test('2.5 un nom de vue passé par le navigateur est ignoré ; seul apercu (Jérôme) apporte d\'autres vues', async () => {
    const m = await monter({ reglages: reglagesDe([tuile('a')]) });
    await m.lire({ ...jeton(BOT), data: { vue: 'v_autre', tuiles: [tuile('b')] } });
    assert.deepEqual(m.pg.etat.requetes, ['select * from "v_a" limit 200']);
    const r = await m.lire({ ...jeton(JEROME), data: { apercu: reglagesDe([tuile('brouillon', { visiblePour: ['personne@example.test'] })]) } });
    assert.deepEqual(r.tuiles.map((t) => t.id), ['brouillon']); // l'aperçu montre tout le brouillon
    assert.equal(m.pg.etat.requetes.at(-1), 'select * from "v_brouillon" limit 200');
  });
});

describe('3 lecture : cas vide, forme, cache, connexion unique', () => {
  test('3.1 aucun réglage : { titre: \'\', tuiles: [], erreurs: [] } sans toucher la base', async () => {
    const m = await monter({});
    assert.deepEqual(await m.lire({ ...jeton(BOT), data: {} }), { titre: '', tuiles: [], erreurs: [] });
    assert.equal(m.pg.etat.ouvertures, 0);
  });
  test('3.2 la réponse a la forme du contrat : option rendue en objet, lignes nettoyées', async () => {
    const pg = fauxPostgres({ lignes: () => [{ mois: '2026-01-01', total: 100, vide: undefined, d: new Date('2026-02-03T00:00:00Z') }] });
    const m = await monter({ reglages: reglagesDe([tuile('a', { tri: { colonne: 'mois', sens: 'asc' } })]), pg });
    const r = await m.lire({ ...jeton(BOT), data: {} });
    assert.equal(r.titre, 'Tableau test');
    assert.deepEqual(r.tuiles[0], { id: 'a', titre: 'Titre a', option: JSON.parse(OPTION), lignes: [{ mois: '2026-01-01', total: 100, vide: null, d: '2026-02-03T00:00:00.000Z' }] });
    assert.deepEqual(r.erreurs, []);
    assert.equal(pg.etat.requetes[0], 'select * from "v_a" order by "mois" asc limit 200');
  });
  test('3.3 plusieurs tuiles : UNE seule connexion, fermée à la fin', async () => {
    const m = await monter({ reglages: reglagesDe([tuile('a'), tuile('b'), tuile('c')]) });
    await m.lire({ ...jeton(BOT), data: {} });
    assert.equal(m.pg.etat.ouvertures, 1);
    assert.equal(m.pg.etat.fermetures, 1);
    assert.equal(m.pg.etat.requetes.length, 3);
  });
  test('3.4 une panne de requête ferme quand même la connexion', async () => {
    const pg = fauxPostgres({ echoue: () => true });
    const m = await monter({ reglages: reglagesDe([tuile('a'), tuile('b')]), pg });
    await m.lire({ ...jeton(BOT), data: {} });
    assert.equal(pg.etat.ouvertures, 1);
    assert.equal(pg.etat.fermetures, 1);
  });
  test('3.5 cache de 60 s par instance : deuxième lecture sans base, puis relecture après expiration', async () => {
    let t = 1_000_000;
    const m = await monter({ reglages: reglagesDe([tuile('a')]), maintenant: () => t });
    await m.lire({ ...jeton(BOT), data: {} });
    await m.lire({ ...jeton(BOT), data: {} });
    assert.equal(m.pg.etat.requetes.length, 1);
    assert.equal(m.pg.etat.ouvertures, 1); // le cache évite même la connexion
    t += 61_000;
    await m.lire({ ...jeton(BOT), data: {} });
    assert.equal(m.pg.etat.requetes.length, 2);
  });
  test('3.6 l\'aperçu n\'utilise pas le cache', async () => {
    const m = await monter({ reglages: reglagesDe([tuile('a')]) });
    const apercu = reglagesDe([tuile('a')]);
    await m.lire({ ...jeton(JEROME), data: { apercu } });
    await m.lire({ ...jeton(JEROME), data: { apercu } });
    assert.equal(m.pg.etat.requetes.length, 2);
  });
  test('3.7 un aperçu invalide : invalid-argument avec un message lisible, rien lu', async () => {
    const m = await monter({});
    await assert.rejects(m.lire({ ...jeton(JEROME), data: { apercu: reglagesDe([tuile('a', { vue: 'v_x; drop table x' })]) } }), (e) => e.code === 'invalid-argument' && /nom de la vue/.test(e.message));
    assert.equal(m.pg.etat.ouvertures, 0);
  });
  test('3.8 exporter : Jérôme reçoit le document enregistré, option en chaîne ; sans réglage : null', async () => {
    const m = await monter({ reglages: reglagesDe([tuile('a')]) });
    const r = await m.lire({ ...jeton(JEROME), data: { exporter: true } });
    assert.equal(typeof r.reglages.tableau.tuiles[0].option, 'string');
    assert.equal(r.reglages.version, 1);
    assert.equal(typeof r.reglages.modifieLe, 'string');
    assert.equal(m.pg.etat.ouvertures, 0);
    const vide = await monter({});
    assert.deepEqual(await vide.lire({ ...jeton(JEROME), data: { exporter: true } }), { reglages: null });
  });
  test('3.9 un réglage enregistré devenu invalide est signalé sans rien lire', async () => {
    const m = await monter({ reglages: reglagesDe([tuile('a', { vue: 'pg_catalog.pg_user' })]) });
    assert.equal(await code(m.lire({ ...jeton(BOT), data: {} })), 'failed-precondition');
    assert.equal(m.pg.etat.requetes.length, 0);
  });
});

describe('4 secret absent, panne de la base : aucune fuite', () => {
  const reglages = reglagesDe([tuile('a'), tuile('b')]);
  test('4.1 secret absent : toutes les tuiles visibles en erreur, message générique, pas d\'exception', async () => {
    const lireSecret = async () => { throw new Error(`NOT_FOUND: secret projects/${FAUX_SECRET.base}/secrets/SUPABASE_INDICATEURS`); };
    const donnees = creerAccesMemoire({ pilotage_parametres: [{ id: 'reglages', ...reglages, version: 1 }] });
    const service = creerServicePilotage({ donnees: () => donnees, connecter: creerConnecteurPostgres({ lireSecret, clientPg: {} }) });
    const lire = creerAppelPilotageLire({ service });
    const r = await lire({ ...jeton(BOT), data: {} });
    assert.deepEqual(r.erreurs, [{ id: 'a', message: MESSAGE_TUILE }, { id: 'b', message: MESSAGE_TUILE }]);
    assert.deepEqual(r.tuiles.map((t) => t.lignes), [[], []]);
    assert.ok(!JSON.stringify(r).includes('NOT_FOUND') && !JSON.stringify(r).includes(FAUX_SECRET.base));
  });
  test('4.2 une erreur de pg qui cite l\'hôte et l\'utilisateur ne sort jamais (réponse, erreurs, journal)', async () => {
    const piege = `connect ECONNREFUSED ${FAUX_SECRET.hote}:6543 for user ${FAUX_SECRET.utilisateur} password ${FAUX_SECRET.mot_de_passe}`;
    class FauxClient {
      on() {}
      async connect() { throw Object.assign(new Error(piege), { code: 'ECONNREFUSED' }); }
      async end() {}
    }
    const journaux = [];
    const donnees = creerAccesMemoire({ pilotage_parametres: [{ id: 'reglages', ...reglages, version: 1 }] });
    const service = creerServicePilotage({
      donnees: () => donnees, journalErreur: (type, etat) => journaux.push(ligneDeJournalPilotage({ action: 'lecture', statut: 'erreur', type, etat })),
      connecter: creerConnecteurPostgres({ lireSecret: async () => JSON.stringify(FAUX_SECRET), clientPg: { Client: FauxClient, types: { getTypeParser: () => (x) => x } } }),
    });
    const lire = creerAppelPilotageLire({ service, journal: (e) => journaux.push(ligneDeJournalPilotage(e)) });
    const r = await lire({ ...jeton(BOT), data: {} });
    assert.equal(r.erreurs.length, 2);
    const tout = JSON.stringify(r) + journaux.join('\n');
    for (const v of VALEURS_SECRETES) assert.ok(!tout.includes(v), `fuite de ${v}`);
    assert.ok(!tout.includes('ECONNREFUSED'));
  });
  test('4.3 une erreur inattendue de la base de données Firestore devient une phrase neutre', async () => {
    const service = creerServicePilotage({ donnees: () => ({ document: async () => { throw new Error('détail interne secret-xyz'); } }), connecter: fauxPostgres().connecter });
    const lire = creerAppelPilotageLire({ service });
    await assert.rejects(lire({ ...jeton(BOT), data: {} }), (e) => e.code === 'internal' && e.message === 'Une erreur est survenue. Réessaie.' && !/xyz/.test(e.message));
  });
  test('4.4 la ligne de journal du serveur ne contient ni adresse ni vue ni donnée', () => {
    const l = ligneDeJournalPilotage({ action: 'lire', statut: 'ok', dureeMs: 12, tuiles: 2, erreurs: 0, email: 'x@example.test', vue: 'v_exemple', lignes: [1] });
    assert.ok(!/example\.test|v_exemple|lignes/.test(l));
  });
});

describe('5 pilotageEnregistrerReglages', () => {
  test('5.1 Jérôme enregistre : validation, version 1 puis 2, document complet remplacé, ligne de journal laissée', async () => {
    const m = await monter({});
    const r1 = await m.enregistrer({ ...jeton(JEROME), data: { reglages: reglagesDe([tuile('a')]) } });
    assert.deepEqual(r1, { ok: true, version: 1, tuiles: 1 });
    const r2 = await m.enregistrer({ ...jeton(JEROME), data: { reglages: reglagesDe([tuile('b'), tuile('c')]) } });
    assert.equal(r2.version, 2);
    const doc = m.collections.pilotage_parametres.find((d) => d.id === 'reglages');
    assert.deepEqual(doc.tableau.tuiles.map((t) => t.id), ['b', 'c']); // remplacé, pas fusionné
    assert.equal(doc.version, 2);
    assert.ok(doc.modifieLe instanceof Date);
    const audit = m.collections.crm_audit;
    assert.equal(audit.length, 2);
    assert.equal(audit[0].collection, 'pilotage_parametres');
    assert.equal(audit[0].outil, 'pilotageEnregistrerReglages');
    assert.equal(audit[1].action, 'modifier');
    assert.equal(m.collections.crm_audit_avant, undefined); // aucune copie « avant » : le réglage n'entre jamais dans le journal
  });
  test('5.2 réglage invalide : invalid-argument, message lisible, rien écrit ; la version ne bouge pas', async () => {
    const m = await monter({ reglages: reglagesDe([tuile('a')]) });
    await assert.rejects(m.enregistrer({ ...jeton(JEROME), data: { reglages: reglagesDe([tuile('a', { option: '{"title":{"text":"https://x.test"}}' })]) } }), (e) => e.code === 'invalid-argument' && /Tuile « a »/.test(e.message));
    assert.equal(m.collections.pilotage_parametres[0].version, 1);
    assert.equal(m.collections.crm_audit, undefined);
  });
  test('5.3 le client envoie sa propre version ou sa date : ignorées', async () => {
    const m = await monter({});
    await m.enregistrer({ ...jeton(JEROME), data: { reglages: { ...reglagesDe([tuile('a')]), version: 99, modifieLe: 'hier' } } });
    assert.equal(m.collections.pilotage_parametres[0].version, 1);
    assert.ok(m.collections.pilotage_parametres[0].modifieLe instanceof Date);
  });
  test('5.4 sans connexion : unauthenticated', async () => {
    const m = await monter({});
    assert.equal(await code(m.enregistrer({ data: { reglages: reglagesDe([]) } })), 'unauthenticated');
  });
});

describe('6 journal sans valeur et restauration refusée', () => {
  const sensible = reglagesDe([tuile('secret_vue', { visiblePour: ['confident@example.test', 'cercle'], titre: 'Titre confidentiel' })], { cercle: ['membre-prive@example.test'] });
  test('6.1 la ligne de journal ne contient aucune valeur du réglage (adresse, groupe, vue, titre, option) et il n\'y a aucune copie « avant »', async () => {
    const m = await monter({});
    await m.enregistrer({ ...jeton(JEROME), data: { reglages: sensible } });
    await m.enregistrer({ ...jeton(JEROME), data: { reglages: sensible } });
    assert.equal(m.collections.crm_audit_avant, undefined);
    const tout = JSON.stringify(m.collections.crm_audit);
    for (const v of ['confident@example.test', 'membre-prive', 'cercle', 'secret_vue', 'Titre confidentiel', 'xAxis']) assert.ok(!tout.includes(v), `fuite de ${v} dans le journal`);
    const l = m.collections.crm_audit[1];
    assert.equal(l.versionAvant, 1);
    assert.equal(l.versionApres, 2);
    assert.equal(l.nombreTuiles, 1);
    assert.ok(l.operationId);
    assert.equal(l.outil, 'pilotageEnregistrerReglages');
  });
  test('6.2 restaurer_depuis_audit ne peut pas rétablir le réglage : refusé sans compte super admin, rien d\'écrit', async () => {
    const m = await monter({});
    await m.enregistrer({ ...jeton(JEROME), data: { reglages: sensible } });
    const donnees = creerAccesMemoire(m.collections);
    const operationId = m.collections.crm_audit[0].operationId;
    const avant = JSON.stringify(m.collections.pilotage_parametres);
    const ctx = { acteur: BOT, via: 'mcp', maintenant: new Date() };
    await assert.rejects(restaurerOperation({ donnees, ctx, operationId, apercu: false, forcer: true }), (e) => e.code === 'restauration_refusee');
    await assert.rejects(restaurerOperation({ donnees, ctx, operationId, apercu: true }), (e) => e.code === 'restauration_refusee');
    assert.equal(JSON.stringify(m.collections.pilotage_parametres), avant);
    assert.ok(COLLECTIONS_RESERVEES_SUPER_ADMINS.includes('pilotage_parametres'));
  });
  test('6.3 même un super admin, avec une ligne de journal et une copie forgées et forcer: true : plan_invalide, document inchangé ; la table n\'est pas écrivable par le moteur', async () => {
    const m = await monter({ reglages: reglagesDe([tuile('a')]) });
    const actuel = m.collections.pilotage_parametres[0];
    m.collections.crm_audit = [{ id: 'forge1', operationId: 'op_forgee', ordre: 1, date: new Date(), acteur: BOT, jeton: BOT, via: 'mcp', outil: 'autre_outil', collection: 'pilotage_parametres', docId: 'reglages', action: 'modifier', statut: 'succes', champsModifies: ['tableau'] }];
    m.collections.crm_audit_avant = [{ id: 'forge1', operationId: 'op_forgee', collection: 'pilotage_parametres', docId: 'reglages', avant: reglagesDe([tuile('pirate', { visiblePour: ['intrus@example.test'] })]), apres: actuel, expireAt: new Date(Date.now() + 1e9) }];
    const avant = JSON.stringify(m.collections.pilotage_parametres);
    const donnees = creerAccesMemoire(m.collections);
    await assert.rejects(restaurerOperation({ donnees, ctx: { acteur: JEROME, via: 'mcp', maintenant: new Date() }, operationId: 'op_forgee', apercu: false, forcer: true, superAdmin: true }), (e) => e.code === 'plan_invalide');
    assert.equal(JSON.stringify(m.collections.pilotage_parametres), avant);
    assert.ok(!COLLECTIONS_ECRITES.includes('pilotage_parametres'));
  });
});

describe('7 exporter avec un réglage devenu invalide', () => {
  test('7.1 le document brut est rendu avec invalide: true (au lieu d\'une erreur) ; la lecture normale reste en failed-precondition', async () => {
    const m = await monter({ reglages: reglagesDe([tuile('a', { vue: 'pg_catalog.pg_user' })]) });
    const r = await m.lire({ ...jeton(JEROME), data: { exporter: true } });
    assert.equal(r.invalide, true);
    assert.equal(r.reglages.tableau.tuiles[0].vue, 'pg_catalog.pg_user');
    assert.equal(r.reglages.version, 1);
    assert.equal(await code(m.lire({ ...jeton(JEROME), data: {} })), 'failed-precondition');
  });
  test('7.2 un réglage valide : pas de drapeau invalide', async () => {
    const m = await monter({ reglages: reglagesDe([tuile('a')]) });
    assert.equal('invalide' in (await m.lire({ ...jeton(JEROME), data: { exporter: true } })), false);
  });
});

describe('8 budget de temps global', () => {
  test('8.1 passé le budget, les tuiles restantes sont en erreur générique, la connexion est fermée et la réponse part avec ce qui est lu', async () => {
    // faux client lent : chaque lecture dure 60 ms, budget de 100 ms pour 5 tuiles lues en série
    const pg = fauxPostgres({ delaiMs: 60 });
    const donnees = creerAccesMemoire({ pilotage_parametres: [{ id: 'reglages', ...reglagesDe(['a', 'b', 'c', 'd', 'e'].map((i) => tuile(i))), version: 1 }] });
    const service = creerServicePilotage({ donnees: () => donnees, connecter: pg.connecter, budgetMs: 100, delaiFermetureMs: 50 });
    const t0 = Date.now();
    const r = await creerAppelPilotageLire({ service })({ ...jeton(BOT), data: {} });
    assert.ok(Date.now() - t0 < 1000);
    assert.equal(r.tuiles.length, 5);
    assert.deepEqual(r.erreurs.map((e) => e.id).sort(), r.tuiles.filter((t) => t.lignes.length === 0).map((t) => t.id).sort());
    assert.ok(r.erreurs.length >= 1 && r.erreurs.length < 5, 'certaines tuiles lues, les autres en erreur');
    assert.ok(r.erreurs.every((e) => e.message === MESSAGE_TUILE));
    assert.equal(pg.etat.ouvertures, 1);
    assert.equal(pg.etat.fermetures, 1);
  });
  test('8.2 un budget non dépassé ne change rien', async () => {
    const m = await monter({ reglages: reglagesDe([tuile('a'), tuile('b')]) });
    const r = await m.lire({ ...jeton(BOT), data: {} });
    assert.deepEqual(r.erreurs, []);
  });
});
