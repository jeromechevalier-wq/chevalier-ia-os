// Fiche prospect : panneau latéral (plein écran sur téléphone), création, changements d'étape, prochaine action.
import { h, icone, vider, dialogue, toast } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import { COMPTES_AUTORISES } from '../../os/firebase-config.js';
import { celebrerGagne, celebrerPaiement, charlesContent } from '../../os/celebrations.js';
import * as D from './donnees.js';
import * as L from './logique.js';

// ---------------------------------------------------------------- petits composants

export function pastilleEtape(etape) {
  return h('span', { class: 'pastille-etape', style: { '--c': L.couleurEtape(etape) }, dataset: { etape } }, L.libelleEtape(etape));
}

export function pastillePriorite(priorite) {
  if (!priorite) return null;
  return h('span', { class: `pastille-priorite prio-${priorite}`, title: `Priorité : ${L.libellePriorite(priorite)}` }, L.libellePriorite(priorite));
}

function nomAuteur(email) {
  return COMPTES_AUTORISES[email]?.nom || email || '';
}

function boutonsDatesRapides(champDate) {
  const aujourdhui = D.ctx().aujourdhui;
  return h('div', { class: 'dates-rapides', role: 'group', 'aria-label': 'Dates rapides' },
    L.DATES_RAPIDES.map((b) => h('button', {
      type: 'button', class: 'bouton bouton-secondaire bouton-petit', dataset: { dateRapide: b.id },
      onclick: () => { champDate.value = L.dateRapide(b.id, aujourdhui); champDate.dispatchEvent(new Event('change', { bubbles: true })); },
    }, b.libelle)));
}

function blocChamp(libelle, controle, { id, obligatoire = false, aide, erreurPour } = {}) {
  const idChamp = id || `c-${Math.random().toString(36).slice(2, 8)}`;
  if (controle instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(controle.tagName)) controle.id = idChamp;
  return h('div', { class: 'bloc-champ', dataset: erreurPour ? { erreurPour } : {} },
    h('label', { class: 'etiquette', for: idChamp }, libelle, obligatoire ? h('span', { class: 'obligatoire', 'aria-hidden': 'true' }, ' *') : null),
    controle,
    aide ? h('span', { class: 'aide' }, aide) : null,
    erreurPour ? h('span', { class: 'erreur', role: 'alert', dataset: { erreur: erreurPour } }) : null);
}

function select(options, valeur, attrs = {}) {
  const s = h('select', { class: 'champ', ...attrs },
    options.map((o) => h('option', { value: o.valeur }, o.libelle)));
  s.value = valeur ?? '';
  return s;
}

function optionsListe(liste, valeurActuelle, videLibelle = 'Choisir…') {
  const opts = [{ valeur: '', libelle: videLibelle }, ...liste.map((x) => ({ valeur: x, libelle: x }))];
  if (valeurActuelle && !liste.includes(valeurActuelle)) opts.push({ valeur: valeurActuelle, libelle: valeurActuelle });
  return opts;
}

function optionsOffres(valeurActuelle) {
  const opts = [{ valeur: '', libelle: 'Aucune' }];
  for (const o of D.etat.offres) {
    if (o.actif !== false || o.id === valeurActuelle) opts.push({ valeur: o.id, libelle: o.actif === false ? `${o.nom} (archivée)` : o.nom });
  }
  if (valeurActuelle && !D.etat.offres.some((o) => o.id === valeurActuelle)) opts.push({ valeur: valeurActuelle, libelle: valeurActuelle });
  return opts;
}

// ---------------------------------------------------------------- boîtes de dialogue métier

/** Boîte "Prochaine action" (après "Fait" ou "Planifier"). */
export async function dialogueProchaineAction(f, { titre = 'Prochaine action' } = {}) {
  const texte = h('input', { type: 'text', class: 'champ', value: f.prochaineAction || '', placeholder: 'Ex. Relancer par téléphone', 'aria-label': 'Prochaine action', autofocus: true });
  const date = h('input', { type: 'date', class: 'champ', value: f.dateProchaineAction || '', 'aria-label': 'Date de la prochaine action' });
  const r = await dialogue({
    titre,
    classe: 'dialogue-prochaine-action',
    contenu: h('div', { class: 'pile' },
      h('p', { class: 'aide' }, f.nom),
      blocChamp('Action', texte),
      blocChamp('Date', date),
      boutonsDatesRapides(date)),
    boutons: [
      { libelle: 'Plus tard', valeur: null },
      { libelle: 'Enregistrer', valeur: () => ({ texte: texte.value, date: date.value }), style: 'principal' },
    ],
  });
  if (!r || (!r.texte.trim() && !r.date)) return false;
  await D.majFiche(f.id, L.fixerAction(r.texte, r.date || null));
  return true;
}

async function dialogueRaisonPerdu() {
  const raison = select([{ valeur: '', libelle: 'Choisir une raison…' }, ...L.RAISONS_PERDU.map((x) => ({ valeur: x, libelle: x }))], '', { 'aria-label': 'Raison' });
  const detail = h('input', { type: 'text', class: 'champ', placeholder: 'Précision (facultatif)', 'aria-label': 'Précision' });
  return dialogue({
    titre: 'Passer en Perdu',
    contenu: h('div', { class: 'pile' }, blocChamp('Raison', raison, { obligatoire: true }), blocChamp('Précision', detail)),
    boutons: [
      { libelle: 'Annuler', valeur: null },
      { libelle: 'Valider', style: 'principal', valeur: () => ({ raisonPerdu: raison.value, raisonPerduDetail: detail.value.trim() || null }),
        avantFermeture: () => { if (!raison.value) { raison.focus(); raison.classList.add('invalide'); return false; } return true; } },
    ],
  });
}

