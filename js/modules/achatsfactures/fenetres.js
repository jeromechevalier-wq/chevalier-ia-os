// Fenêtres de la page « Examiner » et de « + Facture » (PR 8b) : courriel complet, « Nos contrôles anti-arnaque », créer l'agence, motif (refus, acceptation malgré alerte, réouverture), relier à un chantier, ajouter une facture.
// Règle commune : une fenêtre qui écrit reste OUVERTE si le serveur refuse (le message du serveur est dit dans la fenêtre, la saisie est gardée) ; elle ne se ferme que si l'écriture a réussi.
// Aucune écriture n'est faite ici : chaque fenêtre reçoit une fonction `executer` fournie par la page (qui passe par la couche des actions métier).
import { h, dialogue, champIntelligent } from '../../os/ui.js';
import { preparerMessage, tailleLisible, typeLisible, lirePiecesJointes, champOuTiret } from './courriel.js';
import { dateHeureFr } from './logique.js';
import { EXPLICATIONS, BIENTOT, ACTIFS, AVERTISSEMENT_LONG, INFO_COMPTE } from './explications.js';
import { MOTIF_MIN, MOTIF_MAX, motifValide } from './decision.js';
import { verifierChampsAgence } from './agences.js';
import { verifierFichierPdf, envoyerFacture, suivreSelection, TAILLE_MAX_OCTETS, tailleLisibleMo } from './upload.js';

export const MESSAGE_PAR_DEFAUT = 'Une erreur est survenue, réessaie dans un instant.';
const messageDe = (e) => (e instanceof Error && e.message ? e.message : MESSAGE_PAR_DEFAUT);

/**
 * Fenêtre dont le bouton principal écrit. `executer()` renvoie une promesse : si elle lève, la fenêtre RESTE ouverte avec le message ; sinon elle se ferme et la promesse de `fenetreAction` rend { ok: true, resultat }.
 * Fermer sans valider rend null. `pret()` (facultatif) dit si le bouton peut être cliqué ; `majBouton()` est à rappeler quand ce que `pret` lit change.
 */
export function fenetreAction({ titre, classe = 'dialogue-formulaire', contenu, libelle, style = 'principal', executer, pret = null, apres = null }) {
  const erreur = h('p', { class: 'erreur', role: 'alert', hidden: true, dataset: { erreur: 'fenetre' } });
  let bouton = null;
  let resultat = null;
  let occupe = false;
  const majBouton = () => { if (bouton) bouton.disabled = occupe || (pret ? !pret() : false); };
  const dire = (m) => { erreur.textContent = m ?? ''; erreur.hidden = !m; };
  const p = dialogue({
    titre, classe, contenu: h('div', { class: 'pile' }, contenu(majBouton, dire), erreur),
    peutFermer: () => !occupe,
    boutons: [{ libelle: 'Annuler', valeur: null }, { libelle, valeur: 'ok', style, avantFermeture: async () => {
      if (occupe) return false;
      occupe = true; dire(null); majBouton();
      try { resultat = await executer(); } catch (e) { occupe = false; dire(messageDe(e)); majBouton(); return false; }
      return true;
    } }],
    auMontage: ({ boutons }) => { bouton = boutons[1]; majBouton(); apres?.({ majBouton, dire }); },
  });
  return p.then((v) => (v === 'ok' ? { ok: true, resultat } : null));
}

// ------------------------------------------------------------------ courriel complet
const ligneInfo = (libelle, valeur) => h('div', { class: 'ligne-info' }, h('span', { class: 'etiquette' }, libelle), h('span', { class: 'valeur-info' }, valeur));

