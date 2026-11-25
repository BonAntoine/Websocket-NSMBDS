<script lang="ts">
  import { GAME_IDS, type GameId } from '@nsmb/shared';
  import { socket } from '../net';
  import { assetUrl } from '../assets/assets';
  import { gameInfo } from '../games';

  let { selected, canPick }: { selected: GameId; canPick: boolean } = $props();
</script>

<div class="picker">
  {#each GAME_IDS as id (id)}
    {@const info = gameInfo[id]}
    <button
      class="card"
      class:selected={id === selected}
      disabled={!canPick}
      onclick={() => socket.emit('room:game', { game: id })}
    >
      <img src={assetUrl(info.icon)} alt="" />
      <span class="name">{info.name}</span>
      <span class="rules">{info.rules}</span>
    </button>
  {/each}
</div>

<style>
  .picker {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }
  .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 12px 10px;
    background: var(--panel);
    color: var(--text);
    font-weight: 400;
    border: 2px solid transparent;
  }
  .card:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .card.selected {
    border-color: var(--accent);
    opacity: 1;
  }
  img {
    width: 56px;
    height: 56px;
    object-fit: contain;
  }
  .name {
    font-weight: 700;
  }
  .rules {
    font-size: 0.8rem;
    color: var(--muted);
  }
</style>
