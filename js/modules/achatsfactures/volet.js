// Volet « Fournisseurs, Chantiers, Articles » de « l'application Factures » (27/11/2026, maquette v3) : il s'ouvre à droite sur ordinateur (la facture reste visible derrière),
// et monte du bas sur téléphone. En haut : trois boutons pour passer d'une liste à l'autre, et la croix. Pas d'onglets à mémoriser : on ferme avec la croix, on rouvre par le grand bouton.
// Quand une FICHE est ouverte, les trois boutons disparaissent : il ne reste que « ← » (retour à la liste) et la croix.
// Fiche d'un fournisseur ou d'un chantier : d'abord en lecture, puis « Modifier », « Enregistrer » / « Annuler » (fiche.js : la mise en page ne bouge pas). Fiche d'un article : lecture seule.
// LECTURES et ÉCRITURES : seulement par donnees-appli.js (client de la base ; actions métier existantes). Trois cas partout : chargement, cas vide, cas d'erreur avec « Réessayer ».
// IBAN (correction du 27/11/2026) : il ne se saisit plus dans la fiche. Le bouton « Signaler un changement d'IBAN » retire l'ancienne confirmation (action existante `revoquer_iban`), après une
// confirmation explicite ; le nouvel IBAN sera lu sur la prochaine facture puis confirmé après vérification. Un IBAN annoncé n'est gardé que sous sa forme masquée, dans le motif.
// CLAVIER : à l'ouverture le focus va sur le premier bouton du volet ; après chaque redessin d'une fiche, sur son titre ; à la fermeture, il revient au bouton d'où l'on a ouvert.
// Échap ferme le volet (sauf si une fenêtre est ouverte : Échap ferme alors la fenêtre). Sur téléphone le volet est une fenêtre (role="dialog", aria-modal) et la page ne défile pas derrière.
import { h, icone, iconeInfo, remplir, toast } from '../../os/ui.js';
import { champRecherche } from '../crm/barre-liste.js';
import { creerFiche } from './fiche.js';
import { fenetreAction } from './fenetres.js';
import { ibanValide, normaliserIban } from './controles.js';
import { champsAgenceDepuis, verifierChampsAgence } from './agences.js';
import { dateFr, nomFournisseur, SANS_FOURNISSEUR, DUREE_MESSAGE } from './logique.js';
import { initiales, masquerIban, correspond, verifierChantierFiche, champsChantierModifies, motifChangementIban, MESSAGE_IBAN_RETIRE, LIBELLE_STATUT_CHANTIER, OBJET_DU_VOLET, plusSelonModeEmploi, lignesSelonModeEmploi, saisieSelonModeEmploi } from './logique-appli.js';

export const ONGLETS = Object.freeze([['fournisseurs', 'Fournisseurs', 'building-2'], ['chantiers', 'Chantiers', 'folder-kanban'], ['articles', 'Articles', 'tag']]);
const TITRE = Object.fromEntries(ONGLETS.map(([id, libelle]) => [id, libelle]));
const VIDE_SANS_PLUS = 'Aucun fournisseur pour l’instant. Ils naissent des factures lues.';
const VIDE = { fournisseurs: 'Aucun fournisseur pour l’instant. Ils naissent des factures lues, ou du bouton « + Fournisseur ».', chantiers: 'Aucun chantier pour l’instant.', articles: 'Aucun article pour l’instant. Ils naissent des lignes des factures.' };
const ERREUR = { fournisseurs: 'Impossible de lire les fournisseurs. Vérifie ta connexion, puis réessaie.', chantiers: 'Impossible de lire les chantiers. Vérifie ta connexion, puis réessaie.', articles: 'Impossible de lire les articles. Vérifie ta connexion, puis réessaie.' };
const NOTE_FOURNISSEUR = 'Le nom, le SIREN, les agences et l’e-mail viennent des factures lues : ils ne se modifient pas ici pour l’instant. L’IBAN ne se saisit pas ici : il est lu sur les factures, puis confirmé après vérification.';
const NOTE_CONFIRME = 'Si le fournisseur t’annonce un nouvel IBAN, signale-le : l’ancien ne sera plus reconnu.';
const NOTE_SANS_CONFIRMATION = 'Cet IBAN n’a jamais été confirmé : il n’y a rien à signaler ici. Chaque facture reste contrôlée (IBAN nouveau ou changé = alerte).';
const NOTE_PERIMEE = 'La liste n’a pas pu être relue : elle n’est peut-être pas à jour.';
const LIBELLE_SIGNALER = 'Signaler un changement d’IBAN';
const TELEPHONE = '(max-width: 767px)';
const CLASSE_PAGE_FIGEE = 'af-volet-ouvert'; // posée sur <html> : sur téléphone, la page ne défile pas derrière le volet (css/achatsfactures-appli.css)

