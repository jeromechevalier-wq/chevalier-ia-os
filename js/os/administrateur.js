// Rôle « administrateur » : réservé au compte de Jérôme (pas à son compte d'assistant, qui reste autorisé dans le CRM mais ne voit pas les clients).
// Il débloque, dans l'écran Automatisations de Chevalier IA OS, la vue de TOUS les propriétaires (lecture seule). Un seul endroit pour la liste :
// l'écran et le serveur (fonction `automatisationsAdmin`, copie générée dans functions/partage/) lisent ce même fichier. Aucune dépendance.

export const ADMINISTRATEURS = Object.freeze(['jerome.chevalier@gmail.com']);

/** Vrai pour le compte de Jérôme, e-mail VÉRIFIÉ. `email` : tel que Firebase le donne (la casse est ignorée). */
export function estAdministrateur(email, emailVerifie = true) {
  return emailVerifie === true && typeof email === 'string' && ADMINISTRATEURS.includes(email.trim().toLowerCase());
}
