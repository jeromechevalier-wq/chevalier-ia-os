// Écran « Devis » (liste des devis) : deux vues, « Liste » et « Tableau » (colonnes par statut), recherche, filtres (statut, période), pagination, menu « … ».
// Aucune règle ici : tri, filtre, recherche, pagination, regroupement et actions permises sont dans liste.js (pur, testé) ; le statut ne change QUE par les
// fonctions du serveur (donnees.js : finaliser, changerStatut), jamais par une écriture directe, et il n'y a pas de glisser-déposer.
import { h, icone, remplir, dialogue, toast, confirmer, ouvrirMenu, lirePreference, ecrirePreference } from '../../os/ui.js';
import { boutonFiltres as boutonFiltresCommun, fenetreFiltres } from '../crm/filtres.js';
import { etatVide, planifier } from '../crm/composants.js';
import { naviguer } from '../../os/router.js';
import * as CRM from '../crm/donnees.js';
import * as D from './donnees.js';
import * as Li from './liste.js';
import * as Fi from './fiche.js';
import { vueClient, affichageDe } from './logique.js';
import { devisHtml, formaterMontant } from './document.js';
import { dupliquerDevis, creerVariante, infosClientDuDevis } from './editeur-ecran.js';
import { creerFiche } from './fiche-ecran.js';
import { indicateurPdf } from './pdf-indicateur.js';

const ERREUR_LECTURE = 'La liste des devis n’a pas pu être mise à jour. La dernière version reste affichée : vérifie ta connexion puis recharge la page.';

// Choix conservés jusqu'au rechargement de la page (comme les autres listes).
let vue = 'liste'; // liste | tableau | archives (les archives s'affichent en liste ; seules Liste et Tableau sont mémorisées)
let recherche = '';
let statutsFiltres = [];
let periode = 'toutes';
let tri = { critere: 'modifie', sens: 'desc' };
let page = 1;
let parPage = Li.TAILLE_PAGE_DEFAUT;

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

/** Client (organisation, sinon personne) et affaire d'un devis, lus dans le CRM. */
function nomsDe(d) {
  const org = d.organisationId ? CRM.organisation(d.organisationId) : null;
  const pers = d.personneId ? CRM.personne(d.personneId) : null;
  const aff = d.affaireId ? CRM.affaire(d.affaireId) : null;
  const client = org?.nom || pers?.nom || (aff?.organisationId ? CRM.organisation(aff.organisationId)?.nom : '') || (aff?.personneId ? CRM.personne(aff.personneId)?.nom : '') || '';
  return { client, affaire: aff?.titre || '' };
}

const euros = (n) => (typeof n === 'number' ? formaterMontant(n) : '—');

function pastille(d, aujourdhui) {
  const s = Li.statutAffiche(d, aujourdhui);
  return h('span', { class: `pastille-statut statut-devis-${s}`, style: { '--couleur': Li.COULEURS_STATUT[s] ?? '#8d8993' }, dataset: { statut: s } }, Li.libelleStatut(s));
}

/** Petite pastille d'un devis finalisé mais pas encore envoyé (dans la colonne « Envoyé » du Tableau). */
const pastillePasEnvoye = () => h('span', { class: 'pastille-statut pastille-pas-envoye', style: { '--couleur': Li.COULEURS_STATUT.en_attente_envoi }, dataset: { pastille: 'pas-encore-envoye' } }, Li.LIBELLE_PAS_ENCORE_ENVOYE);

// ---------------------------------------------------------------- actions

/** Appelle la fonction du serveur puis dit le résultat. Un refus du serveur ou une panne de réseau s'affiche en clair ; rien n'est écrit par le navigateur. */
async function changerStatut(d, action, libelle) {
  try {
    if (action === 'finaliser') {
      const ok = await confirmer('Finaliser ce devis ?', 'Les prix, la TVA et les totaux seront figés et le devis recevra son numéro. Pour le corriger ensuite, tu créeras une nouvelle version.', { libelleOk: 'Finaliser' });
      if (!ok) return;
      const r = await D.finaliser(d.id);
      if (r?.ok === false) {
        await dialogue({ titre: 'Ce devis ne peut pas encore être finalisé', contenu: h('ul', { class: 'liste-erreurs-devis' }, (r.erreurs ?? []).map((e) => h('li', {}, e))), boutons: [{ libelle: 'Compris', valeur: true, style: 'principal' }] });
        return;
      }
      toast('Devis finalisé');
      return;
    }
    await D.changerStatut(d.id, action);
    toast(`Devis passé à « ${libelle} »`);
  } catch (e) {
    console.warn(e);
    toast(e?.message || D.MESSAGE_RESEAU_DEVIS, { type: 'erreur', duree: 8000 });
  }
}

