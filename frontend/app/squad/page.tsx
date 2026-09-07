"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Crown, RefreshCw, Sparkles, Trash2, X } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorBox,
  Input,
  RiskBadge,
  SectionTitle,
  Select,
  Spinner,
  Stat,
} from "@/components/ui";
import {
  POS_SHORT,
  POS_VI,
  isSelectable,
  riskLabel,
  useDataset,
  type Player,
  type Pos,
} from "@/lib/data";
import { money, num } from "@/lib/format";
import { loadSavedSquad, saveSquad } from "@/lib/squad-store";
import {
  optimizeSquad,
  playerScore,
  rebuild,
  type OptimizeOptions,
  type SquadResult,
  type Strategy,
} from "@/lib/optimizer";

const STRATEGY_LABEL: Record<Strategy, { name: string; hint: string }> = {
  safe: {
    name: "An toàn",
    hint: "Ưu tiên sàn điểm: phạt rủi ro không đá chính và rủi ro tịt ngòi.",
  },
  balanced: { name: "Cân bằng", hint: "Tối đa hoá điểm kỳ vọng thuần tuý." },
  aggressive: {
    name: "Mạo hiểm",
    hint: "Ưu tiên trần điểm và cầu thủ ít người sở hữu — hợp khi cần bứt lên.",
  },
};

