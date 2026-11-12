// Écran « Idées » du module Réseaux sociaux (12/11/2026) : les idées de posts, en trois colonnes (Idée, En rédaction, Dans Buffer) ; les abandonnées se retrouvent par un filtre.
// PASSAGE DE TÉMOIN : tant que l'idée s'écrit, son texte vit ici (zone de rédaction de l'état « En rédaction ») ; quand l'idée passe « Dans Buffer », Buffer devient
// propriétaire et le module efface sa copie (règle dans idees-logique.js). Cette version n'écrit rien dans Buffer : l'état se change à la main.
// Un bouton « Tirer une contrainte » propose un pilier × format × service (aléa : Math.random ici, injecté dans la fonction pure pour les tests).
// Les textes viennent de l'utilisateur : toujours posés comme texte (la fabrique `h` crée des nœuds texte), jamais en HTML.
import { h, icone, remplir, dialogue, toast, confirmer } from '../../os/ui.js';
import { enteteListe, barreListe } from '../crm/barre-liste.js';
import { boutonFiltres, fenetreFiltres } from '../crm/filtres.js';
import { etatVide, pastilleEtiquette, MESSAGE_TEST_ECHEC } from '../crm/composants.js';
import * as D from './donnees.js';
import * as R from './logique.js';
import * as P from './posts-logique.js';
import * as I from './idees-logique.js';
import { enregistrerIdee, changerEtatIdee } from './idees-actions.js';
import { ongletsReseauxSociaux, chargement, pastillePilier, pastilleFormat, pastilleService, COULEUR_GRISE, champTexte, champListe, lienExterne } from './commun.js';

// Choix gardés jusqu'au rechargement de la page (remis à zéro à la déconnexion : `oublierFiltresIdees`).
let criteres = I.criteresIdees();
let contrainte = null;
let creneauDemande = null; // libellé du créneau de l'écran Aujourd'hui pour lequel on imagine un post (rappelé au-dessus de la contrainte)

