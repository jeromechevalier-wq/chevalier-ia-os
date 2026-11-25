// Écran « Articles » (module Achats) : le dirigeant relie chaque article de ses fournisseurs à SON article interne, avec un coefficient. L'IA peut suggérer ; seul un humain valide.
// Lecture seule par la couche d'accès à la base (donnees.js) ; toute écriture passe par les actions métier (actions.js). La liste est relue après chaque écriture.
//
// UNE SEULE LISTE de tous les articles : case à cocher à gauche, pastille de rapprochement à droite, filtres en un clic. Une barre d'action (en bas) apparaît dès qu'une case est cochée ;
// son seul bouton dépend de la sélection (selection.js) : « Rapprocher ces N articles » ou « Ajouter au groupe « … » » (deux groupes cochés : pas de bouton, un texte d'aide).
// Les cases ne sont jamais grisées. Sortir un article d'un groupe se fait dans la fenêtre du groupe (décocher puis « Enregistrer »), jamais dans la barre.
// Filtre « Rapprochés » seul : une ligne par association (article interne) au lieu d'une ligne par article de fournisseur.
//
// L'écran est construit une fois ; `maj()` met à jour ce qui change (compteur, filtres, tableau, barre d'action) sans toucher au champ de recherche (le focus ne saute jamais).
import { h, icone, remplir, vider, toast } from '../../os/ui.js';
import { lien } from '../../os/router.js';
import { verifierAcces } from '../../os/acces-base.js';
import { barreListe, enteteListe } from '../crm/barre-liste.js';
import { texteAcces, TEXTE_CHARGEMENT } from '../achatscommun/etat.js';
import {
  CODES_A_RELIRE, construireListe, CRITERES_ARTICLES_VIDES, CRITERES_TRI_ARTICLES, DUREE_ANNULATION_MS, erreurEtatChange, executerEnSerie, filtrerArticles, fournisseursDe, lignesAssociations,
  messageAnnulationDissociationImpossible, messageAnnulationGroupe, messageErreur, messageRefusAnnule, nombreFiltresArticles, pastillesArticles, peutReprendre, resultatClic, retirerPastille,
  statistiquesLignes, texteAucunResultat, TEXTE_ANNULATION_DISSOCIATION_CHANGE, TEXTE_DISSOCIE_ANNULABLE, TEXTE_REFUSEES_INDISPONIBLES, TEXTE_TRONQUE, TEXTE_VIDE, MESSAGE_DISSOCIATION_ANNULEE,
  texteCompteur, texteRefusAnnulable, textePastilleAssociation, textePrixAssociation, texteReferencesAssociation, texteSuggestionRefusee, trierArticles, TRI_ARTICLES_DEFAUT, vueAssociationsActive,
} from './logique.js';
import { analyserSelection, appliquerFiltreRapide, comptesFiltres, estEnGroupe, filtreRapideActif, FILTRES_RAPIDES, pastilleLigne, taillesGroupes } from './selection.js';
import { messageAnnulationPartielle, messageSortieInterrompue, TEXTE_ACTION_EN_COURS } from './association.js';
import { euros } from './formats.js';
import { lireDonnees, lireVilles, messageLecture } from './donnees.js';
import { creerArticleReference, demanderSuggestions, dissocierRapprochement, refuserSuggestion, renommerReference, reprendreSuggestion, validerRapprochement } from './actions.js';
import { ouvrirAssociation } from './ecran-association.js';
import { ouvrirFiltres } from './filtres.js';
import { exporterListe } from './export.js';

export const TITRE = 'Articles';
export const EXPLICATION = 'Relie chaque article de tes fournisseurs à ton article interne, avec un coefficient. Un rapprochement relie au moins deux articles (de préférence de fournisseurs différents) pour comparer leurs prix : une suggestion de l’IA est toujours un groupe, à vérifier puis à valider. Un article sans équivalent reste seul, avec son propre prix.';

const ICONES_ETAT = { connecte: 'circle-check', 'non-regle': 'link', reconnexion: 'triangle-alert', illisible: 'triangle-alert' };

