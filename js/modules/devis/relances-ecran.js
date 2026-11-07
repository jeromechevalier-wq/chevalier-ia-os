// Écran « Relances » du portail devis seul (étape 2a) : les devis à relancer, déjà relancés et qui vont l'être. À la main d'abord, jamais d'envoi automatique.
// Aucune règle ici : les groupes viennent de relances.js (groupesDeRelance, pur et testé). « Préparer l'e-mail » ouvre la fenêtre standard ; « Relancé » écrit une ligne
// d'envoi d'origine `relance` PAR LE SERVEUR (donnees.js : enregistrerEnvoi), jamais par une écriture directe. Tableau de bord : titre et compteur, ni recherche ni vues.
import { h, icone, remplir, confirmer } from '../../os/ui.js';
import { etatVide, planifier } from '../crm/composants.js';
import { enteteListe } from '../crm/barre-liste.js';
import * as CRM from '../crm/donnees.js';
import * as D from './donnees.js';
import * as Li from './liste.js';
import { formaterMontant } from './document.js';
import { noterRelance } from './actions-devis.js';
import { lancerPreparationEmail } from './email-preparer-ecran.js';
import { LIBELLE_PREPARER_EMAIL, MESSAGE_NON_BRANCHE } from './email-preparer.js';
import { adressesDuDevis } from './email-brouillon.js';
import { groupesDeRelance, libelleRelance, nombreDeRelances } from './relances.js';
import { DELAI_RELANCE_DEFAUT } from './logique.js';
import { ERREUR_LECTURE, pastilleATraiter, ouvrirDevis, intitule, celluleClient, boutonMenu, ouvrable } from './liste-ecran.js';

export const MESSAGE_SANS_DESTINATAIRE = 'Ajoute un destinataire au devis';
const VIDE = 'Aucun devis à relancer.';
const dateCourte = (ms) => new Date(ms).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const euros = (d) => { const t = Li.totauxDe(d); return typeof t?.ht === 'number' ? `HT ${formaterMontant(t.ht)}` : 'HT —'; };
const jours = (n) => `${n} j`;

/** Rend la fonction d'arrêt. */
export function rendreRelances(conteneur) {
  D.emailPreparable(); // question posée au serveur dès l'ouverture (« Préparer l'e-mail » est-il branché ?)
  const titre = h('h1', {}, 'Relances');
  const compteur = h('span', { class: 'compteur-liste', 'aria-live': 'polite' });
  const zone = h('div', { class: 'zone-relances' });
  const avis = h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'lecture' }, hidden: true });

  function boutonEmail(d) {
    const nonBranche = D.emailPreparable() === false;
    return h('button', { type: 'button', class: 'bouton bouton-secondaire', disabled: nonBranche, title: nonBranche ? MESSAGE_NON_BRANCHE : null, dataset: { action: 'preparer-email' },
      onclick: () => lancerPreparationEmail({ devisId: d.id, getDevis: () => D.devisParId(d.id) ?? d, finaliser: null }) }, icone('mail-check', { taille: 16 }), LIBELLE_PREPARER_EMAIL);
  }
  function boutonRelance(d, delai) {
    const sansDestinataire = adressesDuDevis(d.destinataires).length === 0;
    return h('button', { type: 'button', class: 'bouton bouton-secondaire', disabled: sansDestinataire, title: sansDestinataire ? MESSAGE_SANS_DESTINATAIRE : null, dataset: { action: 'relance' },
      onclick: async () => {
        if (!await confirmer('Relance envoyée ?', `Le devis sort de « À relancer » pendant ${delai} jours. Tu pourras la retrouver dans l’Historique.`, { libelleOk: 'Relancé' })) return;
        await noterRelance(d);
      } }, icone('check', { taille: 16 }), 'Relancé');
  }
  const ligne = (d, { pastille = null, detail, boutons = [], motif }) => ouvrable(h('article', { class: 'ligne-relance', dataset: { id: d.id, groupe: motif } },
    h('div', { class: 'relance-principal' },
      h('strong', { class: 'relance-numero' }, intitule(d)), celluleClient(d), h('span', { class: 'relance-montant' }, euros(d))),
    h('div', { class: 'relance-etat' }, pastille, detail ? h('span', { class: 'relance-detail' }, detail) : null),
    h('div', { class: 'relance-actions' }, ...boutons, boutonMenu(d))), () => ouvrirDevis(d));
  const bloc = (id, libelle, lignes) => (lignes.length ? h('section', { class: 'bloc-relances', dataset: { bloc: id } }, h('h2', {}, libelle, h('span', { class: 'compteur-liste' }, ` ${lignes.length}`)), ...lignes) : null);

  function rendre() {
    avis.hidden = !D.etat.erreurLectureDevis;
    avis.textContent = D.etat.erreurLectureDevis ? ERREUR_LECTURE : '';
    if (!D.estPretDevis()) { remplir(zone, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' }))); remplir(compteur, ''); return; }
    const delaiReglage = D.etat.reglages?.delaiRelanceJours;
    const delaiJours = Number.isFinite(delaiReglage) ? delaiReglage : DELAI_RELANCE_DEFAUT;
    const g = groupesDeRelance(D.etat.devis, { aujourdhui: CRM.ctx().aujourdhui, maintenant: Date.now(), delaiJours });
    const aRelancer = g.aTraiter.filter((e) => e.motif === 'a_relancer');
    const jamais = g.aTraiter.filter((e) => e.motif === 'jamais_envoye');
    const total = g.aTraiter.length + g.dejaRelances.length + g.aVenir.length;
    remplir(compteur, `${total} devis`);
    if (!total) { remplir(zone, etatVide(VIDE)); return; }
    const blocs = [
      bloc('a-relancer', 'À relancer', aRelancer.map((e) => {
        const n = nombreDeRelances(e.devis);
        return ligne(e.devis, { motif: 'a_relancer', pastille: pastilleATraiter(e), detail: n ? `${libelleRelance(n)} déjà faite` : null, boutons: [boutonEmail(e.devis), boutonRelance(e.devis, delaiJours)] });
      })),
      bloc('jamais-envoyes', 'Jamais envoyés', jamais.map((e) => ligne(e.devis, { motif: 'jamais_envoye', pastille: pastilleATraiter(e), boutons: [boutonEmail(e.devis)] }))),
      bloc('deja-relances', 'Déjà relancés', g.dejaRelances.map((r) => ligne(r.devis, { motif: 'deja_relance',
        detail: `Relancé le ${dateCourte(r.derniereRelanceMs)} · ${libelleRelance(r.nbRelances)} · à relancer de nouveau dans ${jours(r.dansJours)}` }))),
      bloc('a-venir', 'À relancer bientôt', g.aVenir.map((r) => ligne(r.devis, { motif: 'a_venir',
        detail: `Envoyé le ${dateCourte(r.dernierContactMs)} · à relancer dans ${jours(r.dansJours)}` }))),
    ].filter(Boolean);
    if (blocs.length === 1) blocs[0].querySelector('h2')?.remove(); // un bloc seul n'affiche pas de titre
    remplir(zone, ...blocs);
  }

  conteneur.append(h('div', { class: 'page page-liste page-devis page-relances' }, enteteListe({ titre, compteur }), avis, zone));
  const rafraichir = planifier(rendre);
  rendre();
  const arrets = [D.surChangement(rafraichir), CRM.surChangement(rafraichir)];
  const minuteur = setInterval(() => { if (!document.querySelector('.menu-pop, .voile-dialogue')) rendre(); }, 60000);
  return () => { arrets.forEach((f) => f()); clearInterval(minuteur); };
}
