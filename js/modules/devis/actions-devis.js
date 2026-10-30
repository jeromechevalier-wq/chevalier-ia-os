// Actions d'un devis, UNE SEULE FOIS pour les trois écrans qui les proposent : la liste (menu « … » d'une ligne ou d'une carte), l'éditeur et la visualisation (bouton « … »).
// Les règles (quelle entrée existe, grisée ou non, avec quelle phrase) sont dans liste.js (entreesActionsDevis, pur et testé) ; ici on branche chaque entrée sur son action.
// Le statut ne change QUE par les fonctions du serveur (donnees.js), jamais par une écriture directe. Un refus du serveur ou une panne s'affiche dans un message, sans fermer l'écran.
import { h, toast, dialogue, confirmer } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import * as CRM from '../crm/donnees.js';
import * as D from './donnees.js';
import * as Li from './liste.js';
import * as Ed from './editeur-logique.js';
import { lancerPreparationEmail } from './email-preparer-ecran.js';
import { MESSAGE_NON_BRANCHE } from './email-preparer.js';
import { adressesDuDevis } from './email-brouillon.js';

export const ERREUR_ECRITURE = 'Enregistrement impossible : ton compte n’a peut-être que le droit de lire cet espace, ou la connexion est coupée. Réessaie dans un instant.';
const nouvelId = () => CRM.ctx().nouvelId('devis_devis');

/** Client (organisation, sinon personne) et affaire d'un devis, lus dans le CRM. */
export function nomsDe(d) {
  const org = d.organisationId ? CRM.organisation(d.organisationId) : null;
  const pers = d.personneId ? CRM.personne(d.personneId) : null;
  const aff = d.affaireId ? CRM.affaire(d.affaireId) : null;
  const client = org?.nom || pers?.nom || (aff?.organisationId ? CRM.organisation(aff.organisationId)?.nom : '') || (aff?.personneId ? CRM.personne(aff.personneId)?.nom : '') || '';
  return { client, affaire: aff?.titre || '' };
}

const dire = (e) => { console.warn(e); toast(e?.message || D.MESSAGE_RESEAU_DEVIS, { type: 'erreur', duree: 8000 }); };

/** « Devis envoyé » : ajoute à l'historique des envois les destinataires et la copie du devis. Le statut est DÉJÀ posé ; un échec ici ne doit rien défaire (la date du premier envoi reste visible, sans adresse). */
export const MESSAGE_ENVOI_NON_NOTE = 'Statut posé ; l’historique des envois n’a pas pu être écrit.';
async function noterEnvoi(d) {
  const destinataires = adressesDuDevis(d.destinataires);
  if (!destinataires.length) return;
  try { await D.enregistrerEnvoi(d.id, { destinataires, copie: adressesDuDevis(d.copie) }); } catch (e) { console.warn(e); toast(MESSAGE_ENVOI_NON_NOTE, { type: 'erreur', duree: 8000 }); }
}

/** Appelle la fonction du serveur puis dit le résultat. Un refus du serveur ou une panne de réseau s'affiche en clair ; rien n'est écrit par le navigateur. */
export async function changerStatut(d, action, libelle) {
  try {
    if (action === 'finaliser') {
      const ok = await confirmer('Finaliser ce devis ?', 'Les prix, la TVA et les totaux seront figés et le devis recevra son numéro. Pour le corriger ensuite, tu créeras une nouvelle version.', { libelleOk: 'Finaliser' });
      if (!ok) return;
      const r = await D.finaliser(d.id);
      if (r?.ok === false) {
        await dialogue({ titre: 'Ce devis ne peut pas encore être finalisé', contenu: h('ul', { class: 'liste-erreurs-devis' }, (r.erreurs ?? []).map((e) => h('li', {}, e))), boutons: [{ libelle: 'Compris', valeur: true, style: 'principal' }] });
        return;
      }
      toast('Devis finalisé');
      return;
    }
    // Signé et refusé : fenêtre de confirmation, aussi depuis le menu « … » de la liste (phrases = ce que le code permet vraiment ensuite : logique.js TRANSITIONS, serveur changerStatut).
    if (action === 'accepter') {
      if (!await confirmer('Marquer ce devis signé ?', 'Le devis passe à Signé. Il ne pourra plus être modifié ni versionné ; les autres versions du même numéro encore en attente ou envoyées passent à Remplacé.', { libelleOk: 'Marquer signé' })) return;
    } else if (action === 'refuser') {
      if (!await confirmer('Marquer ce devis refusé ?', 'Le devis passe à Refusé. Tu pourras encore créer une nouvelle version.', { libelleOk: 'Marquer refusé', danger: true })) return;
    }
    await D.changerStatut(d.id, action);
    if (action === 'marquer_envoye') await noterEnvoi(d); // l'historique des envois garde À QUI (et en copie) : l'e-mail lui-même est parti de Gmail, la personne vient de le dire
    toast(`Devis passé à « ${libelle} »`);
  } catch (e) { dire(e); }
}

