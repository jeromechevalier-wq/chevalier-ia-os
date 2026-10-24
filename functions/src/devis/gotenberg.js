// Conversion HTML -> PDF par un Gotenberg privé (Cloud Run, région UE). Brique pure : tout est injecté.
import { createHash } from 'node:crypto';

const DELAI_MS = 60000;

/** Pied de page : numéro du devis à gauche, « Page n / N » à droite (gabarit Gotenberg). */
export function piedParDefaut(numero = '') {
  const n = String(numero).replace(/[<>&"]/g, '');
  return `<html><head><style>body{font-size:8px;font-family:Arial,sans-serif;width:100%;margin:0 15mm;color:#555;display:flex;justify-content:space-between}</style></head><body><span>${n}</span><span>Page <span class="pageNumber"></span> / <span class="totalPages"></span></span></body></html>`;
}

const ENTETE_VIDE = '<html><head></head><body></body></html>';

/** Jeton d'identité Google réel (google-auth-library chargée seulement à l'usage). */
export async function obtenirJetonGoogle(audience) {
  const { GoogleAuth } = await import('google-auth-library');
  const client = await new GoogleAuth().getIdTokenClient(audience);
  const entetes = await client.getRequestHeaders();
  const h = entetes.get ? entetes.get('Authorization') : entetes.Authorization;
  return String(h || '').replace(/^Bearer\s+/i, '');
}

/** Envoie le HTML à Gotenberg et rend { pdf, sha256 }. Les erreurs ne contiennent jamais le HTML ni le jeton. */
export async function convertirHtmlEnPdf(html, { urlService, obtenirJeton, fetchImpl = fetch, entete, pied, delaiMs = DELAI_MS } = {}) {
  if (!html || typeof html !== 'string') throw new Error('PDF : document HTML vide.');
  if (!urlService) throw new Error('PDF : adresse du service de conversion non configurée.');
  if (typeof obtenirJeton !== 'function') throw new Error('PDF : fournisseur de jeton manquant.');
  const base = String(urlService).replace(/\/+$/, '');
  let jeton;
  try { jeton = await obtenirJeton(base); } catch { throw new Error("PDF : impossible d'obtenir l'identité pour appeler le service de conversion."); }
  if (!jeton) throw new Error("PDF : identité vide pour appeler le service de conversion.");

  const form = new FormData();
  form.append('files', new Blob([html], { type: 'text/html' }), 'index.html');
  form.append('files', new Blob([entete || ENTETE_VIDE], { type: 'text/html' }), 'header.html');
  form.append('files', new Blob([pied || piedParDefaut()], { type: 'text/html' }), 'footer.html');
  const champs = {
    paperWidth: '8.27', paperHeight: '11.7',
    marginTop: '0.6', marginBottom: '0.8', marginLeft: '0.4', marginRight: '0.4',
    preferCssPageSize: 'false', printBackground: 'true',
  };
  for (const [k, v] of Object.entries(champs)) form.append(k, v);

  let rep;
  try {
    rep = await fetchImpl(`${base}/forms/chromium/convert/html`, {
      method: 'POST', headers: { Authorization: `Bearer ${jeton}` }, body: form, signal: AbortSignal.timeout(delaiMs),
    });
  } catch (e) {
    if (e && (e.name === 'TimeoutError' || e.name === 'AbortError')) throw new Error(`PDF : délai dépassé (${Math.round(delaiMs / 1000)} s) pour la conversion.`);
    throw new Error('PDF : le service de conversion est injoignable.');
  }
  if (rep.status !== 200) throw new Error(`PDF : le service de conversion a répondu ${rep.status}.`);
  const pdf = Buffer.from(await rep.arrayBuffer());
  if (!pdf.length) throw new Error('PDF : réponse vide du service de conversion.');
  if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') throw new Error("PDF : la réponse du service n'est pas un PDF.");
  return { pdf, sha256: createHash('sha256').update(pdf).digest('hex') };
}
