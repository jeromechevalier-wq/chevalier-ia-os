// Écran « Aujourd'hui » du module Réseaux sociaux : ce qu'il y a à faire cette semaine.
//  1. Les créneaux de publication des 21 prochains jours (remplis par un post programmé ou publié dans Buffer : pastille verte ; ou vides : pastille rouge) ;
//  2. les relations LinkedIn à traiter (à répondre, à relancer), lues dans les activités du CRM ;
//  3. les profils qui inspirent (un bouton par profil vers LinkedIn) ;
//  4. les 3 derniers posts publiés, avec leurs chiffres.
// Chaque post (créneau rempli ou publié) montre son pilier et son format en pastilles (« À classer » ouvre l'onglet Posts sur ce post) et ses liens : « Voir sur LinkedIn » (publié), « Ouvrir dans Buffer » (programmé).
// Buffer reste le lieu d'écriture (un seul bouton jaune : « Ouvrir Buffer »). Si Buffer est en erreur ou non branché, seule la carte des créneaux et celle du dernier post le disent :
// la carte des relations ne dépend pas de Buffer. Le module ne lit jamais les activités ni les étiquettes de l'état du CRM (vides quand Affaires est éteint) : il écoute les siennes.
import { h, icone, remplir } from '../../os/ui.js';
import { lien } from '../../os/router.js';
import { enteteListe } from '../crm/barre-liste.js';
import { etat as etatCrm, surChangement as surChangementCrm, estNoyau } from '../crm/donnees.js';
import * as D from './donnees.js';
import * as R from './logique.js';
import * as N from './inspirations-logique.js';
import * as P from './posts-logique.js';
import { lienLinkedinSur } from './import-logique.js';
import { ongletsReseauxSociaux, chargement, lienBuffer, lienExterne, pastillePilier, pastilleFormat, COULEUR_GRISE } from './commun.js';

const MAX_RELATIONS = 5;

/** « 06:08 » -> « 6 h 08 ». */
const heureLisible = (heure) => heure.replace(/^0/, '').replace(':', ' h ');

/** Créneau vide : un bouton ouvre l'onglet Idées, qui tire une contrainte pour ce créneau (aucune donnée créée au clic). */
const boutonImaginer = (c) => h('a', { class: 'bouton bouton-secondaire rs-imaginer', href: lien('reseauxsociaux/idees'), dataset: { action: 'imaginer-post', date: c.date },
  onclick: () => D.demanderTirage(`${R.libelleJour(c.date)} · ${heureLisible(c.heure)}`) }, icone('sparkles', { taille: 16 }), 'Imaginer un post pour ce créneau');

const pastilleRouge = (texte) => h('span', { class: 'badge-retard' }, texte);
const pastilleVerte = (texte) => h('span', { class: 'pastille-etiquette', style: { '--couleur': 'var(--succes)' } }, texte);
const phraseGrise = (texte) => h('p', { class: 'aide', dataset: { role: 'phrase-grise' } }, texte);

/** Posts de Buffer + leur classement (pilier, format) : par identifiant. Sans lecture du classement (D.etat.pret faux), la table est vide et les pastilles ne s'affichent pas. */
const classementsParId = () => new Map(P.fusionnerPosts(D.etat.buffer.posts, D.etat.posts).map((p) => [p.id, p.classement]));

/** « À classer » : pastille cliquable vers l'onglet Posts, qui ouvre la fenêtre de classement de ce post. */
const pastilleAClasser = (post) => h('a', { class: 'pastille-etiquette rs-a-classer', style: { '--couleur': COULEUR_GRISE }, href: lien('reseauxsociaux/posts'), dataset: { role: 'a-classer', action: 'classer-post', post: post.id },
  onclick: () => D.demanderClassement(post.id) }, 'À classer');

