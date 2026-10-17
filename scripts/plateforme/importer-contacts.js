// Import de contacts de prospection dans UN espace client (plateforme clients) : une PERSONNE et une AFFAIRE par contact, une note sur chacune,
// le « groupe » en étiquette de la personne. Aucune société. Lancé à la main par Jérôme (ou Claude), avec ses identifiants Google.
// Par défaut il SIMULE : il affiche ce qu'il écrirait, sans rien écrire. Il n'écrit qu'avec --ecrire.
// AUCUNE donnée personnelle dans ce fichier : les contacts viennent d'un fichier JSON passé avec --fichier (jamais commité).
//
// Mêmes règles d'écriture que l'écran et le serveur MCP : les plans de js/modules/crm/logique.js (documents, événements de création), plus la ligne
// d'audit et sa copie (construireAudit), dans le même lot que les données. Un lot (une personne, une affaire, deux notes, deux événements, leur audit)
// par contact : tout ou rien. Idempotent : les identifiants des documents sont dérivés du nom du contact ; une fiche déjà là est SAUTÉE, jamais écrasée.
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { FieldValue } from 'firebase-admin/firestore';
import {
  ErreurOutil, cible, exigerIdentifiant, lireArguments, ouvrir, traduireErreur, verifierEmail,
} from './commun.js';
import * as L from '../../js/modules/crm/logique.js';
import { cheminBaseClient, cheminCollection } from '../../js/os/chemins.js';

export const ESPACE_PAR_DEFAUT = 'ingrid-atamian';
export const PROPRIETAIRE_PAR_DEFAUT = 'jerome.chevalier@gmail.com';
export const OUTIL = 'importer-contacts-ingrid';
const COULEURS_ETIQUETTES = ['#b98ee0', '#fd6455', '#ecbc06', '#3fbf7f', '#8a9bb4', '#e3cdee']; // les mêmes que l'écran (donnees.js : creerEtiquette)
const ETAPES_CONNUES = { nouveau_contact: 0, echange_en_cours: 1 }; // rang de l'étape dans le pipeline de l'espace
const NB_DETAILLES = 2;

export const AIDE = `Import de contacts de prospection dans un espace client — simule par défaut ; ajouter --ecrire pour écrire vraiment.

  node scripts/importer-contacts-ingrid.mjs --fichier chemin/contacts.json [--espace ingrid-atamian] [--proprietaire adresse] [--ecrire]

Une personne et une affaire par contact (pas de société). Le « secteur » et les commentaires sont recopiés tels quels dans une note sur la personne
et une note sur l'affaire. Le « groupe » devient une étiquette de la personne (créée si besoin). Relancer ne crée aucun doublon : une fiche
déjà présente est sautée, jamais modifiée.
Options : --projet <projet Firebase> (défaut : chevalier-ia-app) ; --hors-ligne (simulation sans rien lire en ligne : étapes et étiquettes de départ supposées).`;

// ------------------------------------------------------------------------------------------------ lecture et validation du fichier