// Feuille de style commune aux deux écrans, ajoutée au premier affichage (index.html reste inchangé).
function ajouterFeuille() {
  if (document.querySelector('link[data-reseauxsociaux="reseauxsociaux-idees"]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('../../../css/reseauxsociaux-idees.css', import.meta.url).href;
  l.dataset.reseauxsociaux = 'reseauxsociaux-idees';
  document.head.append(l);
}

export function oublierFiltresIdees() {
  criteres = I.criteresIdees();
  contrainte = null;
  creneauDemande = null;
}

const COULEUR_COLONNE = { idee: 'var(--gris-lilas)', en_redaction: 'var(--violet-clair)', dans_buffer: 'var(--vert)', abandonnee: 'var(--bordure-forte)' };
const LIBELLE_COLONNE = { idee: 'Idée', en_redaction: 'En rédaction', dans_buffer: 'Dans Buffer', abandonnee: 'Abandonnées' };
const phraseGrise = (texte, role = 'phrase-grise') => h('p', { class: 'aide', dataset: { role } }, texte);
const pluriel = (n, un, plusieurs) => `${R.formaterNombre(n)} ${n > 1 ? plusieurs : un}`;

// Un seul jeu de pastilles pour les trois étiquettes d'une idée : les mêmes que sur les posts ; une valeur absente est dite en gris.
const pastilleDe = (role, nom) => { const el = pastilleEtiquette({ nom, couleur: COULEUR_GRISE }); el.dataset.role = role; return el; };
const etiquettesIdee = (i) => h('div', { class: 'groupe-pastilles' },
  i.pilier ? pastillePilier(i.pilier) : pastilleDe('pilier-vide', 'Sans pilier'),
  i.format ? pastilleFormat(i.format) : pastilleDe('format-vide', 'Sans format'),
  i.service ? pastilleService(i.service) : pastilleDe('service-vide', 'Tous services'));

// ---------------------------------------------------------------- fenêtre « Idée » (création et modification)

/**
 * Fenêtre de création (`idee` nulle) ou de modification d'une idée. `prerempli` = { pilier, format, service } (la contrainte tirée).
 * « Enregistrer » reste grisé tant que l'angle est vide (ou, pour une idée existante, tant que rien n'a changé), puis jaune.
 * Passer l'état à « Dans Buffer » alors qu'un texte est écrit demande d'abord confirmation : le texte sera effacé d'ici.
 */
export function ouvrirIdee({ idee = null, prerempli = null } = {}) {
  const depart = {
    angle: idee?.angle ?? '', sources: I.normaliserSources(idee?.sources),
    pilier: R.convertirPilier(idee?.pilier ?? prerempli?.pilier), format: idee?.format ?? prerempli?.format ?? null, service: idee?.service ?? prerempli?.service ?? null,
    etat: idee?.etat ?? 'idee', texte: idee?.texte ?? '', lienId: idee?.lien?.id ?? '',
  };
  const v = { ...depart, sources: depart.sources.map((x) => ({ ...x })) };
  let bouton = null;
  let enCours = false;
  const erreur = h('p', { class: 'erreur', role: 'alert', dataset: { role: 'erreur-idee' } });
  const compteurTexte = h('p', { class: 'aide', dataset: { role: 'compteur-texte' } });

  const maj = () => {
    blocTexte.hidden = v.etat !== 'en_redaction';
    blocLien.hidden = v.etat !== 'dans_buffer';
    compteurTexte.textContent = `${R.formaterNombre(Array.from(v.texte).length)} / ${R.formaterNombre(R.LIMITE_LINKEDIN)} caractères`;
    compteurTexte.classList.toggle('erreur', Array.from(v.texte).length > R.LIMITE_LINKEDIN);
    if (!bouton) return;
    const change = JSON.stringify(v) !== JSON.stringify(depart);
    const ok = v.angle.trim() !== '' && (!idee || change);
    bouton.disabled = !ok;
    bouton.classList.toggle('bouton-principal', ok);
    bouton.classList.toggle('bouton-secondaire', !ok);
  };

  const angle = champTexte({ cle: 'angle', libelle: 'Angle de l’idée', valeur: v.angle, maxlength: I.MAX_ANGLE, placeholder: 'Ce que ce post raconterait, en une phrase', surSaisie: (x) => { v.angle = x; maj(); } });
  const pilier = champListe({ cle: 'pilier', libelle: 'Pilier', options: R.PILIERS, valeur: v.pilier, vide: 'À choisir', surChangement: (x) => { v.pilier = x; maj(); } });
  const format = champListe({ cle: 'format', libelle: 'Format', options: R.FORMATS, valeur: v.format, vide: 'À choisir', surChangement: (x) => { v.format = x; maj(); } });
  const service = champListe({ cle: 'service', libelle: 'Service', options: R.SERVICES, valeur: v.service, vide: 'Tous les services', surChangement: (x) => { v.service = x; maj(); } });
  // Sources : zéro, une ou plusieurs ; chacune garde de quoi retrouver les mots d'origine (adresse, section, extrait, date de consultation, copie archivée, résumé de la veille).
  const zoneSources = h('div', { class: 'pile rs-sources', dataset: { role: 'sources-editeur' } });
  function dessinerSources() {
    remplir(zoneSources, v.sources.map((src, k) => blocSource(src, k)),
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'ajouter-source' }, onclick: () => { v.sources.push({ type: 'libre', titre: '', url: '', ancre: '', extrait: '', consulteLe: '', archive: '', resume: '', motsCles: '' }); dessinerSources(); maj(); } }, icone('plus', { taille: 16 }), 'Source'));
  }
  function blocSource(src, k) {
    const champ = (cle, libelle, extra = {}) => { const c = champTexte({ cle: `${cle}-${k}`, libelle, valeur: src[cle] ?? '', maxlength: 600, surSaisie: (x) => { src[cle] = x; maj(); }, ...extra }); c.champ.dataset.source = cle; return c; };
    const type = champListe({ cle: `type-${k}`, libelle: 'Type de source', options: I.SOURCES_IDEE, valeur: src.type, surChangement: (x) => { src.type = x ?? 'libre'; dessinerSources(); maj(); } });
    type.champ.dataset.source = 'type';
    const consulte = champ('consulteLe', 'Consultée le', { maxlength: 10 }); consulte.champ.type = 'date';
    const veille = src.type === 'veille';
    return h('fieldset', { class: 'rs-source-editeur', dataset: { source: String(k) } }, h('legend', { class: 'etiquette' }, `Source ${k + 1}`),
      type.bloc, champ('titre', 'Titre', { maxlength: I.MAX_TITRE_SOURCE }).bloc, champ('url', 'Adresse (https), avec #ancre si le site en a une', { placeholder: 'exemple.test/page' }).bloc,
      champ('ancre', 'Section ou page', { maxlength: I.MAX_TITRE_SOURCE }).bloc,
      champ('extrait', 'Extrait : les mots de la source (facultatif)', { maxlength: I.MAX_EXTRAIT, multiligne: true, lignes: 3, aide: 'Colle quelques mots de la source : tu pourras les réécrire à ta façon.' }).bloc,
      consulte.bloc, champ('archive', 'Copie archivée (adresse, facultative)', { placeholder: 'exemple.test/page' }).bloc,
      veille ? champ('resume', 'Résumé du second cerveau (nom exact du fichier)', { maxlength: I.MAX_RESUME }).bloc : null,
      veille ? champ('motsCles', 'Mots-clés pour retrouver le passage dans le transcript', { maxlength: I.MAX_RESUME }).bloc : null,
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'retirer-source' }, onclick: () => { v.sources.splice(k, 1); dessinerSources(); maj(); } }, icone('trash-2', { taille: 16 }), 'Retirer cette source'));
  }
  dessinerSources();
  const etat = champListe({ cle: 'etat', libelle: 'État', options: I.ETATS_IDEE, valeur: v.etat, surChangement: (x) => { v.etat = x ?? 'idee'; maj(); } });
  const texte = champTexte({ cle: 'texte', libelle: 'Texte du post', valeur: v.texte, multiligne: true, lignes: 10, aide: 'Le texte vit ici tant que tu écris. Quand l’idée passe « Dans Buffer », il est effacé d’ici : Buffer devient son seul propriétaire.', surSaisie: (x) => { v.texte = x; maj(); } });
  const lienBuffer = champTexte({ cle: 'lien', libelle: 'Identifiant du post dans Buffer', valeur: v.lienId, maxlength: I.MAX_ID_LIEN, placeholder: 'Facultatif', aide: 'Si tu le connais : il relie cette idée à son post. Le texte, lui, se lit dans Buffer.', surSaisie: (x) => { v.lienId = x; maj(); } });
  const blocTexte = h('div', { class: 'pile' }, texte.bloc, compteurTexte); const blocLien = lienBuffer.bloc;

  const contenu = h('div', { class: 'pile' },
    angle.bloc,
    h('div', { class: 'ligne-champs' }, pilier.bloc, format.bloc, service.bloc),
    zoneSources,
    etat.bloc, blocTexte, blocLien, erreur);

  const valeursEcrites = () => ({
    angle: v.angle, pilier: v.pilier, format: v.format, service: v.service, etat: v.etat, texte: v.texte,
    sources: v.sources,
    // Le lien garde sa forme { reseau, outil, id } : un lien existant dont l'identifiant n'a pas changé reste tel quel ; un nouvel identifiant saisi est un lien Buffer sur LinkedIn.
    lien: v.lienId.trim() === '' ? null : (idee?.lien && idee.lien.id === v.lienId.trim() ? idee.lien : I.creerLien({ id: v.lienId })),
  });

  const boutons = [
    { libelle: 'Annuler', valeur: null },
    ...(idee && idee.etat !== 'abandonnee' ? [{ libelle: 'Abandonner l’idée', valeur: 'abandon', avantFermeture: async () => {
      if (enCours) return false;
      enCours = true; erreur.textContent = '';
      try { await changerEtatIdee(idee.id, 'abandonnee'); toast('Idée abandonnée'); return true; } catch (e) { console.warn(e); erreur.textContent = MESSAGE_TEST_ECHEC; return false; } finally { enCours = false; }
    } }] : []),
    { libelle: 'Enregistrer', valeur: true, desactive: true,
      avantFermeture: async () => {
        if (enCours) return false;
        erreur.textContent = '';
        const valeurs = valeursEcrites();
        const message = I.validerIdee(valeurs);
        if (message) { erreur.textContent = message; return false; }
        if (I.effaceraLeTexte({ etat: idee?.etat, texte: v.texte }, v.etat)
          && !await confirmer('Effacer le texte d’ici ?', 'Cette idée passe dans Buffer : son texte sera effacé du module, Buffer en devient le seul propriétaire. Vérifie qu’il y est bien.', { libelleOk: 'Passer dans Buffer' })) return false;
        enCours = true;
        try {
          await enregistrerIdee(idee?.id ?? null, valeurs);
          toast(idee ? 'Idée enregistrée' : 'Idée ajoutée');
          return true;
        } catch (e) {
          console.warn(e);
          erreur.textContent = e instanceof I.ErreurClaire ? e.message : MESSAGE_TEST_ECHEC;
          return false;
        } finally { enCours = false; }
      } },
  ];
  return dialogue({
    titre: idee ? 'Modifier cette idée' : 'Nouvelle idée',
    classe: 'dialogue-formulaire dialogue-idee',
    contenu,
    boutons,
    auMontage: ({ boutons: elements }) => { bouton = elements.at(-1); maj(); },
  });
}

