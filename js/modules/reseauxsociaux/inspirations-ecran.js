// Écran « Inspirations » du module Réseaux sociaux (12/11/2026) : les profils LinkedIn qui inspirent Jérôme, chacun avec sa bibliothèque d'exemples de bons posts.
// Un exemple = le LIEN d'un post et son ANALYSE (accroche, structure, longueur, format, pilier, service, pourquoi ça marche). Jamais le texte du post (droit d'auteur).
// Les adresses LinkedIn s'ouvrent dans un nouvel onglet (rel noopener) ; elles ont été vérifiées à l'enregistrement (https, domaine linkedin.com).
// Les textes viennent de l'utilisateur : toujours posés comme texte (la fabrique `h` crée des nœuds texte), jamais en HTML.
import { h, icone, remplir, dialogue, toast } from '../../os/ui.js';
import { enteteListe } from '../crm/barre-liste.js';
import { etatVide, pastilleEtiquette, MESSAGE_TEST_ECHEC } from '../crm/composants.js';
import * as D from './donnees.js';
import * as R from './logique.js';
import * as I from './idees-logique.js';
import * as N from './inspirations-logique.js';
import { enregistrerInspiration, deplacerInspiration, enregistrerExemple } from './idees-actions.js';
import { ongletsReseauxSociaux, chargement, pastillePilier, pastilleFormat, pastilleService, COULEUR_GRISE, champTexte, champListe, lienExterne } from './commun.js';

