// Écran « Inspirations » du module Réseaux sociaux (12/11/2026, refait en liste dense le 13/11/2026) : les sources qui inspirent (profil LinkedIn, site, résumé de veille), une ligne par source qui se déplie,
// et sous chaque source une ligne par piste de post (couleur = pilier, marque = état). Les profils gardent leur bibliothèque d'exemples de bons posts.
// Un exemple = le LIEN d'un post et son ANALYSE (accroche, structure, longueur, format, pilier, service, pourquoi ça marche) et ses chiffres relevés. Jamais le texte du post (droit d'auteur).
// Les adresses s'ouvrent dans un nouvel onglet (rel noopener) ; elles sont revalidées à l'affichage (https, et domaine linkedin.com pour un profil), jamais prises telles que lues en base.
// Les textes viennent de l'utilisateur : toujours posés comme texte (la fabrique `h` crée des nœuds texte), jamais en HTML.
import { h, icone, remplir, dialogue, toast } from '../../os/ui.js';
import { enteteListe, barreListe, basculeVues } from '../crm/barre-liste.js';
import { boutonFiltres, fenetreFiltres } from '../crm/filtres.js';
import { etatVide, pastilleEtiquette, MESSAGE_TEST_ECHEC } from '../crm/composants.js';
import * as D from './donnees.js';
import * as R from './logique.js';
import * as I from './idees-logique.js';
import * as N from './inspirations-logique.js';
import * as P from './pistes-logique.js';
import * as V from './inspirations-vue-logique.js';
import { lignePiste, ouvrirTirerIdees } from './pistes-ecran.js';
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

// Ce qui reste d'un affichage à l'autre : les filtres, la vue et les sources dépliées (un nouveau lot de pistes ne referme rien).
let criteres = V.criteresInspirations();
let vue = 'source';
const ouvertes = new Set();
export function oublierFiltresInspirations() { criteres = V.criteresInspirations(); vue = 'source'; ouvertes.clear(); }

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

// ---------------------------------------------------------------- fenêtre « Source » (profil LinkedIn, site ou résumé de veille)

const LIBELLE_URL = { profil: 'Adresse du profil sur LinkedIn', site: 'Adresse du site', veille: 'Adresse du résumé (facultatif)' };
const PLACEHOLDER_URL = { profil: 'linkedin.com/in/…', site: 'exemple.com', veille: 'exemple.com/resume' };
const ICONE_TYPE = { profil: 'user', site: 'globe', veille: 'file-text' };

