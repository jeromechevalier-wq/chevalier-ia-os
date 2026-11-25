// Logique pure des champs « Chantier » et « Agence du fournisseur » de l'écran Examiner (PR 8b, portée de l'appli BTP : lib/agences.ts) : aucun appel réseau.
import { luhnValide, normaliser, sirenDe } from './controles.js';

// ------------------------------------------------------------------ liste déroulante filtrable
/** Nombre de lettres à partir duquel la saisie filtre la liste. */
export const LETTRES_FILTRE = 3;
/** Longueur maximale de la liste affichée (au-delà, on invite à taper plus de lettres). */
export const OPTIONS_MAX = 50;

/** Normalisation de la recherche : sans casse ni accents, « œ » = « oe », « æ » = « ae ». */
const norm = (s) => normaliser(s.replace(/œ/gi, 'oe').replace(/æ/gi, 'ae'));

/** Moins de 3 lettres : toute la liste (bornée). 3 lettres ou plus : seules les options dont CHAQUE mot saisi se trouve dans le libellé, le détail ou les mots de recherche. */
export function filtrerOptions(options, saisie) {
  const q = norm(saisie);
  const gardees = q.replace(/ /g, '').length < LETTRES_FILTRE
    ? options
    : options.filter((o) => {
      const texte = norm(`${o.libelle} ${o.detail ?? ''} ${o.recherche ?? ''}`);
      return q.split(' ').every((m) => texte.includes(m));
    });
  return { options: gardees.slice(0, OPTIONS_MAX), tronque: gardees.length > OPTIONS_MAX };
}

// ------------------------------------------------------------------ chantiers
/** Un chantier accepte de nouvelles factures s'il est en préparation ou en cours et non archivé (même règle que la base). */
export const chantierAcceptable = (c) => (c.statut === 'en_preparation' || c.statut === 'en_cours') && c.archive !== true;

/** Pourquoi un chantier est fermé, en un mot (null s'il est acceptable). */
export function raisonChantierFerme(c) {
  if (c.archive === true) return 'archivé';
  if (c.statut === 'termine') return 'terminé';
  if (c.statut === 'suspendu') return 'suspendu';
  return null;
}

/** Phrase affichée quand le chantier choisi n'accepte plus de factures : même ton que les réponses du serveur. */
export const phraseChantierFerme = (c) => {
  const r = raisonChantierFerme(c);
  return r ? `Ce chantier est ${r} : choisis un autre chantier.` : null;
};

/** Morceaux d'adresse qui ne sont pas une ville (bâtiment, lot, zone d'activité, pays). */
const PAS_UNE_VILLE = /^(bat|batiment|lot|zone|za|zi|france)\b/;

/** Ville de l'adresse lue sur la facture : le texte qui suit un code postal à 5 chiffres, sinon null. */
export function villeDeAdresse(adresse) {
  const m = /\b\d{5}\s+([^,;\n\d]+)/.exec(adresse ?? '');
  const v = m?.[1].trim();
  return v || null;
}

