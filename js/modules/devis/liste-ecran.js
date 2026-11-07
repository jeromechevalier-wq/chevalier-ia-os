// Écran « Devis » (liste des devis) : deux vues, « Kanban » et « Liste » (colonnes par statut), recherche, filtres (statut, période, tests), pagination, menu « … ».
// Aucune règle ici : tri, filtre, recherche, pagination, regroupement et actions permises sont dans liste.js (pur, testé) ; le statut ne change QUE par les
// fonctions du serveur (donnees.js : finaliser, changerStatut), jamais par une écriture directe, et il n'y a pas de glisser-déposer.
import { h, icone, remplir, ouvrirMenu, lirePreference, ecrirePreference } from '../../os/ui.js';
import { boutonFiltres as boutonFiltresCommun, fenetreFiltres, controleTests } from '../crm/filtres.js';
import { FILTRE_TESTS_DEFAUT, texteEnteteColonne } from '../crm/logique.js';
import { etatVide, planifier, badgeTest, selecteurTri } from '../crm/composants.js';
import { enteteListe, barreListe, basculeVues } from '../crm/barre-liste.js';
import { naviguer, lien } from '../../os/router.js';
import * as CRM from '../crm/donnees.js';
import * as D from './donnees.js';
import * as Li from './liste.js';
import { formaterMontant } from './document.js';
import { nomsDe, entreesMenuDevis, creerDevisSansAffaire } from './actions-devis.js';
import { indicateurPdf } from './pdf-indicateur.js';
import { pastilleStatutDevis } from './pastille-statut.js';
import { devisATraiter } from './relances.js';

const ERREUR_LECTURE = 'La liste des devis n’a pas pu être mise à jour. La dernière version reste affichée : vérifie ta connexion puis recharge la page.';

// Choix conservés jusqu'au rechargement de la page (comme les autres listes).
let vue = 'liste'; // liste | tableau (= Kanban) | archives (les archives s'affichent en liste ; seules Liste et Kanban sont mémorisées)
let recherche = '';
let statutsFiltres = [];
let periode = 'toutes';
let testsFiltre = FILTRE_TESTS_DEFAUT;
let aTraiterFiltre = 'tout'; // tout | seulement (« À traiter » : devis à relancer ou jamais envoyés, devis-ATraiter)
let tri = { critere: 'modifie', sens: 'desc' };
let page = 1;
let parPage = Li.TAILLE_PAGE_DEFAUT;

const libelleClient = () => (D.surSocleSeul() ? 'Client' : 'Client / Affaire'); // lu au rendu (sans Affaires : pas d'affaire à nommer)
const libelleColonne = (c) => (c.id === 'client' ? libelleClient() : c.libelle);
const COLONNES = [
  { id: 'numero', libelle: 'Numéro', tri: 'numero' },
  { id: 'statut', libelle: 'Statut' },
  { id: 'documents', libelle: 'Documents' },
  { id: 'client', libelle: 'Client / Affaire' },
  { id: 'modifie', libelle: 'Modifié', tri: 'modifie' },
  { id: 'date', libelle: 'En date du', tri: 'date' },
  { id: 'validite', libelle: 'Valable jusqu’au', tri: 'validite' },
  { id: 'ht', libelle: 'Total HT', tri: 'ht' },
  { id: 'ttc', libelle: 'Total TTC', tri: 'ttc' },
];

const euros = (n) => (typeof n === 'number' ? formaterMontant(n) : '—');

const pastille = pastilleStatutDevis; // la même pastille que dans l'en-tête d'un devis (pastille-statut.js)

const LIBELLES_A_TRAITER = { a_relancer: 'À relancer', jamais_envoye: 'Jamais envoyé' };
/** Pastille « À relancer · 12 j » ou « Jamais envoyé · 8 j » d'un devis à traiter (couleur « retard »). */
const pastilleATraiter = (e) => h('span', { class: 'pastille-statut pastille-a-traiter', dataset: { aTraiter: e.motif } }, `${LIBELLES_A_TRAITER[e.motif]} · ${e.joursDepuis} j`);
/** Cas vide « Seulement les tests » + « Seulement à traiter » : un devis de test n'est jamais « à traiter » (libellés du filtre Tests : OPTIONS_FILTRE_TESTS). */
const PHRASE_TESTS_A_TRAITER_VIDE = 'Un devis de test n’est jamais « à traiter » : choisis « Sans les tests » ou « Tout » pour voir les devis à traiter.';
const OPTIONS_A_TRAITER = [{ valeur: 'tout', libelle: 'Tout' }, { valeur: 'seulement', libelle: 'Seulement à traiter' }];

