// Objectifs communs de l'OS : calculés (fournis par les modules) et manuels (saisis chaque mois).
import {
  collection, doc, onSnapshot, getDocs, setDoc, updateDoc, runTransaction, serverTimestamp, increment,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from './firebase.js';
import { h, icone, vider, remplir, toast, iconeInfo } from './ui.js';
import { animerCompteur, celebrerObjectif } from './celebrations.js';
import { TABLE_KPI_ACTIVE, nomCollection, faut_repli } from './objectifs-tables.js';

const etat = { objectifs: [], saisies: [], pretObjectifs: false, pretSaisies: false };
const abonnes = new Set();
const calculateurs = {}; // id de calcul → { libelle, unite, calculer(mois) }
let desabonnements = [];
let generation = 0; // change à chaque arrêt : une vérification de repli en retard est ignorée
let repli = { definitions: false, saisies: false }; // true = la nouvelle table était vide au montage, on lit l'ancienne (interrupteur allumé seulement)
const nomLecture = (cle, ancienne = false) => nomCollection(cle, { repli: ancienne ? { [cle]: true } : repli });
const nomEcriture = (cle) => nomCollection(cle, { ecriture: true });
let compte = null;
let objectifsDepart = [];
let referenceFranchissement = null; // { cle: pourcentage } relevé pendant la session
let donneesModulesPretes = () => true;
// Ce que sait le module qui fournit les calculs (le CRM) : libellé d'un objectif (« Passages à l'étape : … » suit le nom de l'étape), disponibilité
// (option éteinte ou étape désactivée = indisponible), indicateurs qu'on peut ajouter, étapes au choix.
let regles = { libelle: (o) => o.libelle, disponible: () => true, proposables: () => [], etapes: () => [] };

/** Le CRM déclare ses règles d'objectifs : { libelle(o), disponible(o), proposables(objectifs), etapes() }. */
export function definirConfigObjectifs(r) {
  regles = { ...regles, ...r };
}

// ---------------------------------------------------------------- outils

export function moisCourantParis(maintenant = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit' }).formatToParts(maintenant);
  return `${p.find((x) => x.type === 'year').value}-${p.find((x) => x.type === 'month').value}`;
}

export function pourcentage(valeur, cible) {
  const c = Number(cible) || 0;
  if (c <= 0) return valeur > 0 ? 100 : 0;
  return Math.round((Number(valeur) / c) * 100);
}

export function formatValeur(valeur, unite) {
  const v = Number(valeur) || 0;
  if (unite === '€') {
    return new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
      .format(Math.round(v)).replace(/ | /g, ' ');
  }
  const t = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 0 }).format(Math.round(v)).replace(/ | /g, ' ');
  return unite ? `${t} ${unite}` : t;
}

// ---------------------------------------------------------------- registre des calculs (étendu par les modules)

/** Un module déclare ses calculs : { id: { libelle, unite, calculer(mois) } }. */
export function enregistrerCalculs(calculs, { pret } = {}) {
  Object.assign(calculateurs, calculs);
  if (pret) donneesModulesPretes = pret;
}

export function calculsDisponibles() {
  return { ...calculateurs };
}

export function valeur(objectif, mois) {
  if (objectif.type === 'manuel') {
    const s = etat.saisies.find((x) => x.objectifId === objectif.id && x.mois === mois);
    return Number(s?.valeur) || 0;
  }
  const c = calculateurs[objectif.calcul];
  return c ? c.calculer(mois, objectif) : 0;
}

export function objectifsActifs() {
  return etat.objectifs.filter((o) => o.actif !== false && regles.disponible(o)).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
}

export function tousLesObjectifs() {
  return [...etat.objectifs].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
}

export function estPret() {
  return etat.pretObjectifs && etat.pretSaisies;
}

export function surObjectifs(rappel) {
  abonnes.add(rappel);
  return () => abonnes.delete(rappel);
}

function notifier() {
  abonnes.forEach((f) => f());
  verifierFranchissements();
}

// ---------------------------------------------------------------- écouteurs Firestore

