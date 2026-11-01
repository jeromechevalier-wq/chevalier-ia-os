// Tests des jeux de démonstration PAR MÉTIER (option --metier de scripts/donnees-demo.js ; scripts/plateforme/jeux-demo/).
// ÉMULATEUR Firestore seulement (projet demo-chevalier-ia-os). Lancé avec la série « outil-client » (npm run test:module donnees-demo).
import assert from 'node:assert/strict';
import { test, before } from 'node:test';
import { executerDonneesDemo, metiersDisponibles, problemesDuJeu, MARQUEUR, COLLECTIONS_DEMO } from '../scripts/plateforme/donnees-demo.js';
import { JEUX, MARGE_JEUX, catalogueDuJeu } from '../scripts/plateforme/jeux-demo/index.js';
import { cible, ouvrir } from '../scripts/plateforme/commun.js';
import * as D from '../js/modules/devis/logique.js';
import * as A from '../js/modules/devis/articles.js';
import * as F from '../js/modules/devis/familles.js';
import * as L from '../js/modules/crm/logique.js';
import { prixVenteArticle, calculerOuvrage, MOTS_OUVRAGE } from '../js/modules/devis/ouvrages.js';
import { ciblesDe, identifiantDeRegle, cleDeExpression, interpreter } from '../js/modules/devis/vocabulaire.js';
import { designation, estATrancher } from '../js/modules/devis/vocabulaire-plans.js';

const MAINTENANT = new Date('2026-10-26T10:00:00Z');
const modules = { affaires: true, projets: true, devis: true };
const NOMS = ['etancheur', 'agence', 'plombier'];
let db;

async function lancer(argv, extra = {}) {
  const lignes = [];
  const code = await executerDonneesDemo(argv, { out: (l = '') => lignes.push(l), env: process.env, maintenant: MAINTENANT, ...extra });
  return { code, texte: lignes.join('\n') };
}
const tous = async (client, c) => (await db.collection(`clients/${client}/${c}`).get()).docs.map((d) => ({ ...d.data(), id: d.id }));
async function creerClient(id, { demo = true } = {}) {
  await db.doc(`clients/${id}`).set({ nom: id, modules, ...(demo ? { demo: true } : {}) });
  await db.doc(`clients/${id}/membres/alice@exemple.test`).set({ role: 'editeur' });
}
async function photo(prefixe) {
  const docs = [];
  const marcher = async (ref) => {
    const s = await ref.get();
    if (s.exists) docs.push([ref.path, JSON.stringify(s.data())]);
    for (const c of await ref.listCollections()) for (const x of await c.listDocuments()) await marcher(x);
  };
  await marcher(db.doc(prefixe));
  return docs.sort();
}
const enDate = (v) => (v?.toDate ? v.toDate() : v);

before(() => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST absent : ces tests ne se lancent que sur l'émulateur");
  db = ouvrir(cible({}, process.env)).db;
});

// Marques connues (fournisseurs, matériaux, réseaux, constructeurs) : aucune ne doit apparaître dans un jeu public. Seuls « Google My Business » et « ChatGPT » sont admis,
// et seulement dans le jeu de l'agence : ce sont les noms des services vendus (demandés par Jérôme).
const MARQUES = ['ikea', 'leroy', 'castorama', 'brico', 'legrand', 'schneider', 'weber', 'sika', 'soprema', 'siplast', 'bosch', 'grohe', 'hansgrohe', 'geberit', 'jacob delafon', 'villeroy', 'ideal standard', 'saunier', 'atlantic', 'thermor', 'viessmann', 'vaillant', 'bulex', 'chaffoteaux', 'frisquet', 'de dietrich', 'velux', 'knauf', 'isover', 'rockwool', 'ursa', 'danosa', 'icopal', 'derbigum', 'mapei', 'ardex', 'placo', 'facebook', 'instagram', 'linkedin', 'tiktok', 'youtube', 'wordpress', 'wix', 'shopify', 'amazon', 'samsung', 'sony', 'philips', 'panasonic', 'apple', 'microsoft', 'bing', 'openai', 'gemini', 'perplexity', 'canva', 'mailchimp'];
const reMarques = new RegExp(`(?<![\\p{L}])(${MARQUES.join('|')})(?![\\p{L}])`, 'iu');
const sansServicesAdmis = (texte) => texte.replace(/google my business|chatgpt|google/gi, '');

