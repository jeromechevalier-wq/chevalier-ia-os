// La pile de « l'application Factures » (26/11/2026 ; animations et bilan du 27/11/2026, maquette v3) : une facture « à valider » à la fois, la plus ancienne d'abord,
// dans la page Examiner elle-même (examiner.js : PDF, montants, fournisseur, chantier, alertes, Accepter / Refuser).
// Après une acceptation ou un refus RÉUSSI : le tampon « Validée » ou « Refusée », la facture glisse à gauche, la suivante arrive ; un message propose « Annuler » pendant 3,2 s
// (« Annuler » rouvre la facture par l'action métier `rouvrir` : l'ancienne décision reste dans le journal). Un échec laisse la facture affichée avec son message.
// « Passer » la fait descendre et la met en fin de pile pour cette séance seulement (rien n'est écrit) ; il est désactivé pendant qu'une décision s'écrit (quitter la page perdrait son résultat).
// Facture traitée entre-temps par quelqu'un d'autre, ou archivée depuis la pile : message en toast (page Examiner), puis la liste est relue (jamais de facture ni de compteur faux).
// Focus clavier : sur le titre de la facture suivante, ou sur « Voir la liste des factures » à la fin. Plus rien à valider : le bilan du jour, avec un lien vers le tableau de bord.
// LECTURES : seulement par le client de la base ; aucune écriture ici sauf « Annuler » (action métier). Les durées viennent de logique-appli.js (les mêmes que la feuille de style).
import { h, icone, remplir, toast, reduireAnimations } from '../../os/ui.js';
import { lien } from '../../os/router.js';
import { clientBase, actionsBase, verifierAcces } from '../../os/acces-base.js';
import { creerDonnees } from './donnees.js';
import { creerDonneesExaminer } from './donnees-examiner.js';
import { rendreExaminer } from './examiner.js';
import { chargement, etatErreur } from './composants.js';
import { dessinerEtatAcces } from './ecran.js';
import { ordonnerPile, passerFacture, texteRestantes, centimesSignes, TEXTE_PILE_FINIE, AIDE_PILE_FINIE, DUREE_MESSAGE, MESSAGE_ERREUR_PAR_DEFAUT } from './logique.js';
import { DUREES, MOTIF_ANNULATION, bilanDuJour, texteBilan } from './logique-appli.js';

const MESSAGE_LECTURE = 'Impossible de lire les factures à valider. Vérifie ta connexion, puis réessaie.';
const MESSAGE_ANNULEE = 'Décision annulée : la facture est de nouveau à valider';
const ATTENTE_ENTREE = 1500; // au-delà, la facture suivante se montre même si elle charge encore

/** Petit dessin de fin de pile (coche dans un rond, confettis autour) : dessiné par la feuille de style, aucun texte. */
const dessinFin = () => h('div', { class: 'af-confettis', 'aria-hidden': 'true' }, h('span', { class: 'af-conf-rond' }, icone('check', { taille: 44 })), [1, 2, 3, 4, 5, 6].map((n) => h('i', { class: `af-conf af-conf-${n}` })));

/**
 * Monte la pile dans `zone`. `surCompteur(texte | null, { pulse })` : le compteur de l'en-tête ; `surFacture(f | null)` : la facture affichée et lue (bandeaux de l'application) ;
 * `titreTete(f)` : contenu du titre de la facture (nom du fournisseur cliquable).
 * Renvoie { arreter(), passer(), decider('accepter' | 'refuser') → 'fait' | 'attends' | 'impossible', relire() }.
 */
