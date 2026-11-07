// Mode test, PR 2 (docs/cadrage-mode-test.md §5.2 à §5.6, §7, §8.2) : les outils de l'assistant (MCP) et la consigne côté serveur.
// De bout en bout par le protocole MCP, sur des données fictives en mémoire (aucun service Google, aucune donnée réelle). Le nom de chaque test commence par le numéro du critère du brief.
// Exemples chiffrés : 100 € hors taxes (un devis de test) et 1 200 € hors taxes (un devis réel).
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { creerGestionnaire } from '../functions/src/mcp/gestionnaire.js';
import { empreinte, creerMagasin } from '../functions/src/securite/jetons.js';
import { creerLimiteur } from '../functions/src/securite/limites.js';
import { creerAccesMemoire, COLLECTIONS as C } from '../functions/src/coeur/donnees.js';
import * as S from '../functions/src/coeur/devis.js';
import { nouveauDevis } from '../functions/partage/devis.js';
import { collections as base, MAINTENANT } from './_donnees-essai.js';
import { EMETTEUR_ESSAI, completerPourFinaliser } from './jeu-finalisation.js';

const JETONS = { lecteur: `cia_${'L'.repeat(43)}`, biblio: `cia_${'H'.repeat(43)}`, agent: `cia_${'A'.repeat(43)}`, code: `cia_${'C'.repeat(43)}` };
const entree = (jeton, nom, profil, extra = {}) => ({ jeton: nom, acteur: nom, profil, empreinte: empreinte(jeton), actif: true, ...extra });
const arrets = [];
afterEach(async () => { while (arrets.length) await arrets.pop()(); });

/** Un devis déjà finalisé (statut, totaux figés), rattaché à l'affaire `affaireId`. `ht` : total hors taxes figé. */
const devisFige = (id, { ht, statut = 'accepte', affaireId = 'a1', racineId = id, version = 1, test, articleId = 'art1', numero = `DEV-2026-10-01-${id}` } = {}) => ({
  id, racineId, version, numero, statut, affaireId, organisationId: 'org1', personneId: null, objet: `Objet ${id}`, nom: '', destinataires: [{ email: 'client@exemple.test' }],
  modeMarge: 'majoration', marge: 0, tauxTvaDefaut: 20, regimeTva: 'assujetti', archive: false, creeLe: new Date('2026-10-01T08:00:00Z'), finaliseLe: new Date('2026-10-02T08:00:00Z'),
  expireLe: '2027-01-22', totaux: { ht, ttc: ht * 1.2, tva: ht * 0.2 },
  sections: [{ id: `s-${id}`, titre: '', lignes: [{ id: `l-${id}`, articleId, libelle: 'Forfait', unite: 'forfait', quantite: 1, prixAchat: ht, prixVente: ht }] }],
  ...(test === undefined ? {} : { test }),
});
const brouillonEnregistre = (id, extra = {}) => ({ ...devisFige(id, { ht: 0, statut: 'brouillon' }), numero: null, finaliseLe: null, totaux: undefined, ...extra });

