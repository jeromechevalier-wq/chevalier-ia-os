// Écran « À valider » du module Automatisations : la file des propositions déposées par les workflows n8n (via la porte).
// Deux zones : « À valider » (état a_valider) et « Traitements récents » (tous les autres états, une ligne par proposition avec sa frise de suivi).
// Il lit Firestore en direct (donnees.js, ecouterPropositions) : une proposition qui arrive ou change apparaît sans recharger. Aucune copie n8n n'est demandée.
// Valider, refuser et relancer passent par la fonction appelable automatisationsDecider (le serveur revérifie le compte, l'état et les champs) ; l'écran n'écrit rien.
// Même écran chez Jérôme et chez un client. Tout texte venu d'une proposition (type, titre, résumé, champs, erreur, lien) passe par h() : jamais d'HTML injecté.
import { h, remplir } from '../../os/ui.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import { frise, libelleEtat, estPerimee, enMs } from './propositions.js';

export const MESSAGE_VIDE = 'Rien à valider pour l’instant.';
const MESSAGE_ERREUR_LECTURE = 'Impossible de lire les propositions pour le moment. Recharge la page ; si cela continue, réessaie un peu plus tard.';
const MESSAGE_ATTENTE = 'Décision envoyée. Mise à jour en cours…';
const CLASSE_ETAT = { a_valider: 'etat-waiting', validee: 'etat-new', appliquee: 'etat-success', refusee: 'etat-canceled', echec: 'etat-error' };
const NB_RECENTES_MAX = 30;