/** Le fichier JSON -> { espace, contacts } nettoyés. Lève ErreurOutil avec TOUS les problèmes trouvés. */
export function lireContacts(texte) {
  let json;
  try { json = JSON.parse(texte); } catch { throw new ErreurOutil("Le fichier n'est pas un JSON valide."); }
  const liste = Array.isArray(json) ? json : json?.contacts;
  if (!Array.isArray(liste) || !liste.length) throw new ErreurOutil('Le fichier ne contient aucun contact (attendu : { "contacts": [ … ] }).');
  const erreurs = [];
  const vus = new Map();
  const contacts = liste.map((c, i) => {
    const n = `Contact n° ${i + 1}`;
    const nom = L.nettoyerEspaces(c?.nom);
    if (!nom) { erreurs.push(`${n} : le nom est vide.`); return null; }
    const cle = L.normaliserNom(nom);
    if (vus.has(cle)) erreurs.push(`${n} : le même nom que le contact n° ${vus.get(cle)} (l'identifiant des fiches vient du nom).`);
    vus.set(cle, i + 1);
    const mail = L.normaliserEmail(c.mail);
    if (mail && !L.emailValide(mail)) erreurs.push(`${n} : l'adresse e-mail « ${c.mail} » n'est pas valide.`);
    if (c.etape !== undefined && c.etape !== '' && !(c.etape in ETAPES_CONNUES)) erreurs.push(`${n} : étape « ${c.etape} » inconnue (attendu : ${Object.keys(ETAPES_CONNUES).join(' ou ')}).`);
    if (c.commentaires !== undefined && !Array.isArray(c.commentaires)) erreurs.push(`${n} : « commentaires » doit être une liste de textes.`);
    return {
      nom, mail, telephone: L.nettoyerEspaces(c.telephone), secteur: L.nettoyerEspaces(c.secteur), groupe: L.nettoyerEspaces(c.groupe),
      // Recopiés tels quels : seul le texte de chaque ligne est gardé, sans interprétation.
      commentaires: (Array.isArray(c.commentaires) ? c.commentaires : []).map((x) => String(x ?? '')).filter((x) => x.trim() !== ''),
      etape: c.etape || 'nouveau_contact',
    };
  });
  if (erreurs.length) throw new ErreurOutil(erreurs);
  return { espace: typeof json?.espace === 'string' ? json.espace : null, contacts };
}

/** Texte de la note (identique sur la personne et sur l'affaire) : le secteur, puis les commentaires, une ligne chacun, tels quels. */
export function texteNote(c) {
  return [c.secteur ? `Secteur : ${c.secteur}` : '', ...c.commentaires].filter(Boolean).join('\n');
}

/** Identifiants fixes des documents d'un contact, dérivés de son nom (relancer retombe sur les mêmes). */
export function identifiants(nom) {
  const h = createHash('sha1').update(L.normaliserNom(nom)).digest('hex').slice(0, 12);
  const base = `ing-${h}`;
  return {
    personne: base, affaire: base, notePersonne: `${base}-np`, noteAffaire: `${base}-na`, evenementPersonne: `${base}-ep`, evenementAffaire: `${base}-ea`,
  };
}

/** Identifiant d'étiquette, calculé comme à l'écran (donnees.js : creerEtiquette). */
export const idEtiquette = (nom) => L.normaliser(L.nettoyerEspaces(nom)).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'etiquette';

/**
 * Étiquettes à avoir : renvoie { items (liste complète à enregistrer), ids: { groupe -> id }, creees: [nom] }.
 * Une étiquette de même nom (sans tenir compte des accents ni de la casse) est reprise telle quelle.
 */
export function preparerEtiquettes(existantes, groupes) {
  const items = [...existantes].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
  const ids = {};
  const creees = [];
  for (const g of groupes) {
    if (!g || ids[g]) continue;
    const trouvee = items.find((e) => L.normaliserNom(e.nom) === L.normaliserNom(g));
    if (trouvee) { ids[g] = trouvee.id; continue; }
    let id = idEtiquette(g);
    for (let i = 2; items.some((e) => e.id === id); i++) id = `${idEtiquette(g)}_${i}`;
    items.push({ id, nom: g, couleur: COULEURS_ETIQUETTES[items.length % COULEURS_ETIQUETTES.length] });
    ids[g] = id;
    creees.push(g);
  }
  return { items: items.map((e, i) => ({ ...e, ordre: i + 1 })), ids, creees };
}

// ------------------------------------------------------------------------------------------------ le plan d'un contact

/**
 * Écritures d'un contact (plans de logique.js, identifiants fixes). `etapeIds` : { nouveau_contact, echange_en_cours } -> identifiant réel de l'étape.
 * `etiquetteId` : identifiant de l'étiquette du groupe (ou null). Pure : rien n'est lu ni écrit.
 */