/** Petite pastille d'un devis finalisé mais pas encore envoyé (dans la colonne « Envoyé » du Kanban). */
const pastillePasEnvoye = () => h('span', { class: 'pastille-statut pastille-pas-envoye', style: { '--couleur': Li.COULEURS_STATUT.en_attente_envoi }, dataset: { pastille: 'pas-encore-envoye' } }, Li.LIBELLE_PAS_ENCORE_ENVOYE);

// ---------------------------------------------------------------- actions
// Les entrées du menu « … » viennent de actions-devis.js (la même source que l'éditeur et la visualisation).

const actionsDevis = (d) => h('div', { class: 'actions-devis' }, boutonMenu(d));

function boutonMenu(d) {
  return h('button', {
    type: 'button', class: 'bouton-icone carte-menu', 'aria-label': `Actions : ${d.numero ?? 'brouillon'} ${nomsDe(d).client}`.trim(), 'aria-haspopup': 'menu', dataset: { action: 'menu-devis' },
    onclick: (e) => { e.stopPropagation(); ouvrirMenu(e.currentTarget, entreesMenuDevis(d)); },
  }, icone('ellipsis', { taille: 16 }));
}

// ---------------------------------------------------------------- cellules

const ouvrirDevis = (d) => naviguer(d.statut === 'brouillon' ? `devis/editeur/${d.id}` : `devis/voir/${d.id}`);
const intitule = (d) => d.numero ?? (String(d.nom ?? '').trim() || 'Brouillon'); // un brouillon nommé porte son nom (interne) ; un devis numéroté garde son numéro
function celluleClient(d) {
  const n = nomsDe(d);
  return h('div', { class: 'devis-client' }, h('span', { class: 'devis-client-nom' }, n.client || '—'), D.surSocleSeul() ? null : n.affaire ? h('span', { class: 'devis-affaire' }, n.affaire) : !d.affaireId ? h('span', { class: 'devis-affaire devis-sans-affaire', dataset: { valeur: 'sans-affaire' } }, 'Sans affaire') : null);
}
function celluleModifie(d, maintenant) {
  const qui = Li.initialesDe(d.modifiePar ?? d.creePar);
  return h('span', { class: 'devis-modifie' }, Li.depuis(Li.modifieMs(d), maintenant), qui ? h('span', { class: 'avatar-initiales', style: { '--taille': '22px' }, title: d.modifiePar ?? d.creePar ?? '', 'aria-label': `Modifié par ${qui}` }, qui) : null);
}

/** Un clic (ou Entrée) sur une ligne ou une carte ouvre le devis (l'éditeur pour un brouillon, la visualisation pour un devis finalisé), sauf sur un bouton, un lien ou un champ de la ligne. */
function ouvrable(el, ouvrir) {
  el.tabIndex = 0;
  el.addEventListener('click', (e) => { if (!e.target.closest('button, a, input, select, textarea, .menu-pop')) ouvrir(); });
  el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); ouvrir(); } });
  return el;
}

