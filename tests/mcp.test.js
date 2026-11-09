// Tests du point d'entrée HTTP du serveur MCP (étape 2) : origine, méthode, jeton, droits par profil, journaux sans secret.
// Un vrai client MCP (SDK officiel) appelle le gestionnaire sur un serveur HTTP local ; aucun service Google n'est touché.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Client } from '../functions/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StreamableHTTPClientTransport } from '../functions/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
import { creerGestionnaire } from '../functions/src/mcp/gestionnaire.js';
import { OUTILS, outilsAutorises } from '../functions/src/mcp/outils/index.js';
import { empreinte, creerMagasin } from '../functions/src/securite/jetons.js';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { collections, MAINTENANT } from './_donnees-essai.js';

// Liste blanche EXACTE du profil agent-devis (décision de Jérôme, 07/11/2026), écrite à la main : créer le client et le devis, le finaliser (aperçu + code), préparer l'e-mail. 21 outils.
const LISTE_AGENT = ['qui_suis_je', 'chercher', 'lire_personne', 'lire_organisation', 'lire_affaire', 'lister_affaires', 'lister_devis', 'lire_devis', 'lire_reglages_devis', 'chercher_article', 'lister_articles', 'rechercher_article_par_phrase', 'obtenir_pdf_officiel_devis',
  'creer_personne', 'creer_organisation', 'creer_affaire', 'creer_devis_brouillon', 'modifier_devis_brouillon', 'finaliser_devis', 'modifier_destinataires_devis', 'preparer_email'];

// Liste blanche EXACTE du profil assistant-devis (09/11/2026), écrite à la main : les 21 outils d'agent-devis + modifier les lignes, annuler la dernière modification, nouvelle version. 24 outils.
const LISTE_ASSISTANT = [...LISTE_AGENT, 'modifier_lignes_devis', 'annuler_derniere_modification_devis', 'nouvelle_version_devis'];

const nomsPour = (profil) => outilsAutorises(profil).map((o) => o.nom).sort();

const JETON = { lecteur: `cia_${'L'.repeat(43)}`, biblio: `cia_${'H'.repeat(43)}`, agent: `cia_${'A'.repeat(43)}`, assistant: `cia_${'S'.repeat(43)}`, code: `cia_${'C'.repeat(43)}`, revoque: `cia_${'R'.repeat(43)}` };
const entree = (jeton, nom, profil, actif = true) => ({ jeton: nom, acteur: nom, profil, empreinte: empreinte(jeton), actif });
const SECRET = JSON.stringify([
  entree(JETON.lecteur, 'lecteur-essai', 'lecteur'),
  entree(JETON.biblio, 'hermes-bibliothecaire', 'bibliothecaire'),
  entree(JETON.agent, 'n8n-devis-essai', 'agent-devis'),
  entree(JETON.assistant, 'assistant-devis-essai', 'assistant-devis'),
  entree(JETON.code, 'claude-code-jerome', 'claude-code'),
  entree(JETON.revoque, 'ancien-client', 'claude-code', false),
]);

// Un outil réservé à Claude Code, pour prouver le refus côté serveur (le plan n'en a pas encore à l'étape 2).
const OUTIL_RESERVE = {
  nom: 'outil_reserve', profils: ['complet'], description: 'Réservé à Claude Code (essai).',
  async executer() { return { ok: true }; },
};

