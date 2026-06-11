# U9 Private Videothek

Privater MVP fuer Trainingsvideos mit Login, Rollen, Upload, Suche, Kategorien und geschuetztem Videostreaming.

## Start

```bash
npm run server
```

Danach im Browser oeffnen:

```text
http://127.0.0.1:3001
```

## Deployment

Fuer den Windows-NUC mit deinem bestehenden nginx/PM2-Setup gibt es:

- `DEPLOY_WINDOWS_NUC_NGINX.md`
- `ecosystem.config.cjs`
- `nginx-teamclips.conf`

Zusätzlich gibt es ein Docker-Setup, falls du spaeter Container nutzen willst:

- `Dockerfile`
- `docker-compose.yml`
- `.env.example`
- `DEPLOY_NUC.md`

Wichtig beim Umzug auf den NUC: `data/` und `storage/` mitkopieren. Dort liegen Benutzer, Metadaten, Videos und Vorschaubilder.

## Demo-Logins

Alle Demo-Konten nutzen das Passwort `training`.

| Rolle | E-Mail | Rechte |
| --- | --- | --- |
| Admin | admin@u9.local | Upload, alle Videos sehen, spaeter Nutzerverwaltung |
| Trainer | trainer@u9.local | Upload, alle Videos sehen |
| Eltern | eltern@u9.local | Nur freigegebene Videos ansehen |

## Rollen

| Funktion | Admin | Trainer | Eltern |
| --- | --- | --- | --- |
| Videos ansehen | Alle | Alle | Nur freigegebene |
| Videos hochladen | Ja | Ja | Nein |
| Videos bearbeiten | Ja | Ja | Nein |
| Videos loeschen | Ja | Nein | Nein |
| Benutzer anlegen | Ja | Nein | Nein |
| Rollen vergeben | Ja | Nein | Nein |

## Datenschutz- und Sicherheitsbasis

- Ohne Login sind Videothek, Uploads und Videostreams nicht erreichbar.
- Registrierung ist nicht oeffentlich vorgesehen.
- Videos liegen unter `storage/videos` und werden nicht als statische Dateien ausgeliefert.
- Der Stream laeuft ueber `/api/videos/:id/stream` und prueft die Session sowie die Rollenfreigabe.
- Uploads sind nur fuer `admin` und `trainer` erlaubt.
- Videos sind standardmaessig nur fuer Trainer sichtbar; Eltern sehen sie nur nach Freigabe beim Upload.
- Video-Loeschen und Benutzerverwaltung sind nur fuer `admin` erlaubt.

## Naechste sinnvolle Schritte

- Dauerhaft gespeicherte Sessions statt In-Memory-Sessions.
- Nutzerverwaltung mit Einladungen.
- Passwort-Reset und staerkere Passwort-Hashes mit Salt.
- Automatische Thumbnails und echtes Transcoding.
- DSGVO-Funktionen: Einwilligungsstatus, Loeschfristen, Export und Audit-Log.
