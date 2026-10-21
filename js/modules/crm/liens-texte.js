// Liens cliquables dans le texte des notes. Logique pure (aucun accès au navigateur) : testée par tests/notes.test.js.
// L'affichage transforme le texte ; la note enregistrée ne change jamais.

// Une adresse commence par « https », « http » (suivis de deux-points et deux barres) ou « www. », pas au milieu d'un mot, et va jusqu'au prochain espace ou signe < > ".
const MOTIF = /(?<![A-Za-z0-9@./_-])(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
const PONCTUATION_FINALE = /[.,;:!?…»]$/;
const FERMANTES = { ')': '(', ']': '[', '}': '{' };

/** Retire de la fin de l'adresse la ponctuation d'une phrase (point, virgule, parenthèse fermante sans ouvrante…). */
function couperFin(adresse) {
  // Les compteurs sont faits une seule fois puis tenus à jour : coût linéaire, même avec des milliers de parenthèses.
  const compte = { '(': 0, ')': 0, '[': 0, ']': 0, '{': 0, '}': 0 };
  for (const c of adresse) if (c in compte) compte[c] += 1;
  let fin = adresse.length;
  while (fin > 0) {
    const dernier = adresse[fin - 1];
    if (PONCTUATION_FINALE.test(dernier)) { fin -= 1; continue; }
    if (FERMANTES[dernier] && compte[dernier] > compte[FERMANTES[dernier]]) { compte[dernier] -= 1; fin -= 1; continue; }
    break;
  }
  return adresse.slice(0, fin);
}

/** Une adresse est valable s'il reste quelque chose après son début (préfixe http, https ou www). */
function adresseValable(a) {
  const reste = a.replace(/^(?:https?:\/\/|www\.)/i, '');
  return /[A-Za-z0-9]/.test(reste);
}

/** Adresse à mettre dans le lien : une adresse en « www. » reçoit le préfixe https. */
export function hrefDe(adresse) {
  return /^https?:\/\//i.test(adresse) ? adresse : `https://${adresse}`;
}

/**
 * Découpe un texte en morceaux : { texte } (texte simple) ou { texte, href } (adresse cliquable).
 * Mis bout à bout, les `texte` redonnent exactement le texte d'origine.
 */
export function decouperLiens(texte) {
  const s = String(texte ?? '');
  const morceaux = [];
  let position = 0;
  const ajouter = (t, href) => { if (!t) return; if (!href && morceaux.length && !morceaux[morceaux.length - 1].href) morceaux[morceaux.length - 1].texte += t; else morceaux.push(href ? { texte: t, href } : { texte: t }); };
  for (const m of s.matchAll(MOTIF)) {
    const adresse = couperFin(m[0]);
    if (!adresseValable(adresse)) continue;
    ajouter(s.slice(position, m.index));
    ajouter(adresse, hrefDe(adresse));
    position = m.index + adresse.length;
  }
  ajouter(s.slice(position));
  return morceaux;
}
