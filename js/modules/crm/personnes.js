// Liste des personnes et fenêtre "Ajouter une personne".
import { h, icone, remplir, dialogue, toast, ouvrirMenu, lirePreference, ecrirePreference } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import {
  avatar, lien, cheminPersonne, cheminOrganisation, pastillesEtiquettes, selecteurOrganisation, selecteurEtiquettes,
  organisationChoisieOuSaisie, listeContacts, etatVide, telecharger, planifier,
} from './composants.js';
import { barreFiltres } from './filtres.js';
import { demanderSuppressionPersonne } from './fiche-personne.js';

// Filtres et tri conservés pendant la session.
let criteres = L.criteresComplets('personnes', {});
let tri = { colonne: 'nom', sens: 'asc' };

const COLONNES = [
  { id: 'nom', libelle: 'Nom', tri: (p) => L.normaliser(p.nom), fixe: true },
  { id: 'organisation', libelle: 'Organisation', tri: (p) => L.normaliser(D.organisation(p.organisationId)?.nom) },
  { id: 'email', libelle: 'Email', tri: (p) => L.normaliser(L.premierEmail(p)) },
  { id: 'telephone', libelle: 'Téléphone', tri: (p) => p.telephones?.[0]?.valeur || '' },
  { id: 'etiquettes', libelle: 'Étiquettes', tri: (p) => (p.etiquettes || []).length },
  { id: 'ville', libelle: 'Ville', tri: (p) => L.normaliser(p.ville) },
];
const COLONNES_DEFAUT = ['nom', 'organisation', 'email', 'telephone', 'etiquettes'];

function colonnesVisibles() {
  try {
    const v = JSON.parse(lirePreference('colonnes.personnes', 'null'));
    if (Array.isArray(v) && v.length) return v.filter((id) => COLONNES.some((c) => c.id === id));
  } catch { /* préférence illisible */ }
  return COLONNES_DEFAUT;
}

function cellule(colonne, p) {
  switch (colonne) {
    case 'nom': return h('a', { class: 'cellule-nom', href: cheminPersonne(p.id) }, avatar(p.nom, 30), h('span', {}, p.nom), p.oppositionProspection ? h('span', { class: 'badge-opposition', title: 'Opposition à la prospection' }, 'Opposition') : null);
    case 'organisation': {
      const o = D.organisation(p.organisationId);
      return o ? lien(cheminOrganisation(o.id), o.nom) : null;
    }
    case 'email': {
      const e = L.premierEmail(p);
      return e ? h('a', { href: `mailto:${e}` }, e) : null;
    }
    case 'telephone': {
      const t = p.telephones?.[0]?.valeur;
      return t ? h('a', { href: `tel:${t.replace(/\s+/g, '')}` }, t) : null;
    }
    case 'etiquettes': return pastillesEtiquettes(p.etiquettes);
    case 'ville': return p.ville || null;
    default: return null;
  }
}

