// Pagination : Chromium ignore les boîtes de marge @page ; le numéro « Page n / N » viendra des gabarits d'en-tête/pied du convertisseur serveur.
// Clés de `vue.emetteur` lues ici (convention pour la PR des réglages) : adresse, telephone, email, siret, tvaIntracommunautaire, formeJuridique.
// `conditions.acompte` est affiché tel quel : l'unité (pourcentage ou euros) sera tranchée avec l'écran du devis.
// Document « Devis » en HTML imprimable (A4). Module pur : aucun DOM, aucun réseau, aucun JavaScript dans la page produite.
// Il reçoit la « vue client » (vueClient de logique.js, donc jamais de prix d'achat, de marge ni de coefficient) et rend une chaîne HTML
// complète. Usage : aperçu et impression dans le navigateur (« Imprimer » puis « Enregistrer au format PDF ») ; plus tard, un
// convertisseur HTML vers PDF côté serveur en tirera le PDF officiel.
//
// Texte de l'attestation de TVA réduite (ATTESTATION_TVA_REDUITE) : à faire valider par l'expert-comptable du client
// avant mise en production.
//
// Décisions prises seul :
// - Les données viennent toutes de `vue` ; le nom du destinataire est `vue.client.nom` (fourni par l'appelant dans le contexte de vueClient).
// - Franchise : lignes sans colonne de TVA chiffrée (« - »), pas de tableau de TVA, pas de ligne TVA/TTC. Autoliquidation : TVA à 0.
// - L'en-tête et le pied répétés sur chaque page passent par thead/tfoot d'une table de mise en page (repli simple qui marche partout).
import { ATTESTATION_TVA_REDUITE } from './logique.js';

export { ATTESTATION_TVA_REDUITE };

const NBSP = ' ';

/** Échappe une valeur venue des données (jamais de balise ni d'attribut injecté). */
export function echapper(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
}
/** Échappe puis transforme les sauts de ligne en <br>. */
const texte = (v) => echapper(v).replace(/\r\n|\r|\n/g, '<br>');

/** Montant français : 3 451,63 € (espaces insécables). */
export function formaterMontant(n) {
  const c = Math.round(Math.abs(Number.isFinite(n) ? n : 0) * 100);
  const entier = String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const signe = n < 0 && c !== 0 ? '-' : '';
  return `${signe}${entier},${String(c % 100).padStart(2, '0')}${NBSP}€`;
}
const nombre = (n) => (Number.isFinite(n) ? String(Math.round(n * 10000) / 10000).replace('.', ',') : '');
const pourcent = (n) => `${nombre(n)}${NBSP}%`;
const dateFr = (j) => (/^\d{4}-\d{2}-\d{2}/.test(j ?? '') ? `${j.slice(8, 10)}/${j.slice(5, 7)}/${j.slice(0, 4)}` : '');
/** Une adresse est un texte ou un objet { texte }. */
const adresseTexte = (a) => (typeof a === 'string' ? a : a?.texte ?? '');

