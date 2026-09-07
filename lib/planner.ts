import type { Player, Pos } from "./data";
import { isSelectable } from "./data";
import { bestEleven, optimizeSquad, type Formation, type OptimizeOptions } from "./optimizer";

/* Kế hoạch nhiều lượt đấu và lịch dùng chip cho UCL Fantasy.
 *
 * Bài toán thật không phải "vòng này ai điểm cao nhất" mà là: với số chuyển nhượng
 * miễn phí hạn chế, nên đổi ai ở lượt nào để tổng điểm cả chặng lớn nhất — và hai
 * chip Wildcard / Limitless nên rơi vào lượt nào.
 *
 * Cách giải: đi tuần tự từng lượt, mỗi lượt chọn tham lam phép đổi người có lợi nhất
 * *tính trên toàn bộ chặng còn lại* (vì cầu thủ mua về sẽ ở lại), trừ đi tiền phạt
 * nếu vượt hạn mức miễn phí.
 */

export interface PlanOptions {
  startMd: number;
  endMd: number;
  freeTransfers: number;
  hitCost: number;
  maxExtraTransfers: number;
  /** Lợi tối thiểu (điểm, tính trên cả chặng) để đáng tiêu một lượt chuyển nhượng miễn phí. */
  minFreeGain: number;
  budget: number;
  maxPerClub: number;
  squadByPos: Record<Pos, number>;
  formations: Formation[];
  unlimitedMds: number[];
}

export interface MdPlan {
  md: number;
  unlimited: boolean;
  transfers: { out: Player; in: Player; paid: boolean; gain: number }[];
  hits: number;
  pointsCost: number;
  squad: Player[];
  xi: Player[];
  captain: Player | null;
  formation: Formation;
  xp: number;
  net: number;
  bank: number;
}

export interface PlanResult {
  matchdays: MdPlan[];
  totalXp: number;
  totalCost: number;
  net: number;
  finalSquad: Player[];
}

/* ------------------------------------------------------------------ tiện ích */

export function xpAt(p: Player, md: number): number {
  return p.xp[String(md)] ?? 0;
}

export function horizonXp(p: Player, fromMd: number, toMd: number): number {
  let s = 0;
  for (let md = fromMd; md <= toMd; md++) s += xpAt(p, md);
  return s;
}

/** Giá trị một đội hình ở đúng một lượt: điểm đội hình ra sân + điểm đội trưởng. */
export function mdValue(squad: Player[], md: number, formations: Formation[]) {
  const score = (p: Player) => xpAt(p, md);
  const { xi, formation, points } = bestEleven(squad, score, formations);
  const captain = xi.length ? xi.reduce((a, b) => (score(b) > score(a) ? b : a), xi[0]) : null;
  return {
    xi,
    formation,
    captain,
    points: points + (captain ? score(captain) : 0),
  };
}

/** Tổng giá trị của một đội hình trên cả chặng — thước đo để so sánh phép đổi người. */
export function horizonValue(
  squad: Player[],
  fromMd: number,
  toMd: number,
  formations: Formation[],
): number {
  let total = 0;
  for (let md = fromMd; md <= toMd; md++) total += mdValue(squad, md, formations).points;
  return total;
}

function cost(squad: Player[]): number {
  return squad.reduce((s, p) => s + p.price, 0);
}

function clubCounts(squad: Player[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const p of squad) m.set(p.team, (m.get(p.team) ?? 0) + 1);
  return m;
}

/** Nhóm ứng viên rút gọn cho một chặng — vừa đủ rộng để không bỏ sót, vừa đủ hẹp để nhanh. */
function candidatePool(
  all: Player[],
  fromMd: number,
  toMd: number,
): Map<Pos, Player[]> {
  const pool = new Map<Pos, Player[]>();
  for (const pos of [1, 2, 3, 4] as Pos[]) {
    const group = all.filter((p) => p.pos === pos && isSelectable(p) && p.xMins > 0);
    const byXp = [...group]
      .sort((a, b) => horizonXp(b, fromMd, toMd) - horizonXp(a, fromMd, toMd))
      .slice(0, 45);
    const byValue = [...group]
      .sort(
        (a, b) =>
          horizonXp(b, fromMd, toMd) / b.price - horizonXp(a, fromMd, toMd) / a.price,
      )
      .slice(0, 25);
    const merged = new Map<string, Player>();
    for (const p of [...byXp, ...byValue]) merged.set(p.id, p);
    pool.set(pos, [...merged.values()]);
  }
  return pool;
}

/* ------------------------------------------------------- kế hoạch chuyển nhượng */

