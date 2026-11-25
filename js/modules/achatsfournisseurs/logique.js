// Module Achats « Fournisseurs » : règles pures (aucun import, aucun réseau, aucun écran). Portées de l'appli d'achats (listes fournisseurs et IBAN confirmés) : la logique et les messages ne changent pas.
// « Confirmé » ne veut JAMAIS dire « fournisseur sûr » : une confirmation dit seulement qu'un humain a vérifié cet IBAN pour ce fournisseur, sur cette facture, de telle façon.

// ------------------------------------------------------------------ outils de texte et de date

/** Minuscules, sans accents ni ligatures courantes : « Électro » et « electro » se valent. */
export const normaliser = (s) => (s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/œ/gi, 'oe').replace(/æ/gi, 'ae').toLowerCase().trim();

const FUSEAU = 'Europe/Paris';

/** Date sans heure (AAAA-MM-JJ) : écrite telle quelle, jamais convertie en fuseau (sinon décalage d'un jour). Un horodatage complet est converti en date de Paris. */
export const dateFr = (valeur) => {
  if (!valeur) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valeur);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return new Date(valeur).toLocaleDateString('fr-FR', { timeZone: FUSEAU });
};

/** Date du jour au format AAAA-MM-JJ, en heure de Paris (nom des fichiers exportés). */
export const dateJourFichier = (quand = new Date()) => {
  const p = new Intl.DateTimeFormat('fr-FR', { timeZone: FUSEAU, day: '2-digit', month: '2-digit', year: 'numeric' }).formatToParts(quand).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  return `${p.year}-${p.month}-${p.day}`;
};

// ------------------------------------------------------------------ IBAN

const LONGUEUR_IBAN = {
  AD: 24, AE: 23, AL: 28, AT: 20, AZ: 28, BA: 20, BE: 16, BG: 22, BH: 22, BR: 29, BY: 28, CH: 21, CR: 22, CY: 28, CZ: 24, DE: 22, DK: 18, DO: 28,
  EE: 20, EG: 29, ES: 24, FI: 18, FO: 18, FR: 27, GB: 22, GE: 22, GI: 23, GL: 18, GR: 27, GT: 28, HR: 21, HU: 28, IE: 22, IL: 23, IQ: 23, IS: 26,
  IT: 27, JO: 30, KW: 30, KZ: 20, LB: 28, LC: 32, LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MD: 24, ME: 22, MK: 19, MR: 27, MT: 31, MU: 30, NL: 18,
  NO: 15, PK: 24, PL: 28, PS: 29, PT: 25, QA: 29, RO: 24, RS: 22, SA: 24, SC: 31, SE: 24, SI: 19, SK: 24, SM: 27, ST: 25, SV: 28, TL: 23, TN: 24,
  TR: 26, UA: 29, VA: 22, VG: 24, XK: 20,
};

