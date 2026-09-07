"""Ước lượng số phút và các tỷ lệ nền tảng của từng cầu thủ.

Nguyên tắc: mọi tỷ lệ đều là *hậu nghiệm Bayes* = (số liệu thật + prior x trọng số)
/ (cỡ mẫu + trọng số). Prior lấy từ giá cầu thủ do chính UEFA định, tách theo vị trí
- đây là tín hiệu duy nhất phủ được 100% cầu thủ, vì 66% cầu thủ mùa này chưa có
phút nào ở UCL mùa trước.

Sản lượng tấn công quy về *tỷ trọng trong bàn thắng của đội* (share) chứ không phải
bàn/90 tuyệt đối, để khi ghép với lambda của từng trận thì đối thủ và sân bãi chỉ
được tính đúng một lần.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import numpy as np

from . import config as C
from .teams import Team

SAMPLE_MINS = 450          # ngưỡng "đủ mẫu" để một cầu thủ được dùng huấn luyện prior


@dataclass
class Player:
    id: str
    name: str
    full_name: str
    team_id: int
    pos: int
    price: float
    ownership: float
    status: str
    is_active: bool
    mins_prev: int
    pts_prev: int
    transfers_in: int
    transfers_out: int
    raw: dict[str, float] = field(default_factory=dict)   # số liệu thô mùa 2025/26

    # kỳ vọng số phút
    xmins: float = 0.0
    p_start: float = 0.0
    p_play: float = 0.0
    p60: float = 0.0
    # tỷ lệ hậu nghiệm
    share_goal: float = 0.0
    share_assist: float = 0.0
    br90: float = 0.0
    sv90: float = 0.0
    yc90: float = 0.0
    rc90: float = 0.0
    pen_won90: float = 0.0
    pen_miss90: float = 0.0
    pen_con90: float = 0.0
    og90: float = 0.0
    pen_save90: float = 0.0
    p_motm_app: float = 0.0
    p_outside: float = 0.0

    @property
    def has_history(self) -> bool:
        return self.mins_prev > 0

    @property
    def n90(self) -> float:
        return self.mins_prev / 90.0

    @property
    def pos_name(self) -> str:
        return C.POS_NAME[self.pos]


# --------------------------------------------------------------------- hồi quy
def _wls(x: np.ndarray, y: np.ndarray, w: np.ndarray) -> tuple[float, float]:
    """Hồi quy tuyến tính có trọng số -> (hệ số chặn, độ dốc)."""
    if len(x) == 0:
        return 0.0, 0.0
    W = w / w.sum() if w.sum() > 0 else np.full_like(w, 1 / len(w))
    mx = float((W * x).sum())
    my = float((W * y).sum())
    var = float((W * (x - mx) ** 2).sum())
    if len(x) < 8 or var <= 1e-9:
        return my, 0.0
    cov = float((W * (x - mx) * (y - my)).sum())
    b = cov / var
    return my - b * mx, b


class PriceModel:
    """Prior theo (vị trí, giá) - tuyến tính theo giá, ước lượng riêng mỗi vị trí."""

    def __init__(self, floor: float = 0.0, cap: float | None = None):
        self.fit: dict[int, tuple[float, float]] = {}
        self.floor = floor
        self.cap = cap

    def train(self, pos: int, x: np.ndarray, y: np.ndarray, w: np.ndarray) -> None:
        self.fit[pos] = _wls(x, y, w)

    def __call__(self, pos: int, price: float) -> float:
        a, b = self.fit.get(pos, (self.floor, 0.0))
        v = max(a + b * price, self.floor)
        return min(v, self.cap) if self.cap is not None else v


# --------------------------------------------------------------------- đọc feed
_RAW_FIELDS = {
    "goals": "gS", "assists": "assist", "cs": "cS", "gc": "gC", "yc": "yC",
    "rc": "rC", "og": "oG", "pen_saved": "pS", "pen_conceded": "pC",
    "pen_won": "pE", "pen_missed": "pM", "saves": "saves", "br": "bR",
    "gob": "gOB", "motm": "mOM",
}


def parse_players(raw: dict, teams: dict[int, Team]) -> list[Player]:
    out: list[Player] = []
    for p in raw["players"]["data"]["value"]["playerList"]:
        tid = int(p["tId"])
        if tid not in teams:
            continue
        out.append(
            Player(
                id=str(p["id"]),
                name=p["pDName"],
                full_name=p.get("latinName") or p.get("pFName") or p["pDName"],
                team_id=tid,
                pos=int(p["skill"]),
                price=float(p["value"]),
                ownership=float(p.get("selPer") or 0.0),
                status=(p.get("pStatus") or "").strip(),
                is_active=bool(p.get("isActive", 1)),
                mins_prev=int(p["minsPlyd"]),
                pts_prev=int(p.get("totPts") or 0),
                transfers_in=int(p.get("mTransferIn") or 0),
                transfers_out=int(p.get("mTransferOut") or 0),
                raw={k: float(p.get(src) or 0.0) for k, src in _RAW_FIELDS.items()},
            )
        )
    return out


# ------------------------------------------------------------- bối cảnh mùa trước
def team_prev_matches(players: list[Player], teams: dict[int, Team]) -> dict[int, float]:
    """Số trận châu Âu mùa trước của mỗi CLB, suy từ cầu thủ đá nhiều phút nhất.

    Cách này miễn nhiễm với việc thống kê "đi theo người": một cầu thủ mới chuyển
    đến cùng lắm kéo con số lên bằng số trận chính anh ta đã đá, không bịa ra trận.
    """
    best: dict[int, int] = {tid: 0 for tid in teams}
    for p in players:
        best[p.team_id] = max(best[p.team_id], p.mins_prev)
    return {tid: (max(8.0, round(m / 88.0)) if m > 0 else 0.0) for tid, m in best.items()}


def team_expected_lambda(teams: dict[int, Team]) -> dict[int, float]:
    """Bàn thắng kỳ vọng/trận của mỗi đội, trung bình cả 8 lượt vòng bảng."""
    out = {}
    for tid, t in teams.items():
        lams = [f["lam_for"] for f in t.fixtures.values()]
        out[tid] = float(np.mean(lams)) if lams else C.BASE_TEAM_GOALS
    return out


# ------------------------------------------------------------------ mô hình chính
def fit_and_apply(players: list[Player], teams: dict[int, Team]) -> dict:
    """Huấn luyện prior theo giá rồi gán tỷ lệ hậu nghiệm cho từng cầu thủ."""
    prev_matches = team_prev_matches(players, teams)
    lam_team = team_expected_lambda(teams)

    def ctx_lambda(p: Player) -> float:
        """lambda của bối cảnh đội đã sinh ra số liệu mùa trước của cầu thủ."""
        return lam_team[p.team_id] if prev_matches[p.team_id] > 0 else C.BASE_TEAM_GOALS

    # ---------- prior số phút: huấn luyện trên các CLB có đá UCL mùa trước
    mins_prior = PriceModel(floor=1.0, cap=90.0)
    for pos in C.POS_NAME:
        rows = [
            (p.price, p.mins_prev / prev_matches[p.team_id])
            for p in players
            if p.pos == pos and prev_matches[p.team_id] > 0 and p.is_active
        ]
        if rows:
            x = np.array([r[0] for r in rows], dtype=float)
            y = np.array([r[1] for r in rows], dtype=float)
            mins_prior.train(pos, x, y, np.ones_like(x))

    trained = [p for p in players if p.mins_prev >= SAMPLE_MINS]

    def model(fn, floor=0.0, cap=None) -> PriceModel:
        """Huấn luyện prior cho một chỉ số, trọng số theo số phút đã đá."""
        m = PriceModel(floor=floor, cap=cap)
        for pos in C.POS_NAME:
            rows = [(p.price, fn(p), p.n90) for p in trained if p.pos == pos]
            if rows:
                x = np.array([r[0] for r in rows], dtype=float)
                y = np.array([r[1] for r in rows], dtype=float)
                w = np.array([r[2] for r in rows], dtype=float)
                m.train(pos, x, y, w)
        return m

    pr_share_goal = model(lambda p: p.raw["goals"] / p.n90 / ctx_lambda(p), floor=0.001, cap=0.55)
    pr_share_ast = model(lambda p: p.raw["assists"] / p.n90 / ctx_lambda(p), floor=0.001, cap=0.45)
    pr_br = model(lambda p: p.raw["br"] / p.n90, floor=0.2, cap=14.0)
    pr_sv = model(lambda p: p.raw["saves"] / p.n90, floor=0.0, cap=8.0)
    pr_yc = model(lambda p: p.raw["yc"] / p.n90, floor=0.02, cap=0.9)
    pr_rc = model(lambda p: p.raw["rc"] / p.n90, floor=0.0, cap=0.15)
    pr_pw = model(lambda p: p.raw["pen_won"] / p.n90, floor=0.0, cap=0.5)
    pr_pm = model(lambda p: p.raw["pen_missed"] / p.n90, floor=0.0, cap=0.3)
    pr_pc = model(lambda p: p.raw["pen_conceded"] / p.n90, floor=0.0, cap=0.4)
    pr_og = model(lambda p: p.raw["og"] / p.n90, floor=0.0, cap=0.2)
    pr_psv = model(lambda p: p.raw["pen_saved"] / p.n90, floor=0.0, cap=0.3)
    pr_motm = model(lambda p: p.raw["motm"] / max(p.mins_prev / 88.0, 1.0), floor=0.01, cap=0.5)
    pr_out = model(
        lambda p: (p.raw["gob"] / p.raw["goals"]) if p.raw["goals"] > 0 else 0.0,
        floor=0.02, cap=0.8,
    )

    K = C.SHRINK_K

    def shrink(count: float, n: float, prior_rate: float, k: float) -> float:
        """Hậu nghiệm Poisson-Gamma cho một tỷ lệ trên mỗi 90 phút."""
        return (count + k * prior_rate) / (n + k)

    for p in players:
        n = p.n90
        lam_ctx = ctx_lambda(p)

        # ---------------- số phút kỳ vọng
        prior_m = mins_prior(p.pos, p.price)
        if prev_matches[p.team_id] > 0 and p.mins_prev > 0:
            obs_m = p.mins_prev / prev_matches[p.team_id]
            w = p.mins_prev / (p.mins_prev + C.MINUTES_SHRINK_MINUTES)
            xmins = w * obs_m + (1 - w) * prior_m
        else:
            xmins = prior_m
        xmins *= C.STATUS_MULT.get(p.status, 1.0)
        if not p.is_active:
            xmins = 0.0
        p.xmins = float(min(max(xmins, 0.0), 90.0))

        # ---------------- tỷ lệ tấn công (quy về tỷ trọng bàn thắng của đội)
        pg = pr_share_goal(p.pos, p.price)
        pa = pr_share_ast(p.pos, p.price)
        p.share_goal = min(shrink(p.raw["goals"] / lam_ctx, n, pg, K["goals"]), C.MAX_SHARE_GOAL)
        p.share_assist = min(
            shrink(p.raw["assists"] / lam_ctx, n, pa, K["assists"]), C.MAX_SHARE_ASSIST
        )

        # ---------------- tỷ lệ độc lập với đối thủ
        p.br90 = shrink(p.raw["br"], n, pr_br(p.pos, p.price), K["balls"])
        p.yc90 = shrink(p.raw["yc"], n, pr_yc(p.pos, p.price), K["cards"])
        p.rc90 = shrink(p.raw["rc"], n, pr_rc(p.pos, p.price), K["cards"])
        p.pen_won90 = shrink(p.raw["pen_won"], n, pr_pw(p.pos, p.price), K["pens"])
        p.pen_miss90 = shrink(p.raw["pen_missed"], n, pr_pm(p.pos, p.price), K["pens"])
        p.pen_con90 = shrink(p.raw["pen_conceded"], n, pr_pc(p.pos, p.price), K["pens"])
        p.og90 = shrink(p.raw["og"], n, pr_og(p.pos, p.price), K["pens"])

        # ---------------- riêng thủ môn
        if p.pos == 1:
            p.sv90 = shrink(p.raw["saves"], n, pr_sv(p.pos, p.price), K["saves"])
            p.pen_save90 = shrink(p.raw["pen_saved"], n, pr_psv(p.pos, p.price), K["pens"])

        # ---------------- Cầu thủ hay nhất trận & tỷ lệ bàn ngoài vòng cấm
        apps = max(p.mins_prev / 88.0, 0.0)
        p.p_motm_app = (p.raw["motm"] + K["motm"] * pr_motm(p.pos, p.price)) / (apps + K["motm"])
        base_out = pr_out(p.pos, p.price)
        if p.raw["goals"] >= 3:
            base_out = 0.5 * base_out + 0.5 * p.raw["gob"] / p.raw["goals"]
        p.p_outside = float(min(max(base_out, 0.0), 0.85))

    normalise_minutes(players, teams)
    for p in players:
        derive_minute_probabilities(p)

    return {"prev_matches": prev_matches, "lam_team": lam_team}


def normalise_minutes(players: list[Player], teams: dict[int, Team]) -> None:
    """Ép tổng số phút mỗi đội về đúng 990 (11 cầu thủ x 90 phút).

    Prior theo giá luôn kéo cả đội xuống thấp vì phần lớn cầu thủ trong danh sách
    đăng ký là dự bị. Ràng buộc "một trận chỉ có 11 người trên sân" là sự thật của
    môn bóng đá, nên áp nó vào sẽ tự động đẩy nhóm đá chính lên đúng tầm và chia
    lại phút cho người thay thế khi ai đó chấn thương hoặc bị treo giò.
    """
    by_team: dict[int, list[Player]] = {}
    for p in players:
        by_team.setdefault(p.team_id, []).append(p)

    for squad in by_team.values():
        for group, target, alpha in (
            ([p for p in squad if p.pos == 1], 90.0, C.MINUTES_CONCENTRATION_GK),
            ([p for p in squad if p.pos != 1], 900.0, C.MINUTES_CONCENTRATION_OUT),
        ):
            pool = [p for p in group if p.xmins > 0]
            for p in pool:
                p.xmins = p.xmins ** alpha
            for _ in range(8):
                total = sum(p.xmins for p in pool)
                if total <= 1e-6:
                    break
                k = target / total
                if abs(k - 1.0) < 0.004:
                    break
                headroom = [p for p in pool if p.xmins < 89.99 or k < 1.0]
                if not headroom:
                    break
                for p in pool:
                    p.xmins = float(min(p.xmins * k, 90.0))


def derive_minute_probabilities(p: Player) -> None:
    """Tách số phút kỳ vọng thành xác suất đá chính / vào sân, sao cho E[phút] khớp."""
    p.p_start = float(min(max((p.xmins - 6.0) / 78.0, 0.0), 0.97))
    p_bench = float(min(max((p.xmins - p.p_start * 84.0) / 24.0, 0.0), 0.6))
    p.p_play = float(min(p.p_start + p_bench, 0.99))
    p.p60 = float(p.p_start * C.P60_GIVEN_START[p.pos])
