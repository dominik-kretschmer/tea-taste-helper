# 06 – Vorrat

> Feature-Spec zu [00 – Overview](../00%20–%20Overview:%20tea-taste-helper.md), Slice 06 (§2 Begriffe, §6 Vorrat, §7 Empfehlung). Baut auf [03 – Zutaten](../03-zutaten/requirements.md), [04 – Tees](../04-tees/requirements.md) und [05 – Moderation](../05-moderation/requirements.md) auf. Phase 1: Anforderungen.
> Status: **umgesetzt (2026-10-24)**, einschließlich der Vorschläge zur Bestätigung (mit Änderungen an 3–5).

## Ziel

Jeder Nutzer pflegt, welche Zutaten und fertigen Tees er zu Hause hat, optional mit Menge in Gramm. Der Vorrat ist die Grundlage für „Passende Tees aus dem Vorrat“ und „Neue Mischungen aus dem Vorrat“ in der Empfehlung (Slice 10).

## Begriffe

| Begriff | Bedeutung |
|---|---|
| **Vorratseintrag** | Eine Zutat oder ein Tee im Vorrat eines Nutzers, höchstens einmal je Zutat bzw. Tee, mit optionaler Menge in Gramm. |
| **Ohne Menge** | Menge nicht angegeben: Der Eintrag gilt als vorhanden. |
| **Leer** | Menge 0 g: aufgebraucht. Der Eintrag bleibt als Merkposten stehen, gilt aber als nicht verfügbar. |
| **Verfügbar** | Nicht leer und nicht ausgeblendet. Nur verfügbare Einträge nutzt die Empfehlung (Slice 10). |

## User Stories

- **US-1:** Als Nutzer möchte ich meinen Vorrat sehen, damit ich weiß, was ich zu Hause habe.
- **US-2:** Als Nutzer möchte ich Zutaten und Tees in meinen Vorrat aufnehmen, über die Vorratsseite oder direkt von der Detailseite aus.
- **US-3:** Als Nutzer möchte ich die Menge eines Eintrags ändern oder weglassen und Einträge als aufgebraucht markieren, damit der Vorrat aktuell bleibt.
- **US-4:** Als Nutzer möchte ich Einträge aus dem Vorrat entfernen.
- **US-5:** Als Nutzer möchte ich, dass mein Vorrat stimmig bleibt, wenn Moderatoren Einträge zusammenführen oder ausblenden.

## Akzeptanzkriterien

### Zugang
- **AK-0.1:** Der Vorrat ist privat: Nur sein Besitzer sieht und ändert ihn, auch Moderatoren und Admins sehen fremde Vorräte nicht. Die Vorrats-API kennt keine Nutzer-ID im Request, sondern wirkt immer auf den angemeldeten Nutzer.
- **AK-0.2:** Die Vorrats-API antwortet Gästen mit 401; für jede Route gibt es einen API-Test dazu. Ruft ein Gast die Vorratsseite auf, wird er zum Login geleitet und danach zurück (wie 00-chore/10).
- **AK-0.3:** Angemeldete Nutzer sehen im Nutzermenü den Eintrag „Vorrat“.

### US-1 – Vorrat ansehen
- **AK-1.1:** WENN ein angemeldeter Nutzer `/vorrat` (bzw. `/en/pantry`) aufruft, DANN sieht er seine Einträge in zwei Tabs „Zutaten“ und „Tees“ (mit Anzahl), jeweils alphabetisch nach Namen in der aktuellen Sprache (mit Fallback wie in 03), mit Menge („ohne Menge“ bzw. „x g“) und Link zur Detailseite.
- **AK-1.2:** Leere Einträge sind als „aufgebraucht“ gekennzeichnet und stehen in ihrem Tab am Ende.
- **AK-1.3:** Ausgeblendete Einträge sind als „nicht mehr verfügbar“ gekennzeichnet, ohne Link, und stehen in ihrem Tab ganz am Ende; der Nutzer kann sie entfernen, aber nicht bearbeiten.
- **AK-1.4:** Jeder Tab wird seitenweise vom Server geladen (24 Einträge pro Seite, wie 04, AK-1.1); Tab, Seite und Filter stehen in der URL. Ein Suchfeld filtert serverseitig nach Namen (Teilwort, ohne Groß-/Kleinschreibung). Bei leerem Vorrat erscheint ein Hinweis mit Verweis auf „Hinzufügen“.
- **AK-1.5:** Die API liefert je Eintrag Art (Zutat/Tee), ID, Name, Menge sowie die Merkmale `empty` und `hidden`, damit Slice 10 nur verfügbare Einträge nutzt.

### US-2 – Hinzufügen
- **AK-2.1:** WENN der Nutzer auf der Vorratsseite „Hinzufügen“ wählt, DANN sucht er eine Zutat oder einen Tee (Suche wie in der Zutatenauswahl von 04, Tees: öffentliche und eigene private), gibt optional eine Menge an und speichert. Der Eintrag erscheint sofort in der Liste.
- **AK-2.2:** Auf der Detailseite einer Zutat oder eines Tees sehen angemeldete Nutzer den Knopf „In den Vorrat“, der dasselbe Formular mit vorausgewähltem Eintrag öffnet. Ist der Eintrag schon im Vorrat, zeigt die Detailseite stattdessen „Im Vorrat: <Menge>“ mit Link zur Vorratsseite. Gäste sehen den Knopf nicht.
- **AK-2.3:** WENN der Nutzer eine Zutat oder einen Tee hinzufügt, der schon in seinem Vorrat ist, DANN entsteht kein zweiter Eintrag; die API antwortet mit 409 `ALREADY_IN_PANTRY` und nennt den bestehenden Eintrag, die Oberfläche bietet an, dessen Menge zu ändern.
- **AK-2.4:** Fremde private Tees, ausgeblendete und zusammengeführte Einträge lassen sich nicht hinzufügen (404, bei zusammengeführten mit `mergedInto` wie 05, AK-4.2).
- **AK-2.5:** Die Menge ist leer oder eine ganze Zahl von 0 bis 100 000 (Gramm); andere Werte lehnt die API mit 400 ab, die Oberfläche zeigt den Fehler am Feld.
- **AK-2.6:** Ein Nutzer hat höchstens 1 000 Vorratseinträge; darüber antwortet die API mit 400 `PANTRY_FULL`.

