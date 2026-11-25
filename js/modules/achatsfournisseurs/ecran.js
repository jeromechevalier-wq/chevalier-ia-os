// Écran « Fournisseurs » (module Achats) : UN tableau, une ligne par fournisseur et IBAN (à vérifier, en alerte, révoqués, confirmés), avec la barre commune des listes
// (recherche, Filtres, tri), le bouton « Exporter » et le menu « … » de chaque ligne (confirmer ou révoquer un IBAN : l'écriture passe par les actions métier, jamais par le navigateur).
// Pas de boutons de vue Kanban/Liste/Archives (rien à archiver : écart voulu) ni de « + Fournisseur » : les fournisseurs naissent des factures lues.
// Cinq états à l'écran : chargement, accès à régler (non réglé, badge à renouveler, réglages illisibles), erreur de lecture (« Réessayer »), liste vide, liste sans résultat (« Tout effacer »).
import { h, icone, remplir, vider, toast, dialogue, ouvrirMenu, iconeInfo, lirePreference, ecrirePreference } from '../../os/ui.js';
import { lien } from '../../os/router.js';
import { verifierAcces } from '../../os/acces-base.js';
import { enteteListe, barreListe } from '../crm/barre-liste.js';
import { texteAcces, TEXTE_CHARGEMENT } from '../achatscommun/etat.js';
import {
  actionsLigne, CRITERES_FOURNISSEURS_VIDES, CRITERES_TRI_FOURNISSEURS, criteresFournisseursActifs, detailsEtat, ETATS_FOURNISSEUR, filtrerFournisseurs, fusionner, ibanLisible,
  lireTriFournisseurs, LIBELLE_ACTION, LIBELLE_ETAT_FOURNISSEUR, nombreFiltresFournisseurs, pastillesFournisseurs, retirerCritereFournisseur, texteCompteur, trierFournisseurs, dateFr,
} from './logique.js';
import { lireFournisseurs, confirmerIban, revoquerIban } from './donnees.js';
import { exporterLignes } from './export.js';
import { TEXTE_RIEN_A_EXPORTER } from './csv.js';

export const TITRE = 'Fournisseurs';
export const AIDE = 'Les fournisseurs de l’espace et leurs IBAN, lus dans la base.';
export const MESSAGE_ERREUR_LECTURE = 'Impossible de charger les fournisseurs. Vérifie ta connexion, puis réessaie.';
export const TEXTE_VIDE = 'Aucun IBAN de fournisseur pour l’instant. Ils apparaissent quand une facture dont le fournisseur est identifié est lue.';
export const TEXTE_SANS_RESULTAT = 'Aucun fournisseur ne correspond à ta recherche.';
export const TEXTE_EXPLICATION = '« Confirmé » veut dire : une personne a vérifié cet IBAN pour ce fournisseur (appel à un numéro connu, RIB papier…). Cela ne rend pas le fournisseur sûr. Un fournisseur sans fiche (SIREN non lu sur ses factures) n’apparaît pas ici.';
export const PREFERENCE_TRI = 'tri.achatsfournisseurs';
const NB_COLONNES = 5;
const CLASSE_ETAT = { a_verifier: 'etat-attention', alerte: 'etat-retard', revoque: 'etat-retard', confirme: 'etat-succes' };
const ICONE_ACTION = { confirmer: 'circle-check', confirmer_quand_meme: 'circle-check', reconfirmer: 'circle-check', revoquer: 'x' };

/** Carte d'état d'accès : mêmes attributs que l'écran d'état commun (data-role « achats-etat », bouton « Revérifier » ou « Réessayer »). */
function carteAcces(etat, relancer) {
  const enAlerte = etat === 'reconnexion' || etat === 'illisible';
  const ICONES = { 'non-regle': 'link', reconnexion: 'triangle-alert', illisible: 'triangle-alert' };
  const bouton = (libelle, forcer = false) => h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer' }, onclick: () => relancer(forcer) }, icone('refresh-cw', { taille: 16 }), libelle);
  return h('section', { class: 'carte-section', role: enAlerte ? 'alert' : 'status', dataset: { role: 'achats-etat', etat } },
    h('p', { class: enAlerte ? 'mon-espace-erreur' : '', style: { display: 'flex', alignItems: 'flex-start', flexWrap: 'nowrap', gap: 'var(--esp-4)' } },
      h('span', { style: { flex: 'none', display: 'inline-flex' } }, icone(ICONES[etat] ?? 'triangle-alert', { taille: 18 })), h('span', { dataset: { role: 'achats-etat-texte' } }, texteAcces(etat))),
    etat === 'non-regle' ? h('a', { class: 'bouton bouton-secondaire', href: lien('reglages/base') }, icone('chevron-right', { taille: 16 }), 'Ouvrir la connexion à la base') : null,
    etat === 'reconnexion' ? bouton('Revérifier', true) : null,
    etat === 'illisible' ? bouton('Réessayer') : null);
}

