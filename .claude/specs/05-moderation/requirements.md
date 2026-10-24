# 05 – Moderation

> Feature-Spec zu [00 – Overview](../00%20–%20Overview:%20tea-taste-helper.md), Slice 05 (§3 Nutzer & Rollen, §4 Katalog, §13 Audit-Log). Baut auf [02 – Auth & Rollen](../02-auth-rollen/requirements.md), [03 – Zutaten](../03-zutaten/requirements.md) und [04 – Tees](../04-tees/requirements.md) auf. Phase 1: Anforderungen.
> Status: **umgesetzt (2026-10-24)**, freigegeben am 2026-10-23, einschließlich der Vorschläge zur Bestätigung. Mit dem Design präzisiert (2026-10-23): AK-1.1, AK-4.3, AK-7.2 (Kennzeichnung statt Notiztext), AK-7.4 (auch private Tees des Nutzers blockieren das Ausblenden).

## Ziel

Der gemeinsame Katalog bleibt sauber, obwohl jeder angemeldete Nutzer sofort live ändern darf. Nutzer setzen schlechte Änderungen selbst zurück und melden Probleme; Moderatoren bearbeiten Meldungen, führen Duplikate zusammen, blenden unbrauchbare Einträge aus, sperren Störer und machen deren Änderungen in einem Schritt rückgängig.

## Begriffe

| Begriff | Bedeutung |
|---|---|
| **Eintrag** | Eine Zutat oder ein öffentlicher Tee. |
| **Zurücksetzen** | Den Inhalt einer älteren Version als neue Version speichern. Die Historie bleibt vollständig erhalten. |
| **Meldung** | Hinweis eines Nutzers auf ein Problem mit einem Eintrag, mit Grund. Offen, bis ein Moderator sie abschließt. |
| **Zusammenführen** | Ein Duplikat (Quelle) wird in einen anderen Eintrag (Ziel) überführt. Verweise zeigen danach auf das Ziel, die Quelle leitet weiter. |
| **Ausblenden** | Weiches Löschen: Der Eintrag ist für alle außer Moderatoren nicht mehr vorhanden, bleibt aber gespeichert und lässt sich wiederherstellen. |
| **Sperre** | Ein Konto kann sich bis zu einem Zeitpunkt (oder unbefristet) nicht anmelden. |
| **Moderationsbereich** | Seiten unter `/admin`, die Moderatoren und Admins sehen. |

## User Stories

- **US-1:** Als Nutzer möchte ich einen Eintrag auf eine ältere Version zurücksetzen, damit ich Fehler oder Vandalismus selbst beheben kann.
- **US-2:** Als Nutzer möchte ich einen Eintrag melden, wenn ich ein Problem nicht selbst lösen kann (z.B. Duplikat, Spam).
- **US-3:** Als Moderator möchte ich offene Meldungen sehen und abschließen.
- **US-4:** Als Moderator möchte ich doppelte Zutaten oder Tees zusammenführen, damit Tees, Suche und spätere Empfehlungen auf einem Eintrag beruhen.
- **US-5:** Als Moderator möchte ich unbrauchbare Einträge ausblenden und versehentlich ausgeblendete wiederherstellen.
- **US-6:** Als Moderator möchte ich Nutzer befristet oder dauerhaft sperren und wieder entsperren.
- **US-7:** Als Moderator möchte ich alle Änderungen eines Nutzers ab einem Zeitpunkt in einem Schritt zurücksetzen.
- **US-8:** Als Admin möchte ich alle Moderationsaktionen im Audit-Log nachvollziehen.

## Akzeptanzkriterien

### Zugang
- **AK-0.1:** Moderatoren und Admins sehen im Nutzermenü den Eintrag „Moderation“ und haben Zugriff auf den Moderationsbereich (Meldungen, Ausgeblendet, Nutzer sperren). Rollenverwaltung, Passwort-Reset und Audit-Log bleiben Admins vorbehalten.
- **AK-0.2:** Die Moderations-API antwortet Gästen mit 401 und Nutzern mit 403; für jede Route gibt es einen API-Test dazu (wie 02, AK-7.3).