async function demarrer({ devis = [], jetonsExtra = {}, fiches = (c) => c } = {}) {
  const collections = structuredClone(base);
  Object.assign(collections, {
    devis_articles: [], devis_devis: devis.map((d) => structuredClone(d)), devis_compteurs: [], devis_usage_articles: [], projets_projets: [], projets_taches: [], projets_modeles: [],
    devis_parametres: [{ id: 'reglages', regimeTva: 'assujetti', marge: 0, modeMarge: 'majoration', entreprise: EMETTEUR_ESSAI }],
  });
  collections.crm_parametres.push({ id: 'etiquettes', items: [] });
  collections.crm_affaires.push(
    { id: 'a5', titre: 'Gagnée 5', personneId: 'p2', organisationId: 'org2', etape: 'gagne', statut: 'gagnee', archive: false, creeLe: new Date('2026-09-12T08:00:00Z') },
    { id: 'a6', titre: 'Gagnée 6', personneId: 'p2', organisationId: 'org2', etape: 'gagne', statut: 'gagnee', archive: false, creeLe: new Date('2026-09-12T08:00:00Z') },
    { id: 'a7', titre: 'Gagnée 7', personneId: 'p2', organisationId: 'org2', etape: 'gagne', statut: 'gagnee', archive: false, creeLe: new Date('2026-09-12T08:00:00Z') },
  );
  fiches(collections);
  const donnees = creerAccesMemoire(collections);
  const horloge = { t: MAINTENANT.getTime() };
  const secret = JSON.stringify([
    entree(JETONS.lecteur, 'lecteur-essai', 'lecteur'),
    entree(JETONS.biblio, 'hermes-bibliothecaire', 'bibliothecaire', jetonsExtra.biblio),
    entree(JETONS.agent, 'n8n-devis-essai', 'agent-devis'),
    entree(JETONS.code, 'claude-code-jerome', 'claude-code', jetonsExtra.code),
  ]);
  const magasin = creerMagasin({ lire: async () => secret, dureeCacheMs: 0 });
  const limiteur = creerLimiteur({ donnees, maintenant: () => horloge.t });
  const gestionnaire = creerGestionnaire({ magasin, donnees, limiteur, maintenant: () => horloge.t, journal: () => {} });
  const serveur = createServer((req, res) => {
    const m = [];
    req.on('data', (x) => m.push(x));
    req.on('end', () => {
      const texte = Buffer.concat(m).toString('utf8');
      try { req.body = texte ? JSON.parse(texte) : undefined; } catch { req.body = undefined; }
      gestionnaire(req, res);
    });
  });
  await new Promise((fin) => serveur.listen(0, '127.0.0.1', fin));
  arrets.push(() => new Promise((fin) => serveur.close(fin)));
  const url = `http://127.0.0.1:${serveur.address().port}/mcp`;
  let n = 0;
  const brut = (jeton, methode, params) => fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${JETONS[jeton]}` },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method: methode, params }),
  });
  const appeler = async (jeton, nom, args = {}) => {
    const corps = await (await brut(jeton, 'tools/call', { name: nom, arguments: args })).json();
    if (corps.error) return { isError: true, texte: corps.error.message };
    const texte = corps.result.content?.[0]?.text ?? '';
    let data;
    try { data = JSON.parse(texte); } catch { data = undefined; }
    return { isError: !!corps.result.isError, texte, data };
  };
  /** Aperçu puis code, comme un assistant : rend la réponse du second appel. */
  const avecCode = async (jeton, nom, args) => {
    const apercu = await appeler(jeton, nom, args);
    assert.equal(apercu.isError, false, apercu.texte);
    assert.equal(apercu.data.apercu, true, apercu.texte);
    return appeler(jeton, nom, { ...args, codeConfirmation: apercu.data.code });
  };
  const doc = (nom, id) => collections[nom]?.find((d) => d.id === id);
  const lignesAudit = (outil) => collections.crm_audit.filter((l) => l.outil === outil);
  return { collections, donnees, appeler, avecCode, brut, horloge, doc, lignesAudit };
}
const ok = (r) => { assert.equal(r.isError, false, r.texte); return r.data; };
const refuse = (r, motif) => { assert.equal(r.isError, true, `devait être refusé : ${r.texte}`); if (motif) assert.match(r.texte, motif); };
const sansCle = (d) => assert.equal('test' in d, false, `aucune clé test attendue : ${JSON.stringify(d.test)}`);

describe('1 paramètre test sur les 8 outils de création', () => {
  const creations = (s, test) => {
    const avec = test === undefined ? {} : { test };
    return [
      ['creer_personne', { nom: `Personne ${test}`, ...avec }, 'crm_personnes', (r) => r.id],
      ['creer_organisation', { nom: `Organisation ${test}`, ...avec }, 'crm_organisations', (r) => r.id],
      ['creer_affaire', { titre: `Affaire ${test}`, ...avec }, 'crm_affaires', (r) => r.id],
      ['creer_projet', { titre: `Projet ${test}`, ...avec }, 'projets_projets', (r) => r.id],
      ['creer_projet_depuis_affaire', { affaireId: { true: 'a5', false: 'a6', undefined: 'a7' }[test], ...avec }, 'projets_projets', (r) => r.id],
      ['creer_devis_brouillon', { objet: `Devis ${test}`, ...avec }, 'devis_devis', (r) => r.id],
      ['creer_devis_depuis_modele', { modeleId: 'modele', ...avec }, 'devis_devis', (r) => r.id],
      ['creer_activite', { titre: `Activité ${test}`, personneId: 'p1', ...avec }, 'crm_activites', (r) => r.id],
    ];
  };
  test('1 paramètre test : les 8 outils de création écrivent test: true, rien sans, rien avec false', async () => {
    const s = await demarrer({ devis: [devisFige('modele', { ht: 1200 })] });
    for (const valeur of [true, undefined, false]) {
      for (const [outil, args, collection, idDe] of creations(s, valeur)) {
        const r = ok(await s.appeler('code', outil, args));
        const fiche = s.doc(collection, idDe(r));
        if (valeur === true) {
          assert.equal(fiche.test, true, `${outil} : test: true écrit`);
          assert.equal(r.test, true, `${outil} : la réponse rappelle test: true`);
        } else {
          sansCle(fiche); // jamais test: false à la création
          assert.equal(r.test, false, `${outil} : la réponse rappelle test: false`);
        }
        if (valeur === true && r.noteEpingleeId) assert.equal(s.doc('crm_notes', r.noteEpingleeId).test, true, `${outil} : la note de départ est de test`);
        if (valeur !== true && r.noteEpingleeId) sansCle(s.doc('crm_notes', r.noteEpingleeId));
      }
    }
  });
  test('1 le paramètre test se décrit chez nous : « SEULEMENT si l’utilisateur parle d’un test… ne devine jamais »', async () => {
    const s = await demarrer();
    const liste = (await (await s.brut('code', 'tools/list')).json()).result.tools;
    for (const nom of ['creer_personne', 'creer_organisation', 'creer_affaire', 'creer_projet', 'creer_projet_depuis_affaire', 'creer_devis_brouillon', 'creer_devis_depuis_modele', 'creer_activite']) {
      const d = liste.find((t) => t.name === nom).inputSchema.properties.test.description;
      assert.match(d, /SEULEMENT si l'utilisateur dit que c'est un test, un essai ou une démo/, nom);
      assert.match(d, /ne devine jamais/, nom);
    }
    assert.equal('test' in liste.find((t) => t.name === 'ajouter_note').inputSchema.properties, false, 'ajouter_note n’a pas de paramètre test (il hérite seulement)');
  });
});

describe('2 héritage serveur', () => {
  test('2 héritage serveur : creer_personne, creer_projet, creer_activite, ajouter_note', async () => {
    const s = await demarrer({ fiches: (c) => { c.crm_organisations.find((o) => o.id === 'org2').test = true; } }); // org2 de test ; p2 (de org2) et a2 restent réelles
    // personne : une personne d'une organisation de test
    const p = ok(await s.appeler('biblio', 'creer_personne', { nom: 'Nouvelle Recrue', organisationId: 'org2' }));
    assert.equal(s.doc('crm_personnes', p.id).test, true);
    assert.equal(ok(await s.appeler('biblio', 'creer_personne', { nom: 'Recrue Réelle', organisationId: 'org1' })).test, false);
    sansCle(s.doc('crm_personnes', s.collections.crm_personnes.at(-1).id));
    // projet : parent personne (dont l'organisation est de test), ou organisation de test
    const pr1 = ok(await s.appeler('biblio', 'creer_projet', { titre: 'Projet de la personne', personneId: 'p2' }));
    assert.equal(s.doc('projets_projets', pr1.id).test, true);
    const pr2 = ok(await s.appeler('biblio', 'creer_projet', { titre: 'Projet de l’organisation', organisationId: 'org2' }));
    assert.equal(s.doc('projets_projets', pr2.id).test, true);
    const pr3 = ok(await s.appeler('biblio', 'creer_projet', { titre: 'Projet réel', personneId: 'p1' }));
    sansCle(s.doc('projets_projets', pr3.id));
    // activité : par l'affaire (sa personne et son organisation), par la personne, par l'organisation
    for (const lien of [{ affaireId: 'a2' }, { personneId: 'p2' }, { organisationId: 'org2' }]) {
      const a = ok(await s.appeler('biblio', 'creer_activite', { titre: 'Rappeler', ...lien }));
      assert.equal(s.doc('crm_activites', a.id).test, true, JSON.stringify(lien));
    }
    const reelle = ok(await s.appeler('biblio', 'creer_activite', { titre: 'Rappeler un vrai client', affaireId: 'a1' }));
    sansCle(s.doc('crm_activites', reelle.id));
    // note : même règle ; une affaire démarquée dont le parent est de test reste héritière (règle élargie du 04/11)
    for (const lien of [{ affaireId: 'a2' }, { personneId: 'p2' }, { organisationId: 'org2' }]) {
      const n = ok(await s.appeler('biblio', 'ajouter_note', { texte: 'Une note', ...lien }));
      assert.equal(s.doc('crm_notes', n.id).test, true, JSON.stringify(lien));
    }
    const noteReelle = ok(await s.appeler('biblio', 'ajouter_note', { texte: 'Une note réelle', affaireId: 'a1' }));
    sansCle(s.doc('crm_notes', noteReelle.id));
  });
  test('2b déjà hérité : projet depuis affaire, livrable, brouillon, depuis modèle, nouvelle version', async () => {
    const s = await demarrer({ devis: [devisFige('source', { ht: 100, statut: 'refuse', test: true })], fiches: (c) => { c.crm_affaires.find((a) => a.id === 'a5').test = true; } });
    // projet depuis une affaire de test
    const projet = ok(await s.appeler('biblio', 'creer_projet_depuis_affaire', { affaireId: 'a5' }));
    assert.equal(s.doc('projets_projets', projet.id).test, true, 'projet depuis affaire');
    // livrable d'un projet de test
    const livrable = ok(await s.appeler('biblio', 'ajouter_livrable_projet', { projetId: projet.id, titre: 'Livrable' }));
    assert.equal(s.doc('projets_taches', livrable.id).test, true, 'livrable');
    // brouillon et devis depuis modèle sur une affaire de test
    const brouillon = ok(await s.appeler('biblio', 'creer_devis_brouillon', { affaireId: 'a5', objet: 'Sur affaire de test' }));
    assert.equal(s.doc('devis_devis', brouillon.id).test, true, 'brouillon');
    const depuisModele = ok(await s.appeler('biblio', 'creer_devis_depuis_modele', { modeleId: 'source', affaireId: 'a5' }));
    assert.equal(s.doc('devis_devis', depuisModele.id).test, true, 'depuis modèle (affaire de test)');
    // le repère du MODÈLE ne se copie pas : sur une affaire réelle, le nouveau devis est réel
    const reel = ok(await s.appeler('biblio', 'creer_devis_depuis_modele', { modeleId: 'source', affaireId: 'a1' }));
    sansCle(s.doc('devis_devis', reel.id));
    // nouvelle version : le clone garde le repère de la source
    const version = ok(await s.appeler('biblio', 'nouvelle_version_devis', { id: 'source' }));
    assert.equal(s.doc('devis_devis', version.id).test, true, 'nouvelle version');
  });
});

describe('3 réponses de création', () => {
  test('3 réponses : test rappelé, conseil « le nom contient test » seulement sans repère', async () => {
    const s = await demarrer();
    const conseil = /Le nom contient « test » : appelle marquer_test si c’est un essai\./;
    const sans = ok(await s.appeler('biblio', 'creer_personne', { nom: 'Test Martin' }));
    assert.equal(sans.test, false);
    assert.match(sans.conseil, conseil);
    assert.equal(s.doc('crm_personnes', sans.id).test, undefined, 'un conseil, jamais une pose automatique');
    const avec = ok(await s.appeler('biblio', 'creer_personne', { nom: 'Test Dupont', test: true }));
    assert.equal(avec.test, true);
    assert.equal('conseil' in avec, false, 'repère posé : pas de conseil');
    const normal = ok(await s.appeler('biblio', 'creer_personne', { nom: 'Contestable Durand' }));
    assert.equal('conseil' in normal, false, 'le mot « test » seul : « Contestable » ne le contient pas');
    for (const [outil, args] of [['creer_organisation', { nom: 'Le Test SARL' }], ['creer_affaire', { titre: 'Affaire de TEST' }], ['creer_projet', { titre: 'Un test de projet' }], ['creer_activite', { titre: 'Test appel', personneId: 'p1' }], ['creer_devis_brouillon', { objet: 'Devis test' }]]) {
      assert.match(ok(await s.appeler('biblio', outil, args)).conseil, conseil, outil);
    }
    assert.equal('conseil' in ok(await s.appeler('biblio', 'creer_organisation', { nom: 'Le Test SARL 2', test: true })), false);
  });
});

describe('4 marquer_test / demarquer_test', () => {
  test('4 marquer_test / demarquer_test : personne, organisation, projet, brouillon ; audit ; restauration ; refus', async () => {
    const s = await demarrer({ devis: [brouillonEnregistre('bro')], fiches: (c) => { c.projets_projets.push({ id: 'pr1', titre: 'Projet réel', phase: 'preparation', statut: 'actif', archive: false }); } });
    const cibles = [['personne', 'p1', 'crm_personnes'], ['organisation', 'org1', 'crm_organisations'], ['projet', 'pr1', 'projets_projets'], ['devis', 'bro', 'devis_devis']];
    for (const [type, id, collection] of cibles) {
      const avantNom = JSON.stringify({ ...s.doc(collection, id), test: undefined });
      const r = ok(await s.appeler('code', 'marquer_test', { type, id }));
      assert.equal(r.change, true, type);
      assert.equal(s.doc(collection, id).test, true, `${type} marqué`);
      assert.equal(JSON.stringify({ ...s.doc(collection, id), test: undefined }), avantNom, `${type} : rien d'autre ne change`);
      assert.equal(s.collections.crm_audit.filter((l) => l.operationId === r.operationId).length, 1, `${type} : une ligne d'audit`);
      // déjà marqué : rien n'est écrit
      const auditAvant = s.collections.crm_audit.length;
      assert.equal(ok(await s.appeler('code', 'marquer_test', { type, id })).rien, true, `${type} déjà marqué`);
      assert.equal(s.collections.crm_audit.length, auditAvant, `${type} : pas de ligne d'audit pour rien`);
      // restauration : la fiche revient sans repère ; la restauration elle-même est restaurable (le repère revient)
      ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r.operationId, apercu: false }));
      assert.equal(s.doc(collection, id).test, undefined, `${type} restauré`);
      // « Ce n'est plus un test » : écrit test: false (réel) ; rien à démarquer quand il est déjà réel
      ok(await s.appeler('code', 'marquer_test', { type, id }));
      const d = ok(await s.appeler('code', 'demarquer_test', { type, id }));
      assert.equal(d.change, true);
      assert.equal(s.doc(collection, id).test, false, `${type} démarqué : test: false`);
      assert.equal(ok(await s.appeler('code', 'demarquer_test', { type, id })).rien, true, `${type} déjà réel`);
    }
    // jamais marqué : demarquer_test ne crée pas de clé
    assert.equal(ok(await s.appeler('code', 'demarquer_test', { type: 'organisation', id: 'org2' })).rien, true);
    sansCle(s.doc('crm_organisations', 'org2'));
    // refus : introuvable, type hors liste, lecteur, identifiant d'un autre type
    refuse(await s.appeler('code', 'marquer_test', { type: 'personne', id: 'inconnu' }), /introuvable/i);
    refuse(await s.appeler('code', 'marquer_test', { type: 'personne', id: 'org1' }), /introuvable/i);
    refuse(await s.appeler('code', 'marquer_test', { type: 'facture', id: 'p1' }));
    refuse(await s.appeler('lecteur', 'marquer_test', { type: 'personne', id: 'p2' }));
    refuse(await s.appeler('lecteur', 'demarquer_test', { type: 'personne', id: 'p2' }));
    const noms = async (j) => (await (await s.brut(j, 'tools/list')).json()).result.tools.map((t) => t.name);
    assert.ok(!(await noms('lecteur')).includes('marquer_test'), 'le lecteur ne voit pas marquer_test');
    for (const j of ['biblio', 'code']) for (const o of ['marquer_test', 'demarquer_test']) assert.ok((await noms(j)).includes(o), `${j} : ${o}`);
  });
});

