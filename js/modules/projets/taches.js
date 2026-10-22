// Tâches d'un projet : section de la fiche projet (par phase) et ligne des Points clés de l'Accueil.
// Aucune règle métier ici : les règles sont dans logique.js (plans), exécutés par donnees.js.
import { h, icone, remplir, dialogue, confirmer, ouvrirMenu, toast, boutonSelonTexte } from '../../os/ui.js';
import { retirerAvecAnnulation } from '../../os/retrait.js';
import { sectionRepliable, lien } from '../crm/composants.js';
import { selecteurDate, dialogueDecalage } from '../crm/activites.js';
import * as L from '../crm/logique.js';
import * as D from './donnees.js';
import * as P from './logique.js';
import { cheminProjet } from './composants.js';
import * as CRM from '../crm/donnees.js';
const cfg = () => CRM.etat.config;

const LIBELLES_ETAT = { retard: 'En retard', aujourdhui: "Aujourd'hui", avenir: '' };
const etatDe = (t, aujourdhui) => (P.tacheEnRetard(t, aujourdhui) ? 'retard' : t.date === aujourdhui ? 'aujourdhui' : 'avenir');
/** Un refus de règle montre son message ; toute autre erreur reste « impossible ». */
const messageErreur = (e, defaut) => (e?.saisie ? e.message : defaut);

async function ou(action, defaut) {
  try { await action(); return true; } catch (e) { console.warn(e); toast(messageErreur(e, defaut), { type: 'erreur' }); return false; }
}

const texteDate = (t, aujourdhui) => (t.date ? `${L.formatJourCourt(t.date, aujourdhui)}${t.heure ? ` à ${t.heure.replace(':', ' h ')}` : ''}` : '');

// ---------------------------------------------------------------- modifier une tâche

export async function dialogueTache(t) {
  const titre = h('input', { class: 'champ', type: 'text', 'aria-label': 'Titre du livrable', value: t.titre, autofocus: true });
  const date = selecteurDate(t.date || '');
  const heure = h('input', { class: 'champ champ-court', type: 'time', 'aria-label': 'Heure (facultatif)', value: t.heure || '' });
  // « Confié à » : les membres de l'espace. Un seul membre : pas de choix. Un membre retiré reste affiché « Nom (ancien membre) » tant qu'on ne change pas.
  const membres = P.membresAssignables(cfg());
  const choixVisible = P.choixAssigneVisible(cfg());
  const ancien = t.assigneA && !membres.some((m) => m.id === t.assigneA) ? { id: t.assigneA, libelle: P.libelleAssigne(t.assigneA, cfg(), t.assigneNom) } : null;
  const assigne = h('select', { class: 'champ', 'aria-label': 'Confié à' },
    [...(ancien ? [ancien] : []), ...membres].map((a) => h('option', { value: a.id, selected: a.id === (t.assigneA || membres[0]?.id) }, a.libelle)));
  const erreur = h('p', { class: 'erreur', role: 'alert' });
  return dialogue({
    titre: 'Modifier le livrable',
    classe: 'dialogue-formulaire',
    contenu: h('div', { class: 'pile' },
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Titre'), titre),
      h('div', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Date (facultative)'), date.element,
        h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', 'data-action': 'effacer-date', onclick: () => { date.champ.value = ''; heure.value = ''; } }, 'Sans date')),
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Heure (facultative)'), heure),
      choixVisible ? h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Confié à'), assigne) : null,
      erreur),
    boutons: [{ libelle: 'Annuler', valeur: false }, {
      libelle: 'Enregistrer', valeur: true, style: 'principal',
      avantFermeture: async () => {
        try {
          await D.majTache(t.id, { titre: titre.value, date: date.valeur(), heure: date.valeur() ? heure.value : '', ...(choixVisible && assigne.value !== t.assigneA ? { assigneA: assigne.value } : {}) });
          return true;
        } catch (e) {
          console.warn(e);
          erreur.textContent = messageErreur(e, 'Enregistrement impossible, réessaie.');
          return false;
        }
      },
    }],
  });
}

// ---------------------------------------------------------------- section de la fiche projet

/** Section « Tâches » de la fiche : les tâches de chaque phase, cases à cocher, ajout rapide, menu par tâche. */
/** Titre d'une tâche cliquable (comme celui d'un point clé) : un clic le transforme en champ ; Entrée ou clic ailleurs enregistre, Échap annule. */
function titreModifiable(t) {
  const el = h('strong', { class: 'tache-titre activite-titre-modifiable', tabindex: '0', role: 'button', title: 'Cliquer pour modifier le texte', dataset: { role: 'titre-tache' } }, t.titre);
  function editer() {
    const champ = h('input', { class: 'champ', type: 'text', 'aria-label': 'Modifier le texte du livrable', value: t.titre, maxlength: '300' });
    let fini = false;
    const terminer = async (enregistrer) => {
      if (fini) return;
      fini = true;
      const texte = L.nettoyerEspaces(champ.value);
      if (enregistrer && texte && texte !== t.titre) {
        try { await D.majTache(t.id, { titre: texte }); return; } catch (e) { console.warn(e); toast('Modification impossible', { type: 'erreur' }); }
      }
      champ.replaceWith(el);
    };
    champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); terminer(true); } else if (e.key === 'Escape') terminer(false); });
    champ.addEventListener('blur', () => terminer(true));
    el.replaceWith(champ);
    champ.focus();
    champ.select();
  }
  el.addEventListener('click', editer);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter') editer(); });
  return el;
}

