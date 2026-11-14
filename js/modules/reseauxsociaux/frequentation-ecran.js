// Écran « Fréquentation du site » du module Réseaux sociaux (14/11/2026) : le tableau de bord public de Plausible (visites de chevalier-ia.fr, sans cookies) affiché dans un cadre (iframe, `embed=true`).
// Choix le plus simple : l'API de statistiques de Plausible demande l'offre Business, donc aucun chiffre n'est copié ni recalculé ici. Les clics de contact (objectifs « Contact formulaire »,
// « Contact téléphone », « Contact WhatsApp ») sont affichés par Plausible lui-même, dans son bloc d'objectifs.
// Le lien de partage est collé par Jérôme dans l'écran et gardé dans ses réglages (jamais écrit dans le dépôt, qui est public). Seuls les liens de partage de plausible.io sont acceptés.
// Quatre états : chargement, erreur de lecture (« Réessayer »), aucun lien (champ pour le coller), lien enregistré (le cadre ; s'il ne répond pas au bout de dix secondes, un message propose d'ouvrir le tableau dans un onglet).
import { h, icone, remplir, dialogue, toast } from '../../os/ui.js';
import { enteteListe } from '../crm/barre-liste.js';
import { etatVide } from '../crm/composants.js';
import * as D from './frequentation-donnees.js';
import * as F from './frequentation-logique.js';
import { estChezClient } from '../../os/contexte.js';
import { ongletsReseauxSociaux, chargement, lienExterne } from './commun.js';

const themeActuel = () => (document.documentElement.dataset.theme === 'clair' ? 'light' : 'dark');

/** Formulaire pour coller (ou changer) le lien. `apres(lien)` est appelé quand le lien est enregistré. */
function formulaireLien({ valeur = '', apres, annuler = null }) {
  const champ = h('input', { type: 'text', class: 'champ', id: 'rs-champ-lien-plausible', autocomplete: 'off', placeholder: 'Colle ici le lien de partage', value: valeur, dataset: { champ: 'lien-plausible' } });
  const erreur = h('p', { class: 'erreur', role: 'alert', hidden: true, dataset: { role: 'erreur-lien' } });
  const bouton = h('button', { type: 'submit', class: 'bouton bouton-secondaire', dataset: { action: 'enregistrer-lien' } }, 'Enregistrer le lien');
  const maj = () => { const ok = champ.value.trim() !== '' && champ.value.trim() !== valeur; bouton.disabled = !ok; bouton.classList.toggle('bouton-principal', ok); bouton.classList.toggle('bouton-secondaire', !ok); };
  champ.addEventListener('input', maj); maj();
  champ.addEventListener('input', () => { erreur.hidden = true; });
  const envoi = async (e) => {
    e.preventDefault();
    const v = F.verifierLien(champ.value);
    if (!v.ok) { erreur.textContent = v.message; erreur.hidden = false; return; }
    bouton.disabled = true;
    try {
      apres(await D.enregistrerLienFrequentation(v.lien));
    } catch (err) {
      console.warn(err);
      erreur.textContent = err?.code === 'permission-denied' ? 'Tu n’as pas le droit de modifier ce réglage (compte en lecture seule).' : 'Le lien n’a pas pu être enregistré. Vérifie ta connexion puis réessaie.';
      erreur.hidden = false;
      bouton.disabled = false;
    }
  };
  return h('form', { class: 'rs-formulaire-lien', onsubmit: envoi, dataset: { role: 'formulaire-lien' } },
    h('div', { class: 'bloc-champ' }, h('label', { class: 'etiquette', for: 'rs-champ-lien-plausible' }, 'Lien de partage Plausible'), champ,
      h('p', { class: 'aide' }, 'Dans Plausible : Paramètres du site > Liens partagés. Le lien est gardé dans tes réglages, pas dans le code.')),
    erreur, h('div', { class: 'ligne-boutons' }, bouton, annuler));
}

/** Cadre du tableau de bord. Au bout de DELAI_CADRE_MS sans réponse du cadre, le message « bloqué » apparaît (le cadre reste en place : il peut finir de charger). */
function cadre(lien, { surChanger, surRetirer }) {
  const bloque = h('p', { class: 'erreur', role: 'alert', hidden: true, dataset: { role: 'cadre-bloque' } },
    'Le tableau de bord ne s’affiche pas ici (connexion lente ?). ', h('a', { class: 'lien-fiche', href: F.adresseOuverture(lien), target: '_blank', rel: 'noopener noreferrer' }, 'Ouvre-le dans un nouvel onglet.'));
  const iframe = h('iframe', { class: 'rs-cadre-plausible', title: estChezClient() ? 'Fréquentation de ton site (Plausible)' : 'Fréquentation de chevalier-ia.fr (Plausible)', src: F.adresseCadre(lien, themeActuel()), referrerpolicy: 'no-referrer',
    sandbox: 'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox', dataset: { role: 'cadre-plausible' } });
  const minuteur = setTimeout(() => { bloque.hidden = false; }, F.DELAI_CADRE_MS);
  iframe.addEventListener('load', () => { clearTimeout(minuteur); bloque.hidden = true; });
  const bloc = h('div', { class: 'rs-zone-cadre' }, bloque, iframe,
    h('p', { class: 'aide' }, 'Le tableau ne s’affiche pas ? ', h('a', { class: 'lien-fiche', href: F.adresseOuverture(lien), target: '_blank', rel: 'noopener noreferrer' }, 'Ouvre-le dans un nouvel onglet.')),
    h('div', { class: 'ligne-boutons' },
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'changer-lien' }, onclick: surChanger }, 'Changer le lien'),
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'retirer-lien' }, onclick: surRetirer }, 'Retirer le lien')));
  bloc.arreter = () => clearTimeout(minuteur);
  return bloc;
}

