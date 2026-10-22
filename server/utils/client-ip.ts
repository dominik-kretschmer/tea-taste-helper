import type { H3Event } from 'h3'

/**
 * Wählt die Client-IP. X-Forwarded-For wird nur hinter einem vertrauenswürdigen Proxy ausgewertet,
 * sonst könnte jeder Client sich per Header eine beliebige IP geben (und das Rate-Limit umgehen).
 */
export function pickClientIp(
  forwardedFor: string | undefined,
  socketAddress: string | undefined,
  trustProxy: boolean,
): string {
  if (trustProxy && forwardedFor) {
    const first = forwardedFor.split(',')[0]?.trim()
    if (first) return first
  }
  return socketAddress || 'unknown'
}

export function getClientIp(event: H3Event): string {
  return pickClientIp(
    getRequestHeader(event, 'x-forwarded-for'),
    event.node.req.socket?.remoteAddress,
    useEnv().TRUST_PROXY,
  )
}