/** Clic sur la date d'une tâche : la fenêtre « Changer la date » des activités (date, heure, raccourcis), avec en plus « Sans date ». */
const dateTache = (t) => dialogueDecalage(t, { enregistrerPatch: (patch) => D.majTache(t.id, patch), sansDate: true });

export function sectionTaches(projet) {
  const aujourdhui = D.ctx().aujourdhui;

  function ligne(t, g, i) {
    const faite = t.fait;
    const case_ = h('button', { type: 'button', class: `case-fait${faite ? ' faite' : ''}`, 'aria-pressed': String(faite), 'aria-label': faite ? `Remettre à faire : ${t.titre}` : `Marquer comme fait : ${t.titre}`,
      dataset: { action: faite ? 'defaire-tache' : 'faire-tache' }, onclick: () => ou(() => (faite ? D.defaireTache(t.id) : D.faireTache(t.id)), 'Enregistrement impossible') }, icone('check', { taille: 14 }));
    const etat = faite ? 'avenir' : etatDe(t, aujourdhui);
    const menu = h('button', { type: 'button', class: 'bouton-icone', 'aria-label': `Actions : ${t.titre}`, dataset: { action: 'menu-tache' },
      onclick: (e) => ouvrirMenu(e.currentTarget, [
        { libelle: 'Modifier…', icone: 'pencil', action: () => dialogueTache(t) }, // le texte se modifie d'un clic sur le titre ; ici : date, personne et autres réglages
        { libelle: 'Monter', icone: 'arrow-up', desactive: i === 0, action: () => ou(() => D.deplacerTache(t.id, -1), 'Déplacement impossible') },
        { libelle: 'Descendre', icone: 'arrow-down', desactive: i === g.taches.length - 1, action: () => ou(() => D.deplacerTache(t.id, 1), 'Déplacement impossible') },
        ...P.phasesActives(cfg()).map((ph) => ({ libelle: `Déplacer vers : ${ph.libelle}`, icone: 'arrow-right-left', desactive: ph.id === t.phase, action: () => ou(() => D.majTache(t.id, { phase: ph.id }), 'Déplacement impossible') })),
        { libelle: 'Supprimer', icone: 'trash-2', danger: true, action: () => retirerAvecAnnulation({
          titre: 'Supprimer ce livrable ?', message: t.titre, libelleOk: 'Supprimer', danger: true, messageErreur: 'Suppression impossible',
          faire: () => D.supprimerTache(t.id), defaire: () => D.restaurerTache(t), messageFait: 'Livrable supprimé' }) },
      ]) }, icone('ellipsis', { taille: 16 }));
    return h('li', { class: `activite tache activite-${etat}${faite ? ' tache-faite' : ''}`, dataset: { tache: t.id } },
      case_,
      h('div', { class: 'activite-texte' },
        titreModifiable(t),
        h('span', { class: 'activite-meta' },
          // Comme sur une activité : un clic sur la date (ou sur « En retard ») ouvre la même fenêtre pour la changer ; une tâche sans date peut en recevoir une.
          etat !== 'avenir' ? h('button', { type: 'button', class: `badge-etat ${etat}`, title: 'Changer la date', dataset: { action: 'badge-date-tache' }, onclick: () => dateTache(t) }, LIBELLES_ETAT[etat]) : null,
          h('span', { class: 'activite-date-modifiable', role: 'button', tabindex: '0', title: 'Changer la date', dataset: { action: 'date-tache' }, onclick: () => dateTache(t),
            onkeydown: (e) => { if (e.key === 'Enter') dateTache(t); } }, t.date ? texteDate(t, aujourdhui) : 'Sans date'),
          t.assigneA && t.assigneA !== P.membresAssignables(cfg())[0]?.id ? h('span', { class: 'badge-assigne', dataset: { role: 'assigne' } }, icone('user', { taille: 12 }), P.libelleAssigne(t.assigneA, cfg(), t.assigneNom)) : null)),
      menu);
  }

  // ---- ajout rapide
  const titre = h('input', { class: 'champ', type: 'text', 'aria-label': 'Nouveau livrable', placeholder: 'Clique ici pour ajouter un livrable…', autocomplete: 'off' });
  const phase = h('select', { class: 'champ', 'aria-label': 'Phase du livrable' }, P.phasesActives(cfg()).map((ph) => h('option', { value: ph.id, selected: ph.id === projet.phase }, ph.libelle)));
  const date = selecteurDate('');
  // Comme « Enregistrer l'activité » : bouton jaune plein dans la zone ouverte (ou la touche Entrée).
  const bouton = h('button', { type: 'button', class: 'bouton bouton-principal', 'data-action': 'ajouter-tache', onclick: ajouter }, 'Enregistrer le livrable');
  const majBouton = boutonSelonTexte(bouton, titre); // grisé tant que le titre est vide, jaune dès la première lettre
  async function ajouter() {
    if (!L.nettoyerEspaces(titre.value)) { toast('Le titre est obligatoire.', { type: 'erreur' }); titre.classList.add('invalide'); titre.focus(); return; }
    // Le formulaire se vide tout de suite (on peut taper la tâche suivante sans attendre la réponse du serveur) ; si l'ajout échoue, ce qui était tapé revient.
    const saisie = { titre: titre.value, phase: phase.value, date: date.valeur() };
    titre.value = '';
    majBouton();
    date.champ.value = '';
    titre.classList.remove('invalide');
    titre.focus();
    const ok = await ou(() => D.creerTache(projet.id, saisie), 'Livrable non ajouté : vérifie ta connexion, puis réessaie');
    if (!ok && !titre.value) { titre.value = saisie.titre; date.champ.value = saisie.date; majBouton(); }
  }
  // Comme la zone d'activité de l'affaire : une seule ligne tant qu'on n'y a pas mis le focus ; phase, dates rapides, date et bouton apparaissent au clic.
  const zoneAjout = h('div', { class: 'ajout-tache replie', 'data-saisie': '' }, titre, phase, date.element, bouton);
  zoneAjout.addEventListener('focusin', () => zoneAjout.classList.remove('replie'));
  titre.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); ajouter(); }
    else if (e.key === 'Escape' && !titre.value) { date.champ.value = ''; phase.value = projet.phase; titre.classList.remove('invalide'); zoneAjout.classList.add('replie'); titre.blur(); }
  });

  // La liste se redessine seule (sans toucher au formulaire) : on peut taper la tâche suivante pendant que la précédente apparaît.
  const zoneGroupes = h('div', { class: 'pile zone-groupes-taches' });
  let compteur = null;
  function rendreGroupes() {
    const groupes = P.tachesParPhase(D.etat.taches, projet.id, cfg());
    const toutes = groupes.flatMap((g) => g.taches);
    const progression = P.progressionProjet(toutes);
    const avecTaches = groupes.filter((g) => g.taches.length);
    remplir(zoneGroupes, avecTaches.length
      ? avecTaches.map((g) => h('div', { class: 'groupe-taches', dataset: { phase: g.phase.id } },
        h('h3', { class: 'sous-titre titre-livrables' }, `${g.taches.length >= 2 ? 'Livrables' : 'Livrable'} ${g.phase.libelle}`, h('span', { class: 'compteur' }, `${g.faites}/${g.taches.length}`)),
        h('ul', { class: 'liste-activites' }, g.taches.map((t, i) => ligne(t, g, i)))))
      : h('p', { class: 'aide' }, 'Aucun livrable pour le moment. Ajoute le premier ci-dessus.'));
    if (compteur) compteur.textContent = toutes.length ? `${progression.faites}/${progression.total}` : '0';
  }
  const section = sectionRepliable({
    id: 'projet-taches', titre: 'Livrables', compteur: 0,
    contenu: h('div', { class: 'pile' }, zoneAjout, zoneGroupes),
  });
  compteur = section.element.querySelector('.section-compteur');
  rendreGroupes();
  return { ...section, majListe: rendreGroupes };
}

