// K2 (23/10/2026) : dans un projet, ce qu'on appelait « tâche » s'appelle « livrable ». Le mot « Tâche » reste pour le TYPE D'ACTIVITÉ (pastille « Tâche »).
// Test statique (node --test, sans navigateur) : on lit les chaînes AFFICHÉES de js/modules/projets/*.js et js/modules/crm/*.js (jamais les commentaires)
// et on échoue si l'une dit « tâche » à propos d'un livrable. Les identifiants techniques (classes CSS `tache-titre`, `data-action="faire-tache"`,
// collection `projets_taches`, type d'activité `tache`) ne contiennent jamais d'accent : seul « tâche » avec accent, ou une phrase française avec
// « tache » sans accent, est considéré comme du texte affiché.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const racine = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Extrait les chaînes d'un fichier JavaScript : '...', "...", et la partie texte des gabarits `...${...}...`. Les commentaires sont ignorés.
 * Petit lecteur maison (aucune dépendance) ; une barre oblique après `( , = : [ ! & | ? { } ;` ou `return` ouvre une expression régulière.
 */
export function chainesDe(source) {
  const sortie = [];
  let i = 0;
  let dernier = ''; // dernier caractère significatif hors espace
  let dernierMot = '';
  const pileGabarits = []; // niveau d'accolades ouvertes dans chaque `${`
  let accolades = 0;
  const ligneDe = (pos) => source.slice(0, pos).split('\n').length;
  function lireGabarit(debut) {
    let texte = '';
    while (i < source.length) {
      const c = source[i];
      if (c === '\\') { texte += source[i] + (source[i + 1] ?? ''); i += 2; continue; }
      if (c === '`') { i++; sortie.push({ texte, ligne: ligneDe(debut) }); return false; }
      if (c === '$' && source[i + 1] === '{') { i += 2; sortie.push({ texte, ligne: ligneDe(debut) }); pileGabarits.push(accolades); accolades = 0; return true; }
      texte += c; i++;
    }
    return false;
  }
  while (i < source.length) {
    const c = source[i];
    const suivant = source[i + 1];
    if (c === '/' && suivant === '/') { while (i < source.length && source[i] !== '\n') i++; continue; }
    if (c === '/' && suivant === '*') { i = source.indexOf('*/', i + 2); i = i < 0 ? source.length : i + 2; continue; }
    if (c === '\'' || c === '"') {
      const debut = i; let texte = ''; i++;
      while (i < source.length && source[i] !== c && source[i] !== '\n') {
        if (source[i] === '\\') { texte += source[i] + (source[i + 1] ?? ''); i += 2; } else { texte += source[i]; i++; }
      }
      i++;
      sortie.push({ texte, ligne: ligneDe(debut) }); dernier = c; dernierMot = '';
      continue;
    }
    if (c === '`') { i++; const debut = i; if (lireGabarit(debut)) { dernier = '{'; } else dernier = '`'; dernierMot = ''; continue; }
    if (c === '{') { accolades++; dernier = c; i++; continue; }
    if (c === '}') {
      if (accolades === 0 && pileGabarits.length) { accolades = pileGabarits.pop(); i++; const debut = i; if (lireGabarit(debut)) { dernier = '{'; } else dernier = '`'; continue; }
      accolades--; dernier = c; i++; continue;
    }
    if (c === '/') {
      const debutRegex = dernier === '' || '(,=:[!&|?{};'.includes(dernier) || ['return', 'typeof', 'case'].includes(dernierMot);
      if (debutRegex) {
        i++; let dansClasse = false;
        while (i < source.length && source[i] !== '\n') {
          if (source[i] === '\\') { i += 2; continue; }
          if (source[i] === '[') dansClasse = true; else if (source[i] === ']') dansClasse = false;
          else if (source[i] === '/' && !dansClasse) break;
          i++;
        }
        i++; while (/[a-z]/.test(source[i] ?? '')) i++;
        dernier = ')'; dernierMot = '';
        continue;
      }
    }
    if (/\s/.test(c)) { i++; continue; }
    if (/[A-Za-z_$]/.test(c)) { let mot = ''; while (i < source.length && /[\w$]/.test(source[i])) mot += source[i++]; dernier = 'a'; dernierMot = mot; continue; }
    dernier = c; dernierMot = ''; i++;
  }
  return sortie;
}

