"use client";

import { useEffect, useState } from "react";

/* ------------------------------------------------------------------ kiểu dữ liệu */

export type Pos = 1 | 2 | 3 | 4;

export interface PlayerDist {
  mean: number;
  p_blank: number;
  p_returns: number;
  p_haul: number;
  p_big_haul: number;
}

export interface Player {
  id: string;
  name: string;
  fullName: string;
  team: number;
  pos: Pos;
  posName: "GK" | "DEF" | "MID" | "FWD";
  price: number;
  ownership: number;
  status: string;
  statusText: string;
  isActive: boolean;
  hasHistory: boolean;
  minsPrev: number;
  ptsPrev: number;
  goalsPrev: number;
  assistsPrev: number;
  transfersIn: number;
  transfersOut: number;
  xMins: number;
  pStart: number;
  pPlay: number;
  p60: number;
  shareGoal: number;
  shareAssist: number;
  br90: number;
  sv90: number;
  pMotm: number;
  xp: Record<string, number>;
  xpNow: number;
  xpHorizon: number;
  valueNow: number;
  valueHorizon: number;
  breakdown: Record<string, number>;
  dist: PlayerDist | null;
  opponent: number | null;
  isHome: boolean | null;
}

export interface TeamFixture {
  md: number;
  opponent: number;
  home: boolean;
  lamFor: number;
  lamAgainst: number;
  atkDifficulty: number;
  defDifficulty: number;
  kickoffUtc: string;
}

export interface Team {
  id: number;
  name: string;
  short: string;
  code: string;
  pot: number;
  power: number;
  atk: number;
  def: number;
  coefficient: number | null;
  priceIndex: number;
  hasUclHistory: boolean;
  lamAvg: number;
  fixtures: TeamFixture[];
}

export interface MatchOdds {
  pHome: number;
  pDraw: number;
  pAway: number;
  handicapLine: number | null;
  handicapPriceHome: number | null;
  totalLine: number | null;
  totalOverPrice: number | null;
  lamHome: number;
  lamAway: number;
  csHome: number;
  csAway: number;
  margin: number;
  fitError: number;
  marketsUsed: number;
}

export interface Meta {
  generatedAt: string;
  season: string;
  currentMd: number;
  deadlineUtc: string;
  matchdays: {
    md: number;
    deadlineUtc: string;
    unlimitedTransfers: boolean;
    matches: {
      id: number;
      kickoffUtc: string;
      home: number;
      away: number;
      lambdaHome: number;
      lambdaAway: number;
      odds?: MatchOdds;
    }[];
  }[];
  rules: {
    budget: number;
    squadSize: number;
    squadByPos: Record<string, number>;
    maxPerClub: number;
    extraTransferCost: number;
    unlimitedTransferMds: number[];
    formations: { id: number; gk: number; def: number; mid: number; fwd: number }[];
    scoring: Record<string, unknown>;
  };
  odds: {
    source: string;
    available: boolean;
    matches: number;
    error: string | null;
    note: string;
  };
  dataQuality: {
    players: number;
    playersWithoutUclHistory: number;
    teamsWithoutUclHistory: number;
    note: string;
  };
  modelParams: Record<string, unknown>;
}

export interface Dataset {
  players: Player[];
  teams: Team[];
  teamById: Map<number, Team>;
  playerById: Map<string, Player>;
  meta: Meta;
}

/* ------------------------------------------------------------------ tải dữ liệu */

let cache: Dataset | null = null;
let inflight: Promise<Dataset> | null = null;

async function loadDataset(): Promise<Dataset> {
  if (cache) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    const base = process.env.NEXT_PUBLIC_DATA_BASE ?? "";
    const [players, teams, meta] = await Promise.all([
      fetch(`${base}/data/players.json`).then((r) => r.json() as Promise<Player[]>),
      fetch(`${base}/data/teams.json`).then((r) => r.json() as Promise<Team[]>),
      fetch(`${base}/data/meta.json`).then((r) => r.json() as Promise<Meta>),
    ]);
    cache = {
      players,
      teams,
      teamById: new Map(teams.map((t) => [t.id, t])),
      playerById: new Map(players.map((p) => [p.id, p])),
      meta,
    };
    return cache;
  })();

  return inflight;
}

export function useDataset() {
  const [data, setData] = useState<Dataset | null>(cache);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    loadDataset()
      .then((d) => alive && setData(d))
      .catch((e) => alive && setError(String(e)));
    return () => {
      alive = false;
    };
  }, []);

  return { data, error, loading: !data && !error };
}

/* ------------------------------------------------------------------ tiện ích */

export const POS_VI: Record<Pos, string> = {
  1: "Thủ môn",
  2: "Hậu vệ",
  3: "Tiền vệ",
  4: "Tiền đạo",
};

export const POS_SHORT: Record<Pos, string> = { 1: "TM", 2: "HV", 3: "TV", 4: "TĐ" };

/** Cầu thủ có thể chọn được cho lượt đấu này hay không. */
export function isSelectable(p: Player): boolean {
  return p.isActive && p.status !== "NIS" && p.status !== "S";
}

/** Cảnh báo rủi ro ra sân, dùng chung ở nhiều trang. */
export function riskLabel(p: Player): { text: string; tone: "ok" | "warn" | "bad" } | null {
  if (!p.isActive || p.status === "NIS") return { text: "Không đăng ký", tone: "bad" };
  if (p.status === "S") return { text: "Treo giò", tone: "bad" };
  if (p.status === "I") return { text: "Chấn thương", tone: "bad" };
  if (p.status === "D") return { text: "Nghi ngờ", tone: "warn" };
  if (p.xMins < 45) return { text: "Rủi ro xoay tua", tone: "warn" };
  return null;
}

export function teamFixture(team: Team | undefined, md: number): TeamFixture | undefined {
  return team?.fixtures.find((f) => f.md === md);
}