// ---------------------------------------------------------------- Points clés de l'Accueil

/** Ligne d'une tâche de projet dans « En retard » ou « Aujourd'hui » : case à cocher, titre, date, lien vers le projet. `t.projet` : le projet. */
export function ligneTachePointsCles(t, aujourdhui, { surFait = null } = {}) {
  const etat = etatDe(t, aujourdhui);
  const bouton = h('button', { type: 'button', class: 'case-fait', 'aria-label': `Marquer comme fait : ${t.titre}`, title: 'Fait', dataset: { action: 'faire-tache' },
    onclick: () => (surFait ? surFait(t) : D.faireTache(t.id)) }, icone('check', { taille: 14 }));
  return h('li', { class: `activite tache activite-${etat}`, dataset: { tache: t.id } },
    bouton,
    h('span', { class: 'activite-type' }, icone('folder-kanban', { taille: 16 })),
    h('div', { class: 'activite-texte' },
      h('strong', {}, t.titre),
      h('span', { class: 'activite-meta' },
        etat !== 'avenir' ? h('span', { class: `badge-etat ${etat}` }, LIBELLES_ETAT[etat]) : null,
        h('span', {}, texteDate(t, aujourdhui)),
        lien(cheminProjet(t.projet.id), t.projet.titre))));
}
