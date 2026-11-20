<script lang="ts">
  import { store } from './state.svelte';
  import Home from './screens/Home.svelte';
  import Lobby from './screens/Lobby.svelte';
  import Game from './screens/Game.svelte';
  import Results from './screens/Results.svelte';
</script>

{#if !store.room}
  <Home />
{:else if store.room.phase === 'lobby'}
  <Lobby room={store.room} />
{:else if store.room.phase === 'playing'}
  <Game room={store.room} />
{:else}
  <Results room={store.room} />
{/if}
