// Écran « Historique » du module Automatisations (n8n) : 4 compteurs, filtres, liste des exécutions, bandeau si n8n est injoignable.
// Il lit Firestore en direct (donnees.js) : dès que le serveur écrit, la liste change sans rechargement.
// Mise à jour automatique : tant que la page est visible et la case cochée, on demande une copie au serveur toutes les 10 s.
// Chez Jérôme (racine), compte administrateur : ses workflows « interne » se lisent en direct dans sa base ; un filtre « propriétaire » ajoute ceux des clients
// (lus par une fonction serveur, en lecture seule) et la catégorie « À vérifier » (workflows écartés, avec la raison). Le bouton recopie ses propres workflows.
// Chez Jérôme avec un autre compte (assistant) : aucune fonction, aucun bouton, un état vide qui le dit.
// Texte affiché : toujours en texte simple (h() ne fabrique jamais de HTML), même pour un nom ou un message d'erreur venus de n8n.
import { h, icone, remplir, toast, lirePreference, ecrirePreference, demanderTexte } from '../../os/ui.js';
import { barreOnglets } from '../../os/onglets.js';
import { ongletsDuModule } from '../../os/registre.js';
import * as D from './donnees.js';
import * as L from './logique.js';
import { boutonFiltres, fenetreFiltres } from '../crm/filtres.js';

const CLE_AUTO = 'automatisations.auto';

// Cases cochées de la fenêtre « Filtres » : gardées tant que la page n'est pas rechargée (variable de module, aucun stockage navigateur) et oubliées à la déconnexion.
let criteres = L.criteresVides();
export function oublierFiltresAutomatisations() { criteres = L.criteresVides(); }