function ouvrirSource({ source = null } = {}) {
  const type0 = N.typeSource(source ?? {});
  const depart = { type: type0, nom: source?.nom ?? '', url: source?.url ?? '', pourquoi: source?.pourquoi ?? '', resume: source?.resume ?? '', piliers: [...(source?.piliers ?? [])].map(R.convertirPilier).filter(Boolean), formats: [...(source?.formats ?? [])] };
  const v = { ...depart, piliers: new Set(depart.piliers), formats: new Set(depart.formats) };
  const instantane = () => JSON.stringify({ ...v, piliers: [...v.piliers].sort(), formats: [...v.formats].sort() });
  const initial = instantane();
  let bouton = null;
  let enCours = false;
  const erreur = h('p', { class: 'erreur', role: 'alert', dataset: { role: 'erreur-profil' } });
  const maj = () => {
    if (!bouton) return;
    const ok = v.nom.trim() !== '' && (v.type === 'veille' || v.url.trim() !== '') && (!source || instantane() !== initial);
    bouton.disabled = !ok;
    bouton.classList.toggle('bouton-principal', ok);
    bouton.classList.toggle('bouton-secondaire', !ok);
  };
  const type = champListe({ cle: 'type', libelle: 'Type de source', options: N.TYPES_SOURCE, valeur: v.type, surChangement: (x) => { v.type = x; adapter(); maj(); } });
  if (source) type.champ.disabled = true; // le type d'une source ne change pas : ses pistes et son prompt en dépendent
  const nom = champTexte({ cle: 'nom', libelle: 'Nom', valeur: v.nom, maxlength: N.MAX_NOM, surSaisie: (x) => { v.nom = x; maj(); } });
  const url = champTexte({ cle: 'url', libelle: LIBELLE_URL[v.type], valeur: v.url, maxlength: N.MAX_URL, placeholder: PLACEHOLDER_URL[v.type], surSaisie: (x) => { v.url = x; maj(); } });
  const pourquoi = champTexte({ cle: 'pourquoi', libelle: 'Ce qui m’inspire', valeur: v.pourquoi, maxlength: N.MAX_ANALYSE, multiligne: true, lignes: 3, surSaisie: (x) => { v.pourquoi = x; maj(); } });
  const resume = champTexte({ cle: 'resume', libelle: 'Nom exact du fichier résumé (facultatif)', valeur: v.resume, maxlength: I.MAX_RESUME, surSaisie: (x) => { v.resume = x; maj(); } });
  function adapter() {
    url.bloc.querySelector('label').textContent = LIBELLE_URL[v.type];
    url.champ.placeholder = PLACEHOLDER_URL[v.type];
    resume.bloc.hidden = v.type !== 'veille';
  }
  adapter();
  const contenu = h('div', { class: 'pile' }, type.bloc, nom.bloc, url.bloc, pourquoi.bloc, resume.bloc,
    groupeCases({ cle: 'pilier', legende: 'Piliers habituels (facultatif)', options: R.PILIERS, prises: v.piliers, surChangement: maj }),
    groupeCases({ cle: 'format', legende: 'Formats habituels (facultatif)', options: R.FORMATS, prises: v.formats, surChangement: maj }),
    erreur);
  return dialogue({
    titre: source ? (type0 === 'profil' ? 'Modifier ce profil' : 'Modifier cette source') : 'Nouvelle source',
    classe: 'dialogue-formulaire dialogue-inspiration',
    contenu,
    boutons: [
      { libelle: 'Annuler', valeur: null },
      { libelle: 'Enregistrer', valeur: true, desactive: true,
        avantFermeture: async () => {
          if (enCours) return false;
          enCours = true; erreur.textContent = '';
          try {
            await enregistrerInspiration(source?.id ?? null, { type: v.type, nom: v.nom, url: v.url, pourquoi: v.pourquoi, resume: v.resume, piliers: [...v.piliers], formats: [...v.formats] });
            toast(source ? 'Source enregistrée' : 'Source ajoutée');
            return true;
          } catch (e) { console.warn(e); erreur.textContent = messageErreur(e); return false; } finally { enCours = false; }
        } },
    ],
    auMontage: ({ boutons }) => { bouton = boutons.at(-1); maj(); },
  });
}

// ---------------------------------------------------------------- fenêtre « Exemple de post »

