type LogValue = boolean | number | string | null | undefined;
export type LogFields = Record<string, LogValue>;

function entry(level: "error" | "info", event: string, fields: LogFields) {
  return {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...fields,
  };
}

export function logInfo(event: string, fields: LogFields = {}) {
  console.info(JSON.stringify(entry("info", event, fields)));
}

export function logErrorEvent(event: string, fields: LogFields = {}) {
  console.error(JSON.stringify(entry("error", event, fields)));
}

export function logError(event: string, cause: unknown, fields: LogFields = {}) {
  const errorName = cause instanceof Error ? cause.name : "UnknownError";
  logErrorEvent(event, { ...fields, error_name: errorName });
}
