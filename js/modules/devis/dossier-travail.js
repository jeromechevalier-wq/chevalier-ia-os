// Dossier de travail d'une affaire et PDF des devis (colle entre le CRM, Google Drive et le module Devis).
// Quand le dossier de travail d'une affaire est créé ou lié (fiche de l'affaire OU écran du PDF d'un devis), TOUS les PDF des devis finalisés de l'affaire y sont copiés
// (sous-dossier « Devis »), puis leurs liens stables sont ajoutés aux Documents de l'affaire s'ils n'y sont pas déjà. Les règles pures sont dans drive-copie.js.
import * as CRM from '../crm/donnees.js';
import * as D from './donnees.js';
import { obtenirJeton, oublierJeton, googleDisponible } from '../../os/google-picker.js';
import { routeDansEspace } from '../../os/marque.js';
import { devisAvecPdfDeAffaire, copierPdfsAffaire, documentsAAjouter, nomFichierDrive, cleMemoire, memoireCopie } from './drive-copie.js';
import { idDossierDrive } from '../../os/google-drive.js';

/** Peut-on proposer de créer le dossier ? Seulement si l'option « Créer un dossier dans Google Drive » est allumée et que Google est branché (comme le bouton de la fiche). */
export const dossierCreable = () => CRM.etat.config?.options?.boutonsDepot === true && googleDisponible() && CRM.compteCourant()?.ecrit !== false; // un lecteur d'un client ne crée rien (comme « + Ajouter » de la fiche)

/** Lecture du PDF d'un devis par le lien signé (le stockage doit autoriser le site : docs/cors-stockage-pdf.md). */
async function lirePdfDuDevis(devis) {
  const r = await D.pdfLien(devis.id);
  const url = typeof r?.url === 'string' && /^https:\/\//i.test(r.url) ? r.url : '';
  if (!url) throw new Error('lien');
  const rep = await fetch(url);
  if (!rep.ok) throw new Error(`Lecture du PDF : ${rep.status}`);
  return rep.blob();
}

/** Identifiant du client dans l'adresse (`#/espace/<client>/…`), vide chez Jérôme : le même que celui du lien stable écrit par le serveur. */
const clientCourant = () => routeDansEspace(String(location.hash).replace(/^#\/?/, ''))?.client || '';

/** Attend (au plus `delaiMs`) que les devis soient chargés. Rend true s'ils le sont. */
function attendreDevis(delaiMs = 8000) {
  if (D.estPretDevis()) return Promise.resolve(true);
  return new Promise((resolve) => {
    let fini = false;
    const fin = (ok) => { if (fini) return; fini = true; clearTimeout(minuteur); arret(); resolve(ok); };
    const arret = D.surChangement(() => { if (D.estPretDevis()) fin(true); });
    const minuteur = setTimeout(() => fin(D.estPretDevis()), delaiMs);
  });
}

/** Ajoute aux Documents de l'affaire les liens stables des PDF qui n'y sont pas encore (l'événement « Document joint » ne vient que d'un lien nouveau : logique du CRM). */
export async function joindreLiensPdf(affaireId, devisListe) {
  const affaire = CRM.affaire(affaireId); // lecture la plus récente, juste avant l'écriture : un lien déjà présent n'est jamais réécrit
  if (!affaire) return 0;
  const nouveaux = documentsAAjouter({ devisListe, documents: affaire.documents, client: clientCourant() });
  if (!nouveaux.length) return 0;
  await CRM.majAffaire(affaireId, { documents: [...(affaire.documents || []), ...nouveaux] });
  return nouveaux.length;
}

/**
 * Crochet « dossier de travail prêt » : copie les PDF des devis finalisés de l'affaire dans le dossier, puis joint leurs liens. Rend le compte rendu { texte, type } (ou null s'il n'y a rien à copier).
 * Ne lève jamais pour un échec de Drive : il devient un compte rendu d'erreur.
 */
export async function apresDossierDeTravail({ affaireId, urlDossier, annoncer = () => {} }) {
  const affaire = CRM.affaire(affaireId);
  if (!affaire || !idDossierDrive(urlDossier)) return null; // dossier hors Drive : rien à copier
  // Les devis arrivent après les affaires : on les attend un peu plutôt que de ne rien dire.
  if (!(await attendreDevis())) return { texte: 'Le dossier est prêt, mais les devis ne sont pas encore chargés : les PDF seront copiés quand tu ouvriras le PDF d’un devis de cette affaire.', type: 'erreur' };
  const liste = devisAvecPdfDeAffaire(D.etat.devis, affaireId);
  if (!liste.length) return null;
  if (!googleDisponible()) return null;
  const email = CRM.compteCourant()?.email || '';
  annoncer('Copie des PDF des devis dans le dossier…');
  const bilan = await copierPdfsAffaire({
    affaire: { ...affaire, urlDossier },
    devisListe: liste,
    outils: { obtenirJeton: () => obtenirJeton({ email }), lirePdf: lirePdfDuDevis },
  });
  if (bilan.erreur?.statut === 401) oublierJeton();
  const dossierId = idDossierDrive(urlDossier);
  for (const r of bilan.resultats) {
    if (r.etat !== 'copie' && r.etat !== 'deja') continue;
    const devis = liste.find((d) => d.id === r.devisId);
    if (devis) memoireCopie.ecrire(cleMemoire(devis.id, dossierId, nomFichierDrive(devis)));
  }
  let texte = bilan.texte;
  let type = bilan.type;
  try { await joindreLiensPdf(affaireId, liste); } catch (e) {
    console.warn(e);
    texte = `${texte} Les liens des PDF n’ont pas pu être ajoutés aux Documents de l’affaire.`.trim();
    type = 'erreur';
  }
  return { texte, type };
}
