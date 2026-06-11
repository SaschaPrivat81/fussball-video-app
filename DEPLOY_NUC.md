# Deployment auf dem NUC

Diese App kann auf dem NUC direkt mit Node.js oder mit Docker laufen. Fuer zu Hause ist Docker am einfachsten, weil Daten und Videos als Ordner daneben liegen bleiben.

## Variante A: Nur ueber WireGuard erreichbar

Das ist der beste erste Schritt.

1. Projektordner auf den NUC kopieren.
2. `.env.example` nach `.env` kopieren.
3. In `.env` so lassen:

```text
APP_HOST=127.0.0.1
PORT=3001
```

4. Starten:

```bash
docker compose up -d --build
```

5. Im WireGuard-Netz per SSH-Tunnel oder lokalem Reverse Proxy erreichbar machen.

Wenn die App direkt auf der WireGuard-IP erreichbar sein soll, setze `APP_HOST` auf die WireGuard-IP des NUC, z. B.:

```text
APP_HOST=10.8.0.2
```

Dann ist sie im VPN unter `http://10.8.0.2:3001` erreichbar.

## Variante B: Oeffentlich per Domain

Nur machen, wenn HTTPS und Updates sauber eingerichtet sind.

Empfohlen:

- App weiter nur auf `127.0.0.1:3001` binden.
- Caddy oder nginx als Reverse Proxy davor.
- HTTPS-Zertifikat automatisch verwalten lassen.
- Keine offene Registrierung aktivieren.

Beispiel Caddyfile:

```text
videos.example.de {
  reverse_proxy 127.0.0.1:3001
}
```

## Backup

Regelmaessig sichern:

```text
data/
storage/
```

`data/` enthaelt Benutzer und Metadaten. `storage/` enthaelt Videos und Vorschaubilder.

## Start/Stop

```bash
docker compose up -d --build
docker compose logs -f
docker compose down
```

## Wichtige Produktions-To-dos

- Demo-Passwoerter aendern.
- Admin-Konto mit starkem Passwort anlegen.
- Spaeter Passwort-Hashes auf bcrypt/argon2 umstellen.
- Regelmaessige Backups einrichten.
- NUC und Docker-Images aktuell halten.