async function dialogueReveil() {
  const date = h('input', { type: 'date', class: 'champ', 'aria-label': 'Date de réveil', value: L.ajouterJours(D.ctx().aujourdhui, 90) });
  return dialogue({
    titre: 'Passer en Pas maintenant',
    contenu: h('div', { class: 'pile' },
      h('p', {}, 'À cette date, la fiche réapparaîtra dans "Aujourd’hui" avec l’action "Reprendre contact".'),
      blocChamp('Date de réveil', date, { obligatoire: true })),
    boutons: [
      { libelle: 'Annuler', valeur: null },
      { libelle: 'Valider', style: 'principal', valeur: () => date.value,
        avantFermeture: () => { if (!date.value) { date.focus(); return false; } return true; } },
    ],
  });
}

async function dialogueEncaissement(f) {
  const montant = h('input', { type: 'number', class: 'champ', min: '0', step: '0.01', value: f.montant ?? '', 'aria-label': 'Montant encaissé' });
  const r = await dialogue({
    titre: 'Facture payée',
    contenu: h('div', { class: 'pile' },
      h('p', {}, `Encaissement pour ${f.nom}. Le montant reprend celui de la fiche ; tu peux le corriger.`),
      blocChamp('Montant encaissé (€)', montant)),
    boutons: [
      { libelle: 'Annuler', valeur: null },
      { libelle: 'Enregistrer l’encaissement', style: 'principal', valeur: () => Number(montant.value) || 0 },
    ],
  });
  return r === null ? null : r;
}

// ---------------------------------------------------------------- suggestion douce

