// Onglet « Devis » de la fiche d'une affaire (inscrit par le module Devis quand il démarre ; éteint, il n'y a pas d'onglet).
// Montre tous les devis de l'affaire (brouillons et « Remplacé » compris, archivés exclus) comme l'onglet Documents : le nom du devis est un lien qui l'ouvre, le total et la date dessous.
// Ni bouton ni crayon ni croix : le PDF et son téléchargement se trouvent dans le devis (menu « … ») puis sur l'écran du PDF. Jamais de suppression ici (un devis finalisé s'archive).
// Les règles sont dans onglet-affaire-logique.js (pur, testé).
// Le fournisseur est appelé à chaque redessin de la fiche : il garde UN élément par affaire et ne change que son contenu, et seulement si quelque chose a changé.
import { h, icone, remplir, toast } from '../../os/ui.js';
import { lien as lienRoute, naviguer } from '../../os/router.js';
import { ligneAjouter } from '../crm/composants.js';
import * as CRM from '../crm/donnees.js';
import * as D from './donnees.js';
import * as Li from './liste.js';
import { formaterMontant } from './document.js';
import { pastilleStatutDevis } from './pastille-statut.js';
import { indicateurPdf } from './pdf-indicateur.js';
import { etatPdfDevis } from './pdf.js';
import { clientsDeAffaire } from './editeur-ecran.js';
import { valeursDeCreation } from './editeur-logique.js';
import { ERREUR_ECRITURE } from './actions-devis.js';
import * as P from './onglet-affaire-logique.js';

const elements = new Map(); // affaireId -> { racine, maj, signature }
const enCreation = new Set(); // identifiants des affaires dont un brouillon est en cours de création

/** À appeler quand le module s'arrête : l'élément d'une affaire ne doit pas survivre à une nouvelle session. */
export function oublierOnglets() { elements.clear(); enCreation.clear(); }

const euros = (n) => (typeof n === 'number' ? formaterMontant(n) : '—');
const enMsCle = (d) => Li.enMs(d?.creeLe) ?? Li.enMs(d?.finaliseLe) ?? 0;

export async function ajouterDevis(affaireId) {
  if (enCreation.has(affaireId)) return;
  const affaire = CRM.affaire(affaireId);
  if (!affaire) return;
  enCreation.add(affaireId);
  try {
    const r = await D.creerBrouillon(valeursDeCreation(affaire, clientsDeAffaire(affaire)[0] ?? null));
    if (!r.id) throw new Error(Object.values(r.erreurs)[0] || ERREUR_ECRITURE);
    naviguer(`devis/editeur/${r.id}`);
  } catch (e) {
    console.warn(e?.code ?? '', e?.message ?? '');
    toast(ERREUR_ECRITURE, { type: 'erreur', duree: 8000 });
  } finally {
    enCreation.delete(affaireId);
  }
}

function ligne(d, { aujourdhui, apres }) {
  const t = Li.totauxDe(d);
  const brouillon = d.statut === 'brouillon';
  const etat = etatPdfDevis(d);
  const indicateur = !brouillon && etat !== 'pret' ? indicateurPdf(d, { apres }) : null; // « en cours » et « non rangé » seulement : un PDF prêt s'ouvre depuis le devis
  const nom = d.objet ? `${P.intituleDevis(d)} – ${d.objet}` : P.intituleDevis(d);
  return h('li', { class: 'ligne-lien', dataset: { devis: d.id, statut: Li.statutAffiche(d, aujourdhui) } },
    icone('file-text', { taille: 14 }),
    h('div', { class: 'lien-texte' },
      h('span', { class: 'devis-onglet-titre' },
        h('a', { href: lienRoute(P.routeVoirDevis(d)), 'aria-label': P.nomVoir(d), dataset: { action: 'voir-devis' } }, nom),
        pastilleStatutDevis(d, aujourdhui)),
      h('span', { class: 'lien-date' },
        h('span', { dataset: { valeur: 'ttc' } }, `${euros(t?.ttc)} TTC`),
        Li.dateFr(Li.dateDuDevis(d)) ? ' · ' : null,
        Li.dateFr(Li.dateDuDevis(d)) ? h('span', { dataset: { valeur: 'date' } }, Li.dateFr(Li.dateDuDevis(d))) : null),
      indicateur));
}

function creerElement(affaireId) {
  const racine = h('div', { class: 'onglet-devis', dataset: { section: 'affaire-devis' } });
  const e = { racine, signature: null, maj: null };
  e.maj = (force = false) => {
    const pret = D.estPretDevis();
    const erreur = D.etat.erreurLectureDevis === true;
    const aujourdhui = CRM.ctx().aujourdhui;
    const lignes = P.devisDeAffaire(D.etat.devis, affaireId);
    const maintenant = Date.now();
    const signature = JSON.stringify([pret, erreur, aujourdhui, lignes.map((d) => [d.id, d.numero, d.version, d.statut, d.objet, d.dateEmission, enMsCle(d), d.totaux, d.expireLe, etatPdfDevis(d, maintenant)])]);
    if (!force && signature === e.signature) return lignes;
    e.signature = signature;
    const apres = () => e.maj(true);
    const corps = [];
    if (erreur) corps.push(h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'lecture-devis' } }, P.ERREUR_LECTURE_ONGLET));
    if (!pret && !erreur) {
      corps.push(h('div', { class: 'chargement', role: 'status', dataset: { etat: 'chargement' } }, h('span', { class: 'rond-chargement', 'aria-hidden': 'true' }), P.LIBELLE_CHARGEMENT));
    } else {
      corps.push(ligneAjouter({ libelle: 'Devis', libelleAria: 'Ajouter un devis', action: 'ajouter-devis', surClic: () => ajouterDevis(affaireId) }));
      if (pret && !lignes.length) corps.push(h('p', { class: 'texte-discret', dataset: { role: 'aucun-devis' } }, P.LIBELLE_VIDE));
      else if (lignes.length) corps.push(h('ul', { class: 'liste-liens', dataset: { liste: 'devis-affaire' } }, lignes.map((d) => ligne(d, { aujourdhui, apres }))));
    }
    // Le redessin remplace les éléments : le focus clavier revient sur le bouton qui l'avait (même devis, même action).
    const actif = document.activeElement;
    const ancien = actif && racine.contains(actif) ? { devis: actif.closest('[data-devis]')?.dataset.devis, action: actif.dataset.action } : null;
    remplir(racine, ...corps);
    if (ancien?.action && (!document.activeElement || document.activeElement === document.body)) {
      const cible = [...racine.querySelectorAll('[data-action]')].find((n) => n.dataset.action === ancien.action && (n.closest('[data-devis]')?.dataset.devis ?? undefined) === ancien.devis);
      cible?.focus();
    }
    return lignes;
  };
  return e;
}

/** Fournisseur pour `inscrireOngletAffaire` : null sans affaire ; sinon l'onglet « Devis » (un seul élément par affaire, mis à jour sur place). */
export function ongletDevisDeAffaire(affaireId) {
  if (!affaireId) return null;
  let e = elements.get(affaireId);
  if (!e) { e = creerElement(affaireId); elements.set(affaireId, e); }
  const lignes = e.maj();
  return { id: 'devis', libelle: 'Devis', icone: 'file-text', element: e.racine, compteur: P.compteurOnglet(lignes, D.estPretDevis()) };
}
