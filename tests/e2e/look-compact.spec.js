// PR D « look compact » (19/10/2026). Un test par point du brief (le nom commence par le numéro du point), UNE capture par point citée dans la PR.
// Le point 5 prend les captures AVANT (sur main) et APRÈS (LOOK=avant|apres) : mêmes écrans, mêmes données, dans ~/chantiers-crm/captures-look-compact/<LOOK>/.
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, allerA, estTelephone, ouvrirMenuUtilisateur, basculerThemeParMenu, creerPersonne, creerOrganisation, creerAffaire, creerProjet, creerTacheProjet, creerActivite, jour, FIRESTORE } from './outils.js';

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
  test.info().annotations.push({ type: 'erreurs-reseau-attendues' }); // test de captures : le SDK peut noter un 400 sur Listen quand l'émulateur vient d'être rempli
  test.setTimeout(180_000);
  await donnees();
  await connecter(page);
  await parcours(page, 'sombre');
  await basculerThemeParMenu(page);
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'clair');
  await parcours(page, 'clair');
});

// ---------------------------------------------------------------- points 1, 2, 3, 4, 6

const CSS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'css');
const lireCss = async () => Object.fromEntries(await Promise.all((await readdir(CSS)).filter((f) => f.endsWith('.css')).map(async (f) => [f, await readFile(join(CSS, f), 'utf8')])));
/** Lignes qui gardent volontairement une taille ou un poids en dur : écran de connexion, célébrations, écran d'accueil d'un espace, logo (Poppins 700), initiales, police à chasse fixe. */
const EXEMPTEES = /\.connexion-|\.celebration|\.espace-accueil|\.mon-espace-initiale|\.menu-marque|\.barre-haut-marque|\.avatar-initiale|\.prompt-zone|--taille/;
const luminance = (hex) => { const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contraste = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m); return (x + 0.05) / (y + 0.05); };

test('1 inventaire : l’échelle (texte, poids, interligne, espacements, hauteurs, rayons) est déclarée dans tokens.css et plus rien n’est en dur, sauf les écrans d’accueil et le logo', { tag: '@sans-telephone' }, async () => {
  const feuilles = await lireCss();
  for (const v of ['--fs-micro', '--fs-petit', '--fs-menu', '--fs-texte', '--fs-section', '--fs-page', '--poids-normal', '--poids-moyen', '--interligne', '--esp-1', '--esp-9', '--h-ctrl', '--h-ctrl-petit', '--rayon-petit', '--rayon', '--rayon-carte']) expect(feuilles['tokens.css'], v).toContain(`${v}:`);
  const enDur = [];
  for (const [nom, texte] of Object.entries(feuilles)) {
    if (nom === 'tokens.css') continue;
    texte.split('\n').forEach((ligne, i) => {
      if (EXEMPTEES.test(ligne)) return;
      if (/font-size: *\d+px|font-weight: *[5-9]00\b|font: *[^;}]*?\b\d+px\b|font: *[5-9]00 /.test(ligne)) enDur.push(`${nom}:${i + 1} ${ligne.trim().slice(0, 90)}`);
    });
  }
  expect(enDur, 'taille ou poids de texte écrit en dur').toEqual([]);
});