/** Courriel d'où vient la facture : en-têtes, pièces jointes (noms et tailles seulement), puis le message en TEXTE (jamais en HTML). */
export function fenetreCourriel(c) {
  const message = preparerMessage(c.corps_texte);
  const pieces = lirePiecesJointes(c.pieces_jointes);
  return dialogue({
    titre: 'Courriel reçu', classe: 'dialogue-formulaire dialogue-courriel',
    contenu: h('div', { class: 'pile', dataset: { role: 'courriel-complet' } },
      ligneInfo('De', champOuTiret(c.expediteur)), ligneInfo('Objet', champOuTiret(c.sujet)),
      ligneInfo('Reçu le', c.recu_le ? dateHeureFr(c.recu_le) : '—'), ligneInfo('Boîte', champOuTiret(c.boite)),
      pieces.length ? h('div', { class: 'ligne-info' }, h('span', { class: 'etiquette' }, 'Pièces jointes'),
        h('ul', { class: 'liste-pieces' }, pieces.map((p) => h('li', {}, p.nom, ` · ${[typeLisible(p.type, p.nom), tailleLisible(p.taille)].filter(Boolean).join(' · ')}`)))) : null,
      h('div', { class: 'message-courriel', dataset: { role: 'courriel-texte' } }, message ?? 'Ce courriel n’a pas de texte.')),
    boutons: [{ libelle: 'Fermer', valeur: true, style: 'principal' }],
  });
}

// ------------------------------------------------------------------ « Nos contrôles anti-arnaque »
/** Explication de chaque vérification : à quoi elle sert, un exemple, ses limites, quoi faire. Les contrôles à venir sont dits « bientôt ». */
export function fenetreControles() {
  const bloc = (id, titre) => {
    const e = EXPLICATIONS[id];
    return h('section', { class: 'controle-explique', dataset: { controle: id } }, h('h3', {}, titre),
      h('p', {}, h('b', {}, 'À quoi ça sert : '), e.quoi), h('p', {}, h('b', {}, 'Un exemple : '), e.cas),
      h('p', {}, h('b', {}, 'Ses limites : '), e.limite), h('p', {}, h('b', {}, 'Que faire : '), e.faire));
  };
  return dialogue({
    titre: 'Nos contrôles anti-arnaque', classe: 'dialogue-formulaire dialogue-controles',
    contenu: h('div', { class: 'pile', dataset: { role: 'controles-explications' } },
      h('p', { class: 'aide' }, AVERTISSEMENT_LONG), ACTIFS.map((a) => bloc(a.id, a.titre)),
      h('h3', {}, 'Bientôt'), BIENTOT.map((b) => h('p', {}, h('b', {}, `${b.titre} : `), b.quoi)),
      h('p', { class: 'aide' }, INFO_COMPTE)),
    boutons: [{ libelle: 'Fermer', valeur: true, style: 'principal' }],
  });
}

// ------------------------------------------------------------------ motif (refus, acceptation malgré alerte, réouverture)
/** Fenêtre avec un motif obligatoire (3 à 500 caractères). `executer(motif)` écrit. `texteInitial` : motif proposé (ex. doublon). */
export function fenetreMotif({ titre, consigne, libelle, style = 'principal', texteInitial = '', executer }) {
  let champ = null;
  return fenetreAction({
    titre, libelle, style,
    contenu: (majBouton) => {
      champ = h('textarea', { class: 'champ', rows: 4, maxlength: MOTIF_MAX, 'aria-label': 'Motif', dataset: { champ: 'motif' }, oninput: majBouton }, texteInitial);
      return [h('p', {}, consigne), champ, h('p', { class: 'aide' }, `De ${MOTIF_MIN} à ${MOTIF_MAX} caractères.`)];
    },
    pret: () => !!champ && motifValide(champ.value),
    executer: () => executer(champ.value.trim()),
  });
}

// ------------------------------------------------------------------ créer l'agence
const CHAMPS_AGENCE = [
  ['nom_fournisseur', 'Nom de l’entreprise', 'text'], ['siret', 'SIRET de l’agence (14 chiffres)', 'text'], ['siren', 'SIREN de l’entreprise (9 chiffres)', 'text'],
  ['nom_agence', 'Nom de l’agence', 'text'], ['ville', 'Ville', 'text'],
];

