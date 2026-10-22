import type { H3Event } from 'h3'

/**
 * Wählt die Client-IP. X-Forwarded-For wird nur hinter einem vertrauenswürdigen Proxy ausgewertet,
 * sonst könnte jeder Client sich per Header eine beliebige IP geben (und das Rate-Limit umgehen).
 * Genommen wird der letzte Eintrag: Den hängt unser Proxy an; alles davor kann der Client selbst
 * mitgeschickt haben.
 */
export function pickClientIp(
  forwardedFor: string | undefined,
  socketAddress: string | undefined,
  trustProxy: boolean,
): string {
  if (trustProxy && forwardedFor) {
    const last = forwardedFor.split(',').at(-1)?.trim()
    if (last) return last
  }
  return socketAddress || 'unknown'
}

export function getClientIp(event: H3Event): string {
  return pickClientIp(
    getRequestHeader(event, 'x-forwarded-for'),
    // ohne X-Forwarded-For; kennt auch die von Nitro weitergereichte Adresse (Dev-Worker)
    getRequestIP(event),
    useEnv().TRUST_PROXY,
  )
}
