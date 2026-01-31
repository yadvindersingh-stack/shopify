import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function sendDailyDigestEmail(args: {
  to: string;
  subject: string;
  body: string;
}) {
  return resend.emails.send({
    from: "MerchPulse <alerts@merchpulse.app>",
    to: args.to,
    subject: args.subject,
    text: args.body,
  });
}
