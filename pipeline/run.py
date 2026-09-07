"""Điểm chạy của pipeline.

    python -m pipeline.run              # tải feed mới rồi dựng lại dữ liệu
    python -m pipeline.run --cached     # dùng feed đã tải trong data/raw (chạy offline)
"""
from __future__ import annotations

import argparse
import sys
import time

from .ucl import build as build_mod
from .ucl import fetch


def main() -> int:
    ap = argparse.ArgumentParser(description="Dựng dữ liệu UCL Edge VN")
    ap.add_argument("--cached", action="store_true", help="dùng feed đã tải sẵn")
    args = ap.parse_args()

    t0 = time.time()
    if args.cached:
        print("• Đọc feed từ data/raw …")
        raw = fetch.load_cached()
    else:
        print("• Tải feed UEFA …")
        raw = fetch.fetch_all()

    print("• Dựng mô hình & tính xP …")
    stats = build_mod.build(raw)

    print(
        f"✓ Xong sau {time.time() - t0:.1f}s — "
        f"{stats['players']} cầu thủ, {stats['teams']} CLB, {stats['matchdays']} lượt đấu."
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
