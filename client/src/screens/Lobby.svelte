<script lang="ts">
  import { MAX_PLAYERS, MIN_PLAYERS, type RoomState } from '@nsmb/shared';
  import { playerId, socket } from '../net';
  import { leaveRoom } from '../state.svelte';

  let { room }: { room: RoomState } = $props();

  const isHost = $derived(room.hostId === playerId);
  const connected = $derived(room.players.filter((p) => p.connected).length);
</script>

<main class="screen">
  <p class="muted">Code de la room</p>
  <h1 style="font-size:3.5rem; letter-spacing:0.25em; padding-left:0.25em">{room.code}</h1>

  <ul class="list">
    {#each room.players as p (p.id)}
      <li class:off={!p.connected}>
        <span>{p.name}{p.id === playerId ? ' (toi)' : ''}</span>
        <span class="muted">{p.id === room.hostId ? 'hôte' : ''}{p.connected ? '' : ' déconnecté'}</span>
      </li>
    {/each}
  </ul>
  <p class="muted">{room.players.length}/{MAX_PLAYERS} joueurs</p>

  <div class="spacer"></div>
  {#if isHost}
    <button onclick={() => socket.emit('game:start')} disabled={connected < MIN_PLAYERS}>
      {connected < MIN_PLAYERS ? `En attente (${MIN_PLAYERS} joueurs min.)` : 'Lancer la partie'}
    </button>
  {:else}
    <p class="muted">L'hôte va lancer la partie…</p>
  {/if}
  <button class="secondary" onclick={leaveRoom}>Quitter</button>
</main>
