# 03 – Zutaten

> Feature-Spec zu [00 – Overview](../00%20–%20Overview:%20tea-taste-helper.md), Slice 03 (§2 Begriffe, §4 Katalog, §8 Mehrsprachigkeit, §13 Audit-Log). Phase 1: Anforderungen.
> Status: **freigegeben (2026-10-22)**

## Ziel

Ein öffentlicher, gemeinsam gepflegter Katalog von Zutaten (z.B. Grüntee, Minze, Zimt) als Grundlage für Tees, Vorrat und Empfehlungen. Angemeldete Nutzer legen Zutaten an und verbessern sie nach dem Wiki-Prinzip: Änderungen sind sofort sichtbar, jede Änderung ist in einer Versionshistorie nachvollziehbar. Name und Beschreibung lassen sich in jede App-Sprache übersetzen.

## Begriffe

| Begriff | Bedeutung |
|---|---|
| **Originalsprache** | Sprache, in der eine Zutat angelegt wurde. |
| **Übersetzung** | Name und Beschreibung einer Zutat in einer weiteren App-Sprache (`de`, `en`). |
| **Version** | Unveränderlicher Stand einer Zutat nach einer Änderung, mit Autor, Zeitpunkt und optionaler Änderungsnotiz. |

## User Stories

- **US-1:** Als Besucher möchte ich den Zutaten-Katalog durchsuchen und Zutaten ansehen, auch ohne Konto.
- **US-2:** Als Nutzer möchte ich eine neue Zutat anlegen und sehe dabei, ob es schon ähnliche gibt, damit keine Duplikate entstehen.
- **US-3:** Als Nutzer möchte ich jede Zutat bearbeiten können, damit der Katalog gemeinsam besser wird.
- **US-4:** Als Nutzer möchte ich Name und Beschreibung einer Zutat in eine andere Sprache übersetzen.
- **US-5:** Als Besucher möchte ich die Versionshistorie einer Zutat sehen und zwei Versionen vergleichen, damit Änderungen nachvollziehbar sind.
- **US-6:** Als Admin möchte ich Katalogänderungen auch im Audit-Log sehen.

## Akzeptanzkriterien

### Datenmodell (fachlich)
- **AK-0.1:** Eine Zutat hat:
  - pro Sprache einen **Namen** (2–80 Zeichen, Pflicht in der Originalsprache) und eine **Beschreibung** (optional, max. 2000 Zeichen);
  - **koffeinhaltig**: `ja` / `nein` / `unbekannt` (Standard `unbekannt`);
  - einen optionalen **Zubereitungshinweis**: Wassertemperatur in °C (40–100) und Ziehzeit in Sekunden (10–1800), jeweils einzeln optional.
- **AK-0.2:** Jede Zutat merkt sich ihre Originalsprache.

### US-1 – Katalog ansehen
- **AK-1.1:** WENN jemand `/zutaten` (bzw. `/en/ingredients`) aufruft, DANN sieht er die Zutaten alphabetisch nach dem Namen in der aktuellen Sprache, seitenweise (24 pro Seite), ohne Anmeldung.
- **AK-1.2:** WENN ein Suchbegriff eingegeben wird, DANN werden Zutaten gefunden, deren Name in **irgendeiner** Sprache den Begriff enthält (ohne Beachtung von Groß-/Kleinschreibung).
- **AK-1.3:** WENN es für die aktuelle Sprache keine Übersetzung gibt, DANN werden Name und Beschreibung in der Originalsprache angezeigt, mit einem Hinweis „nicht übersetzt“ und (für angemeldete Nutzer) einem Link zum Übersetzen.
- **AK-1.4:** Die Detailseite einer Zutat zeigt Name, Beschreibung, Koffein, Zubereitungshinweis, Datum der letzten Änderung und deren Autor (Anzeigename, nie die E-Mail).
- **AK-1.5:** Jede Zutat hat eine stabile URL; nicht vorhandene Zutaten führen zu einer 404-Seite.

### US-2 – Anlegen
- **AK-2.1:** WENN ein angemeldeter Nutzer eine Zutat mit gültigen Angaben anlegt, DANN ist sie sofort im Katalog sichtbar, und es entsteht Version 1 mit ihm als Autor.
- **AK-2.2:** WENN beim Anlegen ein Name eingegeben wird, DANN zeigt das Formular nach kurzer Pause bis zu 5 ähnliche bestehende Zutaten mit Link an.
- **AK-2.3:** WENN in derselben Sprache schon eine Zutat mit gleichem Namen existiert (ohne Beachtung von Groß-/Kleinschreibung und Leerzeichen am Rand), DANN wird das Anlegen mit 409 `DUPLICATE_NAME` abgelehnt, und die Meldung verlinkt die bestehende Zutat.
- **AK-2.4:** Gäste sehen statt „Zutat anlegen“ einen Hinweis zum Anmelden; die API antwortet ihnen mit 401.

