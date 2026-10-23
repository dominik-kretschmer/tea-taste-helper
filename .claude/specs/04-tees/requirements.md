# 04 – Tees

> Feature-Spec zu [00 – Overview](../00%20–%20Overview:%20tea-taste-helper.md), Slice 04 (§2 Begriffe, §4 Katalog, §8 Mehrsprachigkeit, §13 Audit-Log). Baut auf [03 – Zutaten](../03-zutaten/requirements.md) auf. Phase 1: Anforderungen.
> Status: **umgesetzt (2026-10-23)**

## Ziel

Nutzer erfassen Tees als Kombination aus Zutaten aus dem Katalog, optional mit Anteilen in Prozent – gekaufte Tees ebenso wie selbst gemischte. Öffentliche Tees werden wie Zutaten gemeinsam gepflegt (Wiki-Prinzip mit Versionshistorie und Übersetzungen); private Tees sieht und bearbeitet nur ihr Ersteller. Tees sind die Grundlage für Vorrat (06), Bewertungen (08) und Empfehlungen (10).

## Begriffe

| Begriff | Bedeutung |
|---|---|
| **Tee** | Kombination aus einer oder mehreren Zutaten aus dem Katalog (03). |
| **Anteil** | Optionaler Prozentwert einer Zutat am Tee. |
| **Art** | `gekauft` oder `selbst gemischt`. |
| **Ersteller** | Nutzer, der den Tee angelegt hat. Bleibt fest, auch wenn andere einen öffentlichen Tee bearbeiten. |
| **Sichtbarkeit** | `privat` (nur der Ersteller) oder `öffentlich` (alle). |
| **Version, Originalsprache, Übersetzung** | wie in 03. |

## User Stories

- **US-1:** Als Besucher möchte ich öffentliche Tees durchsuchen und ansehen, auch ohne Konto.
- **US-2:** Als Nutzer möchte ich einen Tee mit seinen Zutaten und optionalen Anteilen anlegen, privat oder öffentlich.
- **US-3:** Als Nutzer möchte ich öffentliche Tees bearbeiten können, damit der Katalog gemeinsam besser wird; meine privaten Tees bearbeite nur ich.
- **US-4:** Als Ersteller möchte ich einen privaten Tee veröffentlichen.
- **US-5:** Als Nutzer möchte ich Name und Beschreibung eines Tees übersetzen.
- **US-6:** Als Besucher möchte ich die Versionshistorie eines Tees sehen und Versionen vergleichen.
- **US-7:** Als Nutzer möchte ich meine eigenen Tees (auch private) gesammelt sehen.
- **US-8:** Als Besucher möchte ich auf einer Zutat sehen, in welchen öffentlichen Tees sie vorkommt.
- **US-9:** Als Admin möchte ich Tee-Änderungen im Audit-Log sehen.

## Akzeptanzkriterien

### Datenmodell (fachlich)
- **AK-0.1:** Ein Tee hat:
  - pro Sprache einen **Namen** (2–80 Zeichen, Pflicht in der Originalsprache) und eine **Beschreibung** (optional, max. 2000 Zeichen);
  - eine **Art**: `gekauft` / `selbst gemischt` (Pflicht);
  - bei `gekauft` optional eine **Marke** (max. 80 Zeichen, nicht übersetzt);
  - **koffeinhaltig**: `ja` / `nein` / `unbekannt` (Standard `unbekannt`);
  - einen optionalen **Zubereitungshinweis** wie bei Zutaten (40–100 °C, 10–1800 s, einzeln optional);
  - **Zutaten**: mindestens 1, höchstens 20, jede Zutat höchstens einmal, in einer festen Reihenfolge;
  - je Zutat optional einen **Anteil** in Prozent (ganze Zahl 1–100); die Summe der angegebenen Anteile ist höchstens 100.
- **AK-0.2:** Jeder Tee merkt sich Originalsprache, Ersteller und Sichtbarkeit.
- **AK-0.3:** Sind nicht alle Anteile angegeben oder ist ihre Summe unter 100, gilt der Rest als „unbekannt“; das wird so angezeigt und nicht hochgerechnet.

