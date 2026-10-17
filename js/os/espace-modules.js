// Écrans d'un client (chantier 7) : après la connexion, la page #/espace/<client> montre le menu et les écrans des SEULS modules actifs
// de ce client (registre.js), avec ses données sous clients/<client>/… (cheminBaseClient). Un module non actif n'est ni chargé ni
// accessible, même par son adresse directe : sa route affiche « page introuvable ». Les routes des modules sont #/espace/<client>/crm/…
// (le préfixe est géré par router.js). Ce fichier ne lit pas Firestore lui-même (les modules le font, sous leur chemin de base) ;
// la vraie protection reste dans les règles (firestore.plateforme.rules).
import { MODULES_CLIENT } from './modules.js';
import { cheminBaseClient } from './chemins.js';
import { moduleAccessible, premiereRoute, routeModernisee } from './registre.js';
import { definirPrefixe, routeCourante, segments, surChangementRoute, naviguer, lien, suivreLiensDuPrefixe } from './router.js';
import { monterCoquille } from './shell.js';
import { monterReglages } from './reglages.js';
import { definirChezClient, definirLogoEspace } from './contexte.js';
import { appliquerIdentite } from './identite.js';
import { normaliserMarque } from './marque.js';
import { h, icone, vider, remplir } from './ui.js';

/**
 * Monte les modules actifs d'un client. Renvoie une fonction `fermer()` (déconnexion ou changement de compte).
 * `actifs` doit venir de modulesActifsDuClient() : au moins un module, dépendances respectées.
 */
export async function ouvrirEspaceModules(racine, { client, marque, compte, actifs, equipe = null, fiche = null, surDeconnexion }) {
  const modules = MODULES_CLIENT.filter((m) => actifs.includes(m.id)); // ordre de démarrage du registre (affaires avant projets)
  const apis = new Map();
  for (const m of modules) apis.set(m.id, await m.monter());
  const base = cheminBaseClient(client);
  definirPrefixe(`espace/${client}`);
  for (const api of apis.values()) api.demarrer({ compte, cheminBase: base, equipe, nomEspace: marque?.nom || '' }); // equipe : membres de l'espace (fiche du client), pour « Confiée à »
  document.body.classList.remove('page-espace');
  appliquerIdentite(marque, client); // titre, icône, appli installée et accent de l'interface = ceux du client
  definirChezClient(true); // masque ce qui est personnel à Jérôme (Charles, sauvegarde, GitHub…) ; les célébrations n'y existent qu'avec leur option, et l'image de Charles n'y est jamais
  definirLogoEspace(marque.logo); // le logo de l'espace peut servir d'image aux célébrations (lu en direct, jamais recopié)
  const accueil = premiereRoute(actifs);
  const coquille = monterCoquille(racine, compte, { apis, modules, client: { nom: marque.nom, logo: marque.logo }, accueil, surDeconnexion });
  /** Un éditeur vient d'enregistrer nom, couleur ou logo : tout ce qui est visible se met à jour tout de suite, sans recharger (les autres appareils au prochain chargement). */
  const surMarque = (nouvelle) => {
    Object.assign(marque, normaliserMarque({ actif: true, ...nouvelle }) ?? nouvelle); // mêmes formes que la marque lue à l'ouverture (images : { url, alt })
    appliquerIdentite(marque, client);
    definirLogoEspace(marque.logo);
    coquille.majClient({ nom: marque.nom, logo: marque.logo });
  };
  let vue = null; // { cle, quitter }
  const arretLiens = suivreLiensDuPrefixe();

  function afficherRoute(route) {
    const modernisee = routeModernisee(route); // ancien lien #/espace/<client>/journal/… -> automatisations/… (renommage du 16/10/2026)
    if (modernisee !== route) { naviguer(modernisee, { remplacer: true }); return; }
    const segs = segments(route);
    if (!segs.length) { naviguer(accueil, { remplacer: true }); return; }
    if (segs[0] === 'reglages') { // page Réglages de l'espace : toujours accessible, quels que soient les modules actifs
      if (vue?.cle !== 'reglages') {
        vue?.quitter?.();
        vider(coquille.contenu);
        vue = { cle: 'reglages', quitter: null };
      }
      vue.quitter = monterReglages(coquille.contenu, segs, { apis, actifs, chezClient: true, client, nomEspace: marque.nom, marque, fiche, compte, surMarque, surDeconnexion });
      coquille.activer(segs.join('/'));
      return;
    }
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
    definirLogoEspace(null);
  };
}
