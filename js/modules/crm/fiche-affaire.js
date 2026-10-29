// Fiche d'une affaire : barre des étapes, résumé, détails ; à droite : activité, notes et documents (onglets), points clés, historique.
import { h, icone, remplir, ouvrirMenu, toast, dialogue, confirmer } from '../../os/ui.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import {
  liensEntete, afficherSelecteur, sectionRepliable, champPropriete, selecteurPersonne, selecteurOrganisation, titreEditable, selectProprietaire, gabaritFiche,
  lienRetour, saisieEnCours, pastilleStatut, etatVide, planifier, iconeInfo, EXPLICATION_STATUT_AFFAIRE, pastillesExternes,
} from './composants.js';
import { surChangementPastilles, ongletsDeAffaire, actionDeAffaire } from './pastilles-externes.js';
import { panneauActivite } from './activites.js';
import { creerOngletFichiers } from './fichiers-onglet.js';
import { creerLanceurs } from './lanceurs.js';
import { retirerAvecAnnulation } from '../../os/retrait.js';
import { sectionLiensEtDocuments } from './liens-documents.js';
import { changerEtapeAvecBoites, ouvrirPerdue, demanderSuppressionAffaire } from './affaires.js';
import * as PD from '../projets/donnees.js';
import * as P from '../projets/logique.js';
import { carteProjetMini } from '../projets/composants.js';
import { ouvrirCreationProjetDepuisAffaire } from '../projets/projets.js';

/** Un refus de règle montre son message ; toute autre erreur reste « impossible ». */
const messageErreur = (e, defaut) => (e?.saisie ? e.message : defaut);