export function demarrerObjectifs(compteConnecte, departs = []) {
  compte = compteConnecte;
  objectifsDepart = departs;
  referenceFranchissement = null;
  repli = { definitions: false, saisies: false };
  suivre('definitions', (snap) => {
    etat.objectifs = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    etat.pretObjectifs = true;
    if (!snap.metadata.fromCache && !repli.definitions) initialiserSiBesoin(snap.docs.map((d) => d.id));
    notifier();
  }, 'Objectifs indisponibles');
  suivre('saisies', (snap) => {
    etat.saisies = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    etat.pretSaisies = true;
    notifier();
  }, 'Saisies indisponibles');
}

const reference = (cle, ancienne = false) => collection(db, nomLecture(cle, ancienne));

/**
 * Écoute une table. Interrupteur allumé : si la nouvelle table est vide au premier retour du serveur, on regarde l'ancienne ;
 * on bascule UNE fois sur elle (lecture seule) seulement si elle n'est PAS vide. Les deux vides (espace neuf) : on reste sur la nouvelle.
 */
function suivre(cle, traiter, messageErreur) {
  let decide = !TABLE_KPI_ACTIVE;
  let arret = () => {};
  const maGeneration = generation;
  const ecouter = () => onSnapshot(reference(cle), (snap) => {
    if (!decide && !snap.metadata.fromCache) {
      decide = true;
      if (snap.empty) {
        getDocs(reference(cle, true)).then((ancienne) => ancienne.empty, () => undefined).then((ancienneVide) => {
          if (maGeneration !== generation) return;
          if (faut_repli({ nouvelleVide: true, ancienneVide })) {
            repli[cle] = true;
            arret();
            arret = ecouter();
          } else traiter(snap);
        });
        return;
      }
    }
    traiter(snap);
  }, (e) => console.warn(messageErreur, e.code));
  arret = ecouter();
  desabonnements.push(() => arret());
}

export function arreterObjectifs() {
  generation += 1;
  desabonnements.forEach((f) => f());
  desabonnements = [];
  etat.objectifs = [];
  etat.saisies = [];
  etat.pretObjectifs = false;
  etat.pretSaisies = false;
  referenceFranchissement = null;
}

let initialisationFaite = false;
async function initialiserSiBesoin(idsExistants) {
  if (initialisationFaite || idsExistants.length > 0) return;
  initialisationFaite = true;
  for (const o of objectifsDepart) {
    const ref = doc(db, nomEcriture('definitions'), o.id);
    await runTransaction(db, async (t) => {
      const s = await t.get(ref);
      if (!s.exists()) t.set(ref, o);
    }).catch((e) => console.warn('Initialisation des objectifs', e.code));
  }
}

// ---------------------------------------------------------------- écritures

export async function ajouterASaisie(objectifId, mois, delta) {
  await setDoc(doc(db, nomEcriture('saisies'), `${objectifId}_${mois}`), {
    objectifId, mois, valeur: increment(delta), maj: serverTimestamp(),
  }, { merge: true });
}

export async function definirSaisie(objectifId, mois, valeurSaisie) {
  await setDoc(doc(db, nomEcriture('saisies'), `${objectifId}_${mois}`), {
    objectifId, mois, valeur: Math.max(0, Number(valeurSaisie) || 0), maj: serverTimestamp(),
  }, { merge: true });
}

export async function majObjectif(id, patch) {
  // Repli (nouvelle table vide, ancienne lue) : le document n'existe pas encore dans la nouvelle table, un updateDoc échouerait. On refuse proprement, sans écrire dans l'ancienne.
  if (repli.definitions) throw new Error('Copie des objectifs pas encore faite');
  await updateDoc(doc(db, nomEcriture('definitions'), id), patch);
}

/** Ajoute un objectif calculé choisi dans la liste des indicateurs proposés (nouveaux contacts, chiffre d'affaires signé, passages à une étape…). */
export async function ajouterObjectifCalcule({ calcul, etapeId = null, cible, couleur = '#b98ee0' }) {
  const c = calculateurs[calcul];
  if (!c) throw new Error('Indicateur inconnu');
  const id = `${calcul}${etapeId ? `_${etapeId}` : ''}_${Date.now().toString(36)}`;
  const ordre = Math.max(0, ...etat.objectifs.map((o) => o.ordre ?? 0)) + 1;
  await setDoc(doc(db, nomEcriture('definitions'), id), {
    id, libelle: c.libelle, type: 'calcule', calcul, ...(c.etape ? { etapeId } : {}), cible: Number(cible) || 1, unite: c.unite || '', couleur, ordre, actif: true,
  });
}

