# ★ UCL Edge VN

**Trợ lý dữ liệu cho UEFA Champions League Fantasy** — điểm kỳ vọng, số phút kỳ vọng,
phân phối điểm và bộ tối ưu đội hình 15 người, tất cả bằng tiếng Việt.

> Sản phẩm độc lập của người hâm mộ. Không liên kết với UEFA. Mọi con số là **dự báo có
> sai số**, không phải lời khẳng định.

Game gốc: <https://gaming.uefa.com/en/uclfantasy>

---

## Triết lý

Hệ thống **tách điểm kỳ vọng khỏi ý kiến đám đông**:

- **Số phút kỳ vọng là biến số hạng nhất**, không phải phong độ. Tổng số phút của mỗi
  đội bị ép về đúng 990 (11 người × 90 phút) — ràng buộc có thật của môn bóng đá.
- Sản lượng tấn công quy về **tỷ trọng trong bàn thắng của đội**, rồi mới nhân với λ của
  từng trận, nên bối cảnh đối thủ và sân bãi chỉ được tính đúng một lần.
- Mọi tỷ lệ đều **co ngót Bayes** về prior theo giá và vị trí — bắt buộc, vì 66% cầu thủ
  mùa này chưa có phút nào ở UCL mùa trước.
- Kết quả là **một phân phối điểm**, không phải một con số: sàn, trần, P(bùng nổ) đều
  tính bằng tích chập chính xác chứ không mô phỏng Monte Carlo.

Những gì hệ thống **không** làm: không xếp hạng bằng tổng điểm mùa trước, không coi tỷ
lệ sở hữu là bằng chứng cầu thủ hay, không khẳng định chắc chắn ai sẽ ghi bàn.

---

## Các trang

| Trang | Nội dung |
|---|---|
| **Tổng quan** | Đếm ngược hạn chốt (giờ VN), top xP, ứng viên đội trưởng, đáng tiền nhất, quân bài khác biệt, cảnh báo chấn thương |
| **Chọn đội hình** | Bộ tối ưu 15 người chạy ngay trong trình duyệt: ngân sách, khẩu vị rủi ro, ghim cầu thủ, đổi người thủ công trên sân |
| **Kế hoạch** | Lộ trình chuyển nhượng cả vòng bảng: đổi ai ở lượt nào, có đáng chịu phạt −4 không, đội trưởng từng lượt |
| **Chip** | Wildcard và Limitless đáng bao nhiêu điểm ở từng lượt, kèm đội hình trong mơ khi bỏ trần ngân sách |
| **Cầu thủ** | Bảng tra cứu 1.162 cầu thủ, lọc theo vị trí/CLB/giá/số phút; bấm vào để xem phân rã xP và số liệu nền |
| **Đội trưởng** | Xếp hạng theo điểm kỳ vọng / trần điểm / sàn điểm, kèm P(≥6), P(≥10), P(tịt ngòi) |
| **Lịch thi đấu** | Ma trận độ khó 8 lượt vòng bảng, tách riêng độ khó tấn công và phòng ngự; λ của từng trận |
| **Phương pháp** | Toàn bộ công thức, bảng điểm chính thức, và danh sách giới hạn của mô hình |

---

## Kiến trúc

```
Feed công khai UEFA ──► pipeline Python ──► JSON tĩnh ──► Next.js (chạy tĩnh)
 gaming.uefa.com          sức mạnh đội          frontend/       bộ tối ưu MILP-thay-thế
 comp.uefa.com            Poisson theo trận     public/data/    chạy bằng TypeScript
                          xMins + tỷ lệ Bayes                   ngay trong trình duyệt
                          tích chập phân phối
```

Không có máy chủ backend: dữ liệu là JSON tĩnh, bộ tối ưu chạy phía trình duyệt. Nhờ
vậy trang web triển khai được trên hạ tầng miễn phí và không bao giờ có "cold start".

**Stack:** Python 3.11+ · NumPy · requests — Next.js 15 · TypeScript · Tailwind.

---

## Chạy tại máy

Yêu cầu: **Python 3.11+** và **Node 18+**.

### 1) Dựng dữ liệu

```bash
pip install -r pipeline/requirements.txt
python -m pipeline.run
```

Lệnh này tải feed UEFA về `data/raw/` rồi ghi `frontend/public/data/{players,teams,meta}.json`.
Mất khoảng 10 giây. Chạy lại với `--cached` để dùng feed đã tải (không cần mạng):

```bash
python -m pipeline.run --cached
```

### 2) Chạy web

```bash
cd frontend
npm install
npm run dev
```

Mở <http://localhost:3000>.

### 3) Kiểm tra phần toán

```bash
python -m pipeline.tests.test_xp
```

---

## Triển khai

Frontend là ứng dụng Next.js tĩnh — trỏ thư mục gốc dự án của Vercel vào `frontend/` là
xong. Dữ liệu được làm mới bằng GitHub Actions
([.github/workflows/refresh-data.yml](.github/workflows/refresh-data.yml)) chạy 4 lần mỗi
ngày, commit thẳng JSON mới vào repo và kích hoạt deploy lại.

---

## Ghi chú kỹ thuật đáng nhớ

- **Đừng giả User-Agent trình duyệt khi gọi feed UEFA.** Akamai sẽ trả header 200 rồi
  treo kết nối, không gửi body — biểu hiện y hệt lỗi mạng. Khai báo UA thật thì bình
  thường. Bắt buộc chấp nhận gzip.
- **Thống kê UEFA đi theo cầu thủ, không theo CLB.** Cầu thủ chuyển nhượng mang số liệu
  của đội cũ sang đội mới, nên mọi phép cộng dồn theo đội đều sai. Vì thế sức mạnh đội
  được dựng từ giá + nhóm hạt giống + hệ số CLB, không phải từ bàn thắng mùa trước.
- **Trước lượt 1, feed phát số liệu của mùa 2025/26.** Giống bẫy tiền mùa giải của FPL:
  con số trông như "mùa này" nhưng thực ra là mùa trước.

## Nguồn dữ liệu

| Nguồn | Dùng để |
|---|---|
| `gaming.uefa.com/.../feeds/players` | cầu thủ, giá, tỷ lệ sở hữu, thống kê 2025/26 |
| `gaming.uefa.com/.../feeds/fixtures` | lịch 8 lượt vòng bảng, hạn chốt từng lượt |
| `gaming.uefa.com/.../feeds/teams` | 36 CLB, nhóm hạt giống bốc thăm |
| `gaming.uefa.com/.../feeds/constraints` | ngân sách, giới hạn cầu thủ/CLB, lượt hiện tại |
| `gaming.uefa.com/.../feeds/compositions` | các sơ đồ hợp lệ |
| `comp.uefa.com/v2/coefficients` | hệ số CLB châu Âu 5 năm (20 đội đứng đầu) |

Bảng điểm được lấy trực tiếp từ mã nguồn trang chủ game, không chép tay.