/** Archive (ou sort des archives) un devis par la fonction du serveur ; un refus ou une panne s'affiche en clair. */
async function archiver(d, archive) {
  try {
    await D.archiver(d.id, archive);
    toast(archive ? 'Devis archivé' : 'Devis sorti des archives');
  } catch (e) {
    console.warn(e);
    toast(e?.message || D.MESSAGE_RESEAU_DEVIS, { type: 'erreur', duree: 8000 });
  }
}

/** Aperçu du devis : le même HTML que le PDF, dans une fenêtre simple (cadre isolé). */
async function voir(d) {
  let corps;
  try {
    const vue = vueClient(d, { clientNom: nomsDe(d).client || null, client: infosClientDuDevis(d) ?? undefined });
    corps = h('iframe', { class: 'apercu-devis', title: `Aperçu du devis ${d.numero ?? ''}`.trim(), sandbox: '', srcdoc: devisHtml(vue, { brouillon: d.statut === 'brouillon', affichage: affichageDe(d) }) });
  } catch (e) {
    console.warn(e);
    corps = h('p', { class: 'erreur', role: 'alert' }, 'L’aperçu n’a pas pu être préparé : ce devis est incomplet. Termine-le, puis rouvre l’aperçu.');
  }
  await dialogue({ titre: d.numero ? `Devis ${d.numero}` : 'Aperçu du brouillon', classe: 'dialogue-apercu-devis', contenu: corps, boutons: [{ libelle: 'Fermer', valeur: true, style: 'principal' }] });
}

/** Entrées du menu « … ». Les entrées inapplicables à ce statut sont absentes ; celles qui viendront plus tard sont grisées « bientôt disponible ». */
function entreesMenu(d, surFiche) {
  const a = Li.actionsPermises(d);
  const grise = (e) => !e.actif;
  const libelle = (texte, e) => (e.raison === Li.MESSAGE_BIENTOT ? `${texte} (bientôt disponible)` : texte);
  const items = a.statuts.map((c) => ({ libelle: `Passer à « ${c.libelle} »`, icone: 'check', action: () => changerStatut(d, c.action, c.libelle) }));
  if (items.length) items.push({ separateur: true });
  items.push({ libelle: 'Voir la fiche', icone: 'list', action: () => surFiche(d.id) });
  items.push({ libelle: 'Voir', icone: 'external-link', action: () => voir(d) });
  if (d.statut === 'brouillon') items.push({ libelle: libelle('Modifier : version actuelle', a.modifierVersionActuelle), icone: 'pencil', desactive: grise(a.modifierVersionActuelle), action: () => naviguer(`devis/editeur/${d.id}`) });
  else if (a.nouvelleVariante.actif || a.nouvelleVariante.raison === Li.MESSAGE_BIENTOT) items.push({ libelle: libelle('Modifier : nouvelle variante', a.nouvelleVariante), icone: 'pencil', desactive: grise(a.nouvelleVariante), action: () => creerVariante(d) });
  items.push({ libelle: libelle('Dupliquer', a.dupliquer), icone: 'copy', desactive: grise(a.dupliquer), action: () => dupliquerDevis(d) });
  items.push({ libelle: libelle('Envoyer', a.envoyer), icone: 'mail', desactive: grise(a.envoyer) });
  const ar = Fi.archivageFiche(d);
  items.push({ separateur: true });
  items.push({ libelle: ar.libelle, icone: ar.icone, desactive: !ar.actif, action: () => archiver(d, ar.action === 'archiver') });
  if (!ar.actif && ar.raison) items.push({ texte: ar.raison });
  if (d.statut === 'brouillon') { items.push({ libelle: libelle('Supprimer', a.supprimer), icone: 'trash-2', danger: true, desactive: grise(a.supprimer) }); }
  return items;
}

const actionsDevis = (d, surFiche) => h('div', { class: 'actions-devis' }, boutonMenu(d, surFiche));

function boutonMenu(d, surFiche) {
  return h('button', {
    type: 'button', class: 'bouton-icone carte-menu', 'aria-label': `Actions : ${d.numero ?? 'brouillon'} ${nomsDe(d).client}`.trim(), 'aria-haspopup': 'menu', dataset: { action: 'menu-devis' },
    onclick: (e) => { e.stopPropagation(); ouvrirMenu(e.currentTarget, entreesMenu(d, surFiche)); },
  }, icone('ellipsis', { taille: 16 }));
}

// ---------------------------------------------------------------- cellules

