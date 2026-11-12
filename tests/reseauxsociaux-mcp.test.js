// Outils MCP du module Réseaux sociaux (13/11/2026) : 12 outils (4 de lecture, 8 d'écriture, aucun de suppression), de bout en bout par le protocole MCP,
// sur des données fictives en mémoire. Piège connu (leçon du 10/11) : le SDK retire sans erreur un champ inconnu ; on teste donc « pas écrit », jamais « refusé ».
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { creerGestionnaire } from '../functions/src/mcp/gestionnaire.js';
import { empreinte } from '../functions/src/securite/jetons.js';
import { creerAccesMemoire, avecBase } from '../functions/src/coeur/donnees.js';
import { creerLimiteur } from '../functions/src/securite/limites.js';
import { OUTILS, outilsAutorises } from '../functions/src/mcp/outils/index.js';
import { COLLECTIONS_ECRITES } from '../functions/src/coeur/ecriture.js';
import { outilsDesModules } from '../functions/src/clients/gestionnaire.js';
import { MODULES_DECLARES } from '../js/os/registre.js';
import { collections as base, MAINTENANT } from './_donnees-essai.js';

const JETONS = { lecteur: `cia_${'L'.repeat(43)}`, biblio: `cia_${'H'.repeat(43)}`, agent: `cia_${'A'.repeat(43)}`, code: `cia_${'C'.repeat(43)}` };
const entree = (jeton, nom, profil) => ({ jeton: nom, acteur: nom, profil, empreinte: empreinte(jeton), actif: true });
const arrets = [];
afterEach(async () => { while (arrets.length) await arrets.pop()(); });

const LECTURE = ['lister_sources_inspiration', 'lire_source_inspiration', 'lister_pistes', 'lister_idees'];
const ECRITURE = ['creer_source_inspiration', 'modifier_source_inspiration', 'ajouter_pistes', 'modifier_piste', 'retenir_piste', 'enregistrer_exemple', 'creer_idee', 'modifier_idee'];
const TABLES = ['reseauxsociaux_idees', 'reseauxsociaux_inspirations', 'reseauxsociaux_exemples', 'reseauxsociaux_pistes'];
const CHAMPS_PISTE = ['angle', 'ancre', 'auteur', 'creeLe', 'ideeId', 'etat', 'exempleId', 'format', 'lot', 'modifieLe', 'note', 'pilier', 'service', 'sourceId', 'sourceTitre', 'sourceType', 'url', 'via'];
const LINKEDIN = 'https://www.linkedin.com/in/graffeuil';