// Feuille de style commune aux deux écrans, ajoutée au premier affichage (index.html reste inchangé).
function ajouterFeuille() {
  if (document.querySelector('link[data-reseauxsociaux="reseauxsociaux-idees"]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('../../../css/reseauxsociaux-idees.css', import.meta.url).href;
  l.dataset.reseauxsociaux = 'reseauxsociaux-idees';
  document.head.append(l);
}

export function oublierFiltresInspirations() {}

const phraseGrise = (texte, role = 'phrase-grise') => h('p', { class: 'aide', dataset: { role } }, texte);
const pluriel = (n, un, plusieurs) => `${R.formaterNombre(n)} ${n > 1 ? plusieurs : un}`;
const pastilleGrise = (role, nom) => { const el = pastilleEtiquette({ nom, couleur: COULEUR_GRISE }); el.dataset.role = role; return el; };
const messageErreur = (e) => (e instanceof I.ErreurClaire ? e.message : MESSAGE_TEST_ECHEC);

/** Cases à cocher d'une liste d'identifiants (piliers, formats). `prises` est modifiée sur place. */
function groupeCases({ cle, legende, options, prises, surChangement }) {
  return h('fieldset', { class: 'groupe-cases', dataset: { groupe: cle } }, h('legend', { class: 'etiquette' }, legende),
    h('div', { class: 'cases' }, options.map((o) => h('label', { class: 'case' },
      h('input', { type: 'checkbox', checked: prises.has(o.id), dataset: { [cle]: o.id }, onchange: (e) => { if (e.target.checked) prises.add(o.id); else prises.delete(o.id); surChangement(); } }), o.libelle))));
}

// ---------------------------------------------------------------- fenêtre « Profil »

function ouvrirProfil({ profil = null } = {}) {
  const depart = { nom: profil?.nom ?? '', url: profil?.url ?? '', pourquoi: profil?.pourquoi ?? '', piliers: [...(profil?.piliers ?? [])].map(R.convertirPilier).filter(Boolean), formats: [...(profil?.formats ?? [])] };
  const v = { ...depart, piliers: new Set(depart.piliers), formats: new Set(depart.formats) };
  const instantane = () => JSON.stringify({ ...v, piliers: [...v.piliers].sort(), formats: [...v.formats].sort() });
  const initial = instantane();
  let bouton = null;
  let enCours = false;
  const erreur = h('p', { class: 'erreur', role: 'alert', dataset: { role: 'erreur-profil' } });
  const maj = () => {
    if (!bouton) return;
    const ok = v.nom.trim() !== '' && v.url.trim() !== '' && (!profil || instantane() !== initial);
    bouton.disabled = !ok;
    bouton.classList.toggle('bouton-principal', ok);
    bouton.classList.toggle('bouton-secondaire', !ok);
  };
  const nom = champTexte({ cle: 'nom', libelle: 'Nom', valeur: v.nom, maxlength: N.MAX_NOM, surSaisie: (x) => { v.nom = x; maj(); } });
  const url = champTexte({ cle: 'url', libelle: 'Adresse du profil sur LinkedIn', valeur: v.url, maxlength: N.MAX_URL, placeholder: 'linkedin.com/in/…', surSaisie: (x) => { v.url = x; maj(); } });
  const pourquoi = champTexte({ cle: 'pourquoi', libelle: 'Ce qui m’inspire chez lui ou elle', valeur: v.pourquoi, maxlength: N.MAX_ANALYSE, multiligne: true, lignes: 3, surSaisie: (x) => { v.pourquoi = x; maj(); } });
  const contenu = h('div', { class: 'pile' }, nom.bloc, url.bloc, pourquoi.bloc,
    groupeCases({ cle: 'pilier', legende: 'Piliers habituels (facultatif)', options: R.PILIERS, prises: v.piliers, surChangement: maj }),
    groupeCases({ cle: 'format', legende: 'Formats habituels (facultatif)', options: R.FORMATS, prises: v.formats, surChangement: maj }),
    erreur);
  return dialogue({
    titre: profil ? 'Modifier ce profil' : 'Nouveau profil',
    classe: 'dialogue-formulaire dialogue-inspiration',
    contenu,
    boutons: [
      { libelle: 'Annuler', valeur: null },
      { libelle: 'Enregistrer', valeur: true, desactive: true,
        avantFermeture: async () => {
          if (enCours) return false;
          enCours = true; erreur.textContent = '';
          try {
            await enregistrerInspiration(profil?.id ?? null, { nom: v.nom, url: v.url, pourquoi: v.pourquoi, piliers: [...v.piliers], formats: [...v.formats] });
            toast(profil ? 'Profil enregistré' : 'Profil ajouté');
            return true;
          } catch (e) { console.warn(e); erreur.textContent = messageErreur(e); return false; } finally { enCours = false; }
        } },
    ],
    auMontage: ({ boutons }) => { bouton = boutons.at(-1); maj(); },
  });
}

// ---------------------------------------------------------------- fenêtre « Exemple de post »

function ouvrirExemple({ profil, exemple = null }) {
  const depart = { url: exemple?.url ?? '', date: exemple?.date ?? '', accroche: exemple?.accroche ?? '', extrait: exemple?.extrait ?? '', structure: exemple?.structure ?? '', longueur: exemple?.longueur ?? '',
    format: exemple?.format ?? null, pilier: R.convertirPilier(exemple?.pilier), service: exemple?.service ?? null, pourquoi: exemple?.pourquoi ?? '' };
  const v = { ...depart };
  let bouton = null;
  let enCours = false;
  const erreur = h('p', { class: 'erreur', role: 'alert', dataset: { role: 'erreur-exemple' } });
  const maj = () => {
    if (!bouton) return;
    const ok = v.url.trim() !== '' && (!exemple || JSON.stringify(v) !== JSON.stringify(depart));
    bouton.disabled = !ok;
    bouton.classList.toggle('bouton-principal', ok);
    bouton.classList.toggle('bouton-secondaire', !ok);
  };
  const texte = (cle, libelle, extra = {}) => champTexte({ cle, libelle, valeur: v[cle], maxlength: N.MAX_ANALYSE, surSaisie: (x) => { v[cle] = x; maj(); }, ...extra });
  const url = champTexte({ cle: 'url', libelle: 'Lien du post sur LinkedIn', valeur: v.url, maxlength: N.MAX_URL, placeholder: 'linkedin.com/posts/…', aide: 'Colle seulement le lien. Le texte du post n’est pas copié ici.', surSaisie: (x) => { v.url = x; maj(); } });
  const date = champTexte({ cle: 'date', libelle: 'Date du post', valeur: v.date, surSaisie: (x) => { v.date = x; maj(); } });
  date.champ.type = 'date';
  const accroche = texte('accroche', 'Accroche', { multiligne: true, lignes: 2 });
  const extrait = texte('extrait', 'Extrait : les mots du post (facultatif)', { maxlength: I.MAX_EXTRAIT, multiligne: true, lignes: 3, aide: 'Quelques mots collés par toi (400 caractères au plus), pas le post entier.' });
  const structure = texte('structure', 'Structure', { multiligne: true, lignes: 2 });
  const longueur = texte('longueur', 'Longueur');
  const pourquoi = texte('pourquoi', 'Pourquoi ça marche', { multiligne: true, lignes: 3 });
  const format = champListe({ cle: 'format', libelle: 'Format', options: R.FORMATS, valeur: v.format, vide: 'À choisir', surChangement: (x) => { v.format = x; maj(); } });
  const pilier = champListe({ cle: 'pilier', libelle: 'Pilier', options: R.PILIERS, valeur: v.pilier, vide: 'À choisir', surChangement: (x) => { v.pilier = x; maj(); } });
  const service = champListe({ cle: 'service', libelle: 'Service', options: R.SERVICES, valeur: v.service, vide: 'Tous les services', surChangement: (x) => { v.service = x; maj(); } });
  const contenu = h('div', { class: 'pile' },
    h('p', { class: 'aide' }, `Profil : ${profil.nom}`),
    url.bloc, date.bloc, accroche.bloc, extrait.bloc, structure.bloc, longueur.bloc,
    h('div', { class: 'ligne-champs' }, format.bloc, pilier.bloc, service.bloc),
    pourquoi.bloc, erreur);
  return dialogue({
    titre: exemple ? 'Modifier cet exemple' : 'Nouvel exemple de post',
    classe: 'dialogue-formulaire dialogue-exemple',
    contenu,
    boutons: [
      { libelle: 'Annuler', valeur: null },
      { libelle: 'Enregistrer', valeur: true, desactive: true,
        avantFermeture: async () => {
          if (enCours) return false;
          enCours = true; erreur.textContent = '';
          try {
            await enregistrerExemple(exemple?.id ?? null, { ...v, profilId: profil.id });
            toast(exemple ? 'Exemple enregistré' : 'Exemple ajouté');
            return true;
          } catch (e) { console.warn(e); erreur.textContent = messageErreur(e); return false; } finally { enCours = false; }
        } },
    ],
    auMontage: ({ boutons }) => { bouton = boutons.at(-1); maj(); },
  });
}

// ---------------------------------------------------------------- cartes

const libelleJourPost = (jour) => `${R.libelleJour(jour)} ${jour.slice(0, 4)}`;
const ligneAnalyse = (libelle, valeur, role) => (valeur ? h('p', { class: 'rs-analyse', dataset: { role } }, h('strong', {}, `${libelle} : `), valeur) : null);

function ligneExemple(profil, e) {
  return h('li', { class: 'rs-exemple', dataset: { exemple: e.id } },
    h('div', { class: 'rs-exemple-tete' },
      h('strong', { class: 'rs-exemple-titre', dataset: { role: 'accroche' } }, e.accroche || 'Post sans accroche notée'),
      e.date ? h('span', { class: 'carte-sous', dataset: { role: 'date-exemple' } }, icone('calendar', { taille: 12 }), libelleJourPost(e.date)) : null),
    h('div', { class: 'groupe-pastilles' }, e.pilier ? pastillePilier(e.pilier) : null, e.format ? pastilleFormat(e.format) : null, e.service ? pastilleService(e.service) : null),
    e.extrait ? h('q', { class: 'rs-extrait-source', dataset: { role: 'extrait' } }, e.extrait) : null,
    ligneAnalyse('Structure', e.structure, 'structure'), ligneAnalyse('Longueur', e.longueur, 'longueur'), ligneAnalyse('Pourquoi ça marche', e.pourquoi, 'pourquoi'),
    h('div', { class: 'ligne-boutons' },
      e.url ? lienExterne({ href: e.url, libelle: 'Voir le post', action: 'ouvrir-post' }) : null,
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'modifier-exemple' }, onclick: () => ouvrirExemple({ profil, exemple: e }) }, icone('pencil', { taille: 16 }), 'Modifier')));
}

