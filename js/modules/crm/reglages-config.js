// Réglages de configuration du CRM : étapes de vente, phases de projet, options (interrupteurs) et modèles d'affaires.
// Aucune règle métier ici : le contrôle (validerEmplacements, validerModeleAffaire…) et les valeurs de départ sont dans logique.js, partagés avec le serveur MCP.
import { h, icone, vider, remplir, toast, confirmer, dialogue } from '../../os/ui.js';
import * as D from './donnees.js';
import * as PD from '../projets/donnees.js';
import * as L from './logique.js';
import * as P from '../projets/logique.js';

function section(id, titre, nomIcone, aide) {
  return h('section', { class: 'carte-section', id },
    h('h2', {}, icone(nomIcone, { taille: 18 }), titre),
    aide ? h('p', { class: 'aide' }, aide) : null);
}

const copie = (items) => items.map((e) => ({ ...e, action: e.action ? { ...e.action } : null }));

// ---------------------------------------------------------------- étapes de vente et phases de projet

/**
 * Éditeur des six emplacements (étapes de vente ou phases de projet) : nom, description (l'icône « i »), couleur, utilisé ou non, rôle
 * (« vente gagnée » / « clôture »), action suggérée. On modifie un brouillon, puis « Enregistrer » contrôle tout (règles de logique.js) avant d'écrire.
 */
