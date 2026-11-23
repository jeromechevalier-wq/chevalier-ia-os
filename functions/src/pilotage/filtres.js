// Module Pilotage : filtres du tableau de bord, côté serveur. LOGIQUE PURE (ni Firebase, ni réseau, ni Postgres).
//  - lit et valide les filtres demandés par le navigateur contre les déclarations du réglage (type, plafonds) ;
//  - applique le `defaut` d'un filtre absent de la requête ;
//  - calcule les raccourcis de période (fuseau Europe/Paris, `maintenant` injecté) ;
//  - fabrique les clauses d'une tuile (colonne écrite dans le RÉGLAGE, jamais envoyée par le navigateur) que `construireRequete` (reglages.js) transforme en SQL paramétré.
// Un filtre refusé lève toujours la même erreur (« Filtre invalide. », raison « filtre ») : jamais la valeur reçue, jamais la différence entre « inconnu » et « interdit ».
import { ErreurPilotage, valeurFiltre } from './reglages.js';

const refus = () => new ErreurPilotage('invalid-argument', 'Filtre invalide.', 'filtre');
const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const deux = (n) => String(n).padStart(2, '0');
const iso = (a, m, j) => `${a}-${deux(m)}-${deux(j)}`;
const joursDuMois = (a, m) => new Date(Date.UTC(a, m, 0)).getUTCDate(); // m de 1 à 12

const FORMAT_PARIS = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
/** La date du jour à Paris : { a, m, j } (m de 1 à 12). */
export function dateParis(ms) {
  const [a, m, j] = FORMAT_PARIS.format(new Date(ms)).split('-').map(Number);
  return { a, m, j };
}

/** Il y a `n` mois, même jour (ramené au dernier jour du mois s'il n'existe pas : 31 mai - 3 mois = 28 ou 29 février). */
function moinsMois({ a, m, j }, n) {
  const total = a * 12 + (m - 1) - n;
  const a2 = Math.floor(total / 12);
  const m2 = (total % 12) + 1;
  return { a: a2, m: m2, j: Math.min(j, joursDuMois(a2, m2)) };
}

/**
 * Raccourcis de période, définition exacte (bornes INCLUSES, jour calculé à Paris) :
 *  - ce_mois : du 1er au dernier jour du mois en cours ; mois_dernier : du 1er au dernier jour du mois précédent ;
 *  - 3_mois, 6_mois, 12_mois : glissants, d'il y a N mois (même jour du mois, ramené au dernier jour si besoin) jusqu'à aujourd'hui ;
 *  - annee : du 1er janvier au 31 décembre de l'année civile en cours ;
 *  - tout : aucune borne (aucune clause).
 * Rend { raccourci, du, au } ou { raccourci: 'tout' }.
 */
export function resoudrePeriode(valeur, ms) {
  if (valeur.raccourci === undefined) return { du: valeur.du, au: valeur.au };
  const r = valeur.raccourci;
  if (r === 'tout') return { raccourci: 'tout' };
  const auj = dateParis(ms);
  if (r === 'ce_mois') return { raccourci: r, du: iso(auj.a, auj.m, 1), au: iso(auj.a, auj.m, joursDuMois(auj.a, auj.m)) };
  if (r === 'mois_dernier') {
    const p = moinsMois({ ...auj, j: 1 }, 1);
    return { raccourci: r, du: iso(p.a, p.m, 1), au: iso(p.a, p.m, joursDuMois(p.a, p.m)) };
  }
  if (r === 'annee') return { raccourci: r, du: iso(auj.a, 1, 1), au: iso(auj.a, 12, 31) };
  const n = { '3_mois': 3, '6_mois': 6, '12_mois': 12 }[r];
  if (!n) throw refus();
  const d = moinsMois(auj, n);
  return { raccourci: r, du: iso(d.a, d.m, d.j), au: iso(auj.a, auj.m, auj.j) };
}

/**
 * `portee` : Map identifiant -> déclaration des filtres que l'appelant peut utiliser dans l'onglet lu ; `demandes` : l'objet `filtres` du navigateur (ou rien).
 * Rend une Map identifiant -> valeur RÉSOLUE (période : { du, au } ou { raccourci: 'tout' } ; liste : tableau ; intervalle : { min?, max? } ; oui_non : booléen) :
 * la valeur demandée, sinon le `defaut` du réglage, sinon rien. Refuse (même erreur) : pas un objet, filtre hors de la portée, valeur du mauvais type.
 */
export function resoudreFiltres({ portee, demandes, maintenant }) {
  if (demandes !== undefined && demandes !== null && !estObjet(demandes)) throw refus();
  const cles = demandes ? Object.keys(demandes) : [];
  for (const k of cles) if (!portee.has(k)) throw refus();
  const sortie = new Map();
  for (const [id, decl] of portee) {
    let norm;
    if (cles.includes(id)) {
      if (demandes[id] === null && decl.type === 'oui_non') continue; // « null » explicite : aucune clause, et le défaut ne s'applique pas
      const r = valeurFiltre(decl, demandes[id]);
      if (!r.ok) throw refus();
      norm = r.valeur;
    } else if (decl.defaut !== undefined) norm = decl.defaut;
    else continue;
    sortie.set(id, decl.type === 'periode' ? resoudrePeriode(norm, maintenant) : norm);
  }
  return sortie;
}

/** Les clauses d'UNE tuile : seulement les filtres écrits dans SA liste `filtres`, qui sont dans la portée et qui ont une valeur. La colonne vient du réglage. */
export function clausesDeTuile(tuile, portee, resolus) {
  const sortie = [];
  for (const [id, { colonne }] of Object.entries(tuile.filtres ?? {})) {
    const decl = portee.get(id);
    const v = resolus.get(id);
    if (!decl || v === undefined) continue;
    if (decl.type === 'periode') { if (v.du !== undefined) sortie.push({ colonne, type: 'periode', du: v.du, au: v.au }); }
    else if (decl.type === 'liste') sortie.push({ colonne, type: 'liste', valeurs: v });
    else if (decl.type === 'intervalle') sortie.push({ colonne, type: 'intervalle', min: v.min, max: v.max });
    else if (decl.type === 'oui_non') sortie.push({ colonne, type: 'oui_non', valeur: v });
  }
  return sortie;
}