/** Une affaire réelle `a1` avec un devis réel accepté 1 200 € HT et un devis de test accepté 100 € HT. */
const affaireAvecDeuxDevis = () => ({
  devis: [devisFige('reel', { ht: 1200 }), devisFige('essai', { ht: 100, test: true })],
  fiches: (c) => { Object.assign(c.crm_affaires.find((a) => a.id === 'a1'), { montantDevisHt: 1200, montantDevisNature: 'accepte', montantDevisDetail: [{ numero: 'DEV-2026-10-01-reel', version: 1, ht: 1200, compte: true }] }); },
});

describe('5 affaire : le montant suit le repère', () => {
  test('5 affaire : le montant calculé suit le repère dans la même opération (1 200 → 100 → 1 200)', async () => {
    const s = await demarrer(affaireAvecDeuxDevis());
    const lignesAvant = s.collections.crm_audit.length;
    const marque = ok(await s.appeler('code', 'marquer_test', { type: 'affaire', id: 'a1' }));
    assert.equal(s.doc('crm_affaires', 'a1').test, true);
    assert.equal(s.doc('crm_affaires', 'a1').montantDevisHt, 100, 'seul le devis de test compte pour une affaire de test');
    assert.deepEqual(marque.montant, { avant: { ht: 1200, nature: 'accepte' }, apres: { ht: 100, nature: 'accepte' } });
    assert.equal(s.collections.crm_audit.length - lignesAvant, 1, 'une seule ligne d’audit : le repère et le montant sont écrits ensemble');
    const demarque = ok(await s.appeler('code', 'demarquer_test', { type: 'affaire', id: 'a1' }));
    assert.equal(s.doc('crm_affaires', 'a1').test, false);
    assert.equal(s.doc('crm_affaires', 'a1').montantDevisHt, 1200);
    assert.equal(demarque.montant.apres.ht, 1200);
    // la restauration remet le repère ET le montant ensemble
    ok(await s.appeler('code', 'marquer_test', { type: 'affaire', id: 'a1' }));
    const op = ok(await s.appeler('code', 'demarquer_test', { type: 'affaire', id: 'a1' })).operationId;
    ok(await s.appeler('code', 'restaurer_depuis_audit', { operationId: op, apercu: false }));
    assert.equal(s.doc('crm_affaires', 'a1').test, true);
    assert.equal(s.doc('crm_affaires', 'a1').montantDevisHt, 100);
  });
});