// ---------------------------------------------------------------- Kanban

const jourLisible = (j) => `${R.libelleJour(j)} ${j.slice(0, 4)}`;
/** Les sources d'une idée sur sa carte : type + titre (lien qui s'ouvre dans un nouvel onglet, noopener), extrait entre guillemets en plus petit, date de consultation. Sans source : « Idée libre ». */
function sourcesCarte(idee) {
  const sources = I.normaliserSources(idee.sources);
  if (!sources.length) return h('span', { class: 'carte-sous', dataset: { role: 'source' } }, icone('link', { taille: 12 }), I.libelleSource('libre'));
  return h('div', { class: 'rs-sources-carte' }, sources.map((s) => h('div', { class: 'rs-source', dataset: { role: 'source', type: s.type }, onclick: (e) => e.stopPropagation() },
    h('span', { class: 'carte-sous' }, icone('link', { taille: 12 }), s.url ? lienExterne({ href: s.url, libelle: I.libelleSourceIdee(s), classe: 'lien-fiche', action: 'ouvrir-source', icone: 'external-link' }) : I.libelleSourceIdee(s), s.ancre ? ` · ${s.ancre}` : ''),
    s.extrait ? h('q', { class: 'rs-extrait-source', dataset: { role: 'extrait' } }, s.extrait) : null,
    s.consulteLe ? h('span', { class: 'rs-consulte', dataset: { role: 'consulte' } }, `Consultée le ${jourLisible(s.consulteLe)}`) : null)));
}