### US-1 – Katalog ansehen
- **AK-1.1:** WENN jemand `/tees` (bzw. `/en/teas`) aufruft, DANN sieht er die **öffentlichen** Tees alphabetisch nach Namen in der aktuellen Sprache, seitenweise (24 pro Seite), ohne Anmeldung; private Tees erscheinen dort nie.
- **AK-1.2:** WENN ein Suchbegriff eingegeben wird, DANN werden öffentliche Tees gefunden, deren Name in irgendeiner Sprache oder deren Marke den Begriff enthält (ohne Beachtung von Groß-/Kleinschreibung).
- **AK-1.3:** WENN nach einer Zutat gefiltert wird, DANN erscheinen nur Tees, die diese Zutat enthalten.
- **AK-1.4:** Übersetzungs-Fallback wie in 03 (AK-1.3): Originalsprache mit Hinweis „nicht übersetzt“. Zutatennamen erscheinen ebenfalls in der aktuellen Sprache mit Fallback.
- **AK-1.5:** Die Detailseite zeigt Name, Beschreibung, Art, Marke, Koffein, Zubereitungshinweis, die Zutaten in ihrer Reihenfolge mit Anteil (bzw. „ohne Angabe“) und Link zur Zutat, den unbekannten Rest (AK-0.3), Ersteller und letzte Änderung (Datum, Autor – Anzeigename, nie E-Mail).
- **AK-1.6:** WENN der Tee als Koffein `unbekannt` hat, aber mindestens eine Zutat koffeinhaltig ist, DANN zeigt die Detailseite den Hinweis „laut Zutaten koffeinhaltig“.
- **AK-1.7:** Jeder Tee hat eine stabile URL. WENN jemand einen privaten Tee aufruft, der ihm nicht gehört (auch als Admin), oder einen nicht vorhandenen, DANN erscheint eine 404-Seite; die API antwortet 404, nie 403.

### US-2 – Anlegen
- **AK-2.1:** WENN ein angemeldeter Nutzer einen Tee mit gültigen Angaben anlegt, DANN entsteht Version 1 mit ihm als Autor und Ersteller; der Tee ist je nach Wahl privat (Standard) oder öffentlich.
- **AK-2.2:** Zutaten werden über eine Suche im Zutatenkatalog ausgewählt (Name in irgendeiner Sprache); fehlt eine Zutat, führt ein Link zum Anlegen der Zutat, und danach geht es zurück zum Tee-Formular, ohne Eingaben zu verlieren.
- **AK-2.3:** WENN beim Anlegen eines öffentlichen Tees ein Name eingegeben wird, DANN zeigt das Formular bis zu 5 ähnliche öffentliche Tees mit Link an.
- **AK-2.4:** WENN ein öffentlicher Tee mit gleichem Namen (wie in 03, AK-2.3) **und** gleicher Marke in derselben Sprache existiert, DANN wird das Speichern mit 409 `DUPLICATE_NAME` abgelehnt und der bestehende Tee verlinkt. Private Tees unterliegen dieser Regel nicht.
- **AK-2.5:** WENN Anteile in Summe über 100 liegen, eine Zutat doppelt vorkommt oder eine Zutat nicht existiert, DANN wird mit 400 abgelehnt und der Fehler am Feld angezeigt.
- **AK-2.6:** Gäste sehen statt „Tee anlegen“ einen Hinweis zum Anmelden; die API antwortet ihnen mit 401.

### US-3 – Bearbeiten
- **AK-3.1:** WENN ein angemeldeter Nutzer einen **öffentlichen** Tee ändert (alle Felder einschließlich Zutaten, Reihenfolge und Anteile), DANN gilt die Änderung sofort, und es entsteht eine neue Version mit ihm als Autor und optionaler Änderungsnotiz (max. 200 Zeichen).
- **AK-3.2:** WENN jemand anderes als der Ersteller einen **privaten** Tee ändern will, DANN antwortet die API mit 404.
- **AK-3.3:** Konfliktschutz (409 `EDIT_CONFLICT` mit Angebot, die aktuelle Fassung zu laden), „keine Änderung → keine Version“ und Duplikatregel beim Umbenennen gelten wie in 03.
- **AK-3.4:** Das Rate-Limit aus 03 (30 Änderungen in 10 Minuten) gilt gemeinsam für Zutaten und Tees.
- **AK-3.5:** Öffentliche Tees lassen sich in 04 nicht löschen.
- **AK-3.6:** WENN der Ersteller seinen **privaten** Tee löscht (mit Rückfrage), DANN ist er mit allen Versionen entfernt.

### US-4 – Veröffentlichen
- **AK-4.1:** WENN der Ersteller einen privaten Tee veröffentlicht (mit Rückfrage, die erklärt, dass das nicht rückgängig zu machen ist und dann alle bearbeiten können), DANN ist er sofort im öffentlichen Katalog, und es entsteht eine neue Version.
- **AK-4.2:** Beim Veröffentlichen gilt die Duplikatregel (AK-2.4).
- **AK-4.3:** Ein öffentlicher Tee kann nicht wieder privat werden; die API lehnt das mit 400 ab.
- **AK-4.4:** Nur der Ersteller kann veröffentlichen; für andere ist ein privater Tee nicht vorhanden (404).

### US-5 – Übersetzen
- **AK-5.1:** Übersetzen wie in 03 (AK-4.1–4.3): Name und Beschreibung pro Sprache, neue Version, Konfliktschutz, Duplikatregel pro Sprache (nur öffentliche Tees), Originalsprache nicht entfernbar. Private Tees übersetzt nur der Ersteller.

