// Mode test, PR 1a-2b-1 : l'héritage du repère à la création (jamais de cascade après coup). Un test par point, le nom commence par son numéro :
// 1 affaire, 2 personne dans une organisation de test, 3 projet, 4 tâche, 5 devis (dont dupliquer), 6 activité et note, 7 mode éteint/allumé, 8 le serveur par le code copié.
// Captures dans tests/e2e/captures/mode-test-heritage/ (ordinateur ET téléphone).
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import {
  test, expect, connecter, allerA, listerDocuments, lireDocument, creerPersonne, creerOrganisation, creerAffaire, creerProjet,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/mode-test-heritage/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
const CLE = 'chevalier-os.modeTest';
const CRM = '/js/modules/crm/donnees.js';
const PRO = '/js/modules/projets/donnees.js';
const DEV = '/js/modules/devis/donnees.js';

test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});

const allumerAvant = (page) => page.addInitScript((c) => { try { if (localStorage.getItem(c) === null) localStorage.setItem(c, '1'); } catch { /* rien */ } }, CLE);
const appeler = (page, module, fonction, ...args) => page.evaluate(async ([m, f, a]) => (await import(m))[f](...a), [module, fonction, args]);
const estTest = async (chemin) => (await lireDocument(chemin)).test === true;
const sansChamp = async (chemin) => 'test' in (await lireDocument(chemin)) === false;

/** Fiches de départ : une organisation, une personne et deux affaires gagnées de test ; une personne, une affaire et un projet réels ; une personne réelle dans l'organisation de test. */
async function preparer() {
  await creerOrganisation('oT', { nom: 'Atelier Essai', test: true });
  await creerPersonne('pT', { nom: 'Paul Essai', test: true });
  await creerPersonne('pR', { nom: 'Rita Réelle' });
  await creerPersonne('pRoT', { nom: 'Rémi Réel', organisationId: 'oT' });
  await creerAffaire('aT', { titre: 'Audit essai', etape: 'gagne', test: true });
  await creerAffaire('aR', { titre: 'Audit réel', etape: 'gagne' });
  await creerProjet('prT', { titre: 'Chantier essai', test: true });
  await creerProjet('prR', { titre: 'Chantier réel' });
}

test('1 affaire créée pour une personne ou une organisation de test, ou pour une personne réelle d’une organisation de test : de test, avec sa note de départ ; pour du réel : sans repère', async ({ page }, info) => {
  await preparer();
  await connecter(page);
  const deP = await appeler(page, CRM, 'creerAffaire', { titre: 'Affaire de Paul', personneId: 'pT' });
  const deO = await appeler(page, CRM, 'creerAffaire', { titre: 'Affaire d’Atelier', organisationId: 'oT' });
  const deRemi = await appeler(page, CRM, 'creerAffaire', { titre: 'Affaire de Rémi', personneId: 'pRoT' });
  const reelle = await appeler(page, CRM, 'creerAffaire', { titre: 'Affaire de Rita', personneId: 'pR' });
  for (const id of [deP, deO, deRemi]) expect(await estTest(`crm_affaires/${id}`)).toBe(true);
  expect(await sansChamp(`crm_affaires/${reelle}`)).toBe(true);
  const notes = await listerDocuments('crm_notes');
  const noteDe = (id) => notes.find((n) => n.affaireId === id);
  expect(noteDe(deP)?.test).toBe(true);
  expect(noteDe(reelle) && 'test' in noteDe(reelle)).toBe(false);
  await allerA(page, 'Affaires');
  await expect(page.getByText('[TEST]').first()).toBeVisible();
  await capturer(page, info, '1-affaires');
});

test('2 personne créée dans une organisation de test : de test ; dans une organisation réelle : sans repère', async ({ page }) => {
  await preparer();
  await creerOrganisation('oR', { nom: 'Société réelle' });
  await connecter(page);
  const dans = await appeler(page, CRM, 'creerPersonne', { nom: 'Nina Nouvelle', organisationId: 'oT' });
  const hors = await appeler(page, CRM, 'creerPersonne', { nom: 'Omar Ordinaire', organisationId: 'oR' });
  expect(await estTest(`crm_personnes/${dans}`)).toBe(true);
  expect(await sansChamp(`crm_personnes/${hors}`)).toBe(true);
});

