// Fiche « réglages de la maison » des essais (chantier 0, 25/11/2026). Le serveur et les règles ne connaissent plus aucun compte : ils lisent reglages_maison/maison.
// Les essais qui reprennent les comptes du CRM (écrits dans les tests existants) les retrouvent ici, recopiés depuis l'écran (js/os/), jamais réécrits à la main.
//  - brancherFicheEssai(chemin, fiche) : branche la fiche en mémoire sur une copie du serveur (functions/src ou functions-plateforme/serveur/src) ;
//  - semerFicheEmulateur({ projet, fiche }) : écrit la fiche dans l'émulateur Firestore (règles, parcours du navigateur, serveur sur émulateur) ;
//  - FICHE_ESSAI : la fiche qui reproduit le comportement d'avant le chantier 0.
import { COMPTES_AUTORISES as COMPTES_ECRAN } from '../js/os/firebase-config.js';
import { ADMINISTRATEURS } from '../js/os/administrateur.js';

const comptesCrm = Object.keys(COMPTES_ECRAN);
export const COMPTE_JEROME = ADMINISTRATEURS[0];
export const COMPTE_BOT = comptesCrm.find((e) => e !== COMPTE_JEROME);

/** Hôte du n8n des essais (le même que celui des tests existants). */
export const HOTE_N8N_ESSAI = ['n8n', 'chevalier-ia', 'fr'].join('.');

export const FICHE_ESSAI = Object.freeze({
  comptes_autorises: [...comptesCrm],
  comptes_jerome_seul: [...ADMINISTRATEURS],
  super_admins: [...comptesCrm],
  comptes_oauth_autorises: [...comptesCrm],
  proprietaire_par_defaut: COMPTE_JEROME,
  n8n_url: `https://${HOTE_N8N_ESSAI}`,
  projet_plateforme_lie: '',
});

/** Fiche « de démonstration » avec des adresses inventées (nouveaux tests). */
export const FICHE_INVENTEE = Object.freeze({
  comptes_autorises: ['admin@exemple.test', 'bot@exemple.test'],
  comptes_jerome_seul: ['admin@exemple.test'],
  super_admins: ['admin@exemple.test'],
  comptes_oauth_autorises: ['admin@exemple.test', 'bot@exemple.test'],
  proprietaire_par_defaut: 'admin@exemple.test',
  n8n_url: 'https://n8n.exemple.test',
  projet_plateforme_lie: '',
});

const SERVEUR = '../functions/src/securite/reglages-maison.js';

/** Branche `fiche` (ou null = fiche absente) sur le serveur, en mémoire. `chemin` : le module reglages-maison.js de la copie visée. */
export async function brancherFicheEssai(fiche = FICHE_ESSAI, chemin = SERVEUR) {
  const m = await import(new URL(chemin, import.meta.url).href);
  m.remplacerSourcePourEssais(async () => (fiche === null ? null : structuredClone(fiche)));
  return m;
}

import { semerFicheEmulateur as semer } from './_fiche-emulateur.js';
/** Écrit la fiche dans l'émulateur Firestore (API REST, jeton « owner » : passe outre les règles). `fiche` null : la supprime. Par défaut : FICHE_ESSAI. */
export const semerFicheEmulateur = ({ fiche = FICHE_ESSAI, ...reste } = {}) => semer({ fiche, ...reste });

/**
 * Compte de service tel que firebase-tools l'écrit au déploiement (lib/gcp/proto.js, formatServiceAccount) : « nom@ » est complété avec le projet visé
 * (`firebase deploy --project <projet>`). Sert à prouver, caractère pour caractère, que le compte déployé chez Jérôme ne change pas.
 */
import { createRequire } from 'node:module';
const exiger = createRequire(import.meta.url);
export const compteDeployeDans = (valeur, projet) => exiger('firebase-tools/lib/gcp/proto.js').formatServiceAccount(valeur, projet, true);

/** Exécute `fn` comme dans le projet Google `projet` (GCLOUD_PROJECT, et FIREBASE_CONFIG sans réserve), puis remet l'environnement. Rend ce que rend `fn`. */
export async function avecProjet(projet, fn) {
  const avant = { p: process.env.GCLOUD_PROJECT, c: process.env.FIREBASE_CONFIG };
  process.env.GCLOUD_PROJECT = projet;
  delete process.env.FIREBASE_CONFIG;
  try { return await fn(); } finally {
    if (avant.p === undefined) delete process.env.GCLOUD_PROJECT; else process.env.GCLOUD_PROJECT = avant.p;
    if (avant.c === undefined) delete process.env.FIREBASE_CONFIG; else process.env.FIREBASE_CONFIG = avant.c;
  }
}
