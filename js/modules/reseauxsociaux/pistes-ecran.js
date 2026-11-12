// Pistes de posts, côté écran (13/11/2026) : une ligne par piste (couleur = pilier, marque = état) et la fenêtre « En tirer des idées » (à la main, ou prompt copié puis réponse de Claude collée).
// L'appli n'appelle aucune IA : Jérôme copie le prompt, le colle dans Claude, copie la réponse, la colle ici. RIEN n'est écrit avant « Créer N pistes » (aperçu à cases à cocher).
// Jamais le texte d'un post tiers : une piste porte un angle, une note et un lien, écrits par nous. Tous les textes sont posés comme texte (la fabrique `h`), jamais en HTML.
// Les liens de piste sont revalidés à l'affichage (https seulement) : on ne fait pas confiance à une adresse lue en base.
import { h, icone, remplir, dialogue, toast } from '../../os/ui.js';
import { basculeVues } from '../crm/barre-liste.js';
import { MESSAGE_TEST_ECHEC } from '../crm/composants.js';
import * as D from './donnees.js';
import * as R from './logique.js';
import * as I from './idees-logique.js';
import * as N from './inspirations-logique.js';
import * as P from './pistes-logique.js';
import * as V from './inspirations-vue-logique.js';
import { ajouterPistes, changerEtatPiste, enFaireUneIdee } from './idees-actions.js';
import { COULEUR_PILIER, COULEUR_GRISE, champTexte, champListe, pastillePilier, pastilleFormat, pastilleService } from './commun.js';

const messageErreur = (e) => (e instanceof I.ErreurClaire ? e.message : MESSAGE_TEST_ECHEC);
const pluriel = (n, un, plusieurs) => `${R.formaterNombre(n)} ${n > 1 ? plusieurs : un}`;

/** La marque de chaque état : rond vide = en stock, étoile = retenue, crayon = en rédaction, coche = postée, tiret = écartée. */
const MARQUES = Object.freeze({ stock: 'circle', retenue: 'star', redaction: 'pencil', postee: 'check', ecartee: 'minus' });

// ---------------------------------------------------------------- une ligne de piste

/**
 * Une ligne de piste : pastille de la couleur du pilier, angle (coupé si trop long, entier au survol), format, marque d'état, puis « Retenir », « En faire une idée », « Écarter ».
 * `nomSource` (vue « Toutes les pistes ») ajoute le nom de la source. Les actions écrivent par `idees-actions.js` (journal commun) ; une erreur s'affiche dans un message, jamais en silence.
 */
// Les brouillons dépliés le restent d'un affichage à l'autre (chaque arrivée de données redessine la liste).
const depliees = new Set();