test('3 projet créé depuis une affaire de test, ou sur une personne / organisation de test : de test (tâches du modèle et note de départ comprises) ; sinon sans repère', async ({ page }, info) => {
  await preparer();
  await connecter(page);
  const depuis = await appeler(page, PRO, 'creerProjetDepuisAffaire', 'aT');
  expect(await estTest(`projets_projets/${depuis}`)).toBe(true);
  const surP = await appeler(page, PRO, 'creerProjet', { titre: 'Projet de Paul', personneId: 'pT' });
  const surO = await appeler(page, PRO, 'creerProjet', { titre: 'Projet d’Atelier', organisationId: 'oT' });
  expect(await estTest(`projets_projets/${surP}`)).toBe(true);
  expect(await estTest(`projets_projets/${surO}`)).toBe(true);
  const reel = await appeler(page, PRO, 'creerProjetDepuisAffaire', 'aR');
  const reel2 = await appeler(page, PRO, 'creerProjet', { titre: 'Projet de Rita', personneId: 'pR' });
  expect(await sansChamp(`projets_projets/${reel}`)).toBe(true);
  expect(await sansChamp(`projets_projets/${reel2}`)).toBe(true);
  const notes = await listerDocuments('crm_notes');
  expect(notes.find((n) => n.projetId === depuis)?.test).toBe(true);
  const noteReelle = notes.find((n) => n.projetId === reel);
  expect(noteReelle && 'test' in noteReelle).toBe(false);
  await allerA(page, 'Projets');
  await expect(page.getByText('[TEST]').first()).toBeVisible();
  await capturer(page, info, '3-projets');
});

test('4 tâche ajoutée à un projet de test : de test ; à un projet réel : sans repère', async ({ page }) => {
  await preparer();
  await connecter(page);
  const t = await appeler(page, PRO, 'creerTache', 'prT', { titre: 'Visite' });
  const r = await appeler(page, PRO, 'creerTache', 'prR', { titre: 'Visite réelle' });
  expect(await estTest(`projets_taches/${t}`)).toBe(true);
  expect(await sansChamp(`projets_taches/${r}`)).toBe(true);
});

test('5 brouillon de devis sur une affaire de test ou pour un client de test : de test ; dupliquer un devis de test : la copie est de test ; devis réel dupliqué : sans repère', async ({ page }, info) => {
  await preparer();
  await connecter(page);
  const creer = (affaire, type, fiche) => page.evaluate(async ([a, t, f]) => {
    const Ed = await import('/js/modules/devis/editeur-logique.js');
    const CRM = await import('/js/modules/crm/donnees.js');
    const D = await import('/js/modules/devis/donnees.js');
    const client = t ? { type: t, fiche: (t === 'personne' ? CRM.personne(f) : CRM.organisation(f)), adresse: '' } : null;
    const r = await D.creerBrouillon(Ed.valeursDeCreation(a ? CRM.affaire(a) : null, client));
    return r.id;
  }, [affaire, type, fiche]);
  await expect.poll(() => page.evaluate(async () => (await import('/js/modules/crm/donnees.js')).etat.affaires.length)).toBeGreaterThan(1);
  const surAffaire = await creer('aT', null, null);
  const pourClient = await creer(null, 'organisation', 'oT');
  const reel = await creer('aR', 'personne', 'pR');
  expect(await estTest(`devis_devis/${surAffaire}`)).toBe(true);
  expect(await estTest(`devis_devis/${pourClient}`)).toBe(true);
  expect(await sansChamp(`devis_devis/${reel}`)).toBe(true);
  // dupliquer : l'objet de creerBrouillon porte `test` (pas `contenu`)
  const dupliquer = async (id) => {
    await expect.poll(() => page.evaluate(async ([i, d]) => !!(await import(d)).devisParId(i), [id, DEV])).toBe(true);
    await page.evaluate(async ([i, d]) => { const A = await import('/js/modules/devis/actions-devis.js'); const D = await import(d); await A.dupliquerDevis(D.devisParId(i)); }, [id, DEV]);
  };
  const avant = new Set((await listerDocuments('devis_devis')).map((d) => d.id));
  await dupliquer(surAffaire);
  await expect.poll(async () => (await listerDocuments('devis_devis')).filter((d) => !avant.has(d.id)).length).toBe(1);
  const copieTest = (await listerDocuments('devis_devis')).find((d) => !avant.has(d.id));
  expect(copieTest.test).toBe(true);
  const avant2 = new Set((await listerDocuments('devis_devis')).map((d) => d.id));
  await dupliquer(reel);
  await expect.poll(async () => (await listerDocuments('devis_devis')).filter((d) => !avant2.has(d.id)).length).toBe(1);
  const copieReelle = (await listerDocuments('devis_devis')).find((d) => !avant2.has(d.id));
  expect('test' in copieReelle).toBe(false);
  await allerA(page, 'Devis');
  await expect(page.getByText('[TEST]').first()).toBeVisible();
  await capturer(page, info, '5-devis');
});

