---
name: nuxt-dev
description: Startet, baut und prüft die Nuxt-4-App "tea-taste-helper". Verwenden, wenn der Dev-Server gestartet, ein Production-Build erstellt oder geprüft werden soll, ob eine Änderung in der laufenden App funktioniert.
---

# Nuxt-App starten und bauen

Das Projekt ist eine Nuxt-4-App (Vue 3, vue-router). Paketmanager: **npm** (es gibt eine `package-lock.json`).

## Projektstruktur

- `app/` – Frontend (Einstieg: `app/app.vue`, Seiten in `app/pages/`, Komponenten in `app/components/`)
- `server/` – Nitro-Server (API-Routen in `server/api/`)
- `public/` – statische Dateien
- `nuxt.config.ts` – Nuxt-Konfiguration

## Befehle

| Zweck                 | Befehl            |
|-----------------------|-------------------|
| Abhängigkeiten        | `npm install`     |
| Dev-Server (Port 3000)| `npm run dev`     |
| Production-Build      | `npm run build`   |
| Build-Vorschau        | `npm run preview` |
| Statisch generieren   | `npm run generate`|

## Vorgehen

1. Fehlt `node_modules/`, zuerst `npm install` ausführen.
2. Den Dev-Server im Hintergrund starten (`npm run dev`) und warten, bis `Local: http://localhost:3000` erscheint.
3. Seiten oder API-Routen mit `curl http://localhost:3000/...` prüfen.
4. Vor dem Abschluss mit `npm run build` sicherstellen, dass der Build fehlerfrei durchläuft.
5. Den Dev-Server danach wieder beenden.

## Hinweise

- `.nuxt/`, `.output/` und `.data/` sind generiert und werden nicht von Hand bearbeitet.
- Geheimnisse gehören in `.env` (ist in `.gitignore` eingetragen).
