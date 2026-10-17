// Outil des clés de la porte : créer (ou changer de clé), lister, révoquer. Logique pure : le stockage, l'affichage et le presse-papiers sont
// injectés, donc tout se teste sans Firebase (tests/porte-outil.test.js). Le point d'entrée est scripts/cles.js.
//
//   creer     --projet crm|plateforme --proprietaire <id> [--usage tableaudebord] [--ecrire] [--afficher]   (sans --usage : clé n8n)
//   lister    --projet crm|plateforme [--proprietaire <id>]
//   revoquer  --projet crm|plateforme --proprietaire <id> --cle <identifiant court> [--ecrire] [--forcer]
//
// Garde-fous : simulation par défaut (rien n'est écrit sans --ecrire) ; la clé n'est jamais affichée sauf --afficher (elle est copiée dans
// le presse-papiers) ; aucune suppression (une clé révoquée reste, marquée révoquée) ; révoquer une clé « en service » (utilisée dans les
// dernières 24 h) exige --forcer ; un seul propriétaire par commande ; 3 clés actives au plus par propriétaire.
import {
  genererCle, enregistrementDe, peutCreer, enService, resumeCle, MAX_CLES_ACTIVES, FORMAT_PROPRIETAIRE,
} from './cles.js';
import { genererCleTableau, enregistrementTableau, USAGE_TABLEAU } from './cles-tableau.js';

/** projet -> projet Firebase et propriétaires permis. « crm » = la base 1 (Jérôme) : un seul propriétaire, « interne ». « plateforme » = la base 2 : un client existant. */
export const PROJETS = Object.freeze({
  crm: Object.freeze({ id: 'chevalier-ia-os', proprietairesFixes: Object.freeze(['interne']), nom: 'ton CRM (base 1)' }),
  plateforme: Object.freeze({ id: 'chevalier-ia-app', proprietairesFixes: null, nom: 'la plateforme des clients (base 2)' }),
});
export const PROJET_ESSAI = 'demo-chevalier-ia-os';
const ID_COURT = /^[0-9a-f]{8}$/;
const COMMANDES = ['creer', 'lister', 'revoquer'];
const BOOLEENS = ['ecrire', 'afficher', 'forcer'];
const VALEURS = ['projet', 'proprietaire', 'cle', 'usage'];

/** argv (sans « node » ni le script) -> { commande, options } ou { erreur }. Option inconnue ou sans valeur = erreur (jamais ignorée en silence). */
export function lireArguments(argv) {
  const [commande, ...reste] = argv;
  if (!COMMANDES.includes(commande)) return { erreur: `Commande inconnue : « ${commande ?? ''} ». Choix : ${COMMANDES.join(', ')}.` };
  const options = {};
  for (let i = 0; i < reste.length; i++) {
    const m = /^--([a-z]+)$/.exec(reste[i]);
    if (!m) return { erreur: `Argument inattendu : « ${reste[i]} ».` };
    const nom = m[1];
    if (BOOLEENS.includes(nom)) { options[nom] = true; continue; }
    if (!VALEURS.includes(nom)) return { erreur: `Option inconnue : --${nom}.` };
    const valeur = reste[++i];
    if (valeur === undefined || valeur.startsWith('--')) return { erreur: `L'option --${nom} attend une valeur.` };
    options[nom] = valeur;
  }
  return { commande, options };
}

/**
 * Exécute une commande. `ctx` : { store, sortie(ligne), copier(texte) -> bool, maintenant() -> millisecondes, erreurIdentifiant(id) -> message|null }.
 * `store` : { listerCles(proprietaire|null), ecrireCle(id, donnees), majCle(id, partiel), lireCle(id), clientExiste(id) }.
 * Renvoie le code de sortie (0 = tout va bien).
 */
export async function executer(argv, ctx) {
  const { sortie } = ctx;
  const lu = lireArguments(argv);
  if (lu.erreur) { sortie(`✖ ${lu.erreur}`); return 1; }
  const { commande, options } = lu;
  const projet = PROJETS[options.projet];
  if (!projet) { sortie('✖ Indique le projet avec --projet crm (ton CRM) ou --projet plateforme (les clients).'); return 1; }
  const proprietaire = options.proprietaire ?? null;
  if (proprietaire !== null) {
    const refus = await verifierProprietaire(projet, proprietaire, ctx);
    if (refus) { sortie(`✖ ${refus}`); return 1; }
  } else if (commande !== 'lister') {
    sortie('✖ Indique le propriétaire avec --proprietaire <identifiant du client> (ou « interne » pour le CRM).');
    return 1;
  }
  sortie(`Projet : ${projet.nom}${options.ecrire || commande === 'lister' ? '' : ' (simulation : rien n\'est écrit)'}`);
  if (commande === 'lister') return lister(projet, proprietaire, ctx);
  if (commande === 'creer') return creer(projet, proprietaire, options, ctx);
  return revoquer(projet, proprietaire, options, ctx);
}