export function lignePiste(piste, { nomSource = null } = {}) {
  const etat = P.etatAffichePiste(piste, D.etat.idees);
  const libelleEtat = V.libelleEtatAffiche(etat);
  const href = I.normaliserUrlWeb(piste.url);
  let enCours = false;
  const agir = (action, succes) => async (e) => {
    const bouton = e.currentTarget;
    if (enCours) return;
    enCours = true; bouton.disabled = true;
    try { await action(); if (succes) toast(succes); } catch (err) { console.warn(err); toast(messageErreur(err), { type: 'erreur' }); } finally { enCours = false; bouton.disabled = false; }
  };
  const bouton = (action, ic, libelle, auClic) => h('button', { type: 'button', class: 'bouton-icone rs-piste-bouton', dataset: { action }, 'aria-label': libelle, title: libelle, onclick: auClic }, icone(ic, { taille: 16 }));
  const piliers = P.piliersDePiste(piste);
  const principal = piliers[0] ?? null;
  const titre = piste.accroche || piste.angle;
  const detail = (piste.accroche && piste.angle && piste.accroche !== piste.angle) || piste.brouillon || piste.visuel || piste.note;
  const corps = detail ? h('div', { class: 'rs-piste-detail', dataset: { role: 'detail-piste' } },
    piste.accroche && piste.angle && piste.accroche !== piste.angle ? h('p', { class: 'rs-analyse', dataset: { role: 'angle-detail' } }, h('strong', {}, 'Angle : '), piste.angle) : null,
    piste.brouillon ? h('div', { class: 'rs-brouillon', dataset: { role: 'brouillon-piste' } }, piste.brouillon.split('\n\n').map((para) => h('p', {}, para))) : null,
    piste.visuel ? h('p', { class: 'rs-analyse', dataset: { role: 'visuel-piste' } }, h('strong', {}, 'Visuel : '), piste.visuel) : null,
    piste.note ? h('p', { class: 'rs-analyse', dataset: { role: 'note-piste' } }, h('strong', {}, 'Pourquoi : '), piste.note) : null) : null;
  return h('li', { class: `rs-piste${etat === 'ecartee' ? ' rs-piste-ecartee' : ''}`, dataset: { piste: piste.id, etat } },
    h('span', { class: 'rs-point', style: { '--couleur': COULEUR_PILIER[principal] ?? COULEUR_GRISE }, title: piliers.map((x) => R.libellePilier(x)).join(', ') || 'À classer', dataset: { role: 'pastille-pilier', pilier: principal ?? '' } }),
    h('span', { class: 'rs-piste-texte' },
      corps ? h('details', { class: 'rs-piste-deplie', open: depliees.has(piste.id), ontoggle: (e) => { if (e.currentTarget.open) depliees.add(piste.id); else depliees.delete(piste.id); } }, h('summary', { class: 'rs-piste-angle', title: [piste.angle, piste.note].filter(Boolean).join(' — '), dataset: { role: 'angle-piste' } }, V.couper(titre, 140)), corps)
        : h('span', { class: 'rs-piste-angle', title: [piste.angle, piste.note].filter(Boolean).join(' — '), dataset: { role: 'angle-piste' } }, V.couper(titre, 140)),
      h('span', { class: 'groupe-pastilles', dataset: { role: 'piliers-piste' } }, piliers.map((x) => pastillePilier(x))),
      nomSource ? h('span', { class: 'rs-piste-source', dataset: { role: 'source-piste' } }, nomSource) : null),
    piste.format ? h('span', { class: 'rs-mini', dataset: { role: 'format-piste' } }, R.libelleFormat(piste.format)) : null,
    h('span', { class: 'rs-marque', title: libelleEtat, role: 'img', 'aria-label': `État : ${libelleEtat}`, dataset: { role: 'etat-piste', etat } }, icone(MARQUES[etat], { taille: 16 })),
    h('span', { class: 'rs-piste-actions' },
      href ? h('a', { class: 'bouton-icone rs-piste-bouton', href, target: '_blank', rel: 'noopener noreferrer', 'aria-label': 'Ouvrir le lien de la piste', title: 'Ouvrir le lien de la piste', dataset: { action: 'ouvrir-piste' } }, icone('external-link', { taille: 16 })) : null,
      etat === 'stock' ? bouton('retenir-piste', 'star', 'Retenir', agir(() => changerEtatPiste(piste.id, 'retenue'))) : null,
      piste.ideeId ? null : h('button', { type: 'button', class: 'bouton bouton-secondaire rs-piste-idee', dataset: { action: 'faire-idee' }, onclick: agir(() => enFaireUneIdee(piste.id), 'Idée créée') }, icone('plus', { taille: 14 }), 'En faire une idée'),
      etat === 'ecartee' ? bouton('remettre-piste', 'rotate-ccw', 'Remettre en stock', agir(() => changerEtatPiste(piste.id, piste.ideeId ? 'retenue' : 'nouvelle'))) // une piste déjà devenue idée reste « retenue »
        : bouton('ecarter-piste', 'x', 'Écarter', agir(() => changerEtatPiste(piste.id, 'ecartee')))));
}

// ---------------------------------------------------------------- fenêtre « En tirer des idées »

const MAX_CHOISIES = P.MAX_PISTES_PAR_LOT;