### US-1 – Zurücksetzen
- **AK-1.1:** WENN ein angemeldeter Nutzer in der Historie einer Zutat oder eines öffentlichen Tees bei einer älteren Version „Auf diese Version zurücksetzen“ bestätigt, DANN entsteht sofort eine neue Version mit genau dem Inhalt dieser Version (alle Felder, Übersetzungen, bei Tees Zutaten mit Reihenfolge und Anteilen), mit ihm als Autor, der Kennzeichnung „Zurückgesetzt auf Version n“ (übersetzt angezeigt, nicht Teil der Notiz) und optionaler eigener Notiz (max. 200 Zeichen).
- **AK-1.2:** Bei privaten Tees darf nur der Ersteller zurücksetzen; für andere bleibt der Tee 404 (04, AK-1.7).
- **AK-1.3:** Konfliktschutz (409 `EDIT_CONFLICT`), „keine Änderung → keine Version“, Duplikatregel (409 `DUPLICATE_NAME`) und das gemeinsame Rate-Limit (30 Änderungen in 10 Minuten) gelten wie beim Bearbeiten.
- **AK-1.4:** Die Sichtbarkeit eines Tees wird beim Zurücksetzen nie geändert: Ein öffentlicher Tee bleibt öffentlich, auch wenn die Zielversion privat war (04, AK-4.3).
- **AK-1.5:** WENN die Zielversion eines Tees eine Zutat enthält, die inzwischen zusammengeführt wurde, DANN steht in der neuen Version die Zielzutat (Regel wie AK-4.3). WENN sie eine ausgeblendete Zutat enthält, DANN wird mit 409 `INGREDIENT_UNAVAILABLE` abgelehnt und die Zutat genannt.
- **AK-1.6:** Gäste sehen den Knopf nicht; die API antwortet ihnen mit 401.

### US-2 – Melden
- **AK-2.1:** WENN ein angemeldeter Nutzer auf der Detailseite eines Eintrags „Melden“ wählt, DANN wählt er einen Grund aus der festen Liste `Duplikat`, `Falsche Angaben`, `Spam / Werbung`, `Unangemessen`, `Sonstiges` und kann einen Kommentar angeben (max. 500 Zeichen, Pflicht bei `Sonstiges`).
- **AK-2.2:** Beim Grund `Duplikat` wählt er den vermeintlichen Original-Eintrag gleicher Art über eine Suche aus (Pflicht).
- **AK-2.3:** Nach dem Absenden sieht er eine Bestätigung; der Eintrag selbst bleibt unverändert sichtbar.
- **AK-2.4:** WENN derselbe Nutzer denselben Eintrag erneut meldet, während seine Meldung noch offen ist, DANN wird mit 409 `ALREADY_REPORTED` abgelehnt.
- **AK-2.5:** Ein Nutzer kann höchstens 10 Meldungen pro Stunde absenden, danach 429 `RATE_LIMITED`.
- **AK-2.6:** Private Tees und ausgeblendete Einträge lassen sich nicht melden (404). Gäste sehen statt „Melden“ einen Hinweis zum Anmelden; die API antwortet ihnen mit 401.

### US-3 – Meldungen bearbeiten
- **AK-3.1:** WENN ein Moderator `/admin/reports` aufruft, DANN sieht er die offenen Meldungen nach Eintrag gruppiert, älteste zuerst, jeweils mit Eintrag (Link), Gründen, Kommentaren, Anzahl und Melder (Anzeigename), seitenweise (25 Einträge pro Seite), filterbar nach Grund und Art (Zutat/Tee).
- **AK-3.2:** Von der Meldung aus erreicht er direkt Historie, Zusammenführen (bei `Duplikat` mit vorausgewähltem Ziel), Ausblenden und das Sperren des letzten Autors.
- **AK-3.3:** WENN ein Moderator die Meldungen eines Eintrags als `erledigt` oder `abgelehnt` abschließt (optionale Notiz, max. 500 Zeichen), DANN verschwinden sie aus der offenen Liste und bleiben unter „Abgeschlossen“ mit Moderator, Zeitpunkt und Notiz sichtbar.
- **AK-3.4:** WENN ein Eintrag zusammengeführt oder ausgeblendet wird, DANN werden seine offenen Meldungen automatisch als `erledigt` abgeschlossen.
- **AK-3.5:** Im Moderationsbereich ist die Anzahl offener Meldungen zu sehen (Badge am Menüeintrag „Moderation“).