async function verifierProprietaire(projet, proprietaire, ctx) {
  if (projet.proprietairesFixes) {
    return projet.proprietairesFixes.includes(proprietaire) ? null : `Pour ${projet.nom}, le seul propriétaire possible est « ${projet.proprietairesFixes.join('», «')} ».`;
  }
  const erreur = ctx.erreurIdentifiant?.(proprietaire) ?? (FORMAT_PROPRIETAIRE.test(proprietaire) ? null : `Identifiant invalide : « ${proprietaire} ».`);
  if (erreur) return erreur;
  return (await ctx.store.clientExiste(proprietaire)) ? null : `Le client « ${proprietaire} » n'existe pas dans ${projet.nom}. Crée-le d'abord avec l'outil « nouveau client ».`;
}

async function lister(projet, proprietaire, ctx) {
  const { sortie, store, maintenant } = ctx;
  const cles = await store.listerCles(proprietaire);
  if (!cles.length) { sortie(proprietaire ? `Aucune clé pour « ${proprietaire} ».` : 'Aucune clé.'); return 0; }
  const parProprietaire = new Map();
  for (const c of cles) parProprietaire.set(c.proprietaire, [...(parProprietaire.get(c.proprietaire) ?? []), c]);
  for (const [p, liste] of [...parProprietaire].sort(([a], [b]) => a.localeCompare(b))) {
    sortie(`\n${p} : ${liste.filter((c) => c.actif === true).length} clé(s) active(s) sur ${MAX_CLES_ACTIVES} permises`);
    for (const c of liste.sort((a, b) => String(a.idCourt).localeCompare(String(b.idCourt)))) sortie(`  ${resumeCle(c, maintenant())}`);
  }
  return 0;
}

/** Un nom d'étiquette n8n fait 24 caractères au plus : « client- » en prend 7. Au-delà de 17 caractères, l'étiquette du client ne peut pas exister et la vérification d'intégrité ne pourrait jamais réussir. */
export const LONGUEUR_MAX_CLIENT_AVEC_PORTE = 17;

