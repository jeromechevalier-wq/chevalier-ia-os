// Lecture des éléments des petites maisons du village (étape 3c, 27/11/2026) : le SEUL fichier du village qui charge du code d'un module (chantiers, projets).
// Règle « chaque module utilisable seul » : le code d'un module n'est chargé que par import() dynamique, et seulement si ce module est allumé pour la session
// (préfixes passés par js/main.js) ; l'écran ne demande une lecture que si une grande maison visible pointe vers ce module.
// Une lecture par affichage du village et par module, avec le délai et le repli des compteurs (js/os/village-compteurs.js : 20 s) ; jamais d'exception :
// { etat: 'ok', liste } ou { etat: 'erreur' } (panne, refus, trop lent, module absent). Pannes simulées (émulateurs seulement) :
// window.__chevalierTest.pannesPetites = { lecture: n } fait échouer les n prochaines lectures.
import { MODE_EMULATEURS } from './firebase.js';
import { clientBase, actionsBase, connexionPrete } from './acces-base.js';
import { avecDelai } from './maison-village.js';
import { DELAI_COMPTEUR } from './village-compteurs.js';
import { SOURCES_PETITES } from './village-petites.js';

/** Vrai (et le compteur baisse) si une panne simulée de lecture est demandée par un test. N'existe qu'avec les émulateurs. */
function pannePosee() {
  if (!MODE_EMULATEURS) return false;
  const p = window.__chevalierTest?.pannesPetites;
  if (!p || !(p.lecture > 0)) return false;
  p.lecture -= 1;
  return true;
}

/**
 * Projets : la liste tenue par le module (même instance que le module démarré par la coque) ; on attend qu'elle soit prête, puis on se désabonne.
 * `poserArret(f)` : donne au lecteur la fonction de désabonnement, appelée aussi quand le délai est dépassé.
 */
async function lireProjets(poserArret) {
  const donnees = await import('../modules/projets/donnees.js');
  const logique = await import('../modules/projets/logique.js');
  if (!donnees.etat.pret) {
    let arret = null;
    try {
      await new Promise((resolu) => {
        arret = donnees.surChangement(() => { if (donnees.etat.pret) resolu(); });
        poserArret(arret);
        if (donnees.etat.pret) resolu();
      });
    } finally {
      arret?.();
    }
  }
  return logique.elementsVillage(donnees.etat.projets);
}

const LECTURES = {
  achatschantiers: async () => {
    await connexionPrete();
    const { creerDonnees } = await import('../modules/achatschantiers/donnees.js');
    const { elementsVillage } = await import('../modules/achatschantiers/logique.js');
    const r = await creerDonnees({ client: clientBase, actions: actionsBase }).chargerChantiers(); // liste tronquée : on garde ce qui est lu
    return elementsVillage(r.chantiers);
  },
  projets: lireProjets,
};

/** `modules` : les préfixes des modules allumés pour la session. Rend { sources, lire(module) } ; `sources` = les modules qui savent filtrer ET sont allumés. */
export function creerPetitesVillage({ modules = [], delai = DELAI_COMPTEUR } = {}) {
  const sources = Object.keys(SOURCES_PETITES).filter((m) => modules.includes(m) && Object.hasOwn(LECTURES, m));
  async function lire(module) {
    if (!sources.includes(module)) return { etat: 'erreur' };
    try {
      if (pannePosee()) throw new Error('panne simulée');
      let arret = null;
      let fini = false;
      // trop lent : null ; la lecture des projets se désabonne à l'arrivée comme au délai, même si son abonnement arrive APRÈS le délai
      const poserArret = (f) => { if (fini) f(); else arret = f; };
      let liste;
      try {
        liste = await avecDelai(() => LECTURES[module](poserArret), delai);
      } finally {
        fini = true;
        arret?.();
      }
      return Array.isArray(liste) ? { etat: 'ok', liste } : { etat: 'erreur' };
    } catch (e) {
      console.warn('Accueil : éléments des petites maisons illisibles', module, e?.code ?? e?.message);
      return { etat: 'erreur' };
    }
  }
  return { sources, lire };
}
