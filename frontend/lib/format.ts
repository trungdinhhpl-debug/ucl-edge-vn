const VN_TZ = "Asia/Ho_Chi_Minh";

export function fmtVN(iso: string, opts: Intl.DateTimeFormatOptions = {}): string {
  return new Date(iso).toLocaleString("vi-VN", {
    timeZone: VN_TZ,
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    ...opts,
  });
}

export function fmtVNDate(iso: string): string {
  return new Date(iso).toLocaleDateString("vi-VN", {
    timeZone: VN_TZ,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

export function fmtVNTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("vi-VN", {
    timeZone: VN_TZ,
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Đếm ngược dạng "2n 14g 05p" — trả về null khi đã qua hạn. */
export function countdown(iso: string, now = Date.now()): string | null {
  const diff = new Date(iso).getTime() - now;
  if (diff <= 0) return null;
  const s = Math.floor(diff / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}n ${h}g ${m}p`;
  if (h > 0) return `${h}g ${m}p ${sec}s`;
  return `${m}p ${sec}s`;
}

export const num = (x: number, d = 1) =>
  x.toLocaleString("vi-VN", { minimumFractionDigits: d, maximumFractionDigits: d });

export const pct = (x: number, d = 0) => `${(x * 100).toFixed(d)}%`;

export const money = (x: number) => `€${x.toFixed(1)}m`;
