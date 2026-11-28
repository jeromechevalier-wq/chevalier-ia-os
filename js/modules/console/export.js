// Réglages > Console > « Sauvegarde » : un fichier JSON avec les vérifications du filet de sécurité, les versions des bâtiments (phase 2, 28/11/2026) et le registre des bâtiments
// avec leurs relevés (phase 2, PR 2 : seulement ce que l'écran montre, jamais le projet à lire d'une maison). Lecture seule (règle du 27/10/2026).
import { h, icone, toast } from '../../os/ui.js';
import { telecharger } from '../crm/composants.js';
import * as L from '../crm/logique.js';
import * as D from './donnees.js';
import * as LC from './logique.js';

/** Télécharge les données de la Console. `lire` se remplace dans les tests. Renvoie true si le fichier est parti. */
export async function exporterConsole({ lire = D.lireToutPourExport, lireVersions = D.lireVersions, lireBatiments = D.lireBatiments } = {}) {
  try {
    const collections = await lire();
    // Versions des bâtiments (lues par `consoleVersions`) : une lecture qui échoue n'empêche pas l'export du filet (liste vide).
    let versions = [];
    try { versions = (await lireVersions())?.batiments ?? []; } catch (e) { console.warn(e); }
    collections.console_versions = Array.isArray(versions) ? versions : [];
    // Registre des bâtiments et relevés (lus par `consoleBatiments`) : même règle, une lecture en échec donne des listes vides.
    let batiments = null;
    try { batiments = await lireBatiments(); } catch (e) { console.warn(e); }
    const r = LC.reponseBatiments(batiments);
    // Seulement ce que l'écran montre (relecture Fable de la PR 771) : appartements = nom et modules (le nom vaut l'identifiant seulement quand il manque,
    // comme à l'écran) ; maisons = clé, nom, état, projets ; relevés passés par le même filtre que l'écran. Jamais le projet à lire d'une maison.
    collections.console_registre = [
      { cle: 'os', projets: r.os.projets },
      { cle: 'immeuble', projets: r.immeuble.projets, appartements: r.immeuble.appartements.map((a) => ({ nom: a.nom, modules: a.modules })), total_appartements: r.immeuble.total },
      ...r.maisons.map((m) => ({ cle: m.cle, nom: m.nom, etat: m.etat, projets: m.projets })),
    ];
    collections.console_releves = Object.entries(r.releves)
      .map(([cle, rel]) => [cle, LC.releveAffiche(rel)])
      .filter(([, rel]) => rel)
      .map(([cle, rel]) => ({ cle, ...rel }));
    const maintenant = new Date();
    telecharger(L.nomFichierExport(maintenant, 'console'), L.exportJson(collections, maintenant), 'application/json;charset=utf-8');
    toast('Sauvegarde téléchargée');
    return true;
  } catch (e) {
    console.warn(e);
    toast('Export impossible', { type: 'erreur' });
    return false;
  }
}

export function reglagesExportConsole(page) {
  page.append(h('section', { class: 'carte-section', id: 'reglages-export-console' },
    h('h2', {}, icone('download', { taille: 18 }), 'Sauvegarde'),
    h('p', { class: 'aide' }, 'Télécharge les vérifications du filet de sécurité, les versions des bâtiments, le registre des bâtiments et leurs relevés dans un fichier.'),
    h('div', { class: 'ligne-boutons' },
      h('button', { type: 'button', class: 'bouton bouton-secondaire', dataset: { action: 'exporter-console' }, onclick: () => exporterConsole() }, icone('download', { taille: 16 }), 'Exporter mes données'))));
}
