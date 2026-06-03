import { NextRequest, NextResponse } from "next/server";
import { authorizeAdmin } from "@/lib/auth";

export async function GET(request: NextRequest) {
  // Authorize user as ADMIN
  const admin = authorizeAdmin(request);

  if (!admin) {
    return NextResponse.json(
      { message: "Access denied: Admins only" },
      { status: 403 }
    );
  }

  return NextResponse.json(
    {
      message: "Welcome to the Admin Dashboard",
      admin: {
        id: admin.id,
        role: admin.role,
      },
    },
    { status: 200 }
  );
}