/** IBAN normalisé : majuscules, sans espaces ni ponctuation ; null si vide. Même règle que la base. */
export function normaliserIban(v) {
  const n = (v ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  return n || null;
}

/** Reste de la division par 97 du nombre formé en déplaçant les 4 premiers caractères à la fin (lettres = 10 à 35). */
function mod97(iban) {
  const r = iban.slice(4) + iban.slice(0, 4);
  let reste = 0;
  for (const c of r) {
    const v = c >= 'A' ? String(c.charCodeAt(0) - 55) : c;
    for (const d of v) reste = (reste * 10 + Number(d)) % 97;
  }
  return reste;
}

/** IBAN au bon format : pays connu, longueur du pays, clé de contrôle (modulo 97). Ne prouve rien sur le titulaire du compte. */
export function ibanValide(brut) {
  const iban = normaliserIban(brut);
  if (!iban || !/^[A-Z]{2}\d{2}[A-Z0-9]+$/.test(iban)) return false;
  const longueur = LONGUEUR_IBAN[iban.slice(0, 2)];
  return longueur !== undefined && iban.length === longueur && mod97(iban) === 1;
}

/** IBAN affiché par groupes de 4 (lecture facile au téléphone). */
export const ibanLisible = (iban) => iban.replace(/(.{4})/g, '$1 ').trim();

// ------------------------------------------------------------------ confirmations d'IBAN
// Une « ligne à vérifier » vient de la vue `fournisseurs_a_verifier` : { fournisseur_id, siren, nom, iban, nb_factures, derniere_facture_le, a_une_facture_acceptee, vu_seulement_sur_refusee,
//   facture_a_confirmer, revoque_le, motif_revocation, confirme_pour_autre_siren, vu_chez_autre_siren }.
// Une « confirmation » vient de la table `ibans_confirmes` : { id, fournisseur_id, nom?, siren, iban, facture_id, moyen_verification, confirme_par, confirme_le, revoque_le, motif_revocation }.

export const LONGUEUR_MIN_TEXTE = 3;
export const LONGUEUR_MAX_TEXTE = 500;

/**
 * Peut-on proposer « Confirmer » ? Le serveur refuse de toute façon les mêmes cas ; on évite de proposer un bouton voué à l'échec.
 * `direct` : bouton « Confirmer » normal. Sinon (IBAN révoqué, ou vu chez un autre SIREN) : seulement « Confirmer quand même », avec une alerte et un texte obligatoire.
 * Renvoie { peutConfirmer: true, direct: true } | { peutConfirmer: true, direct: false, alerte } | { peutConfirmer: false, raison }.
 */
export function etatConfirmation(l) {
  if (l.confirme_pour_autre_siren) return { peutConfirmer: false, raison: 'Cet IBAN est déjà confirmé pour un autre fournisseur : à vérifier avant tout.' };
  if (!l.facture_a_confirmer) return { peutConfirmer: false, raison: 'Vu seulement sur des factures refusées : aucune facture ne peut servir de support à la confirmation.' };
  if (!ibanValide(l.iban)) return { peutConfirmer: false, raison: 'IBAN invalide (format) : il a peut-être été mal lu sur la facture.' };
  if (l.revoque_le) return { peutConfirmer: true, direct: false, alerte: `Confirmation révoquée le ${dateFr(l.revoque_le)}${l.motif_revocation ? ` : ${l.motif_revocation}` : ''}. Ne la rétablis que si tu as une raison solide.` };
  if (l.vu_chez_autre_siren) return { peutConfirmer: true, direct: false, alerte: 'Cet IBAN figure aussi sur une facture d’un autre fournisseur : appelle avant de le confirmer.' };
  return { peutConfirmer: true, direct: true };
}

/** Phrase courte sur l'état de la ligne. */
export function phraseLigne(l) {
  if (l.confirme_pour_autre_siren) return 'Confirmé pour un autre fournisseur';
  if (l.revoque_le) return `Confirmation révoquée le ${dateFr(l.revoque_le)}`;
  if (l.vu_chez_autre_siren) return 'IBAN vu aussi chez un autre fournisseur';
  if (l.a_une_facture_acceptee) return 'Facture acceptée, IBAN jamais confirmé';
  if (l.vu_seulement_sur_refusee) return 'Vu seulement sur des factures refusées';
  return 'Jamais confirmé';
}

/** Ordre de la file : d'abord ce qui est confirmable, puis la dernière facture la plus récente, puis le nom (stable). */
export function trierFile(lignes) {
  const rang = (l) => (etatConfirmation(l).peutConfirmer ? 0 : 1);
  return [...lignes].sort((a, b) =>
    rang(a) - rang(b)
    || (b.derniere_facture_le ?? '').localeCompare(a.derniere_facture_le ?? '')
    || (a.nom ?? '').localeCompare(b.nom ?? '', 'fr')
    || a.iban.localeCompare(b.iban));
}

/** Texte libre de 3 à 500 caractères (après nettoyage). Lève le message français sinon : rien n'est envoyé. */
export function texteObligatoire(brut, quoi, maximum = LONGUEUR_MAX_TEXTE) {
  const t = String(brut ?? '').trim();
  if (t.length < LONGUEUR_MIN_TEXTE) throw new Error(`${quoi} : écris au moins ${LONGUEUR_MIN_TEXTE} caractères.`);
  if (t.length > maximum) throw new Error(`${quoi} : ${maximum} caractères au plus.`);
  return t;
}

/** Corps de l'action `confirmer_iban` (rien d'autre : l'identité vient du ticket, jamais du corps), validé ici ET par le serveur. */
export function corpsConfirmation(l, moyen) {
  const e = etatConfirmation(l);
  if (!e.peutConfirmer) throw new Error(e.raison);
  // Parcours « confirmer quand même » : le texte obligatoire est gardé avec la mention de l'alerte, pour que le journal dise pourquoi on est passé outre.
  const prefixe = e.direct ? '' : l.revoque_le ? 'Reconfirmation après révocation : ' : 'Confirmation malgré l’alerte (IBAN vu chez un autre fournisseur) : ';
  const iban = normaliserIban(l.iban);
  if (!iban || !l.facture_a_confirmer) throw new Error('IBAN ou facture manquant.');
  return { fournisseur_id: l.fournisseur_id, iban, facture_id: l.facture_a_confirmer, moyen_verification: prefixe + texteObligatoire(moyen, 'Comment as-tu vérifié cet IBAN ?', LONGUEUR_MAX_TEXTE - prefixe.length) };
}

/** Corps de l'action `revoquer_iban`. */
export function corpsRevocation(id, motif) {
  if (!id) throw new Error('Confirmation introuvable.');
  return { id, motif: texteObligatoire(motif, 'Pourquoi révoquer cette confirmation ?') };
}

/** Confirmations actives seulement. */
export const actives = (c) => c.filter((x) => !x.revoque_le);

// ------------------------------------------------------------------ une ligne par couple (fournisseur, IBAN)

/** Quatre états, par ordre de priorité : confirmé > révoqué > alerte > à vérifier. Une ligne n'en a qu'un. */
export const ETATS_FOURNISSEUR = Object.freeze(['a_verifier', 'alerte', 'revoque', 'confirme']);
export const LIBELLE_ETAT_FOURNISSEUR = Object.freeze({
  a_verifier: 'À vérifier', alerte: 'À vérifier : alerte', revoque: 'Confirmation révoquée', confirme: 'Confirmé',
});
export const estConfirme = (e) => e === 'confirme';

const cleCouple = (fournisseurId, iban) => `${fournisseurId}|${normaliserIban(iban) ?? iban}`;

export function etatDeLigne(l) {
  if (l.revoque_le) return 'revoque';
  const e = etatConfirmation(l);
  return e.peutConfirmer && e.direct ? 'a_verifier' : 'alerte';
}

/**
 * Une ligne par couple (fournisseur, IBAN). Si un couple est dans les deux listes, la confirmation ACTIVE gagne.
 * Défaut d'affichage : à vérifier d'abord (ordre de `trierFile`), puis les confirmées de la plus récente à la plus ancienne.
 * Chaque ligne garde l'objet d'origine tel quel dans `source` : `confirmerIban` a besoin de la ligne à vérifier d'origine (elle porte la facture qui sert de support).
 * Ligne : { cle, nom, siren, iban, etat, nbFactures (null pour une confirmée), derniere, source: { type: 'a_verifier', ligne } | { type: 'confirme', confirmation } }.
 */
export function fusionner(file, confirmations) {
  const confirmees = new Map();
  for (const c of [...actives(confirmations)].sort((a, b) => b.confirme_le.localeCompare(a.confirme_le))) {
    const k = cleCouple(c.fournisseur_id, c.iban);
    if (!confirmees.has(k)) confirmees.set(k, c);
  }
  const vues = new Set();
  const lignes = [];
  for (const l of trierFile(file)) {
    const k = cleCouple(l.fournisseur_id, l.iban);
    if (confirmees.has(k) || vues.has(k)) continue;
    vues.add(k);
    lignes.push({ cle: k, nom: l.nom, siren: l.siren, iban: l.iban, etat: etatDeLigne(l), nbFactures: l.nb_factures, derniere: l.derniere_facture_le, source: { type: 'a_verifier', ligne: l } });
  }
  for (const [k, c] of confirmees) {
    lignes.push({ cle: k, nom: c.nom ?? null, siren: c.siren, iban: c.iban, etat: 'confirme', nbFactures: null, derniere: null, source: { type: 'confirme', confirmation: c } });
  }
  return lignes;
}

// ------------------------------------------------------------------ détail de l'état (sous la pastille)

/** Ce qui s'affichait avant en deux tableaux : phrase de la ligne, motif de révocation, raison du refus de confirmer ou alerte ; pour une confirmée, comment, quand et par qui. [{ texte, erreur? }] */
export function detailsEtat(l) {
  if (l.source.type === 'confirme') {
    const c = l.source.confirmation;
    return [{ texte: `Vérifié : ${c.moyen_verification} · le ${dateFr(c.confirme_le)} par ${c.confirme_par}` }];
  }
  const v = l.source.ligne;
  const e = etatConfirmation(v);
  // Ligne révoquée qu'on peut reconfirmer : l'alerte dit déjà la date et le motif, on ne les répète pas.
  if (v.revoque_le && e.peutConfirmer && !e.direct) return [{ texte: e.alerte, erreur: true }];
  const phrase = phraseLigne(v);
  const d = [];
  // Si la raison reprend la phrase en la complétant, on n'écrit que la raison : aucune information ne disparaît.
  if (e.peutConfirmer || !e.raison.startsWith(phrase)) d.push({ texte: phrase });
  if (v.revoque_le && v.motif_revocation) d.push({ texte: `motif : ${v.motif_revocation}` });
  if (!e.peutConfirmer) d.push({ texte: e.raison });
  else if (!e.direct) d.push({ texte: e.alerte, erreur: true });
  return d;
}

// ------------------------------------------------------------------ actions du menu « … »

/** Une ligne à vérifier : « Confirmer » seulement si `etatConfirmation` l'autorise (jamais un bouton voué à l'échec) ; une ligne confirmée : « Révoquer ». */
export function actionsLigne(l) {
  if (l.source.type === 'confirme') return ['revoquer'];
  const v = l.source.ligne;
  const e = etatConfirmation(v);
  if (!e.peutConfirmer) return [];
  if (e.direct) return ['confirmer'];
  return [v.revoque_le ? 'reconfirmer' : 'confirmer_quand_meme'];
}

export const LIBELLE_ACTION = Object.freeze({ confirmer: 'Confirmer', confirmer_quand_meme: 'Confirmer quand même', reconfirmer: 'Reconfirmer quand même', revoquer: 'Révoquer' });

// ------------------------------------------------------------------ filtres, recherche

export const CRITERES_FOURNISSEURS_VIDES = Object.freeze({ recherche: '', etats: [] });
export const nombreFiltresFournisseurs = (c) => c.etats.length;
export const criteresFournisseursActifs = (c) => nombreFiltresFournisseurs(c) > 0 || normaliser(c.recherche) !== '';

const sansEspaces = (t) => t.replace(/\s+/g, '').toLowerCase();

/** Recherche : nom, SIREN ou IBAN, avec ou sans espaces. Chaque mot saisi doit se trouver quelque part (sans casse ni accents), ou toute la saisie dans l'IBAN. */
export function correspondRechercheFournisseur(l, recherche) {
  const q = normaliser(recherche);
  if (!q) return true;
  if (sansEspaces(recherche).length >= 2 && sansEspaces(l.iban).includes(sansEspaces(recherche))) return true;
  const texte = normaliser(`${l.nom ?? ''} ${l.siren} ${l.iban}`);
  return q.split(/\s+/).filter(Boolean).every((m) => texte.includes(m));
}

export function filtrerFournisseurs(lignes, c) {
  return lignes.filter((l) => (c.etats.length === 0 || c.etats.includes(l.etat)) && correspondRechercheFournisseur(l, c.recherche));
}

/** Pastilles des filtres actifs : [{ cle: 'etat', valeur, libelle }]. */
export function pastillesFournisseurs(c) {
  return c.etats.map((e) => ({ cle: 'etat', valeur: e, libelle: `État : ${LIBELLE_ETAT_FOURNISSEUR[e]}` }));
}
export function retirerCritereFournisseur(c, p) {
  return { ...c, etats: c.etats.filter((e) => e !== p.valeur) };
}

// ------------------------------------------------------------------ tri

export const CRITERES_TRI_FOURNISSEURS = Object.freeze([
  { id: 'defaut', libelle: 'À vérifier d’abord', sens: 'asc' },
  { id: 'nom', libelle: 'Nom', sens: 'asc' },
  { id: 'factures', libelle: 'Nombre de factures', sens: 'desc' },
  { id: 'derniere', libelle: 'Dernière facture', sens: 'desc' },
]);
export const TRI_FOURNISSEURS_DEFAUT = Object.freeze({ critere: 'defaut', sens: 'asc' });

/** Relit le tri mémorisé « critere:sens » ; tout ce qui est inconnu redonne le tri par défaut. */
export function lireTriFournisseurs(texte) {
  const [critere, sens] = String(texte ?? '').split(':');
  return CRITERES_TRI_FOURNISSEURS.some((c) => c.id === critere) && (sens === 'asc' || sens === 'desc') ? { critere, sens } : { ...TRI_FOURNISSEURS_DEFAUT };
}

/** Tri stable. `defaut` : l'ordre de `fusionner` (inversable). Une valeur absente (confirmée sans donnée de factures) est rangée en dernier dans les deux sens. */
export function trierFournisseurs(lignes, tri) {
  const signe = tri.sens === 'asc' ? 1 : -1;
  const cle = (l) => {
    switch (tri.critere) {
      case 'nom': return l.nom?.trim() ? normaliser(l.nom) : null;
      case 'factures': return l.nbFactures;
      case 'derniere': return l.derniere;
      default: return null;
    }
  };
  if (!['nom', 'factures', 'derniere'].includes(tri.critere)) return tri.sens === 'asc' ? [...lignes] : [...lignes].reverse();
  return lignes
    .map((l, i) => ({ l, i, k: cle(l) }))
    .sort((a, b) => {
      if (a.k === null && b.k === null) return a.i - b.i;
      if (a.k === null) return 1;
      if (b.k === null) return -1;
      const c = typeof a.k === 'number' && typeof b.k === 'number' ? a.k - b.k : String(a.k).localeCompare(String(b.k), 'fr', { numeric: true });
      return c !== 0 ? c * signe : a.i - b.i;
    })
    .map((x) => x.l);
}

// ------------------------------------------------------------------ compteur

/** « 3 IBAN · 2 à vérifier · 1 confirmé » (nombres calculés seulement). Avec un filtre actif : « 2 sur 3 IBAN · … ». */
export function texteCompteur(lignes, visibles) {
  const confirmes = lignes.filter((l) => estConfirme(l.etat)).length;
  const aVerifier = lignes.length - confirmes;
  const partiel = visibles !== undefined && visibles !== lignes.length ? `${visibles} sur ` : '';
  return `${partiel}${lignes.length} IBAN · ${aVerifier} à vérifier · ${confirmes} confirmé${confirmes > 1 ? 's' : ''}`;
}