function carte(idee) {
  const ouvrir = () => ouvrirIdee({ idee });
  const ou = I.ouEstLeTexte(idee);
  return h('article', { class: 'carte-affaire carte-idee', tabindex: '0', dataset: { idee: idee.id, etat: idee.etat }, 'aria-label': `Modifier l’idée : ${idee.angle}`,
    onclick: ouvrir,
    onkeydown: (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) ouvrir(); } },
  h('div', { class: 'carte-ligne' }, h('strong', { class: 'carte-titre' }, idee.angle || 'Idée sans angle')),
  etiquettesIdee(idee),
  sourcesCarte(idee),
  h('span', { class: 'carte-sous', dataset: { role: 'lieu-texte', lieu: ou.lieu } }, icone('file-text', { taille: 12 }), ou.libelle));
}

function colonne(etat, idees) {
  return h('section', { class: 'colonne', dataset: { colonne: etat }, 'aria-label': LIBELLE_COLONNE[etat], style: { '--couleur': COULEUR_COLONNE[etat] } },
    h('header', { class: 'colonne-tete' }, h('h2', {}, LIBELLE_COLONNE[etat]), h('span', { class: 'colonne-totaux' }, pluriel(idees.length, 'idée', 'idées'))),
    h('div', { class: 'colonne-corps' }, idees.length ? idees.map(carte) : phraseGrise('Aucune idée.', 'colonne-vide')));
}

