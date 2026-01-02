import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY!);

export async function sendTestEmail(email: string) {
  await resend.emails.send({
    to: email,
    from: 'insights@yourapp.com',
    subject: 'Test Email from Actionable Analytics',
    html: '<p>This is a test email from your Shopify app.</p>',
  });
}

export async function sendInsightsEmail(email: string, insights: any[]) {
  const html = `<h2>Your Daily Insights</h2>` +
    insights.map(i => `<div><b>${i.title}</b><br>${i.description}<br><i>Suggested: ${i.suggested_action}</i></div>`).join('<hr>');
  await resend.emails.send({
    to: email,
    from: 'insights@yourapp.com',
    subject: 'Your Daily Insights',
    html,
  });
}