/** Carte d'état de l'accès (même rendu que celui des autres écrans Achats) quand la base n'est pas prête. `relancer(forcer)` relit l'accès. */
function carteEtat(zone, etat, relancer) {
  const enAlerte = etat === 'reconnexion' || etat === 'illisible';
  const bouton = (libelle, forcer = false) => h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer' }, onclick: () => relancer(forcer) }, icone('refresh-cw', { taille: 16 }), libelle);
  remplir(zone, h('section', { class: 'carte-section', role: enAlerte ? 'alert' : 'status', dataset: { role: 'achats-etat', etat } },
    h('p', { class: enAlerte ? 'mon-espace-erreur' : '', style: { display: 'flex', alignItems: 'flex-start', flexWrap: 'nowrap', gap: 'var(--esp-4)' } },
      h('span', { style: { flex: 'none', display: 'inline-flex' } }, icone(ICONES_ETAT[etat] ?? 'triangle-alert', { taille: 18 })), h('span', { dataset: { role: 'achats-etat-texte' } }, texteAcces(etat))),
    etat === 'non-regle' ? h('a', { class: 'bouton bouton-secondaire', href: lien('reglages/base') }, icone('chevron-right', { taille: 16 }), 'Ouvrir la connexion à la base') : null,
    etat === 'reconnexion' ? bouton('Revérifier', true) : null,
    etat === 'illisible' ? bouton('Réessayer') : null));
}

