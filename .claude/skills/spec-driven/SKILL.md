---
name: spec-driven
description: Spec-Driven Development für "tea-taste-helper". Verwenden, wenn ein neues Feature oder eine größere Änderung geplant und umgesetzt werden soll – zuerst Anforderungen, dann Design, dann Aufgaben, erst danach Code. Auch verwenden, wenn eine bestehende Spec in `specs/` fortgesetzt, geändert oder abgearbeitet werden soll.
---

# Spec-Driven Development

Jedes Feature entsteht in drei Dokumenten, bevor Code geschrieben wird. Jede Phase wird vom Nutzer freigegeben, bevor die nächste beginnt. Die Spec ist die Quelle der Wahrheit: Weicht der Code davon ab, wird zuerst die Spec angepasst.

## Ablage

```
specs/
  <feature-name>/          # kebab-case, z.B. tee-bewertung
    requirements.md        # Phase 1: WAS und WARUM
    design.md              # Phase 2: WIE
    tasks.md               # Phase 3: Umsetzungsschritte
```

Vor dem Anlegen in `specs/` nachsehen, ob es zum Thema schon eine Spec gibt. Wenn ja, diese fortsetzen statt eine neue anzulegen.

## Phase 1 – Anforderungen (`requirements.md`)

Unklarheiten zuerst mit dem Nutzer klären, nicht raten.

```markdown
# <Feature-Name>

## Ziel
Ein bis zwei Sätze: welches Problem wird für wen gelöst.

## User Stories
- **US-1:** Als <Rolle> möchte ich <Aktion>, damit <Nutzen>.

## Akzeptanzkriterien
- **AK-1.1** (zu US-1): WENN <Bedingung>, DANN <erwartetes Verhalten>.
- **AK-1.2** (zu US-1): ...

## Nicht im Umfang
- Was bewusst ausgeklammert wird.

## Offene Fragen
- ...
```

Jedes Akzeptanzkriterium muss prüfbar sein (im Browser, per `curl` oder durch einen Test). Formulierungen wie „schnell“ oder „benutzerfreundlich“ durch messbare Aussagen ersetzen.

**Stopp:** Dem Nutzer die Anforderungen zeigen und auf Freigabe warten.

## Phase 2 – Design (`design.md`)

Erst den bestehenden Code lesen (`app/`, `server/`, `nuxt.config.ts`), dann das Design passend dazu entwerfen.

```markdown
# Design: <Feature-Name>

## Überblick
Kurze Beschreibung des Lösungsansatzes.

## Betroffene Dateien
| Datei | Neu/Geändert | Zweck |
|-------|--------------|-------|
| app/pages/... | neu | ... |
| server/api/... | neu | ... |

## Datenmodell
TypeScript-Typen/Interfaces der neuen Daten.

## API
| Methode | Route | Request | Response | Fehler |
|---------|-------|---------|----------|--------|

## UI / Komponenten
Seiten, Komponenten und ihr Zusammenspiel.

## Entscheidungen
- Entscheidung – Begründung – verworfene Alternative.

## Abdeckung
| Akzeptanzkriterium | Umgesetzt durch |
|--------------------|-----------------|
| AK-1.1 | ... |
```

Jedes Akzeptanzkriterium aus Phase 1 muss in der Abdeckungstabelle vorkommen.

**Stopp:** Dem Nutzer das Design zeigen und auf Freigabe warten.

## Phase 3 – Aufgaben (`tasks.md`)

Das Design in kleine, einzeln prüfbare Schritte zerlegen, in sinnvoller Reihenfolge (Typen → Server → UI).

```markdown
# Aufgaben: <Feature-Name>

- [ ] 1. <Aufgabe>
  - Dateien: ...
  - Erfüllt: AK-1.1
  - Prüfung: <wie man sieht, dass es funktioniert>
- [ ] 2. ...
```

**Stopp:** Dem Nutzer die Aufgabenliste zeigen und auf Freigabe warten.

## Phase 4 – Umsetzung

1. Aufgaben der Reihe nach abarbeiten, immer nur eine gleichzeitig.
2. Nach jeder Aufgabe die angegebene Prüfung durchführen (App starten und prüfen wie im Skill `nuxt-dev` beschrieben).
3. Erledigte Aufgaben in `tasks.md` abhaken (`- [x]`).
4. Stellt sich heraus, dass Anforderung oder Design nicht passen: anhalten, Spec-Änderung mit dem Nutzer abstimmen, Dokument aktualisieren, dann weitermachen.
5. Zum Abschluss:
   - `npm run build` muss fehlerfrei durchlaufen.
   - Jedes Akzeptanzkriterium einzeln prüfen und das Ergebnis dem Nutzer melden.

## Regeln

- Kein Feature-Code, bevor Anforderungen, Design und Aufgaben freigegeben sind. Kleine Bugfixes brauchen keine Spec.
- Die Kennungen (US-x, AK-x.y) bleiben stabil, damit Design und Aufgaben darauf verweisen können.
- Der Nutzer kann Phasen ausdrücklich zusammenfassen („mach Design und Tasks in einem“). Dann trotzdem alle Dokumente anlegen.
