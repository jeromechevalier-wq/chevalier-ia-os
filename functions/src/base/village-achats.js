// Or du village, source « facture validée » (27/11/2026) : le serveur vérifie LUI-MÊME, dans la base Cloud SQL des achats de la maison, qu'une facture d'achat vient d'être acceptée.
// Maison seulement (ce dossier base/ n'est pas copié chez les clients). Lecture SEULE, par la bibliothèque de la porte (creerAccesBase, rôle de l'assistant, espace du SECRET) et le
// lecteur de l'assistant (table `factures` de LECTURES_ASSISTANT, colonnes nommées, tri obligatoire) : aucune requête SQL écrite à la main, aucune écriture, aucune table nouvelle.
// Maison sans base (le CRM de Jérôme aujourd'hui) : la configuration est absente, la réponse est « indisponible » et rien ne plante.
// Jamais le texte d'une erreur `pg`, jamais une valeur de la facture dans un journal : ce fichier ne journalise rien.
import { creerAccesBase } from './porte-base.js';
import { lecteurAssistant } from './assistant-achats.js';
import { fraisPourGain } from '../../partage/village-jeu-regles.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const COLONNES = ['id', 'statut', 'archivee_le', 'date_decision'];

/** Date de la base (Date de `pg` ou texte ISO) -> millisecondes ; null sinon. */
function enMs(v) {
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : null;
  if (typeof v === 'string') { const t = Date.parse(v); return Number.isFinite(t) ? t : null; }
  return null;
}

/** Rend `async (id, email) => 'acceptee' | 'autre' | 'indisponible'`. `lireConfiguration` lève (ConfigurationAbsente ou autre) quand la maison n'a pas de base. */
export function creerVerificateurAchat({ lireConfiguration, ouvrirConnexion, maintenant = Date.now }) {
  const acces = creerAccesBase({ ouvrirConnexion, maintenant });
  return async function verifierAchat(id, email) {
    if (typeof id !== 'string' || !UUID.test(id)) return 'autre';
    let config;
    try { config = await lireConfiguration(); } catch { return 'indisponible'; }
    try {
      const { lignes } = await acces.dansTransaction(config, { voie: 'assistant', utilisateur: String(email ?? '').toLowerCase() }, true,
        (cx, catalogue) => lecteurAssistant(cx, catalogue)('factures', { colonnes: COLONNES, filtres: [['id', `eq.${id}`]], tri: ['id'], limite: 1 }));
      const f = lignes[0];
      if (!f || f.statut !== 'acceptee' || (f.archivee_le !== null && f.archivee_le !== undefined && f.archivee_le !== '')) return 'autre';
      return fraisPourGain('facture-validee', enMs(f.date_decision), maintenant()) ? 'acceptee' : 'autre';
    } catch {
      return 'indisponible';
    }
  };
}
