// Fiche d'un rendez-vous (version de base, PR 2) : le chantier, les créneaux et les participants. Le tableau « qui peut quand », l'historique des SMS et les boutons
// (Confirmer, Proposer d'autres créneaux, Annuler, Pluie) arrivent avec la PR 3.
import { h, icone, remplir } from '../../os/ui.js';
import * as CRM from '../crm/donnees.js';
import * as D from './donnees.js';
import * as R from './logique.js';
import { planifier } from '../crm/composants.js';

export function rendreFiche(conteneur, id) {
  const zone = h('div', { class: 'pile' });
  conteneur.append(h('div', { class: 'page page-rdv page-rdv-fiche' }, h('a', { class: 'lien-retour', href: '#/rdv/liste' }, icone('chevron-left', { taille: 16 }), 'Rendez-vous'), zone));
  function rendre() {
    if (!(D.estPret() && CRM.estPret())) { remplir(zone, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' }))); return; }
    const r = D.rendezVous(id);
    if (!r) { remplir(zone, h('div', { class: 'etat-vide' }, h('p', {}, 'Ce rendez-vous n’existe pas ou a été supprimé.'), h('a', { class: 'bouton bouton-secondaire', href: '#/rdv/liste' }, 'Retour aux rendez-vous'))); return; }
    const parts = D.participantsDe(id);
    remplir(zone,
      h('header', { class: 'page-tete' }, h('div', {}, h('h1', {}, [r.client || 'Rendez-vous', r.commune].filter(Boolean).join(' · ')))),
      h('section', { class: 'carte-section' }, h('h2', {}, 'Le chantier'), r.objet ? h('p', {}, r.objet) : null, h('p', { class: 'rdv-adresse' }, r.adresse || 'Pas d’adresse')),
      h('section', { class: 'carte-section' }, h('h2', {}, 'Créneaux'), (r.creneaux || []).map((c, i) => h('p', {}, R.libelleCreneau(i, c)))),
      h('section', { class: 'carte-section' }, h('h2', {}, 'Participants'), parts.map((p) => h('p', {}, `${p.nom}${p.role ? ` · ${p.role}` : ''} · ${R.afficherTelephone(p.telephone)}`))));
  }
  const planifie = planifier(rendre);
  rendre();
  const arrets = [D.surChangement(planifie), CRM.surChangement(planifie)];
  return () => arrets.forEach((f) => f());
}