async function creer(projet, proprietaire, options, ctx) {
  const { sortie, store, copier, maintenant } = ctx;
  if (projet.proprietairesFixes === null && proprietaire.length > LONGUEUR_MAX_CLIENT_AVEC_PORTE) {
    sortie(`✖ L'identifiant « ${proprietaire} » fait ${proprietaire.length} caractères : au-delà de ${LONGUEUR_MAX_CLIENT_AVEC_PORTE}, n8n ne peut pas créer l'étiquette « client-${proprietaire} » (24 caractères au plus), et la porte ne pourrait pas vérifier ses workflows. Aucune clé créée.`);
    return 1;
  }
  const usage = options.usage ?? 'n8n';
  if (usage !== 'n8n' && usage !== USAGE_TABLEAU) { sortie(`✖ --usage « ${usage} » inconnu. Choix : n8n (par défaut), ${USAGE_TABLEAU}.`); return 1; }
  const tableau = usage === USAGE_TABLEAU;
  if (tableau && projet.proprietairesFixes === null) { sortie('✖ La porte du tableau de bord n\'est en service que pour ton CRM (--projet crm). Aucune clé créée.'); return 1; }
  // Les 3 clés actives au plus se comptent par usage : une clé du tableau de bord ne prend pas la place d'une clé n8n.
  const existantes = (await store.listerCles(proprietaire)).filter((c) => (c.usage ?? 'n8n') === usage);
  const { ok, actives } = peutCreer(existantes);
  if (!ok) {
    sortie(`✖ « ${proprietaire} » a déjà ${actives} clés actives (maximum ${MAX_CLES_ACTIVES}). Révoque d'abord une clé devenue inutile :`);
    for (const c of existantes.filter((x) => x.actif === true)) sortie(`  ${resumeCle(c, maintenant())}`);
    sortie(`  node scripts/cles.js revoquer --projet ${Object.keys(PROJETS).find((k) => PROJETS[k] === projet)} --proprietaire ${proprietaire} --cle <identifiant> --ecrire`);
    return 1;
  }
  if (!options.ecrire) {
    sortie(`Créerait une clé pour « ${proprietaire} » (${actives} active(s) aujourd'hui).${actives ? ' Les clés actuelles resteraient valables.' : ''}`);
    sortie('Relancer avec --ecrire pour la créer.');
    return 0;
  }
  const cle = tableau ? genererCleTableau(proprietaire) : genererCle(proprietaire);
  const enregistrement = (tableau ? enregistrementTableau : enregistrementDe)(cle, proprietaire, new Date(maintenant()));
  const remise = tableau ? cle : `Bearer ${cle}`; // le script GitHub ajoute « Bearer » lui-même ; le credential n8n, lui, le veut dans sa valeur
  // La clé est remise AVANT d'être enregistrée : si la remise échoue, rien n'existe côté base ; si l'enregistrement échoue, la clé remise ne marche pas (elle est refusée).
  if (options.afficher) {
    sortie(`\nVoici la valeur complète. Elle ne sera plus jamais affichée ; copie-la maintenant ${tableau ? 'dans le secret GitHub CLE_TABLEAU_DE_BORD du dépôt interne-sauvegardes' : 'dans le champ Value du credential n8n du client'} :\n`);
    sortie(`  ${remise}\n`);
  } else if (!copier(remise)) {
    sortie('✖ Impossible de copier la clé dans le presse-papiers. Rien n\'a été créé. Relance avec --afficher pour la voir à l\'écran.');
    return 1;
  } else {
    sortie(tableau
      ? '\nLa clé est copiée dans le presse-papiers (elle n\'est pas affichée). Colle-la maintenant, telle quelle, comme valeur du secret GitHub CLE_TABLEAU_DE_BORD du dépôt interne-sauvegardes : elle ne pourra plus être retrouvée.'
      : '\nLa valeur complète (« Bearer » + la clé) est copiée dans le presse-papiers (elle n\'est pas affichée). Colle-la maintenant, telle quelle, dans le champ Value du credential n8n du client : elle ne pourra plus être retrouvée.');
  }
  await store.ecrireCle(enregistrement.id, enregistrement.donnees);
  const relu = await store.lireCle(enregistrement.id);
  if (!relu || relu.actif !== true) { sortie('✖ La clé n\'a pas pu être enregistrée : ne l\'utilise pas, relance la commande.'); return 1; }
  sortie(`Clé enregistrée (identifiant ${enregistrement.donnees.idCourt}).`);
  if (actives > 0) {
    sortie(`Les ${actives} clé(s) précédente(s) restent valables. Quand tous les workflows de « ${proprietaire} » utilisent la nouvelle, révoque l'ancienne :`);
    sortie(`  node scripts/cles.js lister --projet ${Object.keys(PROJETS).find((k) => PROJETS[k] === projet)} --proprietaire ${proprietaire}   (regarde le dernier usage de l'ancienne)`);
  }
  return 0;
}

async function revoquer(projet, proprietaire, options, ctx) {
  const { sortie, store, maintenant } = ctx;
  if (!options.cle || !ID_COURT.test(options.cle)) { sortie('✖ Indique l\'identifiant de la clé avec --cle (8 caractères, donné par « lister »).'); return 1; }
  const cles = await store.listerCles(proprietaire);
  const cible = cles.filter((c) => c.idCourt === options.cle);
  if (cible.length !== 1) { sortie(`✖ Aucune clé « ${options.cle} » pour « ${proprietaire} ».`); return 1; }
  const [c] = cible;
  if (c.actif !== true) { sortie(`La clé ${options.cle} est déjà révoquée. Rien à faire.`); return 0; }
  if (enService(c, maintenant()) && !options.forcer) {
    sortie(`✖ La clé ${options.cle} a servi dans les dernières 24 h : la révoquer arrêtera les workflows qui l'utilisent encore.`);
    sortie(`  ${resumeCle(c, maintenant())}`);
    sortie('  Si tu es sûr (clé volée, ou workflows déjà changés), relance avec --forcer.');
    return 1;
  }
  const autresActives = cles.filter((x) => x.actif === true && x.idCourt !== options.cle).length;
  if (!options.ecrire) {
    sortie(`Révoquerait la clé ${options.cle} de « ${proprietaire} ».${autresActives === 0 ? ' ATTENTION : ce serait sa dernière clé active, plus aucun workflow ne pourrait entrer.' : ''}`);
    sortie('Relancer avec --ecrire pour la révoquer.');
    return 0;
  }
  await store.majCle(c.id, { actif: false, revoqueLe: new Date(maintenant()) });
  const relu = await store.lireCle(c.id);
  if (!relu || relu.actif !== false) { sortie('✖ La révocation n\'est pas confirmée : vérifie avec « lister ».'); return 1; }
  sortie(`Clé ${options.cle} révoquée : elle est refusée dès maintenant.${autresActives === 0 ? ' Plus aucune clé active pour ce propriétaire.' : ''}`);
  return 0;
}
