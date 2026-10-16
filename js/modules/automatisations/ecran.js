// Écran « Historique » du module Automatisations (n8n) : 4 compteurs, filtres, liste des exécutions, bandeau si n8n est injoignable.
// Il lit Firestore en direct (donnees.js) : dès que le serveur écrit, la liste change sans rechargement.
// Mise à jour automatique : tant que la page est visible et la case cochée, on demande une copie au serveur toutes les 10 s.
// Chez Jérôme (racine), aucune fonction de copie n'existe encore (elles sont dans le projet des clients) : pas de bouton ni de mise à jour
// automatique, et un état vide qui le dit. Les données déjà présentes dans la base (workflows, executions, sync) s'affichent quand même.
// Texte affiché : toujours en texte simple (h() ne fabrique jamais de HTML), même pour un nom ou un message d'erreur venus de n8n.
import { h, icone, remplir, toast, lirePreference, ecrirePreference, demanderTexte } from '../../os/ui.js';
import * as D from './donnees.js';
import * as L from './logique.js';

const CLE_AUTO = 'automatisations.auto';

export function rendreHistorique(conteneur) {
  let filtres = { workflowId: '', etat: '' };
  const copiePossible = D.peutRafraichir();
  let auto = copiePossible && lirePreference(CLE_AUTO, '1') !== '0';
  let derniereDemande = 0; // dernière demande de copie au serveur (auto ou manuelle)
  let dernierClic = 0; // dernier clic manuel
  let enCours = false;
  let message = ''; // « Impossible de … » après un échec de la demande
  let signature = '';

  const bandeau = h('div', { class: 'autom-bandeau', role: 'status', hidden: true });
  const resume = h('div', { class: 'autom-resume', 'aria-live': 'polite' });
  const miseAJour = h('span', { class: 'autom-maj' }, 'Mis à jour…');
  const caseAuto = h('input', { type: 'checkbox', id: 'autom-auto', checked: auto, onchange: (e) => { auto = e.target.checked; ecrirePreference(CLE_AUTO, auto ? '1' : '0'); } });
  const bouton = h('button', { type: 'button', class: 'bouton bouton-principal', onclick: () => demander(true) }, 'Rafraîchir l’historique');
  const selAutomatisation = h('select', { class: 'champ', 'aria-label': 'Filtrer par automatisation', onchange: (e) => { filtres.workflowId = e.target.value; signature = ''; rendre(); } });
  const selEtat = h('select', { class: 'champ', 'aria-label': 'Filtrer par état', onchange: (e) => { filtres.etat = e.target.value; signature = ''; rendre(); } },
    L.OPTIONS_ETAT.map((o) => h('option', { value: o.valeur }, o.libelle)));
  const liste = h('ol', { class: 'autom-liste' });

  conteneur.append(h('div', { class: 'page page-liste page-automatisations' },
    h('header', { class: 'page-tete' }, h('h1', {}, 'Automatisations')),
    bandeau,
    h('section', { class: 'autom-barre' }, resume,
      h('div', { class: 'autom-actions' }, miseAJour,
        copiePossible ? h('label', { for: 'autom-auto', class: 'autom-case' }, caseAuto, 'Mise à jour automatique (10 s)') : null,
        copiePossible ? bouton : null)),
    h('div', { class: 'autom-filtres' }, selAutomatisation, selEtat),
    liste));

  /** Demande une copie au serveur. `manuel` : clic du bouton (message d'erreur visible) ; sinon mise à jour automatique (silencieuse). */
  async function demander(manuel) {
    const maintenant = Date.now();
    if (enCours || !copiePossible) return;
    if (manuel) {
      if (L.attenteRafraichir(dernierClic, maintenant) > 0) return;
      dernierClic = maintenant;
    }
    derniereDemande = maintenant;
    enCours = true;
    try {
      await D.rafraichir();
      message = '';
    } catch (e) {
      console.warn('Rafraîchissement impossible', e?.code);
      message = 'Impossible de rafraîchir pour le moment.';
      if (manuel) toast(message, { type: 'erreur' });
    } finally {
      enCours = false;
      tic();
    }
  }

  function remplirFiltreAutomatisations() {
    const options = L.optionsAutomatisations(D.etat.workflows, D.etat.executions);
    const sig = JSON.stringify(options);
    if (selAutomatisation.dataset.sig === sig) return;
    selAutomatisation.dataset.sig = sig;
    remplir(selAutomatisation, h('option', { value: '' }, 'Toutes les automatisations'), options.map((o) => h('option', { value: o.id }, o.nom)));
    selAutomatisation.value = options.some((o) => o.id === filtres.workflowId) ? filtres.workflowId : '';
    filtres.workflowId = selAutomatisation.value;
  }

  /** Clic sur le nom : un éditeur le change (le serveur vérifie qu'il l'est). Texte vide = revenir au nom d'origine. */
  async function renommer(workflowId, nomActuel) {
    const w = D.etat.workflows.get(workflowId);
    const saisi = await demanderTexte('Nom affiché de cette automatisation', {
      libelle: `Nom d’origine dans n8n : ${w?.nom || nomActuel}. Laisse vide pour le retrouver.`, valeur: nomActuel,
    });
    if (saisi === null || saisi === nomActuel) return;
    try {
      await D.renommer(workflowId, saisi);
      toast('Nom enregistré.');
    } catch (e) {
      console.warn('Renommage impossible', e?.code);
      toast(e?.code === 'functions/invalid-argument' ? 'Ce nom n’est pas valide (80 caractères au plus).' : 'Impossible de renommer pour le moment.', { type: 'erreur' });
    }
  }

  function ligne(exe, maintenant) {
    const s = L.etatAffiche(exe, maintenant);
    const debut = L.enMs(exe.startedAt);
    const duree = L.texteDuree(exe, maintenant);
    const nom = L.nomAffiche(exe.workflowId, D.etat.workflows, exe);
    const titre = D.peutRenommer()
      ? h('button', { type: 'button', class: 'autom-nom autom-nom-editable', title: 'Cliquer pour renommer', onclick: () => renommer(exe.workflowId, nom) }, nom, icone('pencil', { taille: 13 }))
      : h('span', { class: 'autom-nom' }, nom);
    return h('li', { class: 'autom-ligne', dataset: { id: exe.id, etat: s } },
      h('div', { class: 'autom-principal' }, titre,
        h('div', { class: 'autom-meta' },
          debut === null ? 'heure inconnue' : [h('span', { dataset: { depuis: debut } }, L.depuis(debut, maintenant)), ` · ${L.hhmmss(debut)}`],
          duree ? [' · ', duree.vivant ? ['depuis ', h('span', { dataset: { duree: debut } }, L.formaterDuree(duree.ms))] : duree.texte] : null)),
      h('span', { class: `autom-pastille etat-${s}` }, h('i', { class: 'autom-point' }), L.LIBELLES_ETAT[s]),
      s === 'error' && (exe.errorMessage || exe.failedStep)
        ? h('div', { class: 'autom-erreur' }, h('span', { class: 'autom-erreur-cle' }, 'Étape en échec : '), exe.failedStep || 'inconnue', h('br'), h('code', {}, exe.errorMessage || ''))
        : null,
      s === 'stale' ? h('div', { class: 'autom-indice' }, 'Cette exécution est en cours depuis plus de 10 minutes. Elle est peut-être restée bloquée.') : null);
  }

  function rendre() {
    const maintenant = Date.now();
    const texteBandeau = L.texteBandeau(D.etat.synchro);
    bandeau.hidden = !texteBandeau;
    bandeau.textContent = texteBandeau || '';
    if (!D.etat.pret) { remplir(liste, h('li', { class: 'autom-vide' }, 'Chargement…')); return; }
    remplirFiltreAutomatisations();
    const c = L.compteurs(D.etat.executions, maintenant);
    const visibles = L.filtrer(D.etat.executions, filtres, maintenant);
    // On ne reconstruit la liste que si quelque chose a changé (évite de perdre le focus et de faire clignoter).
    const sig = JSON.stringify([c, filtres, [...D.etat.workflows.values()].map((w) => w.libelle || w.nom), visibles.map((e) => [e.id, L.etatAffiche(e, maintenant), e.stoppedAt && L.enMs(e.stoppedAt), e.errorMessage, e.failedStep])]);
    if (sig === signature) return;
    signature = sig;
    remplir(resume,
      h('span', { class: 'autom-puce run' }, h('b', {}, String(c.enCours)), ' en cours'),
      h('span', { class: 'autom-puce ko' }, h('b', {}, String(c.erreur)), ' en erreur'),
      h('span', { class: 'autom-puce chk' }, h('b', {}, String(c.averifier)), ' à vérifier'),
      h('span', { class: 'autom-puce ok' }, h('b', {}, String(c.terminees)), ' terminées'));
    if (!visibles.length) {
      remplir(liste, h('li', { class: 'autom-vide' }, D.etat.executions.length
        ? 'Aucune exécution ne correspond à ce filtre.'
        : copiePossible
          ? 'Aucune exécution pour le moment. Elles apparaîtront ici dès que vos automatisations tourneront.'
          : 'Aucune automatisation n’a encore été copiée dans cette base. Elles apparaîtront ici quand la copie depuis n8n sera branchée.'));
      return;
    }
    remplir(liste, visibles.map((e) => ligne(e, maintenant)));
  }

  // Une fois par seconde : durées qui s'allongent, « il y a … », bouton, et mise à jour automatique si la page est visible.
  function tic() {
    const maintenant = Date.now();
    liste.querySelectorAll('[data-duree]').forEach((el) => { el.textContent = L.formaterDuree(maintenant - Number(el.dataset.duree)); });
    liste.querySelectorAll('[data-depuis]').forEach((el) => { el.textContent = L.depuis(Number(el.dataset.depuis), maintenant); });
    miseAJour.textContent = copiePossible ? message || L.texteMiseAJour(D.etat.synchro, maintenant) : '';
    const reste = L.attenteRafraichir(dernierClic, maintenant);
    bouton.disabled = reste > 0 || enCours;
    bouton.textContent = reste > 0 ? `Rafraîchir (${reste} s)` : 'Rafraîchir l’historique';
    rendre(); // recalcule « à vérifier » quand le temps passe
    if (L.doitRafraichirAuto({ active: auto, visible: document.visibilityState === 'visible', derniereDemande, maintenant, enCours })) demander(false);
  }

  const arretDonnees = D.surChangement(rendre);
  const minuteur = setInterval(tic, 1000);
  rendre();
  tic();
  return function quitter() {
    clearInterval(minuteur);
    arretDonnees();
  };
}
