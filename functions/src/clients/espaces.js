// Lecture de l'espace d'un client dans la base de la plateforme : fiche de marque (client actif ?), fiche du client (modules allumés), fiche de membre (rôle).
// Les lectures se font avec les droits d'administration, donc sans les règles Firestore : TOUT passe par ces trois fonctions, qui fixent elles-mêmes
// les chemins (marques/<client>, clients/<client>, clients/<client>/membres/<e-mail>) à partir d'un identifiant déjà validé.
import { FORMAT_CLIENT, MODULE_MCP } from './config.js';
import { modulesActifsDuClient } from '../../partage/registre.js';
import { normaliserMarque } from '../../partage/marque.js';
import { ROLES, emailNormalise } from '../../partage/membres.js';

export function creerEspaces({ donnees }) {
  return {
    /**
     * L'espace s'il peut servir le MCP : client connu ET actif (fiche de marque active) ET module « mcp » allumé (et ses dépendances). Sinon null,
     * sans dire pourquoi (client inconnu, désactivé ou module éteint : même résultat).
     */
    async charger(client) {
      if (typeof client !== 'string' || !FORMAT_CLIENT.test(client)) return null;
      const marque = normaliserMarque(await donnees.document('marques', client));
      if (!marque) return null;
      const { actifs } = modulesActifsDuClient(await donnees.document('clients', client));
      if (!actifs.includes(MODULE_MCP)) return null;
      return { client, marque, actifs };
    },

    /** Rôle de ce compte dans ce client (« lecteur » ou « editeur ») ou null. Un rôle inconnu = pas membre. */
    async membre(client, email) {
      const e = emailNormalise(email);
      if (typeof client !== 'string' || !FORMAT_CLIENT.test(client) || !e || !e.includes('@') || e.includes('/') || e.length > 320) return null;
      const fiche = await donnees.document(`clients/${client}/membres`, e);
      return fiche && Object.hasOwn(ROLES, fiche.role) ? { role: fiche.role, nom: fiche.nom ?? null } : null;
    },
  };
}
