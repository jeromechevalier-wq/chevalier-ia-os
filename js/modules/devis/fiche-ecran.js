// Fiche d'un devis : panneau qui glisse depuis la droite sur la liste (route devis/liste/<id>).
// Aucune règle ici : tout ce qui se calcule ou se décide est dans fiche.js (pur, testé) et logique.js. Le statut ne change QUE par les fonctions du serveur
// (changerStatut / archiver de donnees.js, appelées par la liste), jamais par une écriture directe. Ce qui n'existe pas encore (e-mail, facturation, jauges, documents
// liés) est grisé avec « bientôt disponible » : l'utilisateur sait que ça viendra.
import { h, icone, remplir, toast, ouvrirMenu } from '../../os/ui.js';
import * as D from './donnees.js';
import * as Li from './liste.js';
import * as Fi from './fiche.js';
import { formaterMontant } from './document.js';
import { dupliquerDevis, imprimerLeDevis } from './editeur-ecran.js';
import { naviguer } from '../../os/router.js';
import { indicateurPdf } from './pdf-indicateur.js';
import { routePdf } from './pdf.js';

const euros = (n) => (typeof n === 'number' ? formaterMontant(n) : '—');
const pct = (n) => `${String(Math.round(n * 10) / 10).replace('.', ',')} %`;
const DOCUMENTS = [['tous', 'Tous'], ['factures', 'Factures'], ['avoirs', 'Avoirs'], ['bons', 'Bons de commande']];

/**
 * `contexte` : { nomsDe(d) -> { client, affaire }, changerStatut(d, action, libelle), fermer(opts), aujourdhui() -> AAAA-MM-JJ }.
 * Rend { afficher(id), fermer(), maj(), detruire() } : la liste appelle `afficher` quand la route change et `maj` quand les données changent.
 */