describe('6 devis finalisé', () => {
  test('6 devis finalisé : aperçu puis code, rien sans code, montant recalculé, restauration refusée', async () => {
    const devis = [devisFige('reel', { ht: 1200 }), devisFige('v1', { ht: 100, statut: 'remplace' }), devisFige('v2', { ht: 100, statut: 'accepte', racineId: 'v1', version: 2, numero: 'DEV-2026-10-01-v1' })];
    const s = await demarrer({ devis, fiches: (c) => { Object.assign(c.crm_affaires.find((a) => a.id === 'a1'), { montantDevisHt: 1300, montantDevisNature: 'accepte' }); } });
    const avant = structuredClone(s.collections.devis_devis);
    const affairesAvant = structuredClone(s.collections.crm_affaires);
    const apercu = ok(await s.appeler('code', 'marquer_test', { type: 'devis', id: 'v2' }));
    assert.equal(apercu.apercu, true);
    assert.equal(apercu.versions, 2, 'toutes les versions de la racine sont annoncées');
    assert.deepEqual(apercu.test, { avant: false, apres: true });
    assert.deepEqual(apercu.montantsAffaires, [{ affaireId: 'a1', avant: { ht: 1300, nature: 'accepte' }, apres: { ht: 1200, nature: 'accepte' } }]);
    assert.deepEqual(s.collections.devis_devis, avant, 'le premier appel n’écrit RIEN');
    assert.deepEqual(s.collections.crm_affaires, affairesAvant, 'aucune affaire écrite sans code');
    refuse(await s.appeler('code', 'marquer_test', { type: 'devis', id: 'v2', codeConfirmation: 'faux' }), /Confirmation refusée/);
    assert.deepEqual(s.collections.devis_devis, avant, 'un faux code n’écrit rien');
    const apercuNeuf = ok(await s.appeler('code', 'marquer_test', { type: 'devis', id: 'v2' })); // un essai raté brûle le code : nouvel aperçu
    const r = ok(await s.appeler('code', 'marquer_test', { type: 'devis', id: 'v2', codeConfirmation: apercuNeuf.code }));
    assert.equal(r.change, true);
    assert.equal(s.doc('devis_devis', 'v2').test, true);
    assert.equal(s.doc('devis_devis', 'v1').test, true, 'toutes les versions reçoivent le repère');
    assert.equal(s.doc('devis_devis', 'v2').numero, 'DEV-2026-10-01-v1', 'le devis garde son numéro');
    assert.equal(s.doc('devis_devis', 'reel').test, undefined, 'un autre devis n’est pas touché');
    assert.equal(s.doc('crm_affaires', 'a1').montantDevisHt, 1200, 'montant de l’affaire recalculé dans la même opération (100 € de test sortis)');
    assert.match(r.detail, /recalculer_usage_articles/);
    // le code est à usage unique : le rejouer ne change rien (le devis est déjà marqué)
    assert.equal(ok(await s.appeler('code', 'marquer_test', { type: 'devis', id: 'v2', codeConfirmation: apercuNeuf.code })).rien, true);
    // non restaurable
    refuse(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r.operationId, apercu: false }), /restauration_refusee|ne se restaure pas|n’est plus un brouillon/i);
    assert.equal(s.doc('devis_devis', 'v2').test, true);
    // déjà marqué : rien (ni aperçu ni code)
    assert.equal(ok(await s.appeler('code', 'marquer_test', { type: 'devis', id: 'v2' })).rien, true);
    // « Ce n'est plus un test » est permis sur un devis finalisé (aperçu puis code)
    const retour = ok(await s.avecCode('code', 'demarquer_test', { type: 'devis', id: 'v1' }));
    assert.equal(retour.change, true);
    assert.equal(s.doc('devis_devis', 'v2').test, false);
    assert.equal(s.doc('devis_devis', 'v1').test, false);
    assert.equal(s.doc('crm_affaires', 'a1').montantDevisHt, 1300, 'les 100 € reviennent dans le montant de l’affaire réelle');
    // un code d'un autre devis ou changé entre-temps est refusé
    const apercu2 = ok(await s.appeler('code', 'marquer_test', { type: 'devis', id: 'reel' }));
    s.doc('devis_devis', 'reel').objet = 'Objet modifié entre-temps';
    refuse(await s.appeler('code', 'marquer_test', { type: 'devis', id: 'reel', codeConfirmation: apercu2.code }), /Confirmation refusée/);
    assert.equal(s.doc('devis_devis', 'reel').test, undefined);
  });

  test('6 devis finalisé : viser la version BROUILLON d’une racine dont une autre version est signée exige aussi l’aperçu et le code ; restauration refusée avec la bonne voie', async () => {
    const s = await demarrer({
      devis: [devisFige('v1', { ht: 1200 }), brouillonEnregistre('v2', { racineId: 'v1', version: 2, numero: 'DEV-2026-10-01-v1' })],
      fiches: (c) => { Object.assign(c.crm_affaires.find((a) => a.id === 'a1'), { montantDevisHt: 1200, montantDevisNature: 'accepte' }); },
    });
    const avant = structuredClone(s.collections.devis_devis);
    const affairesAvantBrouillon = structuredClone(s.collections.crm_affaires);
    const apercu = ok(await s.appeler('code', 'marquer_test', { type: 'devis', id: 'v2' }));
    assert.equal(apercu.apercu, true, 'pas de contournement par la version brouillon');
    assert.equal(apercu.versions, 2);
    assert.deepEqual(apercu.montantsAffaires, [{ affaireId: 'a1', avant: { ht: 1200, nature: 'accepte' }, apres: { ht: null, nature: null } }]);
    assert.deepEqual(s.collections.devis_devis, avant, 'rien d’écrit sans code');
    assert.deepEqual(s.collections.crm_affaires, affairesAvantBrouillon, 'aucune affaire écrite sans code');
    const r = ok(await s.appeler('code', 'marquer_test', { type: 'devis', id: 'v2', codeConfirmation: apercu.code }));
    assert.equal(s.doc('devis_devis', 'v1').test, true);
    assert.equal(s.doc('crm_affaires', 'a1').montantDevisHt, null);
    refuse(await s.appeler('code', 'restaurer_depuis_audit', { operationId: r.operationId, apercu: false }), /demarquer_test/);
    // un bibliothécaire (Hermes) ne marque pas un devis finalisé, mais marque un brouillon seul
    const s2 = await demarrer({ devis: [devisFige('v1', { ht: 1200 }), brouillonEnregistre('v2', { racineId: 'v1', version: 2 }), brouillonEnregistre('seul')] });
    refuse(await s2.appeler('biblio', 'marquer_test', { type: 'devis', id: 'v1' }), /réservé à Claude Code/);
    refuse(await s2.appeler('biblio', 'marquer_test', { type: 'devis', id: 'v2' }), /réservé à Claude Code/);
    assert.equal(ok(await s2.appeler('biblio', 'demarquer_test', { type: 'devis', id: 'v1' })).rien, true, 'déjà réel : rien à changer, aucune restriction à lever');
    assert.equal(s2.doc('devis_devis', 'v1').test, undefined);
    assert.equal(ok(await s2.appeler('biblio', 'marquer_test', { type: 'devis', id: 'seul' })).change, true);
    assert.equal(ok(await s2.appeler('biblio', 'marquer_test', { type: 'personne', id: 'p1' })).change, true);
    // le profil agent-devis n'a ni marquer_test ni demarquer_test (liste blanche) : refusé sur un devis finalisé comme sur un brouillon
    for (const id of ['v1', 'v2', 'seul']) {
      refuse(await s2.appeler('agent', 'marquer_test', { type: 'devis', id }));
      refuse(await s2.appeler('agent', 'demarquer_test', { type: 'devis', id }));
    }
  });
});

