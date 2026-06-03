import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const group = searchParams.get("group") || "";

  const where = group ? { group } : {};
  const settings = await prisma.setting.findMany({ where, orderBy: [{ group: "asc" }, { key: "asc" }] });

  // Group by key for easy access
  const grouped: Record<string, Record<string, string>> = {};
  for (const s of settings) {
    if (!grouped[s.group]) grouped[s.group] = {};
    grouped[s.group][s.key] = s.value;
  }

  return NextResponse.json({ settings, grouped });
}

export async function POST(request: NextRequest) {
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  const body = await request.json();
  const { key, value, group = "general" } = body;

  if (!key?.trim()) return NextResponse.json({ message: "Setting key is required" }, { status: 400 });
  if (value === undefined) return NextResponse.json({ message: "Setting value is required" }, { status: 400 });

  const setting = await prisma.setting.upsert({
    where: { key },
    update: { value: String(value), group },
    create: { key, value: String(value), group },
  });

  return NextResponse.json({ setting }, { status: 201 });
}

export async function PUT(request: NextRequest) {
  const admin = authorizeAdmin(request);
  if (!admin) return NextResponse.json({ message: "Access denied: Admins only" }, { status: 403 });

  // Bulk update: { settings: [{ key, value, group }] }
  const body = await request.json();
  const { settings } = body;

  if (!Array.isArray(settings)) {
    return NextResponse.json({ message: "settings must be an array" }, { status: 400 });
  }

  const upserted = await Promise.all(
    settings.map(({ key, value, group = "general" }: { key: string; value: string; group?: string }) =>
      prisma.setting.upsert({
        where: { key },
        update: { value: String(value), group },
        create: { key, value: String(value), group },
      })
    )
  );

  return NextResponse.json({ settings: upserted });
}