/** Archive (ou sort des archives) un devis par la fonction du serveur ; un refus ou une panne s'affiche en clair. */
export async function archiver(d, archive) {
  try {
    await D.archiver(d.id, archive);
    toast(archive ? 'Devis archivé' : 'Devis sorti des archives');
  } catch (e) { dire(e); }
}

/** Supprime un brouillon après confirmation. Le serveur refuse tout autre statut ; la copie « avant » reste dans le journal. `apres` : appelée une fois supprimé. */
export async function supprimerBrouillon(d, apres = () => {}) {
  if (d.statut !== 'brouillon') return;
  const nom = d.nom?.trim() || d.objet?.trim() || nomsDe(d).client || 'ce brouillon';
  const ok = await confirmer('Supprimer ce brouillon ?', `« ${nom} » sera supprimé. Un devis supprimé ne se retrouve pas dans la liste (seul le journal en garde une copie).`, { libelleOk: 'Supprimer', danger: true });
  if (!ok) return;
  try {
    await D.supprimer(d.id);
    toast('Brouillon supprimé');
    apres();
  } catch (e) { dire(e); }
}

function attendreDevis(id, ms = 4000) {
  return new Promise((resoudre) => {
    if (D.devisParId(id)) { resoudre(true); return; }
    let arret = () => {};
    const fin = setTimeout(() => { arret(); resoudre(false); }, ms);
    arret = D.surChangement(() => { if (D.devisParId(id)) { clearTimeout(fin); arret(); resoudre(true); } });
  });
}

let creationSansAffaire = false; // un double clic ne crée pas deux brouillons
/**
 * « Nouveau devis » (liste, menu « + », ancienne adresse devis/editeur) : crée tout de suite un brouillon SANS affaire et ouvre l'éditeur, où l'on choisit l'affaire.
 * Rend vrai si l'éditeur s'ouvre, faux sinon (un message dit l'échec, sauf `silencieux`).
 */
export async function creerDevisSansAffaire({ remplacer = false, silencieux = false } = {}) {
  if (creationSansAffaire) return true;
  creationSansAffaire = true;
  try {
    const r = await D.creerBrouillon(Ed.valeursDeCreation(null, null));
    if (!r.id) throw new Error(Object.values(r.erreurs)[0] || ERREUR_ECRITURE);
    naviguer(`devis/editeur/${r.id}`, remplacer ? { remplacer: true } : undefined);
    return true;
  } catch (e) {
    console.warn(e?.code ?? '', e?.message ?? '');
    if (!silencieux) toast(ERREUR_ECRITURE, { type: 'erreur', duree: 8000 });
    return false;
  } finally {
    creationSansAffaire = false;
  }
}

/** Phrase affichée après « Dupliquer aux prix du jour » : ce qui a été refait, ce qui n'existe plus au catalogue (avec son numéro dans le nouveau brouillon). */
export function messagePrixDuJour(sections, disparues) {
  const n = Ed.numerotation(sections);
  const liste = disparues.map((x) => `${n[x.ligneId] ?? ''} ${x.libelle}`.trim()).join(', ');
  const base = 'Brouillon créé aux prix du jour : un prix de vente, un libellé ou une TVA retouchés à la main sur la ligne d’origine ne sont pas repris.';
  if (!disparues.length) return base;
  return `${base} ${disparues.length === 1 ? '1 ligne n’existe plus dans le catalogue' : `${disparues.length} lignes n’existent plus dans le catalogue`} : ${liste} ; ${disparues.length === 1 ? 'elle garde son' : 'elles gardent leur'} ancien prix, à vérifier.`;
}

/**
 * Crée un brouillon qui copie un devis (même affaire, mêmes lignes) et ouvre l'éditeur.
 * `prixDuJour` : les lignes venues d'un article actif sont refaites depuis le catalogue d'aujourd'hui (Ed.repriserSections) ; le devis d'origine n'est jamais touché.
 */
