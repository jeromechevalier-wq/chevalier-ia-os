// Fiche d'un projet : barre des phases, résumé, détails (GitHub, dossier), documents ; notes et historique à droite.
import { h, icone, remplir, ouvrirMenu, toast, confirmer } from '../../os/ui.js';
import * as CRM from '../crm/donnees.js';
import * as L from '../crm/logique.js';
import {
  lienPersonne, lienOrganisation, lienAffaire, sectionRepliable, champPropriete, selecteurPersonne, selecteurOrganisation, titreEditable, selectProprietaire,
  gabaritFiche, lienRetour, saisieEnCours, etatVide, planifier, boutonEtoile,
} from '../crm/composants.js';
import { panneauActivite } from '../crm/activites.js';
import { creerLanceurs } from '../crm/lanceurs.js';
import * as D from './donnees.js';
import * as P from './logique.js';
import { sectionTaches } from './taches.js';
import { sectionFactures } from './factures.js';
import { cheminModele } from './modeles.js';
import { anneauProgression, cheminProjet } from './composants.js';
import { pastilleStatutProjet, pastilleImpaye, terminerProjet, changerPhaseProjet, extraireValeur, mettreEnPause, reprendre, rouvrir, demanderSuppressionProjet } from './projets.js';

export function rendreFicheProjet(conteneur, id) {
  let panneau = null;
  let panneauAffaireId = null;
  let majFactures = null; // redessine la liste des factures seule, pendant une saisie dans le formulaire d'ajout
  let majTaches = null; // redessine la liste des tâches seule, quand on est en train de taper ailleurs dans la fiche
  const racine = h('div', { class: 'fiche-conteneur' });
  conteneur.append(racine);

  function introuvable() {
    remplir(racine, h('div', { class: 'page' }, lienRetour('#/projets/projets', 'Projets'),
      etatVide(D.estPret() && CRM.estPret() ? 'Ce projet n’existe plus.' : 'Chargement…')));
  }

  function barreDesPhases(p) {
    const index = P.PHASES.findIndex((x) => x.id === p.phase);
    const vivant = P.estProjetActif(p);
    return h('ol', { class: `barre-etapes-fiche${vivant ? '' : ' inactive'}`, 'aria-label': 'Phases du projet' },
      P.PHASES.map((ph, i) => h('li', { class: i <= index ? 'passee' : '', style: { '--couleur': ph.couleur } },
        h('button', { type: 'button', class: `etape${i === index ? ' courante' : ''}`, 'aria-current': i === index && vivant ? 'step' : null, dataset: { phase: ph.id }, title: i === index ? `Phase actuelle : ${ph.libelle}` : `Passer en phase ${ph.libelle}`,
          onclick: () => changerPhaseProjet(p, ph.id) }, ph.libelle))));
  }

  function construire(p) {
    const pers = CRM.personne(p.personneId);
    const org = CRM.organisation(p.organisationId);
    const aff = p.affaireId ? CRM.affaire(p.affaireId) : null;
    const extraction = P.estExtraction(p);
    const sourceProjet = p.projetSourceId ? D.projet(p.projetSourceId) : null;
    const projetExtraction = P.extractionDuProjet(D.etat.projets, p.id);
    const termine = P.estProjetTermine(p);
    const titre = titreEditable({ valeur: p.titre, libelle: 'Titre', surEnregistrer: (v) => D.majProjet(p.id, { titre: v }) });
    const menu = h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Plus d’actions', 'data-action': 'menu-fiche',
      onclick: (e) => ouvrirMenu(e.currentTarget, [
        ...(termine ? [{ libelle: 'Rouvrir', icone: 'rotate-ccw', action: () => rouvrir(p) }] : []),
        { libelle: p.archive ? 'Désarchiver' : 'Archiver', icone: p.archive ? 'archive-restore' : 'archive', action: () => D.archiver(p.id, !p.archive) },
        { libelle: 'Supprimer définitivement…', icone: 'trash-2', danger: true, action: () => demanderSuppressionProjet(p) },
      ]) }, icone('ellipsis', { taille: 20 }));
    // Bouton manuel (07/10/2026) : on n'attend pas la fin du projet pour extraire sa valeur ; une seule extraction par projet (sinon on ouvre celle qui existe).
    const boutonExtraire = extraction ? null : h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'extraire',
      onclick: () => extraireValeur(p) }, icone('sparkles', { taille: 16 }), projetExtraction ? 'Ouvrir l’extraction' : 'Extraire la valeur');
    const actions = termine
      ? [h('button', { type: 'button', class: 'bouton bouton-principal', 'data-action': 'rouvrir', onclick: () => rouvrir(p) }, icone('rotate-ccw', { taille: 16 }), 'Rouvrir'), boutonExtraire]
      : [
        h('button', { type: 'button', class: 'bouton bouton-principal', 'data-action': 'terminer', onclick: () => terminerProjet(p) }, icone('circle-check', { taille: 16 }), 'Terminer'),
        p.statut === 'en_pause'
          ? h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'reprendre', onclick: () => reprendre(p) }, 'Reprendre')
          : h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'en-pause', onclick: () => mettreEnPause(p) }, 'En pause'),
        boutonExtraire,
      ];

    const entete = h('header', { class: 'fiche-tete' },
      lienRetour('#/projets/projets', 'Projets'),
      h('div', { class: 'fiche-tete-ligne' },
        h('div', { class: 'fiche-titre' }, titre,
          h('div', { class: 'fiche-sous' }, pastilleStatutProjet(p), pastilleImpaye(p), p.archive ? h('span', { class: 'badge-archive' }, 'Archivé') : null,
            p.nature === 'extraction' ? h('span', { class: 'badge-nature' }, 'Extraction') : null,
            pers ? h('span', {}, icone('user', { taille: 14 }), lienPersonne(pers)) : null, org ? h('span', {}, icone('building-2', { taille: 14 }), lienOrganisation(org)) : null,
            selectProprietaire({ valeur: p.proprietaire, surChoix: (v) => D.majProjet(p.id, { proprietaire: v }) }))),
        h('div', { class: 'fiche-actions' }, actions, menu)),
      barreDesPhases(p));

    // ---- Résumé
    const selPersonne = selecteurPersonne({ valeurId: p.personneId, surChoix: async (el) => {
      if (!el || el.id === p.personneId) return;
      const nouveau = CRM.personne(el.id);
      await D.majProjet(p.id, { personneId: el.id, ...(nouveau?.organisationId && !p.organisationId ? { organisationId: nouveau.organisationId } : {}) });
    } });
    const selOrg = selecteurOrganisation({ valeurId: p.organisationId, surChoix: async (el) => { if (el && el.id !== p.organisationId) await D.majProjet(p.id, { organisationId: el.id }); } });
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
      } }, P.PHASES.map((ph) => h('option', { value: ph.id, selected: ph.id === p.phase }, ph.libelle)));
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
        extraction ? h('div', { class: 'prop', dataset: { prop: 'source' } }, h('span', { class: 'prop-libelle' }, 'Source'), h('div', { class: 'prop-valeur' },
          aff ? h('span', {}, 'Affaire : ', lienAffaire(aff))
            : (sourceProjet ? h('span', {}, 'Projet : ', h('a', { class: 'prop-lien', href: cheminProjet(sourceProjet.id) }, sourceProjet.titre))
              : h('span', { class: 'aide' }, 'Source supprimée')))) : null,
        extraction && p.raisonPerdue ? h('div', { class: 'prop', dataset: { prop: 'raison-perte' } }, h('span', { class: 'prop-libelle' }, 'Raison de la perte'),
          h('div', { class: 'prop-valeur' }, p.raisonPerdue, p.raisonPerdueDetail ? h('span', { class: 'aide' }, ` : ${p.raisonPerdueDetail}`) : null)) : null,
        !extraction ? h('div', { class: 'prop', dataset: { prop: 'affaire' } }, h('span', { class: 'prop-libelle' }, 'Affaire'), h('div', { class: 'prop-valeur' },
          aff ? lienAffaire(aff) : h('span', { class: 'aide' }, p.affaireId ? 'Affaire introuvable' : 'Aucune affaire liée'),
          p.affaireId ? h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', 'data-action': 'detacher-affaire', onclick: async () => {
            if (!(await confirmer('Détacher l’affaire ?', 'Le projet et l’affaire sont conservés, seul le lien entre eux disparaît.', { libelleOk: 'Détacher' }))) return;
            try { await D.delierProjet(p.id); toast('Affaire détachée'); } catch (e) { console.warn(e); toast(e?.saisie ? e.message : 'Détachement impossible', { type: 'erreur' }); }
          } }, 'Détacher') : null)) : null,
        !extraction && projetExtraction ? h('div', { class: 'prop', dataset: { prop: 'extraction' } }, h('span', { class: 'prop-libelle' }, 'Extraction'), h('div', { class: 'prop-valeur' },
          h('a', { class: 'prop-lien', href: cheminProjet(projetExtraction.id) }, projetExtraction.titre))) : null,
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
      fiche: p, typeFiche: 'projet', organisation: org, personne: pers, affaireOrigine: aff,
      enregistrer: (patch) => D.majProjet(p.id, patch),
    });
    const details = sectionRepliable({ id: 'projet-details', titre: 'Détails', contenu: h('div', { class: 'proprietes' }, lanceurs.github, lanceurs.dossier) });

    // ---- Documents
    const champLibelle = h('input', { class: 'champ', type: 'text', 'aria-label': 'Libellé du document', placeholder: 'Libellé (ex. Devis)' });
    const champUrl = h('input', { class: 'champ', type: 'url', 'aria-label': 'Adresse du document (lien Google Drive)', placeholder: 'Lien Google Drive' });
    const documents = p.documents || [];
    const sectionDocuments = sectionRepliable({
      id: 'projet-documents', titre: 'Documents', compteur: documents.length,
      contenu: h('div', { class: 'pile' },
        documents.length ? h('ul', { class: 'liste-simple' }, documents.map((d, i) => h('li', { class: 'ligne-simple' }, icone('link', { taille: 14 }),
          boutonEtoile({ favori: d.favori === true, libelle: d.libelle, surBascule: () => D.majProjet(p.id, L.basculerFavoriDocument(p, i)) }),
          h('a', { href: d.url, target: '_blank', rel: 'noopener noreferrer' }, d.libelle),
          h('button', { type: 'button', class: 'bouton-icone', 'aria-label': `Retirer ${d.libelle}`, onclick: () => D.majProjet(p.id, L.supprimerDocument(p, i)) }, icone('x', { taille: 14 }))))) : null,
        h('div', { class: 'ligne-ajout' }, champLibelle, champUrl,
          h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', 'data-action': 'ajouter-document', onclick: async () => {
            const r = L.ajouterDocument(p, champLibelle.value, champUrl.value);
            if (r.erreurs.url) { toast(r.erreurs.url, { type: 'erreur' }); champUrl.classList.add('invalide'); return; }
            await D.majProjet(p.id, r.patch);
          } }, 'Ajouter'))),
    });

    // ---- Tâches
    const taches = sectionTaches(p);
    majTaches = () => { taches.majListe(); rendreAvancement(); };

    // ---- Factures (projets de livraison ; une extraction ou un chantier interne n'en a en général pas, mais la section reste là : on peut en ajouter)
    const factures = sectionFactures(p);
    majFactures = () => factures.majListe();

    // ---- Documents de l'affaire : montrés ici, pas déplacés (ils restent sur l'affaire)
    const documentsAffaire = aff?.documents || [];
    const sectionDocumentsAffaire = aff && documentsAffaire.length ? sectionRepliable({
      id: 'projet-documents-affaire', titre: 'Documents de l’affaire', compteur: documentsAffaire.length,
      contenu: h('div', { class: 'pile' },
        h('p', { class: 'aide' }, 'Ces documents restent sur l’affaire : ', lienAffaire(aff), '.'),
        h('ul', { class: 'liste-simple' }, documentsAffaire.map((d, i) => h('li', { class: 'ligne-simple' }, icone('link', { taille: 14 }),
          boutonEtoile({ favori: d.favori === true, libelle: d.libelle, surBascule: () => CRM.majAffaire(aff.id, L.basculerFavoriDocument(aff, i)) }),
          h('a', { href: d.url, target: '_blank', rel: 'noopener noreferrer' }, d.libelle))))),
    }) : null;

    // Le panneau suit l'affaire liée : il est refait quand le projet est lié ou détaché.
    if (panneau && panneauAffaireId !== (p.affaireId || null)) { panneau.arreter(); panneau = null; }
    if (!panneau) {
      panneauAffaireId = p.affaireId || null;
      panneau = panneauActivite({
        lien: { projetId: p.id }, liensCreation: () => P.liensProjet(D.projet(p.id) || p),
        typesActivite: ['appel', 'rendez_vous', 'email'], // pas de « Tâche » libre : un projet a sa section Tâches
        affaireLiee: panneauAffaireId ? { affaireId: panneauAffaireId, fusionnerNotes: (notes, notesAffaire) => P.notesDuProjet(notes, notesAffaire, p.id) } : null,
      });
    }
    remplir(racine, gabaritFiche({ entete, gauche: [resume.element, taches.element, factures.element, details.element, sectionDocuments.element, sectionDocumentsAffaire?.element].filter(Boolean), droite: panneau.element }));
  }

  function reconstruire() {
    const p = D.projet(id);
    if (!p) { introuvable(); return; }
    construire(p);
  }
  const rafraichir = planifier(() => {
    if (!saisieEnCours(racine)) { reconstruire(); return; }
    majFactures?.();
    majTaches?.(); // une saisie est en cours : la fiche n'est pas refaite, mais la liste des tâches suit (une tâche ajoutée apparaît tout de suite)
  });
  reconstruire();
  const arrets = [D.surChangement(rafraichir), CRM.surChangement(rafraichir)];
  return () => { arrets.forEach((f) => f()); panneau?.arreter(); };
}
