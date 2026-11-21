<script lang="ts">
  import { CODE_LENGTH, NAME_MAX_LENGTH, normalizeCode, type JoinAck } from '@nsmb/shared';
  import { socket } from '../net';

  let name = $state(localStorage.getItem('name') ?? '');
  let code = $state('');
  let error = $state('');

  const onAck: JoinAck = (res) => (error = res.ok ? '' : res.error);

  function remember() {
    localStorage.setItem('name', name.trim());
  }
  function create() {
    remember();
    socket.emit('room:create', { name }, onAck);
  }
  function join(e: SubmitEvent) {
    e.preventDefault();
    remember();
    socket.emit('room:join', { name, code }, onAck);
  }
</script>

<main class="screen">
  <h1>Mini-jeux</h1>

  <label class="field">
    <span>Ton pseudo</span>
    <input bind:value={name} maxlength={NAME_MAX_LENGTH} placeholder="Pseudo" autocomplete="nickname" />
  </label>

  <form class="card" onsubmit={join}>
    <span class="card-title">Rejoindre une partie</span>
    <input
      class="code"
      value={code}
      oninput={(e) => (code = e.currentTarget.value = normalizeCode(e.currentTarget.value))}
      placeholder="CODE"
      autocapitalize="characters"
      autocomplete="off"
      aria-label="Code de la room"
    />
    <button disabled={!name.trim() || code.length !== CODE_LENGTH}>Rejoindre</button>
  </form>

  <div class="separator"><span>ou</span></div>

  <button class="secondary" onclick={create} disabled={!name.trim()}>Créer une partie</button>

  {#if error}<p class="error">{error}</p>{/if}
</main>

<style>
  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .field span,
  .card-title {
    color: var(--muted);
    font-size: 0.9rem;
  }
  .card {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 16px;
    border-radius: 16px;
    background: var(--panel);
  }
  .code {
    text-align: center;
    letter-spacing: 0.4em;
    padding-left: calc(16px + 0.4em);
    font-size: 1.8rem;
    font-weight: 700;
  }
  .separator {
    display: flex;
    align-items: center;
    gap: 12px;
    color: var(--muted);
  }
  .separator::before,
  .separator::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--muted);
    opacity: 0.4;
  }
</style>
