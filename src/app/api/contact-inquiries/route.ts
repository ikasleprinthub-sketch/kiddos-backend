import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, phone, subject, message } = body;

    if (!name?.trim()) return NextResponse.json({ message: "Name is required" }, { status: 400 });
    if (!email?.trim()) return NextResponse.json({ message: "Email is required" }, { status: 400 });
    if (!subject?.trim()) return NextResponse.json({ message: "Subject is required" }, { status: 400 });
    if (!message?.trim()) return NextResponse.json({ message: "Message is required" }, { status: 400 });

    const inquiry = await prisma.contactInquiry.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        subject: subject.trim(),
        message: message.trim(),
      },
    });

    return NextResponse.json({ message: "Inquiry submitted successfully", id: inquiry.id }, { status: 201 });
  } catch (error) {
    console.error("[contact-inquiries POST]", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
