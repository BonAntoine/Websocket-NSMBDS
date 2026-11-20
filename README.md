# Mini-jeux multijoueurs (smartphone)

Mini-jeux 2 à 4 joueurs dans le navigateur, via des codes de room. Contexte et décisions : voir `CLAUDE.md`.

## Prérequis

- Node 22+ et pnpm (`corepack enable`, ou `npm i -g pnpm`).

## Commandes

| Commande | Effet |
|---|---|
| `pnpm install` | Installe tout le monorepo |
| `pnpm dev` | Serveur Node (3000) + Vite (5173, HMR, proxy `/socket.io`) |
| `pnpm build` | Build du client dans `client/dist/` |
| `pnpm start` | Prod : un seul process sur `PORT` (défaut 3000) qui sert `client/dist/` + socket.io |
| `pnpm check` | Typecheck (tsc + svelte-check) |

Tester sur téléphone en dev : `http://<IP-locale-du-PC>:5173`.

Pour jouer à deux sur le même PC : le `playerId` est en `localStorage`, donc utiliser
une fenêtre privée ou un autre navigateur pour le second joueur (deux onglets normaux = même joueur).

## Structure

```
shared/   PRNG (mulberry32), règles/constantes, types des événements socket
server/   HTTP + statiques + socket.io ; rooms en mémoire (rooms.ts)
client/
  src/screens/        écrans Svelte : Home, Lobby, Game, Results
  src/game/round.ts   déroulé d'une manche : écrans haut/bas, compte à rebours, "Go"
  src/games/          un dossier par mini-jeu (contrat dans games/types.ts)
  src/assets/         manifeste des graphismes (clé → forme / fichier / spritesheet)
  public/assets/      fichiers PNG/SVG/spritesheets
```

## Ajouter un mini-jeu

1. Créer `client/src/games/<nom>/index.ts` qui exporte un `MiniGame` (voir `games/types.ts`).
   Tout l'aléatoire passe par `mulberry32(seed)` de `@nsmb/shared`, jamais `Math.random()`.
2. Ajouter ses clés de textures dans `client/src/assets/manifest.ts`.
3. L'enregistrer dans `client/src/games/index.ts` et ajouter son id à `GameId` (`shared/src/events.ts`).

## Remplacer les graphismes

Déposer les fichiers dans `client/public/assets/`, puis changer les entrées du manifeste :
`{ file: 'perso.png' }` ou `{ sheet: 'persos.json', frame: 'perso.png' }`. Aucun code de jeu à modifier.

Déploiement : voir `DEPLOY.md`.