describe('7 filtre tests', () => {
  test('7 filtre tests : inclure / exclure / seulement sur 5 outils ; test: true dans chaque résultat', async () => {
    const s = await demarrer({
      devis: [devisFige('reel', { ht: 1200 }), devisFige('essai', { ht: 100, test: true, affaireId: 'a2' }), devisFige('rendu', { ht: 100, test: false, affaireId: 'a2' })],
      fiches: (c) => {
        c.crm_affaires.find((a) => a.id === 'a2').test = true;
        c.crm_affaires.find((a) => a.id === 'a1').test = false; // démarquée : réelle
        c.crm_activites.find((a) => a.id === 'ac2').test = true;
        c.crm_activites.find((a) => a.id === 'ac1').test = false; // démarquée : réelle
        c.crm_personnes.find((p) => p.id === 'p2').test = true;
        c.crm_organisations.find((o) => o.id === 'org2').test = true;
        c.projets_projets.push({ id: 'pr1', titre: 'Projet réel', phase: 'preparation', statut: 'actif', archive: false, test: false }, { id: 'pr2', titre: 'Projet essai', phase: 'preparation', statut: 'actif', archive: false, test: true });
      },
    });
    const ids = (r, cle) => (r[cle]).map((x) => x.id).sort();
    const liste = async (outil, cle, tests, args = {}) => ids(ok(await s.appeler('code', outil, { ...(tests ? { tests } : {}), ...args })), cle);
    // lister_affaires : par défaut tout, test: true porté par l'essai, test: false (démarquée) = réelle
    const toutes = await liste('lister_affaires', 'affaires');
    assert.ok(toutes.includes('a1') && toutes.includes('a2'));
    assert.deepEqual(await liste('lister_affaires', 'affaires', 'inclure'), toutes);
    assert.equal((await liste('lister_affaires', 'affaires', 'exclure')).includes('a2'), false);
    assert.equal((await liste('lister_affaires', 'affaires', 'exclure')).includes('a1'), true, 'démarquée : test: false = réelle');
    assert.deepEqual(await liste('lister_affaires', 'affaires', 'seulement'), ['a2']);
    assert.equal(ok(await s.appeler('code', 'lister_affaires', { tests: 'seulement' })).affaires[0].test, true);
    // test: false (démarqué) ne sort jamais : `test: true` seulement quand il est posé (affaires, projets, activités)
    assert.equal('test' in ok(await s.appeler('code', 'lister_affaires', {})).affaires.find((a) => a.id === 'a1'), false);
    assert.equal('test' in ok(await s.appeler('code', 'lister_projets', {})).projets.find((p) => p.id === 'pr1'), false);
    assert.equal('test' in ok(await s.appeler('code', 'lister_activites', {})).activites.find((a) => a.id === 'ac1'), false);
    // lister_projets
    assert.deepEqual(await liste('lister_projets', 'projets', 'seulement'), ['pr2']);
    assert.deepEqual(await liste('lister_projets', 'projets', 'exclure'), ['pr1']);
    assert.equal((await liste('lister_projets', 'projets')).length, 2);
    assert.equal(ok(await s.appeler('code', 'lister_projets', { tests: 'seulement' })).projets[0].test, true);
    // lister_activites
    assert.deepEqual(await liste('lister_activites', 'activites', 'seulement'), ['ac2']);
    assert.equal((await liste('lister_activites', 'activites', 'exclure')).includes('ac2'), false);
    assert.equal(ok(await s.appeler('code', 'lister_activites', { tests: 'seulement' })).activites[0].test, true);
    // lister_devis : le champ test: true est maintenant rendu (absent pour un réel)
    assert.deepEqual(await liste('lister_devis', 'devis', 'seulement'), ['essai']);
    assert.deepEqual(await liste('lister_devis', 'devis', 'exclure'), ['reel', 'rendu']);
    assert.equal((await liste('lister_devis', 'devis')).length, 3);
    const tous = ok(await s.appeler('code', 'lister_devis', {})).devis;
    assert.equal(tous.find((d) => d.id === 'essai').test, true);
    assert.equal('test' in tous.find((d) => d.id === 'reel'), false);
    assert.equal('test' in tous.find((d) => d.id === 'rendu'), false, 'test: false = réel : rien à montrer');
    // chercher : test: true dans le résultat, et le filtre
    const cherche = async (tests) => ok(await s.appeler('code', 'chercher', { texte: 'Boulangerie', ...(tests ? { tests } : {}) }));
    const tout = (await cherche()).resultats;
    assert.ok(tout.some((r) => r.type === 'organisations' && r.test === true && /^\[TEST\]/.test(r.libelle)));
    assert.equal((await cherche('exclure')).resultats.some((r) => r.test === true), false);
    assert.ok((await cherche('seulement')).resultats.length > 0 && (await cherche('seulement')).resultats.every((r) => r.test === true));
    const reel = ok(await s.appeler('code', 'chercher', { texte: 'Atelier des Lilas' })).resultats;
    assert.ok(reel.length > 0 && reel.every((r) => !('test' in r)), 'un réel ne porte pas de champ test');
    // type hors liste : refusé
    refuse(await s.appeler('code', 'lister_affaires', { tests: 'peut-etre' }));
    // cas vide : base sans essai
    const vide = await demarrer();
    assert.deepEqual(ok(await vide.appeler('code', 'lister_affaires', { tests: 'seulement' })), { total: 0, tronque: false, affaires: [] });
    assert.deepEqual(ok(await vide.appeler('code', 'chercher', { texte: 'test', tests: 'seulement' })).resultats, []);
  });
});

