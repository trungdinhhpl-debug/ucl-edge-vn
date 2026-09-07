"use client";

import { Card, CardContent, CardHeader, CardTitle, ErrorBox, SectionTitle, Spinner } from "@/components/ui";
import { useDataset } from "@/lib/data";
import { fmtVN } from "@/lib/format";

const SCORING: { label: string; gk: string; def: string; mid: string; fwd: string }[] = [
  { label: "Ra sân", gk: "1", def: "1", mid: "1", fwd: "1" },
  { label: "Đá từ 60 phút trở lên", gk: "+1", def: "+1", mid: "+1", fwd: "+1" },
  { label: "Ghi bàn", gk: "6", def: "6", mid: "5", fwd: "4" },
  { label: "Bàn từ ngoài vòng cấm", gk: "+1", def: "+1", mid: "+1", fwd: "+1" },
  { label: "Kiến tạo", gk: "3", def: "3", mid: "3", fwd: "3" },
  { label: "Giữ sạch lưới (đá ≥60′)", gk: "4", def: "4", mid: "1", fwd: "—" },
  { label: "Cứ 2 bàn thủng lưới", gk: "−1", def: "−1", mid: "—", fwd: "—" },
  { label: "Cứ 3 pha cứu thua", gk: "1", def: "—", mid: "—", fwd: "—" },
  { label: "Cản phạt đền", gk: "5", def: "—", mid: "—", fwd: "—" },
  { label: "Cứ 3 lần thu hồi bóng", gk: "1", def: "1", mid: "1", fwd: "1" },
  { label: "Cầu thủ hay nhất trận", gk: "3", def: "3", mid: "3", fwd: "3" },
  { label: "Kiếm được phạt đền", gk: "2", def: "2", mid: "2", fwd: "2" },
  { label: "Phạm lỗi phạt đền", gk: "−1", def: "−1", mid: "−1", fwd: "−1" },
  { label: "Sút hỏng phạt đền", gk: "−2", def: "−2", mid: "−2", fwd: "−2" },
  { label: "Thẻ vàng", gk: "−1", def: "−1", mid: "−1", fwd: "−1" },
  { label: "Thẻ đỏ", gk: "−3", def: "−3", mid: "−3", fwd: "−3" },
  { label: "Phản lưới nhà", gk: "−2", def: "−2", mid: "−2", fwd: "−2" },
];

