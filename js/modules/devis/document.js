// Pagination : Chromium ignore les boîtes de marge @page ; le numéro « Page n / N » viendra des gabarits d'en-tête/pied du convertisseur serveur.
// Clés de l'émetteur lues ici (options.emetteur ou vue.emetteur) : nom, forme, siret, tva, adresse, email, telephone, site, registreMetiers, assurance, mediateur, logo (https ou data:image), couleur, paiement, cgv. Les alias formeJuridique et tvaIntracommunautaire restent lus.
// L'acompte, les primes, la retenue de garantie, les déchets, le texte libre et les notes viennent de la vue client (libellés déjà prêts, échappés ici).
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
import { ATTESTATION_TVA_REDUITE, montantFr, adresseEnTexte } from './logique.js';

export { ATTESTATION_TVA_REDUITE };

const NBSP = ' ';

/** Échappe une valeur venue des données (jamais de balise ni d'attribut injecté). */
export function echapper(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&#39;' }[c]));
}
/** Échappe puis transforme les sauts de ligne en <br>. */
const texte = (v) => echapper(v).replace(/\r\n|\r|\n/g, '<br>');

/** Montant français : 3 451,63 € (espaces insécables). */
export const formaterMontant = montantFr;
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
h1 { font-size: 20pt; margin: 0 0 1mm; color: var(--accent-titre); }
.infos { margin-bottom: 5mm; line-height: 1.5; }
.infos .objet { font-size: 11pt; font-weight: bold; margin-top: 2mm; }
.lignes th { background: #e9ecef; text-align: left; font-size: 8.5pt; padding: 1.6mm 2mm; border-bottom: 0.3mm solid var(--accent); }
.lignes td { padding: 1.4mm 2mm; border-bottom: 0.2mm solid #ddd; vertical-align: top; }
.lignes tr { page-break-inside: avoid; break-inside: avoid; }
.lignes .num { width: 11mm; white-space: nowrap; }
.lignes .d { text-align: right; white-space: nowrap; }
.lignes tr.saut-avant { break-before: page; page-break-before: always; }
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
.dechets { margin-top: 6mm; line-height: 1.4; page-break-inside: avoid; break-inside: avoid; }
.dechets h2, .notes h2 { font-size: 9.5pt; margin: 0 0 1mm; }
.texte-libre { margin-top: 4mm; line-height: 1.4; }
.notes { margin-top: 6mm; line-height: 1.4; font-size: 8pt; color: #444; }
.mentions p { margin: 0 0 1.5mm; font-size: 8.5pt; }
.client { margin-top: 6mm; border: 0.3mm solid #666; padding: 3mm 4mm; min-height: 38mm; page-break-inside: avoid; break-inside: avoid; }
.client .titre { font-weight: bold; margin-bottom: 1mm; }
.chantier { margin-bottom: 5mm; line-height: 1.45; page-break-inside: avoid; break-inside: avoid; }
.chantier h2 { font-size: 9.5pt; margin: 0 0 1mm; color: var(--accent); }
.assurance-mediation { margin-top: 4mm; font-size: 8pt; line-height: 1.4; color: #444; page-break-inside: avoid; break-inside: avoid; }
.cgv { break-before: page; page-break-before: always; font-size: 8pt; line-height: 1.4; }
.cgv h2 { font-size: 11pt; margin: 0 0 3mm; color: var(--accent); }
.filigrane { position: fixed; top: 38%; left: 0; right: 0; text-align: center; font-size: 90pt; font-weight: bold; letter-spacing: 6mm; color: rgba(150, 150, 150, 0.16); transform: rotate(-30deg); pointer-events: none; z-index: 0; }
`;

const GRIS = '#666666';
/** Couleur d'accent : seulement #rrggbb (jamais de texte libre dans le CSS), sinon gris. */
export const couleurValide = (c) => (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c : GRIS);
const LOGO_DATA = /^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/;
const LOGO_HTTPS = /^https:\/\/[^\s"'<>\\]+$/;
/** Le logo n'est une ressource externe que s'il est fourni explicitement (URL https ou image en data:). */
const logoValide = (l) => typeof l === 'string' && (LOGO_DATA.test(l) || LOGO_HTTPS.test(l));

/** Bloc de l'émetteur : logo (https ou data:image) puis les champs connus de l'émetteur. */
function blocEmetteur(e, logo) {
  const l = [];
  const imageLogo = logoValide(logo) ? logo : e.logo;
  if (logoValide(imageLogo)) l.push(`<img src="${echapper(imageLogo)}" alt="">`);
  if (e.nom) l.push(`<div class="nom">${texte(e.nom)}</div>`);
  const forme = e.forme ?? e.formeJuridique;
  if (forme) l.push(`<div>${texte(forme)}</div>`);
  const adr = adresseEnTexte(e.adresse);
  if (adr) l.push(`<div>${texte(adr)}</div>`);
  for (const cle of ['telephone', 'email', 'site']) if (e[cle]) l.push(`<div>${texte(e[cle])}</div>`);
  if (e.siret) l.push(`<div>${texte(`SIRET ${e.siret}`)}</div>`);
  const tva = e.tva ?? e.tvaIntracommunautaire;
  if (tva) l.push(`<div>${texte(`TVA ${tva}`)}</div>`);
  if (e.registreMetiers) l.push(`<div>${texte(e.registreMetiers)}</div>`);
  return `<div class="emetteur">${l.join('')}</div>`;
}

function blocDestinataire(vue) {
  const adr = adresseTexte(vue.adresses?.facturation) || adresseTexte(vue.adresses?.commanditaire);
  const nom = vue.client?.nom;
  return `<div class="destinataire"><div class="etiquette">Destinataire</div>${nom ? `<div class="nom">${texte(nom)}</div>` : ''}${adr ? `<div>${texte(adr)}</div>` : ''}</div>`;
}

function tableauLignes(vue, sansTva) {
  const lignes = [];
  for (const [k, s] of (vue.sections ?? []).entries()) {
    // Saut de page demandé : jamais sur la première section (la page est déjà neuve).
    const saut = s.sautDePageAvant === true && k > 0 ? ' saut-avant' : '';
    lignes.push(`<tr class="bandeau${saut}"><td class="num">${texte(s.numero)}</td><td colspan="6">${texte(s.titre || 'Prestations')}</td></tr>`);
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
 * HTML complet du devis. `vue` : résultat de vueClient. Options : `brouillon` (filigrane), `logo` (data URL ou null),
 * `pagesAvant` (tableau de fragments HTML DÉJÀ échappés par l'appelant, chacun sur sa page A4, placés avant le chiffrage)
 * et `blocSignature` (fragment HTML déjà échappé, placé en dernière page, après les CGV). Absentes : rendu inchangé.
 */
export function devisHtml(vue, options = {}) {
  const v = vue ?? {};
  const franchise = v.regimeTva === 'franchise';
  const autoliquidation = v.autoliquidation === true;
  const sansTva = franchise || autoliquidation;
  const t = v.totaux ?? {};
  const titre = `Devis ${v.numero ?? ''}`.trim();
  // Réglages de l'entreprise : fournis à côté du devis (options.emetteur) ou portés par la vue.
  const emetteur = options.emetteur ?? v.emetteur ?? {};
  const accent = couleurValide(emetteur.couleur);

  const infos = [`<h1>Devis</h1>`];
  infos.push(`<div>Numéro${NBSP}: <strong>${texte(v.numero ?? 'brouillon')}</strong>${v.version > 1 ? ` (version ${texte(v.version)})` : ''}</div>`);
  if (v.dateEmission) infos.push(`<div>Date d'émission${NBSP}: ${dateFr(v.dateEmission)}</div>`);
  if (v.dateValidite) infos.push(`<div>Valable jusqu'au${NBSP}: ${dateFr(v.dateValidite)}</div>`);
  if (v.objet) infos.push(`<div class="objet">${texte(v.objet)}</div>`);
  const chantier = adresseTexte(v.adresses?.chantier);
  if (chantier && !v.chantier?.adresse) infos.push(`<div>Adresse du chantier${NBSP}: ${texte(chantier)}</div>`);
  const blocChantier = v.chantier?.lignes?.length
    ? `<div class="chantier"><h2>Chantier</h2>${v.chantier.lignes.map((x) => `<div>${texte(x)}</div>`).join('')}</div>` : '';

  const lignesTotaux = [];
  if (v.remise && v.remise.montantHt > 0) {
    const lib = String(v.remise.libelle ?? 'Remise').replace(/^Remise (.+)$/, 'Remise ($1)');
    lignesTotaux.push(`<tr><td>Total HT brut</td><td class="d">${formaterMontant(t.totalBrutHt)}</td></tr>`);
    lignesTotaux.push(`<tr><td>${texte(lib)}</td><td class="d">\u2212${NBSP}${formaterMontant(v.remise.montantHt)}</td></tr>`);
  }
  lignesTotaux.push(`<tr><td>Total net HT</td><td class="d">${formaterMontant(t.ht)}</td></tr>`);
  if (!franchise) {
    lignesTotaux.push(`<tr><td>TVA</td><td class="d">${formaterMontant(t.tva)}</td></tr>`);
    lignesTotaux.push(`<tr><td>Total TTC</td><td class="d">${formaterMontant(t.ttc)}</td></tr>`);
  }
  const moins = (montant) => `\u2212${NBSP}${formaterMontant(montant)}`;
  for (const p of v.primes ?? []) lignesTotaux.push(`<tr><td>${texte(p.libelle)}</td><td class="d">${moins(p.montant)}</td></tr>`);
  if (v.retenueGarantie) lignesTotaux.push(`<tr><td>${texte(v.retenueGarantie.libelle)}</td><td class="d">${moins(v.retenueGarantie.montant)}</td></tr>`);
  lignesTotaux.push(`<tr class="net"><td>Net à payer</td><td class="d">${formaterMontant(t.netAPayer ?? (franchise ? t.ht : t.ttc))}</td></tr>`);

  const tableauTaux = sansTva || !(t.tvaParTaux ?? []).length ? '<div></div>'
    : `<table class="taux"><thead><tr><th>Taux TVA</th><th class="d">Base HT</th><th class="d">Total TVA</th></tr></thead><tbody>${t.tvaParTaux.map((x) => `<tr><td>${pourcent(x.taux)}</td><td class="d">${formaterMontant(x.baseHT)}</td><td class="d">${formaterMontant(x.montant)}</td></tr>`).join('')}</tbody></table>`;

  const paiement = [];
  if (v.conditionsPaiement) paiement.push(`<p>${texte(v.conditionsPaiement)}</p>`);
  const pe = emetteur.paiement ?? {};
  if (!v.conditionsPaiement && Number.isFinite(pe.delaiJours) && pe.delaiJours >= 0) paiement.push(pe.delaiJours === 0 ? '<p>Paiement à réception.</p>' : `<p>Paiement à ${texte(pe.delaiJours)} jour${pe.delaiJours >= 2 ? 's' : ''}.</p>`);
  const modes = (v.modesPaiement ?? []).length ? v.modesPaiement : (Array.isArray(pe.modes) ? pe.modes.filter((m) => typeof m === 'string' && m.trim()) : []);
  if (modes.length) paiement.push(`<ul>${modes.map((m) => `<li>${texte(m)}</li>`).join('')}</ul>`);
  if (pe.iban) paiement.push(`<p>IBAN${NBSP}: ${texte(pe.iban)}</p>`);
  const c = v.conditions ?? {};
  const details = [];
  if (c.debutTravaux && !v.chantier?.debutTravaux) details.push(`Début des travaux${NBSP}: ${texte(c.debutTravaux)}`);
  if (c.dureeEstimee && !v.chantier?.dureeEstimee) details.push(`Durée estimée${NBSP}: ${texte(c.dureeEstimee)}`);
  if (v.acompte) details.push(texte(v.acompte.libelle), texte(v.acompte.libelleReste));
  if (v.retenueGarantie?.phrase) details.push(texte(v.retenueGarantie.phrase));
  if (details.length) paiement.push(`<p>${details.join('<br>')}</p>`);
  if (v.texteLibre) paiement.push(`<div class="texte-libre">${texte(v.texteLibre)}</div>`);

  const dechets = v.dechets?.lignes?.length
    ? `<div class="dechets"><h2>Gestion des déchets</h2>${v.dechets.lignes.map((l) => `<div>${texte(l)}</div>`).join('')}</div>` : '';
  const notes = v.notesBasDePage ? `<div class="notes"><h2>Notes de bas de page</h2>${texte(v.notesBasDePage)}</div>` : '';

  const mentions = [...(v.mentions ?? [])];
  if (v.attestationTvaReduite && !sansTva) mentions.push(v.attestationTvaReduite);

  const ass = emetteur.assurance ?? {};
  const med = emetteur.mediateur ?? {};
  const lAss = [];
  if (ass.garantie || ass.assureur) {
    lAss.push(`Assurance professionnelle${NBSP}: ${[ass.garantie, ass.assureur ? `souscrite auprès de ${ass.assureur}` : '', ass.adresse, ass.zone ? `couverture géographique${NBSP}: ${ass.zone}` : ''].filter(Boolean).map(texte).join(', ')}.`);
  }
  if (med.nom) lAss.push(`Médiateur de la consommation${NBSP}: ${[med.nom, med.email, med.site].filter(Boolean).map(texte).join(', ')}.`);
  const pied = lAss.length ? `<div class="assurance-mediation">${lAss.map((x) => `<div>${x}</div>`).join('')}</div>` : '';
  const cgv = emetteur.cgv?.afficher === true && typeof emetteur.cgv.texte === 'string' && emetteur.cgv.texte.trim()
    ? `<div class="cgv"><h2>Conditions générales de vente</h2>${texte(emetteur.cgv.texte)}</div>` : '';

  // Pages ajoutées par l'appelant (texte déjà échappé) : chacune sur sa page A4.
  const pagesAvant = (Array.isArray(options.pagesAvant) ? options.pagesAvant : []).filter((f) => typeof f === 'string' && f.trim())
    .map((f) => `<div class="page-ajoutee" style="break-after:page;page-break-after:always">${f}</div>`);
  const signature = typeof options.blocSignature === 'string' && options.blocSignature.trim()
    ? `<div class="page-signature" style="break-before:page;page-break-before:always">${options.blocSignature}</div>` : '';

  const corps = [
    ...pagesAvant,
    `<div class="haut">${blocEmetteur(emetteur, options.logo)}${blocDestinataire(v)}</div>`,
    `<div class="infos">${infos.join('')}</div>`,
    blocChantier,
    tableauLignes(v, sansTva),
    `<div class="bas">${tableauTaux}<table class="totaux"><tbody>${lignesTotaux.join('')}</tbody></table></div>`,
    paiement.length ? `<div class="paiement"><h2>Conditions et modes de paiement</h2>${paiement.join('')}</div>` : '',
    dechets,
    mentions.length ? `<div class="mentions">${mentions.map((m) => `<p>${texte(m)}</p>`).join('')}</div>` : '',
    `<div class="client"><div class="titre">Pour le client</div><div>${texte(v.mentionSignature ?? '')}</div></div>`,
    notes,
    pied,
    cgv,
    signature,
  ].filter(Boolean).join('\n');

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${texte(titre)}</title>
<style>:root { --accent: ${accent}; --accent-titre: ${/^#[0-9a-fA-F]{6}$/.test(String(emetteur.couleur ?? '').trim()) ? accent : '#1b1b1b'}; }${CSS}</style>
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
