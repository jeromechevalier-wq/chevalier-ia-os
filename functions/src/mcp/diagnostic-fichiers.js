// DIAGNOSTIC TEMPORAIRE : ce que l'assistant envoie quand on joint un fichier. À retirer après l'essai (docs/plan-mcp.md, « Diagnostic des fichiers joints »).
// Ne télécharge rien, n'écrit rien. UNE seule fonction pure, resumerForme, sert à la réponse ET au journal : jamais d'adresse complète, jamais de contenu.

const MAX_ELEMENTS = 20; // au-delà, on compte seulement
const MAX_CLES = 12;
const MAX_NOM = 80;

function hoteDe(texte) {
  const m = /^[a-z][a-z0-9+.-]*:\/\/([^/?#\s]+)/i.exec(String(texte).slice(0, 2000));
  if (!m) return null;
  return m[1].replace(/^[^@]*@/, '').replace(/:\d+$/, '').slice(0, 80).toLowerCase(); // sans identifiant ni port
}

const typeDe = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);

function resumerChaine(s) {
  const r = { type: 'string', longueur: s.length };
  const hote = hoteDe(s);
  if (hote) r.hote = hote;
  else if (/^data:/i.test(s)) r.genre = 'data_uri';
  else if (/^[A-Za-z0-9_-]{1,40}$/.test(s)) r.mot = s; // un mot court (ex. « chat_upload ») : utile à lire, sans risque
  else if (s.length > 200) r.genre = 'texte_long';
  return r;
}

function resumerElement(e) {
  if (e === undefined || e === null) return { type: typeDe(e) };
  if (typeof e === 'string') return resumerChaine(e);
  if (typeof e !== 'object') return { type: typeDe(e) };
  if (Array.isArray(e)) return { type: 'array', longueur: e.length };
  const cles = Object.keys(e);
  const r = { type: 'object', cles: cles.slice(0, MAX_CLES).map((c) => c.slice(0, 40)) };
  if (cles.length > MAX_CLES) r.autresCles = cles.length - MAX_CLES;
  for (const c of cles) {
    const v = e[c];
    if (typeof v === 'string' && /url|uri|link|href/i.test(c)) {
      const h = hoteDe(v);
      if (h) r.hote = r.hote || h;
      else r.sansHote = true;
    }
  }
  if (typeof e.mime_type === 'string') r.mime_type = e.mime_type.slice(0, 60);
  if (typeof e.file_name === 'string' && e.file_name.length <= MAX_NOM && !e.file_name.includes('://')) r.file_name = e.file_name;
  else if (typeof e.file_name === 'string') r.file_name_masque = true;
  return r;
}

/** Forme de ce qui a été reçu, sans aucun contenu ni adresse complète. */
export function resumerForme(fichiers) {
  if (fichiers === undefined) return { recu: false, nombre: 0, elements: [] };
  const liste = Array.isArray(fichiers) ? fichiers : [fichiers];
  return { recu: true, enveloppe: typeDe(fichiers), nombre: liste.length, elements: liste.slice(0, MAX_ELEMENTS).map(resumerElement) };
}

const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

/** Phrase française courte, lisible à voix haute, construite seulement sur le résumé. */
export function phraseDe(forme) {
  if (!forme.recu || forme.nombre === 0) return "Je n'ai reçu aucun fichier : l'assistant n'a rien transmis. Rien n'a été enregistré.";
  const els = forme.elements;
  const avecLien = els.filter((e) => e.hote);
  const mots = els.filter((e) => e.mot);
  const parts = [];
  if (avecLien.length) {
    const hotes = [...new Set(avecLien.map((e) => e.hote))].join(', ');
    parts.push(`${pluriel(avecLien.length, 'lien de téléchargement', 'liens de téléchargement')} (hôte ${hotes})`);
  }
  const sansHote = els.filter((e) => e.type === 'object' && !e.hote);
  if (sansHote.length) parts.push(`${pluriel(sansHote.length, 'objet sans adresse', 'objets sans adresse')} (champs : ${[...new Set(sansHote.flatMap((e) => e.cles))].slice(0, 8).join(', ') || 'aucun'})`);
  const longs = els.filter((e) => e.type === 'string' && !e.hote && !e.mot);
  if (longs.length) parts.push(`${pluriel(longs.length, 'texte', 'textes')} sans adresse (longueurs : ${longs.map((e) => e.longueur).join(', ')})`);
  const autres = els.filter((e) => e.type !== 'object' && e.type !== 'string');
  if (autres.length) parts.push(`${pluriel(autres.length, 'valeur inattendue', 'valeurs inattendues')} (${[...new Set(autres.map((e) => e.type))].join(', ')})`);
  const mimes = [...new Set(els.map((e) => e.mime_type).filter(Boolean))];
  let phrase = `J'ai reçu ${pluriel(forme.nombre, 'élément', 'éléments')}`;
  if (mots.length) phrase = `J'ai reçu le mot « ${mots[0].mot} » au lieu d'un lien : l'assistant n'a pas transmis le fichier` + (parts.length ? `. Autres éléments : ${parts.join(', ')}` : '');
  else if (parts.length) phrase += ` : ${parts.join(', ')}`;
  if (mimes.length) phrase += `, types ${mimes.join(', ')}`;
  return `${phrase}. Rien n'a été enregistré.`;
}

/** Ligne de journal : liste blanche, aucun contenu, aucune adresse complète. Écrit dans la sortie du serveur, jamais dans la base. */
export function ligneDeDiagnostic({ forme, acteur, note }, sortie = (l) => process.stdout.write(`${l}\n`)) {
  const ligne = { severity: 'INFO', message: 'mcp_diagnostic', acteur: String(acteur || '').slice(0, 80), recu: forme.recu, enveloppe: forme.enveloppe, nombre: forme.nombre, elements: forme.elements };
  if (typeof note === 'string') ligne.noteLongueur = note.length; // la note elle-même n'est jamais journalisée
  sortie(JSON.stringify(ligne));
  return ligne;
}
