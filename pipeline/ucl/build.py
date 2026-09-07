"""Ghép mọi thứ lại và xuất JSON tĩnh cho frontend đọc."""
from __future__ import annotations

import json
import pathlib
from datetime import datetime, timezone

import numpy as np

from . import config as C
from .players import Player, fit_and_apply, parse_players
from .teams import Team, build_matches, build_teams
from .xp import Fixture, expected_points, player_distribution

OUT_DIR = pathlib.Path(__file__).resolve().parents[2] / "public" / "data"


def _round(x: float, n: int = 3) -> float:
    return float(round(x, n))


def _motm_normaliser(players: list[Player], matchdays: dict[int, dict]) -> dict[int, dict[str, float]]:
    """Chuẩn hoá xác suất Cầu thủ hay nhất trận: mỗi trận đúng 1 người được trao."""
    by_team: dict[int, list[Player]] = {}
    for p in players:
        by_team.setdefault(p.team_id, []).append(p)

    out: dict[int, dict[str, float]] = {}
    for md, info in matchdays.items():
        probs: dict[str, float] = {}
        for m in info["matches"]:
            pool = by_team.get(m["home"], []) + by_team.get(m["away"], [])
            weights = {p.id: p.p_motm_app * p.p_play for p in pool}
            s = sum(weights.values())
            if s <= 1e-9:
                continue
            for pid, w in weights.items():
                probs[pid] = w / s
        out[md] = probs
    return out


def _difficulty_scale(values: list[float]) -> tuple[float, float]:
    """Lấy phân vị 10-90 làm hai đầu thang khó, tránh bị vài trận cực đoan kéo lệch."""
    if not values:
        return 0.0, 1.0
    return float(np.percentile(values, 10)), float(np.percentile(values, 90))


def _bucket(x: float, lo: float, hi: float) -> int:
    if hi <= lo:
        return 3
    t = (x - lo) / (hi - lo)
    return int(min(5, max(1, np.floor(t * 5) + 1)))


