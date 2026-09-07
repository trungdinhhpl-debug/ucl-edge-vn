import type { Player, Pos } from "./data";
import { isSelectable } from "./data";

/* Bộ chọn đội hình 15 người cho UCL Fantasy.
 *
 * Bài toán: tối đa hoá điểm kỳ vọng của đội hình ra sân (đã tính đội trưởng nhân đôi)
 * cộng một phần điểm của băng ghế, với ràng buộc ngân sách €100m, đúng 2-5-5-3 theo
 * vị trí và tối đa 3 cầu thủ mỗi CLB.
 *
 * Cách giải: nhiều lần khởi tạo tham lam ngẫu nhiên rồi tìm kiếm cục bộ bằng phép
 * đổi một cầu thủ. Chạy hết trong trình duyệt trong vài chục mili giây, không cần
 * máy chủ — nên trang web triển khai tĩnh được.
 */

export interface Formation {
  id: number;
  gk: number;
  def: number;
  mid: number;
  fwd: number;
}

export type Strategy = "safe" | "balanced" | "aggressive";

export interface OptimizeOptions {
  budget: number;
  maxPerClub: number;
  squadByPos: Record<Pos, number>;
  formations: Formation[];
  /** "now" = chỉ lượt đấu sắp tới; "horizon" = tổng cả các lượt còn lại của vòng bảng */
  target: "now" | "horizon";
  strategy: Strategy;
  benchWeight: number;
  locked?: string[];
  banned?: string[];
  restarts?: number;
  /** Thay hoàn toàn cách chấm điểm — bộ lập kế hoạch dùng để tối ưu cho một chặng
   *  lượt đấu bất kỳ thay vì luôn dùng xpNow/xpHorizon. */
  scoreOverride?: (p: Player) => number;
}

export interface SquadResult {
  squad: Player[];
  xi: Player[];
  bench: Player[];
  captain: Player | null;
  viceCaptain: Player | null;
  formation: Formation;
  cost: number;
  xiPoints: number;
  objective: number;
}

const POSITIONS: Pos[] = [1, 2, 3, 4];

/** Điểm dùng để tối ưu — đã điều chỉnh theo khẩu vị rủi ro. */
export function playerScore(p: Player, opts: Pick<OptimizeOptions, "target" | "strategy">): number {
  const base = opts.target === "now" ? p.xpNow : p.xpHorizon;
  if (base <= 0) return 0;

  // Phân phối điểm chỉ được tính cho lượt đấu sắp tới, nên hai chiến lược thiên về
  // rủi ro dùng hình dạng phân phối của lượt đó làm đại diện cho cả chặng.
  const d = p.dist;

  if (opts.strategy === "aggressive" && d) {
    // ưu tiên trần điểm: thưởng theo xác suất bùng nổ
    return base * (1 + 0.55 * d.p_haul) * (1 + 0.12 * (1 - p.ownership / 100));
  }
  if (opts.strategy === "safe") {
    // ưu tiên sàn điểm: phạt rủi ro tịt ngòi và rủi ro không đá chính
    const blank = d ? d.p_blank : 0.5;
    return base * (1 - 0.35 * blank) * (0.55 + 0.45 * p.pStart);
  }
  return base;
}

export function bestEleven(
  squad: Player[],
  score: (p: Player) => number,
  formations: Formation[],
): { xi: Player[]; formation: Formation; points: number } {
  const byPos = new Map<Pos, Player[]>();
  for (const pos of POSITIONS) {
    byPos.set(
      pos,
      squad.filter((p) => p.pos === pos).sort((a, b) => score(b) - score(a)),
    );
  }

  let best: { xi: Player[]; formation: Formation; points: number } | null = null;
  for (const f of formations) {
    const need: Record<Pos, number> = { 1: f.gk, 2: f.def, 3: f.mid, 4: f.fwd };
    const xi: Player[] = [];
    let ok = true;
    for (const pos of POSITIONS) {
      const pool = byPos.get(pos)!;
      if (pool.length < need[pos]) {
        ok = false;
        break;
      }
      xi.push(...pool.slice(0, need[pos]));
    }
    if (!ok) continue;
    const points = xi.reduce((s, p) => s + score(p), 0);
    if (!best || points > best.points) best = { xi, formation: f, points };
  }

  if (!best) {
    const xi = [...squad].sort((a, b) => score(b) - score(a)).slice(0, 11);
    best = {
      xi,
      formation: { id: 0, gk: 1, def: 4, mid: 4, fwd: 2 },
      points: xi.reduce((s, p) => s + score(p), 0),
    };
  }
  return best;
}