/**
 * `donnees()` : creerDonneesAppli ; `lireFournisseurs()` : renvoie la liste DÉJÀ préparée par l'application (partagée avec les bandeaux de la pile), ou null si elle n'est pas lue ;
 * `rechargerFournisseurs()` : la relit (après une écriture) ; `surEcriture()` : prévient l'application qu'une donnée a changé (la facture affichée est relue en silence) ; `surEtat(ouvert)` ;
 * `boutonRepli()` : le bouton qui reçoit le focus à la fermeture quand celui d'où l'on a ouvert n'existe plus (le grand bouton « Fournisseurs, Chantiers, Articles »).
 * Renvoie { element, voile, ouvrir(onglet), ouvrirFiche(type, id), ouvrirNouveau(facture), fermer(), estOuvert(), rafraichir(), arreter() }.
 */
export function creerVolet({ donnees, etatFournisseurs, rechargerFournisseurs, surEcriture = () => {}, surEtat = () => {}, boutonRepli = () => null, surModeEmploi = () => {} }) {
  let vivant = true;
  let ouvert = false;
  let onglet = 'fournisseurs';
  let vue = 'liste'; // liste | fiche | nouveau
  let cle = null; // identifiant de la fiche ouverte
  let depuisFacture = null; // facture qui pré-remplit « Nouveau fournisseur »
  let recherche = '';
  const numeros = { chantiers: 0, articles: 0 }; // un compteur PAR liste : la lecture d'une liste ne rend jamais caduque celle de l'autre (sinon sa roue tourne sans fin)
  const cache = { chantiers: { etat: 'vide', lignes: [], perime: false }, articles: { etat: 'vide', lignes: [], perime: false } }; // etat : vide | chargement | ok | erreur ; perime : la dernière relecture a échoué, les anciennes lignes sont gardées
  let origine = null; // l'élément qui avait le focus à l'ouverture : il le retrouve à la fermeture
  let origineAction = null; // son `data-action`, pour le retrouver s'il a été redessiné entre-temps
  // Mode d'emploi de la base (PR 2b) : lu dès la création du volet (avant qu'on l'ouvre, en général) ; null tant qu'il n'est pas lu ou s'il n'existe pas (l'écran reste alors comme avant).
  // Une panne passagère est réessayée à l'ouverture suivante (3 essais au plus) ; une absence (ancienne base, 403, 404, vide) ne l'est pas.
  let modeEmploi = null;
  let modeEmploiEnCours = false;
  let modeEmploiFini = false;
  let modeEmploiEssais = 0;

  const tete = h('div', { class: 'af-volet-tete' });
  const corps = h('div', { class: 'af-volet-corps' });
  const element = h('aside', { class: 'af-volet', hidden: true, tabIndex: -1, 'aria-label': 'Fournisseurs, Chantiers, Articles', dataset: { role: 'volet' } }, tete, corps);
  const voile = h('div', { class: 'af-voile', hidden: true, dataset: { role: 'voile-volet' }, onclick: () => fermer() });
  const croix = () => h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Fermer le volet', title: 'Fermer', dataset: { action: 'fermer-volet' }, onclick: () => fermer() }, icone('x', { taille: 18 }));
  const pastille = (texte, couleur) => h('span', { class: 'af-av', 'aria-hidden': 'true', style: couleur ? { '--af-av': couleur } : null }, texte);

  // ------------------------------------------------------------ lecture des listes (chantiers, articles) ; les fournisseurs viennent de l'application
  async function charger(quoi, forcer = false) {
    if (quoi === 'fournisseurs') { if (forcer || etatFournisseurs().etat === 'erreur') { const p = rechargerFournisseurs(); dessiner(); await p; } return; } // à la fin de la lecture, l'application appelle `rafraichir` (jamais par-dessus une saisie)
    const c = cache[quoi];
    if (!forcer && (c.etat === 'ok' || c.etat === 'chargement')) return;
    const n = ++numeros[quoi];
    const avant = c.lignes;
    cache[quoi] = { etat: 'chargement', lignes: avant, perime: false }; dessiner();
    try {
      const lignes = await (quoi === 'chantiers' ? donnees().lireChantiers() : donnees().lireArticles());
      if (!vivant || n !== numeros[quoi]) return;
      cache[quoi] = { etat: 'ok', lignes, perime: false };
    } catch (e) {
      if (!vivant || n !== numeros[quoi]) return;
      console.warn(`Volet : lecture des ${quoi} impossible`, e?.code ?? e?.message);
      // Relecture en échec alors qu'une liste était déjà là (après un enregistrement réussi, par exemple) : on garde les anciennes lignes, avec un mot et « Réessayer » ; jamais « fiche introuvable ».
      cache[quoi] = avant.length ? { etat: 'ok', lignes: avant, perime: true } : { etat: 'erreur', lignes: [], perime: false };
    }
    if (onglet === quoi && !saisieEnCours()) dessiner();
  }
  /**
   * Lit le mode d'emploi une seule fois. Il n'arrive qu'APRÈS le premier dessin (le volet ne l'attend jamais) ; à son arrivée, le volet est redessiné, sauf pendant une saisie
   * (il s'appliquera au prochain dessin). Aucun message en cas d'échec : `lireModeEmploi` rend null et l'écran reste comme avant.
   */
  async function chargerModeEmploi() {
    if (!vivant || modeEmploiFini || modeEmploiEnCours || modeEmploiEssais >= 3) return;
    let d = null;
    try { d = donnees(); } catch { d = null; }
    if (typeof d?.lireModeEmploi !== 'function') return;
    modeEmploiEnCours = true; modeEmploiEssais += 1;
    let r;
    try { r = await d.lireModeEmploi({ essai: true }); } catch { r = { mode: null, definitif: false }; }
    modeEmploiEnCours = false;
    if (!vivant) return;
    modeEmploiFini = r.definitif || !!r.mode;
    if (!r.mode) return;
    modeEmploi = r.mode;
    surModeEmploi(); // l'application redessine ses bandeaux (bouton « Ajouter » d'un nouveau fournisseur)
    if (ouvert && !saisieEnCours() && vue !== 'nouveau') dessiner();
  }
  const plus = (quoi) => plusSelonModeEmploi(modeEmploi, OBJET_DU_VOLET[quoi], quoi === 'fournisseurs'); // seul « + Fournisseur » existe à l'écran
  /** Pas de « + » parce que la base ne le permet pas : à sa place, la phrase de la base (gris et « i », règle « limite » de docs/consignes-ui.md). */
  const sansPlus = (quoi) => { if (quoi !== 'fournisseurs') return null; const p = plus(quoi); return !p.montrer && p.phrase ? h('span', { class: 'af-sans-plus aide', dataset: { role: 'sans-plus' } }, 'Pas d’ajout ici', iconeInfo(p.phrase, 'Pas d’ajout ici')) : null; };
  const selonBase = (quoi, lignes) => lignesSelonModeEmploi(modeEmploi, OBJET_DU_VOLET[quoi], lignes);

  /** Une fiche est en cours de modification : une lecture qui finit ne la redessine pas (la saisie serait perdue). */
  const saisieEnCours = () => vue !== 'liste' && !!corps.querySelector('[data-role="fiche"][data-mode="modification"]');
  const etatDe = (quoi) => (quoi === 'fournisseurs' ? etatFournisseurs() : cache[quoi]);

  // ------------------------------------------------------------ dessin
  const visible = (el) => !!el && el.isConnected && el.getClientRects().length > 0;
  const poserFocus = (el) => { try { el?.focus({ preventScroll: false }); } catch { /* élément retiré entre-temps */ } };

  /**
   * Redessine le volet. Le focus clavier ne se perd jamais derrière le volet : `focus: 'ouverture'` le pose sur le premier bouton ; sinon, s'il était dans le volet (ou nulle part :
   * l'élément qui le portait vient d'être redessiné), il va sur le titre de la fiche, ou sur le bouton de la liste active (ou reste dans la recherche). S'il est ailleurs dans la page, on n'y touche pas.
   */
  function dessiner({ focus = 'garder' } = {}) {
    if (!vivant || !ouvert) return;
    const actif = document.activeElement;
    const dedans = !actif || actif === document.body || element.contains(actif);
    const recherchait = !!actif && element.contains(actif) && actif.matches?.('input[type="search"]');
    const curseur = recherchait ? actif.selectionStart : null;
    element.dataset.vue = vue;
    element.dataset.onglet = onglet;
    if (vue === 'liste') dessinerListe();
    else if (vue === 'nouveau') dessinerNouveau();
    else dessinerFiche();
    if (focus === 'ouverture') { poserFocus(tete.querySelector('button') ?? element); return; }
    if (!dedans || document.querySelector('.voile-dialogue')) return; // une fenêtre ouverte garde son focus
    if (vue !== 'liste') { poserFocus(corps.querySelector('[data-role="fiche-titre"]') ?? tete.querySelector('button')); return; }
    const champ = recherchait ? corps.querySelector('input[type="search"]') : null;
    if (champ) { poserFocus(champ); try { champ.setSelectionRange(curseur, curseur); } catch { /* type de champ sans sélection */ } return; }
    poserFocus(tete.querySelector('button.actif') ?? tete.querySelector('button'));
  }

  function teteListe() {
    remplir(tete,
      h('div', { class: 'af-seg', role: 'group', 'aria-label': 'Choisir la liste', dataset: { role: 'volet-onglets' } }, ONGLETS.map(([id, libelle, ic]) => h('button', {
        type: 'button', class: onglet === id ? 'actif' : '', 'aria-pressed': String(onglet === id), dataset: { onglet: id },
        onclick: () => { if (onglet === id) return; onglet = id; recherche = ''; dessiner(); void charger(id); },
      }, icone(ic, { taille: 16 }), h('span', {}, libelle)))),
      croix());
  }

  /** En-tête d'une fiche ou d'un formulaire : « ← » (retour à la liste) et la croix, jamais les trois boutons. */
  function teteFiche(type) {
    remplir(tete,
      h('button', { type: 'button', class: 'af-retour', 'aria-label': `Retour à la liste : ${TITRE[type]}`, title: 'Retour à la liste', dataset: { action: 'retour-liste-volet' },
        onclick: () => { vue = 'liste'; onglet = type; cle = null; depuisFacture = null; dessiner(); void charger(type); } }, icone('chevron-left', { taille: 16 }), TITRE[type]),
      croix());
  }

  const etatBloc = (role, attr, ...contenu) => h('div', { class: 'etat-vide carte-section', role, dataset: attr }, ...contenu);

  function dessinerListe() {
    teteListe();
    const e = etatDe(onglet);
    const boite = champRecherche({ placeholder: 'Rechercher…', libelleAria: `Rechercher dans ${TITRE[onglet]}`, valeur: recherche, surSaisie: (v) => { recherche = v; remplir(zone, lignes()); } });
    const zone = h('div', { class: 'af-liste-zone' });
    const outils = h('div', { class: 'af-volet-outils' }, boite.element,
      plus(onglet).montrer ? h('button', { type: 'button', class: 'bouton bouton-principal', dataset: { action: 'nouveau-fournisseur' }, onclick: () => ouvrirNouveau(null) }, icone('plus', { taille: 16 }), 'Fournisseur') : sansPlus(onglet));
    function lignes() {
      if (e.etat === 'chargement' || e.etat === 'vide') return h('div', { class: 'chargement-bloc', role: 'status', dataset: { etat: 'chargement' } }, h('span', { class: 'rond-chargement' }), h('span', { class: 'aide' }, 'Chargement…'));
      if (e.etat === 'erreur') return etatBloc('alert', { etat: 'erreur' }, h('p', { class: 'mon-espace-erreur' }, ERREUR[onglet]),
        h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer' }, onclick: () => { void charger(onglet, true); } }, icone('refresh-cw', { taille: 16 }), 'Réessayer'));
      if (e.lignes.length === 0) return etatBloc('status', { etat: 'vide' }, h('p', {}, onglet === 'fournisseurs' && !plus('fournisseurs').montrer ? VIDE_SANS_PLUS : VIDE[onglet]));
      const visibles = e.lignes.filter((x) => correspond(texteDe(x), recherche));
      if (visibles.length === 0) return etatBloc('status', { etat: 'sans-resultat' }, h('p', {}, 'Rien ne correspond à ta recherche.'));
      return h('ul', { class: 'af-liste', dataset: { role: 'volet-liste' } }, visibles.map(ligne));
    }
    remplir(corps, outils, notePerimee(onglet), zone);
    remplir(zone, lignes());
  }

  const texteDe = (x) => (onglet === 'fournisseurs' ? `${x.nom} ${x.siren ?? ''}` : onglet === 'chantiers' ? `${x.nom} ${x.code ?? ''} ${x.client ?? ''}` : `${x.designation ?? ''} ${x.reference ?? ''} ${x.fournisseur ?? ''}`);

  /**
   * Texte long (règle commune du 27/11/2026, docs/consignes-ui.md) : le titre et le détail vont à la ligne, 2 lignes au plus, puis « … » (classe `texte-2-lignes`) ;
   * le texte entier est dans l'infobulle de la ligne (au survol) et dans la fiche (au clic).
   */
  const textes = (titre, detail) => h('span', { class: 'af-grandit' }, h('b', { class: 'texte-2-lignes', dataset: { role: 'ligne-titre' } }, titre), h('span', { class: 'aide texte-2-lignes', dataset: { role: 'ligne-detail' } }, detail));

  function ligne(x) {
    let contenu; let titre; let detail;
    if (onglet === 'fournisseurs') {
      titre = x.nom;
      detail = x.nbFactures === null ? 'Factures non lues' : `${x.nbFactures} facture${x.nbFactures > 1 ? 's' : ''}${x.derniere ? ` · dernière le ${dateFr(x.derniere)}` : ''}`;
      contenu = [pastille(initiales(x.nom)), textes(titre, detail), x.changement ? h('span', { class: 'af-puce-iban', dataset: { role: 'puce-iban' } }, 'IBAN changé') : null];
    } else if (onglet === 'chantiers') {
      titre = x.nom;
      detail = [LIBELLE_STATUT_CHANTIER[x.statut] ?? x.statut, x.client].filter(Boolean).join(' · ') || '—';
      contenu = [pastille(icone('folder-kanban', { taille: 16 })), textes(titre, detail), x.code ? h('span', { class: 'aide' }, x.code) : null];
    } else {
      titre = x.designation?.trim() || x.reference || 'Article sans nom';
      detail = [x.fournisseur, x.reference ? `Réf. ${x.reference}` : null].filter(Boolean).join(' · ') || '—';
      contenu = [pastille(icone('tag', { taille: 16 })), textes(titre, detail), x.unite ? h('span', { class: 'aide' }, x.unite) : null];
    }
    const infobulle = [titre, detail === '—' ? null : detail].filter(Boolean).join('\n');
    return h('li', {}, h('button', { type: 'button', class: 'af-ligne', title: infobulle, dataset: { fiche: x.id }, onclick: () => { vue = 'fiche'; cle = x.id; dessiner(); } }, contenu));
  }

  /** Une liste gardée après une relecture en échec : un mot, et « Réessayer ». */
  const notePerimee = (quoi) => (quoi !== 'fournisseurs' && cache[quoi].perime ? h('p', { class: 'aide af-perime', role: 'status', dataset: { role: 'liste-perimee' } }, NOTE_PERIMEE, ' ',
    h('button', { type: 'button', class: 'af-lien-mini', dataset: { action: 'reessayer' }, onclick: () => { if (!saisieEnCours()) void charger(quoi, true); } }, 'Réessayer')) : null); // jamais par-dessus une saisie en cours (elle serait jetée)
  const titreFiche = (nom, sous, marque) => h('div', { class: 'af-fiche-nom' }, pastille(marque), h('div', {}, h('h2', { tabIndex: -1, dataset: { role: 'fiche-titre' } }, nom), h('p', { class: 'aide' }, sous)));
  const roue = () => h('div', { class: 'chargement-bloc', role: 'status', dataset: { etat: 'chargement' } }, h('span', { class: 'rond-chargement' }), h('span', { class: 'aide' }, 'Chargement…'));
  const introuvable = (type) => { teteFiche(type); remplir(corps, etatBloc('status', { etat: 'vide' }, h('p', {}, 'Cette fiche est introuvable : elle a peut-être été retirée.'))); };
  /** La fiche ne peut pas être montrée parce que la lecture a échoué (ce n'est PAS « introuvable ») : le message, et « Réessayer ». */
  const ficheIllisible = (type) => { teteFiche(type); remplir(corps, etatBloc('alert', { etat: 'erreur' }, h('p', { class: 'mon-espace-erreur' }, ERREUR[type]),
    h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer' }, onclick: () => { void charger(type, true); } }, icone('refresh-cw', { taille: 16 }), 'Réessayer'))); };

  function dessinerFiche() {
    if (onglet === 'fournisseurs') { dessinerFournisseur(); return; }
    teteFiche(onglet);
    const x = cache[onglet].lignes.find((l) => l.id === cle);
    if (!x) { const etat = cache[onglet].etat; if (etat === 'chargement' || etat === 'vide') remplir(corps, roue()); else if (etat === 'erreur') ficheIllisible(onglet); else introuvable(onglet); return; }
    if (onglet === 'articles') {
      remplir(corps, titreFiche(x.designation?.trim() || x.reference || 'Article sans nom', 'Fiche article', icone('tag', { taille: 18 })),
        creerFiche({ lignes: selonBase('articles', [
          { cle: 'fournisseur', libelle: 'Fournisseur', valeur: x.fournisseur ?? '—' }, { cle: 'reference', champBase: 'reference', libelle: 'Référence', valeur: x.reference ?? '—' },
          { cle: 'designation', champBase: 'designation', libelle: 'Désignation', valeur: x.designation ?? '—' }, { cle: 'unite', champBase: 'unite', libelle: 'Unité', valeur: x.unite ?? '—' },
        ]), note: 'Un article se lit sur les factures : il ne se modifie pas ici.' }).element);
      return;
    }
    const lignesChantier = [
        { cle: 'nom', champBase: 'nom', libelle: 'Nom', valeur: x.nom ?? '—', modifiable: true }, { cle: 'code', champBase: 'code', libelle: 'Code', valeur: x.code ?? '—', modifiable: true },
        { cle: 'client', champBase: 'client', libelle: 'Client', valeur: x.client ?? '—', modifiable: true }, { cle: 'adresse', champBase: 'adresse', libelle: 'Adresse', valeur: x.adresse ?? '—', modifiable: true },
        { cle: 'statut', champBase: 'statut', libelle: 'Statut', valeur: LIBELLE_STATUT_CHANTIER[x.statut] ?? x.statut ?? '—' },
    ];
    const fiche = creerFiche({
      lignes: selonBase('chantiers', lignesChantier),
      note: 'Le statut, le budget et les dates se règlent dans l’écran Chantiers.',
      surEnregistrer: async (brute) => {
        // Un champ cadenassé par le mode d'emploi n'est jamais envoyé : il est retiré de la saisie (même si la fiche était ouverte avant l'arrivée du mode d'emploi) et garde sa valeur.
        const saisis = saisieSelonModeEmploi(modeEmploi, 'chantiers', lignesChantier, brute);
        const v = { nom: x.nom ?? '', code: x.code ?? '', client: x.client ?? '', adresse: x.adresse ?? '', ...saisis };
        // Seuls les champs saisis sont vérifiés : un champ cadenassé (que la personne ne peut pas corriger) ne bloque jamais l'enregistrement des autres.
        const probleme = verifierChantierFiche({ nom: 'x', code: 'x', client: '', adresse: '', ...saisis });
        if (probleme) throw new Error(probleme);
        const modifies = champsChantierModifies(x, v);
        const change = await donnees().enregistrerChantier(x, v);
        if (!vivant) return;
        if (!change) { dessiner(); return; }
        Object.assign(x, modifies); // l'enregistrement a réussi : la fiche montre tout de suite les nouvelles valeurs, même si la relecture qui suit échoue
        toast('Chantier enregistré', { duree: DUREE_MESSAGE });
        await charger('chantiers', true);
        surEcriture();
      },
    });
    remplir(corps, titreFiche(x.nom, 'Fiche chantier', icone('folder-kanban', { taille: 18 })), notePerimee('chantiers'), fiche.element);
  }

  function dessinerFournisseur() {
    teteFiche('fournisseurs');
    const e = etatFournisseurs();
    const fo = e.lignes.find((l) => l.id === cle);
    if (!fo) { if (e.etat === 'chargement' || e.etat === 'vide') remplir(corps, roue()); else if (e.etat === 'erreur') ficheIllisible('fournisseurs'); else introuvable('fournisseurs'); return; }
    const agences = fo.agences.map((a) => [a.nom_agence, a.ville].filter(Boolean).join(' · ') || (a.siret ? `SIRET ${a.siret}` : 'Agence')).join(' ; ') || '—';
    const villes = [...new Set(fo.agences.map((a) => a.ville?.trim()).filter(Boolean))].join(', ') || '—';
    // L'IBAN (masqué) a sa case à lui ; « confirmé ou non » est dit sur la ligne suivante : rien n'est coupé, même sur téléphone.
    const ibanTexte = !fo.ibansLus ? 'Non lu' : fo.iban ? masquerIban(fo.iban) : '—';
    const confirmeTexte = !fo.ibansLus ? 'Non lu' : fo.confirmation ? `Oui, le ${dateFr(fo.confirmation.confirme_le)}` : fo.iban ? 'Non, jamais' : '—';
    const signaler = fo.confirmation ? h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'signaler-iban' }, onclick: () => { void signalerChangementIban(fo); } }, icone('triangle-alert', { taille: 16 }), LIBELLE_SIGNALER) : null;
    const fiche = creerFiche({
      lignes: selonBase('fournisseurs', [
        { cle: 'nom', champBase: 'nom', libelle: 'Nom', valeur: fo.nom }, { cle: 'siren', champBase: 'siren', libelle: 'SIREN', valeur: fo.siren ?? '—' },
        { cle: 'agences', libelle: 'Agence(s)', valeur: agences }, { cle: 'adresse', libelle: 'Adresse', valeur: villes }, { cle: 'email', libelle: 'E-mail', valeur: fo.email ?? '—' },
        { cle: 'iban', libelle: 'IBAN', valeur: ibanTexte, classe: 'af-iban' }, { cle: 'iban-confirme', libelle: 'IBAN confirmé', valeur: confirmeTexte },
        { cle: 'nb', libelle: 'Nombre de factures', valeur: fo.nbFactures === null ? '—' : String(fo.nbFactures) }, { cle: 'derniere', libelle: 'Dernière facture', valeur: fo.derniere ? dateFr(fo.derniere) : '—' },
      ]),
      note: `${NOTE_FOURNISSEUR} ${fo.confirmation ? NOTE_CONFIRME : fo.iban && fo.ibansLus ? NOTE_SANS_CONFIRMATION : ''}`.trim(),
      actionsLecture: signaler ? [signaler] : [],
    });
    const alerte = fo.changement ? h('div', { class: 'af-alerte', role: 'status', dataset: { role: 'alerte-iban-fiche' } }, icone('triangle-alert', { taille: 16 }),
      h('div', {}, h('b', {}, `L’IBAN a été changé le ${dateFr(fo.changement.date)}`), h('span', {}, 'Ses prochaines factures portent une alerte orange : appelle le fournisseur sur un numéro que tu connais déjà avant de payer.'))) : null;
    const historique = fo.historique.length ? [h('p', { class: 'af-titre-sec' }, 'Historique des IBAN'),
      h('ul', { class: 'af-histo', dataset: { role: 'historique-iban' } }, fo.historique.map((c) => h('li', {}, h('span', { class: 'af-iban' }, masquerIban(c.iban)),
        h('span', { class: 'aide' }, c.revoque_le ? `révoqué le ${dateFr(c.revoque_le)}` : `confirmé le ${dateFr(c.confirme_le)}`))))] : null;
    remplir(corps, titreFiche(fo.nom, 'Fiche fournisseur', initiales(fo.nom)), alerte, fiche.element, historique);
  }

  /**
   * « Signaler un changement d'IBAN » : après une confirmation explicite, l'ancienne confirmation est révoquée (action existante). Rien d'autre n'est écrit : le nouvel IBAN sera lu sur la
   * prochaine facture, puis confirmé après vérification. Si la personne écrit l'IBAN qu'on lui annonce, seule sa forme masquée va dans le motif (jamais l'IBAN entier).
   * La fenêtre reste ouverte si le serveur refuse (son message y est dit).
   */
  async function signalerChangementIban(fo) {
    const champ = h('input', { type: 'text', class: 'champ af-iban', placeholder: 'FR76 …', 'aria-label': 'Nouvel IBAN annoncé (facultatif)', autocomplete: 'off', spellcheck: false, dataset: { champ: 'nouvel-iban' } });
    const r = await fenetreAction({
      titre: 'Signaler un changement d’IBAN ?', libelle: 'Retirer l’ancien IBAN',
      contenu: () => [
        h('p', {}, `L’IBAN confirmé de ${fo.nom} (${masquerIban(fo.iban)}) ne sera plus reconnu : ses prochaines factures porteront une alerte orange. Le nouvel IBAN sera lu sur sa prochaine facture, puis confirmé après vérification.`),
        h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Nouvel IBAN annoncé (facultatif)'), champ),
        h('p', { class: 'aide' }, 'Il sert seulement de trace : il n’est gardé que masqué (4 premiers et 4 derniers caractères), et il n’est pas confirmé.')],
      executer: async () => {
        const nouveau = normaliserIban(champ.value);
        if (nouveau && !ibanValide(nouveau)) throw new Error('Cet IBAN n’est pas valide (format ou clé de contrôle) : vérifie les caractères, ou laisse le champ vide.');
        if (nouveau && nouveau === normaliserIban(fo.iban)) throw new Error('C’est l’IBAN déjà confirmé : il n’y a pas de changement à signaler.');
        await donnees().revoquerIban(fo.confirmation.id, motifChangementIban(nouveau));
      },
    });
    if (!r?.ok || !vivant) return;
    toast(MESSAGE_IBAN_RETIRE, { duree: DUREE_MESSAGE });
    for (const b of corps.querySelectorAll('[data-action="signaler-iban"]')) b.disabled = true; // c'est fait : pas de second signalement pendant la relecture
    await rechargerFournisseurs(); // en échec : la fiche dit « impossible de lire » avec « Réessayer », jamais « introuvable » ni l'ancien IBAN « confirmé »
    if (vivant) { dessiner(); surEcriture(); }
  }

  function dessinerNouveau() {
    teteFiche('fournisseurs');
    const f = depuisFacture;
    const lus = f ? champsAgenceDepuis(f.extraction) : { nom_fournisseur: '', siret: '', siren: '', nom_agence: '', ville: '' };
    if (f && !lus.nom_fournisseur && nomFournisseur(f) !== SANS_FOURNISSEUR) lus.nom_fournisseur = nomFournisseur(f);
    if (f && !lus.siren && f.fournisseur_siren) lus.siren = f.fournisseur_siren;
    const fiche = creerFiche({
      mode: 'creation', libelleEnregistrer: 'Enregistrer',
      lignes: [
        { cle: 'nom_fournisseur', libelle: 'Nom', valeur: lus.nom_fournisseur, modifiable: true, placeholder: 'Nom du fournisseur' },
        { cle: 'siret', libelle: 'SIRET', valeur: lus.siret, modifiable: true, placeholder: '14 chiffres' }, { cle: 'siren', libelle: 'SIREN', valeur: lus.siren, modifiable: true, placeholder: '9 chiffres' },
        { cle: 'nom_agence', libelle: 'Agence', valeur: lus.nom_agence, modifiable: true, placeholder: 'Par exemple « Agence Nord »' }, { cle: 'ville', libelle: 'Ville', valeur: lus.ville, modifiable: true, placeholder: 'Ville de l’agence' },
      ],
      note: 'L’IBAN ne se saisit pas ici : il est lu sur les factures, puis confirmé après vérification.',
      surAnnuler: () => { if (f) fermer(); else { vue = 'liste'; depuisFacture = null; dessiner(); } },
      surEnregistrer: async (v) => {
        const probleme = verifierChampsAgence(v);
        if (probleme) throw new Error(probleme);
        const r = await donnees().creerFournisseur(v);
        if (!vivant) return;
        toast(`Fournisseur ajouté : ${v.nom_fournisseur}`, { duree: DUREE_MESSAGE });
        await rechargerFournisseurs();
        if (!vivant) return;
        const liste = etatFournisseurs().lignes;
        const cree = liste.find((x) => x.agences.some((a) => a.id === r?.agence_id)) ?? liste.find((x) => v.siren && x.siren === v.siren.replace(/\D/g, '')) ?? liste.find((x) => x.nom === v.nom_fournisseur);
        depuisFacture = null;
        if (cree) { vue = 'fiche'; cle = cree.id; } else vue = 'liste';
        dessiner();
        surEcriture();
      },
    });
    remplir(corps, h('h2', { class: 'af-titre-nouveau', tabIndex: -1, dataset: { role: 'fiche-titre' } }, 'Nouveau fournisseur'),
      f ? h('p', { class: 'af-info', dataset: { role: 'prerempli' } }, icone('check', { taille: 16 }), `Pré-rempli depuis la facture${f.numero ? ` ${f.numero}` : ''}${f.date_facture ? ` du ${dateFr(f.date_facture)}` : ''}. Vérifie avant d’enregistrer.`) : null,
      fiche.element);
  }

  // ------------------------------------------------------------ ouverture, fermeture
  /** Échap ferme le volet. Écouteur posé à l'ouverture, retiré à la fermeture ; en phase de capture, pour voir une fenêtre AVANT qu'elle se ferme (son Échap ne ferme qu'elle). */
  function surTouche(e) {
    if (!ouvert || e.defaultPrevented) return;
    if (e.key === 'Tab') { garderTab(e); return; }
    if (e.key !== 'Escape') return;
    if (document.querySelector('.voile-dialogue, .menu-pop, .suggestions:not([hidden])')) return;
    e.preventDefault();
    fermer();
  }
  /** Sur téléphone le volet est une fenêtre (aria-modal) : Tab tourne dans le volet, il ne part jamais dans la page cachée derrière. Une fenêtre ouverte par-dessus garde son propre Tab. */
  function garderTab(e) {
    if (element.getAttribute('aria-modal') !== 'true' || document.querySelector('.voile-dialogue')) return;
    const cibles = [...element.querySelectorAll('button, a[href], input, select, textarea, [tabindex="0"]')].filter((x) => !x.disabled && visible(x));
    if (cibles.length === 0) { e.preventDefault(); poserFocus(element); return; }
    const premier = cibles[0]; const dernier = cibles.at(-1); const actif = document.activeElement;
    const rang = cibles.indexOf(actif);
    if (e.shiftKey ? (rang <= 0) : (rang === -1 || actif === dernier)) { e.preventDefault(); poserFocus(e.shiftKey ? dernier : premier); }
  }
  function montrer() {
    const avant = ouvert;
    if (!avant) {
      const a = document.activeElement;
      origine = a && a !== document.body && !element.contains(a) ? a : null;
      origineAction = origine?.dataset?.action ?? null;
    }
    ouvert = true;
    element.hidden = false; voile.hidden = false;
    element.classList.toggle('af-volet-entre', !avant); // l'animation d'arrivée ne joue qu'à l'ouverture, pas à chaque changement de liste
    if (!avant) {
      // Sur téléphone, le volet couvre la page : c'est une fenêtre (annoncée comme telle), et la page ne défile pas derrière.
      const tel = typeof window.matchMedia === 'function' && window.matchMedia(TELEPHONE).matches;
      if (tel) { element.setAttribute('role', 'dialog'); element.setAttribute('aria-modal', 'true'); } else { element.removeAttribute('role'); element.removeAttribute('aria-modal'); }
      document.documentElement.classList.add(CLASSE_PAGE_FIGEE);
      document.addEventListener('keydown', surTouche, true);
    }
    dessiner({ focus: avant ? 'garder' : 'ouverture' });
    if (!avant) surEtat(true);
    void chargerModeEmploi(); // nouvel essai seulement après une panne passagère
  }
  function ouvrir(quoi = 'fournisseurs') { onglet = quoi; vue = 'liste'; cle = null; depuisFacture = null; recherche = ''; montrer(); void charger(quoi); }
  function ouvrirFiche(type, id) { onglet = type; vue = 'fiche'; cle = id; depuisFacture = null; montrer(); void charger(type); }
  function ouvrirNouveau(facture) { onglet = 'fournisseurs'; vue = 'nouveau'; cle = null; depuisFacture = facture ?? null; montrer(); }
  const liberer = () => { document.removeEventListener('keydown', surTouche, true); document.documentElement.classList.remove(CLASSE_PAGE_FIGEE); };
  function fermer() {
    if (!ouvert) return;
    const avaitFocus = !document.activeElement || document.activeElement === document.body || element.contains(document.activeElement);
    ouvert = false; vue = 'liste'; cle = null; depuisFacture = null; // une saisie en cours est jetée : la croix vaut « Annuler »
    element.hidden = true; voile.hidden = true;
    remplir(corps);
    liberer();
    surEtat(false);
    // Le focus revient au bouton d'où l'on a ouvert ; s'il a été redessiné, à celui qui le remplace ; sinon au grand bouton.
    if (avaitFocus) poserFocus([origine, origineAction ? [...document.querySelectorAll(`[data-action="${origineAction}"]`)].find(visible) : null, boutonRepli()].find(visible));
    origine = null; origineAction = null;
  }

  /** Les fournisseurs viennent d'être relus par l'application : la liste (ou une fiche encore en chargement) se redessine ; une saisie en cours n'est jamais écrasée. */
  function rafraichir() { if (ouvert && onglet === 'fournisseurs' && (vue === 'liste' || corps.querySelector('[data-etat="chargement"], [data-etat="erreur"]'))) dessiner(); }

  setTimeout(() => { void chargerModeEmploi(); }, 0); // dès la création : en général, le mode d'emploi est là avant la première ouverture (pas de « + » qui apparaît puis disparaît)
  /** `peutCreer('fournisseurs')` : le « + » selon le mode d'emploi de la base (vrai sans mode d'emploi, comme avant). Pour les autres portes de création (bandeau de la facture). */
  return { element, voile, ouvrir, ouvrirFiche, ouvrirNouveau, fermer, estOuvert: () => ouvert, rafraichir, peutCreer: (quoi) => plus(quoi).montrer, arreter: () => { vivant = false; liberer(); } };
}
