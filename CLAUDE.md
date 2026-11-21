# Mini-jeux NSMB DS — contexte projet

Recréer des mini-jeux inspirés de New Super Mario Bros DS, jouables **sur smartphone dans le navigateur**, en multijoueur **en ligne** (2 à 8 joueurs, pas forcément sur le même réseau) via des **codes de room**.

**Règle n°1 : ne pas over-engineer.** Code minimaliste, lisible, maintenable. Pas de BDD, pas d'auth, pas de chat, pas d'abstraction "au cas où".

## Décisions prises

| Sujet | Décision |
|---|---|
| Rendu | **PixiJS** (2D). Three.js écarté pour l'instant. |
| Front | **Svelte** + Vite + TypeScript. Svelte uniquement pour les écrans hors jeu (accueil, saisie code, lobby, résultats). Le jeu vit dans le canvas Pixi. |
| Serveur | **Node + socket.io** seul (NestJS écarté : trop lourd pour le besoin). |
| Repo | Petit monorepo **pnpm workspaces** : `client/`, `server/`, `shared/`. |
| Joueurs | 2 à 8 par room (`MAX_PLAYERS`). Scores affichés sur 1 ligne jusqu'à 4 joueurs, 2 lignes au-delà. |
| Premier mini-jeu | **Wanted!** — sert aussi à poser la logique générale (rooms, manches, scores). |
| Graphismes | Formes simples pour prototyper, **pas d'assets Nintendo** (sprites/personnages). Doivent être remplaçables sans toucher au code (voir Assets). |
| Chat | Aucun, hors périmètre. |

## Environnement

- **Dev : Windows.** Scripts `package.json` compatibles Windows ET Linux (pas de `rm -rf`, `&&` bash-only, variables d'env à la Unix… utiliser des outils cross-platform si besoin).
- **Prod : serveur Debian perso, à domicile, connexion classique fibre haut débit**, joueurs quelque part en France → **latence variable**. Possible de demander à Antoine des tests pour mesurer la latence réelle si besoin.
- Tester sur téléphone en dev : ouvrir `http://<IP-locale-du-PC>:5173` (Vite avec `host: true`).

## Architecture réseau

Le serveur est un **chef d'orchestre**, pas un moteur de jeu :
- gère les rooms (création, join, départ, reconnexion) ;
- envoie à chaque manche un **seed** aléatoire + le signal de départ (chaque client lance son compte à rebours à réception) ;
- reçoit les résultats des clients et désigne le gagnant.

Chaque client fait **tourner le jeu en local**, à partir du seed partagé.

### Seed + PRNG (pas de synchronisation frame par frame)

- **PRNG** = *Pseudo-Random Number Generator* : fonction déterministe qui produit une suite d'apparence aléatoire à partir d'un seed. Même seed → même suite sur tous les appareils. Ex. *mulberry32* (~10 lignes), dans `shared/`. **Ne jamais utiliser `Math.random()` pour la logique de jeu** (non seedable) — uniquement le PRNG.
- Tout l'état d'une manche (composition de la foule, positions, trajectoires) est une **fonction pure de `(seed, temps écoulé depuis le Go)`**. Les personnages peuvent bouger : leur position se calcule, elle ne se transmet pas.
- Pourquoi pas de sync frame par frame : pas tant pour la bande passante que pour l'**équité** (avec une latence variable, chaque joueur verrait l'état avec un retard différent et toucherait des cibles déjà déplacées) et la **complexité** (interpolation, compensation de lag, paquets perdus). Un seul message par manche suffit.

### Équité malgré la latence variable

- Le serveur envoie le départ de niveau ; **chaque client lance sa propre intro / "Go" local** à réception.
- Chaque client mesure le **temps de réaction depuis son propre "Go"** et l'envoie au serveur. Un joueur qui reçoit le départ 200 ms plus tard démarre aussi son chrono 200 ms plus tard → aucune pénalité.
- **Échéance** : dès qu'un temps T arrive, le serveur le diffuse (`round:deadline`). Chaque client continue de jouer **jusqu'à T sur son propre chrono**, puis répond `null` s'il n'a pas trouvé. Un joueur en retard réseau n'est donc jamais coupé avant d'avoir eu le même temps.
- **Le serveur ne déclare jamais le gagnant au premier message reçu** : il attend les résultats de **tous** les joueurs connectés (avec un timeout pour gérer une déconnexion), puis compare les temps. Le premier message arrivé n'est pas forcément le plus rapide.
- **Triche acceptée** : un client pourrait mentir sur son temps. Partie entre amis → pas de protection anti-triche pour l'instant, ne pas en ajouter.