/** Rend la fonction d'arrêt. */
export function rendreListeDevis(conteneur) {
  D.emailPreparable(); // question posée au serveur dès l'ouverture : la réponse est prête quand on ouvre le menu d'une carte (« Préparer l'e-mail » est-il branché ?)
  const titre = h('h1', {}, 'Devis');
  const compteur = h('span', { class: 'compteur-liste', 'aria-live': 'polite' });
  const zone = h('div', { class: 'zone-devis' });
  const pied = h('div', { class: 'pied-liste-devis' });
  const avis = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'lecture' }, hidden: true });
  const filtres = boutonFiltresCommun({ auClic: async () => {
    const r = await fenetreFiltres({
      controles: [
        { cle: 'statuts', libelle: 'Statut', type: 'cases', options: [...['brouillon', 'en_attente_envoi', 'envoye', 'accepte', 'refuse', ...(vue === 'tableau' ? [] : ['expire', 'remplace'])].map((id) => ({ valeur: id, libelle: Li.libelleStatut(id) }))] },
        { cle: 'periode', libelle: 'En date du', type: 'choix', options: Li.PERIODES.map((p) => ({ valeur: p.id, libelle: p.libelle })) },
        ...(vue === 'archives' ? [] : [{ cle: 'aTraiter', libelle: 'À traiter', type: 'choix', options: OPTIONS_A_TRAITER }]), // jamais en Archives (un devis à traiter n'y est pas)
        controleTests(),
      ],
      criteres: { statuts: statutsFiltres, periode, aTraiter: aTraiterFiltre, tests: testsFiltre },
      effacer: () => ({ statuts: [], periode: 'toutes', aTraiter: 'tout', tests: FILTRE_TESTS_DEFAUT }),
    });
    if (r) { statutsFiltres = r.statuts ?? []; periode = r.periode || 'toutes'; aTraiterFiltre = vue === 'archives' ? 'tout' : (r.aTraiter || 'tout'); testsFiltre = r.tests || FILTRE_TESTS_DEFAUT; page = 1; rendre(); }
  } });
  const boutonNouveau = h('button', {
    type: 'button', class: `bouton ${Li.EDITEUR_DISPONIBLE ? 'bouton-principal' : 'bouton-secondaire'}`, disabled: !Li.EDITEUR_DISPONIBLE, title: Li.EDITEUR_DISPONIBLE ? null : Li.MESSAGE_BIENTOT,
    dataset: { action: 'nouveau-devis' }, onclick: () => creerDevisSansAffaire(),
  }, icone('plus', { taille: 16 }), 'Devis', Li.EDITEUR_DISPONIBLE ? null : h('span', { class: 'bientot' }, ' (bientôt disponible)'));
  const pastilleBouton = h('span', { class: 'pastille-a-traiter', 'aria-hidden': 'true' });
  const boutonATraiter = h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-a-traiter', hidden: true, dataset: { action: 'a-traiter' },
    onclick: () => { aTraiterFiltre = aTraiterFiltre === 'seulement' ? 'tout' : 'seulement'; page = 1; rendre(); } }, 'À traiter', pastilleBouton); // second clic : retour à « Tout »
  const bascule = h('div', { class: 'zone-bascule' });
  // Même menu « Trier par » que les autres listes, aux critères des en-têtes triables (le clic d'en-tête reste possible).
  const OPTIONS_TRI = COLONNES.filter((c) => c.tri).map((c) => ({ id: c.tri, libelle: c.libelle, sens: c.tri === 'numero' ? 'asc' : 'desc' }));
  let triAffiche = { ...tri };
  const choixTri = selecteurTri({ options: OPTIONS_TRI, valeur: tri.critere, sens: tri.sens, surChangement: (t) => { tri = { critere: t.critere, sens: t.sens }; page = 1; rendre(); } });

  function majBascule() {
    remplir(bascule, basculeVues({ vues: [['tableau', 'Kanban', 'square-kanban'], ['liste', 'Liste', 'list'], ['archives', 'Archives', 'archive']], courante: vue,
      surChangement: (id) => { vue = id; if (id === 'archives') aTraiterFiltre = 'tout'; if (id !== 'archives') ecrirePreference('vue.devis', id); page = 1; rendre(); } }));
  }

  let aTraiter = new Map(); // id du devis -> { motif, joursDepuis } (devisATraiter)

  function rendre() {
    majBascule();
    if (triAffiche.critere !== tri.critere || triAffiche.sens !== tri.sens) { choixTri.maj(OPTIONS_TRI, tri.critere, tri.sens); triAffiche = { ...tri }; } // pas à chaque rendu : le minuteur de 60 s ne doit pas recréer les options sous un menu ouvert
    filtres.majCompte(statutsFiltres.length + (periode !== 'toutes' ? 1 : 0) + (aTraiterFiltre !== 'tout' ? 1 : 0) + (testsFiltre !== FILTRE_TESTS_DEFAUT ? 1 : 0));
    avis.hidden = !D.etat.erreurLectureDevis;
    avis.textContent = D.etat.erreurLectureDevis ? ERREUR_LECTURE : '';
    remplir(pied);
    aTraiter = new Map();
    boutonATraiter.hidden = true;
    if (!D.estPretDevis()) { remplir(zone, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' }))); remplir(compteur, ''); return; }
    const maintenant = Date.now();
    const aujourdhui = CRM.ctx().aujourdhui;
    const { du, au } = Li.bornesDePeriode(periode, aujourdhui);
    // « À traiter » : calculé sur tous les devis (la règle exclut déjà archivés et tests) ; le bouton n'existe qu'en dehors des Archives et s'il y en a.
    const delai = D.etat.reglages?.delaiRelanceJours;
    aTraiter = new Map(devisATraiter(D.etat.devis, { aujourdhui, maintenant, ...(Number.isFinite(delai) ? { delaiJours: delai } : {}) }).map((e) => [e.devis.id, e]));
    // Les anciennes versions « Remplacé » restent visibles (filtre de statut) ; tout est affiché par défaut.
    // Archives = devis archivés + anciennes versions (remplacées) + expirés. Kanban = tout sauf remplacés et expirés. Liste = tout ce qui n'est pas archivé à la main.
    const archives = vue === 'archives';
    const tous = D.etat.devis.filter((d) => (archives ? Li.estDansArchives(d, aujourdhui) : d.archive !== true && !(vue === 'tableau' && Li.estHorsTableau(d, aujourdhui))));
    let lignes = Li.rechercher(tous, recherche, nomsDe);
    lignes = Li.filtrer(lignes, { statuts: statutsFiltres, du, au, aujourdhui, tests: testsFiltre });
    if (aTraiterFiltre === 'seulement') lignes = lignes.filter((d) => aTraiter.has(d.id) && !archives);
    const nbATraiter = archives ? 0 : tous.filter((d) => aTraiter.has(d.id)).length;
    boutonATraiter.hidden = nbATraiter === 0 && aTraiterFiltre !== 'seulement'; // reste là tant que le critère est posé (pour le retirer d'un clic)
    boutonATraiter.setAttribute('aria-pressed', String(aTraiterFiltre === 'seulement'));
    pastilleBouton.textContent = String(nbATraiter);
    boutonATraiter.setAttribute('aria-label', `À traiter : ${nbATraiter} devis`);
    lignes = Li.trier(lignes, tri);
    const total = tous.length;
    remplir(compteur, `${total} devis`, lignes.length !== total ? ` · ${lignes.length} affiché${lignes.length > 1 ? 's' : ''}` : '');
    if (!lignes.length) {
      const vraimentVide = total === 0;
      if (vraimentVide && archives) { remplir(zone, etatVide('Aucun devis archivé. Un devis finalisé, signé ou refusé se range ici avec « Archiver », dans le menu « … » du devis ; les devis remplacés et expirés y sont aussi.')); return; }
      remplir(zone, etatVide(vraimentVide ? 'Aucun devis pour l’instant.' : (aTraiterFiltre === 'seulement' && testsFiltre === 'seulement' ? PHRASE_TESTS_A_TRAITER_VIDE : 'Aucun devis ne correspond.'), {
        action: vraimentVide ? h('button', { type: 'button', class: 'bouton bouton-secondaire', disabled: !Li.EDITEUR_DISPONIBLE, title: Li.EDITEUR_DISPONIBLE ? null : Li.MESSAGE_BIENTOT, dataset: { action: 'nouveau-devis-vide' }, onclick: () => creerDevisSansAffaire() },
          icone('plus', { taille: 16 }), 'Devis', Li.EDITEUR_DISPONIBLE ? null : ' (bientôt disponible)') : null,
      }));
      return;
    }
    if (vue === 'tableau' && !archives) { rendreTableau(lignes, maintenant, aujourdhui); return; }
    rendreListe(lignes, maintenant, aujourdhui);
  }

  function changerTri(critere) {
    tri = tri.critere === critere ? { critere, sens: tri.sens === 'asc' ? 'desc' : 'asc' } : { critere, sens: critere === 'numero' ? 'asc' : 'desc' };
    page = 1;
    rendre();
  }

  function rendreListe(lignes, maintenant, aujourdhui) {
    const p = Li.paginer(lignes, page, parPage);
    page = p.page;
    const entete = h('tr', {}, COLONNES.map((c) => (c.tri
      ? h('th', { scope: 'col', 'aria-sort': tri.critere === c.tri ? (tri.sens === 'asc' ? 'ascending' : 'descending') : 'none' },
        h('button', { type: 'button', class: 'tri', onclick: () => changerTri(c.tri) }, libelleColonne(c), tri.critere === c.tri ? icone(tri.sens === 'asc' ? 'arrow-up' : 'arrow-down', { taille: 12 }) : null))
      : h('th', { scope: 'col' }, h('span', { class: 'tri titre-colonne' }, libelleColonne(c))))), h('th', { class: 'col-actions' }));
    const corps = p.lignes.map((d) => {
      const t = Li.totauxDe(d);
      return ouvrable(h('tr', { class: 'ligne-liste ligne-devis', dataset: { id: d.id, statut: Li.statutAffiche(d, aujourdhui) } },
        h('td', { dataset: { colonne: 'numero', libelle: 'Numéro' } }, h('span', { class: `devis-numero${d.numero ? '' : ' devis-numero-vide'}` }, intitule(d)), badgeTest(d), d.version > 1 ? h('span', { class: 'devis-version' }, ` v${d.version}`) : null, d.numero && d.nom ? h('span', { class: 'devis-nom-interne' }, ` – ${d.nom}`) : null),
        h('td', { dataset: { colonne: 'statut', libelle: 'Statut' } }, pastille(d, aujourdhui), aTraiter.has(d.id) ? pastilleATraiter(aTraiter.get(d.id)) : null),
        h('td', { dataset: { colonne: 'documents', libelle: 'Documents' } }, indicateurPdf(d, { apres: () => rendre(), maintenant })), // lien « PDF », « en cours » ou avertissement « PDF non rangé » (finalisé seulement)
        h('td', { dataset: { colonne: 'client', libelle: libelleClient() } }, celluleClient(d)),
        h('td', { dataset: { colonne: 'modifie', libelle: 'Modifié' } }, celluleModifie(d, maintenant)),
        h('td', { dataset: { colonne: 'date', libelle: 'En date du' } }, Li.dateFr(Li.dateDuDevis(d))),
        h('td', { dataset: { colonne: 'validite', libelle: 'Valable jusqu’au' } }, Li.dateFr(d.expireLe)),
        h('td', { class: 'montant', dataset: { colonne: 'ht', libelle: 'Total HT' } }, euros(t?.ht)),
        h('td', { class: 'montant', dataset: { colonne: 'ttc', libelle: 'Total TTC' } }, euros(t?.ttc)),
        h('td', { class: 'col-actions' }, actionsDevis(d))), () => ouvrirDevis(d));
    });
    remplir(zone, h('div', { class: 'zone-tableau' }, h('table', { class: 'tableau tableau-devis' }, h('thead', {}, entete), h('tbody', {}, corps))));
    const taille = h('select', { class: 'champ champ-petit', 'aria-label': 'Éléments par page', dataset: { champ: 'par-page' }, onchange: (e) => { parPage = Number(e.target.value); page = 1; rendre(); } },
      Li.TAILLES_PAGE.map((n) => h('option', { value: String(n), selected: n === p.parPage }, String(n))));
    remplir(pied,
      h('span', { class: 'pied-compte', dataset: { valeur: 'pagination' } }, p.libelle),
      h('label', { class: 'pied-taille' }, 'Par page ', taille),
      h('div', { class: 'pied-pages' },
        h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Page précédente', disabled: p.page <= 1, onclick: () => { page = p.page - 1; rendre(); } }, icone('chevron-left', { taille: 16 })),
        h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Page suivante', disabled: p.page >= p.pages, onclick: () => { page = p.page + 1; rendre(); } }, icone('chevron-right', { taille: 16 }))));
  }

  function rendreTableau(lignes, maintenant, aujourdhui) {
    const colonnes = Li.regrouperParColonne(lignes, aujourdhui);
    remplir(zone, h('div', { class: 'kanban tableau-devis-colonnes' }, colonnes.map((c) => { const entete = texteEnteteColonne(Li.totauxColonneDevis(c.devis, { sansMontant: c.id === 'brouillon' }), 'devis'); return h('section', { class: 'colonne', style: { '--couleur': Li.COULEURS_STATUT[c.id] ?? '#8d8993' }, dataset: { colonne: c.id } },
      h('header', { class: 'colonne-tete' }, h('h2', {}, c.libelle), h('span', { class: 'colonne-totaux' }, entete.principal),
        entete.tests ? h('span', { class: 'colonne-totaux-tests' }, `${entete.tests.nombre} `, badgeTest({ test: true }), entete.tests.montant ? ` · ${entete.tests.montant}` : '') : null),
      h('div', { class: 'colonne-corps' }, c.devis.length ? c.devis.map((d) => carte(d, maintenant, aujourdhui)) : h('p', { class: 'colonne-vide' }, 'Aucun devis')));
    })));
  }

  function carte(d, maintenant, aujourdhui) {
    const t = Li.totauxDe(d);
    const pdfCarte = indicateurPdf(d, { apres: () => rendre(), maintenant });
    const couleur = Li.couleurPastilleDevis(d, aujourdhui, maintenant);
    return ouvrable(h('article', { class: 'carte-affaire carte-devis', dataset: { id: d.id, statut: Li.statutAffiche(d, aujourdhui) } },
      h('div', { class: 'carte-ligne' }, h('strong', { class: 'carte-titre' }, intitule(d), badgeTest(d), d.version > 1 ? ` v${d.version}` : '')),
      h('div', { class: 'carte-actions-devis' }, actionsDevis(d)),
      h('div', { class: 'carte-pastilles' }, pastille(d, aujourdhui), aTraiter.has(d.id) ? pastilleATraiter(aTraiter.get(d.id)) : null, d.statut === 'en_attente_envoi' && Li.statutAffiche(d, aujourdhui) === 'en_attente_envoi' && aTraiter.get(d.id)?.motif !== 'jamais_envoye' ? pastillePasEnvoye() : null),
      celluleClient(d),
      h('div', { class: 'carte-pied' },
        h('span', { class: 'carte-montant' }, `HT ${euros(t?.ht)}`),
        pdfCarte,
        h('span', { class: `pastille-activite ${couleur}`, role: 'img', 'aria-label': Li.LIBELLES_PASTILLE_DEVIS[couleur], title: Li.LIBELLES_PASTILLE_DEVIS[couleur] }))), () => ouvrirDevis(d));
  }

  const memorisee = lirePreference('vue.devis');
  if (memorisee === 'liste' || memorisee === 'tableau') vue = memorisee;
  else if (vue === 'archives') vue = 'liste'; // « Archives » ne se garde pas d'un passage à l'autre

  conteneur.append(h('div', { class: 'page page-liste page-devis page-liste-devis' },
    enteteListe({ titre, compteur, actions: [boutonATraiter, h('a', { class: 'bouton bouton-secondaire', href: lien('devis/bordereau'), dataset: { action: 'ouvrir-bordereau' } }, icone('list', { taille: 16 }), 'Catalogue'), h('a', { class: 'bouton bouton-secondaire', href: lien('devis/vocabulaire'), dataset: { action: 'ouvrir-vocabulaire' } }, icone('book-open', { taille: 16 }), 'Vocabulaire'), boutonNouveau] }),
    barreListe({ recherche: { placeholder: D.surSocleSeul() ? 'Numéro, client ou chantier' : 'Numéro, client ou affaire', libelleAria: 'Rechercher un devis', valeur: recherche, surSaisie: (v) => { recherche = v; page = 1; rendre(); } },
      elements: { filtres: filtres.element, vues: bascule }, tri: choixTri.element }).element,
    avis, zone, pied));

  // Les « il y a … » avancent d'eux-mêmes ; tout changement de données (devis, clients, affaires) redessine la liste.
  const rafraichir = planifier(rendre);
  rendre();
  const arrets = [D.surChangement(rafraichir), CRM.surChangement(rafraichir)];
  const minuteur = setInterval(() => { if (!document.querySelector('.menu-pop')) rendre(); }, 60000);
  return () => { arrets.forEach((f) => f()); clearInterval(minuteur); };
}
