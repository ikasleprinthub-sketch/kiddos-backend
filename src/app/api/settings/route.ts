import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const group = searchParams.get("group");

    const settings = await prisma.setting.findMany({
      where: group ? { group } : undefined,
    });

    const settingsMap: Record<string, string> = {};
    for (const s of settings) {
      settingsMap[s.key] = s.value;
    }

    return NextResponse.json(settingsMap);
  } catch (error: any) {
    console.error("Error fetching settings:", error);
    return NextResponse.json(
      { message: error.message || "Failed to fetch settings" },
      { status: 500 }
    );
  }
}
