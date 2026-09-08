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
  Stat,
} from "@/components/ui";
import { useDataset, type Dataset, type MatchOdds, type Team } from "@/lib/data";
import { fmtVN, num, pct } from "@/lib/format";
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

      <OddsSection data={data} md={selectedMd} />

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


/* ------------------------------------------------------------------ kèo nhà cái */

type OddsSortKey =
  | "kickoff"
  | "pHome"
  | "hcap"
  | "total"
  | "marketGoals"
  | "modelGoals"
  | "diff"
  | "cs";

interface OddsRow {
  id: number;
  home: Team | undefined;
  away: Team | undefined;
  kickoffUtc: string;
  odds: MatchOdds;
  modelHome: number;
  modelAway: number;
}

/** Kèo chấp viết theo cách đọc quen thuộc: ai chấp ai, bao nhiêu trái. */
function handicapText(row: OddsRow): string {
  const line = row.odds.handicapLine;
  if (line === null) return "—";
  if (Math.abs(line) < 0.01) return "Đồng banh";
  const giver = line > 0 ? row.home?.short : row.away?.short;
  return `${giver} chấp ${Math.abs(line).toFixed(2)}`;
}

function OddsSection({ data, md }: { data: Dataset; md: number }) {
  const sort = useSort<OddsSortKey>("kickoff", "asc");
  const { meta, teamById } = data;
  const matchday = meta.matchdays.find((m) => m.md === md);

  const rows: OddsRow[] = (matchday?.matches ?? [])
    .filter((m) => m.odds)
    .map((m) => ({
      id: m.id,
      home: teamById.get(m.home),
      away: teamById.get(m.away),
      kickoffUtc: m.kickoffUtc,
      odds: m.odds as MatchOdds,
      modelHome: m.lambdaHome,
      modelAway: m.lambdaAway,
    }));

  if (rows.length === 0) {
    return (
      <Card className="border-caution/40 bg-caution/5">
        <CardHeader>
          <CardTitle className="text-caution">Chưa có kèo cho lượt {md}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {meta.odds.error
            ? `Lần lấy kèo gần nhất thất bại: ${meta.odds.error}`
            : "Nhà cái thường chỉ mở kèo trước ngày thi đấu khoảng một tuần. Quay lại gần sát lượt đấu."}
        </CardContent>
      </Card>
    );
  }

  const marketTotal = (r: OddsRow) => r.odds.lamHome + r.odds.lamAway;
  const modelTotal = (r: OddsRow) => r.modelHome + r.modelAway;
  const diff = (r: OddsRow) => modelTotal(r) - marketTotal(r);

  const value = (r: OddsRow): number | string | null => {
    switch (sort.key) {
      case "kickoff":
        return r.kickoffUtc;
      case "pHome":
        return r.odds.pHome;
      case "hcap":
        return r.odds.handicapLine;
      case "total":
        return r.odds.totalLine;
      case "marketGoals":
        return marketTotal(r);
      case "modelGoals":
        return modelTotal(r);
      case "diff":
        return Math.abs(diff(r));
      case "cs":
        return Math.max(r.odds.csHome, r.odds.csAway);
    }
  };
  const sorted = [...rows].sort((a, b) => compare(value(a), value(b), sort.dir));

  // mô hình đang lệch thị trường bao nhiêu — tự chấm điểm chính mình
  const mae = rows.reduce((s, r) => s + Math.abs(diff(r)), 0) / rows.length;
  const bias = rows.reduce((s, r) => s + diff(r), 0) / rows.length;
  const margin = rows.reduce((s, r) => s + r.odds.margin, 0) / rows.length;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Kèo nhà cái — lượt {md}</CardTitle>
        <p className="text-xs text-muted-foreground">
          Giá lấy từ {meta.odds.source} — nhà cái có biên mỏng nhất nên giá của họ được coi
          là giá tham chiếu của thị trường. Xác suất bên dưới{" "}
          <strong>đã bỏ hoa hồng nhà cái</strong> nên ba cửa cộng lại đúng 100%.
        </p>
      </CardHeader>

      <CardContent className="grid grid-cols-2 gap-3 pb-2 md:grid-cols-4">
        <Stat
          label="Số trận có kèo"
          value={rows.length}
          sub={`trên ${matchday?.matches.length ?? 0} trận`}
        />
        <Stat
          label="Lệch trung bình"
          value={num(mae, 2)}
          sub="bàn/trận so với thị trường"
          tone={mae > 0.6 ? "caution" : undefined}
        />
        <Stat
          label="Thiên lệch"
          value={`${bias >= 0 ? "+" : ""}${num(bias, 2)}`}
          sub={bias < 0 ? "mô hình dự báo ÍT bàn hơn" : "mô hình dự báo NHIỀU bàn hơn"}
          tone={Math.abs(bias) > 0.25 ? "caution" : undefined}
        />
        <Stat label="Hoa hồng nhà cái" value={pct(margin, 1)} sub="kèo 1X2, đã trừ ra" />
      </CardContent>

      <div className="overflow-x-auto scroll-thin">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <SortableTh
                label="Trận"
                sortKey="kickoff"
                activeKey={sort.key}
                dir={sort.dir}
                onSort={sort.toggle}
                defaultDir="asc"
                title="Sắp theo giờ thi đấu"
              />
              <SortableTh
                label="Thắng · Hòa · Thua"
                sortKey="pHome"
                activeKey={sort.key}
                dir={sort.dir}
                onSort={sort.toggle}
                align="center"
                title="Xác suất đã bỏ hoa hồng nhà cái"
              />
              <SortableTh
                label="Kèo chấp"
                sortKey="hcap"
                activeKey={sort.key}
                dir={sort.dir}
                onSort={sort.toggle}
              />
              <SortableTh
                label="Tài xỉu"
                sortKey="total"
                activeKey={sort.key}
                dir={sort.dir}
                onSort={sort.toggle}
                align="center"
              />
              <SortableTh
                label="λ thị trường"
                sortKey="marketGoals"
                activeKey={sort.key}
                dir={sort.dir}
                onSort={sort.toggle}
                align="center"
                title="Bàn thắng kỳ vọng suy ra từ kèo"
              />
              <SortableTh
                label="λ mô hình"
                sortKey="modelGoals"
                activeKey={sort.key}
                dir={sort.dir}
                onSort={sort.toggle}
                align="center"
              />
              <SortableTh
                label="Lệch"
                sortKey="diff"
                activeKey={sort.key}
                dir={sort.dir}
                onSort={sort.toggle}
                align="right"
                title="Tổng bàn mô hình trừ tổng bàn thị trường"
              />
              <SortableTh
                label="Sạch lưới (kèo)"
                sortKey="cs"
                activeKey={sort.key}
                dir={sort.dir}
                onSort={sort.toggle}
                align="center"
                title="Xác suất giữ sạch lưới theo thị trường"
              />
            </tr>
          </thead>
          <tbody>
            {sorted.map((r) => {
              const d = diff(r);
              const big = Math.abs(d) >= 0.6;
              return (
                <tr key={r.id} className="border-b last:border-0 hover:bg-muted/30">
                  <td className="p-2.5">
                    <div className="font-medium">
                      {r.home?.short} <span className="text-muted-foreground">vs</span>{" "}
                      {r.away?.short}
                    </div>
                    <div className="text-[10px] text-muted-foreground">
                      {fmtVN(r.kickoffUtc)}
                    </div>
                  </td>
                  <td className="p-2.5 text-center tabular-nums">
                    <span className="font-semibold">{pct(r.odds.pHome)}</span>
                    <span className="text-muted-foreground"> · {pct(r.odds.pDraw)} · </span>
                    <span className="font-semibold">{pct(r.odds.pAway)}</span>
                  </td>
                  <td className="p-2.5 text-xs">{handicapText(r)}</td>
                  <td className="p-2.5 text-center tabular-nums">
                    {r.odds.totalLine !== null ? r.odds.totalLine.toFixed(2) : "—"}
                  </td>
                  <td className="p-2.5 text-center tabular-nums">
                    {num(r.odds.lamHome, 2)} – {num(r.odds.lamAway, 2)}
                  </td>
                  <td className="p-2.5 text-center tabular-nums text-muted-foreground">
                    {num(r.modelHome, 2)} – {num(r.modelAway, 2)}
                  </td>
                  <td
                    className={`p-2.5 text-right font-semibold tabular-nums ${
                      big ? (d > 0 ? "text-caution" : "text-danger") : "text-muted-foreground"
                    }`}
                  >
                    {d >= 0 ? "+" : ""}
                    {num(d, 2)}
                  </td>
                  <td className="p-2.5 text-center tabular-nums">
                    <span className={r.odds.csHome >= 0.35 ? "font-semibold text-positive" : ""}>
                      {pct(r.odds.csHome)}
                    </span>
                    <span className="text-muted-foreground"> – </span>
                    <span className={r.odds.csAway >= 0.35 ? "font-semibold text-positive" : ""}>
                      {pct(r.odds.csAway)}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <CardContent className="space-y-1.5 pt-3 text-xs text-muted-foreground">
        <p>
          <strong className="text-foreground">Cột Lệch</strong> là tổng bàn mô hình trừ tổng
          bàn thị trường. Lệch lớn không có nghĩa mô hình sai chắc chắn, nhưng thị trường
          biết đội hình dự kiến, tin chấn thương và dòng tiền — những thứ mô hình không có.
          Gặp trận lệch nhiều thì nên tin thị trường hơn.
        </p>
        <p>
          <strong className="text-foreground">Cột Sạch lưới</strong> là xác suất mỗi đội
          không thủng lưới, suy trực tiếp từ kèo. Đây là con số đáng giá nhất khi chọn hậu
          vệ và thủ môn — giữ sạch lưới được 4 điểm.
        </p>
        <p>Kèo chỉ mở cho lượt đấu sắp tới nên các lượt sau chưa có. {meta.odds.note}</p>
      </CardContent>
    </Card>
  );
}