export function rendreAValider(conteneur) {
  const etats = new Map(); // id -> { editing, valeurs, refus, raison, occupe, attente, message } : le brouillon de chaque carte
  const cartes = new Map(); // id -> { sig, el } : une carte n'est reconstruite que si quelque chose a changé (le focus et la saisie sont gardés)

  const bandeau = h('div', { class: 'autom-bandeau', role: 'alert', hidden: true });
  const zoneAValider = h('ol', { class: 'prop-liste', 'aria-label': 'Propositions à valider' });
  const zoneRecentes = h('ol', { class: 'prop-liste', 'aria-label': 'Traitements récents' });
  const limite = h('p', { class: 'autom-meta prop-limite' }, `Les ${NB_RECENTES_MAX} plus récents sont affichés.`);
  limite.hidden = true;
  const compte = h('span', { class: 'prop-compte', 'aria-live': 'polite' });

  conteneur.append(h('div', { class: 'page page-liste page-automatisations page-a-valider' },
    h('header', { class: 'page-tete' }, h('h1', {}, 'À valider'), compte),
    bandeau,
    h('section', { class: 'prop-zone', dataset: { zone: 'a-valider' } }, zoneAValider),
    h('section', { class: 'prop-zone', dataset: { zone: 'recentes' } }, h('h2', { class: 'prop-titre-zone' }, 'Traitements récents'), zoneRecentes, limite)));

  const etatDe = (id) => {
    if (!etats.has(id)) etats.set(id, { editing: false, valeurs: {}, refus: false, raison: '', occupe: false, attente: false });
    return etats.get(id);
  };

  /** Envoie la décision. En cas de refus du serveur, le message s'affiche sous la carte et rien ne disparaît ; en cas de succès, l'écoute en direct fait le reste. */
  async function decider(p, decision, options = {}) {
    const e = etatDe(p.id);
    e.occupe = true; e.message = '';
    rendre();
    const r = await D.decider(p.id, decision, options);
    e.occupe = false;
    // Succès : on attend l'écoute en direct. Si elle a déjà apporté le nouvel état (le serveur écrit avant de répondre), il n'y a plus rien à attendre.
    const encoreIci = D.propositions.liste.find((x) => x.id === p.id)?.etat === p.etat;
    if (r.ok) { e.attente = encoreIci; e.editing = false; e.refus = false; } else e.message = r.message;
    rendre();
  }

  const champsAffiches = (p) => (Array.isArray(p.champsValides) && p.champsValides.length ? p.champsValides : (p.champsProposes || []));

  function listeChamps(p) {
    const champs = champsAffiches(p);
    if (!champs.length) return null;
    return h('dl', { class: 'prop-champs' }, champs.map((c) => [h('dt', {}, String(c.nom ?? '')), h('dd', {}, String(c.valeur ?? ''))]));
  }

  function formulaireCorrection(p, e) {
    const proposes = p.champsProposes || [];
    return h('div', { class: 'prop-correction' }, proposes.map((c) => {
      const nom = String(c.nom ?? '');
      const champ = h('input', {
        type: 'text', class: 'champ', maxlength: String(500), value: e.valeurs[nom] ?? String(c.valeur ?? ''), 'aria-label': `Valeur de « ${nom} »`, dataset: { champ: nom },
        oninput: (ev) => { e.valeurs[nom] = ev.target.value; },
      });
      return h('label', { class: 'prop-correction-ligne' }, h('span', { class: 'etiquette' }, nom), champ);
    }));
  }

  function frisePour(p, maintenant) {
    return h('ol', { class: 'prop-frise', 'aria-label': 'Suivi de la proposition' }, frise(p, maintenant).map((e) => {
      const texte = e.detail && (e.cle === 'decision' || e.cle === 'application') ? e.detail : e.libelle;
      return h('li', { class: `prop-etape etape-${e.etat}`, dataset: { cle: e.cle, etat: e.etat } }, h('i', { class: 'prop-etape-point' }), texte);
    }));
  }

  function carte(p, maintenant, principal) {
    const e = etatDe(p.id);
    const perimee = p.etat === 'a_valider' && estPerimee(p, maintenant);
    const lien = L.lienSur(p.lien);
    const quand = p.etat === 'a_valider' ? enMs(p.creeLe) : L.dernierEvenement(p) || null;
    const retard = L.nonAppliqueeDepuisTropLongtemps(p, maintenant);
    const executions = L.executionsAffichees(p);
    const libre = !e.occupe && !e.attente;
    const jaune = principal === p.id;

    const boutons = [];
    if (p.etat === 'a_valider' && !e.refus) {
      if (!perimee) {
        boutons.push(h('button', { type: 'button', class: `bouton${jaune ? ' bouton-principal' : ''}`, dataset: { action: 'valider' }, disabled: !libre,
          onclick: () => decider(p, 'valider', e.editing ? { champs: (p.champsProposes || []).map((c) => ({ nom: String(c.nom), valeur: e.valeurs[c.nom] ?? String(c.valeur ?? '') })) } : {}) },
        e.editing ? 'Valider avec ces corrections' : 'Valider'));
        boutons.push(h('button', { type: 'button', class: 'bouton', dataset: { action: 'corriger' }, disabled: !libre,
          onclick: () => { e.editing = !e.editing; if (!e.editing) e.valeurs = {}; rendre(); } }, e.editing ? 'Annuler la correction' : 'Corriger'));
      }
      boutons.push(h('button', { type: 'button', class: 'bouton', dataset: { action: 'refuser' }, disabled: !libre, onclick: () => { e.refus = true; e.editing = false; rendre(); } }, 'Refuser'));
    }
    if (p.etat === 'echec') {
      boutons.push(h('button', { type: 'button', class: 'bouton', dataset: { action: 'relancer' }, disabled: !libre, onclick: () => decider(p, 'relancer') }, 'Relancer'));
    }

    const formulaireRefus = p.etat === 'a_valider' && e.refus
      ? h('div', { class: 'prop-refus' },
        h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Raison du refus (facultative)'),
          h('input', { type: 'text', class: 'champ', maxlength: String(200), value: e.raison, dataset: { champ: 'raison' }, oninput: (ev) => { e.raison = ev.target.value; } })),
        h('div', { class: 'prop-actions' },
          h('button', { type: 'button', class: 'bouton', dataset: { action: 'confirmer-refus' }, disabled: !libre, onclick: () => decider(p, 'refuser', { raison: e.raison.trim() }) }, 'Confirmer le refus'),
          h('button', { type: 'button', class: 'bouton', dataset: { action: 'annuler-refus' }, disabled: !libre, onclick: () => { e.refus = false; e.raison = ''; rendre(); } }, 'Annuler')))
      : null;

    const corrigees = Array.isArray(p.champsValides) && p.champsValides.length
      && JSON.stringify(p.champsValides) !== JSON.stringify(p.champsProposes || []);

    return h('li', { class: `prop-carte${perimee ? ' prop-perimee' : ''}`, dataset: { id: p.id, etat: p.etat } },
      h('div', { class: 'prop-tete' },
        h('span', { class: 'prop-type' }, String(p.type ?? '')),
        h('span', { class: `autom-pastille ${perimee ? 'etat-stale' : CLASSE_ETAT[p.etat] || 'etat-unknown'}` }, h('i', { class: 'autom-point' }), perimee ? 'Périmée' : libelleEtat(p.etat)),
        quand ? h('span', { class: 'autom-meta prop-age' }, h('span', { dataset: { depuis: quand } }, L.depuis(quand, maintenant))) : null),
      h('h3', { class: 'prop-titre' }, String(p.titre ?? '')),
      p.resume ? h('p', { class: 'prop-resume' }, String(p.resume)) : null,
      e.editing && p.etat === 'a_valider' ? formulaireCorrection(p, e) : listeChamps(p),
      corrigees ? h('p', { class: 'autom-meta' }, 'Valeurs corrigées avant la validation.') : null,
      p.lien ? h('p', { class: 'prop-lien' }, 'Lien : ', lien ? h('a', { href: lien, target: '_blank', rel: 'noopener noreferrer' }, lien) : String(p.lien)) : null,
      perimee ? h('p', { class: 'autom-indice' }, 'Cette proposition est périmée (plus de 30 jours) : elle ne peut plus être validée, seulement refusée.') : null,
      p.etat !== 'a_valider' ? frisePour(p, maintenant) : null,
      executions.length ? h('p', { class: 'autom-meta prop-executions' }, `Exécutions n8n : ${executions.join(' · ')}`) : null,
      retard ? h('p', { class: 'autom-indice', dataset: { alerte: 'non-appliquee' } }, 'Validée mais pas appliquée depuis plus de 30 minutes : vérifie que le workflow tourne.') : null,
      p.etat === 'echec' ? h('div', { class: 'autom-erreur' }, h('span', { class: 'autom-erreur-cle' }, 'Dernière erreur : '), h('code', {}, String(p.derniereErreur || 'inconnue'))) : null,
      formulaireRefus,
      boutons.length ? h('div', { class: 'prop-actions' }, boutons) : null,
      e.attente && !e.message ? h('p', { class: 'autom-meta', role: 'status' }, MESSAGE_ATTENTE) : null,
      e.message ? h('p', { class: 'prop-message', role: 'alert', dataset: { message: 'decision' } }, e.message) : null);
  }

  /** Remet les cartes dans la zone sans rien reconstruire quand l'ordre n'a pas changé (garde le focus). */
  function synchroniser(zone, elements, vide) {
    const cible = elements.length ? elements : [vide];
    const actuels = [...zone.children];
    if (!elements.length && actuels.length === 1 && actuels[0].textContent === vide.textContent) return; // même message déjà affiché : on ne le refait pas à chaque seconde
    if (actuels.length === cible.length && actuels.every((el, i) => el === cible[i])) return;
    remplir(zone, cible);
  }

  function rendre() {
    const maintenant = Date.now();
    const P = D.propositions;
    bandeau.hidden = !P.erreur;
    bandeau.textContent = P.erreur ? MESSAGE_ERREUR_LECTURE : '';
    if (!P.pret) { synchroniser(zoneAValider, [], h('li', { class: 'autom-vide' }, 'Chargement…')); synchroniser(zoneRecentes, [], h('li', { class: 'autom-vide' }, 'Chargement…')); return; }
    if (P.erreur) {
      const vide = () => h('li', { class: 'autom-vide' }, 'Aucune proposition à afficher.');
      synchroniser(zoneAValider, [], vide()); synchroniser(zoneRecentes, [], vide()); compte.textContent = '';
      return;
    }
    const { aValider, recentes } = L.separerPropositions(P.liste, maintenant);
    const visiblesRecentes = recentes.slice(0, NB_RECENTES_MAX);
    const premiere = aValider.find((p) => !estPerimee(p, maintenant));
    const principal = premiere ? premiere.id : null;
    compte.textContent = aValider.length ? `${aValider.length} en attente` : '';
    const vues = new Set();
    const fabriquer = (p) => {
      vues.add(p.id);
      const e = etatDe(p.id);
      // La proposition a changé d'état (la décision est arrivée) : le brouillon et l'attente n'ont plus de sens ; le message (ex. « Déjà décidée par … ») reste affiché sous la carte.
      if (e.etatVu !== undefined && e.etatVu !== p.etat) Object.assign(e, { editing: false, valeurs: {}, refus: false, raison: '', occupe: false, attente: false });
      e.etatVu = p.etat;
      const sig = JSON.stringify([p, { editing: e.editing, refus: e.refus, occupe: e.occupe, attente: e.attente, message: e.message }, estPerimee(p, maintenant), L.nonAppliqueeDepuisTropLongtemps(p, maintenant), principal === p.id]);
      const en = cartes.get(p.id);
      if (en && en.sig === sig) return en.el;
      const el = carte(p, maintenant, principal);
      cartes.set(p.id, { sig, el });
      return el;
    };
    // La frappe (valeurs, raison) n'entre pas dans la signature : taper ne reconstruit rien. Si la carte est reconstruite pour une autre raison, le curseur est remis dans son champ.
    const actif = document.activeElement;
    const idActif = actif?.closest?.('[data-id]')?.dataset?.id;
    const champActif = actif?.dataset?.champ;
    const positionCurseur = actif?.selectionStart;
    const elsA = aValider.map(fabriquer);
    const elsR = visiblesRecentes.map(fabriquer);
    for (const id of [...cartes.keys()]) if (!vues.has(id)) { cartes.delete(id); etats.delete(id); }
    synchroniser(zoneAValider, elsA, h('li', { class: 'autom-vide', dataset: { vide: 'a-valider' } }, MESSAGE_VIDE));
    synchroniser(zoneRecentes, elsR, h('li', { class: 'autom-vide', dataset: { vide: 'recentes' } }, 'Aucun traitement récent pour l’instant.'));
    limite.hidden = recentes.length <= visiblesRecentes.length; // la mention disparaît quand la liste redescend sous la limite
    // La carte en cours de saisie a pu être reconstruite : on remet le curseur dans son champ.
    if (idActif && champActif) {
      const retrouve = conteneur.querySelector(`[data-id="${CSS.escape(idActif)}"] [data-champ="${CSS.escape(champActif)}"]`);
      if (retrouve && retrouve !== actif) { retrouve.focus(); try { retrouve.setSelectionRange(positionCurseur, positionCurseur); } catch { /* champ sans curseur */ } }
    }
  }

  // « il y a … » avance sans rien reconstruire ; les seuils (périmée, 30 minutes) sont recalculés par rendre().
  function tic() {
    const maintenant = Date.now();
    conteneur.querySelectorAll('[data-depuis]').forEach((el) => { el.textContent = L.depuis(Number(el.dataset.depuis), maintenant); });
    rendre();
  }

  const arret = D.ecouterPropositions(rendre);
  const minuteur = setInterval(tic, 1000);
  rendre();
  return function quitter() {
    clearInterval(minuteur);
    arret();
  };
}

