import type { GameId } from '@nsmb/shared';
import type { MiniGame } from './types';
import { ghosts } from './ghosts';
import { snowball } from './snowball';
import { wanted } from './wanted';

export const games: Record<GameId, MiniGame> = { wanted, ghosts, snowball };

/** Pour le menu du lobby : nom affiché et clé de texture de l'icône (manifeste). */
export const gameInfo: Record<GameId, { name: string; rules: string; icon: string }> = {
  wanted: {
    name: 'Wanted!',
    rules: 'Trouve le personnage recherché dans la foule. Le plus rapide marque 1 point.',
    icon: 'menu.wanted',
  },
  ghosts: {
    name: 'Cache-cache fantômes',
    rules: "Lumière éteinte : frotte l'écran pour débusquer les fantômes. 1 point par fantôme.",
    icon: 'menu.ghosts',
  },
  snowball: {
    name: 'Descente en boule de neige',
    rules: 'Fais glisser ton doigt pour pousser ta boule jusqu\'en bas. Elle grossit en roulant !',
    icon: 'menu.snowball',
  },
};
