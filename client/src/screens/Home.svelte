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
  function join() {
    remember();
    socket.emit('room:join', { name, code }, onAck);
  }
</script>

<main class="screen">
  <h1>Mini-jeux</h1>
  <input bind:value={name} maxlength={NAME_MAX_LENGTH} placeholder="Ton pseudo" autocomplete="nickname" />
  <button onclick={create} disabled={!name.trim()}>Créer une room</button>

  <p class="muted">ou rejoindre avec un code</p>
  <input
    value={code}
    oninput={(e) => (code = e.currentTarget.value = normalizeCode(e.currentTarget.value))}
    placeholder="CODE"
    autocapitalize="characters"
    autocomplete="off"
    style="text-align:center; letter-spacing:0.4em; font-size:1.6rem"
  />
  <button onclick={join} disabled={!name.trim() || code.length !== CODE_LENGTH}>Rejoindre</button>

  {#if error}<p class="error">{error}</p>{/if}
</main>
