// Réglage Google Drive du CRM de Jérôme (fenêtre « Ajouter un document », « Créer un dossier dans Google Drive »).
// idClient : identifiant du « client OAuth Web » du projet Google Cloud. Il est PUBLIC par nature (visible dans toute page qui demande une autorisation Google) :
// ce n'est pas un secret, et le « client secret » ne va JAMAIS ici. Renseigné le 2026-10-17 (projet chevalier-ia-os).
// La clé de navigateur et le numéro de projet sont ceux de Firebase (firebase-config.js), sauf si « cleApi » / « idApp » sont donnés ici.
// Sur la plateforme clients, ce fichier est REMPLACÉ à la construction du paquet par un fichier généré depuis scripts/projets/plateforme.json.
// Pas à pas : docs/google-drive.md.
export const googleDrive = {
  idClient: "96526036520-dds68jgprbi9vtlhmuveimqi0poq1s3s.apps.googleusercontent.com"
};