/** Le prompt du moment : source, ses analyses d'exemples (profil), ses pistes déjà en stock (les siennes seulement) et le nom de l'auteur (celui du compte connecté, « moi » à défaut). */
export function promptPourSource(source) {
  return P.construirePromptPistes({
    source: { ...source, type: N.typeSource(source) },
    pistesExistantes: V.pistesDeSource(D.etat.pistes, source.id),
    exemples: N.exemplesDe(D.etat.exemples, source.id),
    auteur: D.etat.auteur,
  });
}

function panneauMain(source, verrou) {
  const v = { angle: '', pilier: null, format: null, service: null };
  let ajoutees = 0;
  const erreur = h('p', { class: 'erreur', role: 'alert', dataset: { role: 'erreur-piste' } });
  const confirmation = h('p', { class: 'aide', 'aria-live': 'polite', dataset: { role: 'piste-ajoutee' } });
  const bouton = h('button', { type: 'button', class: 'bouton bouton-secondaire', disabled: true, dataset: { action: 'ajouter-piste' } }, icone('plus', { taille: 16 }), 'Ajouter et continuer');
  const maj = () => { const ok = v.angle.trim() !== ''; bouton.disabled = !ok || verrou.pris; bouton.classList.toggle('bouton-principal', ok); bouton.classList.toggle('bouton-secondaire', !ok); };
  const angle = champTexte({ cle: 'angle', libelle: 'Angle : la piste en une phrase', valeur: '', maxlength: P.MAX_ANGLE, surSaisie: (x) => { v.angle = x; maj(); } });
  const pilier = champListe({ cle: 'pilier', libelle: 'Pilier', options: R.PILIERS, vide: 'À choisir', surChangement: (x) => { v.pilier = x; } });
  const format = champListe({ cle: 'format', libelle: 'Format', options: R.FORMATS, vide: 'À choisir', surChangement: (x) => { v.format = x; } });
  const service = champListe({ cle: 'service', libelle: 'Service', options: R.SERVICES, vide: 'Tous les services', surChangement: (x) => { v.service = x; } });
  async function ajouter() {
    if (verrou.pris || !v.angle.trim()) return;
    verrou.pris = true; maj(); erreur.textContent = '';
    try {
      await ajouterPistes(source, [{ angle: v.angle, pilier: v.pilier ?? '', format: v.format ?? '', service: v.service ?? '' }], { voie: 'main', auteur: 'utilisateur' });
      ajoutees++;
      confirmation.textContent = `${pluriel(ajoutees, 'piste ajoutée', 'pistes ajoutées')}. Tu peux en saisir une autre.`;
      v.angle = ''; angle.champ.value = ''; angle.champ.focus();
    } catch (e) { console.warn(e); erreur.textContent = messageErreur(e); } finally { verrou.pris = false; maj(); }
  }
  bouton.addEventListener('click', ajouter);
  angle.champ.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); ajouter(); } });
  return h('div', { class: 'pile', dataset: { voie: 'main' } }, angle.bloc, h('div', { class: 'ligne-champs' }, pilier.bloc, format.bloc, service.bloc), erreur, confirmation, h('div', { class: 'ligne-boutons' }, bouton));
}

