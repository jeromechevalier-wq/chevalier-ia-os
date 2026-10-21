// Fiche d'un projet : barre des phases, résumé, tâches, factures ; à droite : activité, notes et documents (onglets, avec le dossier de travail), points clés, historique.
import { h, icone, remplir, ouvrirMenu, toast, confirmer } from '../../os/ui.js';
import * as CRM from '../crm/donnees.js';
import * as L from '../crm/logique.js';
import {
  liensEntete, afficherSelecteur, lienAffaire, champDescription, sectionRepliable, champPropriete, selecteurPersonne, selecteurOrganisation, titreEditable, selectProprietaire,
  gabaritFiche, lienRetour, saisieEnCours, etatVide, planifier, boutonEtoile, iconeInfo,
} from '../crm/composants.js';
import { panneauActivite } from '../crm/activites.js';
import { creerLanceurs } from '../crm/lanceurs.js';
import { retirerAvecAnnulation } from '../../os/retrait.js';
import { sectionLiensEtDocuments } from '../crm/liens-documents.js';
import * as D from './donnees.js';
import * as P from './logique.js';
import { sectionTaches } from './taches.js';
import { sectionFactures } from './factures.js';
import { cheminModele } from './modeles.js';
import { anneauProgression } from './composants.js';
import { pastilleStatutProjet, pastilleImpaye, terminerProjet, changerPhaseProjet, mettreEnPause, reprendre, rouvrir, demanderSuppressionProjet } from './projets.js';
const cfg = () => CRM.etat.config;
const EXPLICATION_STATUT_PROJET = {
  actif: 'Le projet est en cours : il avance de phase en phase.',
  en_pause: 'Le projet est mis de côté. On peut le reprendre.',
  termine: 'Le projet est terminé (phase de clôture). On peut le rouvrir.',
};

