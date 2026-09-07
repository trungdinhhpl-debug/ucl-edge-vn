"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, Clock, Crown, TrendingUp } from "lucide-react";

import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ErrorBox,
  RiskBadge,
  SectionTitle,
  Spinner,
  Stat,
} from "@/components/ui";
import { POS_SHORT, isSelectable, riskLabel, useDataset, type Player } from "@/lib/data";
import { countdown, fmtVN, money, num, pct } from "@/lib/format";

function useTick(ms = 1000) {
  const [, set] = useState(0);
  useEffect(() => {
    const id = setInterval(() => set((v) => v + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

export default function Dashboard() {
  const { data, error, loading } = useDataset();
  useTick();

  const view = useMemo(() => {
    if (!data) return null;
    const md = data.meta.currentMd;
    const playable = data.players.filter((p) => isSelectable(p) && p.xpNow > 0);

    const topXp = [...playable].sort((a, b) => b.xpNow - a.xpNow).slice(0, 10);
    const captains = [...playable]
      .filter((p) => p.dist)
      .sort((a, b) => b.xpNow - a.xpNow)
      .slice(0, 5);
    const value = [...playable]
      .filter((p) => p.xMins >= 55)
      .sort((a, b) => b.valueNow - a.valueNow)
      .slice(0, 8);
    const differentials = [...playable]
      .filter((p) => p.ownership <= 8 && p.xMins >= 55)
      .sort((a, b) => b.xpNow - a.xpNow)
      .slice(0, 6);
    const alerts = data.players
      .filter((p) => p.ownership >= 5 && (p.status === "I" || p.status === "D" || p.status === "S"))
      .sort((a, b) => b.ownership - a.ownership)
      .slice(0, 8);

    return { md, topXp, captains, value, differentials, alerts };
  }, [data]);

  if (loading) return <Spinner />;
  if (error) return <ErrorBox error={error} />;
  if (!data || !view) return null;

  const { meta, teamById } = data;
  const left = countdown(meta.deadlineUtc);
  const unlimited = meta.rules.unlimitedTransferMds.includes(view.md);
  const opponentOf = (p: Player) => {
    const opp = p.opponent ? teamById.get(p.opponent)?.short : null;
    return opp ? `${p.isHome ? "vs" : "@"} ${opp}` : "—";
  };

  return (
    <div className="space-y-8">
      {/* ------------------------------------------------------------- hạn chót */}
      <Card className="overflow-hidden border-primary/30">
        <div className="flex flex-col gap-4 bg-primary/5 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              Hạn chốt đội hình lượt {view.md} — {fmtVN(meta.deadlineUtc)} (giờ VN)
            </div>
            <div className="mt-1 text-3xl font-bold tabular-nums">
              {left ? `Còn ${left}` : "Đã qua hạn chốt"}
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {unlimited && (
                <Badge className="bg-positive/15 text-positive">
                  Chuyển nhượng không giới hạn
                </Badge>
              )}
              <Badge className="bg-muted text-muted-foreground">Mùa {meta.season}</Badge>
              <Badge className="bg-muted text-muted-foreground">
                Cập nhật {fmtVN(meta.generatedAt)}
              </Badge>
            </div>
          </div>
          <Link
            href="/squad"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Dựng đội hình tối ưu <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <CardContent className="grid grid-cols-2 gap-3 pt-4 sm:grid-cols-4">
          <Stat label="Ngân sách" value={money(meta.rules.budget)} sub="15 cầu thủ" />
          <Stat label="Tối đa mỗi CLB" value={meta.rules.maxPerClub} sub="cầu thủ" />
          <Stat
            label="Cầu thủ trong dữ liệu"
            value={meta.dataQuality.players}
            sub={`${meta.dataQuality.playersWithoutUclHistory} người chưa có số liệu UCL`}
          />
          <Stat
            label="Số trận lượt này"
            value={meta.matchdays.find((m) => m.md === view.md)?.matches.length ?? 0}
            sub="18 CLB đá sân nhà"
          />
        </CardContent>
      </Card>

      {/* ------------------------------------------------------------ top điểm */}
      <section>
        <SectionTitle
          title={`Điểm kỳ vọng cao nhất — lượt ${view.md}`}
          hint="xP đã tính số phút kỳ vọng, đối thủ, sân nhà/khách và toàn bộ hạng mục tính điểm của UCL."
          right={
            <Link href="/players" className="text-sm font-medium text-primary hover:underline">
              Xem toàn bộ cầu thủ →
            </Link>
          }
        />
        <Card>
          <div className="overflow-x-auto scroll-thin">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Cầu thủ</th>
                  <th className="p-3 font-medium">Đối thủ</th>
                  <th className="p-3 text-right font-medium">Giá</th>
                  <th className="p-3 text-right font-medium">xPhút</th>
                  <th className="p-3 text-right font-medium">xP</th>
                  <th className="p-3 text-right font-medium">P(≥10)</th>
                  <th className="p-3 text-right font-medium">Sở hữu</th>
                </tr>
              </thead>
              <tbody>
                {view.topXp.map((p) => {
                  const risk = riskLabel(p);
                  return (
                    <tr key={p.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{p.name}</span>
                          <Badge className="bg-muted text-[10px] text-muted-foreground">
                            {POS_SHORT[p.pos]}
                          </Badge>
                          {!p.hasHistory && (
                            <Badge className="bg-caution/20 text-[10px] text-caution">
                              chưa có số liệu UCL
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {teamById.get(p.team)?.name}
                          {risk && <span className="ml-2 text-caution">· {risk.text}</span>}
                        </div>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground">{opponentOf(p)}</td>
                      <td className="p-3 text-right tabular-nums">{money(p.price)}</td>
                      <td className="p-3 text-right tabular-nums">{p.xMins.toFixed(0)}′</td>
                      <td className="p-3 text-right font-semibold tabular-nums text-primary">
                        {num(p.xpNow, 2)}
                      </td>
                      <td className="p-3 text-right tabular-nums">
                        {p.dist ? pct(p.dist.p_haul) : "—"}
                      </td>
                      <td className="p-3 text-right tabular-nums text-muted-foreground">
                        {p.ownership.toFixed(0)}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ----------------------------------------------------- đội trưởng */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Crown className="h-4 w-4 text-accent" /> Ứng viên đội trưởng
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Điểm đội trưởng = xP × 2. Cột P(≥10) là xác suất bùng nổ — chọn theo trần
              điểm khi cần bắt kịp, theo xP khi đang dẫn.
            </p>
          </CardHeader>
          <CardContent className="space-y-2">
            {view.captains.map((p, i) => (
              <div
                key={p.id}
                className="flex items-center justify-between rounded-md border p-2.5"
              >
                <div className="flex items-center gap-3">
                  <span className="w-5 text-center text-sm font-bold text-muted-foreground">
                    {i + 1}
                  </span>
                  <div>
                    <div className="text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {teamById.get(p.team)?.short} {opponentOf(p)}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-right">
                  <div>
                    <div className="text-[10px] text-muted-foreground">P(≥10)</div>
                    <div className="text-sm tabular-nums">{p.dist ? pct(p.dist.p_haul) : "—"}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-muted-foreground">xP×2</div>
                    <div className="text-base font-bold tabular-nums text-primary">
                      {num(p.xpNow * 2, 1)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            <Link
              href="/captaincy"
              className="mt-1 block text-sm font-medium text-primary hover:underline"
            >
              Bảng đội trưởng đầy đủ →
            </Link>
          </CardContent>
        </Card>

        {/* ---------------------------------------------------- hiệu quả giá */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-positive" /> Đáng tiền nhất
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              xP trên mỗi triệu, chỉ tính cầu thủ có số phút kỳ vọng từ 55′ trở lên.
            </p>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {view.value.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Badge className="bg-muted text-[10px] text-muted-foreground">
                    {POS_SHORT[p.pos]}
                  </Badge>
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {teamById.get(p.team)?.short}
                  </span>
                </div>
                <div className="flex items-center gap-3 tabular-nums">
                  <span className="text-xs text-muted-foreground">{money(p.price)}</span>
                  <span className="text-xs">{num(p.xpNow, 2)} xP</span>
                  <span className="w-12 text-right font-semibold text-positive">
                    {num(p.valueNow, 2)}
                  </span>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* ------------------------------------------------------ khác biệt */}
        <Card>
          <CardHeader>
            <CardTitle>Quân bài khác biệt</CardTitle>
            <p className="text-xs text-muted-foreground">
              Tỷ lệ sở hữu ≤ 8% nhưng xP cao — thứ tạo khoảng cách trong bảng xếp hạng.
            </p>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {view.differentials.map((p) => (
              <div key={p.id} className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <Badge className="bg-muted text-[10px] text-muted-foreground">
                    {POS_SHORT[p.pos]}
                  </Badge>
                  <span className="font-medium">{p.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {teamById.get(p.team)?.short} {opponentOf(p)}
                  </span>
                </div>
                <div className="flex items-center gap-3 tabular-nums">
                  <span className="text-xs text-muted-foreground">{p.ownership.toFixed(0)}%</span>
                  <span className="w-10 text-right font-semibold text-primary">
                    {num(p.xpNow, 2)}
                  </span>
                </div>
              </div>
            ))}
            {view.differentials.length === 0 && (
              <p className="text-sm text-muted-foreground">Chưa có dữ liệu sở hữu.</p>
            )}
          </CardContent>
        </Card>

        {/* ------------------------------------------------------- cảnh báo */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-caution" /> Cảnh báo nhân sự
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              Cầu thủ được sở hữu từ 5% trở lên đang có vấn đề về thể lực hoặc kỷ luật.
            </p>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {view.alerts.map((p) => {
              const risk = riskLabel(p);
              return (
                <div key={p.id} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{p.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {teamById.get(p.team)?.short}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {p.ownership.toFixed(0)}% sở hữu
                    </span>
                    {risk && <RiskBadge text={risk.text} tone={risk.tone} />}
                  </div>
                </div>
              );
            })}
            {view.alerts.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Không có cảnh báo nào ở nhóm được sở hữu nhiều.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* --------------------------------------------------- chất lượng dữ liệu */}
      <Card className="border-caution/40 bg-caution/5">
        <CardContent className="pt-4 text-sm">
          <div className="font-semibold text-caution">Đọc kỹ trước khi tin con số</div>
          <p className="mt-1 text-muted-foreground">{meta.dataQuality.note}</p>
          <p className="mt-2 text-muted-foreground">
            {meta.dataQuality.playersWithoutUclHistory}/{meta.dataQuality.players} cầu thủ
            và {meta.dataQuality.teamsWithoutUclHistory}/36 CLB không có số liệu UCL mùa
            trước, nên xP của họ dựa chủ yếu vào giá do UEFA định.{" "}
            <Link href="/methodology" className="font-medium text-primary hover:underline">
              Xem cách mô hình hoạt động →
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