export function rendreHistorique(conteneur) {
  let filtres = { proprietaire: 'tous' }; // seul le propriétaire (administrateur) reste hors de la fenêtre « Filtres »
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
  const boutonF = boutonFiltres({ auClic: ouvrirFiltres });
  boutonF.element.hidden = true; // caché tant que les données ne sont pas là (sinon la fenêtre s'ouvrirait sans aucune case)
  const liste = h('ol', { class: 'autom-liste' });
  const selProprietaire = h('select', { class: 'champ', 'aria-label': 'Filtrer par propriétaire', onchange: (e) => changerProprietaire(e.target.value) });
  const alerteVerifier = h('button', { type: 'button', class: 'autom-alerte-verifier', hidden: true, onclick: () => changerProprietaire('a-verifier') });

  conteneur.append(h('div', { class: 'page page-liste page-automatisations' },
    h('header', { class: 'page-tete' }, h('h1', {}, 'Automatisations')),
    barreOnglets({ onglets: ongletsDuModule('automatisations'), actif: 'automatisations/historique', etiquette: 'Écrans des automatisations', module: 'automatisations' }),
    bandeau,
    h('section', { class: 'autom-barre' }, resume,
      h('div', { class: 'autom-actions' }, miseAJour,
        copiePossible ? h('label', { for: 'autom-auto', class: 'autom-case' }, caseAuto, 'Mise à jour automatique (10 s)') : null,
        copiePossible ? bouton : null)),
    h('div', { class: 'autom-filtres' }, admin ? selProprietaire : null, boutonF.element),
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
    const cible = filtres.proprietaire === L.PROPRIETAIRE_INTERNE || L.estCategorieWorkflows(filtres.proprietaire) ? 'tous' : filtres.proprietaire;
    D.chargerClients(cible);
  }

  function changerProprietaire(valeur) {
    filtres = { proprietaire: valeur }; // changer de propriétaire vide les cases cochées
    criteres = L.criteresVides();
    signature = '';
    selProprietaire.value = valeur;
    if (valeur !== L.PROPRIETAIRE_INTERNE && !L.estCategorieWorkflows(valeur)) lireClients(true);
    rendre();
  }

  function remplirFiltreProprietaires() {
    const options = L.optionsProprietaires(D.etat.admin.proprietaires, L.signalementsDe(D.etat.admin.aVerifier, L.FILTRE_A_VERIFIER).length, L.signalementsDe(D.etat.admin.aVerifier, L.FILTRE_SANS_MODULE).length);
    const sig = JSON.stringify(options);
    if (selProprietaire.dataset.sig === sig) return;
    selProprietaire.dataset.sig = sig;
    remplir(selProprietaire, options.map((o) => h('option', { value: o.valeur }, o.libelle)));
    if (!options.some((o) => o.valeur === filtres.proprietaire)) filtres.proprietaire = 'tous';
    selProprietaire.value = filtres.proprietaire;
  }

  /** Une carte de workflow non copié : son vrai nom, la raison en français, puis une ligne par signe (✔ concorde, ✘ manque ou diverge). Texte simple uniquement. */
  function carteWorkflow(i) {
    return h('li', { class: 'autom-ligne autom-averifier', dataset: { raison: i.raison || '', categorie: i.categorie || '' } },
      h('div', { class: 'autom-principal' }, h('span', { class: 'autom-nom' }, i.nom || `Workflow n°${i.workflowId || '?'} (nom non fourni)`),
        h('div', { class: 'autom-meta' }, `Identifiant n8n : ${i.workflowId || '—'}${i.proprietaire ? ` · vise : ${L.nomProprietaire(i.proprietaire, D.etat.admin.proprietaires)}` : ''}`)),
      h('span', { class: `autom-pastille ${i.categorie === 'sans-module' ? 'etat-canceled' : 'etat-stale'}` }, h('i', { class: 'autom-point' }), i.categorie === 'sans-module' ? 'Client sans le module' : 'Non reconnu'),
      h('div', { class: 'autom-indice' }, i.message || 'Les signes de ce workflow ne concordent pas : il n’est pas copié.'),
      i.lignes?.length ? h('ul', { class: 'autom-signes' }, i.lignes.map((l) => h('li', { class: l.ok ? 'ok' : 'ko' }, h('b', {}, `${l.ok ? '✔' : '✘'} ${l.signe} : `), l.texte))) : null);
  }

  /** Fenêtre « Filtres » commune : une case par automatisation et par état qui existent chez le propriétaire choisi. */
  async function ouvrirFiltres() {
    const maintenant = Date.now();
    const r = await fenetreFiltres({
      controles: [
        { cle: 'workflowIds', libelle: 'Automatisation', type: 'cases', options: L.optionsAutomatisations(vue.workflows, vue.executions).map((o) => ({ valeur: o.id, libelle: o.nom })) },
        { cle: 'etats', libelle: 'État', type: 'cases', options: L.optionsEtatCases(vue.executions, maintenant).map((o) => ({ valeur: o.valeur, libelle: o.libelle })) },
      ],
      criteres,
      effacer: L.criteresVides,
    });
    if (!r) return;
    criteres = { workflowIds: r.workflowIds, etats: r.etats };
    signature = '';
    rendre();
  }

  function reinitialiserFiltres() {
    filtres = { proprietaire: 'tous' };
    criteres = L.criteresVides();
    selProprietaire.value = 'tous';
    signature = '';
    lireClients(true);
    rendre();
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
    // Vue « workflows non reconnus » ou « clients sans le module » : ce sont des workflows, pas des exécutions ; les filtres d'automatisation et d'état n'ont pas de sens.
    const categorie = admin && L.estCategorieWorkflows(filtres.proprietaire);
    resume.hidden = categorie;
    if (!categorie) {
      // Une case dont l'automatisation ou l'état n'existe plus (chez ce propriétaire) est décochée toute seule ; sans aucune case possible, le bouton se cache.
      const optionsAutos = L.optionsAutomatisations(vue.workflows, vue.executions);
      const optionsEtats = L.optionsEtatCases(vue.executions, maintenant);
      criteres = L.nettoyerCriteres(criteres, optionsAutos, optionsEtats);
      boutonF.element.hidden = !optionsAutos.length && !optionsEtats.length;
    } else boutonF.element.hidden = true;
    const nbCases = L.compterCriteres(criteres);
    if (boutonF.element.dataset.compte !== String(nbCases)) { boutonF.element.dataset.compte = String(nbCases); boutonF.majCompte(nbCases); }
    const nbVerifier = admin ? L.signalementsDe(D.etat.admin.aVerifier, L.FILTRE_A_VERIFIER).length : 0;
    alerteVerifier.hidden = !(admin && nbVerifier > 0 && filtres.proprietaire !== L.FILTRE_A_VERIFIER);
    alerteVerifier.textContent = `${nbVerifier} workflow${nbVerifier > 1 ? 's' : ''} non reconnu${nbVerifier > 1 ? 's' : ''} : voir pourquoi`;
    const c = L.compteurs(vue.executions, maintenant);
    const visibles = L.filtrer(vue.executions, criteres, maintenant);
    // On ne reconstruit la liste que si quelque chose a changé (évite de perdre le focus et de faire clignoter).
    const sig = JSON.stringify([c, filtres, criteres, [...vue.workflows.values()].map((w) => w.libelle || w.nom), admin && D.etat.admin.aVerifier, visibles.map((e) => [e.id, L.etatAffiche(e, maintenant), e.stoppedAt && L.enMs(e.stoppedAt), e.errorMessage, e.failedStep])]);
    if (sig === signature) return;
    signature = sig;
    remplir(resume,
      h('span', { class: 'autom-puce run' }, h('b', {}, String(c.enCours)), ' en cours'),
      h('span', { class: 'autom-puce ko' }, h('b', {}, String(c.erreur)), ' en erreur'),
      h('span', { class: 'autom-puce chk' }, h('b', {}, String(c.averifier)), ' exécutions à vérifier'),
      h('span', { class: 'autom-puce ok' }, h('b', {}, String(c.terminees)), ' terminées'));
    if (admin && L.estCategorieWorkflows(filtres.proprietaire)) {
      const cartes = L.signalementsDe(D.etat.admin.aVerifier, filtres.proprietaire);
      remplir(liste, cartes.length
        ? cartes.map(carteWorkflow)
        : h('li', { class: 'autom-vide' }, filtres.proprietaire === L.FILTRE_SANS_MODULE ? 'Aucun client sans le module n’a de workflow étiqueté.' : 'Aucun workflow non reconnu : tous ceux qui ont un signe de propriétaire ont leurs signes en règle.'));
      return;
    }
    if (!visibles.length) {
      const filtreActif = L.compterCriteres(criteres) || (admin && filtres.proprietaire !== 'tous');
      if (filtreActif) {
        remplir(liste, h('li', { class: 'autom-vide autom-aucun-resultat' }, 'Rien à afficher avec ces filtres. Décoche un filtre. ',
          h('button', { type: 'button', class: 'bouton', onclick: reinitialiserFiltres }, 'Réinitialiser les filtres')));
        return;
      }
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
