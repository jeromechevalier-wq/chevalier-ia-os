// TEXTE À FAIRE RELIRE PAR UN JURISTE AVANT MISE EN PRODUCTION.
// Générateur de conditions générales (CGV) du module Devis. Module pur : aucun DOM, aucun réseau, aucun JavaScript dans la page produite.
// Texte original, court et simple. Aucune référence d'article de loi : le texte renvoie à « la loi » quand il le faut.
// Seuls chiffres légaux écrits : le délai de rétractation de 14 jours et l'indemnité forfaitaire de recouvrement de 40 € (client professionnel).
// Le taux des pénalités de retard n'est pas chiffré : « au taux prévu par la loi ».
//
// Décisions prises seul :
// - Livraison, Réception et Réserve de propriété dépendent du type de prestations.
// - La rétractation est toujours rédigée avec la condition « contrat conclu hors établissement avec un particulier ».
import { echapper } from './document.js';

/** Tant que c'est faux, l'écran affichera un avertissement : le texte n'a pas été relu par un juriste. */
export const CGV_RELUES_PAR_JURISTE = false;

/** Bandeau affiché en tête tant que le texte n'est pas validé. */
export const AVERTISSEMENT_CGV = 'Ce texte est fourni à titre d\'exemple : il doit être relu et validé par le juriste de l\'entreprise avant d\'être utilisé.';

export const TYPES_CGV = ['travaux', 'fournitures', 'travaux_fournitures'];
const TITRES = {
  travaux: 'Conditions générales de travaux',
  fournitures: 'Conditions générales de vente',
  travaux_fournitures: 'Conditions générales de vente et de travaux',
};
const COULEUR_DEFAUT = '#333333';
const MAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

const nombreOu = (v, defaut) => (v === undefined || v === null || v === '' ? defaut : Number(v));
const chaine = (v) => String(v ?? '').trim();
const parametres = (p = {}) => ({
  type: TYPES_CGV.includes(p.typePrestations) ? p.typePrestations : 'travaux_fournitures',
  pro: { nom: chaine(p.professionnel?.nom), email: chaine(p.professionnel?.email) },
  med: { nom: chaine(p.mediateur?.nom), email: chaine(p.mediateur?.email), site: chaine(p.mediateur?.site) },
  tribunal: chaine(p.tribunal),
  validite: nombreOu(p.validiteDevisJours, 30),
  delai: nombreOu(p.delaiPaiementJours, 30),
  acompte: nombreOu(p.acomptePourcent, 30),
  penalites: p.penalitesRetard === true,
  couleur: chaine(p.couleur) || COULEUR_DEFAUT,
});

