// Écran « Aujourd'hui » du module Réseaux sociaux : ce qu'il y a à faire cette semaine.
//  1. Les créneaux de publication des 14 prochains jours (pris par un post programmé dans Buffer, ou vides) ;
//  2. les relations LinkedIn à traiter (à répondre, à relancer), lues dans les activités du CRM ;
//  3. le dernier post publié, avec ses chiffres.
// Buffer reste le lieu d'écriture (un seul bouton jaune : « Ouvrir Buffer »). Si Buffer est en erreur ou non branché, seule la carte des créneaux et celle du dernier post le disent :
// la carte des relations ne dépend pas de Buffer. Le module ne lit jamais les activités ni les étiquettes de l'état du CRM (vides quand Affaires est éteint) : il écoute les siennes.
import { h, icone, remplir } from '../../os/ui.js';
import { lien } from '../../os/router.js';
import { enteteListe } from '../crm/barre-liste.js';
import { etat as etatCrm, surChangement as surChangementCrm, estNoyau } from '../crm/donnees.js';
import * as D from './donnees.js';
import * as R from './logique.js';
import { ongletsReseauxSociaux, chargement, lienBuffer } from './commun.js';

const MAX_RELATIONS = 5;

/** « 06:08 » -> « 6 h 08 ». */
const heureLisible = (heure) => heure.replace(/^0/, '').replace(':', ' h ');

const pastilleRouge = (texte) => h('span', { class: 'badge-retard' }, texte);
const phraseGrise = (texte) => h('p', { class: 'aide', dataset: { role: 'phrase-grise' } }, texte);

function carteCreneaux() {
  const b = D.etat.buffer;
  const corps = [];
  if (b.erreur) {
    corps.push(h('p', { class: 'erreur', role: 'alert', dataset: { role: 'erreur-buffer' } }, b.erreur),
      h('div', { class: 'ligne-boutons' }, h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer-buffer' }, onclick: () => D.chargerBuffer({ force: true }) },
        icone('refresh-cw', { taille: 16 }), 'Réessayer')));
  } else if (!b.lueLe) {
    corps.push(chargement());
  } else {
    corps.push(h('ul', { class: 'rs-liste', dataset: { role: 'creneaux' } }, R.creneauxAVenir(new Date(), b.posts).map((c) => h('li', { class: 'rs-ligne', dataset: { date: c.date, creneau: c.post ? 'pris' : 'vide' } },
      h('span', { class: 'rs-ligne-titre' }, `${R.libelleJour(c.date)} · ${heureLisible(c.heure)}`),
      c.post ? h('span', { class: 'rs-ligne-detail' }, `Programmé : ${R.debutTexte(c.post.texte, 40)}`) : pastilleRouge('Créneau vide')))));
  }
  return h('section', { class: 'carte-section', dataset: { carte: 'creneaux' } }, h('h2', {}, icone('calendar', { taille: 18 }), 'Créneaux des 14 prochains jours'), ...corps);
}

function carteRelations() {
  const aFaire = D.etat.pret ? R.relationsAFaire(etatCrm.personnes, D.activitesDesRelations(), new Date()) : [];
  const corps = !D.etat.pret ? [chargement()]
    : aFaire.length ? [h('ul', { class: 'rs-liste', dataset: { role: 'relations' } }, aFaire.slice(0, MAX_RELATIONS).map((r) => h('li', { class: 'rs-ligne', dataset: { badge: r.badge } },
      // La fiche d'une personne n'est servie que si le module Affaires est actif (sinon « Page introuvable ») : sans lui, le nom reste du texte.
      estNoyau() ? h('span', { class: 'rs-ligne-titre' }, r.personne.nom || 'Sans nom')
        : h('a', { class: 'lien-fiche rs-ligne-titre', href: lien(`crm/personnes/${r.personne.id}`) }, r.personne.nom || 'Sans nom'),
      r.badge === 'relancer' ? pastilleRouge(R.libelleBadgeRelation(r)) : h('span', { class: 'pastille-etiquette', style: { '--couleur': 'var(--bordure-forte)' } }, R.libelleBadgeRelation(r)))))]
      : [phraseGrise('Aucune relation à traiter pour le moment.')];
  return h('section', { class: 'carte-section', dataset: { carte: 'relations' } },
    h('h2', {}, icone('users', { taille: 18 }), 'Relations à traiter'), ...corps,
    h('a', { class: 'lien-fiche', href: lien('reseauxsociaux/relations'), dataset: { action: 'voir-relations' } }, 'Voir les relations'));
}

function carteDernierPost() {
  const b = D.etat.buffer;
  let corps;
  if (b.erreur) corps = [phraseGrise('Le dernier post publié s’affichera dès que Buffer répondra.')];
  else if (!b.lueLe) corps = [chargement()];
  else {
    const p = R.dernierPostPublie(b.posts);
    if (!p) corps = [phraseGrise('Aucun post publié pour le moment.')];
    else {
      const s = p.stats;
      corps = [
        h('p', { class: 'rs-extrait', dataset: { role: 'dernier-texte' } }, R.debutTexte(p.texte, 160)),
        h('p', { class: 'aide' }, `Publié le ${R.libelleDate(p.publieLe)}`),
        h('p', { dataset: { role: 'dernier-chiffres' } }, s ? `${R.formaterNombre(s.impressions)} impressions · ${R.formaterNombre(s.reactions)} réactions` : 'Pas encore de chiffres'),
      ];
    }
  }
  return h('section', { class: 'carte-section', dataset: { carte: 'dernier-post' } }, h('h2', {}, icone('chart-column', { taille: 18 }), 'Dernier post publié'), ...corps);
}

/** Rappel hebdomadaire : phrase grise et lien simple (jamais un bouton jaune). Rien tant que l'historique des imports n'est pas lu. */
function rappelImport() {
  if (!D.etat.pret) return null;
  const r = R.rappelImport(D.etat.imports, new Date());
  if (!r.afficher) return null;
  const phrase = r.jours === null ? 'Tu n’as pas encore importé tes échanges LinkedIn.' : `Ton dernier import LinkedIn date de ${r.jours} jour${r.jours > 1 ? 's' : ''}.`;
  return h('p', { class: 'aide rs-rappel', dataset: { role: 'rappel-import' } }, `${phrase} `, h('a', { class: 'lien-fiche', href: lien('reseauxsociaux/import'), dataset: { action: 'importer' } }, 'Importer'));
}

export function oublierFiltresAujourdhui() {}

export function rendreAujourdhui(conteneur) {
  const rappel = h('div', { class: 'rs-rappel-zone' });
  const cartes = h('div', { class: 'rs-cartes' });
  conteneur.append(h('div', { class: 'page page-liste page-reseauxsociaux' },
    enteteListe({ titre: 'Aujourd’hui', actions: [lienBuffer()] }), ongletsReseauxSociaux('reseauxsociaux/aujourdhui'), rappel, cartes));

  function rendre() {
    remplir(rappel, rappelImport());
    remplir(cartes, carteCreneaux(), carteRelations(), carteDernierPost());
  }
  const arrets = [D.surChangement(rendre), surChangementCrm(rendre)];
  D.chargerBuffer().catch((e) => console.warn(e)); // deux appels rapprochés = une seule lecture (cache de cinq minutes)
  rendre();
  return function quitter() { arrets.forEach((f) => f()); };
}