export function rendreFicheProjet(conteneur, id) {
  let panneau = null;
  let panneauAffaireId = null;
  let majSelecteurs = null; // met à jour l'affichage des cellules Personne / Organisation du Résumé (sans écrire)
  let majLiens = null; // redessine seulement les liens personne / organisation de l'en-tête
  let majFactures = null; // redessine la liste des factures seule, pendant une saisie dans le formulaire d'ajout
  let majTaches = null; // redessine la liste des tâches seule, quand on est en train de taper ailleurs dans la fiche
  const racine = h('div', { class: 'fiche-conteneur' });
  conteneur.append(racine);

  function introuvable() {
    remplir(racine, h('div', { class: 'page' }, lienRetour('#/projets/projets', 'Projets'),
      etatVide(D.estPret() && CRM.estPret() ? 'Ce projet n’existe plus.' : 'Chargement…')));
  }

  function barreDesPhases(p) {
    const index = P.phasesActives(cfg()).findIndex((x) => x.id === p.phase);
    const vivant = P.estProjetActif(p);
    return h('ol', { class: `barre-etapes-fiche${vivant ? '' : ' inactive'}`, 'aria-label': 'Phases du projet' },
      P.phasesActives(cfg()).map((ph, i) => h('li', { class: i <= index ? 'passee' : '', style: { '--couleur': ph.couleur } },
        // Simple indicateur : on change la phase avec la liste « Phase » du Résumé.
        h('span', { class: `etape${i === index ? ' courante' : ''}`, 'aria-current': i === index && vivant ? 'step' : null, dataset: { phase: ph.id }, title: i === index ? `Phase actuelle : ${ph.libelle}` : ph.libelle }, ph.libelle),
        iconeInfo(ph.description, ph.libelle))));
  }

  function construire(p) {
    const liens = liensEntete(() => D.projet(p.id) || p);
    majLiens = liens.maj;
    const aff = p.affaireId ? CRM.affaire(p.affaireId) : null;
    const termine = P.estProjetTermine(p);
    const titre = titreEditable({ valeur: p.titre, libelle: 'Titre', surEnregistrer: (v) => D.majProjet(p.id, { titre: v }) });
    const menu = h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Plus d’actions', 'data-action': 'menu-fiche',
      onclick: (e) => ouvrirMenu(e.currentTarget, [
        ...(termine ? [{ libelle: 'Rouvrir', icone: 'rotate-ccw', action: () => rouvrir(p) }] : []),
        { libelle: p.archive ? 'Désarchiver' : 'Archiver', icone: p.archive ? 'archive-restore' : 'archive', action: () => D.archiver(p.id, !p.archive) },
        { libelle: 'Supprimer définitivement…', icone: 'trash-2', danger: true, action: () => demanderSuppressionProjet(p) },
      ]) }, icone('ellipsis', { taille: 20 }));
    const actions = termine
      ? [h('button', { type: 'button', class: 'bouton bouton-principal', 'data-action': 'rouvrir', onclick: () => rouvrir(p) }, icone('rotate-ccw', { taille: 16 }), 'Rouvrir')]
      : [
        h('button', { type: 'button', class: 'bouton bouton-principal', 'data-action': 'terminer', onclick: () => terminerProjet(p) }, icone('circle-check', { taille: 16 }), 'Terminer'),
        p.statut === 'en_pause'
          ? h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'reprendre', onclick: () => reprendre(p) }, 'Reprendre')
          : h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'en-pause', onclick: () => mettreEnPause(p) }, 'En pause'),
      ];

    const entete = h('header', { class: 'fiche-tete' },
      lienRetour('#/projets/projets', 'Projets'),
      h('div', { class: 'fiche-tete-ligne' },
        h('div', { class: 'fiche-titre' }, titre,
          h('div', { class: 'fiche-sous' }, pastilleStatutProjet(p), iconeInfo(EXPLICATION_STATUT_PROJET[p.statut], 'État du projet'), pastilleImpaye(p), p.archive ? h('span', { class: 'badge-archive' }, 'Archivé') : null,
            liens.element,
            selectProprietaire({ valeur: p.proprietaire, surChoix: (v) => D.majProjet(p.id, { proprietaire: v }) }))),
        h('div', { class: 'fiche-actions' }, actions, menu)),
      barreDesPhases(p));

    // ---- Description libre : en haut de la colonne, sans titre
    const description = champDescription({ valeur: p.description || '', libelle: 'Description du projet',
      invitation: 'Ce projet concerne… (ce qu’on construit, pour qui, où on en est)',
      surEnregistrer: (v) => D.majProjet(p.id, { description: v }) });

    // ---- Résumé
    // Retirer (croix) écrit null ; taper dans la cellule ne retire rien (surChoix(null) sans `effacement`).
    const selPersonne = selecteurPersonne({ valeurId: p.personneId, surChoix: async (el, info) => {
      if (!el) { if (info?.effacement && D.projet(p.id)?.personneId) await D.majProjet(p.id, { personneId: null }); return; }
      const courant = D.projet(p.id) || p;
      if (el.id === courant.personneId) return;
      const nouveau = CRM.personne(el.id);
      await D.majProjet(p.id, { personneId: el.id, ...(nouveau?.organisationId && !courant.organisationId ? { organisationId: nouveau.organisationId } : {}) });
    } });
    const selOrg = selecteurOrganisation({ valeurId: p.organisationId, surChoix: async (el, info) => {
      if (!el) { if (info?.effacement && D.projet(p.id)?.organisationId) await D.majProjet(p.id, { organisationId: null }); return; }
      if (el.id !== (D.projet(p.id) || p).organisationId) await D.majProjet(p.id, { organisationId: el.id });
    } });
    majSelecteurs = () => {
      const c = D.projet(p.id) || p;
      afficherSelecteur(selPersonne, c.personneId ? CRM.personne(c.personneId) : null, (x) => ({ id: x.id, libelle: x.nom }));
      afficherSelecteur(selOrg, c.organisationId ? CRM.organisation(c.organisationId) : null, (x) => ({ id: x.id, libelle: x.nom }));
    };
    const offres = CRM.etat.offres.filter((x) => x.actif !== false || x.id === p.offreId);
    /** Une date facultative : vide = effacer ; la fin ne précède pas le début (règle de logique.js, le message est celui de la règle). */
    const enregistrerDate = (champ) => async (v) => {
      const erreurs = P.validerProjet({ titre: p.titre, dateDebut: p.dateDebut, dateFin: p.dateFin, [champ]: v || null });
      if (erreurs[champ]) throw Object.assign(new Error(erreurs[champ]), { saisie: true });
      await D.majProjet(p.id, { [champ]: v || null });
    };
    /** La phase, modifiable ici comme dans la barre sous le titre : même règle (la Clôture peut être bloquée par les factures), même fonction. */
    const selectPhase = h('select', { class: 'champ', 'aria-label': 'Phase', 'data-action': 'choisir-phase',
      onchange: async () => {
        await changerPhaseProjet(p, selectPhase.value);
        selectPhase.value = D.projet(p.id)?.phase ?? p.phase; // refus ou annulation : on revient à la phase réelle
      } }, P.phasesActives(cfg()).map((ph) => h('option', { value: ph.id, selected: ph.id === p.phase }, ph.libelle)));
    /** L'avancement (cercle et « 2 / 5 tâches ») : redessiné seul quand une tâche change pendant qu'on tape dans la fiche. */
    const zoneAvancement = h('div', { class: 'prop-valeur' });
    const rendreAvancement = () => {
      const avancement = P.progressionProjet(D.tachesDe(p.id));
      remplir(zoneAvancement, avancement.total
        ? h('span', { class: 'avancement' }, anneauProgression(avancement, { taille: 20 }), `${avancement.faites} / ${avancement.total} tâche${avancement.total > 1 ? 's' : ''}`)
        : h('span', { class: 'aide' }, 'Aucune tâche'));
    };
    rendreAvancement();
    const resume = sectionRepliable({
      id: 'projet-resume', titre: 'Résumé',
      contenu: h('div', { class: 'proprietes' },
        p.affaireId ? h('div', { class: 'prop', dataset: { prop: 'affaire' } }, h('span', { class: 'prop-libelle' }, 'Affaire d’origine'), h('div', { class: 'prop-valeur' },
          aff ? lienAffaire(aff) : h('span', { class: 'aide' }, 'Affaire introuvable'),
          h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', 'data-action': 'detacher-affaire', onclick: () => retirerAvecAnnulation({
            titre: 'Détacher l’affaire ?', message: 'Le projet et l’affaire sont conservés, seul le lien entre eux disparaît.', libelleOk: 'Détacher', messageErreur: 'Détachement impossible',
            faire: () => D.delierProjet(p.id), defaire: () => D.lierProjet(p.affaireId, p.id), messageFait: 'Affaire détachée' }) }, 'Détacher'))) : null,
        h('div', { class: 'prop' }, h('span', { class: 'prop-libelle' }, 'Personne'), h('div', { class: 'prop-valeur' }, selPersonne.element)),
        h('div', { class: 'prop' }, h('span', { class: 'prop-libelle' }, 'Organisation'), h('div', { class: 'prop-valeur' }, selOrg.element)),
        champPropriete({ libelle: 'Offre', valeur: p.offreId || '', type: 'select', options: offres.map((x) => ({ valeur: x.id, libelle: x.nom })), surEnregistrer: (v) => D.majProjet(p.id, { offreId: v || null }) }).element,
        h('div', { class: 'prop', dataset: { prop: 'avancement' } }, h('span', { class: 'prop-libelle' }, 'Avancement'), zoneAvancement),
        p.modeleId ? h('div', { class: 'prop', dataset: { prop: 'modele' } }, h('span', { class: 'prop-libelle' }, 'Modèle'), h('div', { class: 'prop-valeur' },
          D.modele(p.modeleId) ? h('a', { class: 'prop-lien', href: cheminModele(p.modeleId) }, D.modele(p.modeleId).nom) : h('span', { class: 'aide' }, 'Modèle supprimé'))) : null,
        h('div', { class: 'prop', dataset: { prop: 'phase' } }, h('span', { class: 'prop-libelle' }, 'Phase'), h('div', { class: 'prop-valeur' }, selectPhase)),
        champPropriete({ libelle: 'Début', valeur: p.dateDebut || '', type: 'date', surEnregistrer: enregistrerDate('dateDebut') }).element,
        champPropriete({ libelle: 'Fin prévue', valeur: p.dateFin || '', type: 'date', surEnregistrer: enregistrerDate('dateFin') }).element),
    });

    // ---- Détails
    const lanceurs = creerLanceurs({
      fiche: p, typeFiche: 'projet', nomSuggere: p.titre,
      enregistrer: (patch) => D.majProjet(p.id, patch),
    });

    // ---- Tâches
    const taches = sectionTaches(p);
    majTaches = () => { taches.majListe(); rendreAvancement(); };

    // ---- Factures (un chantier interne n'en a en général pas, mais la section reste là : on peut en ajouter)
    const factures = P.suiviPaiementsActif(cfg()) ? sectionFactures(p) : null; // option « Suivi des paiements » éteinte : pas de section Factures
    majFactures = () => factures?.majListe();

    // ---- Documents de l'affaire : montrés ici, pas déplacés (ils restent sur l'affaire)
    const documentsAffaire = aff?.documents || [];
    const sectionDocumentsAffaire = aff && documentsAffaire.length ? h('div', { class: 'pile', dataset: { section: 'projet-documents-affaire' } },
      h('div', { class: 'onglet-documents-tete' }, h('h2', { class: 'sous-titre' }, 'Documents de l’affaire'), h('span', { class: 'section-compteur' }, String(documentsAffaire.length))),
      h('p', { class: 'aide' }, 'Ces documents restent sur l’affaire : ', lienAffaire(aff), '.'),
      h('ul', { class: 'liste-simple' }, documentsAffaire.map((d, i) => h('li', { class: 'ligne-simple' }, icone('link', { taille: 14 }),
        boutonEtoile({ favori: d.favori === true, libelle: d.libelle, surBascule: () => CRM.majAffaire(aff.id, L.basculerFavoriDocument(aff, i)) }),
        h('a', { href: d.url, target: '_blank', rel: 'noopener noreferrer' }, d.libelle))))) : null;
    // Documents : onglet à droite (à côté d'Activité et Notes), avec le dossier de travail et, plus bas, les documents de l'affaire liée.
    // (Le projet n'a plus de section « Détails » : le dossier de travail était son seul contenu.)
    const documents = sectionLiensEtDocuments({ id: 'projet-documents', typeFiche: 'projet', entite: p, courant: () => D.projet(p.id) || p, enregistrer: (patch) => D.majProjet(p.id, patch),
      avant: [h('div', { class: 'proprietes' }, lanceurs.dossier)], apres: [sectionDocumentsAffaire] });

    // Le panneau suit l'affaire liée : il est refait quand le projet est lié ou détaché.
    if (panneau && panneauAffaireId !== (p.affaireId || null)) { panneau.arreter(); panneau = null; }
    if (!panneau) {
      panneauAffaireId = p.affaireId || null;
      panneau = panneauActivite({
        lien: { projetId: p.id }, liensCreation: () => P.liensProjet(D.projet(p.id) || p),
        avecDocuments: true,
        typesActivite: ['appel', 'rendez_vous', 'email'], // pas de « Tâche » libre : un projet a sa section Tâches
        affaireLiee: panneauAffaireId ? { affaireId: panneauAffaireId, fusionnerNotes: (notes, notesAffaire) => P.notesDuProjet(notes, notesAffaire, p.id) } : null,
      });
    }
    panneau.majDocuments(documents);
    remplir(racine, gabaritFiche({ entete, gauche: [description, resume.element, taches.element, factures?.element].filter(Boolean), droite: panneau.element }));
  }

  function reconstruire() {
    const p = D.projet(id);
    if (!p) { introuvable(); return; }
    construire(p);
  }
  const rafraichir = planifier(() => {
    if (!saisieEnCours(racine)) { reconstruire(); return; }
    majSelecteurs?.();
    majLiens?.(); // les liens personne / organisation du haut suivent le choix fait dans le Résumé
    majFactures?.();
    majTaches?.(); // une saisie est en cours : la fiche n'est pas refaite, mais la liste des tâches suit (une tâche ajoutée apparaît tout de suite)
  });
  reconstruire();
  const arrets = [D.surChangement(rafraichir), CRM.surChangement(rafraichir)];
  return () => { arrets.forEach((f) => f()); panneau?.arreter(); };
}