/** Sélecteur « Trier par » (même rendu que celui des autres listes : menu + flèche de sens). `surChangement({ critere, sens })`. */
function selecteurTri({ options, valeur, sens, surChangement }) {
  let etat = { critere: valeur, sens };
  const menu = h('select', { class: 'champ champ-tri', 'aria-label': 'Trier par', onchange: (e) => {
    const c = options.find((o) => o.id === e.target.value);
    etat = { critere: e.target.value, sens: c?.sens || 'asc' };
    maj();
    surChangement({ ...etat });
  } });
  const fleche = h('button', { type: 'button', class: 'bouton-icone bouton-tri-sens', 'data-action': 'inverser-tri',
    onclick: () => { etat = { critere: etat.critere, sens: etat.sens === 'asc' ? 'desc' : 'asc' }; maj(); surChangement({ ...etat }); } });
  function maj() {
    remplir(menu, options.map((o) => h('option', { value: o.id, selected: o.id === etat.critere }, `Trier par : ${o.libelle}`)));
    menu.value = etat.critere;
    const texte = etat.sens === 'asc' ? 'croissant' : 'décroissant';
    fleche.setAttribute('aria-label', `Sens du tri : ${texte}. Inverser le sens`);
    fleche.title = `Sens du tri : ${texte}`;
    fleche.dataset.sens = etat.sens;
    remplir(fleche, icone(etat.sens === 'asc' ? 'arrow-up' : 'arrow-down', { taille: 16 }));
  }
  maj();
  return h('div', { class: 'selecteur-tri' }, menu, fleche);
}

/** Fenêtre « Filtres » : par état (plusieurs possibles). La recherche garde son propre champ. Renvoie les nouveaux critères, ou null si on ferme sans choisir. */
async function fenetreFiltres(criteres) {
  let etats = [...criteres.etats];
  const corps = h('div', { class: 'pile filtres-corps' }, h('fieldset', { class: 'groupe-cases' }, h('legend', { class: 'etiquette' }, 'État'),
    h('div', { class: 'cases' }, ETATS_FOURNISSEUR.map((e) => h('label', { class: 'case' },
      h('input', { type: 'checkbox', checked: etats.includes(e), dataset: { cle: 'etats', valeur: e }, onchange: (ev) => { etats = ev.target.checked ? [...etats, e] : etats.filter((v) => v !== e); } }),
      LIBELLE_ETAT_FOURNISSEUR[e])))));
  const r = await dialogue({
    titre: 'Filtres', classe: 'dialogue-formulaire dialogue-filtres', contenu: corps,
    boutons: [{ libelle: 'Tout effacer', valeur: 'effacer' }, { libelle: 'Appliquer', valeur: 'appliquer', style: 'principal' }],
  });
  if (r === 'effacer') return { ...CRITERES_FOURNISSEURS_VIDES, recherche: criteres.recherche };
  if (r === 'appliquer') return { ...criteres, etats };
  return null;
}

/**
 * Monte l'écran dans `conteneur`. Renvoie la fonction d'arrêt (la réponse tardive d'un écran quitté est ignorée).
 * `lire`, `confirmer`, `revoquer`, `verifier` se remplacent dans les tests.
 */
