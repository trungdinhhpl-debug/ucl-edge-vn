"""Sức mạnh đội và mô hình Poisson cho từng cặp đấu.

Vì 10/36 CLB mùa này chưa từng đá UCL mùa trước và số liệu cầu thủ *đi theo người*
chứ không theo CLB (cầu thủ chuyển nhượng mang bàn thắng của CLB cũ sang CLB mới),
ta KHÔNG cộng dồn thống kê mùa trước theo đội. Thay vào đó sức mạnh đội được ghép
từ ba tín hiệu sạch, có đủ cho cả 36 đội:

1. Giá cầu thủ do chính UEFA định (thị trường của nhà cái tổ chức giải).
2. Nhóm hạt giống của lễ bốc thăm (Pot 1-4) — chính là thứ hạng hệ số CLB.
3. Hệ số CLB châu Âu 5 năm (chỉ có top 20, thiếu thì bù bằng hai tín hiệu trên).
"""
from __future__ import annotations

import math
import statistics as st
from dataclasses import dataclass, field
from datetime import datetime
from zoneinfo import ZoneInfo

from . import config as C


def _z(values: dict[int, float]) -> dict[int, float]:
    xs = list(values.values())
    mu = st.fmean(xs)
    sd = st.pstdev(xs) or 1.0
    return {k: (v - mu) / sd for k, v in values.items()}


@dataclass
class Team:
    id: int
    name: str
    short: str
    code: str
    pot: int
    price_index: float = 0.0
    coef: float | None = None
    power: float = 0.0          # điểm sức mạnh chuẩn hoá (z-score)
    atk: float = 1.0            # hệ số nhân hàng công
    dfn: float = 1.0            # hệ số nhân hàng thủ (thấp = thủ tốt)
    fixtures: dict[int, dict] = field(default_factory=dict)  # mdId -> thông tin trận


@dataclass
class Match:
    md: int
    match_id: int
    kickoff_utc: str
    home_id: int
    away_id: int
    lambda_home: float
    lambda_away: float


def _parse_uefa_dt(s: str) -> datetime:
    """'09/08/2026 18:45:00' (giờ CET/CEST) -> datetime có timezone."""
    return datetime.strptime(s, "%m/%d/%Y %H:%M:%S").replace(tzinfo=ZoneInfo(C.UEFA_TZ))


def _parse_deadline(s: str) -> datetime:
    """'09/08/26 06:45:00 PM' (giờ CET/CEST) -> datetime có timezone."""
    return datetime.strptime(s, "%m/%d/%y %I:%M:%S %p").replace(tzinfo=ZoneInfo(C.UEFA_TZ))