export function rendrePersonnes(conteneur) {
  const compteur = h('span', { class: 'compteur-liste', 'aria-live': 'polite' });
  const zoneTableau = h('div', { class: 'zone-tableau' });
  const filtres = barreFiltres({
    liste: 'personnes', placeholder: 'Rechercher une personne',
    lireCriteres: () => criteres,
    ecrireCriteres: (c) => { criteres = L.criteresComplets('personnes', c); rendre(); filtres.rafraichir(); },
    contexte: () => ({ etiquettes: D.etat.etiquettes, organisations: D.etat.organisations }),
  });

  const boutonColonnes = h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Choisir les colonnes', 'data-action': 'colonnes',
    onclick: (e) => {
      const visibles = colonnesVisibles();
      ouvrirMenu(e.currentTarget, COLONNES.filter((c) => !c.fixe).map((c) => ({
        libelle: `${visibles.includes(c.id) ? '✓ ' : ''}${c.libelle}`,
        action: () => {
          const v = visibles.includes(c.id) ? visibles.filter((x) => x !== c.id) : [...visibles, c.id];
          ecrirePreference('colonnes.personnes', JSON.stringify(COLONNES.filter((x) => x.fixe || v.includes(x.id)).map((x) => x.id)));
          rendre();
        },
      })));
    } }, icone('columns-3', { taille: 18 }));

  function rendre() {
    const contexte = { organisations: D.etat.organisations };
    let lignes = L.filtrerPersonnes(D.etat.personnes, criteres, contexte);
    const col = COLONNES.find((c) => c.id === tri.colonne) || COLONNES[0];
    lignes = L.trier(lignes, col.tri, tri.sens);
    const total = D.etat.personnes.filter((p) => !p.archive).length;
    remplir(compteur, `${lignes.length} ${lignes.length > 1 ? 'contacts' : 'contact'}`, lignes.length !== total && !criteres.archives ? ` sur ${total}` : '');
    if (!D.estPret()) { remplir(zoneTableau, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' }))); return; }
    if (!lignes.length) {
      remplir(zoneTableau, etatVide(
        D.etat.personnes.length ? 'Aucune personne ne correspond.' : 'Ajoute ta première personne, il suffit de son nom.',
        { action: D.etat.personnes.length ? null : h('button', { type: 'button', class: 'bouton bouton-principal', onclick: () => ouvrirCreationPersonne() }, icone('plus', { taille: 16 }), 'Personne') }));
      return;
    }
    const visibles = COLONNES.filter((c) => colonnesVisibles().includes(c.id));
    const entete = h('tr', {}, visibles.map((c) => h('th', { scope: 'col', 'aria-sort': tri.colonne === c.id ? (tri.sens === 'asc' ? 'ascending' : 'descending') : 'none' },
      h('button', { type: 'button', class: 'tri', onclick: () => { tri = { colonne: c.id, sens: tri.colonne === c.id && tri.sens === 'asc' ? 'desc' : 'asc' }; rendre(); } },
        c.libelle, tri.colonne === c.id ? icone(tri.sens === 'asc' ? 'arrow-up' : 'arrow-down', { taille: 12 }) : null))),
    h('th', { class: 'col-actions' }, boutonColonnes));
    const corps = lignes.map((p) => h('tr', { class: 'ligne-liste', dataset: { id: p.id },
      onclick: (e) => { if (!e.target.closest('a, button')) naviguer(`crm/personnes/${p.id}`); } },
    visibles.map((c) => h('td', { dataset: { colonne: c.id, libelle: c.libelle } }, cellule(c.id, p))),
    h('td', { class: 'col-actions' }, h('button', { type: 'button', class: 'bouton-icone', 'aria-label': `Actions : ${p.nom}`,
      onclick: (e) => ouvrirMenu(e.currentTarget, menuPersonne(p)) }, icone('ellipsis', { taille: 18 })))));
    remplir(zoneTableau, h('table', { class: 'tableau tableau-personnes' }, h('thead', {}, entete), h('tbody', {}, corps)));
  }

  const infoContacts = h('span', { class: 'vide-discret', 'data-role': 'dernier-export-contacts' });
  function majInfoContacts() {
    const d = D.etat.reglages.dernierExportContacts;
    infoContacts.textContent = d ? `Dernier export : ${L.formatDateHeure(d)}` : 'Aucun export pour le moment.';
  }
  const entete = h('header', { class: 'page-tete' },
    h('div', {}, h('p', { class: 'etiquette' }, 'Contacts'), h('h1', {}, 'Personnes'), compteur),
    h('div', { class: 'page-actions' },
      h('div', { class: 'export-contacts' },
        h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'exporter-personnes', onclick: exporterContactsTelephone }, icone('download', { taille: 16 }), 'Exporter'),
        infoContacts),
      h('button', { type: 'button', class: 'bouton bouton-principal', 'data-action': 'nouvelle-personne', onclick: () => ouvrirCreationPersonne() }, icone('plus', { taille: 16 }), 'Personne')));
  conteneur.append(h('div', { class: 'page page-liste' }, entete, filtres.element, zoneTableau));

  async function exporterContactsTelephone() {
    const { nouvelles, modifiees } = L.personnesAExporterVcf(D.etat.personnes, D.etat.reglages.dernierExportContacts);
    const aExporter = [...nouvelles, ...modifiees];
    if (!aExporter.length) { toast('Rien de nouveau ni de modifié depuis le dernier export'); return; }
    try {
      telecharger(L.nomFichierExport(new Date(), 'contacts'), L.vcardPersonnes(aExporter, { organisations: D.etat.organisations }), 'text/vcard;charset=utf-8');
      await D.noterExportContacts();
      const morceaux = [];
      if (nouvelles.length) morceaux.push(`${nouvelles.length} nouveau${nouvelles.length > 1 ? 'x' : ''}`);
      if (modifiees.length) morceaux.push(`${modifiees.length} modifié${modifiees.length > 1 ? 's' : ''}`);
      toast(`Contacts exportés : ${morceaux.join(', ')}`);
    } catch (e) {
      console.warn(e);
      toast('Export impossible', { type: 'erreur' });
    }
  }

  const rafraichir = planifier(() => { rendre(); filtres.rafraichir(); majInfoContacts(); });
  majInfoContacts();
  rendre();
  const arret = D.surChangement(rafraichir);
  return arret;
}

