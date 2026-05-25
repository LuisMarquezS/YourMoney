export const money = (value: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);

export const numberValue = (value: unknown) => {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  const cleaned = value.replace(/[^\d,.-]/g, "");
  const normalized = cleaned.includes(",")
    ? cleaned.replace(/\./g, "").replace(",", ".")
    : cleaned;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const importedDate = (value: unknown) => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    const parsed = new Date(Math.round((value - 25569) * 86400 * 1000));
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  const text = String(value ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(text)) return text.slice(0, 10);
  const match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (!match) return today();
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]) < 100 ? 2000 + Number(match[3]) : Number(match[3]);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(parsed.getTime())) return today();
  return parsed.toISOString().slice(0, 10);
};

export const today = () => new Date().toISOString().slice(0, 10);

export const readableDate = (date: string) => {
  if (!date) return "-";
  return new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${date}T12:00:00`));
};

export const monthKey = (date: string) => date.slice(0, 7);

export const downloadFile = (filename: string, content: BlobPart, type: string) => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};
