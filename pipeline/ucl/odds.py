"""Kèo nhà cái từ Pinnacle, quy về xác suất thật và bàn thắng kỳ vọng của thị trường.

Vì sao chọn Pinnacle: đây là nhà cái có biên lợi nhuận thấp nhất và nhận cược lớn, nên
giá của họ được coi là giá tham chiếu của cả thị trường. Feed guest API là feed công khai
chính trang web của họ đang dùng.

Ba bước xử lý:

1. Giá Mỹ -> xác suất ngầm. Tổng ba cửa 1X2 luôn > 100% vì đã cộng hoa hồng nhà cái
   (overround); phải chia lại cho tổng thì mới ra xác suất thật.
2. Khớp một mô hình Poisson hai chiều vào *toàn bộ* các kèo cùng lúc (1X2, tài xỉu, tài
   xỉu từng đội) để suy ra lambda — số bàn kỳ vọng mỗi đội theo thị trường. Kèo nào nhà
   cái nhận cược lớn hơn thì được cho trọng số cao hơn, vì giá đó sắc hơn.
3. So lambda của thị trường với lambda của mô hình. Chỗ nào lệch nhiều là chỗ đáng ngờ:
   thị trường biết đội hình dự kiến và tin nội bộ mà mô hình không có.
"""
from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass, field

import numpy as np
import requests

from .fetch import HEADERS

PINNACLE_BASE = "https://guest.api.arcadia.pinnacle.com/0.1"
UCL_LEAGUE_ID = 2627          # UEFA - Champions League
SOCCER_SPORT_ID = 29

# Tên Pinnacle -> tên UEFA, cho những đội mà chuẩn hoá chuỗi không tự khớp được.
NAME_ALIASES = {
    "bayern munich": "Bayern München",
    "bodo glimt": "Bodø/Glimt",
    "borussia dortmund": "B. Dortmund",
    "lask linz": "LASK",
    "manchester city": "Man City",
    "manchester united": "Man Utd",
    "slavia prague": "Slavia Praha",
    "slovan bratislava": "S. Bratislava",
}

MAX_GOALS = 10                # đủ xa: P(ghi hơn 10 bàn) nhỏ hơn 1e-6 với mọi lambda thực tế


@dataclass
class MatchOdds:
    home_id: int
    away_id: int
    kickoff_utc: str
    # xác suất đã bỏ hoa hồng nhà cái
    p_home: float
    p_draw: float
    p_away: float
    # kèo hiển thị nguyên trạng
    handicap_line: float | None      # dương = đội nhà chấp
    handicap_price_home: int | None
    total_line: float | None
    total_over_price: int | None
    # bàn thắng kỳ vọng suy ra từ thị trường
    lam_home: float
    lam_away: float
    fit_error: float                 # sai số khớp mô hình, càng nhỏ càng đáng tin
    markets_used: int
    raw_margin: float                # hoa hồng nhà cái ở kèo 1X2
    notes: list[str] = field(default_factory=list)


# ------------------------------------------------------------------ tiện ích giá
def american_to_prob(price: float) -> float:
    """Giá Mỹ -> xác suất ngầm (đã gồm hoa hồng nhà cái)."""
    if price > 0:
        return 100.0 / (price + 100.0)
    return -price / (-price + 100.0)


def american_to_decimal(price: float) -> float:
    return 1.0 + (price / 100.0 if price > 0 else 100.0 / -price)


def devig(probs: list[float]) -> list[float]:
    """Bỏ hoa hồng bằng cách chia đều theo tỷ lệ. Pinnacle biên rất mỏng nên cách này đủ."""
    s = sum(probs)
    return [p / s for p in probs] if s > 0 else probs


# ------------------------------------------------------------------ khớp tên đội
def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    for w in (" fc", " cf", " sc", " ac", " as", " ss", "fc ", "1. ", "fk ", "sk "):
        s = s.replace(w, " ")
    return re.sub(r"[^a-z0-9]", "", s)


def build_name_index(teams: dict) -> dict[str, int]:
    """Bảng tra tên -> id đội, gồm cả tên đầy đủ lẫn tên rút gọn của UEFA."""
    idx: dict[str, int] = {}
    for tid, t in teams.items():
        for label in (t.name, t.short):
            if label:
                idx[_norm(label)] = tid
    return idx