### US-3 – Menge ändern
- **AK-3.1:** WENN der Nutzer bei einem Eintrag die Menge ändert, leert („ohne Menge“) oder auf 0 setzt, DANN ist die neue Menge sofort gespeichert und sichtbar (Regeln wie AK-2.5).
- **AK-3.2:** Eine Schnellaktion „Aufgebraucht“ setzt die Menge auf 0.
- **AK-3.3:** Vorratsänderungen durch den Nutzer erzeugen keine Version und keinen Audit-Log-Eintrag (private Daten, kein Katalog). Aktionen, die öffentliche Daten ändern und dabei Vorratseinträge mitziehen (Zusammenführen, AK-5.1), bleiben wie in 05 protokolliert.

### US-4 – Entfernen
- **AK-4.1:** WENN der Nutzer einen Eintrag entfernen will, DANN fragt die Oberfläche nach (Name und Menge genannt). Nach Bestätigung ist der Eintrag weg, und eine Meldung bietet 5 Sekunden lang „Rückgängig“ an, das ihn mit derselben Menge wiederherstellt.
- **AK-4.2:** WENN der Ersteller seinen privaten Tee löscht (04, AK-3.6), DANN verschwindet der Tee auch aus seinem Vorrat.

### US-5 – Moderation
- **AK-5.1:** WENN ein Moderator eine Zutat oder einen Tee zusammenführt (05, AK-4.x), DANN zeigt jeder Vorratseintrag der Quelle danach auf das Ziel, in derselben Transaktion. Hat ein Nutzer Quelle und Ziel im Vorrat, bleibt ein Eintrag (das Ziel); die Mengen werden addiert, wenn beide angegeben sind, sonst gilt die angegebene Menge bzw. „ohne Menge“ (Regel wie 05, AK-4.3).
- **AK-5.2:** WENN ein Eintrag ausgeblendet wird, DANN bleibt der Vorratseintrag mit Menge erhalten und erscheint wie in AK-1.3. WENN er wiederhergestellt wird, DANN ist der Vorratseintrag wieder normal.
- **AK-5.3:** Vorratseinträge verhindern das Ausblenden einer Zutat nicht (anders als Tees, 05, AK-7.4); die Vorschau beim Zusammenführen nennt die Anzahl betroffener Vorratseinträge nicht.

### Allgemein
- **AK-6.1:** Alle Texte der Vorratsseite und des Formulars gibt es auf Deutsch und Englisch.
- **AK-6.2:** Die Vorratsseite ist mobil (375 px Breite) ohne horizontales Scrollen bedienbar.

## Nicht im Umfang

- Andere Einheiten als Gramm (Stück, Beutel, Freitext)
- Mehrere Einträge je Zutat/Tee (Packungen, Chargen), Notizen, Kauf- oder Ablaufdatum
- Automatisches Abziehen der Menge beim Zubereiten oder Bewerten (Slice 08)
- Einkaufsliste, Teilen des Vorrats mit anderen
- Export des Vorrats (Slice 11)
- Nutzung des Vorrats in der Empfehlung (Slice 10; hier nur die Merkmale `empty`/`hidden`)

## Entscheidungen

- Menge nur in ganzen Gramm, optional (Entscheidung des Nutzers, 2026-10-24).
- Zusammenführen hängt Vorratseinträge auf das Ziel um und addiert Mengen; Ausgeblendetes bleibt markiert stehen und zählt nicht als verfügbar (Entscheidung des Nutzers, 2026-10-24).
- Hinzufügen über die Vorratsseite und über einen Knopf auf den Detailseiten (Entscheidung des Nutzers, 2026-10-24).
- Menge 0 = aufgebraucht: Eintrag bleibt, gilt als nicht verfügbar; ohne Menge = vorhanden (Entscheidung des Nutzers, 2026-10-24).
- Höchstens ein Eintrag je Zutat bzw. Tee (Entscheidung des Nutzers, 2026-10-24).
- Ein öffentlicher Tee kann nicht wieder privat werden (04, AK-4.3); fremde private Tees können deshalb nie im Vorrat liegen.

## Vorschläge zur Bestätigung

Vom Nutzer bestätigt (2026-10-24):

1. **Routen** `/vorrat` bzw. `/en/pantry`, Menüeintrag „Vorrat“ im Nutzermenü (AK-0.3, AK-1.1).
2. **Wertebereich** 0–100 000 g, ganze Zahlen (AK-2.5).
3. **Obergrenze 1 000 Einträge** je Nutzer; die Liste wird trotzdem seitenweise vom Server geladen und serverseitig gefiltert (geändert vom Nutzer; AK-1.4, AK-2.6).
4. **Entfernen mit Rückfrage und zusätzlich „Rückgängig“** (geändert vom Nutzer; AK-4.1).
5. **Kein Audit-Log** für Vorratsänderungen; Aktionen an öffentlichen Daten werden weiter protokolliert (präzisiert vom Nutzer; AK-3.3).

## Offene Fragen

- keine (außer den Vorschlägen oben)
