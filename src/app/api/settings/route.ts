import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Groups the storefront needs. Anything else (e.g. "notifications": internal alert emails and
// thresholds) is only available to admins through /api/admin/settings.
const PUBLIC_GROUPS = ["general", "franchise", "shipping", "delivery"];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const group = searchParams.get("group");

    if (group && !PUBLIC_GROUPS.includes(group)) {
      return NextResponse.json({});
    }

    const settings = await prisma.setting.findMany({
      where: { group: group ? group : { in: PUBLIC_GROUPS } },
    });

    const settingsMap: Record<string, string> = {};
    for (const s of settings) {
      settingsMap[s.key] = s.value;
    }

    return NextResponse.json(settingsMap);
  } catch (error) {
    console.error("Error fetching settings:", error);
    return NextResponse.json({ message: "Failed to fetch settings" }, { status: 500 });
  }
}
