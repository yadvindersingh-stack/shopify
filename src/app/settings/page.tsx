"use client";
import { useEffect, useState } from "react";
import {
  BlockStack,
  Button,
  Card,
  Checkbox,
  InlineStack,
  Layout,
  Page,
  Select,
  Text,
  TextField,
  Toast,
} from "@shopify/polaris";
import { buildPathWithHost } from "@/lib/host";
import { useSearchParams } from "next/navigation";

const timezones = [
  { label: "Store timezone (default)", value: "store" },
  { label: "UTC", value: "UTC" },
  { label: "Eastern Time (ET)", value: "America/New_York" },
  { label: "Pacific Time (PT)", value: "America/Los_Angeles" },
];

export default function SettingsPage() {
  const [email, setEmail] = useState("");
  const [daily, setDaily] = useState(true);
  const [weekly, setWeekly] = useState(true);
  const [timezone, setTimezone] = useState("store");
  const [loading, setLoading] = useState(false);
  const [toast, setToast] = useState<{ content: string } | null>(null);
  const searchParams = useSearchParams();
  const hostParam = searchParams.get("host") || "";

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/setup", { method: "GET" });
        if (!res.ok) return;
        const data = await res.json();
        if (data?.email) setEmail(data.email);
        if (typeof data?.daily_enabled === "boolean") setDaily(data.daily_enabled);
        if (typeof data?.weekly_enabled === "boolean") setWeekly(data.weekly_enabled);
      } catch (err) {
        console.error(err);
      }
    })();
  }, []);

  const handleSave = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, daily_enabled: daily, weekly_enabled: weekly }),
      });
      if (!res.ok) throw new Error("Failed to save settings");
      setToast({ content: "Settings saved" });
    } catch (err) {
      console.error(err);
      setToast({ content: "Unable to save settings" });
    } finally {
      setLoading(false);
    }
  };

  const handleTestEmail = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/email/test", { method: "POST" });
      if (!res.ok) throw new Error("Failed to send test email");
      setToast({ content: "Test email sent" });
    } catch (err) {
      console.error(err);
      setToast({ content: "Unable to send test email" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Page title="Settings">
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="300">
                <TextField
                  label="Email"
                  type="email"
                  value={email}
                  onChange={setEmail}
                  requiredIndicator
                  autoComplete="email"
                  helpText="We will send daily and weekly insights here."
                />
                <BlockStack gap="200">
                  <Checkbox label="Daily insights" checked={daily} onChange={(value) => setDaily(Boolean(value))} />
                  <Checkbox label="Weekly summary" checked={weekly} onChange={(value) => setWeekly(Boolean(value))} />
                </BlockStack>
                <Select label="Timezone" options={timezones} value={timezone} onChange={setTimezone} />

                <InlineStack gap="200">
                  <Button variant="primary" onClick={handleSave} loading={loading} disabled={!email.trim()}>
                    Save settings
                  </Button>
                  <Button onClick={handleTestEmail} loading={loading}>
                    Send test email
                  </Button>
                </InlineStack>
              </BlockStack>
            </Card>
          </Layout.Section>
      </Layout>
      {toast && <Toast content={toast.content} onDismiss={() => setToast(null)} />}
    </Page>
  );
}