/** Deuxième rangée d'un post : pastilles pilier et format (ou « À classer » s'il en manque un), puis ses liens en un clic. */
function rangeePost(post, classement) {
  const c = classement ?? null;
  const pastilles = [];
  if (c) {
    if (c.pilier) pastilles.push(pastillePilier(c.pilier));
    if (c.format) pastilles.push(pastilleFormat(c.format));
    if (!c.pilier || !c.format) pastilles.push(pastilleAClasser(post));
  }
  const liens = [];
  const adresse = R.adressePostLinkedin(post);
  if (post.statut === 'publie' && adresse) liens.push(lienExterne({ href: adresse, libelle: 'Voir sur LinkedIn', classe: 'lien-fiche rs-lien-post', action: 'voir-sur-linkedin' }));
  if (post.statut === 'programme') liens.push(lienExterne({ href: R.URL_BUFFER, libelle: 'Ouvrir dans Buffer', classe: 'lien-fiche rs-lien-post', action: 'ouvrir-dans-buffer' }));
  if (!pastilles.length && !liens.length) return null;
  return h('div', { class: 'rs-ligne-bas' }, h('span', { class: 'groupe-pastilles', dataset: { role: 'classement' } }, pastilles), ...liens);
}

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
    const classements = classementsParId();
    corps.push(h('ul', { class: 'rs-liste', dataset: { role: 'creneaux' } }, R.creneauxAVenir(new Date(), b.posts).map((c) => h('li', { class: 'rs-ligne', dataset: { date: c.date, creneau: c.post ? 'pris' : 'vide' } },
      h('span', { class: 'rs-ligne-titre' }, `${R.libelleJour(c.date)} · ${heureLisible(c.heure)}`),
      c.post ? [pastilleVerte('Créneau rempli'), h('span', { class: 'rs-ligne-detail' }, `${c.post.statut === 'publie' ? 'Publié' : 'Programmé'} : ${R.debutTexte(c.post.texte, 40)}`),
        rangeePost(c.post, D.etat.pret ? classements.get(c.post.id) : null)] : [pastilleRouge('Créneau vide'), h('div', { class: 'rs-ligne-bas' }, boutonImaginer(c))]))));
  }
  return h('section', { class: 'carte-section', dataset: { carte: 'creneaux' } }, h('h2', {}, icone('calendar', { taille: 18 }), 'Créneaux des 21 prochains jours'), ...corps);
}

/** Rappel glissant : posts publiés sur les 21 derniers jours (jamais la semaine civile). Rien tant que Buffer n'a pas répondu. */
function rappelRythme() {
  const b = D.etat.buffer;
  if (b.erreur || !b.lueLe) return null;
  const n = R.nombrePublies21Jours(b.posts, new Date());
  const niveau = R.niveauRythme(n);
  const pastille = niveau === 'rouge' ? pastilleRouge('À relancer')
    : h('span', { class: 'pastille-etiquette', style: { '--couleur': niveau === 'vert' ? 'var(--succes)' : 'var(--attention)' } }, niveau === 'vert' ? 'Objectif atteint' : 'En route');
  return h('p', { class: 'aide rs-rythme', dataset: { role: 'rythme', niveau } }, pastille,
    ` ${R.JOURS_RYTHME} derniers jours : ${R.formaterNombre(n)} post${n > 1 ? 's' : ''} publié${n > 1 ? 's' : ''} (objectif ${R.OBJECTIF_RYTHME.min} à ${R.OBJECTIF_RYTHME.max}, soit 2 à 3 par semaine)`);
}

function carteRelations() {
  const aFaire = D.etat.pret ? R.relationsAFaire(etatCrm.personnes, D.activitesDesRelations(), new Date()) : [];
  const corps = !D.etat.pret ? [chargement()]
    : aFaire.length ? [h('ul', { class: 'rs-liste', dataset: { role: 'relations' } }, aFaire.slice(0, MAX_RELATIONS).map((r) => h('li', { class: 'rs-ligne', dataset: { badge: r.badge } },
      // La fiche d'une personne n'est servie que si le module Affaires est actif (sinon « Page introuvable ») : sans lui, le nom reste du texte.
      estNoyau() ? h('span', { class: 'rs-ligne-titre' }, r.personne.nom || 'Sans nom')
        : h('a', { class: 'lien-fiche rs-ligne-titre', href: lien(`crm/personnes/${r.personne.id}`) }, r.personne.nom || 'Sans nom'),
      r.badge === 'relancer' ? pastilleRouge(R.libelleBadgeRelation(r)) : h('span', { class: 'pastille-etiquette', style: { '--couleur': 'var(--bordure-forte)' } }, R.libelleBadgeRelation(r)),
      // Adresse du profil déjà rangée dans la fiche (import LinkedIn) : un lien en un clic ; sans adresse, rien.
      lienLinkedinSur(r.personne.linkedin) ? h('div', { class: 'rs-ligne-bas' }, lienExterne({ href: lienLinkedinSur(r.personne.linkedin), libelle: 'Ouvrir son profil LinkedIn', classe: 'lien-fiche rs-lien-post', action: 'ouvrir-profil-relation' })) : null)))]
      : [phraseGrise('Aucune relation à traiter pour le moment.')];
  return h('section', { class: 'carte-section', dataset: { carte: 'relations' } },
    h('h2', {}, icone('users', { taille: 18 }), 'Relations à traiter'), ...corps,
    h('a', { class: 'lien-fiche', href: lien('reseauxsociaux/relations'), dataset: { action: 'voir-relations' } }, 'Voir les relations'));
}

