// Fiche d'un projet : barre des phases, résumé, détails (GitHub, dossier), documents ; notes et historique à droite.
import { h, icone, remplir, ouvrirMenu, toast, confirmer } from '../../os/ui.js';
import * as CRM from '../crm/donnees.js';
import * as L from '../crm/logique.js';
import {
  lienPersonne, lienOrganisation, lienAffaire, sectionRepliable, champPropriete, selecteurPersonne, selecteurOrganisation, titreEditable, selectProprietaire,
  gabaritFiche, lienRetour, saisieEnCours, etatVide, planifier,
} from '../crm/composants.js';
import { panneauActivite } from '../crm/activites.js';
import { creerLanceurs } from '../crm/lanceurs.js';
import * as D from './donnees.js';
import * as P from './logique.js';
import { pastilleStatutProjet, pastillePhase, terminerProjet, mettreEnPause, reprendre, rouvrir, demanderSuppressionProjet } from './projets.js';

export function rendreFicheProjet(conteneur, id) {
  let panneau = null;
  let panneauAffaireId = null;
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
        h('button', { type: 'button', class: `etape${i === index ? ' courante' : ''}`, 'aria-current': i === index && vivant ? 'step' : null, dataset: { phase: ph.id },
          onclick: () => D.changerPhase(p.id, ph.id) }, ph.libelle))));
  }

  function construire(p) {
    const pers = CRM.personne(p.personneId);
    const org = CRM.organisation(p.organisationId);
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
          h('div', { class: 'fiche-sous' }, pastilleStatutProjet(p), p.archive ? h('span', { class: 'badge-archive' }, 'Archivé') : null,
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
    const resume = sectionRepliable({
      id: 'projet-resume', titre: 'Résumé',
      contenu: h('div', { class: 'proprietes' },
        h('div', { class: 'prop', dataset: { prop: 'affaire' } }, h('span', { class: 'prop-libelle' }, 'Affaire'), h('div', { class: 'prop-valeur' },
          aff ? lienAffaire(aff) : h('span', { class: 'aide' }, p.affaireId ? 'Affaire introuvable' : 'Aucune affaire liée'),
          p.affaireId ? h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', 'data-action': 'detacher-affaire', onclick: async () => {
            if (!(await confirmer('Détacher l’affaire ?', 'Le projet et l’affaire sont conservés, seul le lien entre eux disparaît.', { libelleOk: 'Détacher' }))) return;
            try { await D.delierProjet(p.id); toast('Affaire détachée'); } catch (e) { console.warn(e); toast(e?.saisie ? e.message : 'Détachement impossible', { type: 'erreur' }); }
          } }, 'Détacher') : null)),
        h('div', { class: 'prop' }, h('span', { class: 'prop-libelle' }, 'Personne'), h('div', { class: 'prop-valeur' }, selPersonne.element)),
        h('div', { class: 'prop' }, h('span', { class: 'prop-libelle' }, 'Organisation'), h('div', { class: 'prop-valeur' }, selOrg.element)),
        champPropriete({ libelle: 'Offre', valeur: p.offreId || '', type: 'select', options: offres.map((x) => ({ valeur: x.id, libelle: x.nom })), surEnregistrer: (v) => D.majProjet(p.id, { offreId: v || null }) }).element,
        h('div', { class: 'prop' }, h('span', { class: 'prop-libelle' }, 'Phase'), h('div', { class: 'prop-valeur' }, pastillePhase(p.phase))),
        h('div', { class: 'prop' }, h('span', { class: 'prop-libelle' }, 'Statut'), h('div', { class: 'prop-valeur' }, pastilleStatutProjet(p))),
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
          h('a', { href: d.url, target: '_blank', rel: 'noopener noreferrer' }, d.libelle),
          h('button', { type: 'button', class: 'bouton-icone', 'aria-label': `Retirer ${d.libelle}`, onclick: () => D.majProjet(p.id, L.supprimerDocument(p, i)) }, icone('x', { taille: 14 }))))) : null,
        h('div', { class: 'ligne-ajout' }, champLibelle, champUrl,
          h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', 'data-action': 'ajouter-document', onclick: async () => {
            const r = L.ajouterDocument(p, champLibelle.value, champUrl.value);
            if (r.erreurs.url) { toast(r.erreurs.url, { type: 'erreur' }); champUrl.classList.add('invalide'); return; }
            await D.majProjet(p.id, r.patch);
          } }, 'Ajouter'))),
    });

    // ---- Documents de l'affaire : montrés ici, pas déplacés (ils restent sur l'affaire)
    const documentsAffaire = aff?.documents || [];
    const sectionDocumentsAffaire = aff && documentsAffaire.length ? sectionRepliable({
      id: 'projet-documents-affaire', titre: 'Documents de l’affaire', compteur: documentsAffaire.length,
      contenu: h('div', { class: 'pile' },
        h('p', { class: 'aide' }, 'Ces documents restent sur l’affaire : ', lienAffaire(aff), '.'),
        h('ul', { class: 'liste-simple' }, documentsAffaire.map((d) => h('li', { class: 'ligne-simple' }, icone('link', { taille: 14 }),
          h('a', { href: d.url, target: '_blank', rel: 'noopener noreferrer' }, d.libelle))))),
    }) : null;

    // Le panneau suit l'affaire liée : il est refait quand le projet est lié ou détaché.
    if (panneau && panneauAffaireId !== (p.affaireId || null)) { panneau.arreter(); panneau = null; }
    if (!panneau) {
      panneauAffaireId = p.affaireId || null;
      panneau = panneauActivite({
        lien: { projetId: p.id }, liensCreation: () => P.liensProjet(D.projet(p.id) || p), avecActivites: false,
        affaireLiee: panneauAffaireId ? { affaireId: panneauAffaireId, fusionnerNotes: (notes, notesAffaire) => P.notesDuProjet(notes, notesAffaire, p.id) } : null,
      });
    }
    remplir(racine, gabaritFiche({ entete, gauche: [resume.element, details.element, sectionDocuments.element, sectionDocumentsAffaire?.element].filter(Boolean), droite: panneau.element }));
  }

  function reconstruire() {
    const p = D.projet(id);
    if (!p) { introuvable(); return; }
    construire(p);
  }
  const rafraichir = planifier(() => { if (!saisieEnCours(racine)) reconstruire(); });
  reconstruire();
  const arrets = [D.surChangement(rafraichir), CRM.surChangement(rafraichir)];
  return () => { arrets.forEach((f) => f()); panneau?.arreter(); };
}
