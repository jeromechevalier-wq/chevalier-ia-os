// « L'application Factures » (27/11/2026, maquette v3 validée) : routes achatsfactures/pile (l'accueil de l'appli), achatsfactures/tableau et achatsfactures/reglages.
// RÈGLE GÉNÉRALE des applications de module (docs/consignes-ui.md) : en haut à gauche « maison › nom de l'appli » (la maison ramène à l'accueil de l'espace, le nom ramène à l'accueil de l'appli) ;
// en haut à droite l'icône statistiques (tableau de bord de CETTE appli) puis la roue dentée (réglages de CETTE appli). Pas de menu à gauche (la coque le cache : js/os/shell.js, « mode-appli »).
// La pile : une facture à la fois (pile.js), le grand bouton « Fournisseurs, Chantiers, Articles » qui ouvre le volet (volet.js), le bandeau « Nouveau fournisseur détecté »,
// l'alerte orange « IBAN changé récemment », et le mode plein écran « concentration » (touches V = valider, R = refuser, P = passer, Échap = sortir).
// LECTURES : seulement par le client de la base (donnees-appli.js) ; ÉCRITURES : seulement par les actions métier. Les écouteurs du clavier et du plein écran sont retirés à la sortie du mode et de l'écran.
import { h, icone, remplir, toast } from '../../os/ui.js';
import { lien } from '../../os/router.js';
import { clientBase, actionsBase, verifierAcces } from '../../os/acces-base.js';
import { creerDonneesAppli } from './donnees-appli.js';
import { creerPile } from './pile.js';
import { creerVolet } from './volet.js';
import { chargement, etatErreur } from './composants.js';
import { dessinerEtatAcces } from './ecran.js';
import { reglagesExportFactures } from './export.js';
import { dateFr, nomFournisseur, SANS_FOURNISSEUR } from './logique.js';
import { fournisseursDuVolet, etatFournisseurFacture, chiffresTableau, libelleMois, eurosCentimes, delaiLisible, DUREES } from './logique-appli.js';

export const NOM_APPLI = 'Factures';
export const TITRE_TABLEAU = 'Tableau de bord des factures';
export const TITRE_REGLAGES = 'Réglages des factures';
const LIBELLE_VOLET = 'Fournisseurs, Chantiers, Articles';
const MESSAGE_TABLEAU = 'Impossible de lire les factures. Vérifie ta connexion, puis réessaie.';
const MESSAGE_PAS_VALIDABLE = 'Cette facture ne peut pas être validée tout de suite : regarde « Ta décision ».';

