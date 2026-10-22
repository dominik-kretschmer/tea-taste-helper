import pino, { type DestinationStream, type Logger } from 'pino'

const SENSITIVE_KEYS = ['password', 'token', 'authorization', 'cookie']

// pino kennt nur `*` für genau eine Ebene; daher jede Tiefe bis 3 einzeln (z.B. req.headers.cookie).
export const redactPaths = SENSITIVE_KEYS.flatMap(key => [key, `*.${key}`, `*.*.${key}`, `*.*.*.${key}`])

export interface LoggerOptions {
  level: string
  pretty?: boolean
  destination?: DestinationStream
}

export function createLogger({ level, pretty = false, destination }: LoggerOptions): Logger {
  const options = {
    level,
    redact: { paths: redactPaths, censor: '[REDACTED]' },
    ...(pretty && !destination ? { transport: { target: 'pino-pretty' } } : {}),
  }
  return destination ? pino(options, destination) : pino(options)
}

let base: Logger | undefined

/** Basislogger des Servers; innerhalb einer Anfrage stattdessen `event.context.log` verwenden. */
export function useLogger(): Logger {
  if (!base) {
    const env = useEnv()
    base = createLogger({ level: env.LOG_LEVEL, pretty: env.NODE_ENV === 'development' })
  }
  return base
}