function editeurEmplacements({ genre }) {
  const etape = genre === 'etape';
  const mot = etape ? 'étape' : 'phase';
  const sec = section(etape ? 'reglages-etapes' : 'reglages-phases', etape ? 'Étapes de vente' : 'Phases de projet', etape ? 'square-kanban' : 'folder-kanban',
    etape
      ? 'Les étapes que parcourt une affaire, de gauche à droite. Six emplacements : tu les renommes, tu les colores, tu en désactives (au moins 3 restent utilisées). Une étape ne se désactive que si aucune affaire n’y est.'
      : 'Les phases que parcourt un projet, de gauche à droite. Six emplacements : tu les renommes, tu les colores, tu en désactives (au moins 3 restent utilisées). Une phase ne se désactive que si aucun projet n’y est.');
  const zone = h('div', { class: 'pile emplacements', dataset: { genre } });
  const erreurGenerale = h('p', { class: 'erreur', role: 'alert' });
  let brouillon = null;
  let role = null;
  let sale = false;

  const items = () => (etape ? D.etat.config.etapes : D.etat.config.phases);
  const roleActuel = () => (etape ? D.etat.config.roleGagnee : D.etat.config.roleCloture);
  const comptes = () => (etape ? L.comptesParEtape(D.etat.affaires) : P.comptesParPhase(PD.etat.projets));

  function charger() {
    brouillon = copie(items());
    role = roleActuel();
    sale = false;
  }

  function ligne(e, i) {
    const nb = comptes()[e.id] || 0;
    const modifier = (patch) => { Object.assign(e, patch); sale = true; };
    const nom = h('input', { type: 'text', class: 'champ', value: e.libelle, maxlength: '40', 'aria-label': `Nom de l’emplacement ${i + 1}`, oninput: (ev) => modifier({ libelle: ev.target.value }) });
    const couleur = h('input', { type: 'color', class: 'champ-couleur', value: e.couleur || '#8d8993', 'aria-label': `Couleur de l’emplacement ${i + 1}`, oninput: (ev) => modifier({ couleur: ev.target.value }) });
    const actif = h('input', { type: 'checkbox', checked: e.actif, dataset: { role: 'actif' }, 'aria-label': `Utiliser l’emplacement ${i + 1}`,
      onchange: (ev) => { modifier({ actif: ev.target.checked }); rendre(); } });
    const roleRadio = h('input', { type: 'radio', name: `role-${genre}`, checked: role === e.id, disabled: !e.actif, dataset: { role: 'role' }, 'aria-label': `${etape ? 'Vente gagnée' : 'Clôture'} : emplacement ${i + 1}`,
      onchange: () => { role = e.id; sale = true; } });
    const description = h('textarea', { class: 'champ', rows: 2, maxlength: '300', placeholder: `Explication de cette ${mot}, affichée avec l’icône « i »`, 'aria-label': `Description de l’emplacement ${i + 1}`,
      oninput: (ev) => modifier({ description: ev.target.value }) });
    description.value = e.description || '';

    const aAction = !!e.action;
    const caseAction = h('input', { type: 'checkbox', checked: aAction, dataset: { role: 'action-active' }, 'aria-label': `Action suggérée : emplacement ${i + 1}`,
      onchange: (ev) => { modifier({ action: ev.target.checked ? (etape ? { type: 'tache', titre: '', delaiJours: 3 } : { titre: '', delaiJours: 3 }) : null }); rendre(); } });
    const detailAction = aAction ? h('div', { class: 'ligne-champs action-suggeree' },
      etape ? h('select', { class: 'champ', 'aria-label': 'Type de l’action', onchange: (ev) => modifier({ action: { ...e.action, type: ev.target.value } }) },
        L.TYPES_ACTIVITE.map((t) => h('option', { value: t.id, selected: t.id === (e.action.type || 'tache') }, t.libelle))) : null,
      h('input', { type: 'text', class: 'champ', value: e.action.titre || '', maxlength: '120', placeholder: 'Titre de l’action', 'aria-label': 'Titre de l’action', dataset: { role: 'action-titre' },
        oninput: (ev) => modifier({ action: { ...e.action, titre: ev.target.value } }) }),
      h('label', { class: 'case' }, h('span', {}, 'dans'),
        h('input', { type: 'number', class: 'champ champ-court', min: '0', max: '365', value: String(e.action.delaiJours ?? 0), 'aria-label': 'Délai en jours',
          oninput: (ev) => modifier({ action: { ...e.action, delaiJours: ev.target.value === '' ? '' : Number(ev.target.value) } }) }), h('span', {}, 'jours'))) : null;

    return h('div', { class: `emplacement${e.actif ? '' : ' desactive'}`, dataset: { emplacement: e.id } },
      h('div', { class: 'ligne-champs' },
        h('span', { class: 'numero-emplacement', 'aria-hidden': 'true' }, String(i + 1)),
        couleur, nom,
        h('label', { class: 'case' }, actif, h('span', {}, 'Utilisée')),
        h('label', { class: 'case' }, roleRadio, h('span', {}, etape ? 'Vente gagnée' : 'Clôture')),
        nb ? h('span', { class: 'aide' }, `${nb} fiche${nb > 1 ? 's' : ''}`) : null),
      description,
      h('label', { class: 'case' }, caseAction, h('span', {}, `Proposer une action quand une fiche arrive dans cette ${mot}`)),
      detailAction,
      h('p', { class: 'erreur', role: 'alert', dataset: { erreur: e.id } }));
  }

  function rendre() {
    if (!brouillon) charger();
    remplir(zone, brouillon.map(ligne));
  }

  function afficherErreurs(erreurs) {
    for (const [cle, message] of Object.entries(erreurs)) {
      const p = zone.querySelector(`[data-erreur="${cle}"]`);
      if (p) p.textContent = message;
    }
    erreurGenerale.textContent = [erreurs.general, erreurs.role].filter(Boolean).join(' ');
  }

  async function enregistrer() {
    const { erreurs } = L.validerEmplacements(brouillon, role, { genre, comptes: comptes() });
    zone.querySelectorAll('[data-erreur]').forEach((p) => { p.textContent = ''; });
    erreurGenerale.textContent = '';
    if (Object.keys(erreurs).length) { afficherErreurs(erreurs); toast('Corrige les erreurs avant d’enregistrer', { type: 'erreur' }); return; }
    try {
      if (etape) await D.enregistrerEtapes(brouillon, role); else await D.enregistrerPhases(brouillon, role);
      sale = false;
      toast(etape ? 'Étapes enregistrées' : 'Phases enregistrées');
    } catch (e) { console.warn(e); toast('Enregistrement impossible', { type: 'erreur' }); }
  }

  sec.append(zone, erreurGenerale, h('div', { class: 'ligne-boutons' },
    h('button', { type: 'button', class: 'bouton bouton-principal', dataset: { action: `enregistrer-${genre}` }, onclick: enregistrer }, icone('check', { taille: 16 }), 'Enregistrer'),
    h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: `annuler-${genre}` }, onclick: () => { charger(); rendre(); erreurGenerale.textContent = ''; } }, 'Annuler les changements')));

  function rafraichir() {
    // Un brouillon en cours n'est jamais écrasé par un changement venu d'ailleurs.
    if (sale || sec.contains(document.activeElement)) return;
    charger();
    rendre();
  }
  rendre();
  return { element: sec, rafraichir };
}

// ---------------------------------------------------------------- options (interrupteurs)

