"""Tải feed công khai của UEFA Fantasy về thư mục data/raw.

Lưu ý kỹ thuật: máy chủ gaming.uefa.com chỉ trả body khi client chấp nhận nén
(gzip). requests luôn gửi Accept-Encoding: gzip nên hoạt động; curl trần thì treo.
"""
from __future__ import annotations

import json
import pathlib
import time

import requests

from . import config as C

# Khai báo đúng danh tính client. Giả User-Agent trình duyệt sẽ bị Akamai của UEFA
# treo kết nối (trả header 200 rồi không gửi body); UA trung thực thì feed trả bình
# thường. Bắt buộc nhận gzip, vì body không nén hay bị nghẽn giữa chừng.
HEADERS = {
    "User-Agent": "ucl-edge-vn/1.0 (fan project; data pipeline)",
    "Accept": "application/json, text/plain, */*",
    "Accept-Encoding": "gzip, deflate",
}

RAW_DIR = pathlib.Path(__file__).resolve().parents[2] / "data" / "raw"


def _get(url: str, tries: int = 3, timeout: int = 45) -> dict:
    last = None
    for attempt in range(tries):
        try:
            r = requests.get(url, headers=HEADERS, timeout=timeout)
            r.raise_for_status()
            return r.json()
        except Exception as exc:  # noqa: BLE001 - muốn thử lại với mọi lỗi mạng
            last = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"Không tải được {url}: {last}")


def fetch_all(out_dir: pathlib.Path | None = None) -> dict[str, dict]:
    """Tải toàn bộ feed cần dùng, ghi ra data/raw/<tên>.json và trả về dict."""
    out_dir = out_dir or RAW_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    raw: dict[str, dict] = {}
    for name, url in C.FEEDS.items():
        raw[name] = _get(url)
        (out_dir / f"{name}.json").write_text(
            json.dumps(raw[name], ensure_ascii=False), encoding="utf-8"
        )
        print(f"  ✓ {name}")

    # hệ số CLB châu Âu — chỉ trả về top 20, thiếu thì mô hình tự bù bằng pot + giá
    try:
        raw["coefficients"] = _get(C.COEF_URL)
        (out_dir / "coefficients.json").write_text(
            json.dumps(raw["coefficients"], ensure_ascii=False), encoding="utf-8"
        )
        print("  ✓ coefficients")
    except Exception as exc:  # noqa: BLE001
        print(f"  ! bỏ qua coefficients ({exc})")
        raw["coefficients"] = {"data": {"members": []}}

    return raw


def load_cached(out_dir: pathlib.Path | None = None) -> dict[str, dict]:
    """Đọc lại feed đã tải (dùng khi chạy offline/test)."""
    out_dir = out_dir or RAW_DIR
    raw = {}
    for name in list(C.FEEDS) + ["coefficients"]:
        path = out_dir / f"{name}.json"
        if path.exists():
            raw[name] = json.loads(path.read_text(encoding="utf-8"))
        elif name == "coefficients":
            raw[name] = {"data": {"members": []}}
        else:
            raise FileNotFoundError(f"Thiếu {path} — chạy `python -m pipeline.run --fetch` trước.")
    return raw


if __name__ == "__main__":
    fetch_all()
