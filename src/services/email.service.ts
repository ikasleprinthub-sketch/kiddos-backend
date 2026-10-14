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

// Customer-supplied text goes into the HTML, so escape it
const esc = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

export const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465, // true for port 465, false for other ports
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
          <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;">${esc(item.name)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:center;">${item.quantity}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">₹${item.price.toFixed(2)}</td>
          <td style="padding:10px 12px;border-bottom:1px solid #f0f0f0;text-align:right;">₹${item.total.toFixed(2)}</td>
        </tr>`
    )
    .join("");

  const addr = data.shippingAddress;
  const addressLine = [addr.addressLine1, addr.addressLine2, addr.city, addr.state, addr.pincode]
    .filter(Boolean)
    .map(esc)
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
            <h1 style="margin:0;color:#fff;font-size:26px;letter-spacing:1px;">Kiddos Foods</h1>
            <p style="margin:8px 0 0;color:#ffe4cc;font-size:14px;">Order Confirmation</p>
          </td>
        </tr>

        <!-- Greeting -->
        <tr>
          <td style="padding:28px 32px 16px;">
            <h2 style="margin:0 0 8px;color:#222;font-size:20px;">Thank you, ${esc(data.customerName)}!</h2>
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
                <td style="font-size:16px;font-weight:bold;color:#f97316;">${esc(data.orderNumber)}</td>
                <td style="font-size:13px;color:#555;text-align:right;">${esc(data.razorpayPaymentId)}</td>
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
              <strong>${esc(addr.name)}</strong><br>
              ${addressLine}<br>
              ${esc(addr.phone)}
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9f9f9;padding:20px 32px;text-align:center;border-top:1px solid #f0f0f0;">
            <p style="margin:0;color:#aaa;font-size:12px;">If you have any questions, reply to this email or contact us.<br>&copy; ${new Date().getFullYear()} Kiddos Foods. All rights reserved.</p>
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
  await sendEmail(to, `Order Confirmed – ${data.orderNumber} | Kiddos Foods`, html);
};

export const sendEmail = async (
  to: string,
  subject: string,
  html: string,
  options: { replyTo?: string } = {}
): Promise<boolean> => {
  // If credentials are empty, log immediately to avoid unnecessary connection timeouts
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log("-----------------------------------------");
    console.log(`[Email Service (MOCK - SMTP Credentials Missing)]`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`HTML Body:`);
    console.log(html);
    console.log("-----------------------------------------");
    return false;
  }

  try {
    const fromName = process.env.SMTP_FROM_NAME || "Kiddos Foods";
    const fromAddress = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;
    await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      replyTo: options.replyTo || fromAddress,
      to,
      subject,
      html,
    });
    console.log(`Email successfully sent to ${to}`);
    return true;
  } catch (error) {
    // Log only the reason, never the full error object (it can carry connection/auth details)
    const err = error as { code?: string; responseCode?: number; message?: string };
    console.error(
      `Failed to send email via SMTP (code=${err.code ?? "-"}, response=${err.responseCode ?? "-"}): ${err.message ?? "unknown error"}`
    );
    console.log("-----------------------------------------");
    console.log(`[Email Service (FALLBACK LOG)]`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`HTML Body:`);
    console.log(html);
    console.log("-----------------------------------------");
    return false;
  }
};

// ---------------------------------------------------------------------------
// Admin "new order" notification
// ---------------------------------------------------------------------------

export interface AdminNewOrderData {
  orderId: string;
  orderNumber: string;
  createdAt: Date;
  status: string;
  paymentStatus: string;
  paymentMethod: string | null;
  razorpayPaymentId?: string;
  customer: { name: string; email: string; phone?: string | null };
  items: { name: string; quantity: number; price: number; total: number }[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  notes?: string | null;
  shippingAddress: OrderConfirmationData["shippingAddress"];
}

export function buildAdminNewOrderHtml(d: AdminNewOrderData): string {
  const money = (n: number) => `₹${n.toFixed(2)}`;
  const a = d.shippingAddress;
  const address = [a.addressLine1, a.addressLine2, a.city, a.state, a.pincode].filter(Boolean).map(esc).join(", ");
  const rows = d.items
    .map(
      (i) => `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;">${esc(i.name)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:center;">${i.quantity}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;">${money(i.price)}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #eee;text-align:right;">${money(i.total)}</td>
      </tr>`
    )
    .join("");
  const line = (label: string, value: string) =>
    `<tr><td style="padding:4px 12px 4px 0;color:#777;white-space:nowrap;">${label}</td><td style="padding:4px 0;color:#222;">${value}</td></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:24px;background:#f6f6f6;font-family:Arial,sans-serif;">
  <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;">
    <div style="background:#1e4620;padding:20px 28px;color:#fff;">
      <h2 style="margin:0;font-size:20px;">New order received</h2>
      <p style="margin:6px 0 0;font-size:14px;color:#cfe6cf;">Order ${esc(d.orderNumber)} &middot; ${money(d.total)}</p>
    </div>
    <div style="padding:22px 28px;font-size:14px;">
      <table cellpadding="0" cellspacing="0">
        ${line("Order ID", esc(d.orderNumber) + ` <span style="color:#aaa;">(${esc(d.orderId)})</span>`)}
        ${line("Placed at", esc(d.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })) + " IST")}
        ${line("Order status", esc(d.status))}
        ${line("Payment", esc(d.paymentMethod ?? "-") + " &middot; " + esc(d.paymentStatus))}
        ${d.razorpayPaymentId ? line("Payment ID", esc(d.razorpayPaymentId)) : ""}
      </table>

      <h3 style="margin:22px 0 8px;font-size:15px;">Customer</h3>
      <table cellpadding="0" cellspacing="0">
        ${line("Account", `${esc(d.customer.name)} &lt;${esc(d.customer.email)}&gt;${d.customer.phone ? " &middot; " + esc(d.customer.phone) : ""}`)}
        ${line("Ship to", `<strong>${esc(a.name)}</strong>, ${esc(a.phone)}`)}
        ${line("Address", address)}
        ${d.notes ? line("Notes", esc(d.notes)) : ""}
      </table>

      <h3 style="margin:22px 0 8px;font-size:15px;">Items</h3>
      <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #eee;">
        <tr style="background:#f9f9f9;color:#777;font-size:12px;">
          <th style="padding:8px 10px;text-align:left;">Product</th><th style="padding:8px 10px;">Qty</th>
          <th style="padding:8px 10px;text-align:right;">Price</th><th style="padding:8px 10px;text-align:right;">Total</th>
        </tr>${rows}
      </table>

      <table cellpadding="0" cellspacing="0" style="margin:14px 0 0 auto;">
        ${line("Subtotal", money(d.subtotal))}
        ${d.discount > 0 ? line("Discount", "-" + money(d.discount)) : ""}
        ${line("Delivery", d.deliveryFee > 0 ? money(d.deliveryFee) : "Free")}
        <tr><td style="padding:8px 12px 0 0;font-weight:bold;">Total</td><td style="padding:8px 0 0;font-weight:bold;color:#1e4620;font-size:16px;">${money(d.total)}</td></tr>
      </table>
    </div>
  </div>