function sectionOptions() {
  const sec = section('reglages-options', 'Options du CRM', 'settings',
    'Allume seulement ce dont tu as besoin. Éteindre une option cache ses écrans et empêche d’en créer de nouveaux éléments ; rien de ce qui existe n’est effacé.');
  const corps = h('div', { class: 'pile' });
  sec.append(corps);

  function interrupteur({ cle, titre, aide, desactive = false }) {
    const reglages = D.etat.reglages;
    const case_ = h('input', { type: 'checkbox', checked: D.etat.config.options[cle] === true, disabled: desactive, dataset: { option: cle }, 'aria-label': titre,
      onchange: async (e) => {
        try { await D.enregistrerReglages({ [cle]: e.target.checked }); toast(e.target.checked ? `${titre} : allumé` : `${titre} : éteint`); } catch (err) { console.warn(err); toast('Enregistrement impossible', { type: 'erreur' }); e.target.checked = !e.target.checked; }
      } });
    return h('div', { class: 'option-ligne', dataset: { ligne: cle } }, h('label', { class: 'case' }, case_, h('strong', {}, titre)), h('p', { class: 'aide' }, aide));
  }

  function rendre() {
    if (corps.contains(document.activeElement) && document.activeElement.matches('input[type=text]')) return;
    const o = D.etat.config.options;
    const r = D.etat.reglages;
    const prenom = h('input', { type: 'text', class: 'champ', value: r.prenomCelebration || '', placeholder: 'Prénom (facultatif)', 'aria-label': 'Prénom dans les célébrations', maxlength: '40',
      onchange: async (e) => { await D.enregistrerReglages({ prenomCelebration: L.nettoyerEspaces(e.target.value) }); toast('Prénom enregistré'); } });
    const image = h('input', { type: 'text', class: 'champ', value: r.imageCelebration || '', placeholder: 'Adresse d’une image (facultatif)', 'aria-label': 'Image des célébrations', autocapitalize: 'off', spellcheck: false,
      onchange: async (e) => { await D.enregistrerReglages({ imageCelebration: L.nettoyerEspaces(e.target.value) }); toast('Image enregistrée'); } });
    remplir(corps,
      interrupteur({ cle: 'suiviPaiements', titre: 'Suivi des paiements', aide: 'Une liste de factures par projet (À payer, Payée, Abandonnée) : le CRM suit les paiements, il n’édite pas de factures. Allumé, il ajoute aussi les objectifs « facturé » et « encaissé » et le graphique d’encaissement.' }),
      interrupteur({ cle: 'clotureBloquee', titre: 'Clôture bloquée tant qu’une facture est à payer', aide: 'Un projet ne peut pas être terminé tant qu’une de ses factures est à payer (on peut la marquer payée, ou clôturer avec impayé). Sans effet si le suivi des paiements est éteint.', desactive: !o.suiviPaiements }),
      interrupteur({ cle: 'extractionValeur', titre: 'Extraction de valeur', aide: 'Crée un projet d’extraction quand une affaire est perdue ou gagnée sans projet, ou quand un projet est terminé. Éteint : plus de création, et le bloc, le bouton, le badge et le modèle d’extraction disparaissent.' }),
      interrupteur({ cle: 'celebrations', titre: 'Célébrations', aide: 'Un petit feu d’artifice quand une affaire est gagnée, un projet terminé, une facture payée ou un objectif atteint. Le message est neutre (« Bravo ! ») ; tu peux y ajouter un prénom et une image.' }),
      o.celebrations ? h('div', { class: 'ligne-champs' }, prenom, image) : null,
      interrupteur({ cle: 'boutonsDepot', titre: 'Créer un dossier dans Google Drive', aide: 'Affiche, sur les fiches affaire et projet, le bouton « Créer un dossier dans Google Drive » : il crée le dossier de la fiche et ses sous-dossiers dans Google Drive, puis enregistre son lien. Ajoute la section « Dossiers de projets dans Google Drive » plus bas. Nécessite que Google Drive soit branché.' }));
  }
  rendre();
  return { element: sec, rafraichir: rendre };
}

// ---------------------------------------------------------------- modèles d'affaires

function libelleActivite(a) {
  const j = Number(a.delaiJours) || 0;
  return `${L.libelleTypeActivite(a.type)} : ${a.titre} (${j === 0 ? 'le jour même' : `dans ${j} jour${j > 1 ? 's' : ''}`})`;
}