function panneauClaude(source, { fermer, verrou }) {
  const zonePrompt = h('textarea', { class: 'champ rs-prompt', readonly: true, rows: '8', 'aria-label': 'Prompt à copier dans Claude', dataset: { role: 'prompt' } });
  // Le prompt est refait chaque fois qu'on arrive sur cette voie : une piste ajoutée à la main entre-temps doit y figurer (« ne propose rien qui dise la même chose »).
  // Une réponse déjà lue est relue aussi : une piste ajoutée à la main entre-temps devient un doublon décoché (l'aperçu ne doit jamais être périmé).
  const rafraichir = () => { zonePrompt.value = promptPourSource(source); statutCopie.textContent = ''; if (lecture) lireLaReponse(); };
  const statutCopie = h('p', { class: 'aide', role: 'status', dataset: { role: 'copie-statut' } });
  zonePrompt.value = promptPourSource(source);
  const boutonCopier = h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'copier-prompt' }, onclick: async () => {
    try { await navigator.clipboard.writeText(zonePrompt.value); statutCopie.textContent = 'Prompt copié. Colle-le dans Claude.'; toast('Prompt copié'); } catch (e) {
      console.warn(e); statutCopie.textContent = 'Copie impossible, sélectionne le texte.'; zonePrompt.focus(); zonePrompt.select();
    }
  } }, icone('copy', { taille: 16 }), 'Copier le prompt');

  let lecture = null; // { lignes, champsIgnores, message } de la dernière réponse lue
  const choisies = new Set();
  const erreur = h('p', { class: 'erreur', role: 'alert', dataset: { role: 'erreur-reponse' } });
  const apercu = h('div', { class: 'rs-apercu-zone', dataset: { role: 'apercu' } });
  const boutonLire = h('button', { type: 'button', class: 'bouton bouton-secondaire', disabled: true, dataset: { action: 'lire-reponse' } }, icone('eye', { taille: 16 }), 'Lire la réponse');
  const boutonCreer = h('button', { type: 'button', class: 'bouton bouton-secondaire', disabled: true, hidden: true, dataset: { action: 'creer-pistes' } });
  const reponse = champTexte({ cle: 'reponse', libelle: 'Coller la réponse de Claude', valeur: '', multiligne: true, lignes: 6, aide: 'Colle toute la réponse de Claude : je trouve le bloc entre accolades. Rien n’est créé avant ton accord.',
    surSaisie: (x) => { boutonLire.disabled = x.trim() === ''; } });

  const majCreer = () => {
    const n = choisies.size;
    boutonCreer.hidden = !lecture;
    boutonCreer.textContent = n ? `Créer ${pluriel(n, 'piste', 'pistes')}` : 'Créer 0 piste';
    boutonCreer.disabled = verrou.pris || n === 0 || n > MAX_CHOISIES;
    boutonCreer.classList.toggle('bouton-principal', !boutonCreer.disabled);
    boutonCreer.classList.toggle('bouton-secondaire', boutonCreer.disabled);
    if (lecture) erreur.textContent = n > MAX_CHOISIES ? `Au plus ${MAX_CHOISIES} pistes à la fois : décoche-en ${n - MAX_CHOISIES}.` : '';
  };
  function rendreApercu() {
    if (!lecture) { remplir(apercu, null); majCreer(); return; }
    const { lignes, champsIgnores, message } = lecture;
    remplir(apercu,
      h('p', { class: 'aide', dataset: { role: 'resume-apercu' } }, `${pluriel(lignes.length, 'piste lue', 'pistes lues')}${champsIgnores ? ` · ${pluriel(champsIgnores, 'champ ignoré', 'champs ignorés')}` : ''}`),
      message ? h('p', { class: 'erreur', dataset: { role: 'message-apercu' } }, message) : null,
      h('ul', { class: 'rs-apercu' }, lignes.map((l) => h('li', { class: `rs-apercu-ligne${l.refus ? ' rs-apercu-refusee' : ''}${l.doublon ? ' rs-apercu-doublon' : ''}`, dataset: { role: 'ligne-apercu', rang: String(l.rang) } },
        h('label', { class: 'rs-apercu-case' },
          h('input', { type: 'checkbox', checked: choisies.has(l.rang), disabled: !!l.refus, dataset: { case: String(l.rang) }, onchange: (e) => { if (e.target.checked) choisies.add(l.rang); else choisies.delete(l.rang); majCreer(); } }),
          h('span', { class: 'rs-apercu-angle', dataset: { role: 'angle-apercu' } }, l.refus ? (l.angle || 'Piste sans angle') : l.piste.angle)),
        l.piste ? h('div', { class: 'groupe-pastilles' }, (l.piste.piliers?.length ? l.piste.piliers : [l.piste.pilier]).map((x) => pastillePilier(x)), pastilleFormat(l.piste.format), pastilleService(l.piste.service)) : null,
        l.refus ? h('p', { class: 'aide rs-apercu-remarque', dataset: { role: 'refus-apercu' } }, `Refusée : ${l.refus}`) : null,
        l.remarques.length ? h('p', { class: 'aide rs-apercu-remarque', dataset: { role: 'remarque-apercu' } }, l.remarques.join(' · ')) : null))));
    majCreer();
  }

  function lireLaReponse() {
    erreur.textContent = '';
    const r = P.lireReponsePistes(reponse.champ.value, { source: { id: source.id }, pistesExistantes: V.pistesDeSource(D.etat.pistes, source.id) });
    choisies.clear();
    if (!r.ok) { lecture = null; erreur.textContent = r.erreur; rendreApercu(); return; }
    lecture = r;
    for (const l of r.lignes) if (l.cochee) choisies.add(l.rang);
    rendreApercu();
  }
  boutonLire.addEventListener('click', lireLaReponse);
  boutonCreer.addEventListener('click', async () => {
    if (verrou.pris || !lecture || !choisies.size || choisies.size > MAX_CHOISIES) return;
    verrou.pris = true; majCreer(); erreur.textContent = '';
    try {
      // Les lignes cochées seulement (doublons recochés compris : Jérôme a décidé). Un seul plan d'écriture, un seul lot : rien n'est écrit avant ce clic.
      const entrees = lecture.lignes.filter((l) => choisies.has(l.rang) && l.piste).map((l) => l.piste);
      const { creees } = await ajouterPistes(source, entrees, { voie: 'collage', auteur: 'claude', accepterDoublons: true });
      toast(`${pluriel(creees, 'piste créée', 'pistes créées')}`);
      fermer();
    } catch (e) { console.warn(e); erreur.textContent = messageErreur(e); } finally { verrou.pris = false; majCreer(); }
  });
  const panneau = h('div', { class: 'pile', dataset: { voie: 'claude' } },
    h('p', { class: 'aide' }, 'Copie ce texte, colle-le dans Claude, puis colle ici sa réponse.'),
    zonePrompt, h('div', { class: 'ligne-boutons' }, boutonCopier), statutCopie,
    reponse.bloc, h('div', { class: 'ligne-boutons' }, boutonLire), erreur, apercu, h('div', { class: 'ligne-boutons' }, boutonCreer));
  panneau.rafraichir = rafraichir;
  return panneau;
}

