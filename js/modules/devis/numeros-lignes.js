// Résolveur de numéros du devis (fichier pur) : « 1.2 » (ou « 1,2 », « 1-2 », ou un identifiant) -> la section ou la ligne visée, d'après le devis tel qu'il est au moment de l'appel.
// Le numéro est un affichage calculé par numerosDevis, jamais une donnée stockée : tous les numéros d'un même appel se lisent dans le MÊME devis (celui d'avant l'appel).
import { numerosDevis } from './logique.js';
import { motsDe } from './vocabulaire.js';

/** Erreur à dire telle quelle à l'utilisateur (français simple) : rien n'est écrit quand elle part. */
export class ErreurNumero extends Error {
  constructor(message) { super(message); this.name = 'ErreurNumero'; }
}

const FORME_NUMERO = /^\d+(?:[.,-]\d+)*$/;
const MAX_NUMEROS_DITS = 30;

/** « 1,2 », « 1-2 », « 1 . 2 » ou le nombre 1.2 -> « 1.2 » ; null si ce n'est pas un numéro (un identifiant, par exemple). */
export function normaliserNumero(saisie) {
  const t = String(saisie ?? '').trim().replace(/\s*([.,-])\s*/g, '$1'); // « 1 . 2 » = 1.2, mais « 1 2 » n'est pas « 12 »
  return FORME_NUMERO.test(t) ? t.replace(/[,-]/g, '.') : null;
}

/** Liste à plat de ce qui a un numéro : [{ genre: 'section' | 'ligne', numero, id, texte, sectionNumero }] (un saut de page n'a pas de numéro). */
export function elementsNumerotes(sections) {
  const liste = Array.isArray(sections) ? sections : [];
  const numeros = numerosDevis(liste);
  const sortie = [];
  liste.forEach((s, i) => {
    sortie.push({ genre: 'section', numero: numeros[i].numero, id: s?.id ?? null, texte: s?.titre ?? '', sectionNumero: numeros[i].numero });
    (s?.lignes ?? []).forEach((l, j) => {
      const numero = numeros[i].lignes[j];
      if (numero) sortie.push({ genre: 'ligne', numero, id: l?.id ?? null, texte: l?.libelle ?? '', sectionNumero: numeros[i].numero });
    });
  });
  return sortie;
}

const nomDe = (e) => (e.genre === 'section' ? `La section ${e.numero}` : `La ligne ${e.numero}`);
const entreGuillemets = (t) => `« ${String(t ?? '').trim()} »`;

function numerosQuiExistent(elements) {
  if (!elements.length) return 'Le devis est vide.';
  const dits = elements.slice(0, MAX_NUMEROS_DITS).map((e) => e.numero).join(', ');
  return `Numéros qui existent : ${dits}${elements.length > MAX_NUMEROS_DITS ? ', …' : ''}.`;
}

/** Mêmes mots (accents, casse, pluriels et mots vides ignorés, moteur du dictionnaire) : « Prise double » n'est pas « Prise double 16 A ». */
export const memesMots = (a, b) => {
  const x = new Set(motsDe(a));
  const y = new Set(motsDe(b));
  return x.size === y.size && [...x].every((m) => y.has(m));
};

/**
 * Trouve la section ou la ligne visée. `reference` : numéro (« 1.2 », « 1,2 », « 1-2 ») ou identifiant.
 * Un nombre seul désigne la section de ce rang si elle existe ; sinon refus qui dit d'écrire « 1.2 » pour la ligne 2 de la section 1.
 * `attendu` : le libellé (ou le titre) que l'appelant a lu ; garde stricte sur l'ensemble des mots. `id` : s'il est donné, il doit être celui de l'élément trouvé.
 * `attenduObligatoire` : refuse quand `attendu` manque (modifier, supprimer). Renvoie { genre, numero, id, texte } ou lève ErreurNumero.
 */
export function resoudreNumero(sections, reference, { attendu, id, attenduObligatoire = false } = {}) {
  const elements = elementsNumerotes(sections);
  if (typeof reference === 'number' && !Number.isInteger(reference)) throw new ErreurNumero('Écris le numéro entre guillemets (« 1.10 »), pas comme un nombre : 1.10 et 1.1 se confondent.');
  const brut = String(reference ?? '').trim();
  if (!brut) throw new ErreurNumero('Il manque le numéro : dis-le avec un point (1.2 pour la ligne 2 de la section 1).');
  const numero = normaliserNumero(brut);
  let trouve;
  if (numero !== null) {
    trouve = elements.find((e) => e.numero === numero);
    if (!trouve) {
      if (!numero.includes('.')) {
        throw new ErreurNumero(`Le devis n'a pas de section ${numero}. Pour la ligne 2 de la section 1, écris 1.2. ${numerosQuiExistent(elements)}`);
      }
      throw new ErreurNumero(`Le devis n'a pas de ligne ${numero}. ${numerosQuiExistent(elements)}`);
    }
  } else {
    trouve = elements.find((e) => e.id === brut);
    if (!trouve) throw new ErreurNumero(`Je n'ai pas compris « ${brut} » : dis le numéro avec un point (1.2 pour la ligne 2 de la section 1). ${numerosQuiExistent(elements)}`);
  }
  if (id !== undefined && id !== null && id !== '' && id !== trouve.id) {
    throw new ErreurNumero(`${nomDe(trouve)} est maintenant ${entreGuillemets(trouve.texte)} : ce n'est pas l'élément que tu as lu, rien n'a été touché. Relis le devis.`);
  }
  if (attendu === undefined || attendu === null) {
    if (attenduObligatoire) throw new ErreurNumero(`Pour toucher ${nomDe(trouve).toLowerCase()}, recopie ce que tu as lu (attendu) : ${entreGuillemets(trouve.texte)}.`);
  } else if (!memesMots(attendu, trouve.texte)) {
    throw new ErreurNumero(`${nomDe(trouve)} est maintenant ${entreGuillemets(trouve.texte)}, pas ${entreGuillemets(attendu)} : le devis a changé, rien n'a été touché.`);
  }
  return { genre: trouve.genre, numero: trouve.numero, id: trouve.id, texte: trouve.texte };
}

/** Plusieurs demandes d'un même appel : toutes lues dans les MÊMES sections (celles d'avant l'appel), jamais l'une après l'autre. */
export function resoudreTous(sections, demandes, options = {}) {
  return (demandes ?? []).map((d) => resoudreNumero(sections, d?.reference ?? d?.ligne ?? d?.section, { ...options, attendu: d?.attendu, id: d?.id }));
}
