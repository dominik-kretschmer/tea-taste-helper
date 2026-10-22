// Befördert beim Serverstart ein bestehendes Konto mit ADMIN_EMAIL zum Admin (AK-4.2).
// Neue Konten mit dieser Adresse werden schon bei der Registrierung Admin (AK-4.1).
export default defineNitroPlugin(async () => {
  if (import.meta.prerender) return
  const adminEmail = useEnv().ADMIN_EMAIL
  if (!adminEmail) return

  try {
    const prisma = usePrisma()
    const user = await prisma.user.findUnique({ where: { email: adminEmail } })
    if (!user || user.role === 'admin') return

    await prisma.user.update({ where: { id: user.id }, data: { role: 'admin' } })
    await audit(null, { event: 'ADMIN_BOOTSTRAPPED', targetId: user.id, details: { via: 'startup', from: user.role } })
    useLogger().info({ userId: user.id }, 'ADMIN_EMAIL account promoted to admin')
  }
  catch (err) {
    // Den Serverstart nicht verhindern, z.B. wenn die DB noch nicht erreichbar ist
    useLogger().error({ err }, 'admin bootstrap failed')
  }
})