// ---------------------------------------------------------------- tirage d'une contrainte

/** Tire une contrainte avec l'historique des posts (suggestions de la matrice) ; sans lui (Buffer muet, aucun post), le tirage porte sur toutes les cases. */
async function tirer(aleatoire = Math.random) {
  await D.chargerBuffer();
  const b = D.etat.buffer;
  const matrice = P.matrice(P.fusionnerPosts(b.posts, D.etat.posts));
  return I.tirerContrainte(aleatoire, { suggestions: matrice.suggestions, classements: D.etat.posts, idees: D.etat.idees });
}

function carteContrainte(c, { relancer, creer, creneau = null }) {
  return h('section', { class: 'carte-section rs-contrainte', dataset: { carte: 'contrainte' } },
    h('h2', {}, icone('sparkles', { taille: 18 }), 'Contrainte tirée'),
    creneau ? h('p', { class: 'aide', dataset: { role: 'creneau-demande' } }, `Pour le créneau du ${creneau}`) : null,
    h('div', { class: 'groupe-pastilles', dataset: { role: 'contrainte' } }, pastillePilier(c.pilier), pastilleFormat(c.format), pastilleService(c.service)),
    h('p', { class: 'aide', dataset: { role: 'raison-contrainte' } }, c.origine === 'suggestion'
      ? 'Le pilier et le format sont ceux que la matrice de tes posts met en avant ; le service vient plus souvent parmi les moins travaillés.'
      : 'Pas encore de posts connus (ou Buffer ne répond pas) : le pilier et le format sont tirés parmi toutes les cases.'),
    h('div', { class: 'ligne-boutons' },
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'creer-avec-contrainte' }, onclick: creer }, icone('plus', { taille: 16 }), 'Créer une idée avec cette contrainte'),
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'tirer-encore' }, onclick: relancer }, icone('refresh-cw', { taille: 16 }), 'Tirer à nouveau')));
}

// ---------------------------------------------------------------- écran

