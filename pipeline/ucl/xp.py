"""Điểm kỳ vọng (xP) và *phân phối* điểm cho một cầu thủ trong một trận.

Không dùng Monte Carlo: mỗi thành phần điểm là một biến ngẫu nhiên có phân phối
đóng (Poisson / Bernoulli), nên phân phối tổng điểm được tính bằng tích chập chính
xác. Nhờ vậy sàn - trần - P(bùng nổ) là số thật chứ không phải ước lượng có nhiễu.

Ba trạng thái số phút được xử lý riêng rồi trộn lại:
  A. không ra sân          -> 0 điểm
  B. ra sân dưới 60 phút   -> có điểm ra sân, không có điểm sạch lưới
  C. ra sân từ 60 phút     -> đủ mọi hạng mục
"""
from __future__ import annotations

import math
from dataclasses import dataclass

import numpy as np

from . import config as C

MINS_SUB = 32.0      # số phút trung bình khi vào sân từ ghế dự bị
MINS_START = 85.0    # số phút trung bình khi đá chính trọn hiệp 2
MAX_COUNT = 14       # số sự kiện tối đa xét trong đuôi phân phối Poisson


@dataclass(frozen=True)
class Fixture:
    """Bối cảnh một trận với đội của cầu thủ."""
    md: int
    opponent: int
    home: bool
    lam_for: float        # bàn thắng kỳ vọng của đội cầu thủ
    lam_against: float    # bàn thua kỳ vọng của đội cầu thủ
    kickoff_utc: str = ""


# ----------------------------------------------------------------- phân phối rời rạc
class Dist:
    """Phân phối điểm: arr[i] là xác suất được (base + i) điểm."""

    __slots__ = ("base", "arr")

    def __init__(self, base: int, arr: np.ndarray):
        self.base = base
        self.arr = arr

    def __mul__(self, other: "Dist") -> "Dist":
        return Dist(self.base + other.base, np.convolve(self.arr, other.arr))

    @property
    def mean(self) -> float:
        idx = np.arange(len(self.arr)) + self.base
        return float((idx * self.arr).sum())

    def prob_at_least(self, pts: int) -> float:
        i = pts - self.base
        if i <= 0:
            return float(self.arr.sum())
        if i >= len(self.arr):
            return 0.0
        return float(self.arr[i:].sum())

    def prob_at_most(self, pts: int) -> float:
        i = pts - self.base
        if i < 0:
            return 0.0
        return float(self.arr[: min(i + 1, len(self.arr))].sum())

    def to_dict(self, lo: int = -4, hi: int = 25) -> dict[int, float]:
        out = {}
        for i, p in enumerate(self.arr):
            if p > 1e-6:
                out[self.base + i] = round(float(p), 6)
        return out


ZERO = Dist(0, np.array([1.0]))


def _poisson(lam: float, nmax: int = MAX_COUNT) -> np.ndarray:
    lam = max(lam, 0.0)
    ks = np.arange(nmax + 1)
    logp = -lam + ks * math.log(lam) if lam > 0 else np.full(nmax + 1, -np.inf)
    if lam > 0:
        logp = logp - np.array([math.lgamma(k + 1) for k in ks])
        p = np.exp(logp)
    else:
        p = np.zeros(nmax + 1)
        p[0] = 1.0
    p[-1] += max(0.0, 1.0 - p.sum())
    return p


def _counts_to_dist(p_counts: np.ndarray, pts_of_count) -> Dist:
    """Chuyển phân phối số lần sự kiện thành phân phối điểm."""
    vals = [pts_of_count(k) for k in range(len(p_counts))]
    lo, hi = min(vals), max(vals)
    arr = np.zeros(hi - lo + 1)
    for k, p in enumerate(p_counts):
        arr[vals[k] - lo] += p
    return Dist(lo, arr)


def poisson_dist(lam: float, pts_each: int) -> Dist:
    if lam <= 1e-9 or pts_each == 0:
        return ZERO
    return _counts_to_dist(_poisson(lam), lambda k: k * pts_each)


