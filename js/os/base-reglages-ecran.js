// Écran Réglages > « Connexion à la base » (24/11/2026) : visible par Jérôme seul, à la racine (jamais chez un client : registre.js, `jeromeSeulement`).
// Deux blocs : (1) les réglages de la connexion (adresse de la base, clé publique, nom de l'espace, quatre adresses d'automatisations) avec « Enregistrer » et « Tester la connexion » ;
// (2) « Donner l'accès à un compte » (appelle la fonction serveur `baseAccorderAcces`, qui revérifie que l'appelant est Jérôme).
// Le test de la connexion est INJECTÉ (`deps.testerConnexion`) : la couche d'accès à la base n'existe pas encore dans cette étape. Rien de secret : la clé est la clé PUBLIQUE.
// Aucune adresse d'exemple n'est écrite ici (ni dans un champ, ni dans l'aide).
import { h, icone, remplir, toast, confirmer } from './ui.js';
import {
  controlerConnexion, controlerDemandeAcces, normaliserConnexion, NOMS_WEBHOOKS, LIBELLES_WEBHOOKS, MAX_ADRESSE, MAX_CLE,
  MESSAGE_ACCES_DONNE, MESSAGE_ACCES_RETIRE,
} from './base-reglages.js';
import { chargerConnexion, enregistrerConnexion, testerConnexionParDefaut, accorderAcces } from './base-reglages-donnees.js';

const DEPS_PAR_DEFAUT = { charger: chargerConnexion, enregistrer: enregistrerConnexion, testerConnexion: testerConnexionParDefaut, accorder: accorderAcces };

const champ = (etiquette, id, ...contenu) => h('div', { class: 'bloc-champ mon-espace-champ' }, h('label', { class: 'etiquette', for: id }, etiquette), ...contenu);

/** Texte d'un message d'erreur sous un champ (caché quand il est vide). */
function lignesErreur(id) {
  return h('p', { class: 'mon-espace-erreur-champ', role: 'alert', hidden: true, id: `${id}-erreur`, dataset: { erreurDe: id } });
}
function montrer(el, texte) {
  el.textContent = texte ?? '';
  el.hidden = !texte;
}