describe('8 usage des articles', () => {
  const ACTEUR = 'jerome.chevalier@gmail.com';
  const ctx = () => ({ acteur: ACTEUR, via: 'ecran', maintenant: new Date('2026-10-29T10:00:00Z') });
  const brouillon = (id, articleId, extra = {}) => {
    const d = nouveauDevis({ destinataires: [{ email: 'client@exemple.test' }], affaireId: 'aff1' }, { id, maintenant: ctx().maintenant, auteur: ACTEUR }, { marge: 0, margeDevis: 0 });
    return completerPourFinaliser({ ...d, sections: [{ id: `s-${id}`, titre: 'Travaux', lignes: [{ id: `l-${id}`, articleId, libelle: 'Article', unite: 'u', quantite: 1, prixAchat: 100 }] }], ...extra });
  };
  test('8 usage des articles : un devis de test ne compte jamais (finalisation et recalcul)', async () => {
    // finalisation : un devis réel compte, un devis de test ne compte pas (aucun compteur écrit)
    const collections = { [C.devis]: [brouillon('reel', 'art-reel'), brouillon('essai', 'art-essai', { test: true })], [C.affaires]: [{ id: 'aff1', titre: 'Rénovation' }], [C.devisCompteurs]: [], [C.devisUsageArticles]: [], [C.devisParametres]: [{ id: 'reglages', regimeTva: 'assujetti', entreprise: EMETTEUR_ESSAI }], [C.personnes]: [{ id: 'p1', nom: 'Client Essai' }], [C.audit]: [], [C.auditAvant]: [] };
    const donnees = creerAccesMemoire(collections);
    assert.equal((await S.finaliser({ donnees, ctx: ctx(), devisId: 'reel' })).ok, true);
    assert.equal((await S.finaliser({ donnees, ctx: ctx(), devisId: 'essai' })).ok, true);
    assert.deepEqual(collections[C.devisUsageArticles].map((u) => [u.id, u.nombre]), [['art-reel', 1]], 'le devis de test n’écrit aucun compteur');
    // recalcul : le devis de test est ignoré
    const recalcul = await S.recalculerUsageArticles({ donnees, ctx: ctx(), appliquer: false });
    assert.equal(recalcul.total, 0, 'le compteur est déjà juste : rien à corriger');

    // un devis réel compté puis marqué test : avant 1 → après 0
    const s = await demarrer({ devis: [devisFige('compte', { ht: 100, articleId: 'art1' })], fiches: (c) => { c.devis_usage_articles.push({ id: 'art1', articleId: 'art1', nombre: 1 }); } });
    const avant = ok(await s.appeler('code', 'recalculer_usage_articles', {}));
    assert.equal(avant.aCorriger, 0, 'compté 1 fois : à jour');
    ok(await s.avecCode('code', 'marquer_test', { type: 'devis', id: 'compte' }));
    const apres = ok(await s.appeler('code', 'recalculer_usage_articles', {}));
    assert.deepEqual(apres.articles, [{ articleId: 'art1', avant: 1, apres: 0 }]);
    ok(await s.appeler('code', 'recalculer_usage_articles', { codeConfirmation: apres.code }));
    assert.equal(s.doc('devis_usage_articles', 'art1').nombre, 0);
    // « Ce n'est plus un test » : il compte de nouveau
    ok(await s.avecCode('code', 'demarquer_test', { type: 'devis', id: 'compte' }));
    const retour = ok(await s.appeler('code', 'recalculer_usage_articles', {}));
    assert.deepEqual(retour.articles, [{ articleId: 'art1', avant: 0, apres: 1 }]);
    // cas vide : sans devis de test, le recalcul dit « tout est à jour »
    const vide = await demarrer({ fiches: () => {} });
    assert.equal(ok(await vide.appeler('code', 'recalculer_usage_articles', {})).aCorriger, 0);
  });
});

