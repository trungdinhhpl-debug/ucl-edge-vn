"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DifficultyCell,
  ErrorBox,
  Input,
  RiskBadge,
  SectionTitle,
  Select,
  SortableTh,
  Spinner,
} from "@/components/ui";
import {
  POS_SHORT,
  POS_VI,
  isSelectable,
  riskLabel,
  useDataset,
  type Dataset,
  type Player,
  type Pos,
} from "@/lib/data";
import { money, num, pct } from "@/lib/format";
import { compare, useSort, type SortDir } from "@/lib/sort";

type SortKey =
  | "name"
  | "opponent"
  | "price"
  | "xMins"
  | "xpNow"
  | "xpHorizon"
  | "valueNow"
  | "haul"
  | "ownership"
  | "ptsPrev";

/** Chiều mặc định khi bấm lần đầu vào một cột: cột chữ A→Z, cột số cao→thấp. */
const SORT_DIR: Record<SortKey, SortDir> = {
  name: "asc",
  opponent: "asc",
  price: "desc",
  xMins: "desc",
  xpNow: "desc",
  xpHorizon: "desc",
  valueNow: "desc",
  haul: "desc",
  ownership: "desc",
  ptsPrev: "desc",
};

const SORTS: { key: SortKey; label: string }[] = [
  { key: "xpNow", label: "xP lượt tới" },
  { key: "xpHorizon", label: "xP cả vòng bảng" },
  { key: "valueNow", label: "xP trên mỗi triệu" },
  { key: "haul", label: "Xác suất bùng nổ" },
  { key: "xMins", label: "Số phút kỳ vọng" },
  { key: "price", label: "Giá" },
  { key: "ownership", label: "Tỷ lệ sở hữu" },
  { key: "ptsPrev", label: "Điểm mùa 2025/26" },
  { key: "name", label: "Tên cầu thủ" },
  { key: "opponent", label: "Đối thủ" },
];

const BREAKDOWN_VI: Record<string, string> = {
  appearance: "Ra sân",
  goals: "Bàn thắng",
  goals_outside: "Bàn ngoài vòng cấm",
  assists: "Kiến tạo",
  clean_sheet: "Sạch lưới",
  conceded: "Bàn thua",
  saves: "Cứu thua",
  balls: "Thu hồi bóng",
  motm: "Hay nhất trận",
  yellow: "Thẻ vàng",
  red: "Thẻ đỏ",
  pen_won: "Kiếm phạt đền",
  pen_missed: "Hỏng phạt đền",
  pen_conceded: "Phạm lỗi phạt đền",
  pen_saved: "Cản phạt đền",
  own_goal: "Phản lưới",
};

