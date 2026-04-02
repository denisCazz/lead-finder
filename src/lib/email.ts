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

export async function sendEmail(params: {
  to: string;
  subject: string;
  body: string;
  from?: string;
}): Promise<{ success: boolean; error?: string }> {
  try {
    const r = getResend();
    const fromAddr = params.from || process.env.EMAIL_FROM || "noreply@bitora.it";

    const unsubscribeFooter = `\n\n---\nSe non desideri ricevere ulteriori comunicazioni, rispondi con "CANCELLA" a questa email.`;

    const { error } = await r.emails.send({
      from: fromAddr,
      to: params.to,
      subject: params.subject,
      text: params.body + unsubscribeFooter,
    });

    if (error) {
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: (err as Error).message };
  }
}
