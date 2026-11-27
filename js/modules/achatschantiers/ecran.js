// Écran « Chantiers » du module Achats (24/11/2026, PR 6) : titre + compteur, « + Chantier » et « Exporter », barre commune (recherche, Filtres, Kanban | Liste | Archives, tri),
// puis le Kanban par statut ou le tableau. Actions de ligne dans un menu « … » (Modifier, Archiver / Désarchiver) ; l'étoile met un chantier en favori. Pas de glisser-déposer :
// le statut se change dans « Modifier ». Un chantier ne se supprime pas : il s'archive.
// LECTURES : seulement par le client de la base ; ÉCRITURES (créer, modifier, archiver) : seulement par les actions métier (n8n garde les règles) ; la liste est relue après chaque écriture.
// Les trois cas de chaque écran : chargement, cas vide (aucun chantier), cas d'erreur (lecture impossible, accès à renouveler, connexion non réglée), tous avec leur bouton.
import { h, icone, remplir, dialogue, confirmer, toast, ouvrirMenu, lirePreference, ecrirePreference } from '../../os/ui.js';
import { lien, naviguer } from '../../os/router.js';
import { clientBase, actionsBase, verifierAcces } from '../../os/acces-base.js';
import { CODES_A_RECHARGER } from '../../os/actions-metier.js';
import { enteteListe, barreListe, basculeVues } from '../crm/barre-liste.js';
import { texteAcces } from '../achatscommun/etat.js';
import { creerDonnees } from './donnees.js';
import { creerMagasinFavoris, GENRE_CHANTIER } from './favoris.js';
import { chantiersCsv, nomFichierExport, TEXTE_RIEN_A_EXPORTER } from './export-csv.js';
import { fenetreChantier } from './fenetre.js';
import { boutonEtoile, selecteurTri, boutonFiltres, etatVide, etatErreur, chargement, telechargerTexte } from './composants.js';
import {
  CRITERES_CHANTIERS_VIDES, CRITERES_TRI_CHANTIERS, STATUTS_CHANTIER, LIBELLE_ACTION_CHANTIER, COULEUR_STATUT_CHANTIER,
  actionArchivageChantier, actionsChantier, annulerArchivage, archiverPuisRelire, chantiersDeVue, criteresChantiersActifs, dateFr, dateJourFichier, euros, filtrerChantiers,
  libelleChantier, libelleStatutChantier, lireTriChantiers, lireVueChantiers, nombreFiltresChantiers, pastillesChantiers, regrouperParStatut, retirerCritereChantier,
  textePourcentage, texteCompteurChantiers, texteTeteColonne, textesArchivage, totalBudget, trierChantiers, chantierSeul, DUREE_ANNULATION, DUREE_MESSAGE, MESSAGE_REMIS,
} from './logique.js';

export const TITRE = 'Chantiers';
export const AIDE = 'Les chantiers de l’espace, lus dans la base.';
const ROUTE = 'achatschantiers/liste';
const ICONE_ACTION = { modifier: 'pencil', archiver: 'archive', desarchiver: 'archive-restore' };
const MESSAGE_LECTURE = 'Impossible de charger les chantiers. Vérifie ta connexion, puis réessaie.';
const MESSAGE_VIDE = 'Aucun chantier pour l’instant. Crée le premier avec « + Chantier ».';
const ICONES_ETAT = { 'non-regle': 'link', reconnexion: 'triangle-alert', illisible: 'triangle-alert' };

