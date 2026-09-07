"use client";

import Link from "next/link";
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Crown, RefreshCw, Route } from "lucide-react";

import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorBox,
  SectionTitle,
  Select,
  Spinner,
  Stat,
} from "@/components/ui";
import { POS_SHORT, useDataset, type Player } from "@/lib/data";
import { fmtVNDate, money, num } from "@/lib/format";
import { optimizeSquad, type Formation } from "@/lib/optimizer";
import { planHorizon, xpAt, type PlanOptions, type PlanResult } from "@/lib/planner";
import { loadSavedSquad, saveSquad } from "@/lib/squad-store";

export default function PlannerPage() {
  const { data, error, loading } = useDataset();

  const [freeTransfers, setFreeTransfers] = useState(2);
  const [maxExtra, setMaxExtra] = useState(0);
  const [endMd, setEndMd] = useState<number | null>(null);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [squadSource, setSquadSource] = useState<"saved" | "generated" | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  const options: PlanOptions | null = useMemo(() => {
    if (!data) return null;
    const byPos = data.meta.rules.squadByPos;
    const lastMd = data.meta.matchdays[data.meta.matchdays.length - 1]?.md ?? 8;
    return {
      startMd: data.meta.currentMd,
      endMd: endMd ?? lastMd,
      freeTransfers,
      hitCost: Math.abs(data.meta.rules.extraTransferCost),
      maxExtraTransfers: maxExtra,
      minFreeGain: 1.0,
      budget: data.meta.rules.budget,
      maxPerClub: data.meta.rules.maxPerClub,
      squadByPos: {
        1: byPos["1"] ?? 2,
        2: byPos["2"] ?? 5,
        3: byPos["3"] ?? 5,
        4: byPos["4"] ?? 3,
      },
      formations: data.meta.rules.formations as Formation[],
      unlimitedMds: data.meta.rules.unlimitedTransferMds,
    };
  }, [data, endMd, freeTransfers, maxExtra]);

  const run = useCallback(() => {
    if (!data || !options) return;
    setBusy(true);
    setTimeout(() => {
      let squad = loadSavedSquad(data);
      let source: "saved" | "generated" = "saved";
      if (!squad) {
        const built = optimizeSquad(data.players, {
          budget: options.budget,
          maxPerClub: options.maxPerClub,
          squadByPos: options.squadByPos,
          formations: options.formations,
          target: "horizon",
          strategy: "balanced",
          benchWeight: 0.12,
        });
        squad = built?.squad ?? null;
        source = "generated";
        if (squad) saveSquad(squad);
      }
      setSquadSource(source);
      setPlan(squad ? planHorizon(squad, data.players, options) : null);
      setBusy(false);
    }, 20);
  }, [data, options]);

  useEffect(() => {
    if (data && options && !plan && !busy) run();
  }, [data, options, plan, busy, run]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  if (!data || !options) return null;

  const { teamById, meta } = data;
  const lastMd = meta.matchdays[meta.matchdays.length - 1]?.md ?? 8;
  const mdDeadline = (md: number) =>
    meta.matchdays.find((m) => m.md === md)?.deadlineUtc ?? meta.deadlineUtc;

  const totalTransfers = plan?.matchdays.reduce((s, m) => s + m.transfers.length, 0) ?? 0;

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Kế hoạch nhiều lượt"
        hint="Chuyển nhượng miễn phí là tài nguyên khan hiếm. Bảng dưới đây trả lời: đổi ai, ở lượt nào, và có đáng chịu phạt không."
        right={
          <Link href="/chips" className="text-sm font-medium text-primary hover:underline">
            Lịch dùng chip →
          </Link>
        }
      />

      {/* ------------------------------------------------------------ điều khiển */}
      <Card>
        <CardContent className="grid gap-4 pt-4 md:grid-cols-4">
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              Chuyển nhượng miễn phí mỗi lượt
            </span>
            <Select
              className="w-full"
              value={freeTransfers}
              onChange={(e) => {
                setFreeTransfers(Number(e.target.value));
                setPlan(null);
              }}
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n} lượt chuyển nhượng
                </option>
              ))}
            </Select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              Chấp nhận chịu phạt
            </span>
            <Select
              className="w-full"
              value={maxExtra}
              onChange={(e) => {
                setMaxExtra(Number(e.target.value));
                setPlan(null);
              }}
            >
              <option value={0}>Không chịu phạt</option>
              <option value={1}>Tối đa 1 lượt (−4)</option>
              <option value={2}>Tối đa 2 lượt (−8)</option>
            </Select>
          </label>

          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">Lập kế hoạch đến</span>
            <Select
              className="w-full"
              value={endMd ?? lastMd}
              onChange={(e) => {
                setEndMd(Number(e.target.value));
                setPlan(null);
              }}
            >
              {meta.matchdays
                .filter((m) => m.md > meta.currentMd)
                .map((m) => (
                  <option key={m.md} value={m.md}>
                    Hết lượt {m.md}
                  </option>
                ))}
            </Select>
          </label>

          <div className="flex items-end">
            <Button onClick={run} disabled={busy} className="w-full">
              {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Route className="h-4 w-4" />}
              {busy ? "Đang tính…" : "Tính lại kế hoạch"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {busy && <Spinner label="Đang thử từng phép đổi người trên cả chặng…" />}

      {!busy && !plan && (
        <ErrorBox error="Chưa dựng được đội hình gốc. Vào trang Chọn đội hình để tạo trước." />
      )}

      {plan && !busy && (
        <>
          {squadSource === "generated" && (
            <Card className="border-caution/40 bg-caution/5">
              <CardContent className="pt-4 text-sm text-muted-foreground">
                Bạn chưa lưu đội hình nào, nên hệ thống tự dựng một đội tối ưu cho cả chặng
                để làm điểm xuất phát.{" "}
                <Link href="/squad" className="font-medium text-primary hover:underline">
                  Sửa đội hình gốc tại đây →
                </Link>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Stat
              label={`Tổng xP lượt ${options.startMd}–${options.endMd}`}
              value={num(plan.totalXp, 1)}
              sub="đã gồm điểm đội trưởng"
            />
            <Stat
              label="Điểm phạt chuyển nhượng"
              value={plan.totalCost === 0 ? "0" : `−${plan.totalCost}`}
              tone={plan.totalCost > 0 ? "caution" : undefined}
              sub={`${plan.matchdays.reduce((s, m) => s + m.hits, 0)} lượt vượt hạn mức`}
            />
            <Stat label="Điểm ròng" value={num(plan.net, 1)} tone="positive" sub="sau khi trừ phạt" />
            <Stat
              label="Số lần đổi người"
              value={totalTransfers}
              sub={`trong ${options.endMd - options.startMd} lượt có chuyển nhượng`}
            />
          </div>

          {/* --------------------------------------------------- dòng thời gian */}
          <Card>
            <CardHeader>
              <CardTitle>Lộ trình từng lượt</CardTitle>
              <p className="text-xs text-muted-foreground">
                Mỗi phép đổi người được chấm bằng phần điểm nó cộng thêm trên{" "}
                <em>toàn bộ chặng còn lại</em>, không chỉ lượt kế tiếp — vì cầu thủ mua về
                sẽ ở lại trong đội. Bấm vào một lượt để xem đội hình ra sân.
              </p>
            </CardHeader>
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2.5 font-medium">Lượt</th>
                    <th className="p-2.5 font-medium">Chuyển nhượng</th>
                    <th className="p-2.5 font-medium">Đội trưởng</th>
                    <th className="p-2.5 text-center font-medium">Sơ đồ</th>
                    <th className="p-2.5 text-right font-medium">xP</th>
                    <th className="p-2.5 text-right font-medium">Phạt</th>
                    <th className="p-2.5 text-right font-medium">Ròng</th>
                    <th className="p-2.5 text-right font-medium">Dư</th>
                  </tr>
                </thead>
                <tbody>
                  {plan.matchdays.map((step) => (
                    <Fragment key={step.md}>
                      <tr
                        onClick={() => setOpen(open === step.md ? null : step.md)}
                        className="cursor-pointer border-b hover:bg-muted/30"
                      >
                        <td className="p-2.5">
                          <div className="font-semibold">Lượt {step.md}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {fmtVNDate(mdDeadline(step.md))}
                          </div>
                        </td>
                        <td className="p-2.5">
                          {step.md === options.startMd ? (
                            <span className="text-xs text-muted-foreground">
                              đội hình hiện tại
                            </span>
                          ) : step.unlimited ? (
                            <Badge className="bg-positive/15 text-positive">
                              chuyển nhượng không giới hạn
                            </Badge>
                          ) : step.transfers.length === 0 ? (
                            <span className="text-xs text-muted-foreground">
                              giữ nguyên đội hình
                            </span>
                          ) : (
                            <div className="space-y-1">
                              {step.transfers.map((t) => (
                                <div
                                  key={t.out.id + t.in.id}
                                  className="flex flex-wrap items-center gap-1.5 text-xs"
                                >
                                  <span className="text-danger line-through">{t.out.name}</span>
                                  <ArrowRight className="h-3 w-3 text-muted-foreground" />
                                  <span className="font-medium text-positive">{t.in.name}</span>
                                  <span className="text-muted-foreground">
                                    (+{num(t.gain, 1)} điểm cả chặng)
                                  </span>
                                  {t.paid && (
                                    <Badge className="bg-caution/20 text-[10px] text-caution">
                                      −{options.hitCost}
                                    </Badge>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="p-2.5">
                          {step.captain ? (
                            <div className="flex items-center gap-1.5">
                              <Crown className="h-3.5 w-3.5 text-accent" />
                              <div>
                                <div className="text-xs font-medium">{step.captain.name}</div>
                                <div className="text-[10px] text-muted-foreground">
                                  {num(xpAt(step.captain, step.md) * 2, 1)} điểm kỳ vọng
                                </div>
                              </div>
                            </div>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-2.5 text-center text-xs tabular-nums">
                          {step.formation.def}-{step.formation.mid}-{step.formation.fwd}
                        </td>
                        <td className="p-2.5 text-right font-semibold tabular-nums text-primary">
                          {num(step.xp, 1)}
                        </td>
                        <td className="p-2.5 text-right tabular-nums text-caution">
                          {step.pointsCost ? `−${step.pointsCost}` : "—"}
                        </td>
                        <td className="p-2.5 text-right font-semibold tabular-nums">
                          {num(step.net, 1)}
                        </td>
                        <td className="p-2.5 text-right text-xs tabular-nums text-muted-foreground">
                          {money(step.bank)}
                        </td>
                      </tr>

                      {open === step.md && (
                        <tr className="border-b bg-muted/20">
                          <td colSpan={8} className="p-3">
                            <div className="mb-2 text-xs font-medium text-muted-foreground">
                              Đội hình ra sân lượt {step.md}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {step.xi
                                .slice()
                                .sort(
                                  (a, b) =>
                                    a.pos - b.pos || xpAt(b, step.md) - xpAt(a, step.md),
                                )
                                .map((p: Player) => (
                                  <div
                                    key={p.id}
                                    className="rounded-md border bg-card px-2 py-1.5 text-xs"
                                  >
                                    <div className="flex items-center gap-1.5">
                                      <Badge className="bg-muted text-[9px] text-muted-foreground">
                                        {POS_SHORT[p.pos]}
                                      </Badge>
                                      <span className="font-medium">{p.name}</span>
                                      {step.captain?.id === p.id && (
                                        <Crown className="h-3 w-3 text-accent" />
                                      )}
                                    </div>
                                    <div className="mt-0.5 flex justify-between gap-3 text-[10px] text-muted-foreground">
                                      <span>{teamById.get(p.team)?.short}</span>
                                      <span className="font-semibold text-primary">
                                        {num(xpAt(p, step.md), 2)}
                                      </span>
                                    </div>
                                  </div>
                                ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="border-caution/40 bg-caution/5">
            <CardContent className="space-y-1.5 pt-4 text-sm text-muted-foreground">
              <p className="font-semibold text-caution">Kế hoạch này giả định những gì</p>
              <p>
                • Số chuyển nhượng miễn phí mỗi lượt <strong>không nằm trong feed công khai</strong>{" "}
                của UEFA (nó thuộc tài khoản của bạn), nên đây là tham số bạn tự chọn ở trên.
              </p>
              <p>
                • Một lượt chuyển nhượng miễn phí chỉ được tiêu khi phép đổi người có lợi{" "}
                <strong>ít nhất 1 điểm trên cả chặng</strong>, và{" "}
                <strong>cầu thủ đã bán không được mua lại</strong> trong cùng kế hoạch. Bỏ hai
                ràng buộc này thì thuật toán sẽ đổi qua đổi lại giữa hai cầu thủ ngang tài —
                hợp lệ về luật nhưng vô nghĩa trong thực tế.
              </p>
              <p>
                • Giá cầu thủ được coi là <strong>đứng yên</strong>. Feed không phát dữ liệu
                biến động giá, nên kế hoạch không tính phần lãi/lỗ khi bán.
              </p>
              <p>
                • Kế hoạch chỉ chạy trong vòng bảng (đến lượt {lastMd}). Từ play-off trở đi
                chưa biết cặp đấu nên không dự báo được.
              </p>
              <p>
                • Càng xa hiện tại, sai số càng lớn: chấn thương, xoay tua và phong độ đều
                chưa xảy ra. Hãy coi lượt kế tiếp là quyết định, các lượt sau là định hướng.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
