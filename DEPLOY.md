# Déploiement sur Debian

Un seul process Node sert le client buildé et socket.io sur le même port.

## 1. Installer Node et pnpm

```sh
sudo apt install -y curl
curl -fsSL https://deb.nodesource.com/setup_24.x | sudo bash -
sudo apt install -y nodejs
sudo corepack enable          # fournit pnpm (version fixée par "packageManager")
```

## 2. Récupérer et builder

```sh
sudo useradd --system --create-home --home-dir /opt/minijeux minijeux
sudo -u minijeux -H bash
cd /opt/minijeux
git clone <dépôt> app && cd app      # ou copier le dossier
pnpm install --frozen-lockfile
pnpm build
PORT=3000 pnpm start                 # test manuel, Ctrl+C pour arrêter
```

## 3. Service systemd

`/etc/systemd/system/minijeux.service` :

```ini
[Unit]
Description=Mini-jeux (Node + socket.io)
After=network-online.target
Wants=network-online.target

[Service]
User=minijeux
WorkingDirectory=/opt/minijeux/app
Environment=PORT=3000
ExecStart=/usr/bin/pnpm start
Restart=on-failure

[Install]
WantedBy=multi-user.target
```

```sh
sudo systemctl daemon-reload
sudo systemctl enable --now minijeux
journalctl -u minijeux -f            # logs
```

## 4. Accès depuis Internet

Les joueurs ne sont pas sur le réseau local : il faut exposer le serveur.

- Ouvrir/rediriger le port **443** (et 80 pour le certificat) de la box vers le serveur Debian.
- Un nom de domaine (ou DNS dynamique) pointant vers l'IP publique.
- HTTPS recommandé, le plus simple avec **Caddy** (certificat automatique, WebSocket géré sans config) :

```sh
sudo apt install -y caddy
```

`/etc/caddy/Caddyfile` :

```
minijeux.example.fr {
    reverse_proxy localhost:3000
}
```

```sh
sudo systemctl reload caddy
```

Le port 3000 n'a alors pas besoin d'être ouvert vers l'extérieur.

## Mise à jour

```sh
cd /opt/minijeux/app
git pull && pnpm install --frozen-lockfile && pnpm build
sudo systemctl restart minijeux
```

Les rooms sont en mémoire : un redémarrage coupe les parties en cours.
