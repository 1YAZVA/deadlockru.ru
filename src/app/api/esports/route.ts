import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const [tournaments, teams, matches] = await Promise.all([
    db.tournament.findMany({ orderBy: { sortOrder: "asc" } }),
    db.esportsTeam.findMany({ orderBy: { name: "asc" } }),
    db.esportsMatch.findMany({ orderBy: { scheduledAt: "asc" } }),
  ]);
  return NextResponse.json({ tournaments, teams, matches });
}

// Административное добавление (например, из webhook или вручную):
// POST { type: 'tournament'|'team'|'match', data: {...} }
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { type?: string; data?: Record<string, unknown> };
    const d = body.data ?? {};
    if (body.type === "tournament") {
      const created = await db.tournament.create({
        data: {
          name: String(d.name ?? "Турнир"),
          organizer: String(d.organizer ?? ""),
          region: String(d.region ?? ""),
          status: String(d.status ?? "upcoming"),
          format: String(d.format ?? ""),
          prizePool: String(d.prizePool ?? ""),
          startDate: d.startDate ? new Date(String(d.startDate)) : null,
          endDate: d.endDate ? new Date(String(d.endDate)) : null,
          teamsCount: Number(d.teamsCount ?? 0) || 0,
          description: String(d.description ?? ""),
          source: String(d.source ?? ""),
          sortOrder: Number(d.sortOrder ?? 99) || 99,
        },
      });
      return NextResponse.json({ ok: true, id: created.id });
    }
    if (body.type === "team") {
      const created = await db.esportsTeam.create({
        data: {
          name: String(d.name ?? "Команда"),
          tag: String(d.tag ?? ""),
          region: String(d.region ?? ""),
          rosterJson: JSON.stringify(d.roster ?? []),
          description: String(d.description ?? ""),
        },
      });
      return NextResponse.json({ ok: true, id: created.id });
    }
    if (body.type === "match") {
      const created = await db.esportsMatch.create({
        data: {
          tournamentName: String(d.tournamentName ?? ""),
          stage: String(d.stage ?? ""),
          teamA: String(d.teamA ?? "TBD"),
          teamB: String(d.teamB ?? "TBD"),
          status: String(d.status ?? "upcoming"),
          format: String(d.format ?? "Bo3"),
          scheduledAt: d.scheduledAt ? new Date(String(d.scheduledAt)) : null,
          vodUrl: String(d.vodUrl ?? ""),
        },
      });
      return NextResponse.json({ ok: true, id: created.id });
    }
    return NextResponse.json({ ok: false, error: "unknown type" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 400 });
  }
}