def build(raw: dict, out_dir: pathlib.Path | None = None) -> dict:
    out_dir = out_dir or OUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    teams = build_teams(raw)
    matches, matchdays = build_matches(raw, teams)
    players = parse_players(raw, teams)
    ctx = fit_and_apply(players, teams)

    constraints = raw["constraints"]["data"]["value"]
    current_md = int(constraints.get("matchdayId") or 1)
    motm = _motm_normaliser(players, matchdays)

    # ---------------------------------------------------------- thang độ khó
    lam_for_all = [f["lam_for"] for t in teams.values() for f in t.fixtures.values()]
    lam_ag_all = [f["lam_against"] for t in teams.values() for f in t.fixtures.values()]
    atk_lo, atk_hi = _difficulty_scale(lam_for_all)
    def_lo, def_hi = _difficulty_scale(lam_ag_all)

    # ---------------------------------------------------------- xP từng lượt đấu
    md_ids = sorted(matchdays)
    player_rows = []
    for p in players:
        xp_by_md: dict[int, float] = {}
        breakdown_current: dict[str, float] = {}
        dist_summary = None

        for md in md_ids:
            fx_info = teams[p.team_id].fixtures.get(md)
            if not fx_info or p.p_play <= 1e-4:
                xp_by_md[md] = 0.0
                continue
            fx = Fixture(
                md=md,
                opponent=fx_info["opponent"],
                home=fx_info["home"],
                lam_for=fx_info["lam_for"],
                lam_against=fx_info["lam_against"],
                kickoff_utc=fx_info["kickoff_utc"],
            )
            pm = motm.get(md, {}).get(p.id, 0.0)
            total, parts = expected_points(p, fx, pm)
            xp_by_md[md] = _round(total, 3)
            if md == current_md:
                breakdown_current = parts
                dist = player_distribution(p, fx, pm)
                dist_summary = {
                    "mean": _round(dist.mean, 3),
                    "p_blank": _round(dist.prob_at_most(2), 4),
                    "p_returns": _round(dist.prob_at_least(6), 4),
                    "p_haul": _round(dist.prob_at_least(10), 4),
                    "p_big_haul": _round(dist.prob_at_least(15), 4),
                }

        fx_now = teams[p.team_id].fixtures.get(current_md)
        horizon = sum(xp_by_md.get(md, 0.0) for md in md_ids if md >= current_md)

        player_rows.append(
            {
                "id": p.id,
                "name": p.name,
                "fullName": p.full_name,
                "team": p.team_id,
                "pos": p.pos,
                "posName": p.pos_name,
                "price": p.price,
                "ownership": p.ownership,
                "status": p.status,
                "statusText": C.STATUS_VI.get(p.status, p.status),
                "isActive": p.is_active,
                "hasHistory": p.has_history,
                "minsPrev": p.mins_prev,
                "ptsPrev": p.pts_prev,
                "goalsPrev": int(p.raw["goals"]),
                "assistsPrev": int(p.raw["assists"]),
                "transfersIn": p.transfers_in,
                "transfersOut": p.transfers_out,
                "xMins": _round(p.xmins, 1),
                "pStart": _round(p.p_start, 3),
                "pPlay": _round(p.p_play, 3),
                "p60": _round(p.p60, 3),
                "shareGoal": _round(p.share_goal, 4),
                "shareAssist": _round(p.share_assist, 4),
                "br90": _round(p.br90, 2),
                "sv90": _round(p.sv90, 2),
                "pMotm": _round(motm.get(current_md, {}).get(p.id, 0.0), 4),
                "xp": {str(md): xp_by_md.get(md, 0.0) for md in md_ids},
                "xpNow": xp_by_md.get(current_md, 0.0),
                "xpHorizon": _round(horizon, 2),
                "valueNow": _round(xp_by_md.get(current_md, 0.0) / p.price, 3),
                "valueHorizon": _round(horizon / p.price, 3),
                "breakdown": breakdown_current,
                "dist": dist_summary,
                "opponent": fx_now["opponent"] if fx_now else None,
                "isHome": fx_now["home"] if fx_now else None,
            }
        )

    # ---------------------------------------------------------- đội
    team_rows = []
    for t in sorted(teams.values(), key=lambda x: -x.power):
        fixtures = []
        for md in md_ids:
            f = t.fixtures.get(md)
            if not f:
                continue
            fixtures.append(
                {
                    "md": md,
                    "opponent": f["opponent"],
                    "home": f["home"],
                    "lamFor": _round(f["lam_for"], 2),
                    "lamAgainst": _round(f["lam_against"], 2),
                    # 1 = dễ ghi bàn nhất / dễ giữ sạch lưới nhất
                    "atkDifficulty": 6 - _bucket(f["lam_for"], atk_lo, atk_hi),
                    "defDifficulty": _bucket(f["lam_against"], def_lo, def_hi),
                    "kickoffUtc": f["kickoff_utc"],
                }
            )
        team_rows.append(
            {
                "id": t.id,
                "name": t.name,
                "short": t.short,
                "code": t.code,
                "pot": t.pot,
                "power": _round(t.power, 3),
                "atk": _round(t.atk, 3),
                "def": _round(t.dfn, 3),
                "coefficient": t.coef,
                "priceIndex": _round(t.price_index, 1),
                "hasUclHistory": ctx["prev_matches"][t.id] > 0,
                "lamAvg": _round(ctx["lam_team"][t.id], 2),
                "fixtures": fixtures,
            }
        )

    # ---------------------------------------------------------- siêu dữ liệu
    n_no_history = sum(1 for p in players if not p.has_history)
    meta = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "season": "2026/27",
        "tourId": C.TOUR_ID,
        "currentMd": current_md,
        "deadlineUtc": matchdays.get(current_md, {}).get("deadline_utc"),
        "matchdays": [
            {
                "md": md,
                "deadlineUtc": matchdays[md]["deadline_utc"],
                "unlimitedTransfers": matchdays[md]["unlimited_transfers"],
                "matches": matchdays[md]["matches"],
            }
            for md in md_ids
        ],
        "rules": {
            "budget": C.BUDGET,
            "squadSize": C.SQUAD_SIZE,
            "squadByPos": {str(k): v for k, v in C.SQUAD_BY_POS.items()},
            "maxPerClub": C.MAX_PER_CLUB,
            "extraTransferCost": C.EXTRA_TRANSFER_COST,
            "unlimitedTransferMds": C.UNLIMITED_TRANSFER_MDS,
            "formations": [
                {"id": int(k), "gk": v["gk"], "def": v["def"], "mid": v["mid"], "fwd": v["fwd"]}
                for k, v in raw["compositions"]["data"]["value"]["comp"].items()
                if v.get("isActive")
            ],
            "scoring": {
                "goal": C.GOAL_POINTS,
                "cleanSheet": C.CLEAN_SHEET_POINTS,
                "appearance": C.APPEARANCE,
                "sixtyMinutes": C.SIXTY_MIN_BONUS,
                "assist": C.ASSIST,
                "goalOutsideBox": C.GOAL_OUTSIDE_BOX_BONUS,
                "playerOfTheMatch": C.PLAYER_OF_THE_MATCH,
                "ballsRecoveredPerPoint": C.BALLS_RECOVERED_PER_POINT,
                "savesPerPoint": C.SAVES_PER_POINT,
                "goalsConcededPerMinus": C.GOALS_CONCEDED_PER_MINUS,
                "penaltySaved": C.PENALTY_SAVED,
                "penaltyWon": C.PENALTY_WON,
                "penaltyConceded": C.PENALTY_CONCEDED,
                "penaltyMissed": C.PENALTY_MISSED,
                "yellowCard": C.YELLOW_CARD,
                "redCard": C.RED_CARD,
                "ownGoal": C.OWN_GOAL,
            },
        },
        "dataQuality": {
            "players": len(players),
            "playersWithoutUclHistory": n_no_history,
            "teamsWithoutUclHistory": sum(
                1 for tid in teams if ctx["prev_matches"][tid] == 0
            ),
            "note": (
                "Trước lượt 1, mọi số liệu UEFA phát ra là của mùa 2025/26 và đi theo "
                "cầu thủ chứ không theo CLB. Cầu thủ chưa từng đá UCL chỉ có prior theo giá."
            ),
        },
        "modelParams": {
            "baseTeamGoals": C.BASE_TEAM_GOALS,
            "homeAttack": C.HOME_ATTACK,
            "awayAttack": C.AWAY_ATTACK,
            "atkSpread": C.ATK_SPREAD,
            "defSpread": C.DEF_SPREAD,
            "weights": {"price": C.W_PRICE, "pot": C.W_POT, "coefficient": C.W_COEF},
            "shrinkK": C.SHRINK_K,
        },
    }

    (out_dir / "meta.json").write_text(json.dumps(meta, ensure_ascii=False), encoding="utf-8")
    (out_dir / "teams.json").write_text(json.dumps(team_rows, ensure_ascii=False), encoding="utf-8")
    (out_dir / "players.json").write_text(
        json.dumps(player_rows, ensure_ascii=False), encoding="utf-8"
    )

    return {"players": len(player_rows), "teams": len(team_rows), "matchdays": len(md_ids)}