def poisson_floor_dist(lam: float, per: int, pts_each: int) -> Dist:
    """Cứ `per` sự kiện thì được `pts_each` điểm (làm tròn xuống)."""
    if lam <= 1e-9:
        return ZERO
    return _counts_to_dist(_poisson(lam, 20), lambda k: (k // per) * pts_each)


def bernoulli_dist(p: float, pts: int) -> Dist:
    p = min(max(p, 0.0), 1.0)
    if p <= 1e-9 or pts == 0:
        return ZERO
    lo, hi = min(0, pts), max(0, pts)
    arr = np.zeros(hi - lo + 1)
    arr[0 - lo] += 1 - p
    arr[pts - lo] += p
    return Dist(lo, arr)


def _scale(dist: Dist, w: float) -> Dist:
    return Dist(dist.base, dist.arr * w)


def _mix(parts: list[tuple[float, Dist]]) -> Dist:
    """Trộn các phân phối theo trọng số xác suất."""
    lo = min(d.base for _, d in parts)
    hi = max(d.base + len(d.arr) - 1 for _, d in parts)
    arr = np.zeros(hi - lo + 1)
    for w, d in parts:
        arr[d.base - lo : d.base - lo + len(d.arr)] += w * d.arr
    return Dist(lo, arr)


# ------------------------------------------------------------------ xP của cầu thủ
def _components(p, fx: Fixture, mins: float, sixty: bool, p_motm_cond: float) -> dict[str, Dist]:
    """Các thành phần điểm khi cầu thủ đã ra sân `mins` phút."""
    f = mins / 90.0
    pos = p.pos
    press = fx.lam_against / C.BASE_TEAM_GOALS      # sức ép đối thủ tạo ra

    goals_lam = p.share_goal * fx.lam_for * f
    ast_lam = p.share_assist * fx.lam_for * f

    comps: dict[str, Dist] = {
        "appearance": Dist(C.APPEARANCE + (C.SIXTY_MIN_BONUS if sixty else 0), np.array([1.0])),
        "goals": poisson_dist(goals_lam, C.GOAL_POINTS[pos]),
        "goals_outside": poisson_dist(goals_lam * p.p_outside, C.GOAL_OUTSIDE_BOX_BONUS),
        "assists": poisson_dist(ast_lam, C.ASSIST),
        "balls": poisson_floor_dist(p.br90 * f, C.BALLS_RECOVERED_PER_POINT, 1),
        "motm": bernoulli_dist(p_motm_cond, C.PLAYER_OF_THE_MATCH),
        "yellow": bernoulli_dist(min(p.yc90 * f, 0.6), C.YELLOW_CARD),
        "red": bernoulli_dist(min(p.rc90 * f, 0.2), C.RED_CARD),
        "pen_won": poisson_dist(p.pen_won90 * f, C.PENALTY_WON),
        "pen_missed": poisson_dist(p.pen_miss90 * f, C.PENALTY_MISSED),
        "pen_conceded": poisson_dist(p.pen_con90 * f, C.PENALTY_CONCEDED),
        "own_goal": poisson_dist(p.og90 * f, C.OWN_GOAL),
    }

    if pos == 1:
        comps["saves"] = poisson_floor_dist(p.sv90 * press * f, C.SAVES_PER_POINT, 1)
        comps["pen_saved"] = poisson_dist(p.pen_save90 * press * f, C.PENALTY_SAVED)

    if pos in (1, 2):
        # bàn thua và sạch lưới cùng đến từ một biến: số bàn đối thủ ghi được
        gc = _poisson(fx.lam_against * f, 12)
        comps["conceded"] = _counts_to_dist(
            gc, lambda k: -(k // C.GOALS_CONCEDED_PER_MINUS)
        )
        if sixty:
            comps["clean_sheet"] = bernoulli_dist(
                math.exp(-fx.lam_against), C.CLEAN_SHEET_POINTS[pos]
            )
    elif sixty and C.CLEAN_SHEET_POINTS[pos] > 0:
        comps["clean_sheet"] = bernoulli_dist(
            math.exp(-fx.lam_against), C.CLEAN_SHEET_POINTS[pos]
        )

    return comps


def _combine(comps: dict[str, Dist]) -> Dist:
    out = ZERO
    for d in comps.values():
        out = out * d
    return out


def player_distribution(p, fx: Fixture, p_motm_match: float) -> Dist:
    """Phân phối điểm đầy đủ, đã trộn ba trạng thái số phút."""
    p_sub = max(p.p_play - p.p60, 0.0)
    p_none = max(1.0 - p.p_play, 0.0)
    p_motm_cond = min(p_motm_match / p.p_play, 1.0) if p.p_play > 1e-6 else 0.0

    parts: list[tuple[float, Dist]] = [(p_none, ZERO)]
    if p_sub > 1e-6:
        parts.append((p_sub, _combine(_components(p, fx, MINS_SUB, False, p_motm_cond * 0.45))))
    if p.p60 > 1e-6:
        parts.append((p.p60, _combine(_components(p, fx, MINS_START, True, p_motm_cond))))
    return _mix(parts)


def expected_points(p, fx: Fixture, p_motm_match: float) -> tuple[float, dict[str, float]]:
    """xP trung bình + phân rã theo hạng mục (dùng cho trang chi tiết cầu thủ)."""
    p_sub = max(p.p_play - p.p60, 0.0)
    p_motm_cond = min(p_motm_match / p.p_play, 1.0) if p.p_play > 1e-6 else 0.0

    breakdown: dict[str, float] = {}
    total = 0.0
    for weight, mins, sixty, motm in (
        (p_sub, MINS_SUB, False, p_motm_cond * 0.45),
        (p.p60, MINS_START, True, p_motm_cond),
    ):
        if weight <= 1e-6:
            continue
        for key, dist in _components(p, fx, mins, sixty, motm).items():
            v = weight * dist.mean
            breakdown[key] = breakdown.get(key, 0.0) + v
            total += v
    return total, {k: round(v, 3) for k, v in breakdown.items() if abs(v) > 1e-4}