export function sectionConnexionBase(ctx, etat, deps = {}) {
  const d = { ...DEPS_PAR_DEFAUT, ...(typeof ctx?.testerConnexion === 'function' ? { testerConnexion: ctx.testerConnexion } : {}), ...deps };
  const zone = h('div', { class: 'mon-espace', dataset: { role: 'base-zone' } });
  const sec = h('section', { class: 'carte-section', id: 'reglages-base' },
    h('h2', {}, icone('shield-check', { taille: 18 }), 'Connexion à la base'),
    h('p', { class: 'aide' }, 'Réservé à Jérôme. Les réglages qui relient les modules Achats à la base de données de l’espace. Il n’y a ici aucun secret : la clé est la clé publique, faite pour le navigateur. Les adresses doivent être en https.'),
    zone);

  const lancer = async () => {
    remplir(zone, h('div', { class: 'chargement-bloc', role: 'status', dataset: { etat: 'chargement' } }, h('span', { class: 'rond-chargement' }), h('span', { class: 'aide' }, 'Chargement…')));
    let brut;
    try {
      brut = await d.charger();
    } catch (e) {
      console.warn('Connexion à la base : lecture impossible', e?.code ?? e?.message);
      if (!etat.vivant) return;
      remplir(zone, h('div', { class: 'mon-espace-erreur', role: 'alert', dataset: { etat: 'erreur' } },
        icone('triangle-alert', { taille: 16 }), h('p', {}, 'Chargement impossible, réessaie'),
        h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer' }, onclick: lancer }, 'Réessayer')));
      return;
    }
    if (!etat.vivant) return;
    remplir(zone, formulaire(normaliserConnexion(brut), !brut, d, ctx), blocAcces(normaliserConnexion(brut).espace, d));
  };
  lancer();
  return sec;
}

function formulaire(depart, vide, d, ctx) {
  const entrees = {};
  const erreurs = {};
  const creer = (nom, etiquette, { type = 'text', max = MAX_ADRESSE, placeholder = '', aide = null } = {}) => {
    const id = `base-${nom.replace('.', '-')}`;
    const valeur = nom.startsWith('webhooks.') ? depart.webhooks[nom.slice(9)] : depart[nom];
    entrees[nom] = h('input', { type, class: 'champ', id, name: nom, value: valeur, maxlength: String(max), autocomplete: 'off', spellcheck: 'false', placeholder, 'aria-describedby': `${id}-erreur`, dataset: { champ: nom } });
    erreurs[nom] = lignesErreur(id);
    return champ(etiquette, id, entrees[nom], aide ? h('p', { class: 'aide' }, aide) : null, erreurs[nom]);
  };
  const message = h('p', { class: 'mon-espace-message', role: 'status', dataset: { role: 'base-message' } });
  const resultatTest = h('p', { class: 'mon-espace-message', role: 'status', dataset: { role: 'base-test' } });
  const boutonEnregistrer = h('button', { type: 'submit', class: 'bouton bouton-principal', dataset: { action: 'enregistrer' } }, 'Enregistrer');
  const boutonTester = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'tester' } }, icone('check', { taille: 16 }), 'Tester la connexion');

  const valeurs = () => ({
    adresseBase: entrees.adresseBase.value,
    clePublique: entrees.clePublique.value,
    espace: entrees.espace.value,
    webhooks: Object.fromEntries(NOMS_WEBHOOKS.map((n) => [n, entrees[`webhooks.${n}`].value])),
  });
  const afficherErreurs = (r) => {
    for (const nom of Object.keys(entrees)) {
      montrer(erreurs[nom], r.erreurs[nom]);
      entrees[nom].setAttribute('aria-invalid', r.erreurs[nom] ? 'true' : 'false');
    }
    const premier = Object.keys(entrees).find((n) => r.erreurs[n]);
    if (premier) entrees[premier].focus();
  };
  const occupe = (oui) => { boutonEnregistrer.disabled = oui; boutonTester.disabled = oui; };

  async function enregistrer(e) {
    e.preventDefault();
    montrer(message, ''); montrer(resultatTest, '');
    const r = controlerConnexion(valeurs());
    afficherErreurs(r);
    if (!r.ok) { message.dataset.etat = 'erreur'; montrer(message, 'Des champs sont à corriger.'); return; }
    occupe(true);
    try {
      await d.enregistrer(r.connexion, ctx?.compte);
      message.dataset.etat = 'ok';
      montrer(message, 'Réglages enregistrés.');
      toast('Réglages enregistrés', { type: 'succes' });
    } catch (err) {
      message.dataset.etat = 'erreur';
      montrer(message, err?.message || 'L’enregistrement n’a pas abouti.');
    } finally {
      occupe(false);
    }
  }

  async function tester() {
    montrer(message, ''); montrer(resultatTest, '');
    const r = controlerConnexion(valeurs());
    afficherErreurs(r);
    if (!r.ok) { resultatTest.dataset.etat = 'erreur'; montrer(resultatTest, 'Corrige d’abord les champs signalés : le test a besoin de réglages valables.'); return; }
    occupe(true);
    resultatTest.dataset.etat = 'attente';
    montrer(resultatTest, 'Test en cours…');
    try {
      const reponse = await d.testerConnexion(r.connexion);
      resultatTest.dataset.etat = 'ok';
      montrer(resultatTest, (typeof reponse?.message === 'string' && reponse.message) || 'Ça marche : la base répond.');
    } catch (err) {
      resultatTest.dataset.etat = 'erreur';
      montrer(resultatTest, err?.message || 'Le test n’a pas abouti.');
    } finally {
      occupe(false);
    }
  }
  boutonTester.addEventListener('click', tester);

  return h('form', { class: 'mon-espace-formulaire', novalidate: true, dataset: { role: 'base-formulaire' }, onsubmit: enregistrer },
    vide ? h('p', { class: 'aide', dataset: { role: 'base-vide' } }, 'Connexion à la base non réglée : remplis les champs ci-dessous, enregistre, puis teste.') : null,
    h('div', { class: 'mon-espace-champs' },
      creer('adresseBase', 'Adresse de la base'),
      creer('clePublique', 'Clé publique', { max: MAX_CLE, aide: 'La clé publique seulement, jamais une clé secrète.' }),
      creer('espace', 'Nom court de l’espace', { max: 40, aide: 'Lettres minuscules, chiffres et tirets. Le même nom que celui inscrit dans la base.' }),
      ...NOMS_WEBHOOKS.map((n) => creer(`webhooks.${n}`, LIBELLES_WEBHOOKS[n]))),
    h('div', { class: 'mon-espace-ligne' }, boutonEnregistrer, boutonTester),
    message, resultatTest);
}

