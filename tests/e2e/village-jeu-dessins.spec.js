// Dessins du futur jeu du village (js/os/village-jeu-dessins.js, 27/11/2026), pas encore branchés dans l'appli.
// Planche de recette assemblée par le test lui-même (comme V27 de tests/e2e/maison-village.spec.js) : rien n'est ajouté à l'appli.
// Capture : tests/e2e/captures/village-jeu-dessins/D7-planche-ordinateur.png. Logique sans navigateur : tests/village-jeu-dessins.test.js.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, estTelephone } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/village-jeu-dessins/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });

test('D7 @sans-telephone planche : les 11 dessins du jeu s’affichent dans le navigateur, chacun visible avec son identifiant (enclos, champs semé → prêt, décorations)', async ({ page }, info) => {
  test.skip(estTelephone(page), 'planche : format ordinateur');
  await connecter(page);
  const r = await page.evaluate(async () => {
    const m = await import(new URL('js/os/village-jeu-dessins.js', document.baseURI).href);
    const NS = 'http://www.w3.org/2000/svg';
    const planche = document.createElement('div');
    planche.dataset.role = 'planche-jeu';
    planche.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#DCE7BC;display:flex;flex-direction:column;justify-content:space-evenly;padding:8px;box-sizing:border-box';
    const erreurs = {};
    // une ligne par famille, pour comparer d'un coup d'œil : les 2 enclos, les 4 champs (semé → prêt), les 5 décorations
    for (const ligneIds of [m.ETATS_ENCLOS, m.ETAPES_CHAMP, m.DECORATIONS]) {
      const ligne = document.createElement('div');
      ligne.style.cssText = 'display:grid;grid-template-columns:repeat(5, 1fr);gap:8px;justify-items:center';
      for (const id of ligneIds) {
        const caseDessin = document.createElement('div');
        caseDessin.dataset.dessin = id;
        caseDessin.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:2px';
        const doc = new DOMParser().parseFromString(m.svgDessinJeu(id), 'image/svg+xml');
        erreurs[id] = doc.getElementsByTagName('parsererror').length > 0;
        const svg = document.importNode(doc.documentElement, true);
        // losange d'herbe sous le dessin (comme V27), posé en premier pour rester dessous
        const herbe = document.createElementNS(NS, 'polygon');
        herbe.setAttribute('points', m.DESSINS_JEU[id].sorte === 'decoration' ? '0,-20 40,0 0,20 -40,0' : '0,-38 76,0 0,38 -76,0');
        herbe.setAttribute('fill', '#A9C46E');
        svg.insertBefore(herbe, svg.firstChild);
        // cadrage serré pour la planche seulement (le SVG garde son cadre de bâtiment, BOITE_BATIMENT) : le dessin plus grand pour la recette
        svg.setAttribute('viewBox', '-90 -70 180 110');
        svg.setAttribute('width', '280');
        svg.setAttribute('height', '171');
        const legende = document.createElement('div');
        legende.style.cssText = 'font:800 14px system-ui,sans-serif;color:#2A1A2C';
        legende.textContent = `${id} · ${m.DESSINS_JEU[id].nom}`;
        caseDessin.append(svg, legende);
        ligne.append(caseDessin);
      }
      planche.append(ligne);
    }
    document.body.append(planche);
    return { ids: [...m.IDS_JEU], erreurs };
  });
  expect(r.ids).toHaveLength(11);
  for (const id of r.ids) {
    expect(r.erreurs[id], `${id} : SVG mal formé`).toBe(false);
    const caseDessin = page.locator(`[data-role="planche-jeu"] [data-dessin="${id}"]`);
    const b = await caseDessin.locator('svg').boundingBox();
    expect(b.width, id).toBeGreaterThan(40);
    expect(b.height, id).toBeGreaterThan(40);
    await expect(caseDessin.getByText(`${id} ·`)).toBeVisible();
  }
  await capturer(page, info, 'D7-planche');
});
