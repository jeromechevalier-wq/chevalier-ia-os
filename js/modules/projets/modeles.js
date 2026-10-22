// Modèles de projet : la liste (dans les Réglages, section « Modèles de projets ») et la fiche d'un modèle (ses livrables types par phase).
// Aucune règle métier ici : les règles sont dans logique.js (plans), exécutés par donnees.js.
import { h, icone, remplir, dialogue, confirmer, demanderTexte, ouvrirMenu, toast, boutonSelonTexte } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import { retirerAvecAnnulation } from '../../os/retrait.js';
import * as CRM from '../crm/donnees.js';
import * as L from '../crm/logique.js';
import { champPropriete, sectionRepliable, titreEditable, lienRetour, saisieEnCours, etatVide, planifier } from '../crm/composants.js';
import * as D from './donnees.js';
import * as P from './logique.js';
const cfg = () => CRM.etat.config;

export const cheminModele = (id) => `#/projets/modeles/${id}`;

const messageErreur = (e, defaut) => (e?.saisie ? e.message : defaut);

async function ou(action, defaut) {
  try { await action(); return true; } catch (e) { console.warn(e); toast(messageErreur(e, defaut), { type: 'erreur' }); return false; }
}

const libelleOffre = (offreId) => (offreId ? L.libelleOffre(CRM.etat.offres, offreId) : '');
const libelleDelai = (t) => (t.delaiJours === null || t.delaiJours === undefined ? 'Sans date' : t.delaiJours === 0 ? 'Le jour du début' : `J + ${t.delaiJours}`);

// ---------------------------------------------------------------- liste

/**
 * Liste des modèles de projet. `page: false` (Réglages) : seulement le compteur, le bouton « Modèle » et le tableau, sans l'en-tête de page.
 * Les modèles ne sont plus dans le menu : ils se règlent dans les Réglages, avec les modèles d'affaires.
 */