export async function ajouterObjectifManuel({ libelle, cible, unite = '', couleur = '#b98ee0' }) {
  const id = `manuel_${Date.now().toString(36)}`;
  const ordre = Math.max(0, ...etat.objectifs.map((o) => o.ordre ?? 0)) + 1;
  await setDoc(doc(db, nomEcriture('definitions'), id), {
    id, libelle, type: 'manuel', calcul: null, cible: Number(cible) || 1, unite, couleur, ordre, actif: true,
  });
}

// ---------------------------------------------------------------- objectif atteint pendant la session

function releve() {
  const mois = moisCourantParis();
  const r = {};
  for (const o of objectifsActifs()) r[`${o.id}_${mois}`] = { o, pct: pourcentage(valeur(o, mois), o.cible) };
  return r;
}

/** À appeler quand les données d'un module changent. */
export function signalerChangement() {
  abonnes.forEach((f) => f());
  verifierFranchissements();
}

function verifierFranchissements() {
  if (!estPret() || !donneesModulesPretes()) return;
  const actuel = releve();
  if (!referenceFranchissement) {
    referenceFranchissement = actuel;
    return;
  }
  for (const [cle, { o, pct }] of Object.entries(actuel)) {
    const avant = referenceFranchissement[cle];
    if (avant && avant.pct < 100 && pct >= 100) celebrerObjectif(regles.libelle(o));
  }
  referenceFranchissement = actuel;
}

// ---------------------------------------------------------------- affichage : cartes d'objectifs

const valeursAffichees = new Map();

/** Grille des objectifs du mois ; renvoie une fonction de mise à jour. */
export function rendreObjectifs(conteneur, { mois, modifiable = true }) {
  vider(conteneur);
  const grille = h('div', { class: 'grille-objectifs' });
  conteneur.append(grille);
  const cartes = new Map();

  function carte(o) {
    const libelle = regles.libelle(o);
    const valeurEl = h('span', { class: 'objectif-valeur' }, '0');
    const barre = h('div', { class: 'barre-remplie', style: { width: '0%', background: o.couleur || 'var(--jaune)' } });
    const saisie = o.type === 'manuel' && modifiable
      ? h('input', {
        type: 'number', min: '0', step: '1', class: 'champ champ-saisie', 'aria-label': `Saisie directe : ${o.libelle}`,
        onchange: async (e) => {
          await definirSaisie(o.id, mois, e.target.value).catch(() => toast('Enregistrement impossible', { type: 'erreur' }));
        },
      })
      : null;
    const actions = o.type === 'manuel' && modifiable
      ? h('div', { class: 'objectif-actions' },
        h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', 'aria-label': `Ajouter 1 à ${o.libelle}`, onclick: () => ajouterASaisie(o.id, mois, 1) }, '+1'),
        h('button', { type: 'button', class: 'bouton bouton-secondaire bouton-petit', 'aria-label': `Ajouter 10 à ${o.libelle}`, onclick: () => ajouterASaisie(o.id, mois, 10) }, '+10'),
        saisie)
      : null;
    const el = h('article', { class: 'objectif', dataset: { objectif: o.id } },
      h('div', { class: 'objectif-tete' },
        h('span', { class: 'pastille-couleur', style: { background: o.couleur || 'var(--jaune)' } }),
        h('span', { class: 'objectif-libelle' }, libelle)),
      h('div', { class: 'objectif-chiffres' },
        valeurEl,
        h('span', { class: 'objectif-cible' }, ` / ${formatValeur(o.cible, o.unite)}`),
        h('span', { class: 'objectif-pct' }, '')),
      h('div', { class: 'barre', role: 'progressbar', 'aria-label': libelle, 'aria-valuemin': '0', 'aria-valuemax': '100' }, barre),
      actions);
    return { el, valeurEl, barre, saisie };
  }

  function maj() {
    const liste = objectifsActifs();
    const ids = liste.map((o) => o.id).join('|');
    if (grille.dataset.ids !== ids || grille.dataset.signature !== signature(liste)) {
      vider(grille);
      cartes.clear();
      for (const o of liste) {
        const c = carte(o);
        cartes.set(o.id, { ...c, o });
        grille.append(c.el);
      }
      grille.dataset.ids = ids;
      grille.dataset.signature = signature(liste);
    }
    for (const o of liste) {
      const c = cartes.get(o.id);
      const v = valeur(o, mois);
      const cle = `${o.id}_${mois}`;
      const avant = valeursAffichees.has(cle) ? valeursAffichees.get(cle) : 0;
      animerCompteur(c.valeurEl, avant, v, { format: (n) => formatValeur(n, o.unite) });
      valeursAffichees.set(cle, v);
      const pct = pourcentage(v, o.cible);
      c.el.querySelector('.objectif-pct').textContent = `${pct} %`;
      c.el.classList.toggle('atteint', pct >= 100);
      c.el.querySelector('.barre').setAttribute('aria-valuenow', String(Math.min(pct, 100)));
      c.el.dataset.valeur = String(v);
      requestAnimationFrame(() => requestAnimationFrame(() => { c.barre.style.width = `${Math.min(pct, 100)}%`; }));
      if (c.saisie && document.activeElement !== c.saisie) c.saisie.value = String(v);
    }
  }
  maj();
  return maj;
}

