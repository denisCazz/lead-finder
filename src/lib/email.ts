import { Resend } from "resend";

let resend: Resend | null = null;

function getResend() {
  if (!resend) {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) throw new Error("RESEND_API_KEY not configured");
    resend = new Resend(apiKey);
  }
  return resend;
}

/**
 * Build an HTML email that passes basic anti-spam checks:
 * - Proper DOCTYPE and meta charset
 * - Inline CSS only (no <style> blocks that some filters strip)
 * - Plain-text unsubscribe footer
 * - Single-column layout — avoids spam triggers from complex grids
 */
function buildHtmlEmail(subject: string, body: string): string {
  // Convert plain text paragraphs to <p> tags
  const bodyHtml = body
    .split(/\n\n+/)
    .map((para) => `<p style="margin:0 0 16px 0;line-height:1.6;">${para.replace(/\n/g, "<br>")}</p>`)
    .join("\n");

  return `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>${subject}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e4e4e7;">
          <!-- Header -->
          <tr>
            <td style="background-color:#18181b;padding:24px 32px;">
              <span style="color:#ffffff;font-size:20px;font-weight:bold;letter-spacing:-0.5px;">Bitora</span>
              <span style="color:#71717a;font-size:13px;margin-left:8px;">bitora.it</span>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;color:#18181b;font-size:15px;">
              ${bodyHtml}
              <!-- CTA -->
              <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;">
                <tr>
                  <td style="background-color:#18181b;border-radius:6px;">
                    <a href="https://bitora.it" target="_blank" style="display:inline-block;padding:12px 24px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">Scopri Bitora →</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f4f4f5;padding:20px 32px;border-top:1px solid #e4e4e7;">
              <p style="margin:0;font-size:12px;color:#71717a;line-height:1.5;">
                Questa email è stata inviata da <strong>Bitora</strong> — Via della Tecnologia, Italia.<br>
                Se non desideri ricevere ulteriori comunicazioni, rispondi con "CANCELLA" a questa email.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export async function sendEmail(params: {
  to: string;
  subject: string;
  body: string;
  from?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const r = getResend();
    const fromAddr = params.from || process.env.EMAIL_FROM || "noreply@bitora.it";

    const unsubscribeFooter = `\n\n---\nSe non desideri ricevere ulteriori comunicazioni, rispondi con "CANCELLA" a questa email.\nBitora — bitora.it`;

    const { error } = await r.emails.send({
      from: fromAddr,
      to: params.to,
      subject: params.subject,
      html: buildHtmlEmail(params.subject, params.body),
      text: params.body + unsubscribeFooter,
      headers: {
        // Improve deliverability with proper headers
        "X-Entity-Ref-ID": `bitora-${Date.now()}`,
      },
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}

