// Choix du client et de l'affaire d'un devis (décision de Jérôme, 30/10/2026) : règles PURES (aucun accès à Firebase ni au navigateur), testées dans tests/devis-client-devis.test.js.
// Fichier à part : editeur-logique.js est copié dans functions/partage/ (imports réécrits), il ne doit pas importer le CRM.
// Données SANS migration : organisation + contact = `organisationId` + `personneId` ensemble ; personne seule = `personneId` seul (le serveur lit déjà personneId comme « le contact »).
import { personnesDeLOrganisation } from '../crm/logique.js';
import { nomAffaireProposee } from './affaire-depuis-devis.js';

export const MESSAGE_SANS_AFFAIRE_CLIENT = 'Pas d’affaire pour ce client : crée-la avec « + Créer l’affaire » dans cette liste.';
export const PLACEHOLDER_AFFAIRE = 'Choisis ou crée une affaire';
export const MESSAGE_FINALISER_SANS_AFFAIRE = 'Choisis ou crée une affaire pour finaliser ce devis.'; // écran seulement : la phrase du serveur et de l'assistant (MESSAGE_AFFAIRE_MANQUANTE) ne change pas

const vide = (client) => !client?.organisationId && !client?.personneId;

/** Identifiant d'un résultat du champ unique : « personne:ID », « organisation:ID », « affaire:ID » ou « creer:personne:TEXTE » / « creer:organisation:TEXTE » (le texte peut contenir « : »). */
export function lireChoix(id) {
  const [type, ...reste] = String(id ?? '').split(':');
  if (type === 'creer') { const [genre, ...texte] = reste; return { type: 'creer', genre, texte: texte.join(':') }; }
  return { type, id: reste.join(':') };
}

/** Client d'une personne choisie : son organisation (par défaut) avec elle « à l'attention de », ou elle seule (`seule`). */
export function clientDePersonne(personne, { seule = false, organisationExiste = true } = {}) {
  return { organisationId: !seule && personne?.organisationId && organisationExiste ? personne.organisationId : null, personneId: personne?.id ?? null };
}
export const clientDOrganisation = (organisationId) => ({ organisationId: organisationId || null, personneId: null });
/** Client posé par une affaire : son organisation ET sa personne (« à l'attention de ») ; seulement ce qui existe encore (`existe(type, id)`). */
export function clientDAffaire(affaire, existe = () => true) {
  return {
    organisationId: affaire?.organisationId && existe('organisation', affaire.organisationId) ? affaire.organisationId : null,
    personneId: affaire?.personneId && existe('personne', affaire.personneId) ? affaire.personneId : null,
  };
}
export const memeClient = (a, b) => (a?.organisationId || null) === (b?.organisationId || null) && (a?.personneId || null) === (b?.personneId || null);

/**
 * Les affaires proposées pour un client : celles de l'organisation ET de ses personnes, ou celles de la personne ET de son organisation (même seule) ; null = pas de client, pas de filtre.
 * `affaires` et `personnes` : les fiches non archivées de l'espace.
 */
export function affairesDuClient(client, affaires, personnes) {
  if (vide(client)) return null;
  const personne = client.personneId ? (personnes || []).find((p) => p.id === client.personneId) : null;
  const organisations = new Set();
  const gens = new Set();
  if (client.personneId) gens.add(client.personneId);
  if (client.organisationId) {
    organisations.add(client.organisationId);
    for (const p of personnesDeLOrganisation(personnes || [], client.organisationId)) gens.add(p.id);
  } else if (personne?.organisationId) organisations.add(personne.organisationId);
  return (affaires || []).filter((a) => (a.organisationId && organisations.has(a.organisationId)) || (a.personneId && gens.has(a.personneId)));
}

/** Une affaire est « d'un autre client » si elle a un client et qu'il n'est pas celui du devis. Une affaire sans aucun client n'est celle de personne : elle ne gêne pas. */
export function affaireDuClient(affaire, client, affaires, personnes) {
  if (!affaire || vide(client)) return Boolean(affaire);
  if (!affaire.organisationId && !affaire.personneId) return true;
  return (affairesDuClient(client, affaires, personnes) || []).some((a) => a.id === affaire.id);
}

/** Les personnes proposées dans « à l'attention de » : celles de l'organisation, plus la personne déjà posée (celle d'une affaire peut venir d'ailleurs). */
export function personnesAttention(organisationId, personnes, personneId = null, toutes = personnes) {
  const liste = personnesDeLOrganisation(personnes || [], organisationId);
  const posee = personneId ? (toutes || []).find((p) => p.id === personneId) : null; // une personne archivée déjà posée reste affichée
  return posee && !liste.some((p) => p.id === posee.id) ? [...liste, posee] : liste;
}

/** E-mail repris pour le destinataire : celui de la personne « à l'attention de » s'il existe, sinon le premier e-mail de la fiche du client. */
export const emailDestinataire = (emailAttention, emailClient) => emailAttention || emailClient || '';

/** Phrase sous la ligne Affaire (« » = rien à dire). */
export function aideAffaire({ client, affaireId, nbAffaires }) {
  if (affaireId) return '';
  if (vide(client)) return 'Facultatif tant que le devis est un brouillon ; il en faut une pour finaliser.';
  return nbAffaires ? '' : MESSAGE_SANS_AFFAIRE_CLIENT;
}

/** Nom de l'affaire créée depuis la liste : ce qui est tapé, sinon le nom du devis, sinon « Affaire » + le client (organisation, sinon personne) ; vide si rien de tout cela. */
export function nomAffaireCreee(saisie, devis, { organisation = null, personne = null } = {}) {
  return String(saisie ?? '').replace(/\s+/g, ' ').trim() || nomAffaireProposee(devis, { organisation, personne });
}