/** Carte « Inspirations » : un bouton par profil, pour ouvrir LinkedIn en un clic (nouvel onglet). Sans profil : une phrase et le lien vers l'écran Inspirations. */
function carteInspirations() {
  const profils = D.etat.pret ? N.trierInspirations(D.etat.inspirations).filter((p) => N.typeSource(p) === 'profil' && N.normaliserUrlLinkedin(p.url)).map((p) => ({ ...p, url: N.normaliserUrlLinkedin(p.url) })) : []; // seuls les profils LinkedIn ont un bouton ici (les sites et les résumés de veille s'ouvrent dans l'écran Inspirations)
  const corps = !D.etat.pret ? [chargement()]
    : profils.length ? [h('div', { class: 'ligne-boutons rs-profils', dataset: { role: 'profils' } }, profils.map((p) => lienExterne({ href: p.url, libelle: p.nom || 'Profil', action: 'ouvrir-profil' })))]
      : [phraseGrise('Ajoute les profils qui t’inspirent.')];
  return h('section', { class: 'carte-section', dataset: { carte: 'inspirations' } },
    h('h2', {}, icone('star', { taille: 18 }), 'Inspirations'), ...corps,
    h('a', { class: 'lien-fiche', href: lien('reseauxsociaux/inspirations'), dataset: { action: 'voir-inspirations' } }, profils.length ? 'Voir les inspirations' : 'Ajouter un profil'));
}

/** Une ligne par post publié, comme les créneaux : date et heure de publication, pastille « Publié », extrait, chiffres connus (« — » quand un chiffre manque), puis classement et lien LinkedIn. */
function lignePublie(p, classements) {
  const s = p.stats;
  const chiffres = s ? `${R.formaterNombre(s.impressions)} impressions · ${R.formaterNombre(s.reactions)} réactions · ${R.formaterNombre(s.commentaires)} commentaires` : 'Pas encore de chiffres';
  return h('li', { class: 'rs-ligne', dataset: { post: p.id } },
    h('span', { class: 'rs-ligne-titre', dataset: { role: 'date-publication' } }, R.libelleJourHeure(p.publieLe) || 'Date inconnue'),
    pastilleVerte('Publié'),
    h('span', { class: 'rs-ligne-detail', dataset: { role: 'dernier-texte' } }, R.debutTexte(p.texte, 160)),
    h('span', { class: 'rs-ligne-detail', dataset: { role: 'dernier-chiffres' } }, chiffres),
    rangeePost(p, D.etat.pret ? classements.get(p.id) : null));
}

function carteDernierPost() {
  const b = D.etat.buffer;
  let corps;
  if (b.erreur) corps = [phraseGrise('Les derniers posts publiés s’afficheront dès que Buffer répondra.')];
  else if (!b.lueLe) corps = [chargement()];
  else {
    const derniers = R.derniersPostsPublies(b.posts, 3);
    corps = derniers.length ? [h('ul', { class: 'rs-liste', dataset: { role: 'derniers-publies' } }, derniers.map((p) => lignePublie(p, classementsParId())))] : [phraseGrise('Aucun post publié pour le moment.')];
  }
  return h('section', { class: 'carte-section', dataset: { carte: 'dernier-post' } }, h('h2', {}, icone('chart-column', { taille: 18 }), '3 derniers posts publiés'), ...corps);
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
    remplir(rappel, rappelRythme(), rappelImport());
    remplir(cartes, carteCreneaux(), carteRelations(), carteInspirations(), carteDernierPost());
  }
  const arrets = [D.surChangement(rendre), surChangementCrm(rendre)];
  D.chargerBuffer().catch((e) => console.warn(e)); // deux appels rapprochés = une seule lecture (cache de cinq minutes)
  rendre();
  return function quitter() { arrets.forEach((f) => f()); };
}
