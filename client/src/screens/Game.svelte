<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { Application } from 'pixi.js';
  import type { RoomState } from '@nsmb/shared';
  import { playerId, socket } from '../net';
  import { playerName, store } from '../state.svelte';
  import { loadAssets } from '../assets/assets';
  import { loadSounds } from '../assets/sounds';
  import { games } from '../games';
  import type { RoundInstance } from '../games/types';
  import { createRound } from '../game/round';

  let { room }: { room: RoomState } = $props();

  let host: HTMLDivElement;
  let pixi: Application | undefined = $state();
  let hasRound = $state(false);
  let current: { round: number; instance: RoundInstance; finished: boolean } | null = null;

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
    return () => {
      unmounted = true;
      current?.instance.destroy();
      pixi?.destroy(true, { children: true });
    };
  });

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
    });
    current = { round: start.round, instance, finished: false };
    hasRound = true;
    const d = untrack(() => store.deadline);
    if (d?.round === start.round) instance.setDeadline(d.timeMs);
    instance
      .play()
      .then((timeMs) => socket.emit('round:result', { round: start.round, timeMs }))
      .catch(() => {}); // écran démonté en plein niveau
  });

  // Quelqu'un a trouvé : on joue jusqu'à son temps sur notre propre chrono.
  $effect(() => {
    const d = store.deadline;
    if (d && current?.round === d.round) current.instance.setDeadline(d.timeMs);
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
  <header>
    {#each room.players as p (p.id)}
      <span class:me={p.id === playerId} class:off={!p.connected}>{p.name} <b>{p.score}</b></span>
    {/each}
    <span class="round">Niveau {room.round}</span>
  </header>

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
  header {
    display: flex;
    gap: 12px;
    padding: 8px 12px;
    font-size: 0.9rem;
    background: var(--panel);
    overflow: hidden;
    white-space: nowrap;
  }
  header .me { color: var(--accent); }
  header .off { opacity: 0.4; }
  header .round { margin-left: auto; color: var(--muted); }
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