const intitule = (d) => d.numero ?? 'Brouillon';
function celluleClient(d) {
  const n = nomsDe(d);
  return h('div', { class: 'devis-client' }, h('span', { class: 'devis-client-nom' }, n.client || '—'), n.affaire ? h('span', { class: 'devis-affaire' }, n.affaire) : null);
}
function celluleModifie(d, maintenant) {
  const qui = Li.initialesDe(d.modifiePar ?? d.creePar);
  return h('span', { class: 'devis-modifie' }, Li.depuis(Li.modifieMs(d), maintenant), qui ? h('span', { class: 'avatar-initiales', style: { '--taille': '22px' }, title: d.modifiePar ?? d.creePar ?? '', 'aria-label': `Modifié par ${qui}` }, qui) : null);
}

/** Un clic (ou Entrée) sur une ligne ou une carte ouvre le devis dans l'éditeur (lecture seule s'il n'est plus brouillon), sauf sur un bouton, un lien ou un champ de la ligne. */
function ouvrable(el, ouvrir) {
  el.tabIndex = 0;
  el.addEventListener('click', (e) => { if (!e.target.closest('button, a, input, select, textarea, .menu-pop')) ouvrir(); });
  el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === el) { e.preventDefault(); ouvrir(); } });
  return el;
}