def match_team(pin_name: str, index: dict[str, int], teams: dict) -> int | None:
    key = _norm(pin_name)
    if key in index:
        return index[key]

    alias = NAME_ALIASES.get(pin_name.strip().lower())
    if alias:
        akey = _norm(alias)
        if akey in index:
            return index[akey]

    # cuối cùng mới thử khớp một phần, và chỉ chấp nhận khi đúng một đội trùng
    hits = {tid for k, tid in index.items() if len(k) >= 4 and (k in key or key in k)}
    return hits.pop() if len(hits) == 1 else None


# ------------------------------------------------------------------ mô hình Poisson
def _pmf(lam: float) -> np.ndarray:
    ks = np.arange(MAX_GOALS + 1)
    logs = -lam + ks * math.log(max(lam, 1e-9)) - np.array([math.lgamma(k + 1) for k in ks])
    p = np.exp(logs)
    return p / p.sum()


def fit_lambdas(targets: list[tuple[str, float, float, float]]) -> tuple[float, float, float]:
    """Tìm cặp (lambda nhà, lambda khách) khớp nhất với các xác suất thị trường.

    `targets` là danh sách (loại, tham số, xác suất thị trường, trọng số). Quét lưới thô
    rồi tinh — nhanh và không cần thêm thư viện tối ưu nào.
    """

    def sse(lh: float, la: float) -> float:
        m = np.outer(_pmf(lh), _pmf(la))
        i = np.arange(MAX_GOALS + 1)
        diff = i[:, None] - i[None, :]
        tot = i[:, None] + i[None, :]
        err = 0.0
        for kind, param, target, weight in targets:
            if kind == "home":
                p = m[diff > 0].sum()
            elif kind == "draw":
                p = np.trace(m)
            elif kind == "away":
                p = m[diff < 0].sum()
            elif kind == "over":
                p = m[tot > param].sum()
            elif kind == "over_home":
                p = m.sum(axis=1)[int(math.ceil(param)) :].sum()
            elif kind == "over_away":
                p = m.sum(axis=0)[int(math.ceil(param)) :].sum()
            else:
                continue
            err += weight * (p - target) ** 2
        return float(err)

    best = (1.4, 1.2, float("inf"))
    for lh in np.arange(0.2, 4.3, 0.1):
        for la in np.arange(0.2, 4.3, 0.1):
            e = sse(lh, la)
            if e < best[2]:
                best = (lh, la, e)

    lh0, la0 = best[0], best[1]
    for lh in np.arange(max(0.05, lh0 - 0.1), lh0 + 0.101, 0.01):
        for la in np.arange(max(0.05, la0 - 0.1), la0 + 0.101, 0.01):
            e = sse(lh, la)
            if e < best[2]:
                best = (lh, la, e)

    return float(best[0]), float(best[1]), float(best[2])


# ------------------------------------------------------------------ tải & ghép
def _get(url: str, timeout: int = 30) -> list | dict:
    r = requests.get(url, headers=HEADERS, timeout=timeout)
    r.raise_for_status()
    return r.json()


def fetch_odds(teams: dict) -> dict[tuple[int, int], MatchOdds]:
    """Trả về kèo theo cặp (id đội nhà, id đội khách). Lỗi mạng thì ném ra ngoài."""
    matchups = _get(f"{PINNACLE_BASE}/leagues/{UCL_LEAGUE_ID}/matchups")
    markets = _get(f"{PINNACLE_BASE}/leagues/{UCL_LEAGUE_ID}/markets/straight")

    index = build_name_index(teams)
    by_matchup: dict[int, list[dict]] = {}
    for mk in markets:
        if mk.get("period") == 0 and mk.get("status") == "open":
            by_matchup.setdefault(mk["matchupId"], []).append(mk)

    out: dict[tuple[int, int], MatchOdds] = {}
    unmatched: list[str] = []

    for mu in matchups:
        if mu.get("type") != "matchup" or mu.get("parentId") or mu.get("special"):
            continue
        parts = {p.get("alignment"): p.get("name") for p in mu.get("participants", [])}
        if "home" not in parts or "away" not in parts:
            continue

        hid = match_team(parts["home"], index, teams)
        aid = match_team(parts["away"], index, teams)
        if hid is None or aid is None:
            unmatched.append(f"{parts['home']} vs {parts['away']}")
            continue

        mks = by_matchup.get(mu["id"], [])
        parsed = _parse_match(mks)
        if parsed is None:
            continue

        out[(hid, aid)] = MatchOdds(
            home_id=hid,
            away_id=aid,
            kickoff_utc=mu.get("startTime", ""),
            **parsed,
        )

    if unmatched:
        raise RuntimeError(
            "Không khớp được tên đội của Pinnacle với UEFA: "
            + "; ".join(unmatched)
            + " — cập nhật NAME_ALIASES trong pipeline/ucl/odds.py"
        )
    return out


