"""Hằng số luật chơi + tham số mô hình.

Bảng điểm và ràng buộc đội hình được lấy trực tiếp từ feed/bundle chính thức của
gaming.uefa.com (xem docs/DATA_SOURCES.md), không phải phỏng đoán.
"""
from __future__ import annotations

# ---------------------------------------------------------------- nguồn dữ liệu
TOUR_ID = 90            # mùa 2026/27 trong feed UEFA
COMP_ID = 1             # UEFA Champions League
BASE = "https://gaming.uefa.com/en/uclfantasy/services"

FEEDS = {
    "constraints": f"{BASE}/feeds/constraints/constraints_{TOUR_ID}.json",
    "compositions": f"{BASE}/feeds/compositions/compositions_{TOUR_ID}.json",
    "teams": f"{BASE}/feeds/teams/teams_{TOUR_ID}_en.json",
    "fixtures": f"{BASE}/feeds/fixtures/fixtures_{TOUR_ID}_en.json",
    "players": f"{BASE}/api/Feed/players?tourId=1&gamedayId=1&language=en",
}
COEF_URL = (
    "https://comp.uefa.com/v2/coefficients"
    "?coefficientRange=OVERALL&coefficientType=MEN_CLUB&language=EN&seasonYear=2027"
)

# ---------------------------------------------------------------- luật đội hình
SQUAD_SIZE = 15
SQUAD_BY_POS = {1: 2, 2: 5, 3: 5, 4: 3}   # GK, DEF, MID, FWD
MAX_PER_CLUB = 3
BUDGET = 100.0
POS_NAME = {1: "GK", 2: "DEF", 3: "MID", 4: "FWD"}
POS_VI = {1: "Thủ môn", 2: "Hậu vệ", 3: "Tiền vệ", 4: "Tiền đạo"}

# Vòng được chuyển nhượng không giới hạn (MD1, play-off lượt đi, vòng 1/8 lượt đi)
UNLIMITED_TRANSFER_MDS = [1, 9, 11]
EXTRA_TRANSFER_COST = -4

# ---------------------------------------------------------------- bảng điểm UCL
GOAL_POINTS = {1: 6, 2: 6, 3: 5, 4: 4}
CLEAN_SHEET_POINTS = {1: 4, 2: 4, 3: 1, 4: 0}
APPEARANCE = 1
SIXTY_MIN_BONUS = 1
ASSIST = 3
GOAL_OUTSIDE_BOX_BONUS = 1
PLAYER_OF_THE_MATCH = 3
BALLS_RECOVERED_PER_POINT = 3        # cứ 3 lần thu hồi bóng = 1 điểm
SAVES_PER_POINT = 3                  # cứ 3 pha cứu thua = 1 điểm (thủ môn)
GOALS_CONCEDED_PER_MINUS = 2         # cứ 2 bàn thủng lưới = -1 (GK/DEF)
PENALTY_SAVED = 5
PENALTY_WON = 2
PENALTY_CONCEDED = -1
PENALTY_MISSED = -2
YELLOW_CARD = -1
RED_CARD = -3
OWN_GOAL = -2

# ---------------------------------------------------------------- tham số mô hình
BASE_TEAM_GOALS = 1.55       # bàn thắng kỳ vọng/đội/trận ở vòng bảng UCL
HOME_ATTACK = 1.10           # lợi thế sân nhà (nhân vào hàng công đội nhà)
AWAY_ATTACK = 0.92
ATK_SPREAD = 0.26            # độ dốc: atk = exp(ATK_SPREAD * power)
DEF_SPREAD = 0.24            # def = exp(-DEF_SPREAD * power)
LAMBDA_MIN, LAMBDA_MAX = 0.30, 4.20

# trọng số ghép sức mạnh đội (tổng = 1)
W_PRICE, W_POT, W_COEF = 0.42, 0.30, 0.28

# co ngót Bayes: số đơn vị 90 phút "ảo" của prior
SHRINK_K = {
    "goals": 13.0, "assists": 11.0, "balls": 5.0, "saves": 4.0,
    "cards": 8.0, "pens": 12.0, "motm": 10.0,
}

# Trần tỷ trọng: không cầu thủ nào giữ mãi được tỷ lệ tham gia bàn thắng cực đoan.
MAX_SHARE_GOAL, MAX_SHARE_ASSIST = 0.40, 0.30

# Phút thi đấu thật tập trung hơn nhiều so với đường thẳng theo giá: nâng luỹ thừa
# rồi mới chuẩn hoá về 990 phút/đội. Thủ môn tập trung mạnh nhất (thường chỉ 1 người đá).
MINUTES_CONCENTRATION_GK = 2.6
MINUTES_CONCENTRATION_OUT = 1.75

# Tỷ lệ cầu thủ đá chính trụ được tới phút 60
P60_GIVEN_START = {1: 0.97, 2: 0.90, 3: 0.86, 4: 0.84}
MINUTES_SHRINK_MINUTES = 300.0   # phút "ảo" của prior khi ước lượng xMins

# trạng thái cầu thủ (pStatus trong feed UEFA)
STATUS_MULT = {"": 1.0, "D": 0.55, "I": 0.05, "S": 0.0, "NIS": 0.0}
STATUS_VI = {
    "": "Sẵn sàng", "D": "Nghi ngờ", "I": "Chấn thương",
    "S": "Treo giò", "NIS": "Không trong danh sách đăng ký",
}

# thời gian: UEFA phát giờ theo múi CET/CEST
UEFA_TZ = "Europe/Zurich"
VN_TZ = "Asia/Ho_Chi_Minh"

HORIZON_MDS = 8              # vòng bảng có đúng 8 lượt đấu
