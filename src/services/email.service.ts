import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false, // true for port 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
});

export const sendEmail = async (
  to: string,
  subject: string,
  html: string
) => {
  // If credentials are empty, log immediately to avoid unnecessary connection timeouts
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log("-----------------------------------------");
    console.log(`[Email Service (MOCK - SMTP Credentials Missing)]`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`HTML Body:`);
    console.log(html);
    console.log("-----------------------------------------");
    return;
  }

  try {
    await transporter.sendMail({
      from: `"${process.env.SMTP_FROM_NAME || "Kiddos Food"}" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
    console.log(`Email successfully sent to ${to}`);
  } catch (error) {
    console.error("Failed to send email via SMTP, printing OTP to console instead. Error details:", error);
    console.log("-----------------------------------------");
    console.log(`[Email Service (FALLBACK LOG)]`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`HTML Body:`);
    console.log(html);
    console.log("-----------------------------------------");
  }
};

