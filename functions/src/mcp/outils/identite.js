import { VERSION_SERVEUR as version } from '../../version.js';

const NOM_PAR_DEFAUT = 'chevalier-ia-os';

export const qui_suis_je = {
  nom: 'qui_suis_je',
  profils: ['lecteur', 'bibliothecaire', 'claude-code'],
  description: 'Indique qui est connecté (acteur, profil), les outils autorisés pour ce jeton et la version du serveur.',
  async executer({ acteur, profil, jeton, outilsAutorises, nomServeur = NOM_PAR_DEFAUT }) {
    return { acteur, profil, jeton, outils: outilsAutorises, serveur: { nom: nomServeur, version } };
  },
};