let serveur, base, lignesJournal, panneSecret;
before(async () => {
  lignesJournal = [];
  panneSecret = false;
  const magasin = creerMagasin({ lire: async () => { if (panneSecret) throw new Error('secret illisible : détail interne'); return SECRET; }, dureeCacheMs: 0 });
  const gestionnaire = creerGestionnaire({ magasin, donnees: creerAccesMemoire(collections), outils: [...OUTILS, OUTIL_RESERVE], maintenant: () => MAINTENANT.getTime(), journal: (e) => { lignesJournal.push(e); } });
  serveur = createServer((req, res) => {
    const morceaux = [];
    req.on('data', (m) => morceaux.push(m));
    req.on('end', () => {
      const texte = Buffer.concat(morceaux).toString('utf8');
      try { req.body = texte ? JSON.parse(texte) : undefined; } catch { req.body = undefined; }
      gestionnaire(req, res);
    });
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${serveur.address().port}/mcp`;
});
after(() => serveur.close());

const brut = (jeton, { methode = 'POST', entetes = {}, corps } = {}) => fetch(base, {
  method: methode,
  headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}), ...entetes },
  body: methode === 'POST' ? JSON.stringify(corps ?? { jsonrpc: '2.0', id: 1, method: 'tools/list' }) : undefined,
});
async function client(jeton) {
  const c = new Client({ name: 'essai', version: '1.0.0' });
  await c.connect(new StreamableHTTPClientTransport(new URL(base), { requestInit: { headers: { Authorization: `Bearer ${jeton}` } } }));
  return c;
}

describe('Accès : origine, méthode, jeton', () => {
  test('sans jeton, avec un jeton inconnu ou révoqué : 401, même réponse, aucun détail', async () => {
    const reponses = [];
    for (const j of [undefined, `cia_${'Z'.repeat(43)}`, JETON.revoque, 'nimporte quoi']) {
      const r = await brut(j);
      assert.equal(r.status, 401);
      assert.equal(r.headers.get('www-authenticate'), 'Bearer');
      reponses.push(await r.text());
    }
    assert.equal(new Set(reponses).size, 1);
    assert.equal(reponses[0], '{"error":"non_autorise"}');
  });
  test('GET, DELETE et PUT sont refusés (405) ; un en-tête Origin inconnu est refusé (403), même avec un bon jeton', async () => {
    for (const methode of ['GET', 'DELETE', 'PUT']) assert.equal((await brut(JETON.code, { methode })).status, 405, methode);
    assert.equal((await brut(JETON.code, { entetes: { Origin: 'https://exemple.test' } })).status, 403);
    assert.equal((await brut(JETON.code, { entetes: { Origin: 'https://chevalier-ia-os.web.app' } })).status, 200);
  });
  test('secret illisible : 503 sans détail, jamais d’accès accordé', async () => {
    panneSecret = true;
    const r = await brut(JETON.code);
    panneSecret = false;
    assert.equal(r.status, 503);
    assert.equal(await r.text(), '{"error":"indisponible"}');
  });
});

describe('Protocole MCP et droits par profil', () => {
  test('qui_suis_je : acteur, profil, outils autorisés et version', async () => {
    const c = await client(JETON.biblio);
    const r = await c.callTool({ name: 'qui_suis_je', arguments: {} });
    const donnees = JSON.parse(r.content[0].text);
    assert.equal(donnees.acteur, 'hermes-bibliothecaire');
    assert.equal(donnees.profil, 'ecriture');
    assert.deepEqual([...donnees.outils].sort(), nomsPour('ecriture'));
    assert.ok(donnees.outils.includes('creer_personne') && !donnees.outils.includes('supprimer_personne') && !donnees.outils.includes('restaurer_depuis_audit'));
    assert.ok(!donnees.outils.includes('outil_reserve'));
    assert.equal(donnees.serveur.nom, 'chevalier-ia-os');
    assert.match(donnees.serveur.version, /^\d+\.\d+\.\d+$/);
    await c.close();
  });
  test('droits par profil : un outil hors profil n’est ni listé ni exécutable, même si l’appel arrive', async () => {
    const biblio = await client(JETON.biblio);
    assert.deepEqual((await biblio.listTools()).tools.map((t) => t.name).sort(), nomsPour('ecriture'));
    const refus = await biblio.callTool({ name: 'outil_reserve', arguments: {} }).catch((e) => ({ erreur: e }));
    assert.ok(refus.erreur || refus.isError, 'appel refusé');
    await biblio.close();
    const code = await client(JETON.code);
    // Un jeton statique n'a pas d'e-mail vérifié : modifier_reglages_devis (réservé à Jérôme, par son identité) n'est jamais listé, même en profil complet.
    assert.deepEqual((await code.listTools()).tools.map((t) => t.name).sort(), [...nomsPour('complet').filter((n) => n !== 'modifier_reglages_devis'), 'outil_reserve'].sort());
    assert.equal(JSON.parse((await code.callTool({ name: 'outil_reserve', arguments: {} })).content[0].text).ok, true);
    await code.close();
  });
});

describe('Outils de lecture par le protocole MCP', () => {
  test('chaque profil peut lire : chercher, lire_affaire, lister_affaires, lire_reglages (schéma vide) et lire_audit répondent', async () => {
    for (const jeton of [JETON.lecteur, JETON.biblio, JETON.code]) {
      const c = await client(jeton);
      const r = await c.callTool({ name: 'chercher', arguments: { texte: 'lilas', types: ['organisations'] } });
      assert.equal(r.isError, undefined);
      assert.deepEqual(JSON.parse(r.content[0].text).resultats.map((x) => x.id), ['org1']);
      const a = JSON.parse((await c.callTool({ name: 'lire_affaire', arguments: { id: 'a1', avecFil: true } })).content[0].text);
      assert.equal(a.affaire.titre, 'Site vitrine Atelier des Lilas');
      assert.ok(a.fil.length >= 2);
      const l = JSON.parse((await c.callTool({ name: 'lister_affaires', arguments: { enRetard: true } })).content[0].text);
      assert.deepEqual(l.affaires.map((x) => x.id), ['a1']);
      assert.equal(JSON.parse((await c.callTool({ name: 'lire_reglages', arguments: {} })).content[0].text).reglages.delaiPaiementJours, 45);
      assert.equal(JSON.parse((await c.callTool({ name: 'lire_audit', arguments: {} })).content[0].text).total, 3);
      await c.close();
    }
  });
  test('arguments invalides refusés par le schéma (texte absent, limite trop grande, mauvais type) et fiche inconnue : erreur sans détail technique', async () => {
    const c = await client(JETON.lecteur);
    for (const [nom, args] of [['chercher', {}], ['chercher', { texte: 'abc', limite: 500 }], ['lister_affaires', { archive: 'oui' }], ['lire_personne', { id: '' }]]) {
      const r = await c.callTool({ name: nom, arguments: args }).catch((e) => ({ isError: true, message: String(e.message) }));
      assert.equal(r.isError, true, `${nom} ${JSON.stringify(args)}`);
    }
    const inconnue = await c.callTool({ name: 'lire_personne', arguments: { id: 'zzz' } });
    assert.equal(inconnue.isError, true);
    assert.match(inconnue.content[0].text, /Personne introuvable/);
    assert.doesNotMatch(inconnue.content[0].text, /at |node_modules|\.js:/);
    await c.close();
  });
  test('le journal note le nom de l’outil lu (liste blanche) mais jamais ses arguments ni les données', async () => {
    lignesJournal.length = 0;
    const c = await client(JETON.biblio);
    await c.callTool({ name: 'chercher', arguments: { texte: 'camille@exemple.test' } });
    await c.close();
    const appel = lignesJournal.find((l) => l.outil === 'chercher');
    assert.ok(appel, 'ligne de journal pour chercher');
    const tout = JSON.stringify(lignesJournal);
    for (const interdit of ['camille@exemple.test', 'Camille Durand', 'Atelier des Lilas']) assert.equal(tout.includes(interdit), false, interdit);
  });
});

describe('Journaux sans secret', () => {
  test('aucun jeton, en-tête, paramètre ni contenu dans les lignes de journal, y compris en cas d’erreur', async () => {
    lignesJournal.length = 0;
    const c = await client(JETON.code);
    await c.callTool({ name: 'qui_suis_je', arguments: {} });
    await c.close();
    await brut(JETON.code, { corps: { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'OUTIL_INVENTE_PAR_LE_CLIENT', arguments: { email: 'secret@exemple.test' } } } });
    await brut(JETON.revoque);
    panneSecret = true;
    await brut(JETON.code);
    panneSecret = false;
    assert.ok(lignesJournal.length >= 4);
    const tout = JSON.stringify(lignesJournal);
    for (const secret of Object.values(JETON)) assert.equal(tout.includes(secret), false, 'jeton en clair');
    for (const interdit of ['Bearer', 'secret@exemple.test', 'OUTIL_INVENTE_PAR_LE_CLIENT', 'détail interne', 'arguments']) assert.equal(tout.includes(interdit), false, interdit);
    const champs = new Set(lignesJournal.flatMap((l) => Object.keys(l)));
    for (const c of champs) assert.ok(['jeton', 'acteur', 'profil', 'methodeMcp', 'outil', 'operationId', 'dureeMs', 'statut', 'code', 'froid', 'demarrageMs', 'dureeAuthMs', 'dureeOutilMs', 'lectures'].includes(c), `champ hors liste blanche : ${c}`);
  });
  test('la ligne écrite pour Cloud Logging est du JSON avec une sévérité', async () => {
    const { journaliser } = await import('../functions/src/securite/journaux.js');
    const sorties = [];
    journaliser({ jeton: 'x', statut: 500, code: 'erreur_interne', intrus: 'ne doit pas sortir' }, (l) => sorties.push(l));
    const ligne = JSON.parse(sorties[0]);
    assert.equal(ligne.severity, 'ERROR');
    assert.equal(ligne.intrus, undefined);
  });
});

describe('Profil agent-devis : liste blanche et outils refusés', () => {
  // Dérivé de la liste réelle des outils : tout futur outil est refusé à agent-devis tant qu'il n'est pas ajouté à la liste blanche en dur de D3d.
  const NON_ACCORDES = outilsAutorises('complet').map((o) => o.nom).filter((n) => !LISTE_AGENT.includes(n));
  test('agent-devis : 21 outils exactement, finaliser_devis présent, tout le reste refusé (liste dérivée des outils réels)', () => {
    const noms = nomsPour('agent-devis');
    assert.equal(noms.length, 21);
    assert.ok(NON_ACCORDES.length >= 60, 'la liste dérivée couvre tous les autres outils');
    assert.ok(noms.includes('finaliser_devis') && noms.includes('preparer_email') && noms.includes('qui_suis_je'));
    for (const n of NON_ACCORDES) assert.ok(!noms.includes(n), `${n} ne doit pas être accordé`);
  });
  test('agent-devis : listTools sans supprimer_devis ; l’appel d’un outil non accordé est refusé', async () => {
    const c = await client(JETON.agent);
    const vus = (await c.listTools()).tools.map((t) => t.name);
    assert.ok(vus.includes('finaliser_devis') && !vus.includes('supprimer_devis'));
    const avant = JSON.stringify(collections);
    for (const nom of NON_ACCORDES) {
      const r = await c.callTool({ name: nom, arguments: {} }).catch((e) => ({ erreur: e }));
      assert.ok(r.erreur || r.isError, `${nom} doit être refusé`);
      const texte = r.erreur ? String(r.erreur.message) : (r.content ?? []).map((x) => x.text ?? '').join(' ');
      assert.match(texte, /not found/i, `${nom} : refusé comme outil inconnu pour ce profil, pas pour des arguments invalides`);
    }
    assert.equal(JSON.stringify(collections), avant, 'aucun refus n’écrit');
    const q = JSON.parse((await c.callTool({ name: 'qui_suis_je', arguments: {} })).content[0].text);
    assert.equal(q.profil, 'agent-devis');
    assert.deepEqual([...q.outils].sort(), nomsPour('agent-devis'));
    await c.close();
  });
});

describe('Profil assistant-devis : liste blanche et outils refusés', () => {
  const NON_ACCORDES = outilsAutorises('complet').map((o) => o.nom).filter((n) => !LISTE_ASSISTANT.includes(n));
  test('1 assistant-devis : 24 outils exactement (liste écrite à la main), tout futur outil refusé tant qu\'il n\'est pas ajouté en dur', () => {
    const noms = nomsPour('assistant-devis');
    assert.equal(LISTE_ASSISTANT.length, 24);
    assert.deepEqual(noms, [...LISTE_ASSISTANT].sort());
    assert.ok(NON_ACCORDES.length >= 55);
  });
  test('2 agent-devis : toujours exactement 21 outils, sans les trois outils de modification (non-régression)', () => {
    const noms = nomsPour('agent-devis');
    assert.equal(noms.length, 21);
    assert.deepEqual(noms, [...LISTE_AGENT].sort());
    for (const n of ['modifier_lignes_devis', 'annuler_derniere_modification_devis', 'nouvelle_version_devis']) assert.ok(!noms.includes(n));
  });
  test('3 assistant-devis : aucun supprimer_*, restaurer_depuis_audit, modifier_personne, changer_statut_devis, archiver_devis, marquer_test, demarquer_test, modifier_reglages_devis ; appel direct refusé', async () => {
    const noms = nomsPour('assistant-devis');
    for (const n of ['restaurer_depuis_audit', 'modifier_personne', 'changer_statut_devis', 'archiver_devis', 'marquer_test', 'demarquer_test', 'modifier_reglages_devis']) assert.ok(!noms.includes(n), n);
    assert.ok(!noms.some((n) => n.startsWith('supprimer_')));
    const c = await client(JETON.assistant);
    const vus = (await c.listTools()).tools.map((t) => t.name);
    assert.ok(vus.includes('modifier_lignes_devis') && vus.includes('nouvelle_version_devis') && !vus.includes('supprimer_devis'));
    const avant = JSON.stringify(collections);
    for (const nom of NON_ACCORDES) {
      const r = await c.callTool({ name: nom, arguments: {} }).catch((e) => ({ erreur: e }));
      assert.ok(r.erreur || r.isError, `${nom} doit être refusé`);
      const texte = r.erreur ? String(r.erreur.message) : (r.content ?? []).map((x) => x.text ?? '').join(' ');
      assert.match(texte, /not found/i, nom);
    }
    assert.equal(JSON.stringify(collections), avant, 'aucun refus n’écrit');
    const q = JSON.parse((await c.callTool({ name: 'qui_suis_je', arguments: {} })).content[0].text);
    assert.equal(q.profil, 'assistant-devis');
    assert.deepEqual([...q.outils].sort(), noms);
    await c.close();
  });
});

describe('Serveur de Jérôme : la liste des outils ne change pas (D3d)', () => {
  // Listes écrites à la main, relevées sur main (2.10.0), puis ajustées le 22/10/2026 : « tâche de projet » est devenue « livrable » (ajouter_livrable_projet, terminer_livrable_projet, anciens noms retirés), puis la pause a été supprimée le 22/10/2026 (mettre_en_pause, mettre_projet_en_pause et reprendre_projet retirés, sans alias : 27 outils d’écriture au lieu de 30). Ni les autres noms ni le nombre d'outils ne doivent bouger.
  const LECTURE = ['chercher', 'lire_affaire', 'lire_audit', 'lire_organisation', 'lire_personne', 'lire_projet', 'lire_reglages', 'lister_activites', 'lister_affaires', 'lister_documents', 'lister_modeles_projet', 'lister_projets', 'qui_suis_je',
    'lire_proposition', 'lister_automatisations', 'lister_propositions', // + 3 outils de lecture de la file « À valider » (module Automatisations)
    'lister_articles', 'chercher_article',
    'diagnostiquer_fichiers', // outil d'essai temporaire (26/10/2026), à retirer après l'essai
    'lister_devis', 'lire_devis', 'lire_reglages_devis', 'rechercher_article_par_phrase', // + 2 outils de lecture du bordereau, + 2 de lecture des devis (module Devis, 24/10/2026), + la recherche par phrase (28/10/2026)
    'obtenir_pdf_officiel_devis']; // + le PDF officiel d'un devis finalisé, seul PDF à utiliser (garantie « aucun e-mail ne part tout seul », 29/10/2026)
  const ECRITURE = ['refuser_proposition', 'valider_proposition', 'abandonner_facture', 'ajouter_facture', 'ajouter_note', 'ajouter_livrable_projet', 'archiver_projet', 'changer_etape', 'changer_phase_projet', 'creer_activite', 'creer_affaire', 'creer_organisation', 'creer_personne', 'creer_projet', 'creer_projet_depuis_affaire', 'joindre_lien', 'marquer_facture_payee', 'marquer_perdue', 'modifier_affaire', 'modifier_note', 'modifier_organisation', 'modifier_personne', 'modifier_projet', 'retirer_document', 'rouvrir_affaire', 'rouvrir_projet', 'terminer_activite', 'terminer_projet', 'terminer_livrable_projet',
    'creer_article', 'modifier_article', 'desactiver_article',
    'creer_devis_brouillon', 'modifier_devis_brouillon', 'modifier_lignes_devis', 'annuler_derniere_modification_devis', 'creer_devis_depuis_modele', // + 3 outils d'écriture du bordereau, + 2 de brouillons de devis (module Devis, 24/10/2026)
    'nouvelle_version_devis', 'archiver_devis', 'enregistrer_envoi_devis', // + 3 transitions de devis annulables par le journal (25/10/2026)
    'enregistrer_reponse_vocabulaire', // + l'apprentissage du dictionnaire (28/10/2026)
    'modifier_destinataires_devis', // + destinataire d'un devis finalisé (29/10/2026)
    'preparer_email', // + brouillon d'e-mail d'un devis, jamais d'envoi (garantie « aucun e-mail ne part tout seul », 29/10/2026)
    'deposer_document', // + dépôt d'un fichier texte dans l'onglet « Documents » (28/10/2026)
    'marquer_test', 'demarquer_test']; // + mode test : marquer ou démarquer un essai (PR 2, 05/11/2026)
  const FINALISATION = ['finaliser_devis', 'changer_statut_devis', 'recalculer_montants_affaires', 'recalculer_usage_articles']; // écritures sensibles (figent le devis, ne se défont pas avec le journal, confirmation par code) : Claude Code seulement ; modifier_reglages_devis (09/11/2026) n'est PAS dans cette liste : réservé aux super admins (identité vérifiée) (e-mail OAuth vérifié), il n'apparaît jamais pour un jeton statique, même complet
  const SUPPRESSION = ['restaurer_depuis_audit', 'supprimer_activite', 'supprimer_devis', 'supprimer_affaire', 'supprimer_note', 'supprimer_organisation', 'supprimer_personne', 'supprimer_projet', 'supprimer_document_stocke', 'supprimer_tous_les_tests'];
  const attendu = {
    lecteur: [...LECTURE].sort(),
    agent: [...LISTE_AGENT].sort(),
    assistant: [...LISTE_ASSISTANT].sort(),
    biblio: [...LECTURE, ...ECRITURE].sort(),
    code: [...LECTURE, ...ECRITURE, ...FINALISATION, ...SUPPRESSION].sort(),
  };
  for (const [profil, liste] of Object.entries(attendu)) {
    test(`D3d profil « ${profil} » : exactement les mêmes outils que sur main, factures comprises (même sans option dans les réglages), moins extraire_valeur_projet supprimé le 18/10/2026`, async () => {
      const c = await client(JETON[profil]);
      // outil_reserve : outil d'essai de ce fichier, absent du vrai serveur.
      const recus = (await c.listTools()).tools.map((t) => t.name).filter((n) => n !== OUTIL_RESERVE.nom).sort();
      await c.close();
      // Jeton statique : jamais d'e-mail vérifié, donc jamais modifier_reglages_devis (réservé aux super admins (identité vérifiée)), même en profil complet.
      assert.deepEqual(recus, liste.filter((n) => n !== 'modifier_reglages_devis'));
      assert.deepEqual(nomsPour(profil === 'biblio' ? 'ecriture' : profil === 'code' ? 'complet' : profil === 'agent' ? 'agent-devis' : profil === 'assistant' ? 'assistant-devis' : 'lecture').filter((n) => n !== 'modifier_reglages_devis'), liste.filter((n) => n !== 'modifier_reglages_devis'));
    });
  }
});