export function planContact(c, { etapeIds, etiquetteId, config, proprietaire, maintenant = new Date() }) {
  const id = identifiants(c.nom);
  const attente = {
    [L.COLLECTIONS_PLAN.personnes]: [id.personne], [L.COLLECTIONS_PLAN.affaires]: [id.affaire],
    [L.COLLECTIONS_PLAN.evenements]: [id.evenementPersonne, id.evenementAffaire],
    [L.COLLECTIONS_PLAN.notes]: [id.notePersonne, id.noteAffaire],
  };
  const ctx = {
    maintenant, auteur: proprietaire, proprietaire, aujourdhui: L.aujourdhuiParis(maintenant), config,
    nouvelId: (nom) => {
      const v = attente[nom]?.shift();
      if (!v) throw new Error(`Plan inattendu : identifiant demandé pour ${nom}`);
      return v;
    },
  };
  const note = texteNote(c);
  const personne = L.planCreerPersonne({
    nom: c.nom, emails: c.mail ? [{ valeur: c.mail, type: 'travail' }] : [], telephones: c.telephone ? [{ valeur: c.telephone, type: 'travail' }] : [],
    etiquettes: etiquetteId ? [etiquetteId] : [],
  }, ctx);
  const affaire = L.planCreerAffaire({ titre: c.nom, personneId: personne.id, etape: etapeIds[c.etape] }, {}, ctx);
  const notes = note ? [
    L.planCreerNote(note, { personneId: personne.id }, ctx),
    L.planCreerNote(note, { personneId: personne.id, affaireId: affaire.id }, ctx),
  ] : [];
  const ecritures = [...personne.ecritures, ...affaire.ecritures, ...notes.flatMap((n) => n.ecritures)];
  return { ids: id, ecritures };
}

/** Une ligne lisible par écriture : « CRÉER chemin » et ses champs. */
export function decrire(ecriture, base) {
  const chemin = `${cheminCollection(base, ecriture.collection)}/${ecriture.id}`;
  const marques = [...(ecriture.horodater || []).map((c) => `${c} = heure du serveur`), ...(ecriture.signer || []).map((c) => `${c} = acteur`)];
  return { chemin, donnees: ecriture.donnees, marques };
}
const montrer = (v) => JSON.stringify(v, (_, x) => (x instanceof Date ? `Date(${x.toISOString()})` : x), 2);

// ------------------------------------------------------------------------------------------------ lecture de l'espace

async function lireEspace(db, espace) {
  const base = cheminBaseClient(espace);
  const fiche = await db.doc(base).get();
  if (!fiche.exists) throw new ErreurOutil(`L'espace « ${espace} » n'existe pas dans cette base (clients/${espace}). Rien n'a été écrit.`);
  const modules = fiche.data().modules || {};
  if (modules.affaires !== true) throw new ErreurOutil(`Le module « affaires » n'est pas actif dans l'espace « ${espace} » : activez-le d'abord (nouveau-client.js activer-module).`);
  const param = async (nom) => { const s = await db.doc(`${base}/crm_parametres/${nom}`).get(); return s.exists ? s.data() : null; };
  const [etapes, etiquettes] = await Promise.all([param('etapes'), param('etiquettes')]);
  return { base, etapes, etiquettes };
}

function etapesCibles(config) {
  const actives = L.etapesActives(config);
  if (actives.length < 2) throw new ErreurOutil("L'espace a moins de deux étapes actives : impossible de placer « nouveau contact » et « échange en cours ».");
  return { nouveau_contact: actives[0].id, echange_en_cours: actives[1].id, libelles: [actives[0].libelle, actives[1].libelle] };
}

// ------------------------------------------------------------------------------------------------ exécution

