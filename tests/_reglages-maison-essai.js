// Fiche « réglages de la maison » des essais (chantier 0, 25/11/2026). Le serveur, les règles et l'écran ne connaissent plus aucun compte : ils lisent reglages_maison/*.
// Ce fichier est LA source des deux adresses des essais (chantier 0, partie navigateur, 26/11/2026 : js/ n'en contient plus) ; elles sont écrites ici une seule fois.
// Les tests existants qui les citent encore sont acceptés ; tout NOUVEAU test utilise des adresses inventées (FICHE_INVENTEE, ECRAN_INVENTE).
//  - brancherFicheEssai(chemin, fiche) : branche la fiche en mémoire sur une copie du serveur (functions/src ou functions-plateforme/serveur/src) ;
//  - semerFicheEmulateur({ projet, fiche, document }) : écrit un document reglages_maison dans l'émulateur Firestore (règles, parcours du navigateur, serveur sur émulateur) ;
//  - FICHE_ESSAI, ECRAN_ESSAI, PUBLIC_ESSAI : les trois documents qui reproduisent le comportement d'avant le chantier 0.

export const COMPTE_JEROME = 'jerome.chevalier@gmail.com';
export const COMPTE_BOT = 'jeromebot.chevalierbot@gmail.com';
const comptesCrm = [COMPTE_JEROME, COMPTE_BOT];
const ADMINISTRATEURS = [COMPTE_JEROME];

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

/** reglages_maison/ecran (lu par l'écran après la connexion) : les noms et portraits d'avant (ancien js/os/firebase-config.js), Jérôme seul pour la Console. */
export const ECRAN_ESSAI = Object.freeze({
  personnes: [
    { email: COMPTE_JEROME, nom: 'Jérôme', portrait: 'assets/jerome-portrait.png' },
    { email: COMPTE_BOT, nom: 'Charles', portrait: 'assets/charles-portrait.png' },
  ],
  comptes_jerome_seul: [...ADMINISTRATEURS],
});

/** reglages_maison/public (lu avant la connexion, aucun e-mail) : le CRM existe dans cette maison. */
export const PUBLIC_ESSAI = Object.freeze({ mode_crm: true });

/** reglages_maison/ecran avec des adresses inventées (nouveaux tests). */
export const ECRAN_INVENTE = Object.freeze({
  personnes: [{ email: 'admin@exemple.test', nom: 'Admin', portrait: 'assets/admin.png' }, { email: 'bot@exemple.test', nom: 'Robot', portrait: '' }],
  comptes_jerome_seul: ['admin@exemple.test'],
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
