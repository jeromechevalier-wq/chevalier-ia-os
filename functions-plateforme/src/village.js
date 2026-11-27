// Or du village chez les clients (27/11/2026, étape 6a de docs/accueil-village.md) : la fonction appelable `villageOr`, même cœur que chez Jérôme (serveur/src/coeur/village-or.js).
// Le client reçu est une CIBLE à vérifier, jamais une confiance : l'appelant doit être membre du client (clients/<client>/membres/<son e-mail>), éditeur ou lecteur.
// Tout s'écrit sous clients/<client>/. Lecteur : il a un village mais ne gagne pas d'or (décision de Jérôme) : réponse « lecture_seule », rien n'est lu ni écrit.
// Pas de base des achats sur la plateforme : la source « facture validée » répond « indisponible » (.github/A-FAIRE.md). Aucun module exigé : le jeu est à part.
import { creerVillageOr } from '../serveur/src/coeur/village-or.js';
import { Refus } from './appels.js';
import { MOTIF_IDENTIFIANT_CLIENT } from './etiquettes.js';
import { emailDe } from './devis.js';

const REFUS_NEUTRE = () => new Refus('permission-denied', 'Action non autorisée.');
const ROLES = ['editeur', 'lecteur'];

/** `donnees` : { client, action, source, id, projetId }. Rend la réponse du cœur ({ ok, gagne, or?, raison? }) ou lève un Refus. */
export async function villageOrClient({ db, auth, donnees, horodatage, maintenant = Date.now }) {
  const email = emailDe(auth);
  const d = donnees && typeof donnees === 'object' ? donnees : {};
  const { client } = d;
  if (typeof client !== 'string' || !MOTIF_IDENTIFIANT_CLIENT.test(client)) throw new Refus('invalid-argument', 'Demande invalide.');
  if (client === 'interne') throw REFUS_NEUTRE(); // « interne » est réservé à Jérôme
  const membre = await db.doc(`clients/${client}/membres/${email}`).get();
  const role = membre.exists ? membre.get('role') : null;
  if (!ROLES.includes(role)) throw REFUS_NEUTRE();
  if (d.action !== 'gain') throw new Refus('invalid-argument', 'Demande invalide.');
  return creerVillageOr({ db, racine: `clients/${client}/`, horodatage, maintenant })
    .gain({ uid: auth.uid, acteur: email, source: d.source, id: d.id, projetId: d.projetId, lectureSeule: role === 'lecteur' });
}
