// Outils proposés par le serveur MCP d'une maison selon le champ `modules` de reglages_maison/ecran (26/11/2026, chantier « Achats par l'assistant », étape A).
// Sans ce champ (chez Jérôme) : rien ne change. Avec le champ : seulement les outils des modules listés (+ qui_suis_je), et les outils Achats si « achatsfactures » est listé.
// Tout en mémoire : aucun service Google, adresses inventées en exemple.test.
import './_fiche-essai.js';
import { test, describe, afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { creerGestionnaire } from '../functions/src/mcp/gestionnaire.js';
import { outilsDeLaMaison } from '../functions/src/mcp/outils-maison.js';
import { OUTILS } from '../functions/src/mcp/outils/index.js';
import { OUTILS_ACHATS, MESSAGE_ACHATS_PAS_BRANCHES } from '../functions/src/mcp/outils/achats.js';
import { empreinte, creerMagasin } from '../functions/src/securite/jetons.js';
import { creerLimiteur } from '../functions/src/securite/limites.js';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { viderCacheConfigurationMaison, lireModulesEcran, DUREE_CACHE_ECRAN_MS } from '../functions/src/coeur/config.js';
import { creerRouteurOauth } from '../functions/src/oauth/routeur.js';
import { brancherFicheEssai, FICHE_ESSAI } from './_reglages-maison-essai.js';
import { collections as base, MAINTENANT } from './_donnees-essai.js';

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-maison-essai';

const JETON = `cia_${'A'.repeat(43)}`;
const MODULES_ACHATS = ['achatsfactures', 'tableauachats', 'achatschantiers', 'achatsfournisseurs', 'achatsarticles'];
const NOMS_ACHATS = OUTILS_ACHATS.map((o) => o.nom);

const arrets = [];
afterEach(async () => { while (arrets.length) await arrets.pop()(); });
beforeEach(() => viderCacheConfigurationMaison());

/** Serveur MCP complet. `ecran` : reglages_maison/ecran (absent si non donné) ; `envelopper` : pannes injectées ; `profil` du jeton statique. */
async function demarrer({ ecran, envelopper = (d) => d, profil = 'complet', oauth = null } = {}) {
  viderCacheConfigurationMaison();
  const collections = structuredClone(base);
  if (ecran) collections.reglages_maison = [{ id: 'ecran', ...structuredClone(ecran) }];
  const donnees = envelopper(creerAccesMemoire(collections));
  const magasin = creerMagasin({ lire: async () => JSON.stringify([{ jeton: 'essai-achats', acteur: 'essai-achats', profil, empreinte: empreinte(JETON), actif: true }]), dureeCacheMs: 0 });
  const gestionnaire = creerGestionnaire({
    magasin, donnees, limiteur: creerLimiteur({ donnees, maintenant: () => MAINTENANT.getTime() }), outilsAchats: OUTILS_ACHATS,
    ...(oauth ? { oauth: oauth(donnees) } : {}), maintenant: () => MAINTENANT.getTime(), journal: () => {},
  });
  const serveur = createServer((req, res) => {
    const m = [];
    req.on('data', (x) => m.push(x));
    req.on('end', () => {
      const texte = Buffer.concat(m).toString('utf8');
      const type = req.headers['content-type'] || '';
      try { req.body = !texte ? undefined : type.includes('x-www-form-urlencoded') ? Object.fromEntries(new URLSearchParams(texte)) : JSON.parse(texte); } catch { req.body = undefined; }
      gestionnaire(req, res);
    });
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  arrets.push(() => new Promise((ok) => serveur.close(ok)));
  const racine = `http://127.0.0.1:${serveur.address().port}`;
  let n = 0;
  const rpc = async (corps, bearer = JETON) => fetch(`${racine}/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream', ...(bearer ? { Authorization: `Bearer ${bearer}` } : {}) },
    body: JSON.stringify({ jsonrpc: '2.0', id: ++n, ...corps }),
  });
  const lister = async (bearer) => {
    const r = await rpc({ method: 'tools/list' }, bearer);
    return { statut: r.status, corps: r.status === 200 ? await r.json() : await r.text() };
  };
  const appeler = async (nom, args = {}, bearer) => {
    const r = await rpc({ method: 'tools/call', params: { name: nom, arguments: args } }, bearer);
    const corps = await r.json();
    if (corps.error) return { isError: true, texte: corps.error.message };
    const texte = corps.result.content?.[0]?.text ?? '';
    let data;
    try { data = JSON.parse(texte); } catch { data = undefined; }
    return { isError: !!corps.result.isError, texte, data };
  };
  return { collections, donnees, lister, appeler, racine };
}
const noms = (liste) => liste.corps.result.tools.map((t) => t.name);

describe('Tri des outils par module (reglages_maison/ecran, champ « modules »)', () => {
  test('A1 maison Achats : tools/list ne contient aucun outil hors Achats', async () => {
    const s = await demarrer({ ecran: { modules: MODULES_ACHATS } });
    const l = await s.lister();
    assert.equal(l.statut, 200);
    assert.deepEqual(noms(l), ['qui_suis_je', ...NOMS_ACHATS]); // liste EXACTE
    for (const o of OUTILS) if (o.nom !== 'qui_suis_je') assert.ok(!noms(l).includes(o.nom), o.nom);
  });

  test('A2 maison Achats : un outil du CRM appelé directement est refusé, zéro écriture', async () => {
    const s = await demarrer({ ecran: { modules: MODULES_ACHATS } });
    const metier = () => JSON.stringify(Object.fromEntries(Object.entries(s.collections).filter(([k]) => !k.startsWith('mcp_')))); // hors compteurs du jeton
    const avant = metier();
    for (const [nom, args] of [['lister_affaires', {}], ['creer_personne', { prenom: 'Léa', nom: 'Essai' }], ['ajouter_facture', { projetId: 'pr1', montant: 100 }]]) {
      const r = await s.appeler(nom, args);
      assert.equal(r.isError, true, `${nom} devait être refusé`);
      assert.match(r.texte, /not found|introuvable|inconnu/i, nom);
    }
    assert.equal(metier(), avant);
  });

  test('A3 sans réglage : liste inchangée', async () => {
    const sans = await (await demarrer()).lister();
    const sansChamp = await (await demarrer({ ecran: { personnes: [{ email: 'admin@exemple.test', nom: 'Admin' }], configuration_crm: 'neutre' } })).lister();
    const nul = await (await demarrer({ ecran: { modules: null } })).lister();
    assert.equal(JSON.stringify(sans.corps), JSON.stringify(sansChamp.corps));
    assert.equal(JSON.stringify(sans.corps), JSON.stringify(nul.corps));
    const reference = JSON.parse(readFileSync(new URL('./fixtures/tools-list-complet.json', import.meta.url), 'utf8')).map((t) => t.name);
    assert.deepEqual(noms(sans), reference, 'mêmes outils que la liste figée du profil complet');
    for (const n of NOMS_ACHATS) assert.ok(!noms(sans).includes(n), `${n} n'existe pas sans réglage`);
    assert.deepEqual(outilsDeLaMaison({ outils: OUTILS, outilsAchats: OUTILS_ACHATS, reglage: { etat: 'absent' } }), OUTILS, 'la même liste (même objet), au caractère près');
  });

  test('A4 réglage mal formé : aucun module, un seul outil', async () => {
    for (const modules of ['achatsfactures', { achatsfactures: true }, [], ['inconnu', 'console', 42]]) {
      const l = await (await demarrer({ ecran: { modules } })).lister();
      assert.equal(l.statut, 200);
      assert.deepEqual(noms(l), ['qui_suis_je'], JSON.stringify(modules));
    }
  });

  test('A5 fiche illisible : 503 à froid, dernière valeur à chaud', async () => {
    let panne = true;
    const envelopper = (d) => ({ ...d, async document(nom, id) { if (nom === 'reglages_maison' && panne) throw new Error('panne simulée'); return d.document(nom, id); } });
    const s = await demarrer({ ecran: { modules: MODULES_ACHATS }, envelopper });
    const froid = await s.lister();
    assert.equal(froid.statut, 503);
    assert.equal(froid.corps, '{"error":"indisponible"}');
    // À chaud : une lecture réussie, puis la panne (cache expiré) : la dernière valeur connue sert.
    panne = false;
    let t = 1_000;
    const lire = (donnees) => lireModulesEcran(donnees, { maintenant: () => t });
    viderCacheConfigurationMaison();
    assert.equal((await lire(s.donnees)).etat, 'present');
    panne = true;
    t += DUREE_CACHE_ECRAN_MS + 1;
    assert.deepEqual(await lire(s.donnees), { etat: 'present', brut: MODULES_ACHATS });
    const chaud = await s.lister();
    assert.equal(chaud.statut, 200);
    assert.deepEqual(noms(chaud), ['qui_suis_je', ...NOMS_ACHATS]);
  });

  test('A6 maison Devis : outils du module et du socle seulement', async () => {
    const l = await (await demarrer({ ecran: { modules: ['devis'] } })).lister();
    const attendus = new Set(['qui_suis_je', 'chercher', 'lire_personne', 'lire_organisation', 'creer_personne', 'creer_organisation', 'modifier_personne', 'modifier_organisation', 'marquer_test', 'demarquer_test',
      'lister_articles', 'chercher_article', 'lire_reglages_devis', 'modifier_reglages_devis', 'creer_article', 'modifier_article', 'desactiver_article', 'lister_devis', 'lire_devis', 'obtenir_pdf_officiel_devis', 'creer_devis_brouillon',
      'modifier_devis_brouillon', 'modifier_lignes_devis', 'annuler_derniere_modification_devis', 'creer_devis_depuis_modele', 'finaliser_devis', 'nouvelle_version_devis', 'archiver_devis', 'enregistrer_envoi_devis', 'preparer_email',
      'modifier_destinataires_devis', 'recalculer_montants_affaires', 'recalculer_usage_articles', 'changer_statut_devis', 'supprimer_devis', 'rechercher_article_par_phrase', 'enregistrer_reponse_vocabulaire']);
    const vus = noms(l);
    for (const n of vus) assert.ok(attendus.has(n), `outil inattendu : ${n}`);
    for (const n of ['qui_suis_je', 'lister_devis', 'chercher', 'creer_personne']) assert.ok(vus.includes(n), n);
    for (const n of [...NOMS_ACHATS, 'lister_affaires', 'diagnostiquer_fichiers', 'lister_projets']) assert.ok(!vus.includes(n), n);
    // Affaires listé : diagnostiquer_fichiers revient ; Projets sans Affaires est refusé (même règle de dépendances que l'écran).
    const affaires = noms(await (await demarrer({ ecran: { modules: ['affaires'] } })).lister());
    assert.ok(affaires.includes('diagnostiquer_fichiers') && affaires.includes('lister_affaires'));
    const projetsSeuls = noms(await (await demarrer({ ecran: { modules: ['projets'] } })).lister());
    assert.deepEqual(projetsSeuls, ['qui_suis_je']);
  });

  test('A7 qui_suis_je dit la même liste', async () => {
    const s = await demarrer({ ecran: { modules: MODULES_ACHATS } });
    const r = await s.appeler('qui_suis_je');
    assert.equal(r.isError, false, r.texte);
    assert.deepEqual(r.data.outils, noms(await s.lister()));
    const lecture = await demarrer({ ecran: { modules: MODULES_ACHATS }, profil: 'lecture' });
    const rl = await lecture.appeler('qui_suis_je');
    assert.deepEqual(rl.data.outils, noms(await lecture.lister()));
    for (const n of rl.data.outils) assert.ok(n === 'qui_suis_je' || OUTILS_ACHATS.find((o) => o.nom === n).profils.includes('lecture'), n);
  });

  test('A2 creer_agence_achat : proposé au profil écriture, absent et refusé au profil lecture', async () => {
    const ecriture = await demarrer({ ecran: { modules: MODULES_ACHATS }, profil: 'ecriture' });
    assert.ok(noms(await ecriture.lister()).includes('creer_agence_achat'));
    const lecture = await demarrer({ ecran: { modules: MODULES_ACHATS }, profil: 'lecture' });
    assert.ok(!noms(await lecture.lister()).includes('creer_agence_achat'), 'absent de la liste en lecture');
    const r = await lecture.appeler('creer_agence_achat', { nomFournisseur: 'Nouveau Fournisseur', nomAgence: 'Agence Sud' });
    assert.equal(r.isError, true, 'refusé au profil lecture');
    // refus du PROFIL (l'outil n'existe pas pour ce jeton), pas « achats pas branchés » ni un refus du service
    assert.match(r.texte, /Tool creer_agence_achat not found/);
    assert.ok(!r.texte.includes(MESSAGE_ACHATS_PAS_BRANCHES));
    assert.ok(!/Agence créée/.test(r.texte));
  });
});

describe('Comptes du client admis par la connexion Google (aucun code de connexion changé)', () => {
  const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
  const IDENTITES = { 'ID-CLIENT': { email: 'client@exemple.test', emailVerifie: true, fournisseur: 'google.com' }, 'ID-INTRUS': { email: 'intrus@exemple.test', emailVerifie: true, fournisseur: 'google.com' } };
  const FICHE = { ...FICHE_ESSAI, comptes_autorises: ['client@exemple.test'], comptes_oauth_autorises: ['client@exemple.test'], super_admins: [], comptes_jerome_seul: [], proprietaire_par_defaut: '' };
  const pkce = () => { const verifier = randomBytes(32).toString('base64url'); return { verifier, challenge: createHash('sha256').update(verifier).digest('base64url') }; };

  test('A8 compte non listé refusé, compte retiré coupé', async () => {
    await brancherFicheEssai(FICHE);
    try {
      const s = await demarrer({
        ecran: { modules: MODULES_ACHATS },
        oauth: (donnees) => creerRouteurOauth({ donnees, verifierIdToken: async (j) => { if (!IDENTITES[j]) throw new Error('invalide'); return IDENTITES[j]; }, limitePostParMinute: 1_000_000 }),
      });
      const appli = `https://${process.env.GCLOUD_PROJECT}.web.app`;
      const demande = (p) => ({ response_type: 'code', client_id: 'cli_essai', redirect_uri: CALLBACK, code_challenge: p.challenge, code_challenge_method: 'S256', state: 'e', resource: `${appli}/mcp` });
      const approuver = (corps) => fetch(`${s.racine}/oauth/approve`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: appli }, body: JSON.stringify(corps) });
      // Compte absent de comptes_oauth_autorises : refusé dès l'écran d'accord.
      const refus = await approuver({ ...demande(pkce()), decision: 'allow', id_token: 'ID-INTRUS' });
      assert.equal(refus.status, 403);
      // Compte listé : code, puis jeton d'accès ; il voit les outils de la maison.
      const p = pkce();
      const r = await approuver({ ...demande(p), decision: 'allow', id_token: 'ID-CLIENT' });
      assert.equal(r.status, 200, await r.clone().text());
      const code = new URL((await r.json()).redirect).searchParams.get('code');
      const t = await fetch(`${s.racine}/oauth/token`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: CALLBACK, client_id: 'cli_essai', code_verifier: p.verifier }) });
      assert.equal(t.status, 200, await t.clone().text());
      const acces = (await t.json()).access_token;
      const ok = await s.lister(acces);
      assert.equal(ok.statut, 200);
      assert.deepEqual(noms(ok), ['qui_suis_je', ...NOMS_ACHATS]);
      // Compte retiré de la liste : son jeton ne marche plus à l'appel suivant.
      await brancherFicheEssai({ ...FICHE, comptes_oauth_autorises: [] });
      assert.equal((await s.lister(acces)).statut, 401);
    } finally {
      await brancherFicheEssai(FICHE_ESSAI);
    }
  });
});