export async function executerImport(argv, ctx) {
  try {
    const { positionnels, options } = lireArguments(argv, { valeurs: ['fichier', 'espace', 'proprietaire', 'projet', 'bucket'], drapeaux: ['ecrire', 'hors-ligne', 'aide'] });
    if (options.aide) { ctx.out(AIDE); return 0; }
    if (positionnels.length) throw new ErreurOutil(`Argument en trop : « ${positionnels.join(' ')} ». Les options commencent par --.`);
    if (!options.fichier) { ctx.out(AIDE); return 1; }
    const ecrire = Boolean(options.ecrire);
    const horsLigne = Boolean(options['hors-ligne']);
    if (ecrire && horsLigne) throw new ErreurOutil("--hors-ligne ne se combine pas avec --ecrire (on n'écrit qu'après avoir lu l'espace).");
    let texte;
    try { texte = readFileSync(options.fichier, 'utf8'); } catch { throw new ErreurOutil(`Le fichier « ${options.fichier} » est introuvable ou illisible.`); }
    const { espace: espaceFichier, contacts } = lireContacts(texte);
    const espace = exigerIdentifiant(options.espace || espaceFichier || ESPACE_PAR_DEFAUT);
    if (espaceFichier && options.espace && espaceFichier !== options.espace) throw new ErreurOutil(`Le fichier parle de l'espace « ${espaceFichier} » mais --espace vaut « ${options.espace} » : rien n'a été écrit.`);
    const proprietaire = verifierEmail(options.proprietaire || PROPRIETAIRE_PAR_DEFAUT);
    const visee = cible(options, ctx.env || process.env);
    ctx.out(`Base visée : ${visee.projet} ${visee.emulateur ? '(ÉMULATEUR de test)' : '(VRAIE base)'} ; espace : ${espace} ; propriétaire des fiches : ${proprietaire}`);
    ctx.out(ecrire ? 'MODE ÉCRITURE : les fiches vont être créées.' : 'SIMULATION : rien n\'est écrit.');

    // Étapes et étiquettes de l'espace.
    let base = cheminBaseClient(espace);
    let db = null;
    let lu = { etapes: null, etiquettes: null };
    if (!horsLigne) {
      db = ouvrir(visee).db;
      ({ base, ...lu } = await lireEspace(db, espace));
    } else ctx.out("Mode hors ligne : l'espace n'est pas lu ; étapes et étiquettes de départ supposées, existence des fiches non vérifiée.");
    const config = L.construireConfig({ etapes: lu.etapes ?? undefined }, { racine: false });
    const etapeIds = etapesCibles(config);
    ctx.out(lu.etapes
      ? `Étapes lues dans l'espace : « nouveau contact » = ${etapeIds.nouveau_contact} (${etapeIds.libelles[0]}), « échange en cours » = ${etapeIds.echange_en_cours} (${etapeIds.libelles[1]}).`
      : `Les étapes ne sont pas encore enregistrées dans cet espace (créées au premier chargement de l'écran) : valeurs de départ du code — ${etapeIds.nouveau_contact} (${etapeIds.libelles[0]}), ${etapeIds.echange_en_cours} (${etapeIds.libelles[1]}).`);
    const existantes = Array.isArray(lu.etiquettes?.items) ? lu.etiquettes.items : L.ETIQUETTES_NEUTRES;
    const etiq = preparerEtiquettes(existantes, [...new Set(contacts.map((c) => c.groupe).filter(Boolean))]);
    ctx.out(etiq.creees.length
      ? `Étiquettes à créer : ${etiq.creees.map((g) => `« ${g} » (${etiq.ids[g]})`).join(', ')}${lu.etiquettes ? '' : ' (le document des étiquettes n\'existe pas encore : il sera créé avec les deux étiquettes de départ de l\'espace)'}.`
      : 'Étiquettes : toutes existent déjà.');

    // Quels contacts sont déjà là ? (personne OU affaire de même identifiant : on saute tout le contact.)
    const plans = contacts.map((c) => ({ contact: c, ...planContact(c, { etapeIds, etiquetteId: etiq.ids[c.groupe] ?? null, config, proprietaire }) }));
    const sautes = [];
    if (db) {
      for (const p of plans) {
        const presents = [];
        for (const e of p.ecritures) {
          const s = await db.doc(`${base}/${e.collection}/${e.id}`).get();
          if (s.exists) presents.push(`${e.collection}/${e.id}`);
        }
        if (presents.length) { p.saute = presents; sautes.push(p); }
      }
    }
    const aCreer = plans.filter((p) => !p.saute);

    // Affichage.
    ctx.out('');
    ctx.out(`${contacts.length} contact(s) dans le fichier : ${aCreer.length} à créer, ${sautes.length} déjà présent(s) (sauté(s)).`);
    plans.forEach((p, i) => {
      if (p.saute) { ctx.out(`  ${i + 1}. ${p.contact.nom} : DÉJÀ PRÉSENT (${p.saute.join(', ')}) → sauté, aucune modification.`); return; }
      if (i < NB_DETAILLES) {
        ctx.out('');
        ctx.out(`──── Contact n° ${i + 1} : ${p.contact.nom} (détail) ────`);
        for (const e of p.ecritures) {
          const d = decrire(e, base);
          ctx.out(`CRÉER ${d.chemin}`);
          ctx.out(`  ${montrer(d.donnees).split('\n').join('\n  ')}`);
          if (d.marques.length) ctx.out(`  + ${d.marques.join(' ; ')}`);
        }
        ctx.out(`  + une ligne d'audit (crm_audit) et sa copie (crm_audit_avant) par document, dans le même lot`);
        ctx.out('');
      } else {
        const aff = p.ecritures.find((e) => e.collection === 'crm_affaires');
        ctx.out(`  ${i + 1}. ${p.contact.nom} : ${p.ecritures.length} documents (personne, affaire en étape ${aff.donnees.etape}, ${p.ecritures.filter((e) => e.collection === 'crm_notes').length} note(s)) ; groupe : ${p.contact.groupe || '—'} ; e-mail : ${p.contact.mail ? 'oui' : 'non'} ; téléphone : ${p.contact.telephone ? 'oui' : 'non'}`);
      }
    });
    if (!ecrire) {
      ctx.out('');
      ctx.out(`Simulation terminée : rien n'a été écrit. Pour écrire vraiment, relancer la même commande avec --ecrire.`);
      return 0;
    }

    // Écriture : étiquettes d'abord (idempotent), puis un lot par contact.
    if (etiq.creees.length) {
      await db.doc(`${base}/crm_parametres/etiquettes`).set({ items: etiq.items }, { merge: true });
      ctx.ecrits = true;
      ctx.out(`✔ Étiquettes créées : ${etiq.creees.join(', ')}`);
    }
    let crees = 0;
    for (const p of aCreer) {
      await ecrireContact(db, base, p.ecritures, { acteur: proprietaire });
      ctx.ecrits = true;
      crees += 1;
      ctx.out(`✔ ${p.contact.nom} : ${p.ecritures.length} documents écrits.`);
    }
    ctx.out('');
    ctx.out(`Terminé : ${crees} contact(s) créé(s), ${sautes.length} sauté(s) (déjà présents).`);
    return 0;
  } catch (e) {
    const lignes = e instanceof ErreurOutil ? e.messages : traduireErreur(e);
    for (const l of lignes) ctx.out(`✖ ${l}`);
    ctx.out(ctx.ecrits ? 'Attention : une partie a déjà été écrite. Relancez : les contacts déjà créés seront sautés.' : "Rien n'a été écrit.");
    return 1;
  }
}

/** Écrit les écritures d'un contact + leur audit dans UN lot (comme l'écran : jamais de donnée sans trace). */
async function ecrireContact(db, base, ecritures, { acteur }) {
  const maintenant = new Date();
  const nouvelId = (nom) => db.collection(cheminCollection(base, nom)).doc().id;
  const audit = L.construireAudit(ecritures, {}, { acteur, outil: OUTIL, operationId: nouvelId('crm_audit'), maintenant, horodatage: FieldValue.serverTimestamp(), nouvelId });
  const lot = db.batch();
  const ecrireDansLot = (e) => {
    const marques = {};
    for (const champ of e.horodater || []) marques[champ] = FieldValue.serverTimestamp();
    for (const champ of e.signer || []) marques[champ] = acteur;
    // create() échoue si le document existe déjà : même au pire moment, on n'écrase jamais une fiche.
    lot.create(db.doc(`${cheminCollection(base, e.collection)}/${e.id}`), { ...e.donnees, ...marques });
  };
  ecritures.forEach((e, i) => { ecrireDansLot(e); audit[i].forEach(ecrireDansLot); });
  await lot.commit();
}
