// Petits composants du module Rendez-vous, réutilisables : interrupteur, champ nombre à flèches, bulle de SMS, compteur de caractères, « i » + lien téléphone.
import { h, icone, iconeInfo } from '../../os/ui.js';
import * as R from './logique.js';

/** Interrupteur (case à bascule). `surChangement(valeur)` est appelé à chaque clic. Renvoie { element, definir(valeur), valeur() }. */
export function interrupteur({ valeur = false, libelle, surChangement = () => {}, desactive = false }) {
  const bouton = h('button', { type: 'button', class: 'rdv-interrupteur', role: 'switch', 'aria-label': libelle, 'aria-checked': String(!!valeur), disabled: desactive,
    onclick: () => { definir(bouton.getAttribute('aria-checked') !== 'true'); surChangement(valeur_()); } }, h('span', { class: 'rdv-interrupteur-bouton' }));
  const valeur_ = () => bouton.getAttribute('aria-checked') === 'true';
  function definir(v) { bouton.setAttribute('aria-checked', String(!!v)); }
  return { element: bouton, definir, valeur: valeur_ };
}

/** Champ nombre avec les deux petites flèches haute et basse (consigne 9). `surChangement(n)` à chaque changement valide. */
export function champNombre({ valeur, min = 0, max = 10, libelle, surChangement = () => {} }) {
  const champ = h('input', { class: 'champ rdv-champ-nombre', type: 'number', min: String(min), max: String(max), step: '1', value: String(valeur), 'aria-label': libelle,
    onchange: () => envoyer() });
  function envoyer() {
    const n = Math.floor(Number(champ.value));
    if (!Number.isFinite(n) || n < min || n > max) { champ.classList.add('invalide'); return; }
    champ.classList.remove('invalide');
    surChangement(n);
  }
  return { element: champ, champ, valeur: () => Number(champ.value) };
}

/** Bulle de SMS : `sens` 'sortant' (à gauche, violet) ou 'entrant' (à droite, gris). */
export function bulleSms({ sens, texte, qui = '', heure = '', caracteres = null, incomprise = false }) {
  return h('div', { class: `bulle-ligne bulle-${sens}${incomprise ? ' bulle-incomprise' : ''}`, dataset: { sens } },
    h('div', { class: 'bulle' }, h('p', { class: 'bulle-texte' }, texte)),
    h('div', { class: 'bulle-pied' }, [qui, heure].filter(Boolean).join(' · '), caracteres !== null ? h('span', { class: 'bulle-caracteres' }, ` · ${caracteres} caractères`) : null));
}

/** Compteur « n caractères sur 160 · 1 SMS » d'un texte de SMS (déjà normalisé ou non : le compteur compte ce qui partira). Renvoie { element, maj(texte) }. */
export function compteurSms(texte = '') {
  const el = h('p', { class: 'rdv-compteur-sms', 'aria-live': 'polite' });
  function maj(t) {
    const p = R.preparerSms(t);
    el.textContent = R.libelleCompteur(t);
    el.classList.toggle('rdv-compteur-sms-long', p.segments > 1);
  }
  maj(texte);
  return { element: el, maj };
}

/** Petit « i » dont la bulle donne le numéro, avec le lien `tel:` à côté (consigne 7). */
export function infoTelephone(telephone) {
  const affichage = R.afficherTelephone(telephone);
  const lien = R.lienTel(telephone);
  return h('span', { class: 'rdv-info-tel' }, iconeInfo(affichage, 'Numéro de téléphone'),
    lien ? h('a', { class: 'lien-tel', href: lien, 'aria-label': `Appeler le ${affichage}` }, icone('phone', { taille: 14 })) : null);
}

/** Explication de la règle des accents (consigne 12), affichée à côté des modèles de SMS. */
export const EXPLICATION_ACCENTS = 'Un SMS ordinaire compte 160 caractères. Dès qu’un seul caractère « spécial » s’y glisse (ê, ç minuscule, œ, guillemets « », émoji…), tout le message passe en 70 caractères par SMS, donc coûte plus cher. '
  + 'C’est pourquoi l’appli remplace ces caractères par des équivalents simples (ê devient e, ç devient c) avant l’envoi. Les accents é, è, à et ù sont gardés.';
