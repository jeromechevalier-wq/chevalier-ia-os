// Archive LinkedIn FICTIVE pour les tests de l'import (jamais un vrai fichier : aucun nom ni adresse réels).
// `fabriquerZip` écrit un vrai fichier ZIP (méthode 8 par défaut, ou 0), `archiveFictive` en fait une archive complète avec les cas du cahier :
// 2 conversations à deux voix, 1 à une voix, 1 de groupe, 1 relation sans conversation.
import { deflateRawSync } from 'node:zlib';

// Somme de contrôle CRC-32 (copie volontaire : ce fichier sert aussi aux parcours Playwright, qui ne lisent pas js/ directement).
const TABLE = (() => { const t = new Uint32Array(256); for (let i = 0; i < 256; i++) { let c = i; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[i] = c >>> 0; } return t; })();
const crc32 = (o) => { let c = 0xFFFFFFFF; for (let i = 0; i < o.length; i++) c = TABLE[(c ^ o[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };

export const PHRASE_TEMOIN = 'PHRASE-TEMOIN-A-NE-JAMAIS-RECOPIER';

/** entrees : [{ nom, contenu (texte ou octets), methode?: 0 | 8 }] -> Uint8Array du .zip. */
export function fabriquerZip(entrees, { methodeParDefaut = 8 } = {}) {
  const morceaux = [];
  const rep = [];
  let decalage = 0;
  const u16 = (n) => Buffer.from([n & 0xFF, (n >>> 8) & 0xFF]);
  const u32 = (n) => Buffer.from([n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]);
  for (const e of entrees) {
    const nom = Buffer.from(e.nom, 'utf8');
    const brut = Buffer.from(typeof e.contenu === 'string' ? Buffer.from(e.contenu, 'utf8') : e.contenu);
    const methode = e.methode ?? methodeParDefaut;
    const donnees = methode === 8 ? deflateRawSync(brut) : brut;
    const crc = crc32(new Uint8Array(brut));
    const local = Buffer.concat([u32(0x04034b50), u16(20), u16(0x0800), u16(methode), u16(0), u16(0x21), u32(crc), u32(donnees.length), u32(brut.length), u16(nom.length), u16(0), nom, donnees]);
    rep.push(Buffer.concat([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(methode), u16(0), u16(0x21), u32(crc), u32(donnees.length), u32(brut.length), u16(nom.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(decalage), nom]));
    morceaux.push(local);
    decalage += local.length;
  }
  const repertoire = Buffer.concat(rep);
  const fin = Buffer.concat([u32(0x06054b50), u16(0), u16(0), u16(entrees.length), u16(entrees.length), u32(repertoire.length), u32(decalage), u16(0)]);
  return new Uint8Array(Buffer.concat([...morceaux, repertoire, fin]));
}

export const blob = (octets) => new Blob([octets]);

const ENTETE_MESSAGES = 'CONVERSATION ID,CONVERSATION TITLE,FROM,SENDER PROFILE URL,TO,RECIPIENT PROFILE URLS,DATE,SUBJECT,CONTENT,FOLDER';
const guillemets = (v) => `"${String(v).replaceAll('"', '""')}"`;
/** m : { conv, de, urlDe?, vers, urlVers?, date, contenu?, dossier? } */
export const ligneMessage = (m) => [m.conv, '', m.de, m.urlDe ?? '', m.vers, m.urlVers ?? '', m.date, '', m.contenu ?? `Bonjour ${PHRASE_TEMOIN}`, m.dossier ?? 'INBOX'].map(guillemets).join(',');
export const csvMessages = (lignes) => `﻿${ENTETE_MESSAGES}\r\n${lignes.map(ligneMessage).join('\r\n')}\r\n`;

export const PROPRIO = 'Olivia Exemple';
const URL_PROPRIO = 'https://www.linkedin.com/in/olivia-exemple';
export const messagesFictifs = () => [
  // Conversation 1 : Alice (déjà dans le CRM), deux voix, 3 messages, le dernier reçu.
  { conv: 'conv-alice', de: PROPRIO, urlDe: URL_PROPRIO, vers: 'Alice Exemple', urlVers: 'https://www.linkedin.com/in/alice-exemple?trk=abc', date: '2026-11-02 09:00:00 UTC' },
  { conv: 'conv-alice', de: 'Alice Exemple', urlDe: 'https://www.linkedin.com/in/alice-exemple', vers: PROPRIO, urlVers: URL_PROPRIO, date: '2026-11-03 10:30:00 UTC' },
  { conv: 'conv-alice', de: 'Alice Exemple', urlDe: 'https://www.linkedin.com/in/alice-exemple', vers: PROPRIO, urlVers: URL_PROPRIO, date: '2026-11-09 08:15:00 UTC', contenu: `Merci ${PHRASE_TEMOIN}` },
  // Conversation 2 : Bruno (inconnu du CRM), deux voix, 2 messages, le dernier envoyé.
  { conv: 'conv-bruno', de: 'Bruno Test', urlDe: 'https://fr.linkedin.com/in/bruno-test/', vers: PROPRIO, urlVers: URL_PROPRIO, date: '2026-10-20 14:00:00 UTC' },
  { conv: 'conv-bruno', de: PROPRIO, urlDe: URL_PROPRIO, vers: 'Bruno Test', urlVers: 'https://fr.linkedin.com/in/bruno-test/', date: '2026-10-21 07:45:00 UTC' },
  // Conversation 3 : Carla, une seule voix (seule Olivia a écrit).
  { conv: 'conv-carla', de: PROPRIO, urlDe: URL_PROPRIO, vers: 'Carla Exemple', urlVers: 'https://www.linkedin.com/in/carla-exemple', date: '2026-10-01 12:00:00 UTC' },
  // Conversation 4 : groupe de trois personnes.
  { conv: 'conv-groupe', de: PROPRIO, urlDe: URL_PROPRIO, vers: 'Alice Exemple,Bruno Test', urlVers: 'https://www.linkedin.com/in/alice-exemple,https://www.linkedin.com/in/bruno-test', date: '2026-09-01 12:00:00 UTC' },
  { conv: 'conv-groupe', de: 'Alice Exemple', urlDe: 'https://www.linkedin.com/in/alice-exemple', vers: `${PROPRIO},Bruno Test`, urlVers: `${URL_PROPRIO},https://www.linkedin.com/in/bruno-test`, date: '2026-09-02 12:00:00 UTC' },
];

export const csvRelations = () => [
  'Notes:',
  '"When exporting your connection data, you may notice that some of the email addresses are missing."',
  '',
  'First Name,Last Name,URL,Email Address,Company,Position,Connected On',
  'Alice,Exemple,https://www.linkedin.com/in/alice-exemple,,Société Fictive,Gérante,01 Jan 2026',
  'Denis,Exemple,https://www.linkedin.com/in/denis-exemple,,Société Fictive,Directeur,02 Feb 2026',
].join('\n');
export const csvProfil = () => `First Name,Last Name,Headline\n${PROPRIO.split(' ')[0]},${PROPRIO.split(' ')[1]},Consultante\n`;

/** L'archive complète, sous forme de Blob. `racine` : dossier dans le zip (les entrées sont cherchées par nom de fichier, n'importe où). */
export function archiveFictive({ messages = messagesFictifs(), racine = '', profil = true, relations = true, methode = 8 } = {}) {
  const entrees = [
    { nom: `${racine}messages.csv`, contenu: csvMessages(messages) },
    ...(relations ? [{ nom: `${racine}Connections.csv`, contenu: csvRelations() }] : []),
    ...(profil ? [{ nom: `${racine}Profile.csv`, contenu: csvProfil() }] : []),
    { nom: `${racine}Autre/Inutile.csv`, contenu: 'a,b\n1,2\n' },
  ];
  return blob(fabriquerZip(entrees, { methodeParDefaut: methode }));
}