/**
 * Liste blanche (explicite) : le TYPE D'ACTIVITÉ « Tâche ».
 *  - la chaîne exacte « Tâche » (libellé et titre de la pastille dans `TYPES_ACTIVITE`, libellé de repli de `libelleTypeActivite`) ;
 *  - rien d'autre. Un message de projet qui dirait « tâche » (même sur une activité) doit passer par ce fichier pour être justifié.
 */
const LISTE_BLANCHE = [
  { fichier: 'js/modules/crm/logique.js', texte: 'Tâche' }, // type d'activité : { id: 'tache', libelle: 'Tâche', titre: 'Tâche' } et libellé de repli
];

const AFFICHE_TACHE = /t[âÂ]ches?/i;
const PHRASE_SANS_ACCENT = /\b(une|la|les|des|cette|nouvelle|ajouter|supprimer|aucune|ses|du|de la|de)\s+taches?\b/i;

const dossiers = ['js/modules/projets', 'js/modules/crm'];
const fichiers = dossiers.flatMap((d) => readdirSync(join(racine, d)).filter((f) => f.endsWith('.js')).map((f) => `${d}/${f}`));

function fautes() {
  const trouvees = [];
  for (const f of fichiers) {
    for (const { texte, ligne } of chainesDe(readFileSync(join(racine, f), 'utf8'))) {
      if (!AFFICHE_TACHE.test(texte) && !PHRASE_SANS_ACCENT.test(texte)) continue;
      if (LISTE_BLANCHE.some((b) => b.fichier === f && b.texte === texte)) continue;
      trouvees.push(`${f}:${ligne} « ${texte.slice(0, 80)} »`);
    }
  }
  return trouvees;
}

describe('K2 vocabulaire des livrables', () => {
  test('K2 le lecteur de chaînes ignore les commentaires, lit les gabarits et les expressions régulières', () => {
    const exemple = [
      "// une tâche en commentaire",
      "const a = 'Aucune tâche'; /* tâche */",
      "const b = `Ajouter ${x ? 'une tâche' : \"ok\"} fini`;",
      "const r = /['\"]tâche/.test(s) ? 'bon' : 'x';",
    ].join('\n');
    const textes = chainesDe(exemple).map((c) => c.texte);
    assert.deepEqual(textes, ['Aucune tâche', 'Ajouter ', 'une tâche', 'ok', ' fini', 'bon', 'x']);
  });

  test('K2 aucun texte affiché des projets et du CRM ne parle de « tâche » pour un livrable (hors type d’activité « Tâche »)', () => {
    assert.ok(fichiers.length > 20, 'les dossiers sont bien lus');
    assert.deepEqual(fautes(), []);
  });

  test('K2 la liste blanche ne sert qu’au type d’activité : « Tâche » reste bien le nom de la pastille', () => {
    const logique = readFileSync(join(racine, 'js/modules/crm/logique.js'), 'utf8');
    assert.match(logique, /\{ id: 'tache', libelle: 'Tâche', titre: 'Tâche' \}/);
  });

  test('K2 un texte fautif serait bien trouvé (le test ne passe pas à vide)', () => {
    const faux = chainesDe("h('p', {}, 'Aucune tâche pour le moment.'); const t = `Ajouter une tache ${x}`;").map((c) => c.texte);
    assert.ok(faux.some((t) => AFFICHE_TACHE.test(t)));
    assert.ok(faux.some((t) => PHRASE_SANS_ACCENT.test(t)));
  });
});