function signature(liste) {
  return liste.map((o) => `${o.id}:${regles.libelle(o)}:${o.cible}:${o.couleur}:${o.unite}`).join('|');
}

// ---------------------------------------------------------------- réglages des objectifs

export function rendreReglagesObjectifs(conteneur) {
  const modifier = (id, patch) => majObjectif(id, patch).catch((e) => { console.warn(e); toast('Modification impossible', { type: 'erreur' }); });
  const corps = h('div', { class: 'liste-reglages' });
  const formulaireAjout = (() => {
    const libelle = h('input', { type: 'text', class: 'champ', placeholder: 'Ex. Posts LinkedIn publiés', 'aria-label': 'Libellé du nouvel objectif' });
    const cible = h('input', { type: 'number', class: 'champ champ-court', min: '1', value: '10', 'aria-label': 'Cible du nouvel objectif' });
    const unite = h('input', { type: 'text', class: 'champ champ-court', placeholder: 'Unité', 'aria-label': 'Unité du nouvel objectif' });
    return h('form', {
      class: 'ligne-ajout',
      onsubmit: async (e) => {
        e.preventDefault();
        if (!libelle.value.trim()) { libelle.focus(); return; }
        await ajouterObjectifManuel({ libelle: libelle.value.trim(), cible: cible.value, unite: unite.value.trim() });
        libelle.value = '';
        toast('Objectif manuel ajouté');
      },
    }, libelle, cible, unite, h('button', { type: 'submit', class: 'bouton bouton-secondaire' }, icone('plus', { taille: 16 }), 'Ajouter un objectif manuel'));
  })();

  // Ajout d'un indicateur calculé (nouveaux contacts, rendez-vous, passages à une étape, chiffre d'affaires signé / facturé / encaissé selon les options).
  const zoneCalcule = h('div', { class: 'ajout-calcule', dataset: { role: 'ajout-calcule' } });
  function rendreAjoutCalcule() {
    const choix = regles.proposables(etat.objectifs);
    if (!choix.length) { vider(zoneCalcule); return; }
    const selection = h('select', { class: 'champ', 'aria-label': 'Indicateur calculé à ajouter' }, choix.map((c) => h('option', { value: c.id }, c.libelle)));
    const etapes = regles.etapes();
    const selEtape = h('select', { class: 'champ', 'aria-label': 'Étape suivie' }, etapes.map((e) => h('option', { value: e.id }, e.libelle)));
    const cible = h('input', { type: 'number', class: 'champ champ-court', min: '1', value: '5', 'aria-label': 'Cible du nouvel indicateur' });
    const explication = h('p', { class: 'aide', dataset: { role: 'explication-ajout' } });
    const maj = () => {
      const c = choix.find((x) => x.id === selection.value);
      selEtape.hidden = !c?.etape;
      cible.value = c?.unite === '€' ? '1000' : '5';
      explication.textContent = c?.explication || '';
    };
    selection.addEventListener('change', maj);
    maj();
    remplir(zoneCalcule, h('div', { class: 'ligne-ajout' }, selection, selEtape, cible,
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'ajouter-calcule' }, onclick: async () => {
        const c = choix.find((x) => x.id === selection.value);
        if (!c) return;
        try { await ajouterObjectifCalcule({ calcul: c.id, etapeId: c.etape ? selEtape.value : null, cible: cible.value }); toast('Objectif ajouté'); } catch (e) { console.warn(e); toast('Ajout impossible', { type: 'erreur' }); }
      } }, icone('plus', { taille: 16 }), 'Ajouter un indicateur calculé')), explication);
  }

  function ligne(o, index, liste) {
    const calcule = o.type !== 'manuel';
    const c = calcule ? calculateurs[o.calcul] : null;
    const dispo = regles.disponible(o);
    const libelleCalcule = calcule && c?.etape;
    const libelle = libelleCalcule
      ? h('span', { class: 'libelle-calcule', dataset: { role: 'libelle-objectif' } }, regles.libelle(o))
      : h('input', { type: 'text', class: 'champ', value: o.libelle, 'aria-label': 'Libellé',
        onchange: (e) => e.target.value.trim() && modifier(o.id, { libelle: e.target.value.trim() }) });
    const etape = libelleCalcule
      ? h('select', { class: 'champ', 'aria-label': `Étape suivie : ${regles.libelle(o)}`, onchange: (e) => modifier(o.id, { etapeId: e.target.value }) },
        regles.etapes().map((e) => h('option', { value: e.id, selected: e.id === o.etapeId }, e.libelle)))
      : null;
    const cible = h('input', { type: 'number', class: 'champ champ-court', min: '1', value: String(o.cible), 'aria-label': `Cible : ${regles.libelle(o)}`,
      onchange: (e) => modifier(o.id, { cible: Math.max(1, Number(e.target.value) || 1) }) });
    const couleur = h('input', { type: 'color', class: 'champ-couleur', value: o.couleur || '#ecbc06', 'aria-label': `Couleur : ${regles.libelle(o)}`,
      onchange: (e) => modifier(o.id, { couleur: e.target.value }) });
    const actif = h('input', { type: 'checkbox', checked: o.actif !== false, 'aria-label': `Afficher : ${regles.libelle(o)}`,
      onchange: (e) => modifier(o.id, { actif: e.target.checked }) });
    const echanger = async (j) => {
      const autre = liste[j];
      if (!autre) return;
      await modifier(o.id, { ordre: autre.ordre ?? j });
      await modifier(autre.id, { ordre: o.ordre ?? index });
    };
    // L'explication est repliée derrière l'icône « i » (survol, clavier, toucher) : la ligne reste basse. Le texte garde data-role="explication" (dans la bulle).
    const texteExplication = c?.explication
      ? `Comment c’est calculé : ${c.explication}`
      : (calcule ? '' : 'Compteur à tenir à la main : tu ajoutes +1, +10 ou tu saisis la valeur sur l’Accueil.');
    const explication = iconeInfo(texteExplication, regles.libelle(o), { roleTexte: 'explication' });
    return h('div', { class: `ligne-reglage ligne-objectif${dispo ? '' : ' archivee'}`, dataset: { objectif: o.id } },
      h('div', { class: 'ligne-objectif-champs' },
        h('span', { class: `badge ${o.type === 'manuel' ? 'badge-manuel' : 'badge-calcule'}` }, o.type === 'manuel' ? 'Manuel' : 'Calculé'),
        libelle, etape, cible, couleur,
        h('label', { class: 'case' }, actif, h('span', {}, 'Actif')),
        h('div', { class: 'groupe-boutons' },
          h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Monter', disabled: index === 0, onclick: () => echanger(index - 1) }, icone('arrow-up', { taille: 16 })),
          h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Descendre', disabled: index === liste.length - 1, onclick: () => echanger(index + 1) }, icone('arrow-down', { taille: 16 }))),
        explication),
      dispo ? null : h('p', { class: 'aide', dataset: { role: 'indisponible' } }, 'Indisponible pour le moment (une option est éteinte, ou l’étape suivie est désactivée) : l’objectif n’est pas affiché sur l’Accueil.'));
  }

  function maj() {
    if (conteneur.contains(document.activeElement) && document.activeElement.matches('input[type=text], input[type=number], .bouton-info')) return; // pas de redessin pendant une saisie, ni pendant que la bulle « i » est ouverte
    vider(corps);
    const liste = tousLesObjectifs();
    liste.forEach((o, i) => corps.append(ligne(o, i, liste)));
    rendreAjoutCalcule();
  }
  conteneur.append(corps, zoneCalcule, formulaireAjout);
  maj();
  const stop = surObjectifs(maj);
  return stop;
}
