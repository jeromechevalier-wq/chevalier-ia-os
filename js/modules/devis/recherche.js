// Recherche globale (barre du haut) du module Devis : un résultat ouvre l'éditeur du devis (devis/editeur/<id>).
// Rôle distinct du champ de la liste des devis : la barre du haut OUVRE un résultat, le champ de la liste FILTRE la liste.
import * as CRM from '../crm/donnees.js';
import * as D from './donnees.js';
import { rechercherSuggestions } from '../crm/logique.js';

/** Client (organisation, sinon personne) et affaire d'un devis, lus dans le CRM. */
function nomsDuDevis(d) {
  const aff = d.affaireId ? CRM.affaire(d.affaireId) : null;
  const org = (d.organisationId && CRM.organisation(d.organisationId)) || (aff?.organisationId && CRM.organisation(aff.organisationId)) || null;
  const pers = (d.personneId && CRM.personne(d.personneId)) || (aff?.personneId && CRM.personne(aff.personneId)) || null;
  return { client: org?.nom || pers?.nom || '', affaire: aff?.titre || '' };
}

/** { groupes: [{ titre: 'Devis', resultats }] } : numéro, nom du client et affaire (3 lettres au moins). Ni devis archivés, ni anciennes versions remplacées. */
export function rechercherDevis(saisie) {
  const elements = D.etat.devis.filter((d) => d.archive !== true && d.statut !== 'remplace').map((d) => {
    const n = nomsDuDevis(d);
    return { id: d.id, libelle: d.numero || 'Brouillon', sousTitre: [n.client, n.affaire].filter(Boolean).join(' · '), extra: [n.client, n.affaire].filter(Boolean), chemin: `devis/editeur/${d.id}` };
  });
  const resultats = rechercherSuggestions(saisie, elements, {}).resultats;
  return { groupes: resultats.length ? [{ titre: 'Devis', resultats }] : [] };
}
