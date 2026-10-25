// Écran « Ouvrir le PDF » d'un devis : routes devis/pdf/<id> (PDF du devis finalisé) et devis/pdf/<id>/brouillon (PDF filigrané du brouillon).
// L'adresse est STABLE (le document de l'affaire pointe dessus) : l'écran demande à chaque ouverture un lien signé de 5 minutes à `devisPdfLien`, puis ouvre le PDF.
// Choix contre les bloqueurs de fenêtres : le PDF s'ouvre dans un NOUVEL onglet (l'application n'est jamais remplacée : la touche « retour » ne boucle pas) ; si le navigateur
// refuse cette ouverture automatique, le bouton « Ouvrir le PDF » (un vrai lien, toujours affiché) la remplace.
// Aucune règle ici : états et messages viennent de pdf.js (pur, testé) ; rien n'est écrit par le navigateur.
import { h, icone, remplir } from '../../os/ui.js';
import { etatVide } from '../crm/composants.js';
import * as D from './donnees.js';
import { etatPdfDevis } from './pdf.js';

export const MESSAGE_INTROUVABLE_PDF = 'Ce devis est introuvable. Il a peut-être été supprimé : retourne à la liste des devis.';
export const MESSAGE_EN_COURS = 'Le PDF est en cours de fabrication. Réessaie dans quelques instants.';
export const MESSAGE_ECHEC = 'La fabrication du PDF a échoué. Appuie sur « Réessayer » pour la relancer.';
export const MESSAGE_PAS_PRET = 'Le PDF de ce devis n’est pas encore prêt. Appuie sur « Réessayer » pour le fabriquer.';
export const MESSAGE_PAS_DE_BROUILLON = 'Aucun PDF brouillon pour ce devis. Ouvre le devis et appuie sur « Enregistrer PDF » pour le créer.';
export const MESSAGE_BROUILLON_FINALISE = 'Ce devis n’est plus un brouillon. Ouvre son PDF depuis la liste des devis.';

