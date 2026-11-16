// Écrans de la Console (phase 0) : Vue d'ensemble (sélecteur de plateforme, résumé du filet, état du serveur) et Filet de sécurité
// (la liste des vérifications, que Jérôme date à la main). Trois états partout : chargement, vide, erreur (avec « Réessayer »).
import { h, icone, remplir, toast } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import { barreOnglets } from '../../os/onglets.js';
import { ongletsDuModule } from '../../os/registre.js';
import * as D from './donnees.js';
import * as L from './logique.js';

const onglets = (actif) => barreOnglets({ onglets: ongletsDuModule('console'), actif, etiquette: 'Écrans de la Console' });

const pastille = (l) => h('span', { class: 'pastille-statut', dataset: { etat: l.etat }, style: { '--couleur': l.etat === 'ok' ? 'var(--succes)' : 'var(--retard)' } },
  l.etat === 'ok' ? 'À jour' : l.etat === 'ancien' ? 'À refaire' : 'Jamais fait');

/** Vue d'ensemble : `segs` = [plateforme] (l'adresse porte la plateforme : #/console/vue/clients). */
export function rendreVue(conteneur, segs = []) {
  const plateforme = L.plateformeValide(segs[0]);
  const selecteur = h('select', { class: 'champ', 'aria-label': 'Plateforme', dataset: { action: 'plateforme' },
    onchange: (e) => naviguer(`console/vue/${e.target.value}`) },
  ...L.PLATEFORMES.map((p) => h('option', { value: p.id, selected: p.id === plateforme }, p.libelle)));
  const zone = h('div', { class: 'console-zone' });
  const serveur = h('p', { class: 'aide', 'aria-live': 'polite' }, 'Vérification du serveur…');
  conteneur.append(onglets('console/vue'), h('div', { class: 'page' }, h('header', { class: 'page-tete' }, h('h1', {}, 'Console')), selecteur, zone, serveur));

  function dessiner() {
    if (!D.etat.pret) { remplir(zone, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' }), h('span', { class: 'sr-only' }, 'Chargement'))); return; }
    if (D.etat.erreur) { remplir(zone, erreur(() => dessiner())); return; }
    const r = L.resumeFilet(L.lignesAvecEtat(D.etat.filet));
    remplir(zone, h('section', { class: 'carte-section', dataset: { bloc: 'resume-filet' } },
      h('h2', {}, icone('shield-check', { taille: 18 }), 'Filet de sécurité'),
      h('p', {}, `${r.ok} vérification${r.ok > 1 ? 's' : ''} à jour sur ${r.total}.`),
      r.aRefaire ? h('p', { class: 'aide' }, `${r.aRefaire} à faire ou à refaire.`) : null,
      h('a', { class: 'bouton bouton-secondaire', href: '#/console/filet' }, 'Ouvrir le filet de sécurité')));
  }
  const arretDonnees = D.surChangement(dessiner);
  dessiner();

  let annule = false;
  D.lireEtatServeur().then((e) => { if (!annule) serveur.textContent = `Serveur : réponse reçue (version ${e.version}).`; })
    .catch((e) => { if (!annule) serveur.textContent = e.message; });
  return () => { annule = true; arretDonnees(); };
}

function erreur(reessayer) {
  return h('div', { class: 'etat-vide', role: 'alert' }, h('p', {}, 'Les données de la Console ne se chargent pas.'),
    h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer' }, onclick: reessayer }, 'Réessayer'));
}

/** Filet de sécurité : une carte par vérification, avec un bouton « Vérifié aujourd'hui ». */
export function rendreFilet(conteneur) {
  const liste = h('div', { class: 'console-filet' });
  conteneur.append(onglets('console/filet'), h('div', { class: 'page' }, h('header', { class: 'page-tete' }, h('h1', {}, 'Filet de sécurité')),
    h('p', { class: 'aide' }, 'Les vérifications qui protègent les espaces de tes clients. Tu les fais à la main, puis tu les dates ici.'), liste));

  async function marquer(id, bouton) {
    bouton.disabled = true;
    try { await D.verifierLigne(id); toast('Vérification enregistrée'); } catch (e) { toast(e.message, { type: 'erreur' }); bouton.disabled = false; }
  }
  function dessiner() {
    if (!D.etat.pret) { remplir(liste, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' }), h('span', { class: 'sr-only' }, 'Chargement'))); return; }
    if (D.etat.erreur) { remplir(liste, erreur(dessiner)); return; }
    const lignes = L.lignesAvecEtat(D.etat.filet);
    remplir(liste, ...(D.etat.filet.length === 0 ? [h('p', { class: 'aide', dataset: { vide: '1' } }, 'Aucune vérification enregistrée.')] : []), ...lignes.map((l) => h('section', { class: 'carte-section', dataset: { ligne: l.id, etat: l.etat } },
      h('h2', {}, l.titre), h('p', { class: 'aide' }, l.aide),
      h('p', {}, pastille(l), ' ', L.texteEtat(l)),
      l.note ? h('p', { class: 'aide' }, l.note) : null,
      h('div', { class: 'ligne-boutons' }, (() => {
        const b = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'verifier', idLigne: l.id }, onclick: () => marquer(l.id, b) }, icone('check', { taille: 16 }), 'Vérifié aujourd\'hui');
        return b;
      })()))));
  }
  const arret = D.surChangement(dessiner);
  dessiner();
  return () => arret();
}