/** La fenêtre « En tirer des idées » d'une source (réelle, ou résumé de veille pas encore enregistré : la fiche est alors créée au premier lot). */
export function ouvrirTirerIdees({ source }) {
  let fermerBouton = null;
  const fermer = () => fermerBouton?.click();
  const verrou = { pris: false }; // un seul verrou pour les deux voies : jamais deux écritures en même temps (fiche de veille créée une seule fois)
  const main = panneauMain(source, verrou);
  const claude = panneauClaude(source, { fermer, verrou });
  let voie = 'main';
  const barre = h('div', { class: 'rs-voies' });
  const maj = () => {
    main.hidden = voie !== 'main'; claude.hidden = voie !== 'claude';
    if (voie === 'claude') claude.rafraichir();
    remplir(barre, basculeVues({ vues: [['main', 'À la main', 'pencil'], ['claude', 'Demander à Claude', 'sparkles']], courante: voie, surChangement: (x) => { voie = x; maj(); } }));
  };
  maj();
  return dialogue({
    titre: 'En tirer des idées',
    classe: 'dialogue-formulaire dialogue-pistes',
    contenu: h('div', { class: 'pile' }, h('p', { class: 'aide', dataset: { role: 'source-nom' } }, `Source : ${source.nom || 'sans nom'}`), barre, main, claude),
    boutons: [{ libelle: 'Fermer', valeur: null }],
    auMontage: ({ boutons }) => { fermerBouton = boutons[0]; },
  });
}
