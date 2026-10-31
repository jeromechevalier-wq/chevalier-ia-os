// Module « Accès MCP » : logique pure de la page d'information (sans Firebase ni DOM, testée seule).
// La page ne règle rien : elle montre le lien de connexion du client, comment s'en servir, et qui a le droit de se connecter.
// Le vrai contrôle (membre, rôle, module allumé) est fait par le serveur à chaque connexion et à chaque appel (functions/src/clients/).

const ID_CLIENT = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/** Lien de connexion d'un client : <origine de la page>/mcp/<client>. `origine` = schéma + domaine de la plateforme (location.origin).
 *  Sans client (espace de Jérôme, à la racine) : <origine de la page>/mcp. Aucune adresse n'est écrite en dur. */
export function lienConnexion(origine, client = null) {
  if (client === null || client === undefined) return `${String(origine).replace(/\/+$/, '')}/mcp`;
  if (typeof client !== 'string' || !ID_CLIENT.test(client)) throw new Error(`Identifiant de client invalide : « ${client} »`);
  return `${String(origine).replace(/\/+$/, '')}/mcp/${client}`;
}

/** Client dont le chemin de base est « clients/<client> » ; null sinon. */
export function clientDuChemin(cheminBase) {
  const m = /^clients\/([a-z0-9][a-z0-9_-]{0,39})$/.exec(String(cheminBase ?? ''));
  return m ? m[1] : null;
}

export const LIBELLES_ROLE = Object.freeze({
  lecteur: 'Lecteur : consulte seulement',
  editeur: 'Éditeur : consulte et modifie',
});

/** Trois lignes, dans l'ordre où le client les vit. `assistants` : ce qu'il faut cliquer dans chaque assistant. */
export const MODE_EMPLOI = Object.freeze([
  { titre: 'Colle le lien', texte: 'Dans Claude : Paramètres, Connecteurs, « Ajouter un connecteur personnalisé ». Dans ChatGPT : Paramètres, Applications, mode développeur, « Créer ». Colle le lien ci-dessus.' },
  { titre: 'Connecte-toi avec Google', texte: 'Une fenêtre de Google s\'ouvre : choisis l\'adresse e-mail qui figure dans la liste des membres ci-dessous. Un autre compte est refusé.' },
  { titre: 'Autorise', texte: 'L\'écran « Autoriser … à accéder à … » s\'affiche aux couleurs de ton espace : clique sur « Autoriser ». Ton IA peut alors consulter tes fiches (lecteur), et les modifier (éditeur). Il ne supprime jamais rien.' },
]);

/** Mode d'emploi à la racine (espace de Jérôme) : connexion par compte Google, trois lignes (docs/mcp-oauth.md). Ni jeton ni secret. */
export const MODE_EMPLOI_RACINE = Object.freeze([
  { titre: 'Colle le lien', texte: 'Dans Claude : Paramètres, Connecteurs, « Ajouter un connecteur personnalisé ». Colle le lien ci-dessus.' },
  { titre: 'Connecte-toi avec Google', texte: 'Une fenêtre de Google s\'ouvre : choisis ton compte Google autorisé. Un autre compte est refusé.' },
  { titre: 'Autorise', texte: 'Clique sur « Autoriser » : ton IA peut alors consulter et modifier tes fiches. Retirer le connecteur dans Claude ne coupe pas l\'autorisation côté serveur : demande à Jérôme de la couper.' },
]);

export const PHRASE_COMPTES_RACINE = 'Les comptes autorisés sont fixés par Jérôme.';

/** Membres rangés par adresse, avec le libellé de leur rôle ; un rôle inconnu est écarté (le serveur le refuserait aussi). */
export function lignesMembres(documents, emailCourant = '') {
  const moi = String(emailCourant || '').toLowerCase();
  return (documents ?? [])
    .filter((d) => d && typeof d.id === 'string' && Object.hasOwn(LIBELLES_ROLE, d.role))
    .map((d) => ({ email: d.id, nom: typeof d.nom === 'string' ? d.nom : '', role: d.role, libelle: LIBELLES_ROLE[d.role], moi: d.id.toLowerCase() === moi }))
    .sort((a, b) => a.email.localeCompare(b.email, 'fr'));
}