export function oublierFiltresFrequentation() {}

export function rendreFrequentation(conteneur) {
  let lecture = 'chargement'; // 'chargement' | 'erreur' | 'ok'
  let lien = '';
  let changement = false; // le formulaire de changement est ouvert
  let ferme = false;
  let zoneCadre = null;
  const corps = h('div', { class: 'rs-frequentation' });
  const entete = h('div', {});
  conteneur.append(h('div', { class: 'page page-liste page-reseauxsociaux page-frequentation' }, entete, ongletsReseauxSociaux('reseauxsociaux/frequentation'), corps));

  let generation = 0; // une lecture lente qui finit après une autre action ne l'écrase pas
  async function lire() {
    const moi = ++generation;
    lecture = 'chargement'; rendre();
    let lu = '', etat = 'ok';
    try { lu = await D.lireLienFrequentation(); } catch (e) { console.warn(e); etat = 'erreur'; }
    if (moi !== generation) return;
    lecture = etat; if (etat === 'ok') lien = lu;
    rendre();
  }

  async function retirer() {
    const ok = await dialogue({ titre: 'Retirer le lien ?', contenu: h('p', {}, 'Le tableau de bord ne sera plus affiché ici. Tes statistiques restent dans Plausible, et tu pourras recoller le lien quand tu veux.'),
      boutons: [{ libelle: 'Annuler', valeur: false }, { libelle: 'Retirer le lien', valeur: true, style: 'principal' }] });
    if (!ok) return;
    try { await D.enregistrerLienFrequentation(''); lien = ''; changement = false; generation++; toast('Lien retiré'); rendre(); } catch (e) { console.warn(e); toast(e?.code === 'permission-denied' ? 'Tu n’as pas le droit de modifier ce réglage (compte en lecture seule).' : 'Le lien n’a pas pu être retiré.', { type: 'erreur' }); }
  }

  function rendre() {
    if (ferme) return;
    zoneCadre?.arreter?.(); zoneCadre = null;
    const etat = F.etatEcran({ lecture, lien });
    const ouverture = F.adresseOuverture(lien);
    remplir(entete, enteteListe({ titre: 'Fréquentation du site', actions: ouverture ? [lienExterne({ href: ouverture, libelle: 'Ouvrir dans Plausible', classe: `bouton ${changement ? 'bouton-secondaire' : 'bouton-principal'}`, action: 'ouvrir-plausible' })] : [] }));
    const intro = h('p', { class: 'aide', dataset: { role: 'intro-frequentation' } },
      estChezClient() ? 'Visites de ton site, mesurées par Plausible (sans cookies). Les objectifs que tu as créés dans Plausible (clics de contact, par exemple) sont dans le bloc des objectifs, en bas du tableau.'
        : `Visites de chevalier-ia.fr, mesurées par Plausible (sans cookies). Les clics de contact (${F.OBJECTIFS_CONTACT.join(', ')}) sont dans le bloc des objectifs, en bas du tableau.`);
    let contenu;
    if (etat === 'chargement') contenu = chargement();
    else if (etat === 'erreur') {
      contenu = h('div', { dataset: { role: 'erreur-lecture' } }, h('p', { class: 'erreur', role: 'alert' }, 'Connexion impossible pour le moment : le lien de ton tableau de bord n’a pas pu être lu.'),
        h('div', { class: 'ligne-boutons' }, h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'reessayer-lien' }, onclick: lire }, icone('refresh-cw', { taille: 16 }), 'Réessayer')));
    } else if (etat === 'vide') {
      contenu = h('div', { dataset: { role: 'vide-frequentation' } }, etatVide('Aucun tableau de bord relié pour le moment. Colle ci-dessous le lien de partage de ton site dans Plausible.'),
        formulaireLien({ apres: (l) => { generation++; lien = l; toast('Lien enregistré'); rendre(); } }));
    } else if (changement) {
      contenu = formulaireLien({ valeur: lien, apres: (l) => { generation++; lien = l; changement = false; toast('Lien enregistré'); rendre(); },
        annuler: h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'annuler-changement' }, onclick: () => { changement = false; rendre(); } }, 'Annuler') });
    } else {
      zoneCadre = cadre(lien, { surChanger: () => { changement = true; rendre(); }, surRetirer: retirer });
      contenu = zoneCadre;
    }
    remplir(corps, intro, contenu);
  }

  lire();
  return function quitter() { ferme = true; zoneCadre?.arreter?.(); };
}