export function planHorizon(
  squad0: Player[],
  all: Player[],
  opts: PlanOptions,
): PlanResult {
  const pool = candidatePool(all, opts.startMd, opts.endMd);
  let squad = [...squad0];
  // Cầu thủ đã bán không được mua lại trong cùng kế hoạch. Không có ràng buộc này,
  // thuật toán tham lam sẽ đổi qua đổi lại giữa hai cầu thủ ngang tài ở các lượt
  // liên tiếp — hợp lệ về luật nhưng là cách tiêu chuyển nhượng vô nghĩa.
  const sold = new Set<string>();
  const matchdays: MdPlan[] = [];
  let totalXp = 0;
  let totalCost = 0;

  for (let md = opts.startMd; md <= opts.endMd; md++) {
    const unlimited = opts.unlimitedMds.includes(md);
    const transfers: MdPlan["transfers"] = [];

    // Lượt đầu tiên của kế hoạch là đội hình người dùng đang có, không tính chuyển
    // nhượng. Lượt chuyển nhượng không giới hạn được xử lý ở trang Chọn đội hình.
    if (md > opts.startMd && !unlimited) {
      const budgetLimit = opts.freeTransfers + opts.maxExtraTransfers;
      for (let step = 0; step < budgetLimit; step++) {
        const paid = step >= opts.freeTransfers;
        // chịu phạt thì phải thắng rõ ràng chứ không chỉ hoà vốn
        const threshold = paid ? opts.hitCost + 0.5 : opts.minFreeGain;
        const move = bestTransfer(squad, pool, md, opts, threshold, sold);
        if (!move) break;
        squad = squad.map((p) => (p.id === move.out.id ? move.in : p));
        sold.add(move.out.id);
        transfers.push({ out: move.out, in: move.in, paid, gain: move.gain });
      }
    }

    const hits = transfers.filter((t) => t.paid).length;
    const pointsCost = hits * opts.hitCost;
    const { xi, formation, captain, points } = mdValue(squad, md, opts.formations);

    totalXp += points;
    totalCost += pointsCost;
    matchdays.push({
      md,
      unlimited,
      transfers,
      hits,
      pointsCost,
      squad: [...squad],
      xi,
      captain,
      formation,
      xp: points,
      net: points - pointsCost,
      bank: opts.budget - cost(squad),
    });
  }

  return {
    matchdays,
    totalXp,
    totalCost,
    net: totalXp - totalCost,
    finalSquad: squad,
  };
}

/** Phép đổi người có lợi nhất tính trên cả chặng còn lại, hoặc null nếu không đáng. */
function bestTransfer(
  squad: Player[],
  pool: Map<Pos, Player[]>,
  md: number,
  opts: PlanOptions,
  threshold: number,
  sold: Set<string>,
): { out: Player; in: Player; gain: number } | null {
  const inSquad = new Set(squad.map((p) => p.id));
  const clubs = clubCounts(squad);
  const base = horizonValue(squad, md, opts.endMd, opts.formations);
  const bank = opts.budget - cost(squad);

  let best: { out: Player; in: Player; gain: number } | null = null;

  for (const out of squad) {
    for (const cand of pool.get(out.pos) ?? []) {
      if (inSquad.has(cand.id) || sold.has(cand.id)) continue;
      if (cand.price > out.price + bank + 1e-9) continue;
      const clubCount = (clubs.get(cand.team) ?? 0) - (cand.team === out.team ? 1 : 0);
      if (clubCount >= opts.maxPerClub) continue;

      const trial = squad.map((p) => (p.id === out.id ? cand : p));
      const gain = horizonValue(trial, md, opts.endMd, opts.formations) - base;
      if (gain > threshold && (!best || gain > best.gain)) {
        best = { out, in: cand, gain };
      }
    }
  }
  return best;
}

/* ------------------------------------------------------------------- chip */

export interface ChipOption {
  md: number;
  available: boolean;
  reason?: string;
  baseline: number;
  withChip: number;
  gain: number;
  squad?: Player[];
  xi?: Player[];
  captain?: Player | null;
}

export interface ChipAdvice {
  limitless: ChipOption[];
  wildcard: ChipOption[];
  bestLimitless: ChipOption | null;
  bestWildcard: ChipOption | null;
}

/**
 * Đội hình ra sân tốt nhất khi bỏ hoàn toàn ràng buộc ngân sách (chip Limitless).
 * Vẫn giữ giới hạn số cầu thủ mỗi CLB và các sơ đồ hợp lệ.
 */
