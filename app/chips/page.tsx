"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Crown, Infinity as InfinityIcon, RefreshCw, Wand2 } from "lucide-react";

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
import {
  chipAdvice,
  planHorizon,
  xpAt,
  type ChipAdvice,
  type ChipOption,
  type PlanOptions,
} from "@/lib/planner";
import { loadSavedSquad, saveSquad } from "@/lib/squad-store";

export default function ChipsPage() {
  const { data, error, loading } = useDataset();
  const [freeTransfers, setFreeTransfers] = useState(2);
  const [advice, setAdvice] = useState<ChipAdvice | null>(null);
  const [busy, setBusy] = useState(false);

  const options: PlanOptions | null = useMemo(() => {
    if (!data) return null;
    const byPos = data.meta.rules.squadByPos;
    const lastMd = data.meta.matchdays[data.meta.matchdays.length - 1]?.md ?? 8;
    return {
      startMd: data.meta.currentMd,
      endMd: lastMd,
      freeTransfers,
      hitCost: Math.abs(data.meta.rules.extraTransferCost),
      maxExtraTransfers: 0,
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
  }, [data, freeTransfers]);

  const run = useCallback(() => {
    if (!data || !options) return;
    setBusy(true);
    setTimeout(() => {
      const base = {
        budget: options.budget,
        maxPerClub: options.maxPerClub,
        squadByPos: options.squadByPos,
        formations: options.formations,
        benchWeight: 0.1,
        restarts: 3,
      };
      let squad = loadSavedSquad(data);
      if (!squad) {
        const built = optimizeSquad(data.players, {
          ...base,
          target: "horizon",
          strategy: "balanced",
        });
        squad = built?.squad ?? null;
        if (squad) saveSquad(squad);
      }
      if (!squad) {
        setAdvice(null);
        setBusy(false);
        return;
      }
      const plan = planHorizon(squad, data.players, options);
      setAdvice(chipAdvice(plan, data.players, options, base));
      setBusy(false);
    }, 20);
  }, [data, options]);

  useEffect(() => {
    if (data && options && !advice && !busy) run();
  }, [data, options, advice, busy, run]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  if (!data || !options) return null;

  const { teamById, meta } = data;
  const mdDeadline = (md: number) =>
    meta.matchdays.find((m) => m.md === md)?.deadlineUtc ?? meta.deadlineUtc;

  const maxGain = advice
    ? Math.max(
        1,
        ...advice.limitless.map((c) => c.gain),
        ...advice.wildcard.map((c) => c.gain),
      )
    : 1;

  return (
    <div className="space-y-6">
      <SectionTitle
        title="Lịch dùng chip"
        hint="Mỗi mùa chỉ có hai lần: Wildcard và Limitless. Trang này ước lượng chip đáng bao nhiêu điểm ở từng lượt, thay vì dùng theo cảm tính."
        right={
          <Link href="/planner" className="text-sm font-medium text-primary hover:underline">
            Kế hoạch nhiều lượt →
          </Link>
        }
      />

      {/* ------------------------------------------------------- luật hai chip */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="border-accent/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-4 w-4 text-accent" /> Wildcard
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Chuyển nhượng không giới hạn trong một lượt, <strong>vẫn phải theo ngân sách</strong>{" "}
            {money(meta.rules.budget)}. Cầu thủ mua về <strong>ở lại vĩnh viễn</strong>. Vì
            vậy giá trị của Wildcard nằm ở cả chặng còn lại, không phải một lượt.
          </CardContent>
        </Card>

        <Card className="border-primary/30">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <InfinityIcon className="h-4 w-4 text-primary" /> Limitless
            </CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            Một lượt duy nhất: chuyển nhượng không giới hạn <strong>và bỏ luôn trần ngân
            sách</strong>. Hết lượt, đội hình <strong>quay về như cũ</strong>. Giá trị của nó
            đúng bằng phần điểm mà ngân sách đang kìm lại trong một lượt.
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-4 pt-4">
          <label className="space-y-1 text-sm">
            <span className="text-xs font-medium text-muted-foreground">
              Chuyển nhượng miễn phí mỗi lượt (để so sánh với phương án không dùng chip)
            </span>
            <Select
              className="w-full"
              value={freeTransfers}
              onChange={(e) => {
                setFreeTransfers(Number(e.target.value));
                setAdvice(null);
              }}
            >
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n} lượt chuyển nhượng
                </option>
              ))}
            </Select>
          </label>
          <Button onClick={run} disabled={busy}>
            {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            {busy ? "Đang tính…" : "Tính lại"}
          </Button>
        </CardContent>
      </Card>

      {busy && <Spinner label="Đang thử dùng chip ở từng lượt…" />}

      {!busy && !advice && (
        <ErrorBox error="Chưa dựng được đội hình gốc. Vào trang Chọn đội hình để tạo trước." />
      )}

      {advice && !busy && (
        <>
          <div className="grid gap-3 md:grid-cols-2">
            <Stat
              label="Nên dùng Wildcard ở"
              value={advice.bestWildcard ? `Lượt ${advice.bestWildcard.md}` : "—"}
              sub={
                advice.bestWildcard
                  ? `+${num(advice.bestWildcard.gain, 1)} điểm cho cả chặng còn lại`
                  : "không lượt nào đủ đáng"
              }
              tone={advice.bestWildcard && advice.bestWildcard.gain > 5 ? "positive" : undefined}
            />
            <Stat
              label="Nên dùng Limitless ở"
              value={advice.bestLimitless ? `Lượt ${advice.bestLimitless.md}` : "—"}
              sub={
                advice.bestLimitless
                  ? `+${num(advice.bestLimitless.gain, 1)} điểm trong đúng lượt đó`
                  : "không lượt nào đủ đáng"
              }
              tone={advice.bestLimitless && advice.bestLimitless.gain > 5 ? "positive" : undefined}
            />
          </div>

          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle>Kết luận</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <p>
                <strong className="text-accent">Wildcard:</strong>{" "}
                {advice.bestWildcard && advice.bestWildcard.gain >= 4 ? (
                  <>
                    đáng dùng ở <strong>lượt {advice.bestWildcard.md}</strong> — xây lại cả đội
                    lúc đó cộng thêm khoảng {num(advice.bestWildcard.gain, 1)} điểm cho chặng
                    còn lại.
                  </>
                ) : (
                  <>
                    <strong>chưa nên tiêu</strong>. Lượt tốt nhất hiện nay chỉ đáng{" "}
                    {num(advice.bestWildcard?.gain ?? 0, 1)} điểm, vì bạn vừa được chuyển
                    nhượng không giới hạn ở lượt {meta.currentMd} nên đội hình đang gần tối ưu
                    sẵn. Giá trị thật của Wildcard là <em>chữa cháy</em> khi 3–4 trụ cột chấn
                    thương cùng lúc — điều mô hình không thể thấy trước.
                  </>
                )}
              </p>
              <p>
                <strong className="text-primary">Limitless:</strong>{" "}
                {advice.bestLimitless ? (
                  <>
                    tốt nhất ở <strong>lượt {advice.bestLimitless.md}</strong>, cộng khoảng{" "}
                    {num(advice.bestLimitless.gain, 1)} điểm trong đúng lượt đó. Con số này
                    chính là phần điểm mà trần ngân sách {money(meta.rules.budget)} đang kìm
                    lại: bỏ trần ra thì bạn xếp được hàng công toàn cầu thủ đắt nhất.
                  </>
                ) : (
                  <>chưa lượt nào đủ đáng.</>
                )}
              </p>
              <p className="text-muted-foreground">
                Hai chip <strong>không dùng chung một lượt</strong>. Nếu phải chọn thứ tự: tiêu
                Limitless vào lượt có nhiều cặp đấu chênh lệch nhất, giữ Wildcard cho tới khi
                đội hình thật sự hỏng.
              </p>
            </CardContent>
          </Card>

          {/* ------------------------------------------------------ bảng so sánh */}
          <Card>
            <CardHeader>
              <CardTitle>Chip đáng bao nhiêu điểm ở từng lượt</CardTitle>
              <p className="text-xs text-muted-foreground">
                Wildcard được đo trên <em>cả chặng còn lại</em> (vì cầu thủ ở lại), Limitless
                đo trong <em>đúng một lượt</em> (vì đội hình quay về như cũ). Hai cột không so
                sánh trực tiếp với nhau được.
              </p>
            </CardHeader>
            <div className="overflow-x-auto scroll-thin">
              <table className="w-full text-sm">
                <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="p-2.5 font-medium">Lượt</th>
                    <th className="p-2.5 font-medium">Wildcard — lợi cả chặng</th>
                    <th className="p-2.5 font-medium">Limitless — lợi trong lượt</th>
                  </tr>
                </thead>
                <tbody>
                  {advice.wildcard.map((w, i) => {
                    const l = advice.limitless[i];
                    return (
                      <tr key={w.md} className="border-b last:border-0">
                        <td className="p-2.5">
                          <div className="font-semibold">Lượt {w.md}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {fmtVNDate(mdDeadline(w.md))}
                          </div>
                        </td>
                        <GainCell
                          option={w}
                          maxGain={maxGain}
                          best={advice.bestWildcard?.md === w.md}
                          tone="accent"
                        />
                        <GainCell
                          option={l}
                          maxGain={maxGain}
                          best={advice.bestLimitless?.md === l.md}
                          tone="primary"
                        />
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {/* --------------------------------------------- đội hình trong mơ */}
          {advice.bestLimitless?.xi && (
            <Card>
              <CardHeader>
                <CardTitle>
                  Đội hình Limitless ở lượt {advice.bestLimitless.md} (bỏ trần ngân sách)
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Tổng giá {money(advice.bestLimitless.xi.reduce((s, p) => s + p.price, 0))} — vượt
                  xa {money(meta.rules.budget)}, đó chính là lý do chip này có giá trị.
                </p>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {advice.bestLimitless.xi
                  .slice()
                  .sort(
                    (a, b) =>
                      a.pos - b.pos ||
                      xpAt(b, advice.bestLimitless!.md) - xpAt(a, advice.bestLimitless!.md),
                  )
                  .map((p: Player) => (
                    <div key={p.id} className="rounded-md border bg-card px-2 py-1.5 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Badge className="bg-muted text-[9px] text-muted-foreground">
                          {POS_SHORT[p.pos]}
                        </Badge>
                        <span className="font-medium">{p.name}</span>
                        {advice.bestLimitless!.captain?.id === p.id && (
                          <Crown className="h-3 w-3 text-accent" />
                        )}
                      </div>
                      <div className="mt-0.5 flex justify-between gap-3 text-[10px] text-muted-foreground">
                        <span>
                          {teamById.get(p.team)?.short} · {money(p.price)}
                        </span>
                        <span className="font-semibold text-primary">
                          {num(xpAt(p, advice.bestLimitless!.md), 2)}
                        </span>
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}

          {advice.bestWildcard?.squad && (
            <Card>
              <CardHeader>
                <CardTitle>Đội hình Wildcard ở lượt {advice.bestWildcard.md}</CardTitle>
                <p className="text-xs text-muted-foreground">
                  Đội tối ưu cho toàn bộ chặng còn lại trong ngân sách{" "}
                  {money(meta.rules.budget)} — tổng giá{" "}
                  {money(advice.bestWildcard.squad.reduce((s, p) => s + p.price, 0))}.
                </p>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {advice.bestWildcard.squad
                  .slice()
                  .sort((a, b) => a.pos - b.pos || b.xpHorizon - a.xpHorizon)
                  .map((p: Player) => (
                    <div key={p.id} className="rounded-md border bg-card px-2 py-1.5 text-xs">
                      <div className="flex items-center gap-1.5">
                        <Badge className="bg-muted text-[9px] text-muted-foreground">
                          {POS_SHORT[p.pos]}
                        </Badge>
                        <span className="font-medium">{p.name}</span>
                      </div>
                      <div className="mt-0.5 flex justify-between gap-3 text-[10px] text-muted-foreground">
                        <span>
                          {teamById.get(p.team)?.short} · {money(p.price)}
                        </span>
                        <span className="font-semibold text-primary">
                          {num(p.xpHorizon, 1)}
                        </span>
                      </div>
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}

          <Card className="border-caution/40 bg-caution/5">
            <CardContent className="space-y-1.5 pt-4 text-sm text-muted-foreground">
              <p className="font-semibold text-caution">Đọc kỹ trước khi bấm chip</p>
              <p>
                • Chip <strong>không dùng được ở lượt vốn đã có chuyển nhượng miễn phí không
                giới hạn</strong> (lượt {meta.rules.unlimitedTransferMds.join(", ")}) — chính
                game khoá, và cũng không cần.
              </p>
              <p>
                • Không dùng Wildcard và Limitless trong <strong>cùng một lượt</strong>.
              </p>
              <p>
                • Con số ở đây là <strong>chênh lệch điểm kỳ vọng</strong>, chưa tính giá trị
                chiến thuật của việc để dành chip cho lúc đội hình vỡ vì chấn thương — một
                lý do chính đáng để không tiêu sớm.
              </p>
              <p>
                • Lợi ích của Wildcard được so với lộ trình ở trang Kế hoạch. Nếu bạn định
                chuyển nhượng nhiều hơn thế, phần lợi thật sẽ nhỏ hơn.
              </p>
              <p>
                • Càng về sau dự báo càng nhiễu, nên đừng chốt cứng lượt dùng chip từ bây giờ:
                hãy tính lại trước mỗi hạn chốt.
              </p>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function GainCell({
  option,
  maxGain,
  best,
  tone,
}: {
  option: ChipOption;
  maxGain: number;
  best: boolean;
  tone: "primary" | "accent";
}) {
  if (!option.available) {
    return (
      <td className="p-2.5">
        <span className="text-xs text-muted-foreground">{option.reason}</span>
      </td>
    );
  }
  // gộp mấy giá trị sát 0 lại để không hiện "-0,0"
  const gain = Math.abs(option.gain) < 0.05 ? 0 : option.gain;
  const width = Math.max(0, Math.min(100, (gain / maxGain) * 100));
  return (
    <td className="p-2.5">
      <div className="flex items-center gap-2">
        <div className="h-2.5 w-28 rounded bg-muted">
          <div
            className={`h-2.5 rounded ${tone === "accent" ? "bg-accent" : "bg-primary"}`}
            style={{ width: `${width}%` }}
          />
        </div>
        <span className="w-12 text-right text-sm font-semibold tabular-nums">
          {gain >= 0 ? "+" : ""}
          {num(gain, 1)}
        </span>
        {best && (
          <Badge
            className={
              tone === "accent" ? "bg-accent/15 text-accent" : "bg-primary/15 text-primary"
            }
          >
            nên dùng ở đây
          </Badge>
        )}
      </div>
    </td>
  );
}
