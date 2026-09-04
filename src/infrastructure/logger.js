import { formatDateTimePeru } from "./datetime.js";

function write(level, event, details = {}) {
  const payload = {
    loggedAt: formatDateTimePeru(),
    level,
    event,
    ...details
  };

  const output = JSON.stringify(payload);
  if (level === "error") console.error(output);
  else if (level === "warn") console.warn(output);
  else console.log(output);
}

export const logger = {
  info: (event, details) => write("info", event, details),
  warn: (event, details) => write("warn", event, details),
  error: (event, details) => write("error", event, details)
};