export function rendreEcran(conteneur, { lire = lireFournisseurs, confirmer = confirmerIban, revoquer = revoquerIban, verifier = verifierAcces } = {}) {
  const page = h('div', { class: 'page page-liste page-fournisseurs', dataset: { module: 'achats' } });
  vider(conteneur);
  conteneur.append(page);
  let vivant = true;
  let toutes = [];
  let criteres = { ...CRITERES_FOURNISSEURS_VIDES };
  let tri = lireTriFournisseurs(lirePreference(PREFERENCE_TRI, ''));
  let saisie = null; // { type: 'confirmer' | 'revoquer', cle }
  let formulaire = null; // le formulaire ouvert (gardé d'un redessin à l'autre : le texte tapé ne se perd pas)
  let enCours = false;
  let rafraichissement = 0; // numéro de la dernière lecture : une lecture plus ancienne qui arrive après est ignorée

  const entete = (compteurListe = null, actions = []) => enteteListe({ titre: h('div', { class: 'titre-avec-aide' }, h('h1', {}, TITRE), iconeInfo(TEXTE_EXPLICATION, 'fournisseurs et IBAN confirmés')), compteur: compteurListe, actions });

  function montrerChargement() {
    remplir(page, entete(), h('div', { class: 'chargement-bloc', role: 'status', dataset: { etat: 'chargement' } }, h('span', { class: 'rond-chargement' }), h('span', { class: 'aide' }, TEXTE_CHARGEMENT)));
  }
  function montrerAcces(etat) {
    remplir(page, entete(), h('p', { class: 'aide' }, AIDE), carteAcces(etat, (forcer) => demarrer(forcer)));
  }
  function montrerErreur() {
    remplir(page, entete(), h('div', { class: 'etat-vide carte-section', role: 'alert', dataset: { etat: 'erreur' } }, h('p', { class: 'mon-espace-erreur' }, MESSAGE_ERREUR_LECTURE),
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer' }, onclick: () => charger() }, icone('refresh-cw', { taille: 16 }), 'Réessayer')));
  }

  /** Vérifie l'accès (réglages + badge), puis lit les données. */
  async function demarrer(forcer = false) {
    montrerChargement();
    let etat = 'illisible';
    try { etat = (await verifier(forcer)).etat; } catch (e) { console.warn('Accès à la base : vérification impossible', e?.code ?? e?.message); }
    if (!vivant) return;
    if (etat !== 'connecte') { montrerAcces(etat); return; }
    await charger();
  }

  /** Lit les listes. `silencieux` : après une écriture, sans écran de chargement ni message d'erreur (la liste affichée reste). */
  async function charger(silencieux = false) {
    const numero = ++rafraichissement;
    if (!silencieux) montrerChargement();
    let r;
    try { r = await lire(); } catch (e) {
      if (!vivant || numero !== rafraichissement) return;
      if (silencieux) return;
      if (e?.code === 'reconnexion') montrerAcces('reconnexion'); else montrerErreur();
      return;
    }
    if (!vivant || numero !== rafraichissement) return;
    toutes = fusionner(r.file, r.confirmations);
    if (silencieux && zone) { avis.textContent = r.message; avis.hidden = !r.message; dessinerZone(); return; }
    dessinerPage(r.message);
  }

  // ---- la page (après une lecture réussie)
  let zone = null; let compteur = null; let boutonExport = null; let zonePastilles = null; let boutonFiltres = null; let barre = null; let avis = null; let champRecherche = null;

  function majFiltres() {
    const n = nombreFiltresFournisseurs(criteres);
    remplir(boutonFiltres, icone('funnel', { taille: 16 }), 'Filtres', n ? h('span', { class: 'compteur-filtres' }, String(n)) : null);
    remplir(zonePastilles,
      pastillesFournisseurs(criteres).map((p) => h('span', { class: 'pastille-filtre' }, p.libelle,
        h('button', { type: 'button', class: 'pastille-retrait', 'aria-label': `Retirer le filtre : ${p.libelle}`, onclick: () => { criteres = retirerCritereFournisseur(criteres, p); dessinerZone(); } }, icone('x', { taille: 12 })))),
      nombreFiltresFournisseurs(criteres) > 1 ? h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', onclick: () => { criteres = { ...criteres, etats: [] }; dessinerZone(); } }, 'Tout effacer') : null);
  }

  function fermerFormulaire() { saisie = null; formulaire = null; dessinerZone(); }

  function ouvrir(type, ligne) {
    if (saisie?.cle === ligne.cle && saisie.type === type) return; // déjà ouvert : on garde le texte déjà tapé
    saisie = { type, cle: ligne.cle };
    formulaire = construireFormulaire(type, ligne);
    dessinerZone();
    formulaire.champ.focus();
  }

  /** Formulaire placé SOUS la ligne cliquée : il rappelle de quoi on parle (nom, SIREN, IBAN en entier) avant de demander le texte. */
  function construireFormulaire(type, l) {
    let libelle; let bouton; let alerte = null;
    if (type === 'revoquer') {
      libelle = 'Pourquoi révoquer cette confirmation ? (obligatoire)'; bouton = 'Révoquer';
    } else {
      const e = actionsLigne(l);
      const direct = e[0] === 'confirmer';
      libelle = direct ? 'Comment as-tu vérifié cet IBAN ? (obligatoire)' : 'Pourquoi confirmer malgré l’alerte, et comment as-tu vérifié ? (obligatoire)';
      bouton = direct ? 'Confirmer cet IBAN' : 'Confirmer quand même';
      alerte = direct ? null : detailsEtat(l).find((d) => d.erreur)?.texte ?? null;
    }
    const champ = h('textarea', { class: 'champ', rows: 2, maxLength: 500, 'aria-label': libelle });
    const erreur = h('p', { class: 'erreur', role: 'alert', dataset: { role: 'erreur-action' } });
    const valider = h('button', { type: 'submit', class: 'bouton bouton-principal' }, bouton);
    const annuler = h('button', { type: 'button', class: 'bouton bouton-secondaire', onclick: fermerFormulaire }, 'Annuler');
    const el = h('form', { class: 'carte-section formulaire-iban', dataset: { role: 'formulaire-iban', type }, onsubmit: (ev) => { ev.preventDefault(); envoyer(); } },
      h('p', {}, h('strong', {}, l.nom ?? 'Fournisseur sans nom'), ` · SIREN ${l.siren}`, h('br'), 'IBAN ', h('span', { class: 'iban-complet' }, ibanLisible(l.iban))),
      alerte ? h('p', { class: 'erreur', role: 'alert' }, alerte) : null,
      h('label', { class: 'champ-etiquette' }, libelle, champ), erreur,
      h('div', { class: 'page-actions' }, valider, annuler));
    return { el, champ, erreur, valider, annuler, bouton };
  }

  function majFormulaire() {
    if (!formulaire) return;
    formulaire.valider.disabled = enCours;
    formulaire.valider.textContent = enCours ? 'Envoi…' : formulaire.bouton;
    formulaire.annuler.disabled = enCours;
    formulaire.champ.disabled = enCours;
  }

  async function envoyer() {
    if (!saisie || !formulaire || enCours) return;
    enCours = true; formulaire.erreur.textContent = ''; majFormulaire();
    const { type, cle } = saisie;
    const texte = formulaire.champ.value;
    try {
      const l = toutes.find((x) => x.cle === cle);
      if (type === 'confirmer') {
        // La ligne à vérifier d'origine est passée telle quelle : elle porte la facture qui sert de support à la confirmation.
        if (!l || l.source.type !== 'a_verifier') throw new Error('Cette ligne n’existe plus : la liste va être relue.');
        const r = await confirmer(l.source.ligne, texte);
        toast(r?.existait ? 'Cet IBAN était déjà confirmé' : 'IBAN confirmé');
      } else {
        if (!l || l.source.type !== 'confirme') throw new Error('Cette ligne n’existe plus : la liste va être relue.');
        await revoquer(l.source.confirmation.id, texte);
        toast('Confirmation révoquée');
      }
      saisie = null; formulaire = null; enCours = false;
      if (vivant) { dessinerZone(); await charger(true); }
    } catch (e) {
      enCours = false;
      if (!vivant) return;
      if (formulaire) { formulaire.erreur.textContent = e instanceof Error && e.message ? e.message : 'Une erreur est survenue, réessaie dans un instant.'; majFormulaire(); }
      charger(true); // un autre utilisateur a pu agir entre-temps : on relit, la saisie reste
    }
  }

  function menuLigne(l) {
    const actions = actionsLigne(l);
    if (!actions.length) return null;
    const nom = l.nom ?? 'Fournisseur sans nom';
    return h('button', {
      type: 'button', class: 'bouton-icone carte-menu', 'aria-label': `Actions : ${nom}`, 'aria-haspopup': 'menu', disabled: enCours, dataset: { action: 'menu-fournisseur' },
      onclick: (e) => ouvrirMenu(e.currentTarget, actions.map((a) => ({ libelle: LIBELLE_ACTION[a], icone: ICONE_ACTION[a], action: () => ouvrir(a === 'revoquer' ? 'revoquer' : 'confirmer', l) }))),
    }, icone('ellipsis', { taille: 16 }));
  }

  function ligneTableau(l) {
    const details = detailsEtat(l);
    const factures = l.source.type === 'a_verifier'
      ? [String(l.nbFactures), l.derniere ? h('span', { class: 'aide' }, ` · dernière le ${dateFr(l.derniere)}`) : null]
      : '—';
    const rangs = [h('tr', { class: 'ligne-liste', dataset: { cle: l.cle, etat: l.etat } },
      h('td', { dataset: { libelle: 'Fournisseur' } }, h('span', { class: 'cellule-nom' }, l.nom ?? '—'), h('span', { class: 'aide' }, ` · SIREN ${l.siren}`)),
      h('td', { class: 'col-iban', dataset: { libelle: 'IBAN' } }, ibanLisible(l.iban)),
      h('td', { dataset: { libelle: 'État' } }, h('span', { class: `etat-fournisseur ${CLASSE_ETAT[l.etat]}`, dataset: { role: 'etat' } }, LIBELLE_ETAT_FOURNISSEUR[l.etat]),
        details.map((d) => h('span', { class: `detail-etat${d.erreur ? ' erreur' : ''}` }, d.texte))),
      h('td', { class: 'col-factures', dataset: { libelle: 'Factures' } }, factures),
      h('td', { class: 'col-actions' }, menuLigne(l)))];
    if (saisie?.cle === l.cle && formulaire) rangs.push(h('tr', { class: 'ligne-saisie' }, h('td', { colSpan: NB_COLONNES }, formulaire.el)));
    return rangs;
  }

  /** Redessine ce qui dépend des critères : compteur, bouton d'export, pastilles et tableau (la barre de recherche, elle, n'est pas recréée : on garde le curseur). */
  function dessinerZone() {
    if (!zone) return;
    const visibles = trierFournisseurs(filtrerFournisseurs(toutes, criteres), tri);
    compteur.textContent = toutes.length ? texteCompteur(toutes, visibles.length) : '';
    barre.style.display = toutes.length ? '' : 'none';
    boutonExport.disabled = visibles.length === 0;
    boutonExport.title = visibles.length === 0 ? TEXTE_RIEN_A_EXPORTER : '';
    boutonExport.hidden = toutes.length === 0;
    majFiltres();
    if (toutes.length === 0) { remplir(zone, h('div', { class: 'etat-vide carte-section', role: 'status', dataset: { etat: 'vide' } }, h('p', {}, TEXTE_VIDE))); return; }
    if (visibles.length === 0) {
      remplir(zone, h('div', { class: 'etat-vide carte-section', role: 'status', dataset: { etat: 'sans-resultat' } }, h('p', {}, TEXTE_SANS_RESULTAT),
        criteresFournisseursActifs(criteres) ? h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'tout-effacer' }, onclick: () => { criteres = { ...CRITERES_FOURNISSEURS_VIDES }; if (champRecherche) champRecherche.value = ''; dessinerZone(); } }, 'Tout effacer') : null));
      return;
    }
    remplir(zone, h('div', { class: 'zone-tableau' }, h('table', { class: 'tableau tableau-fournisseurs' },
      h('thead', {}, h('tr', {}, ['Fournisseur', 'IBAN', 'État', 'Factures'].map((t) => h('th', { scope: 'col' }, t)), h('th', { scope: 'col', class: 'col-actions' }, h('span', { class: 'sr-only' }, 'Actions')))),
      h('tbody', {}, visibles.flatMap(ligneTableau)))));
  }

  function dessinerPage(message) {
    compteur = h('span', { class: 'compteur-liste', 'aria-live': 'polite' });
    boutonExport = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'exporter-fournisseurs' }, onclick: () => {
      const visibles = trierFournisseurs(filtrerFournisseurs(toutes, criteres), tri);
      if (exporterLignes(visibles)) toast('Liste téléchargée');
    } }, icone('download', { taille: 16 }), 'Exporter');
    boutonFiltres = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'filtres' }, onclick: async () => {
      const c = await fenetreFiltres(criteres);
      if (c) { criteres = c; dessinerZone(); }
    } });
    zonePastilles = h('div', { class: 'pastilles-actives' });
    avis = h('p', { class: 'aide', role: 'status', dataset: { role: 'avis-lecture' }, hidden: !message }, message || '');
    const choixTri = selecteurTri({ options: CRITERES_TRI_FOURNISSEURS, valeur: tri.critere, sens: tri.sens, surChangement: (t) => { tri = t; ecrirePreference(PREFERENCE_TRI, `${t.critere}:${t.sens}`); dessinerZone(); } });
    const b = barreListe({
      recherche: { placeholder: 'Rechercher un fournisseur', libelleAria: 'Rechercher un fournisseur', valeur: criteres.recherche, surSaisie: (v) => { criteres = { ...criteres, recherche: v }; dessinerZone(); } },
      elements: { filtres: boutonFiltres, pastilles: zonePastilles }, tri: choixTri,
    });
    barre = b.element; champRecherche = b.champ;
    zone = h('div', { class: 'zone-affaires' });
    remplir(page, entete(compteur, [boutonExport]), avis, barre, zone);
    dessinerZone();
  }

  demarrer(false);
  return () => { vivant = false; };
}
