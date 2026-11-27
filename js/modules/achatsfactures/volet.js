// Volet « Fournisseurs, Chantiers, Articles » de « l'application Factures » (27/11/2026, maquette v3) : il s'ouvre à droite sur ordinateur (la facture reste visible derrière),
// et monte du bas sur téléphone. En haut : trois boutons pour passer d'une liste à l'autre, et la croix. Pas d'onglets à mémoriser : on ferme avec la croix, on rouvre par le grand bouton.
// Quand une FICHE est ouverte, les trois boutons disparaissent : il ne reste que « ← » (retour à la liste) et la croix.
// Fiche d'un fournisseur ou d'un chantier : d'abord en lecture, puis « Modifier », « Enregistrer » / « Annuler » (fiche.js : la mise en page ne bouge pas). Fiche d'un article : lecture seule.
// LECTURES et ÉCRITURES : seulement par donnees-appli.js (client de la base ; actions métier existantes). Trois cas partout : chargement, cas vide, cas d'erreur avec « Réessayer ».
import { h, icone, remplir, toast, confirmer } from '../../os/ui.js';
import { champRecherche } from '../crm/barre-liste.js';
import { creerFiche } from './fiche.js';
import { ibanValide, normaliserIban } from './controles.js';
import { champsAgenceDepuis, verifierChampsAgence } from './agences.js';
import { dateFr, nomFournisseur, SANS_FOURNISSEUR, DUREE_MESSAGE } from './logique.js';
import { initiales, masquerIban, ibanLisible, correspond, verifierChantierFiche, LIBELLE_STATUT_CHANTIER } from './logique-appli.js';

export const ONGLETS = Object.freeze([['fournisseurs', 'Fournisseurs', 'building-2'], ['chantiers', 'Chantiers', 'folder-kanban'], ['articles', 'Articles', 'tag']]);
const TITRE = Object.fromEntries(ONGLETS.map(([id, libelle]) => [id, libelle]));
const VIDE = { fournisseurs: 'Aucun fournisseur pour l’instant. Ils naissent des factures lues, ou du bouton « + Fournisseur ».', chantiers: 'Aucun chantier pour l’instant.', articles: 'Aucun article pour l’instant. Ils naissent des lignes des factures.' };
const ERREUR = { fournisseurs: 'Impossible de lire les fournisseurs. Vérifie ta connexion, puis réessaie.', chantiers: 'Impossible de lire les chantiers. Vérifie ta connexion, puis réessaie.', articles: 'Impossible de lire les articles. Vérifie ta connexion, puis réessaie.' };
const NOTE_FOURNISSEUR = 'Le nom, le SIREN, les agences et l’e-mail viennent des factures lues : ils ne se modifient pas ici pour l’instant. L’IBAN se remplace seulement s’il a été confirmé.';
const NOTE_SANS_CONFIRMATION = 'Cet IBAN n’a jamais été confirmé : il n’y a rien à remplacer ici. Chaque facture reste contrôlée (IBAN nouveau ou changé = alerte).';

/**
 * `donnees()` : creerDonneesAppli ; `lireFournisseurs()` : renvoie la liste DÉJÀ préparée par l'application (partagée avec les bandeaux de la pile), ou null si elle n'est pas lue ;
 * `rechargerFournisseurs()` : la relit (après une écriture) ; `surEcriture()` : prévient l'application qu'une donnée a changé (la facture affichée est relue) ; `surEtat(ouvert)`.
 * Renvoie { element, voile, ouvrir(onglet), ouvrirFiche(type, id), ouvrirNouveau(facture), fermer(), estOuvert(), arreter() }.
 */