/** Fenêtre de création / modification d'un modèle d'affaire ; renvoie le modèle enregistré ou null. */
async function dialogueModeleAffaire(modele) {
  const nouveau = !modele;
  const m = modele ? { ...modele, activites: (modele.activites || []).map((a) => ({ ...a })) } : { id: null, nom: '', offreId: null, etape: null, priorite: 'tiede', montant: null, besoin: '', activites: [], actif: true };
  const nom = h('input', { type: 'text', class: 'champ', value: m.nom, 'aria-label': 'Nom du modèle', autofocus: true, maxlength: '80' });
  const offre = h('select', { class: 'champ', 'aria-label': 'Offre' }, h('option', { value: '' }, 'Aucune offre'),
    D.etat.offres.filter((o) => o.actif !== false || o.id === m.offreId).map((o) => h('option', { value: o.id, selected: o.id === m.offreId }, o.nom)));
  const etape = h('select', { class: 'champ', 'aria-label': 'Étape de départ' }, h('option', { value: '' }, 'Première étape'),
    L.etapesActives(D.etat.config).map((e) => h('option', { value: e.id, selected: e.id === m.etape }, e.libelle)));
  const priorite = h('select', { class: 'champ', 'aria-label': 'Priorité' }, L.PRIORITES.map((p) => h('option', { value: p.id, selected: p.id === (m.priorite || 'tiede') }, p.libelle)));
  const montant = h('input', { type: 'number', class: 'champ', min: '0', step: '0.01', value: m.montant ?? '', placeholder: 'Montant (€, facultatif)', 'aria-label': 'Montant' });
  const besoin = h('textarea', { class: 'champ', rows: 2, placeholder: 'Besoin de départ (facultatif)', 'aria-label': 'Besoin' });
  besoin.value = m.besoin || '';
  const erreur = h('p', { class: 'erreur', role: 'alert' });
  const liste = h('ul', { class: 'liste-simple' });
  const rendreListe = () => remplir(liste, m.activites.length
    ? m.activites.map((a, i) => h('li', { class: 'ligne-simple', dataset: { activite: a.id } }, h('span', {}, libelleActivite(a)),
      h('button', { type: 'button', class: 'bouton-icone', 'aria-label': `Retirer : ${a.titre}`, onclick: () => { m.activites.splice(i, 1); rendreListe(); } }, icone('x', { taille: 14 }))))
    : h('li', { class: 'vide-discret' }, 'Aucune activité type.'));
  rendreListe();
  const typeA = h('select', { class: 'champ', 'aria-label': 'Type de l’activité' }, L.TYPES_ACTIVITE.map((t) => h('option', { value: t.id }, t.libelle)));
  const titreA = h('input', { type: 'text', class: 'champ', placeholder: 'Titre de l’activité', 'aria-label': 'Titre de l’activité', maxlength: '120' });
  const delaiA = h('input', { type: 'number', class: 'champ champ-court', min: '0', max: '3650', value: '7', 'aria-label': 'Délai en jours' });
  const ajouterA = h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', dataset: { action: 'ajouter-activite-modele' }, onclick: () => {
    const a = { id: `act-${L.idAleatoire()}`, type: typeA.value, titre: titreA.value, delaiJours: delaiA.value };
    const e = L.validerActiviteModele(a);
    if (Object.keys(e).length) { erreur.textContent = Object.values(e)[0]; return; }
    erreur.textContent = '';
    m.activites.push({ ...a, titre: L.nettoyerEspaces(a.titre), delaiJours: Number(a.delaiJours) || 0 });
    titreA.value = '';
    rendreListe();
  } }, icone('plus', { taille: 14 }), 'Ajouter l’activité');
  let resultat = null;
  const ok = await dialogue({
    titre: nouveau ? 'Nouveau modèle d’affaire' : 'Modifier le modèle d’affaire',
    classe: 'dialogue-formulaire',
    contenu: h('div', { class: 'pile' },
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Nom'), nom),
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Offre'), offre),
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Étape de départ'), etape),
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Priorité'), priorite),
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Montant'), montant),
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Besoin'), besoin),
      h('div', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Activités créées avec l’affaire'), liste,
        h('div', { class: 'ligne-champs' }, typeA, titreA, h('label', { class: 'case' }, h('span', {}, 'dans'), delaiA, h('span', {}, 'jours')), ajouterA)),
      erreur),
    boutons: [{ libelle: 'Annuler', valeur: false }, {
      libelle: 'Enregistrer', valeur: true, style: 'principal',
      avantFermeture: async () => {
        const valeurs = { nom: nom.value, offreId: offre.value || null, etape: etape.value || null, priorite: priorite.value, montant: montant.value, besoin: besoin.value, activites: m.activites, actif: m.actif };
        const e = L.validerModeleAffaire(valeurs, D.etat.config);
        if (Object.keys(e).length) { erreur.textContent = Object.values(e)[0]; return false; }
        resultat = L.nouveauModeleAffaire(valeurs, { id: m.id || `modele-${L.idAleatoire()}`, ordre: modele?.ordre ?? (D.etat.modelesAffaire.length + 1) });
        return true;
      },
    }],
  });
  return ok ? resultat : null;
}

