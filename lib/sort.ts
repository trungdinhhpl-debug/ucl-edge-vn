"use client";

import { useState } from "react";

export type SortDir = "asc" | "desc";

/**
 * Trạng thái sắp xếp dùng chung cho các bảng.
 *
 * Quy ước: bấm lại đúng cột đang sắp thì đảo chiều; bấm sang cột khác thì nhảy về
 * chiều mặc định của cột đó — cột số mặc định giảm dần (cao nhất trước), cột chữ
 * mặc định tăng dần (A→Z). Người dùng gần như luôn muốn thấy giá trị lớn nhất trước
 * khi mới bấm vào một cột số, nên đây là mặc định ít gây bất ngờ nhất.
 */
export function useSort<K extends string>(initialKey: K, initialDir: SortDir = "desc") {
  const [key, setKey] = useState<K>(initialKey);
  const [dir, setDir] = useState<SortDir>(initialDir);

  function toggle(next: K, defaultDir: SortDir = "desc") {
    if (next === key) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setKey(next);
      setDir(defaultDir);
    }
  }

  /** Đặt thẳng cột và chiều — dùng cho ô chọn "Sắp theo" để hai thứ luôn khớp nhau. */
  function select(next: K, nextDir: SortDir = "desc") {
    setKey(next);
    setDir(nextDir);
  }

  return { key, dir, toggle, select };
}

/** So sánh hai giá trị theo chiều đã chọn; chuỗi so theo tiếng Việt, rỗng luôn xếp cuối. */
export function compare(
  a: number | string | null | undefined,
  b: number | string | null | undefined,
  dir: SortDir,
): number {
  const sign = dir === "asc" ? 1 : -1;

  const aEmpty = a === null || a === undefined || a === "";
  const bEmpty = b === null || b === undefined || b === "";
  if (aEmpty && bEmpty) return 0;
  if (aEmpty) return 1; // giá trị trống luôn xuống cuối, bất kể chiều sắp
  if (bEmpty) return -1;

  if (typeof a === "string" || typeof b === "string") {
    return sign * String(a).localeCompare(String(b), "vi");
  }
  return sign * ((a as number) - (b as number));
}
