// Conversion HTML -> PDF par Chromium lancé DANS la fonction (puppeteer-core + @sparticuz/chromium). Aucun service à part, aucun appel réseau.
// Tout est injectable (`puppeteer`, `chromium`) : les tests n'ouvrent aucun vrai navigateur.
// Sécurité : JavaScript désactivé dans la page, TOUTE requête réseau annulée (seul `data:` passe : le logo est déjà limité à une image intégrée),
// un navigateur par appel, toujours fermé (`finally`). Les erreurs ne contiennent jamais le HTML, ni un chemin interne.
import { createHash } from 'node:crypto';

const DELAI_MS = 90000; // total (lancement + rendu) ; la fonction a 120 s
const DELAI_CHARGEMENT_MS = 20000;

/** Pied de page : numéro du devis à gauche, « Page n / N » à droite. Style en ligne voulu : c'est du HTML de PDF, pas de l'interface. */
export function piedParDefaut(numero = '') {
  const n = String(numero).replace(/[<>&"]/g, '');
  return `<div style="font-size:8px;font-family:Arial,sans-serif;width:100%;margin:0 15mm;color:#555;display:flex;justify-content:space-between"><span>${n}</span><span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`;
}

/** Réglages d'impression : A4, fonds imprimés, en-tête vide, pied avec le numéro de page. Exportés pour que les tests (et la vérification réelle) utilisent les mêmes. */
export function optionsPdf(pied) {
  return {
    format: 'A4', printBackground: true, preferCSSPageSize: false,
    displayHeaderFooter: true, headerTemplate: '<div></div>', footerTemplate: pied || piedParDefaut(),
    margin: { top: '15mm', bottom: '20mm', left: '10mm', right: '10mm' },
  };
}

async function chargerReels() {
  const [{ default: puppeteer }, { default: chromium }] = await Promise.all([import('puppeteer-core'), import('@sparticuz/chromium')]);
  return { puppeteer, chromium };
}

const avecDelai = (promesse, ms) => {
  let minuteur;
  const limite = new Promise((_, rejeter) => { minuteur = setTimeout(() => rejeter(new Error('délai')), ms); });
  return Promise.race([promesse, limite]).finally(() => clearTimeout(minuteur));
};

/** Rend { pdf, sha256 }. `pied` : gabarit du pied de page. Erreurs lisibles « PDF : … » sans HTML ni chemin. */
export async function convertirHtmlEnPdf(html, { puppeteer, chromium, pied, delaiMs = DELAI_MS } = {}) {
  if (!html || typeof html !== 'string') throw new Error('PDF : document HTML vide.');
  let navigateur;
  let fini = false;
  const fermer = async () => { if (navigateur) { const n = navigateur; navigateur = undefined; try { await n.close(); } catch { /* déjà fermé */ } } };
  try {
    const reels = puppeteer && chromium ? { puppeteer, chromium } : await chargerReels();
    const traitement = (async () => {
      const lance = await reels.puppeteer.launch({
        args: reels.chromium.args.filter((a) => !/^--(disable-web-security|allow-running-insecure-content)/.test(a)), executablePath: await reels.chromium.executablePath(), headless: 'shell',
      });
      navigateur = lance;
      if (fini) { await fermer(); throw new Error('délai'); } // le délai a déjà gagné pendant le lancement
      const page = await lance.newPage();
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (r) => {
        if (String(r.url()).startsWith('data:')) r.continue().catch(() => {}); else r.abort().catch(() => {});
      });
      await page.setContent(html, { waitUntil: 'load', timeout: DELAI_CHARGEMENT_MS });
      return Buffer.from(await page.pdf(optionsPdf(pied)));
    })();
    traitement.catch(() => {}); // si le délai gagne, le rejet tardif est absorbé ; le `finally` ferme le navigateur
    const pdf = await avecDelai(traitement, delaiMs);
    if (!pdf.length) throw new Error('vide');
    if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error('invalide');
    return { pdf, sha256: createHash('sha256').update(pdf).digest('hex') };
  } catch (e) {
    const m = String(e?.message ?? '');
    if (m === 'délai') throw new Error(`PDF : délai dépassé (${Math.round(delaiMs / 1000)} s) pour la conversion.`);
    if (m === 'vide') throw new Error('PDF : la conversion a rendu un document vide.');
    if (m === 'invalide') throw new Error("PDF : la conversion n'a pas rendu un PDF.");
    throw new Error('PDF : la conversion a échoué.');
  } finally {
    fini = true;
    await fermer();
  }
}
