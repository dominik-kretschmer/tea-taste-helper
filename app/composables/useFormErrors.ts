import type { z } from 'zod'

export interface ApiErrorInfo {
  code?: string
  details?: unknown
}

/**
 * Prüft Formulare mit denselben zod-Schemas wie der Server und übersetzt Fehler
 * in die aktuelle Sprache (AK-1.5); bekannte API-Fehlercodes kommen aus `errors.<CODE>`.
 */
export function useFormErrors() {
  const { t, te } = useI18n()
  const fieldErrors = ref<Record<string, string>>({})
  const formError = ref<string | null>(null)

  function issueMessage(issue: z.core.$ZodIssue): string {
    switch (issue.code) {
      case 'too_small':
        if (issue.origin === 'number') return t('validation.min', { min: Number(issue.minimum) })
        return Number(issue.minimum) <= 1 ? t('validation.required') : t('validation.tooShort', { min: Number(issue.minimum) })
      case 'too_big':
        if (issue.origin === 'number') return t('validation.max', { max: Number(issue.maximum) })
        return t('validation.tooLong', { max: Number(issue.maximum) })
      case 'invalid_format':
        return issue.format === 'email' ? t('validation.email') : t('validation.invalid')
      default:
        return t('validation.invalid')
    }
  }

  function reset() {
    fieldErrors.value = {}
    formError.value = null
  }

  /** Liefert die geprüften Daten oder null und füllt dann `fieldErrors` (Schlüssel = Pfad, z.B. `translations.en.name`). */
  function validate<S extends z.ZodType>(schema: S, values: unknown): z.output<S> | null {
    reset()
    const result = schema.safeParse(values)
    if (result.success) return result.data
    const errors: Record<string, string> = {}
    for (const issue of result.error.issues) {
      const field = issue.path.map(String).join('.')
      errors[field] ??= issueMessage(issue)
    }
    fieldErrors.value = errors
    return null
  }

  /** Zeigt einen API-Fehler als Formularmeldung an und liefert Code und Details für Sonderfälle. */
  function handleError(error: unknown): ApiErrorInfo {
    const body = (error as { data?: { error?: ApiErrorInfo } })?.data?.error
    const code = body?.code
    formError.value = code && te(`errors.${code}`) ? t(`errors.${code}`) : t('errors.UNKNOWN')
    return { code, details: body?.details }
  }

  return { fieldErrors, formError, validate, handleError, reset }
}

/** Nur interne Pfade als Ziel nach dem Login zulassen (kein Open Redirect über ?redirect=//evil). */
export function safeRedirect(target: unknown, fallback: string): string {
  return typeof target === 'string' && target.startsWith('/') && !target.startsWith('//') ? target : fallback
}
