// Fiche d'une personne : colonne de gauche en sections repliables, colonne de droite (activité, notes, historique).
import { retirerAvecAnnulation } from '../../os/retrait.js';
import { h, icone, remplir, dialogue, toast, ouvrirMenu } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import {
  avatar, lienOrganisation, sectionRepliable, champPropriete, selecteurOrganisation, selecteurEtiquettes, listeContacts, titreEditable, selectProprietaire,
  telecharger, gabaritFiche, lienRetour, saisieEnCours, lignesContact, carteAffaireMini, fournisseurTexte, villesConnues, etatVide, planifier,
} from './composants.js';
import { panneauActivite } from './activites.js';
import { ouvrirCreationAffaire } from './affaires.js';
import * as PD from '../projets/donnees.js';
import * as P from '../projets/logique.js';
import { carteProjetMini } from '../projets/composants.js';

/** Suppression définitive d'une personne : sort de ses affaires + confirmation par le nom. */
export async function demanderSuppressionPersonne(p) {
  const siennes = L.affairesDeLaPersonne(D.etat.affaires, p.id);
  let choix = siennes.length ? 'conserver' : null;
  const champ = h('input', { class: 'champ', type: 'text', 'aria-label': `Tape « ${p.nom} » pour confirmer`, autocomplete: 'off', placeholder: p.nom });
  const choixAffaires = siennes.length
    ? h('fieldset', { class: 'groupe-cases' }, h('legend', { class: 'etiquette' }, `Ses ${siennes.length} affaire${siennes.length > 1 ? 's' : ''}`),
      h('label', { class: 'case' }, h('input', { type: 'radio', name: 'sort-affaires', value: 'conserver', checked: true, onchange: () => { choix = 'conserver'; } }), 'Les conserver (rattachées à leur organisation seule)'),
      h('label', { class: 'case' }, h('input', { type: 'radio', name: 'sort-affaires', value: 'affaires', onchange: () => { choix = 'affaires'; } }), 'Les supprimer aussi, avec leurs activités et notes'))
    : null;
  const r = await dialogue({
    titre: 'Supprimer définitivement ?',
    contenu: h('div', { class: 'pile' }, h('p', {}, `Pour supprimer « ${p.nom} », tape son nom ci-dessous. Cette action est définitive.`), choixAffaires, champ),
    boutons: [{ libelle: 'Annuler', valeur: false }, {
      libelle: 'Supprimer', valeur: true, style: 'danger',
      avantFermeture: () => L.confirmationValide(champ.value, p.nom) || (champ.classList.add('invalide'), false),
    }],
  });
  if (!r) return false;
  try {
    await D.supprimerPersonne(p.id, choix);
    toast('Personne supprimée');
    naviguer('crm/personnes');
    return true;
  } catch (e) {
    console.warn(e);
    toast(e?.saisie ? e.message : 'Suppression impossible', { type: 'erreur' });
    return false;
  }
}

/** Modification des emails et des téléphones d'une personne. */
async function ouvrirEditionContacts(p) {
  const telephones = listeContacts({ libelle: 'Téléphone', ajout: 'Ajouter un numéro de téléphone', type: 'tel', valeurs: p.telephones || [] });
  const emails = listeContacts({ libelle: 'Email', ajout: 'Ajouter une adresse email', type: 'email', valeurs: p.emails || [] });
  const erreur = h('p', { class: 'erreur', role: 'alert' });
  await dialogue({
    titre: 'Email et téléphone',
    classe: 'dialogue-formulaire',
    contenu: h('div', { class: 'pile' }, h('div', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Email'), emails.element), h('div', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Téléphone'), telephones.element), erreur),
    boutons: [{ libelle: 'Annuler', valeur: false }, {
      libelle: 'Enregistrer', valeur: true, style: 'principal',
      avantFermeture: async () => {
        const e = emails.valeurs();
        const err = L.validerPersonne({ nom: p.nom, emails: e });
        if (err.emails) { erreur.textContent = err.emails; return false; }
        await D.majPersonne(p.id, { ...L.patchEmails(e), telephones: telephones.valeurs() });
        return true;
      },
    }],
  });
}