</body></html>`;
}

// Orders already notified in this server process (guards against double triggers / client retries)
const notifiedOrders = new Set<string>();

/**
 * Emails the admin about a new order. Never throws, so it can never break checkout.
 * Recipient(s): ADMIN_NOTIFICATION_EMAIL (comma separated). Skipped if not configured.
 */
export const sendAdminNewOrderEmail = async (
  data: AdminNewOrderData,
  dedupeKey: string = data.orderId
): Promise<void> => {
  try {
    const to = getAdminRecipients();
    if (!to) {
      console.warn("[admin order email] ADMIN_NOTIFICATION_EMAIL is not set; skipping notification");
      return;
    }
    if (notifiedOrders.has(dedupeKey)) return;
    notifiedOrders.add(dedupeKey);

    const sent = await sendEmail(
      to,
      `New Order ${data.orderNumber} – ₹${data.total.toFixed(2)} | Kiddos Foods`,
      buildAdminNewOrderHtml(data)
    );
    if (!sent) console.error(`[admin order email] notification for ${data.orderNumber} was not delivered`);
  } catch (err) {
    console.error("[admin order email] failed:", err);
  }
};


// ---------------------------------------------------------------------------
// Admin notification for website form submissions (contact, franchise, ...)
// ---------------------------------------------------------------------------

export const getAdminRecipients = (): string =>
  (process.env.ADMIN_NOTIFICATION_EMAIL || "")
    .split(",")
    .map((e) => e.trim())
    .filter(Boolean)
    .join(",");

/** Strips line breaks and control characters so user text can never inject mail headers. */
export const cleanHeaderText = (v: unknown, max = 160): string =>
  String(v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").trim().slice(0, max);

export const isValidEmail = (v: unknown): v is string =>
  typeof v === "string" && v.length <= 254 && /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/.test(v);

export interface AdminFormField {
  label: string;
  value: string | null | undefined;
}

export interface AdminFormSubmission {
  /** Human readable form name, e.g. "Contact Form" */
  formName: string;
  /** Id of the saved submission (also used to prevent duplicate emails) */
  submissionId: string;
  fields: AdminFormField[];
  submittedAt?: Date;
  /** Submitter's email, set as Reply-To so the admin can answer directly */
  replyTo?: string;
}

export function buildAdminFormHtml(d: AdminFormSubmission): string {
  const when = (d.submittedAt ?? new Date()).toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
  const rows = d.fields
    .map(
      (f) => `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#777;font-size:13px;width:35%;vertical-align:top;">${esc(f.label)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #eee;color:#222;font-size:14px;vertical-align:top;word-break:break-word;white-space:pre-wrap;">${
          f.value ? esc(f.value) : '<span style="color:#aaa;">&mdash;</span>'
        }</td>
      </tr>`
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:16px;background:#f6f6f6;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#fff;border-radius:8px;overflow:hidden;">
      <tr><td style="background:#1e4620;padding:22px 24px;color:#fff;">
        <div style="font-size:13px;letter-spacing:1px;color:#cfe6cf;">KIDDOS FOODS</div>
        <h2 style="margin:6px 0 0;font-size:20px;">New ${esc(d.formName)} submission</h2>
        <p style="margin:6px 0 0;font-size:13px;color:#cfe6cf;">Received ${esc(when)} IST</p>
      </td></tr>
      <tr><td style="padding:8px 12px 4px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
      </td></tr>
      <tr><td style="padding:14px 24px 20px;font-size:12px;color:#999;">
        Reference: ${esc(d.submissionId)}<br>This is an automated notification from the Kiddos Foods website.
      </td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

// Submissions already notified in this server process (guards against double triggers)
const notifiedSubmissions = new Set<string>();

/**
 * Emails the admin the full details of a form submission. Never throws, so a mail problem
 * can never fail (or duplicate) the submission itself. Call it only after the submission is saved.
 */
export const sendAdminFormEmail = async (d: AdminFormSubmission): Promise<void> => {
  try {
    const to = getAdminRecipients();
    if (!to) {
      console.warn(`[admin form email] ADMIN_NOTIFICATION_EMAIL is not set; skipping ${d.formName} notification`);
      return;
    }
    const key = `${d.formName}:${d.submissionId}`;
    if (notifiedSubmissions.has(key)) return;
    notifiedSubmissions.add(key);

    const who = d.fields.find((f) => /^name$/i.test(f.label))?.value;
    const subject = cleanHeaderText(`New ${d.formName} Submission${who ? ` – ${who}` : ""} | Kiddos Foods`);
    const sent = await sendEmail(to, subject, buildAdminFormHtml(d), {
      replyTo: isValidEmail(d.replyTo) ? d.replyTo : undefined,
    });
    if (!sent) console.error(`[admin form email] ${d.formName} ${d.submissionId} was not delivered`);
  } catch (err) {
    console.error(`[admin form email] ${d.formName} failed:`, (err as Error).message);
  }
};
