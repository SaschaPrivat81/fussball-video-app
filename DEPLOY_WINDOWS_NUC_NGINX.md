# teamclips.de auf dem Windows-NUC

Dieses Deployment passt zu deinem bestehenden Setup:

- Cloudflare fuer DNS, Proxy und Deutschland-only-Regel
- FRITZ!Box leitet 80/443 auf den NUC
- nginx auf dem NUC verteilt Domains
- PM2 startet Node-Apps

Bestehende Ports laut alter Uebersicht:

```text
eliaslernt.de       -> 127.0.0.1:5100
wordwickacademy.de  -> 127.0.0.1:5200
teamclips.de        -> 127.0.0.1:5300
```

## 1. Cloudflare DNS

Bei Cloudflare fuer `teamclips.de`:

```text
A     teamclips.de      -> deine oeffentliche Heim-IP    Proxied/orange
CNAME www               -> teamclips.de                  Proxied/orange
```

SSL/TLS-Modus: `Full (strict)`, sobald das Origin-Zertifikat in nginx liegt.

WAF: dieselbe Deutschland-only-Regel wie bei den anderen Seiten auf `teamclips.de` erweitern.

## 2. Code auf dem NUC

Empfohlener Pfad:

```powershell
New-Item -ItemType Directory -Force C:\sites
```

Wenn `git` auf dem NUC installiert ist:

```powershell
cd C:\sites
git clone https://github.com/SaschaPrivat81/fussball-video-app.git teamclips
cd C:\sites\teamclips
```

Wenn `git` nicht installiert ist:

1. GitHub im Browser oeffnen.
2. `Code` -> `Download ZIP`.
3. ZIP entpacken.
4. Den Inhalt so verschieben, dass diese Dateien direkt hier liegen:

```text
C:\sites\teamclips\server.js
C:\sites\teamclips\package.json
C:\sites\teamclips\ecosystem.config.cjs
C:\sites\teamclips\nginx-teamclips.conf
```

Pruefen:

```powershell
Test-Path C:\sites\teamclips\server.js
Test-Path C:\sites\teamclips\package.json
Test-Path C:\sites\teamclips\ecosystem.config.cjs
Test-Path C:\sites\teamclips\nginx-teamclips.conf
```

Alle vier Befehle sollten `True` ausgeben.

Die Ordner bleiben lokal auf dem NUC und werden nicht nach GitHub gepusht:

```text
C:\sites\teamclips\data
C:\sites\teamclips\storage
```

Die App legt fehlende Startdateien unter `data\` beim ersten Start selbst an.

Wenn du die bisherigen Videos vom Mac mitnehmen willst, kopiere genau diese beiden Ordner vom Mac auf den NUC.

## 3. PM2 starten

Im Projektordner:

```powershell
cd C:\sites\teamclips
pm2 start ecosystem.config.cjs
pm2 save
pm2 status
```

Logs:

```powershell
pm2 logs teamclips --lines 50
```

Restart nach Updates:

```powershell
cd C:\sites\teamclips
git pull
pm2 restart teamclips
```

## 4. nginx eintragen

Die Datei `nginx-teamclips.conf` enthaelt den passenden Serverblock.

In diese Datei einfuegen:

```text
C:\nginx-1.29.6\conf\nginx.conf
```

Danach pruefen und neu laden:

```powershell
Set-Location C:\nginx-1.29.6
.\nginx.exe -t
.\nginx.exe -s reload
```

## 5. Cloudflare-Origin-Zertifikat

Wie bei Wordwick:

1. Cloudflare -> `teamclips.de` -> SSL/TLS -> Origin Server
2. Origin Certificate erstellen fuer:

```text
teamclips.de
*.teamclips.de
```

3. Zertifikat speichern als:

```text
C:\nginx-1.29.6\ssl\teamclips.de.pem
```

4. Private Key speichern als:

```text
C:\nginx-1.29.6\ssl\teamclips.de.key
```

Private Key niemals nach GitHub kopieren.

## 6. Test

Lokal auf dem NUC:

```powershell
curl http://127.0.0.1:5300/api/me
```

Von aussen:

```text
https://teamclips.de
```

Ohne Login duerfen keine Videos sichtbar sein.

## 7. Backup

Regelmaessig sichern:

```text
C:\sites\teamclips\data
C:\sites\teamclips\storage
```