/** Ajouter ou modifier un exemple de post (profils seulement). */
function ouvrirExemple({ profil, exemple = null }) {
  const depart = { reactions: exemple?.reactions ?? null, commentaires: exemple?.commentaires ?? null, releveLe: exemple?.releveLe ?? '', url: exemple?.url ?? '', date: exemple?.date ?? '', accroche: exemple?.accroche ?? '', extrait: exemple?.extrait ?? '', structure: exemple?.structure ?? '', longueur: exemple?.longueur ?? '',
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
  const entier = (x) => (x.trim() === '' ? null : Number(x));
  const reactions = champTexte({ cle: 'reactions', libelle: 'Réactions (relevées)', valeur: v.reactions ?? '', surSaisie: (x) => { v.reactions = entier(x); maj(); } });
  const commentaires = champTexte({ cle: 'commentaires', libelle: 'Commentaires (relevés)', valeur: v.commentaires ?? '', surSaisie: (x) => { v.commentaires = entier(x); maj(); } });
  for (const c of [reactions.champ, commentaires.champ]) { c.type = 'number'; c.min = '0'; c.step = '1'; c.inputMode = 'numeric'; }
  const releve = champTexte({ cle: 'releveLe', libelle: 'Date du relevé', valeur: v.releveLe, surSaisie: (x) => { v.releveLe = x; maj(); } });
  releve.champ.type = 'date';
  const format = champListe({ cle: 'format', libelle: 'Format', options: R.FORMATS, valeur: v.format, vide: 'À choisir', surChangement: (x) => { v.format = x; maj(); } });
  const pilier = champListe({ cle: 'pilier', libelle: 'Pilier', options: R.PILIERS, valeur: v.pilier, vide: 'À choisir', surChangement: (x) => { v.pilier = x; maj(); } });
  const service = champListe({ cle: 'service', libelle: 'Service', options: R.SERVICES, valeur: v.service, vide: 'Tous les services', surChangement: (x) => { v.service = x; maj(); } });
  const contenu = h('div', { class: 'pile' },
    h('p', { class: 'aide' }, `Profil : ${profil.nom}`),
    url.bloc, date.bloc, accroche.bloc, extrait.bloc, structure.bloc, longueur.bloc,
    h('div', { class: 'ligne-champs' }, reactions.bloc, commentaires.bloc, releve.bloc),
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

// ---------------------------------------------------------------- sources et exemples

const libelleJourPost = (jour) => `${R.libelleJour(jour)} ${jour.slice(0, 4)}`;
const ligneAnalyse = (libelle, valeur, role) => (valeur ? h('p', { class: 'rs-analyse', dataset: { role } }, h('strong', {}, `${libelle} : `), valeur) : null);

/** Un exemple sur une ligne (accroche, date, chiffres relevés, écart à la moyenne, date du relevé), son analyse en petit dessous. */
function ligneExemple(profil, e) {
  const chiffres = V.chiffresExemple(e, profil);
  const href = N.normaliserUrlLinkedin(e.url);
  return h('li', { class: 'rs-exemple', dataset: { exemple: e.id } },
    h('div', { class: 'rs-exemple-tete' },
      h('strong', { class: 'rs-exemple-titre', dataset: { role: 'accroche' } }, e.accroche || 'Post sans accroche notée'),
      e.date ? h('span', { class: 'carte-sous', dataset: { role: 'date-exemple' } }, icone('calendar', { taille: 12 }), libelleJourPost(e.date)) : null,
      chiffres ? h('span', { class: 'carte-sous', dataset: { role: 'chiffres-exemple' } }, chiffres) : null,
      e.releveLe ? h('span', { class: 'carte-sous', dataset: { role: 'releve-exemple' } }, `relevé le ${libelleJourPost(e.releveLe)}`) : null),
    h('div', { class: 'groupe-pastilles' }, e.pilier ? pastillePilier(e.pilier) : null, e.format ? pastilleFormat(e.format) : null, e.service ? pastilleService(e.service) : null),
    e.extrait ? h('q', { class: 'rs-extrait-source', dataset: { role: 'extrait' } }, e.extrait) : null,
    ligneAnalyse('Structure', e.structure, 'structure'), ligneAnalyse('Longueur', e.longueur, 'longueur'), ligneAnalyse('Pourquoi ça marche', e.pourquoi, 'pourquoi'),
    h('div', { class: 'ligne-boutons' },
      href ? lienExterne({ href, libelle: 'Voir le post', action: 'ouvrir-post' }) : null,
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'modifier-exemple' }, onclick: () => ouvrirExemple({ profil, exemple: e }) }, icone('pencil', { taille: 16 }), 'Modifier')));
}

async function deplacer(source, sens) {
  try { await deplacerInspiration(source.id, sens); } catch (e) { console.warn(e); toast(MESSAGE_TEST_ECHEC, { type: 'erreur' }); }
}

