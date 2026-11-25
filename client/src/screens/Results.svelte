<script lang="ts">
  import { MIN_PLAYERS, type RoomState } from '@nsmb/shared';
  import { playerId, socket } from '../net';
  import { leaveRoom } from '../state.svelte';
  import GamePicker from './GamePicker.svelte';

  let { room }: { room: RoomState } = $props();

  const ranking = $derived([...room.players].sort((a, b) => b.score - a.score));
  const best = $derived(ranking[0]?.score ?? 0);
  const isHost = $derived(room.hostId === playerId);
  const connected = $derived(room.players.filter((p) => p.connected).length);
</script>

<main class="screen">
  <h1>Résultats</h1>
  <ul class="list">
    {#each ranking as p (p.id)}
      <li class:off={!p.connected} style:border={p.score === best ? '2px solid var(--accent)' : ''}>
        <span>{p.score === best ? '🏆 ' : ''}{p.name}{p.id === playerId ? ' (toi)' : ''}</span>
        <strong>{p.score}</strong>
      </li>
    {/each}
  </ul>

  <div class="spacer"></div>
  {#if isHost}
    <GamePicker selected={room.game} canPick />
    <button onclick={() => socket.emit('game:start')} disabled={connected < MIN_PLAYERS}>Rejouer</button>
  {:else}
    <p class="muted">L'hôte peut relancer une partie. Code : <strong>{room.code}</strong></p>
  {/if}
  <button class="secondary" onclick={leaveRoom}>Quitter</button>
</main>
