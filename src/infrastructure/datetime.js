export const LIMA_TIMEZONE = "America/Lima";

const formatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: LIMA_TIMEZONE,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit",
  hourCycle: "h23"
});

function parts(now) {
  return Object.fromEntries(formatter.formatToParts(now)
    .map(({ type, value }) => [type, value]));
}

export function formatDateTimePeru(now = new Date()) {
  const p = parts(now);
  return `${p.year}/${p.month}/${p.day} ${p.hour}:${p.minute}:${p.second}`;
}

export function currentDatePeru(now = new Date()) {
  const p = parts(now);
  return `${p.day}/${p.month}/${p.year}`;
}

export function previousDatePeru(now = new Date()) {
  const p = parts(now);
  const previous = new Date(Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day) - 1));
  return [
    String(previous.getUTCDate()).padStart(2, "0"),
    String(previous.getUTCMonth() + 1).padStart(2, "0"),
    previous.getUTCFullYear()
  ].join("/");
}

export function queryDateTime(date) {
  if (typeof date !== "string" || !/^\d{2}\/\d{2}\/\d{4}$/.test(date)) {
    throw new Error("La fecha debe tener formato DD/MM/YYYY");
  }
  const [day, month, year] = date.split("/").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 ||
      parsed.getUTCDate() !== day) {
    throw new Error("La fecha de consulta no es válida");
  }
  return `${String(year).padStart(4, "0")}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")} 00:00:00`;
}
