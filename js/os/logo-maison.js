// Logo d'une maison (27/11/2026, Réglages > Mon espace) : contrôle du fichier choisi et fabrication de l'adresse « data: » rangée dans reglages_maison/public.logo.
// PNG, JPEG ou SVG, 100 Ko au plus (pas de Storage : l'image vit dans le document, lu avant la connexion ; elle doit rester petite).
// Le type est lu dans les PREMIERS OCTETS du fichier, jamais dans son nom ni dans le type annoncé par le navigateur.
// Ce fichier n'importe ni Firebase ni le DOM : il se teste seul (tests/applications-coque.test.js). Les règles Firestore refont le contrôle (identiteMaisonValide).
import { LOGO_OCTETS_MAX, logoValide } from './identite-maison.js';

export const TYPES_LOGO_MAISON = 'image/png,image/jpeg,image/svg+xml';
export const AIDE_LOGO_MAISON = 'PNG, JPG ou SVG, 100 Ko au plus. Une image carrée, sans marge, rend le mieux.';

/** Type d'après le contenu : 'image/png', 'image/jpeg', 'image/svg+xml' ou null. */
export function typeLogo(octets) {
  const o = octets;
  if (o.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((v, i) => o[i] === v)) return 'image/png';
  if (o.length >= 3 && o[0] === 0xff && o[1] === 0xd8 && o[2] === 0xff) return 'image/jpeg';
  let texte = '';
  try { texte = new TextDecoder('utf-8', { fatal: true }).decode(o); } catch { return null; } // un SVG est du texte ; tout autre fichier binaire est refusé
  const debut = texte.replace(/^﻿/, '').trimStart().toLowerCase();
  if ((debut.startsWith('<svg') || debut.startsWith('<?xml') || debut.startsWith('<!--') || debut.startsWith('<!doctype svg')) && /<svg[\s>]/i.test(texte)) return 'image/svg+xml';
  return null;
}

function enBase64(octets) {
  let binaire = '';
  for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(binaire);
}

const formatKo = (n) => `${Math.ceil(n / 1000).toLocaleString('fr-FR')} Ko`;

/** Octets d'un fichier choisi -> { ok: true, logo: 'data:image/…;base64,…', type } ou { ok: false, message } (le message dit lequel des cas et quoi faire). */
export function preparerLogoMaison(octets) {
  if (!(octets instanceof Uint8Array) || !octets.length) return { ok: false, message: 'Ce fichier est vide. Choisis un logo au format PNG, JPG ou SVG.' };
  if (octets.length > LOGO_OCTETS_MAX) return { ok: false, message: `Ce fichier pèse ${formatKo(octets.length)} : 100 Ko au plus pour le logo. Choisis une image plus légère (ou réduis-la).` };
  const type = typeLogo(octets);
  if (!type) return { ok: false, message: 'Ce fichier n’est ni un PNG, ni un JPG, ni un SVG. Choisis un autre fichier.' };
  const logo = `data:${type};base64,${enBase64(octets)}`;
  if (!logoValide(logo)) return { ok: false, message: 'Ce logo ne peut pas être enregistré. Choisis une image plus légère.' };
  return { ok: true, logo, type };
}
