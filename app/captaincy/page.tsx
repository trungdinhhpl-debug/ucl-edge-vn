"use client";

import { useMemo, useState } from "react";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorBox,
  SectionTitle,
  Select,
  Spinner,
} from "@/components/ui";
import { POS_SHORT, isSelectable, riskLabel, useDataset } from "@/lib/data";
import { money, num, pct } from "@/lib/format";

type Mode = "ev" | "ceiling" | "floor";

const MODE_LABEL: Record<Mode, { name: string; hint: string }> = {
  ev: {
    name: "Điểm kỳ vọng",
    hint: "Xếp theo xP thuần. Lựa chọn đúng về dài hạn khi bạn đang ở thế dẫn trước.",
  },
  ceiling: {
    name: "Trần điểm",
    hint: "Xếp theo P(≥10 điểm). Dùng khi cần bứt lên và chấp nhận rủi ro tịt ngòi.",
  },
  floor: {
    name: "Sàn điểm",
    hint: "Xếp theo xác suất KHÔNG tịt ngòi. Dùng khi muốn giữ vững thứ hạng.",
  },
};

export default function CaptaincyPage() {
  const { data, error, loading } = useDataset();
  const [mode, setMode] = useState<Mode>("ev");

  const rows = useMemo(() => {
    if (!data) return [];
    const pool = data.players.filter(
      (p) => isSelectable(p) && p.dist && p.xpNow > 1.5 && p.xMins >= 45,
    );
    const score = (p: (typeof pool)[number]) => {
      if (mode === "ceiling") return p.dist!.p_haul;
      if (mode === "floor") return 1 - p.dist!.p_blank;
      return p.xpNow;
    };
    return [...pool].sort((a, b) => score(b) - score(a)).slice(0, 25);
  }, [data, mode]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  if (!data) return null;

  const { teamById, meta } = data;
  const maxEv = Math.max(...rows.map((p) => p.xpNow * 2), 1);

  return (
    <div className="space-y-5">
      <SectionTitle
        title={`Chọn đội trưởng — lượt ${meta.currentMd}`}
        hint="Băng đội trưởng nhân đôi điểm. Ba cách xếp hạng dưới đây trả lời ba câu hỏi khác nhau, đừng trộn lẫn."
        right={
          <Select value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            {(Object.keys(MODE_LABEL) as Mode[]).map((m) => (
              <option key={m} value={m}>
                {MODE_LABEL[m].name}
              </option>
            ))}
          </Select>
        }
      />

      <Card className="border-primary/30 bg-primary/5">
        <CardContent className="pt-4 text-sm text-muted-foreground">
          {MODE_LABEL[mode].hint}
        </CardContent>
      </Card>

      <Card>
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="p-2.5 font-medium">#</th>
                <th className="p-2.5 font-medium">Cầu thủ</th>
                <th className="p-2.5 font-medium">Trận</th>
                <th className="p-2.5 text-right font-medium">Giá</th>
                <th className="p-2.5 text-right font-medium">xP</th>
                <th className="p-2.5 text-right font-medium">Điểm khi đeo băng</th>
                <th className="p-2.5 text-right font-medium">P(≥6)</th>
                <th className="p-2.5 text-right font-medium">P(≥10)</th>
                <th className="p-2.5 text-right font-medium">P(tịt ngòi)</th>
                <th className="p-2.5 text-right font-medium">Sở hữu</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p, i) => {
                const opp = p.opponent ? teamById.get(p.opponent)?.short : null;
                const risk = riskLabel(p);
                return (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="p-2.5 text-xs text-muted-foreground">{i + 1}</td>
                    <td className="p-2.5">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-muted text-[10px] text-muted-foreground">
                          {POS_SHORT[p.pos]}
                        </Badge>
                        <span className="font-medium">{p.name}</span>
                        {risk && (
                          <span className="text-[10px] text-caution">· {risk.text}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {teamById.get(p.team)?.name}
                      </div>
                    </td>
                    <td className="p-2.5 text-xs text-muted-foreground">
                      {opp ? `${p.isHome ? "vs" : "@"} ${opp}` : "—"}
                    </td>
                    <td className="p-2.5 text-right tabular-nums">{money(p.price)}</td>
                    <td className="p-2.5 text-right tabular-nums">{num(p.xpNow, 2)}</td>
                    <td className="p-2.5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="hidden h-2 w-24 rounded bg-muted sm:block">
                          <div
                            className="h-2 rounded bg-primary"
                            style={{ width: `${((p.xpNow * 2) / maxEv) * 100}%` }}
                          />
                        </div>
                        <span className="w-10 font-bold tabular-nums text-primary">
                          {num(p.xpNow * 2, 1)}
                        </span>
                      </div>
                    </td>
                    <td className="p-2.5 text-right tabular-nums">
                      {pct(p.dist!.p_returns)}
                    </td>
                    <td className="p-2.5 text-right font-semibold tabular-nums text-positive">
                      {pct(p.dist!.p_haul)}
                    </td>
                    <td className="p-2.5 text-right tabular-nums text-danger">
                      {pct(p.dist!.p_blank)}
                    </td>
                    <td className="p-2.5 text-right tabular-nums text-muted-foreground">
                      {p.ownership.toFixed(0)}%
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Ba con số này nghĩa là gì</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            <strong className="text-foreground">P(≥6)</strong> — xác suất cầu thủ có một
            trận &quot;có lãi&quot;: thường là một bàn hoặc một kiến tạo cộng điểm nền.
          </p>
          <p>
            <strong className="text-foreground">P(≥10)</strong> — xác suất bùng nổ. Đây là
            con số quyết định khi bạn cần vượt lên trong league, vì băng đội trưởng nhân
            đôi cả phần đuôi phân phối.
          </p>
          <p>
            <strong className="text-foreground">P(tịt ngòi)</strong> — xác suất chỉ được 2
            điểm trở xuống, tính cả khả năng không ra sân. Một cầu thủ xP cao nhưng
            P(tịt ngòi) 35% vẫn là canh bạc.
          </p>
          <p className="pt-1">
            Mẹo riêng của UCL Fantasy: mỗi lượt đấu diễn ra trong hai ngày và bạn được
            đổi đội trưởng trước hạn chốt phần sau. Ưu tiên người đá <em>trận sớm</em> để
            còn đường lùi nếu họ mờ nhạt.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