describe('11 plafonds', () => {
  test('11 plafonds : une écriture par bascule ; au plafond, le code est consommé et un nouvel aperçu suffit (comportement existant de confirmerDevis)', async () => {
    const s = await demarrer({ devis: [devisFige('d1', { ht: 100 })], jetonsExtra: { code: { limites: { ecrituresParHeure: 3 } } } });
    ok(await s.appeler('code', 'marquer_test', { type: 'personne', id: 'p1' })); // 1
    ok(await s.appeler('code', 'demarquer_test', { type: 'personne', id: 'p1' })); // 2
    assert.equal(ok(await s.appeler('code', 'demarquer_test', { type: 'personne', id: 'p1' })).rien, true, 'rien à changer : ne compte pas');
    ok(await s.appeler('code', 'marquer_test', { type: 'organisation', id: 'org1' })); // 3
    refuse(await s.appeler('code', 'marquer_test', { type: 'projet', id: 'inconnu' }), /introuvable/i); // une saisie refusée ne coûte rien
    const audit = s.collections.crm_audit.length;
    refuse(await s.appeler('code', 'demarquer_test', { type: 'organisation', id: 'org1' }), /Plafond atteint.*3 écritures par heure/);
    assert.equal(s.doc('crm_organisations', 'org1').test, true, 'au plafond : rien n’est écrit');
    assert.equal(s.collections.crm_audit.length, audit);
    // devis finalisé : l'aperçu (sans code) ne consomme pas le plafond ; au plafond, l'écriture est refusée et le devis reste intact
    const apercu = ok(await s.appeler('code', 'marquer_test', { type: 'devis', id: 'd1' }));
    assert.equal(apercu.apercu, true, 'un aperçu se fait même au plafond (lecture seule)');
    refuse(await s.appeler('code', 'marquer_test', { type: 'devis', id: 'd1', codeConfirmation: apercu.code }), /Plafond atteint/);
    assert.equal(s.doc('devis_devis', 'd1').test, undefined, 'devis intact au plafond');
    // le code présenté au plafond est CONSOMMÉ : rejoué tout de suite (même horloge, bien avant l'expiration de 5 minutes), il est refusé pour cette raison
    refuse(await s.appeler('code', 'marquer_test', { type: 'devis', id: 'd1', codeConfirmation: apercu.code }), /aucun aperçu en cours pour ce devis \(ou code déjà utilisé\)/);
    // l'heure suivante : un nouvel aperçu et un nouveau code suffisent
    s.horloge.t += 7_200_000;
    ok(await s.avecCode('code', 'marquer_test', { type: 'devis', id: 'd1' }));
    assert.equal(s.doc('devis_devis', 'd1').test, true);
  });
});

