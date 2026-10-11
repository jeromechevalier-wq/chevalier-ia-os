// Écrans d'un client (chantier 7) : après la connexion, la page #/espace/<client> montre le menu et les écrans des SEULS modules actifs
// de ce client (registre.js), avec ses données sous clients/<client>/… (cheminBaseClient). Un module non actif n'est ni chargé ni
// accessible, même par son adresse directe : sa route affiche « page introuvable ». Les routes des modules sont #/espace/<client>/crm/…
// (le préfixe est géré par router.js). Ce fichier ne lit pas Firestore lui-même (les modules le font, sous leur chemin de base) ;
// la vraie protection reste dans les règles (firestore.plateforme.rules).
import { MODULES_CLIENT } from './modules.js';
import { cheminBaseClient } from './chemins.js';
import { moduleAccessible, premiereRoute } from './registre.js';
import { definirPrefixe, routeCourante, segments, surChangementRoute, naviguer, lien, suivreLiensDuPrefixe } from './router.js';
import { monterCoquille } from './shell.js';
import { definirChezClient } from './contexte.js';
import { appliquerIdentite } from './identite.js';
import { h, icone, vider, remplir } from './ui.js';

/**
 * Monte les modules actifs d'un client. Renvoie une fonction `fermer()` (déconnexion ou changement de compte).
 * `actifs` doit venir de modulesActifsDuClient() : au moins un module, dépendances respectées.
 */
export async function ouvrirEspaceModules(racine, { client, marque, compte, actifs, surDeconnexion }) {
  const modules = MODULES_CLIENT.filter((m) => actifs.includes(m.id)); // ordre de démarrage du registre (affaires avant projets)
  const apis = new Map();
  for (const m of modules) apis.set(m.id, await m.monter());
  const base = cheminBaseClient(client);
  definirPrefixe(`espace/${client}`);
  for (const api of apis.values()) api.demarrer({ compte, cheminBase: base });
  document.body.classList.remove('page-espace');
  appliquerIdentite(marque, client); // titre, icône, appli installée et accent de l'interface = ceux du client
  definirChezClient(true); // masque ce qui est personnel à Jérôme (Charles, célébrations, sauvegarde, GitHub…)
  const accueil = premiereRoute(actifs);
  const coquille = monterCoquille(racine, compte, { apis, modules, client: { nom: marque.nom, logo: marque.logo }, accueil, reglages: false, surDeconnexion });
  let vue = null; // { cle, quitter }
  const arretLiens = suivreLiensDuPrefixe();

  function afficherRoute(route) {
    const segs = segments(route);
    if (!segs.length) { naviguer(accueil, { remplacer: true }); return; }
    const m = modules.find((x) => x.prefixe === segs[0]);
    if (!m || !moduleAccessible(segs[0], actifs)) {
      vue?.quitter?.();
      vue = { cle: 'introuvable', quitter: null };
      vider(coquille.contenu);
      coquille.contenu.append(h('div', { class: 'page-introuvable' },
        h('h1', {}, 'Page introuvable'),
        h('p', { class: 'aide' }, "Cette page n'existe pas ou n'est pas disponible dans cet espace."),
        h('a', { class: 'bouton bouton-principal', href: lien(accueil) }, icone('house', { taille: 16 }), "Retour à l'accueil")));
      coquille.activer('');
      return;
    }
    const cle = `module:${m.id}`;
    if (vue?.cle !== cle) {
      vue?.quitter?.();
      vider(coquille.contenu);
      vue = { cle, quitter: null };
    }
    const quitter = apis.get(m.id).afficher(coquille.contenu, segs.slice(1), { compte, objectifs: false });
    if (typeof quitter === 'function') vue.quitter = quitter;
    coquille.activer(segs.join('/'));
  }

  const arretRoute = surChangementRoute(afficherRoute);
  afficherRoute(routeCourante());

  return function fermer() {
    arretRoute();
    arretLiens();
    vue?.quitter?.();
    coquille.arreter?.();
    for (const api of apis.values()) api.arreter();
    definirPrefixe('');
    definirChezClient(false);
  };
}