const CSS = `
@page { size: A4; margin: 14mm 14mm 16mm 14mm; }
* { box-sizing: border-box; }
html { font-family: Helvetica, Arial, sans-serif; font-size: 9.5pt; color: #1b1b1b; }
body { margin: 0; }
table { border-collapse: collapse; width: 100%; }
.mise-en-page { table-layout: auto; }
.mise-en-page > thead > tr > td, .mise-en-page > tfoot > tr > td { padding: 0; }
.entete-court { font-size: 8pt; color: #666; text-align: right; padding-bottom: 3mm; }
.pied-court { font-size: 7.5pt; color: #666; text-align: center; padding-top: 3mm; }
.haut { display: flex; justify-content: space-between; gap: 10mm; margin-bottom: 8mm; }
.emetteur { max-width: 90mm; line-height: 1.35; }
.emetteur .nom { font-size: 12pt; font-weight: bold; }
.emetteur img { max-height: 22mm; max-width: 60mm; display: block; margin-bottom: 2mm; }
.destinataire { width: 80mm; border: 0.3mm solid #999; padding: 3mm 4mm; line-height: 1.35; }
.destinataire .etiquette { font-size: 7.5pt; text-transform: uppercase; color: #666; }
.destinataire .nom { font-weight: bold; }
h1 { font-size: 20pt; margin: 0 0 1mm; }
.infos { margin-bottom: 5mm; line-height: 1.5; }
.infos .objet { font-size: 11pt; font-weight: bold; margin-top: 2mm; }
.lignes th { background: #e9ecef; text-align: left; font-size: 8.5pt; padding: 1.6mm 2mm; border-bottom: 0.3mm solid #666; }
.lignes td { padding: 1.4mm 2mm; border-bottom: 0.2mm solid #ddd; vertical-align: top; }
.lignes tr { page-break-inside: avoid; break-inside: avoid; }
.lignes .num { width: 11mm; white-space: nowrap; }
.lignes .d { text-align: right; white-space: nowrap; }
.lignes .bandeau td { background: #f1f3f5; font-weight: bold; border-top: 0.3mm solid #999; }
.lignes .sous-total td { text-align: right; font-style: italic; border-bottom: 0.3mm solid #999; }
.lignes .description { font-size: 8.5pt; color: #444; margin-top: 0.8mm; }
.bas { display: flex; justify-content: space-between; gap: 10mm; margin-top: 6mm; page-break-inside: avoid; break-inside: avoid; }
.taux { width: 85mm; align-self: flex-start; }
.taux th, .taux td { padding: 1.2mm 2mm; border: 0.2mm solid #bbb; font-size: 8.5pt; }
.taux th { background: #e9ecef; text-align: left; }
.totaux { width: 80mm; margin-left: auto; }
.totaux td { padding: 1.3mm 2mm; }
.totaux .d { text-align: right; white-space: nowrap; }
.totaux .net td { font-weight: bold; font-size: 11pt; border-top: 0.4mm solid #1b1b1b; }
.paiement, .mentions { margin-top: 6mm; line-height: 1.4; page-break-inside: avoid; break-inside: avoid; }
.paiement h2 { font-size: 9.5pt; margin: 0 0 1mm; }
.paiement ul { margin: 0; padding-left: 5mm; }
.mentions p { margin: 0 0 1.5mm; font-size: 8.5pt; }
.client { margin-top: 6mm; border: 0.3mm solid #666; padding: 3mm 4mm; min-height: 38mm; page-break-inside: avoid; break-inside: avoid; }
.client .titre { font-weight: bold; margin-bottom: 1mm; }
.filigrane { position: fixed; top: 38%; left: 0; right: 0; text-align: center; font-size: 90pt; font-weight: bold; letter-spacing: 6mm; color: rgba(150, 150, 150, 0.16); transform: rotate(-30deg); pointer-events: none; z-index: 0; }
`;

/** Bloc de l'émetteur : logo (data URL image seulement) puis les champs connus de `vue.emetteur`. */
function blocEmetteur(vue, logo) {
  const e = vue.emetteur ?? {};
  const l = [];
  if (typeof logo === 'string' && /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/.test(logo)) l.push(`<img src="${echapper(logo)}" alt="">`);
  if (e.nom) l.push(`<div class="nom">${texte(e.nom)}</div>`);
  for (const cle of ['adresse', 'telephone', 'email', 'siret', 'tvaIntracommunautaire', 'formeJuridique']) {
    const v = adresseTexte(e[cle]);
    if (v) l.push(`<div>${texte(cle === 'siret' ? `SIRET ${v}` : v)}</div>`);
  }
  return `<div class="emetteur">${l.join('')}</div>`;
}

function blocDestinataire(vue) {
  const adr = adresseTexte(vue.adresses?.facturation) || adresseTexte(vue.adresses?.commanditaire);
  const nom = vue.client?.nom;
  return `<div class="destinataire"><div class="etiquette">Destinataire</div>${nom ? `<div class="nom">${texte(nom)}</div>` : ''}${adr ? `<div>${texte(adr)}</div>` : ''}</div>`;
}

function tableauLignes(vue, sansTva) {
  const lignes = [];
  for (const s of vue.sections ?? []) {
    lignes.push(`<tr class="bandeau"><td class="num">${texte(s.numero)}</td><td colspan="6">${texte(s.titre || 'Prestations')}</td></tr>`);
    for (const l of s.lignes ?? []) {
      const tva = sansTva && vue.regimeTva === 'franchise' ? '-' : pourcent(l.tauxTva ?? 0);
      lignes.push(`<tr><td class="num">${texte(l.numero)}</td><td>${texte(l.libelle)}${l.description ? `<div class="description">${texte(l.description)}</div>` : ''}</td>`
        + `<td class="d">${texte(nombre(l.quantite))}</td><td>${texte(l.unite)}</td><td class="d">${formaterMontant(l.prixUnitaireHT)}</td><td class="d">${tva}</td><td class="d">${formaterMontant(l.totalHT)}</td></tr>`);
    }
    lignes.push(`<tr class="sous-total"><td colspan="7">Sous-total ${texte(s.numero)}${NBSP}: ${formaterMontant(s.sousTotalHT)}</td></tr>`);
  }
  return `<table class="lignes"><thead><tr><th class="num">N°</th><th>Désignation</th><th class="d">Qté</th><th>Unité</th><th class="d">Prix U.${NBSP}HT</th><th class="d">TVA</th><th class="d">Total${NBSP}HT</th></tr></thead><tbody>${lignes.join('')}</tbody></table>`;
}