export default function MethodologyPage() {
  const { data, error, loading } = useDataset();
  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  if (!data) return null;

  const { meta } = data;
  const p = meta.modelParams as Record<string, number | Record<string, number>>;
  const weights = p.weights as Record<string, number>;

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Mô hình hoạt động thế nào"
        hint="Mọi con số trên trang này đều có thể truy ngược về dữ liệu gốc và công thức bên dưới."
      />

      <Card>
        <CardHeader>
          <CardTitle>Triết lý</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <p>
            Hệ thống <strong className="text-foreground">tách điểm kỳ vọng khỏi ý kiến
            đám đông</strong>. Tỷ lệ sở hữu chỉ được dùng để chỉ ra cầu thủ khác biệt,
            không bao giờ được dùng làm bằng chứng rằng một cầu thủ hay.
          </p>
          <p>
            Biến số hạng nhất là <strong className="text-foreground">số phút kỳ vọng</strong>,
            không phải phong độ. Một tiền đạo giỏi ngồi ghế dự bị vẫn tệ hơn một hậu vệ
            trung bình đá đủ 90 phút.
          </p>
          <p>
            Những gì hệ thống <em>không</em> làm: không xếp hạng bằng tổng điểm mùa trước,
            không coi phong độ 3 trận là tín hiệu, và không khẳng định chắc chắn ai sẽ ghi
            bàn hay giữ sạch lưới.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bốn bước tính xP</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <Step
            n={1}
            title="Sức mạnh đội"
            body={`Ghép ba tín hiệu sạch phủ đủ 36 CLB: giá cầu thủ do chính UEFA định (${(
              weights.price * 100
            ).toFixed(0)}%), nhóm hạt giống của lễ bốc thăm (${(weights.pot * 100).toFixed(
              0,
            )}%) và hệ số CLB châu Âu 5 năm (${(weights.coefficient * 100).toFixed(0)}%).
            Không cộng dồn thống kê mùa trước theo đội, vì số liệu UEFA đi theo cầu thủ:
            một tiền đạo chuyển CLB sẽ mang bàn thắng của đội cũ sang đội mới và làm hỏng
            phép cộng.`}
          />
          <Step
            n={2}
            title="Mô hình trận đấu Poisson"
            body={`Từ sức mạnh đội suy ra λ — số bàn kỳ vọng của mỗi bên: λ = ${p.baseTeamGoals} ×
            hệ số công của đội × hệ số thủ của đối thủ × lợi thế sân (${p.homeAttack} sân nhà,
            ${p.awayAttack} sân khách). Xác suất giữ sạch lưới là exp(−λ đối thủ), phân phối
            bàn thua là Poisson(λ đối thủ) — cùng một biến, nên hai hạng mục này luôn nhất quán.`}
          />
          <Step
            n={3}
            title="Tỷ lệ của cầu thủ"
            body={`Mọi tỷ lệ là hậu nghiệm Bayes: (số liệu thật + prior × trọng số) / (cỡ mẫu +
            trọng số), với prior là hàm theo giá và vị trí. Sản lượng tấn công được quy về
            tỷ trọng trong bàn thắng của đội, nên khi nhân với λ của từng trận thì bối cảnh
            đối thủ chỉ được tính đúng một lần. Số phút được chuẩn hoá để tổng mỗi đội
            đúng 990 phút — đúng như luật bóng đá: chỉ 11 người trên sân.`}
          />
          <Step
            n={4}
            title="Phân phối điểm, không phải một con số"
            body="Mỗi hạng mục là một biến ngẫu nhiên có phân phối đóng (Poisson hoặc Bernoulli).
            Phân phối tổng điểm được tính bằng tích chập chính xác chứ không mô phỏng Monte
            Carlo, nên P(≥10) hay P(tịt ngòi) là số thật, không có nhiễu mô phỏng. Ba trạng
            thái số phút (không ra sân / dưới 60 phút / từ 60 phút) được tính riêng rồi trộn lại."
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Kế hoạch nhiều lượt và chip được tính thế nào</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <Bullet>
            Mỗi phép đổi người được chấm bằng phần điểm nó cộng thêm trên{" "}
            <strong className="text-foreground">toàn bộ chặng còn lại</strong>, không phải
            lượt kế tiếp — vì cầu thủ mua về sẽ ở lại trong đội.
          </Bullet>
          <Bullet>
            Thuật toán đi tuần tự từng lượt và chọn tham lam phép đổi tốt nhất. Để tránh
            kiểu &quot;mua rồi bán lại&quot; vô nghĩa, một lượt chuyển nhượng miễn phí chỉ
            được tiêu khi lợi ít nhất 1 điểm, và cầu thủ đã bán không được mua lại.
          </Bullet>
          <Bullet>
            Chuyển nhượng chịu phạt chỉ được đề xuất khi lợi vượt hẳn{" "}
            {Math.abs(meta.rules.extraTransferCost)} điểm bị trừ, chứ không phải hoà vốn.
          </Bullet>
          <Bullet>
            <strong className="text-foreground">Limitless</strong> được định giá bằng hiệu
            giữa đội hình tốt nhất khi bỏ trần ngân sách và đội hình hiện tại, trong đúng
            một lượt.
          </Bullet>
          <Bullet>
            <strong className="text-foreground">Wildcard</strong> được định giá bằng cách so
            hai <em>lộ trình</em>: xây lại cả đội rồi tiếp tục chuyển nhượng như thường, so
            với giữ đội hiện tại rồi chuyển nhượng như thường. So kiểu khác sẽ định giá chip
            thấp một cách giả tạo.
          </Bullet>
          <Bullet>
            Cả hai chip đều bị khoá ở lượt vốn đã có chuyển nhượng miễn phí không giới hạn
            (lượt {meta.rules.unlimitedTransferMds.join(", ")}), đúng như game.
          </Bullet>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bảng điểm chính thức của UCL Fantasy</CardTitle>
          <p className="text-xs text-muted-foreground">
            Lấy trực tiếp từ mã nguồn trang gaming.uefa.com, không phải chép tay.
          </p>
        </CardHeader>
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2.5 font-medium">Hạng mục</th>
                <th className="p-2.5 text-center font-medium">Thủ môn</th>
                <th className="p-2.5 text-center font-medium">Hậu vệ</th>
                <th className="p-2.5 text-center font-medium">Tiền vệ</th>
                <th className="p-2.5 text-center font-medium">Tiền đạo</th>
              </tr>
            </thead>
            <tbody>
              {SCORING.map((r) => (
                <tr key={r.label} className="border-b last:border-0">
                  <td className="p-2.5">{r.label}</td>
                  <td className="p-2.5 text-center tabular-nums">{r.gk}</td>
                  <td className="p-2.5 text-center tabular-nums">{r.def}</td>
                  <td className="p-2.5 text-center tabular-nums">{r.mid}</td>
                  <td className="p-2.5 text-center tabular-nums">{r.fwd}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Luật chơi được mã hoá trong bộ tối ưu</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-2">
          <Bullet>Đội hình 15 người: 2 thủ môn, 5 hậu vệ, 5 tiền vệ, 3 tiền đạo.</Bullet>
          <Bullet>Ngân sách €{meta.rules.budget}m, tối đa {meta.rules.maxPerClub} cầu thủ mỗi CLB.</Bullet>
          <Bullet>Đội trưởng nhân đôi điểm; được đổi đội trưởng giữa lượt đấu.</Bullet>
          <Bullet>
            Chuyển nhượng không giới hạn ở lượt {meta.rules.unlimitedTransferMds.join(", ")} — tức
            trước lượt 1, trước play-off và trước vòng 1/8.
          </Bullet>
          <Bullet>
            Vượt hạn mức chuyển nhượng bị trừ {Math.abs(meta.rules.extraTransferCost)} điểm mỗi lượt.
          </Bullet>
          <Bullet>Hai chip Wildcard và Limitless, mỗi mùa dùng được một lần.</Bullet>
        </CardContent>
      </Card>

      <Card className="border-caution/40">
        <CardHeader>
          <CardTitle className="text-caution">Giới hạn — đọc trước khi tin</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <Bullet>
            {meta.dataQuality.playersWithoutUclHistory}/{meta.dataQuality.players} cầu thủ
            chưa có phút nào ở UCL mùa trước; xP của họ gần như hoàn toàn dựa vào giá.
          </Bullet>
          <Bullet>
            {meta.dataQuality.teamsWithoutUclHistory}/36 CLB lần đầu góp mặt mùa này, không
            có dữ liệu UCL nào để hiệu chỉnh.
          </Bullet>
          <Bullet>
            Feed UEFA không cho biết ai là người đá phạt đền, ai đá phạt góc. Mô hình chỉ
            suy ra từ tỷ lệ kiếm/sút phạt đền mùa trước — sai số ở hạng mục này lớn.
          </Bullet>
          <Bullet>
            Thống kê đi theo cầu thủ chứ không theo CLB: một cầu thủ vừa chuyển đến mang
            theo số liệu của đội cũ. Mô hình xử lý bằng cách chỉ dùng <em>tỷ trọng</em> chứ
            không dùng con số tuyệt đối, nhưng vẫn còn sai lệch.
          </Bullet>
          <Bullet>
            Không có dữ liệu xG. UCL Fantasy chỉ phát bàn thắng và kiến tạo thật, vốn nhiễu
            hơn xG rất nhiều, nên mức co ngót được đặt cao.
          </Bullet>
          <Bullet>
            Chưa mô hình hoá vòng knock-out (lượt 9 trở đi) vì chưa biết cặp đấu.
          </Bullet>
          <Bullet>
            Kế hoạch nhiều lượt coi giá cầu thủ là đứng yên và không biết số chuyển nhượng
            miễn phí thật của bạn — feed công khai không phát hai dữ liệu này.
          </Bullet>
          <Bullet>
            Mô hình không thấy trước chấn thương, nên nó luôn định giá Wildcard thấp. Giá
            trị thật của Wildcard nằm ở lúc đội hình vỡ — hãy tự cộng thêm phần đó.
          </Bullet>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Nguồn dữ liệu</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1 text-sm text-muted-foreground">
          <Bullet>
            gaming.uefa.com — danh sách cầu thủ, giá, tỷ lệ sở hữu, lịch thi đấu, hạn chốt,
            ràng buộc đội hình, bảng điểm.
          </Bullet>
          <Bullet>comp.uefa.com — hệ số CLB châu Âu 5 năm (20 đội đứng đầu).</Bullet>
          <Bullet>Dữ liệu trên trang này cập nhật lúc {fmtVN(meta.generatedAt)} (giờ VN).</Bullet>
        </CardContent>
      </Card>
    </div>
  );
}

function Step({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="flex gap-3">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
        {n}
      </span>
      <div>
        <div className="font-semibold">{title}</div>
        <p className="mt-0.5 text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function Bullet({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
      <span>{children}</span>
    </div>
  );
}
