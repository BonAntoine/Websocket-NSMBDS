import type { GameId } from '@nsmb/shared';
import type { MiniGame } from './types';
import { wanted } from './wanted';

export const games: Record<GameId, MiniGame> = { wanted };