async function deplacer(profil, sens) {
  try { await deplacerInspiration(profil.id, sens); } catch (e) { console.warn(e); toast(MESSAGE_TEST_ECHEC, { type: 'erreur' }); }
}

function carteProfil(profil, index, total) {
  const exemples = N.exemplesDe(D.etat.exemples, profil.id);
  const boutonIcone = (action, ic, libelle, auClic, desactive) => h('button', { type: 'button', class: 'bouton-icone', dataset: { action }, 'aria-label': libelle, title: libelle, disabled: desactive, onclick: auClic }, icone(ic, { taille: 16 }));
  return h('section', { class: 'carte-section carte-inspiration', dataset: { inspiration: profil.id } },
    h('div', { class: 'rs-profil-tete' },
      h('h2', { dataset: { role: 'nom-profil' } }, icone('user', { taille: 18 }), profil.nom || 'Profil sans nom'),
      h('div', { class: 'rs-profil-actions' },
        boutonIcone('monter-profil', 'arrow-up', `Monter ${profil.nom}`, () => deplacer(profil, -1), index === 0),
        boutonIcone('descendre-profil', 'arrow-down', `Descendre ${profil.nom}`, () => deplacer(profil, 1), index === total - 1))),
    profil.pourquoi ? h('p', { dataset: { role: 'pourquoi-profil' } }, profil.pourquoi) : phraseGrise('Note ce qui t’inspire chez cette personne.', 'pourquoi-vide'),
    (profil.piliers?.length || profil.formats?.length) ? h('div', { class: 'groupe-pastilles', dataset: { role: 'habitudes' } }, (profil.piliers || []).map((p) => pastillePilier(p)), (profil.formats || []).map((f) => pastilleGrise('format', R.libelleFormat(f) ?? f))) : null,
    h('div', { class: 'ligne-boutons' },
      profil.url ? lienExterne({ href: profil.url, libelle: 'Ouvrir LinkedIn', action: 'ouvrir-linkedin' }) : null,
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'modifier-profil' }, onclick: () => ouvrirProfil({ profil }) }, icone('pencil', { taille: 16 }), 'Modifier')),
    h('div', { class: 'rs-exemples', dataset: { role: 'exemples' } },
      h('div', { class: 'rs-exemples-tete' }, h('h3', {}, `Exemples de posts (${R.formaterNombre(exemples.length)})`),
        h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'nouvel-exemple' }, onclick: () => ouvrirExemple({ profil }) }, icone('plus', { taille: 16 }), 'Exemple')),
      exemples.length ? h('ul', { class: 'rs-liste' }, exemples.map((e) => ligneExemple(profil, e))) : phraseGrise('Aucun exemple pour le moment. Ajoute le lien d’un bon post et ce qui le rend efficace.', 'exemples-vides')));
}