/** Montre l'état de l'accès quand il n'est pas bon (connexion non réglée, badge à renouveler, réglages illisibles), avec le bouton qui convient. */
function dessinerEtatAcces(zone, etat, relancer) {
  const alerte = etat !== 'non-regle';
  const bouton = (libelle, forcer) => h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer' }, onclick: () => relancer(forcer) }, icone('refresh-cw', { taille: 16 }), libelle);
  remplir(zone, h('section', { class: 'carte-section', role: alerte ? 'alert' : 'status', dataset: { role: 'achats-etat', etat } },
    h('p', { class: alerte ? 'mon-espace-erreur' : '', style: { display: 'flex', alignItems: 'flex-start', flexWrap: 'nowrap', gap: 'var(--esp-4)' } },
      h('span', { style: { flex: 'none', display: 'inline-flex' } }, icone(ICONES_ETAT[etat] ?? 'triangle-alert', { taille: 18 })), h('span', { dataset: { role: 'achats-etat-texte' } }, texteAcces(etat))),
    etat === 'non-regle' ? h('a', { class: 'bouton bouton-secondaire', href: lien('reglages/base') }, icone('chevron-right', { taille: 16 }), 'Ouvrir la connexion à la base') : null,
    etat === 'reconnexion' ? bouton('Revérifier', true) : null,
    etat === 'illisible' ? bouton('Réessayer', false) : null));
}

/** Fenêtre « Filtres » : statut (plusieurs possibles) et client (texte libre). Renvoie les nouveaux critères, ou null si on ferme sans choisir. La recherche garde son propre champ. */
async function fenetreFiltres(criteres) {
  const statuts = new Set(criteres.statuts);
  let client = criteres.client;
  const corps = h('div', { class: 'pile filtres-corps' },
    h('fieldset', { class: 'groupe-cases' }, h('legend', { class: 'etiquette' }, 'Statut'),
      h('div', { class: 'cases' }, STATUTS_CHANTIER.map((s) => h('label', { class: 'case' },
        h('input', { type: 'checkbox', checked: statuts.has(s.id), dataset: { cle: 'statuts', valeur: s.id }, onchange: (e) => { if (e.target.checked) statuts.add(s.id); else statuts.delete(s.id); } }), s.libelle)))),
    h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Client'),
      h('input', { class: 'champ', type: 'search', autocomplete: 'off', placeholder: 'Une partie du nom du client', value: client, dataset: { cle: 'client' }, oninput: (e) => { client = e.target.value; } })));
  const r = await dialogue({
    titre: 'Filtres', classe: 'dialogue-formulaire dialogue-filtres', contenu: corps,
    boutons: [{ libelle: 'Tout effacer', valeur: 'effacer' }, { libelle: 'Appliquer', valeur: 'appliquer', style: 'principal' }],
  });
  if (r === 'effacer') return { ...CRITERES_CHANTIERS_VIDES, recherche: criteres.recherche };
  if (r === 'appliquer') return { ...criteres, statuts: STATUTS_CHANTIER.map((s) => s.id).filter((id) => statuts.has(id)), client };
  return null;
}

/**
 * Monte l'écran dans `conteneur`. Renvoie la fonction d'arrêt (la réponse tardive d'un écran quitté est ignorée).
 * `seul` : identifiant d'un chantier (adresse « achatschantiers/liste/<id> », ouverte par une petite maison du village de l'accueil) : l'écran ne montre que lui,
 * archivé ou non, quelle que soit la vue, avec une pastille « Chantier : … » dont la croix ramène à la liste complète. Absent de la liste : un état vide calme.
 */
