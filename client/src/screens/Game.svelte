<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { Application } from 'pixi.js';
  import type { RoomState, RoundTaken } from '@nsmb/shared';
  import { playerId, socket } from '../net';
  import { playerName, store } from '../state.svelte';
  import { loadAssets } from '../assets/assets';
  import { loadSounds } from '../assets/sounds';
  import { games } from '../games';
  import { createRound, type RoundHandle } from '../game/round';

  let { room }: { room: RoomState } = $props();

  let host: HTMLDivElement;
  let pixi: Application | undefined = $state();
  let hasRound = $state(false);
  let current: { round: number; instance: RoundHandle; finished: boolean } | null = null;

  onMount(() => {
    const app = new Application();
    let unmounted = false;
    (async () => {
      await app.init({
        resizeTo: host,
        background: 0x1d1b2f,
        antialias: true,
        resolution: window.devicePixelRatio,
        autoDensity: true,
      });
      await Promise.all([loadAssets(), loadSounds()]);
      if (unmounted) return app.destroy(true, { children: true });
      host.appendChild(app.canvas);
      pixi = app;
    })();
    // Cache-cache : un objet attribué par le serveur, à afficher chez tout le monde.
    const onTaken = (t: RoundTaken) => {
      if (current?.round !== t.round) return;
      current.instance.taken?.(t.item, { name: playerName(t.playerId), isMe: t.playerId === playerId }, t.timeMs);
    };
    socket.on('round:taken', onTaken);

    // Page cachée (onglet en arrière-plan, écran verrouillé) : le navigateur gèle l'animation,
    // le joueur ne peut plus trouver. On abandonne la manche pour ne pas faire attendre les autres.
    const onVisibility = () => document.hidden && forfeit();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      socket.off('round:taken', onTaken);
      unmounted = true;
      current?.instance.destroy();
      pixi?.destroy(true, { children: true });
    };
  });

  /** Abandon de la manche en cours : résultat `null` tout de suite (ignoré si un résultat est déjà parti). */
  function forfeit() {
    if (!current || current.finished) return;
    current.instance.setDeadline(0); // le chrono local s'arrête dès qu'il reprend
    socket.emit('round:result', { round: current.round, timeMs: null });
  }

  // Chaque client lance l'intro du niveau dès réception, puis son propre "Go".
  $effect(() => {
    const start = store.roundStart;
    if (!pixi || !start || (current && start.round <= current.round)) return;
    current?.instance.destroy();
    const instance = createRound(pixi, games[start.game], {
      round: start.round,
      seed: start.seed,
      timeLeftMs: start.timeLeftMs,
      onMiss: () => socket.emit('round:miss', { round: start.round }),
      claim: (item, timeMs, total) => socket.emit('round:claim', { round: start.round, item, timeMs, total }),
    });
    current = { round: start.round, instance, finished: false };
    hasRound = true;
    untrack(() => instance.setScores(room.players, playerId));
    const d = untrack(() => store.deadline);
    if (d?.round === start.round) instance.setDeadline(d.timeMs);
    instance
      .play()
      .then((result) => socket.emit('round:result', { round: start.round, ...result }))
      .catch(() => {}); // écran démonté en plein niveau
    if (document.hidden) forfeit(); // départ reçu alors que la page est déjà cachée
  });

  // Quelqu'un a trouvé : on joue jusqu'à son temps sur notre propre chrono.
  $effect(() => {
    const d = store.deadline;
    if (d && current?.round === d.round) current.instance.setDeadline(d.timeMs);
  });

  // Scores en bas de l'écran du haut, à chaque changement (trouvaille, erreur, déconnexion).
  $effect(() => {
    const players = room.players;
    if (current) current.instance.setScores(players, playerId);
  });

  $effect(() => {
    const end = store.lastRound;
    if (!end || !current || current.round !== end.round || current.finished) return;
    current.finished = true;
    untrack(() =>
      current!.instance.finish({
        winnerName: end.winnerId ? playerName(end.winnerId) : null,
        winnerTimeMs: end.winnerId ? end.times[end.winnerId] : null,
        isMe: end.winnerId === playerId,
      }),
    );
  });
</script>

<div class="game">
  <div class="area">
    <div class="stage" bind:this={host}></div>
    {#if !hasRound}
      <div class="overlay"><h2>Prépare-toi…</h2></div>
    {/if}
  </div>
</div>

<style>
  .game {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
  }
  .area {
    flex: 1;
    position: relative;
  }
  .stage {
    position: absolute;
    inset: 0;
    overflow: hidden;
    touch-action: none;
  }
  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgb(29 27 47 / 0.85);
  }
</style>
