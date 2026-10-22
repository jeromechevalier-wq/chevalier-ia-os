// N3 (23/10/2026) : « Événements » ne contient plus les documents ni les changements d'affaire ; chaque ligne n'est dans qu'un seul filtre.
import { test, expect, attendreCalme, connecter, creerPersonne, ecrireDocument, filtrerHistorique, JEROME } from './outils.js';

const CAPTURES = 'e2e/captures/historique-evenements';
// Cet écran n'utilise pas Google : le script de l'API est remplacé par un fichier vide (sans réseau, il ne produit pas d'erreur de console).
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});

test('N3 « Événements » seul cache le document joint ; « Documents » seul le montre ; les deux le montrent une seule fois', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  const base = { personneId: 'p1', organisationId: null, affaireId: null, auteur: JEROME };
  await ecrireDocument('crm_evenements/e-doc', { ...base, type: 'document', texte: 'Document joint : Devis', date: new Date() });
  await ecrireDocument('crm_evenements/e-aff', { ...base, type: 'affaire_creee', texte: 'Affaire créée : Atelier', date: new Date() });
  await ecrireDocument('crm_evenements/e-mail', { ...base, type: 'email_envoye', texte: 'Email envoyé à Marie', date: new Date() });
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/crm/personnes/p1'; });
  await attendreCalme(page);
  const lignes = page.locator('.historique .fil-ligne');
  const document = lignes.filter({ hasText: 'Document joint' });
  await expect(lignes).toHaveCount(3);

  await filtrerHistorique(page, 'evenements');
  await expect(lignes).toHaveCount(1);
  await expect(lignes).toContainText('Email envoyé');
  await expect(document).toHaveCount(0);
  await page.locator('.historique').screenshot({ path: `${CAPTURES}/N3-evenements-seul.png`, animations: 'disabled' });

  await filtrerHistorique(page, 'documents');
  await expect(document).toHaveCount(1);
  await expect(lignes).toHaveCount(1);

  await filtrerHistorique(page, 'documents', 'evenements');
  await expect(document).toHaveCount(1);
  await expect(lignes).toHaveCount(2);
});

test('N3 cas vide : « Événements » seul sur une fiche sans autre événement montre le message habituel', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await ecrireDocument('crm_evenements/e-doc', { personneId: 'p1', organisationId: null, affaireId: null, auteur: JEROME, type: 'document', texte: 'Document joint : Devis', date: new Date() });
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/crm/personnes/p1'; });
  await attendreCalme(page);
  await filtrerHistorique(page, 'evenements');
  await expect(page.locator('.historique')).toContainText('Rien à afficher avec ces filtres. Décoche un filtre.');
});