/** Ville d'un chantier, tirée de son adresse : le texte après le code postal, sinon le dernier segment après une virgule, sinon null. « Cedex 03 » est retiré ; bât, lot, zone, ZA, ZI, France ne sont pas des villes. */
export function villeChantier(adresse) {
  const nette = (v) => {
    const t = (v ?? '').replace(/\s+cedex\b.*$/i, '').trim();
    return t && !PAS_UNE_VILLE.test(norm(t)) ? t : null;
  };
  const apresCodePostal = nette(villeDeAdresse(adresse));
  if (apresCodePostal) return apresCodePostal;
  const segments = (adresse ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (segments.length < 2) return null;
  const dernier = segments[segments.length - 1];
  return /\d/.test(dernier) ? null : nette(dernier);
}

/** Première ligne d'un chantier : « Nom · Ville » (la ville seulement si l'adresse en donne une et si le nom ne la contient pas déjà). */
export function libelleChantier(c) {
  const ville = villeChantier(c.adresse);
  return ville && !norm(c.nom).includes(norm(ville)) ? `${c.nom} · ${ville}` : c.nom;
}

/** Découpe un texte pour mettre en évidence ce qui correspond à la saisie (chaque mot de 2 lettres ou plus, sans casse ni accents). Sous 3 lettres : aucun surlignage. Renvoie [{ texte, trouve }]. */
export function decouperSurligne(texteBrut, saisie) {
  const texte = texteBrut.normalize('NFC');
  const mots = norm(saisie).split(' ').filter((m) => m.length >= 2);
  if (norm(saisie).replace(/ /g, '').length < LETTRES_FILTRE || mots.length === 0) return [{ texte, trouve: false }];
  let plat = '';
  const origine = [];
  const lettres = Array.from(texte);
  lettres.forEach((c, i) => {
    const e = c.replace(/œ/gi, 'oe').replace(/æ/gi, 'ae').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    for (const x of Array.from(e)) { plat += x; origine.push(i); }
  });
  const marque = new Array(lettres.length).fill(false);
  for (const m of mots) for (let i = plat.indexOf(m); i >= 0; i = plat.indexOf(m, i + 1)) for (let k = i; k < i + m.length; k++) marque[origine[k]] = true;
  const segments = [];
  lettres.forEach((c, i) => {
    const dernier = segments[segments.length - 1];
    if (dernier && dernier.trouve === marque[i]) dernier.texte += c;
    else segments.push({ texte: c, trouve: marque[i] });
  });
  return segments;
}

export function optionsChantiers(chantiers) {
  return [...chantiers]
    .sort((a, b) => normaliser(a.nom).localeCompare(normaliser(b.nom), 'fr'))
    .map((c) => ({ id: c.id, libelle: libelleChantier(c), detail: [c.code, c.client, c.adresse?.trim()].filter(Boolean).join(' · ') || undefined, recherche: `${c.code ?? ''} ${c.client ?? ''} ${c.adresse ?? ''}`, grise: raisonChantierFerme(c) ?? undefined, cleFavori: c.id }));
}

// ------------------------------------------------------------------ agences
export const sirenDeAgence = (a) => a.fournisseur?.siren ?? (a.siret ? a.siret.slice(0, 9) : null);

/** Une agence fusionnée est remplacée par sa cible (jamais de chaîne : la base l'interdit). Renvoie l'agence elle-même si elle n'est pas fusionnée ou si la cible est inconnue. */
export function agenceEffective(a, toutes) {
  if (!a.fusionne_dans) return a;
  return toutes.find((x) => x.id === a.fusionne_dans) ?? a;
}

/** Agences proposées au choix : actives et non fusionnées. */
export const agencesProposables = (toutes) => toutes.filter((a) => a.actif && !a.fusionne_dans);

export const libelleAgence = (a) => {
  const nom = a.fournisseur?.nom ?? 'Fournisseur inconnu';
  const lieu = [a.nom_agence, a.ville].filter(Boolean).join(' · ');
  return lieu ? `${nom} · ${lieu}` : nom;
};

export function optionsAgences(toutes) {
  return agencesProposables(toutes)
    .map((a) => ({
      id: a.id,
      libelle: libelleAgence(a),
      detail: a.siret ? `SIRET ${a.siret}` : 'Sans SIRET',
      recherche: `${a.nom_agence ?? ''} ${a.ville ?? ''} ${a.siret ?? ''} ${sirenDeAgence(a) ?? ''} ${a.fournisseur?.nom ?? ''}`,
      cleFavori: sirenDeAgence(a) ?? undefined, // l'étoile d'une agence est celle de son ENTREPRISE (SIREN) : toutes les agences de l'entreprise s'allument ensemble
    }))
    .sort((x, y) => normaliser(x.libelle).localeCompare(normaliser(y.libelle), 'fr'));
}

/**
 * Agence suggérée pour une facture (suggestion seulement : l'utilisateur a toujours le dernier mot).
 *  1. l'agence dont le SIRET est celui lu sur la facture ;
 *  2. sinon, parmi les agences du même SIREN, celle dont la ville se retrouve dans l'adresse lue (une seule, sinon on ne devine pas) ;
 *  3. sinon, s'il n'y a qu'une seule agence connue pour ce SIREN, celle-ci ;
 *  4. sinon la dernière agence utilisée : celle de la facture ACCEPTÉE la plus récente du même SIREN ;
 *  5. sinon rien (null).
 * Seules les agences actives sont proposées : une agence fusionnée est remplacée par sa cible. `memeFournisseur` null (lecture en échec ou limite atteinte) : la règle 4 est sautée, on ne devine jamais.
 */
export function preselectionAgence(extraction, agences, memeFournisseur = null) {
  const actives = agencesProposables(agences);
  const effective = (a) => { const e = agenceEffective(a, agences); return actives.some((x) => x.id === e.id) ? e : null; };
  const siretLu = (extraction?.fournisseur?.siret ?? '').replace(/\D/g, '');
  const sirenLu = sirenDe(extraction);

  // 1. SIRET
  if (siretLu.length === 14) {
    const a = agences.find((x) => x.siret === siretLu);
    const e = a ? effective(a) : null;
    if (e) return e.id;
  }
  if (!sirenLu) return null;
  // SIRET de 14 chiffres lu mais inconnu : le prix dépend de l'agence, on ne propose jamais une agence au SIRET différent (seules les agences sans SIRET restent possibles).
  const duSiren = actives.filter((a) => sirenDeAgence(a) === sirenLu && !(siretLu.length === 14 && a.siret));

  // 2. même SIREN + ville de l'adresse lue
  const adresseBrute = extraction?.fournisseur?.adresse ?? '';
  const villeLue = villeDeAdresse(adresseBrute);
  const adresse = normaliser(villeLue ?? adresseBrute);
  if (adresse) {
    const memeVille = duSiren.filter((a) => { const v = normaliser(a.ville ?? ''); return v !== '' && ` ${adresse} `.includes(` ${v} `); });
    if (memeVille.length === 1) return memeVille[0].id;
  }
  // 3. une seule agence pour ce SIREN
  if (duSiren.length === 1) return duSiren[0].id;
  // 4. dernière agence utilisée par une facture acceptée du même SIREN
  if (memeFournisseur) {
    const dernieres = memeFournisseur
      .filter((f) => f.statut === 'acceptee' && f.etablissement_id)
      .sort((a, b) => (b.date_decision ?? '').localeCompare(a.date_decision ?? ''));
    for (const f of dernieres) {
      const a = agences.find((x) => x.id === f.etablissement_id);
      const e = a ? effective(a) : null;
      if (e && sirenDeAgence(e) === sirenLu && !(siretLu.length === 14 && e.siret)) return e.id;
    }
  }
  // 5. vide
  return null;
}

// ------------------------------------------------------------------ création d'une agence
/** Ce que l'IA a lu sur la facture, pour pré-remplir la fenêtre « Créer l'agence » (le nom de l'agence est laissé vide : à choisir). */
export function champsAgenceDepuis(extraction) {
  const f = extraction?.fournisseur;
  const siret = (f?.siret ?? '').replace(/\D/g, '');
  const siren = (f?.siren ?? '').replace(/\D/g, '') || (siret.length === 14 ? siret.slice(0, 9) : '');
  return { nom_fournisseur: f?.nom?.trim() ?? '', siret, siren, nom_agence: '', ville: villeDeAdresse(f?.adresse) ?? '' };
}

const chiffres = (v) => v.replace(/\D/g, '');

/** Contrôle de forme avant l'envoi (le serveur refait les mêmes contrôles). Renvoie une phrase française, ou null si tout va bien. */
export function verifierChampsAgence(c) {
  const siret = chiffres(c.siret), siren = chiffres(c.siren);
  if (c.siret.trim() && siret.length !== 14) return 'Le SIRET doit avoir 14 chiffres.';
  if (c.siren.trim() && siren.length !== 9) return 'Le SIREN doit avoir 9 chiffres.';
  if (siret && siren && !siret.startsWith(siren)) return 'Le SIRET doit commencer par le SIREN.';
  const sirenFinal = siren || (siret ? siret.slice(0, 9) : '');
  if (sirenFinal && !luhnValide(sirenFinal)) return 'Ce SIREN n’est pas valide (numéro impossible) : vérifie les chiffres.';
  if (!c.nom_fournisseur.trim()) return 'Indique le nom de l’entreprise.';
  if (!siret && !siren && !(c.nom_agence.trim() && c.ville.trim())) return 'Indique le SIRET de l’agence ou, à défaut, son nom avec le SIREN de l’entreprise ou la ville.';
  if (!siret && !c.nom_agence.trim()) return 'Sans SIRET, indique le nom de l’agence (par exemple « Agence Nord »).';
  return null;
}

/** Corps de l'action `creer_agence` : seulement les champs remplis ; jamais d'e-mail ni d'identifiant de personne (l'identité vient du ticket). */
export function corpsCreationAgence(c) {
  const corps = { nom_fournisseur: c.nom_fournisseur.trim() };
  if (chiffres(c.siret)) corps.siret = chiffres(c.siret);
  if (chiffres(c.siren)) corps.siren = chiffres(c.siren);
  if (c.nom_agence.trim()) corps.nom_agence = c.nom_agence.trim();
  if (c.ville.trim()) corps.ville = c.ville.trim();
  return corps;
}
