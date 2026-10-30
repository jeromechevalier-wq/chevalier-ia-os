// Annulation de la dernière modification d'un brouillon de devis (outil annuler_derniere_modification_devis, cadrage-devis-fluide.md 4.1).
// Module pur : choix de l'opération à défaire dans le journal du devis, et phrase qui dit ce qui a été remis.
// La phrase vient des copies « avant » / « après » du journal ; elle ne contient JAMAIS de prix d'achat ni de marge (seulement quantités et prix de vente hors taxes).
import * as L from '../../partage/logique.js';
import * as D from '../../partage/devis.js';
import { canonique } from './canonique.js';

/** Égalité de valeurs d'en-tête (nombres compris : `egal` de canonique.js retire un « id » et vide les nombres). */
const memeValeur = (a, b) => JSON.stringify(canonique(a ?? null)) === JSON.stringify(canonique(b ?? null));
import { structureCourte, quantiteAvecUnite, phraseTotaux } from './recapitulatif.js';

/** Dernière ligne du journal d'un devis, quelle que soit son origine (assistant ou écran), sans les écritures échouées. Même tri que lireAudit. */
export function derniereLigneDuJournal(lignes) {
  const valables = (lignes ?? []).filter((l) => l.statut !== 'echec');
  valables.sort((a, b) => (L.versDate(b.date)?.getTime() ?? 0) - (L.versDate(a.date)?.getTime() ?? 0) || (a.ordre ?? 0) - (b.ordre ?? 0));
  return valables[0] ?? null;
}

/**
 * Pourquoi la dernière ligne du journal ne s'annule pas, ou null si elle s'annule. On décide sur `action` (modifier = annulable ; creer = non), jamais sur un nom d'outil.
 * Ordre des refus : déjà annulé, écran, création.
 */
export function refusDeLaDerniereLigne(ligne) {
  if (ligne.action === 'restaurer') return 'La dernière opération sur ce devis est déjà une annulation (déjà annulé) : je n’annule qu’une seule modification, et je ne défais pas une annulation sans qu’on me le demande. Pour revenir plus loin, utilise restaurer_depuis_audit (Claude Code) ou fais-le à l’écran.';
  if (ligne.via === 'ecran') return 'La dernière modification vient de l’écran, je ne l’annule pas. Fais-le à l’écran.';
  if (ligne.action === 'creer') return 'Ce devis vient d’être créé, rien à annuler : utilise supprimer_devis si tu veux le retirer.';
  return null;
}

const ENTETE = {
  objet: 'l’objet', nom: 'le nom', destinataires: 'les destinataires', copie: 'la copie', remise: 'la remise', affaireId: 'l’affaire',
  organisationId: 'le client', personneId: 'le contact', tauxTvaDefaut: 'le taux de TVA par défaut', marge: 'un réglage de prix', modeMarge: 'un réglage de prix', regimeTva: 'le régime de TVA',
};

const prixVenteParLigne = (devis) => {
  try { return new Map(D.totauxDevis(devis).lignes.map((l) => [l.id, l.prixVenteUnitaire])); } catch { return new Map(); }
};
const aplatir = (devis) => {
  const sections = Array.isArray(devis?.sections) ? devis.sections : [];
  const prix = prixVenteParLigne(devis);
  const lignes = new Map();
  const titres = new Map();
  structureCourte(sections).forEach((s, i) => {
    titres.set(s.id, { numero: s.numero, titre: s.titre });
    s.lignes.forEach((l) => {
      const source = (sections[i].lignes ?? []).find((x) => x.id === l.id);
      lignes.set(l.id, { numero: l.numero, intitule: l.intitule, quantite: quantiteAvecUnite(source), prixVente: prix.get(l.id) ?? null });
    });
  });
  return { lignes, titres };
};

const liste = (morceaux) => (morceaux.length > 1 ? `${morceaux.slice(0, -1).join(', ')} et ${morceaux.at(-1)}` : morceaux[0]);
const MAX_MORCEAUX = 4;

/** « J'ai remis la ligne 1.2 à 3 prises. » : `remis` = le devis tel qu'il est maintenant (copie « avant »), `defait` = ce qui a été annulé (copie « après »). */
export function phraseAnnulation(remis, defait) {
  const apres = aplatir(remis);
  const avant = aplatir(defait);
  const remises = [];
  const retirees = [];
  for (const [id, l] of apres.lignes) {
    const ancien = avant.lignes.get(id);
    if (!ancien) { remises.push(`la ligne ${l.numero} « ${l.intitule} »`); continue; }
    const morceaux = [];
    if (ancien.intitule !== l.intitule) morceaux.push(`en « ${l.intitule} »`);
    if (ancien.quantite !== l.quantite && l.quantite) morceaux.push(`à ${l.quantite}`);
    if (ancien.prixVente !== l.prixVente && l.prixVente !== null) morceaux.push(`au prix de ${D.montantFr(l.prixVente)} hors taxes`);
    if (morceaux.length) remises.push(`la ligne ${l.numero} ${morceaux.join(', ')}`);
  }
  for (const [id, l] of avant.lignes) if (!apres.lignes.has(id)) retirees.push(`la ligne « ${l.intitule} »`);
  for (const [id, s] of apres.titres) {
    const ancien = avant.titres.get(id);
    if (!ancien) remises.push(`la section ${s.numero} « ${s.titre} »`);
    else if (ancien.titre !== s.titre) remises.push(`le titre de la section ${s.numero} (« ${s.titre} »)`);
  }
  for (const [id, s] of avant.titres) if (!apres.titres.has(id)) retirees.push(`la section « ${s.titre} »`);
  for (const [champ, nom] of Object.entries(ENTETE)) {
    if (!memeValeur(remis?.[champ], defait?.[champ]) && !remises.includes(nom)) remises.push(nom);
  }
  const coupe = (morceaux) => (morceaux.length > MAX_MORCEAUX ? [...morceaux.slice(0, MAX_MORCEAUX), `${morceaux.length - MAX_MORCEAUX} autre(s) élément(s)`] : morceaux);
  const phrases = [];
  if (remises.length) phrases.push(`J’ai remis ${liste(coupe(remises))}.`);
  if (retirees.length) phrases.push(`J’ai retiré ${liste(coupe(retirees))}, ajouté(e) par la modification annulée.`);
  if (!phrases.length) phrases.push('J’ai remis le devis comme avant sa dernière modification.');
  return phrases.join(' ');
}

/** Totaux du devis tel qu'il est après l'annulation (jamais de prix d'achat ni de marge). */
export function resumeDuDevis(remis) {
  const t = D.totauxDevis(remis);
  return { sections: structureCourte(remis.sections ?? []), totalHT: t.totalHt, totalTTC: t.ttc, phraseTotaux: phraseTotaux(t.totalHt, t.ttc) };
}