export default function SquadPage() {
  const { data, error, loading } = useDataset();

  const [target, setTarget] = useState<"now" | "horizon">("now");
  const [strategy, setStrategy] = useState<Strategy>("balanced");
  const [budget, setBudget] = useState(100);
  const [benchWeight, setBenchWeight] = useState(0.12);
  const [result, setResult] = useState<SquadResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [swapFor, setSwapFor] = useState<Player | null>(null);
  const [search, setSearch] = useState("");
  const [locked, setLocked] = useState<string[]>([]);

  const options: OptimizeOptions | null = useMemo(() => {
    if (!data) return null;
    const byPos = data.meta.rules.squadByPos;
    return {
      budget,
      maxPerClub: data.meta.rules.maxPerClub,
      squadByPos: {
        1: byPos["1"] ?? 2,
        2: byPos["2"] ?? 5,
        3: byPos["3"] ?? 5,
        4: byPos["4"] ?? 3,
      } as Record<Pos, number>,
      formations: data.meta.rules.formations,
      target,
      strategy,
      benchWeight,
      locked,
    };
  }, [data, budget, target, strategy, benchWeight, locked]);

  const runOptimize = useCallback(() => {
    if (!data || !options) return;
    setBusy(true);
    // nhường một nhịp cho trình duyệt vẽ trạng thái "đang tính"
    setTimeout(() => {
      const r = optimizeSquad(data.players, options);
      setResult(r);
      setBusy(false);
      if (r) saveSquad(r.squad);
    }, 20);
  }, [data, options]);

  // khôi phục đội hình đã lưu, nếu chưa có thì tự tối ưu lần đầu
  useEffect(() => {
    if (!data || !options || result) return;
    const saved = loadSavedSquad(data);
    if (saved) {
      setResult(rebuild(saved, options));
      return;
    }
    runOptimize();
  }, [data, options, result, runOptimize]);

  const applySquad = useCallback(
    (squad: Player[]) => {
      if (!options) return;
      setResult(rebuild(squad, options));
      saveSquad(squad);
    },
    [options],
  );

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  if (!data || !options) return null;

  const { teamById, meta } = data;
  const squad = result?.squad ?? [];
  const cost = result?.cost ?? 0;
  const remaining = budget - cost;
  const clubCount = new Map<number, number>();
  for (const p of squad) clubCount.set(p.team, (clubCount.get(p.team) ?? 0) + 1);

  const totalXp = result
    ? result.xi.reduce((s, p) => s + (target === "now" ? p.xpNow : p.xpHorizon), 0)
    : 0;
  const captainXp = result?.captain
    ? target === "now"
      ? result.captain.xpNow
      : result.captain.xpHorizon
    : 0;

  /* ---------------------------------------------------- danh sách thay người */
  const swapCandidates = swapFor
    ? data.players
        .filter((p) => p.pos === swapFor.pos && isSelectable(p) && p.id !== swapFor.id)
        .filter((p) => !squad.some((s) => s.id === p.id))
        .filter((p) => p.price <= swapFor.price + remaining + 1e-9)
        .filter((p) => {
          const c = (clubCount.get(p.team) ?? 0) - (p.team === swapFor.team ? 1 : 0);
          return c < meta.rules.maxPerClub;
        })
        .filter((p) =>
          search
            ? p.fullName.toLowerCase().includes(search.toLowerCase()) ||
              (teamById.get(p.team)?.name ?? "").toLowerCase().includes(search.toLowerCase())
            : true,
        )
        .sort((a, b) => playerScore(b, options) - playerScore(a, options))
        .slice(0, 40)
    : [];

  const doSwap = (incoming: Player) => {
    if (!swapFor) return;
    applySquad(squad.map((p) => (p.id === swapFor.id ? incoming : p)));
    setSwapFor(null);
    setSearch("");
  };

  const toggleLock = (p: Player) =>
    setLocked((prev) => (prev.includes(p.id) ? prev.filter((x) => x !== p.id) : [...prev, p.id]));

  const PlayerChip = ({ p, onBench }: { p: Player; onBench?: boolean }) => {
    const risk = riskLabel(p);
    const isCaptain = result?.captain?.id === p.id;
    const isVice = result?.viceCaptain?.id === p.id;
    const opp = p.opponent ? teamById.get(p.opponent)?.short : null;
    return (
      <button
        type="button"
        onClick={() => setSwapFor(p)}
        className={`w-[104px] rounded-md border bg-card p-2 text-left transition hover:border-primary hover:shadow ${
          onBench ? "opacity-80" : ""
        }`}
      >
        <div className="flex items-center justify-between">
          <span className="truncate text-[11px] font-semibold">{p.name}</span>
          {isCaptain && <Crown className="h-3 w-3 shrink-0 text-accent" />}
          {isVice && <span className="text-[9px] font-bold text-muted-foreground">P</span>}
        </div>
        <div className="truncate text-[10px] text-muted-foreground">
          {teamById.get(p.team)?.short} {opp ? (p.isHome ? `vs ${opp}` : `@ ${opp}`) : ""}
        </div>
        <div className="mt-1 flex items-center justify-between text-[10px]">
          <span className="text-muted-foreground">{money(p.price)}</span>
          <span className="font-bold text-primary">
            {num(target === "now" ? p.xpNow : p.xpHorizon, 1)}
          </span>
        </div>
        {risk && (
          <div className="mt-1">
            <RiskBadge text={risk.text} tone={risk.tone} />
          </div>
        )}
        {locked.includes(p.id) && (
          <div className="mt-1 text-[9px] font-semibold text-accent">đã ghim</div>
        )}
      </button>
    );
  };

  const rows: { pos: Pos; players: Player[] }[] = ([1, 2, 3, 4] as Pos[]).map((pos) => ({
    pos,
    players: (result?.xi ?? []).filter((p) => p.pos === pos),
  }));

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Chọn đội hình"
        hint={`Tối ưu 15 cầu thủ trong ${money(meta.rules.budget)}, tối đa ${meta.rules.maxPerClub} người/CLB — chạy hoàn toàn trong trình duyệt.`}
      />

      {/* ------------------------------------------------------------ điều khiển */}
      <Card>
        <CardContent className="grid gap-4 pt-4 md:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Tối ưu cho</span>
            <Select
              className="w-full"
              value={target}
              onChange={(e) => setTarget(e.target.value as "now" | "horizon")}
            >
              <option value="now">Chỉ lượt {meta.currentMd}</option>
              <option value="horizon">Cả vòng bảng còn lại</option>
            </Select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Khẩu vị rủi ro</span>
            <Select
              className="w-full"
              value={strategy}
              onChange={(e) => setStrategy(e.target.value as Strategy)}
            >
              {(Object.keys(STRATEGY_LABEL) as Strategy[]).map((s) => (
                <option key={s} value={s}>
                  {STRATEGY_LABEL[s].name}
                </option>
              ))}
            </Select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              Ngân sách: {money(budget)}
            </span>
            <input
              type="range"
              min={80}
              max={100}
              step={0.5}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="w-full accent-[hsl(var(--primary))]"
            />
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              Trọng số băng ghế: {benchWeight.toFixed(2)}
            </span>
            <input
              type="range"
              min={0}
              max={0.4}
              step={0.02}
              value={benchWeight}
              onChange={(e) => setBenchWeight(Number(e.target.value))}
              className="w-full accent-[hsl(var(--primary))]"
            />
          </label>

          <div className="md:col-span-4 flex flex-wrap items-center gap-3">
            <Button onClick={runOptimize} disabled={busy}>
              {busy ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {busy ? "Đang tối ưu…" : "Tối ưu đội hình"}
            </Button>
            {locked.length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setLocked([])}>
                <Trash2 className="h-3.5 w-3.5" /> Bỏ ghim {locked.length} cầu thủ
              </Button>
            )}
            <p className="text-xs text-muted-foreground">
              {STRATEGY_LABEL[strategy].hint}
            </p>
          </div>
        </CardContent>
      </Card>

      {!result && !busy && (
        <ErrorBox error="Không dựng được đội hình hợp lệ với thiết lập hiện tại. Thử nới ngân sách hoặc bỏ bớt cầu thủ đã ghim." />
      )}

      {result && (
        <>
          {/* ------------------------------------------------------- tóm tắt */}
          <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Stat
              label="Chi phí"
              value={money(cost)}
              sub={`còn ${money(remaining)}`}
              tone={remaining < 0 ? "danger" : undefined}
            />
            <Stat label="Sơ đồ" value={`${result.formation.def}-${result.formation.mid}-${result.formation.fwd}`} sub="đội hình ra sân" />
            <Stat
              label={target === "now" ? `xP lượt ${meta.currentMd}` : "xP cả vòng bảng"}
              value={num(totalXp + captainXp, 1)}
              sub="đã cộng điểm đội trưởng"
            />
            <Stat
              label="Đội trưởng"
              value={result.captain?.name ?? "—"}
              sub={result.captain ? `${num(captainXp * 2, 1)} điểm kỳ vọng` : undefined}
            />
            <Stat
              label="Cầu thủ rủi ro"
              value={squad.filter((p) => riskLabel(p)).length}
              sub="xem nhãn trên sân"
              tone={squad.some((p) => riskLabel(p)?.tone === "bad") ? "caution" : undefined}
            />
          </div>

          {/* ---------------------------------------------------------- sân */}
          <Card>
            <CardHeader>
              <CardTitle>Đội hình ra sân</CardTitle>
              <p className="text-xs text-muted-foreground">
                Bấm vào một cầu thủ để xem phương án thay thế trong ngân sách còn lại.
              </p>
            </CardHeader>
            <CardContent>
              <div className="pitch space-y-5 rounded-lg border p-4">
                {rows.map((row) => (
                  <div key={row.pos} className="flex flex-wrap justify-center gap-2">
                    {row.players.map((p) => (
                      <PlayerChip key={p.id} p={p} />
                    ))}
                  </div>
                ))}
              </div>

              <div className="mt-4">
                <div className="mb-2 text-xs font-medium text-muted-foreground">
                  Dự bị (theo thứ tự ưu tiên vào sân)
                </div>
                <div className="flex flex-wrap gap-2">
                  {result.bench.map((p) => (
                    <PlayerChip key={p.id} p={p} onBench />
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>

          {/* ------------------------------------------------- bảng chi tiết */}
          <Card>
            <CardHeader>
              <CardTitle>Chi tiết 15 cầu thủ</CardTitle>
            </CardHeader>
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2.5 font-medium">Vị trí</th>
                    <th className="p-2.5 font-medium">Cầu thủ</th>
                    <th className="p-2.5 font-medium">CLB</th>
                    <th className="p-2.5 text-right font-medium">Giá</th>
                    <th className="p-2.5 text-right font-medium">xPhút</th>
                    <th className="p-2.5 text-right font-medium">
                      xP {target === "now" ? `L${meta.currentMd}` : "vòng bảng"}
                    </th>
                    <th className="p-2.5 text-right font-medium">Sở hữu</th>
                    <th className="p-2.5 text-right font-medium">Ghim</th>
                  </tr>
                </thead>
                <tbody>
                  {squad.map((p) => {
                    const inXi = result.xi.some((x) => x.id === p.id);
                    return (
                      <tr
                        key={p.id}
                        className={`border-b last:border-0 ${inXi ? "" : "bg-muted/20 text-muted-foreground"}`}
                      >
                        <td className="p-2.5">
                          <Badge className="bg-muted text-[10px] text-muted-foreground">
                            {POS_SHORT[p.pos]}
                          </Badge>
                        </td>
                        <td className="p-2.5 font-medium">
                          {p.name}
                          {!inXi && <span className="ml-2 text-xs">(dự bị)</span>}
                        </td>
                        <td className="p-2.5 text-xs">{teamById.get(p.team)?.name}</td>
                        <td className="p-2.5 text-right tabular-nums">{money(p.price)}</td>
                        <td className="p-2.5 text-right tabular-nums">{p.xMins.toFixed(0)}′</td>
                        <td className="p-2.5 text-right font-semibold tabular-nums">
                          {num(target === "now" ? p.xpNow : p.xpHorizon, 2)}
                        </td>
                        <td className="p-2.5 text-right tabular-nums text-xs">
                          {p.ownership.toFixed(0)}%
                        </td>
                        <td className="p-2.5 text-right">
                          <button
                            type="button"
                            onClick={() => toggleLock(p)}
                            className={`rounded px-2 py-1 text-xs font-medium ${
                              locked.includes(p.id)
                                ? "bg-accent text-accent-foreground"
                                : "bg-muted text-muted-foreground hover:bg-muted/70"
                            }`}
                          >
                            {locked.includes(p.id) ? "Đã ghim" : "Ghim"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* --------------------------------------------- phân bổ theo CLB */}
          <Card>
            <CardHeader>
              <CardTitle>Phân bổ theo CLB</CardTitle>
              <p className="text-xs text-muted-foreground">
                Luật giới hạn {meta.rules.maxPerClub} cầu thủ mỗi CLB — nhóm 3 người dồn
                vào một đội là đặt cược lớn vào lịch thi đấu của đội đó.
              </p>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              {[...clubCount.entries()]
                .sort((a, b) => b[1] - a[1])
                .map(([tid, n]) => (
                  <Badge
                    key={tid}
                    className={
                      n >= meta.rules.maxPerClub
                        ? "bg-accent/15 text-accent"
                        : "bg-muted text-muted-foreground"
                    }
                  >
                    {teamById.get(tid)?.short} · {n}
                  </Badge>
                ))}
            </CardContent>
          </Card>
        </>
      )}

      {/* ------------------------------------------------------ bảng thay người */}
      {swapFor && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
          <Card className="max-h-[85vh] w-full max-w-2xl overflow-hidden">
            <CardHeader className="flex-row items-start justify-between border-b">
              <div>
                <CardTitle>Thay {swapFor.name}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  {POS_VI[swapFor.pos]} · ngân sách khả dụng{" "}
                  {money(swapFor.price + remaining)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSwapFor(null);
                  setSearch("");
                }}
                className="rounded p-1 text-muted-foreground hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </CardHeader>
            <div className="border-b p-3">
              <Input
                autoFocus
                placeholder="Tìm theo tên cầu thủ hoặc CLB…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="max-h-[55vh] overflow-y-auto scroll-thin">
              {swapCandidates.map((p) => {
                const risk = riskLabel(p);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => doSwap(p)}
                    className="flex w-full items-center justify-between border-b p-3 text-left last:border-0 hover:bg-muted/40"
                  >
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium">
                        {p.name}
                        {risk && <RiskBadge text={risk.text} tone={risk.tone} />}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {teamById.get(p.team)?.name} · {p.xMins.toFixed(0)}′ · sở hữu{" "}
                        {p.ownership.toFixed(0)}%
                      </div>
                    </div>
                    <div className="flex items-center gap-4 text-right">
                      <span className="text-xs tabular-nums text-muted-foreground">
                        {money(p.price)}
                      </span>
                      <span className="w-12 text-right text-sm font-bold tabular-nums text-primary">
                        {num(target === "now" ? p.xpNow : p.xpHorizon, 2)}
                      </span>
                    </div>
                  </button>
                );
              })}
              {swapCandidates.length === 0 && (
                <p className="p-4 text-sm text-muted-foreground">
                  Không có phương án nào hợp lệ trong ngân sách và giới hạn CLB.
                </p>
              )}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