/** Choisir parmi les projets sans affaire celui qu'on lie : la liste est proposée dans une fenêtre. */
async function ouvrirLiaisonProjet(a) {
  const liables = P.projetsLiables(PD.etat.projets);
  if (!liables.length) { toast('Aucun projet sans affaire à lier. Crée-en un avec « Créer le projet ».', { type: 'erreur' }); return false; }
  const choix = h('select', { class: 'champ', 'aria-label': 'Projet à lier', autofocus: true }, liables.map((p) => h('option', { value: p.id }, p.titre)));
  const r = await dialogue({
    titre: 'Lier un projet existant',
    contenu: h('div', { class: 'pile' }, h('p', { class: 'aide' }, 'Seuls les projets qui n’ont pas encore d’affaire sont proposés. Le projet garde ses informations ; ce qui lui manque est repris de l’affaire.'),
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Projet'), choix)),
    boutons: [{ libelle: 'Annuler', valeur: false }, {
      libelle: 'Lier', valeur: true, style: 'principal',
      avantFermeture: async () => {
        try { await PD.lierProjet(a.id, choix.value); return true; } catch (e) { console.warn(e); toast(messageErreur(e, 'Liaison impossible'), { type: 'erreur' }); return false; }
      },
    }],
  });
  if (r) toast('Projet lié');
  return !!r;
}

export function rendreFicheAffaire(conteneur, id) {
  let panneau = null;
  let majSelecteurs = null; // met à jour l'affichage des cellules Personne / Organisation du Résumé (sans écrire)
  let barreEtapes = null; // la bande des étapes sous le titre : redessinée seule quand la fiche n'est pas refaite (la liste « Étape » a le focus)
  let majLiens = null; // redessine seulement les liens personne / organisation de l'en-tête
  const racine = h('div', { class: 'fiche-conteneur' });
  conteneur.append(racine);
  // Onglet « Documents » (fichiers rangés chez nous) : créé une fois pour la fiche, placé après les onglets des autres modules (Devis).
  const fichiers = creerOngletFichiers({ cibleType: 'affaire', cibleId: id, surChangement: () => panneau?.majOngletsExternes() });

  function introuvable() {
    remplir(racine, h('div', { class: 'page' }, lienRetour('#/crm/affaires', 'Affaires'),
      etatVide(D.estPret() ? 'Cette affaire n’existe plus.' : 'Chargement…')));
  }

  function barreDesEtapes(a) {
    const etapes = L.etapesActives(D.etat.config);
    const index = etapes.findIndex((e) => e.id === a.etape);
    const vivante = L.estVivante(a);
    return h('ol', { class: `barre-etapes-fiche${vivante ? '' : ' inactive'}`, 'aria-label': 'Étapes de l’affaire' },
      etapes.map((e, i) => h('li', { class: i <= index ? 'passee' : '', style: { '--couleur': e.couleur } },
        // Simple indicateur : on change l'étape avec la liste « Étape » du Résumé (ou « Perdue » ; la dernière étape = affaire gagnée).
        h('span', { class: `etape${i === index ? ' courante' : ''}`, 'aria-current': i === index && vivante ? 'step' : null, dataset: { etape: e.id }, title: i === index ? `Étape actuelle : ${e.libelle}` : e.libelle }, e.libelle),
        iconeInfo(e.description, e.libelle))));
  }

  function construire(a) {
    const liens = liensEntete(() => D.affaire(a.id) || a);
    majLiens = liens.maj;
    const vivante = L.estVivante(a);
    const titre = titreEditable({ valeur: a.titre, libelle: 'Titre', surEnregistrer: (v) => D.majAffaire(a.id, { titre: v }) });
    const montant = champPropriete({ libelle: 'Montant', valeur: a.montant ?? '', type: 'nombre', pas: '0.01', formater: (v) => L.formatEuros(v), fantome: L.formatEuros(999), surEnregistrer: (v) => D.majAffaire(a.id, { montant: v }) });
    const menu = h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Plus d’actions', 'data-action': 'menu-fiche',
      onclick: (e) => ouvrirMenu(e.currentTarget, [
        ...(a.statut === 'perdue' ? [{ libelle: 'Rouvrir', icone: 'rotate-ccw', action: () => D.rouvrir(a.id) }] : []),
        { libelle: a.archive ? 'Désarchiver' : 'Archiver', icone: a.archive ? 'archive-restore' : 'archive', action: () => D.archiverAffaire(a.id, !a.archive) },
        { libelle: 'Supprimer définitivement…', icone: 'trash-2', danger: true, action: () => demanderSuppressionAffaire(a) },
      ]) }, icone('ellipsis', { taille: 20 }));
    // Action d'un module (ex. « Créer un devis ») : le bouton jaune de la page tant que l'affaire est ouverte ; gagnée (« Créer le projet » est jaune) ou perdue (« Rouvrir » est jaune), l'action reste en contour.
    const externe = actionDeAffaire(a.id);
    const boutonExterne = externe ? h('button', { type: 'button', class: `bouton ${L.statutAffiche(a) === 'ouverte' ? 'bouton-principal' : 'bouton-secondaire'}`, 'data-action': 'action-module', onclick: () => externe.action() }, externe.icone ? icone(externe.icone, { taille: 16 }) : null, externe.libelle) : null;
    const actionsStatut = vivante
      ? [
        boutonExterne,
        h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'perdue', onclick: () => ouvrirPerdue(a) }, 'Perdue'),
      ]
      : [boutonExterne, h('button', { type: 'button', class: 'bouton bouton-principal', 'data-action': 'rouvrir', onclick: () => D.rouvrir(a.id) }, icone('rotate-ccw', { taille: 16 }), 'Rouvrir')];

    const entete = h('header', { class: 'fiche-tete' },
      lienRetour('#/crm/affaires', 'Affaires'),
      h('div', { class: 'fiche-tete-ligne' },
        h('div', { class: 'fiche-titre' }, titre,
          h('div', { class: 'fiche-sous' }, pastilleStatut(L.statutAffiche(a)), iconeInfo(EXPLICATION_STATUT_AFFAIRE[L.statutAffiche(a)], 'État de l’affaire'),
            a.statut === 'perdue' ? h('span', { class: 'aide' }, `${a.raisonPerdue}${a.raisonPerdueDetail ? ` : ${a.raisonPerdueDetail}` : ''}`) : null,
            a.archive ? h('span', { class: 'badge-archive' }, 'Archivée') : null,
            ...pastillesExternes(a.id),
            liens.element)),
        // Le montant et les boutons forment une seule zone : même axe vertical, même espace entre voisins.
        h('div', { class: 'fiche-tete-droite' },
          h('div', { class: 'fiche-montant' }, montant.element),
          h('div', { class: 'fiche-actions' }, actionsStatut, menu))),
      (barreEtapes = barreDesEtapes(a)));

    // ---- Résumé
    // Retirer (croix) écrit null ; taper dans la cellule ne retire rien (surChoix(null) sans `effacement`).
    const selPersonne = selecteurPersonne({ valeurId: a.personneId, surChoix: async (el, info) => {
      if (!el) { if (info?.effacement && D.affaire(a.id)?.personneId) await D.majAffaire(a.id, { personneId: null }); return; }
      const courant = D.affaire(a.id) || a;
      if (el.id === courant.personneId) return;
      const nouveau = D.personne(el.id);
      await D.majAffaire(a.id, { personneId: el.id, ...(nouveau?.organisationId && !courant.organisationId ? { organisationId: nouveau.organisationId } : {}) });
    } });
    const selOrg = selecteurOrganisation({ valeurId: a.organisationId, surChoix: async (el, info) => {
      if (!el) { if (info?.effacement && D.affaire(a.id)?.organisationId) await D.majAffaire(a.id, { organisationId: null }); return; }
      if (el.id !== (D.affaire(a.id) || a).organisationId) await D.majAffaire(a.id, { organisationId: el.id });
    } });
    majSelecteurs = () => {
      const c = D.affaire(a.id) || a;
      afficherSelecteur(selPersonne, c.personneId ? D.personne(c.personneId) : null, (x) => ({ id: x.id, libelle: x.nom }));
      afficherSelecteur(selOrg, c.organisationId ? D.organisation(c.organisationId) : null, (x) => ({ id: x.id, libelle: x.nom }));
    };
    const offres = D.etat.offres.filter((x) => x.actif !== false || x.id === a.offreId);
    /** L'étape, modifiable comme la phase d'un projet : même fonction que le Kanban (boîtes de dialogue, célébration, action suggérée). */
    const selectEtape = h('select', { class: 'champ', 'aria-label': 'Étape', 'data-action': 'choisir-etape',
      onchange: async () => {
        await changerEtapeAvecBoites(a, selectEtape.value);
        selectEtape.value = D.affaire(a.id)?.etape ?? a.etape; // refus ou annulation : on revient à l'étape réelle
      } }, L.etapesActives(D.etat.config).map((e) => h('option', { value: e.id, selected: e.id === a.etape }, e.libelle)));
    const resume = sectionRepliable({
      id: 'affaire-resume', titre: 'Résumé',
      contenu: h('div', { class: 'proprietes' },
        h('div', { class: 'prop' }, h('span', { class: 'prop-libelle' }, 'Personne'), h('div', { class: 'prop-valeur' }, selPersonne.element)),
        h('div', { class: 'prop' }, h('span', { class: 'prop-libelle' }, 'Organisation'), h('div', { class: 'prop-valeur' }, selOrg.element)),
        champPropriete({ libelle: 'Offre', valeur: a.offreId || '', type: 'select', options: offres.map((x) => ({ valeur: x.id, libelle: x.nom })), surEnregistrer: (v) => D.majAffaire(a.id, { offreId: v || null }) }).element,
        champPropriete({ libelle: 'Priorité', valeur: a.priorite || 'tiede', type: 'select', options: L.PRIORITES.map((x) => ({ valeur: x.id, libelle: x.libelle })), surEnregistrer: (v) => D.majAffaire(a.id, { priorite: v || 'tiede' }) }).element,
        h('div', { class: 'prop', dataset: { prop: 'etape' } }, h('span', { class: 'prop-libelle' }, 'Étape'), h('div', { class: 'prop-valeur' }, selectEtape)),
        selectProprietaire({ valeur: a.proprietaire, surChoix: (v) => D.majAffaire(a.id, { proprietaire: v }) })),
    });

    // ---- Projet (affaire gagnée : créer ou lier ; au plus un projet par affaire)
    const projetLie = P.projetLieAAffaire(PD.etat.projets, a);
    const sectionProjet = (projetLie || a.statut === 'gagnee') ? sectionRepliable({
      id: 'affaire-projet', titre: 'Projet',
      contenu: h('div', { class: 'pile' },
        projetLie
          ? h('div', { class: 'pile' }, carteProjetMini(projetLie),
            h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', 'data-action': 'detacher-projet', onclick: () => retirerAvecAnnulation({
              titre: 'Détacher le projet ?', message: 'Le projet et l’affaire sont conservés, seul le lien entre eux disparaît.', libelleOk: 'Détacher', messageErreur: 'Détachement impossible',
              faire: () => PD.delierProjet(projetLie.id), defaire: () => PD.lierProjet(a.id, projetLie.id), messageFait: 'Projet détaché' }) }, icone('x', { taille: 14 }), 'Détacher le projet'))
          : (a.statut === 'gagnee' ? h('div', { class: 'pile' },
          h('p', { class: 'aide' }, 'Cette affaire est gagnée : crée son projet pour suivre le travail, ou lie un projet qui existe déjà. Elle peut aussi rester sans projet.'),
          h('div', { class: 'ligne-boutons' },
            h('button', { type: 'button', class: 'bouton bouton-principal bouton-petit', 'data-action': 'creer-projet', onclick: () => ouvrirCreationProjetDepuisAffaire(a) }, icone('folder-kanban', { taille: 14 }), 'Créer le projet'),
            h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', 'data-action': 'lier-projet', onclick: () => ouvrirLiaisonProjet(a) }, icone('link', { taille: 14 }), 'Lier un projet'))) : null)),
    }) : null;

    // ---- Détails
    const lanceurs = creerLanceurs({ fiche: a, typeFiche: 'affaire', nomSuggere: a.titre, enregistrer: (patch) => D.majAffaire(a.id, patch) });
    const details = sectionRepliable({
      id: 'affaire-details', titre: 'Détails',
      contenu: h('div', { class: 'proprietes' },
        champPropriete({ libelle: 'Besoin identifié', valeur: a.besoin || '', type: 'zone', surEnregistrer: (v) => D.majAffaire(a.id, { besoin: v }) }).element,
        champPropriete({ libelle: 'Durée (jours)', valeur: a.dureeJours ?? '', type: 'nombre', pas: '0.5', surEnregistrer: (v) => D.majAffaire(a.id, { dureeJours: v }) }).element,
        champPropriete({ libelle: 'Source', valeur: a.source || '', type: 'liste', autoriserCreation: false, fournir: () => D.etat.sources, aideListeVide: 'Aucune source dans la liste : ajoute-en dans Réglages, Sources.',
          surEnregistrer: (v) => D.majAffaire(a.id, { source: v }) }).element,
        lanceurs.github),
    });

    // ---- Documents : onglet à droite (à côté d'Activité et Notes), avec le dossier de travail ; même composant que la fiche projet
    const documents = sectionLiensEtDocuments({ id: 'affaire-documents', typeFiche: 'affaire', entite: a, courant: () => D.affaire(a.id) || a, enregistrer: (patch) => D.majAffaire(a.id, patch),
      avant: [h('div', { class: 'proprietes' }, lanceurs.dossier)] });

    if (!panneau) panneau = panneauActivite({ lien: { affaireId: a.id }, liensCreation: () => L.liensAffaire(D.affaire(a.id) || a), avecDocuments: true, ongletsExternes: () => [...ongletsDeAffaire(a.id), fichiers.onglet()] });
    panneau.majDocuments(documents);
    panneau.majOngletsExternes();
    remplir(racine, gabaritFiche({ entete, gauche: [resume.element, sectionProjet?.element, details.element].filter(Boolean), droite: panneau.element }));
  }

  function reconstruire() {
    const a = D.affaire(id);
    if (!a) { introuvable(); return; }
    construire(a);
  }
  function majBarreEtapes() {
    const a = D.affaire(id);
    if (!a || !barreEtapes?.isConnected) return;
    const neuve = barreDesEtapes(a);
    barreEtapes.replaceWith(neuve);
    barreEtapes = neuve;
  }
  const rafraichir = planifier(() => {
    if (!saisieEnCours(racine)) { reconstruire(); return; }
    majSelecteurs?.();
    majBarreEtapes();
    panneau?.majOngletsExternes(); // boutons, compteurs et onglet disparu ; un panneau où l'on écrit n'est pas remplacé
    majLiens?.(); // une saisie est en cours (le choix dans le Résumé garde le focus) : la fiche n'est pas refaite, mais les liens du haut suivent
  });
  reconstruire();
  const arrets = [D.surChangement(rafraichir), PD.surChangement(rafraichir), surChangementPastilles(rafraichir)];
  return () => { arrets.forEach((f) => f()); panneau?.arreter(); fichiers.arreter(); };
}