### US-4 – Zusammenführen
- **AK-4.1:** WENN ein Moderator Quelle und Ziel gleicher Art wählt (zwei Zutaten oder zwei öffentliche Tees), DANN zeigt eine Vorschau beide Einträge nebeneinander und – bei Zutaten – die Anzahl der Tees, die geändert werden (private nur als Zahl). Erst nach Bestätigung wird zusammengeführt. Quelle und Ziel dürfen nicht gleich, ausgeblendet oder bereits zusammengeführt sein (400).
- **AK-4.2:** Nach dem Zusammenführen ist die Quelle nicht mehr in Liste, Suche, „ähnliche Einträge“ und Zutatenauswahl. Ihre URL leitet dauerhaft auf das Ziel weiter (Seite: Weiterleitung mit Hinweis „wurde mit … zusammengeführt“); ihre Historie bleibt unter der alten URL lesbar. Die API antwortet für die Quelle mit 404 und nennt im Fehler das Ziel (`mergedInto`).
- **AK-4.3:** Beim Zusammenführen von Zutaten erhält jeder Tee (öffentlich und privat), dessen aktuelle Version die Quelle enthält, eine neue Version mit der Zielzutat an derselben Stelle; Autor ist der Moderator, Kennzeichnung „Zutat zusammengeführt: Quelle → Ziel“. Enthält der Tee Quelle **und** Ziel, bleibt das Ziel an seiner Position, die Quelle entfällt, und die Anteile werden addiert, wenn beide angegeben sind; sonst gilt der angegebene Anteil bzw. „ohne Angabe“.
- **AK-4.4:** Ältere Versionen werden nicht verändert; im Versionsvergleich verlinkt eine zusammengeführte Zutat auf das Ziel.
- **AK-4.5:** Übersetzungen der Quelle, die dem Ziel fehlen, werden nicht automatisch übernommen; die Vorschau weist darauf hin, und der Moderator kann das Ziel vorher bearbeiten.
- **AK-4.6:** Zusammenführen ist in 05 nicht rückgängig zu machen; die Bestätigung sagt das.
- **AK-4.7:** Zusammenführen läuft vollständig oder gar nicht (eine Transaktion). WENN währenddessen ein betroffener Tee geändert wird, DANN gewinnt die Zusammenführung nicht still: entweder wird der Tee mit der neuen Fassung umgestellt oder der Vorgang mit 409 abgebrochen.

### US-5 – Ausblenden und Wiederherstellen
- **AK-5.1:** WENN ein Moderator einen Eintrag mit Grund (max. 500 Zeichen, Pflicht) ausblendet, DANN ist er für alle anderen sofort nicht mehr vorhanden: Detailseite, Historie und API antworten 404; Liste, Suche, „ähnliche Einträge“, Zutatenauswahl und die Tees-Liste einer Zutat zeigen ihn nicht.
- **AK-5.2:** WENN eine Zutat noch in der aktuellen Version eines Tees (auch privat) vorkommt, DANN wird das Ausblenden mit 409 `INGREDIENT_IN_USE` und der Anzahl der Tees abgelehnt; der Hinweis schlägt Zusammenführen vor.
- **AK-5.3:** Ausgeblendete Einträge zählen nicht für die Duplikatregel (03, AK-2.3; 04, AK-2.4).
- **AK-5.4:** WENN ein Moderator `/admin/hidden` aufruft, DANN sieht er die ausgeblendeten Einträge neueste zuerst mit Grund, Moderator und Zeitpunkt und kann sie ansehen (inkl. Historie).
- **AK-5.5:** WENN ein Moderator einen ausgeblendeten Eintrag wiederherstellt, DANN ist er unverändert wieder sichtbar. WENN inzwischen ein gleichnamiger Eintrag existiert, DANN wird mit 409 `DUPLICATE_NAME` abgelehnt und der Eintrag verlinkt (Zusammenführen bleibt möglich).
- **AK-5.6:** Ausblenden und Wiederherstellen erzeugen keine neue Version, erscheinen aber in der Historie als Ereignis (wer, wann, Grund – Grund nur für Moderatoren).
- **AK-5.7:** Das Löschen privater Tees durch ihren Ersteller (04, AK-3.6) bleibt unverändert endgültig.