export function bestUnlimitedXi(
  all: Player[],
  md: number,
  formations: Formation[],
  maxPerClub: number,
) {
  const eligible = all
    .filter((p) => isSelectable(p) && xpAt(p, md) > 0)
    .sort((a, b) => xpAt(b, md) - xpAt(a, md));

  let best: { xi: Player[]; formation: Formation; points: number; captain: Player | null } | null =
    null;

  for (const f of formations) {
    const need: Record<Pos, number> = { 1: f.gk, 2: f.def, 3: f.mid, 4: f.fwd };
    const taken: Record<Pos, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    const clubs = new Map<number, number>();
    const xi: Player[] = [];

    for (const p of eligible) {
      if (xi.length === 11) break;
      if (taken[p.pos] >= need[p.pos]) continue;
      if ((clubs.get(p.team) ?? 0) >= maxPerClub) continue;
      xi.push(p);
      taken[p.pos]++;
      clubs.set(p.team, (clubs.get(p.team) ?? 0) + 1);
    }
    if (xi.length < 11) continue;

    const captain = xi.reduce((a, b) => (xpAt(b, md) > xpAt(a, md) ? b : a), xi[0]);
    const points = xi.reduce((s, p) => s + xpAt(p, md), 0) + xpAt(captain, md);
    if (!best || points > best.points) best = { xi, formation: f, points, captain };
  }
  return best;
}

/**
 * Lịch dùng chip: với mỗi lượt, so sánh điểm kỳ vọng khi dùng chip và khi không dùng.
 *
 * - Limitless đo phần lợi *do bỏ trần ngân sách* trong đúng một lượt.
 * - Wildcard đo phần lợi *do được xây lại cả đội* cho toàn bộ chặng còn lại.
 * - Cả hai đều không dùng được ở lượt vốn đã có chuyển nhượng không giới hạn
 *   (chính game cũng khoá chip ở những lượt đó).
 */
export function chipAdvice(
  plan: PlanResult,
  all: Player[],
  opts: PlanOptions,
  baseOptimizeOptions: Omit<OptimizeOptions, "scoreOverride" | "target" | "strategy">,
): ChipAdvice {
  const limitless: ChipOption[] = [];
  const wildcard: ChipOption[] = [];

  for (const step of plan.matchdays) {
    const md = step.md;
    const blocked = step.unlimited;

    // ---------------- Limitless: một lượt, không trần ngân sách
    const unlimitedXi = blocked ? null : bestUnlimitedXi(all, md, opts.formations, opts.maxPerClub);
    limitless.push({
      md,
      available: !blocked,
      reason: blocked
        ? "Lượt này đã có chuyển nhượng miễn phí không giới hạn — game khoá chip."
        : undefined,
      baseline: step.xp,
      withChip: unlimitedXi?.points ?? step.xp,
      gain: unlimitedXi ? unlimitedXi.points - step.xp : 0,
      xi: unlimitedXi?.xi,
      captain: unlimitedXi?.captain ?? null,
    });

    // ---------------- Wildcard: xây lại cả đội cho chặng còn lại
    if (blocked) {
      wildcard.push({
        md,
        available: false,
        reason: "Lượt này đã có chuyển nhượng miễn phí không giới hạn — không cần chip.",
        baseline: 0,
        withChip: 0,
        gain: 0,
      });
      continue;
    }

    const plannedRest = plan.matchdays
      .filter((s) => s.md >= md)
      .reduce((s, x) => s + x.net, 0);

    const rebuilt = optimizeSquad(all, {
      ...baseOptimizeOptions,
      target: "horizon",
      strategy: "balanced",
      scoreOverride: (p) => horizonXp(p, md, opts.endMd),
    });

    // Sau khi chơi Wildcard, các lượt sau vẫn có chuyển nhượng miễn phí như thường.
    // Vì vậy phải so hai *lộ trình* với nhau, chứ không phải so đội hình xây lại (đứng
    // yên) với lộ trình có chuyển nhượng — so kiểu đó chip luôn bị định giá thấp.
    const rebuiltValue = rebuilt
      ? planHorizon(rebuilt.squad, all, { ...opts, startMd: md }).net
      : 0;

    wildcard.push({
      md,
      available: true,
      baseline: plannedRest,
      withChip: rebuiltValue,
      gain: rebuiltValue - plannedRest,
      squad: rebuilt?.squad,
      xi: rebuilt?.xi,
      captain: rebuilt?.captain ?? null,
    });
  }

  const pick = (list: ChipOption[]) =>
    list
      .filter((c) => c.available)
      .reduce<ChipOption | null>((a, b) => (!a || b.gain > a.gain ? b : a), null);

  return {
    limitless,
    wildcard,
    bestLimitless: pick(limitless),
    bestWildcard: pick(wildcard),
  };
}
