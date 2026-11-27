// Écran « Factures » du module Achats (25/11/2026, PR 8a) : titre + compteur, « Exporter », barre commune (recherche, Filtres, Kanban | Liste | Archives, tri),
// puis le Kanban (trois colonnes toujours présentes) ou le tableau. Chaque carte ou ligne porte la pastille des contrôles automatiques et un menu « … » (Examiner, Archiver / Désarchiver).
// « Examiner » (la page d'une facture, le lecteur de PDF : examiner.js, PR 8b) s'ouvre par un clic sur la carte ou la ligne, ou par le menu « … ».
// Pas de glisser-déposer : le statut d'une facture se décide sur la page Examiner. « + Facture » (bouton jaune de la barre) envoie un PDF par les actions métier (fenetres.js).
// LECTURES : seulement par le client de la base ; ÉCRITURES (archiver, désarchiver) : seulement par les actions métier (n8n garde les règles) ; la liste est relue après chaque écriture.
// Les trois cas de l'écran : chargement, cas vide (aucune facture), cas d'erreur (lecture impossible, accès à renouveler, connexion non réglée), tous avec leur bouton.
import { h, icone, remplir, dialogue, confirmer, toast, ouvrirMenu, lirePreference, ecrirePreference } from '../../os/ui.js';
import { lien, naviguer } from '../../os/router.js';
import { clientBase, actionsBase, verifierAcces } from '../../os/acces-base.js';
import { enteteListe, barreListe, basculeVues } from '../crm/barre-liste.js';
import { texteAcces } from '../achatscommun/etat.js';
import { creerDonnees } from './donnees.js';
import { fenetreAjout } from './fenetres.js';
import { creerMagasinFavoris, favorisDeListe, clesParNom, cleEntreprise, ordonnerAvecFavoris, GENRE_CHANTIER, GENRE_ENTREPRISE } from './favoris.js';
import { facturesCsv, nomFichierExport, TEXTE_RIEN_A_EXPORTER } from './export-csv.js';
import { calculerPastilles, PASTILLE_INCONNUE } from './pastilles.js';
import { boutonEtoile, selecteurTri, boutonFiltres, etatVide, etatErreur, chargement, telechargerTexte, pastilleControles, etiquetteAvoir } from './composants.js';
import {
  CRITERES_TRI, CRITERES_VIDES, LIBELLE_STATUT, SANS_CHANTIER, SANS_FOURNISSEUR, STATUTS, VUES,
  actionArchivage, archiverPuisRelire, annulerArchivage, criteresActifs, dateFr, dateHeureFr, dateJourFichier, eurosFacture, filtrer, lireTri, lireVue,
  nomChantier, nomFournisseur, nombreFiltres, pastillesCarte, pastillesFiltres, regrouper, retirerCritere, selonVue, texteCompteur, texteTete, texteTri, textesArchivage,
  totaux, trier, triApresClicColonne, valeursDeFiltre, DUREE_ANNULATION, DUREE_MESSAGE, MESSAGE_ANALYSES_NON_LUES, MESSAGE_PEUT_ETRE_ANCIENNE, MESSAGE_LISTE_INCOMPLETE, MESSAGE_REMIS,
  MESSAGE_ERREUR_PAR_DEFAUT,
} from './logique.js';

export const TITRE = 'Factures';
export const AIDE = 'Les factures de l’espace, lues dans la base.';
const MESSAGE_LECTURE = 'Impossible de charger les factures. Vérifie ta connexion, puis réessaie.';
const MESSAGE_VIDE = 'Aucune facture pour l’instant. Elles arrivent par e-mail.';
const ICONES_ETAT = { 'non-regle': 'link', reconnexion: 'triangle-alert', illisible: 'triangle-alert' };
const CLASSE_STATUT = { a_valider: 'badge-attention', acceptee: 'badge-succes', refusee: 'badge-retard' };
const CLASSE_TON = { attention: 'badge-attention', retard: 'badge-retard', neutre: '' };
const COLONNES = [
  { id: 'fournisseur', libelle: 'Fournisseur' }, { id: 'numero', libelle: 'N°' }, { id: 'date', libelle: 'Date' }, { id: 'chantier', libelle: 'Chantier' },
  { id: 'montant', libelle: 'Montant TTC', classe: 'col-montant' }, { id: 'statut', libelle: 'Statut' }, { id: 'decision', libelle: 'Décidée le/par' },
];

