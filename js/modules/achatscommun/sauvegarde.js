// Code partagé des modules Achats (26/11/2026) : la carte « Sauvegarde complète des achats » de Réglages > Achats (demande de Jérôme : un seul bouton, un .zip avec toutes les tables).
// Ce dossier n'est pas un module. Chaque module Achats allumé appelle `zoneSauvegardesAchats(page, inscription, ctx)` dans son `reglages(page, ctx)` :
//  - la première fois, la carte (en haut) et le bloc replié « Sauvegardes séparées » sont ajoutés à la page ;
//  - le module y inscrit sa table (le MÊME fichier que son propre bouton) et reçoit la zone où poser sa section « Sauvegarde des … » (règle : chaque module garde son export).
// Aucun module n'en importe un autre : la carte ne connaît que les tables inscrites par les modules allumés (chacun reste vendable seul).
import { h, icone, toast } from '../../os/ui.js';
import { creerZip } from '../../os/zip.js';
import { rassemblerSauvegarde, nomFichierSauvegarde, jourDeParis } from './sauvegarde-logique.js';

export const ID_CARTE = 'reglages-sauvegarde-achats';
export const ID_SEPAREES = 'reglages-sauvegardes-separees';

const inscriptionsDe = new WeakMap(); // carte -> [{ module, table, fabriquer }]

/** Télécharge l'archive (fabriquée dans le navigateur : rien n'est envoyé). */
function telechargerZip(nom, octets) {
  const adresse = URL.createObjectURL(new Blob([octets], { type: 'application/zip' }));
  const lien = h('a', { href: adresse, download: nom });
  document.body.append(lien);
  lien.click();
  lien.remove();
  setTimeout(() => URL.revokeObjectURL(adresse), 1000);
}

/** Lit toutes les tables puis télécharge le .zip ; jamais d'archive incomplète (une table en échec = rien n'est téléchargé, le message la nomme). Renvoie true si le fichier est parti. */
export async function telechargerSauvegarde(inscriptions, { actifs, telecharger = telechargerZip, prevenir = toast, maintenant = new Date(), etat = null } = {}) {
  etat?.(true, '');
  try {
    const { fichiers, avertissements } = await rassemblerSauvegarde(inscriptions, { actifs });
    telecharger(nomFichierSauvegarde(jourDeParis(maintenant)), creerZip(fichiers, { date: maintenant }));
    const texte = `Sauvegarde téléchargée : ${fichiers.length} table${fichiers.length > 1 ? 's' : ''}`;
    prevenir(avertissements.length ? `${texte}. ${avertissements.join(' ')}` : texte, { type: avertissements.length ? 'erreur' : 'info', duree: avertissements.length ? 6000 : 3200 });
    etat?.(false, '');
    return true;
  } catch (e) {
    const message = e?.saisie ? e.message : 'Sauvegarde non téléchargée : la fabrication de l’archive a échoué. Réessaie.';
    if (!e?.saisie) console.warn('Sauvegarde des achats impossible', e?.message);
    prevenir(message, { type: 'erreur', duree: 8000 });
    etat?.(false, message);
    return false;
  }
}

function creerCarte(page, ctx) {
  const erreur = h('p', { class: 'aide sauvegarde-achats-erreur', role: 'alert', hidden: true, dataset: { role: 'sauvegarde-achats-erreur' } });
  const bouton = h('button', { type: 'button', class: 'bouton bouton-principal', dataset: { action: 'sauvegarde-achats-zip' } }, icone('download', { taille: 16 }), 'Télécharger la sauvegarde (.zip)');
  const carte = h('section', { class: 'carte-section', id: ID_CARTE },
    h('h2', {}, icone('archive', { taille: 18 }), 'Sauvegarde complète des achats'),
    h('p', { class: 'aide' }, 'Un seul fichier .zip avec une table par module Achats allumé (les mêmes fichiers que les sauvegardes séparées, sans les coordonnées bancaires). Si une table ne se lit pas, rien n’est téléchargé.'),
    h('div', { class: 'ligne-boutons' }, bouton),
    erreur);
  const etat = (enCours, message) => {
    bouton.disabled = enCours;
    bouton.setAttribute('aria-busy', enCours ? 'true' : 'false');
    erreur.textContent = message;
    erreur.hidden = !message;
  };
  bouton.addEventListener('click', () => telechargerSauvegarde(inscriptionsDe.get(carte), { actifs: ctx?.actifs, etat }));
  const contenu = h('div', { class: 'sauvegardes-separees-contenu' });
  const separees = h('details', { class: 'sauvegardes-separees', id: ID_SEPAREES },
    h('summary', { dataset: { role: 'sauvegardes-separees' } }, 'Sauvegardes séparées'),
    contenu);
  inscriptionsDe.set(carte, []);
  page.append(carte, separees);
  return carte;
}

/**
 * Inscrit la table d'un module (`inscription` = { module, table, fabriquer }) dans la carte de la page (créée au premier appel) et renvoie la zone repliée
 * « Sauvegardes séparées », où le module pose sa propre section d'export.
 */
export function zoneSauvegardesAchats(page, inscription, ctx = {}) {
  const carte = [...page.children].find((el) => el.id === ID_CARTE) ?? creerCarte(page, ctx);
  inscriptionsDe.get(carte).push(inscription);
  return [...page.children].find((el) => el.id === ID_SEPAREES).querySelector('.sauvegardes-separees-contenu');
}
