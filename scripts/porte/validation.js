// Validation STRICTE de ce que les workflows envoient à la porte. Aucune dépendance : s'utilise dans les fonctions (copie dans functions/partage/) et se teste seule.
// Règles : un champ inconnu est refusé (jamais ignoré en silence), un texte ne contient aucun caractère de contrôle, chaque champ a une longueur maximale,
// une adresse doit être en http(s), un nombre doit être fini. Les messages d'erreur nomment le champ, jamais la valeur reçue.

export class ErreurValidation extends Error {
  constructor(message) {
    super(message);
    this.name = 'ErreurValidation';
    this.code = 'requete_invalide';
  }
}

const CARACTERES_DE_CONTROLE = /[\u0000-\u001f\u007f]/;
const CARACTERES_DE_CONTROLE_SAUF_MISE_EN_PAGE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/; // un texte long (page HTML) garde ses retours à la ligne et tabulations
const MOTIF_ID = /^[A-Za-z0-9_-]{1,100}$/;
const MOTIF_ETIQUETTE = /^[a-z0-9][a-z0-9_-]{0,59}$/; // noms d'étiquettes (clé d'IA…) : en minuscules, donc jamais une vraie clé secrète collée par erreur
// Ce qui ressemble à une clé ou à un secret : jamais accepté dans un texte libre (nom, message, procédure…), même collé par erreur.
// MOTIF_SECRET_PRECIS : les formes connues de clés. MOTIF_SECRET y ajoute « un mot de 40 caractères ou plus » (texte libre) ; il ne convient pas aux identifiants, qui font jusqu'à 80 caractères.
const MOTIF_SECRET_PRECIS = /cle-(n8n|tdb)\.|\bcia_[A-Za-z0-9_-]{10,}|ghp_[A-Za-z0-9]{20,}|github_pat_|-----BEGIN|AKIA[0-9A-Z]{12,}|AIza[0-9A-Za-z_-]{35}|\bK00[0-9A-Za-z]{20,}/;
export const MOTIF_SECRET = new RegExp(`${MOTIF_SECRET_PRECIS.source}|[A-Za-z0-9_+/=-]{40,}`);
const MOTIF_ID_SUR = /^[a-z0-9][a-z0-9_-]{0,99}$/; // identifiant en minuscules seulement : une clé en base64 (majuscules) ne passe jamais pour un identifiant
const MOTIF_MODELE = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,79}$/;

/**
 * Types de champs : { type: 'texte', max, min? } | { type: 'html', max } | { type: 'id' } | { type: 'idsur' } | { type: 'etiquette' } | { type: 'modele' } | { type: 'url' } |
 * { type: 'date' } | { type: 'echeance' } | { type: 'libre', max } | { type: 'nombre', min, max } | { type: 'choix', valeurs } | { type: 'booleen' } | { type: 'liste', max, item: schéma }.
 * « idsur » : identifiant en minuscules (1 à 100 caractères), qui ne ressemble à aucune clé connue (MOTIF_SECRET_PRECIS) ; à préférer à « id » quand l'identifiant vient d'un script.
 * `requis: true` pour un champ obligatoire. Renvoie un objet NOUVEAU ne contenant que les champs reçus et valides (jamais l'objet d'origine).
 */
export function valider(entree, schema, nom = 'donnees') {
  if (entree === null || typeof entree !== 'object' || Array.isArray(entree)) throw new ErreurValidation(`« ${nom} » doit être un objet.`);
  for (const cle of Object.keys(entree)) if (!Object.hasOwn(schema, cle)) throw new ErreurValidation(`Champ inconnu : « ${nom}.${cle} ».`);
  const sortie = {};
  for (const [cle, regle] of Object.entries(schema)) {
    const valeur = entree[cle];
    if (valeur === undefined || valeur === null) {
      if (regle.requis) throw new ErreurValidation(`Champ obligatoire manquant : « ${nom}.${cle} ».`);
      continue;
    }
    sortie[cle] = champ(valeur, regle, `${nom}.${cle}`);
  }
  return sortie;
}

function texteSur(v, chemin, max, min = 0) {
  if (typeof v !== 'string') throw new ErreurValidation(`« ${chemin} » doit être un texte.`);
  if (CARACTERES_DE_CONTROLE.test(v)) throw new ErreurValidation(`« ${chemin} » contient un caractère interdit.`);
  const t = v.trim();
  if (t.length < min) throw new ErreurValidation(`« ${chemin} » est vide.`);
  if (t.length > max) throw new ErreurValidation(`« ${chemin} » est trop long (${max} caractères au plus).`);
  return t;
}