def build_teams(raw: dict) -> dict[int, Team]:
    teams: dict[int, Team] = {}
    for t in raw["teams"]["data"]["value"]:
        pot = int(str(t.get("htPtName") or "Pot 4").split()[-1])
        teams[int(t["id"])] = Team(
            id=int(t["id"]),
            name=t["webName"],
            short=t.get("shortName") or t["webName"],
            code=t.get("countryCode") or "",
            pot=pot,
        )

    # (1) chỉ số giá: tổng 11 mức giá cao nhất của đội — thước đo kỳ vọng của UEFA
    by_team: dict[int, list[float]] = {tid: [] for tid in teams}
    for p in raw["players"]["data"]["value"]["playerList"]:
        tid = int(p["tId"])
        if tid in by_team:
            by_team[tid].append(float(p["value"]))
    for tid, prices in by_team.items():
        top = sorted(prices, reverse=True)[:11]
        teams[tid].price_index = sum(top)

    # (3) hệ số CLB (top 20)
    for m in raw.get("coefficients", {}).get("data", {}).get("members", []):
        tid = int(m["member"]["id"])
        if tid in teams:
            teams[tid].coef = float(m["overallRanking"]["totalPoints"])

    z_price = _z({t.id: t.price_index for t in teams.values()})
    z_pot = _z({t.id: float(5 - t.pot) for t in teams.values()})   # Pot 1 mạnh nhất

    have_coef = {t.id: math.log(t.coef) for t in teams.values() if t.coef}
    if have_coef:
        z_coef_known = _z(have_coef)
        # đội không có hệ số ⇒ gần như chắc chắn nằm ngoài top 20: gán bằng
        # ước lượng từ hai tín hiệu còn lại, chặn trên bởi mức thấp nhất của top 20.
        floor_known = min(z_coef_known.values())
        z_coef = {}
        for t in teams.values():
            if t.id in z_coef_known:
                z_coef[t.id] = z_coef_known[t.id]
            else:
                est = 0.5 * (z_price[t.id] + z_pot[t.id])
                z_coef[t.id] = min(est, floor_known)
    else:
        z_coef = {t.id: 0.5 * (z_price[t.id] + z_pot[t.id]) for t in teams.values()}

    for t in teams.values():
        t.power = (
            C.W_PRICE * z_price[t.id] + C.W_POT * z_pot[t.id] + C.W_COEF * z_coef[t.id]
        )
        t.atk = math.exp(C.ATK_SPREAD * t.power)
        t.dfn = math.exp(-C.DEF_SPREAD * t.power)
    return teams


def build_matches(raw: dict, teams: dict[int, Team]) -> tuple[list[Match], dict[int, dict]]:
    """Trả về danh sách trận (kèm λ) và thông tin từng lượt đấu (deadline...)."""
    matches: list[Match] = []
    matchdays: dict[int, dict] = {}

    for md in raw["fixtures"]["data"]["value"]:
        md_id = int(md["mdId"])
        deadline = _parse_deadline(md["deadline"])
        matchdays[md_id] = {
            "md": md_id,
            "deadline_utc": deadline.astimezone(ZoneInfo("UTC")).isoformat(),
            "is_current": bool(md.get("mdIsCurrent")),
            "is_locked": bool(md.get("mdIsLocked")),
            "unlimited_transfers": md_id in C.UNLIMITED_TRANSFER_MDS,
            "subs_allowed": md.get("subsAllowed", 2),
            "matches": [],
        }
        for m in md["match"]:
            h, a = int(m["htId"]), int(m["atId"])
            if h not in teams or a not in teams:
                continue
            lh = C.BASE_TEAM_GOALS * teams[h].atk * teams[a].dfn * C.HOME_ATTACK
            la = C.BASE_TEAM_GOALS * teams[a].atk * teams[h].dfn * C.AWAY_ATTACK
            lh = min(max(lh, C.LAMBDA_MIN), C.LAMBDA_MAX)
            la = min(max(la, C.LAMBDA_MIN), C.LAMBDA_MAX)
            ko = _parse_uefa_dt(m["dateTime"]).astimezone(ZoneInfo("UTC")).isoformat()

            match = Match(md_id, int(m["mId"]), ko, h, a, lh, la)
            matches.append(match)
            matchdays[md_id]["matches"].append(
                {
                    "id": match.match_id,
                    "kickoffUtc": ko,
                    "home": h,
                    "away": a,
                    "lambdaHome": round(lh, 3),
                    "lambdaAway": round(la, 3),
                }
            )
            teams[h].fixtures[md_id] = {
                "opponent": a, "home": True, "lam_for": lh, "lam_against": la, "kickoff_utc": ko,
            }
            teams[a].fixtures[md_id] = {
                "opponent": h, "home": False, "lam_for": la, "lam_against": lh, "kickoff_utc": ko,
            }
    return matches, matchdays


def difficulty(lam: float, lo: float, hi: float) -> int:
    """Quy λ về thang khó 1..5 (1 = dễ nhất cho phía đang xét)."""
    if hi <= lo:
        return 3
    x = (lam - lo) / (hi - lo)
    return int(min(5, max(1, math.floor(x * 5) + 1)))
