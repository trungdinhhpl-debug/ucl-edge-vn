"""Kiểm tra phần toán tính điểm: chạy `python -m pipeline.tests.test_xp`.

Không cần pytest — mỗi hàm tự khẳng định và in kết quả.
"""
from __future__ import annotations

import math

from ..ucl import config as C
from ..ucl.players import Player
from ..ucl.xp import Fixture, expected_points, player_distribution


def _blank_player(pos: int = 3, **kw) -> Player:
    """Cầu thủ 'trống': mọi tỷ lệ bằng 0, dùng để cô lập từng hạng mục điểm."""
    p = Player(
        id="x", name="X", full_name="X", team_id=1, pos=pos, price=5.0,
        ownership=0.0, status="", is_active=True, mins_prev=0, pts_prev=0,
        transfers_in=0, transfers_out=0, raw={},
    )
    p.p_start, p.p_play, p.p60 = 1.0, 1.0, 1.0
    for k, v in kw.items():
        setattr(p, k, v)
    return p


FX = Fixture(md=1, opponent=2, home=True, lam_for=1.5, lam_against=1.0)


def test_appearance_only() -> None:
    """Đá trọn trận mà không có sự kiện nào: đúng 2 điểm (ra sân + mốc 60 phút)."""
    p = _blank_player(pos=4)   # tiền đạo không có điểm sạch lưới
    total, parts = expected_points(p, Fixture(1, 2, True, 1.5, 1.0), 0.0)
    assert abs(total - 2.0) < 1e-9, total
    assert parts["appearance"] == 2.0
    print(f"  ✓ ra sân trọn trận = {total:.2f} điểm")


def test_clean_sheet_certain() -> None:
    """Hậu vệ chắc chắn giữ sạch lưới (λ thủng lưới = 0) được thêm đúng 4 điểm."""
    p = _blank_player(pos=2)
    total, _ = expected_points(p, Fixture(1, 2, True, 1.5, 0.0), 0.0)
    assert abs(total - (2 + C.CLEAN_SHEET_POINTS[2])) < 1e-9, total
    print(f"  ✓ hậu vệ sạch lưới chắc chắn = {total:.2f} điểm")


def test_goal_points_by_position() -> None:
    """Một bàn kỳ vọng phải quy đổi đúng theo vị trí (GK/DEF 6, MID 5, FWD 4)."""
    for pos, pts in C.GOAL_POINTS.items():
        # share x lam_for = 1 bàn kỳ vọng, tắt mọi hạng mục khác
        p = _blank_player(pos=pos, share_goal=1.0, p_outside=0.0)
        fx = Fixture(1, 2, True, 1.0, 0.0)
        _, parts = expected_points(p, fx, 0.0)
        # số phút trung bình khi đá chính là 85 nên bàn kỳ vọng là 85/90
        expect = pts * (85.0 / 90.0)
        # breakdown được làm tròn 3 chữ số khi trả ra
        assert abs(parts["goals"] - expect) < 1e-3, (pos, parts["goals"], expect)
    print("  ✓ điểm mỗi bàn đúng theo từng vị trí")


def test_balls_recovered_floor() -> None:
    """Cứ 3 lần thu hồi bóng mới được 1 điểm — phải là hàm sàn, không chia tuyến tính."""
    p = _blank_player(pos=3, br90=3.0)
    _, parts = expected_points(p, Fixture(1, 2, True, 1.0, 0.0), 0.0)
    linear = 3.0 * (85.0 / 90.0) / 3.0
    assert parts["balls"] < linear, (parts["balls"], linear)
    print(f"  ✓ thu hồi bóng: {parts['balls']:.3f} điểm < {linear:.3f} (chia thẳng)")


def test_distribution_matches_mean() -> None:
    """Kỳ vọng của phân phối phải trùng với xP tính theo tổng kỳ vọng thành phần."""
    p = _blank_player(pos=3, share_goal=0.25, share_assist=0.15, br90=4.0, yc90=0.3)
    p.p_start, p.p_play, p.p60 = 0.9, 0.95, 0.78
    total, _ = expected_points(p, FX, 0.2)
    dist = player_distribution(p, FX, 0.2)
    assert abs(total - dist.mean) < 1e-6, (total, dist.mean)
    assert abs(dist.arr.sum() - 1.0) < 1e-9, dist.arr.sum()
    print(f"  ✓ xP {total:.3f} khớp kỳ vọng phân phối {dist.mean:.3f}, tổng xác suất = 1")


def test_probabilities_ordered() -> None:
    """P(≥6) không thể nhỏ hơn P(≥10) và các xác suất phải nằm trong [0,1]."""
    p = _blank_player(pos=4, share_goal=0.3, br90=2.0)
    p.p_start, p.p_play, p.p60 = 0.9, 0.93, 0.8
    d = player_distribution(p, FX, 0.15)
    p6, p10, p15 = d.prob_at_least(6), d.prob_at_least(10), d.prob_at_least(15)
    assert 1.0 >= p6 >= p10 >= p15 >= 0.0, (p6, p10, p15)
    assert abs(d.prob_at_most(5) + p6 - 1.0) < 1e-9
    print(f"  ✓ P(≥6)={p6:.3f} ≥ P(≥10)={p10:.3f} ≥ P(≥15)={p15:.3f}")


def test_no_minutes_no_points() -> None:
    """Cầu thủ chắc chắn không ra sân phải có xP đúng bằng 0."""
    p = _blank_player(pos=3, share_goal=0.5)
    p.p_start = p.p_play = p.p60 = 0.0
    total, _ = expected_points(p, FX, 0.0)
    d = player_distribution(p, FX, 0.0)
    assert total == 0.0 and abs(d.mean) < 1e-12
    print("  ✓ không ra sân = 0 điểm")


def test_clean_sheet_probability_is_poisson() -> None:
    """Xác suất sạch lưới phải bằng exp(-λ) của số bàn đối thủ ghi."""
    lam = 1.2
    p = _blank_player(pos=2)
    _, parts = expected_points(p, Fixture(1, 2, True, 1.0, lam), 0.0)
    expect = math.exp(-lam) * C.CLEAN_SHEET_POINTS[2]
    assert abs(parts["clean_sheet"] - expect) < 1e-3, (parts["clean_sheet"], expect)
    print(f"  ✓ điểm sạch lưới = exp(-{lam})×4 = {expect:.3f}")


def main() -> int:
    tests = [v for k, v in sorted(globals().items()) if k.startswith("test_")]
    print(f"Chạy {len(tests)} bài kiểm tra:")
    for t in tests:
        t()
    print("Tất cả đều đạt.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