export function afficherSuggestion(ficheId, suggestion) {
  document.querySelector('.suggestion')?.remove();
  const texte = h('input', { type: 'text', class: 'champ', value: suggestion.action, 'aria-label': 'Action suggérée' });
  const date = h('input', { type: 'date', class: 'champ', value: suggestion.date, 'aria-label': 'Date suggérée' });
  const boite = h('aside', { class: 'suggestion', role: 'dialog', 'aria-label': 'Suggestion de prochaine action' },
    h('div', { class: 'suggestion-tete' },
      h('img', { src: 'assets/charles-portrait.png', alt: '', width: '40', height: '30', class: 'mini-charles' }),
      h('strong', {}, 'Suggestion de Charles'),
      h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Fermer la suggestion', onclick: () => boite.remove() }, icone('x', { taille: 16 }))),
    h('div', { class: 'suggestion-champs' }, texte, date),
    h('div', { class: 'suggestion-pied' },
      h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', onclick: () => boite.remove() }, 'Fermer'),
      h('button', { type: 'button', class: 'bouton bouton-principal bouton-petit', onclick: async () => {
        boite.remove();
        await D.majFiche(ficheId, L.fixerAction(texte.value, date.value || null));
        toast('Prochaine action fixée');
      } }, 'Valider')));
  document.body.append(boite);
}

// ---------------------------------------------------------------- changement d'étape

/** Change l'étape d'une fiche avec les boîtes nécessaires, la célébration et la suggestion. */
export async function changerEtape(f, etape) {
  if (!f || f.etape === etape) return false;
  const options = {};
  if (etape === 'perdu') {
    const r = await dialogueRaisonPerdu();
    if (!r) return false;
    Object.assign(options, r);
  }
  if (etape === 'pas_maintenant') {
    const d = await dialogueReveil();
    if (!d) return false;
    options.dateReveil = d;
  }
  if (etape === 'facture_payee') {
    const m = await dialogueEncaissement(f);
    if (m === null) return false;
    options.montantEncaisse = m;
  }
  const c = D.ctx();
  const mois = L.moisParis(c.maintenant);
  const caAvant = L.CALCULS.ca_encaisse.calculer(D.etat.fiches, mois);
  const patch = L.changementEtape(f, etape, c, options);
  D.majFiche(f.id, patch).catch(() => toast('Enregistrement impossible', { type: 'erreur' }));
  if (etape === 'gagne') celebrerGagne('Bravo Jérôme !', f.nom);
  if (etape === 'facture_payee') celebrerPaiement(caAvant, caAvant + (Number(options.montantEncaisse) || 0), (n) => L.formatEuros(Math.round(n)));
  const s = L.suggestionPourEtape(etape, c.aujourdhui, D.etat.reglages.delaiPaiementJours);
  if (s) afficherSuggestion(f.id, s);
  return true;
}

/** Bouton "Fait" : vide l'action, historise, puis ouvre le choix de la prochaine action. */
export async function marquerFait(f, { reprise = false } = {}) {
  const avant = L.aFaire(D.etat.fiches, D.ctx().aujourdhui);
  const restaient = avant.enRetard.length + avant.aujourdhui.length;
  const patch = L.actionFaite(f, D.ctx(), { reprise });
  D.majFiche(f.id, patch).catch(() => toast('Enregistrement impossible', { type: 'erreur' }));
  const fichesApres = D.etat.fiches.map((x) => (x.id === f.id ? { ...x, ...patch } : x));
  const apres = L.aFaire(fichesApres, D.ctx().aujourdhui);
  if (restaient > 0 && apres.enRetard.length + apres.aujourdhui.length === 0) charlesContent('Tout est fait pour aujourd’hui');
  const maj = { ...f, ...patch };
  await dialogueProchaineAction(maj, { titre: 'Et ensuite ?' });
}

// ---------------------------------------------------------------- panneau de fiche

let panneauCourant = null;

export function fermerPanneau() {
  panneauCourant?.detruire();
  panneauCourant = null;
}

/** Ouvre le panneau de la fiche `id` ("nouvelle" pour une création). */
export function ouvrirPanneau(id, { surFermer, valeursInitiales = {} } = {}) {
  if (panneauCourant?.id === id) return;
  fermerPanneau();
  const voile = h('div', { class: 'voile-fiche', onclick: () => surFermer() });
  const panneau = h('section', { class: 'panneau-fiche', role: 'dialog', 'aria-modal': 'false', 'aria-label': 'Fiche prospect', tabindex: '-1' });
  document.body.append(voile, panneau);
  document.body.classList.add('fiche-ouverte');
  const surTouche = (e) => { if (e.key === 'Escape' && !document.querySelector('.voile-dialogue')) surFermer(); };
  document.addEventListener('keydown', surTouche);
  let arret = () => {};
  if (id === 'nouvelle') {
    rendreCreation(panneau, surFermer, valeursInitiales);
  } else {
    arret = rendreFiche(panneau, id, surFermer);
  }
  requestAnimationFrame(() => panneau.classList.add('ouvert'));
  panneau.focus({ preventScroll: true });
  panneauCourant = {
    id,
    detruire() {
      arret();
      document.removeEventListener('keydown', surTouche);
      document.body.classList.remove('fiche-ouverte');
      voile.remove();
      panneau.remove();
    },
  };
}

function enTete(titre, sousTitre, surFermer, extra) {
  return h('header', { class: 'fiche-tete' },
    h('div', { class: 'fiche-titres' }, h('h2', { class: 'fiche-nom' }, titre), sousTitre ? h('p', { class: 'fiche-entreprise' }, sousTitre) : null, extra),
    h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Fermer la fiche', onclick: surFermer }, icone('x', { taille: 20 })));
}

// ---------------------------------------------------------------- création

function rendreCreation(panneau, surFermer, initiales) {
  const aujourdhui = D.ctx().aujourdhui;
  const v = { roles: ['prospect'], etape: 'premier_contact', priorite: 'tiede', datePremierContact: aujourdhui, ...initiales };
  const champs = {
    nom: h('input', { type: 'text', class: 'champ', value: v.nom || '', autocomplete: 'off', autofocus: true }),
    entreprise: h('input', { type: 'text', class: 'champ', value: v.entreprise || '' }),
    ville: h('input', { type: 'text', class: 'champ', value: v.ville || '' }),
    telephone: h('input', { type: 'tel', class: 'champ', value: v.telephone || '' }),
    email: h('input', { type: 'email', class: 'champ', value: v.email || '' }),
    source: select(optionsListe(D.etat.sources, v.source), v.source || ''),
    secteur: select(optionsListe(D.etat.secteurs, v.secteur, 'Aucun'), v.secteur || ''),
    etape: select(L.TOUTES_ETAPES.filter((e) => !['facture_payee', 'perdu', 'pas_maintenant'].includes(e.id)).map((e) => ({ valeur: e.id, libelle: e.libelle })), v.etape),
    priorite: select(L.PRIORITES.map((p) => ({ valeur: p.id, libelle: p.libelle })), v.priorite),
    datePremierContact: h('input', { type: 'date', class: 'champ', value: v.datePremierContact }),
    besoin: h('textarea', { class: 'champ', rows: '2', value: v.besoin || '' }),
  };
  const roles = h('div', { class: 'groupe-cases', role: 'group', 'aria-label': 'Rôles' },
    L.ROLES.map((r) => h('label', { class: 'case' }, h('input', { type: 'checkbox', value: r.id, checked: v.roles.includes(r.id), dataset: { role: r.id } }), h('span', {}, r.libelle))));

  const formulaire = h('form', { class: 'fiche-corps', novalidate: true, onsubmit: async (e) => {
    e.preventDefault();
    const valeurs = {
      nom: champs.nom.value.trim(),
      entreprise: champs.entreprise.value.trim(),
      ville: champs.ville.value.trim(),
      telephone: champs.telephone.value.trim(),
      email: champs.email.value.trim(),
      source: champs.source.value,
      secteur: champs.secteur.value,
      etape: champs.etape.value,
      priorite: champs.priorite.value,
      datePremierContact: champs.datePremierContact.value,
      besoin: champs.besoin.value.trim(),
      roles: [...roles.querySelectorAll('input:checked')].map((x) => x.value),
    };
    const erreurs = L.validerFiche(valeurs);
    formulaire.querySelectorAll('[data-erreur]').forEach((el) => { el.textContent = erreurs[el.dataset.erreur] || ''; });
    formulaire.querySelectorAll('.invalide').forEach((el) => el.classList.remove('invalide'));
    for (const cle of Object.keys(erreurs)) (champs[cle] || roles).classList.add('invalide');
    if (Object.keys(erreurs).length) {
      (champs[Object.keys(erreurs)[0]] || roles).focus?.();
      return;
    }
    bouton.disabled = true;
    try {
      const nouvelId = await D.creerFiche(valeurs);
      toast('Fiche créée');
      naviguer(`crm/fiche/${nouvelId}`, { remplacer: true });
    } catch (err) {
      console.warn(err);
      toast('Création impossible', { type: 'erreur' });
      bouton.disabled = false;
    }
  } },
  h('section', { class: 'fiche-section' },
    h('h3', {}, 'Identité'),
    blocChamp('Prénom et nom', champs.nom, { obligatoire: true, erreurPour: 'nom', id: 'creation-nom' }),
    blocChamp('Entreprise', champs.entreprise, { id: 'creation-entreprise' }),
    h('div', { class: 'bloc-champ', dataset: { erreurPour: 'roles' } }, h('span', { class: 'etiquette' }, 'Rôles', h('span', { class: 'obligatoire' }, ' *')), roles, h('span', { class: 'erreur', role: 'alert', dataset: { erreur: 'roles' } })),
    h('div', { class: 'grille-2' },
      blocChamp('Ville', champs.ville, { id: 'creation-ville' }),
      blocChamp('Téléphone', champs.telephone, { id: 'creation-telephone' })),
    blocChamp('Email', champs.email, { erreurPour: 'email', id: 'creation-email' })),
  h('section', { class: 'fiche-section' },
    h('h3', {}, 'Suivi'),
    h('div', { class: 'grille-2' },
      blocChamp('Source', champs.source, { obligatoire: true, erreurPour: 'source', id: 'creation-source' }),
      blocChamp('Secteur', champs.secteur, { id: 'creation-secteur' })),
    h('div', { class: 'grille-2' },
      blocChamp('Étape', champs.etape, { obligatoire: true, id: 'creation-etape' }),
      blocChamp('Priorité', champs.priorite, { obligatoire: true, id: 'creation-priorite' })),
    blocChamp('Premier contact', champs.datePremierContact, { obligatoire: true, erreurPour: 'datePremierContact', id: 'creation-premier-contact' }),
    blocChamp('Besoin identifié', champs.besoin, { id: 'creation-besoin' })));
  const bouton = h('button', { type: 'submit', class: 'bouton bouton-principal' }, icone('check', { taille: 16 }), 'Créer la fiche');
  formulaire.append(h('div', { class: 'fiche-actions-bas' },
    h('button', { type: 'button', class: 'bouton bouton-secondaire', onclick: surFermer }, 'Annuler'), bouton));
  panneau.append(enTete('Nouvelle fiche', 'Les champs marqués * sont obligatoires.', surFermer), formulaire);
}

// ---------------------------------------------------------------- fiche existante

function rendreFiche(panneau, id, surFermer) {
  let f = D.fiche(id);
  if (!f && D.estPret()) {
    panneau.append(enTete('Fiche introuvable', 'Elle a peut être été supprimée.', surFermer));
    return () => {};
  }

  const corps = h('div', { class: 'fiche-corps' });
  const titre = h('h2', { class: 'fiche-nom' });
  const sousTitre = h('p', { class: 'fiche-entreprise' });
  const badges = h('div', { class: 'fiche-badges' });
  panneau.append(h('header', { class: 'fiche-tete' },
    h('div', { class: 'fiche-titres' }, titre, sousTitre, badges),
    h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Fermer la fiche', onclick: surFermer }, icone('x', { taille: 20 }))), corps);

  const liaisons = []; // { el, lire(), ecrire(f) }
  const rafraichissements = [];

  function enregistrer(patch) {
    return D.majFiche(id, patch).catch((e) => { console.warn(e); toast('Enregistrement impossible', { type: 'erreur' }); });
  }

  /** Champ simple lié à la fiche : enregistrement à chaque changement. */
  function lie(champ, el, { vers = (v) => v, depuis = (v) => v ?? '', valider, evenement = 'change' } = {}) {
    el.dataset.champ = champ;
    el.addEventListener(evenement, () => {
      const valeur = vers(el.type === 'checkbox' ? el.checked : el.value);
      const erreur = valider?.(valeur);
      const zone = el.closest('.bloc-champ')?.querySelector('.erreur');
      if (zone) zone.textContent = erreur || '';
      el.classList.toggle('invalide', !!erreur);
      if (erreur) return;
      enregistrer({ [champ]: valeur });
    });
    liaisons.push({ el, ecrire: (fi) => {
      if (document.activeElement === el) return;
      if (el.type === 'checkbox') el.checked = !!fi[champ];
      else el.value = depuis(fi[champ]);
    } });
    return el;
  }

  const texte = (champ, type = 'text', attrs = {}) => lie(champ, h('input', { type, class: 'champ', ...attrs }), { vers: (v) => v.trim() });
  const dateOuNull = (champ, type = 'date') => lie(champ, h('input', { type, class: 'champ' }), { vers: (v) => v || null });
  const nombre = (champ, step) => lie(champ, h('input', { type: 'number', class: 'champ', min: '0', step }), { vers: (v) => (v === '' ? null : Number(v)) });

  // ---- Identité
  const roles = h('div', { class: 'groupe-cases', role: 'group', 'aria-label': 'Rôles' },
    L.ROLES.map((r) => h('label', { class: 'case' }, h('input', { type: 'checkbox', value: r.id, dataset: { role: r.id } }), h('span', {}, r.libelle))));
  roles.addEventListener('change', (e) => {
    const coches = [...roles.querySelectorAll('input:checked')].map((x) => x.value);
    const zone = roles.parentElement.querySelector('.erreur');
    if (!coches.length) { zone.textContent = 'Choisis au moins un rôle.'; e.target.checked = true; return; }
    zone.textContent = '';
    enregistrer({ roles: coches });
  });
  liaisons.push({ ecrire: (fi) => roles.querySelectorAll('input').forEach((x) => { x.checked = (fi.roles || []).includes(x.value); }) });

  const secteur = lie('secteur', h('select', { class: 'champ' }));
  const source = lie('source', h('select', { class: 'champ' }), { valider: (v) => (v ? null : 'La source est obligatoire.') });
  const offre = lie('offreId', h('select', { class: 'champ' }), { vers: (v) => v || null });
  const taille = lie('taille', select([{ valeur: '', libelle: 'Non précisée' }, ...L.TAILLES.map((x) => ({ valeur: x, libelle: x }))], ''));
  rafraichissements.push((fi) => {
    remplirSelect(secteur, optionsListe(D.etat.secteurs, fi.secteur, 'Aucun'), fi.secteur);
    remplirSelect(source, optionsListe(D.etat.sources, fi.source), fi.source);
    remplirSelect(offre, optionsOffres(fi.offreId), fi.offreId);
  });

  const telephone = texte('telephone', 'tel');
  const lienTel = h('a', { class: 'bouton-icone', 'aria-label': 'Appeler' }, icone('phone', { taille: 16 }));
  const email = lie('email', h('input', { type: 'email', class: 'champ' }), { vers: (v) => v.trim(), valider: (v) => (L.emailValide(v) ? null : "L'adresse email n'est pas valide.") });
  const boutonEcrire = h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', dataset: { action: 'ecrire-email' },
    onclick: () => { const fi = D.fiche(id); if (fi && L.emailActif(fi)) window.location.href = `mailto:${fi.email.trim()}`; } },
  icone('mail', { taille: 16 }), 'Écrire un email');
  const boutonEnvoye = h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', dataset: { action: 'email-envoye' },
    onclick: () => { const fi = D.fiche(id); enregistrer(L.emailEnvoye(fi, D.ctx())); toast('Échange noté : email envoyé'); } },
  icone('mail-check', { taille: 16 }), 'Email envoyé');
  const siteWeb = texte('siteWeb', 'url');
  const linkedin = texte('linkedin', 'url');
  const lienSite = h('a', { class: 'bouton-icone', target: '_blank', rel: 'noopener', 'aria-label': 'Ouvrir le site' }, icone('external-link', { taille: 16 }));
  const lienLinkedin = h('a', { class: 'bouton-icone', target: '_blank', rel: 'noopener', 'aria-label': 'Ouvrir LinkedIn' }, icone('external-link', { taille: 16 }));
  rafraichissements.push((fi) => {
    lienTel.toggleAttribute('hidden', !fi.telephone);
    if (fi.telephone) lienTel.href = `tel:${fi.telephone.replace(/[^\d+]/g, '')}`;
    const actif = L.emailActif(fi);
    boutonEcrire.disabled = !actif;
    boutonEnvoye.disabled = !actif;
    boutonEcrire.title = fi.oppositionProspection ? 'Opposition à la prospection : email désactivé' : (fi.email ? '' : 'Aucune adresse email');
    lienSite.toggleAttribute('hidden', !fi.siteWeb);
    if (fi.siteWeb) lienSite.href = lienExterne(fi.siteWeb);
    lienLinkedin.toggleAttribute('hidden', !fi.linkedin);
    if (fi.linkedin) lienLinkedin.href = lienExterne(fi.linkedin);
  });

  const nom = lie('nom', h('input', { type: 'text', class: 'champ', autocomplete: 'off' }), { vers: (v) => v.trim(), valider: (v) => (v ? null : 'Le prénom et le nom sont obligatoires.') });

  corps.append(section('Identité', 'user',
    blocChamp('Prénom et nom', nom, { obligatoire: true, erreurPour: 'nom', id: 'fiche-nom' }),
    blocChamp('Entreprise', texte('entreprise'), { id: 'fiche-entreprise' }),
    h('div', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Rôles', h('span', { class: 'obligatoire' }, ' *')), roles, h('span', { class: 'erreur', role: 'alert' })),
    blocChamp("Date de l'interview JTBD", dateOuNull('dateInterviewJtbd'), { aide: 'Vide = interview non faite.', id: 'fiche-jtbd' }),
    h('div', { class: 'grille-2' }, blocChamp('Secteur', secteur, { id: 'fiche-secteur' }), blocChamp('Taille', taille, { id: 'fiche-taille' })),
    blocChamp('Ville', texte('ville'), { id: 'fiche-ville' }),
    blocChamp('Téléphone', h('div', { class: 'champ-avec-bouton' }, telephone, lienTel)),
    blocChamp('Email', h('div', { class: 'champ-avec-bouton' }, email), { erreurPour: 'email' }),
    h('div', { class: 'groupe-boutons' }, boutonEcrire, boutonEnvoye),
    blocChamp('Site web', h('div', { class: 'champ-avec-bouton' }, siteWeb, lienSite)),
    blocChamp('LinkedIn', h('div', { class: 'champ-avec-bouton' }, linkedin, lienLinkedin))));
  telephone.id = 'fiche-telephone'; email.id = 'fiche-email'; siteWeb.id = 'fiche-site'; linkedin.id = 'fiche-linkedin';
  relierEtiquette(telephone); relierEtiquette(email); relierEtiquette(siteWeb); relierEtiquette(linkedin);

  // ---- Suivi
  const etape = h('select', { class: 'champ', dataset: { champ: 'etape' } }, L.TOUTES_ETAPES.map((e) => h('option', { value: e.id }, e.libelle)));
  etape.addEventListener('change', async () => {
    const fi = D.fiche(id);
    const ok = await changerEtape(fi, etape.value);
    if (!ok) etape.value = fi.etape;
  });
  liaisons.push({ ecrire: (fi) => { if (document.activeElement !== etape) etape.value = fi.etape; } });
  const priorite = h('div', { class: 'segments', role: 'radiogroup', 'aria-label': 'Priorité' },
    L.PRIORITES.map((p) => h('label', { class: `segment prio-${p.id}` }, h('input', { type: 'radio', name: `prio-${id}`, value: p.id }), h('span', {}, p.libelle))));
  priorite.addEventListener('change', (e) => enregistrer({ priorite: e.target.value }));
  liaisons.push({ ecrire: (fi) => priorite.querySelectorAll('input').forEach((x) => { x.checked = x.value === fi.priorite; }) });

  const raison = lie('raisonPerdu', select(L.RAISONS_PERDU.map((x) => ({ valeur: x, libelle: x })), ''));
  const blocPerdu = h('div', { class: 'grille-2 bloc-conditionnel' },
    blocChamp('Raison si perdu', raison, { obligatoire: true, id: 'fiche-raison' }),
    blocChamp('Précision', lie('raisonPerduDetail', h('input', { type: 'text', class: 'champ' }), { vers: (v) => v.trim() || null }), { id: 'fiche-raison-detail' }));
  const reveil = lie('dateReveil', h('input', { type: 'date', class: 'champ' }), { vers: (v) => v || null, valider: (v) => (v ? null : 'La date de réveil est obligatoire.') });
  const blocReveil = h('div', { class: 'bloc-conditionnel' }, blocChamp('Date de réveil', reveil, { obligatoire: true, id: 'fiche-reveil', erreurPour: 'dateReveil' }));
  const boutonNouvelleAffaire = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'nouvelle-affaire' }, onclick: async () => {
    const fi = D.fiche(id);
    await enregistrer(L.nouvelleAffaire(fi, D.ctx()));
    toast('Nouvelle affaire : la fiche repart en Premier contact');
  } }, icone('rotate-ccw', { taille: 16 }), 'Nouvelle affaire');
  const infosAuto = h('p', { class: 'aide infos-auto' });
  rafraichissements.push((fi) => {
    blocPerdu.hidden = fi.etape !== 'perdu';
    blocReveil.hidden = fi.etape !== 'pas_maintenant';
    boutonNouvelleAffaire.hidden = !L.peutDemarrerNouvelleAffaire(fi);
    infosAuto.textContent = `Dans l’étape depuis le ${L.formatDateHeure(fi.dateEntreeEtape) || '…'} · Dernier échange : ${L.formatDateHeure(fi.dateDernierEchange) || 'aucun'}`;
  });

  corps.append(section('Suivi', 'briefcase',
    h('div', { class: 'grille-2' }, blocChamp('Étape', etape, { obligatoire: true, id: 'fiche-etape' }), blocChamp('Source', source, { obligatoire: true, erreurPour: 'source', id: 'fiche-source' })),
    h('div', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Priorité'), priorite),
    blocPerdu, blocReveil, boutonNouvelleAffaire,
    blocChamp('Besoin identifié', lie('besoin', h('textarea', { class: 'champ', rows: '2' }), { vers: (v) => v.trim() }), { id: 'fiche-besoin' }),
    h('div', { class: 'grille-3' },
      blocChamp('Offre envisagée', offre, { id: 'fiche-offre' }),
      blocChamp('Durée (jours)', nombre('dureeJours', '0.5'), { id: 'fiche-duree' }),
      blocChamp('Montant (€)', nombre('montant', '1'), { id: 'fiche-montant' })),
    blocChamp('Premier contact', lie('datePremierContact', h('input', { type: 'date', class: 'champ' }), { valider: (v) => (v ? null : 'La date du premier contact est obligatoire.') }), { obligatoire: true, id: 'fiche-premier-contact', erreurPour: 'datePremierContact' }),
    infosAuto));

  // ---- Prochaine action
  const action = lie('prochaineAction', h('input', { type: 'text', class: 'champ', placeholder: 'Ex. Relancer la proposition' }), { vers: (v) => v.trim() });
  const dateAction = lie('dateProchaineAction', h('input', { type: 'date', class: 'champ' }), { vers: (v) => v || null });
  const alerteRetard = h('p', { class: 'alerte-retard', role: 'status' }, icone('clock', { taille: 16 }), 'En retard');
  const boutonFait = h('button', { type: 'button', class: 'bouton bouton-principal bouton-petit', dataset: { action: 'fait' },
    onclick: () => marquerFait(D.fiche(id)) }, icone('check', { taille: 16 }), 'Fait');
  rafraichissements.push((fi) => {
    alerteRetard.hidden = !L.estEnRetard(fi, D.ctx().aujourdhui);
    boutonFait.disabled = !fi.prochaineAction && !fi.dateProchaineAction;
  });
  corps.append(section('Prochaine action', 'calendar',
    blocChamp('Action', action, { id: 'fiche-action' }),
    blocChamp('Date', dateAction, { id: 'fiche-date-action' }),
    boutonsDatesRapides(dateAction),
    h('div', { class: 'groupe-boutons' }, alerteRetard, boutonFait)));

  // ---- Rendez vous
  const dateRdv = lie('dateRdv', h('input', { type: 'datetime-local', class: 'champ' }), { vers: (v) => v || null });
  const rdvTenu = h('input', { type: 'checkbox', dataset: { champ: 'rdvTenu' } });
  rdvTenu.addEventListener('change', () => enregistrer(L.marquerRdvTenu(D.fiche(id), rdvTenu.checked, D.ctx())));
  liaisons.push({ ecrire: (fi) => { rdvTenu.checked = !!fi.rdvTenu; } });
  corps.append(section('Rendez vous', 'calendar-check',
    blocChamp('Date du rendez vous', dateRdv, { id: 'fiche-rdv' }),
    h('label', { class: 'case' }, rdvTenu, h('span', {}, 'Rendez vous tenu'))));

  // ---- Notes (texte libre, jamais modifié par l'appli)
  const notes = h('textarea', { class: 'champ champ-notes', rows: '8', dataset: { champ: 'notes' }, placeholder: 'Compte rendu, contexte, idées… (texte libre)' });
  let minuteurNotes = null;
  const sauverNotes = () => { clearTimeout(minuteurNotes); minuteurNotes = null; const fi = D.fiche(id); if (fi && notes.value !== (fi.notes || '')) enregistrer({ notes: notes.value }); };
  notes.addEventListener('input', () => { clearTimeout(minuteurNotes); minuteurNotes = setTimeout(sauverNotes, 700); });
  notes.addEventListener('blur', sauverNotes);
  liaisons.push({ ecrire: (fi) => { if (document.activeElement !== notes && minuteurNotes === null) notes.value = fi.notes || ''; } });
  corps.append(section('Notes', 'file-text', notes));

  // ---- Notes rapides
  const nouvelleNote = h('textarea', { class: 'champ', rows: '2', placeholder: 'Note rapide (dictée possible avec le micro du clavier)', 'aria-label': 'Nouvelle note rapide' });
  const listeNotes = h('ul', { class: 'liste-notes' });
  const ajouterNote = async () => {
    const fi = D.fiche(id);
    const p = L.ajouterNoteRapide(fi, nouvelleNote.value, D.ctx());
    if (!p) return;
    nouvelleNote.value = '';
    await enregistrer(p);
  };
  nouvelleNote.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) ajouterNote(); });
  rafraichissements.push((fi) => {
    vider(listeNotes);
    const liste = [...(fi.notesRapides || [])].reverse();
    if (!liste.length) listeNotes.append(h('li', { class: 'vide-discret' }, 'Aucune note rapide.'));
    for (const n of liste) {
      listeNotes.append(h('li', { class: 'note-rapide', dataset: { note: n.id } },
        h('p', { class: 'note-texte' }, n.texte),
        h('div', { class: 'note-pied' },
          h('span', { class: 'aide' }, `${L.formatDateHeure(n.date)} · ${nomAuteur(n.auteur)}`),
          h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', onclick: () => { enregistrer(L.copierNoteDansNotes(D.fiche(id), n.id)); toast('Note copiée dans Notes'); } }, icone('copy', { taille: 14 }), 'Copier dans Notes'),
          h('button', { type: 'button', class: 'bouton bouton-discret bouton-petit', onclick: () => enregistrer(L.supprimerNoteRapide(D.fiche(id), n.id)) }, icone('trash-2', { taille: 14 }), 'Supprimer'))));
    }
  });
  corps.append(section('Notes rapides', 'sticky-note',
    h('div', { class: 'ligne-ajout' }, nouvelleNote, h('button', { type: 'button', class: 'bouton bouton-secondaire', onclick: ajouterNote }, icone('plus', { taille: 16 }), 'Ajouter')),
    listeNotes));

  // ---- Documents
  const libDoc = h('input', { type: 'text', class: 'champ', placeholder: 'Libellé', 'aria-label': 'Libellé du document' });
  const urlDoc = h('input', { type: 'url', class: 'champ', placeholder: 'Lien Google Drive', 'aria-label': 'Lien du document' });
  const listeDocs = h('ul', { class: 'liste-documents' });
  rafraichissements.push((fi) => {
    vider(listeDocs);
    (fi.documents || []).forEach((d, i) => listeDocs.append(h('li', {},
      icone('link', { taille: 14 }),
      h('a', { href: lienExterne(d.url), target: '_blank', rel: 'noopener' }, d.libelle),
      h('button', { type: 'button', class: 'bouton-icone', 'aria-label': `Retirer ${d.libelle}`, onclick: () => enregistrer(L.supprimerDocument(D.fiche(id), i)) }, icone('x', { taille: 14 })))));
    if (!(fi.documents || []).length) listeDocs.append(h('li', { class: 'vide-discret' }, 'Aucun document.'));
  });
  corps.append(section('Documents', 'link',
    h('form', { class: 'ligne-ajout', onsubmit: (e) => {
      e.preventDefault();
      const p = L.ajouterDocument(D.fiche(id), libDoc.value, urlDoc.value);
      if (!p) { urlDoc.focus(); return; }
      libDoc.value = ''; urlDoc.value = '';
      enregistrer(p);
    } }, libDoc, urlDoc, h('button', { type: 'submit', class: 'bouton bouton-secondaire' }, icone('plus', { taille: 16 }), 'Ajouter')),
    listeDocs));

  // ---- Historique (replié)
  const listeHisto = h('ol', { class: 'liste-historique' });
  rafraichissements.push((fi) => {
    vider(listeHisto);
    const liste = [...(fi.historique || [])].reverse();
    if (!liste.length) listeHisto.append(h('li', { class: 'vide-discret' }, 'Rien pour l’instant.'));
    for (const x of liste) listeHisto.append(h('li', {}, h('span', { class: 'aide' }, `${L.formatDateHeure(x.date)} · ${nomAuteur(x.auteur)}`), h('span', {}, x.texte)));
  });
  corps.append(h('details', { class: 'fiche-section historique' }, h('summary', {}, icone('history', { taille: 16 }), 'Historique'), listeHisto));

  // ---- RGPD
  const opposition = h('input', { type: 'checkbox', dataset: { champ: 'oppositionProspection' } });
  opposition.addEventListener('change', () => enregistrer(L.marquerOpposition(opposition.checked, D.ctx())));
  const infoOpposition = h('span', { class: 'aide' });
  liaisons.push({ ecrire: (fi) => { opposition.checked = !!fi.oppositionProspection; infoOpposition.textContent = fi.oppositionProspection ? `Depuis le ${L.formatDateHeure(fi.dateOpposition)}` : ''; } });
  corps.append(section('RGPD', 'shield-check',
    h('label', { class: 'case' }, opposition, h('span', {}, 'Opposition à la prospection')), infoOpposition,
    h('p', { class: 'aide' }, 'Données hébergées en France (Paris), accessibles aux seuls comptes de Jérôme et Charles.')));

  // ---- Supprimer
  corps.append(h('section', { class: 'fiche-section zone-danger' },
    h('button', { type: 'button', class: 'bouton bouton-danger', dataset: { action: 'supprimer' }, onclick: () => supprimer(D.fiche(id), surFermer) }, icone('trash-2', { taille: 16 }), 'Supprimer définitivement')));

  function rafraichir() {
    f = D.fiche(id);
    if (!f) {
      if (D.estPret()) surFermer();
      return;
    }
    titre.textContent = f.nom || 'Sans nom';
    sousTitre.textContent = f.entreprise || '';
    vider(badges).append(pastilleEtape(f.etape), pastillePriorite(f.priorite),
      f.archive ? h('span', { class: 'badge' }, 'Archivée') : null,
      f.oppositionProspection ? h('span', { class: 'badge badge-opposition' }, 'Opposition') : null);
    for (const r of rafraichissements) r(f);
    for (const l of liaisons) l.ecrire(f);
  }
  rafraichir();
  const stop = D.surChangement(rafraichir);
  return () => { sauverNotes(); stop(); };
}

