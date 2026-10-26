// Module Devis : le bloc « NET À PAYER » de l'éditeur n'est plus un aplat jaune plein (option A de Jérôme, 26/10/2026).
// Règle (docs/consignes-ui.md) : le jaune plein est réservé aux boutons d'action. Le bloc a le fond de carte du thème, un trait jaune fin à gauche,
// et le montant reste l'élément le plus visible des totaux. Thème sombre ET clair ; ordinateur ET téléphone (--project=telephone).
// Captures : tests/e2e/captures/devis-net-a-payer/ (une par thème et par format : la mise en page change sur téléphone).
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, creerOrganisation, creerAffaire, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-net-a-payer/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
}

const ligne = (id, libelle, quantite, prixAchat) => ({ id, libelle, quantite, unite: 'm²', prixAchat, marge: 0 });
async function devis(id, lignes) {
  await creerOrganisation('o1', { nom: 'Société Exemple', emails: [{ valeur: 'contact@exemple.fr', type: 'travail' }] });
  await creerAffaire('a1', { titre: 'Rénovation restaurant', organisationId: 'o1' });
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', organisationId: 'o1', personneId: null, modeMarge: 'majoration', marge: 0, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, expireLe: '2026-11-23', destinataires: ['contact@exemple.fr'], objet: 'Rénovation restaurant',
    sections: [{ id: 's1', titre: 'Salle du restaurant', lignes }],
    notesBasDePage: '', creePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant,
  });
}
async function ouvrir(page, id) {
  await connecter(page, undefined, { route: `devis/editeur/${id}` });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
}
async function theme(page, nom) {
  await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, nom);
  await expect(page.locator('html')).toHaveAttribute('data-theme', nom);
}

/** Couleurs calculées du bloc, d'un vrai bouton principal (sonde avec la même classe que « Finaliser ») et d'une carte du thème. */
function mesurer(page) {
  return page.evaluate(() => {
    const sonde = (classe) => { const b = document.createElement('button'); b.className = classe; b.textContent = 'sonde'; document.body.append(b); const s = getComputedStyle(b); const r = { fond: s.backgroundColor, texte: s.color }; b.remove(); return r; };
    const bloc = document.querySelector('.bandeau-net');
    const montant = bloc.querySelector('[data-total="net"]');
    const titre = bloc.querySelector('.bandeau-net-titre');
    const sb = getComputedStyle(bloc);
    const carte = getComputedStyle(document.querySelector('.document-devis'));
    const autresTotaux = [...document.querySelectorAll('[data-zone="total"] .ligne-total dd')].map((e) => parseFloat(getComputedStyle(e).fontSize));
    return {
      principal: sonde('bouton bouton-principal'),
      fond: sb.backgroundColor, texte: sb.color, traitGauche: sb.borderLeftColor, largeurTraitGauche: parseFloat(sb.borderLeftWidth), traitHaut: sb.borderTopColor,
      fondCarte: carte.backgroundColor,
      tailleMontant: parseFloat(getComputedStyle(montant).fontSize), tailleTitre: parseFloat(getComputedStyle(titre).fontSize), poidsMontant: Number(getComputedStyle(montant).fontWeight),
      couleurMontant: getComputedStyle(montant).color,
      autresTotaux,
    };
  });
}

for (const nomTheme of ['sombre', 'clair']) {
  test(`1 NET À PAYER (thème ${nomTheme}) : fond de carte du thème et non le jaune du bouton principal, trait jaune fin à gauche, montant grand et visible`, async ({ page }, info) => {
    await devis('net1', [ligne('l1', 'Dépose de l’ancienne moquette', 30, 10.75), ligne('l2', 'Pose d’un nouveau revêtement de sol', 30, 62)]);
    await ouvrir(page, 'net1');
    await theme(page, nomTheme);
    const bloc = page.locator('.bandeau-net');
    await expect(bloc.locator('.bandeau-net-titre')).toHaveText('NET À PAYER');
    const montant = bloc.locator('[data-total="net"]');
    await expect(montant).toHaveText(/€/);
    await expect(montant).toBeVisible();
    const m = await mesurer(page);
    // Le fond n'est plus le jaune du bouton principal : c'est la couleur de carte (la feuille du devis).
    expect(m.fond).not.toBe(m.principal.fond);
    expect(m.fond).toBe(m.fondCarte);
    // Le trait fin à gauche est le jaune des boutons ; les autres bords restent discrets.
    expect(m.traitGauche).toBe(m.principal.fond);
    expect(m.largeurTraitGauche).toBeGreaterThanOrEqual(2);
    expect(m.largeurTraitGauche).toBeLessThanOrEqual(6);
    expect(m.traitHaut).not.toBe(m.principal.fond);
    // Le texte se lit sur le fond (pas la couleur sombre posée sur le jaune) ; le montant est le plus grand des totaux.
    expect(m.texte).not.toBe(m.fond);
    expect(m.couleurMontant).not.toBe(m.fond);
    expect(m.poidsMontant).toBeGreaterThanOrEqual(500);
    expect(m.tailleMontant).toBeGreaterThan(m.tailleTitre);
    expect(m.autresTotaux.length).toBeGreaterThan(0);
    for (const t of m.autresTotaux) expect(m.tailleMontant).toBeGreaterThan(t);
    // Collé en bas de l'écran, sur les totaux : capture de ce qu'on voit.
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await expect(bloc).toBeInViewport({ ratio: 1 });
    await capturer(page, info, `1-net-a-payer-${nomTheme}`);
  });
}

test('2 cas vide : un devis sans ligne affiche NET À PAYER 0,00 €, avec le même style (pas de jaune plein)', async ({ page }, info) => {
  await devis('net-vide', []);
  await ouvrir(page, 'net-vide');
  const bloc = page.locator('.bandeau-net');
  await expect(bloc.locator('.bandeau-net-titre')).toHaveText('NET À PAYER');
  await expect(bloc.locator('[data-total="net"]')).toHaveText(/^0,00\s€$/);
  const m = await mesurer(page);
  expect(m.fond).not.toBe(m.principal.fond);
  expect(m.fond).toBe(m.fondCarte);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await capturer(page, info, '2-net-a-payer-vide');
});
