// Page « Examiner » d'une facture (module Achats « Factures », PR 8b) : le PDF à gauche, les champs, les lignes, « Nos contrôles », le score de confiance, le message de l'expéditeur et la décision à droite.
// Sur téléphone : une page à la fois (deux onglets, « Facture » et « Vérifications »), jamais de défilement horizontal.
// LECTURES : seulement par le client de la base (donnees-examiner.js) ; ÉCRITURES (accepter, refuser, créer une agence, archiver, rouvrir, relier) : seulement par la couche des actions métier ; n8n garde les règles.
// Une lecture porte un numéro : la réponse d'une lecture plus récente (ou d'un écran quitté) est ignorée. La page est relue après chaque écriture. Trois cas partout : chargement, cas vide (facture introuvable), cas d'erreur avec « Réessayer ».
import { h, icone, remplir, confirmer, toast, lirePreference, ecrirePreference, champIntelligent } from '../../os/ui.js';
import { lien } from '../../os/router.js';
import { clientBase, actionsBase, verifierAcces } from '../../os/acces-base.js';
import { CODES_A_RECHARGER } from '../../os/actions-metier.js';
import { enteteListe } from '../crm/barre-liste.js';
import { creerDonneesExaminer } from './donnees-examiner.js';
import { creerZonePdf } from './pdf-lecteur.js';
import { chargement as chargementListe, etatErreur, etatVide, barreScore } from './composants.js';
import { controlerFacture, alertesAffichees, problemeLecture, synthese, normaliserIban, sirenDe } from './controles.js';
import { scoreConfiance } from './score.js';
import { preparerMessage, courrielAffichable, champOuTiret } from './courriel.js';
import { alerteNomFournisseur, offreRouverture, offreLiaison, construireCorps, motifValide, MOTIF_MIN, MESSAGE_ROUVERTE, MESSAGE_RELIEE, CODES_LIAISON_PERIMEE,
  LIBELLE_AUCUN_CHANTIER, AIDE_SANS_CHANTIER, PHRASE_ARCHIVEE, PHRASE_LIAISON_ARCHIVEE, TEXTE_CONFIRMATION } from './decision.js';
import { filtrerOptions, optionsChantiers, optionsAgences, preselectionAgence, champsAgenceDepuis, decouperSurligne, libelleAgence, phraseChantierFerme, LETTRES_FILTRE } from './agences.js';
import { AVERTISSEMENT_COURT, INFO_COMPTE, BIENTOT } from './explications.js';
import { fenetreCourriel, fenetreControles, fenetreMotif, fenetreAgence, fenetreLiaison, MESSAGE_PAR_DEFAUT } from './fenetres.js';
import { partDepuisPosition, bornerPart, lirePartMemorisee, PAS_CLAVIER, PART_MIN, PART_MAX, CLE_STOCKAGE } from './separateur.js';
import { dessinerEtatAcces } from './ecran.js';
import { LIBELLE_STATUT, actionArchivage, textesArchivage, euros, eurosFacture, dateFr, dateHeureFr, estAvoir, nomFournisseur, DUREE_MESSAGE } from './logique.js';

const CLASSE_STATUT = { a_valider: 'badge-attention', acceptee: 'badge-succes', refusee: 'badge-retard' };
const MESSAGE_LECTURE = 'Impossible de charger cette facture. Vérifie ta connexion, puis réessaie.';
const MESSAGE_INTROUVABLE = 'Cette facture est introuvable : elle a peut-être été retirée.';
const ICONE_ETAT = { ok: 'circle-check', alerte: 'triangle-alert', anomalie: 'circle-x', indisponible: 'info' };
const TEXTE_ETAT = { ok: 'Tout va bien', alerte: 'À vérifier', anomalie: 'Anomalie', indisponible: 'Non vérifié' };
const messageDe = (e) => (e instanceof Error && e.message ? e.message : MESSAGE_PAR_DEFAUT);
const nombre = (n) => (typeof n === 'number' && Number.isFinite(n) ? n.toLocaleString('fr-FR', { maximumFractionDigits: 3 }) : '—');

