// Écran « Tableau de bord 2 » (module Achats) : six onglets (Dirigeant, Pilotage, Liste des factures, Prix et hausses, Lignes et articles, Fournisseurs et agences) lus dans la base de l'espace.
// LECTURE SEULE : rien n'est écrit, aucun lien vers une autre fiche. Chaque onglet garde ses propres filtres (Période et Chantier sont communs) tant que l'écran reste ouvert.
// États à l'écran : accès à régler, chargement, erreur de lecture (« Réessayer »), onglet vide ; le plafond de pages de la lecture est toujours dit à l'écran.
import { h, icone, remplir, vider, toast, iconeInfo } from '../../os/ui.js';
import { lien } from '../../os/router.js';
import { verifierAcces } from '../../os/acces-base.js';
import { enteteListe } from '../crm/barre-liste.js';
import { texteAcces, TEXTE_CHARGEMENT } from '../achatscommun/etat.js';
import { lireDonnees, lirePrix, lireFournisseurs } from './donnees.js';
import { lireCouleurs, filtresBarre, alerte } from './composants.js';
import { FILTRES_PAR_ONGLET, STATUT_A_VALIDER, actionNAValider, actionToutesPeriodes, actionVoirADecider, appliquerChangement, ecarteDuDefaut, filtrerChantiers, filtrerFactures, memoireParDefaut, nomFournisseur, rappelAValider, reinitialiser, texteHorsPeriode, valeursDistinctes } from './filtrage.js';
import { exporterFichier } from './export.js';
import { TEXTE_RIEN_A_EXPORTER } from './csv.js';
import { rendreDirigeant, rendrePilotage, rendreListe } from './onglets-factures.js';
import { rendrePrix } from './onglet-prix.js';
import { rendreLignes } from './onglet-lignes.js';
import { rendreFournisseurs } from './onglet-fournisseurs.js';

export const TITRE = 'Tableau de bord 2';
export const AIDE = 'Les tableaux de bord de tes achats et de tes chantiers, lus dans la base.';
export const ONGLETS = [
  { cle: 'dirigeant', libelle: 'Dirigeant' }, { cle: 'pilotage', libelle: 'Pilotage' }, { cle: 'liste', libelle: 'Liste des factures' },
  { cle: 'prix', libelle: 'Prix et hausses' }, { cle: 'lignes', libelle: 'Lignes et articles' }, { cle: 'fournisseurs', libelle: 'Fournisseurs et agences' },
];
const STATUTS = [STATUT_A_VALIDER, 'Acceptée', 'Refusée'];
export const TEXTE_ERREUR = { factures: 'Les chiffres n’ont pas pu être lus. Réessaie dans un instant.', prix: 'Les prix n’ont pas pu être lus. Réessaie dans un instant.', lignes: 'Les lignes d’achat n’ont pas pu être lues. Réessaie dans un instant.', fournisseurs: 'Les fournisseurs n’ont pas pu être lus. Réessaie dans un instant.' };

/** Carte d'état d'accès : mêmes attributs que l'écran d'état commun des Achats (data-role « achats-etat »). */
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

