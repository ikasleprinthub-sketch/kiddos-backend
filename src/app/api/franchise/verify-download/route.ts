import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendAdminFormEmail } from "@/services/email.service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, otp } = body;

    // 1. Basic validation
    if (!email || !otp) {
      return NextResponse.json(
        { message: "Email and OTP code are required" },
        { status: 400 }
      );
    }

    const normalizedEmail = email.toLowerCase();

    // 2. Query OTP record
    const otpRecord = await prisma.oTP.findFirst({
      where: {
        email: normalizedEmail,
        otp,
        type: "DOWNLOAD_VERIFICATION",
      },
    });

    if (!otpRecord) {
      return NextResponse.json(
        { message: "Invalid OTP code" },
        { status: 400 }
      );
    }

    // 3. Expiry validation
    if (new Date() > otpRecord.expiresAt) {
      await prisma.oTP.delete({ where: { id: otpRecord.id } });
      return NextResponse.json(
        { message: "OTP has expired. Please request a new one." },
        { status: 400 }
      );
    }

    const tempData = otpRecord.tempData as any;
    if (!tempData || !tempData.name || !tempData.mobile || !tempData.resource) {
      return NextResponse.json(
        { message: "Invalid verification session. Please request a new OTP." },
        { status: 400 }
      );
    }

    // 4. Create Franchise Download lead
    const [lead] = await prisma.$transaction([
      prisma.franchiseDownload.create({
        data: {
          name: tempData.name,
          email: normalizedEmail,
          mobile: tempData.mobile,
          resource: tempData.resource,
        },
      }),
      prisma.oTP.delete({ where: { id: otpRecord.id } }),
    ]);

    // The OTP row is deleted in the transaction, so a lead can only be notified once
    void sendAdminFormEmail({
      formName: "Franchise Download Request",
      submissionId: lead.id,
      submittedAt: lead.createdAt,
      replyTo: lead.email,
      fields: [
        { label: "Name", value: lead.name },
        { label: "Email", value: lead.email },
        { label: "Mobile", value: lead.mobile },
        { label: "Resource", value: lead.resource === "BROCHURE" ? "Franchise Brochure" : "Franchise Application Form" },
        { label: "Email Verified", value: "Yes (OTP)" },
      ],
    });

    // 5. Determine direct download link based on resource
    const downloadUrl =
      tempData.resource === "BROCHURE"
        ? "/Brochures/explorefranchise.pdf"
        : "/Franchiseform/franchise-form.pdf";

    return NextResponse.json(
      {
        success: true,
        message: "Verification successful! Your download will start now.",
        downloadUrl,
      },
      { status: 200 }
    );
  } catch (error: any) {
    console.error("Verify download error:", error);
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
