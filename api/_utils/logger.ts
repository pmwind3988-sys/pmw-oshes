type LogLevel = "info" | "warn" | "error";

type LogMeta = Record<string, string | number | boolean | null | undefined>;

const LEVEL_RANK: Record<LogLevel, number> = {
  info: 20,
  warn: 30,
  error: 40,
};

function configuredLevel(): LogLevel {
  const raw = process.env.API_LOG_LEVEL;
  if (raw === "info" || raw === "warn" || raw === "error") return raw;
  return process.env.NODE_ENV === "production" ? "warn" : "info";
}

function shouldLog(level: LogLevel): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[configuredLevel()];
}

function errorToMeta(error: unknown): LogMeta {
  if (error instanceof Error) {
    return { errorName: error.name, errorMessage: error.message };
  }
  return { errorMessage: String(error) };
}

function writeLog(level: LogLevel, scope: string, message: string, meta?: LogMeta): void {
  if (!shouldLog(level)) return;
  process.stderr.write(`${JSON.stringify({
    level,
    scope,
    message,
    ...(meta ?? {}),
  })}\n`);
}

export function logInfo(scope: string, message: string, meta?: LogMeta): void {
  writeLog("info", scope, message, meta);
}

export function logWarn(scope: string, message: string, meta?: LogMeta): void {
  writeLog("warn", scope, message, meta);
}

export function logError(scope: string, message: string, error?: unknown, meta?: LogMeta): void {
  writeLog("error", scope, message, {
    ...(error === undefined ? {} : errorToMeta(error)),
    ...(meta ?? {}),
  });
}