const boutonIcone = (action, ic, libelle, auClic, desactive) => h('button', { type: 'button', class: 'bouton-icone', dataset: { action }, 'aria-label': libelle, title: libelle, disabled: desactive, onclick: auClic }, icone(ic, { taille: 16 }));

/** Une source : une ligne (nom qui déplie, compteurs, « En tirer des idées », ▲ ▼) et, dépliée, ses détails, ses pistes et (profil) ses exemples. */
function carteSource(ligne, reelles, surChangement, { filtre = false } = {}) {
  const { source, pistes, total, compteurs } = ligne;
  const ouverte = ouvertes.has(source.id);
  const rang = reelles.findIndex((p) => p.id === source.id);
  const href = N.normaliserUrlSource(source.type, source.url);
  const exemples = source.type === 'profil' ? N.exemplesDe(D.etat.exemples, source.id) : [];
  const deplier = () => { if (ouvertes.has(source.id)) ouvertes.delete(source.id); else ouvertes.add(source.id); surChangement(); };
  const entete = h('div', { class: 'rs-source-tete' },
    h('h2', { class: 'rs-source-titre' },
      h('button', { type: 'button', class: 'rs-deplier', 'aria-expanded': String(ouverte), dataset: { action: 'deplier-source' }, onclick: deplier },
        icone(ouverte ? 'chevron-down' : 'chevron-right', { taille: 16 }), icone(ICONE_TYPE[source.type], { taille: 18 }),
        h('span', { class: 'rs-source-nom', dataset: { role: 'nom-profil' } }, source.nom || 'Source sans nom'))),
    h('span', { class: 'rs-compteurs', dataset: { role: 'compteurs-source' } }, V.libelleCompteurs(compteurs)),
    h('div', { class: 'rs-profil-actions' },
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'tirer-idees' }, onclick: () => ouvrirTirerIdees({ source }) }, icone('sparkles', { taille: 16 }), 'En tirer des idées'),
      source.virtuelle ? null : boutonIcone('monter-profil', 'arrow-up', `Monter ${source.nom}`, () => deplacer(source, -1), rang <= 0 || filtre),
      source.virtuelle ? null : boutonIcone('descendre-profil', 'arrow-down', `Descendre ${source.nom}`, () => deplacer(source, 1), rang < 0 || rang === reelles.length - 1 || filtre)));
  let corps = null;
  if (ouverte) {
    corps = h('div', { class: 'rs-source-corps', dataset: { role: 'corps-source' } },
      source.virtuelle ? phraseGrise('Résumé de veille repéré tout seul dans la Veille. Il devient une source quand tu y déposes tes premières pistes.', 'veille-auto')
        : (source.pourquoi ? h('p', { dataset: { role: 'pourquoi-profil' } }, source.pourquoi) : phraseGrise('Note ce qui t’inspire ici.', 'pourquoi-vide')),
      (source.piliers?.length || source.formats?.length) ? h('div', { class: 'groupe-pastilles', dataset: { role: 'habitudes' } }, (source.piliers || []).map((p) => pastillePilier(p)), (source.formats || []).map((f) => pastilleGrise('format', R.libelleFormat(f) ?? f))) : null,
      source.virtuelle ? null : h('div', { class: 'ligne-boutons' },
        href ? lienExterne({ href, libelle: source.type === 'profil' ? 'Ouvrir LinkedIn' : 'Ouvrir le lien', action: source.type === 'profil' ? 'ouvrir-linkedin' : 'ouvrir-source' }) : null,
        h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'modifier-profil' }, onclick: () => ouvrirSource({ source }) }, icone('pencil', { taille: 16 }), 'Modifier')),
      h('div', { class: 'rs-pistes', dataset: { role: 'pistes' } },
        h('h4', { class: 'rs-titre-pistes' }, `Pistes (${R.formaterNombre(pistes.length)}${pistes.length !== total ? ` sur ${R.formaterNombre(total)}` : ''})`),
        pistes.length ? h('ul', { class: 'rs-liste rs-pistes-liste' }, pistes.map((p) => lignePiste(p)))
          : phraseGrise(total ? 'Aucune piste ne correspond aux filtres.' : 'Aucune piste pour le moment. Clique sur « En tirer des idées ».', 'pistes-vides')),
      source.type === 'profil' ? h('div', { class: 'rs-exemples', dataset: { role: 'exemples' } },
        h('div', { class: 'rs-exemples-tete' }, h('h3', {}, `Exemples de posts (${R.formaterNombre(exemples.length)})`),
          h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'nouvel-exemple' }, onclick: () => ouvrirExemple({ profil: source }) }, icone('plus', { taille: 16 }), 'Exemple')),
        exemples.length ? h('ul', { class: 'rs-liste' }, exemples.map((e) => ligneExemple(source, e))) : phraseGrise('Aucun exemple pour le moment. Ajoute le lien d’un bon post et ce qui le rend efficace.', 'exemples-vides')) : null);
  }
  return h('section', { class: `carte-section carte-inspiration rs-source rs-source-${source.type}`, dataset: { inspiration: source.id, type: source.type, ouverte: String(ouverte) } }, entete, corps);
}

