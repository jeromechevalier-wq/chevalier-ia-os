// Or du village chez les clients (27/11/2026, étapes 6a, 6b et 7 de docs/accueil-village.md) : la fonction appelable `villageOr`, même cœur que chez Jérôme (serveur/src/coeur/village-or.js).
// Le client reçu est une CIBLE à vérifier, jamais une confiance : l'appelant doit être membre du client (clients/<client>/membres/<son e-mail>), éditeur ou lecteur.
// Tout s'écrit sous clients/<client>/. Lecteur : il a un village mais ne gagne pas d'or, n'achète rien et ne récolte rien (décision de Jérôme) : réponse « lecture_seule », rien n'est lu ni écrit.
// Pas de base des achats sur la plateforme : la source « facture validée » répond « indisponible » (.github/A-FAIRE.md). Aucun module exigé : le jeu est à part.
import { creerVillageOr } from '../serveur/src/coeur/village-or.js';
import { Refus } from './appels.js';
import { MOTIF_IDENTIFIANT_CLIENT } from './etiquettes.js';
import { emailDe } from './devis.js';

const REFUS_NEUTRE = () => new Refus('permission-denied', 'Action non autorisée.');
const ROLES = ['editeur', 'lecteur'];

/** `donnees` : { client, action, source, id, projetId } (gain), { client, action, article, modele, c, l } (achat, 6b) ou { client, action, objet } (récolte, 7). Rend la réponse du cœur ou lève un Refus. */
export async function villageOrClient({ db, auth, donnees, horodatage, maintenant = Date.now }) {
  const email = emailDe(auth);
  const d = donnees && typeof donnees === 'object' ? donnees : {};
  const { client } = d;
  if (typeof client !== 'string' || !MOTIF_IDENTIFIANT_CLIENT.test(client)) throw new Refus('invalid-argument', 'Demande invalide.');
  if (client === 'interne') throw REFUS_NEUTRE(); // « interne » est réservé à Jérôme
  const membre = await db.doc(`clients/${client}/membres/${email}`).get();
  const role = membre.exists ? membre.get('role') : null;
  if (!ROLES.includes(role)) throw REFUS_NEUTRE();
  if (!['gain', 'acheter', 'ramasser'].includes(d.action)) throw new Refus('invalid-argument', 'Demande invalide.');
  const service = creerVillageOr({ db, racine: `clients/${client}/`, horodatage, maintenant });
  if (d.action === 'acheter') {
    return service.acheter({ uid: auth.uid, article: d.article, modele: d.modele, c: d.c, l: d.l, lectureSeule: role === 'lecteur' });
  }
  if (d.action === 'ramasser') {
    return service.ramasser({ uid: auth.uid, objet: d.objet, lectureSeule: role === 'lecteur' });
  }
  return service
    .gain({ uid: auth.uid, acteur: email, source: d.source, id: d.id, projetId: d.projetId, lectureSeule: role === 'lecteur' });
}