### US-6 – Sperren
- **AK-6.1:** WENN ein Moderator einen Nutzer mit Dauer (`24 Stunden`, `7 Tage`, `30 Tage`, `unbefristet`) und Grund (max. 500 Zeichen, Pflicht) sperrt, DANN enden alle Sessions des Nutzers sofort, und Anmeldeversuche werden bis zum Ablauf abgelehnt.
- **AK-6.2:** WENN ein gesperrter Nutzer das richtige Passwort eingibt, DANN sieht er „Dein Konto ist gesperrt bis <Datum, Uhrzeit>“ bzw. „… ist dauerhaft gesperrt“; bei falschem Passwort bleibt die allgemeine Meldung (02, AK-2.2), damit Sperren nicht ohne Passwort erkennbar sind. Der Grund wird ihm nicht angezeigt.
- **AK-6.3:** WENN eine befristete Sperre abläuft, DANN kann sich der Nutzer ohne weiteres Zutun wieder anmelden.
- **AK-6.4:** WENN ein Moderator einen Nutzer entsperrt, DANN gilt das sofort.
- **AK-6.5:** Moderatoren können nur Nutzer mit Rolle `user` sperren; Admins zusätzlich Moderatoren. Admins sind nicht sperrbar (vorher Rolle ändern), niemand kann sich selbst sperren (jeweils 403). Entsperren: Moderatoren nur Nutzer mit Rolle `user`, Admins jeden, auch einen inzwischen beförderten Admin (Nachtrag aus Chore 13, 2026-10-24).
- **AK-6.6:** WENN ein Moderator `/admin/moderation/users` aufruft, DANN findet er Nutzer per Suche nach Anzeigename (Moderatoren sehen keine E-Mail-Adressen, Admins schon), sieht Sperrstatus, Sperrgrund und Anzahl der Katalogänderungen der letzten 30 Tage und kann sperren, entsperren und US-7 auslösen. Gesperrte Nutzer sind filterbar.
- **AK-6.7:** Beiträge gesperrter Nutzer bleiben sichtbar, bis sie zurückgesetzt werden (US-7).
- **AK-6.8:** Eine Verlängerung oder Verkürzung erfolgt durch erneutes Sperren; der neue Zeitpunkt ersetzt den alten.

### US-7 – Alle Änderungen eines Nutzers zurücksetzen
- **AK-7.1:** WENN ein Moderator für einen Nutzer „Änderungen zurücksetzen“ mit Zeitraum (`24 Stunden`, `7 Tage`, `30 Tage`, ab Datum) wählt, DANN zeigt eine Vorschau alle betroffenen öffentlichen Einträge, die der Nutzer in diesem Zeitraum geändert oder angelegt hat.
- **AK-7.2:** Nach Bestätigung wird jeder geänderte Eintrag auf die letzte Version **vor** der ersten Änderung des Nutzers im Zeitraum zurückgesetzt (Regeln wie US-1, Autor ist der Moderator, Kennzeichnung „Massen-Zurücksetzung: Änderungen von <Name>“).
- **AK-7.3:** WENN ein Eintrag nach dem Nutzer von jemand anderem geändert wurde, DANN wird er übersprungen und im Ergebnis zur Einzelprüfung aufgelistet.
- **AK-7.4:** Einträge, die der Nutzer im Zeitraum neu angelegt hat, werden ausgeblendet (Grund „Massen-Zurücksetzung“); Zutaten, die danach noch in einem Tee verwendet werden (auch in privaten Tees des Nutzers), werden übersprungen und aufgelistet (AK-5.2).
- **AK-7.5:** Private Tees des Nutzers bleiben unberührt. Das Ergebnis nennt die Anzahl zurückgesetzter, ausgeblendeter und übersprungener Einträge.
- **AK-7.6:** Das Rate-Limit aus 03 gilt für Massen-Zurücksetzungen nicht.

### US-8 – Audit
- **AK-8.1:** Folgende Ereignisse werden im Audit-Log gespeichert, mit Eintrags-ID und je nach Ereignis Versionsnummer, Ziel, Grund oder Dauer in den Details: `INGREDIENT_REVERTED`, `TEA_REVERTED`, `REPORT_CREATED`, `REPORT_RESOLVED`, `INGREDIENT_MERGED`, `TEA_MERGED`, `INGREDIENT_HIDDEN`, `INGREDIENT_RESTORED`, `TEA_HIDDEN`, `TEA_RESTORED`, `USER_BLOCKED`, `USER_UNBLOCKED`, `BULK_REVERT` (mit Zählern). Die durch Zusammenführen geänderten Tees bekommen kein eigenes `TEA_UPDATED`, sondern stehen gezählt in `INGREDIENT_MERGED`.
- **AK-8.2:** Die Ereignisse sind in `/admin/audit` übersetzt und filterbar; private Tees werden auch hier nicht verlinkt (04, AK-9.1).