/** Giá trị mục tiêu của một đội hình 15 người. */
function objectiveOf(
  squad: Player[],
  score: (p: Player) => number,
  opts: OptimizeOptions,
): number {
  const { xi, points } = bestEleven(squad, score, opts.formations);
  const captain = xi.reduce((a, b) => (score(b) > score(a) ? b : a), xi[0]);
  const inXi = new Set(xi.map((p) => p.id));
  const bench = squad.filter((p) => !inXi.has(p.id));
  const benchPoints = bench.reduce((s, p) => s + score(p), 0);
  return points + (captain ? score(captain) : 0) + opts.benchWeight * benchPoints;
}

function costOf(squad: Player[]): number {
  return squad.reduce((s, p) => s + p.price, 0);
}

function clubCounts(squad: Player[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const p of squad) m.set(p.team, (m.get(p.team) ?? 0) + 1);
  return m;
}

function shuffled<T>(arr: T[], rnd: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Bộ sinh số ngẫu nhiên có hạt giống, để cùng thiết lập luôn ra cùng kết quả. */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function optimizeSquad(all: Player[], opts: OptimizeOptions): SquadResult | null {
  const banned = new Set(opts.banned ?? []);
  const lockedIds = opts.locked ?? [];
  const score = opts.scoreOverride ?? ((p: Player) => playerScore(p, opts));

  const pool = all.filter(
    (p) => isSelectable(p) && p.xMins > 0 && !banned.has(p.id) && score(p) > 0,
  );

  // rút gọn ứng viên: mỗi vị trí giữ nhóm điểm cao nhất và nhóm hiệu quả/giá tốt nhất
  const candidates = new Map<Pos, Player[]>();
  for (const pos of POSITIONS) {
    const group = pool.filter((p) => p.pos === pos);
    const byScore = [...group].sort((a, b) => score(b) - score(a)).slice(0, 55);
    const byValue = [...group]
      .sort((a, b) => score(b) / b.price - score(a) / a.price)
      .slice(0, 45);
    const merged = new Map<string, Player>();
    for (const p of [...byScore, ...byValue]) merged.set(p.id, p);
    candidates.set(pos, [...merged.values()]);
  }

  const locked = lockedIds
    .map((id) => all.find((p) => p.id === id))
    .filter((p): p is Player => Boolean(p));
  for (const p of locked) {
    const list = candidates.get(p.pos)!;
    if (!list.some((x) => x.id === p.id)) list.push(p);
  }

  const need = opts.squadByPos;
  const lockedByPos = new Map<Pos, number>();
  for (const p of locked) lockedByPos.set(p.pos, (lockedByPos.get(p.pos) ?? 0) + 1);
  for (const pos of POSITIONS) {
    if ((lockedByPos.get(pos) ?? 0) > need[pos]) return null;
  }
  if (costOf(locked) > opts.budget) return null;

  const restarts = opts.restarts ?? 6;
  let best: Player[] | null = null;
  let bestObj = -Infinity;

  for (let attempt = 0; attempt < restarts; attempt++) {
    const rnd = mulberry32(1234 + attempt * 977);
    const squad = greedyBuild(candidates, locked, need, opts, score, rnd, attempt);
    if (!squad) continue;
    const improved = localSearch(squad, candidates, locked, opts, score);
    const obj = objectiveOf(improved, score, opts);
    if (obj > bestObj) {
      bestObj = obj;
      best = improved;
    }
  }

  if (!best) return null;
  return finalise(best, score, opts, bestObj);
}

function greedyBuild(
  candidates: Map<Pos, Player[]>,
  locked: Player[],
  need: Record<Pos, number>,
  opts: OptimizeOptions,
  score: (p: Player) => number,
  rnd: () => number,
  attempt: number,
): Player[] | null {
  const squad: Player[] = [...locked];
  const chosen = new Set(squad.map((p) => p.id));
  const clubs = clubCounts(squad);

  // hệ số ngẫu nhiên nhẹ giữa các lần khởi tạo để thoát khỏi cực trị cục bộ
  const jitter = attempt === 0 ? 0 : 0.12;
  const eff = (p: Player) => (score(p) / p.price) * (1 + jitter * (rnd() - 0.5));

  for (const pos of POSITIONS) {
    const have = squad.filter((p) => p.pos === pos).length;
    const want = need[pos] - have;
    if (want <= 0) continue;
    const ranked = shuffled(candidates.get(pos) ?? [], rnd).sort((a, b) => eff(b) - eff(a));

    let added = 0;
    for (const p of ranked) {
      if (added >= want) break;
      if (chosen.has(p.id)) continue;
      if ((clubs.get(p.team) ?? 0) >= opts.maxPerClub) continue;
      // để dành tối thiểu 4.0m cho mỗi suất còn trống
      const slotsLeft = totalSlots(need) - squad.length - 1;
      if (costOf(squad) + p.price + slotsLeft * 4.0 > opts.budget) continue;
      squad.push(p);
      chosen.add(p.id);
      clubs.set(p.team, (clubs.get(p.team) ?? 0) + 1);
      added++;
    }
    if (added < want) return null;
  }
  return squad.length === totalSlots(need) ? squad : null;
}

function totalSlots(need: Record<Pos, number>): number {
  return POSITIONS.reduce((s, pos) => s + need[pos], 0);
}

function localSearch(
  start: Player[],
  candidates: Map<Pos, Player[]>,
  locked: Player[],
  opts: OptimizeOptions,
  score: (p: Player) => number,
): Player[] {
  let squad = [...start];
  let obj = objectiveOf(squad, score, opts);
  const lockedIds = new Set(locked.map((p) => p.id));

  for (let pass = 0; pass < 12; pass++) {
    let improved = false;

    for (let i = 0; i < squad.length; i++) {
      const out = squad[i];
      if (lockedIds.has(out.id)) continue;
      const inSquad = new Set(squad.map((p) => p.id));
      const clubs = clubCounts(squad);
      const budgetLeft = opts.budget - costOf(squad) + out.price;

      let bestIn: Player | null = null;
      let bestObj = obj;

      for (const cand of candidates.get(out.pos) ?? []) {
        if (inSquad.has(cand.id)) continue;
        if (cand.price > budgetLeft) continue;
        const clubCount = (clubs.get(cand.team) ?? 0) - (cand.team === out.team ? 1 : 0);
        if (clubCount >= opts.maxPerClub) continue;

        const trial = [...squad];
        trial[i] = cand;
        const v = objectiveOf(trial, score, opts);
        if (v > bestObj + 1e-9) {
          bestObj = v;
          bestIn = cand;
        }
      }

      if (bestIn) {
        squad[i] = bestIn;
        obj = bestObj;
        improved = true;
      }
    }

    if (!improved) break;
  }
  return squad;
}

function finalise(
  squad: Player[],
  score: (p: Player) => number,
  opts: OptimizeOptions,
  objective: number,
): SquadResult {
  const { xi, formation } = bestEleven(squad, score, opts.formations);
  const inXi = new Set(xi.map((p) => p.id));
  const bench = squad
    .filter((p) => !inXi.has(p.id))
    .sort((a, b) => (a.pos === 1 ? 1 : 0) - (b.pos === 1 ? 1 : 0) || score(b) - score(a));

  const ranked = [...xi].sort((a, b) => score(b) - score(a));
  const useNow = opts.target === "now";
  const xiPoints = xi.reduce((s, p) => s + (useNow ? p.xpNow : p.xpHorizon), 0);

  return {
    squad: [...squad].sort((a, b) => a.pos - b.pos || score(b) - score(a)),
    xi,
    bench,
    captain: ranked[0] ?? null,
    viceCaptain: ranked[1] ?? null,
    formation,
    cost: costOf(squad),
    xiPoints: xiPoints + (ranked[0] ? (useNow ? ranked[0].xpNow : ranked[0].xpHorizon) : 0),
    objective,
  };
}

/** Xếp lại đội hình ra sân tốt nhất cho một đội đã có sẵn (dùng khi người dùng tự sửa). */
export function rebuild(
  squad: Player[],
  opts: OptimizeOptions,
): SquadResult {
  const score = opts.scoreOverride ?? ((p: Player) => playerScore(p, opts));
  return finalise(squad, score, opts, objectiveOf(squad, score, opts));
}
