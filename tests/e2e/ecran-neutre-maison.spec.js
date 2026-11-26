// Maison d'un client (26/11/2026) : reglages_maison/ecran.configuration_crm === 'neutre' → l'écran prend la configuration neutre d'un espace de la plateforme
// (étapes, phases, réglages, objectifs, membres = personnes de la maison), jamais celle de Jérôme. Champ absent (maison de Jérôme) : tout comme avant.
// Un test par critère, une capture par critère dans tests/e2e/captures/ecran-neutre-maison/ (nommée avec le projet : ordinateur ou téléphone).
// Logique sans navigateur : tests/ecran-neutre-maison.test.js. Comptes : ceux des parcours (outils.js) ; dans la maison neutre, le compte connecté s'appelle « Alice Martin ».
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, JEROME, PROJET, FIRESTORE, lireDocument, creerAffaire, creerProjet, creerTacheProjet } from './outils.js';
import { semerFicheEmulateur } from '../_fiche-emulateur.js';

const DOSSIER = fileURLToPath(new URL('./captures/ecran-neutre-maison/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: true, animations: 'disabled' });
const HOTE = new URL(FIRESTORE).host;
const BRUNO = 'bruno@exemple.test';
const ECRAN_NEUTRE = {
  personnes: [{ email: JEROME, nom: 'Alice Martin', portrait: '' }, { email: BRUNO, nom: 'Bruno Petit', portrait: '' }],
  comptes_jerome_seul: [],
  configuration_crm: 'neutre',
};
const semerEcran = (fiche) => semerFicheEmulateur({ projet: PROJET, hote: HOTE, document: 'ecran', fiche });

/** Connexion sans attendre les 5 objectifs de Jérôme (une maison neutre en a 3), puis attente des paramètres créés au premier lancement. */
async function ouvrir(page, route = 'crm/accueil') {
  await connecter(page, JEROME, { attendreAccueil: false, route });
  await expect(page.locator('.coquille')).toBeVisible();
  await expect.poll(async () => (await lireDocument('crm_parametres/etapes'))?.items?.length ?? 0).toBe(6);
}
const config = (page) => page.evaluate(async () => {
  const D = await import('/js/modules/crm/donnees.js');
  const C = await import('/js/os/celebrations.js');
  return { etapes: D.etat.config.etapes.map((e) => e.libelle), phases: D.etat.config.phases.map((p) => p.libelle), membres: D.etat.config.membres, reglages: D.etat.reglages, bravo: C.messageBravo() };
});

test('1a maison neutre, accueil : aucune trace de Charles ni de Jérôme, objectifs neutres', async ({ page }, info) => {
  await semerEcran(ECRAN_NEUTRE);
  await ouvrir(page);
  await expect(page.locator('.grille-objectifs .objectif')).toHaveCount(3);
  await expect(page.locator('.menu-compte .compte-nom')).toHaveText('Alice Martin');
  await expect(page.locator('body')).not.toContainText('Charles');
  await expect(page.locator('body')).not.toContainText('Jérôme');
  await expect(page.locator('img[src*="charles-portrait"]')).toHaveCount(0);
  await expect(page.locator('.objectif', { hasText: 'Flyers' })).toHaveCount(0);
  const c = await config(page);
  expect(c.bravo).toBe('Bravo !'); // célébration sans le prénom « Jérôme »
  expect(c.reglages).toMatchObject({ prenomCelebration: '', imageCelebration: '', cheminProjets: '', proprietaireGithub: '' });
  expect(await lireDocument('crm_parametres/reglages')).toMatchObject({ prenomCelebration: '', imageCelebration: '' });
  await capturer(page, info, '1a-accueil-neutre');
});

test('1b maison neutre, Affaires et Projets : étapes et phases neutres, jamais celles de Jérôme', async ({ page }, info) => {
  await semerEcran(ECRAN_NEUTRE);
  await creerAffaire('a1', { titre: 'Rénovation cuisine', etape: 'etape_1' });
  await ouvrir(page, 'crm/affaires');
  const c = await config(page);
  expect(c.etapes).toEqual(['Nouveau contact', 'Échange en cours', 'Proposition', 'Négociation', 'Gagné', 'Étape 6']);
  expect(c.phases).toEqual(['À démarrer', 'En cours', 'À valider', 'Terminé', 'Phase 5', 'Phase 6']);
  await expect(page.locator('.coquille')).toContainText('Nouveau contact');
  for (const etape of ['Premier contact', 'Rendez vous fixé', 'Proposition envoyée']) await expect(page.locator('.coquille')).not.toContainText(etape);
  await capturer(page, info, '1b-affaires-etapes-neutres');
});

test('1c maison neutre : une tâche ne peut être confiée qu’aux personnes de la maison (jamais à « Charles »)', async ({ page }, info) => {
  await semerEcran(ECRAN_NEUTRE);
  await creerProjet('pr1', { titre: 'Chantier essai', phase: 'phase_1' });
  await creerTacheProjet('t1', { titre: 'Métré', phase: 'phase_1', assigneA: JEROME });
  await ouvrir(page, 'projets/projets/pr1');
  const c = await config(page);
  expect(c.membres.map((m) => m.libelle)).toEqual(['Alice Martin', 'Bruno Petit']);
  const ligne = page.locator('.tache[data-tache="t1"]');
  await ligne.locator('[data-action="menu-tache"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Modifier…' }).click();
  const choix = page.getByRole('dialog').getByLabel('Confié à');
  await expect(choix.locator('option')).toHaveText(['Alice Martin', 'Bruno Petit']);
  await capturer(page, info, '1c-tache-confiee-maison');
});

test('2 maison sans le champ (cas de Jérôme) : étapes, Charles et célébration « Jérôme » exactement comme avant', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas', etape: 'premier_contact' });
  await ouvrir(page, 'crm/affaires'); // reglages_maison/ecran des parcours : sans configuration_crm
  const c = await config(page);
  expect(c.etapes.slice(0, 3)).toEqual(['Premier contact', 'Rendez vous fixé', 'Proposition envoyée']);
  expect(c.phases.slice(0, 4)).toEqual(['Lancement', 'Découverte', 'Livraison', 'Clôture']);
  expect(c.membres.map((m) => m.libelle)).toEqual(['Jérôme', 'Charles']);
  expect(c.bravo).toBe('Bravo Jérôme !');
  expect(c.reglages).toMatchObject({ prenomCelebration: 'Jérôme', imageCelebration: 'assets/charles-portrait.png', debutActivite: '2026-10' });
  await expect(page.locator('.coquille')).toContainText('Rendez vous fixé');
  await capturer(page, info, '2-jerome-inchange');
});

test('3 une autre valeur que « neutre » garde la configuration de Jérôme (Drive : son chemin de projets reste le sien)', async ({ page }, info) => {
  await semerEcran({ ...ECRAN_NEUTRE, personnes: [{ email: JEROME, nom: 'Jérôme', portrait: '' }], configuration_crm: 'Neutre' });
  await ouvrir(page, 'crm/affaires');
  const c = await config(page);
  expect(c.etapes[0]).toBe('Premier contact');
  expect(c.reglages.cheminProjets).toContain('GoogleDrive-');
  await capturer(page, info, '3-autre-valeur-jerome');
});