export function rendreModeles(conteneur, { page = true } = {}) {
  const zone = h('div', { class: 'zone-affaires' });
  const compteur = h('span', { class: 'compteur-liste', 'aria-live': 'polite' });

  async function nouveau() {
    const nom = await demanderTexte('Ajouter un modèle', { libelle: 'Nom du modèle' });
    if (!nom) return;
    try {
      const id = await D.creerModele({ nom });
      naviguer(`projets/modeles/${id}`);
    } catch (e) { console.warn(e); toast(messageErreur(e, 'Création impossible'), { type: 'erreur' }); }
  }

  function rendre() {
    if (!D.estPret()) { remplir(zone, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' }))); return; }
    const modeles = [...D.etat.modeles].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
    remplir(compteur, `${modeles.length} ${modeles.length > 1 ? 'modèles' : 'modèle'}`);
    if (!modeles.length) { remplir(zone, etatVide('Aucun modèle pour le moment. Ajoute le premier avec le bouton « Modèle ».')); return; }
    const lignes = modeles.map((m) => h('tr', { class: 'ligne-liste', dataset: { id: m.id }, onclick: (e) => { if (!e.target.closest('a, button')) naviguer(`projets/modeles/${m.id}`); } },
      h('td', { dataset: { libelle: 'Nom' } }, h('a', { class: 'cellule-nom', href: cheminModele(m.id) }, h('span', {}, m.nom))),
      h('td', { dataset: { libelle: 'Offre' } }, libelleOffre(m.offreId) || null),
      h('td', { dataset: { libelle: 'Livrables' } }, String((m.taches || []).length)),
      h('td', { dataset: { libelle: 'État' } }, m.actif === false ? h('span', { class: 'badge-pause' }, 'Inactif') : 'Actif')));
    remplir(zone, h('div', { class: 'zone-tableau' }, h('table', { class: 'tableau tableau-modeles' },
      h('thead', {}, h('tr', {}, ['Nom', 'Offre', 'Livrables', 'État'].map((c) => h('th', { scope: 'col' }, h('span', { class: 'tri' }, c))))),
      h('tbody', {}, lignes))));
  }

  const boutonNouveau = h('button', { type: 'button', class: 'bouton bouton-principal', 'data-action': 'nouveau-modele', onclick: nouveau }, icone('plus', { taille: 16 }), 'Modèle');
  const aide = h('p', { class: 'aide' }, 'Un modèle donne à un projet ses livrables de départ. Il se choisit à la création du projet ; celui de l’offre de l’affaire est proposé d’office.');
  conteneur.append(page
    ? h('div', { class: 'page page-affaires page-modeles' },
      h('header', { class: 'page-tete' },
        h('div', {}, h('p', { class: 'etiquette' }, 'Réglages'), h('h1', {}, 'Modèles de projets'), compteur),
        h('div', { class: 'page-actions' }, boutonNouveau)),
      aide, zone)
    : h('div', { class: 'pile modeles-reglages' }, aide, h('div', { class: 'ligne-boutons' }, compteur, boutonNouveau), zone));
  const planifie = planifier(rendre);
  rendre();
  const arrets = [D.surChangement(planifie), CRM.surChangement(planifie)];
  return () => arrets.forEach((f) => f());
}

// ---------------------------------------------------------------- fiche d'un modèle

async function dialogueTacheModele(modele, t) {
  const titre = h('input', { class: 'champ', type: 'text', 'aria-label': 'Titre du livrable type', value: t.titre, autofocus: true });
  const phase = h('select', { class: 'champ', 'aria-label': 'Phase' }, P.phasesActives(cfg()).map((ph) => h('option', { value: ph.id, selected: ph.id === t.phase }, ph.libelle)));
  const delai = h('input', { class: 'champ champ-court', type: 'number', min: '0', step: '1', inputmode: 'numeric', 'aria-label': 'Délai en jours après le début', value: t.delaiJours ?? '' });
  const erreur = h('p', { class: 'erreur', role: 'alert' });
  return dialogue({
    titre: 'Modifier le livrable type',
    classe: 'dialogue-formulaire',
    contenu: h('div', { class: 'pile' },
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Titre'), titre),
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Phase'), phase),
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Délai en jours après le début du projet (vide = sans date)'), delai),
      erreur),
    boutons: [{ libelle: 'Annuler', valeur: false }, {
      libelle: 'Enregistrer', valeur: true, style: 'principal',
      avantFermeture: async () => {
        try { await D.majTacheModele(modele.id, t.id, { titre: titre.value, phase: phase.value, delaiJours: delai.value }); return true; } catch (e) {
          console.warn(e);
          erreur.textContent = messageErreur(e, 'Enregistrement impossible, réessaie.');
          return false;
        }
      },
    }],
  });
}

export function rendreFicheModele(conteneur, id) {
  const racine = h('div', { class: 'fiche-conteneur' });
  let majTaches = null; // redessine la liste des livrables seule, quand on tape dans le formulaire d'ajout
  conteneur.append(racine);

  function introuvable() {
    remplir(racine, h('div', { class: 'page' }, lienRetour('#/reglages/crm', 'Réglages'), etatVide(D.estPret() ? 'Ce modèle n’existe plus.' : 'Chargement…')));
  }

  function construire(m) {
    const actif = m.actif !== false;

    const menu = h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Plus d’actions', 'data-action': 'menu-fiche',
      onclick: (e) => ouvrirMenu(e.currentTarget, [{ libelle: 'Supprimer définitivement…', icone: 'trash-2', danger: true, action: () => supprimer(m) }]) }, icone('ellipsis', { taille: 20 }));
    const entete = h('header', { class: 'fiche-tete' },
      lienRetour('#/reglages/crm', 'Réglages'),
      h('div', { class: 'fiche-tete-ligne' },
        h('div', { class: 'fiche-titre' }, titreEditable({ valeur: m.nom, libelle: 'Nom du modèle', surEnregistrer: (v) => D.majModele(m.id, { nom: v }) }),
          h('div', { class: 'fiche-sous' }, actif ? h('span', { class: 'pastille-statut', style: { '--couleur': '#3fbf7f' } }, 'Actif') : h('span', { class: 'badge-pause' }, 'Inactif'))),
        h('div', { class: 'fiche-actions' },
          h('button', { type: 'button', class: 'bouton bouton-secondaire', 'data-action': 'basculer-actif', onclick: () => ou(() => D.majModele(m.id, { actif: !actif }), 'Enregistrement impossible') }, actif ? 'Désactiver' : 'Activer'),
          menu)));

    const offres = CRM.etat.offres.filter((o) => o.actif !== false || o.id === m.offreId);
    const parametres = sectionRepliable({
      id: 'modele-parametres', titre: 'Paramètres',
      contenu: h('div', { class: 'proprietes' },
        champPropriete({ libelle: 'Offre', valeur: m.offreId || '', type: 'select', options: offres.map((o) => ({ valeur: o.id, libelle: o.nom })), surEnregistrer: (v) => D.majModele(m.id, { offreId: v || null }) }).element,
        h('p', { class: 'aide' }, 'Quand on crée un projet depuis une affaire gagnée, le modèle de son offre est proposé.')),
    });

    function ligne(t, g, i) {
      const menuTache = h('button', { type: 'button', class: 'bouton-icone', 'aria-label': `Actions : ${t.titre}`, dataset: { action: 'menu-tache-modele' },
        onclick: (e) => ouvrirMenu(e.currentTarget, [
          { libelle: 'Modifier…', icone: 'pencil', action: () => dialogueTacheModele(m, t) },
          { libelle: 'Monter', icone: 'arrow-up', desactive: i === 0, action: () => ou(() => D.deplacerTacheModele(m.id, t.id, -1), 'Déplacement impossible') },
          { libelle: 'Descendre', icone: 'arrow-down', desactive: i === g.taches.length - 1, action: () => ou(() => D.deplacerTacheModele(m.id, t.id, 1), 'Déplacement impossible') },
          ...P.phasesActives(cfg()).map((ph) => ({ libelle: `Déplacer vers : ${ph.libelle}`, icone: 'arrow-right-left', desactive: ph.id === t.phase, action: () => ou(() => D.majTacheModele(m.id, t.id, { phase: ph.id }), 'Déplacement impossible') })),
          { libelle: 'Supprimer', icone: 'trash-2', danger: true, action: () => retirerAvecAnnulation({
            titre: 'Supprimer ce livrable type ?', message: t.titre, libelleOk: 'Supprimer', danger: true, messageErreur: 'Suppression impossible',
            faire: () => D.supprimerTacheModele(m.id, t.id), defaire: () => D.restaurerTachesModele(m.id, m.taches || []), messageFait: 'Livrable type supprimé' }) },
        ]) }, icone('ellipsis', { taille: 16 }));
      return h('li', { class: 'activite tache', dataset: { tacheModele: t.id } },
        h('span', { class: 'activite-type' }, icone('circle', { taille: 14 })),
        h('div', { class: 'activite-texte' }, h('strong', { class: 'tache-titre' }, t.titre), h('span', { class: 'activite-meta' }, libelleDelai(t))),
        menuTache);
    }

    const titre = h('input', { class: 'champ', type: 'text', 'aria-label': 'Nouveau livrable type', placeholder: 'Ajouter un livrable type…', autocomplete: 'off' });
    const phase = h('select', { class: 'champ', 'aria-label': 'Phase du livrable type' }, P.phasesActives(cfg()).map((ph) => h('option', { value: ph.id }, ph.libelle)));
    const delai = h('input', { class: 'champ champ-court', type: 'number', min: '0', step: '1', inputmode: 'numeric', 'aria-label': 'Délai en jours (vide = sans date)', placeholder: 'Délai (jours)' });
    const bouton = h('button', { type: 'button', class: 'bouton bouton-principal bouton-petit', 'data-action': 'ajouter-tache-modele', onclick: ajouter }, icone('plus', { taille: 14 }), 'Ajouter le livrable type');
    const majBouton = boutonSelonTexte(bouton, titre); // grisé tant que le titre est vide, jaune dès la première lettre
    async function ajouter() {
      if (!L.nettoyerEspaces(titre.value)) { toast('Le titre est obligatoire.', { type: 'erreur' }); titre.classList.add('invalide'); titre.focus(); return; }
      // Le formulaire se vide tout de suite ; si l'ajout échoue, ce qui était tapé revient.
      const saisie = { titre: titre.value, phase: phase.value, delaiJours: delai.value };
      titre.value = '';
      majBouton();
      delai.value = '';
      titre.classList.remove('invalide');
      titre.focus();
      const ok = await ou(() => D.ajouterTacheModele(m.id, saisie), 'Livrable type non ajouté : vérifie ta connexion, puis réessaie');
      if (!ok && !titre.value) { titre.value = saisie.titre; delai.value = saisie.delaiJours; majBouton(); }
    }
    titre.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ajouter(); } });

    // La liste se redessine seule (sans toucher au formulaire d'ajout) : on peut taper le livrable suivant pendant que le précédent apparaît.
    const zoneGroupes = h('div', { class: 'pile zone-groupes-taches' });
    let compteur = null;
    function rendreGroupes() {
      const courant = D.modele(m.id) ?? m;
      const groupes = P.tachesModeleParPhase(courant, cfg());
      const avecTaches = groupes.filter((g) => g.taches.length);
      remplir(zoneGroupes, avecTaches.length
        ? avecTaches.map((g) => h('div', { class: 'groupe-taches', dataset: { phase: g.phase.id } },
          h('h3', { class: 'sous-titre' }, g.phase.libelle, h('span', { class: 'compteur' }, String(g.taches.length))),
          h('ul', { class: 'liste-activites' }, g.taches.map((t, i) => ligne(t, g, i)))))
        : h('p', { class: 'aide' }, 'Ce modèle n’a pas encore de livrable : un projet créé avec lui démarre vide.'));
      if (compteur) compteur.textContent = String(groupes.reduce((n, g) => n + g.taches.length, 0));
    }
    const taches = sectionRepliable({
      id: 'modele-taches', titre: 'Livrables du modèle', compteur: 0,
      contenu: h('div', { class: 'pile' }, h('div', { class: 'ajout-tache ajout-tache-modele' }, titre, phase, delai, bouton), zoneGroupes),
    });
    compteur = taches.element.querySelector('.section-compteur');
    rendreGroupes();
    majTaches = rendreGroupes;

    remplir(racine, h('div', { class: 'page fiche fiche-modele' }, entete, h('div', { class: 'fiche-gauche fiche-pleine' }, parametres.element, taches.element)));
  }

  async function supprimer(m) {
    const fait = await retirerAvecAnnulation({
      titre: 'Supprimer ce modèle ?', message: `« ${m.nom} » : les projets déjà créés avec lui ne changent pas.`, libelleOk: 'Supprimer', danger: true, messageErreur: 'Suppression impossible',
      faire: () => D.supprimerModele(m.id), defaire: () => D.restaurerModele(m), messageFait: 'Modèle supprimé',
    });
    if (fait) naviguer('reglages/crm');
  }

  function reconstruire() {
    const m = D.modele(id);
    if (!m) { introuvable(); return; }
    construire(m);
  }
  const rafraichir = planifier(() => {
    if (!saisieEnCours(racine)) { reconstruire(); return; }
    majTaches?.();
  });
  reconstruire();
  const arrets = [D.surChangement(rafraichir), CRM.surChangement(rafraichir)];
  return () => arrets.forEach((f) => f());
}