### US-6 – Historie
- **AK-6.1:** Historie und Vergleich wie in 03 (AK-5.1–5.3); der Vergleich zeigt zusätzlich hinzugefügte, entfernte und verschobene Zutaten sowie geänderte Anteile, Art, Marke und Sichtbarkeit.
- **AK-6.2:** Die Historie eines privaten Tees sieht nur der Ersteller (sonst 404).

### US-7 – Meine Tees
- **AK-7.1:** WENN ein angemeldeter Nutzer „Meine Tees“ aufruft, DANN sieht er alle Tees, die er erstellt hat – private und öffentliche, jeweils gekennzeichnet –, mit Suche und Seiten wie in AK-1.1/1.2.

### US-8 – Tees einer Zutat
- **AK-8.1:** Die Detailseite einer Zutat listet die öffentlichen Tees, die sie enthalten (max. 10, mit Link „alle anzeigen“ zur gefilterten Teeliste aus AK-1.3).

### US-9 – Audit
- **AK-9.1:** Anlegen, Bearbeiten, Übersetzen, Veröffentlichen und Löschen erzeugen Einträge `TEA_CREATED`, `TEA_UPDATED`, `TEA_PUBLISHED`, `TEA_DELETED` mit Tee-ID und Versionsnummer; im Admin-Bereich übersetzt und filterbar. Bei privaten Tees verlinkt der Eintrag den Tee nicht (Admins sehen ihn nicht).

### Übergreifend
- **AK-10.1:** Alle Eingaben werden serverseitig mit zod geprüft; Fehler erscheinen übersetzt am Feld.
- **AK-10.2:** Nutzerinhalte (Name, Beschreibung, Marke, Notiz) werden als Text ausgegeben, nie als HTML; Zeilenumbrüche in der Beschreibung bleiben erhalten.
- **AK-10.3:** Alle neuen UI-Texte in `de.json` und `en.json`; die Navigation bekommt den Eintrag „Tees“; alle neuen Seiten bei 360 px ohne horizontales Scrollen; keine CSP-Verstöße.
- **AK-10.4:** Unit- und API-Tests decken Anlegen, Anteilsregeln, Sichtbarkeit (privat für andere 404, auch in Liste, Suche, Historie, Zutatenseite), Veröffentlichen, Bearbeiten, Konflikt, Duplikate, Übersetzen, Historie/Vergleich, Löschen, Rechte und Rate-Limit ab.

## Nicht im Umfang

- Tees als Bestandteil anderer Tees → mit Vorrat/Mischungen (06/10)
- Vorrat, Mengen → Slice 06
- Bewertungen → Slice 08
- Zurücksetzen, Melden, Zusammenführen, Löschen öffentlicher Tees → Slice 05
- Bilder, Preise, Bezugsquellen, Links zu Shops
- Mengenangaben in Gramm oder Teilen (nur Prozent)
- Teilen privater Tees mit einzelnen Nutzern

## Entscheidungen

- Öffentliche Tees bearbeiten alle angemeldeten Nutzer (Wiki), private nur der Ersteller; privat → öffentlich geht, zurück nicht (Entscheidung des Nutzers, 2026-10-23).
- Anteile in Prozent, optional je Zutat (Entscheidung des Nutzers, 2026-10-23).
- Felder: Name + Beschreibung (übersetzbar), Art gekauft/selbst gemischt mit optionaler Marke, Zubereitungshinweis, Koffein (Entscheidung des Nutzers, 2026-10-23).
- In 04 bestehen Tees nur aus Zutaten; Tee-in-Tee kommt später (Entscheidung des Nutzers, 2026-10-23).

## Vorschläge zur Bestätigung

Diese Punkte habe ich festgelegt, damit die Anforderungen prüfbar sind. Bitte bei der Freigabe bestätigen oder ändern:

1. **Neue Tees sind standardmäßig privat** (AK-2.1).
2. **Mindestens 1, höchstens 20 Zutaten**; Anteile als ganze Prozent (AK-0.1).
3. **Duplikatregel nur für öffentliche Tees, über Name + Marke** – zwei Marken dürfen beide „Earl Grey“ heißen (AK-2.4).
4. **Koffein als eigenes Feld**, dazu der Hinweis aus den Zutaten bei `unbekannt` (AK-1.6).
5. **Private Tees sieht niemand außer dem Ersteller, auch kein Admin**; fremde private Tees antworten mit 404 statt 403, damit ihre Existenz nicht verraten wird (AK-1.7).
6. **Der Ersteller darf seine privaten Tees löschen** (AK-3.6); öffentliche erst mit der Moderation (05).
7. **„Meine Tees“ und die Tees-Liste auf der Zutatenseite** gehören schon in 04 (US-7, US-8).
8. **URLs** `/tees` bzw. `/en/teas` (analog zu Zutaten).

## Offene Fragen

- keine (außer den Vorschlägen oben)
