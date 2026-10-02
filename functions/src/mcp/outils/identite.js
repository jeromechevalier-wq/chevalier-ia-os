import { readFileSync } from 'node:fs';

const { version } = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));

export const qui_suis_je = {
  nom: 'qui_suis_je',
  profils: ['lecteur', 'bibliothecaire', 'claude-code'],
  description: 'Indique qui est connecté (acteur, profil), les outils autorisés pour ce jeton et la version du serveur.',
  async executer({ acteur, profil, jeton, outilsAutorises }) {
    return { acteur, profil, jeton, outils: outilsAutorises, serveur: { nom: 'chevalier-ia-os', version } };
  },
};