## Un seul processus Node en prod

- `vite build` produit `client/dist/` (fichiers statiques).
- Le serveur Node crée **un serveur HTTP** qui sert `client/dist/` ET sur lequel est branché socket.io (`/socket.io/`).
- Un seul port (ex. 3000), un seul service systemd, même origine → pas de CORS.
- **En dev** : Vite (5173, HMR) + serveur Node (3000) lancés par une seule commande ; Vite proxifie `/socket.io` (avec `ws: true`) vers 3000. Le code client est identique dev/prod.

## Rooms

- Code de **4 caractères**, alphabet sans ambiguïtés (pas de `0/O`, `1/I/L`), majuscules. ~1M combinaisons.
- Rooms **en mémoire** (`Map`), supprimées quand vides.
- **Reconnexion** : un `playerId` généré côté client et stocké en `localStorage` ; à la reconnexion (téléphone en veille), le client renvoie `playerId` + code de room pour retrouver sa place.
- Types des événements socket partagés dans `shared/` (client et serveur importent les mêmes).

## Format mobile

- **Portrait**, deux "écrans" empilés façon DS : écran du haut = infos (le personnage recherché, et en bas la barre des scores dessinée par le runner), écran du bas = zone tactile de jeu (fond noir).
- Entrées via les pointer events de PixiJS.

## Assets (remplaçables)

Le code de jeu ne dessine jamais une forme en dur : il demande une texture **par clé** (ex. `wanted.face.mario`).
Un **manifeste unique** associe chaque clé à :
- une forme générée (cercle coloré, lettre…) — défaut pour le prototype ;
- ou un fichier PNG/SVG d'un dossier ;
- ou une frame d'une spritesheet.

Remplacer les graphismes = déposer les fichiers + modifier le manifeste. Zéro changement dans le code des mini-jeux.

## Mini-jeux

Chaque mini-jeu est un **module isolé** (ex. `client/src/games/wanted/`) qui reçoit le seed et une zone d'affichage, et renvoie un résultat. Ajouter un jeu ne doit pas toucher aux autres.

- **Wanted!** — fidèle au Wanted! de SM64DS (source décompilée : `../sm64ds-decomp/src/minigames/d_s_mg_luigi.cpp`), adapté en multijoueur :
  - chrono global (`MATCH_TIME_MS`) qui ne défile que pendant le jeu, sans recharge ; la partie s'arrête à 0 (pas de game over) ;
  - le premier qui trouve (temps le plus court) : +1 et niveau suivant pour tout le monde ; chaque mauvais toucher : -1 ;
  - progression d'origine : plateaux 1 à 20 dans l'ordre, puis tirage parmi 11–20 ; transition spéciale tous les 5 niveaux ;
  - jeu en **pixels DS virtuels** (deux écrans 256 × 192 mis à l'échelle) : vitesses, zones de toucher, tailles d'origine.
  - Tables marquées `[DEVINÉ]` dans `games/wanted/boards.ts` : absentes du dépôt de décompilation (pas de ROM), à corriger si on les retrouve.
- **Trampoline Time** — plus tard. Le joueur trace des trampolines au doigt, des personnages rebondissent dessus ; rendu en 3D dans l'original. Options à trancher le moment venu : Three.js pour ce jeu uniquement, ou fausse 3D dans PixiJS.

## État actuel / prochaines étapes

Fait (voir `README.md` pour la structure, `DEPLOY.md` pour Debian) :
- Monorepo pnpm, TypeScript 6 (svelte-check ne supporte pas encore TS 7 seul). Serveur lancé via `tsx` (dev et prod).
- Serveur : HTTP + statiques (sirv) + socket.io, rooms, reconnexion (playerId + code envoyés dans le handshake `auth`), attente de tous les résultats + timeout.
- Client : écrans Svelte, mise en place des deux écrans (`client/src/game/round.ts`), textures et sons par clé + manifeste (sons synthétisés WebAudio par défaut), Wanted! fidèle à l'original (voir Mini-jeux).
- Les personnages sont des formes génériques (`wanted.face.a`…`d`), pas des personnages Nintendo.

Prochaines étapes possibles :
1. Mesurer la latence réelle depuis l'extérieur et tester sur vrais téléphones.
2. Trampoline Time.