/** Montre l'état de l'accès quand il n'est pas bon (connexion non réglée, badge à renouveler, réglages illisibles), avec le bouton qui convient. */
export function dessinerEtatAcces(zone, etat, relancer) {
  const alerte = etat !== 'non-regle';
  const bouton = (libelle, forcer) => h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer' }, onclick: () => relancer(forcer) }, icone('refresh-cw', { taille: 16 }), libelle);
  remplir(zone, h('section', { class: 'carte-section', role: alerte ? 'alert' : 'status', dataset: { role: 'achats-etat', etat } },
    h('p', { class: alerte ? 'mon-espace-erreur' : '', style: { display: 'flex', alignItems: 'flex-start', flexWrap: 'nowrap', gap: 'var(--esp-4)' } },
      h('span', { style: { flex: 'none', display: 'inline-flex' } }, icone(ICONES_ETAT[etat] ?? 'triangle-alert', { taille: 18 })), h('span', { dataset: { role: 'achats-etat-texte' } }, texteAcces(etat))),
    etat === 'non-regle' ? h('a', { class: 'bouton bouton-secondaire', href: lien('reglages/base') }, icone('chevron-right', { taille: 16 }), 'Ouvrir la connexion à la base') : null,
    etat === 'reconnexion' ? bouton('Revérifier', true) : null,
    etat === 'illisible' ? bouton('Réessayer', false) : null));
}

/**
 * Fenêtre « Filtres » : fournisseur et chantier (plusieurs possibles, favoris en haut avec leur étoile), période (date de la facture). La recherche garde son propre champ.
 * Renvoie les nouveaux critères, ou null si on ferme sans choisir. Les étoiles se mettent à jour pendant que la fenêtre est ouverte (le magasin des favoris prévient).
 */
async function fenetreFiltres(criteres, valeurs, listes, magasin) {
  let brouillon = { ...criteres, fournisseurs: [...criteres.fournisseurs], chantiers: [...criteres.chantiers] };
  const erreurFavori = h('p', { class: 'erreur favori-erreur', role: 'alert', hidden: true });
  const groupe = (cle, titre, toutes, favori, genre) => {
    const zone = h('div', { class: 'filtre-liste', dataset: { filtre: cle } });
    const dessiner = () => {
      const { favoris, autres } = ordonnerAvecFavoris(toutes, (v) => favori.peut(v) && favori.est(v));
      const ligne = (v) => h('div', { class: 'ligne-favori', dataset: { valeur: v } },
        h('label', { class: 'case' },
          h('input', { type: 'checkbox', checked: brouillon[cle].includes(v), onchange: (e) => { brouillon = { ...brouillon, [cle]: e.target.checked ? [...brouillon[cle], v] : brouillon[cle].filter((x) => x !== v) }; } }), v),
        favori.peut(v) ? boutonEtoile({ favori: favori.est(v), libelle: v, surBascule: () => favori.basculer(v) }) : null);
      remplir(zone,
        toutes.length === 0 ? h('span', { class: 'aide' }, 'Aucun pour l’instant.') : null,
        favoris.map(ligne),
        favoris.length > 0 && autres.length > 0 ? h('hr', { class: 'favori-sep', 'aria-hidden': 'true' }) : null,
        autres.map(ligne));
    };
    dessiner();
    return { element: h('fieldset', { class: 'bloc-champ groupe-cases', dataset: { genre } }, h('legend', { class: 'etiquette' }, titre), zone), dessiner };
  };
  const fournisseurs = groupe('fournisseurs', 'Fournisseur', valeurs.fournisseurs, listes.fournisseur, GENRE_ENTREPRISE);
  const chantiers = groupe('chantiers', 'Chantier', valeurs.chantiers, listes.chantier, GENRE_CHANTIER);
  const periode = h('div', { class: 'filtre-periode' },
    h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Facture depuis le'),
      h('input', { type: 'date', class: 'champ', value: brouillon.du, max: brouillon.au || undefined, dataset: { cle: 'du' }, onchange: (e) => { brouillon = { ...brouillon, du: e.target.value }; } })),
    h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Jusqu’au'),
      h('input', { type: 'date', class: 'champ', value: brouillon.au, min: brouillon.du || undefined, dataset: { cle: 'au' }, onchange: (e) => { brouillon = { ...brouillon, au: e.target.value }; } })));
  const arreter = magasin.abonner(() => { fournisseurs.dessiner(); chantiers.dessiner(); const e = magasin.lireErreur(); erreurFavori.textContent = e?.message ?? ''; erreurFavori.hidden = !e; });
  const r = await dialogue({
    titre: 'Filtres', classe: 'dialogue-formulaire dialogue-filtres', contenu: h('div', { class: 'pile filtres-corps' }, fournisseurs.element, chantiers.element, erreurFavori, periode),
    boutons: [{ libelle: 'Tout effacer', valeur: 'effacer' }, { libelle: 'Appliquer', valeur: 'appliquer', style: 'principal' }],
  });
  arreter();
  magasin.effacerErreur();
  if (r === 'effacer') return { ...CRITERES_VIDES, recherche: criteres.recherche };
  if (r === 'appliquer') return brouillon;
  return null;
}

