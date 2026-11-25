// Fenêtre d'un chantier (création ou modification) du module Achats « Chantiers » (24/11/2026, PR 6) : le formulaire, et en modification les chiffres du budget
// (budget, accepté, en attente, reste, part du budget) tels que la base les donne. Aucun appel réseau ici : `enregistrer(champs)` est donné par l'écran et LÈVE une erreur
// (message du serveur, tel quel) si l'écriture est refusée : la fenêtre reste alors ouverte avec ce message.
// Le code est attribué par la base s'il reste vide à la création ; la date de fin réelle est remplie par la base (« terminé ») et seulement affichée.
import { h, dialogue } from '../../os/ui.js';
import { CHAMPS_VIDES, STATUTS_CHANTIER, champsDepuis, verifierChantier, dateFr, lignesChiffres, largeurBarre, libelleNiveau, MESSAGE_ERREUR_PAR_DEFAUT } from './logique.js';

/** Bloc des chiffres du budget (modification seulement). `chiffres` : la ligne de la vue de la base pour ce chantier, ou null ; `disponible` : la lecture des chiffres a réussi. */
export function blocChiffres({ chiffres, disponible }) {
  const lignes = lignesChiffres(chiffres);
  if (!lignes) {
    return h('p', { class: 'aide', role: 'status', dataset: { role: 'chantier-chiffres', etat: disponible ? 'vide' : 'indisponible' } },
      disponible ? 'Aucune facture n’est encore rattachée à ce chantier : les chiffres du budget apparaîtront avec la première.' : 'Les chiffres du budget ne sont pas disponibles pour l’instant. Tu peux quand même modifier le chantier.');
  }
  const largeur = largeurBarre(chiffres);
  return h('section', { class: 'chantier-chiffres', dataset: { role: 'chantier-chiffres', etat: 'ok', niveau: chiffres.niveau ?? '' }, 'aria-label': 'Chiffres du budget' },
    h('dl', { class: 'chantier-chiffres-liste' }, lignes.map((l) => h('div', { class: 'chantier-chiffre', dataset: { chiffre: l.id } }, h('dt', {}, l.libelle), h('dd', {}, l.valeur)))),
    largeur === null ? null : h('div', { class: 'chantier-barre', role: 'img', 'aria-label': `${lignes.find((l) => l.id === 'pct').valeur} du budget accepté` }, h('span', { class: `chantier-barre-remplie niveau-${chiffres.niveau ?? 'ok'}`, style: { width: `${largeur}%` } })),
    libelleNiveau(chiffres.niveau) ? h('p', { class: 'aide' }, libelleNiveau(chiffres.niveau)) : null);
}

/**
 * Ouvre la fenêtre. `chantier` : null = création. Renvoie une promesse : true si le chantier a été enregistré, sinon false (fermée).
 * @param {{ chantier: object | null, chiffres?: object | null, chiffresDisponibles?: boolean, enregistrer: (champs: object) => Promise<void> }} p
 */
export async function fenetreChantier({ chantier, chiffres = null, chiffresDisponibles = false, enregistrer }) {
  const creation = chantier === null;
  const c = { ...(creation ? CHAMPS_VIDES : champsDepuis(chantier)) };
  let enCours = false;
  const erreur = h('p', { class: 'erreur', role: 'alert', hidden: true, dataset: { role: 'chantier-erreur' } });
  const probleme = h('p', { class: 'aide', role: 'status', hidden: true, dataset: { role: 'chantier-probleme' } });
  let bouton = null;

  const maj = () => {
    const p = verifierChantier(c, creation);
    // Le message de forme ne s'affiche qu'une fois le nom saisi (un champ vide n'est pas une faute).
    probleme.hidden = !p || c.nom.trim() === '';
    probleme.textContent = p && c.nom.trim() !== '' ? p : '';
    if (bouton) {
      const bloque = enCours || Boolean(p);
      bouton.disabled = bloque;
      bouton.classList.toggle('bouton-principal', !bloque);
      bouton.classList.toggle('bouton-secondaire', bloque);
    }
  };
  const saisie = (cle) => (e) => { c[cle] = e.target.value; erreur.hidden = true; maj(); };
  const champ = (cle, etiquette, attrs = {}, obligatoire = false) => h('label', { class: 'bloc-champ' },
    h('span', { class: 'etiquette' }, etiquette, obligatoire ? h('span', { class: 'obligatoire' }, ' *') : null),
    h('input', { class: 'champ', type: 'text', autocomplete: 'off', value: c[cle], dataset: { champ: cle }, oninput: saisie(cle), ...attrs }));

  const statut = h('select', { class: 'champ', dataset: { champ: 'statut' }, onchange: saisie('statut') },
    STATUTS_CHANTIER.map((s) => h('option', { value: s.id, selected: s.id === c.statut }, s.libelle)));

  const formulaire = h('form', { class: 'formulaire-chantier', dataset: { role: 'formulaire-chantier' }, onsubmit: (e) => { e.preventDefault(); bouton?.click(); } },
    creation ? null : blocChiffres({ chiffres, disponible: chiffresDisponibles }),
    champ('nom', 'Nom du chantier', {}, true),
    h('div', { class: 'groupe-deux' },
      champ('code', 'Code', creation ? { placeholder: 'Attribué automatiquement (CH-0001…)' } : {}),
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Statut'), statut)),
    champ('client', 'Client'),
    champ('adresse', 'Adresse'),
    champ('budget_ht', 'Budget HT (€)', { inputMode: 'decimal', placeholder: 'Facultatif' }),
    h('div', { class: 'groupe-deux' },
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Date de début'), h('input', { class: 'champ', type: 'date', value: c.date_debut, dataset: { champ: 'date_debut' }, oninput: saisie('date_debut') })),
      h('label', { class: 'bloc-champ' }, h('span', { class: 'etiquette' }, 'Date de fin prévue'), h('input', { class: 'champ', type: 'date', value: c.date_fin_prevue, dataset: { champ: 'date_fin_prevue' }, oninput: saisie('date_fin_prevue') }))),
    !creation && chantier.date_fin_reelle ? h('p', { class: 'aide' }, `Fin réelle : ${dateFr(chantier.date_fin_reelle)} (remplie automatiquement quand le chantier passe à « Terminé »).`) : null,
    probleme, erreur);

  const r = await dialogue({
    titre: creation ? 'Nouveau chantier' : 'Modifier le chantier',
    classe: 'dialogue-formulaire dialogue-chantier',
    contenu: formulaire,
    peutFermer: () => !enCours,
    boutons: [
      { libelle: 'Annuler', valeur: false },
      {
        libelle: creation ? 'Créer le chantier' : 'Enregistrer', valeur: true, style: 'principal',
        avantFermeture: async () => {
          if (enCours || verifierChantier(c, creation)) return false;
          enCours = true; erreur.hidden = true; maj();
          try { await enregistrer({ ...c }); return true; } catch (e) {
            erreur.textContent = e instanceof Error && e.message ? e.message : MESSAGE_ERREUR_PAR_DEFAUT;
            erreur.hidden = false;
            return false;
          } finally { enCours = false; maj(); }
        },
      },
    ],
    auMontage: ({ boutons }) => { bouton = boutons[1]; bouton.dataset.action = 'enregistrer-chantier'; maj(); },
  });
  return r === true;
}