/** Monte la page dans `conteneur` pour la facture `factureId`. Renvoie la fonction d'arrêt. */
export function rendreExaminer(conteneur, factureId) {
  let vivant = true;
  let etatAcces = 'chargement'; // chargement | connecte | non-regle | reconnexion | illisible
  let lecture = 'chargement'; // chargement | ok | introuvable | erreur
  let numeroLecture = 0;
  let d = null; // { f, lignes, courriel, meme, ailleurs, ibans, chantiers, agences, noteListes }
  let peutEtreAncienne = false;
  let occupe = false;
  let onglet = 'facture';
  let part = lirePartMemorisee(lirePreference(CLE_STOCKAGE, ''));
  let choixChantier = null; // { id, libelle }
  let choixAgence = null;
  let agenceDevinee = false;
  let motifAccept = '';
  let erreurDecision = '';
  let zonePdf = null;
  let cheminPdf = undefined;
  const donnees = () => creerDonneesExaminer({ client: clientBase(), actions: actionsBase() });

  const racine = h('div', { class: 'page page-examiner page-achats-factures', dataset: { module: 'achats', role: 'examiner' } });
  conteneur.replaceChildren(racine);
  const retour = h('a', { class: 'bouton-icone retour-liste', href: lien('achatsfactures/liste'), 'aria-label': 'Retour aux factures', dataset: { action: 'retour-liste' } }, icone('chevron-left', { taille: 18 }));

  // ------------------------------------------------------------ lecture
  async function verifier(forcer = false) {
    etatAcces = 'chargement'; lecture = 'chargement'; rendre();
    let etat = 'illisible';
    try { etat = (await verifierAcces(forcer)).etat; } catch (e) { console.warn('Accès à la base : vérification impossible', e?.code ?? e?.message); }
    if (!vivant) return;
    etatAcces = etat;
    if (etat === 'connecte') await charger(false); else rendre();
  }

  /** Lit la facture (obligatoire), puis le reste (facultatif : un échec rend le contrôle concerné « non vérifié », jamais vert). `silencieux` : relecture après une écriture. */
  async function charger(silencieux) {
    const n = ++numeroLecture;
    if (!silencieux) { lecture = 'chargement'; rendre(); }
    const dn = donnees();
    let f;
    try { f = await dn.lireFacture(factureId); } catch (e) {
      if (!vivant || n !== numeroLecture) return;
      if (e?.code === 'reconnexion') { etatAcces = 'reconnexion'; rendre(); return; }
      console.warn('Facture : lecture impossible', e?.code ?? e?.message);
      if (silencieux && d) { peutEtreAncienne = true; rendre(); return; }
      lecture = 'erreur'; rendre(); return;
    }
    if (!vivant || n !== numeroLecture) return;
    if (!f) { d = null; lecture = 'introuvable'; rendre(); return; }
    const siren = f.fournisseur_siren ?? sirenDe(f.extraction);
    const iban = f.iban_normalise ?? normaliserIban(f.extraction?.iban);
    const [li, co, me, ai, ib, ch, ag] = await Promise.allSettled([
      dn.listerLignes(f.id), dn.lireCourriel(f.courriel_id),
      siren ? dn.listerMemeFournisseur(siren, f.id) : Promise.resolve([]),
      siren && iban ? dn.listerMemeIbanAilleurs(iban, siren, f.id) : Promise.resolve([]),
      dn.listerIbansConfirmes(), dn.listerChantiers(), dn.listerAgences()]);
    if (!vivant || n !== numeroLecture) return;
    const val = (r) => (r.status === 'fulfilled' ? r.value : null);
    d = { f, lignes: val(li), courriel: val(co), meme: val(me), ailleurs: val(ai), ibans: val(ib), chantiers: val(ch), agences: val(ag), memeEnEchec: me.status === 'rejected' };
    lecture = 'ok'; peutEtreAncienne = false;
    // Suggestion d'agence : seulement si la personne n'a encore rien choisi (et que son choix existe encore sinon).
    if (choixAgence && d.agences && !d.agences.some((a) => a.id === choixAgence.id)) choixAgence = null;
    if (choixChantier && d.chantiers && !d.chantiers.some((c) => c.id === choixChantier.id)) choixChantier = null;
    if (!choixAgence && d.agences && f.statut === 'a_valider') {
      const id = preselectionAgence(f.extraction, d.agences, d.meme);
      const a = id ? d.agences.find((x) => x.id === id) : null;
      if (a) { choixAgence = { id: a.id, libelle: libelleAgence(a) }; agenceDevinee = true; }
    }
    rendre();
  }

  // ------------------------------------------------------------ morceaux de page
  const controlesDe = () => controlerFacture(d.f, d.meme, d.ailleurs, d.lignes, d.ibans, null);
  const ligneChamp = (libelle, valeur, cle) => h('div', { class: 'champ-lu', dataset: { champ: cle } }, h('span', { class: 'etiquette' }, libelle), h('span', { class: 'valeur-lue' }, valeur));

  function blocChamps(f) {
    const x = f.extraction?.fournisseur ?? null;
    return h('section', { class: 'carte-section examiner-bloc', dataset: { bloc: 'champs' } }, h('h2', {}, 'La facture'),
      h('div', { class: 'champs-lus' },
        ligneChamp('Fournisseur', nomFournisseur(f), 'fournisseur'), ligneChamp('Numéro', champOuTiret(f.numero), 'numero'),
        ligneChamp('Date', dateFr(f.date_facture), 'date'), ligneChamp('Total HT', eurosFacture(f.montant_ht, f), 'ht'),
        ligneChamp('TVA', eurosFacture(f.montant_tva, f), 'tva'), ligneChamp('Total TTC', eurosFacture(f.montant_ttc, f), 'ttc'),
        ligneChamp('SIRET lu', champOuTiret(x?.siret), 'siret'), ligneChamp('Envoyée par', champOuTiret(f.email_expediteur), 'expediteur'),
        ligneChamp('Reçue le', f.created_at ? dateHeureFr(f.created_at) : '—', 'recue')),
      estAvoir(f) ? h('p', { class: 'aide' }, 'C’est un avoir : les montants sont comptés en négatif.') : null);
  }

  function blocLignes() {
    const corps = d.lignes === null
      ? h('p', { class: 'erreur', role: 'alert', dataset: { etat: 'lignes-illisibles' } }, 'Les lignes n’ont pas pu être lues. Le contrôle « Lignes » n’est pas fait : regarde le PDF.')
      : d.lignes.length === 0
        ? h('p', { class: 'aide', dataset: { etat: 'lignes-vides' } }, 'Aucune ligne lue sur cette facture.')
        : h('div', { class: 'zone-tableau' }, h('table', { class: 'tableau tableau-lignes' },
          h('thead', {}, h('tr', {}, ['Réf.', 'Désignation', 'Qté', 'Prix unitaire HT', 'Remise', 'Total HT', 'TVA'].map((t) => h('th', { scope: 'col' }, t)))),
          h('tbody', {}, d.lignes.map((l) => h('tr', { dataset: { ligne: String(l.position) } },
            h('td', { dataset: { libelle: 'Réf.' } }, champOuTiret(l.reference_fournisseur)), h('td', { dataset: { libelle: 'Désignation' } }, champOuTiret(l.designation)),
            h('td', { dataset: { libelle: 'Qté' } }, `${nombre(l.quantite)}${l.unite ? ` ${l.unite}` : ''}`), h('td', { class: 'montant', dataset: { libelle: 'Prix unitaire HT' } }, euros(l.prix_unitaire_ht)),
            h('td', { dataset: { libelle: 'Remise' } }, l.remise_pct ? `${nombre(l.remise_pct)} %` : '—'), h('td', { class: 'montant', dataset: { libelle: 'Total HT' } }, euros(l.montant_ht)),
            h('td', { dataset: { libelle: 'TVA' } }, l.taux_tva === null || l.taux_tva === undefined ? '—' : `${nombre(l.taux_tva)} %`))))));
    return h('section', { class: 'carte-section examiner-bloc', dataset: { bloc: 'lignes' } }, h('h2', {}, 'Les lignes'), corps);
  }

  function blocMessage() {
    const c = d.courriel;
    const texte = c ? preparerMessage(c.corps_texte) : null;
    return h('section', { class: 'carte-section examiner-bloc', dataset: { bloc: 'message' } }, h('h2', {}, 'Message de l’expéditeur'),
      texte ? h('p', { class: 'message-extrait', dataset: { role: 'message-extrait' } }, texte.length > 280 ? `${texte.slice(0, 280).trimEnd()}…` : texte)
        : h('p', { class: 'aide', dataset: { etat: 'message-vide' } }, d.f.courriel_id ? 'Le message de l’expéditeur n’est pas disponible.' : 'Cette facture n’est pas arrivée par courriel : pas de message.'),
      courrielAffichable(c) ? h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'voir-courriel' }, onclick: () => fenetreCourriel(c) }, icone('eye', { taille: 16 }), 'Voir le courriel complet') : null);
  }

  function blocControles(controles) {
    const ligne = (c) => h('li', { class: `controle controle-${c.etat}`, dataset: { controle: c.id, etat: c.etat } },
      h('span', { class: 'controle-icone', 'aria-hidden': 'true' }, icone(ICONE_ETAT[c.etat] ?? 'info', { taille: 18 })),
      h('span', { class: 'controle-texte' }, h('b', {}, c.titre), h('span', { class: 'controle-etat' }, ` · ${TEXTE_ETAT[c.etat] ?? c.etat}`), h('span', { class: 'controle-phrase' }, c.phrase)));
    return h('section', { class: 'carte-section examiner-bloc', dataset: { bloc: 'controles' }, id: 'nos-controles' },
      h('h2', {}, 'Nos contrôles'), h('p', { class: 'aide', dataset: { role: 'synthese' } }, synthese(controles)),
      h('ul', { class: 'liste-controles' }, controles.filter((c) => !c.bientot).map(ligne)),
      h('ul', { class: 'liste-controles bientot' }, BIENTOT.map((b) => h('li', { class: 'controle controle-bientot', dataset: { controle: b.id } }, h('span', { class: 'controle-icone', 'aria-hidden': 'true' }, icone('info', { taille: 18 })), h('span', { class: 'controle-texte' }, h('b', {}, b.titre), h('span', { class: 'controle-etat' }, ' · Bientôt'))))),
      d.memeEnEchec ? h('p', { class: 'erreur', role: 'alert' }, 'L’historique du fournisseur n’a pas pu être lu : les contrôles qui en dépendent ne sont pas faits.') : null,
      h('p', { class: 'aide' }, INFO_COMPTE), h('p', { class: 'aide' }, AVERTISSEMENT_COURT),
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'nos-controles' }, onclick: () => fenetreControles() }, icone('info', { taille: 16 }), 'Nos contrôles anti-arnaque'));
  }

  // ------------------------------------------------------------ décision
  function fournirChantiers(saisie) {
    const { options, tronque } = filtrerOptions(optionsChantiers(d.chantiers ?? []), saisie);
    return { resultats: options.map((o) => ({ id: o.id, libelle: o.libelle, sousTitre: [o.grise, o.detail].filter(Boolean).join(' · ') || undefined,
      segments: decouperSurligne(o.libelle, saisie).map((s) => ({ texte: s.texte, fort: s.trouve })) })), tronque };
  }
  const messageTrop = (saisie) => (saisie.replace(/ /g, '').length < LETTRES_FILTRE ? null : 'Aucun résultat. Essaie un autre mot.');

  function champChantier(modifiable) {
    const champ = champIntelligent({
      etiquette: 'Chantier', placeholder: LIBELLE_AUCUN_CHANTIER, icone: 'search', ouvrirAuFocus: true, valeur: choixChantier,
      fournir: fournirChantiers, messageVide: messageTrop,
      surChoix: (el) => { choixChantier = el ? { id: el.id, libelle: el.libelle } : null; erreurDecision = ''; majDecision(); },
    });
    if (!modifiable) champ.entree.disabled = true;
    return champ;
  }

  function fournirAgences(saisie) {
    const { options } = filtrerOptions(optionsAgences(d.agences ?? []), saisie);
    return { resultats: options.map((o) => ({ id: o.id, libelle: o.libelle, sousTitre: o.detail, segments: decouperSurligne(o.libelle, saisie).map((s) => ({ texte: s.texte, fort: s.trouve })) })),
      creer: nomFournisseur(d.f) };
  }

  async function creerUneAgence() {
    const r = await fenetreAgence({
      champsInitiaux: champsAgenceDepuis(d.f.extraction),
      executer: async (champs) => {
        try { return await donnees().creerAgence(champs); } catch (e) { if (CODES_A_RECHARGER.has(e?.code)) void charger(true); throw e; }
      },
    });
    if (!r?.ok) return null;
    const id = r.resultat?.agence_id;
    if (!id) return null;
    try { d.agences = await donnees().listerAgences(); } catch { /* la liste sera relue à la prochaine lecture */ }
    const a = d.agences?.find((x) => x.id === id);
    agenceDevinee = false;
    return { id, libelle: a ? libelleAgence(a) : nomFournisseur(d.f) };
  }

  /** Alertes à déclarer à l'acceptation : celles des contrôles, plus celle du nom du fournisseur s'il diffère de l'entreprise de l'agence choisie. */
  function alertesDeDecision(controles) {
    const liste = alertesAffichees(controles);
    const a = choixAgence ? d.agences?.find((x) => x.id === choixAgence.id) : null;
    const nom = a ? alerteNomFournisseur(d.f.fournisseur, a.fournisseur?.nom) : null;
    return nom ? [...liste, nom] : liste;
  }

  let zoneDecision = null;
  function blocDecision() {
    zoneDecision = h('section', { class: 'carte-section examiner-bloc', dataset: { bloc: 'decision' } });
    majDecision();
    return zoneDecision;
  }

  function majDecision() {
    if (!zoneDecision || !d) return;
    const f = d.f;
    if (f.statut !== 'a_valider') { remplir(zoneDecision, ...blocDejaDecidee(f)); return; }
    const controles = controlesDe();
    const alertes = alertesDeDecision(controles);
    const chantierFerme = choixChantier ? phraseChantierFerme(d.chantiers?.find((c) => c.id === choixChantier.id) ?? {}) : null;
    const listesPretes = !!d.chantiers && !!d.agences;
    const motifOk = alertes.length === 0 || motifValide(motifAccept);
    const peutAccepter = listesPretes && !!choixAgence && !chantierFerme && motifOk && !occupe;
    const champAgence = champIntelligent({
      etiquette: 'Agence du fournisseur', placeholder: 'Chercher une agence', icone: 'search', ouvrirAuFocus: true, valeur: choixAgence, fournir: fournirAgences,
      surCreation: creerUneAgence, messageVide: messageTrop,
      surChoix: (el) => { choixAgence = el ? { id: el.id, libelle: el.libelle } : null; agenceDevinee = false; erreurDecision = ''; majDecision(); },
    });
    const champCh = champChantier(true);
    const aide = !choixAgence ? 'Choisis l’agence du fournisseur pour pouvoir accepter.' : chantierFerme ?? (choixChantier ? null : AIDE_SANS_CHANTIER);
    const doublon = controles.find((c) => c.id === 'doublon' && (c.etat === 'anomalie' || c.etat === 'alerte'));
    remplir(zoneDecision,
      h('h2', {}, 'Ta décision'),
      listesPretes ? null : h('p', { class: 'erreur', role: 'alert', dataset: { etat: 'listes-illisibles' } }, 'Les chantiers ou les agences n’ont pas pu être lus : tu peux refuser la facture, mais pas l’accepter pour l’instant.',
        h('button', { type: 'button', class: 'bouton bouton-secondaire', onclick: () => charger(true) }, icone('refresh-cw', { taille: 16 }), 'Réessayer')),
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Chantier (facultatif)'), champCh.element),
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Agence du fournisseur (obligatoire)'), champAgence.element),
      agenceDevinee && choixAgence ? h('p', { class: 'aide', dataset: { role: 'agence-suggeree' } }, 'Agence proposée d’après la facture : vérifie qu’elle est bonne.') : null,
      aide ? h('p', { class: chantierFerme ? 'erreur' : 'aide', role: chantierFerme ? 'alert' : null }, aide) : null,
      alertes.length ? h('div', { class: 'alertes-decision', dataset: { role: 'alertes-decision' } },
        h('p', { class: 'erreur' }, `${alertes.length} point${alertes.length > 1 ? 's' : ''} d’attention : pour accepter quand même, explique pourquoi (au moins ${MOTIF_MIN} caractères).`),
        h('ul', {}, alertes.map((a) => h('li', {}, a.message))),
        h('textarea', { class: 'champ', rows: 3, maxlength: 500, 'aria-label': 'Pourquoi acceptes-tu malgré les alertes ?', placeholder: 'Pourquoi acceptes-tu malgré les alertes ?', value: motifAccept, dataset: { champ: 'motif-acceptation' },
          oninput: (e) => { motifAccept = e.target.value; const b = zoneDecision.querySelector('[data-action="accepter"]'); if (b) b.disabled = !(listesPretes && !!choixAgence && !chantierFerme && motifValide(motifAccept) && !occupe); } })) : null,
      erreurDecision ? h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'decision' } }, erreurDecision) : null,
      h('div', { class: 'actions-decision' },
        h('button', { type: 'button', class: 'bouton bouton-principal', disabled: !peutAccepter, dataset: { action: 'accepter' }, onclick: () => accepter(controles) }, icone('check', { taille: 16 }), alertes.length ? 'Accepter malgré les alertes' : 'Accepter'),
        h('button', { type: 'button', class: 'bouton bouton-danger', disabled: occupe, dataset: { action: 'refuser' }, onclick: () => refuser(doublon ? 'Doublon d’une facture déjà reçue.' : '') }, icone('x', { taille: 16 }), 'Refuser'),
        doublon ? h('button', { type: 'button', class: 'bouton bouton-secondaire', disabled: occupe, dataset: { action: 'refuser-doublon' }, onclick: () => refuser('Doublon d’une facture déjà reçue.') }, 'Refuser : c’est un doublon') : null));
  }

  function blocDejaDecidee(f) {
    const rouvr = offreRouverture(f);
    const lia = offreLiaison(f);
    const arch = actionArchivage(f);
    return [
      h('h2', {}, 'Décision'),
      h('p', { dataset: { role: 'decision-prise' } }, h('span', { class: `badge ${CLASSE_STATUT[f.statut] ?? ''}` }, `${LIBELLE_STATUT[f.statut] ?? f.statut}${f.statut === 'acceptee' && f.acceptee_malgre_alerte ? ' malgré alerte' : ''}`),
        f.date_decision ? ` le ${dateHeureFr(f.date_decision)}` : '', f.decide_par ? ` par ${f.decide_par}` : ''),
      f.statut === 'refusee' && f.motif_refus ? h('p', {}, h('b', {}, 'Motif : '), f.motif_refus) : null,
      f.acceptee_malgre_alerte && f.motif_acceptation ? h('p', {}, h('b', {}, 'Pourquoi acceptée malgré l’alerte : '), f.motif_acceptation) : null,
      f.statut === 'acceptee' ? h('p', {}, h('b', {}, 'Chantier : '), f.chantiers?.nom ?? 'Aucun chantier') : null,
      erreurDecision ? h('p', { class: 'erreur', role: 'alert', dataset: { erreur: 'decision' } }, erreurDecision) : null,
      h('div', { class: 'actions-decision' },
        rouvr === 'bouton' ? h('button', { type: 'button', class: 'bouton bouton-secondaire', disabled: occupe, dataset: { action: 'rouvrir' }, onclick: rouvrir }, icone('refresh-cw', { taille: 16 }), 'Rouvrir la facture') : null,
        lia === 'bouton' ? h('button', { type: 'button', class: 'bouton bouton-secondaire', disabled: occupe, dataset: { action: 'relier' }, onclick: relier }, icone('link', { taille: 16 }), 'Relier à un chantier') : null,
        arch ? h('button', { type: 'button', class: 'bouton bouton-secondaire', disabled: occupe, dataset: { action: arch }, onclick: () => archiver(arch) },
          icone(arch === 'archiver' ? 'archive' : 'archive-restore', { taille: 16 }), arch === 'archiver' ? 'Archiver' : 'Désarchiver') : null),
      rouvr === 'archivee' ? h('p', { class: 'aide' }, PHRASE_ARCHIVEE) : null,
      lia === 'archivee' ? h('p', { class: 'aide' }, PHRASE_LIAISON_ARCHIVEE) : null,
    ];
  }

  // ------------------------------------------------------------ actions (écritures par la couche des actions ; la page est relue après)
  async function apresEcriture(message) {
    occupe = false; erreurDecision = '';
    await charger(true);
    if (vivant && message) toast(message, { duree: DUREE_MESSAGE });
  }

  /** Fin d'une écriture faite dans une fenêtre : si le serveur dit que la facture a changé (`perime`), le message reste affiché hors de la fenêtre et la page est relue. */
  async function finEcriture(r, message) {
    if (r.resultat?.perime) { occupe = false; await charger(true); return; }
    await apresEcriture(message);
  }

  /** Refus du serveur : son message est dit tel quel ; selon le code, on relit la page (la facture a changé) ou les listes (un chantier ou une agence a changé). */
  async function refusServeur(e) {
    occupe = false;
    erreurDecision = messageDe(e);
    if (e?.code === 'deja_traitee' || CODES_A_RECHARGER.has(e?.code) || CODES_LIAISON_PERIMEE.has(e?.code)) await charger(true); else majDecision();
  }

  async function accepter(controles) {
    if (occupe || !choixAgence) return;
    const alertes = alertesDeDecision(controles);
    let corps;
    try { corps = construireCorps(d.f.id, 'accepter', motifAccept, alertes, { etablissement_id: choixAgence.id, chantier_id: choixChantier?.id ?? null }); } catch (e) { erreurDecision = messageDe(e); majDecision(); return; }
    occupe = true; erreurDecision = ''; majDecision();
    try { await actionsBase().validerFacture(corps); } catch (e) { await refusServeur(e); return; }
    motifAccept = ''; choixChantier = null; choixAgence = null; agenceDevinee = false;
    await apresEcriture('Facture acceptée');
  }

  async function refuser(motifInitial) {
    if (occupe) return;
    const r = await fenetreMotif({
      titre: 'Refuser la facture', consigne: 'Explique pourquoi tu refuses cette facture.', libelle: 'Refuser', style: 'danger', texteInitial: motifInitial,
      executer: async (motif) => {
        try { await donnees().decider(d.f.id, 'refuser', motif, [], null); } catch (e) { if (e?.code === 'deja_traitee') { erreurDecision = messageDe(e); return { perime: true }; } throw e; }
        return { perime: false };
      },
    });
    if (!vivant || !r?.ok) return;
    await finEcriture(r, 'Facture refusée');
  }

  async function rouvrir() {
    if (occupe) return;
    const r = await fenetreMotif({
      titre: 'Rouvrir la facture', consigne: `${TEXTE_CONFIRMATION} Explique pourquoi tu la rouvres.`, libelle: 'Rouvrir',
      executer: async (motif) => {
        try { await donnees().rouvrir(d.f.id, motif); } catch (e) { if (e?.code === 'deja_traitee' || e?.code === 'facture_introuvable') { erreurDecision = messageDe(e); return { perime: true }; } throw e; }
        return { perime: false };
      },
    });
    if (!vivant || !r?.ok) return;
    await finEcriture(r, MESSAGE_ROUVERTE);
  }

  async function relier() {
    if (occupe) return;
    const r = await fenetreLiaison({
      fournir: fournirChantiers, phraseFerme: (id) => phraseChantierFerme(d.chantiers?.find((c) => c.id === id) ?? {}),
      executer: async (chantierId) => {
        try { await donnees().relier(d.f.id, chantierId); } catch (e) { if (CODES_LIAISON_PERIMEE.has(e?.code)) { erreurDecision = messageDe(e); return { perime: true }; } if (CODES_A_RECHARGER.has(e?.code)) void charger(true); throw e; }
        return { perime: false };
      },
    });
    if (!vivant || !r?.ok) return;
    await finEcriture(r, MESSAGE_RELIEE);
  }

  async function archiver(action) {
    if (occupe) return;
    const t = textesArchivage(d.f.fournisseur?.trim() ?? '');
    if (action === 'archiver' && !(await confirmer(t.titre, t.message, { libelleOk: t.libelleOk }))) return;
    occupe = true; erreurDecision = ''; majDecision();
    try { await (action === 'archiver' ? donnees().archiver(d.f.id) : donnees().desarchiver(d.f.id)); } catch (e) { await refusServeur(e); return; }
    await apresEcriture(action === 'archiver' ? t.fait : t.desarchive);
  }

  // ------------------------------------------------------------ dessin de la page
  function barrePdf(f) {
    if (cheminPdf !== f.fichier_path || !zonePdf) {
      zonePdf?.arreter();
      cheminPdf = f.fichier_path;
      zonePdf = creerZonePdf({ chemin: f.fichier_path ?? null, lienPdf: (c) => donnees().lienPdf(c) });
    }
    return zonePdf.element;
  }

  function panneau(f) {
    const controles = controlesDe();
    const resultat = scoreConfiance(controles, alerteNomSupplementaire());
    const probleme = problemeLecture(f);
    return h('div', { class: 'examiner-panneau', dataset: { role: 'panneau-verifications' } },
      probleme ? h('p', { class: 'erreur', role: 'alert', dataset: { role: 'probleme-lecture' } }, probleme) : null,
      barreScore(resultat, { alertesSupplementaires: alerteNomSupplementaire(), surDetail: () => document.getElementById('nos-controles')?.scrollIntoView?.({ block: 'start', behavior: 'smooth' }) }),
      blocDecision(), blocChamps(f), blocLignes(), blocMessage(), blocControles(controles));
  }
  const alerteNomSupplementaire = () => {
    const a = choixAgence && d ? d.agences?.find((x) => x.id === choixAgence.id) : null;
    return a && d.f.statut === 'a_valider' && alerteNomFournisseur(d.f.fournisseur, a.fournisseur?.nom) ? 1 : 0;
  };

  function dessinerPoignee(grille) {
    const poignee = h('div', { class: 'examiner-separateur', role: 'separator', 'aria-orientation': 'vertical', tabIndex: 0, 'aria-label': 'Largeur de la facture', 'aria-valuemin': String(PART_MIN), 'aria-valuemax': String(PART_MAX), dataset: { role: 'separateur' } });
    const poser = (p) => { part = bornerPart(p, grille.clientWidth); grille.style.setProperty('--part-facture', `${part}%`); poignee.setAttribute('aria-valuenow', String(Math.round(part))); };
    const fin = () => { ecrirePreference(CLE_STOCKAGE, String(part)); };
    poignee.addEventListener('pointerdown', (e) => {
      poignee.setPointerCapture?.(e.pointerId);
      const bouge = (m) => { const r = grille.getBoundingClientRect(); poser(partDepuisPosition(m.clientX, r.left, r.width)); };
      const relache = () => { poignee.removeEventListener('pointermove', bouge); poignee.removeEventListener('pointerup', relache); poignee.removeEventListener('pointercancel', relache); fin(); };
      poignee.addEventListener('pointermove', bouge); poignee.addEventListener('pointerup', relache); poignee.addEventListener('pointercancel', relache);
      e.preventDefault();
    });
    poignee.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault(); poser(part + (e.key === 'ArrowRight' ? PAS_CLAVIER : -PAS_CLAVIER)); fin();
    });
    queueMicrotask(() => poser(part));
    return poignee;
  }

  function rendre() {
    if (!vivant) return;
    const titre = d ? nomFournisseur(d.f) : 'Facture';
    const tete = enteteListe({ titre: h('h1', {}, titre), retour,
      compteur: d ? h('span', { class: 'compteur-liste' }, h('span', { class: `badge ${CLASSE_STATUT[d.f.statut] ?? ''}`, dataset: { role: 'statut' } }, LIBELLE_STATUT[d.f.statut] ?? d.f.statut), d.f.numero ? ` N° ${d.f.numero}` : '') : null });
    if (etatAcces === 'chargement' || (etatAcces === 'connecte' && lecture === 'chargement')) { remplir(racine, tete, chargementListe()); return; }
    if (etatAcces !== 'connecte') { const z = h('div', {}); dessinerEtatAcces(z, etatAcces, (forcer) => verifier(forcer)); remplir(racine, tete, z); return; }
    if (lecture === 'erreur') { remplir(racine, tete, etatErreur(MESSAGE_LECTURE, () => charger(false))); return; }
    if (lecture === 'introuvable' || !d) { remplir(racine, tete, etatVide(MESSAGE_INTROUVABLE, { action: h('a', { class: 'bouton bouton-secondaire', href: lien('achatsfactures/liste') }, 'Retour aux factures') })); return; }
    const grille = h('div', { class: 'examiner', dataset: { onglet, role: 'examiner-grille' }, style: { '--part-facture': `${part}%` } });
    const onglets = h('div', { class: 'examiner-onglets', role: 'tablist', 'aria-label': 'Partie de la page' }, [['facture', 'Facture'], ['verifications', 'Vérifications']].map(([id, lib]) => h('button', {
      type: 'button', role: 'tab', class: `examiner-onglet${onglet === id ? ' actif' : ''}`, 'aria-selected': String(onglet === id), dataset: { onglet: id },
      onclick: () => { onglet = id; grille.dataset.onglet = id; onglets.querySelectorAll('[role="tab"]').forEach((b) => { const a = b.dataset.onglet === id; b.classList.toggle('actif', a); b.setAttribute('aria-selected', String(a)); }); },
    }, lib)));
    grille.append(h('div', { class: 'examiner-pdf', dataset: { role: 'colonne-pdf' } }, barrePdf(d.f)), dessinerPoignee(grille), panneau(d.f));
    remplir(racine, tete, peutEtreAncienne ? h('p', { class: 'aide', role: 'status' }, 'La page n’a pas pu être relue : elle n’est peut-être pas à jour. Recharge-la pour la rafraîchir.') : null, onglets, grille);
  }

  rendre();
  void verifier(false);
  return () => { vivant = false; zonePdf?.arreter(); };
}