/** Monte l'écran dans `conteneur`. Renvoie la fonction d'arrêt (la réponse tardive d'un écran quitté est ignorée). */
export function rendreEcran(conteneur) {
  let vivant = true;
  let etatAcces = 'chargement'; // chargement | connecte | non-regle | reconnexion | illisible
  let toutes = [];
  let complete = true;
  let analysesLues = true;
  let pastilles = {}; // identifiant de facture -> pastille de contrôles
  let favorisDispo = false;
  let lecture = 'chargement'; // chargement | ok | erreur
  let messageLecture = '';
  let numeroLecture = 0; // chaque lecture prend un numéro ; une lecture plus récente rend la précédente caduque (sa réponse tardive est ignorée)
  let peutEtreAncienne = false; // une relecture silencieuse (après archivage) a échoué : la liste affichée peut ne pas être à jour
  let occupe = false;
  let criteres = { ...CRITERES_VIDES };
  let vue = lireVue(lirePreference('vue.achatsfactures', ''));
  let tri = lireTri(lirePreference('tri.achatsfactures', ''));
  const donnees = () => creerDonnees({ client: clientBase(), actions: actionsBase() });
  const favoris = creerMagasinFavoris((genre, cle) => donnees().basculerFavori(genre, cle));

  const compteur = h('span', { class: 'compteur-liste', 'aria-live': 'polite' });
  const alerteListe = h('p', { class: 'erreur', role: 'status', hidden: true, dataset: { role: 'factures-incomplete' } });
  const avis = h('p', { class: 'aide', role: 'status', hidden: true, dataset: { role: 'factures-avis' } });
  const erreurAction = h('p', { class: 'erreur', role: 'alert', hidden: true, dataset: { erreur: 'action' } });
  const zone = h('div', { class: 'zone-affaires', dataset: { role: 'factures-zone' } });
  const bascule = h('div', { class: 'zone-bascule' });
  const zonePastilles = h('div', { class: 'pastilles-actives' });
  const filtres = boutonFiltres({ auClic: ouvrirFiltres });
  const choixTri = selecteurTri({ options: CRITERES_TRI, valeur: tri.critere, sens: tri.sens, surChangement: (t) => changerTri({ critere: t.critere, sens: t.sens }) });
  const boutonExport = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'exporter-factures' }, onclick: () => exporter() }, icone('download', { taille: 16 }), 'Exporter');
  const boutonPile = h('a', { class: 'bouton bouton-secondaire', href: lien('achatsfactures/pile'), dataset: { action: 'valider-a-la-suite' } }, icone('check-check', { taille: 16 }), 'Valider à la suite');
  const boutonAjout = h('button', { type: 'button', class: 'bouton bouton-principal', dataset: { action: 'ajouter-facture' }, onclick: () => ajouterFacture() }, icone('plus', { taille: 16 }), 'Facture');
  const barre = barreListe({
    recherche: { placeholder: 'Rechercher une facture', libelleAria: 'Rechercher une facture', valeur: criteres.recherche, surSaisie: (v) => { criteres = { ...criteres, recherche: v }; rendre(); } },
    elements: { filtres: filtres.element, vues: bascule, pastilles: zonePastilles }, tri: choixTri.element,
  });
  barre.element.hidden = true;
  boutonExport.disabled = true;

  conteneur.replaceChildren(h('div', { class: 'page page-liste page-affaires page-achats-factures', dataset: { module: 'achats' } },
    enteteListe({ titre: TITRE, compteur, actions: [boutonExport, boutonPile, boutonAjout] }),
    barre.element, alerteListe, avis, erreurAction, zone));

  const montrerErreurAction = (message) => { erreurAction.textContent = message ?? ''; erreurAction.hidden = !message; };
  const majChampRecherche = () => { if (barre.champ.value !== criteres.recherche) barre.champ.value = criteres.recherche; };

  // ------------------------------------------------------------ lecture
  async function verifier(forcer = false) {
    etatAcces = 'chargement'; lecture = 'chargement'; rendre();
    let etat = 'illisible';
    try { etat = (await verifierAcces(forcer)).etat; } catch (e) { console.warn('Accès à la base : vérification impossible', e?.code ?? e?.message); }
    if (!vivant) return;
    etatAcces = etat;
    if (etat === 'connecte') await charger(false); else rendre();
  }

  /** Lit les factures (obligatoire), puis le nombre de lignes, les IBAN confirmés et les favoris (facultatifs : leur échec ne bloque pas la liste). `silencieux` : relecture après une écriture. */
  async function charger(silencieux) {
    const numero = ++numeroLecture;
    if (!silencieux) { lecture = 'chargement'; rendre(); }
    const d = donnees();
    let lue;
    try { lue = await d.chargerFactures(); } catch (e) {
      if (!vivant || numero !== numeroLecture) return;
      if (e?.code === 'reconnexion') { etatAcces = 'reconnexion'; rendre(); return; }
      console.warn('Factures : lecture impossible', e?.code ?? e?.message);
      if (silencieux) { peutEtreAncienne = true; rendre(); return; } // on garde ce qui était affiché, avec un avis
      lecture = 'erreur'; rendre();
      return;
    }
    if (!vivant || numero !== numeroLecture) return;
    const [nb, ib, fa] = await Promise.allSettled([d.chargerNombreLignes(lue.liste), d.chargerIbansConfirmes(), d.chargerFavoris()]);
    if (!vivant || numero !== numeroLecture) return;
    toutes = lue.liste; complete = lue.complete; analysesLues = lue.analysesLues; messageLecture = lue.complete ? '' : lue.message;
    lecture = 'ok'; peutEtreAncienne = false;
    pastilles = calculerPastilles(toutes, nb.status === 'fulfilled' ? nb.value : null, complete, analysesLues, ib.status === 'fulfilled' ? ib.value : null, null);
    favorisDispo = fa.status === 'fulfilled';
    if (favorisDispo) favoris.charger(fa.value);
    rendre();
  }

  // ------------------------------------------------------------ dessin
  const ouvrirExaminer = (f) => naviguer(`achatsfactures/examiner/${f.id}`);
  const surOuverture = (f) => (e) => { if (e.type === 'click' ? !e.target.closest('a, button') : (e.key === 'Enter' && e.target === e.currentTarget)) ouvrirExaminer(f); };

  function boutonMenu(f) {
    const titre = nomFournisseur(f);
    const archivage = actionArchivage(f);
    return h('button', {
      type: 'button', class: 'bouton-icone carte-menu', 'aria-label': `Actions : ${titre}`, 'aria-haspopup': 'menu', disabled: occupe, dataset: { action: 'menu-facture' },
      onclick: (e) => {
        e.stopPropagation();
        ouvrirMenu(e.currentTarget, [
          { libelle: 'Examiner', icone: 'file-text', action: () => ouvrirExaminer(f) },
          ...(archivage ? [{ libelle: archivage === 'archiver' ? 'Archiver' : 'Désarchiver', icone: archivage === 'archiver' ? 'archive' : 'archive-restore', action: () => archiver(f) }] : []),
        ]);
      },
      onkeydown: (e) => e.stopPropagation(),
    }, icone('ellipsis', { taille: 16 }));
  }

  const pastilleDe = (f) => pastilleControles(pastilles[f.id] ?? PASTILLE_INCONNUE);

  function carte(f) {
    const nom = f.fournisseur?.trim() || null;
    const titre = nom ?? SANS_FOURNISSEUR;
    const p = pastilles[f.id] ?? PASTILLE_INCONNUE;
    return h('article', {
      class: 'carte-affaire', tabIndex: 0, dataset: { facture: f.id }, 'aria-label': `Examiner la facture : ${titre}. ${p.texte}`,
      onclick: surOuverture(f), onkeydown: surOuverture(f),
    },
    h('div', { class: 'carte-ligne' }, h('strong', { class: `carte-titre${nom ? '' : ' nom-inconnu'}` }, titre), boutonMenu(f)),
    h('span', { class: 'carte-sous' }, icone('file-text', { taille: 12 }), `N° ${f.numero ?? '—'}`, etiquetteAvoir(f), ` · ${dateFr(f.date_facture)}`),
    h('span', { class: 'carte-sous' }, nomChantier(f)),
    h('div', { class: 'carte-pied' },
      h('span', { class: 'carte-montant' }, `${eurosFacture(f.montant_ttc, f)} TTC`),
      pastillesCarte(f).map((x) => h('span', { class: `badge ${CLASSE_TON[x.ton]}` }, x.libelle)),
      pastilleDe(f)));
  }

  function rendreKanban(liste) {
    const groupes = regrouper(liste);
    return h('div', { class: 'kanban' }, STATUTS.map((s) => h('section', { class: 'colonne', dataset: { colonne: s.id }, 'aria-label': s.titre, style: { '--couleur': s.couleur } },
      h('header', { class: 'colonne-tete' }, h('h2', {}, s.titre), h('span', { class: 'colonne-totaux' }, texteTete(totaux(groupes[s.id])))),
      h('div', { class: 'colonne-corps' }, groupes[s.id].length === 0 ? h('p', { class: 'colonne-vide' }, `Aucune facture ${LIBELLE_STATUT[s.id].toLowerCase()}.`) : groupes[s.id].map(carte)))));
  }

  function rendreTableau(liste) {
    const entetes = COLONNES.map((c) => h('th', { scope: 'col', class: c.classe ?? '', 'aria-sort': tri.critere === c.id ? (tri.sens === 'asc' ? 'ascending' : 'descending') : 'none' },
      h('button', { type: 'button', class: 'tri', dataset: { tri: c.id }, onclick: () => changerTri(triApresClicColonne(tri, c.id)) },
        c.libelle, tri.critere === c.id ? icone(tri.sens === 'asc' ? 'arrow-up' : 'arrow-down', { taille: 12 }) : null)));
    const lignes = liste.map((f) => {
      const nom = f.fournisseur?.trim() || SANS_FOURNISSEUR;
      return h('tr', { class: 'ligne-liste', tabIndex: 0, dataset: { facture: f.id }, 'aria-label': `Examiner la facture : ${nom}`, onclick: surOuverture(f), onkeydown: surOuverture(f) },
        h('td', {}, h('span', { class: `cellule-nom${f.fournisseur?.trim() ? '' : ' nom-inconnu'}` }, nom)),
        h('td', { dataset: { libelle: 'N°' } }, f.numero ?? '—', etiquetteAvoir(f)),
        h('td', { dataset: { libelle: 'Date' } }, dateFr(f.date_facture)),
        h('td', { dataset: { libelle: 'Chantier' } }, f.chantiers?.nom ?? SANS_CHANTIER),
        h('td', { class: 'montant', dataset: { libelle: 'Montant TTC' } }, eurosFacture(f.montant_ttc, f)),
        h('td', { dataset: { libelle: 'Statut' } }, h('span', { class: `badge ${CLASSE_STATUT[f.statut] ?? ''}` }, `${LIBELLE_STATUT[f.statut] ?? f.statut}${f.statut === 'acceptee' && f.acceptee_malgre_alerte ? ' malgré alerte' : ''}`)),
        h('td', { dataset: { libelle: 'Décidée le/par' } }, f.date_decision ? [dateHeureFr(f.date_decision), f.decide_par ? h('span', { class: 'aide' }, ` par ${f.decide_par}`) : null] : '—'),
        h('td', { class: 'col-pastille', dataset: { libelle: 'Contrôles' } }, pastilleDe(f)),
        h('td', { class: 'col-actions' }, boutonMenu(f)));
    });
    return h('div', { class: 'zone-tableau' }, h('table', { class: 'tableau tableau-factures' },
      h('thead', {}, h('tr', {}, entetes,
        h('th', { scope: 'col', class: 'col-pastille' }, h('span', { class: 'sr-only' }, 'Contrôles automatiques')),
        h('th', { scope: 'col', class: 'col-actions' }, h('span', { class: 'sr-only' }, 'Actions')))),
      h('tbody', {}, lignes)));
  }

  let dernier = { affiches: [] };
  function rendre() {
    if (!vivant) return;
    boutonAjout.disabled = etatAcces !== 'connecte';
    remplir(bascule, basculeVues({ vues: VUES, courante: vue, surChangement: changerVue }));
    const pret = etatAcces === 'connecte' && lecture === 'ok';
    barre.element.hidden = !(pret && toutes.length > 0);
    alerteListe.hidden = !(pret && !complete);
    alerteListe.textContent = pret && !complete ? [MESSAGE_LISTE_INCOMPLETE, messageLecture].filter(Boolean).join(' ') : '';
    const mots = [];
    if (pret && !analysesLues) mots.push(MESSAGE_ANALYSES_NON_LUES);
    if (pret && peutEtreAncienne) mots.push(MESSAGE_PEUT_ETRE_ANCIENNE);
    if (pret && !favorisDispo) mots.push('Les favoris ne sont pas disponibles pour l’instant.');
    avis.hidden = mots.length === 0;
    avis.textContent = mots.join(' ');
    remplir(compteur, '');
    if (etatAcces === 'chargement' || (etatAcces === 'connecte' && lecture === 'chargement')) { remplir(zone, chargement()); boutonExport.disabled = true; return; }
    if (etatAcces !== 'connecte') { dessinerEtatAcces(zone, etatAcces, (forcer) => verifier(forcer)); boutonExport.disabled = true; return; }
    if (lecture === 'erreur') { remplir(zone, etatErreur(MESSAGE_LECTURE, () => charger(false))); boutonExport.disabled = true; return; }
    if (toutes.length === 0) { remplir(zone, etatVide(MESSAGE_VIDE)); boutonExport.disabled = true; return; }
    const archives = vue === 'archives';
    const dansLaVue = selonVue(toutes, archives);
    const affiches = trier(filtrer(dansLaVue, criteres), tri);
    dernier = { affiches };
    const n = nombreFiltres(criteres);
    filtres.majCompte(n);
    choixTri.maj(tri.critere, tri.sens);
    const effacer = () => { criteres = { ...CRITERES_VIDES }; majChampRecherche(); rendre(); };
    remplir(zonePastilles,
      pastillesFiltres(criteres, dateFr).map((p) => h('span', { class: 'pastille-filtre' }, p.libelle,
        h('button', { type: 'button', class: 'pastille-retrait', 'aria-label': `Retirer le filtre : ${p.libelle}`, onclick: () => { criteres = retirerCritere(criteres, p); rendre(); } }, icone('x', { taille: 12 })))),
      n > 1 || (n && criteres.recherche) ? h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', onclick: effacer }, 'Tout effacer') : null);
    remplir(compteur, texteCompteur(dansLaVue.length, affiches.length, archives, criteresActifs(criteres)));
    boutonExport.disabled = affiches.length === 0;
    boutonExport.title = affiches.length === 0 ? TEXTE_RIEN_A_EXPORTER : 'Télécharger ce qui est affiché (fichier pour tableur)';
    if (affiches.length === 0 && vue !== 'kanban') {
      remplir(zone, videFiltre(effacer, archives));
      return;
    }
    if (affiches.length === 0) remplir(zone, videFiltre(effacer, archives), rendreKanban(affiches));
    else remplir(zone, vue === 'kanban' ? rendreKanban(affiches) : rendreTableau(affiches));
  }

  function videFiltre(effacer, archives) {
    const filtre = criteresActifs(criteres);
    return h('div', { class: 'etat-vide carte-section', role: 'status', dataset: { etat: 'vide' } },
      h('p', {}, filtre ? 'Aucune facture ne correspond à ta recherche.' : archives ? 'Aucune facture archivée.' : 'Toutes les factures sont archivées.'),
      filtre ? h('button', { type: 'button', class: 'bouton bouton-secondaire', onclick: effacer }, 'Tout effacer') : null);
  }

  function changerVue(v) {
    vue = v; montrerErreurAction(null);
    if (v !== 'archives') ecrirePreference('vue.achatsfactures', v); // « Archives » n'est jamais la vue par défaut
    rendre();
  }
  function changerTri(t) { tri = t; ecrirePreference('tri.achatsfactures', texteTri(t)); rendre(); }

  async function ouvrirFiltres() {
    const dansLaVue = selonVue(toutes, vue === 'archives');
    const cles = {
      chantier: clesParNom(dansLaVue.map((f) => ({ nom: nomChantier(f), cle: f.chantier_id }))),
      fournisseur: clesParNom(dansLaVue.map((f) => ({ nom: nomFournisseur(f), cle: cleEntreprise(f.etablissements_fournisseur?.siret, f.fournisseur_siren) }))),
    };
    const listes = { chantier: favorisDeListe(GENRE_CHANTIER, cles.chantier, favoris), fournisseur: favorisDeListe(GENRE_ENTREPRISE, cles.fournisseur, favoris) };
    const r = await fenetreFiltres(criteres, valeursDeFiltre(dansLaVue), listes, favoris);
    if (r && vivant) { criteres = r; rendre(); }
  }

  /** Après une relecture, le focus revient sur l'élément de la ligne concernée (celui qui le tenait a pu disparaître). */
  function refocaliser(id, action) {
    setTimeout(() => { zone.querySelector(`[data-facture="${CSS.escape(id)}"] [data-action="${action}"]`)?.focus(); }, 0);
  }

  // ------------------------------------------------------------ actions
  /** Archiver (confirmation, puis « Annuler » pendant 8 s) ou désarchiver (direct, sans confirmation) ; la liste est relue après. Le message du serveur est dit tel quel en cas de refus. */
  async function archiver(f) {
    if (occupe) return;
    const nom = f.fournisseur?.trim() ?? '';
    const t = textesArchivage(nom);
    const action = actionArchivage(f);
    if (!action) return;
    montrerErreurAction(null);
    if (action === 'desarchiver') {
      occupe = true; rendre();
      try { await donnees().desarchiver(f.id); } catch (e) { montrerErreurAction(e instanceof Error && e.message ? e.message : MESSAGE_ERREUR_PAR_DEFAUT); occupe = false; await charger(true); return; }
      occupe = false; await charger(true);
      if (vivant) { toast(t.desarchive, { duree: DUREE_MESSAGE }); refocaliser(f.id, 'menu-facture'); }
      return;
    }
    if (!(await confirmer(t.titre, t.message, { libelleOk: t.libelleOk }))) return;
    occupe = true; rendre();
    const res = await archiverPuisRelire(() => donnees().archiver(f.id), () => charger(true));
    occupe = false;
    if (!vivant) return;
    rendre();
    if (!res.ok) { montrerErreurAction(res.message); return; }
    toast(t.fait, { duree: DUREE_ANNULATION, action: { libelle: 'Annuler', surClic: async () => {
      const r = await annulerArchivage(() => donnees().desarchiver(f.id), () => charger(true));
      if (vivant) toast(r.ok ? MESSAGE_REMIS : r.message, { type: r.ok ? 'info' : 'erreur', duree: r.ok ? DUREE_MESSAGE : 6000 });
    } } });
  }

  /** « + Facture » : fenêtre d'envoi d'un PDF ; la facture arrive « À valider » après lecture. Le message du serveur reste dans la fenêtre si l'envoi échoue. */
  async function ajouterFacture() {
    if (occupe) return;
    const r = await fenetreAjout({ actions: actionsBase() });
    if (!vivant || !r?.ok) return;
    toast(r.resultat.lectureReussie ? 'Facture ajoutée : elle est dans « À valider »' : 'Facture ajoutée : la lecture automatique est à compléter', { duree: DUREE_MESSAGE });
    await charger(true);
  }

  function exporter() {
    if (dernier.affiches.length === 0) return;
    telechargerTexte(nomFichierExport(dateJourFichier()), facturesCsv(dernier.affiches));
    toast('Export téléchargé', { duree: DUREE_MESSAGE });
  }

  // Une étoile qui change redessine la liste tout de suite ; un échec d'enregistrement du favori est dit à l'endroit habituel des erreurs (la fenêtre Filtres le dit aussi chez elle).
  const arreterFavoris = favoris.abonner(() => { rendre(); });
  rendre();
  void verifier(false);
  return () => { vivant = false; arreterFavoris(); };
}