export function creerFiche({ nomsDe, changerStatut, archiver, fermer: demanderFermeture, aujourdhui: jourCourant }) {
  let id = null;
  let racine = null;
  let corps = null;
  let signature = '';
  let retour = null; // l'élément qui avait le focus avant l'ouverture
  let ongletDocs = 'tous';
  let ongletVent = 'ht';
  let introuvableDit = false;
  let aFocaliser = false; // le focus va sur « ✕ » à l'ouverture d'une fiche

  const ouvert = () => racine !== null;

  function surTouche(e) {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (document.querySelector('.voile-dialogue, .menu-pop')) return; // une fenêtre ou un menu ouvert d'abord
    e.preventDefault();
    demanderFermeture();
  }

  function monter() {
    if (ouvert()) return;
    retour = document.activeElement;
    const fermerBouton = h('button', { type: 'button', class: 'bouton-icone fiche-fermer', 'aria-label': 'Fermer la fiche', dataset: { action: 'fermer-fiche' }, onclick: () => demanderFermeture() }, icone('x', { taille: 18 }));
    corps = h('div', { class: 'fiche-corps' });
    racine = h('div', { class: 'fiche-devis-racine' },
      h('div', { class: 'fiche-voile', dataset: { role: 'voile-fiche' }, onclick: () => demanderFermeture() }),
      h('aside', { class: 'fiche-panneau', 'aria-label': 'Fiche du devis', dataset: { role: 'fiche-devis' } }, corps));
    corps.fermerBouton = fermerBouton;
    document.body.append(racine);
    document.addEventListener('keydown', surTouche);
  }

  function demonter() {
    if (!ouvert()) return;
    document.removeEventListener('keydown', surTouche);
    racine.remove();
    racine = null;
    corps = null;
    signature = '';
    if (retour?.isConnected) retour.focus?.({ preventScroll: true });
    retour = null;
  }

  /** Ouvre la fiche de ce devis ; `null` la ferme. */
  function afficher(nouvelId) {
    if (!nouvelId) { id = null; introuvableDit = false; demonter(); return; }
    if (nouvelId !== id) { id = nouvelId; introuvableDit = false; ongletDocs = 'tous'; ongletVent = 'ht'; signature = ''; aFocaliser = true; }
    monter();
    maj(true);
  }

  function introuvable() {
    if (introuvableDit) return;
    introuvableDit = true;
    toast(Fi.MESSAGE_INTROUVABLE_FICHE, { type: 'erreur', duree: 6000 });
    id = null;
    demonter();
    demanderFermeture({ remplacer: true });
  }

  /** Redessine si quelque chose a changé (données, client, minute qui passe) ; `force` redessine toujours. */
  function maj(force = false) {
    if (!ouvert() || !id) return;
    if (!D.estPretDevis()) {
      if (signature !== 'attente') { signature = 'attente'; remplir(corps, h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' }))); }
      return;
    }
    const d = D.devisParId(id);
    if (!d) { introuvable(); return; }
    const maintenant = Date.now();
    const sig = JSON.stringify([d, nomsDe(d), D.etat.familles, ongletDocs, ongletVent, Math.floor(maintenant / 60000)]);
    if (!force && sig === signature) return;
    const actif = document.activeElement;
    const ongletFocus = corps.contains(actif) && actif?.dataset?.onglet ? { bloc: actif.closest('[data-bloc]')?.dataset.bloc, onglet: actif.dataset.onglet } : null;
    signature = sig;
    remplir(corps, ...contenu(d, maintenant));
    if (ongletFocus) corps.querySelector(`[data-bloc="${ongletFocus.bloc}"] [data-onglet="${ongletFocus.onglet}"]`)?.focus({ preventScroll: true });
    else if (aFocaliser) corps.fermerBouton.focus({ preventScroll: true });
    aFocaliser = false;
  }

  // ---------------------------------------------------------------- blocs

  const bientot = (libelle) => `${libelle} (bientôt disponible)`;

  function boutonMenu(libelle, action, items) {
    return h('button', {
      type: 'button', class: 'bouton bouton-secondaire', 'aria-haspopup': 'menu', dataset: { action },
      onclick: (e) => ouvrirMenu(e.currentTarget, items),
    }, libelle, icone('chevron-down', { taille: 14 }));
  }

  function entete(d) {
    const a = Li.actionsPermises(d);
    const f = Fi.actionsFiche(d);
    const s = Li.statutAffiche(d, jourCourant());
    const pastille = h('span', { class: `pastille-statut statut-devis-${s}`, style: { '--couleur': Li.COULEURS_STATUT[s] ?? '#8d8993' }, dataset: { statut: s } }, Li.libelleStatut(s));
    const itemsStatut = a.statuts.map((c) => ({ libelle: `Passer à « ${c.libelle} »`, icone: 'check', action: () => changerStatut(d, c.action, c.libelle) }));
    const statut = itemsStatut.length
      ? h('button', { type: 'button', class: 'fiche-statut-menu', 'aria-haspopup': 'menu', 'aria-label': `Statut : ${Li.libelleStatut(s)}. Changer le statut`, dataset: { action: 'statut-fiche', statut: s }, onclick: (e) => ouvrirMenu(e.currentTarget, itemsStatut) },
        pastille, icone('chevron-down', { taille: 14 }))
      : h('span', { class: 'fiche-statut-fixe', dataset: { action: 'statut-fiche', statut: s } }, pastille);

    const modifier = f.modifier
      ? h('button', { type: 'button', class: `bouton ${f.principal === 'modifier' ? 'bouton-principal' : 'bouton-secondaire'}`, disabled: !f.modifier.actif, title: f.modifier.actif ? null : Li.MESSAGE_BIENTOT, dataset: { action: 'modifier-fiche' }, onclick: () => naviguer(`devis/editeur/${d.id}`) }, icone('pencil', { taille: 16 }), 'Modifier')
      : null;

    const envoyer = boutonMenu('Envoyer', 'envoyer-fiche', [
      { libelle: 'Marquer comme envoyé', icone: 'check', desactive: !f.marquerEnvoye.actif, action: () => changerStatut(d, 'marquer_envoye', 'Envoyé') },
      { libelle: bientot('Envoyer par e-mail'), icone: 'mail', desactive: true },
    ]);
    const voirItems = [];
    if (f.voirDevis) voirItems.push({ libelle: 'Voir le devis', icone: 'external-link', action: () => naviguer(`devis/editeur/${d.id}`) });
    // Avec un PDF du serveur : on l'ouvre. Sans PDF : le devis s'imprime (ou s'enregistre en PDF) depuis le navigateur, avec son numéro (solution provisoire, voir imprimer.js).
    voirItems.push(f.apercuPdf.actif
      ? { libelle: 'Aperçu PDF', icone: 'file-text', action: () => window.open(f.apercuPdf.lien, '_blank', 'noopener') }
      : d.pdf?.statut === 'ok' && d.statut !== 'brouillon'
        ? { libelle: 'Aperçu PDF', icone: 'file-text', action: () => naviguer(routePdf(d.id)) }
        : { libelle: 'Imprimer / Enregistrer en PDF', icone: 'file-text', action: () => { const r = imprimerLeDevis(d); if (r.erreur) toast(r.erreur, { type: 'erreur', duree: 8000 }); } });
    const voirBouton = boutonMenu('Voir', 'voir-fiche', voirItems);

    const dupliquer = h('button', { type: 'button', class: 'bouton bouton-secondaire', disabled: !f.dupliquer.actif, title: f.dupliquer.actif ? null : Li.MESSAGE_BIENTOT, dataset: { action: 'dupliquer-fiche' }, onclick: () => dupliquerDevis(d) }, icone('copy', { taille: 16 }), 'Dupliquer');

    const ar = f.archivage;
    const menuPlus = h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Plus d’actions', 'aria-haspopup': 'menu', dataset: { action: 'menu-fiche' },
      onclick: (e) => ouvrirMenu(e.currentTarget, [
        { libelle: ar.libelle, icone: ar.icone, desactive: !ar.actif, action: () => archiver(d, ar.action === 'archiver') },
        ...(ar.actif ? [] : [{ texte: ar.raison }]),
      ]) }, icone('ellipsis', { taille: 20 }));

    return h('header', { class: 'fiche-tete' },
      h('div', { class: 'fiche-tete-ligne' }, statut, h('h2', { class: 'fiche-titre' }, Fi.titreFiche(d), d.version > 1 ? h('span', { class: 'devis-version' }, ` v${d.version}`) : null,
        d.archive === true ? h('span', { class: 'badge-archive', dataset: { valeur: 'archive' } }, 'Archivé') : null), menuPlus, corps.fermerBouton),
      h('div', { class: 'fiche-boutons' }, modifier, envoyer, voirBouton, dupliquer));
  }

  function identite(d, maintenant) {
    const n = nomsDe(d);
    const adresse = Fi.adresseChantier(d);
    const dates = Fi.datesFiche(d);
    const objet = (typeof d.objet === 'string' ? d.objet.trim() : '') || n.affaire;
    const modifie = Fi.libelleModifie(d, maintenant);
    return h('section', { class: 'fiche-carte fiche-identite', dataset: { bloc: 'identite' } },
      h('div', { class: 'fiche-identite-haut' },
        h('div', { class: 'fiche-identite-gauche' },
          h('h3', { class: 'fiche-client', dataset: { valeur: 'client' } }, n.client || '—'),
          adresse ? h('p', { class: 'fiche-adresse', dataset: { valeur: 'adresse' } }, icone('map-pin', { taille: 16 }), h('span', {}, adresse)) : null),
        h('div', { class: 'fiche-identite-droite' },
          h('p', { dataset: { valeur: 'date' } }, `En date du ${dates.date || '—'}`),
          h('p', { dataset: { valeur: 'validite' } }, `Valable jusqu’au ${dates.validite || '—'}`))),
      h('div', { class: 'fiche-identite-bas' },
        h('p', { class: 'fiche-objet', dataset: { valeur: 'objet' } }, objet || 'Sans objet'),
        modifie ? h('span', { class: 'fiche-modifie', dataset: { valeur: 'modifie' } }, modifie) : null));
  }

  function conditionsEtTotaux(d) {
    const cond = Fi.conditionsFiche(d);
    const t = Fi.totauxFiche(d);
    const tva = h('table', { class: 'fiche-tva', dataset: { bloc: 'tva' } },
      h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Taux TVA'), h('th', { scope: 'col', class: 'montant' }, 'Base HT'), h('th', { scope: 'col', class: 'montant' }, 'Total'))),
      h('tbody', {}, t.tvaParTaux.length
        ? t.tvaParTaux.map((x) => h('tr', {}, h('td', {}, `${String(x.taux).replace('.', ',')} %`), h('td', { class: 'montant' }, euros(x.baseHT)), h('td', { class: 'montant' }, euros(x.montant))))
        : h('tr', {}, h('td', { colspan: '3', class: 'fiche-vide' }, 'Aucune TVA'))));
    return h('section', { class: 'fiche-carte fiche-conditions-totaux', dataset: { bloc: 'totaux' } },
      h('div', { class: 'fiche-conditions', dataset: { bloc: 'conditions' } },
        h('h3', { class: 'fiche-sous-titre' }, 'Conditions de paiement'),
        cond.length ? cond.map((l) => h('p', { class: 'fiche-condition' }, l)) : h('p', { class: 'fiche-condition fiche-vide', dataset: { valeur: 'aucune-condition' } }, 'Aucune condition')),
      h('div', { class: 'fiche-totaux' },
        h('dl', { class: 'fiche-liste-totaux' },
          h('div', { class: 'fiche-total-ligne' }, h('dt', {}, 'Total net HT'), h('dd', { dataset: { valeur: 'ht' } }, euros(t.ht))),
          h('div', { class: 'fiche-total-ligne' }, h('dt', {}, 'TVA'), h('dd', { dataset: { valeur: 'tva' } }, euros(t.tva))),
          h('div', { class: 'fiche-total-ligne' }, h('dt', {}, 'Total TTC'), h('dd', { dataset: { valeur: 'ttc' } }, euros(t.ttc)))),
        h('div', { class: 'fiche-net', dataset: { valeur: 'net-a-payer' } }, h('span', {}, 'NET À PAYER'), h('span', { dataset: { valeur: 'net' } }, euros(t.netAPayer))),
        tva));
  }

  function jauges(d) {
    const t = Fi.totauxFiche(d);
    const une = (nom, cle) => h('div', { class: 'fiche-jauge', 'aria-disabled': 'true', dataset: { jauge: cle, info: 'bientot' } },
      h('div', { class: 'fiche-jauge-titre' }, h('span', {}, nom), h('span', { class: 'bientot' }, 'Bientôt disponible')),
      h('div', { class: 'fiche-jauge-barre', role: 'presentation' }, h('span', { style: { width: '0%' } })),
      h('div', { class: 'fiche-jauge-pied' }, h('span', {}, '0 %'), h('span', {}, `${euros(0)} / ${euros(t.ttc)} `, h('small', {}, 'TTC'))));
    return h('section', { class: 'fiche-carte fiche-jauges', dataset: { bloc: 'jauges' } }, une('Facturation', 'facturation'), une('Paiement', 'paiement'));
  }

  function onglets(liste, actif, surChoix, nom) {
    return h('div', { class: 'fiche-onglets', role: 'tablist', 'aria-label': nom }, liste.map(([cle, libelle]) => h('button', {
      type: 'button', role: 'tab', class: `fiche-onglet${actif === cle ? ' actif' : ''}`, 'aria-selected': String(actif === cle), dataset: { onglet: cle }, onclick: () => surChoix(cle),
    }, libelle)));
  }

  function documentsLies(d) {
    return h('section', { class: 'fiche-carte fiche-bloc-liste', dataset: { bloc: 'documents' } },
      h('div', { class: 'fiche-bloc-tete' }, h('h3', { class: 'fiche-sous-titre' }, 'Documents liés'),
        onglets(DOCUMENTS, ongletDocs, (c) => { ongletDocs = c; maj(true); }, 'Type de document')),
      indicateurPdf(d, { apres: () => maj(true) }) ? h('p', { class: 'fiche-pdf', dataset: { valeur: 'pdf-devis' } }, indicateurPdf(d, { apres: () => maj(true) })) : null,
      h('p', { class: 'fiche-vide fiche-vide-grand', dataset: { valeur: 'aucun-document' } }, 'Aucun document'));
  }

  function ventilation(d) {
    const vent = Fi.ventilationParFamille(d, D.etat.articles, D.etat.familles);
    const lignes = Fi.lignesVentilation(vent, ongletVent);
    const total = vent.total[Fi.ONGLETS_VENTILATION.find((o) => o.id === ongletVent)?.cle ?? 'ht'];
    const corpsTableau = lignes.length
      ? h('table', { class: 'fiche-ventilation', dataset: { valeur: 'ventilation' } },
        h('thead', {}, h('tr', {}, h('th', { scope: 'col' }, 'Famille'), h('th', { scope: 'col', class: 'montant' }, 'Montant'), h('th', { scope: 'col', class: 'montant' }, 'Part'))),
        h('tbody', {}, lignes.map((l) => h('tr', { dataset: { famille: l.id } }, h('td', {}, l.nom), h('td', { class: 'montant' }, euros(l.montant)), h('td', { class: 'montant' }, pct(l.part))))),
        h('tfoot', {}, h('tr', {}, h('th', { scope: 'row' }, 'Total'), h('td', { class: 'montant', dataset: { valeur: 'total-ventilation' } }, euros(total)), h('td', { class: 'montant' }, '100 %'))))
      : h('p', { class: 'fiche-vide fiche-vide-grand', dataset: { valeur: 'aucun-resultat' } }, 'Aucun résultat');
    return h('section', { class: 'fiche-carte fiche-bloc-liste', dataset: { bloc: 'ventilation' } },
      h('div', { class: 'fiche-bloc-tete' }, h('h3', { class: 'fiche-sous-titre' }, 'Ventilation'),
        onglets(Fi.ONGLETS_VENTILATION.map((o) => [o.id, o.libelle]), ongletVent, (c) => { ongletVent = c; maj(true); }, 'Type de total')),
      corpsTableau,
      lignes.length && vent.remiseHt > 0 ? h('p', { class: 'texte-discret' }, `Montants avant la remise de ${euros(vent.remiseHt)} HT.`) : null,
      lignes.length && ongletVent === 'marge' ? h('p', { class: 'texte-discret' }, 'La marge brute n’est jamais montrée au client.') : null);
  }

  function contenu(d, maintenant) {
    return [entete(d), h('div', { class: 'fiche-blocs' }, identite(d, maintenant), conditionsEtTotaux(d), jauges(d), documentsLies(d), ventilation(d))];
  }

  return { afficher, fermer: () => afficher(null), maj: () => maj(false), detruire: () => { id = null; demonter(); }, ouverte: ouvert };
}