export function creerPile(zone, { surCompteur = () => {}, surFacture = () => {}, titreTete = null } = {}) {
  let vivant = true;
  let numero = 0; // une lecture plus récente rend la précédente caduque
  let passees = []; // factures passées pendant la séance (remises en fin de pile)
  let traitees = new Set(); // factures décidées pendant la séance : jamais remontrées, même si la base tarde à les donner pour décidées
  const seance = { acceptees: 0, refusees: 0, centimes: 0 };
  let arretExaminer = null;
  let occupe = false; // une animation de sortie ou une annulation est en cours : ni « Passer » ni touche
  let minuterie = null;
  let attente = null;
  let courant = null; // { id, pileEl, bouton }
  let dejaMontree = false; // après la première facture, le focus clavier suit la facture suivante
  let ecriture = false; // la page Examiner affichée écrit une décision : on ne la remplace jamais avant la fin (son résultat serait perdu)
  let retourEnAttente = false; // une annulation s'est finie pendant cette écriture : la suite attend sa fin
  let annulations = []; // factures dont l'annulation est en cours : un second clic sur « Annuler » ne rouvre pas deux fois
  const donnees = () => creerDonnees({ client: clientBase(), actions: actionsBase() });

  zone.dataset.role = 'pile';
  const finMinuteries = () => { clearTimeout(minuterie); minuterie = null; clearTimeout(attente); attente = null; };

  /** État simple (chargement, accès, erreur, fin) : plus de facture affichée. */
  function etatSimple(...contenu) {
    arretExaminer?.(); arretExaminer = null; courant = null; ecriture = false;
    surFacture(null);
    remplir(zone, ...contenu);
  }

  async function avancer({ forcer = false, entree = false, pulse = false, discret = false } = {}) {
    const n = ++numero;
    finMinuteries();
    if (!discret) { surCompteur(null); etatSimple(chargement()); }
    let etat = 'illisible';
    try { etat = (await verifierAcces(forcer)).etat; } catch (e) { console.warn('Accès à la base : vérification impossible', e?.code ?? e?.message); }
    if (!vivant || n !== numero) return;
    if (etat !== 'connecte') { occupe = false; surCompteur(null); const z = h('div', {}); dessinerEtatAcces(z, etat, (f) => avancer({ forcer: f })); etatSimple(z); return; }
    let lu;
    try { lu = await donnees().listerAValider(); } catch (e) {
      if (!vivant || n !== numero) return;
      occupe = false; surCompteur(null);
      if (e?.code === 'reconnexion') { const z = h('div', {}); dessinerEtatAcces(z, 'reconnexion', (f) => avancer({ forcer: f })); etatSimple(z); return; }
      console.warn('Pile des factures : lecture impossible', e?.code ?? e?.message);
      etatSimple(etatErreur(MESSAGE_LECTURE, () => avancer()));
      return;
    }
    if (!vivant || n !== numero) return;
    occupe = false;
    const ordre = ordonnerPile(lu.ids.filter((id) => !traitees.has(id)), passees);
    if (ordre.length === 0) { surCompteur(null); await montrerFin(n); return; }
    montrer(ordre[0], ordre.length, lu.complete, { entree, pulse });
  }

  /** Écran de fin : le bilan du jour (décisions lues dans la base ; à défaut, celles de la séance), le lien vers le tableau de bord et le bouton vers la liste. */
  async function montrerFin(n) {
    const bilan = h('p', { class: 'af-bilan', dataset: { role: 'bilan' } }, texteBilan(seance, 'pendant cette séance'));
    etatSimple(h('div', { class: 'af-fin', role: 'status', dataset: { role: 'pile-finie', etat: 'vide' } },
      dessinFin(),
      h('h2', {}, TEXTE_PILE_FINIE),
      h('p', { class: 'aide' }, AIDE_PILE_FINIE),
      bilan,
      h('a', { class: 'af-lien-tableau', href: lien('achatsfactures/tableau'), dataset: { action: 'vers-tableau' } }, icone('chart-column', { taille: 16 }), 'Voir le tableau de bord'),
      h('a', { class: 'bouton bouton-secondaire', href: lien('achatsfactures/liste'), dataset: { action: 'vers-liste' } }, icone('list', { taille: 16 }), 'Voir la liste des factures')));
    zone.querySelector('[data-action="vers-liste"]')?.focus();
    try {
      const lue = await donnees().chargerFactures();
      if (!vivant || n !== numero || !lue.complete) return;
      bilan.textContent = texteBilan(bilanDuJour(lue.liste));
    } catch { /* le bilan de la séance reste affiché */ }
  }

  /** Montre une facture dans la page Examiner. `entree` : elle arrive par la droite (après une décision ou « Passer ») dès qu'elle est lue. */
  function montrer(id, restantes, complete, { entree, pulse }) {
    arretExaminer?.();
    const carte = h('div', { class: `af-carte${entree ? ' af-attend' : ''}`, dataset: { role: 'pile-facture', facture: id } });
    const tampons = h('div', { class: 'af-tampons', 'aria-hidden': 'true' },
      h('div', { class: 'af-tampon af-tampon-v', dataset: { role: 'tampon-validee' } }, 'Validée'), h('div', { class: 'af-tampon af-tampon-r', dataset: { role: 'tampon-refusee' } }, 'Refusée'));
    const pileEl = h('div', { class: 'af-pile', dataset: { role: 'pile-cartes' } },
      restantes >= 2 ? h('div', { class: 'af-dos af-dos-1', 'aria-hidden': 'true' }) : null, restantes >= 3 ? h('div', { class: 'af-dos af-dos-2', 'aria-hidden': 'true' }) : null, carte, tampons);
    remplir(zone, pileEl);
    surCompteur(texteRestantes(restantes, complete), { pulse });
    let revelee = !entree;
    let lue = false; // la page Examiner a fini sa première lecture
    // La facture se montre : si elle charge encore, les bandeaux de la facture PRÉCÉDENTE s'effacent (ils ne la concernent pas).
    const reveler = () => { if (revelee) return; revelee = true; clearTimeout(attente); attente = null; carte.classList.remove('af-attend'); carte.classList.add('af-entre'); if (!lue && courant?.id === id) surFacture(null); };
    if (entree) attente = setTimeout(reveler, ATTENTE_ENTREE);
    const bouton = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'passer' }, title: 'La remettre à la fin de la pile pour cette fois', onclick: () => passer() },
      icone('chevron-right', { taille: 16 }), 'Passer', h('kbd', { class: 'af-touche' }, 'P'));
    courant = { id, pileEl, bouton, lue: false };
    ecriture = false;
    if (!entree) surFacture(null); // montrée tout de suite, encore en chargement : plus de bandeau de la précédente
    arretExaminer = rendreExaminer(carte, id, {
      actionsTete: [bouton], sansRetour: true, titreTete,
      focusTitre: dejaMontree,
      surOccupation: (v) => { // une décision s'écrit : « Passer » (bouton et touche P) attend
        bouton.disabled = v;
        if (courant?.id !== id) return;
        ecriture = v;
        if (!v && retourEnAttente) { retourEnAttente = false; occupe = false; void rafraichirCompteur(); } // l'écriture a échoué : sa page et son message restent ; la facture rouverte revient à la prochaine avancée
      },
      surRendu: ({ etat, f }) => { if (etat === 'chargement' || courant?.id !== id) return; lue = true; courant.lue = etat === 'ok'; reveler(); surFacture(f); },
      surDecision: (info) => decisionPrise(id, info),
      surPerimee: () => { traitees.add(id); passees = passees.filter((x) => x !== id); if (vivant) void avancer({ entree: true }); }, // déjà traitée ailleurs ou archivée : elle n'est plus à valider, on relit la liste
    });
    dejaMontree = true;
  }

  /** Joue la sortie de la facture affichée ('valide', 'refuse' ou 'passe'), puis `puis()`. Sans animation si la personne les a réduites. */
  function sortir(genre, puis) {
    occupe = true;
    if (reduireAnimations() || !courant) { puis(); return; }
    courant.pileEl.classList.add(`af-sort-${genre}`);
    minuterie = setTimeout(() => { minuterie = null; if (vivant) puis(); }, genre === 'passe' ? DUREES.passer : DUREES.sortie);
  }

  function decisionPrise(id, info) {
    if (!vivant) return;
    ecriture = false; retourEnAttente = false; // la liste est relue juste après : une facture rouverte entre-temps y revient
    traitees.add(id); passees = passees.filter((x) => x !== id);
    const acceptee = info.decision === 'acceptee';
    if (acceptee) { seance.acceptees += 1; seance.centimes += centimesSignes(info.facture); } else seance.refusees += 1;
    toast(info.message, { duree: DUREES.annuler, action: { libelle: 'Annuler', surClic: () => { void annulerDecision(id, info); } } });
    sortir(acceptee ? 'valide' : 'refuse', () => avancer({ entree: true, pulse: true, discret: true }));
  }

  /** Compteur relu sans toucher à la page affichée (une facture vient d'être rouverte pendant qu'une autre décision s'écrivait). */
  async function rafraichirCompteur() {
    const n = numero;
    try {
      const lu = await donnees().listerAValider();
      if (!vivant || n !== numero || !courant) return;
      surCompteur(texteRestantes(ordonnerPile(lu.ids.filter((id) => !traitees.has(id)), passees).length, lu.complete), { pulse: true });
    } catch (e) { console.warn('Pile des factures : compteur non relu', e?.code ?? e?.message); }
  }

  /** Suite d'une annulation : la pile avance, SAUF si la page affichée écrit une décision (on attend la fin de cette écriture : la remplacer perdrait son résultat). */
  function reprendre(options) {
    if (!vivant) return;
    if (ecriture) { retourEnAttente = true; return; }
    void avancer(options);
  }

  /**
   * « Annuler » du message : la facture est rouverte (action métier), puis remontrée. Marche aussi si l'on a déjà quitté l'écran (le message survit 3,2 s).
   * Un seul envoi par décision : un double clic (ou un second message) ne rouvre jamais deux fois, et le bilan de la séance ne descend jamais sous zéro.
   */
  async function annulerDecision(id, info) {
    if (annulations.includes(id) || !traitees.has(id)) return;
    annulations.push(id);
    const gele = vivant && !ecriture; // rien ne s'écrit : on arrête l'arrivée de la facture suivante le temps de rouvrir celle-ci
    if (gele) { finMinuteries(); numero += 1; occupe = true; }
    try { await creerDonneesExaminer({ client: clientBase(), actions: actionsBase() }).rouvrir(id, MOTIF_ANNULATION); } catch (e) {
      annulations = annulations.filter((x) => x !== id);
      toast(e instanceof Error && e.message ? e.message : MESSAGE_ERREUR_PAR_DEFAUT, { type: 'erreur', duree: 6000 });
      if (gele) reprendre({ entree: true });
      return;
    }
    annulations = annulations.filter((x) => x !== id);
    traitees = new Set([...traitees].filter((x) => x !== id)); // la facture rouverte revient dans la pile
    if (info.decision === 'acceptee') { seance.acceptees = Math.max(0, seance.acceptees - 1); seance.centimes -= centimesSignes(info.facture); if (seance.acceptees === 0) seance.centimes = 0; } else seance.refusees = Math.max(0, seance.refusees - 1);
    toast(MESSAGE_ANNULEE, { duree: DUREE_MESSAGE });
    reprendre({ entree: true, pulse: true });
  }

  /** « Passer » (bouton ou touche P) : la facture descend, la suivante arrive. Renvoie false si rien n'a été fait. */
  function passer() {
    if (!vivant || occupe || !courant || courant.bouton.disabled) return false;
    passees = passerFacture(passees, courant.id);
    sortir('passe', () => avancer({ entree: true, discret: true }));
    return true;
  }

  /**
   * Touche V ou R : clique le bouton de la page Examiner (mêmes règles, mêmes messages). Renvoie 'fait', ou 'attends' (la facture charge, une décision s'écrit, une animation joue :
   * il n'y a rien à reprocher à la facture, donc aucun message), ou 'impossible' (la facture est là mais son bouton est éteint : il manque quelque chose dans « Ta décision »).
   */
  function decider(action) {
    if (!vivant || occupe || ecriture || !courant?.lue) return 'attends';
    const bouton = zone.querySelector(`[data-bloc="decision"] [data-action="${action}"]`);
    if (!bouton || bouton.disabled) return 'impossible';
    bouton.click();
    return 'fait';
  }

  void avancer();
  return {
    passer, decider,
    /** Relit EN SILENCE la facture affichée (un fournisseur, un chantier ou un IBAN vient de changer dans le volet) : ses contrôles se recalculent, la page n'est pas remontée
     *  (le chantier, l'agence et le motif déjà choisis restent) et le focus clavier ne bouge pas. Rien s'il n'y a pas de facture affichée ou si une décision s'écrit. */
    relire: () => { if (vivant && !occupe && !ecriture && courant) arretExaminer?.relire?.(); },
    arreter: () => { vivant = false; numero += 1; finMinuteries(); arretExaminer?.(); arretExaminer = null; },
  };
}