def _parse_match(mks: list[dict]) -> dict | None:
    """Rút 1X2, kèo chấp, tài xỉu từ danh sách kèo của một trận rồi khớp lambda."""
    money = next((m for m in mks if m["type"] == "moneyline" and not m.get("isAlternate")), None)
    if not money:
        return None

    prices = {p["designation"]: p["price"] for p in money["prices"]}
    if not {"home", "draw", "away"} <= set(prices):
        return None

    raw = [american_to_prob(prices[k]) for k in ("home", "draw", "away")]
    margin = sum(raw) - 1.0
    p_home, p_draw, p_away = devig(raw)

    targets: list[tuple[str, float, float, float]] = [
        ("home", 0.0, p_home, 3.0),
        ("draw", 0.0, p_draw, 3.0),
        ("away", 0.0, p_away, 3.0),
    ]
    used = 3

    # ---- tài xỉu: chỉ dùng vạch .5 để không phải xử lý vạch 1/4
    halves = [
        m for m in mks
        if m["type"] == "total" and abs((m["prices"][0].get("points", 0) % 1) - 0.5) < 1e-9
    ]
    main_total = next((m for m in mks if m["type"] == "total" and not m.get("isAlternate")), None)
    main_line = main_total["prices"][0].get("points") if main_total else None
    if halves:
        pick = min(halves, key=lambda m: abs(m["prices"][0]["points"] - (main_line or 2.5)))
        pr = {p["designation"]: p["price"] for p in pick["prices"]}
        if {"over", "under"} <= set(pr):
            over, _ = devig([american_to_prob(pr["over"]), american_to_prob(pr["under"])])
            targets.append(("over", pick["prices"][0]["points"], over, 2.0))
            used += 1

    # ---- tài xỉu từng đội: ràng buộc trực tiếp lên lambda của mỗi bên
    for side, kind in (("home", "over_home"), ("away", "over_away")):
        for m in mks:
            if m["type"] != "team_total" or m.get("side") != side:
                continue
            pts = m["prices"][0].get("points")
            if pts is None or abs((pts % 1) - 0.5) > 1e-9 or pts > 2.5:
                continue
            pr = {p["designation"]: p["price"] for p in m["prices"]}
            if {"over", "under"} <= set(pr):
                over, _ = devig([american_to_prob(pr["over"]), american_to_prob(pr["under"])])
                targets.append((kind, pts, over, 1.0))
                used += 1

    lam_home, lam_away, err = fit_lambdas(targets)

    spread = next((m for m in mks if m["type"] == "spread" and not m.get("isAlternate")), None)
    hcap_line = hcap_price = None
    if spread:
        home_price = next((p for p in spread["prices"] if p["designation"] == "home"), None)
        if home_price:
            # dấu đảo lại cho khớp cách đọc của người Việt: dương = đội nhà chấp
            hcap_line = -float(home_price.get("points", 0.0))
            hcap_price = int(home_price["price"])

    over_price = None
    if main_total:
        op = next((p for p in main_total["prices"] if p["designation"] == "over"), None)
        over_price = int(op["price"]) if op else None

    return {
        "p_home": p_home,
        "p_draw": p_draw,
        "p_away": p_away,
        "handicap_line": hcap_line,
        "handicap_price_home": hcap_price,
        "total_line": float(main_line) if main_line is not None else None,
        "total_over_price": over_price,
        "lam_home": lam_home,
        "lam_away": lam_away,
        "fit_error": err,
        "markets_used": used,
        "raw_margin": margin,
    }