/**
 * HTML complet du devis. `vue` : résultat de vueClient. Options : `brouillon` (filigrane), `logo` (data URL ou null).
 */
export function devisHtml(vue, options = {}) {
  const v = vue ?? {};
  const franchise = v.regimeTva === 'franchise';
  const autoliquidation = v.autoliquidation === true;
  const sansTva = franchise || autoliquidation;
  const t = v.totaux ?? {};
  const titre = `Devis ${v.numero ?? ''}`.trim();

  const infos = [`<h1>Devis</h1>`];
  infos.push(`<div>Numéro${NBSP}: <strong>${texte(v.numero ?? 'brouillon')}</strong>${v.version > 1 ? ` (version ${texte(v.version)})` : ''}</div>`);
  if (v.dateEmission) infos.push(`<div>Date d'émission${NBSP}: ${dateFr(v.dateEmission)}</div>`);
  if (v.dateValidite) infos.push(`<div>Valable jusqu'au${NBSP}: ${dateFr(v.dateValidite)}</div>`);
  if (v.objet) infos.push(`<div class="objet">${texte(v.objet)}</div>`);
  const chantier = adresseTexte(v.adresses?.chantier);
  if (chantier) infos.push(`<div>Adresse du chantier${NBSP}: ${texte(chantier)}</div>`);

  const lignesTotaux = [`<tr><td>Total net HT</td><td class="d">${formaterMontant(t.ht)}</td></tr>`];
  if (!franchise) {
    lignesTotaux.push(`<tr><td>TVA</td><td class="d">${formaterMontant(t.tva)}</td></tr>`);
    lignesTotaux.push(`<tr><td>Total TTC</td><td class="d">${formaterMontant(t.ttc)}</td></tr>`);
  }
  lignesTotaux.push(`<tr class="net"><td>Net à payer</td><td class="d">${formaterMontant(franchise ? t.ht : t.ttc)}</td></tr>`);

  const tableauTaux = sansTva || !(t.tvaParTaux ?? []).length ? '<div></div>'
    : `<table class="taux"><thead><tr><th>Taux TVA</th><th class="d">Base HT</th><th class="d">Total TVA</th></tr></thead><tbody>${t.tvaParTaux.map((x) => `<tr><td>${pourcent(x.taux)}</td><td class="d">${formaterMontant(x.baseHT)}</td><td class="d">${formaterMontant(x.montant)}</td></tr>`).join('')}</tbody></table>`;

  const paiement = [];
  if (v.conditionsPaiement) paiement.push(`<p>${texte(v.conditionsPaiement)}</p>`);
  if ((v.modesPaiement ?? []).length) paiement.push(`<ul>${v.modesPaiement.map((m) => `<li>${texte(m)}</li>`).join('')}</ul>`);
  const c = v.conditions ?? {};
  const details = [];
  if (c.debutTravaux) details.push(`Début des travaux${NBSP}: ${texte(c.debutTravaux)}`);
  if (c.dureeEstimee) details.push(`Durée estimée${NBSP}: ${texte(c.dureeEstimee)}`);
  if (c.acompte) details.push(`Acompte${NBSP}: ${texte(c.acompte)}`);
  if (details.length) paiement.push(`<p>${details.join('<br>')}</p>`);

  const mentions = [...(v.mentions ?? [])];
  if (v.attestationTvaReduite && !sansTva) mentions.push(v.attestationTvaReduite);

  const corps = [
    `<div class="haut">${blocEmetteur(v, options.logo)}${blocDestinataire(v)}</div>`,
    `<div class="infos">${infos.join('')}</div>`,
    tableauLignes(v, sansTva),
    `<div class="bas">${tableauTaux}<table class="totaux"><tbody>${lignesTotaux.join('')}</tbody></table></div>`,
    paiement.length ? `<div class="paiement"><h2>Conditions et modes de paiement</h2>${paiement.join('')}</div>` : '',
    mentions.length ? `<div class="mentions">${mentions.map((m) => `<p>${texte(m)}</p>`).join('')}</div>` : '',
    `<div class="client"><div class="titre">Pour le client</div><div>${texte(v.mentionSignature ?? '')}</div></div>`,
  ].filter(Boolean).join('\n');

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${texte(titre)}</title>
<style>${CSS}</style>
</head>
<body>
${options.brouillon === true ? '<div class="filigrane">BROUILLON</div>' : ''}
<table class="mise-en-page">
<thead><tr><td><div class="entete-court">${texte(titre)}</div></td></tr></thead>
<tfoot><tr><td><div class="pied-court">${texte(titre)}</div></td></tr></tfoot>
<tbody><tr><td>
${corps}
</td></tr></tbody>
</table>
</body>
</html>
`;
}
