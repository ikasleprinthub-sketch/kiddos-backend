import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidEmail, sendAdminFormEmail } from "@/services/email.service";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, phone, subject, message } = body;

    if (!name?.trim()) return NextResponse.json({ message: "Name is required" }, { status: 400 });
    if (!/^[a-zA-Z][a-zA-Z\s.]{1,99}$/.test(name.trim())) return NextResponse.json({ message: "Please enter a valid name using alphabetic characters." }, { status: 400 });
    if (!email?.trim()) return NextResponse.json({ message: "Email is required" }, { status: 400 });
    if (!subject?.trim()) return NextResponse.json({ message: "Subject is required" }, { status: 400 });
    if (!message?.trim()) return NextResponse.json({ message: "Message is required" }, { status: 400 });

    if (!isValidEmail(email.trim())) return NextResponse.json({ message: "Enter a valid email address" }, { status: 400 });
    if (name.length > 200 || subject.length > 300 || message.length > 5000 || (phone && String(phone).length > 30)) {
      return NextResponse.json({ message: "One or more fields are too long" }, { status: 400 });
    }

    const inquiry = await prisma.contactInquiry.create({
      data: {
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        subject: subject.trim(),
        message: message.trim(),
      },
    });

    // Saved already: a mail problem is logged inside and never changes the response
    void sendAdminFormEmail({
      formName: "Contact Form",
      submissionId: inquiry.id,
      submittedAt: inquiry.createdAt,
      replyTo: inquiry.email,
      fields: [
        { label: "Name", value: inquiry.name },
        { label: "Email", value: inquiry.email },
        { label: "Phone", value: inquiry.phone },
        { label: "Subject", value: inquiry.subject },
        { label: "Message", value: inquiry.message },
      ],
    });

    return NextResponse.json({ message: "Inquiry submitted successfully", id: inquiry.id }, { status: 201 });
  } catch (error) {
    console.error("[contact-inquiries POST]", error);
    return NextResponse.json({ message: "Internal server error" }, { status: 500 });
  }
}