/** Créer l'agence du fournisseur (champs pré-remplis avec ce que la lecture a vu). `executer(champs)` renvoie la réponse du serveur (l'agence créée). */
export function fenetreAgence({ champsInitiaux, executer }) {
  const saisies = {};
  return fenetreAction({
    titre: 'Créer l’agence du fournisseur', libelle: 'Créer l’agence',
    contenu: () => [
      h('p', { class: 'aide' }, 'L’agence n’existe pas encore pour ce fournisseur : elle sera créée, puis choisie pour cette facture.'),
      CHAMPS_AGENCE.map(([cle, etiquette, type]) => h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, etiquette),
        saisies[cle] = h('input', { class: 'champ', type, value: champsInitiaux[cle] ?? '', dataset: { champ: cle }, autocomplete: 'off' })))],
    executer: () => {
      const champs = Object.fromEntries(CHAMPS_AGENCE.map(([cle]) => [cle, saisies[cle].value]));
      const probleme = verifierChampsAgence(champs);
      if (probleme) throw new Error(probleme);
      return executer(champs);
    },
  });
}

// ------------------------------------------------------------------ relier à un chantier
/** Choisir un chantier (obligatoire) pour une facture acceptée sans chantier. `fournir(saisie)` : résultats du champ ; `executer(chantierId)` écrit. */
export function fenetreLiaison({ fournir, executer, phraseFerme }) {
  let choisi = null;
  const note = h('p', { class: 'erreur', role: 'status', hidden: true });
  return fenetreAction({
    titre: 'Relier à un chantier', libelle: 'Relier',
    contenu: (majBouton) => {
      const champ = champIntelligent({ etiquette: 'Chantier', placeholder: 'Chercher un chantier', icone: 'search', ouvrirAuFocus: true, fournir,
        surChoix: (el) => { choisi = el; const ph = el && phraseFerme ? phraseFerme(el.id) : null; note.textContent = ph ?? ''; note.hidden = !ph; majBouton(); } });
      return [h('p', {}, 'Choisis le chantier auquel rattacher cette facture.'), champ.element, note];
    },
    pret: () => !!choisi && note.hidden,
    executer: () => executer(choisi.id),
  });
}

// ------------------------------------------------------------------ « + Facture »
/** Ajouter une facture reçue par courrier : un PDF de 10 Mo au plus. Le contrôle du fichier se fait avant l'envoi ; `actions` est la couche des actions métier (ajouterFacture) ; le résultat est { factureId, lectureReussie, lignesEcrites }. */
export function fenetreAjout({ actions }) {
  let fichier = null;
  const probleme = h('p', { class: 'erreur', role: 'alert', hidden: true, dataset: { erreur: 'fichier' } });
  const nom = h('p', { class: 'aide', dataset: { role: 'fichier-choisi' } }, 'Aucun fichier choisi.');
  let majBoutonRef = () => {};
  const selection = suivreSelection();
  const entree = h('input', { type: 'file', accept: 'application/pdf,.pdf', class: 'champ', dataset: { champ: 'fichier-facture' }, 'aria-label': 'Choisir un PDF',
    onchange: async (e) => {
      fichier = null; majBoutonRef();
      const n = selection.nouveau(); // une vérification lente d'un fichier plus ancien est ignorée
      const f = e.target.files?.[0];
      if (!f) { nom.textContent = 'Aucun fichier choisi.'; probleme.hidden = true; return; }
      nom.textContent = `${f.name} · ${tailleLisibleMo(f.size)}`;
      const m = await verifierFichierPdf(f);
      if (!selection.estCourant(n)) return;
      probleme.textContent = m ?? ''; probleme.hidden = !m;
      fichier = m ? null : f; majBoutonRef();
    } });
  return fenetreAction({
    titre: 'Ajouter une facture', libelle: 'Envoyer',
    contenu: (majBouton) => { majBoutonRef = majBouton; return [h('p', {}, `Choisis le PDF de la facture (${tailleLisibleMo(TAILLE_MAX_OCTETS)} au plus). Elle arrivera dans « À valider » après lecture.`), entree, nom, probleme]; },
    pret: () => !!fichier,
    executer: () => envoyerFacture(fichier, { actions }),
  });
}