export function rendreEcran(conteneur, { seul = null } = {}) {
  let vivant = true;
  let etatAcces = 'chargement'; // chargement | connecte | non-regle | reconnexion | illisible
  let chantiers = [];
  let chiffres = null; // Map (identifiant -> ligne de la vue des chiffres) ; null = lecture impossible
  let favorisDispo = false;
  let lecture = 'chargement'; // chargement | ok | erreur
  let avertissement = '';
  let occupe = false;
  let numeroLecture = 0;
  let criteres = { ...CRITERES_CHANTIERS_VIDES };
  let vue = lireVueChantiers(lirePreference('vue.achatschantiers', ''));
  let tri = lireTriChantiers(lirePreference('tri.achatschantiers', ''));
  const donnees = () => creerDonnees({ client: clientBase(), actions: actionsBase() });
  const favoris = creerMagasinFavoris((genre, cle) => donnees().basculerFavori(genre, cle));

  const compteur = h('span', { class: 'compteur-liste', 'aria-live': 'polite' });
  const avis = h('p', { class: 'aide', role: 'status', hidden: true, dataset: { role: 'chantiers-avis' } });
  const erreurAction = h('p', { class: 'erreur', role: 'alert', hidden: true, dataset: { erreur: 'action' } });
  const zone = h('div', { class: 'zone-affaires', dataset: { role: 'chantiers-zone' } });
  const bascule = h('div', { class: 'zone-bascule' });
  const zonePastilles = h('div', { class: 'pastilles-actives' });
  const filtres = boutonFiltres({ auClic: async () => { const r = await fenetreFiltres(criteres); if (r) { criteres = r; rendre(); } } });
  const choixTri = selecteurTri({ options: CRITERES_TRI_CHANTIERS, valeur: tri.critere, sens: tri.sens, surChangement: (t) => { tri = { critere: t.critere, sens: t.sens }; ecrirePreference('tri.achatschantiers', `${tri.critere}:${tri.sens}`); rendre(); } });
  const boutonNouveau = h('button', { type: 'button', class: 'bouton bouton-principal', dataset: { action: 'nouveau-chantier' }, onclick: () => ouvrirFenetre(null) }, icone('plus', { taille: 16 }), 'Chantier');
  const boutonExport = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'exporter-chantiers' }, onclick: () => exporter() }, icone('download', { taille: 16 }), 'Exporter');
  const barre = barreListe({
    recherche: { placeholder: 'Rechercher un chantier', libelleAria: 'Rechercher un chantier', valeur: criteres.recherche, surSaisie: (v) => { criteres = { ...criteres, recherche: v }; rendre(); } },
    elements: { filtres: filtres.element, vues: bascule, pastilles: zonePastilles }, tri: choixTri.element,
  });
  barre.element.hidden = true;
  boutonNouveau.disabled = true;
  boutonExport.disabled = true;

  conteneur.replaceChildren(h('div', { class: 'page page-liste page-achats-chantiers', dataset: { module: 'achats' } },
    enteteListe({ titre: TITRE, compteur, actions: [boutonNouveau, boutonExport] }),
    barre.element, avis, erreurAction, zone));

  const montrerErreurAction = (message) => { erreurAction.textContent = message ?? ''; erreurAction.hidden = !message; };

  // ------------------------------------------------------------ lecture
  async function verifier(forcer = false) {
    etatAcces = 'chargement'; lecture = 'chargement'; rendre();
    let etat = 'illisible';
    try { etat = (await verifierAcces(forcer)).etat; } catch (e) { console.warn('Accès à la base : vérification impossible', e?.code ?? e?.message); }
    if (!vivant) return;
    etatAcces = etat;
    if (etat === 'connecte') await charger(false); else rendre();
  }

  /** Lit les chantiers (obligatoire), puis les chiffres du budget et les favoris (facultatifs : leur échec ne bloque pas la liste). `silencieux` : relecture après une écriture (pas d'écran de chargement). */
  async function charger(silencieux) {
    const numero = ++numeroLecture; // une lecture plus récente rend celle-ci caduque : sa réponse tardive est ignorée
    if (!silencieux) { lecture = 'chargement'; rendre(); }
    const d = donnees();
    const [c, ch, fa] = await Promise.allSettled([d.chargerChantiers(), d.chargerChiffres(), d.chargerFavoris()]);
    if (!vivant || numero !== numeroLecture) return;
    if (c.status === 'fulfilled') {
      chantiers = c.value.chantiers; lecture = 'ok';
      avertissement = c.value.tronque ? c.value.message : '';
    } else if (c.reason?.code === 'reconnexion') {
      etatAcces = 'reconnexion'; rendre(); return;
    } else if (!silencieux) {
      console.warn('Chantiers : lecture impossible', c.reason?.code ?? c.reason?.message);
      lecture = 'erreur';
    }
    // Relecture silencieuse (après une écriture) : si la vue des chiffres ou les favoris échouent, on garde ce qui était déjà affiché.
    if (ch.status === 'fulfilled') chiffres = ch.value.chiffres; else if (!silencieux) chiffres = null;
    if (ch.status === 'fulfilled' && ch.value.tronque) avertissement = avertissement || ch.value.message;
    if (fa.status === 'fulfilled') { favorisDispo = true; favoris.charger(fa.value); } else if (!silencieux) favorisDispo = false;
    rendre();
  }

  // ------------------------------------------------------------ dessin
  function etoile(c) {
    if (!favorisDispo) return null;
    return boutonEtoile({ favori: favoris.est(GENRE_CHANTIER, c.id), libelle: libelleChantier(c), surBascule: () => { void favoris.basculer(GENRE_CHANTIER, c.id).then(() => { if (vivant) refocaliser(c.id, 'basculer-favori'); }); } });
  }
  function boutonMenu(c) {
    const titre = libelleChantier(c);
    return h('button', {
      type: 'button', class: 'bouton-icone carte-menu', 'aria-label': `Actions : ${titre}`, 'aria-haspopup': 'menu', disabled: occupe, dataset: { action: 'menu-chantier' },
      onclick: (e) => { e.stopPropagation(); ouvrirMenu(e.currentTarget, actionsChantier(c).map((a) => ({ libelle: LIBELLE_ACTION_CHANTIER[a], icone: ICONE_ACTION[a], action: () => surAction(c, a) }))); },
    }, icone('ellipsis', { taille: 16 }));
  }
  const pourcentage = (c) => { const l = chiffres?.get(c.id); return l && l.budget_renseigne ? textePourcentage(l.pct_budget_consomme) : null; };

  function carte(c) {
    const titre = libelleChantier(c);
    const pct = pourcentage(c);
    return h('article', {
      class: 'carte-affaire', tabIndex: 0, dataset: { chantier: c.id }, 'aria-label': `Modifier le chantier : ${titre}`,
      onclick: (e) => { if (!e.target.closest('a, button')) ouvrirFenetre(c); },
      onkeydown: (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) ouvrirFenetre(c); },
    },
    h('div', { class: 'carte-ligne' }, h('strong', { class: 'carte-titre' }, titre), etoile(c), boutonMenu(c)),
    h('span', { class: 'carte-sous' }, `${c.code ?? '—'}${c.client ? ` · ${c.client}` : ''}`),
    c.date_debut || c.date_fin_prevue ? h('span', { class: 'carte-sous' }, `${dateFr(c.date_debut ?? null)} → ${dateFr(c.date_fin_prevue ?? null)}${c.date_fin_reelle ? ` (réelle ${dateFr(c.date_fin_reelle)})` : ''}`) : null,
    h('div', { class: 'carte-pied' }, h('span', { class: 'carte-montant' }, !c.budget_ht ? '—' : `${euros(c.budget_ht)} HT`), pct ? h('span', { class: 'carte-sous', dataset: { valeur: 'part-budget' } }, `${pct} du budget`) : null));
  }

  function rendreKanban(liste) {
    const groupes = regrouperParStatut(liste);
    return h('div', { class: 'kanban tableau-chantiers-colonnes' }, STATUTS_CHANTIER.map((s) => h('section', { class: 'colonne', dataset: { colonne: s.id }, 'aria-label': s.libelle, style: { '--couleur': COULEUR_STATUT_CHANTIER[s.id] } },
      h('header', { class: 'colonne-tete' }, h('h2', {}, s.libelle), h('span', { class: 'colonne-totaux' }, texteTeteColonne(groupes[s.id].length, totalBudget(groupes[s.id])))),
      h('div', { class: 'colonne-corps' }, groupes[s.id].length === 0 ? h('p', { class: 'colonne-vide' }, 'Aucun chantier') : groupes[s.id].map(carte)))));
  }

  function rendreTableau(liste) {
    const lignes = liste.map((c) => h('tr', { class: 'ligne-liste', dataset: { chantier: c.id } },
      h('td', { class: 'col-code', dataset: { libelle: 'Code' } }, c.code ?? '—'),
      h('td', { dataset: { libelle: 'Chantier' } }, h('span', { class: 'cellule-nom' }, libelleChantier(c)), c.client ? h('span', { class: 'aide' }, ` · ${c.client}`) : null),
      h('td', { dataset: { libelle: 'Statut' } }, h('span', { class: 'pastille-statut', style: { '--couleur': COULEUR_STATUT_CHANTIER[c.statut] ?? 'var(--texte2)' } }, libelleStatutChantier(c.statut))),
      h('td', { class: 'montant', dataset: { libelle: 'Budget HT' } }, !c.budget_ht ? '—' : euros(c.budget_ht)),
      h('td', { class: 'montant', dataset: { libelle: 'Part du budget' } }, pourcentage(c) ?? '—'),
      h('td', { dataset: { libelle: 'Début' } }, dateFr(c.date_debut ?? null)),
      h('td', { dataset: { libelle: 'Fin prévue' } }, dateFr(c.date_fin_prevue ?? null), c.date_fin_reelle ? h('span', { class: 'aide' }, ` · réelle ${dateFr(c.date_fin_reelle)}`) : null),
      h('td', { class: 'col-actions' }, etoile(c), boutonMenu(c))));
    return h('div', { class: 'zone-tableau' }, h('table', { class: 'tableau tableau-chantiers' },
      h('thead', {}, h('tr', {}, ['Code', 'Chantier', 'Statut', 'Budget HT', 'Part du budget', 'Début', 'Fin prévue'].map((t, i) => h('th', { scope: 'col', class: i === 3 || i === 4 ? 'col-montant' : '' }, t)), h('th', { scope: 'col', class: 'col-actions' }, h('span', { class: 'sr-only' }, 'Actions')))),
      h('tbody', {}, lignes)));
  }

  let dernier = { archives: false, affiches: [] };
  function rendre() {
    if (!vivant) return;
    // un seul chantier (adresse « liste/<id> ») : pas de bouton « Archives » (il montrerait d'autres chantiers) ; archivé, il est montré en tableau, donc « Liste » est cochée
    const seulArchive = seul !== null && chantierSeul(chantiers, seul).some((c) => c.archive === true);
    const vuesPossibles = [['kanban', 'Kanban', 'square-kanban'], ['liste', 'Liste', 'list'], ...(seul !== null ? [] : [['archives', 'Archives', 'archive']])];
    remplir(bascule, basculeVues({ vues: vuesPossibles, courante: seulArchive && vue === 'kanban' ? 'liste' : vue, surChangement: changerVue }));
    const pret = etatAcces === 'connecte' && lecture === 'ok';
    boutonNouveau.disabled = !pret;
    barre.element.hidden = !(pret && chantiers.length > 0);
    avis.hidden = !(pret && avertissement) && !(pret && !favorisDispo);
    avis.textContent = !pret ? '' : [avertissement, favorisDispo ? '' : 'Les favoris ne sont pas disponibles pour l’instant.'].filter(Boolean).join(' ');
    remplir(compteur, '');
    if (etatAcces === 'chargement' || (etatAcces === 'connecte' && lecture === 'chargement')) { remplir(zone, chargement()); boutonExport.disabled = true; return; }
    if (etatAcces !== 'connecte') { dessinerEtatAcces(zone, etatAcces, (forcer) => verifier(forcer)); boutonExport.disabled = true; return; }
    if (lecture === 'erreur') { remplir(zone, etatErreur(MESSAGE_LECTURE, () => charger(false))); boutonExport.disabled = true; return; }
    if (chantiers.length === 0) { remplir(zone, etatVide(MESSAGE_VIDE)); boutonExport.disabled = true; return; }
    const archives = vue === 'archives';
    const unSeul = seul !== null ? chantierSeul(chantiers, seul) : null;
    const dansLaVue = unSeul ?? chantiersDeVue(chantiers, vue);
    const affiches = trierChantiers(filtrerChantiers(dansLaVue, criteres), tri);
    dernier = { archives, affiches };
    filtres.majCompte(nombreFiltresChantiers(criteres));
    choixTri.maj(tri.critere, tri.sens);
    remplir(zonePastilles,
      unSeul?.length ? h('span', { class: 'pastille-filtre', dataset: { role: 'pastille-chantier-seul' } }, `Chantier : ${libelleChantier(unSeul[0])}`,
        h('button', { type: 'button', class: 'pastille-retrait', 'aria-label': 'Voir tous les chantiers', onclick: () => naviguer(ROUTE) }, icone('x', { taille: 12 }))) : null,
      pastillesChantiers(criteres).map((p) => h('span', { class: 'pastille-filtre' }, p.libelle,
        h('button', { type: 'button', class: 'pastille-retrait', 'aria-label': `Retirer le filtre : ${p.libelle}`, onclick: () => { criteres = retirerCritereChantier(criteres, p); rendre(); } }, icone('x', { taille: 12 })))),
      nombreFiltresChantiers(criteres) > 1 || (nombreFiltresChantiers(criteres) && criteres.recherche) ? h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', onclick: () => { criteres = { ...CRITERES_CHANTIERS_VIDES }; majChampRecherche(); rendre(); } }, 'Tout effacer') : null);
    remplir(compteur, texteCompteurChantiers(dansLaVue.length, affiches.length, archives));
    boutonExport.disabled = affiches.length === 0;
    boutonExport.title = affiches.length === 0 ? TEXTE_RIEN_A_EXPORTER : 'Télécharger ce qui est affiché (fichier pour tableur)';
    if (unSeul && unSeul.length === 0) { // le chantier de l'adresse n'est plus dans la liste (supprimé dans la base) : un état vide calme, pas une erreur
      remplir(zone, h('div', { class: 'etat-vide carte-section', role: 'status', dataset: { etat: 'vide', role: 'chantier-absent' } },
        h('p', {}, 'Ce chantier n’est plus dans la liste.'),
        h('a', { class: 'bouton bouton-secondaire', href: lien(ROUTE), dataset: { action: 'voir-tous-chantiers' } }, 'Voir tous les chantiers')));
      return;
    }
    if (affiches.length === 0) {
      const filtre = criteresChantiersActifs(criteres);
      remplir(zone, h('div', { class: 'etat-vide carte-section', role: 'status', dataset: { etat: 'vide' } },
        h('p', {}, filtre ? 'Aucun chantier ne correspond à ta recherche.' : archives ? 'Aucun chantier archivé.' : 'Tous les chantiers sont archivés.'),
        filtre ? h('button', { type: 'button', class: 'bouton bouton-secondaire', onclick: () => { criteres = { ...CRITERES_CHANTIERS_VIDES }; majChampRecherche(); rendre(); } }, 'Tout effacer') : null));
      return;
    }
    // un seul chantier archivé : le Kanban ne montre jamais les archivés, il est donc montré en tableau
    remplir(zone, vue === 'kanban' && !unSeul?.some((c) => c.archive === true) ? rendreKanban(affiches) : rendreTableau(affiches));
  }
  const majChampRecherche = () => { if (barre.champ.value !== criteres.recherche) barre.champ.value = criteres.recherche; };

  function changerVue(v) {
    vue = v; montrerErreurAction(null);
    if (v !== 'archives') ecrirePreference('vue.achatschantiers', v); // « Archives » n'est jamais la vue par défaut
    rendre();
  }

  /** Après une relecture, le focus revient sur l'élément de la ligne concernée (celui qui le tenait a pu disparaître). */
  function refocaliser(id, action) {
    setTimeout(() => { zone.querySelector(`[data-chantier="${CSS.escape(id)}"] [data-action="${action}"]`)?.focus(); }, 0);
  }

  // ------------------------------------------------------------ actions
  async function ouvrirFenetre(c) {
    if (occupe) return;
    montrerErreurAction(null);
    let message = '';
    const ok = await fenetreChantier({
      chantier: c, chiffres: c ? chiffres?.get(c.id) ?? null : null, chiffresDisponibles: chiffres !== null,
      enregistrer: async (champs) => {
        const d = donnees();
        try {
          if (c) message = (await d.enregistrerChantier(c, champs)) ? 'Chantier modifié' : 'Aucune modification';
          else { await d.creerChantier(champs); message = 'Chantier créé'; }
        } catch (e) {
          if (CODES_A_RECHARGER.has(e?.code)) void charger(true); // un autre a pu fermer ou archiver le chantier : on relit la liste, la fenêtre garde le message du serveur
          throw e;
        }
      },
    });
    if (!ok || !vivant) return;
    toast(message, { duree: DUREE_MESSAGE });
    if (!c && seul !== null) { naviguer(ROUTE); return; } // créé depuis la vue d'un seul chantier : la liste complète, pour le voir
    await charger(true);
    if (c) refocaliser(c.id, 'menu-chantier');
  }

  /** Archiver (confirmation, puis « Annuler » pendant 8 s) ou désarchiver (direct, sans confirmation) ; la liste est relue après. */
  async function archiver(c) {
    if (occupe) return;
    const nom = libelleChantier(c);
    const t = textesArchivage(nom);
    montrerErreurAction(null);
    if (!actionArchivageChantier(c).archive) {
      occupe = true; rendre();
      try { await donnees().desarchiver(c.id); } catch (e) { montrerErreurAction(e instanceof Error && e.message ? e.message : 'Une erreur est survenue, réessaie dans un instant.'); occupe = false; await charger(true); return; }
      occupe = false; await charger(true);
      if (vivant) toast(t.desarchive, { duree: DUREE_MESSAGE });
      return;
    }
    if (!(await confirmer(t.titre, t.message, { libelleOk: t.libelleOk }))) return;
    occupe = true; rendre();
    const res = await archiverPuisRelire(() => donnees().archiver(c.id), () => charger(true));
    occupe = false;
    if (!vivant) return;
    rendre();
    if (!res.ok) { montrerErreurAction(res.message); return; }
    toast(t.fait, { duree: DUREE_ANNULATION, action: { libelle: 'Annuler', surClic: async () => {
      const r = await annulerArchivage(() => donnees().desarchiver(c.id), () => charger(true));
      if (vivant) toast(r.ok ? MESSAGE_REMIS : r.message, { type: r.ok ? 'info' : 'erreur', duree: r.ok ? DUREE_MESSAGE : 6000 });
    } } });
  }

  const surAction = (c, a) => { if (a === 'modifier') ouvrirFenetre(c); else archiver(c); };

  function exporter() {
    if (dernier.affiches.length === 0) return;
    telechargerTexte(nomFichierExport(dateJourFichier()), chantiersCsv(dernier.affiches));
    toast('Export téléchargé', { duree: DUREE_MESSAGE });
  }

  // Une étoile qui change redessine la liste tout de suite ; un échec d'enregistrement du favori est dit à l'endroit habituel des erreurs.
  const arreterFavoris = favoris.abonner(() => { const e = favoris.lireErreur(); if (e) montrerErreurAction(e.message); rendre(); });
  rendre();
  void verifier(false);
  return () => { vivant = false; arreterFavoris(); };
}