export function rendreFichePersonne(conteneur, id) {
  let panneau = null;
  let editionOrganisation = false;
  let toutesAffaires = false;
  const racine = h('div', { class: 'fiche-conteneur' });
  conteneur.append(racine);

  function introuvable() {
    remplir(racine, h('div', { class: 'page' }, lienRetour('#/crm/personnes', 'Personnes'),
      etatVide(D.estPret() ? 'Cette personne n’existe plus.' : 'Chargement…')));
  }

  function construire(p) {
    const org = D.organisation(p.organisationId);
    const affaires = L.affairesDeLaPersonne(D.etat.affaires, p.id);
    const enCours = affaires.filter((a) => L.estAffaireActive(a));

    // ---- en tête
    const nom = titreEditable({ valeur: p.nom, libelle: 'Nom', surEnregistrer: (v) => D.majPersonne(p.id, L.patchNomAffiche(v)) });
    const menu = h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Plus d’actions', 'data-action': 'menu-fiche',
      onclick: (e) => ouvrirMenu(e.currentTarget, [
        { libelle: 'Exporter ce contact', icone: 'download', action: () => {
          telecharger(L.nomFichierExport(new Date(), 'contacts'), L.vcardPersonnes([p], { organisations: D.etat.organisations }), 'text/vcard;charset=utf-8');
          toast('Contact exporté');
        } },
        { libelle: p.archive ? 'Désarchiver' : 'Archiver', icone: p.archive ? 'archive-restore' : 'archive', action: () => D.majPersonne(p.id, { archive: !p.archive }) },
        { libelle: 'Supprimer définitivement…', icone: 'trash-2', danger: true, action: () => demanderSuppressionPersonne(p) },
      ]) }, icone('ellipsis', { taille: 20 }));
    const entete = h('header', { class: 'fiche-tete' },
      lienRetour('#/crm/personnes', 'Personnes'),
      h('div', { class: 'fiche-tete-ligne' },
        avatar(p.nom, 52),
        h('div', { class: 'fiche-titre' }, nom,
          h('div', { class: 'fiche-sous' }, p.archive ? h('span', { class: 'badge-archive' }, 'Archivée') : null, p.oppositionProspection ? h('span', { class: 'badge-opposition' }, 'Opposition à la prospection') : null,
            selectProprietaire({ valeur: p.proprietaire, surChoix: (v) => D.majPersonne(p.id, { proprietaire: v }) }))),
        h('div', { class: 'fiche-actions' },
          h('button', { type: 'button', class: 'bouton bouton-principal', 'data-action': 'nouvelle-affaire', onclick: () => ouvrirCreationAffaire({ personneId: p.id }) }, icone('plus', { taille: 16 }), 'Affaire'),
          menu)));

    // ---- Résumé
    const etiquettes = selecteurEtiquettes({ valeurIds: p.etiquettes || [], surChoix: (liste) => D.majPersonne(p.id, { etiquettes: liste.map((e) => e.id) }) });
    const emailOk = L.emailActif(p);
    const resume = sectionRepliable({
      id: 'personne-resume', titre: 'Résumé',
      actions: [h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Modifier les emails et les téléphones', 'data-action': 'modifier-contacts', onclick: () => ouvrirEditionContacts(p) }, icone('pencil', { taille: 16 }))],
      contenu: h('div', { class: 'pile resume' },
        h('div', { class: 'resume-ligne' }, etiquettes.element),
        (p.emails || []).length ? lignesContact(p.emails, 'email') : h('button', { type: 'button', class: 'prop-vide', onclick: () => ouvrirEditionContacts(p) }, icone('plus', { taille: 14 }), 'Ajouter une adresse email'),
        (p.telephones || []).length ? lignesContact(p.telephones, 'tel') : h('button', { type: 'button', class: 'prop-vide', onclick: () => ouvrirEditionContacts(p) }, icone('plus', { taille: 14 }), 'Ajouter un numéro de téléphone'),
        org
          ? h('div', { class: 'contact-ligne' }, icone('building-2', { taille: 15 }), lienOrganisation(org))
          : h('button', { type: 'button', class: 'prop-vide', 'data-action': 'ajouter-organisation', onclick: () => { editionOrganisation = true; reconstruire(); } }, icone('plus', { taille: 14 }), 'Organisation'),
        h('div', { class: 'actions-email' },
          emailOk ? h('a', { class: 'bouton bouton-secondaire bouton-petit', href: `mailto:${L.premierEmail(p)}`, 'data-action': 'ecrire-email' }, icone('mail', { taille: 15 }), 'Écrire un email')
            : h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', disabled: true, 'data-action': 'ecrire-email', title: p.oppositionProspection ? 'Opposition à la prospection' : 'Pas d’adresse email' }, icone('mail', { taille: 15 }), 'Écrire un email'),
          h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', disabled: !emailOk, 'data-action': 'email-envoye', onclick: async () => { await D.emailEnvoye(p.id); toast('Email noté dans l’historique'); } }, icone('mail-check', { taille: 15 }), 'Email envoyé'))),
    });

    // ---- Détails
    const prop = (libelle, champ, extra = {}) => champPropriete({ libelle, valeur: p[champ] ?? '', surEnregistrer: (v) => D.majPersonne(p.id, { [champ]: v }), ...extra });
    const opposition = h('div', { class: 'prop' }, h('span', { class: 'prop-libelle' }, 'Prospection'),
      h('div', { class: 'prop-valeur' }, h('label', { class: 'case' }, h('input', { type: 'checkbox', checked: !!p.oppositionProspection, dataset: { role: 'opposition' }, onchange: (e) => D.marquerOppositionPersonne(p.id, e.target.checked) }), 'Opposition à la prospection')));
    const details = sectionRepliable({
      id: 'personne-details', titre: 'Détails',
      contenu: h('div', { class: 'proprietes' },
        champPropriete({ libelle: 'Prénom', valeur: p.prenom || '', surEnregistrer: (v) => D.majPersonne(p.id, L.patchNomDetaille(v, p.nomFamille)) }).element,
        champPropriete({ libelle: 'Nom de famille', valeur: p.nomFamille || '', surEnregistrer: (v) => D.majPersonne(p.id, L.patchNomDetaille(p.prenom, v)) }).element,
        prop('Ville', 'ville', { type: 'intelligent', fournir: fournisseurTexte(villesConnues) }).element,
        prop('LinkedIn', 'linkedin', { type: 'url', lienVers: (v) => v }).element,
        prop('Site web', 'siteWeb', { type: 'url', lienVers: (v) => v }).element,
        champPropriete({ libelle: 'Source', valeur: p.source || '', type: 'liste', fournir: () => D.etat.sources,
          surEnregistrer: async (v) => { if (v) await D.ajouterValeurListe('sources', v); await D.majPersonne(p.id, { source: v }); } }).element,
        opposition),
    });

    // ---- Organisation
    let contenuOrg;
    if (org && !editionOrganisation) {
      contenuOrg = h('div', { class: 'contact-ligne' }, icone('building-2', { taille: 15 }), lienOrganisation(org),
        h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', 'data-action': 'detacher-organisation', onclick: () => retirerAvecAnnulation({
          titre: 'Détacher l’organisation ?', message: `« ${org.nom} » ne sera plus associée à ${p.nom}. La personne et l’organisation sont conservées.`, libelleOk: 'Détacher',
          faire: () => D.lierPersonneOrganisation(p.id, null), defaire: () => D.lierPersonneOrganisation(p.id, org.id), messageFait: 'Organisation détachée' }) }, 'Détacher'),
        h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', onclick: () => { editionOrganisation = true; reconstruire(); } }, 'Changer'));
    } else {
      const sel = selecteurOrganisation({ valeurId: org?.id || null, surChoix: async (el) => { if (el) { editionOrganisation = false; await D.lierPersonneOrganisation(p.id, el.id); } } });
      contenuOrg = h('div', { class: 'pile' }, org ? null : h('p', { class: 'aide' }, 'Aucune organisation n’est associée à cette personne.'), sel.element);
      if (editionOrganisation) setTimeout(() => sel.focus(), 0);
    }
    const sectionOrg = sectionRepliable({ id: 'personne-organisation', titre: 'Organisation', contenu: contenuOrg });

    // ---- Affaires
    const liste = toutesAffaires ? affaires : enCours;
    const sectionAffaires = sectionRepliable({
      id: 'personne-affaires', titre: toutesAffaires ? 'Toutes les affaires' : 'Affaires en cours', compteur: liste.length,
      actions: [h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Ajouter une affaire', onclick: () => ouvrirCreationAffaire({ personneId: p.id }) }, icone('plus', { taille: 16 }))],
      contenu: h('div', { class: 'pile' },
        liste.length ? h('div', { class: 'liste-cartes-mini' }, liste.map(carteAffaireMini)) : h('p', { class: 'aide' }, 'Aucune affaire pour le moment.'),
        affaires.length > enCours.length || toutesAffaires
          ? h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', 'data-action': 'voir-toutes-affaires', onclick: () => { toutesAffaires = !toutesAffaires; reconstruire(); } }, toutesAffaires ? 'Voir les affaires en cours' : 'Voir toutes les affaires')
          : null),
    });

    // ---- Projets (seulement s'il y en a : un projet se crée depuis une affaire gagnée ou depuis l'écran Projets)
    const projets = P.projetsLies(PD.etat.projets, { personneId: p.id });
    const sectionProjets = projets.length ? sectionRepliable({
      id: 'personne-projets', titre: 'Projets', compteur: projets.length,
      contenu: h('div', { class: 'liste-cartes-mini' }, projets.map(carteProjetMini)),
    }) : null;

    if (!panneau) {
      panneau = panneauActivite({ lien: { personneId: p.id }, liensCreation: () => ({ personneId: p.id, organisationId: D.personne(p.id)?.organisationId ?? null }) });
    }
    const gabarit = gabaritFiche({
      entete,
      gauche: [resume.element, details.element, sectionOrg.element, sectionAffaires.element, sectionProjets?.element].filter(Boolean),
      droite: panneau.element,
    });
    // Le panneau de droite garde son état : on ne le recrée pas.
    remplir(racine, gabarit);
  }

  function reconstruire() {
    const p = D.personne(id);
    if (!p) { introuvable(); return; }
    construire(p);
  }

  const rafraichir = planifier(() => {
    // Pas de nouveau rendu pendant une saisie : la frappe en cours serait perdue.
    if (saisieEnCours(racine)) return;
    reconstruire();
  });
  reconstruire();
  const arrets = [D.surChangement(rafraichir), PD.surChangement(rafraichir)];
  return () => { arrets.forEach((f) => f()); panneau?.arreter(); };
}