test('6 activité et note sur une affaire, une personne, une organisation ou un projet de test : de test ; sur du réel : sans repère', async ({ page }, info) => {
  await preparer();
  await connecter(page);
  await expect.poll(() => page.evaluate(async () => (await import('/js/modules/crm/donnees.js')).etat.affaires.length)).toBeGreaterThan(1);
  const liens = { affaire: { affaireId: 'aT' }, personne: { personneId: 'pT' }, organisation: { organisationId: 'oT' } };
  for (const [nom, l] of Object.entries(liens)) {
    const act = await appeler(page, CRM, 'creerActivite', { type: 'appel', titre: `Activité ${nom}`, date: '2026-12-01', ...l });
    const note = await appeler(page, CRM, 'creerNote', `Note ${nom}`, l);
    expect(await estTest(`crm_activites/${act}`), `activité ${nom}`).toBe(true);
    expect(await estTest(`crm_notes/${note}`), `note ${nom}`).toBe(true);
  }
  // projet de test : les liens du projet portent `test: true` (posé par l'appelant côté projets)
  const noteProjet = await appeler(page, PRO, 'creerNote', 'prT', 'Note du projet');
  expect(await estTest(`crm_notes/${noteProjet}`)).toBe(true);
  const actProjet = await page.evaluate(async () => {
    const P = await import('/js/modules/projets/logique.js'); const D = await import('/js/modules/projets/donnees.js'); const CRM = await import('/js/modules/crm/donnees.js');
    return CRM.creerActivite({ type: 'tache', titre: 'Activité du projet', date: '2026-12-01', ...P.liensProjet(D.projet('prT')) });
  });
  expect(await estTest(`crm_activites/${actProjet}`)).toBe(true);
  // réel
  const actR = await appeler(page, CRM, 'creerActivite', { type: 'appel', titre: 'Activité réelle', date: '2026-12-01', personneId: 'pR', affaireId: 'aR' });
  const noteR = await appeler(page, PRO, 'creerNote', 'prR', 'Note du projet réel');
  expect(await sansChamp(`crm_activites/${actR}`)).toBe(true);
  expect(await sansChamp(`crm_notes/${noteR}`)).toBe(true);
  await allerA(page, 'Affaires');
  await capturer(page, info, '6-activites-notes');
});

test('7 mode éteint + parent réel = rien ; mode allumé + parent réel = de test ; mode allumé + parent de test = de test (jamais test: false)', async ({ page }) => {
  await preparer();
  await connecter(page);
  const eteint = await appeler(page, CRM, 'creerAffaire', { titre: 'Éteint réel', personneId: 'pR' });
  expect(await sansChamp(`crm_affaires/${eteint}`)).toBe(true);
  await page.evaluate((c) => localStorage.setItem(c, '1'), CLE);
  const allume = await appeler(page, CRM, 'creerAffaire', { titre: 'Allumé réel', personneId: 'pR' });
  const allumeTest = await appeler(page, CRM, 'creerAffaire', { titre: 'Allumé test', personneId: 'pT' });
  expect(await estTest(`crm_affaires/${allume}`)).toBe(true);
  expect(await estTest(`crm_affaires/${allumeTest}`)).toBe(true);
  for (const d of await listerDocuments('crm_affaires')) expect(d.test === false, `${d.id} : jamais test: false`).toBe(false);
});

test('8 (code seulement, héritage serveur non rejoué en émulateur) le serveur appelle les plans purs avec les parents ; heriterTest est dans le code copié', { tag: '@sans-telephone' }, async () => {
  const racine = fileURLToPath(new URL('../../', import.meta.url));
  const metier = readFileSync(`${racine}functions/src/coeur/metier.js`, 'utf8');
  expect(metier).toContain('personnes');
  for (const appel of ['planCreerAffaire(', 'planCreerProjetDepuisAffaire(', 'planCreerTache(', 'valeursDeCreation(']) expect(metier, appel).toContain(appel);
  // heriterTest est dans le code commun copié au serveur (scripts/preparer-fonctions.js copie crm/logique.js)
  expect(readFileSync(`${racine}js/modules/crm/logique.js`, 'utf8')).toContain('export function heriterTest(');
});
