import type { Dataset, Player } from "./data";

/** Đội hình người dùng đang dựng, chia sẻ giữa trang Chọn đội hình, Kế hoạch và Chip. */
export const SQUAD_STORAGE_KEY = "ucl-edge-squad-v1";

export function saveSquad(squad: Player[]): void {
  try {
    window.localStorage.setItem(SQUAD_STORAGE_KEY, JSON.stringify(squad.map((p) => p.id)));
  } catch {
    /* trình duyệt chặn lưu trữ thì bỏ qua — đội hình vẫn dùng được trong phiên này */
  }
}

export function loadSavedSquad(data: Dataset): Player[] | null {
  try {
    const raw = window.localStorage.getItem(SQUAD_STORAGE_KEY);
    if (!raw) return null;
    const ids = JSON.parse(raw) as string[];
    const squad = ids
      .map((id) => data.playerById.get(id))
      .filter((p): p is Player => Boolean(p));
    return squad.length === 15 ? squad : null;
  } catch {
    return null;
  }
}
