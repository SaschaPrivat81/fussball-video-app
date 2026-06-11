# GitHub Workflow

GitHub sollte nur den Code enthalten. Private Inhalte bleiben auf dem NUC.

## Nicht ins Repo

Diese Ordner duerfen nicht nach GitHub:

```text
data/
storage/
```

`data/` enthaelt Benutzer und Videometadaten. `storage/` enthaelt Videos und Vorschaubilder.

## Ins Repo

Diese Dateien gehoeren nach GitHub:

```text
server.js
package.json
public/
Dockerfile
docker-compose.yml
.env.example
.dockerignore
.gitignore
README.md
DEPLOY_NUC.md
GITHUB_DEPLOY.md
```

## Ablauf

1. Code auf dem Mac aendern.
2. Nach GitHub pushen.
3. Auf dem NUC per WireGuard einloggen.
4. Repo pullen.
5. Container neu bauen/starten:

```bash
docker compose up -d --build
```

## Erster Push

Beispiel:

```bash
git init
git add .
git commit -m "Initial private video app"
git branch -M main
git remote add origin git@github.com:DEIN-USER/u9-private-video-app.git
git push -u origin main
```

Vor `git add .` immer pruefen:

```bash
git status --short
```

Wenn dort `data/` oder `storage/` auftauchen, abbrechen und `.gitignore` pruefen.
