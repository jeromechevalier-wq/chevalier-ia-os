// Écran « Statistiques » du portail devis seul (09/11/2026) : quatre chiffres, les devis par statut et un détail par mois, sur une période au choix.
// Tableau de chiffres, pas une liste : titre, compteur et choix de période (barre commune enteteListe), ni recherche ni vues. Aucune règle ici : tout vient de statistiques.js (pur et testé).
// Le module Devis seul n'a pas Affaires : cet écran ne lit que les devis.
import { h, remplir, lirePreference, ecrirePreference } from '../../os/ui.js';
import { etatVide, planifier } from '../crm/composants.js';
import { enteteListe } from '../crm/barre-liste.js';
import { aujourdhuiParis } from '../crm/logique.js';
import * as D from './donnees.js';
import { formaterMontant } from './document.js';
import { PERIODES, PERIODE_DEFAUT, statistiquesDevis, libelleMois } from './statistiques.js';

export const VIDE = 'Pas encore de devis sur cette période.';
export const NOTE_TESTS = 'Les devis de test ne sont pas comptés.'; // une seule phrase, toujours affichée (10/11/2026)
export const ERREUR_STATISTIQUES = 'Impossible de lire tes devis pour le moment. Réessaie.';
const STATUTS_AFFICHES = [['brouillon', 'Brouillons'], ['en_attente_envoi', 'Finalisés'], ['envoye', 'Envoyés'], ['accepte', 'Signés'], ['refuse', 'Refusés']];
const pourcent = (n) => (n === null ? '—' : `${n} %`);
const periodeMemorisee = () => { const v = lirePreference('periode.statistiques-devis', PERIODE_DEFAUT); return PERIODES.some((p) => p.id === v) ? v : PERIODE_DEFAUT; };

/** Rend la fonction d'arrêt. */
export function rendreStatistiques(conteneur) {
  let periode = periodeMemorisee();
  const titre = h('h1', {}, 'Statistiques');
  const compteur = h('span', { class: 'compteur-liste', 'aria-live': 'polite' });
  const choix = h('select', { class: 'champ', 'aria-label': 'Période', dataset: { champ: 'periode' }, onchange: (e) => { periode = e.target.value; ecrirePreference('periode.statistiques-devis', periode); rendre(); } },
    PERIODES.map((p) => h('option', { value: p.id, selected: p.id === periode }, p.libelle)));
  const zone = h('div', { class: 'zone-statistiques' });
  const avis = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'lecture' }, hidden: true });

  const chiffre = (id, libelle, valeur, aide = null) => h('div', { class: 'chiffre-statistique', dataset: { chiffre: id } }, h('span', { class: 'chiffre-libelle' }, libelle), h('strong', { class: 'chiffre-valeur' }, valeur), aide ? h('span', { class: 'aide' }, aide) : null);

  function rendre() {
    const erreur = Boolean(D.etat.erreurLectureDevis);
    avis.hidden = !erreur;
    avis.textContent = erreur ? ERREUR_STATISTIQUES : '';
    if (!D.estPretDevis()) {
      remplir(compteur, '');
      remplir(zone, erreur ? '' : h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' })));
      return;
    }
    const s = statistiquesDevis(D.etat.devis, { aujourdhui: aujourdhuiParis(), periode });
    remplir(compteur, `${s.nbDevis} devis`);
    if (!s.nbDevis && !s.sansDate) { remplir(zone, erreur ? '' : etatVide(VIDE)); return; }
    const maxMois = Math.max(...s.mois.map((m) => m.caSigneHt), 0);
    remplir(zone,
      h('div', { class: 'chiffres-statistiques' },
        chiffre('ca-signe', 'Chiffre d’affaires signé', `${formaterMontant(s.caSigneHt)} HT`, 'Devis signés, archivés compris'),
        chiffre('signes', 'Devis signés', String(s.signes)),
        chiffre('envoyes', 'Devis envoyés', String(s.sortis), 'Envoyés, signés ou refusés'),
        chiffre('taux', 'Taux de transformation', pourcent(s.tauxTransformation), s.tauxTransformation === null ? 'Aucun devis envoyé' : 'Signés ÷ envoyés, chacun compté à sa propre date')),
      h('section', { class: 'bloc-statistiques', dataset: { bloc: 'statuts' } }, h('h2', {}, 'Devis par statut'),
        h('ul', { class: 'liste-statuts-stat' }, STATUTS_AFFICHES.map(([id, libelle]) => h('li', { dataset: { statut: id } }, h('span', {}, libelle), h('strong', {}, String(s.parStatut[id])))))),
      h('section', { class: 'bloc-statistiques', dataset: { bloc: 'mois' } }, h('h2', {}, 'Mois par mois'),
        h('ul', { class: 'liste-mois-stat' }, s.mois.map((m) => h('li', { dataset: { mois: m.mois } },
          h('span', { class: 'mois-libelle' }, libelleMois(m.mois)),
          h('span', { class: 'mois-barre', role: 'presentation' }, h('span', { class: 'mois-barre-remplie', style: { '--part': maxMois ? `${Math.round((m.caSigneHt / maxMois) * 100)}%` : '0%' } })),
          h('span', { class: 'mois-ca' }, `${formaterMontant(m.caSigneHt)} HT`),
          h('span', { class: 'mois-detail aide' }, `${m.signes} signé${m.signes > 1 ? 's' : ''} sur ${m.envoyes} envoyé${m.envoyes > 1 ? 's' : ''}`))))),
      s.sansDate ? h('p', { class: 'aide', dataset: { role: 'sans-date' } }, `${s.sansDate} devis sans date lisible ne sont pas comptés.`) : null);
  }

  conteneur.append(h('div', { class: 'page page-liste page-devis page-statistiques' }, enteteListe({ titre, compteur, actions: [choix] }), avis, zone, h('p', { class: 'aide', dataset: { role: 'note-tests' } }, NOTE_TESTS)));
  const rafraichir = planifier(rendre);
  rendre();
  const arret = D.surChangement(rafraichir);
  return () => arret();
}