// ---------------------------------------------------------------- écran

export function rendreInspirations(conteneur) {
  ajouterFeuille();
  const compteur = h('span', { class: 'compteur-liste', 'aria-live': 'polite' });
  const zone = h('div', { class: 'zone-inspirations' });
  const zonePastilles = h('div', { class: 'pastilles-actives' });
  const nouveau = () => ouvrirSource();
  const bouton = h('button', { type: 'button', class: 'bouton bouton-principal', dataset: { action: 'nouvelle-inspiration' }, onclick: nouveau }, icone('plus', { taille: 16 }), 'Source');

  const filtres = boutonFiltres({ auClic: async () => {
    const r = await fenetreFiltres({
      controles: [
        { cle: 'types', libelle: 'Type de source', type: 'cases', options: N.TYPES_SOURCE.map((t) => ({ valeur: t.id, libelle: t.libelle })) },
        { cle: 'piliers', libelle: 'Pilier des pistes', type: 'cases', options: R.PILIERS.map((p) => ({ valeur: p.id, libelle: p.libelle })) },
        { cle: 'formats', libelle: 'Format des pistes', type: 'cases', options: R.FORMATS.map((f) => ({ valeur: f.id, libelle: f.libelle })) },
        { cle: 'etats', libelle: 'État des pistes', type: 'cases', options: V.ETATS_AFFICHES.map((e) => ({ valeur: e.id, libelle: e.libelle })) },
        { cle: 'sansPiste', libelle: 'Sources sans piste seulement', type: 'oui' },
      ],
      criteres, effacer: () => ({ ...V.criteresInspirations(), recherche: criteres.recherche }),
    });
    if (r) { criteres = { ...V.criteresInspirations(), ...r }; rendre(); }
  } });
  const vues = basculeVues({ vues: [['source', 'Par source', 'list'], ['plat', 'Toutes les pistes', 'columns-3']], courante: vue, surChangement: (x) => { vue = x; rendre(); } });
  const barre = barreListe({
    recherche: { placeholder: 'Rechercher une source ou une piste', libelleAria: 'Rechercher une source ou une piste (nom, angle ou note)', valeur: criteres.recherche, surSaisie: (x) => { criteres = { ...criteres, recherche: x }; rendre(); } },
    elements: { filtres: filtres.element, vues, pastilles: zonePastilles },
  });
  conteneur.append(h('div', { class: 'page page-liste page-reseauxsociaux page-inspirations' },
    enteteListe({ titre: 'Inspirations', compteur, actions: [bouton] }), ongletsReseauxSociaux('reseauxsociaux/inspirations'), barre.element, zone));

  const retirer = (cle, valeur) => { criteres = { ...criteres, [cle]: cle === 'sansPiste' ? false : criteres[cle].filter((x) => x !== valeur) }; rendre(); };
  function pastillesActives() {
    const liste = [
      ...criteres.types.map((x) => ['types', x, `Type : ${N.libelleTypeSource({ type: x })}`]),
      ...criteres.piliers.map((x) => ['piliers', x, `Pilier : ${R.libellePilier(x) ?? x}`]),
      ...criteres.formats.map((x) => ['formats', x, `Format : ${R.libelleFormat(x) ?? x}`]),
      ...criteres.etats.map((x) => ['etats', x, `État : ${V.libelleEtatAffiche(x) || x}`]),
      ...(criteres.sansPiste ? [['sansPiste', true, 'Sans piste']] : []),
    ];
    remplir(zonePastilles, liste.map(([cle, valeur, libelle]) => h('span', { class: 'pastille-filtre' }, libelle,
      h('button', { type: 'button', class: 'pastille-retrait', 'aria-label': `Retirer le filtre : ${libelle}`, onclick: () => retirer(cle, valeur) }, icone('x', { taille: 12 })))));
  }

  function rendre() {
    filtres.majCompte(V.nombreFiltresInspirations(criteres));
    pastillesActives();
    for (const b of vues.querySelectorAll('.bascule-vue')) { const actif = b.dataset.vue === vue; b.classList.toggle('actif', actif); b.setAttribute('aria-pressed', String(actif)); }
    if (barre.champ.value !== criteres.recherche && document.activeElement !== barre.champ) barre.champ.value = criteres.recherche;
    if (!D.etat.pret) { remplir(compteur, ''); remplir(zone, chargement()); return; }
    const reelles = N.trierInspirations(D.etat.inspirations);
    const sources = V.sourcesAffichees(D.etat.inspirations, D.etat.veilleContenus);
    if (!sources.length) {
      remplir(compteur, '');
      remplir(zone, etatVide('Ajoute les profils qui t’inspirent.', { action: h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'nouvelle-inspiration-vide' }, onclick: nouveau }, icone('plus', { taille: 16 }), 'Ajouter une source') }));
      return;
    }
    const sousFiltre = V.nombreFiltresInspirations(criteres) > 0 || criteres.recherche.trim() !== ''; // sous filtre, ▲ ▼ seraient trompeurs (l'échange peut viser une source cachée)
    const lignes = V.filtrerSources(sources, D.etat.pistes, D.etat.idees, criteres);
    const nbPistes = lignes.reduce((n, l) => n + l.pistes.length, 0);
    remplir(compteur, `${pluriel(lignes.length, 'source', 'sources')} · ${pluriel(nbPistes, 'piste', 'pistes')}`);
    if (!lignes.length) {
      remplir(zone, phraseGrise('Aucune source ne correspond à ta recherche ou à tes filtres.', 'aucun-resultat'));
      return;
    }
    if (vue === 'plat') {
      const plat = V.pistesAPlat(lignes);
      remplir(zone, plat.length ? h('ul', { class: 'rs-liste rs-pistes-liste rs-pistes-plat', dataset: { role: 'pistes-plat' } }, plat.map(({ piste, source }) => lignePiste(piste, { nomSource: source.nom })))
        : phraseGrise(sousFiltre ? 'Aucune piste ne correspond à ta recherche ou à tes filtres.' : 'Aucune piste pour le moment. Ouvre une source et clique sur « En tirer des idées ».', 'plat-vide'));
      return;
    }
    remplir(zone, h('div', { class: 'rs-inspirations' }, lignes.map((l) => carteSource(l, reelles, rendre, { filtre: sousFiltre }))));
  }
  const arret = D.surChangement(rendre);
  rendre();
  return function quitter() { arret(); };
}
