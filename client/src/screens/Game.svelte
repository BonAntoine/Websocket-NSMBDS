<script lang="ts">
  import { onMount } from 'svelte';
  import { Application } from 'pixi.js';
  import type { RoomState } from '@nsmb/shared';
  import { playerId, socket } from '../net';
  import { playerName, store } from '../state.svelte';
  import { loadAssets } from '../assets/assets';
  import { games } from '../games';
  import { playRound } from '../game/round';

  let { room }: { room: RoomState } = $props();

  let host: HTMLDivElement;
  let pixi: Application | undefined = $state();
  let localPhase: 'idle' | 'playing' | 'sent' = $state('idle');
  let lastPlayed = 0;

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
      await loadAssets();
      if (unmounted) return app.destroy(true, { children: true });
      host.appendChild(app.canvas);
      pixi = app;
    })();
    return () => {
      unmounted = true;
      pixi?.destroy(true, { children: true });
    };
  });

  // Chaque client lance son compte à rebours dès réception du départ de manche.
  $effect(() => {
    const start = store.roundStart;
    if (!pixi || !start || start.round <= lastPlayed) return;
    lastPlayed = start.round;
    localPhase = 'playing';
    playRound(pixi, games[start.game], start.seed)
      .then((timeMs) => {
        socket.emit('round:result', { round: start.round, timeMs });
        localPhase = 'sent';
      })
      .catch(() => {}); // écran démonté en pleine manche (fin de partie, départ)
  });

  const last = $derived(store.lastRound?.round === room.round ? store.lastRound : null);
  const fmt = (ms: number | null | undefined) => (ms == null ? '—' : `${(ms / 1000).toFixed(2)} s`);
</script>

<div class="game">
  <header>
    {#each room.players as p (p.id)}
      <span class:me={p.id === playerId} class:off={!p.connected}>{p.name} <b>{p.score}</b></span>
    {/each}
    <span class="round">{room.round}/{room.totalRounds}</span>
  </header>

  <div class="area">
    <div class="stage" bind:this={host}></div>

    {#if localPhase !== 'playing'}
    <div class="overlay">
      {#if last}
        <h2>{last.winnerId ? `${playerName(last.winnerId)} gagne la manche !` : 'Personne n’a trouvé…'}</h2>
        <ul class="list">
          {#each Object.entries(last.times).sort((a, b) => (a[1] ?? Infinity) - (b[1] ?? Infinity)) as [id, t] (id)}
            <li><span>{playerName(id)}</span><span>{fmt(t)}</span></li>
          {/each}
        </ul>
      {:else if localPhase === 'sent'}
        <h2>En attente des autres joueurs…</h2>
      {:else}
        <h2>Prépare-toi…</h2>
      {/if}
    </div>
    {/if}
  </div>
</div>

<style>
  .game {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    max-width: 600px;
    margin: 0 auto;
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
    padding: 24px 16px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 16px;
    background: rgb(29 27 47 / 0.85);
    text-align: center;
  }
</style>
