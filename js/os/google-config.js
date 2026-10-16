// Réglage Google Drive du CRM de Jérôme (fenêtre « Ajouter un document », « Créer le répertoire »).
// idClient : identifiant du « client OAuth Web » du projet Google Cloud. Il est PUBLIC par nature (visible dans toute page qui demande une autorisation Google) :
// ce n'est pas un secret, et le « client secret » ne va JAMAIS ici. Vide tant que Jérôme ne l'a pas créé : les boutons Google restent cachés.
// La clé de navigateur et le numéro de projet sont ceux de Firebase (firebase-config.js), sauf si « cleApi » / « idApp » sont donnés ici.
// Sur la plateforme clients, ce fichier est REMPLACÉ à la construction du paquet par un fichier généré depuis scripts/projets/plateforme.json.
// Pas à pas : docs/google-drive.md.
export const googleDrive = {
  idClient: ""
};