function sectionModelesAffaire() {
  const sec = section('reglages-modeles-affaire', 'Modèles d’affaires', 'copy',
    'Un modèle préremplit une nouvelle affaire (offre, étape de départ, priorité, montant, besoin) et lui crée ses activités types. On le choisit dans la fenêtre « Ajouter une affaire ». Les modèles de projets sont plus bas.');
  const liste = h('div', { class: 'liste-reglages' });
  sec.append(liste, h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'nouveau-modele-affaire' }, onclick: async () => {
    const m = await dialogueModeleAffaire(null);
    if (m) { await D.enregistrerModelesAffaire([...D.etat.modelesAffaire, m]); toast('Modèle ajouté'); }
  } }, icone('plus', { taille: 16 }), 'Ajouter un modèle d’affaire'));

  function ligne(m, i, tous) {
    const deplacer = (j) => { const c = [...tous]; [c[i], c[j]] = [c[j], c[i]]; D.enregistrerModelesAffaire(c); };
    return h('div', { class: `ligne-reglage${m.actif === false ? ' archivee' : ''}`, dataset: { modeleAffaire: m.id } },
      h('span', { class: 'nom-filtre' }, icone('copy', { taille: 14 }), m.nom, h('span', { class: 'aide' }, ` · ${(m.activites || []).length} activité${(m.activites || []).length > 1 ? 's' : ''}`)),
      m.actif === false ? h('span', { class: 'badge' }, 'Inactif') : null,
      h('div', { class: 'groupe-boutons' },
        h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Monter', title: 'Monter', disabled: i === 0, onclick: () => deplacer(i - 1) }, icone('arrow-up', { taille: 16 })),
        h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Descendre', title: 'Descendre', disabled: i === tous.length - 1, onclick: () => deplacer(i + 1) }, icone('arrow-down', { taille: 16 })),
        h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', dataset: { action: 'modifier-modele-affaire' }, onclick: async () => {
          const maj = await dialogueModeleAffaire(m);
          if (maj) { await D.enregistrerModelesAffaire(tous.map((x) => (x.id === m.id ? maj : x))); toast('Modèle enregistré'); }
        } }, icone('pencil', { taille: 14 }), 'Modifier'),
        h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', onclick: () => D.enregistrerModelesAffaire(tous.map((x) => (x.id === m.id ? { ...x, actif: x.actif === false } : x))) },
          icone(m.actif === false ? 'archive-restore' : 'archive', { taille: 14 }), m.actif === false ? 'Activer' : 'Désactiver'),
        h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', dataset: { action: 'supprimer-modele-affaire' }, onclick: async () => {
          if (!(await confirmer('Supprimer le modèle', `Supprimer « ${m.nom} » ? Les affaires déjà créées ne changent pas.`, { libelleOk: 'Supprimer', danger: true }))) return;
          await D.enregistrerModelesAffaire(tous.filter((x) => x.id !== m.id));
          toast('Modèle supprimé');
        } }, icone('trash-2', { taille: 14 }), 'Supprimer')));
  }
  function rafraichir() {
    const tous = D.etat.modelesAffaire;
    remplir(liste, tous.length ? tous.map((m, i) => ligne(m, i, tous)) : h('p', { class: 'vide-discret' }, 'Aucun modèle d’affaire.'));
  }
  rafraichir();
  return { element: sec, rafraichir };
}

/**
 * Sections de configuration de la page Réglages du CRM, dans l'ordre : étapes, phases, options, modèles d'affaires.
 * Renvoie { elements, rafraichir } : `rafraichir()` est à rappeler quand les données changent.
 */
export function sectionsConfiguration() {
  const etapes = editeurEmplacements({ genre: 'etape' });
  const phases = editeurEmplacements({ genre: 'phase' });
  const options = sectionOptions();
  const modeles = sectionModelesAffaire();
  const parties = [etapes, phases, options, modeles];
  return { elements: parties.map((p) => p.element), rafraichir: () => parties.forEach((p) => p.rafraichir()) };
}
