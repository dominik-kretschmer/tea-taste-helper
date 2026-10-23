/**
 * Anzahl der Einträge mit offenen Meldungen für das Badge (05 AK-3.5). Kein Polling: geladen beim
 * Öffnen des Nutzermenüs und auf den Moderationsseiten, nach Änderungen per `refresh()`.
 */
export function useOpenReports() {
  const count = useState<number | null>('moderation:open-reports', () => null)
  const { isModerator } = useAuth()

  async function refresh() {
    if (!isModerator.value) return
    try {
      count.value = (await $fetch<{ open: number }>('/api/admin/reports/count')).open
    }
    catch {
      // Das Badge ist nur ein Hinweis; ein Ladefehler soll das Menü nicht stören
    }
  }

  return { count: readonly(count), refresh }
}
