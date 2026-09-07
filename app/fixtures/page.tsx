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
  SortableTh,
  Spinner,
} from "@/components/ui";
import { useDataset, type Team } from "@/lib/data";
import { fmtVN, num } from "@/lib/format";
import { compare, useSort } from "@/lib/sort";

type View = "atk" | "def";
type SortKey = "team" | "power" | "avg" | `md${number}`;

/** Độ khó của một đội ở đúng một lượt, theo góc nhìn đang chọn. */
function diffAt(team: Team, md: number, view: View): number | null {
  const f = team.fixtures.find((x) => x.md === md);
  if (!f) return null;
  return view === "atk" ? f.atkDifficulty : f.defDifficulty;
}

/** Độ khó trung bình của các lượt còn lại. */
function avgDiff(team: Team, view: View, fromMd: number): number | null {
  const fs = team.fixtures.filter((f) => f.md >= fromMd);
  if (fs.length === 0) return null;
  const sum = fs.reduce((acc, f) => acc + (view === "atk" ? f.atkDifficulty : f.defDifficulty), 0);
  return sum / fs.length;
}

export default function FixturesPage() {
  const { data, error, loading } = useDataset();
  const [view, setView] = useState<View>("atk");
  const [md, setMd] = useState<number | null>(null);
  const sort = useSort<SortKey>("avg", "asc");

  const teams = useMemo(() => {
    if (!data) return [];
    const from = data.meta.currentMd;
    const value = (t: Team): number | string | null => {
      if (sort.key === "team") return t.name;
      if (sort.key === "power") return t.power;
      if (sort.key === "avg") return avgDiff(t, view, from);
      return diffAt(t, Number(sort.key.slice(2)), view);
    };
    return [...data.teams].sort((a, b) => compare(value(a), value(b), sort.dir));
  }, [data, view, sort.key, sort.dir]);

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
                <SortableTh
                  label="CLB"
                  sortKey="team"
                  activeKey={sort.key}
                  dir={sort.dir}
                  onSort={sort.toggle}
                  defaultDir="asc"
                  className="sticky left-0 bg-muted/40"
                />
                <SortableTh
                  label="Sức mạnh"
                  sortKey="power"
                  activeKey={sort.key}
                  dir={sort.dir}
                  onSort={sort.toggle}
                  align="right"
                  title="Điểm sức mạnh tổng hợp của CLB"
                />
                <SortableTh
                  label="TB"
                  sortKey="avg"
                  activeKey={sort.key}
                  dir={sort.dir}
                  onSort={sort.toggle}
                  defaultDir="asc"
                  align="right"
                  title="Độ khó trung bình các lượt còn lại — càng thấp càng thuận lợi"
                />
                {mds.map((m) => (
                  <SortableTh
                    key={m}
                    label={`L${m}`}
                    sortKey={`md${m}` as SortKey}
                    activeKey={sort.key}
                    dir={sort.dir}
                    onSort={sort.toggle}
                    defaultDir="asc"
                    align="center"
                    title={`Sắp theo độ khó lượt ${m}`}
                  />
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
                  <td className="p-2.5 text-right tabular-nums text-xs">
                    {(() => {
                      const a = avgDiff(t, view, meta.currentMd);
                      return a === null ? "—" : num(a, 1);
                    })()}
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