/** Liste des problèmes, en français. Vide = les paramètres sont utilisables. */
export function erreursCgv(params) {
  const p = parametres(params);
  const e = [];
  if (params?.typePrestations !== undefined && !TYPES_CGV.includes(params.typePrestations)) e.push('Le type de prestations doit être : travaux, fournitures, ou les deux.');
  if (!p.pro.nom) e.push('Le nom du professionnel est obligatoire.');
  if (!p.pro.email) e.push('L\'e-mail du professionnel est obligatoire.');
  else if (!MAIL.test(p.pro.email)) e.push('L\'e-mail du professionnel est illisible.');
  if (!p.med.nom && !p.med.email && !p.med.site) e.push('Indiquez le médiateur de la consommation (au moins son nom, son e-mail ou son site).');
  if (p.med.email && !MAIL.test(p.med.email)) e.push('L\'e-mail du médiateur est illisible.');
  if (!p.tribunal) e.push('Le tribunal compétent est obligatoire.');
  if (!Number.isInteger(p.validite) || p.validite < 1 || p.validite > 365) e.push('La validité du devis doit être un nombre entier de jours entre 1 et 365.');
  if (!Number.isInteger(p.delai) || p.delai < 0 || p.delai > 365) e.push('Le délai de paiement doit être un nombre entier de jours entre 0 et 365.');
  if (!Number.isFinite(p.acompte) || p.acompte < 0 || p.acompte > 100) e.push('L\'acompte doit être un pourcentage entre 0 et 100.');
  if (!/^#[0-9a-fA-F]{6}$/.test(p.couleur)) e.push('La couleur doit être un code du type #1a2b3c.');
  return e;
}

/** Sections du document : [{ titre, paragraphes: [{ intitule?, texte }] }]. Le texte est brut (non échappé). */
export function sectionsCgv(params) {
  const p = parametres(params);
  const travaux = p.type !== 'fournitures';
  const fournitures = p.type !== 'travaux';
  const S = [];
  const ajoute = (titre, paragraphes) => S.push({ titre, paragraphes });

  ajoute('Comment ça marche', [
    { texte: `Ces conditions s'appliquent au devis de ${p.pro.nom || 'le professionnel'} et, en cas de différence, le devis l'emporte. L'accord prend effet quand le client a signé le devis${p.acompte > 0 ? ` et versé l'acompte de ${p.acompte} %` : ''}. Le devis est valable ${p.validite} jours.${travaux ? ' Aucun travail ne commence avant la signature du devis.' : ''}` },
  ]);

  ajoute('Prix', [
    { texte: 'Le prix est celui du devis. Il couvre seulement ce qui y est décrit. Toute modification demandée par le client donne lieu à un supplément de prix, accepté par écrit avant d\'être réalisée.' },
    { intitule: 'Paiement', texte: `${p.acompte > 0 ? `Un acompte de ${p.acompte} % est dû à la signature. ` : ''}Le solde est payable dans un délai de ${p.delai} jours après la facture. En cas de non-paiement, le professionnel peut suspendre ses prestations après une relance restée sans effet.` },
    ...(p.penalites ? [{ intitule: 'Pénalités de retard', texte: 'Toute somme payée en retard produit des pénalités, au taux prévu par la loi. Si le client est un professionnel, il doit en plus l\'indemnité forfaitaire de 40 € pour frais de recouvrement.' }] : []),
  ]);

  ajoute('Prestations incluses', [
    { texte: 'Le professionnel réalise ce que liste le devis, et seulement cela. Le client fournit l\'eau, l\'électricité et un endroit sûr où stocker le matériel. Le professionnel peut confier une partie du travail à un sous-traitant, dont il reste responsable.' },
  ]);

  ajoute('Délais', [
    { texte: 'Les délais du devis sont indicatifs. Le démarrage se fixe ensemble une fois le devis signé. Un événement hors du contrôle du professionnel (force majeure, par exemple une intempérie exceptionnelle) suspend les délais, et il en prévient le client. Si le retard devient important par sa faute, le client peut le mettre en demeure par écrit de s\'exécuter.' },
  ]);

  ajoute('Propriété intellectuelle', [
    { texte: 'Les plans, dessins et documents préparés par le professionnel restent sa propriété. Le client les utilise pour son projet uniquement.' },
  ]);

  if (fournitures) ajoute('Livraison', [
    { texte: 'Les fournitures sont livrées à l\'adresse et aux dates convenues. Le client vérifie leur état à l\'arrivée et signale par écrit tout défaut ou manque dans les 3 jours.' },
  ]);

  if (travaux) ajoute('Réception', [
    { texte: 'À la fin des travaux, le client et le professionnel signent un procès-verbal de réception, avec ou sans réserves. Les réserves sont corrigées dans un délai raisonnable convenu ensemble. Une partie terminée du chantier peut être reçue seule (réception partielle).' },
  ]);

  if (fournitures) ajoute('Réserve de propriété', [
    { texte: 'Les fournitures restent la propriété du professionnel jusqu\'au paiement complet du prix.' },
  ]);

  ajoute('Dommages sur les prestations', [
    { texte: 'Avant la réception, le professionnel répare à ses frais les dégâts causés par son fait. Les dégâts venant d\'un tiers ou d\'un événement extérieur font l\'objet d\'un nouveau devis.' },
  ]);

  ajoute('Garanties', [
    { texte: 'Le professionnel est tenu des garanties légales. Ne sont pas couverts l\'usure normale, le mauvais usage, le défaut d\'entretien et les modifications faites par un tiers.' },
  ]);

  ajoute('Résiliation', [
    { texte: 'Le client peut mettre fin à l\'accord par écrit et règle alors ce qui a été réalisé ou commandé pour lui. Le professionnel peut y mettre fin si le client ne respecte pas ses obligations après une demande écrite restée sans effet pendant 8 jours.' },
  ]);

  ajoute('Données personnelles', [
    { texte: `Le professionnel utilise les données du client seulement pour préparer le devis, réaliser la prestation, facturer et respecter la loi. Le client peut demander à les voir, les corriger ou les supprimer en écrivant à ${p.pro.email || 'l\'adresse du professionnel'}.` },
  ]);

  const med = [p.med.nom, p.med.email, p.med.site].filter(Boolean).join(', ');
  ajoute('En cas de problème', [
    { texte: `Le client écrit d'abord au professionnel pour chercher une solution à l'amiable. Si le client est un consommateur et qu'aucun accord n'est trouvé, il peut saisir gratuitement le médiateur de la consommation : ${med}. Le médiateur n'est saisi qu'après une réclamation écrite adressée d'abord au professionnel. À défaut d'accord, le litige relève de ${p.tribunal || 'la juridiction compétente'}. Le droit français s'applique.` },
  ]);

  ajoute('Rétractation', [
    { texte: `Si le contrat est conclu hors de l'établissement du professionnel avec un particulier, le client peut se rétracter sous 14 jours à compter de la signature, sans motif, en écrivant à ${p.pro.nom || 'le professionnel'}${p.pro.email ? ` (${p.pro.email})` : ''}.` },
    { intitule: 'Modèle de courrier', texte: `« Je soussigné(e) [nom, adresse], déclare me rétracter du contrat signé le [date] avec ${p.pro.nom || '[professionnel]'} pour [prestation]. Date et signature. »` },
  ]);
  return S;
}

const texte = (v) => echapper(v).replace(/\r\n|\r|\n/g, '<br>');

const css = (couleur) => `
@page { size: A4; margin: 14mm; }
* { box-sizing: border-box; }
:root { --accent: ${couleur}; }
html { font-family: Helvetica, Arial, sans-serif; font-size: 8.5pt; color: #1b1b1b; }
body { margin: 0; }
h1 { font-size: 15pt; margin: 0 0 1mm; color: var(--accent); border-bottom: 0.5mm solid var(--accent); padding-bottom: 2mm; }
.pro { font-size: 8pt; color: #555; margin: 0 0 4mm; }
.colonnes { column-count: 2; column-gap: 8mm; }
section { break-inside: avoid-column; margin: 0 0 3mm; }
h2 { font-size: 9.5pt; margin: 0 0 1mm; color: var(--accent); }
p { margin: 0 0 1.3mm; line-height: 1.32; }
p b { font-weight: bold; }
.avertissement { font-size: 7.5pt; color: #7a5b00; background: #fff8e1; border: 0.2mm solid #e6d28a; padding: 1.5mm 2.5mm; margin: 0 0 3mm; }
`;

/** HTML complet du document (A4, deux colonnes, impression). */
export function cgvHtml(params, options = {}) {
  const avertissement = options.avertissement !== false;
  const p = parametres(params);
  const titre = TITRES[p.type];
  // Couleur invalide : repli sur le gris par défaut (jamais de CSS injecté).
  const couleur = /^#[0-9a-fA-F]{6}$/.test(p.couleur) ? p.couleur : COULEUR_DEFAUT;
  const corps = sectionsCgv(params).map((s, i) => `<section><h2>${i + 1}. ${texte(s.titre)}</h2>${s.paragraphes.map((x) => `<p>${x.intitule ? `<b>${texte(x.intitule)}.</b> ` : ''}${texte(x.texte)}</p>`).join('')}</section>`).join('\n');
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${texte(titre)}</title>
<style>${css(couleur)}</style></head>
<body>
${avertissement ? `<div class="avertissement">${texte(AVERTISSEMENT_CGV)}</div>\n` : ''}<h1>${texte(titre)}</h1>
<p class="pro">${texte(p.pro.nom)}${p.pro.email ? ` · ${texte(p.pro.email)}` : ''}</p>
<div class="colonnes">
${corps}
</div>
</body></html>`;
}