export default function PlayersPage() {
  const { data, error, loading } = useDataset();
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<"all" | Pos>("all");
  const [team, setTeam] = useState<"all" | number>("all");
  const [maxPrice, setMaxPrice] = useState(13);
  const [minMins, setMinMins] = useState(0);
  const sort = useSort<SortKey>("xpNow", "desc");
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const [detail, setDetail] = useState<Player | null>(null);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.players
      .filter((p) => (onlyAvailable ? isSelectable(p) : true))
      .filter((p) => (pos === "all" ? true : p.pos === pos))
      .filter((p) => (team === "all" ? true : p.team === team))
      .filter((p) => p.price <= maxPrice)
      .filter((p) => p.xMins >= minMins)
      .filter((p) =>
        q
          ? p.fullName.toLowerCase().includes(q.toLowerCase()) ||
            (data.teamById.get(p.team)?.name ?? "").toLowerCase().includes(q.toLowerCase())
          : true,
      )
      .sort((a, b) =>
        compare(sortValue(a, sort.key, data), sortValue(b, sort.key, data), sort.dir),
      )
      .slice(0, 200);
  }, [data, q, pos, team, maxPrice, minMins, sort.key, sort.dir, onlyAvailable]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  if (!data) return null;

  const { teamById, meta } = data;
  const mds = meta.matchdays.map((m) => m.md).filter((m) => m >= meta.currentMd);

  return (
    <div className="space-y-5">
      <SectionTitle
        title="Tra cứu cầu thủ"
        hint={`${data.players.length} cầu thủ · xP tính riêng cho từng lượt đấu, đã trừ rủi ro số phút.`}
      />

      <Card>
        <CardContent className="grid gap-3 pt-4 md:grid-cols-6">
          <Input
            className="md:col-span-2"
            placeholder="Tìm cầu thủ hoặc CLB…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <Select value={String(pos)} onChange={(e) => setPos(e.target.value === "all" ? "all" : (Number(e.target.value) as Pos))}>
            <option value="all">Mọi vị trí</option>
            {([1, 2, 3, 4] as Pos[]).map((p) => (
              <option key={p} value={p}>
                {POS_VI[p]}
              </option>
            ))}
          </Select>
          <Select
            value={String(team)}
            onChange={(e) => setTeam(e.target.value === "all" ? "all" : Number(e.target.value))}
          >
            <option value="all">Mọi CLB</option>
            {[...data.teams]
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
          </Select>
          <Select
            value={sort.key}
            onChange={(e) => {
              const k = e.target.value as SortKey;
              sort.select(k, SORT_DIR[k]);
            }}
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>
                Sắp theo: {s.label}
              </option>
            ))}
          </Select>
          <label className="flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={onlyAvailable}
              onChange={(e) => setOnlyAvailable(e.target.checked)}
              className="accent-[hsl(var(--primary))]"
            />
            Chỉ cầu thủ chọn được
          </label>

          <label className="space-y-1 text-xs text-muted-foreground md:col-span-3">
            Giá tối đa: {money(maxPrice)}
            <input
              type="range"
              min={4}
              max={13}
              step={0.5}
              value={maxPrice}
              onChange={(e) => setMaxPrice(Number(e.target.value))}
              className="w-full accent-[hsl(var(--primary))]"
            />
          </label>
          <label className="space-y-1 text-xs text-muted-foreground md:col-span-3">
            Số phút kỳ vọng tối thiểu: {minMins}′
            <input
              type="range"
              min={0}
              max={85}
              step={5}
              value={minMins}
              onChange={(e) => setMinMins(Number(e.target.value))}
              className="w-full accent-[hsl(var(--primary))]"
            />
          </label>
        </CardContent>
      </Card>

      <Card>
        <div className="overflow-x-auto scroll-thin">
          <table className="w-full text-sm">
            <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
              <tr>
                <SortableTh label="Cầu thủ" sortKey="name" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} defaultDir="asc" />
                <SortableTh label="Đối thủ" sortKey="opponent" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} defaultDir="asc" />
                <SortableTh label="Giá" sortKey="price" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                <SortableTh label="xPhút" sortKey="xMins" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" title="Số phút kỳ vọng ở lượt tới" />
                <SortableTh label={`xP L${meta.currentMd}`} sortKey="xpNow" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                <SortableTh label="xP vòng bảng" sortKey="xpHorizon" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                <SortableTh label="xP/€m" sortKey="valueNow" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
                <SortableTh label="P(≥10)" sortKey="haul" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" title="Xác suất được từ 10 điểm trở lên" />
                <SortableTh label="Sở hữu" sortKey="ownership" activeKey={sort.key} dir={sort.dir} onSort={sort.toggle} align="right" />
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const risk = riskLabel(p);
                const opp = p.opponent ? teamById.get(p.opponent)?.short : null;
                return (
                  <tr
                    key={p.id}
                    onClick={() => setDetail(p)}
                    className="cursor-pointer border-b last:border-0 hover:bg-muted/30"
                  >
                    <td className="p-2.5">
                      <div className="flex items-center gap-2">
                        <Badge className="bg-muted text-[10px] text-muted-foreground">
                          {POS_SHORT[p.pos]}
                        </Badge>
                        <span className="font-medium">{p.name}</span>
                        {risk && <RiskBadge text={risk.text} tone={risk.tone} />}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {teamById.get(p.team)?.name}
                        {!p.hasHistory && " · chưa có số liệu UCL"}
                      </div>
                    </td>
                    <td className="p-2.5 text-xs text-muted-foreground">
                      {opp ? `${p.isHome ? "vs" : "@"} ${opp}` : "—"}
                    </td>
                    <td className="p-2.5 text-right tabular-nums">{money(p.price)}</td>
                    <td className="p-2.5 text-right tabular-nums">{p.xMins.toFixed(0)}′</td>
                    <td className="p-2.5 text-right font-semibold tabular-nums text-primary">
                      {num(p.xpNow, 2)}
                    </td>
                    <td className="p-2.5 text-right tabular-nums">{num(p.xpHorizon, 1)}</td>
                    <td className="p-2.5 text-right tabular-nums">{num(p.valueNow, 2)}</td>
                    <td className="p-2.5 text-right tabular-nums">
                      {p.dist ? pct(p.dist.p_haul) : "—"}
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
        {rows.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">Không có cầu thủ nào khớp bộ lọc.</p>
        )}
      </Card>

      {/* ------------------------------------------------------------- chi tiết */}
      {detail && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <Card className="max-h-[88vh] w-full max-w-3xl overflow-y-auto scroll-thin">
            <CardHeader className="sticky top-0 flex-row items-start justify-between border-b bg-card">
              <div>
                <CardTitle>{detail.fullName}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {POS_VI[detail.pos]} · {teamById.get(detail.team)?.name} ·{" "}
                  {money(detail.price)} · sở hữu {detail.ownership.toFixed(0)}%
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetail(null)}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </CardHeader>

            <CardContent className="space-y-5 pt-4">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">xP lượt {meta.currentMd}</div>
                  <div className="text-xl font-bold tabular-nums text-primary">
                    {num(detail.xpNow, 2)}
                  </div>
                </div>
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">Số phút kỳ vọng</div>
                  <div className="text-xl font-bold tabular-nums">
                    {detail.xMins.toFixed(0)}′
                  </div>
                  <div className="text-xs text-muted-foreground">
                    đá chính {pct(detail.pStart)}
                  </div>
                </div>
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">Tịt ngòi (≤2 điểm)</div>
                  <div className="text-xl font-bold tabular-nums">
                    {detail.dist ? pct(detail.dist.p_blank) : "—"}
                  </div>
                </div>
                <div className="rounded-md bg-muted/50 p-3">
                  <div className="text-xs text-muted-foreground">Bùng nổ (≥10 điểm)</div>
                  <div className="text-xl font-bold tabular-nums text-positive">
                    {detail.dist ? pct(detail.dist.p_haul) : "—"}
                  </div>
                </div>
              </div>

              {/* phân rã xP */}
              <div>
                <h4 className="mb-2 text-sm font-semibold">
                  xP đến từ đâu (lượt {meta.currentMd})
                </h4>
                <div className="space-y-1.5">
                  {Object.entries(detail.breakdown)
                    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
                    .map(([k, v]) => {
                      const width = Math.min(100, (Math.abs(v) / 5) * 100);
                      return (
                        <div key={k} className="flex items-center gap-2 text-xs">
                          <span className="w-36 shrink-0 text-muted-foreground">
                            {BREAKDOWN_VI[k] ?? k}
                          </span>
                          <div className="h-3 flex-1 rounded bg-muted">
                            <div
                              className={`h-3 rounded ${v >= 0 ? "bg-primary" : "bg-danger"}`}
                              style={{ width: `${width}%` }}
                            />
                          </div>
                          <span className="w-12 text-right tabular-nums">{num(v, 2)}</span>
                        </div>
                      );
                    })}
                </div>
              </div>

              {/* xP theo từng lượt */}
              <div>
                <h4 className="mb-2 text-sm font-semibold">xP theo từng lượt đấu</h4>
                <div className="flex flex-wrap gap-1.5">
                  {mds.map((md) => {
                    const t = teamById.get(detail.team);
                    const fx = t?.fixtures.find((f) => f.md === md);
                    const opp = fx ? teamById.get(fx.opponent)?.short : null;
                    return (
                      <div key={md} className="w-[86px] rounded-md border p-2 text-center">
                        <div className="text-[10px] text-muted-foreground">Lượt {md}</div>
                        {fx ? (
                          <DifficultyCell value={fx.atkDifficulty} className="mt-1 w-full">
                            {fx.home ? "" : "@"}
                            {opp}
                          </DifficultyCell>
                        ) : (
                          <div className="mt-1 text-xs text-muted-foreground">—</div>
                        )}
                        <div className="mt-1 text-sm font-bold tabular-nums">
                          {num(detail.xp[String(md)] ?? 0, 2)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* số liệu nền */}
              <div>
                <h4 className="mb-2 text-sm font-semibold">Số liệu nền của mô hình</h4>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs sm:grid-cols-3">
                  <Row label="Tỷ trọng bàn thắng của đội" value={pct(detail.shareGoal, 1)} />
                  <Row label="Tỷ trọng kiến tạo" value={pct(detail.shareAssist, 1)} />
                  <Row label="Thu hồi bóng / 90′" value={num(detail.br90, 1)} />
                  {detail.pos === 1 && <Row label="Cứu thua / 90′" value={num(detail.sv90, 1)} />}
                  <Row label="P(hay nhất trận)" value={pct(detail.pMotm, 1)} />
                  <Row label="Phút UCL 2025/26" value={`${detail.minsPrev}′`} />
                  <Row label="Bàn 2025/26" value={String(detail.goalsPrev)} />
                  <Row label="Kiến tạo 2025/26" value={String(detail.assistsPrev)} />
                  <Row label="Điểm fantasy 2025/26" value={String(detail.ptsPrev)} />
                </div>
                {!detail.hasHistory && (
                  <p className="mt-2 rounded-md bg-caution/10 p-2 text-xs text-caution">
                    Cầu thủ này không có phút nào ở UCL mùa trước. Toàn bộ tỷ lệ đến từ
                    prior theo giá và vị trí — độ tin cậy thấp hơn hẳn nhóm có số liệu.
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

/** Giá trị dùng để so sánh cho từng cột — cột nào không phải trường thẳng thì quy đổi ở đây. */
function sortValue(p: Player, key: SortKey, data: Dataset): number | string | null {
  switch (key) {
    case "name":
      return p.fullName;
    case "opponent":
      return p.opponent ? (data.teamById.get(p.opponent)?.short ?? null) : null;
    case "haul":
      return p.dist ? p.dist.p_haul : null;
    default:
      return p[key];
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2 border-b border-dashed py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