/** Monte l'application dans `conteneur` pour la vue `vue` ('pile' | 'tableau' | 'reglages'). Renvoie la fonction d'arrêt. */
export function rendreAppli(conteneur, vue = 'pile') {
  let vivant = true;
  const arrets = [];
  const donnees = () => creerDonneesAppli({ client: clientBase(), actions: actionsBase() });
  const racine = h('div', { class: 'af-app page-achats-factures', dataset: { role: 'appli-factures', vue, module: 'achats' } });
  conteneur.replaceChildren(racine);

  // ------------------------------------------------------------ en-tête commun (règle générale des applications)
  const pastille = h('span', { class: 'af-pastille', hidden: true, 'aria-live': 'polite', dataset: { role: 'pile-restantes' } });
  const boutonVolet = vue === 'pile' ? h('button', { type: 'button', class: 'af-gros-volet', 'aria-expanded': 'false', dataset: { action: 'ouvrir-volet' }, onclick: () => { if (volet.estOuvert()) volet.fermer(); else volet.ouvrir('fournisseurs'); } },
    icone('columns-3', { taille: 18 }), h('span', {}, LIBELLE_VOLET)) : null;
  const boutonFocus = vue === 'pile' ? h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Plein écran : concentration', title: 'Plein écran : concentration', dataset: { action: 'plein-ecran' }, onclick: () => entrerFocus() }, icone('maximize', { taille: 18 })) : null;
  const entete = h('header', { class: 'af-haut', dataset: { role: 'appli-entete' } },
    h('nav', { class: 'af-ariane', 'aria-label': 'Où je suis' },
      h('a', { class: 'bouton-icone af-maison', href: lien(''), 'aria-label': 'Revenir à l’accueil', title: 'Revenir à l’accueil (toutes les applications)', dataset: { action: 'accueil' } }, icone('house', { taille: 19 })),
      h('span', { class: 'af-chevron', 'aria-hidden': 'true' }, icone('chevron-right', { taille: 14 })),
      h('a', { class: 'af-nom', href: lien('achatsfactures/pile'), title: 'Revenir à la pile', dataset: { action: 'vers-pile' } }, NOM_APPLI)),
    pastille,
    h('div', { class: 'af-droite', dataset: { role: 'appli-outils' } },
      boutonVolet, boutonVolet ? h('span', { class: 'af-sep', 'aria-hidden': 'true' }) : null, boutonFocus,
      h('a', { class: `bouton-icone${vue === 'tableau' ? ' actif' : ''}`, href: lien('achatsfactures/tableau'), 'aria-label': TITRE_TABLEAU, title: TITRE_TABLEAU, 'aria-current': vue === 'tableau' ? 'page' : null, dataset: { action: 'tableau-de-bord' } }, icone('chart-column', { taille: 19 })),
      h('a', { class: `bouton-icone${vue === 'reglages' ? ' actif' : ''}`, href: lien('achatsfactures/reglages'), 'aria-label': TITRE_REGLAGES, title: TITRE_REGLAGES, 'aria-current': vue === 'reglages' ? 'page' : null, dataset: { action: 'reglages-factures' } }, icone('settings', { taille: 19 }))));
  const corps = h('div', { class: 'af-corps' });
  racine.append(entete, corps);

  const retourPile = () => h('a', { class: 'af-retour', href: lien('achatsfactures/pile'), dataset: { action: 'retour-pile' } }, icone('chevron-left', { taille: 16 }), 'Retour à la pile');
  const tetePage = (titre, sous) => h('div', { class: 'af-page-tete' }, retourPile(), h('div', {}, h('h1', {}, titre), h('p', { class: 'aide' }, sous)));

  // ------------------------------------------------------------ vue « réglages » : seulement ce qui concerne les factures
  function monterReglages() {
    const page = h('div', { class: 'af-page', dataset: { role: 'reglages-factures' } }, tetePage(TITRE_REGLAGES, 'Seulement ce qui concerne les factures.'));
    reglagesExportFactures(page);
    remplir(corps, page);
  }

  // ------------------------------------------------------------ vue « tableau de bord » : les chiffres des factures seulement
  function monterTableau() {
    const zone = h('div', { class: 'af-tableau-zone' });
    remplir(corps, h('div', { class: 'af-page', dataset: { role: 'tableau-factures' } }, tetePage(TITRE_TABLEAU, 'Seulement les factures des fournisseurs.'), zone));
    let numero = 0;
    async function charger(forcer = false) {
      const n = ++numero;
      remplir(zone, chargement());
      let etat = 'illisible';
      try { etat = (await verifierAcces(forcer)).etat; } catch (e) { console.warn('Accès à la base : vérification impossible', e?.code ?? e?.message); }
      if (!vivant || n !== numero) return;
      if (etat !== 'connecte') { dessinerEtatAcces(zone, etat, (f) => charger(f)); return; }
      let lue;
      try { lue = await donnees().chargerFactures(); } catch (e) {
        if (!vivant || n !== numero) return;
        if (e?.code === 'reconnexion') { dessinerEtatAcces(zone, 'reconnexion', (f) => charger(f)); return; }
        console.warn('Tableau de bord des factures : lecture impossible', e?.code ?? e?.message);
        remplir(zone, etatErreur(MESSAGE_TABLEAU, () => charger(false)));
        return;
      }
      if (!vivant || n !== numero) return;
      dessinerTableau(zone, lue);
    }
    void charger(false);
  }

  function dessinerTableau(zone, lue) {
    const c = chiffresTableau(lue.liste);
    const tuile = (cle, libelle, chiffre, sous, accent = false) => h('div', { class: `af-tuile${accent ? ' af-tuile-accent' : ''}`, dataset: { tuile: cle } },
      h('span', { class: 'etiquette' }, libelle), h('span', { class: 'af-chiffre' }, chiffre), h('span', { class: 'aide' }, sous));
    const maxTop = Math.max(1, ...c.top3.map((x) => Math.abs(x.centimes)));
    const maxSemaine = Math.max(1, ...c.semaines.map((s) => Math.abs(s.centimes)));
    remplir(zone,
      h('p', { class: 'aide', dataset: { role: 'tableau-mois' } }, libelleMois(c.mois)),
      lue.complete ? null : h('p', { class: 'erreur', role: 'status' }, 'Liste incomplète : les chiffres ne portent pas sur toutes les factures.'),
      lue.liste.length === 0 ? h('p', { class: 'aide', role: 'status', dataset: { etat: 'vide' } }, 'Aucune facture pour l’instant : les chiffres sont à zéro. Les factures arrivent par e-mail.') : null,
      h('div', { class: 'af-tuiles' },
        tuile('a-valider', 'À valider', String(c.aValider), 'dans la pile', true),
        tuile('validees', 'Validées ce mois', String(c.accepteesMois), 'factures acceptées'),
        tuile('refusees', 'Refusées ce mois', String(c.refuseesMois), 'factures refusées'),
        tuile('montant', 'Montant validé ce mois', eurosCentimes(c.centimesMois), 'toutes taxes comprises'),
        tuile('delai', 'Délai moyen de validation', delaiLisible(c.delaiMoyenJours), 'entre l’arrivée et la validation')),
      h('div', { class: 'af-tableau-bas' },
        h('section', { class: 'af-tuile', dataset: { bloc: 'top3' } }, h('h2', {}, 'Top 3 fournisseurs du mois'),
          c.top3.length === 0 ? h('p', { class: 'aide' }, 'Aucune facture validée ce mois.') : h('ol', { class: 'af-top3' }, c.top3.map((x, i) => h('li', {},
            h('span', { class: 'af-top3-ligne' }, h('span', {}, h('span', { class: 'af-rang' }, String(i + 1)), x.nom), h('b', {}, eurosCentimes(x.centimes))),
            h('span', { class: 'af-barre', 'aria-hidden': 'true' }, h('i', { style: { width: `${Math.round(Math.abs(x.centimes) / maxTop * 100)}%` } })))))),
        h('section', { class: 'af-tuile', dataset: { bloc: 'semaines' } }, h('h2', {}, 'Montant validé par semaine'),
          h('ul', { class: 'af-semaines' }, c.semaines.map((s, i) => h('li', { class: i === c.semaines.length - 1 ? 'af-semaine-courante' : '' },
            h('span', { class: 'af-semaine-montant' }, eurosCentimes(s.centimes)),
            h('span', { class: 'af-semaine-barre', 'aria-hidden': 'true', style: { height: `${Math.max(2, Math.round(Math.abs(s.centimes) / maxSemaine * 100))}%` } }),
            h('span', { class: 'aide' }, s.libelle)))))),
      h('p', {}, h('a', { class: 'bouton bouton-secondaire', href: lien('achatsfactures/liste'), dataset: { action: 'vers-liste' } }, icone('list', { taille: 16 }), 'Voir la liste des factures')));
  }

  // ------------------------------------------------------------ vue « pile »
  let volet = null;
  let pile = null;
  let focus = false;
  let natif = false; // le plein écran du navigateur a bien été obtenu
  let echapFenetre = 0; // instant du dernier Échap donné à une fenêtre : il ne doit pas faire sortir du mode
  let fournisseurs = { etat: 'vide', lignes: [] }; // etat : vide | chargement | ok | erreur
  let factureAffichee = null;
  let majBandeaux = () => {};

  let lectureFournisseurs = null; // la lecture en cours (une seule à la fois)
  /** Lit les fournisseurs (après la vérification de l'accès : la connexion à la base doit être prête). Ne lève jamais : l'état dit « erreur ». */
  function chargerFournisseurs() {
    if (lectureFournisseurs) return lectureFournisseurs;
    fournisseurs = { etat: 'chargement', lignes: fournisseurs.lignes };
    lectureFournisseurs = (async () => {
      try {
        const { etat } = await verifierAcces(false);
        if (etat !== 'connecte') throw Object.assign(new Error('Accès à la base non prêt'), { code: etat });
        const lu = await donnees().lireFournisseurs();
        if (!vivant) return;
        fournisseurs = { etat: 'ok', lignes: fournisseursDuVolet(lu) };
      } catch (e) {
        if (!vivant) return;
        console.warn('Application Factures : lecture des fournisseurs impossible', e?.code ?? e?.message);
        fournisseurs = { etat: 'erreur', lignes: [] };
      } finally { lectureFournisseurs = null; }
      majBandeaux();
      volet?.rafraichir();
    })();
    return lectureFournisseurs;
  }

  function monterPile() {
    const fente = h('div', { class: 'af-fente', dataset: { role: 'pile-bandeaux' } });
    const scene = h('div', { class: 'af-scene' });
    const focusPastille = h('span', { class: 'af-pastille', hidden: true, dataset: { role: 'focus-restantes' } });
    const focusHaut = h('div', { class: 'af-focus-haut', dataset: { role: 'focus-entete' } },
      h('span', { class: 'af-focus-titre' }, `${NOM_APPLI} · concentration`), focusPastille,
      h('button', { type: 'button', class: 'af-focus-sortir', dataset: { action: 'quitter-plein-ecran' }, onclick: () => sortirFocus() }, icone('minimize', { taille: 16 }), 'Quitter le plein écran', h('kbd', { class: 'af-touche' }, 'Échap')));
    const touche = (t, libelle) => h('span', {}, h('kbd', { class: 'af-touche' }, t), libelle);
    const focusTouches = h('div', { class: 'af-focus-touches', dataset: { role: 'focus-touches' } }, touche('V', 'valider'), touche('R', 'refuser'), touche('P', 'passer'), touche('Échap', 'sortir'));
    const grosTel = h('button', { type: 'button', class: 'af-gros-volet af-gros-tel', dataset: { action: 'ouvrir-volet-telephone' }, onclick: () => volet.ouvrir('fournisseurs') }, icone('columns-3', { taille: 18 }), h('span', {}, LIBELLE_VOLET));

    volet = creerVolet({
      donnees,
      etatFournisseurs: () => fournisseurs,
      rechargerFournisseurs: async () => { if (lectureFournisseurs) await lectureFournisseurs; return chargerFournisseurs(); }, // après une écriture : toujours une lecture NEUVE (jamais celle qui était déjà partie)
      surEcriture: () => { pile?.relire(); }, // relecture SILENCIEUSE de la facture affichée : ses contrôles se recalculent, ses choix (chantier, agence, motif) restent, le focus reste dans le volet
      boutonRepli: () => [boutonVolet, grosTel].find((b) => b.getClientRects().length > 0) ?? null,
      surEtat: (ouvert) => { racine.classList.toggle('af-avec-volet', ouvert); boutonVolet.setAttribute('aria-expanded', String(ouvert)); boutonVolet.classList.toggle('actif', ouvert); },
    });

    /**
     * Bandeaux au-dessus de la facture. Rien tant que les fournisseurs ne sont pas lus, ni pendant que la facture charge (jamais les bandeaux de la facture précédente).
     * « Nouveau fournisseur détecté » : seulement si son SIREN est lu et absent de la table. SIREN non lu et rien qui le rattache à un fournisseur : « Fournisseur non reconnu »
     * (il est peut-être déjà enregistré : on ne propose pas de le créer en double). L'alerte orange « IBAN changé récemment » suit le fournisseur retrouvé (SIREN, agence reliée, ou nom exact).
     */
    majBandeaux = () => {
      const f = factureAffichee;
      if (!f || f.statut !== 'a_valider' || fournisseurs.etat !== 'ok') { remplir(fente); return; }
      const { etat, fournisseur: fo } = etatFournisseurFacture(f, fournisseurs.lignes);
      const nom = nomFournisseur(f);
      remplir(fente,
        etat === 'nouveau' ? h('div', { class: 'af-bandeau-nouveau', role: 'status', dataset: { role: 'nouveau-fournisseur' } }, icone('building-2', { taille: 18 }),
          h('span', {}, h('b', {}, nom === SANS_FOURNISSEUR ? 'Nouveau fournisseur détecté.' : `Nouveau fournisseur détecté : ${nom}.`), ' L’ajouter ?'),
          h('button', { type: 'button', class: 'bouton bouton-principal', dataset: { action: 'ajouter-fournisseur' }, onclick: () => { sortirFocus(); volet.ouvrirNouveau(f); } }, 'Ajouter')) : null,
        etat === 'non-reconnu' ? h('div', { class: 'af-bandeau-nouveau', role: 'status', dataset: { role: 'fournisseur-non-reconnu' } }, icone('building-2', { taille: 18 }),
          h('span', {}, h('b', {}, 'Fournisseur non reconnu.'), ' Son SIREN n’a pas été lu sur la facture : il est peut-être déjà dans ta liste.'),
          h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'voir-fournisseurs' }, onclick: () => { sortirFocus(); volet.ouvrir('fournisseurs'); } }, 'Voir les fournisseurs')) : null,
        fo?.changement ? h('div', { class: 'af-alerte', role: 'status', dataset: { role: 'alerte-iban' } }, icone('triangle-alert', { taille: 16 }),
          h('div', {}, h('b', {}, 'IBAN changé récemment : vérifie avant de payer'),
            h('span', {}, `Changé le ${dateFr(fo.changement.date)}. `, h('button', { type: 'button', class: 'af-lien-mini', dataset: { action: 'voir-fiche-fournisseur' }, onclick: () => { sortirFocus(); volet.ouvrirFiche('fournisseurs', fo.id); } }, 'Voir la fiche')))) : null);
    };

    /** Titre de la facture : le nom du fournisseur est un bouton qui ouvre sa fiche dans le volet (le formulaire pré-rempli s'il est nouveau ; la liste des fournisseurs s'il n'est pas reconnu). */
    const titreTete = (f) => h('button', { type: 'button', class: 'af-lien-four', title: 'Ouvrir la fiche du fournisseur', dataset: { action: 'fiche-fournisseur' },
      onclick: async () => {
        if (fournisseurs.etat !== 'ok') await chargerFournisseurs(); // encore en lecture (ou en échec) : on attend la lecture plutôt que de refuser le clic
        if (!vivant || factureAffichee?.id !== f.id) return;
        if (fournisseurs.etat !== 'ok') { toast('Impossible de lire les fournisseurs. Vérifie ta connexion, puis réessaie.', { type: 'erreur' }); return; }
        const { etat, fournisseur: fo } = etatFournisseurFacture(f, fournisseurs.lignes);
        sortirFocus();
        if (fo) volet.ouvrirFiche('fournisseurs', fo.id); else if (etat === 'nouveau') volet.ouvrirNouveau(f); else volet.ouvrir('fournisseurs');
      } }, nomFournisseur(f));

    const majPastille = (texte, { pulse = false } = {}) => {
      for (const p of [pastille, focusPastille]) {
        p.hidden = !texte; p.textContent = texte ?? '';
        p.classList.remove('af-pulse');
        if (texte && pulse) { void p.offsetWidth; p.classList.add('af-pulse'); setTimeout(() => p.classList.remove('af-pulse'), DUREES.pulse + 50); } // relance l'animation à chaque décision
      }
    };

    remplir(corps, focusHaut, fente, scene, focusTouches, grosTel, volet.voile, volet.element);
    pile = creerPile(scene, { surCompteur: majPastille, surFacture: (f) => { factureAffichee = f; majBandeaux(); }, titreTete });
    void chargerFournisseurs();
    arrets.push(() => { sortirFocus({ sansFocus: true }); pile.arreter(); volet.arreter(); });
  }

  // ------------------------------------------------------------ plein écran « concentration »
  /** Touches du mode concentration. Écouteur posé à l'entrée du mode, retiré à la sortie (et à l'arrêt de l'écran) : jamais actif hors du mode. */
  function surTouche(e) {
    if (!focus) return;
    if (document.querySelector('.voile-dialogue, .menu-pop')) { if (e.key === 'Escape') echapFenetre = Date.now(); return; } // une fenêtre ou un menu ouvert garde ses touches (Échap ferme la fenêtre, pas le mode)
    const t = e.target;
    if (t && (['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName) || t.isContentEditable)) return; // on écrit : aucune touche n'agit
    if (e.key === 'Escape') { e.preventDefault(); sortirFocus(); return; }
    if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
    const k = String(e.key).toLowerCase();
    if (k === 'v') { e.preventDefault(); if (pile.decider('accepter') === 'impossible') toast(MESSAGE_PAS_VALIDABLE, { type: 'erreur' }); } // facture qui charge ou décision qui s'écrit : aucun message (rien ne manque à la facture)
    else if (k === 'r') { e.preventDefault(); pile.decider('refuser'); }
    else if (k === 'p') { e.preventDefault(); pile.passer(); }
  }
  /** Le plein écran du navigateur a été quitté (touche Échap du navigateur, F11…) : on sort du mode, sauf si une fenêtre est ouverte (son Échap ne doit pas tout fermer). */
  function surPleinEcran() {
    if (document.fullscreenElement) { natif = true; return; }
    if (focus && natif && !document.querySelector('.voile-dialogue') && Date.now() - echapFenetre > 1000) sortirFocus();
    natif = false;
  }
  function entrerFocus() {
    if (focus || !pile) return;
    focus = true; natif = false;
    volet.fermer();
    racine.classList.add('af-focus');
    document.addEventListener('keydown', surTouche, true);
    document.addEventListener('fullscreenchange', surPleinEcran);
    try { const p = document.documentElement.requestFullscreen?.(); p?.catch?.(() => {}); } catch { /* plein écran refusé par le navigateur : le mode marche quand même, dans la fenêtre */ }
    racine.querySelector('[data-action="quitter-plein-ecran"]')?.focus();
  }
  function sortirFocus({ sansFocus = false } = {}) {
    if (!focus) return;
    focus = false;
    racine.classList.remove('af-focus');
    document.removeEventListener('keydown', surTouche, true);
    document.removeEventListener('fullscreenchange', surPleinEcran);
    if (document.fullscreenElement) { try { const p = document.exitFullscreen?.(); p?.catch?.(() => {}); } catch { /* déjà quitté */ } }
    natif = false;
    if (!sansFocus) boutonFocus?.focus();
  }

  if (vue === 'tableau') monterTableau();
  else if (vue === 'reglages') monterReglages();
  else monterPile();

  return () => { vivant = false; for (const a of arrets) a(); };
}