function champ(v, regle, chemin) {
  switch (regle.type) {
    case 'texte': return texteSur(v, chemin, regle.max, regle.min ?? 0);
    case 'libre': {
      // Texte court affiché à l'écran : comme « texte », mais refuse tout ce qui ressemble à une clé ou à un secret.
      const t = texteSur(v, chemin, regle.max, regle.min ?? 0);
      if (MOTIF_SECRET.test(t)) throw new ErreurValidation(`« ${chemin} » ressemble à un secret : refusé.`);
      return t;
    }
    case 'echeance': {
      // Date d'expiration d'une clé : dans le passé ou dans le futur (jusqu'en 2100), contrairement à « date » qui refuse le futur.
      const t = texteSur(v, chemin, 40, 1);
      const d = new Date(t);
      const ms = d.getTime();
      if (Number.isNaN(ms) || ms < Date.UTC(2000, 0, 1) || ms > Date.UTC(2100, 0, 1)) throw new ErreurValidation(`« ${chemin} » n'est pas une date valide.`);
      return d;
    }
    case 'html': {
      // Page HTML d'un résumé : texte long avec retours à la ligne. Elle n'est JAMAIS exécutée par l'appli (affichée dans un cadre isolé, sans script).
      if (typeof v !== 'string') throw new ErreurValidation(`« ${chemin} » doit être un texte.`);
      if (CARACTERES_DE_CONTROLE_SAUF_MISE_EN_PAGE.test(v)) throw new ErreurValidation(`« ${chemin} » contient un caractère interdit.`);
      if (v.trim().length < 1) throw new ErreurValidation(`« ${chemin} » est vide.`);
      if (v.length > regle.max) throw new ErreurValidation(`« ${chemin} » est trop long (${regle.max} caractères au plus).`);
      return v;
    }
    case 'id': case 'etiquette': case 'modele': {
      const t = texteSur(v, chemin, 100, 1);
      const motif = regle.type === 'id' ? MOTIF_ID : regle.type === 'etiquette' ? MOTIF_ETIQUETTE : MOTIF_MODELE;
      if (!motif.test(t)) throw new ErreurValidation(`« ${chemin} » n'a pas le bon format.`);
      return t;
    }
    case 'idsur': {
      const t = texteSur(v, chemin, 100, 1);
      if (!MOTIF_ID_SUR.test(t)) throw new ErreurValidation(`« ${chemin} » n'a pas le bon format (minuscules, chiffres, _ et - seulement).`);
      if (MOTIF_SECRET_PRECIS.test(t)) throw new ErreurValidation(`« ${chemin} » ressemble à un secret : refusé.`);
      return t;
    }
    case 'url': {
      const t = texteSur(v, chemin, 2000, 1);
      let u;
      try { u = new URL(t); } catch { throw new ErreurValidation(`« ${chemin} » n'est pas une adresse valide.`); }
      if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new ErreurValidation(`« ${chemin} » doit commencer par http:// ou https://.`);
      return t;
    }
    case 'date': {
      const t = texteSur(v, chemin, 40, 1);
      const d = new Date(t);
      const ms = d.getTime();
      if (Number.isNaN(ms) || ms < Date.UTC(2000, 0, 1) || ms > Date.now() + 2 * 86_400_000) throw new ErreurValidation(`« ${chemin} » n'est pas une date valide.`);
      return d;
    }
    case 'nombre':
      if (typeof v !== 'number' || !Number.isFinite(v) || v < regle.min || v > regle.max) throw new ErreurValidation(`« ${chemin} » doit être un nombre entre ${regle.min} et ${regle.max}.`);
      return v;
    case 'choix':
      if (typeof v !== 'string' || !regle.valeurs.includes(v)) throw new ErreurValidation(`« ${chemin} » doit valoir : ${regle.valeurs.join(', ')}.`);
      return v;
    case 'booleen':
      if (typeof v !== 'boolean') throw new ErreurValidation(`« ${chemin} » doit être vrai ou faux.`);
      return v;
    case 'liste': {
      if (!Array.isArray(v) || v.length < 1) throw new ErreurValidation(`« ${chemin} » doit être une liste non vide.`);
      if (v.length > regle.max) throw new ErreurValidation(`« ${chemin} » est trop longue (${regle.max} éléments au plus).`);
      return v.map((x, i) => valider(x, regle.item, `${chemin}[${i}]`));
    }
    default: throw new Error(`Type de champ inconnu : ${regle.type}`);
  }
}