export async function dupliquerDevis(source, { prixDuJour = false } = {}) {
  try {
    let contenu = Ed.copieDeDevis(source, nouvelId);
    let message = null;
    if (prixDuJour) {
      const lignes = (contenu.sections ?? []).flatMap((s) => s.lignes ?? []);
      if (!lignes.length) message = 'Rien à recalculer : ce devis n’a aucune ligne.';
      else {
        const r = Ed.repriserSections(contenu.sections, D.etat.articles, { marge: source.marge, modeMarge: source.modeMarge });
        contenu = { ...contenu, sections: r.sections };
        message = messagePrixDuJour(r.sections, r.disparues);
      }
    }
    const r = await D.creerBrouillon({
      affaireId: source.affaireId, organisationId: source.organisationId, personneId: source.personneId, adresses: source.adresses,
      destinataires: source.destinataires, copie: source.copie, modeMarge: source.modeMarge, marge: source.marge, tauxTvaDefaut: source.tauxTvaDefaut,
    });
    if (!r.id) throw new Error(Object.values(r.erreurs)[0] || ERREUR_ECRITURE);
    let copie = false;
    try {
      if (await attendreDevis(r.id)) { const m = await D.modifierBrouillon(r.id, contenu); copie = Object.keys(m.erreurs).length === 0; }
    } catch (e) { console.warn(e); }
    // Le brouillon existe même si la copie du contenu a échoué : on l'ouvre et on le dit.
    if (!copie) toast('Le brouillon est créé, mais son contenu n’a pas pu être copié : ajoute les lignes à la main, ou réessaie depuis la liste.', { type: 'erreur', duree: 10000 });
    else if (message) toast(message, { duree: 12000 });
    naviguer(`devis/editeur/${r.id}`);
  } catch (e) { dire(e); }
}

/** Crée le brouillon suivant d'un devis finalisé, envoyé ou refusé (fonction du serveur `nouvelleVersion`) et ouvre l'éditeur. */
export async function creerNouvelleVersion(d) {
  try {
    const r = await D.nouvelleVersion(d.id);
    if (r?.ok === false || !r?.devisId) throw new Error('La nouvelle version n’a pas pu être créée.');
    naviguer(`devis/editeur/${r.devisId}`);
  } catch (e) { dire(e); }
}

/**
 * Entrées d'un menu « … » prêtes pour ouvrirMenu (os/ui.js). `d` : le devis. `options` :
 *  - exclure : clés à ne pas proposer (voir entreesActionsDevis) ;
 *  - apresSuppression : où aller une fois le brouillon supprimé ;
 *  - surcharges : { <clé>: (d) => … } pour remplacer une action (l'éditeur enregistre d'abord ses changements, par exemple).
 */
export function entreesMenuDevis(d, { exclure = [], apresSuppression = () => {}, surcharges = {} } = {}) {
  const actions = {
    editer: () => naviguer(`devis/editeur/${d.id}`),
    voir: () => naviguer(`devis/voir/${d.id}`),
    nouvelle_version: () => creerNouvelleVersion(d),
    dupliquer: () => dupliquerDevis(d),
    dupliquer_prix_du_jour: () => dupliquerDevis(d, { prixDuJour: true }),
    preparer_email: () => lancerPreparationEmail({ devisId: d.id, getDevis: () => D.devisParId(d.id), finaliser: { libelle: 'Ouvrir le devis', action: () => naviguer(`devis/editeur/${d.id}`) } }),
    supprimer: () => supprimerBrouillon(d, apresSuppression),
  };
  return Li.entreesActionsDevis(d, { exclure }).flatMap((e) => {
    if (e.separateur || e.texte !== undefined) return [e];
    let action;
    if (surcharges[e.cle]) action = () => surcharges[e.cle](d);
    else if (e.cle.startsWith('statut:')) action = () => changerStatut(d, e.action, e.statutLibelle);
    else if (e.cle === 'archiver') action = () => archiver(d, e.action === 'archiver');
    else action = actions[e.cle];
    // Pas branché sur cet espace (réponse du serveur) : l'entrée reste là, grisée, avec la raison (le menu ne doit pas se vider).
    if (e.cle === 'preparer_email' && e.actif && D.emailPreparable() === false) return [{ cle: e.cle, libelle: e.libelle, icone: e.icone, desactive: true, titreInfo: MESSAGE_NON_BRANCHE, action }, { texte: MESSAGE_NON_BRANCHE }];
    return [{ cle: e.cle, libelle: e.libelle, icone: e.icone, danger: e.danger, desactive: !e.actif, action }];
  });
}
