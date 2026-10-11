// Écran « Historique » du journal d'activité : 4 compteurs, filtres, liste des exécutions, bandeau si n8n est injoignable.
// Il lit Firestore en direct (donnees.js) : dès que le serveur écrit, la liste change sans rechargement.
// Mise à jour automatique : tant que la page est visible et la case cochée, on demande une copie au serveur toutes les 10 s.
// Texte affiché : toujours en texte simple (h() ne fabrique jamais de HTML), même pour un nom ou un message d'erreur venus de n8n.
import { h, icone, remplir, toast, lirePreference, ecrirePreference, demanderTexte } from '../../os/ui.js';
import * as D from './donnees.js';
import * as L from './logique.js';

const CLE_AUTO = 'journal.auto';

export function rendreHistorique(conteneur) {
  let filtres = { workflowId: '', etat: '' };
  let auto = lirePreference(CLE_AUTO, '1') !== '0';
  let derniereDemande = 0; // dernière demande de copie au serveur (auto ou manuelle)
  let dernierClic = 0; // dernier clic manuel
  let enCours = false;
  let message = ''; // « Impossible de … » après un échec de la demande
  let signature = '';

  const bandeau = h('div', { class: 'journal-bandeau', role: 'status', hidden: true });
  const resume = h('div', { class: 'journal-resume', 'aria-live': 'polite' });
  const miseAJour = h('span', { class: 'journal-maj' }, 'Mis à jour…');
  const caseAuto = h('input', { type: 'checkbox', id: 'journal-auto', checked: auto, onchange: (e) => { auto = e.target.checked; ecrirePreference(CLE_AUTO, auto ? '1' : '0'); } });
  const bouton = h('button', { type: 'button', class: 'bouton bouton-principal', onclick: () => demander(true) }, 'Rafraîchir l’historique');
  const selAutomatisation = h('select', { class: 'champ', 'aria-label': 'Filtrer par automatisation', onchange: (e) => { filtres.workflowId = e.target.value; signature = ''; rendre(); } });
  const selEtat = h('select', { class: 'champ', 'aria-label': 'Filtrer par état', onchange: (e) => { filtres.etat = e.target.value; signature = ''; rendre(); } },
    L.OPTIONS_ETAT.map((o) => h('option', { value: o.valeur }, o.libelle)));
  const liste = h('ol', { class: 'journal-liste' });

  conteneur.append(h('div', { class: 'page page-liste page-journal-activite' },
    h('header', { class: 'page-tete' }, h('h1', {}, 'Automatisations')),
    bandeau,
    h('section', { class: 'journal-barre' }, resume,
      h('div', { class: 'journal-actions' }, miseAJour,
        h('label', { for: 'journal-auto', class: 'journal-case' }, caseAuto, 'Mise à jour automatique (10 s)'), bouton)),
    h('div', { class: 'journal-filtres' }, selAutomatisation, selEtat),
    liste));

  /** Demande une copie au serveur. `manuel` : clic du bouton (message d'erreur visible) ; sinon mise à jour automatique (silencieuse). */
  async function demander(manuel) {
    const maintenant = Date.now();
    if (enCours) return;
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
      ? h('button', { type: 'button', class: 'journal-nom journal-nom-editable', title: 'Cliquer pour renommer', onclick: () => renommer(exe.workflowId, nom) }, nom, icone('pencil', { taille: 13 }))
      : h('span', { class: 'journal-nom' }, nom);
    return h('li', { class: 'journal-ligne', dataset: { id: exe.id, etat: s } },
      h('div', { class: 'journal-principal' }, titre,
        h('div', { class: 'journal-meta' },
          debut === null ? 'heure inconnue' : [h('span', { dataset: { depuis: debut } }, L.depuis(debut, maintenant)), ` · ${L.hhmmss(debut)}`],
          duree ? [' · ', duree.vivant ? ['depuis ', h('span', { dataset: { duree: debut } }, L.formaterDuree(duree.ms))] : duree.texte] : null)),
      h('span', { class: `journal-pastille etat-${s}` }, h('i', { class: 'journal-point' }), L.LIBELLES_ETAT[s]),
      s === 'error' && (exe.errorMessage || exe.failedStep)
        ? h('div', { class: 'journal-erreur' }, h('span', { class: 'journal-erreur-cle' }, 'Étape en échec : '), exe.failedStep || 'inconnue', h('br'), h('code', {}, exe.errorMessage || ''))
        : null,
      s === 'stale' ? h('div', { class: 'journal-indice' }, 'Cette exécution est en cours depuis plus de 10 minutes. Elle est peut-être restée bloquée.') : null);
  }

  function rendre() {
    const maintenant = Date.now();
    const texteBandeau = L.texteBandeau(D.etat.synchro);
    bandeau.hidden = !texteBandeau;
    bandeau.textContent = texteBandeau || '';
    if (!D.etat.pret) { remplir(liste, h('li', { class: 'journal-vide' }, 'Chargement…')); return; }
    remplirFiltreAutomatisations();
    const c = L.compteurs(D.etat.executions, maintenant);
    const visibles = L.filtrer(D.etat.executions, filtres, maintenant);
    // On ne reconstruit la liste que si quelque chose a changé (évite de perdre le focus et de faire clignoter).
    const sig = JSON.stringify([c, filtres, [...D.etat.workflows.values()].map((w) => w.libelle || w.nom), visibles.map((e) => [e.id, L.etatAffiche(e, maintenant), e.stoppedAt && L.enMs(e.stoppedAt), e.errorMessage, e.failedStep])]);
    if (sig === signature) return;
    signature = sig;
    remplir(resume,
      h('span', { class: 'journal-puce run' }, h('b', {}, String(c.enCours)), ' en cours'),
      h('span', { class: 'journal-puce ko' }, h('b', {}, String(c.erreur)), ' en erreur'),
      h('span', { class: 'journal-puce chk' }, h('b', {}, String(c.averifier)), ' à vérifier'),
      h('span', { class: 'journal-puce ok' }, h('b', {}, String(c.terminees)), ' terminées'));
    if (!visibles.length) {
      remplir(liste, h('li', { class: 'journal-vide' }, D.etat.executions.length
        ? 'Aucune exécution ne correspond à ce filtre.'
        : 'Aucune exécution pour le moment. Elles apparaîtront ici dès que vos automatisations tourneront.'));
      return;
    }
    remplir(liste, visibles.map((e) => ligne(e, maintenant)));
  }

  // Une fois par seconde : durées qui s'allongent, « il y a … », bouton, et mise à jour automatique si la page est visible.
  function tic() {
    const maintenant = Date.now();
    liste.querySelectorAll('[data-duree]').forEach((el) => { el.textContent = L.formaterDuree(maintenant - Number(el.dataset.duree)); });
    liste.querySelectorAll('[data-depuis]').forEach((el) => { el.textContent = L.depuis(Number(el.dataset.depuis), maintenant); });
    miseAJour.textContent = message || L.texteMiseAJour(D.etat.synchro, maintenant);
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