/** `brouillon` : true pour la route …/brouillon. Rend la fonction d'arrêt. */
export function rendrePdfDevis(conteneur, devisId, brouillon = false) {
  const zone = h('div', { class: 'pdf-devis-corps', role: 'status', 'aria-live': 'polite', dataset: { zone: 'pdf-devis' } });
  const retour = h('a', { class: 'lien-retour', href: '#/devis/liste', dataset: { action: 'retour-liste' } }, icone('chevron-left', { taille: 16 }), 'Devis');
  conteneur.append(h('div', { class: 'page page-devis page-pdf-devis' }, retour, h('h1', {}, brouillon ? 'PDF brouillon du devis' : 'PDF du devis'), zone));

  let arrete = false;
  let numero = 0; // une demande plus récente annule l'affichage de la précédente
  let dejaOuvert = false; // un seul onglet ouvert automatiquement par affichage de cet écran

  const bouton = (libelle, action, onclick) => h('button', { type: 'button', class: 'bouton bouton-principal', dataset: { action }, onclick }, libelle);
  const montrer = (etat, ...enfants) => { zone.dataset.etat = etat; remplir(zone, ...enfants); };
  const chargement = (texte) => montrer('chargement', h('div', { class: 'chargement' }, h('span', { class: 'rond-chargement' }), h('span', {}, texte)));
  const probleme = (etat, texte, ...actions) => montrer(etat, h('p', { class: etat === 'echec' ? 'erreur' : 'texte-discret', role: etat === 'echec' ? 'alert' : null, dataset: { valeur: 'message-pdf' } }, texte), h('div', { class: 'pdf-devis-actions' }, ...actions));
  const introuvable = () => montrer('introuvable', etatVide(MESSAGE_INTROUVABLE_PDF, { action: h('a', { class: 'bouton bouton-secondaire', href: '#/devis/liste', dataset: { action: 'retour-liste-introuvable' } }, 'Retour aux devis') }));
  const lienEditeur = h('a', { class: 'bouton bouton-principal', href: `#/devis/editeur/${encodeURIComponent(devisId)}`, dataset: { action: 'ouvrir-editeur' } }, 'Ouvrir le devis');

  async function relancer() {
    const moi = ++numero;
    chargement('Fabrication du PDF en cours…');
    try { await D.pdfDevis(devisId); } catch (e) { if (!arrete && moi === numero) probleme('echec', e?.message || D.MESSAGE_RESEAU_DEVIS, bouton('Réessayer', 'reessayer-pdf', relancer)); return; }
    if (!arrete && moi === numero) ouvrir();
  }

  async function ouvrir() {
    const mon = ++numero;
    if (!D.estPretDevis()) { chargement('Chargement du devis…'); return; }
    const d = D.devisParId(devisId);
    if (!d) {
      if (D.etat.erreurLectureDevis) probleme('echec', 'Les devis n’ont pas pu être lus. Vérifie ta connexion puis recharge la page.', bouton('Réessayer', 'reessayer-pdf', () => location.reload()));
      else introuvable();
      return;
    }
    if (brouillon && d.statut !== 'brouillon') { probleme('pas-pret', MESSAGE_BROUILLON_FINALISE, h('a', { class: 'bouton bouton-principal', href: `#/devis/pdf/${encodeURIComponent(devisId)}`, dataset: { action: 'voir-pdf-final' } }, 'Voir le PDF du devis')); return; }
    const etat = brouillon ? 'pret' : etatPdfDevis(d);
    if (etat === 'aucun') { probleme('pas-pret', MESSAGE_PAS_PRET, lienEditeur); return; }
    if (etat === 'en_cours') { probleme('en-cours', MESSAGE_EN_COURS, bouton('Réessayer', 'reessayer-pdf', ouvrir)); return; }
    if (etat === 'a_reessayer') {
      const echec = d.pdf?.statut === 'echec';
      probleme(echec ? 'echec' : 'pas-pret', echec ? `${MESSAGE_ECHEC}${d.pdf?.message ? ` (${d.pdf.message})` : ''}` : MESSAGE_PAS_PRET, bouton('Réessayer', 'reessayer-pdf', relancer));
      return;
    }
    chargement('Préparation du PDF…');
    try {
      const r = await D.pdfLien(devisId, brouillon);
      if (arrete || mon !== numero) return;
      const url = typeof r?.url === 'string' && /^https:\/\//i.test(r.url) ? r.url : null;
      if (!url) throw new Error(D.MESSAGE_RESEAU_DEVIS);
      if (!dejaOuvert) { dejaOuvert = true; window.open(url, '_blank', 'noopener,noreferrer'); }
      montrer('pret',
        h('p', { dataset: { valeur: 'message-pdf' } }, r?.nom ? `${r.nom} s’ouvre dans un nouvel onglet.` : 'Le PDF s’ouvre dans un nouvel onglet.'),
        h('p', { class: 'texte-discret' }, 'Rien ne s’est ouvert ? Ton navigateur l’a peut-être bloqué : utilise le bouton ci-dessous.'),
        h('div', { class: 'pdf-devis-actions' },
          h('a', { class: 'bouton bouton-principal', href: url, target: '_blank', rel: 'noopener noreferrer', dataset: { action: 'ouvrir-pdf' } }, icone('external-link', { taille: 16 }), 'Ouvrir le PDF'),
          h('a', { class: 'bouton bouton-secondaire', href: brouillon ? `#/devis/editeur/${encodeURIComponent(devisId)}` : '#/devis/liste', dataset: { action: 'retour-apres-pdf' } }, brouillon ? 'Retour au devis' : 'Retour aux devis')));
    } catch (e) {
      if (arrete || mon !== numero) return;
      const code = String(e?.code ?? '').replace('functions/', '');
      if (code === 'not-found') {
        if (brouillon) probleme('pas-pret', MESSAGE_PAS_DE_BROUILLON, lienEditeur);
        else introuvable();
      } else if (code === 'failed-precondition') probleme('pas-pret', MESSAGE_PAS_PRET, bouton('Réessayer', 'reessayer-pdf', relancer));
      else probleme('echec', e?.message || D.MESSAGE_RESEAU_DEVIS, bouton('Réessayer', 'reessayer-pdf', ouvrir));
    }
  }

  // Le champ `pdf` du devis change quand le serveur a fini : l'écran suit seul (et n'ouvre jamais un second onglet).
  let derniere = '';
  const suivre = () => {
    const d = D.estPretDevis() ? D.devisParId(devisId) : null;
    const signature = JSON.stringify([D.estPretDevis(), d?.statut ?? null, d?.pdf?.statut ?? null, d?.pdf?.chemin ?? null]);
    if (signature === derniere) return;
    derniere = signature;
    ouvrir();
  };
  const arretSuivi = D.surChangement(suivre);
  suivre();
  return () => { arrete = true; arretSuivi(); };
}