export function menuPersonne(p) {
  return [
    { libelle: 'Ouvrir la fiche', icone: 'user', action: () => naviguer(`crm/personnes/${p.id}`) },
    { libelle: p.archive ? 'Désarchiver' : 'Archiver', icone: p.archive ? 'archive-restore' : 'archive', action: () => D.majPersonne(p.id, { archive: !p.archive }) },
    { libelle: 'Supprimer définitivement…', icone: 'trash-2', danger: true, action: () => demanderSuppressionPersonne(p) },
  ];
}

// ---------------------------------------------------------------- fenêtre "Ajouter une personne"

/**
 * Fenêtre de création : seul le nom est obligatoire. Renvoie l'identifiant créé (ou null).
 * options : { organisationId, nom } pour préremplir.
 */
export async function ouvrirCreationPersonne({ organisationId = null, nom = '' } = {}) {
  const champNom = h('input', { class: 'champ', type: 'text', id: 'creation-nom', autocomplete: 'off', 'aria-label': 'Nom', placeholder: 'Nom', value: nom, autofocus: true });
  const orga = selecteurOrganisation({ valeurId: organisationId });
  const telephones = listeContacts({ libelle: 'Téléphone', ajout: 'Ajouter un numéro de téléphone', type: 'tel', surChangement: verifierDoublon });
  const emails = listeContacts({ libelle: 'Email', ajout: 'Ajouter une adresse email', type: 'email', surChangement: verifierDoublon });
  let etiquettes = [];
  const champEtiquettes = selecteurEtiquettes({ surChoix: (liste) => { etiquettes = liste.map((e) => e.id); } });
  const bandeau = h('div', { class: 'bandeau-doublon', role: 'status', hidden: true });
  let doublon = false;
  let boutonEnregistrer = null;

  function verifierDoublon() {
    const trouves = L.trouverDoublonsPersonne(D.etat.personnes, { nom: champNom.value, emails: emails.valeurs() });
    doublon = trouves.length > 0;
    bandeau.hidden = !doublon;
    if (doublon) {
      const p = trouves[0];
      remplir(bandeau, icone('triangle-alert', { taille: 16 }), h('span', {}, 'Cette personne existe déjà : ', h('a', { href: cheminPersonne(p.id), onclick: () => { document.querySelector('.voile-dialogue')?.remove(); } }, p.nom)));
    }
    if (boutonEnregistrer) boutonEnregistrer.textContent = doublon ? 'Créer quand même' : 'Enregistrer';
  }
  champNom.addEventListener('input', verifierDoublon);

  const corps = h('div', { class: 'pile formulaire-creation' },
    h('div', { class: 'bloc-champ' }, h('label', { class: 'etiquette', for: 'creation-nom' }, 'Nom'), champNom),
    bandeau,
    h('div', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Organisation'), orga.element),
    h('div', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Téléphone'), telephones.element),
    h('div', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Email'), emails.element),
    h('div', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Étiquettes'), champEtiquettes.element),
    h('p', { class: 'erreur', role: 'alert', 'data-erreur': 'creation' }));

  let identifiant = null;
  const r = await dialogue({
    titre: 'Ajouter une personne',
    classe: 'dialogue-formulaire',
    contenu: corps,
    boutons: [
      { libelle: 'Annuler', valeur: false },
      {
        libelle: 'Enregistrer', valeur: true, style: 'principal',
        avantFermeture: async () => {
          const erreur = corps.querySelector('[data-erreur]');
          const valeurs = { nom: champNom.value, emails: emails.valeurs(), telephones: telephones.valeurs(), etiquettes };
          const erreurs = L.validerPersonne(valeurs);
          if (Object.keys(erreurs).length) {
            erreur.textContent = erreurs.nom || erreurs.emails;
            champNom.classList.toggle('invalide', !!erreurs.nom);
            (erreurs.nom ? champNom : null)?.focus();
            return false;
          }
          try {
            valeurs.organisationId = await organisationChoisieOuSaisie(orga);
            identifiant = await D.creerPersonne(valeurs);
            return true;
          } catch (e) {
            console.warn(e);
            erreur.textContent = 'Enregistrement impossible, réessaie.';
            return false;
          }
        },
      },
    ],
    auMontage: ({ boite, boutons }) => {
      boutonEnregistrer = boutons.at(-1);
      boite.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.defaultPrevented && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); boutonEnregistrer.click(); }
      });
      verifierDoublon();
    },
  });
  if (r && identifiant) {
    toast('Personne ajoutée', { lien: { libelle: 'Ouvrir la fiche', href: cheminPersonne(identifiant) }, duree: 5000 });
    return identifiant;
  }
  return null;
}

