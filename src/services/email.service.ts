import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER || "yourmail@gmail.com",
    pass: process.env.SMTP_PASS || "app_password",
  },
});

export const sendEmail = async (
  to: string,
  subject: string,
  html: string
) => {
  const isMock =
    !process.env.SMTP_USER ||
    process.env.SMTP_USER === "yourmail@gmail.com" ||
    !process.env.SMTP_PASS ||
    process.env.SMTP_PASS === "app_password";

  if (isMock) {
    console.log("-----------------------------------------");
    console.log(`[Email Service (MOCK)]`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`HTML Body:`);
    console.log(html);
    console.log("-----------------------------------------");
    return;
  }

  try {
    await transporter.sendMail({
      from: `"Kiddos Food" <${process.env.SMTP_USER}>`,
      to,
      subject,
      html,
    });
  } catch (error) {
    console.error("Failed to send email via SMTP, logging instead:", error);
    console.log("-----------------------------------------");
    console.log(`[Email Service (FALLBACK LOG)]`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`HTML Body:`);
    console.log(html);
    console.log("-----------------------------------------");
  }
};
