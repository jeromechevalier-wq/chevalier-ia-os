// Saisie des adresses d'un devis « comme dans Gmail » : une ligne « À » avec des puces (croix pour retirer), un lien « Cc » qui ouvre la ligne Copie.
// Une adresse s'ajoute avec Entrée, virgule, point-virgule, espace ou en quittant le champ ; on peut en coller plusieurs ; Retour arrière sur un champ vide retire la dernière puce.
// UN SEUL composant pour la fenêtre « Préparer l'e-mail » et les blocs de l'éditeur (04/11/2026). Il n'écrit rien lui-même : `lire` / `ecrire` donnent la liste, `refus` donne les règles de l'appelant.
import { h, icone } from '../../os/ui.js';
import { ajouterPlusieurs, filtrerSuggestions } from './saisie-adresses-logique.js';

const LIGNES = {
  destinataires: { libelle: 'À', mot: 'destinataire', aria: 'Ajouter un destinataire' },
  copie: { libelle: 'Cc', mot: 'copie', aria: 'Ajouter une adresse en copie' },
};
let compteur = 0;

/**
 * @param {object} o
 *  - lire(cle) : liste d'adresses (textes) de 'destinataires' | 'copie' ; ecrire(cle, liste) ; surChangement(cle) : après un ajout ou un retrait
 *  - refus(cle, adresse, listeCourante, autreListe) : message de refus ou null
 *  - plafond(cle) : { max, texte } ; suggestions() : adresses proposées
 *  - suffixe : ajouté aux noms `data-…` quand deux saisies peuvent être à l'écran (la fenêtre au-dessus de l'éditeur)
 *  - apresDessin(element) : appelé après chaque dessin (l'éditeur y verrouille la lecture seule)
 *  - messageFixe() : { texte, id, erreur } affiché sous « À » quand la liste est vide (l'adresse du client est déjà en copie), ou null
 */
