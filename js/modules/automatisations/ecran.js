// Écran « Historique » du module Automatisations (n8n) : 4 compteurs, filtres, liste des exécutions, bandeau si n8n est injoignable.
// Il lit Firestore en direct (donnees.js) : dès que le serveur écrit, la liste change sans rechargement.
// Mise à jour automatique : tant que la page est visible et la case cochée, on demande une copie au serveur toutes les 10 s.
// Chez Jérôme (racine), compte administrateur : ses workflows « interne » se lisent en direct dans sa base ; un filtre « propriétaire » ajoute ceux des clients
// (lus par une fonction serveur, en lecture seule) et la catégorie « À vérifier » (workflows écartés, avec la raison). Le bouton recopie ses propres workflows.
// Chez Jérôme avec un autre compte (assistant) : aucune fonction, aucun bouton, un état vide qui le dit.
// Texte affiché : toujours en texte simple (h() ne fabrique jamais de HTML), même pour un nom ou un message d'erreur venus de n8n.
import { h, icone, remplir, toast, lirePreference, ecrirePreference, demanderTexte } from '../../os/ui.js';
import * as D from './donnees.js';
import * as L from './logique.js';

const CLE_AUTO = 'automatisations.auto';

export function rendreHistorique(conteneur) {
  let filtres = { workflowId: '', etat: '', proprietaire: 'tous' };
  const admin = D.estAdmin();
  let derniereLecture = 0; // dernière lecture des clients (vue administrateur)
  const copiePossible = D.peutRafraichir();
  let auto = copiePossible && lirePreference(CLE_AUTO, '1') !== '0';
  let derniereDemande = 0; // dernière demande de copie au serveur (auto ou manuelle)
  let dernierClic = 0; // dernier clic manuel
  let enCours = false;
  let message = ''; // « Impossible de … » après un échec de la demande
  let signature = '';
  let vue = D.vue('tous'); // ce qui est affiché selon le filtre « propriétaire »

  const bandeau = h('div', { class: 'autom-bandeau', role: 'status', hidden: true });
  const resume = h('div', { class: 'autom-resume', 'aria-live': 'polite' });
  const miseAJour = h('span', { class: 'autom-maj' }, 'Mis à jour…');
  const caseAuto = h('input', { type: 'checkbox', id: 'autom-auto', checked: auto, onchange: (e) => { auto = e.target.checked; ecrirePreference(CLE_AUTO, auto ? '1' : '0'); } });
  const bouton = h('button', { type: 'button', class: 'bouton bouton-principal', onclick: () => demander(true) }, 'Rafraîchir l’historique');
  const selAutomatisation = h('select', { class: 'champ', 'aria-label': 'Filtrer par automatisation', onchange: (e) => { filtres.workflowId = e.target.value; signature = ''; rendre(); } });
  const selEtat = h('select', { class: 'champ', 'aria-label': 'Filtrer par état', onchange: (e) => { filtres.etat = e.target.value; signature = ''; rendre(); } },
    L.OPTIONS_ETAT.map((o) => h('option', { value: o.valeur }, o.libelle)));
  const liste = h('ol', { class: 'autom-liste' });
  const selProprietaire = h('select', { class: 'champ', 'aria-label': 'Filtrer par propriétaire', onchange: (e) => changerProprietaire(e.target.value) });
  const alerteVerifier = h('button', { type: 'button', class: 'autom-alerte-verifier', hidden: true, onclick: () => changerProprietaire('a-verifier') });

  conteneur.append(h('div', { class: 'page page-liste page-automatisations' },
    h('header', { class: 'page-tete' }, h('h1', {}, 'Automatisations')),
    bandeau,
    h('section', { class: 'autom-barre' }, resume,
      h('div', { class: 'autom-actions' }, miseAJour,
        copiePossible ? h('label', { for: 'autom-auto', class: 'autom-case' }, caseAuto, 'Mise à jour automatique (10 s)') : null,
        copiePossible ? bouton : null)),
    h('div', { class: 'autom-filtres' }, admin ? selProprietaire : null, selAutomatisation, selEtat),
    admin ? alerteVerifier : null,
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
      if (admin) lireClients(true);
    } catch (e) {
      console.warn('Rafraîchissement impossible', e?.code);
      message = 'Impossible de rafraîchir pour le moment.';
      if (manuel) toast(message, { type: 'erreur' });
    } finally {
      enCours = false;
      tic();
    }
  }

  /** Vue administrateur : relit les clients (fonction serveur, lecture seule). 'interne' et 'À vérifier' n'ont pas besoin d'une lecture à part. */
  function lireClients(force = false) {
    if (!admin) return;
    const maintenant = Date.now();
    if (!force && maintenant - derniereLecture < 30000) return;
    derniereLecture = maintenant;
    const cible = filtres.proprietaire === L.PROPRIETAIRE_INTERNE || filtres.proprietaire === L.FILTRE_A_VERIFIER ? 'tous' : filtres.proprietaire;
    D.chargerClients(cible);
  }

  function changerProprietaire(valeur) {
    filtres = { ...filtres, proprietaire: valeur, workflowId: '' };
    signature = '';
    selProprietaire.value = valeur;
    if (valeur !== L.PROPRIETAIRE_INTERNE && valeur !== L.FILTRE_A_VERIFIER) lireClients(true);
    rendre();
  }

  function remplirFiltreProprietaires() {
    const options = L.optionsProprietaires(D.etat.admin.proprietaires, D.etat.admin.aVerifier.length);
    const sig = JSON.stringify(options);
    if (selProprietaire.dataset.sig === sig) return;
    selProprietaire.dataset.sig = sig;
    remplir(selProprietaire, options.map((o) => h('option', { value: o.valeur }, o.libelle)));
    if (!options.some((o) => o.valeur === filtres.proprietaire)) filtres.proprietaire = 'tous';
    selProprietaire.value = filtres.proprietaire;
  }

  /** Une carte « À vérifier » : le workflow, la raison en français simple, d'où vient le signalement. Texte simple uniquement. */
  function carteAVerifier(i) {
    return h('li', { class: 'autom-ligne autom-averifier', dataset: { raison: i.raison || '' } },
      h('div', { class: 'autom-principal' }, h('span', { class: 'autom-nom' }, i.nom || 'Workflow sans nom'),
        h('div', { class: 'autom-meta' }, `Identifiant n8n : ${i.workflowId || '—'}`)),
      h('span', { class: 'autom-pastille etat-stale' }, h('i', { class: 'autom-point' }), 'À vérifier'),
      h('div', { class: 'autom-indice' }, i.message || 'Les signes de ce workflow ne concordent pas : il n’est pas copié.'));
  }

  function remplirFiltreAutomatisations() {
    const options = L.optionsAutomatisations(vue.workflows, vue.executions);
    const sig = JSON.stringify(options);
    if (selAutomatisation.dataset.sig === sig) return;
    selAutomatisation.dataset.sig = sig;
    remplir(selAutomatisation, h('option', { value: '' }, 'Toutes les automatisations'), options.map((o) => h('option', { value: o.id }, o.nom)));
    selAutomatisation.value = options.some((o) => o.id === filtres.workflowId) ? filtres.workflowId : '';
    filtres.workflowId = selAutomatisation.value;
  }

  /** Clic sur le nom : un éditeur le change (le serveur vérifie qu'il l'est). Texte vide = revenir au nom d'origine. */
  async function renommer(workflowId, nomActuel) {
    const w = vue.workflows.get(workflowId);
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
    const nom = L.nomAffiche(exe.workflowId, vue.workflows, exe);
    const titre = D.peutRenommer()
      ? h('button', { type: 'button', class: 'autom-nom autom-nom-editable', title: 'Cliquer pour renommer', onclick: () => renommer(exe.workflowId, nom) }, nom, icone('pencil', { taille: 13 }))
      : h('span', { class: 'autom-nom' }, nom);
    return h('li', { class: 'autom-ligne', dataset: { id: exe.id, etat: s } },
      h('div', { class: 'autom-principal' }, titre,
        h('div', { class: 'autom-meta' },
          debut === null ? 'heure inconnue' : [h('span', { dataset: { depuis: debut } }, L.depuis(debut, maintenant)), ` · ${L.hhmmss(debut)}`],
          duree ? [' · ', duree.vivant ? ['depuis ', h('span', { dataset: { duree: debut } }, L.formaterDuree(duree.ms))] : duree.texte] : null)),
      admin ? h('span', { class: 'autom-proprio' }, L.nomProprietaire(exe.proprietaire, D.etat.admin.proprietaires)) : null,
      h('span', { class: `autom-pastille etat-${s}` }, h('i', { class: 'autom-point' }), L.LIBELLES_ETAT[s]),
      s === 'error' && (exe.errorMessage || exe.failedStep)
        ? h('div', { class: 'autom-erreur' }, h('span', { class: 'autom-erreur-cle' }, 'Étape en échec : '), exe.failedStep || 'inconnue', h('br'), h('code', {}, exe.errorMessage || ''))
        : null,
      s === 'stale' ? h('div', { class: 'autom-indice' }, 'Cette exécution est en cours depuis plus de 10 minutes. Elle est peut-être restée bloquée.') : null);
  }

  function rendre() {
    const maintenant = Date.now();
    vue = D.vue(filtres.proprietaire);
    const texteBandeau = admin ? L.texteBandeauAdmin({ synchroInterne: D.etat.synchro, admin: D.etat.admin, filtre: filtres.proprietaire }) : L.texteBandeau(D.etat.synchro);
    bandeau.hidden = !texteBandeau;
    bandeau.textContent = texteBandeau || '';
    if (!D.etat.pret) { remplir(liste, h('li', { class: 'autom-vide' }, 'Chargement…')); return; }
    if (admin) remplirFiltreProprietaires();
    remplirFiltreAutomatisations();
    const nbVerifier = admin ? D.etat.admin.aVerifier.length : 0;
    alerteVerifier.hidden = !(admin && nbVerifier > 0 && filtres.proprietaire !== L.FILTRE_A_VERIFIER);
    alerteVerifier.textContent = `${nbVerifier} workflow${nbVerifier > 1 ? 's' : ''} à vérifier : voir pourquoi`;
    const c = L.compteurs(vue.executions, maintenant);
    const visibles = L.filtrer(vue.executions, filtres, maintenant);
    // On ne reconstruit la liste que si quelque chose a changé (évite de perdre le focus et de faire clignoter).
    const sig = JSON.stringify([c, filtres, [...vue.workflows.values()].map((w) => w.libelle || w.nom), admin && D.etat.admin.aVerifier, visibles.map((e) => [e.id, L.etatAffiche(e, maintenant), e.stoppedAt && L.enMs(e.stoppedAt), e.errorMessage, e.failedStep])]);
    if (sig === signature) return;
    signature = sig;
    remplir(resume,
      h('span', { class: 'autom-puce run' }, h('b', {}, String(c.enCours)), ' en cours'),
      h('span', { class: 'autom-puce ko' }, h('b', {}, String(c.erreur)), ' en erreur'),
      h('span', { class: 'autom-puce chk' }, h('b', {}, String(c.averifier)), ' à vérifier'),
      h('span', { class: 'autom-puce ok' }, h('b', {}, String(c.terminees)), ' terminées'));
    if (admin && filtres.proprietaire === L.FILTRE_A_VERIFIER) {
      remplir(liste, D.etat.admin.aVerifier.length
        ? D.etat.admin.aVerifier.map(carteAVerifier)
        : h('li', { class: 'autom-vide' }, 'Rien à vérifier : tous les workflows reconnus ont leurs trois signes (étiquette, nom, clé de la porte).'));
      return;
    }
    if (!visibles.length) {
      remplir(liste, h('li', { class: 'autom-vide' }, vue.executions.length
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
    if (admin && document.visibilityState === 'visible') lireClients(false);
    if (L.doitRafraichirAuto({ active: auto, visible: document.visibilityState === 'visible', derniereDemande, maintenant, enCours })) demander(false);
  }

  const arretDonnees = D.surChangement(rendre);
  lireClients(true);
  const minuteur = setInterval(tic, 1000);
  rendre();
  tic();
  return function quitter() {
    clearInterval(minuteur);
    arretDonnees();
  };
}