function remplirSelect(el, options, valeur) {
  const signature = options.map((o) => `${o.valeur}=${o.libelle}`).join('|');
  if (el.dataset.signature !== signature) {
    vider(el).append(...options.map((o) => h('option', { value: o.valeur }, o.libelle)));
    el.dataset.signature = signature;
  }
  if (document.activeElement !== el) el.value = valeur ?? '';
}

function relierEtiquette(el) {
  const label = el.closest('.bloc-champ')?.querySelector('label.etiquette');
  if (label) label.htmlFor = el.id;
}

function section(titre, nomIcone, ...contenu) {
  return h('section', { class: 'fiche-section' }, h('h3', {}, icone(nomIcone, { taille: 16 }), titre), ...contenu);
}

function lienExterne(url) {
  return /^https?:\/\//i.test(url) ? url : `https://${url}`;
}

async function supprimer(f, surFermer) {
  if (!f) return;
  const champ = h('input', { type: 'text', class: 'champ', 'aria-label': 'Nom de la fiche', autocomplete: 'off', autofocus: true });
  const ok = await dialogue({
    titre: 'Supprimer définitivement',
    contenu: h('div', { class: 'pile' },
      h('p', {}, 'La fiche, ses notes et son historique seront effacés. Cette action est irréversible.'),
      h('p', {}, 'Pour confirmer, tape le nom : ', h('strong', {}, f.nom)),
      champ),
    boutons: [
      { libelle: 'Annuler', valeur: false },
      { libelle: 'Supprimer définitivement', valeur: true, style: 'danger', desactive: true },
    ],
    auMontage: ({ boutons }) => {
      champ.addEventListener('input', () => { boutons[1].disabled = L.normaliser(champ.value) !== L.normaliser(f.nom); });
    },
  });
  if (!ok) return;
  await D.supprimerFiche(f.id);
  toast('Fiche supprimée');
  surFermer();
}