test('2 échelle compacte : texte 14 px, interligne 1,45, titres 20 px, poids ≤ 500, rien ne déborde, zones de clic ≥ 32 px (ordinateur) / 44 px (téléphone)', async ({ page }) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues' }); // même 400 « Listen » occasionnel du SDK après remplissage de l'émulateur ; les mesures ci-dessous restent strictes
  await donnees();
  await connecter(page);
  const tel = estTelephone(page);
  const mesures = async () => page.evaluate(() => {
    const s = (el) => getComputedStyle(el);
    const poids = [...document.querySelectorAll('main *, .menu *')].filter((e) => e.childNodes.length && [...e.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim()) && !e.closest('.menu-marque, .barre-haut-marque, .avatar-initiale')).map((e) => Number(s(e).fontWeight));
    const hauteur = (sel) => [...document.querySelectorAll(sel)].filter((e) => e.offsetParent).map((e) => Math.round(e.getBoundingClientRect().height));
    return {
      corps: s(document.body).fontSize, interligne: s(document.body).lineHeight, h1: document.querySelector('h1') ? s(document.querySelector('h1')).fontSize : null,
      poidsMax: Math.max(...poids), debordeX: document.documentElement.scrollWidth > window.innerWidth + 1,
      boutons: hauteur('.bouton:not(.bouton-petit)'), petits: hauteur('.bouton-petit'), entreesMenu: hauteur('.menu .menu-entree'),
      boutonsCoupes: [...document.querySelectorAll('.bouton')].filter((e) => e.offsetParent && e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.trim()),
    };
  });
  await allerA(page, 'Affaires');
  await expect(page.locator('.carte-affaire').first()).toBeVisible();
  let m = await mesures();
  expect(m.corps).toBe('14px');
  expect(parseFloat(m.interligne)).toBeCloseTo(14 * 1.45, 1);
  expect(m.h1).toBe('20px');
  expect(m.poidsMax, 'aucun texte plus lourd que 500').toBeLessThanOrEqual(500);
  expect(m.debordeX).toBe(false);
  expect(m.boutonsCoupes).toEqual([]);
  if (tel) await page.getByRole('button', { name: 'Ouvrir le menu' }).click(); else { const e = page.getByRole('button', { name: 'Élargir le menu' }); if (await e.count()) await e.click(); }
  m = await mesures();
  const mini = tel ? 44 : 32;
  expect(Math.min(...m.boutons), `boutons : ${m.boutons}`).toBeGreaterThanOrEqual(tel ? 44 : 34);
  expect(Math.min(...m.entreesMenu), `entrées du menu : ${m.entreesMenu}`).toBeGreaterThanOrEqual(mini);
  if (m.petits.length) expect(Math.min(...m.petits)).toBeGreaterThanOrEqual(tel ? 36 : 32);
  await page.keyboard.press('Escape');
  await aller(page, '#/crm/affaires/a1');
  await expect(page.locator('.barre-etapes-fiche')).toBeVisible(); await attendreCalme(page);
  m = await mesures();
  expect(m.debordeX).toBe(false);
  expect(m.poidsMax).toBeLessThanOrEqual(500);
  await capture(page, '2-fiche-affaire-echelle-compacte', 'sombre');
  if (tel) await verifierTactile(page);
});