### US-3 – Bearbeiten
- **AK-3.1:** WENN ein angemeldeter Nutzer eine Zutat ändert, DANN gilt die Änderung sofort, und es entsteht eine neue Version mit ihm als Autor und optionaler Änderungsnotiz (max. 200 Zeichen).
- **AK-3.2:** WENN zwischen Öffnen und Speichern jemand anderes die Zutat geändert hat, DANN wird das Speichern mit 409 `EDIT_CONFLICT` abgelehnt, und das Formular bietet an, die aktuelle Fassung zu laden; nichts wird still überschrieben.
- **AK-3.3:** WENN sich beim Speichern nichts geändert hat, DANN entsteht keine neue Version.
- **AK-3.4:** Die Regel gegen doppelte Namen (AK-2.3) gilt auch beim Umbenennen.
- **AK-3.5:** Ein Nutzer kann höchstens 30 Änderungen (Anlegen, Bearbeiten, Übersetzen) in 10 Minuten speichern, danach 429 `RATE_LIMITED`.
- **AK-3.6:** Löschen ist in 03 nicht möglich.

### US-4 – Übersetzen
- **AK-4.1:** WENN ein angemeldeter Nutzer für eine Sprache ohne Übersetzung Name (und optional Beschreibung) speichert, DANN wird die Übersetzung sofort angezeigt, und es entsteht eine neue Version.
- **AK-4.2:** Bestehende Übersetzungen lassen sich wie in US-3 bearbeiten (inkl. Konfliktschutz und Duplikatregel pro Sprache).
- **AK-4.3:** Die Übersetzung der Originalsprache kann nicht entfernt werden.

### US-5 – Historie
- **AK-5.1:** WENN jemand die Historie einer Zutat aufruft, DANN sieht er alle Versionen neueste zuerst, jeweils mit Nummer, Zeitpunkt, Autor (Anzeigename) und Änderungsnotiz, ohne Anmeldung.
- **AK-5.2:** WENN zwei Versionen ausgewählt werden (Standard: eine Version und ihre Vorgängerin), DANN zeigt ein Vergleich jedes geänderte Feld mit altem und neuem Wert, auch pro Sprache.
- **AK-5.3:** Versionen sind unveränderlich; es gibt keine Route, um sie zu ändern oder zu löschen.

### US-6 – Audit
- **AK-6.1:** Anlegen, Bearbeiten und Übersetzen erzeugen Einträge `INGREDIENT_CREATED` bzw. `INGREDIENT_UPDATED` im Audit-Log aus 02, mit Zutat-ID und Versionsnummer in den Details; im Admin-Bereich sind sie filterbar und übersetzt.

### Übergreifend
- **AK-7.1:** Alle Eingaben werden serverseitig mit zod geprüft; Fehler erscheinen übersetzt am Feld.
- **AK-7.2:** Nutzerinhalte (Name, Beschreibung, Notiz) werden als Text ausgegeben, nie als HTML; Zeilenumbrüche in der Beschreibung bleiben erhalten.
- **AK-7.3:** Alle neuen UI-Texte stehen in `de.json` und `en.json`; alle neuen Seiten sind bei 360 px ohne horizontales Scrollen bedienbar; keine CSP-Verstöße.
- **AK-7.4:** Unit- und API-Tests decken Anlegen, Bearbeiten, Konflikt, Duplikate, Übersetzen, Fallback, Suche, Historie/Vergleich, Rechte und Rate-Limit ab.

## Nicht im Umfang

- Zurücksetzen auf eine ältere Version, Melden, Zusammenführen von Duplikaten, Löschen → Slice 05 (Moderation)
- Kategorien, Bilder, Herkunft, Synonyme
- Weitere Inhaltssprachen außer den App-Sprachen `de` und `en`
- Automatische (maschinelle) Übersetzung
- Embeddings der Zutaten → Slice 09
- Tees und Zutatenanteile → Slice 04

## Entscheidungen

- Felder: Name + Beschreibung (übersetzbar), koffeinhaltig, Zubereitungshinweis (Entscheidung des Nutzers, 2026-10-22); keine Kategorie.
- Alle angemeldeten Nutzer dürfen anlegen und bearbeiten (Wiki-Prinzip); Gäste lesen.
- Zurücksetzen kommt mit der Moderation in Slice 05; 03 bietet Historie und Vergleich.
- Exakt gleiche Namen pro Sprache werden abgelehnt, ähnliche nur angezeigt.

## Offene Fragen

- keine
