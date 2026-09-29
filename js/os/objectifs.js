// Objectifs communs de l'OS : calculés (fournis par les modules) et manuels (saisis chaque mois).
import {
  collection, doc, onSnapshot, setDoc, updateDoc, runTransaction, serverTimestamp, increment,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from './firebase.js';
import { h, icone, vider, toast } from './ui.js';
import { animerCompteur, celebrerObjectif } from './celebrations.js';

const etat = { objectifs: [], saisies: [], pretObjectifs: false, pretSaisies: false };
const abonnes = new Set();
const calculateurs = {}; // id de calcul → { libelle, unite, calculer(mois) }
let desabonnements = [];
let compte = null;
let objectifsDepart = [];
let referenceFranchissement = null; // { cle: pourcentage } relevé pendant la session
let donneesModulesPretes = () => true;

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
  return c ? c.calculer(mois) : 0;
}

export function objectifsActifs() {
  return etat.objectifs.filter((o) => o.actif !== false).sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
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
  desabonnements.push(onSnapshot(collection(db, 'os_objectifs'), (snap) => {
    etat.objectifs = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    etat.pretObjectifs = true;
    if (!snap.metadata.fromCache) initialiserSiBesoin(snap.docs.map((d) => d.id));
    notifier();
  }, (e) => console.warn('Objectifs indisponibles', e.code)));
  desabonnements.push(onSnapshot(collection(db, 'os_objectifs_saisies'), (snap) => {
    etat.saisies = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    etat.pretSaisies = true;
    notifier();
  }, (e) => console.warn('Saisies indisponibles', e.code)));
}

export function arreterObjectifs() {
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
    const ref = doc(db, 'os_objectifs', o.id);
    await runTransaction(db, async (t) => {
      const s = await t.get(ref);
      if (!s.exists()) t.set(ref, o);
    }).catch((e) => console.warn('Initialisation des objectifs', e.code));
  }
}

// ---------------------------------------------------------------- écritures

export async function ajouterASaisie(objectifId, mois, delta) {
  await setDoc(doc(db, 'os_objectifs_saisies', `${objectifId}_${mois}`), {
    objectifId, mois, valeur: increment(delta), maj: serverTimestamp(),
  }, { merge: true });
}

export async function definirSaisie(objectifId, mois, valeurSaisie) {
  await setDoc(doc(db, 'os_objectifs_saisies', `${objectifId}_${mois}`), {
    objectifId, mois, valeur: Math.max(0, Number(valeurSaisie) || 0), maj: serverTimestamp(),
  }, { merge: true });
}

export async function majObjectif(id, patch) {
  await updateDoc(doc(db, 'os_objectifs', id), patch);
}

export async function ajouterObjectifManuel({ libelle, cible, unite = '', couleur = '#b98ee0' }) {
  const id = `manuel_${Date.now().toString(36)}`;
  const ordre = Math.max(0, ...etat.objectifs.map((o) => o.ordre ?? 0)) + 1;
  await setDoc(doc(db, 'os_objectifs', id), {
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
    if (avant && avant.pct < 100 && pct >= 100) celebrerObjectif(o.libelle);
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
        h('span', { class: 'objectif-libelle' }, o.libelle)),
      h('div', { class: 'objectif-chiffres' },
        valeurEl,
        h('span', { class: 'objectif-cible' }, ` / ${formatValeur(o.cible, o.unite)}`),
        h('span', { class: 'objectif-pct' }, '')),
      h('div', { class: 'barre', role: 'progressbar', 'aria-label': o.libelle, 'aria-valuemin': '0', 'aria-valuemax': '100' }, barre),
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
  return liste.map((o) => `${o.id}:${o.libelle}:${o.cible}:${o.couleur}:${o.unite}`).join('|');
}

// ---------------------------------------------------------------- réglages des objectifs

export function rendreReglagesObjectifs(conteneur) {
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

  function ligne(o, index, liste) {
    const libelle = h('input', { type: 'text', class: 'champ', value: o.libelle, 'aria-label': 'Libellé',
      onchange: (e) => e.target.value.trim() && majObjectif(o.id, { libelle: e.target.value.trim() }) });
    const cible = h('input', { type: 'number', class: 'champ champ-court', min: '1', value: String(o.cible), 'aria-label': `Cible : ${o.libelle}`,
      onchange: (e) => majObjectif(o.id, { cible: Math.max(1, Number(e.target.value) || 1) }) });
    const couleur = h('input', { type: 'color', class: 'champ-couleur', value: o.couleur || '#ecbc06', 'aria-label': `Couleur : ${o.libelle}`,
      onchange: (e) => majObjectif(o.id, { couleur: e.target.value }) });
    const actif = h('input', { type: 'checkbox', checked: o.actif !== false, 'aria-label': `Afficher : ${o.libelle}`,
      onchange: (e) => majObjectif(o.id, { actif: e.target.checked }) });
    const echanger = async (j) => {
      const autre = liste[j];
      if (!autre) return;
      await majObjectif(o.id, { ordre: autre.ordre ?? j });
      await majObjectif(autre.id, { ordre: o.ordre ?? index });
    };
    return h('div', { class: 'ligne-reglage', dataset: { objectif: o.id } },
      h('span', { class: `badge ${o.type === 'manuel' ? 'badge-manuel' : 'badge-calcule'}` }, o.type === 'manuel' ? 'Manuel' : 'Calculé'),
      libelle, cible, couleur,
      h('label', { class: 'case' }, actif, h('span', {}, 'Actif')),
      h('div', { class: 'groupe-boutons' },
        h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Monter', disabled: index === 0, onclick: () => echanger(index - 1) }, icone('arrow-up', { taille: 16 })),
        h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Descendre', disabled: index === liste.length - 1, onclick: () => echanger(index + 1) }, icone('arrow-down', { taille: 16 }))));
  }

  function maj() {
    if (conteneur.contains(document.activeElement) && document.activeElement.matches('input[type=text], input[type=number]')) return;
    vider(corps);
    const liste = tousLesObjectifs();
    liste.forEach((o, i) => corps.append(ligne(o, i, liste)));
  }
  conteneur.append(corps, formulaireAjout);
  maj();
  const stop = surObjectifs(maj);
  return stop;
}