// ---------------------------------------------------------------- écran

export function rendreInspirations(conteneur) {
  ajouterFeuille();
  const compteur = h('span', { class: 'compteur-liste', 'aria-live': 'polite' });
  const zone = h('div', { class: 'zone-inspirations' });
  const nouveau = () => ouvrirProfil();
  const bouton = h('button', { type: 'button', class: 'bouton bouton-principal', dataset: { action: 'nouvelle-inspiration' }, onclick: nouveau }, icone('plus', { taille: 16 }), 'Inspiration');
  conteneur.append(h('div', { class: 'page page-liste page-reseauxsociaux page-inspirations' },
    enteteListe({ titre: 'Inspirations', compteur, actions: [bouton] }), ongletsReseauxSociaux('reseauxsociaux/inspirations'), zone));

  function rendre() {
    if (!D.etat.pret) { remplir(compteur, ''); remplir(zone, chargement()); return; }
    const profils = N.trierInspirations(D.etat.inspirations);
    if (!profils.length) {
      remplir(compteur, '');
      remplir(zone, etatVide('Ajoute les profils qui t’inspirent.', { action: h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'nouvelle-inspiration-vide' }, onclick: nouveau }, icone('plus', { taille: 16 }), 'Ajouter un profil') }));
      return;
    }
    remplir(compteur, pluriel(profils.length, 'profil', 'profils'));
    remplir(zone, h('div', { class: 'rs-inspirations' }, profils.map((p, i) => carteProfil(p, i, profils.length))));
  }
  const arret = D.surChangement(rendre);
  rendre();
  return function quitter() { arret(); };
}
