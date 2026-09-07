"use client";

import { useMemo, useState } from "react";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DifficultyCell,
  ErrorBox,
  SectionTitle,
  Select,
  Spinner,
} from "@/components/ui";
import { useDataset } from "@/lib/data";
import { fmtVN, num } from "@/lib/format";

type View = "atk" | "def";

export default function FixturesPage() {
  const { data, error, loading } = useDataset();
  const [view, setView] = useState<View>("atk");
  const [md, setMd] = useState<number | null>(null);

  const teams = useMemo(() => {
    if (!data) return [];
    const key = (t: (typeof data.teams)[number]) => {
      const fs = t.fixtures.filter((f) => f.md >= data.meta.currentMd);
      if (fs.length === 0) return 0;
      return view === "atk"
        ? fs.reduce((s, f) => s + f.atkDifficulty, 0) / fs.length
        : fs.reduce((s, f) => s + f.defDifficulty, 0) / fs.length;
    };
    return [...data.teams].sort((a, b) => key(a) - key(b));
  }, [data, view]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  if (!data) return null;

  const { teamById, meta } = data;
  const mds = meta.matchdays.map((m) => m.md);
  const selectedMd = md ?? meta.currentMd;
  const matchList = meta.matchdays.find((m) => m.md === selectedMd);

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Lịch thi đấu & độ khó"
        hint="Độ khó tấn công và độ khó phòng ngự được tính riêng, từ chính λ bàn thắng của mô hình Poisson — không phải một con số chung chung."
        right={
          <Select value={view} onChange={(e) => setView(e.target.value as View)}>
            <option value="atk">Độ khó cho hàng công</option>
            <option value="def">Độ khó cho hàng thủ</option>
          </Select>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>
            {view === "atk"
              ? "Đội nào dễ ghi bàn nhất (xếp từ thuận lợi nhất)"
              : "Đội nào dễ giữ sạch lưới nhất (xếp từ thuận lợi nhất)"}
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Ô càng xanh càng thuận lợi. Ký hiệu @ nghĩa là đá sân khách.
          </p>
        </CardHeader>
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <th className="sticky left-0 bg-muted/40 p-2.5 font-medium">CLB</th>
                <th className="p-2.5 text-right font-medium">Sức mạnh</th>
                {mds.map((m) => (
                  <th key={m} className="p-2.5 text-center font-medium">
                    L{m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.id} className="border-b last:border-0">
                  <td className="sticky left-0 bg-card p-2.5">
                    <div className="font-medium">{t.short}</div>
                    <div className="text-[10px] text-muted-foreground">
                      Nhóm {t.pot}
                      {!t.hasUclHistory && " · lần đầu dự"}
                    </div>
                  </td>
                  <td className="p-2.5 text-right tabular-nums text-xs">
                    {num(t.power, 2)}
                  </td>
                  {mds.map((m) => {
                    const f = t.fixtures.find((x) => x.md === m);
                    if (!f)
                      return (
                        <td key={m} className="p-1 text-center text-xs text-muted-foreground">
                          —
                        </td>
                      );
                    const opp = teamById.get(f.opponent)?.short ?? "?";
                    return (
                      <td key={m} className="p-1 text-center">
                        <DifficultyCell
                          value={view === "atk" ? f.atkDifficulty : f.defDifficulty}
                        >
                          {f.home ? "" : "@"}
                          {opp}
                        </DifficultyCell>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <div>
            <CardTitle>Các trận lượt {selectedMd}</CardTitle>
            <p className="text-xs text-muted-foreground">
              λ là số bàn thắng kỳ vọng của mỗi đội trong trận đó. Giờ hiển thị là giờ VN.
            </p>
          </div>
          <Select value={selectedMd} onChange={(e) => setMd(Number(e.target.value))}>
            {mds.map((m) => (
              <option key={m} value={m}>
                Lượt {m}
              </option>
            ))}
          </Select>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-2">
          {matchList?.matches
            .slice()
            .sort((a, b) => a.kickoffUtc.localeCompare(b.kickoffUtc))
            .map((m) => {
              const home = teamById.get(m.home);
              const away = teamById.get(m.away);
              const lh = m.lambdaHome;
              const la = m.lambdaAway;
              return (
                <div key={m.id} className="rounded-md border p-3">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{home?.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      {num(lh, 2)} — {num(la, 2)}
                    </span>
                    <span className="font-medium">{away?.name}</span>
                  </div>
                  <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                    <span>{fmtVN(m.kickoffUtc)}</span>
                    <Badge className="bg-muted text-[10px]">
                      Tổng bàn kỳ vọng {num(lh + la, 2)}
                    </Badge>
                  </div>
                </div>
              );
            })}
        </CardContent>
      </Card>
    </div>
  );
}
