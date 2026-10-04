// Fiche d'une affaire : barre des étapes, résumé, détails, encaissements, documents ; activité à droite.
import { h, icone, remplir, ouvrirMenu, toast } from '../../os/ui.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import {
  lienPersonne, lienOrganisation, sectionRepliable, champPropriete, selecteurPersonne, selecteurOrganisation, titreEditable, selectProprietaire, gabaritFiche,
  lienRetour, saisieEnCours, pastilleStatut, fournisseurTexte, etatVide, planifier,
} from './composants.js';
import { panneauActivite } from './activites.js';
import { creerLanceurs } from './lanceurs.js';
import { changerEtapeAvecBoites, ouvrirPerdue, ouvrirPause, ouvrirEncaissement, demanderSuppressionAffaire } from './affaires.js';

export function rendreFicheAffaire(conteneur, id) {
  let panneau = null;
  const racine = h('div', { class: 'fiche-conteneur' });
  conteneur.append(racine);

  function introuvable() {
    remplir(racine, h('div', { class: 'page' }, lienRetour('#/crm/affaires', 'Affaires'),
      etatVide(D.estPret() ? 'Cette affaire n’existe plus.' : 'Chargement…')));
  }

  function barreDesEtapes(a) {
    const index = L.ETAPES.findIndex((e) => e.id === a.etape);
    const vivante = a.statut === 'ouverte' || a.statut === 'gagnee';
    return h('ol', { class: `barre-etapes-fiche${vivante ? '' : ' inactive'}`, 'aria-label': 'Étapes de l’affaire' },
      L.ETAPES.map((e, i) => h('li', { class: i <= index ? 'passee' : '', style: { '--couleur': e.couleur } },
        h('button', { type: 'button', class: `etape${i === index ? ' courante' : ''}`, 'aria-current': i === index && vivante ? 'step' : null, dataset: { etape: e.id },
          onclick: () => changerEtapeAvecBoites(a, e.id) }, e.libelle))));
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
        a.statut === 'gagnee' ? null : h('button', { type: 'button', class: 'bouton bouton-principal', 'data-action': 'gagnee', onclick: () => changerEtapeAvecBoites(a, 'gagne') }, icone('trophy', { taille: 16 }), 'Gagnée'),
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

    // ---- Détails
    const lanceurs = creerLanceurs({ fiche: a, typeFiche: 'affaire', organisation: o, personne: p, enregistrer: (patch) => D.majAffaire(a.id, patch) });
    const details = sectionRepliable({
      id: 'affaire-details', titre: 'Détails',
      contenu: h('div', { class: 'proprietes' },
        champPropriete({ libelle: 'Besoin identifié', valeur: a.besoin || '', type: 'zone', surEnregistrer: (v) => D.majAffaire(a.id, { besoin: v }) }).element,
        champPropriete({ libelle: 'Durée (jours)', valeur: a.dureeJours ?? '', type: 'nombre', pas: '0.5', surEnregistrer: (v) => D.majAffaire(a.id, { dureeJours: v }) }).element,
        champPropriete({ libelle: 'Source', valeur: a.source || '', type: 'intelligent', fournir: fournisseurTexte(() => D.etat.sources),
          surEnregistrer: async (v) => { if (v) await D.ajouterValeurListe('sources', v); await D.majAffaire(a.id, { source: v }); } }).element,
        lanceurs.github, lanceurs.dossier),
    });

    // ---- Encaissements
    const encaissements = a.encaissements || [];
    const sectionEncaissements = sectionRepliable({
      id: 'affaire-encaissements', titre: 'Encaissements', compteur: encaissements.length,
      actions: a.statut === 'gagnee' ? [h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', 'data-action': 'ajouter-encaissement', onclick: () => ouvrirEncaissement(a) }, icone('plus', { taille: 14 }), 'Ajouter un encaissement')] : [],
      contenu: encaissements.length
        ? h('ul', { class: 'liste-simple' }, encaissements.map((e) => h('li', { class: 'ligne-simple' }, h('strong', {}, L.formatEuros(e.montant)), h('span', { class: 'aide' }, L.formatDateHeure(e.date)))))
        : h('p', { class: 'aide' }, 'Aucun encaissement. Il est ajouté quand l’affaire passe en « Facture payée ».'),
    });

    // ---- Documents
    const champLibelle = h('input', { class: 'champ', type: 'text', 'aria-label': 'Libellé du document', placeholder: 'Libellé (ex. Devis)' });
    const champUrl = h('input', { class: 'champ', type: 'url', 'aria-label': 'Adresse du document (lien Google Drive)', placeholder: 'Lien Google Drive' });
    const documents = a.documents || [];
    const sectionDocuments = sectionRepliable({
      id: 'affaire-documents', titre: 'Documents', compteur: documents.length,
      contenu: h('div', { class: 'pile' },
        documents.length ? h('ul', { class: 'liste-simple' }, documents.map((d, i) => h('li', { class: 'ligne-simple' }, icone('link', { taille: 14 }),
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
    remplir(racine, gabaritFiche({ entete, gauche: [resume.element, details.element, sectionEncaissements.element, sectionDocuments.element], droite: panneau.element }));
  }

  function reconstruire() {
    const a = D.affaire(id);
    if (!a) { introuvable(); return; }
    construire(a);
  }
  const rafraichir = planifier(() => { if (!saisieEnCours(racine)) reconstruire(); });
  reconstruire();
  const arret = D.surChangement(rafraichir);
  return () => { arret(); panneau?.arreter(); };
}