/** `idFiche` : le devis dont la fiche est ouverte par l'adresse #/devis/liste/<id> (null = aucune). Rend la fonction d'arrêt, avec `.surRoute(id)` pour les changements d'adresse. */
export function rendreListeDevis(conteneur, idFiche = null) {
  const titre = h('h1', {}, 'Devis');
  const compteur = h('span', { class: 'compteur-liste', 'aria-live': 'polite' });
  const zone = h('div', { class: 'zone-devis' });
  const pied = h('div', { class: 'pied-liste-devis' });
  const avis = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'lecture' }, hidden: true });
  const champRecherche = h('input', {
    class: 'champ', type: 'search', 'aria-label': 'Rechercher un devis', placeholder: 'Numéro, client ou affaire', autocomplete: 'off', value: recherche,
    oninput: (e) => { recherche = e.target.value; page = 1; rendre(); },
  });
  const filtres = boutonFiltresCommun({ auClic: async () => {
    const r = await fenetreFiltres({
      controles: [
        { cle: 'statuts', libelle: 'Statut', type: 'cases', options: [...['brouillon', 'en_attente_envoi', 'envoye', 'accepte', 'refuse', ...(vue === 'tableau' ? [] : ['expire', 'remplace'])].map((id) => ({ valeur: id, libelle: Li.libelleStatut(id) }))] },
        { cle: 'periode', libelle: 'En date du', type: 'choix', options: Li.PERIODES.map((p) => ({ valeur: p.id, libelle: p.libelle })) },
      ],
      criteres: { statuts: statutsFiltres, periode },
      effacer: () => ({ statuts: [], periode: 'toutes' }),
    });
    if (r) { statutsFiltres = r.statuts ?? []; periode = r.periode || 'toutes'; page = 1; rendre(); }
  } });
  const boutonNouveau = h('button', {
    type: 'button', class: `bouton ${Li.EDITEUR_DISPONIBLE ? 'bouton-principal' : 'bouton-secondaire'}`, disabled: !Li.EDITEUR_DISPONIBLE, title: Li.EDITEUR_DISPONIBLE ? null : Li.MESSAGE_BIENTOT,
    dataset: { action: 'nouveau-devis' }, onclick: () => naviguer('devis/editeur'),
  }, icone('plus', { taille: 16 }), 'Nouveau devis', Li.EDITEUR_DISPONIBLE ? null : h('span', { class: 'bientot' }, ' (bientôt disponible)'));
  const bascule = h('div', { class: 'bascule-vues', role: 'group', 'aria-label': 'Vue' });

  // Fiche d'un devis (panneau à droite). Ouvrir = changer l'adresse (#/devis/liste/<id>, lien partageable) ; fermer = revenir à la liste.
  // Si la fiche a été ouverte par un clic, fermer revient en arrière dans l'historique (la touche « retour » du navigateur fait pareil, sans pile d'adresses qui grandit).
  let idOuvertParClic = null;
  const ouvrirFiche = (id) => { idOuvertParClic = id; naviguer(`devis/liste/${id}`); };
  const fiche = creerFiche({
    nomsDe, changerStatut, archiver, aujourdhui: () => CRM.ctx().aujourdhui,
    fermer: ({ remplacer = false } = {}) => {
      if (idOuvertParClic && !remplacer) { idOuvertParClic = null; history.back(); return; }
      idOuvertParClic = null;
      naviguer('devis/liste', { remplacer: true });
    },
  });

  function majBascule() {
    remplir(bascule, [['liste', 'Liste', 'list'], ['tableau', 'Tableau', 'columns-3'], ['archives', 'Archives', 'archive']].map(([id, libelle, ic]) => h('button', {
      type: 'button', class: `bascule-vue${vue === id ? ' actif' : ''}`, 'aria-pressed': String(vue === id), dataset: { vue: id },
      onclick: () => { vue = id; if (id !== 'archives') ecrirePreference('vue.devis', id); page = 1; rendre(); },
    }, icone(ic, { taille: 16 }), h('span', {}, libelle))));
  }

  function rendre() {
    majBascule();
    filtres.majCompte(statutsFiltres.length + (periode !== 'toutes' ? 1 : 0));
    avis.hidden = !D.etat.erreurLectureDevis;
    avis.textContent = D.etat.erreurLectureDevis ? ERREUR_LECTURE : '';
    remplir(pied);
    if (!D.estPretDevis()) { remplir(zone, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' }))); remplir(compteur, ''); return; }
    const maintenant = Date.now();
    const aujourdhui = CRM.ctx().aujourdhui;
    const { du, au } = Li.bornesDePeriode(periode, aujourdhui);
    // Les anciennes versions « Remplacé » restent visibles (filtre de statut) ; tout est affiché par défaut.
    // Archives = devis archivés + anciennes versions (remplacées) + expirés. Tableau = tout sauf remplacés et expirés. Liste = tout ce qui n'est pas archivé à la main.
    const archives = vue === 'archives';
    const tous = D.etat.devis.filter((d) => (archives ? Li.estDansArchives(d, aujourdhui) : d.archive !== true && !(vue === 'tableau' && Li.estHorsTableau(d, aujourdhui))));
    let lignes = Li.rechercher(tous, recherche, nomsDe);
    lignes = Li.filtrer(lignes, { statuts: statutsFiltres, du, au, aujourdhui });
    lignes = Li.trier(lignes, tri);
    const total = tous.length;
    remplir(compteur, `${total} devis`, lignes.length !== total ? ` · ${lignes.length} affiché${lignes.length > 1 ? 's' : ''}` : '');
    if (!lignes.length) {
      const vraimentVide = total === 0;
      if (vraimentVide && archives) { remplir(zone, etatVide('Aucun devis archivé. Un devis signé ou refusé se range ici avec « Archiver », dans le menu « … » de sa fiche ; les devis remplacés et expirés y sont aussi.')); return; }
      remplir(zone, etatVide(vraimentVide ? 'Aucun devis pour l’instant.' : 'Aucun devis ne correspond.', {
        action: vraimentVide ? h('button', { type: 'button', class: 'bouton bouton-secondaire', disabled: !Li.EDITEUR_DISPONIBLE, title: Li.EDITEUR_DISPONIBLE ? null : Li.MESSAGE_BIENTOT, dataset: { action: 'nouveau-devis-vide' }, onclick: () => naviguer('devis/editeur') },
          icone('plus', { taille: 16 }), 'Nouveau devis', Li.EDITEUR_DISPONIBLE ? null : ' (bientôt disponible)') : null,
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
        h('button', { type: 'button', class: 'tri', onclick: () => changerTri(c.tri) }, c.libelle, tri.critere === c.tri ? icone(tri.sens === 'asc' ? 'arrow-up' : 'arrow-down', { taille: 12 }) : null))
      : h('th', { scope: 'col' }, h('span', { class: 'tri titre-colonne' }, c.libelle)))), h('th', { class: 'col-actions' }));
    const corps = p.lignes.map((d) => {
      const t = Li.totauxDe(d);
      return ouvrable(h('tr', { class: 'ligne-liste ligne-devis', dataset: { id: d.id, statut: Li.statutAffiche(d, aujourdhui) } },
        h('td', { dataset: { colonne: 'numero', libelle: 'Numéro' } }, h('span', { class: `devis-numero${d.numero ? '' : ' devis-numero-vide'}` }, intitule(d)), d.version > 1 ? h('span', { class: 'devis-version' }, ` v${d.version}`) : null),
        h('td', { dataset: { colonne: 'statut', libelle: 'Statut' } }, pastille(d, aujourdhui)),
        h('td', { dataset: { colonne: 'documents', libelle: 'Documents' } }, indicateurPdf(d, { apres: () => rendre(), maintenant })), // lien « PDF », « en cours » ou avertissement « PDF non rangé » (finalisé seulement)
        h('td', { dataset: { colonne: 'client', libelle: 'Client / Affaire' } }, celluleClient(d)),
        h('td', { dataset: { colonne: 'modifie', libelle: 'Modifié' } }, celluleModifie(d, maintenant)),
        h('td', { dataset: { colonne: 'date', libelle: 'En date du' } }, Li.dateFr(Li.dateDuDevis(d))),
        h('td', { dataset: { colonne: 'validite', libelle: 'Valable jusqu’au' } }, Li.dateFr(d.expireLe)),
        h('td', { class: 'montant', dataset: { colonne: 'ht', libelle: 'Total HT' } }, euros(t?.ht)),
        h('td', { class: 'montant', dataset: { colonne: 'ttc', libelle: 'Total TTC' } }, euros(t?.ttc)),
        h('td', { class: 'col-actions' }, actionsDevis(d, ouvrirFiche))), () => naviguer(`devis/editeur/${d.id}`));
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
    remplir(zone, h('div', { class: 'kanban tableau-devis-colonnes' }, colonnes.map((c) => h('section', { class: 'colonne', style: { '--couleur': Li.COULEURS_STATUT[c.id] ?? '#8d8993' }, dataset: { colonne: c.id } },
      h('header', { class: 'colonne-tete' }, h('h2', {}, c.libelle), h('span', { class: 'colonne-totaux' }, `${c.devis.length} devis`)),
      h('div', { class: 'colonne-corps' }, c.devis.length ? c.devis.map((d) => carte(d, maintenant, aujourdhui)) : h('p', { class: 'colonne-vide' }, 'Aucun devis'))))));
  }

  function carte(d, maintenant, aujourdhui) {
    const t = Li.totauxDe(d);
    const pdfCarte = indicateurPdf(d, { apres: () => rendre(), maintenant });
    const couleur = Li.couleurPastilleDevis(d, aujourdhui, maintenant);
    return ouvrable(h('article', { class: 'carte-affaire carte-devis', dataset: { id: d.id, statut: Li.statutAffiche(d, aujourdhui) } },
      h('div', { class: 'carte-ligne' }, h('strong', { class: 'carte-titre' }, intitule(d), d.version > 1 ? ` v${d.version}` : '')),
      h('div', { class: 'carte-actions-devis' }, actionsDevis(d, ouvrirFiche)),
      h('div', { class: 'carte-pastilles' }, pastille(d, aujourdhui), d.statut === 'en_attente_envoi' && Li.statutAffiche(d, aujourdhui) === 'en_attente_envoi' ? pastillePasEnvoye() : null),
      celluleClient(d),
      h('div', { class: 'carte-pied' },
        h('span', { class: 'carte-montant' }, `HT ${euros(t?.ht)}`),
        pdfCarte,
        h('span', { class: `pastille-activite ${couleur}`, role: 'img', 'aria-label': Li.LIBELLES_PASTILLE_DEVIS[couleur], title: Li.LIBELLES_PASTILLE_DEVIS[couleur] }))), () => naviguer(`devis/editeur/${d.id}`));
  }

  const memorisee = lirePreference('vue.devis');
  if (memorisee === 'liste' || memorisee === 'tableau') vue = memorisee;

  conteneur.append(h('div', { class: 'page page-liste page-devis page-liste-devis' },
    h('header', { class: 'page-tete' }, h('div', {}, titre, compteur), h('div', { class: 'page-actions' }, h('a', { class: 'bouton bouton-secondaire', href: '#/devis/bordereau', dataset: { action: 'ouvrir-bordereau' } }, icone('list', { taille: 16 }), 'Catalogue'), boutonNouveau)),
    h('div', { class: 'barre-affaires' }, champRecherche, filtres.element, bascule),
    avis, zone, pied));

  // Les « il y a … » avancent d'eux-mêmes ; tout changement de données (devis, clients, affaires) redessine la liste.
  const rafraichir = planifier(() => { rendre(); fiche.maj(); });
  rendre();
  if (idFiche) fiche.afficher(idFiche);
  const arrets = [D.surChangement(rafraichir), CRM.surChangement(rafraichir)];
  const minuteur = setInterval(() => { if (!document.querySelector('.menu-pop')) { rendre(); fiche.maj(); } }, 60000);
  const arreter = () => { arrets.forEach((f) => f()); clearInterval(minuteur); fiche.detruire(); };
  /** L'adresse a changé sans que la liste soit remontée : la fiche s'ouvre, change de devis ou se ferme. */
  arreter.surRoute = (id) => {
    if (id !== idOuvertParClic) idOuvertParClic = null; // ouverte autrement que par un clic (lien direct, signet)
    fiche.afficher(id || null);
  };
  return arreter;
}
