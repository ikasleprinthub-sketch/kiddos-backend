import nodemailer from "nodemailer";

export interface OrderConfirmationData {
  customerName: string;
  orderNumber: string;
  razorpayPaymentId: string;
  items: { name: string; quantity: number; price: number; total: number }[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  shippingAddress: {
    name: string;
    phone: string;
    addressLine1: string;
    addressLine2?: string;
    city: string;
    state: string;
    pincode: string;
  };
}

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false, // true for port 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || "",
    pass: process.env.SMTP_PASS || "",
  },
});

export function buildOrderConfirmationHtml(data: OrderConfirmationData): string {
  const itemRows = data.items
    .map(
      (item) => `
        <tr>
          <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;">${item.name}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:center;">${item.quantity}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">₹${item.price.toFixed(2)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">₹${item.total.toFixed(2)}</td>
        </tr>`
    )
    .join("");

  const addr = data.shippingAddress;
  const addressLine = [addr.addressLine1, addr.addressLine2, addr.city, addr.state, addr.pincode]
    .filter(Boolean)
    .join(", ");

  const discountRow =
    data.discount > 0
      ? `<tr><td style="padding:4px 0;color:#555;">Discount</td><td style="padding:4px 0;text-align:right;color:#e67e22;">-₹${data.discount.toFixed(2)}</td></tr>`
      : "";

  return `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f6f6f6;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#fff;border-radius:8px;overflow:hidden;max-width:600px;">

        <!-- Header -->
        <tr>
          <td style="background:#f97316;padding:28px 32px;text-align:center;">
            <h1 style="margin:0;color:#fff;font-size:26px;letter-spacing:1px;">KiddoFood</h1>
            <p style="margin:8px 0 0;color:#ffe4cc;font-size:14px;">Order Confirmation</p>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="padding:28px 32px 16px;">
            <h2 style="margin:0 0 8px;color:#222;font-size:20px;">Thank you, ${data.customerName}!</h2>
            <p style="margin:0;color:#555;font-size:15px;">Your payment was successful and your order has been confirmed.</p>
          </td>
        </tr>

        <!-- Order Meta -->
        <tr>
          <td style="padding:0 32px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff8f2;border:1px solid #ffe0cc;border-radius:6px;padding:14px 18px;">
              <tr>
                <td style="font-size:13px;color:#888;">Order Number</td>
                <td style="font-size:13px;color:#888;text-align:right;">Payment ID</td>
              </tr>
              <tr>
                <td style="font-size:16px;font-weight:bold;color:#f97316;">${data.orderNumber}</td>
                <td style="font-size:13px;color:#555;text-align:right;">${data.razorpayPaymentId}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Items Table -->
        <tr>
          <td style="padding:0 32px 20px;">
            <h3 style="margin:0 0 12px;color:#222;font-size:15px;">Order Items</h3>
            <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #f0f0f0;border-radius:6px;overflow:hidden;">
              <thead>
                <tr style="background:#f9f9f9;">
                  <th style="padding:10px 12px;text-align:left;font-size:13px;color:#888;font-weight:600;">Product</th>
                  <th style="padding:10px 12px;text-align:center;font-size:13px;color:#888;font-weight:600;">Qty</th>
                  <th style="padding:10px 12px;text-align:right;font-size:13px;color:#888;font-weight:600;">Price</th>
                  <th style="padding:10px 12px;text-align:right;font-size:13px;color:#888;font-weight:600;">Total</th>
                </tr>
              </thead>
              <tbody>${itemRows}</tbody>
            </table>
          </td>
        </tr>

        <!-- Order Summary -->
        <tr>
          <td style="padding:0 32px 20px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:2px solid #f0f0f0;padding-top:12px;">
              <tr><td style="padding:4px 0;color:#555;">Subtotal</td><td style="padding:4px 0;text-align:right;color:#333;">₹${data.subtotal.toFixed(2)}</td></tr>
              ${discountRow}
              <tr><td style="padding:4px 0;color:#555;">Delivery Fee</td><td style="padding:4px 0;text-align:right;color:#333;">${data.deliveryFee > 0 ? `₹${data.deliveryFee.toFixed(2)}` : "Free"}</td></tr>
              <tr>
                <td style="padding:10px 0 4px;font-weight:bold;color:#222;font-size:16px;border-top:1px solid #eee;">Total Paid</td>
                <td style="padding:10px 0 4px;text-align:right;font-weight:bold;color:#f97316;font-size:16px;border-top:1px solid #eee;">₹${data.total.toFixed(2)}</td>
              </tr>
            </table>
          </td>
        </tr>

        <!-- Shipping Address -->
        <tr>
          <td style="padding:0 32px 28px;">
            <h3 style="margin:0 0 8px;color:#222;font-size:15px;">Delivering To</h3>
            <p style="margin:0;color:#555;font-size:14px;line-height:1.6;">
              <strong>${addr.name}</strong><br>
              ${addressLine}<br>
              ${addr.phone}
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9f9f9;padding:20px 32px;text-align:center;border-top:1px solid #f0f0f0;">
            <p style="margin:0;color:#aaa;font-size:12px;">If you have any questions, reply to this email or contact us.<br>&copy; 2026 KiddoFood. All rights reserved.</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export const sendOrderConfirmationEmail = async (
  to: string,
  data: OrderConfirmationData
): Promise<void> => {
  const html = buildOrderConfirmationHtml(data);
  await sendEmail(to, `Order Confirmed – ${data.orderNumber} | KiddoFood`, html);
};

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