describe('12 finaliser_devis : aperçu et finalisation d’un devis de test', () => {
  test('12 aperçu test: true + numeroPrevu TEST- pour un brouillon sur une affaire de test, rien d’écrit ; avec le code : TEST-001, test: true ; l’affaire marquée test entre l’aperçu et le code → « le devis a changé »', async () => {
    const brouillon = (id, extra = {}) => completerPourFinaliser({ ...brouillonEnregistre(id), destinataires: [{ email: 'client@exemple.test' }], organisationId: 'org1', personneId: null, ...extra });
    const s = await demarrer({ devis: [brouillon('b1'), brouillon('b2', { affaireId: 'a2' })], fiches: (c) => { Object.assign(c.crm_affaires.find((a) => a.id === 'a1'), { test: true }); } });
    const avant = structuredClone(s.collections.devis_devis);
    const compteursAvant = structuredClone(s.collections.devis_compteurs);
    const apercu = ok(await s.appeler('code', 'finaliser_devis', { id: 'b1' }));
    assert.equal(apercu.apercu, true);
    assert.deepEqual([apercu.test, apercu.raisonTest], [true, 'affaire']);
    assert.match(apercu.numero, /attribué/);
    assert.match(apercu.numeroPrevu, /TEST-/);
    assert.match(apercu.consigne, /DEVIS DE TEST/);
    assert.deepEqual(s.collections.devis_devis, avant, 'le premier appel n’écrit RIEN');
    assert.deepEqual(s.collections.devis_compteurs, compteursAvant);
    const r = ok(await s.appeler('code', 'finaliser_devis', { id: 'b1', codeConfirmation: apercu.code }));
    assert.deepEqual([r.finalise, r.numero, r.test], [true, 'TEST-001', true]);
    assert.equal(s.doc('devis_devis', 'b1').test, true);
    assert.equal(s.doc('devis_compteurs', 'global'), undefined);
    // l'affaire d'un autre devis devient « test » entre l'aperçu et le code : le verdict est « change »
    const a2 = ok(await s.appeler('code', 'finaliser_devis', { id: 'b2' }));
    assert.equal(a2.test, false);
    assert.match(a2.numeroPrevu, /DEV-/);
    Object.assign(s.collections.crm_affaires.find((a) => a.id === 'a2'), { test: true });
    refuse(await s.appeler('code', 'finaliser_devis', { id: 'b2', codeConfirmation: a2.code }), /le devis a changé depuis l’aperçu|le devis a changé depuis l'aperçu/);
    assert.equal(s.doc('devis_devis', 'b2').statut, 'brouillon');
  });
});

describe('13 démarquer un devis de test finalisé', () => {
  test('13 demarquer_test d’un TEST- finalisé : refusé AVANT tout code (pas d’aperçu, mcp_codes vide) ; marquer_test d’un DEV- finalisé : aperçu + code comme en PR 2', async () => {
    const s = await demarrer({ devis: [devisFige('t1', { ht: 100, test: true, numero: 'TEST-001' }), devisFige('r1', { ht: 1200 })] });
    const codes = (s.collections.mcp_codes ?? []).length;
    refuse(await s.appeler('code', 'demarquer_test', { type: 'devis', id: 't1' }), /reste un test/);
    assert.equal((s.collections.mcp_codes ?? []).length, codes, 'aucun code émis');
    assert.equal(s.doc('devis_devis', 't1').test, true);
    const apercu = ok(await s.appeler('code', 'marquer_test', { type: 'devis', id: 'r1' }));
    assert.equal(apercu.apercu, true);
    ok(await s.appeler('code', 'marquer_test', { type: 'devis', id: 'r1', codeConfirmation: apercu.code }));
    assert.equal(s.doc('devis_devis', 'r1').test, true);
    const apercu2 = ok(await s.appeler('code', 'demarquer_test', { type: 'devis', id: 'r1' }));
    assert.equal(apercu2.apercu, true, 'un DEV- marqué après coup reste démarquable');
  });
});