export function rendreIdees(conteneur) {
  ajouterFeuille();
  const compteur = h('span', { class: 'compteur-liste', 'aria-live': 'polite' });
  const zone = h('div', { class: 'zone-idees' });
  const zoneContrainte = h('div', { class: 'zone-contrainte' });
  const zonePastilles = h('div', { class: 'pastilles-actives' });

  const nouvelle = (prerempli = null) => ouvrirIdee({ prerempli });
  const boutonIdee = h('button', { type: 'button', class: 'bouton bouton-principal', dataset: { action: 'nouvelle-idee' }, onclick: () => nouvelle() }, icone('plus', { taille: 16 }), 'Idée');
  const boutonTirer = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'tirer-contrainte' }, onclick: () => { creneauDemande = null; lancerTirage(); } }, icone('sparkles', { taille: 16 }), 'Tirer une contrainte');

  async function lancerTirage() {
    boutonTirer.disabled = true;
    try { contrainte = await tirer(); } catch (e) { console.warn(e); toast(MESSAGE_TEST_ECHEC, { type: 'erreur' }); } finally { boutonTirer.disabled = false; }
    rendre();
  }

  const filtres = boutonFiltres({ auClic: async () => {
    const r = await fenetreFiltres({
      controles: [
        { cle: 'piliers', libelle: 'Pilier', type: 'cases', options: R.PILIERS.map((p) => ({ valeur: p.id, libelle: p.libelle })) },
        { cle: 'formats', libelle: 'Format', type: 'cases', options: R.FORMATS.map((f) => ({ valeur: f.id, libelle: f.libelle })) },
        { cle: 'services', libelle: 'Service', type: 'cases', options: R.SERVICES.map((s) => ({ valeur: s.id, libelle: s.libelle })) },
        { cle: 'sources', libelle: 'Source', type: 'cases', options: I.SOURCES_IDEE.map((s) => ({ valeur: s.id, libelle: s.libelle })) },
        { cle: 'abandonnees', libelle: 'Abandonnées seulement', type: 'oui' },
      ],
      criteres, effacer: () => ({ ...I.criteresIdees(), recherche: criteres.recherche }),
    });
    if (r) { criteres = { ...I.criteresIdees(), ...r }; rendre(); }
  } });
  const barre = barreListe({
    recherche: { placeholder: 'Rechercher une idée', libelleAria: 'Rechercher une idée (angle ou résumé)', valeur: criteres.recherche, surSaisie: (x) => { criteres = { ...criteres, recherche: x }; rendre(); } },
    elements: { filtres: filtres.element, pastilles: zonePastilles },
  });

  const retirer = (cle, valeur) => { criteres = { ...criteres, [cle]: cle === 'abandonnees' ? false : criteres[cle].filter((x) => x !== valeur) }; rendre(); };
  function pastillesActives() {
    const liste = [
      ...criteres.piliers.map((x) => ['piliers', x, `Pilier : ${R.libellePilier(x) ?? x}`]),
      ...criteres.formats.map((x) => ['formats', x, `Format : ${R.libelleFormat(x) ?? x}`]),
      ...criteres.services.map((x) => ['services', x, `Service : ${R.libelleService(x) ?? x}`]),
      ...criteres.sources.map((x) => ['sources', x, `Source : ${I.libelleSource(x) ?? x}`]),
      ...(criteres.abandonnees ? [['abandonnees', true, 'Abandonnées seulement']] : []),
    ];
    remplir(zonePastilles, liste.map(([cle, valeur, libelle]) => h('span', { class: 'pastille-filtre' }, libelle,
      h('button', { type: 'button', class: 'pastille-retrait', 'aria-label': `Retirer le filtre : ${libelle}`, onclick: () => retirer(cle, valeur) }, icone('x', { taille: 12 })))));
  }

  conteneur.append(h('div', { class: 'page page-liste page-reseauxsociaux page-idees' },
    enteteListe({ titre: 'Idées', compteur, actions: [boutonTirer, boutonIdee] }),
    ongletsReseauxSociaux('reseauxsociaux/idees'), zoneContrainte, barre.element, zone));

  function rendre() {
    filtres.majCompte(I.nombreFiltresIdees(criteres));
    pastillesActives();
    if (barre.champ.value !== criteres.recherche && document.activeElement !== barre.champ) barre.champ.value = criteres.recherche;
    remplir(zoneContrainte, contrainte ? carteContrainte(contrainte, { creneau: creneauDemande, relancer: () => lancerTirage(), creer: () => nouvelle({ pilier: contrainte.pilier, format: contrainte.format, service: contrainte.service }) }) : null);
    if (!D.etat.pret) { remplir(compteur, ''); remplir(zone, chargement()); return; }
    const toutes = D.etat.idees;
    if (!toutes.length) {
      remplir(compteur, '');
      remplir(zone, etatVide('Aucune idée pour le moment. Note ta première idée, ou tire une contrainte pour te lancer.', { action: h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'nouvelle-idee-vide' }, onclick: () => nouvelle() }, icone('plus', { taille: 16 }), 'Noter une idée') }));
      return;
    }
    const gardees = I.filtrerIdees(toutes, criteres);
    const total = toutes.filter((i) => (i.etat === 'abandonnee') === criteres.abandonnees).length;
    remplir(compteur, `${pluriel(gardees.length, 'idée', 'idées')}${gardees.length !== total ? ` sur ${R.formaterNombre(total)}` : ''}`);
    const colonnes = I.colonnesIdees(gardees, { abandonnees: criteres.abandonnees });
    remplir(zone, h('div', { class: 'kanban kanban-idees' }, Object.entries(colonnes).map(([etat, liste]) => colonne(etat, liste))),
      criteres.abandonnees && !gardees.length ? phraseGrise('Aucune idée abandonnée.', 'aucune-abandonnee') : null);
  }

  const arret = D.surChangement(rendre);
  const demande = D.prendreTirageDemande(); // « Imaginer un post pour ce créneau » de l'écran Aujourd'hui
  if (demande) creneauDemande = demande;
  rendre();
  if (demande) lancerTirage();
  return function quitter() { arret(); };
}