function blocAcces(espaceDepart, d) {
  const email = h('input', { type: 'email', class: 'champ', id: 'base-acces-email', name: 'email', maxlength: '254', autocomplete: 'off', spellcheck: 'false', 'aria-describedby': 'base-acces-email-erreur', dataset: { champ: 'acces-email' } });
  const espace = h('input', { type: 'text', class: 'champ', id: 'base-acces-espace', name: 'espace', value: espaceDepart, maxlength: '40', autocomplete: 'off', spellcheck: 'false', 'aria-describedby': 'base-acces-espace-erreur', dataset: { champ: 'acces-espace' } });
  const erreurEmail = lignesErreur('base-acces-email');
  const erreurEspace = lignesErreur('base-acces-espace');
  const message = h('p', { class: 'mon-espace-message', role: 'status', dataset: { role: 'acces-message' } });
  const donner = h('button', { type: 'submit', class: 'bouton bouton-principal', dataset: { action: 'donner-acces' } }, 'Donner l’accès');
  const retirer = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'retirer-acces' } }, 'Retirer l’accès');

  const lire = () => {
    const r = controlerDemandeAcces({ email: email.value, espace: espace.value });
    montrer(erreurEmail, r.erreurs.email); montrer(erreurEspace, r.erreurs.espace);
    email.setAttribute('aria-invalid', r.erreurs.email ? 'true' : 'false');
    espace.setAttribute('aria-invalid', r.erreurs.espace ? 'true' : 'false');
    if (!r.ok) (r.erreurs.email ? email : espace).focus();
    return r;
  };
  async function agir(enRetrait) {
    montrer(message, '');
    const r = lire();
    if (!r.ok) return;
    if (enRetrait && !(await confirmer('Retirer l’accès ?', `Le compte ${r.demande.email} ne pourra plus lire la base de l’espace « ${r.demande.espace} » (dans l’heure au plus).`, { libelleOk: 'Retirer', danger: true }))) return;
    donner.disabled = true; retirer.disabled = true;
    try {
      await d.accorder({ ...r.demande, retirer: enRetrait });
      message.dataset.etat = 'ok';
      montrer(message, enRetrait ? MESSAGE_ACCES_RETIRE : MESSAGE_ACCES_DONNE);
    } catch (err) {
      message.dataset.etat = 'erreur';
      montrer(message, err?.message || 'Ça n’a pas abouti.');
    } finally {
      donner.disabled = false; retirer.disabled = false;
    }
  }
  retirer.addEventListener('click', () => agir(true));

  return h('form', { class: 'mon-espace-formulaire', novalidate: true, dataset: { role: 'base-acces' }, onsubmit: (e) => { e.preventDefault(); agir(false); } },
    h('h3', {}, 'Donner l’accès à un compte'),
    h('p', { class: 'aide' }, 'Un compte à la fois. Sans cet accès, la base ne répond rien à un compte. L’effet arrive dans l’heure au plus, et la personne doit se reconnecter.'),
    h('div', { class: 'mon-espace-champs' },
      champ('Adresse e-mail du compte', 'base-acces-email', email, erreurEmail),
      champ('Nom court de l’espace', 'base-acces-espace', espace, erreurEspace)),
    h('div', { class: 'mon-espace-ligne' }, donner, retirer),
    message);
}
