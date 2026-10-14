import { NextResponse } from "next/server";
import { getDeliveryFieldConfig } from "@/lib/delivery-fields";

// Public: the storefront reads this to decide which delivery fields are required
export async function GET() {
  try {
    const fields = await getDeliveryFieldConfig();
    return NextResponse.json({ fields }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("[delivery-fields]", (error as Error).message);
    return NextResponse.json({ message: "Failed to fetch delivery field settings" }, { status: 500 });
  }
}