export function creerVolet({ donnees, etatFournisseurs, rechargerFournisseurs, surEcriture = () => {}, surEtat = () => {} }) {
  let vivant = true;
  let ouvert = false;
  let onglet = 'fournisseurs';
  let vue = 'liste'; // liste | fiche | nouveau
  let cle = null; // identifiant de la fiche ouverte
  let depuisFacture = null; // facture qui pré-remplit « Nouveau fournisseur »
  let recherche = '';
  let numero = 0;
  const cache = { chantiers: { etat: 'vide', lignes: [] }, articles: { etat: 'vide', lignes: [] } }; // etat : vide | chargement | ok | erreur

  const tete = h('div', { class: 'af-volet-tete' });
  const corps = h('div', { class: 'af-volet-corps' });
  const element = h('aside', { class: 'af-volet', hidden: true, 'aria-label': 'Fournisseurs, Chantiers, Articles', dataset: { role: 'volet' } }, tete, corps);
  const voile = h('div', { class: 'af-voile', hidden: true, dataset: { role: 'voile-volet' }, onclick: () => fermer() });
  const croix = () => h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Fermer le volet', title: 'Fermer', dataset: { action: 'fermer-volet' }, onclick: () => fermer() }, icone('x', { taille: 18 }));
  const pastille = (texte, couleur) => h('span', { class: 'af-av', 'aria-hidden': 'true', style: couleur ? { '--af-av': couleur } : null }, texte);

  // ------------------------------------------------------------ lecture des listes (chantiers, articles) ; les fournisseurs viennent de l'application
  async function charger(quoi, forcer = false) {
    if (quoi === 'fournisseurs') { if (forcer || etatFournisseurs().etat === 'erreur') { const p = rechargerFournisseurs(); dessiner(); await p; } return; } // à la fin de la lecture, l'application appelle `rafraichir` (jamais par-dessus une saisie)
    const c = cache[quoi];
    if (!forcer && (c.etat === 'ok' || c.etat === 'chargement')) return;
    const n = ++numero;
    c.etat = 'chargement'; dessiner();
    try {
      const lignes = await (quoi === 'chantiers' ? donnees().lireChantiers() : donnees().lireArticles());
      if (!vivant) return;
      cache[quoi] = { etat: 'ok', lignes };
    } catch (e) {
      if (!vivant) return;
      console.warn(`Volet : lecture des ${quoi} impossible`, e?.code ?? e?.message);
      cache[quoi] = { etat: 'erreur', lignes: [] };
    }
    if (n === numero && onglet === quoi) dessiner();
  }
  const etatDe = (quoi) => (quoi === 'fournisseurs' ? etatFournisseurs() : cache[quoi]);

  // ------------------------------------------------------------ dessin
  function dessiner() {
    if (!vivant || !ouvert) return;
    element.dataset.vue = vue;
    element.dataset.onglet = onglet;
    if (vue === 'liste') dessinerListe();
    else if (vue === 'nouveau') dessinerNouveau();
    else dessinerFiche();
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
      onglet === 'fournisseurs' ? h('button', { type: 'button', class: 'bouton bouton-principal', dataset: { action: 'nouveau-fournisseur' }, onclick: () => ouvrirNouveau(null) }, icone('plus', { taille: 16 }), 'Fournisseur') : null);
    function lignes() {
      if (e.etat === 'chargement' || e.etat === 'vide') return h('div', { class: 'chargement-bloc', role: 'status', dataset: { etat: 'chargement' } }, h('span', { class: 'rond-chargement' }), h('span', { class: 'aide' }, 'Chargement…'));
      if (e.etat === 'erreur') return etatBloc('alert', { etat: 'erreur' }, h('p', { class: 'mon-espace-erreur' }, ERREUR[onglet]),
        h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer' }, onclick: () => { void charger(onglet, true); } }, icone('refresh-cw', { taille: 16 }), 'Réessayer'));
      if (e.lignes.length === 0) return etatBloc('status', { etat: 'vide' }, h('p', {}, VIDE[onglet]));
      const visibles = e.lignes.filter((x) => correspond(texteDe(x), recherche));
      if (visibles.length === 0) return etatBloc('status', { etat: 'sans-resultat' }, h('p', {}, 'Rien ne correspond à ta recherche.'));
      return h('ul', { class: 'af-liste', dataset: { role: 'volet-liste' } }, visibles.map(ligne));
    }
    remplir(corps, outils, zone);
    remplir(zone, lignes());
  }

  const texteDe = (x) => (onglet === 'fournisseurs' ? `${x.nom} ${x.siren ?? ''}` : onglet === 'chantiers' ? `${x.nom} ${x.code ?? ''} ${x.client ?? ''}` : `${x.designation ?? ''} ${x.reference ?? ''} ${x.fournisseur ?? ''}`);

  function ligne(x) {
    let contenu;
    if (onglet === 'fournisseurs') {
      const sous = x.nbFactures === null ? 'Factures non lues' : `${x.nbFactures} facture${x.nbFactures > 1 ? 's' : ''}${x.derniere ? ` · dernière le ${dateFr(x.derniere)}` : ''}`;
      contenu = [pastille(initiales(x.nom)), h('span', { class: 'af-grandit' }, h('b', {}, x.nom), h('span', { class: 'aide' }, sous)), x.changement ? h('span', { class: 'af-puce-iban', dataset: { role: 'puce-iban' } }, 'IBAN changé') : null];
    } else if (onglet === 'chantiers') {
      contenu = [pastille(icone('folder-kanban', { taille: 16 })), h('span', { class: 'af-grandit' }, h('b', {}, x.nom), h('span', { class: 'aide' }, [LIBELLE_STATUT_CHANTIER[x.statut] ?? x.statut, x.client].filter(Boolean).join(' · ') || '—')), x.code ? h('span', { class: 'aide' }, x.code) : null];
    } else {
      contenu = [pastille(icone('tag', { taille: 16 })), h('span', { class: 'af-grandit' }, h('b', {}, x.designation?.trim() || x.reference || 'Article sans nom'), h('span', { class: 'aide' }, [x.fournisseur, x.reference ? `Réf. ${x.reference}` : null].filter(Boolean).join(' · ') || '—')), x.unite ? h('span', { class: 'aide' }, x.unite) : null];
    }
    return h('li', {}, h('button', { type: 'button', class: 'af-ligne', dataset: { fiche: x.id }, onclick: () => { vue = 'fiche'; cle = x.id; dessiner(); } }, contenu));
  }

  const titreFiche = (nom, sous, marque) => h('div', { class: 'af-fiche-nom' }, pastille(marque), h('div', {}, h('h2', { dataset: { role: 'fiche-titre' } }, nom), h('p', { class: 'aide' }, sous)));
  const introuvable = (type) => { teteFiche(type); remplir(corps, etatBloc('status', { etat: 'vide' }, h('p', {}, 'Cette fiche est introuvable : elle a peut-être été retirée.'))); };

  function dessinerFiche() {
    if (onglet === 'fournisseurs') { dessinerFournisseur(); return; }
    teteFiche(onglet);
    const x = cache[onglet].lignes.find((l) => l.id === cle);
    if (!x) { introuvable(onglet); return; }
    if (onglet === 'articles') {
      remplir(corps, titreFiche(x.designation?.trim() || x.reference || 'Article sans nom', 'Fiche article', icone('tag', { taille: 18 })),
        creerFiche({ lignes: [
          { cle: 'fournisseur', libelle: 'Fournisseur', valeur: x.fournisseur ?? '—' }, { cle: 'reference', libelle: 'Référence', valeur: x.reference ?? '—' },
          { cle: 'designation', libelle: 'Désignation', valeur: x.designation ?? '—' }, { cle: 'unite', libelle: 'Unité', valeur: x.unite ?? '—' },
        ], note: 'Un article se lit sur les factures : il ne se modifie pas ici.' }).element);
      return;
    }
    const fiche = creerFiche({
      lignes: [
        { cle: 'nom', libelle: 'Nom', valeur: x.nom ?? '—', modifiable: true }, { cle: 'code', libelle: 'Code', valeur: x.code ?? '—', modifiable: true },
        { cle: 'client', libelle: 'Client', valeur: x.client ?? '—', modifiable: true }, { cle: 'adresse', libelle: 'Adresse', valeur: x.adresse ?? '—', modifiable: true },
        { cle: 'statut', libelle: 'Statut', valeur: LIBELLE_STATUT_CHANTIER[x.statut] ?? x.statut ?? '—' },
      ],
      note: 'Le statut, le budget et les dates se règlent dans l’écran Chantiers.',
      surEnregistrer: async (v) => {
        const probleme = verifierChantierFiche(v);
        if (probleme) throw new Error(probleme);
        const change = await donnees().enregistrerChantier(x, v);
        if (!vivant) return;
        if (change) { toast('Chantier enregistré', { duree: DUREE_MESSAGE }); await charger('chantiers', true); surEcriture(); } else dessiner();
      },
    });
    remplir(corps, titreFiche(x.nom, 'Fiche chantier', icone('folder-kanban', { taille: 18 })), fiche.element);
  }

  function dessinerFournisseur() {
    teteFiche('fournisseurs');
    const e = etatFournisseurs();
    const fo = e.lignes.find((l) => l.id === cle);
    if (!fo) { if (e.etat === 'chargement' || e.etat === 'vide') remplir(corps, h('div', { class: 'chargement-bloc', role: 'status', dataset: { etat: 'chargement' } }, h('span', { class: 'rond-chargement' }))); else introuvable('fournisseurs'); return; }
    const agences = fo.agences.map((a) => [a.nom_agence, a.ville].filter(Boolean).join(' · ') || (a.siret ? `SIRET ${a.siret}` : 'Agence')).join(' ; ') || '—';
    const villes = [...new Set(fo.agences.map((a) => a.ville?.trim()).filter(Boolean))].join(', ') || '—';
    const ibanTexte = !fo.ibansLus ? 'Non lu' : fo.iban ? `${masquerIban(fo.iban)}${fo.confirmation ? ' · confirmé' : ' · jamais confirmé'}` : '—';
    const fiche = creerFiche({
      lignes: [
        { cle: 'nom', libelle: 'Nom', valeur: fo.nom }, { cle: 'siren', libelle: 'SIREN', valeur: fo.siren ?? '—' },
        { cle: 'agences', libelle: 'Agence(s)', valeur: agences }, { cle: 'adresse', libelle: 'Adresse', valeur: villes }, { cle: 'email', libelle: 'E-mail', valeur: fo.email ?? '—' },
        { cle: 'iban', libelle: 'IBAN', valeur: ibanTexte, saisie: fo.confirmation ? ibanLisible(fo.iban) : '', modifiable: !!fo.confirmation, placeholder: 'FR76 …', classe: 'af-iban' },
        { cle: 'nb', libelle: 'Nombre de factures', valeur: fo.nbFactures === null ? '—' : String(fo.nbFactures) }, { cle: 'derniere', libelle: 'Dernière facture', valeur: fo.derniere ? dateFr(fo.derniere) : '—' },
      ],
      note: fo.confirmation ? NOTE_FOURNISSEUR : `${NOTE_FOURNISSEUR} ${NOTE_SANS_CONFIRMATION}`,
      surEnregistrer: (v) => enregistrerFournisseur(fo, v),
    });
    const alerte = fo.changement ? h('div', { class: 'af-alerte', role: 'status', dataset: { role: 'alerte-iban-fiche' } }, icone('triangle-alert', { taille: 16 }),
      h('div', {}, h('b', {}, `L’IBAN a été changé le ${dateFr(fo.changement.date)}`), h('span', {}, 'Ses prochaines factures portent une alerte orange : appelle le fournisseur sur un numéro que tu connais déjà avant de payer.'))) : null;
    const historique = fo.historique.length ? [h('p', { class: 'af-titre-sec' }, 'Historique des IBAN'),
      h('ul', { class: 'af-histo', dataset: { role: 'historique-iban' } }, fo.historique.map((c) => h('li', {}, h('span', { class: 'af-iban' }, masquerIban(c.iban)),
        h('span', { class: 'aide' }, c.revoque_le ? `révoqué le ${dateFr(c.revoque_le)}` : `confirmé le ${dateFr(c.confirme_le)}`))))] : null;
    remplir(corps, titreFiche(fo.nom, 'Fiche fournisseur', initiales(fo.nom)), alerte, fiche.element, historique);
  }

  /** IBAN remplacé : l'ancienne confirmation est révoquée (action existante), avec le nouvel IBAN dans le motif. Le nouvel IBAN n'est PAS confirmé d'office : il se confirme après vérification. */
  async function enregistrerFournisseur(fo, v) {
    const nouveau = normaliserIban(v.iban);
    if (!fo.confirmation || nouveau === normaliserIban(fo.iban)) { dessiner(); return undefined; } // rien n'a changé : retour à la lecture
    if (!nouveau) throw new Error('Écris le nouvel IBAN, ou clique sur « Annuler ».');
    if (!ibanValide(nouveau)) throw new Error('Cet IBAN n’est pas valide (format ou clé de contrôle) : vérifie les caractères.');
    const ok = await confirmer('Remplacer l’IBAN ?', `L’IBAN confirmé de ${fo.nom} ne sera plus reconnu : ses prochaines factures porteront une alerte orange, le temps de vérifier le nouvel IBAN.`, { libelleOk: 'Remplacer l’IBAN' });
    if (!ok) return false;
    await donnees().revoquerIban(fo.confirmation.id, `IBAN remplacé depuis la fiche du fournisseur. Nouvel IBAN annoncé : ${ibanLisible(nouveau)}`);
    if (!vivant) return undefined;
    toast('Fiche enregistrée · IBAN changé : alerte sur ses prochaines factures', { duree: DUREE_MESSAGE });
    await rechargerFournisseurs();
    if (vivant) { dessiner(); surEcriture(); }
    return undefined;
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
    remplir(corps, h('h2', { class: 'af-titre-nouveau', dataset: { role: 'fiche-titre' } }, 'Nouveau fournisseur'),
      f ? h('p', { class: 'af-info', dataset: { role: 'prerempli' } }, icone('check', { taille: 16 }), `Pré-rempli depuis la facture${f.numero ? ` ${f.numero}` : ''}${f.date_facture ? ` du ${dateFr(f.date_facture)}` : ''}. Vérifie avant d’enregistrer.`) : null,
      fiche.element);
  }

  // ------------------------------------------------------------ ouverture, fermeture
  function montrer() {
    const avant = ouvert;
    ouvert = true;
    element.hidden = false; voile.hidden = false;
    element.classList.toggle('af-volet-entre', !avant); // l'animation d'arrivée ne joue qu'à l'ouverture, pas à chaque changement de liste
    dessiner();
    if (!avant) surEtat(true);
  }
  function ouvrir(quoi = 'fournisseurs') { onglet = quoi; vue = 'liste'; cle = null; depuisFacture = null; recherche = ''; montrer(); void charger(quoi); }
  function ouvrirFiche(type, id) { onglet = type; vue = 'fiche'; cle = id; depuisFacture = null; montrer(); void charger(type); }
  function ouvrirNouveau(facture) { onglet = 'fournisseurs'; vue = 'nouveau'; cle = null; depuisFacture = facture ?? null; montrer(); }
  function fermer() {
    if (!ouvert) return;
    ouvert = false; vue = 'liste'; cle = null; depuisFacture = null; // une saisie en cours est jetée : la croix vaut « Annuler »
    element.hidden = true; voile.hidden = true;
    remplir(corps);
    surEtat(false);
  }

  /** Les fournisseurs viennent d'être relus par l'application : la liste (ou une fiche encore en chargement) se redessine ; une saisie en cours n'est jamais écrasée. */
  function rafraichir() { if (ouvert && onglet === 'fournisseurs' && (vue === 'liste' || corps.querySelector('[data-etat="chargement"]'))) dessiner(); }

  return { element, voile, ouvrir, ouvrirFiche, ouvrirNouveau, fermer, estOuvert: () => ouvert, rafraichir, arreter: () => { vivant = false; } };
}
