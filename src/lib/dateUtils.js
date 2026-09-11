const SHEETS_EPOCH_UTC_MS = Date.UTC(1899, 11, 30);
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function isSheetsSerialNumber(value) {
  return typeof value === "number" && !isNaN(value);
}

function serialToDate(serial) {
  return new Date(SHEETS_EPOCH_UTC_MS + serial * MS_PER_DAY);
}

function getDatePartsInTimezone(date, timezone) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = {};
  formatter.formatToParts(date).forEach((p) => {
    if (p.type !== "literal") parts[p.type] = parseInt(p.value, 10);
  });
  return {
    year: parts.year,
    month: parts.month - 1,
    day: parts.day,
    hour: parts.hour === 24 ? 0 : parts.hour,
    minute: parts.minute,
  };
}

/** Gabungkan cell TANGGAL (serial/string) + JAM (serial/string "HH.MM" atau "HH:MM") jadi Date UTC yang benar, dengan asumsi jam yang dimaksud adalah waktu Asia/Jakarta. */
function combineDateAndTime(tanggalCell, jamCell, timezone = "Asia/Jakarta") {
  if (!tanggalCell || !jamCell) return null;

  let year, month, day;
  if (isSheetsSerialNumber(tanggalCell)) {
    const d = serialToDate(tanggalCell);
    year = d.getUTCFullYear();
    month = d.getUTCMonth();
    day = d.getUTCDate();
  } else {
    const parts = String(tanggalCell).trim().split(/[\/\-]/);
    if (parts.length !== 3) return null;
    day = parseInt(parts[0], 10);
    month = parseInt(parts[1], 10) - 1;
    year = parseInt(parts[2], 10);
  }

  let hour, minute;
  if (isSheetsSerialNumber(jamCell)) {
    const fraction = jamCell - Math.floor(jamCell);
    const totalMinutes = Math.round(fraction * 24 * 60);
    hour = Math.floor(totalMinutes / 60);
    minute = totalMinutes % 60;
  } else {
    const jamStr = String(jamCell).trim().replace(".", ":");
    const parts = jamStr.split(":");
    if (parts.length < 2) return null;
    hour = parseInt(parts[0], 10);
    minute = parseInt(parts[1], 10);
  }

  if ([year, month, day, hour, minute].some((n) => isNaN(n))) return null;

  // Asumsikan input adalah waktu lokal Asia/Jakarta (WIB, UTC+7 tetap sepanjang tahun, tanpa DST) -> konversi ke UTC.
  return new Date(Date.UTC(year, month, day, hour - 7, minute, 0));
}

function nowMinutesInTimezone(timezone) {
  const parts = getDatePartsInTimezone(new Date(), timezone);
  return parts.hour * 60 + parts.minute;
}

function isSameDateInTimezone(tanggalCell, now, timezone) {
  let y, m, d;
  if (isSheetsSerialNumber(tanggalCell)) {
    const date = serialToDate(tanggalCell);
    y = date.getUTCFullYear();
    m = date.getUTCMonth();
    d = date.getUTCDate();
  } else if (typeof tanggalCell === "string" && tanggalCell.trim() !== "") {
    const parts = tanggalCell.trim().split(/[\/\-]/);
    if (parts.length !== 3) return false;
    d = parseInt(parts[0], 10);
    m = parseInt(parts[1], 10) - 1;
    y = parseInt(parts[2], 10);
  } else {
    return false;
  }
  const nowParts = getDatePartsInTimezone(now, timezone);
  return y === nowParts.year && m === nowParts.month && d === nowParts.day;
}

function toSheetDateString(date, timezone = "Asia/Jakarta") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const get = (type) => parts.find((p) => p.type === type).value;
  return `${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}:${get("second")}`;
}

/** Ambil {year, month, day} dari cell Tanggal (serial number ATAU string 
"DD/MM/YYYY"). null kalau kosong/invalid. */
function parseDatePartsFromCell(tanggalCell) {
  if (tanggalCell === "" || tanggalCell == null) return null;
  if (isSheetsSerialNumber(tanggalCell)) {
    const d = serialToDate(tanggalCell);
    return { year: d.getUTCFullYear(), month: d.getUTCMonth(), day: 
d.getUTCDate() };
  }
  const raw = String(tanggalCell).trim();
  if (!raw) return null;
  const parts = raw.split(/[\/\-]/);
  if (parts.length !== 3) return null;
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const year = parseInt(parts[2], 10);
  if ([year, month, day].some((n) => isNaN(n))) return null;
  return { year, month, day };
}

/**
 * Tanggal Upload sudah sampai (hari ini) atau sudah lewat, dibanding 
"now" di timezone tsb?
 * Kosong/invalid = anggap BELUM due (jangan publish sebelum tanggal
di-set eksplisit).
 */
function tanggalUploadDue(tanggalCell, now, timezone) {
  const cellParts = parseDatePartsFromCell(tanggalCell);
  if (!cellParts) return false; // kosong/invalid = BELUM due (jangan publish sebelum tanggal di-set eksplisit)
  const nowParts = getDatePartsInTimezone(now, timezone);
  const cellUTC = Date.UTC(cellParts.year, cellParts.month, 
cellParts.day);
  const nowUTC = Date.UTC(nowParts.year, nowParts.month, nowParts.day);
  return cellUTC <= nowUTC;
}

module.exports = {
  isSheetsSerialNumber,
  serialToDate,
  combineDateAndTime,
  nowMinutesInTimezone,
  isSameDateInTimezone,
  getDatePartsInTimezone,
  toSheetDateString,
  parseDatePartsFromCell,
  tanggalUploadDue,
};
