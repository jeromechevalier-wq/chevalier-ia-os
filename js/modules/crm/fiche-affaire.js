// Fiche d'une affaire : barre des étapes, résumé, détails, documents ; activité à droite.
import { h, icone, remplir, ouvrirMenu, toast, dialogue, confirmer } from '../../os/ui.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import {
  lienPersonne, lienOrganisation, sectionRepliable, champPropriete, selecteurPersonne, selecteurOrganisation, titreEditable, selectProprietaire, gabaritFiche,
  lienRetour, saisieEnCours, pastilleStatut, etatVide, planifier, boutonEtoile, iconeInfo,
} from './composants.js';
import { panneauActivite } from './activites.js';
import { creerLanceurs } from './lanceurs.js';
import { changerEtapeAvecBoites, ouvrirPerdue, ouvrirPause, demanderSuppressionAffaire } from './affaires.js';
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
  const racine = h('div', { class: 'fiche-conteneur' });
  conteneur.append(racine);

  function introuvable() {
    remplir(racine, h('div', { class: 'page' }, lienRetour('#/crm/affaires', 'Affaires'),
      etatVide(D.estPret() ? 'Cette affaire n’existe plus.' : 'Chargement…')));
  }

  function barreDesEtapes(a) {
    const etapes = L.etapesActives(D.etat.config);
    const index = etapes.findIndex((e) => e.id === a.etape);
    const vivante = a.statut === 'ouverte' || a.statut === 'gagnee';
    return h('ol', { class: `barre-etapes-fiche${vivante ? '' : ' inactive'}`, 'aria-label': 'Étapes de l’affaire' },
      etapes.map((e, i) => h('li', { class: i <= index ? 'passee' : '', style: { '--couleur': e.couleur } },
        h('button', { type: 'button', class: `etape${i === index ? ' courante' : ''}`, 'aria-current': i === index && vivante ? 'step' : null, dataset: { etape: e.id },
          onclick: () => changerEtapeAvecBoites(a, e.id) }, e.libelle),
        iconeInfo(e.description, e.libelle))));
  }

  function construire(a) {
    const p = D.personne(a.personneId);
    const o = D.organisation(a.organisationId);
    const vivante = a.statut === 'ouverte' || a.statut === 'gagnee';
    const titre = titreEditable({ valeur: a.titre, libelle: 'Titre', surEnregistrer: (v) => D.majAffaire(a.id, { titre: v }) });
    const montant = champPropriete({ libelle: 'Montant', valeur: a.montant ?? '', type: 'nombre', pas: '0.01', formater: (v) => L.formatEuros(v), surEnregistrer: (v) => D.majAffaire(a.id, { montant: v }) });
    const menu = h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Plus d’actions', 'data-action': 'menu-fiche',
      onclick: (e) => ouvrirMenu(e.currentTarget, [
        ...(a.statut === 'perdue' || a.statut === 'en_pause' ? [{ libelle: 'Rouvrir', icone: 'rotate-ccw', action: () => D.rouvrir(a.id) }] : []),
        { libelle: a.archive ? 'Désarchiver' : 'Archiver', icone: a.archive ? 'archive-restore' : 'archive', action: () => D.archiverAffaire(a.id, !a.archive) },
        { libelle: 'Supprimer définitivement…', icone: 'trash-2', danger: true, action: () => demanderSuppressionAffaire(a) },
      ]) }, icone('ellipsis', { taille: 20 }));
    const actionsStatut = vivante
      ? [
        a.statut === 'gagnee' ? null : h('button', { type: 'button', class: 'bouton bouton-principal', 'data-action': 'gagnee', onclick: () => changerEtapeAvecBoites(a, L.etapeGagnee(D.etat.config)) }, icone('trophy', { taille: 16 }), 'Gagnée'),
        h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'perdue', onclick: () => ouvrirPerdue(a) }, 'Perdue'),
        h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'en-pause', onclick: () => ouvrirPause(a) }, 'En pause'),
      ]
      : [h('button', { type: 'button', class: 'bouton bouton-principal', 'data-action': 'rouvrir', onclick: () => D.rouvrir(a.id) }, icone('rotate-ccw', { taille: 16 }), 'Rouvrir')];

    const entete = h('header', { class: 'fiche-tete' },
      lienRetour('#/crm/affaires', 'Affaires'),
      h('div', { class: 'fiche-tete-ligne' },
        h('div', { class: 'fiche-titre' }, titre,
          h('div', { class: 'fiche-sous' }, pastilleStatut(a.statut), a.archive ? h('span', { class: 'badge-archive' }, 'Archivée') : null,
            p ? h('span', {}, icone('user', { taille: 14 }), lienPersonne(p)) : null, o ? h('span', {}, icone('building-2', { taille: 14 }), lienOrganisation(o)) : null,
            selectProprietaire({ valeur: a.proprietaire, surChoix: (v) => D.majAffaire(a.id, { proprietaire: v }) }))),
        h('div', { class: 'fiche-montant' }, montant.element),
        h('div', { class: 'fiche-actions' }, actionsStatut, menu)),
      barreDesEtapes(a));

    // ---- Résumé
    const selPersonne = selecteurPersonne({ valeurId: a.personneId, surChoix: async (el) => {
      if (!el || el.id === a.personneId) return;
      const nouveau = D.personne(el.id);
      await D.majAffaire(a.id, { personneId: el.id, ...(nouveau?.organisationId && !a.organisationId ? { organisationId: nouveau.organisationId } : {}) });
    } });
    const selOrg = selecteurOrganisation({ valeurId: a.organisationId, surChoix: async (el) => { if (el && el.id !== a.organisationId) await D.majAffaire(a.id, { organisationId: el.id }); } });
    const offres = D.etat.offres.filter((x) => x.actif !== false || x.id === a.offreId);
    const resume = sectionRepliable({
      id: 'affaire-resume', titre: 'Résumé',
      contenu: h('div', { class: 'proprietes' },
        h('div', { class: 'prop' }, h('span', { class: 'prop-libelle' }, 'Personne'), h('div', { class: 'prop-valeur' }, selPersonne.element)),
        h('div', { class: 'prop' }, h('span', { class: 'prop-libelle' }, 'Organisation'), h('div', { class: 'prop-valeur' }, selOrg.element)),
        champPropriete({ libelle: 'Offre', valeur: a.offreId || '', type: 'select', options: offres.map((x) => ({ valeur: x.id, libelle: x.nom })), surEnregistrer: (v) => D.majAffaire(a.id, { offreId: v || null }) }).element,
        champPropriete({ libelle: 'Priorité', valeur: a.priorite || 'tiede', type: 'select', options: L.PRIORITES.map((x) => ({ valeur: x.id, libelle: x.libelle })), surEnregistrer: (v) => D.majAffaire(a.id, { priorite: v || 'tiede' }) }).element,
        h('div', { class: 'prop' }, h('span', { class: 'prop-libelle' }, 'Statut'), h('div', { class: 'prop-valeur' }, pastilleStatut(a.statut), a.statut === 'perdue' ? h('span', { class: 'aide' }, ` ${a.raisonPerdue}${a.raisonPerdueDetail ? ` : ${a.raisonPerdueDetail}` : ''}`) : null, a.statut === 'en_pause' ? h('span', { class: 'aide' }, ` jusqu’au ${L.formatJour(a.dateReveil)}`) : null))),
    });

    // ---- Projet (affaire gagnée : créer ou lier ; au plus un projet par affaire)
    const projetLie = P.projetLieAAffaire(PD.etat.projets, a);
    const extraction = D.etat.config.options.extractionValeur ? P.extractionDeLAffaire(PD.etat.projets, a.id) : null; // option « Extraction de valeur » éteinte : rien n'est montré
    const sectionProjet = (projetLie || extraction || a.statut === 'gagnee') ? sectionRepliable({
      id: 'affaire-projet', titre: 'Projet',
      contenu: h('div', { class: 'pile' },
        projetLie
          ? h('div', { class: 'pile' }, carteProjetMini(projetLie),
            h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', 'data-action': 'detacher-projet', onclick: async () => {
              if (!(await confirmer('Détacher le projet ?', 'Le projet et l’affaire sont conservés, seul le lien entre eux disparaît.', { libelleOk: 'Détacher' }))) return;
              try { await PD.delierProjet(projetLie.id); toast('Projet détaché'); } catch (e) { console.warn(e); toast(messageErreur(e, 'Détachement impossible'), { type: 'erreur' }); }
            } }, icone('x', { taille: 14 }), 'Détacher le projet'))
          : (a.statut === 'gagnee' ? h('div', { class: 'pile' },
          h('p', { class: 'aide' }, 'Cette affaire est gagnée : crée son projet pour suivre le travail, ou lie un projet qui existe déjà. Elle peut aussi rester sans projet.'),
          h('div', { class: 'ligne-boutons' },
            h('button', { type: 'button', class: 'bouton bouton-principal bouton-petit', 'data-action': 'creer-projet', onclick: () => ouvrirCreationProjetDepuisAffaire(a) }, icone('folder-kanban', { taille: 14 }), 'Créer le projet'),
            h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', 'data-action': 'lier-projet', onclick: () => ouvrirLiaisonProjet(a) }, icone('link', { taille: 14 }), 'Lier un projet'))) : null),
        extraction ? h('div', { class: 'pile', dataset: { bloc: 'extraction' } }, h('h3', { class: 'sous-titre' }, 'Extraction de valeur'), carteProjetMini(extraction)) : null),
    }) : null;

    // ---- Détails
    const lanceurs = creerLanceurs({ fiche: a, typeFiche: 'affaire', organisation: o, personne: p, enregistrer: (patch) => D.majAffaire(a.id, patch) });
    const details = sectionRepliable({
      id: 'affaire-details', titre: 'Détails',
      contenu: h('div', { class: 'proprietes' },
        champPropriete({ libelle: 'Besoin identifié', valeur: a.besoin || '', type: 'zone', surEnregistrer: (v) => D.majAffaire(a.id, { besoin: v }) }).element,
        champPropriete({ libelle: 'Durée (jours)', valeur: a.dureeJours ?? '', type: 'nombre', pas: '0.5', surEnregistrer: (v) => D.majAffaire(a.id, { dureeJours: v }) }).element,
        champPropriete({ libelle: 'Source', valeur: a.source || '', type: 'liste', fournir: () => D.etat.sources,
          surEnregistrer: async (v) => { if (v) await D.ajouterValeurListe('sources', v); await D.majAffaire(a.id, { source: v }); } }).element,
        lanceurs.github, lanceurs.dossier),
    });

    // ---- Documents
    const champLibelle = h('input', { class: 'champ', type: 'text', 'aria-label': 'Libellé du document', placeholder: 'Libellé (ex. Devis)' });
    const champUrl = h('input', { class: 'champ', type: 'url', 'aria-label': 'Adresse du document (lien Google Drive)', placeholder: 'Lien Google Drive' });
    const documents = a.documents || [];
    const sectionDocuments = sectionRepliable({
      id: 'affaire-documents', titre: 'Documents', compteur: documents.length,
      contenu: h('div', { class: 'pile' },
        documents.length ? h('ul', { class: 'liste-simple' }, documents.map((d, i) => h('li', { class: 'ligne-simple' }, icone('link', { taille: 14 }),
          boutonEtoile({ favori: d.favori === true, libelle: d.libelle, surBascule: () => D.majAffaire(a.id, L.basculerFavoriDocument(a, i)) }),
          h('a', { href: d.url, target: '_blank', rel: 'noopener noreferrer' }, d.libelle),
          h('button', { type: 'button', class: 'bouton-icone', 'aria-label': `Retirer ${d.libelle}`, onclick: () => D.majAffaire(a.id, L.supprimerDocument(a, i)) }, icone('x', { taille: 14 }))))) : null,
        h('div', { class: 'ligne-ajout' }, champLibelle, champUrl,
          h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', 'data-action': 'ajouter-document', onclick: async () => {
            const r = L.ajouterDocument(a, champLibelle.value, champUrl.value);
            if (r.erreurs.url) { toast(r.erreurs.url, { type: 'erreur' }); champUrl.classList.add('invalide'); return; }
            await D.majAffaire(a.id, r.patch);
          } }, 'Ajouter'))),
    });

    if (!panneau) panneau = panneauActivite({ lien: { affaireId: a.id }, liensCreation: () => L.liensAffaire(D.affaire(a.id) || a) });
    remplir(racine, gabaritFiche({ entete, gauche: [resume.element, sectionProjet?.element, details.element, sectionDocuments.element].filter(Boolean), droite: panneau.element }));
  }

  function reconstruire() {
    const a = D.affaire(id);
    if (!a) { introuvable(); return; }
    construire(a);
  }
  const rafraichir = planifier(() => { if (!saisieEnCours(racine)) reconstruire(); });
  reconstruire();
  const arrets = [D.surChangement(rafraichir), PD.surChangement(rafraichir)];
  return () => { arrets.forEach((f) => f()); panneau?.arreter(); };
}

