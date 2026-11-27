// Fiche à deux colonnes du volet de « l'application Factures » (27/11/2026, règle de la maquette v3) : les libellés à gauche, les valeurs à droite.
// RÈGLE : en mode « Modifier », LA MISE EN PAGE NE BOUGE PAS. La colonne des libellés reste exactement à sa place ; chaque valeur modifiable devient un champ SUR PLACE,
// dans la même case (même largeur, même hauteur de ligne : la valeur lue et le champ ont la même boîte, voir css/achatsfactures-appli.css, `.af-valeur` et `.af-champ-fiche`).
// D'abord en lecture ; « Modifier » ; puis « Enregistrer » / « Annuler ». « Annuler » jette la saisie et rend les valeurs d'origine. Aucun appel réseau ici : `surEnregistrer` est donné.
import { h, icone, remplir } from '../../os/ui.js';

const MESSAGE_PAR_DEFAUT = 'Une erreur est survenue, réessaie dans un instant.';

/**
 * `lignes` : [{ cle, libelle, valeur (texte montré), saisie? (texte du champ ; défaut : valeur), modifiable?, placeholder?, classe? }].
 * `surEnregistrer(valeurs)` : reçoit { cle: texte } des lignes modifiables ; renvoie false pour rester en modification sans message (l'utilisateur a renoncé),
 * lève une erreur (message français) pour l'afficher sous la fiche. Après un succès, l'appelant redessine la fiche avec les nouvelles données.
 * `mode` : 'lecture' (défaut) ou 'creation' (tout de suite en saisie : « Annuler » appelle `surAnnuler`).
 * `actionsLecture` : boutons montrés en bas de la fiche en lecture, avant « Modifier » (par exemple « Signaler un changement d'IBAN »).
 * Clavier : « Modifier » pose le focus dans le premier champ ; « Annuler » le rend au bouton « Modifier ».
 * Renvoie { element, modifier(), enModification() }.
 */
export function creerFiche({ lignes, surEnregistrer = null, surAnnuler = null, mode = 'lecture', note = null, libelleEnregistrer = 'Enregistrer', actionsLecture = [] }) {
  const creation = mode === 'creation';
  let modification = creation;
  let occupe = false;
  const modifiables = lignes.filter((l) => l.modifiable);
  const dl = h('dl', { class: 'af-fiche-dl' });
  const erreur = h('p', { class: 'erreur', role: 'alert', hidden: true, dataset: { erreur: 'fiche' } });
  const bas = h('div', { class: 'af-fiche-bas' });
  const element = h('div', { class: 'af-fiche', dataset: { role: 'fiche', mode: modification ? 'modification' : 'lecture' } }, dl, note ? h('p', { class: 'aide af-fiche-note' }, note) : null, erreur, bas);
  let champs = new Map();

  const montrerErreur = (message) => { erreur.textContent = message ?? ''; erreur.hidden = !message; };

  function dessiner() {
    element.dataset.mode = modification ? 'modification' : 'lecture';
    champs = new Map();
    remplir(dl, lignes.map((l) => {
      let case_;
      if (modification && l.modifiable) {
        const champ = h('input', { type: 'text', class: `af-champ-fiche${l.classe ? ` ${l.classe}` : ''}`, value: l.saisie ?? (l.valeur === '—' ? '' : l.valeur), placeholder: l.placeholder ?? '', 'aria-label': l.libelle, autocomplete: 'off', spellcheck: false, dataset: { champ: l.cle },
          onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); void enregistrer(); } } });
        champs.set(l.cle, champ);
        case_ = champ;
      } else {
        case_ = h('span', { class: `af-valeur${l.classe ? ` ${l.classe}` : ''}`, title: typeof l.valeur === 'string' ? l.valeur : null, dataset: { valeur: l.cle } }, l.valeur);
      }
      return h('div', { class: 'af-fiche-ligne', dataset: { ligne: l.cle } }, h('dt', {}, l.libelle), h('dd', {}, case_));
    }));
    if (modification) {
      remplir(bas,
        h('button', { type: 'button', class: 'bouton bouton-secondaire', disabled: occupe, dataset: { action: 'annuler-fiche' }, onclick: annuler }, 'Annuler'),
        h('button', { type: 'button', class: 'bouton bouton-principal', disabled: occupe, dataset: { action: 'enregistrer-fiche' }, onclick: () => { void enregistrer(); } }, occupe ? 'Envoi…' : libelleEnregistrer));
    } else {
      remplir(bas, actionsLecture, modifiables.length && surEnregistrer
        ? h('button', { type: 'button', class: 'bouton bouton-principal', dataset: { action: 'modifier-fiche' }, onclick: modifier }, icone('pencil', { taille: 16 }), 'Modifier')
        : null);
    }
  }

  function modifier() {
    if (modification || !modifiables.length) return;
    modification = true; montrerErreur(null); dessiner();
    champs.values().next().value?.focus();
  }

  function annuler() {
    if (occupe) return;
    montrerErreur(null);
    if (creation) { surAnnuler?.(); return; }
    modification = false; dessiner(); // la saisie est jetée : les champs repartent des valeurs d'origine au prochain « Modifier »
    bas.querySelector('[data-action="modifier-fiche"]')?.focus();
    surAnnuler?.();
  }

  async function enregistrer() {
    if (occupe || !modification || !surEnregistrer) return; // double clic : un seul envoi
    const valeurs = Object.fromEntries([...champs].map(([cle, c]) => [cle, c.value.trim()]));
    occupe = true; montrerErreur(null);
    for (const b of bas.querySelectorAll('button')) b.disabled = true;
    for (const c of champs.values()) c.disabled = true;
    let reste = false;
    try { reste = (await surEnregistrer(valeurs)) === false; } catch (e) { reste = true; montrerErreur(e instanceof Error && e.message ? e.message : MESSAGE_PAR_DEFAUT); }
    occupe = false;
    if (!element.isConnected) return; // l'appelant a déjà redessiné la fiche avec les nouvelles données
    if (reste) { // on reste en modification, la saisie est gardée
      for (const b of bas.querySelectorAll('button')) b.disabled = false;
      for (const c of champs.values()) c.disabled = false;
      return;
    }
    if (!creation) { modification = false; dessiner(); }
  }

  dessiner();
  return { element, modifier, enModification: () => modification };
}