/** `racine` : null = serveur de Jérôme ; 'clients/a' = données rangées sous un client (comme la plateforme). */
async function demarrer({ racine = null, tables = {} } = {}) {
  const collections = structuredClone(base);
  const prefixe = racine ? `${racine}/` : '';
  for (const t of TABLES) collections[`${prefixe}${t}`] = structuredClone(tables[t] ?? []);
  const brut = creerAccesMemoire(collections);
  const donnees = racine ? avecBase(brut, racine) : brut;
  const horloge = { t: MAINTENANT.getTime() };
  const entrees = [entree(JETONS.lecteur, 'lecteur-essai', 'lecture'), entree(JETONS.biblio, 'hermes-bibliothecaire', 'ecriture'), entree(JETONS.agent, 'n8n-devis-essai', 'agent-devis'), entree(JETONS.code, 'claude-essai', 'complet')];
  const gestionnaire = creerGestionnaire({ magasin: { entrees: async () => ({ entrees, invalides: 0 }) }, donnees, limiteur: creerLimiteur({ donnees, maintenant: () => horloge.t }), maintenant: () => horloge.t, journal: () => {} });
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
  const rpc = async (jeton, methode, params) => (await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', Authorization: `Bearer ${JETONS[jeton]}` }, body: JSON.stringify({ jsonrpc: '2.0', id: ++n, method: methode, params }) })).json();
  const appeler = async (jeton, nom, args = {}) => {
    const corps = await rpc(jeton, 'tools/call', { name: nom, arguments: args });
    if (corps.error) return { isError: true, texte: corps.error.message };
    const texte = corps.result.content?.[0]?.text ?? '';
    let data;
    try { data = JSON.parse(texte); } catch { data = undefined; }
    return { isError: !!corps.result.isError, texte, data };
  };
  const outils = async (jeton) => (await rpc(jeton, 'tools/list', {})).result.tools.map((t) => t.name);
  const table = (t) => collections[`${prefixe}${t}`];
  return { collections, appeler, outils, table, pistes: () => table('reseauxsociaux_pistes'), sources: () => table('reseauxsociaux_inspirations'), idees: () => table('reseauxsociaux_idees'), exemples: () => table('reseauxsociaux_exemples') };
}
const ok = (r) => { assert.equal(r.isError, false, r.texte); return r.data; };
const refuse = (r, motif) => { assert.equal(r.isError, true, `devait être refusé : ${r.texte}`); if (motif) assert.match(r.texte, motif); };
const piste = (angle, extra = {}) => ({ angle, note: `Pourquoi : ${angle}`, ancre: 'Section Accueil', pilier: 'cas_concrets', format: 'texte', service: 'finance', ...extra });
const SITE = { type: 'site', nom: 'HeraHub', url: 'https://herahub.example.test', pourquoi: 'Un site de référence' };
async function avecSite(s) { return ok(await s.appeler('biblio', 'creer_source_inspiration', SITE)).id; }

describe('RS1 les 12 outils, les profils, aucune suppression', () => {
  test('RS1 le profil lecture voit les 4 outils de lecture ; écriture et complet voient les 12 ; agent-devis aucun ; aucun outil du module ne supprime', async () => {
    const s = await demarrer();
    const vus = async (p) => (await s.outils(p)).filter((n) => [...LECTURE, ...ECRITURE].includes(n)).sort();
    assert.deepEqual(await vus('lecteur'), [...LECTURE].sort());
    assert.deepEqual(await vus('biblio'), [...LECTURE, ...ECRITURE].sort());
    assert.deepEqual(await vus('code'), [...LECTURE, ...ECRITURE].sort());
    assert.deepEqual(await vus('agent'), []);
    const duModule = OUTILS.filter((o) => [...LECTURE, ...ECRITURE].includes(o.nom));
    assert.equal(duModule.length, 12);
    assert.equal(duModule.filter((o) => /supprimer|effacer|retirer|detruire/.test(o.nom)).length, 0);
    assert.equal(outilsAutorises('assistant-devis').filter((o) => duModule.includes(o)).length, 0);
    // Le registre des modules déclare exactement ces 12 outils pour Réseaux sociaux, et un client qui a le module les reçoit.
    const declares = MODULES_DECLARES.find((m) => m.id === 'reseauxsociaux').outilsMcp;
    assert.deepEqual([...declares].sort(), [...LECTURE, ...ECRITURE].sort());
    const chezClient = outilsDesModules(['reseauxsociaux'], OUTILS).map((o) => o.nom);
    for (const n of [...LECTURE, ...ECRITURE]) assert.ok(chezClient.includes(n), n);
  });
  test('RS1b les quatre tables du module sont écrivables par le serveur (sans elles : « Collection non écrivable »), les posts et les imports ne le sont pas', () => {
    for (const t of TABLES) assert.ok(COLLECTIONS_ECRITES.includes(t), t);
    assert.ok(!COLLECTIONS_ECRITES.includes('reseauxsociaux_posts') && !COLLECTIONS_ECRITES.includes('reseauxsociaux_imports'));
  });
  test('RS2 le profil lecture ne peut écrire aucun outil du module : refusé, rien n\'est écrit', async () => {
    const s = await demarrer();
    const avant = JSON.stringify(s.collections);
    for (const nom of ECRITURE) refuse(await s.appeler('lecteur', nom, { id: 'x', angle: 'a', nom: 'n', sourceId: 'x', pistes: [piste('a')], profilId: 'x', url: LINKEDIN }), /not found/i);
    refuse(await s.appeler('agent', 'lister_pistes', {}), /not found/i);
    assert.equal(JSON.stringify(s.collections), avant);
    ok(await s.appeler('lecteur', 'lister_pistes', {})); // la lecture reste ouverte
  });
});

describe('RS3 sources', () => {
  test('RS3 créer un site, un profil, un résumé de veille ; une fiche sans adresse valide est refusée ; un doublon aussi, sauf forcer', async () => {
    const s = await demarrer();
    const site = ok(await s.appeler('biblio', 'creer_source_inspiration', SITE));
    assert.equal(s.sources().find((x) => x.id === site.id).type, 'site');
    const profil = ok(await s.appeler('biblio', 'creer_source_inspiration', { type: 'profil', nom: 'Graffeuil', url: LINKEDIN, moyenneReactions: 120.5, moyenneCommentaires: 8, nombrePostsReleves: 12, releveLe: '2026-11-10' }));
    assert.equal(s.sources().find((x) => x.id === profil.id).moyenneReactions, 120.5);
    ok(await s.appeler('biblio', 'creer_source_inspiration', { type: 'veille', nom: 'Résumé de la semaine', resume: 'resume-semaine-45.md' }));
    refuse(await s.appeler('biblio', 'creer_source_inspiration', { type: 'profil', nom: 'Sans lien' }), /LinkedIn/);
    refuse(await s.appeler('biblio', 'creer_source_inspiration', { type: 'site', nom: 'Sans adresse' }), /https/);
    refuse(await s.appeler('biblio', 'creer_source_inspiration', { ...SITE, url: 'https://autre.example.test' }), /existe déjà/); // même nom
    refuse(await s.appeler('biblio', 'creer_source_inspiration', { type: 'site', nom: 'Autre nom', url: 'https://herahub.example.test' }), /existe déjà/); // même adresse
    assert.equal(s.sources().length, 3);
    ok(await s.appeler('biblio', 'creer_source_inspiration', { type: 'site', nom: 'Autre nom', url: 'https://herahub.example.test', forcer: true }));
    assert.equal(s.sources().length, 4);
    assert.equal(s.collections.crm_audit.filter((l) => l.collection === 'reseauxsociaux_inspirations' && l.outil === 'creer_source_inspiration').length, 4, 'le journal commun garde chaque création');
  });
  test('RS3b modifier une source : seuls les champs donnés changent ; un champ inconnu n\'est pas écrit ; aucun champ : refusé', async () => {
    const s = await demarrer();
    const id = await avecSite(s);
    ok(await s.appeler('biblio', 'modifier_source_inspiration', { id, pourquoi: 'Nouvelle raison', piliers: ['actu_ia'], secret: 'x', extrait: 'texte d’un tiers' }));
    const f = s.sources().find((x) => x.id === id);
    assert.equal(f.pourquoi, 'Nouvelle raison');
    assert.deepEqual(f.piliers, ['actu_ia']);
    assert.equal(f.nom, 'HeraHub');
    assert.equal('secret' in f, false);
    assert.equal('extrait' in f, false);
    refuse(await s.appeler('biblio', 'modifier_source_inspiration', { id }), /Aucun champ/);
    refuse(await s.appeler('biblio', 'modifier_source_inspiration', { id: 'inconnue', nom: 'x' }), /introuvable/);
  });
});

describe('RS4 ajouter_pistes', () => {
  test('RS4 trois pistes : auteur claude, état nouvelle, lot, source recopiée, traiteLe posé ; aucun champ texte, contenu ni extrait n\'est écrit', async () => {
    const s = await demarrer();
    const sourceId = await avecSite(s);
    const r = ok(await s.appeler('biblio', 'ajouter_pistes', {
      sourceId, lot: '2026-11-13-claude',
      pistes: [piste('Le cas concret du planning', { url: 'https://herahub.example.test/planning', texte: 'TEXTE RECOPIÉ', contenu: 'CONTENU', extrait: 'EXTRAIT D’UN TIERS', etat: 'retenue', ideeId: 'x', auteur: 'utilisateur', sourceId: 'pirate' }), piste('La méthode en trois étapes'), piste('Un chiffre qui surprend')],
    }));
    assert.equal(r.creees, 3);
    assert.equal(r.ids.length, 3);
    assert.deepEqual(r.ignorees, []);
    assert.equal(s.pistes().length, 3);
    for (const p of s.pistes()) {
      assert.deepEqual(Object.keys(p).filter((k) => k !== 'id').sort(), CHAMPS_PISTE.filter((k) => k !== 'via').concat(['via']).sort(), 'liste de champs fermée');
      assert.equal(p.auteur, 'claude');
      assert.equal(p.etat, 'nouvelle');
      assert.equal(p.ideeId, null);
      assert.equal(p.lot, '2026-11-13-claude');
      assert.equal(p.sourceId, sourceId);
      assert.equal(p.sourceType, 'site');
      assert.equal(p.sourceTitre, 'HeraHub');
      assert.equal(p.via, 'mcp');
      for (const interdit of ['texte', 'contenu', 'extrait']) assert.equal(interdit in p, false, `${interdit} n'est pas écrit`);
    }
    const premiere = s.pistes().find((p) => p.angle === 'Le cas concret du planning');
    assert.equal(premiere.url, 'https://herahub.example.test/planning');
    assert.match(s.sources().find((x) => x.id === sourceId).traiteLe, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(s.collections.crm_audit.filter((l) => l.collection === 'reseauxsociaux_pistes').length, 3, 'une ligne de journal par piste');
  });
  test('RS5 doublons : un angle déjà en stock (casse, accents, ponctuation) ou répété dans l\'appel est ignoré et dit ; tout en doublon : refusé', async () => {
    const s = await demarrer();
    const sourceId = await avecSite(s);
    ok(await s.appeler('biblio', 'ajouter_pistes', { sourceId, pistes: [piste('Le cas concret du planning')] }));
    const r = ok(await s.appeler('biblio', 'ajouter_pistes', { sourceId, pistes: [piste('LE CAS CONCRET, du planning !'), piste('Nouvelle idée'), piste('nouvelle idée')] }));
    assert.equal(r.creees, 1);
    assert.equal(r.ignorees.length, 2);
    assert.match(r.ignorees[0].raison, /déjà en stock/);
    assert.match(r.ignorees[1].raison, /déjà dans/);
    assert.equal(s.pistes().length, 2);
    refuse(await s.appeler('biblio', 'ajouter_pistes', { sourceId, pistes: [piste('Nouvelle idée')] }), /déjà en stock/);
    assert.equal(s.pistes().length, 2);
    // Le même angle sur une AUTRE source n'est pas un doublon.
    const autre = ok(await s.appeler('biblio', 'creer_source_inspiration', { type: 'site', nom: 'Autre site', url: 'https://autre.example.test' })).id;
    assert.equal(ok(await s.appeler('biblio', 'ajouter_pistes', { sourceId: autre, pistes: [piste('Nouvelle idée')] })).creees, 1);
  });
  test('RS6 30 pistes au plus par appel : 31 refusé, rien n\'est écrit ; 30 passent', async () => {
    const s = await demarrer();
    const sourceId = await avecSite(s);
    const lot = (n) => Array.from({ length: n }, (_, i) => piste(`Angle numéro ${i + 1}`));
    refuse(await s.appeler('biblio', 'ajouter_pistes', { sourceId, pistes: lot(31) }));
    assert.equal(s.pistes().length, 0);
    assert.equal(ok(await s.appeler('biblio', 'ajouter_pistes', { sourceId, pistes: lot(30) })).creees, 30);
    refuse(await s.appeler('biblio', 'ajouter_pistes', { sourceId, pistes: [] }));
    assert.equal(s.pistes().length, 30);
  });
  test('RS7 source inexistante : refusée ; un résumé de veille de n8n sans fiche est créé avec ses pistes (nom et veilleContenuId obligatoires) ; un autre identifiant ne crée rien', async () => {
    const s = await demarrer();
    refuse(await s.appeler('biblio', 'ajouter_pistes', { sourceId: 'inconnue', pistes: [piste('a')] }), /introuvable/);
    refuse(await s.appeler('biblio', 'ajouter_pistes', { sourceId: 'veille-c42', pistes: [piste('a')] }), /veilleContenuId/);
    refuse(await s.appeler('biblio', 'ajouter_pistes', { sourceId: 'veille-c42', veilleContenuId: 'c42', pistes: [piste('a')] }), /nom/i); // pas de nom
    refuse(await s.appeler('biblio', 'ajouter_pistes', { sourceId: 'autre-id', veilleContenuId: 'c42', nom: 'X', pistes: [piste('a')] }), /introuvable/); // identifiant non prévisible
    assert.equal(s.pistes().length + s.sources().length, 0);
    const r = ok(await s.appeler('biblio', 'ajouter_pistes', { sourceId: 'veille-c42', veilleContenuId: 'c42', nom: 'Veille de la semaine 45', pistes: [piste('Une actu à décrypter', { pilier: 'actu_ia' })] }));
    assert.equal(r.sourceCreee, true);
    const fiche = s.sources().find((x) => x.id === 'veille-c42');
    assert.equal(fiche.type, 'veille');
    assert.equal(fiche.veilleContenuId, 'c42');
    assert.equal(fiche.nom, 'Veille de la semaine 45');
    assert.match(fiche.traiteLe, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(s.pistes()[0].sourceTitre, 'Veille de la semaine 45');
    // Rappelé : la fiche existe, le doublon est ignoré.
    const r2 = ok(await s.appeler('biblio', 'ajouter_pistes', { sourceId: 'veille-c42', pistes: [piste('Une actu à décrypter'), piste('Une autre actu')] }));
    assert.equal(r2.sourceCreee, false);
    assert.equal(r2.creees, 1);
    assert.equal(s.sources().length, 1);
  });
  test('RS8 exempleId : seul un exemple de cette source est accepté ; un pilier inconnu est refusé avec la liste ; un lien sans https est retiré', async () => {
    const s = await demarrer();
    const profil = ok(await s.appeler('biblio', 'creer_source_inspiration', { type: 'profil', nom: 'Graffeuil', url: LINKEDIN })).id;
    const site = await avecSite(s);
    const ex = ok(await s.appeler('biblio', 'enregistrer_exemple', { profilId: profil, url: `${LINKEDIN}/posts/un-post`.replace('/in/graffeuil/posts', '/posts') })).id;
    refuse(await s.appeler('biblio', 'ajouter_pistes', { sourceId: site, pistes: [piste('a', { exempleId: ex })] }), /exempleId inconnu/);
    refuse(await s.appeler('biblio', 'ajouter_pistes', { sourceId: site, pistes: [piste('a', { exempleId: 'nimporte' })] }), /exempleId inconnu/);
    ok(await s.appeler('biblio', 'ajouter_pistes', { sourceId: profil, pistes: [piste('Reprendre cet angle', { exempleId: ex })] }));
    assert.equal(s.pistes()[0].exempleId, ex);
    refuse(await s.appeler('biblio', 'ajouter_pistes', { sourceId: site, pistes: [piste('b', { pilier: 'inconnu' })] }), /cas_concrets/);
    ok(await s.appeler('biblio', 'ajouter_pistes', { sourceId: site, pistes: [piste('Lien sans https', { url: 'herahub.example.test/page' })] }));
    assert.equal(s.pistes().find((p) => p.angle === 'Lien sans https').url, '');
  });
});

describe('RS9 modifier et retenir une piste', () => {
  test('RS9 écarter, remettre en stock ; « retenue » passe par retenir_piste ; un champ inconnu (ideeId, sourceId, texte) n\'est pas écrit ; rien ne se supprime', async () => {
    const s = await demarrer();
    const sourceId = await avecSite(s);
    const { ids } = ok(await s.appeler('biblio', 'ajouter_pistes', { sourceId, pistes: [piste('Première piste'), piste('Seconde piste')] }));
    ok(await s.appeler('biblio', 'modifier_piste', { id: ids[0], etat: 'ecartee', note: 'Trop proche d’une autre', ideeId: 'pirate', sourceId: 'pirate', texte: 'TEXTE', extrait: 'EXTRAIT' }));
    const p = s.pistes().find((x) => x.id === ids[0]);
    assert.equal(p.etat, 'ecartee');
    assert.equal(p.note, 'Trop proche d’une autre');
    assert.equal(p.ideeId, null);
    assert.equal(p.sourceId, sourceId);
    for (const interdit of ['texte', 'contenu', 'extrait']) assert.equal(interdit in p, false);
    refuse(await s.appeler('biblio', 'modifier_piste', { id: ids[0], etat: 'retenue' }), /retenir_piste/);
    refuse(await s.appeler('biblio', 'modifier_piste', { id: ids[0], etat: 'supprimee' }));
    refuse(await s.appeler('biblio', 'modifier_piste', { id: ids[0] }), /Aucun champ/);
    ok(await s.appeler('biblio', 'modifier_piste', { id: ids[0], etat: 'nouvelle' }));
    assert.equal(s.pistes().length, 2);
    const ecartees = ok(await s.appeler('lecteur', 'lister_pistes', { etat: 'ecartee' }));
    assert.equal(ecartees.total, 0);
    ok(await s.appeler('biblio', 'modifier_piste', { id: ids[1], etat: 'ecartee' }));
    assert.deepEqual(ok(await s.appeler('lecteur', 'lister_pistes', { etat: 'ecartee' })).pistes.map((x) => x.id), [ids[1]]);
  });
  test('RS10 retenir_piste crée l\'idée liée (sans extrait) et passe la piste à « retenue » ; un second appel est refusé et ne crée rien', async () => {
    const s = await demarrer();
    const sourceId = await avecSite(s);
    const { ids } = ok(await s.appeler('biblio', 'ajouter_pistes', { sourceId, pistes: [piste('La piste à retenir', { url: 'https://herahub.example.test/planning', ancre: 'Section Planning' })] }));
    const r = ok(await s.appeler('biblio', 'retenir_piste', { id: ids[0] }));
    assert.equal(s.idees().length, 1);
    const idee = s.idees()[0];
    assert.equal(idee.id, r.ideeId);
    assert.equal(idee.angle, 'La piste à retenir');
    assert.equal(idee.pisteId, ids[0]);
    assert.equal(idee.etat, 'idee');
    assert.equal(idee.pilier, 'cas_concrets');
    assert.equal(idee.sources[0].type, 'site');
    assert.equal(idee.sources[0].titre, 'HeraHub');
    assert.equal(idee.sources[0].url, 'https://herahub.example.test/planning');
    assert.equal(idee.sources[0].ancre, 'Section Planning');
    assert.equal(idee.sources[0].extrait, '', 'aucun texte de tiers dans la source de l\'idée');
    const p = s.pistes()[0];
    assert.equal(p.etat, 'retenue');
    assert.equal(p.ideeId, r.ideeId);
    refuse(await s.appeler('biblio', 'retenir_piste', { id: ids[0] }), /déjà devenue une idée/);
    assert.equal(s.idees().length, 1);
    refuse(await s.appeler('biblio', 'retenir_piste', { id: 'inconnue' }), /introuvable/);
    // Les compteurs se calculent : 1 piste, 1 retenue, 0 postée ; l'idée « Dans Buffer » compte « postée ».
    assert.deepEqual(ok(await s.appeler('lecteur', 'lire_source_inspiration', { id: sourceId })).compteurs, { pistes: 1, retenues: 1, postees: 0 });
    ok(await s.appeler('biblio', 'modifier_idee', { id: r.ideeId, etat: 'dans_buffer' }));
    assert.deepEqual(ok(await s.appeler('lecteur', 'lire_source_inspiration', { id: sourceId })).compteurs, { pistes: 1, retenues: 1, postees: 1 });
  });
});

describe('RS11 exemples', () => {
  test('RS11 enregistrer un exemple : lien et analyse, chiffres ; extrait jamais écrit ; un site est refusé ; un lien déjà là est refusé ; id met à jour sans effacer l\'analyse', async () => {
    const s = await demarrer();
    const profil = ok(await s.appeler('biblio', 'creer_source_inspiration', { type: 'profil', nom: 'Graffeuil', url: LINKEDIN, moyenneReactions: 100, moyenneCommentaires: 10 })).id;
    const site = await avecSite(s);
    const lien = 'https://www.linkedin.com/posts/graffeuil_un-post-activity-123';
    const r = ok(await s.appeler('biblio', 'enregistrer_exemple', { profilId: profil, url: lien, date: '2026-10-20', accroche: 'Une question directe', structure: 'Cas, chiffre, leçon', longueur: 'Court', pourquoi: 'Il parle du quotidien', format: 'texte', pilier: 'cas_concrets', reactions: 330, commentaires: 33, releveLe: '2026-11-10', extrait: 'LE TEXTE DU POST D’UN TIERS', texte: 'AUTRE TEXTE' }));
    const ex = s.exemples().find((e) => e.id === r.id);
    assert.equal(ex.extrait, '', 'extrait jamais écrit');
    assert.equal('texte' in ex, false);
    assert.equal(ex.reactions, 330);
    assert.equal(ex.accroche, 'Une question directe');
    refuse(await s.appeler('biblio', 'enregistrer_exemple', { profilId: site, url: lien }), /profil/);
    refuse(await s.appeler('biblio', 'enregistrer_exemple', { profilId: profil, url: lien }), /existe déjà/);
    refuse(await s.appeler('biblio', 'enregistrer_exemple', { profilId: profil, url: 'https://exemple.test/pas-linkedin' }), /LinkedIn/);
    refuse(await s.appeler('biblio', 'enregistrer_exemple', { profilId: 'inconnu', url: lien }), /introuvable/);
    ok(await s.appeler('biblio', 'enregistrer_exemple', { id: r.id, reactions: 400, releveLe: '2026-11-12' }));
    const apres = s.exemples().find((e) => e.id === r.id);
    assert.equal(apres.reactions, 400);
    assert.equal(apres.commentaires, 33);
    assert.equal(apres.accroche, 'Une question directe', 'l\'analyse est gardée');
    assert.equal(s.exemples().length, 1);
  });
  test('RS12 lire_source_inspiration ne rend jamais d\'extrait, même si l\'écran en a saisi un ; l\'écart à la moyenne est calculé', async () => {
    const profil = { id: 'pro1', type: 'profil', nom: 'Graffeuil', url: LINKEDIN, moyenneReactions: 100, moyenneCommentaires: 10, ordre: 0 };
    const s = await demarrer({ tables: {
      reseauxsociaux_inspirations: [profil],
      reseauxsociaux_exemples: [{ id: 'ex1', profilId: 'pro1', url: 'https://www.linkedin.com/posts/g_un', accroche: 'A', extrait: 'MOTS D’UN TIERS SAISIS À L’ÉCRAN', reactions: 220, commentaires: 22, date: '2026-10-01' }],
      reseauxsociaux_idees: [{ id: 'id1', angle: 'Idée avec source', etat: 'idee', sources: [{ type: 'site', titre: 'T', extrait: 'AUTRES MOTS DE TIERS' }], texte: 'Mon brouillon' }],
    } });
    const lue = ok(await s.appeler('lecteur', 'lire_source_inspiration', { id: 'pro1' }));
    assert.equal(lue.exemples.length, 1);
    assert.equal('extrait' in lue.exemples[0], false);
    assert.equal(lue.exemples[0].ecartALaMoyenne, '× 2,2 la moyenne');
    assert.doesNotMatch(JSON.stringify(lue), /MOTS D’UN TIERS/);
    const idees = ok(await s.appeler('lecteur', 'lister_idees', {}));
    assert.equal(idees.idees[0].texte, 'Mon brouillon', 'le brouillon de l\'utilisateur est rendu');
    assert.doesNotMatch(JSON.stringify(idees), /AUTRES MOTS DE TIERS/);
  });
});

describe('RS13 idées', () => {
  test('RS13 créer une idée : champs fermés, sources sans extrait, doublon d\'angle refusé sauf forcer ; modifier ; passage dans Buffer demande confirmation quand il efface un texte', async () => {
    const s = await demarrer();
    const r = ok(await s.appeler('biblio', 'creer_idee', { angle: 'Une idée de post', pilier: 'pedagogie', format: 'carrousel', service: 'commercial', texte: 'Mon brouillon.', sources: [{ type: 'site', titre: 'HeraHub', url: 'https://herahub.example.test', extrait: 'TEXTE D’UN TIERS' }], lien: { id: 'pirate' }, pisteId: 'pirate', etat: 'en_redaction' }));
    const idee = s.idees().find((i) => i.id === r.id);
    assert.equal(idee.etat, 'en_redaction');
    assert.equal(idee.texte, 'Mon brouillon.');
    assert.equal(idee.sources[0].extrait, '');
    assert.equal(idee.pisteId, null, 'pisteId ne se pose que par retenir_piste');
    assert.equal(idee.lien?.id ?? null, null);
    refuse(await s.appeler('biblio', 'creer_idee', { angle: 'une IDÉE de post.' }), /existe déjà/);
    ok(await s.appeler('biblio', 'creer_idee', { angle: 'une IDÉE de post.', forcer: true }));
    refuse(await s.appeler('biblio', 'creer_idee', { angle: 'Avec texte dans Buffer', etat: 'dans_buffer', texte: 'x' }), /Buffer/);
    ok(await s.appeler('biblio', 'modifier_idee', { id: r.id, angle: 'Angle corrigé', service: 'finance', sources: [{ type: 'veille', titre: 'Veille', resume: 'resume.md', extrait: 'NON' }] }));
    const apres = s.idees().find((i) => i.id === r.id);
    assert.equal(apres.angle, 'Angle corrigé');
    assert.equal(apres.texte, 'Mon brouillon.', 'le texte est gardé');
    assert.equal(apres.sources[0].extrait, '');
    refuse(await s.appeler('biblio', 'modifier_idee', { id: r.id, etat: 'dans_buffer' }), /efface son texte/);
    assert.equal(s.idees().find((i) => i.id === r.id).texte, 'Mon brouillon.');
    ok(await s.appeler('biblio', 'modifier_idee', { id: r.id, etat: 'dans_buffer', effacerLeTexte: true }));
    assert.equal(s.idees().find((i) => i.id === r.id).texte, '', 'la règle du passage de témoin s\'applique');
    refuse(await s.appeler('biblio', 'modifier_idee', { id: 'inconnue', angle: 'x' }), /introuvable/);
    refuse(await s.appeler('biblio', 'modifier_idee', { id: r.id }), /Aucun champ/);
    refuse(await s.appeler('biblio', 'modifier_idee', { id: r.id, etat: 'supprimee' }));
  });
});

describe('RS14 lecture', () => {
  test('RS14 lister_sources_inspiration : compteurs, filtres type et sansPiste, plafond ; lister_pistes : filtres source, état, pilier, format, lot, plafond ; lister_idees : filtres état et pilier', async () => {
    const s = await demarrer();
    const a = await avecSite(s);
    const b = ok(await s.appeler('biblio', 'creer_source_inspiration', { type: 'veille', nom: 'Une veille', resume: 'v.md' })).id;
    ok(await s.appeler('biblio', 'ajouter_pistes', { sourceId: a, lot: 'lot-1', pistes: [piste('Un'), piste('Deux', { pilier: 'actu_ia', format: 'video' })] }));
    const tout = ok(await s.appeler('lecteur', 'lister_sources_inspiration', {}));
    assert.equal(tout.total, 2);
    assert.deepEqual(tout.sources.find((x) => x.id === a).compteurs, { pistes: 2, retenues: 0, postees: 0 });
    assert.deepEqual(ok(await s.appeler('lecteur', 'lister_sources_inspiration', { sansPiste: true })).sources.map((x) => x.id), [b]);
    assert.deepEqual(ok(await s.appeler('lecteur', 'lister_sources_inspiration', { type: 'veille' })).sources.map((x) => x.id), [b]);
    assert.equal(ok(await s.appeler('lecteur', 'lister_pistes', { sourceId: a })).total, 2);
    assert.equal(ok(await s.appeler('lecteur', 'lister_pistes', { sourceId: b })).total, 0);
    assert.equal(ok(await s.appeler('lecteur', 'lister_pistes', { pilier: 'actu_ia' })).pistes[0].angle, 'Deux');
    assert.equal(ok(await s.appeler('lecteur', 'lister_pistes', { format: 'video' })).total, 1);
    assert.equal(ok(await s.appeler('lecteur', 'lister_pistes', { lot: 'lot-1' })).total, 2);
    assert.equal(ok(await s.appeler('lecteur', 'lister_pistes', { lot: 'autre' })).total, 0);
    const limitee = ok(await s.appeler('lecteur', 'lister_pistes', { limite: 1 }));
    assert.equal(limitee.pistes.length, 1);
    assert.equal(limitee.tronque, true);
    refuse(await s.appeler('lecteur', 'lister_pistes', { limite: 201 }));
    ok(await s.appeler('biblio', 'creer_idee', { angle: 'Idée A', pilier: 'pedagogie' }));
    ok(await s.appeler('biblio', 'creer_idee', { angle: 'Idée B', etat: 'abandonnee' }));
    assert.equal(ok(await s.appeler('lecteur', 'lister_idees', {})).total, 2);
    assert.deepEqual(ok(await s.appeler('lecteur', 'lister_idees', { etat: 'abandonnee' })).idees.map((i) => i.angle), ['Idée B']);
    assert.deepEqual(ok(await s.appeler('lecteur', 'lister_idees', { pilier: 'pedagogie' })).idees.map((i) => i.angle), ['Idée A']);
    const lue = ok(await s.appeler('lecteur', 'lire_source_inspiration', { id: a }));
    assert.equal(lue.pistes.length, 2);
    assert.equal(lue.pistes[0].etatAffiche, 'stock');
    refuse(await s.appeler('lecteur', 'lire_source_inspiration', { id: 'inconnue' }), /introuvable/);
  });
});

describe('RS15 aucune suppression, journal, espace client', () => {
  test('RS15 un parcours complet ne supprime aucun document ; le journal ne contient aucune action « supprimer » sur les tables du module', async () => {
    const s = await demarrer();
    const sourceId = await avecSite(s);
    const { ids } = ok(await s.appeler('biblio', 'ajouter_pistes', { sourceId, pistes: [piste('Un'), piste('Deux')] }));
    ok(await s.appeler('biblio', 'modifier_piste', { id: ids[0], etat: 'ecartee' }));
    ok(await s.appeler('biblio', 'retenir_piste', { id: ids[1] }));
    ok(await s.appeler('biblio', 'modifier_source_inspiration', { id: sourceId, pourquoi: 'x' }));
    const lignes = s.collections.crm_audit.filter((l) => TABLES.includes(l.collection));
    assert.ok(lignes.length >= 7);
    assert.equal(lignes.filter((l) => l.action === 'supprimer').length, 0);
    assert.equal(s.pistes().length, 2);
    assert.equal(s.sources().length, 1);
  });
  test('RS16 chez un client : tout s\'écrit sous clients/<client>/ et rien dans les tables de Jérôme', async () => {
    const s = await demarrer({ racine: 'clients/a' });
    const sourceId = ok(await s.appeler('biblio', 'creer_source_inspiration', SITE)).id;
    const { ids } = ok(await s.appeler('biblio', 'ajouter_pistes', { sourceId, pistes: [piste('Un'), piste('Deux')] }));
    ok(await s.appeler('biblio', 'retenir_piste', { id: ids[0] }));
    ok(await s.appeler('biblio', 'creer_idee', { angle: 'Une idée libre' }));
    assert.equal(s.pistes().length, 2);
    assert.equal(s.idees().length, 2);
    assert.equal(s.sources().length, 1);
    for (const t of TABLES) assert.equal((s.collections[t] ?? []).length, 0, `${t} de Jérôme reste vide`);
    assert.ok(s.collections['clients/a/crm_audit'].some((l) => l.collection === 'reseauxsociaux_pistes'), 'le journal du client garde la trace');
    assert.equal(s.collections.crm_audit.filter((l) => TABLES.includes(l.collection)).length, 0);
    const lue = ok(await s.appeler('lecteur', 'lire_source_inspiration', { id: sourceId }));
    assert.equal(lue.pistes.length, 2);
  });
});

describe('RS17 corrections de la relecture', () => {
  test('RS17 un extrait saisi à l\'écran survit à modifier_idee avec sources ; retirer une source qui en porte un est refusé ; une idée dans Buffer refuse un texte', async () => {
    const s = await demarrer({ tables: { reseauxsociaux_idees: [{ id: 'i1', angle: 'Idée', etat: 'idee', sources: [{ type: 'site', titre: 'HeraHub', url: 'https://herahub.example.test', extrait: 'MOTS SAISIS PAR L’UTILISATEUR' }] }, { id: 'i2', angle: 'Dans Buffer', etat: 'dans_buffer', sources: [] }] } });
    ok(await s.appeler('biblio', 'modifier_idee', { id: 'i1', sources: [{ type: 'site', titre: 'HeraHub', url: 'https://herahub.example.test' }, { type: 'veille', titre: 'Nouvelle', resume: 'r.md' }] }));
    const sources = s.idees().find((i) => i.id === 'i1').sources;
    assert.equal(sources.length, 2);
    assert.equal(sources[0].extrait, 'MOTS SAISIS PAR L’UTILISATEUR');
    assert.equal(sources[1].extrait, '');
    refuse(await s.appeler('biblio', 'modifier_idee', { id: 'i1', sources: [{ type: 'veille', titre: 'Nouvelle', resume: 'r.md' }] }), /mots saisis/);
    assert.equal(s.idees().find((i) => i.id === 'i1').sources.length, 2);
    refuse(await s.appeler('biblio', 'modifier_idee', { id: 'i2', texte: 'x' }), /Buffer/);
  });
  test('RS18 une piste liée à une idée ne revient pas en stock ; un identifiant de source trop long est refusé ; une fiche de veille a l\'identifiant prévisible et n\'est pas créée deux fois', async () => {
    const s = await demarrer();
    const site = await avecSite(s);
    const { ids } = ok(await s.appeler('biblio', 'ajouter_pistes', { sourceId: site, pistes: [piste('À retenir')] }));
    ok(await s.appeler('biblio', 'retenir_piste', { id: ids[0] }));
    refuse(await s.appeler('biblio', 'modifier_piste', { id: ids[0], etat: 'nouvelle' }), /liée à l’idée/);
    ok(await s.appeler('biblio', 'modifier_piste', { id: ids[0], etat: 'ecartee' }));
    refuse(await s.appeler('biblio', 'ajouter_pistes', { sourceId: 'x'.repeat(101), pistes: [piste('a')] }), /invalide/);
    const v = ok(await s.appeler('biblio', 'creer_source_inspiration', { type: 'veille', nom: 'Veille 7', veilleContenuId: 'abc_7' }));
    assert.equal(v.id, 'veille-abc_7');
    refuse(await s.appeler('biblio', 'creer_source_inspiration', { type: 'veille', nom: 'Autre nom', veilleContenuId: 'abc_7' }), /existe déjà/);
    const r = ok(await s.appeler('biblio', 'ajouter_pistes', { sourceId: 'veille-abc_7', veilleContenuId: 'abc_7', pistes: [piste('Une actu')] }));
    assert.equal(r.sourceCreee, false);
    assert.equal(s.sources().filter((x) => x.veilleContenuId === 'abc_7').length, 1);
  });
  test('RS19 une modification est refusée si le document a changé entre la lecture et l\'écriture (exigerAvant) : le moteur reçoit la condition', async () => {
    const s = await demarrer({ tables: { reseauxsociaux_idees: [{ id: 'i1', angle: 'Idée', etat: 'idee', sources: [], texte: 'ancien' }] } });
    const { executerEcritures } = await import('../functions/src/coeur/ecriture.js');
    const { modifierIdee } = await import('../functions/src/coeur/reseauxsociaux.js');
    const donnees = creerAccesMemoire(s.collections);
    let recu;
    await modifierIdee({ donnees, ecrire: async ({ operations }) => { recu = operations; return { operationId: null, ecritures: [] }; } }, { id: 'i1', angle: 'Nouvel angle' });
    assert.equal(recu.length, 1);
    assert.equal(recu[0].exigerAvant.texte, 'ancien');
    s.collections.reseauxsociaux_idees[0].texte = 'modifié entre-temps à l\'écran';
    await assert.rejects(executerEcritures({ donnees, ctx: { acteur: 'a', jeton: 'j', maintenant: new Date() }, outil: 'modifier_idee', operations: recu }), /changé pendant la préparation/);
    assert.equal(s.collections.reseauxsociaux_idees[0].texte, 'modifié entre-temps à l\'écran');
  });
});