### Übergreifend
- **AK-9.1:** Alle Eingaben werden serverseitig mit zod geprüft; Fehler erscheinen übersetzt am Feld.
- **AK-9.2:** Gründe, Kommentare und Notizen werden als Text ausgegeben, nie als HTML; Melder sehen niemals die Kommentare anderer Melder.
- **AK-9.3:** Jede Aktion, die etwas ausblendet, zusammenführt, sperrt oder massenhaft zurücksetzt, verlangt eine Bestätigung im Dialog.
- **AK-9.4:** Alle neuen UI-Texte in `de.json` und `en.json`; alle neuen Seiten bei 360 px ohne horizontales Scrollen; keine CSP-Verstöße; heller und dunkler Modus lesbar.
- **AK-9.5:** Unit- und API-Tests decken Zurücksetzen (inkl. Konflikt, zusammengeführter/ausgeblendeter Zutat, Sichtbarkeit), Melden (inkl. Doppelmeldung, Rate-Limit), Meldungen abschließen, Zusammenführen (inkl. Tee mit Quelle und Ziel, private Tees, Weiterleitung), Ausblenden/Wiederherstellen (inkl. `INGREDIENT_IN_USE`, Duplikat), Sperren (inkl. Ablauf, Sessions, Rollenregeln, Login-Meldung), Massen-Zurücksetzen (inkl. Überspringen) und alle Rechte (401/403/404) ab.

## Nicht im Umfang

- Rückgängigmachen einer Zusammenführung
- Endgültiges Löschen öffentlicher Einträge (nur Ausblenden)
- Melden von Nutzern, Bewertungen oder Versionen; Meldungen durch Gäste
- Benachrichtigungen an Melder oder Gesperrte (kein Mailversand im MVP); Melder sehen den Status ihrer Meldungen nicht
- Automatische Spam-Erkennung, Freigabe-Warteschlange vor dem Livegang
- Sperren nach IP-Adresse
- Schutz einzelner Einträge vor Bearbeitung (Seitenschutz)
- Zusammenführen privater Tees

## Entscheidungen

- Zurücksetzen auf ältere Versionen dürfen alle angemeldeten Nutzer (Wiki-Prinzip); Moderatoren können zusätzlich alle Änderungen eines Nutzers auf einmal zurücksetzen (Entscheidung des Nutzers, 2026-10-23). Overview §3 entsprechend angepasst.
- Zusammenführen hängt die Tees auf die Zielzutat um (neue Version), die Quelle leitet weiter, ihre Historie bleibt lesbar; Tees lassen sich ebenso zusammenführen (Entscheidung des Nutzers, 2026-10-23).
- Sperren befristet oder unbefristet, mit Grund, Entsperren jederzeit (Entscheidung des Nutzers, 2026-10-23).
- Moderatoren löschen öffentliche Einträge nur weich (Ausblenden, wiederherstellbar); Zutaten nur, wenn kein Tee sie verwendet (Entscheidung des Nutzers, 2026-10-23).

## Vorschläge zur Bestätigung

Vom Nutzer mit der Freigabe bestätigt (2026-10-23):

1. **Feste Meldegründe** `Duplikat`, `Falsche Angaben`, `Spam / Werbung`, `Unangemessen`, `Sonstiges`; bei `Duplikat` ist das Original Pflicht (AK-2.1, AK-2.2).
2. **Rate-Limit 10 Meldungen pro Stunde**, keine zweite offene Meldung desselben Nutzers zum selben Eintrag (AK-2.4, AK-2.5).
3. **Moderatoren sehen keine E-Mail-Adressen**, nur Anzeigenamen; Audit-Log bleibt Admins vorbehalten (AK-0.1, AK-6.6).
4. **Sperrdauern** 24 h / 7 Tage / 30 Tage / unbefristet; Admins sind nicht sperrbar, Moderatoren nur durch Admins (AK-6.1, AK-6.5).
5. **Gesperrte sehen ihre Sperre nur nach richtigem Passwort**, den Grund gar nicht (AK-6.2).
6. **Anteile beim Zusammenführen werden addiert**, wenn ein Tee Quelle und Ziel enthält (AK-4.3).
7. **Massen-Zurücksetzen blendet vom Nutzer neu angelegte Einträge aus** und überspringt alles, was danach andere geändert haben (AK-7.3, AK-7.4).
8. **Ausblenden erzeugt keine Version**, aber einen Eintrag in der Historie (AK-5.6).
9. **Seiten** `/admin/reports`, `/admin/hidden`, `/admin/moderation/users` (AK-3.1, AK-5.4, AK-6.6).

## Offene Fragen

- keine (außer den Vorschlägen oben)