/** Monte l'écran dans `conteneur`. Rend la fonction d'arrêt (une réponse tardive d'un écran quitté est ignorée). */
export function rendreEcran(conteneur, { lire = lireDonnees, lireLesVilles = lireVilles } = {}) {
  let vivant = true;
  // ---------------------------------------------------------------- état
  let donnees = null;
  let chargement = true;
  let erreur = null;
  let criteres = CRITERES_ARTICLES_VIDES;
  let tri = TRI_ARTICLES_DEFAUT;
  let selection = [];
  let envoiEnCours = null; // identifiant de l'article en cours de « Reprendre »
  let verrou = false; // même garde-fou, mais immédiat (double clic avant que l'écran ne se mette à jour)
  let suggestionsEnCours = false;
  let erreurAction = '';
  let resultatIA = null;
  let fenetre = null;
  /** Bandeaux « Annuler » encore visibles : leurs identifiants sont retirés quand un article est validé ou repris entre-temps (« Annuler » donnerait une erreur fantôme). */
  const bandeaux = new Set();

  // ---------------------------------------------------------------- éléments fixes
  const compteur = h('span', { class: 'compteur-liste', 'aria-live': 'polite' });
  const boutonExporter = h('button', { type: 'button', class: 'bouton bouton-secondaire', disabled: true, dataset: { action: 'exporter-articles' }, onclick: () => exporterListe(affiches()) }, icone('download', { taille: 16 }), 'Exporter');
  const boutonSuggestions = h('button', { type: 'button', class: 'bouton bouton-principal', disabled: true, dataset: { action: 'demander-suggestions' }, onclick: () => { void demander(); } }, icone('sparkles', { taille: 16 }), 'Demander des suggestions à l’IA');
  const entete = enteteListe({ titre: TITRE, compteur, actions: [boutonExporter, boutonSuggestions] });
  const blocSuggestions = h('p', { class: 'aide', role: 'status', hidden: true }, 'L’IA regarde tous les articles pas encore rapprochés pour trouver ceux qui sont le même produit : ça peut prendre jusqu’à quatre minutes. Rien n’est validé sans toi.');
  const blocIA = h('div', { class: 'bandeau-ia', role: 'status', hidden: true });
  const blocRefusees = h('p', { class: 'aide', role: 'status', hidden: true }, TEXTE_REFUSEES_INDISPONIBLES);
  const blocErreurAction = h('p', { class: 'erreur', role: 'alert', hidden: true });
  const blocTronque = h('p', { class: 'erreur', role: 'alert', hidden: true }, TEXTE_TRONQUE);
  const zoneEtat = h('div', { dataset: { role: 'zone-etat' } });
  const zoneVide = h('div', { class: 'etat-vide carte-section', role: 'status', hidden: true });
  const zoneTableau = h('div', { class: 'zone-affaires' });
  const barreAction = h('div', { class: 'barre-action-articles', role: 'region', 'aria-label': 'Articles cochés', hidden: true });
  const page = h('div', { class: 'page page-affaires page-rapprochements', dataset: { module: 'achats', ecran: 'articles' } });

  const boutonFiltres = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'ouvrir-filtres' }, onclick: () => { void ouvrirLesFiltres(); } });
  const groupeRapides = h('div', { class: 'filtres-rapides', role: 'group', 'aria-label': 'Filtrer les articles' });
  const zonePastilles = h('div', { class: 'pastilles-actives' });
  const selecteurTri = h('select', { class: 'champ champ-tri', 'aria-label': 'Trier par', dataset: { role: 'tri' },
    onchange: (e) => { const c = CRITERES_TRI_ARTICLES.find((x) => x.id === e.target.value); if (c) { tri = { critere: c.id, sens: c.sens }; maj(); } } },
  CRITERES_TRI_ARTICLES.map((o) => h('option', { value: o.id }, `Trier par : ${o.libelle}`)));
  const boutonSens = h('button', { type: 'button', class: 'bouton-icone bouton-tri-sens', dataset: { action: 'sens-tri' }, onclick: () => { tri = { critere: tri.critere, sens: tri.sens === 'asc' ? 'desc' : 'asc' }; maj(); } });
  const barre = barreListe({
    recherche: { placeholder: 'Rechercher un article', libelleAria: 'Rechercher un article', surSaisie: (v) => { criteres = { ...criteres, recherche: v }; maj(); } },
    elements: { filtres: boutonFiltres, vues: groupeRapides, pastilles: zonePastilles },
    tri: h('div', { class: 'selecteur-tri' }, selecteurTri, boutonSens),
  });
  const zoneContenu = h('div', { dataset: { role: 'zone-contenu' }, hidden: true }, barre.element, zoneVide, zoneTableau, barreAction);

  page.append(entete,
    h('p', { class: 'aide page-explication' }, EXPLICATION),
    blocSuggestions, blocIA, blocRefusees, blocErreurAction, blocTronque, zoneEtat, zoneContenu);
  vider(conteneur);
  conteneur.append(page);

  // ---------------------------------------------------------------- calculs
  const liste = () => (donnees ? construireListe(donnees.articles, donnees.rapprochements, donnees.references, statistiquesLignes(donnees.lignes), donnees.refusees) : []);
  const affiches = () => trierArticles(filtrerArticles(liste(), criteres), tri);

  // ---------------------------------------------------------------- affichage
  function maj() {
    if (!vivant) return;
    const toute = liste();
    const prete = !chargement && !erreur && !!donnees;
    const avecDonnees = prete && toute.length > 0;
    boutonExporter.disabled = !avecDonnees;
    boutonSuggestions.disabled = suggestionsEnCours || chargement || !!erreur || !donnees;
    boutonSuggestions.setAttribute('aria-busy', suggestionsEnCours ? 'true' : 'false');
    remplir(boutonSuggestions, icone('sparkles', { taille: 16 }), suggestionsEnCours ? 'L’IA réfléchit…' : 'Demander des suggestions à l’IA');
    compteur.textContent = avecDonnees ? texteCompteur(toute) : '';
    blocSuggestions.hidden = !suggestionsEnCours;
    blocIA.hidden = resultatIA === null;
    blocRefusees.hidden = !donnees?.refuseesIndisponibles;
    blocErreurAction.hidden = !erreurAction; blocErreurAction.textContent = erreurAction;
    blocTronque.hidden = !donnees?.tronque;

    // Chargement, erreur ou liste vide : un message à la place du contenu.
    if (chargement) remplir(zoneEtat, h('div', { class: 'chargement-bloc', role: 'status', dataset: { etat: 'chargement' } }, h('span', { class: 'rond-chargement' }), h('span', { class: 'aide' }, TEXTE_CHARGEMENT)));
    else if (erreur) remplir(zoneEtat, h('div', { class: 'carte-section', role: 'alert', dataset: { etat: 'erreur' } }, h('p', { class: 'erreur' }, erreur),
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer' }, onclick: () => { void charger(); } }, icone('refresh-cw', { taille: 16 }), 'Réessayer')));
    else if (prete && toute.length === 0) remplir(zoneEtat, h('div', { class: 'etat-vide carte-section', role: 'status', dataset: { etat: 'vide' } }, h('p', {}, TEXTE_VIDE)));
    else if (!donnees) { /* la carte d'état de l'accès reste affichée */ } else vider(zoneEtat);
    zoneContenu.hidden = !avecDonnees;
    page.classList.toggle('avec-barre', avecDonnees && analyserSelection(toute, selection).type !== 'aucune');
    if (!avecDonnees) return;

    // Barre : filtres en un clic (avec leur nombre), « Filtres », pastilles, tri.
    const n = nombreFiltresArticles(criteres);
    remplir(boutonFiltres, icone('funnel', { taille: 16 }), 'Filtres', n > 0 ? h('span', { class: 'compteur-filtres' }, String(n)) : null);
    const comptes = comptesFiltres(toute);
    const actif = filtreRapideActif(criteres);
    remplir(groupeRapides, FILTRES_RAPIDES.map((f) => h('button', { type: 'button', class: 'filtre-rapide', 'aria-pressed': String(actif === f.id), dataset: { filtre: f.id },
      onclick: () => { criteres = appliquerFiltreRapide(criteres, f.id); maj(); } },
    f.etincelle ? icone('sparkles', { taille: 14 }) : null, f.libelle, h('span', { class: 'filtre-rapide-nombre' }, String(comptes[f.id])))));
    const pastilles = pastillesArticles(criteres).filter((p) => actif === null || p.cle !== 'etats');
    remplir(zonePastilles, pastilles.map((p) => h('span', { class: 'pastille-filtre', dataset: { pastille: `${p.cle}-${p.valeur}` } }, p.libelle,
      h('button', { type: 'button', class: 'pastille-retrait', 'aria-label': `Retirer le filtre : ${p.libelle}`, onclick: () => { criteres = retirerPastille(criteres, p); maj(); } }, icone('x', { taille: 12 })))),
    pastilles.length > 1 ? h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', onclick: () => { criteres = { ...criteres, etats: [], fournisseurs: [] }; maj(); } }, 'Tout effacer') : null);
    selecteurTri.value = tri.critere;
    const croissant = tri.sens === 'asc';
    boutonSens.title = `Sens du tri : ${croissant ? 'croissant' : 'décroissant'}`;
    boutonSens.setAttribute('aria-label', `Sens du tri : ${croissant ? 'croissant' : 'décroissant'}. Inverser le sens`);
    remplir(boutonSens, icone(croissant ? 'arrow-up' : 'arrow-down', { taille: 16 }));

    // Tableau : une ligne par association (filtre « Rapprochés » seul) ou une ligne par article.
    const lignes = affiches();
    const parAssociation = vueAssociationsActive(criteres);
    const associations = parAssociation ? lignesAssociations(toute, criteres, tri) : [];
    const nb = parAssociation ? associations.length : lignes.length;
    zoneVide.hidden = nb > 0;
    if (nb === 0) remplir(zoneVide, h('p', {}, texteAucunResultat(criteres)), h('button', { type: 'button', class: 'bouton bouton-secondaire', onclick: () => { criteres = CRITERES_ARTICLES_VIDES; maj(); } }, 'Tout afficher'));
    if (nb === 0) vider(zoneTableau);
    else if (parAssociation) remplir(zoneTableau, tableauAssociations(associations, toute));
    else remplir(zoneTableau, tableauArticles(lignes, toute));
    majBarreAction();
  }

  function tableauArticles(lignes, toute) {
    const tailles = taillesGroupes(toute);
    return h('div', { class: 'zone-tableau' }, h('table', { class: 'tableau tableau-articles tableau-liste-unique' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col', class: 'col-coche' }, h('span', { class: 'sr-only' }, 'Cocher')), h('th', { scope: 'col' }, 'Article du fournisseur'), h('th', { scope: 'col' }, 'Fournisseur'),
        h('th', { scope: 'col', class: 'col-montant' }, 'Dernier prix HT'), h('th', { scope: 'col' }, 'Rapprochement'))),
      h('tbody', {}, lignes.map((x) => {
        const id = x.article.id;
        const coche = selection.includes(id);
        const pastille = pastilleLigne(x, tailles);
        return h('tr', { class: `ligne-liste ligne-statique${coche ? ' ligne-cochee' : ''}`, dataset: { article: id } },
          h('td', { class: 'cellule-coche' }, h('label', { class: 'coche-article' }, h('input', { type: 'checkbox', checked: coche, 'aria-label': `Cocher : ${x.article.designation}, ${x.fournisseur}`, onchange: () => bascule(id) }))),
          h('td', { dataset: { libelle: 'Article du fournisseur' } },
            h('button', { type: 'button', class: 'lien-ligne', 'aria-label': `Ouvrir : ${x.article.designation}`, onclick: () => ouvrir(x) }, h('span', { class: 'cellule-nom' }, x.article.designation)),
            x.article.reference ? h('span', { class: 'aide' }, ` · réf. ${x.article.reference}`) : null,
            x.article.unite?.trim() ? h('span', { class: 'aide' }, ` · ${x.article.unite.trim()}`) : null,
            x.etat === 'refusee' ? h('span', { class: 'aide' }, ` · ${texteSuggestionRefusee(x)}`) : null),
          h('td', { dataset: { libelle: 'Fournisseur' } }, x.fournisseur),
          h('td', { class: 'montant', dataset: { libelle: 'Dernier prix HT' } }, euros(x.stats.dernierPrix)),
          h('td', { class: 'actions-article cellule-pastille', dataset: { libelle: 'Rapprochement' } },
            h('button', { type: 'button', class: `badge pastille-rapprochement ${pastille.badge}`, title: pastille.infobulle ?? null, dataset: { pastille: x.etat },
              'aria-label': `${pastille.etincelle ? 'Suggestion IA ' : ''}${pastille.texte}${pastille.infobulle ? ` (${pastille.infobulle})` : ''} : ouvrir ${x.article.designation}`, onclick: () => ouvrir(x) },
            pastille.etincelle ? icone('sparkles', { taille: 12 }) : null, pastille.texte),
            peutReprendre(x) ? h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', disabled: !!envoiEnCours, 'aria-busy': envoiEnCours === id ? 'true' : null,
              'aria-label': `Reprendre cette suggestion : ${x.article.designation}`, dataset: { action: 'reprendre' }, onclick: () => { void reprendre(id); } },
            icone('sparkles', { taille: 14 }), envoiEnCours === id ? 'Reprise…' : 'Reprendre') : null));
      }))));
  }

  function tableauAssociations(associations, toute) {
    return h('div', { class: 'zone-tableau' }, h('table', { class: 'tableau tableau-articles tableau-liste-unique tableau-associations' },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col', class: 'col-coche' }, h('span', { class: 'sr-only' }, 'Cocher')), h('th', { scope: 'col' }, 'Article interne'), h('th', { scope: 'col' }, 'Fournisseurs'),
        h('th', { scope: 'col', class: 'col-montant' }, 'Prix HT'), h('th', { scope: 'col' }, 'Rapprochement'))),
      h('tbody', {}, associations.map((l) => h('tr', { class: 'ligne-liste ligne-statique ligne-association', dataset: { association: l.referenceId } },
        h('td', { class: 'cellule-coche', 'aria-hidden': 'true' }),
        h('td', { dataset: { libelle: 'Article interne' } },
          h('button', { type: 'button', class: 'lien-ligne', 'aria-label': `Ouvrir l’association : ${l.nom}`, onclick: () => ouvrirLigneAssociation(l, toute) }, h('span', { class: 'cellule-nom' }, h('b', {}, l.nom))),
          l.references.length > 0 ? h('span', { class: 'aide association-refs' }, texteReferencesAssociation(l)) : null),
        h('td', { dataset: { libelle: 'Fournisseurs' } }, l.fournisseurs.map((f) => h('span', { class: 'association-fournisseur' }, f))),
        h('td', { class: 'montant', dataset: { libelle: 'Prix HT' } }, textePrixAssociation(l)),
        h('td', { class: 'actions-article cellule-pastille', dataset: { libelle: 'Rapprochement' } },
          h('button', { type: 'button', class: 'badge pastille-rapprochement badge-succes', 'aria-label': `${textePastilleAssociation(l)} : ouvrir l’association ${l.nom}`, onclick: () => ouvrirLigneAssociation(l, toute) }, textePastilleAssociation(l))))))));
  }

  /** Barre d'action : seulement avec une case cochée ; un bouton (ou un texte d'aide), jamais de case grisée. */
  function majBarreAction() {
    const analyse = analyserSelection(liste(), selection);
    barreAction.hidden = analyse.type === 'aucune';
    page.classList.toggle('avec-barre', analyse.type !== 'aucune');
    if (analyse.type === 'aucune') { vider(barreAction); return; }
    remplir(barreAction,
      h('span', { class: 'baa-texte', 'aria-live': 'polite' }, analyse.phrase),
      analyse.type === 'impossible'
        ? h('span', { class: 'baa-aide aide', role: 'status' }, analyse.aide)
        : h('button', { type: 'button', class: 'bouton bouton-principal', disabled: !!envoiEnCours, dataset: { action: 'ouvrir-association' }, onclick: () => ouvrirDepuisBarre(analyse) }, analyse.libelle),
      h('button', { type: 'button', class: 'bouton bouton-discret', dataset: { action: 'tout-decocher' }, onclick: () => { selection = []; maj(); } }, 'Tout décocher'));
  }

  // ---------------------------------------------------------------- gestes
  /** Cocher / décocher : seule la ligne et la barre changent (le tableau n'est pas refait : le focus clavier reste sur la case). */
  function bascule(id) {
    selection = selection.includes(id) ? selection.filter((i) => i !== id) : [...selection, id];
    for (const tr of zoneTableau.querySelectorAll('tr[data-article]')) {
      if (tr.dataset.article !== id) continue;
      tr.classList.toggle('ligne-cochee', selection.includes(id));
      const c = tr.querySelector('input[type=checkbox]');
      if (c) c.checked = selection.includes(id);
    }
    majBarreAction();
  }
  /** Clic sur la ligne ou sur la pastille : un article déjà en association ouvre SON association (tous ses articles) ; un article libre se coche, pour le rapprocher d'un autre. */
  function ouvrir(x) {
    erreurAction = '';
    if (estEnGroupe(x) && x.reference) {
      const ref = x.reference;
      ouvrirLaFenetre(ref, liste().filter((y) => estEnGroupe(y) && y.reference?.id === ref.id));
    } else bascule(x.article.id);
    blocErreurAction.hidden = true;
  }
  function ouvrirLigneAssociation(l, toute) {
    erreurAction = ''; blocErreurAction.hidden = true;
    const ref = l.articles[0]?.reference;
    if (ref) ouvrirLaFenetre(ref, toute.filter((y) => estEnGroupe(y) && y.reference?.id === ref.id));
  }
  /** Les deux gestes de la barre : « Rapprocher ces N articles » (création) et « Ajouter au groupe » (l'association existante + les articles libres cochés). */
  function ouvrirDepuisBarre(analyse) {
    erreurAction = ''; blocErreurAction.hidden = true;
    if (analyse.type === 'ajouter') ouvrirLaFenetre(analyse.groupes[0].reference, [...analyse.groupes[0].membres, ...analyse.libres]);
    else if (analyse.type === 'rapprocher') ouvrirLaFenetre(null, analyse.libres);
  }

  async function ouvrirLesFiltres() {
    const nouveaux = await ouvrirFiltres({ criteres, fournisseurs: fournisseursDe(liste()) });
    if (nouveaux && vivant) { criteres = nouveaux; maj(); }
  }

  /** Retire des articles des bandeaux « Annuler » (validés ou repris entre-temps). */
  function retirerDuBandeau(ids) {
    for (const b of bandeaux) b.ids = b.ids.filter((i) => !ids.includes(i));
  }

  /** Une erreur qui dit que la liste a changé (suggestion disparue, article supprimé…) : on relit, sans fermer le message. */
  function relireSiBesoin(e) { if (e && e.code && CODES_A_RELIRE.includes(e.code)) void charger(true); }

  function ecrireErreurAction(texte) { erreurAction = texte; blocErreurAction.hidden = !texte; blocErreurAction.textContent = texte; }

  async function charger(silencieux = false) {
    if (!silencieux) { chargement = true; maj(); }
    try { donnees = await lire(); erreur = null; } catch (e) { if (!silencieux) erreur = messageLecture(e); else if (e?.code === 'reconnexion') console.warn('Articles : accès à la base à renouveler'); }
    chargement = false;
    maj();
  }

  async function demander() {
    if (suggestionsEnCours) return;
    suggestionsEnCours = true; ecrireErreurAction(''); resultatIA = null; maj();
    try {
      const r = await demanderSuggestions();
      if (!vivant) return;
      afficherResultatIA(resultatClic(r).texte);
      await charger(true);
    } catch (e) {
      if (!vivant) return;
      ecrireErreurAction(resultatClic(undefined, e, messageErreur(e)).texte);
      void charger(true); // une partie a pu être écrite avant l'erreur : on relit la liste
    }
    suggestionsEnCours = false;
    maj();
  }
  /** Le résultat du clic reste affiché jusqu'à « Fermer » (le clic peut durer plusieurs minutes : un message de 6 s passerait inaperçu). */
  function afficherResultatIA(texte) {
    resultatIA = texte;
    remplir(blocIA, icone('sparkles', { taille: 16 }), h('span', { dataset: { role: 'resultat-ia' } }, texte),
      h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', dataset: { action: 'fermer-ia' }, onclick: () => { resultatIA = null; blocIA.hidden = true; } }, 'Fermer'));
    blocIA.hidden = false;
  }

  /** Relit toute la liste sur le serveur (l'écran se met à jour) et renvoie ces articles dans leur état du moment. Lève une erreur si la lecture échoue. */
  async function relireLignes(ids) {
    const d = await lire();
    if (vivant) { donnees = d; erreur = null; maj(); }
    const fraiche = construireListe(d.articles, d.rapprochements, d.references, statistiquesLignes(d.lignes), d.refusees);
    return ids.flatMap((id) => fraiche.filter((x) => x.article.id === id));
  }

  /**
   * Dernière étape d'« Enregistrer » dans la fenêtre « Association » : chaque article qui sort passe par l'action qui lui convient (un lien validé est dissocié, une suggestion de l'IA est refusée),
   * l'un après l'autre. La fenêtre se ferme ; les bandeaux « Annuler » (8 s) prennent le relais, UN par sorte de geste. Une panne arrête la série : ce qui est fait est dit.
   */
  async function sortir(items, apres) {
    if (items.length === 0) return null;
    // Un « Annuler » de bandeau est en cours : on le dit (la fenêtre reste ouverte) au lieu de ne rien faire.
    if (verrou) throw new Error(TEXTE_ACTION_EN_COURS);
    verrou = true;
    ecrireErreurAction('');
    const r = await executerEnSerie(items, (s) => (s.action === 'dissocier' ? dissocierRapprochement(s.x.article.id) : refuserSuggestion(s.x.article.id)), erreurEtatChange);
    verrou = false;
    if (!vivant) return null;
    // Articles déjà validés pendant ce même « Enregistrer » : plus rien à annuler pour eux dans un ancien bandeau, et le message final est dit.
    if (apres) { retirerDuBandeau(apres.ids); if (apres.message && r.echecs.length === 0) toast(apres.message, { duree: 6000 }); }
    const dissocies = r.faits.filter((s) => s.action === 'dissocier');
    const refuses = r.faits.filter((s) => s.action === 'refuser');
    if (dissocies.length > 0) {
      bandeauDissocie({ libelle: dissocies[0].x.reference?.nom ?? dissocies[0].x.article.designation,
        items: dissocies.filter((s) => s.x.rapprochement).map((s) => ({ id: s.x.article.id, referenceId: s.x.rapprochement?.article_reference_id ?? '', coefficient: Number(s.x.rapprochement?.coefficient ?? 0) })) });
    }
    if (refuses.length > 0) bandeauRefus({ ids: refuses.map((s) => s.x.article.id), libelle: refuses[0].x.reference?.nom ?? refuses[0].x.article.designation });
    void charger(true);
    if (r.echecs.length > 0) {
      // Une sortie a échoué : la fenêtre RESTE OUVERTE (on dit ce qui est fait et ce qui n'a pas pu sortir), la personne réessaie ou ferme.
      return messageSortieInterrompue(r.faits.length, items.length, r.echecs[0].element.x.article.designation, messageErreur(r.echecs[0].erreur), apres?.dejaFait ?? '');
    }
    fenetre?.fermer(); fenetre = null; selection = []; maj();
    return null;
  }

  /** Bandeau « Suggestion refusée. [Annuler] » (8 s) : les articles refusés d'un seul geste (un article, ou tout un groupe). */
  function bandeauRefus(a) {
    bandeaux.add(a);
    toast(texteRefusAnnulable(a.ids.length), { duree: DUREE_ANNULATION_MS, action: { libelle: 'Annuler', surClic: () => { bandeaux.delete(a); if (a.ids.length > 0) void annulerRefus(a); } } });
  }
  function bandeauDissocie(d) {
    bandeaux.add(d);
    toast(TEXTE_DISSOCIE_ANNULABLE, { duree: DUREE_ANNULATION_MS, action: { libelle: 'Annuler', surClic: () => { bandeaux.delete(d); void annulerDissociation(d); } } });
  }

  /** « Annuler » du bandeau (jamais bloqué par un autre envoi) : remet chaque suggestion refusée (même référence, même coefficient), toutes essayées même si l'une échoue. */
  async function annulerRefus(a) {
    ecrireErreurAction('');
    const r = await executerEnSerie(a.ids, (id) => reprendreSuggestion(id), () => true);
    if (!vivant) return;
    if (r.echecs.length === 0) toast(messageRefusAnnule(a.ids.length), { duree: 6000 });
    else {
      // Une ligne dont l'état a changé (déjà reprise ou rapprochée par quelqu'un) n'est pas réessayée ; les autres reviennent dans le bandeau (nouveau minuteur de 8 s).
      const aReessayer = r.echecs.filter((e) => !erreurEtatChange(e.erreur)).map((e) => e.element);
      ecrireErreurAction(`${messageAnnulationGroupe(r)}${aReessayer.length > 0 ? ' Réessaie avec « Annuler », ou plus tard avec le filtre « Refusée » et le bouton « Reprendre cette suggestion ».' : ''}`);
      if (aReessayer.length > 0) bandeauRefus({ ids: aReessayer, libelle: a.libelle });
    }
    void charger(true);
  }

  /** « Reprendre cette suggestion » d'une ligne refusée (filtre « Refusée ») : même référence, même coefficient. */
  async function reprendre(id) {
    if (envoiEnCours || verrou) return;
    verrou = true;
    retirerDuBandeau([id]);
    envoiEnCours = id; ecrireErreurAction(''); maj();
    try {
      await reprendreSuggestion(id);
    } catch (e) {
      verrou = false;
      if (!vivant) return;
      envoiEnCours = null; ecrireErreurAction(`La suggestion n’a pas pu être reprise : ${messageErreur(e)}`); maj();
      relireSiBesoin(e);
      return;
    }
    verrou = false;
    if (!vivant) return;
    envoiEnCours = null;
    toast('Suggestion reprise : elle repasse dans « Suggestions IA à valider », à vérifier avant de valider.', { duree: 6000 });
    await charger(true);
  }

  /**
   * « Annuler » de « Dissocié. » : revalide les MÊMES liens (même article interne, même coefficient). Le serveur remplace un rapprochement existant sans prévenir :
   * la liste est relue juste avant, et si quelqu'un a rapproché un de ces articles entre-temps, rien n'est envoyé.
   */
  async function annulerDissociation(d) {
    if (verrou) return;
    verrou = true;
    ecrireErreurAction('');
    try {
      let fraiches;
      // Relecture impossible : on n'envoie rien (on ne sait pas si un article a un nouveau rapprochement) et on le dit.
      try { fraiches = await relireLignes(d.items.map((i) => i.id)); } catch (e) { if (vivant) ecrireErreurAction(messageAnnulationDissociationImpossible(e)); return; }
      if (fraiches.some((x) => x.rapprochement)) { ecrireErreurAction(TEXTE_ANNULATION_DISSOCIATION_CHANGE); return; }
      const r = await executerEnSerie(d.items, (i) => validerRapprochement(i.id, i.referenceId, i.coefficient));
      if (vivant) { if (r.echecs.length === 0) toast(MESSAGE_DISSOCIATION_ANNULEE, { duree: 6000 }); else ecrireErreurAction(messageAnnulationPartielle(r.faits.length, d.items.length, messageErreur(r.echecs[0].erreur))); }
    } catch (e) {
      if (vivant) { ecrireErreurAction(messageAnnulationDissociationImpossible(e)); relireSiBesoin(e); }
    } finally {
      verrou = false;
    }
    if (vivant) void charger(true);
  }

  function ouvrirLaFenetre(reference, depart) {
    fenetre?.fermer();
    const tailles = taillesGroupes(liste());
    fenetre = ouvrirAssociation({
      depart, reference, occupees: [...tailles.keys()], references: donnees.references,
      relire: relireLignes, lireVilles: (ids) => lireLesVilles(ids),
      renommer: async (refId, nom) => { await renommerReference(refId, nom); },
      creerReference: async (nom, unite) => (await creerArticleReference(nom, unite)).article_reference_id,
      relireReferences: async () => { const d = await lire(); if (vivant) { donnees = d; maj(); } return d.references; },
      valider: async (id, refId, k) => { try { await validerRapprochement(id, refId, k); } catch (e) { relireSiBesoin(e); throw e; } },
      sortir,
      // Fermer relit la liste : des articles ont pu être écrits avant un envoi en échec.
      surFerme: () => { fenetre = null; void charger(true); },
      surTermine: (message, ids) => { fenetre = null; retirerDuBandeau(ids); selection = []; toast(message, { duree: 6000 }); void charger(true); },
    });
  }

  // ---------------------------------------------------------------- démarrage : l'accès à la base d'abord, puis la lecture
  async function demarrer(forcer = false) {
    remplir(zoneEtat, h('div', { class: 'chargement-bloc', role: 'status', dataset: { etat: 'chargement' } }, h('span', { class: 'rond-chargement' }), h('span', { class: 'aide' }, TEXTE_CHARGEMENT)));
    let etat = 'illisible';
    try { etat = (await verifierAcces(forcer)).etat; } catch (e) { console.warn('Accès à la base : vérification impossible', e?.code ?? e?.message); }
    if (!vivant) return;
    if (etat !== 'connecte') { chargement = false; carteEtat(zoneEtat, etat, demarrer); maj(); return; }
    await charger();
  }
  void demarrer(false);
  return () => { vivant = false; fenetre?.fermer(); fenetre = null; };
}
