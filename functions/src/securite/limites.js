// Plafonds par jeton (plan-mcp.md 5.4) : un agent qui boucle, ou un jeton volé, est freiné.
//  - requêtes par minute : compteur en MÉMOIRE de l'instance (aucune écriture Firestore par lecture). Avec 3 instances au plus, le plafond
//    réel est donc de 3 fois la valeur affichée au pire ; c'est un frein grossier, pas une garantie ;
//  - écritures par heure et suppressions par jour : compteurs dans Firestore (collection mcp_limites, un document par jeton), exacts quel que
//    soit le nombre d'instances. « Une écriture » = un appel d'outil qui écrit (quel que soit le nombre de documents touchés) ; les suppressions
//    se comptent PAR DOCUMENT supprimé (une suppression en cascade peut en toucher jusqu'à 1000), restaurations qui suppriment comprises. La réservation est faite JUSTE AVANT l'écriture, une fois l'appel validé : un appel refusé pour une
//    erreur de saisie ne consomme rien.
// Les valeurs par défaut se règlent jeton par jeton dans le secret MCP_JETONS (champ facultatif `limites`).
import { COLLECTIONS as C } from '../coeur/donnees.js';
import * as L from '../../partage/logique.js';

export const LIMITES_PAR_DEFAUT = Object.freeze({ requetesParMinute: 120, ecrituresParHeure: 500, suppressionsParJour: 50 });
const CLES = Object.keys(LIMITES_PAR_DEFAUT);

/** Limites d'un jeton : ses valeurs si ce sont des entiers positifs raisonnables, sinon les valeurs par défaut. */
export function limitesDuJeton(entree) {
  const voulues = entree?.limites && typeof entree.limites === 'object' ? entree.limites : {};
  return Object.fromEntries(CLES.map((k) => [k, Number.isInteger(voulues[k]) && voulues[k] > 0 && voulues[k] <= 100_000 ? voulues[k] : LIMITES_PAR_DEFAUT[k]]));
}

/** Plafond atteint : `limite` nomme le plafond, `reessayerDansS` dit quand il se libère. */
export class ErreurLimite extends Error {
  constructor(limite, plafond, reessayerDansS, demande = 1) {
    const quoi = { requetes_minute: `${plafond} requêtes par minute`, ecritures_heure: `${plafond} écritures par heure`, suppressions_jour: `${plafond} suppressions par jour` }[limite];
    const delai = reessayerDansS >= 3600 ? `${Math.ceil(reessayerDansS / 3600)} h` : reessayerDansS >= 90 ? `${Math.ceil(reessayerDansS / 60)} min` : `${reessayerDansS} s`;
    const detail = limite === 'suppressions_jour' && demande > 1 ? ` Cette opération supprimerait ${demande} documents${demande > plafond ? ' (plus que le plafond : à faire en plusieurs fois, ou depuis l’écran)' : ''}.` : '';
    super(`Plafond atteint pour ce jeton : ${quoi}.${detail} Réessayer dans ${delai}.`);
    this.name = 'ErreurLimite';
    this.code = 'limite_depassee';
    this.limite = limite;
    this.plafond = plafond;
    this.reessayerDansS = reessayerDansS;
  }
}

export function creerLimiteur({ donnees, maintenant = () => Date.now() }) {
  const minutes = new Map(); // jeton -> { fenetre, n }

  return {
    /** Une requête de plus pour ce jeton : lève ErreurLimite au-delà du plafond de la minute en cours. */
    requete(jeton, limites) {
      const t = maintenant();
      const fenetre = Math.floor(t / 60_000);
      const compteur = minutes.get(jeton);
      const n = compteur && compteur.fenetre === fenetre ? compteur.n + 1 : 1;
      if (minutes.size > 1000) for (const [cle, c] of minutes) if (c.fenetre < fenetre) minutes.delete(cle);
      if (n > limites.requetesParMinute) throw new ErreurLimite('requetes_minute', limites.requetesParMinute, Math.max(1, Math.ceil(((fenetre + 1) * 60_000 - t) / 1000)));
      minutes.set(jeton, { fenetre, n });
    },

    /** Suppressions encore permises aujourd'hui (jour de Paris) pour ce jeton ; lecture seule, ne compte rien. */
    async suppressionsRestantes(jeton, limites) {
      const courant = await donnees.document(C.limites, jeton);
      const jour = L.aujourdhuiParis(new Date(maintenant()));
      const deja = courant?.jour?.fenetre === jour ? courant.jour.n : 0;
      return Math.max(0, limites.suppressionsParJour - deja);
    },

    /**
     * Réserve une écriture (et `suppressions` suppressions : le nombre de documents supprimés) avant d'écrire. Atomique entre instances.
     * Lève ErreurLimite si un plafond est atteint (rien n'est alors compté).
     */
    async reserver(jeton, limites, { suppressions = 0 } = {}) {
      const t = maintenant();
      const heure = Math.floor(t / 3_600_000);
      const jour = L.aujourdhuiParis(new Date(t));
      const r = await donnees.mettreAJour(C.limites, jeton, (courant) => {
        const h = courant?.heure?.fenetre === heure ? courant.heure.n : 0;
        const j = courant?.jour?.fenetre === jour ? courant.jour.n : 0;
        if (h + 1 > limites.ecrituresParHeure) return { ecrire: false, refus: { limite: 'ecritures_heure', plafond: limites.ecrituresParHeure, dans: Math.max(1, Math.ceil(((heure + 1) * 3_600_000 - t) / 1000)) } };
        if (suppressions > 0 && j + suppressions > limites.suppressionsParJour) {
          const prochainMinuit = L.versDate(`${L.ajouterJours(jour, 1)}T00:00`)?.getTime() ?? t + 86_400_000;
          return { ecrire: false, refus: { limite: 'suppressions_jour', plafond: limites.suppressionsParJour, dans: Math.max(1, Math.ceil((prochainMinuit - t) / 1000)), demande: suppressions } };
        }
        return { ecrire: true, donnees: { heure: { fenetre: heure, n: h + 1 }, jour: { fenetre: jour, n: j + suppressions } } };
      });
      if (r.refus) throw new ErreurLimite(r.refus.limite, r.refus.plafond, r.refus.dans, r.refus.demande);
    },
  };
}