test('1. --metiers et --metier sans nom affichent la liste des métiers prêts, sans base ni client', async () => {
  for (const argv of [['--metiers'], ['--metier'], ['clientx', '--metier'], ['clientx', '--metier', '--ecrire']]) {
    const r = await lancer(argv);
    assert.equal(r.code, 0, `${argv.join(' ')}\n${r.texte}`);
    for (const n of NOMS) assert.match(r.texte, new RegExp(`\\b${n}\\b`));
    assert.doesNotMatch(r.texte, /Base visée/);
  }
  assert.deepEqual(metiersDisponibles().map((j) => j.id), NOMS);
  assert.deepEqual(NOMS.flatMap((n) => problemesDuJeu(JEUX[n])), []);
});

test('2. Un métier inconnu est refusé en français avec la liste ; --metier ne se combine pas avec les options de catalogue ni --retirer', async () => {
  await creerClient('met-inconnu');
  const avant = await photo('clients/met-inconnu');
  const r = await lancer(['met-inconnu', '--metier', 'boulanger', '--ecrire']);
  assert.equal(r.code, 1);
  assert.match(r.texte, /Métier inconnu : « boulanger »/);
  for (const n of NOMS) assert.match(r.texte, new RegExp(n));
  assert.match(r.texte, /Rien n'a été écrit/);
  for (const extra of [['--catalogue-exemple'], ['--catalogue-depuis', 'chevalier-ia-os']]) {
    const x = await lancer(['met-inconnu', '--metier', 'plombier', ...extra, '--ecrire']);
    assert.equal(x.code, 1);
    assert.match(x.texte, /ne se combine pas avec --catalogue-depuis ni --catalogue-exemple/);
  }
  const y = await lancer(['met-inconnu', '--metier', 'plombier', '--retirer', '--ecrire']);
  assert.equal(y.code, 1);
  assert.deepEqual(await photo('clients/met-inconnu'), avant);
  // Un jeu incomplet n'est jamais proposé : il disparaît de la liste.
  const incomplet = { ...JEUX.plombier, id: 'incomplet', mots: JEUX.plombier.mots.slice(0, 2) };
  assert.ok(problemesDuJeu(incomplet).some((p) => /moins de 6 mots/.test(p)));
  assert.ok(problemesDuJeu({ ...JEUX.plombier, vedettes: [] }).some((p) => /vedette/.test(p)));
  assert.ok(problemesDuJeu({ ...JEUX.plombier, articles: JEUX.plombier.articles.slice(0, 5) }).length > 0);
});

for (const nom of NOMS) {
  test(`3. Jeu « ${nom} » : données complètes, prix inventés ronds, mots valides avec le vrai moteur, aucune marque`, () => {
    const jeu = JEUX[nom];
    const { articles, familles } = catalogueDuJeu(jeu);
    assert.ok(articles.length >= 20, `${articles.length} articles`);
    assert.equal(new Set(articles.map((a) => a.id)).size, articles.length);
    assert.ok(articles.filter((a) => a.type === 'ouvrage').length >= 3, '3 ensembles au moins');
    assert.ok(MOTS_OUVRAGE.some((m) => m.id === jeu.motOuvrage));
    const liste = F.famillesDe(familles);
    const reglages = { modeMarge: 'majoration', marge: MARGE_JEUX };
    const parId = new Map(articles.map((x) => [x.id, x]));
    const ventes = new Map(jeu.articles.map(([id,, , vente]) => [id, vente]));
    for (const a of articles) {
      assert.ok(A.UNITES_PROPOSEES.includes(a.unite), `${a.id} : unité ${a.unite}`);
      const fam = liste.find((f) => f.id === a.familleId);
      assert.ok(fam && fam.actif, `${a.id} : famille ${a.familleId} inconnue`);
      assert.equal(F.typeDeFamille(liste, a.familleId), a.type, `${a.id} : le type se déduit de la famille`);
      if (a.type !== 'ouvrage') {
        assert.equal(prixVenteArticle(a, reglages), ventes.get(a.id), `${a.id} : le prix de vente est le prix rond du jeu`);
        assert.ok(Number.isInteger(ventes.get(a.id)), `${a.id} : prix rond`);
        const v = A.validerArticle({ libelle: a.libelle, unite: a.unite, prixAchat: String(a.prixAchat).replace('.', ','), tauxTva: String(a.tauxTva), type: a.type, familleId: a.familleId, code: a.code }, { articles: articles.filter((x) => x.id !== a.id), familles: liste, reglages });
        assert.deepEqual(v.erreurs ?? {}, {}, a.id);
      } else {
        const calcul = calculerOuvrage(a, parId, reglages);
        assert.deepEqual(calcul.erreurs, [], a.id);
        for (const c of a.composants) assert.ok(articles.some((x) => x.id === c.articleId && x.type !== 'ouvrage'), `${a.id} : composant ${c.articleId}`);
      }
    }
    // Mots appris : même modèle que PR 488, valides avec le vrai moteur, cibles existantes, un de chaque sorte.
    assert.ok(jeu.mots.length >= 6 && jeu.mots.length <= 10);
    const vocab = [];
    for (const m of jeu.mots) {
      const cles = m.articles.map((id) => articles.find((a) => a.id === id));
      assert.ok(cles.every(Boolean), `mot « ${m.expression} » : article absent`);
      const cle = cleDeExpression(m.expression);
      vocab.push({ id: identifiantDeRegle(cle), cle, expression: m.expression, statut: m.statut, origine: m.appris ?? 'manuelle', confirmations: 0, contradictions: 0, conflit: false,
        ...(cles.length === 1 ? { articleId: cles[0].id, articleLibelle: cles[0].libelle } : { articleId: '', articleLibelle: '', cibles: cles.map((a) => ({ genre: 'article', id: a.id, libelle: a.libelle })) }) });
    }
    for (const m of vocab) { assert.equal(designation(m, articles, []).mort, false, m.expression); assert.ok(ciblesDe(m).length >= 1); assert.equal(estATrancher(m), false); }
    assert.deepEqual([...new Set(jeu.mots.map((m) => m.statut))].sort(), ['a_confirmer', 'active', 'desactivee']);
    assert.ok(jeu.mots.some((m) => m.articles.length > 1) && jeu.mots.some((m) => m.articles.length === 1) && jeu.mots.some((m) => m.validation === 'reponses'));
    const actifs = vocab.filter((m) => m.statut === 'active');
    const lu = interpreter(`il faut ${jeu.mots.find((m) => m.statut === 'active').expression}`, { regles: actifs, articles });
    assert.ok(JSON.stringify(lu).includes(jeu.mots.find((m) => m.statut === 'active').articles[0]), 'le moteur comprend un mot actif');
    // Vedettes : articles existants, au moins brouillon / envoyé / signé.
    for (const v of jeu.vedettes) for (const s of v.sections) for (const [id, q] of s.lignes) { assert.ok(articles.some((a) => a.id === id), `vedette : ${id}`); assert.ok(q > 0); }
    for (const st of ['brouillon', 'envoye', 'accepte']) assert.ok(jeu.vedettes.some((v) => v.statut === st), st);
    assert.equal(jeu.organisations.length, 15);
    // Mots interdits et marques.
    const texte = JSON.stringify(jeu);
    assert.doesNotMatch(texte, /\bcibles?\b/i, 'le mot « cible » est interdit');
    assert.doesNotMatch(texte, /\bCRM\b/i, 'le mot « CRM » est interdit');
    const propre = nom === 'agence' ? sansServicesAdmis(texte) : texte;
    assert.doesNotMatch(propre, reMarques, 'marque connue dans le jeu');
    if (nom !== 'agence') assert.doesNotMatch(texte, /google|chatgpt/i);
  });
}

for (const nom of NOMS) {
  test(`4. Jeu « ${nom} » chargé : 2 à 4 devis par statut, 2 affaires au moins par étape, vedettes, devis finalisés cohérents (numéros, totaux, mentions), mots et mot du métier`, async () => {
    const id = `met-${nom}`;
    await creerClient(id);
    const r = await lancer([id, '--metier', nom, '--ecrire']);
    assert.equal(r.code, 0, r.texte);
    assert.match(r.texte, new RegExp(`Jeu « ${JEUX[nom].nom} »`));
    const devis = await tous(id, 'devis_devis');
    const parStatut = {};
    for (const d of devis) parStatut[d.statut] = (parStatut[d.statut] ?? 0) + 1;
    for (const s of ['brouillon', 'en_attente_envoi', 'envoye', 'accepte', 'refuse']) assert.ok(parStatut[s] >= 2 && parStatut[s] <= 4, `${s} : ${parStatut[s]}`);
    const affaires = await tous(id, 'crm_affaires');
    const parEtape = {};
    for (const a of affaires.filter((x) => !x.perdue && x.statut !== 'perdue')) parEtape[a.etape] = (parEtape[a.etape] ?? 0) + 1;
    assert.ok(Object.keys(parEtape).length >= 5, JSON.stringify(parEtape));
    for (const [e, n] of Object.entries(parEtape)) assert.ok(n >= 2 && n <= 4, `étape ${e} : ${n}`);
    const reglages = (await db.doc(`clients/${id}/devis_parametres/reglages`).get()).data();
    assert.equal(reglages.motOuvrage, JEUX[nom].motOuvrage);
    assert.equal(reglages[MARQUEUR], true);
    assert.equal(reglages.entreprise.nom, JEUX[nom].entreprise.nom);
    assert.equal(reglages.gestionDechets, JEUX[nom].dechets, 'le bloc des déchets suit le jeu : agence = non, étancheur et plombier = oui');
    const articles = await tous(id, 'devis_articles');
    assert.equal(articles.length, catalogueDuJeu(JEUX[nom]).articles.length);
    assert.ok(articles.every((a) => a[MARQUEUR] === true));
    // Vedettes présentes, dans le bon statut.
    for (const v of JEUX[nom].vedettes) assert.ok(devis.some((d) => d.objet === v.objet && d.statut === v.statut), `vedette « ${v.objet} » (${v.statut})`);
    // Devis finalisés : numéro unique, totaux recalculés avec le vrai code, mentions légales, nom du client figé, mention de TVA réduite figée si une ligne est à 10 %.
    const numeros = new Set();
    let avec10 = 0;
    for (const d of devis) {
      assert.equal(d[MARQUEUR], true);
      const total = D.totauxDevis(d);
      if (d.statut === 'brouillon') { assert.equal(d.numero ?? null, null); continue; }
      assert.match(d.numero, /^DEV-\d{4}-\d{2}-\d{2}-\d{3}$/);
      assert.ok(!numeros.has(d.numero), `numéro en double ${d.numero}`);
      numeros.add(d.numero);
      assert.deepEqual(d.totaux, total, `${d.numero} : totaux`);
      assert.ok(d.totaux.ttc > 0);
      assert.ok(d.clientNomFige, `${d.numero} : nom du client figé`);
      const fiche = d.organisationId ? await db.doc(`clients/${id}/crm_organisations/${d.organisationId}`).get() : await db.doc(`clients/${id}/crm_personnes/${d.personneId}`).get();
      assert.equal(d.clientNomFige, fiche.data().nom);
      assert.deepEqual(D.erreursMentionsLegales(d, { emetteur: reglages.entreprise, aujourdhui: L.aujourdhuiParis(enDate(d.finaliseLe)) }), [], d.numero);
      const a10 = d.sections.some((s) => (s.lignes ?? []).some((l) => l.tauxTva === 10 || l.tauxTva === 5.5));
      if (a10) { avec10 += 1; assert.ok(d.mentionTvaReduiteFigee, `${d.numero} : mention de TVA réduite figée`); } else assert.equal(d.mentionTvaReduiteFigee, undefined);
      for (const s of d.sections) for (const l of s.lignes ?? []) assert.ok(typeof l.prixVente === 'number', `${d.numero} : prix de vente figé`);
      // Les prix du devis sont ceux, ronds, du catalogue du jeu (marge du devis = marge du catalogue) ; un ensemble tombe sur la somme de ses composants.
      for (const s of d.sections) for (const l of s.lignes ?? []) {
        const def = JEUX[nom].articles.find((x) => x[0] === l.articleId);
        if (def) assert.equal(l.prixVente, def[3], `${d.numero} : ${l.articleId} au prix rond`);
        else {
          const ens = JEUX[nom].ensembles.find((x) => x[0] === l.articleId);
          assert.ok(ens, `${d.numero} : ligne ${l.articleId} inconnue`);
          const somme = ens[4].reduce((t, [c, q]) => t + JEUX[nom].articles.find((x) => x[0] === c)[3] * q, 0);
          assert.equal(l.prixVente, Math.round(somme * 100) / 100, `${d.numero} : ensemble ${l.articleId}`);
        }
      }
    }
    if (JEUX[nom].tvaReduite) assert.ok(avec10 >= 1, 'au moins un devis à 10 %'); else assert.equal(avec10, 0);
    const compteur = (await db.doc(`clients/${id}/devis_compteurs/global`).get()).data();
    assert.equal(compteur.valeur, numeros.size);
    // Mots appris : tous marqués, cibles dans le catalogue du jeu.
    const mots = await tous(id, 'devis_vocabulaire');
    assert.equal(mots.length, JEUX[nom].mots.length);
    for (const m of mots) { assert.equal(m[MARQUEUR], true); for (const c of ciblesDe(m)) assert.ok(articles.some((a) => a.id === c.id || a.id === c), m.id); }
    const confirmer = mots.find((m) => m.statut === 'a_confirmer');
    assert.equal(confirmer.confirmations, 1);
    assert.equal(confirmer.derniereConfirmationLe, '2026-10-25', 'confirmée la veille du chargement');
    assert.equal(mots.find((m) => m.statut === 'active' && m.validePar === 'reponses').derniereConfirmationLe, '2026-10-26');
    assert.ok(COLLECTIONS_DEMO.includes('devis_vocabulaire'));
  });
}

test('5. Chargement puis --retirer : la base revient à l’état initial (sauf le compteur des numéros) ; la simulation n’écrit rien', async () => {
  await creerClient('met-retrait');
  const avant = await photo('clients/met-retrait');
  const simu = await lancer(['met-retrait', '--metier', 'plombier']);
  assert.equal(simu.code, 0, simu.texte);
  assert.match(simu.texte, /SIMULATION : rien n'a été écrit/);
  assert.deepEqual(await photo('clients/met-retrait'), avant);
  assert.equal((await lancer(['met-retrait', '--metier', 'plombier', '--ecrire'])).code, 0);
  assert.notDeepEqual(await photo('clients/met-retrait'), avant);
  assert.equal((await lancer(['met-retrait', '--retirer', '--ecrire'])).code, 0);
  const apres = (await photo('clients/met-retrait')).filter(([chemin]) => !chemin.endsWith('/devis_compteurs/global'));
  assert.deepEqual(apres, avant);
  assert.equal((await db.doc('clients/met-retrait/devis_compteurs/global').get()).data().valeur > 0, true, 'le compteur des numéros n’est jamais remis à zéro');
});

test('6. Un client non marqué « démonstration » est refusé avec --metier, rien n’est écrit', async () => {
  await creerClient('met-refus', { demo: false });
  const avant = await photo('clients/met-refus');
  const r = await lancer(['met-refus', '--metier', 'etancheur', '--ecrire']);
  assert.equal(r.code, 1);
  assert.match(r.texte, /n'est pas marqué comme client de démonstration/);
  assert.deepEqual(await photo('clients/met-refus'), avant);
});

test('7. Changer de métier : retirer puis charger un autre jeu ; le mot du métier et le catalogue changent', async () => {
  await creerClient('met-change');
  assert.equal((await lancer(['met-change', '--metier', 'etancheur', '--ecrire'])).code, 0);
  assert.equal((await db.doc('clients/met-change/devis_parametres/reglages').get()).data().motOuvrage, 'ouvrage');
  // Sans retrait, un second chargement est refusé.
  const deux = await lancer(['met-change', '--metier', 'agence', '--ecrire']);
  assert.equal(deux.code, 1);
  assert.match(deux.texte, /déjà des données de démonstration/);
  assert.equal((await lancer(['met-change', '--retirer', '--ecrire'])).code, 0);
  assert.equal((await lancer(['met-change', '--metier', 'agence', '--ecrire'])).code, 0);
  const reglages = (await db.doc('clients/met-change/devis_parametres/reglages').get()).data();
  assert.equal(reglages.motOuvrage, 'prestation');
  assert.equal(reglages.entreprise.nom, 'Agence Démo Communication');
  const articles = await tous('met-change', 'devis_articles');
  assert.ok(articles.length > 0 && articles.every((a) => a.id.startsWith('ag-')), 'seulement le catalogue de l’agence');
  const devis = await tous('met-change', 'devis_devis');
  const numeros = devis.map((d) => d.numero).filter(Boolean);
  assert.equal(new Set(numeros).size, numeros.length, 'aucun numéro repris après le changement de métier');
});

test('8. Un mot appris réel apparu pendant le chargement n’est jamais écrasé (écriture « create »)', async () => {
  await creerClient('met-course');
  const reel = { expression: 'membrane', cle: 'membrane', statut: 'active', note: 'mot réel du client' };
  await db.doc(`clients/met-course/devis_vocabulaire/${identifiantDeRegle(cleDeExpression('membrane'))}`).set(reel);
  const base = ouvrir(cible({}, process.env));
  // La lecture des mots existants « ne voit pas » le mot réel : c'est la course entre la lecture et l'écriture.
  const dbTrompee = new Proxy(base.db, { get: (t, k) => {
    if (k === 'collection') return (chemin) => (chemin.endsWith('/devis_vocabulaire') ? { get: async () => ({ docs: [] }) } : t.collection(chemin));
    const v = t[k];
    return typeof v === 'function' ? v.bind(t) : v;
  } });
  const r = await lancer(['met-course', '--metier', 'etancheur', '--ecrire'], { base: { ...base, db: dbTrompee } });
  assert.equal(r.code, 1, r.texte);
  assert.match(r.texte, /Un mot appris est apparu chez le client/);
  const toujours = (await db.doc(`clients/met-course/devis_vocabulaire/${identifiantDeRegle(cleDeExpression('membrane'))}`).get()).data();
  assert.deepEqual(toujours, reel, 'le mot réel est intact');
  assert.equal((await tous('met-course', 'devis_vocabulaire')).length, 1, 'aucun autre mot écrit');
  // Le compteur des numéros a avancé avant le lot des mots : les devis numérotés déjà écrits ne verront jamais leur numéro revenir.
  const numerotes = (await tous('met-course', 'devis_devis')).filter((d) => d.numero).length;
  assert.ok(numerotes > 0);
  assert.equal((await db.doc('clients/met-course/devis_compteurs/global').get()).data().valeur, numerotes);
});

// ---- Familles du catalogue propres à chaque métier (solution provisoire : les 7 grandes familles restent, les sous-familles du bâtiment sont masquées)
const familleDe = (jeu, id) => F.famillesDe(catalogueDuJeu(jeu).familles).find((f) => f.id === id);
const articlesDe = (jeu, ids) => catalogueDuJeu(jeu).articles.filter((a) => ids.includes(a.id));

test('9. Agence : ses sous-familles propres (ids « agence- »), chaque article rangé dans une sous-famille active du bon type, plus aucun id agence-1 à agence-8', () => {
  const jeu = JEUX.agence;
  const liste = F.famillesDe(catalogueDuJeu(jeu).familles);
  const nomsSous = (parent) => jeu.familles.filter(([, , p]) => p === parent).map(([, nom]) => nom);
  for (const nom of ['Sites internet', 'Référencement moteurs et IA', 'Fiches Google My Business', 'Communication et contenus']) assert.ok(nomsSous('famille-2').includes(nom), `« ${nom} » sous Main d’œuvre`);
  assert.deepEqual(nomsSous('famille-1'), ['Affichage et écrans']);
  assert.deepEqual(nomsSous('famille-5'), ['Écrans en location']);
  assert.deepEqual(nomsSous('famille-3'), ['Prestations complètes']);
  for (const [id] of jeu.familles) assert.ok(id.startsWith('agence-') && !/^agence-[1-8]$/.test(id) && !id.startsWith('famille-'), id);
  const nomDe = (a) => F.cheminFamille(liste, a.familleId);
  for (const a of articlesDe(jeu, ['ag-p01', 'ag-p02'])) assert.equal(nomDe(a), 'Fournitures › Affichage et écrans');
  for (const a of articlesDe(jeu, ['ag-t01', 'ag-t02', 'ag-t03'])) assert.equal(nomDe(a), 'Matériels › Écrans en location');
  for (const a of articlesDe(jeu, ['ag-o01', 'ag-o02', 'ag-o03'])) assert.equal(nomDe(a), 'Ouvrages › Prestations complètes');
  for (const a of catalogueDuJeu(jeu).articles) {
    const f = liste.find((x) => x.id === a.familleId);
    assert.ok(f?.parentId && f.actif, `${a.id} : sous-famille active`);
  }
  assert.deepEqual(problemesDuJeu(jeu), []);
});

test('10. Masquage : les sous-familles de départ masquées sont écrites inactives avec leur nom, jamais sans nom ; un id inconnu ou un article mal rangé fait échouer le contrôle', () => {
  const departs = F.FAMILLES_PAR_DEFAUT.filter((f) => f.parentId);
  const { familles } = catalogueDuJeu(JEUX.agence);
  for (const d of departs) {
    const e = familles.liste.find((f) => f.id === d.id);
    assert.deepEqual(e, { id: d.id, nom: d.nom, actif: false, parentId: d.parentId });
  }
  assert.ok(familles.liste.every((f) => typeof f.nom === 'string' && f.nom), 'aucune entrée sans nom');
  assert.equal(F.famillesDe(familles).filter((f) => f.parentId && f.id.startsWith('famille-') && f.actif).length, 0, 'aucune sous-famille de départ active chez l’agence');
  assert.equal(F.famillesDe(familles).filter((f) => !f.parentId).length, 7, 'les 7 grandes familles restent');
  // Document écrit dès qu’il y a une famille masquée, même sans famille propre.
  const seule = catalogueDuJeu({ ...JEUX.etancheur, familles: [], famillesMasquees: ['famille-1-1'] }).familles;
  assert.deepEqual(seule.liste, [{ id: 'famille-1-1', nom: departs.find((f) => f.id === 'famille-1-1').nom, actif: false, parentId: 'famille-1' }]);
  assert.equal(catalogueDuJeu({ ...JEUX.etancheur, familles: [], famillesMasquees: undefined }).familles, null);
  // Contrôle de complétude.
  assert.match(problemesDuJeu({ ...JEUX.agence, famillesMasquees: ['famille-9-9'] }).join(' '), /famille masquée inconnue/);
  const mal = (modif) => problemesDuJeu({ ...JEUX.agence, articles: JEUX.agence.articles.map((x) => (x[0] === 'ag-p01' ? modif(x) : x)) }).join(' ');
  assert.match(mal((x) => [...x.slice(0, 5), 'famille-1-1']), /masquée/);
  assert.match(mal((x) => [...x.slice(0, 5), 'agence-ecrans']), /ne porte pas le type/);
  assert.match(mal((x) => [...x.slice(0, 5), 'agence-inconnue']), /inconnue/);
});

test('11. Étancheur et plombier : sous-familles propres (« etanch- », « plomb- »), sous-familles de départ gardées actives et utilisées, les autres masquées', () => {
  for (const [nom, prefixe, gardees] of [['etancheur', 'etanch-', ['famille-4-1', 'famille-5-1', 'famille-7-1', 'famille-7-2', 'famille-7-3']], ['plombier', 'plomb-', ['famille-7-1', 'famille-7-2']]]) {
    const jeu = JEUX[nom];
    const cat = catalogueDuJeu(jeu);
    const liste = F.famillesDe(cat.familles);
    for (const [id] of jeu.familles) assert.ok(id.startsWith(prefixe), id);
    const utilisees = new Set(cat.articles.map((a) => a.familleId));
    for (const g of gardees) { assert.ok(liste.find((f) => f.id === g).actif, `${g} active`); assert.ok(utilisees.has(g), `${g} utilisée`); }
    for (const f of liste.filter((x) => x.parentId?.startsWith('famille-') && x.id.startsWith('famille-') && !gardees.includes(x.id))) assert.equal(f.actif, false, `${f.id} masquée`);
    for (const [id] of jeu.familles) assert.ok(utilisees.has(id), `${id} utilisée`);
    assert.deepEqual(problemesDuJeu(jeu), []);
  }
  assert.deepEqual([...new Set(articlesDe(JEUX.plombier, ['pl-o01', 'pl-o02', 'pl-o03']).map((a) => F.cheminFamille(F.famillesDe(catalogueDuJeu(JEUX.plombier).familles), a.familleId)))], ['Ouvrages › Prestations complètes']);
  // Un même libellé sous deux parents (règle : le type suit le parent de premier niveau).
  const et = F.famillesDe(catalogueDuJeu(JEUX.etancheur).familles).filter((f) => f.nom === 'Toiture-terrasse');
  assert.deepEqual(et.map((f) => f.parentId).sort(), ['famille-1', 'famille-2']);
});

test('12. --metier écrit le document familles s’il est absent ou marqué (remplacé) ; un document du client sans marque arrête tout avant l’écriture', async () => {
  // Absent : écrit, marqué.
  await creerClient('fam-neuf');
  assert.equal((await lancer(['fam-neuf', '--metier', 'agence', '--ecrire'])).code, 0);
  const doc = (await db.doc('clients/fam-neuf/devis_parametres/familles').get()).data();
  assert.equal(doc[MARQUEUR], true);
  assert.equal(doc.liste.find((f) => f.id === 'famille-1-1').actif, false);
  assert.equal(doc.liste.find((f) => f.id === 'agence-sites').nom, 'Sites internet');
  // Marqué (reste d’une démonstration, retrait manuel du reste) : remplacé par celui du nouveau métier.
  await creerClient('fam-marque');
  await db.doc('clients/fam-marque/devis_parametres/familles').set({ liste: [{ id: 'ancienne', nom: 'Ancienne', actif: true }], [MARQUEUR]: true });
  assert.equal((await lancer(['fam-marque', '--metier', 'plombier', '--ecrire'])).code, 0);
  const remplace = (await db.doc('clients/fam-marque/devis_parametres/familles').get()).data();
  assert.ok(!remplace.liste.some((f) => f.id === 'ancienne') && remplace.liste.some((f) => f.id === 'plomb-7'));
  // Sans marque : refus en français, rien d’écrit.
  await creerClient('fam-client');
  await db.doc('clients/fam-client/devis_parametres/familles').set({ liste: [{ id: 'perso', nom: 'Perso', actif: true }] });
  const avant = await photo('clients/fam-client');
  const r = await lancer(['fam-client', '--metier', 'agence', '--ecrire']);
  assert.equal(r.code, 1);
  assert.match(r.texte, /a déjà ses propres familles/);
  assert.match(r.texte, /--vider/);
  assert.deepEqual(await photo('clients/fam-client'), avant);
  // Même refus en simulation.
  assert.equal((await lancer(['fam-client', '--metier', 'agence'])).code, 1);
});