export function saisieAdresses({ lire, ecrire, surChangement = () => {}, refus, plafond, suggestions = () => [], suffixe = '', apresDessin = () => {}, messageFixe = () => null }) {
  const uid = `adr-${++compteur}`;
  let copieOuverte = false;
  let inactif = false;
  const lignes = {};
  const racine = h('div', { class: 'saisie-adresses', dataset: { zone: `adresses${suffixe}` } });

  function creerLigne(cle) {
    const cfg = LIGNES[cle];
    const autre = cle === 'copie' ? 'destinataires' : 'copie';
    const puces = h('ul', { class: 'puces-adresses' });
    const idListe = `${uid}-${cle}-suggestions`;
    const champ = h('input', { class: 'champ-adresse', type: 'text', inputmode: 'email', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', list: idListe, 'aria-label': cfg.aria, dataset: { champ: `${cfg.mot}${suffixe}` } });
    const options = h('datalist', { id: idListe });
    const plein = h('p', { class: 'texte-discret plafond-adresses', hidden: true, dataset: { valeur: `plafond-${cfg.mot}${suffixe}` } });
    const erreur = h('p', { class: 'erreur', id: `${uid}-${cle}-erreur`, role: 'alert', hidden: true, dataset: { erreur: `${cfg.mot}${suffixe}` } });
    const fixe = h('p', { class: 'erreur', role: 'alert', hidden: true });
    const montrer = (texte) => { erreur.textContent = texte || ''; erreur.hidden = !texte; champ.setAttribute('aria-invalid', texte ? 'true' : 'false'); if (texte) champ.setAttribute('aria-describedby', erreur.id); else champ.removeAttribute('aria-describedby'); };

    /** Ajoute ce qui est dans le champ ; vrai si tout est passé (ou si le champ était vide). Un refus laisse l'adresse refusée dans le champ, avec le message dessous. */
    function valider() {
      if (!champ.value.trim()) { champ.value = ''; return true; }
      const r = ajouterPlusieurs(lire(cle), champ.value, (a, courante) => refus(cle, a, courante, lire(autre)));
      if (r.ajoutees.length) { ecrire(cle, r.liste); surChangement(cle); }
      if (champ.value !== r.reste) champ.value = r.reste; // sans réassigner inutilement : le curseur ne saute pas
      longueurAvant = champ.value.length;
      montrer(r.erreur);
      dessiner();
      return !r.erreur;
    }
    function retirer(adresse) {
      ecrire(cle, lire(cle).filter((a) => a !== adresse));
      surChangement(cle); // le motif d'un refus en cours reste affiché : il part quand le texte change
      dessiner();
      champ.focus();
    }
    champ.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); valider(); }
      else if (e.key === ',' || e.key === ';') { e.preventDefault(); valider(); }
      else if (e.key === 'Backspace' && !champ.value && lire(cle).length) { const l = lire(cle); retirer(l[l.length - 1]); }
    });
    let longueurAvant = 0; // taille du champ avant la frappe : un gros saut = collage
    champ.addEventListener('input', (e) => {
      montrer('');
      const insereDUnCoup = champ.value.length - longueurAvant > 1; // collage, ou choix dans la liste du navigateur
      const colle = e.inputType === 'insertFromPaste' || e.inputType === 'insertFromDrop' || insereDUnCoup;
      // Choix dans la liste de suggestions : le texte inséré d'un coup est exactement une suggestion (pas `insertReplacementText`, que l'autocorrection d'un téléphone déclenche aussi).
      const choisiDansLaListe = insereDUnCoup && suggestions().some((x) => String(x).trim().toLowerCase() === champ.value.trim().toLowerCase());
      // Seulement quand un séparateur vient d'être tapé ou qu'on colle : un texte refusé laissé dans le champ (avec un espace) ne se revalide pas à chaque frappe.
      const doitValider = choisiDansLaListe || /[\s,;]$/.test(champ.value) || (colle && /[\s,;]/.test(champ.value));
      longueurAvant = champ.value.length;
      if (doitValider) valider();
    });
    champ.addEventListener('blur', () => { if (champ.value.trim()) valider(); });

    function dessinerLigne() {
      const liste = lire(cle);
      const max = plafond(cle);
      puces.replaceChildren(...liste.map((adresse) => h('li', { class: 'puce-adresse', dataset: { adresse } },
        h('span', {}, adresse),
        h('button', { type: 'button', class: 'bouton-icone puce-adresse-croix', 'aria-label': `Retirer ${adresse}`, dataset: { action: `retirer-${cfg.mot}${suffixe}` }, disabled: inactif || null,
          // Pas de perte de focus du champ au clic sur la croix : sinon la sortie du champ redessine la ligne avant la fin du clic.
          onpointerdown: (e) => e.preventDefault(), onmousedown: (e) => e.preventDefault(), onclick: () => retirer(adresse) }, icone('x', { taille: 14 })))));
      const rempli = liste.length >= max.max;
      champ.hidden = rempli;
      plein.hidden = !rempli;
      plein.textContent = max.texte;
      champ.disabled = inactif;
      options.replaceChildren(...filtrerSuggestions(suggestions(), [...liste, ...lire(autre)]).map((s) => h('option', { value: s })));
      if (cle === 'destinataires') {
        const m = !liste.length ? messageFixe() : null;
        if (m) { fixe.textContent = m.texte; fixe.id = m.id ?? ''; fixe.dataset.erreur = m.erreur ?? ''; fixe.hidden = false; if (!fixe.isConnected) plein.after(fixe); }
        else fixe.remove(); // absent (pas seulement caché) quand il n'y a rien à dire
      }
    }
    const zoneSaisie = h('div', { class: 'zone-adresses' }, puces, champ, options);
    const etiquette = h('label', { class: 'etiquette etiquette-adresses', for: `${uid}-${cle}` }, cfg.libelle);
    champ.id = `${uid}-${cle}`;
    const lienCc = cle === 'destinataires'
      ? h('button', { type: 'button', class: 'lien-cc', dataset: { action: `ajouter-copie${suffixe}` }, onpointerdown: (e) => e.preventDefault(), onmousedown: (e) => e.preventDefault(),
        onclick: () => { copieOuverte = true; dessiner(); lignes.copie?.champ.focus(); } }, 'Cc')
      : null;
    const ligne = h('div', { class: 'ligne-adresses' }, etiquette, zoneSaisie, lienCc);
    const bloc = h('div', { class: 'bloc-ligne-adresses', dataset: { zone: `${cle}${suffixe}` } }, ligne, plein, erreur);
    return { bloc, ligne, champ, lienCc, valider, dessinerLigne };
  }

  function dessiner() {
    const copieNonVide = lire('copie').length > 0;
    if (copieNonVide) copieOuverte = true;
    for (const cle of ['destinataires', 'copie']) lignes[cle].dessinerLigne();
    lignes.copie.bloc.hidden = !copieOuverte;
    lignes.destinataires.lienCc.hidden = copieOuverte;
    lignes.destinataires.lienCc.disabled = inactif || null;
    apresDessin(racine);
  }
  for (const cle of ['destinataires', 'copie']) lignes[cle] = creerLigne(cle);
  racine.append(lignes.destinataires.bloc, lignes.copie.bloc);
  dessiner();

  return {
    element: racine,
    dessiner,
    /** Ajoute ce qui est tapé dans les deux champs ; faux si une adresse est refusée (le message est affiché, la fenêtre reste ouverte). */
    valider: () => { const a = lignes.destinataires.valider(); const b = lignes.copie.valider(); return a && b; },
    focus: () => lignes.destinataires.champ.focus(),
    desactiver: (v) => { inactif = Boolean(v); dessiner(); },
    champs: () => [lignes.destinataires.champ, lignes.copie.champ],
  };
}