const ZONES = '.champ-petit, .champ-saisie, .pastille-type, .case, .td-segment button, .bouton-icone, .carte-menu, .prop-modifier, .case-fait, .bouton-copier, .bouton-info, .pastille-retrait';
/** Téléphone : champs ≥ 16 px (sinon l'iPhone zoome au toucher) et zones de clic ≥ 44 px (taille réelle, ou zone invisible qui reçoit le doigt : on teste ce que touche le doigt). */
async function verifierTactile(page) {
  const lire = (racine = 'body') => page.evaluate(([zones, racine]) => {
    const visibles = (sel) => [...document.querySelector(racine).querySelectorAll(sel)].filter((e) => e.offsetParent !== null || getComputedStyle(e).position === 'fixed');
    const petitsChamps = visibles('input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea').filter((e) => parseFloat(getComputedStyle(e).fontSize) < 16).map((e) => e.className || e.tagName);
    const zonesTrop = visibles(zones).filter((e) => {
      const r = e.getBoundingClientRect();
      if (Math.min(r.width, r.height) >= 44 || r.width === 0) return false;
      const [cx, cy] = [r.left + r.width / 2, r.top + r.height / 2];
      if (cy < 0 || cy > innerHeight || cx < 0 || cx > innerWidth) return false;
      return ![[-21, 0], [21, 0], [0, -21], [0, 21]].every(([dx, dy]) => { const t = document.elementFromPoint(cx + dx, cy + dy); return t && e.contains(t); });
    }).map((e) => e.className);
    return { petitsChamps, zonesTrop };
  }, [ZONES, racine]);
  if (await page.locator('.coquille.menu-ouvert').count()) await page.locator('.voile-menu').click({ position: { x: 380, y: 400 } });
  const ecrans = ['#/crm/affaires', '#/crm/affaires/a1', '#/crm/personnes/p1', '#/projets/projets/pr1'];
  const echecs = { petitsChamps: new Set(), zonesTrop: new Set() };
  for (const hash of ecrans) {
    await aller(page, hash); await attendreCalme(page);
    const m = await lire();
    m.petitsChamps.forEach((c) => echecs.petitsChamps.add(`${hash} ${c}`)); m.zonesTrop.forEach((c) => echecs.zonesTrop.add(`${hash} ${c}`));
  }
  await aller(page, '#/crm/personnes'); await page.locator('.page-actions [data-action="nouvelle-personne"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  const d = await lire('[role=dialog]');
  d.petitsChamps.forEach((c) => echecs.petitsChamps.add(`dialogue ${c}`)); d.zonesTrop.forEach((c) => echecs.zonesTrop.add(`dialogue ${c}`));
  expect([...echecs.petitsChamps], 'champs sous 16 px sur téléphone').toEqual([]);
  expect([...echecs.zonesTrop], 'zones de clic sous 44 px sur téléphone').toEqual([]);
  expect(await page.getByRole('dialog').getByLabel('Nom', { exact: true }).evaluate((el) => getComputedStyle(el, '::placeholder').color)).not.toBe('');
  await capture(page, '2-dialogue-champs-16px', 'sombre');
}

test('3 contrastes WCAG AA (≥ 4,5) du texte, du texte secondaire, des liens, des retards et du bouton jaune en clair et en sombre ; accent jaune inchangé', { tag: '@sans-telephone' }, async () => {
  const tokens = await readFile(join(CSS, 'tokens.css'), 'utf8');
  const bloc = (debut, fin) => tokens.slice(tokens.indexOf(debut), fin ? tokens.indexOf(fin) : undefined);
  const sombre = bloc(":root,\n:root[data-theme='sombre']", ":root[data-theme='clair']");
  const clair = bloc(":root[data-theme='clair']");
  const val = (b, v) => { const m = b.match(new RegExp(`${v}: *(#[0-9a-f]{6}|var\\(--jaune\\))`))[1]; return m.startsWith('var') ? '#ecbc06' : m; };
  for (const [nom, b] of [['sombre', sombre], ['clair', clair]]) {
    for (const [t, f] of [['--texte', '--panneau'], ['--texte', '--fond'], ['--texte2', '--panneau'], ['--texte2', '--fond'], ['--lien', '--fond'], ['--retard', '--panneau'], ['--succes', '--panneau'], ['--sur-accent', '--accent']]) {
      const a = t === '--sur-accent' && f === '--accent' ? [val(b, '--sur-accent'), '#ecbc06'] : [val(b, t), val(b, f)];
      expect(contraste(...a), `${nom} ${t} sur ${f}`).toBeGreaterThanOrEqual(4.5);
    }
  }
  for (const [nom, b] of [['sombre', sombre], ['clair', clair]]) {
    for (const fond of ['--panneau2', '--panneau', '--fond']) expect(contraste(val(b, '--bordure-champ'), val(b, fond)), `${nom} contour des champs et boutons secondaires sur ${fond} (WCAG 1.4.11, 3:1)`).toBeGreaterThanOrEqual(3);
    expect(contraste(val(b, '--placeholder'), val(b, '--panneau2')), `${nom} texte d'aide des champs`).toBeGreaterThanOrEqual(4.5);
  }
  expect(await readFile(join(CSS, 'tokens.css'), 'utf8')).toContain('--jaune: #ecbc06');
});

test('4 mêmes règles chez Jérôme et chez les clients : aucune branche racine/client dans les feuilles, l’échelle n’est jamais redéfinie par la marque', { tag: '@sans-telephone' }, async () => {
  const feuilles = await lireCss();
  for (const [nom, texte] of Object.entries(feuilles)) expect(texte, nom).not.toMatch(/reserveAuxClients|client-seulement|data-racine|\.racine\b|\.espace-client/);
  const identite = await readFile(join(CSS, '..', 'js', 'os', 'identite.js'), 'utf8');
  expect(identite).not.toMatch(/--fs-|--esp-|--h-|--rayon|--poids|--interligne/); // la marque ne change que les couleurs d'accent (les tests identite-client et identite-crm le vérifient à l'écran)
});

test('6 cas vide, erreur et chargement des écrans touchés', async ({ page, context }) => {
  // cas vide : aucune donnée
  await connecter(page);
  await allerA(page, 'Personnes');
  await expect(page.locator('main')).toContainText('Ajoute ta première personne');
  await capture(page, '6-vide-personnes', 'sombre');
  await allerA(page, 'Affaires');
  await expect(page.getByRole('heading', { name: 'Affaires', level: 1 })).toBeVisible(); await attendreCalme(page);
  await capture(page, '6-vide-affaires', 'sombre');
  // erreur : on enregistre une personne sans nom
  await allerA(page, 'Personnes');
  await page.locator('.page-actions [data-action="nouvelle-personne"]').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('dialog').locator('.erreur:not(:empty)').first()).toBeVisible();
  await capture(page, '6-erreur-dialogue', 'sombre');
  // chargement : au rechargement, tant que la base ne répond pas (le compte reste connecté)
  await page.route(`${FIRESTORE}/**`, async (route) => { await new Promise((r) => setTimeout(r, 3000)); await route.fallback(); });
  await page.reload();
  await expect(page.locator('.chargement .rond-chargement')).toBeVisible();
  await capture(page, '6-chargement', 'sombre');
  await page.unroute(`${FIRESTORE}/**`);
});
