// Écran « coquille » commun aux modules Achats (24/11/2026) : titre + état de l'accès à la base. Aucune donnée métier dans cette étape.
// Cinq cas (sans défilement horizontal, ordinateur comme téléphone) : chargement, accès prêt, connexion non réglée (avec le lien vers le réglage),
// badge sans la mention d'accès (« Reconnecte-toi », avec « Revérifier »), réglages illisibles (avec « Réessayer »).
import { h, icone, remplir, vider } from '../../os/ui.js';
import { naviguer, lien } from '../../os/router.js';
import { verifierAcces } from '../../os/acces-base.js';
import { texteAcces, TEXTE_CHARGEMENT, TEXTE_PAS_DE_DONNEE } from './etat.js';

const ICONES = { connecte: 'circle-check', 'non-regle': 'link', reconnexion: 'triangle-alert', illisible: 'triangle-alert' };

/** Dessine l'état dans `zone`. `relancer` : relit l'accès (boutons « Revérifier » et « Réessayer »). */
function dessiner(zone, etat, relancer) {
  const enAlerte = etat === 'reconnexion' || etat === 'illisible';
  const bouton = (libelle, forcer = false) => h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer' }, onclick: () => relancer(forcer) }, icone('refresh-cw', { taille: 16 }), libelle);
  remplir(zone, h('section', { class: 'carte-section', role: enAlerte ? 'alert' : 'status', dataset: { role: 'achats-etat', etat } },
    h('p', { class: enAlerte ? 'mon-espace-erreur' : '', style: { display: 'flex', alignItems: 'flex-start', flexWrap: 'nowrap', gap: 'var(--esp-4)' } },
      h('span', { style: { flex: 'none', display: 'inline-flex' } }, icone(ICONES[etat] ?? 'triangle-alert', { taille: 18 })), h('span', { dataset: { role: 'achats-etat-texte' } }, texteAcces(etat))),
    etat === 'connecte' ? h('p', { class: 'aide' }, TEXTE_PAS_DE_DONNEE) : null,
    etat === 'non-regle' ? h('a', { class: 'bouton bouton-secondaire', href: lien('reglages/base') }, icone('chevron-right', { taille: 16 }), 'Ouvrir la connexion à la base') : null,
    etat === 'reconnexion' ? bouton('Revérifier', true) : null,
    etat === 'illisible' ? bouton('Réessayer') : null));
}

/** Monte l'écran d'état dans `conteneur`. Rend la fonction d'arrêt (la réponse tardive d'un écran quitté est ignorée). */
export function rendreEcranEtat(conteneur, { titre, aide = '' }) {
  const zone = h('div', { dataset: { role: 'achats-zone' } });
  vider(conteneur);
  conteneur.append(h('div', { class: 'page', dataset: { module: 'achats' } },
    h('header', { class: 'page-tete' }, h('h1', {}, titre)),
    aide ? h('p', { class: 'aide' }, aide) : null,
    zone));
  let vivant = true;
  const lancer = async (forcer = false) => {
    remplir(zone, h('div', { class: 'chargement-bloc', role: 'status', dataset: { etat: 'chargement' } }, h('span', { class: 'rond-chargement' }), h('span', { class: 'aide' }, TEXTE_CHARGEMENT)));
    let etat = 'illisible';
    try { etat = (await verifierAcces(forcer)).etat; } catch (e) { console.warn('Accès à la base : vérification impossible', e?.code ?? e?.message); }
    if (vivant) dessiner(zone, etat, lancer);
  };
  lancer(false);
  return () => { vivant = false; };
}

/**
 * Fabrique les fonctions d'affichage d'un module à un seul écran (contrat de js/os/modules.js) : toute autre adresse du module renvoie vers cet écran.
 * `route` : « <prefixe>/<ecran> » ; `titre`, `aide` : textes de l'écran.
 */
export function creerCoquille({ route, titre, aide }) {
  const ecran = route.split('/')[1];
  let montee = null;
  const quitter = () => { montee?.(); montee = null; };
  return {
    arreter: quitter,
    afficher(conteneur, segs) {
      if (segs[0] !== ecran) { naviguer(route, { remplacer: true }); return quitter; }
      quitter();
      montee = rendreEcranEtat(conteneur, { titre, aide });
      conteneur.scrollTop = 0;
      return quitter;
    },
  };
}
