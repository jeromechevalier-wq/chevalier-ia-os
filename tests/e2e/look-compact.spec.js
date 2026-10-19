// PR D « look compact » (19/10/2026). Un test par point du brief (le nom commence par le numéro du point), UNE capture par point citée dans la PR.
// Le point 5 prend les captures AVANT (sur main) et APRÈS (LOOK=avant|apres) : mêmes écrans, mêmes données, dans ~/chantiers-crm/captures-look-compact/<LOOK>/.
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { test, expect, connecter, attendreCalme, allerA, estTelephone, ouvrirMenuUtilisateur, basculerThemeParMenu, creerPersonne, creerOrganisation, creerAffaire, creerProjet, creerTacheProjet, creerActivite, jour } from './outils.js';

const LOOK = process.env.LOOK === 'avant' ? 'avant' : 'apres';
const DOSSIER = join(homedir(), 'chantiers-crm', 'captures-look-compact', LOOK);
const aller = (page, hash) => page.evaluate((h) => { location.hash = h; }, hash);

async function capture(page, nom, theme) {
  await mkdir(DOSSIER, { recursive: true });
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(DOSSIER, `${estTelephone(page) ? 'tel' : 'ordi'}-${theme}-${nom}.png`), animations: 'disabled' });
}

async function donnees() {
  await creerOrganisation('o1', { nom: 'Fleurs de Provence', ville: 'Aix-en-Provence', secteur: 'Commerce' });
  await creerOrganisation('o2', { nom: 'Atelier du Port', ville: 'Marseille' });
  const noms = ['Marie Durand', 'Éric Léon', 'Sophie Martin', 'Karim Benali', 'Julie Moreau', 'Paul Garnier'];
  for (const [i, n] of noms.entries()) await creerPersonne(`p${i + 1}`, { nom: n, organisationId: i % 2 ? 'o2' : 'o1', ville: i % 2 ? 'Marseille' : 'Aix', emails: [{ valeur: `${n.split(' ')[0].toLowerCase().replace('é', 'e')}@exemple.fr`, type: 'travail' }], etiquettes: i < 2 ? ['client'] : [] });
  const etapes = ['premier_contact', 'rdv_fixe', 'proposition_envoyee', 'gagne', 'rdv_fixe', 'premier_contact'];
  const titres = ['Atelier IA équipe', 'Audit des outils', 'Accompagnement annuel', 'Formation Claude', 'Assistant courriels', 'Veille sectorielle'];
  for (const [i, t] of titres.entries()) await creerAffaire(`a${i + 1}`, { titre: t, etape: etapes[i], personneId: `p${i + 1}`, organisationId: i % 2 ? 'o2' : 'o1', montant: 800 + i * 450, priorite: ['chaud', 'tiede', 'froid'][i % 3], besoin: 'Gagner du temps sur les tâches répétitives.' });
  await creerActivite('x1', { titre: 'Relancer après le rendez-vous', date: jour(-2), affaireId: 'a1', personneId: 'p1' });
  await creerActivite('x2', { titre: 'Envoyer la proposition', date: jour(1), affaireId: 'a2', personneId: 'p2' });
  await creerProjet('pr1', { titre: 'Déploiement assistant', personneId: 'p1', organisationId: 'o1', phase: 'lancement' });
  await creerProjet('pr2', { titre: 'Formation équipe', personneId: 'p2', organisationId: 'o2', phase: 'lancement' });
  await creerTacheProjet('t1', { titre: 'Réunion de cadrage', projetId: 'pr1', ordre: 1, date: jour(2) });
  await creerTacheProjet('t2', { titre: 'Préparer les accès', projetId: 'pr1', ordre: 2 });
}

async function parcours(page, theme) {
  const tel = estTelephone(page);
  if (!tel) { const e = page.getByRole('button', { name: 'Élargir le menu' }); if (await e.count()) await e.click(); }
  await aller(page, '#/crm/accueil'); await expect(page.locator('.grille-objectifs .objectif')).toHaveCount(5); await capture(page, '01-accueil', theme);
  await allerA(page, 'Personnes'); await expect(page.locator('main')).toContainText('Marie Durand'); await capture(page, '02-personnes', theme);
  await allerA(page, 'Affaires'); await expect(page.locator('.carte-affaire').first()).toBeVisible(); await capture(page, '03-affaires-kanban', theme);
  await page.locator('.bascule-vue[data-vue="liste"]').click(); await expect(page.locator('.tableau-affaires tbody tr').first()).toBeVisible(); await capture(page, '04-affaires-liste', theme);
  await page.locator('.bascule-vue[data-vue="kanban"]').click();
  await aller(page, '#/crm/affaires/a1'); await expect(page.locator('.barre-etapes-fiche')).toBeVisible(); await attendreCalme(page); await capture(page, '05-fiche-affaire', theme);
  await aller(page, '#/projets/projets/pr1'); await expect(page.locator('main')).toContainText('Réunion de cadrage'); await attendreCalme(page); await capture(page, '06-fiche-projet', theme);
  await allerA(page, 'Réglages'); await expect(page.locator('.reglages-menu')).toBeVisible(); await attendreCalme(page); await capture(page, '07-reglages', theme);
  await ouvrirMenuUtilisateur(page); await capture(page, '08-menu-utilisateur', theme); await page.keyboard.press('Escape');
  await allerA(page, 'Personnes'); await page.locator('.page-actions [data-action="nouvelle-personne"]').click();
  await expect(page.getByRole('dialog')).toBeVisible(); await capture(page, '09-dialogue', theme); await page.keyboard.press('Escape');
}

test('5 captures des écrans clés en sombre puis en clair (mêmes données avant et après)', async ({ page }) => {
  test.setTimeout(180_000);
  await donnees();
  await connecter(page);
  await parcours(page, 'sombre');
  await basculerThemeParMenu(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'clair');
  await parcours(page, 'clair');
});