const chargement = (texte) => h('div', { class: 'chargement-bloc', role: 'status', dataset: { etat: 'chargement' } }, h('span', { class: 'rond-chargement' }), h('span', { class: 'aide' }, texte));
const blocErreur = (texte, reessayer) => h('div', { class: 'etat-vide carte-section', role: 'alert', dataset: { etat: 'erreur' } }, h('p', { class: 'mon-espace-erreur' }, texte),
  h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer' }, onclick: reessayer }, icone('refresh-cw', { taille: 16 }), 'Réessayer'));

/**
 * Monte l'écran dans `conteneur` et rend la fonction d'arrêt. `lire*`, `verifier` et `chargerEcharts` se remplacent dans les tests.
 */
export function rendreEcran(conteneur, { lire = lireDonnees, lireLesPrix = lirePrix, lireLesFournisseurs = lireFournisseurs, verifier = verifierAcces, chargerEcharts } = {}) {
  const page = h('div', { class: 'page page-liste page-tableauachats', dataset: { module: 'achats' } });
  vider(conteneur);
  conteneur.append(page);
  let vivant = true;
  let onglet = 'dirigeant';
  let memoire = memoireParDefaut(); // une mémoire de filtres par onglet ; Période et Chantier restent communs
  let donnees = null, erreur = null, enCours = false; // factures et chantiers
  let prix = { donnees: null, erreur: null, chargement: false };
  let fourn = { donnees: null, erreur: null, chargement: false };
  let prixDemande = false, fournDemande = false;
  let numero = 0, numeroPrix = 0, numeroFourn = 0; // une lecture plus ancienne qui arrive après est ignorée
  let fichierExport = null;
  let plein = false;
  const etats = {};
  const graphiques = [];
  const ctx = {
    couleurs: () => lireCouleurs(),
    graphiques,
    chargerEcharts,
    exporter(fichier) { fichierExport = fichier; majExport(); },
    etatOnglet(nom, init) { if (!etats[nom]) etats[nom] = init(); return etats[nom]; },
    libererGraphiques() { for (const g of graphiques.splice(0)) g.dispose(); },
    relirePrix: () => chargerLesPrix(),
  };

  // ---- cadre (titre, onglets, boutons) : construit une fois, mis à jour sur place
  const boutonsOnglets = ONGLETS.map((t) => h('button', { type: 'button', class: 'ta-bouton', dataset: { onglet: t.cle }, 'aria-pressed': 'false', onclick: () => choisir(t.cle) }, t.libelle));
  const boutonActualiser = h('button', { type: 'button', class: 'ta-bouton ta-bouton-icone', dataset: { action: 'actualiser' }, 'aria-label': 'Actualiser', title: 'Actualiser', onclick: () => actualiser() }, icone('refresh-cw', { taille: 16 }));
  const boutonPlein = h('button', { type: 'button', class: 'ta-bouton ta-bouton-icone', dataset: { action: 'plein-ecran' }, 'aria-pressed': 'false', 'aria-label': 'Plein écran', title: 'Plein écran', onclick: () => basculerPlein() }, icone('maximize', { taille: 16 }));
  const boutonExport = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'exporter' }, onclick: () => exporter() }, icone('download', { taille: 16 }), 'Exporter');
  const barre = h('div', { class: 'ta-barre' }, h('div', { class: 'ta-onglets', role: 'group', 'aria-label': 'Tableaux' }, boutonsOnglets), h('div', { class: 'ta-barre-actions' }, boutonActualiser, boutonPlein));
  const zone = h('div', { class: 'ta-zone', dataset: { role: 'zone' } });
  const quitterPlein = h('button', { type: 'button', class: 'ta-bouton ta-quitter', dataset: { action: 'quitter-plein' }, onclick: () => basculerPlein(false) }, icone('minimize', { taille: 16 }), 'Quitter le plein écran');
  const zoneFiltres = h('div', { class: 'ta-zone-filtres' });
  const zoneContenu = h('div', { class: 'ta-zone-contenu' });
  zone.append(zoneFiltres, zoneContenu);
  const entete = enteteListe({ titre: h('div', { class: 'titre-avec-aide' }, h('h1', {}, TITRE), iconeInfo('Lecture seule : ce tableau de bord ne modifie rien. Les chiffres viennent des factures et des chantiers de la base de l’espace. Chaque onglet garde ses filtres tant que tu restes sur cet écran.', 'tableau de bord')), actions: [boutonExport] });
  const corps = h('div', { class: 'ta-corps' });
  page.append(entete, corps);

  function majExport() {
    const vide = !fichierExport || !fichierExport.lignes.length;
    boutonExport.disabled = !fichierExport;
    boutonExport.title = vide ? TEXTE_RIEN_A_EXPORTER : 'Exporter le tableau affiché (fichier pour Excel)';
  }
  function exporter() {
    if (!exporterFichier(fichierExport)) toast(TEXTE_RIEN_A_EXPORTER);
  }
  function sourceCourante() {
    if (onglet === 'fournisseurs') return fourn;
    if (onglet === 'prix' || onglet === 'lignes') return prix;
    return { donnees, erreur, chargement: enCours };
  }
  function majBarre() {
    boutonsOnglets.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.onglet === onglet)));
    const s = sourceCourante();
    const occupe = Boolean(s.chargement);
    boutonActualiser.disabled = occupe;
    const libelle = occupe ? 'Actualisation…' : 'Actualiser';
    boutonActualiser.setAttribute('aria-label', libelle);
    boutonActualiser.title = libelle;
    boutonPlein.disabled = !s.donnees || Boolean(s.erreur);
    boutonPlein.setAttribute('aria-pressed', String(plein));
    remplir(boutonPlein, icone(plein ? 'minimize' : 'maximize', { taille: 16 }));
    const l = plein ? 'Quitter le plein écran' : 'Plein écran';
    boutonPlein.setAttribute('aria-label', l);
    boutonPlein.title = l;
  }
  function basculerPlein(valeur = !plein) {
    plein = valeur;
    zone.classList.toggle('ta-plein', plein);
    document.body.classList.toggle('ta-plein-actif', plein);
    if (plein) zone.prepend(quitterPlein); else quitterPlein.remove();
    majBarre();
    majContenu(); // les graphiques prennent la nouvelle taille
  }
  const surTouche = (e) => { if (e.key === 'Escape' && plein) basculerPlein(false); };
  document.addEventListener('keydown', surTouche);

  // ---- lectures
  async function demarrer(forcer = false) {
    remplir(corps, chargement(TEXTE_CHARGEMENT));
    let etat = 'illisible';
    try { etat = (await verifier(forcer)).etat; } catch (e) { console.warn('Accès à la base : vérification impossible', e?.code ?? e?.message); }
    if (!vivant) return;
    if (etat !== 'connecte') { remplir(corps, h('p', { class: 'aide' }, AIDE), carteAcces(etat, (f) => demarrer(f))); return; }
    remplir(corps, barre, zone);
    majExport();
    choisir(onglet, true);
    await charger();
  }
  async function charger() {
    const n = ++numero;
    enCours = true; erreur = null;
    majBarre(); majContenu();
    try { const d = await lire(); if (!vivant || n !== numero) return; donnees = d; } catch (e) {
      if (!vivant || n !== numero) return;
      erreur = e?.code === 'reconnexion' ? 'reconnexion' : 'lecture';
      console.warn('Tableau de bord : lecture impossible', e?.code ?? e?.message);
    }
    enCours = false;
    majBarre(); majFiltres(); majContenu();
  }
  async function chargerLesPrix() {
    const n = ++numeroPrix;
    prix = { ...prix, erreur: null, chargement: true };
    majBarre(); if (onglet === 'prix' || onglet === 'lignes' || onglet === 'fournisseurs') majContenu();
    try { const d = await lireLesPrix(); if (!vivant || n !== numeroPrix) return; prix = { donnees: d, erreur: null, chargement: false }; } catch (e) {
      if (!vivant || n !== numeroPrix) return;
      console.warn('Tableau de bord : prix illisibles', e?.code ?? e?.message);
      prix = { donnees: prix.donnees, erreur: e?.code === 'reconnexion' ? 'reconnexion' : 'lecture', chargement: false };
    }
    majBarre(); majFiltres(); majContenu();
  }
  async function chargerLesFournisseurs() {
    const n = ++numeroFourn;
    fourn = { ...fourn, erreur: null, chargement: true };
    majBarre(); if (onglet === 'fournisseurs') majContenu();
    try { const d = await lireLesFournisseurs(); if (!vivant || n !== numeroFourn) return; fourn = { donnees: d, erreur: null, chargement: false }; } catch (e) {
      if (!vivant || n !== numeroFourn) return;
      console.warn('Tableau de bord : fournisseurs illisibles', e?.code ?? e?.message);
      fourn = { donnees: fourn.donnees, erreur: e?.code === 'reconnexion' ? 'reconnexion' : 'lecture', chargement: false };
    }
    majBarre(); majFiltres(); majContenu();
  }
  function actualiser() {
    if (onglet === 'fournisseurs') { chargerLesFournisseurs(); chargerLesPrix(); } else if (onglet === 'prix' || onglet === 'lignes') chargerLesPrix(); else charger();
  }
  function choisir(cle, force = false) {
    if (cle === onglet && !force) return;
    onglet = cle;
    // Lectures à part, à la première ouverture seulement, chacune avec sa propre erreur : une panne des vues de prix ne touche pas les autres onglets.
    if ((cle === 'prix' || cle === 'lignes' || cle === 'fournisseurs') && !prixDemande) { prixDemande = true; chargerLesPrix(); }
    if (cle === 'fournisseurs' && !fournDemande) { fournDemande = true; chargerLesFournisseurs(); }
    majBarre(); majFiltres(); majContenu();
  }

  // ---- filtres du haut (par onglet)
  function defsFiltres() {
    const chantiers = [...(donnees?.chantiers ?? []).map((x) => x.chantier), ...(onglet === 'prix' || onglet === 'lignes' ? (prix.donnees?.lignes ?? []).map((x) => x.chantier) : []), ...(onglet === 'fournisseurs' ? (fourn.donnees?.factures ?? []).map((x) => x.chantier) : []), 'Sans chantier'];
    return [
      { id: 'periode', libelle: 'Période', type: 'periode' },
      { id: 'chantier', libelle: 'Chantier', type: 'liste', options: valeursDistinctes(chantiers) },
      { id: 'statut', libelle: 'Statut', type: 'liste', options: valeursDistinctes(STATUTS) },
      { id: 'fournisseur', libelle: 'Fournisseur', type: 'liste', options: valeursDistinctes((donnees?.factures ?? []).map(nomFournisseur)) },
    ].filter((d) => FILTRES_PAR_ONGLET[onglet].includes(d.id));
  }
  function majFiltres() {
    const defs = defsFiltres();
    const filtres = memoire[onglet];
    remplir(zoneFiltres, defs.length ? filtresBarre({ defs, valeurs: filtres, modifie: ecarteDuDefaut(filtres, onglet),
      surReinit: () => { memoire = reinitialiser(memoire, onglet); majFiltres(); majContenu(); },
      surChangement: (v) => { memoire = appliquerChangement(memoire, onglet, v); majFiltres(); majContenu(); } }) : '');
  }

  // ---- contenu de l'onglet
  function contenuFactures(filtres) {
    const factures = filtrerFactures(donnees.factures, filtres);
    const facturesToutePeriode = filtrerFactures(donnees.factures, { ...filtres, periode: undefined });
    const chantiers = filtrerChantiers(donnees.chantiers, filtres);
    const filtre = Object.values(filtres).some(Boolean);
    const aDecider = donnees.factures.filter((x) => x.statut === 'a_valider').length;
    const voirADecider = () => { memoire = actionVoirADecider(memoire); choisir('liste'); };
    if (onglet === 'dirigeant') return rendreDirigeant(ctx, { factures, chantiers, aDecider, voirADecider });
    if (onglet === 'pilotage') return rendrePilotage(ctx, { factures, facturesToutePeriode, chantiers, filtre });
    const rappel = rappelAValider(donnees.factures, memoire.liste);
    const choisis = filtres.statut && filtres.statut.type === 'liste' ? filtres.statut.choix : [];
    const rappelActif = choisis.length === 1 && choisis[0] === STATUT_A_VALIDER;
    const sur = (m) => { memoire = m; majFiltres(); majContenu(); };
    return h('div', {},
      rappel.total > 0 ? h('p', { class: 'ta-rappel', role: 'status', dataset: { role: 'rappel-a-valider' } },
        rappelActif ? null : h('button', { type: 'button', class: 'ta-fb-bouton', dataset: { action: 'n-a-valider' }, onclick: () => sur(actionNAValider(memoire, rappel.cachees)) }, `${rappel.total} à valider`),
        rappel.cachees > 0 ? h('span', { class: 'ta-alerte' }, texteHorsPeriode(rappel.cachees)) : null,
        rappel.cachees > 0 ? h('button', { type: 'button', class: 'ta-lien', dataset: { action: 'toutes-periodes' }, onclick: () => sur(actionToutesPeriodes(memoire)) }, 'Afficher toutes les périodes') : null) : null,
      rendreListe(ctx, { factures, filtre }));
  }
  function contenu() {
    const filtres = memoire[onglet];
    const s = onglet === 'fournisseurs' ? fourn : onglet === 'prix' || onglet === 'lignes' ? prix : { donnees, erreur, chargement: enCours };
    const nom = onglet === 'fournisseurs' ? 'fournisseurs' : onglet === 'prix' ? 'prix' : onglet === 'lignes' ? 'lignes' : 'factures';
    const relire = () => (onglet === 'fournisseurs' ? chargerLesFournisseurs() : onglet === 'prix' || onglet === 'lignes' ? chargerLesPrix() : charger());
    ctx.exporter(null);
    if (s.erreur === 'reconnexion' && !s.donnees) return carteAcces('reconnexion', () => relire());
    if (s.erreur && !s.donnees) return blocErreur(TEXTE_ERREUR[nom], relire);
    if (!s.donnees) return chargement(onglet === 'lignes' ? 'Chargement des lignes d’achat…' : onglet === 'prix' ? 'Chargement des prix…' : onglet === 'fournisseurs' ? 'Chargement des fournisseurs…' : 'Chargement des tableaux…');
    const avis = [];
    if (s.erreur) avis.push(alerte('L’actualisation a échoué : les chiffres affichés datent de la lecture précédente.'));
    if (s.donnees.message) avis.push(h('p', { class: 'ta-alerte', role: 'status', dataset: { role: 'plafond' } }, s.donnees.message));
    // Fournisseurs lit aussi les lignes de prix : si cette lecture a touché le plafond, on le dit aussi (une seule fois si c'est le même message).
    if (onglet === 'fournisseurs' && prix.donnees && prix.donnees.message && prix.donnees.message !== s.donnees.message) avis.push(h('p', { class: 'ta-alerte', role: 'status', dataset: { role: 'plafond-prix' } }, prix.donnees.message));
    // Un onglet de prix ou de fournisseurs a besoin des factures ou des prix pour ses filtres : ils se relisent à part (erreur à part).
    const corpsOnglet = onglet === 'prix' ? rendrePrix(ctx, prix.donnees, filtres)
      : onglet === 'lignes' ? rendreLignes(ctx, prix.donnees, filtres)
        : onglet === 'fournisseurs' ? rendreFournisseurs(ctx, fourn.donnees, prix, filtres)
          : contenuFactures(filtres);
    return h('div', {}, ...avis, corpsOnglet);
  }
  function majContenu() {
    ctx.libererGraphiques();
    remplir(zoneContenu, contenu());
  }

  // Thème clair ou sombre : les couleurs des graphiques sont relues dans les variables CSS à chaque dessin ; on redessine quand le thème change.
  const observateur = new MutationObserver(() => { if (donnees || prix.donnees || fourn.donnees) majContenu(); });
  observateur.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  // Thème « comme le système » : pas d'attribut data-theme, mais le réglage de l'appareil peut changer.
  const systemeSombre = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const surSysteme = () => { if (donnees || prix.donnees || fourn.donnees) majContenu(); };
  systemeSombre?.addEventListener?.('change', surSysteme);

  demarrer();
  return () => {
    vivant = false;
    observateur.disconnect();
    systemeSombre?.removeEventListener?.('change', surSysteme);
    document.removeEventListener('keydown', surTouche);
    document.body.classList.remove('ta-plein-actif');
    ctx.libererGraphiques();
  };
}
