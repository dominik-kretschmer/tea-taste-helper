// Ohne JIT: zod testet sonst per `new Function`, ob eval erlaubt ist, und löst damit bei
// unserer CSP (kein 'unsafe-eval') auf jeder Seite mit Formular einen Verstoß aus (00-chore/08).
// Die Probe läuft schon beim Erzeugen eines Schemas – daher importieren alle Schema-Dateien `z`
// von hier, damit der Schalter vor dem ersten Schema gesetzt ist.
import { z } from 'zod'

z.config({ jitless: true })

export { z }
