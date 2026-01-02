"use client";
import { useState, type FormEvent } from "react";
import { Card, Text, BlockStack, InlineStack, Button, TextField } from "@shopify/polaris";

export default function SettingsPage() {
  const [email, setEmail] = useState("");
  const [daily, setDaily] = useState(true);
  const [weekly, setWeekly] = useState(true);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

    async function handleSave(event: FormEvent<HTMLFormElement>): Promise<void> {
        event.preventDefault();
        setLoading(true);
        setMessage("");

        try {
            const response = await fetch("/api/settings", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, daily, weekly }),
            });

            if (!response.ok) throw new Error("Failed to save settings");
            setMessage("Settings saved successfully.");
        } catch (error) {
            console.error(error);
            setMessage("Unable to save settings. Please try again.");
        } finally {
            setLoading(false);
        }
    }

    async function handleTestEmail(): Promise<void> {
        setLoading(true);
        setMessage("");

        try {
            const response = await fetch("/api/settings/test-email", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email }),
            });

            if (!response.ok) throw new Error("Failed to send test email");
            setMessage("Test email sent successfully.");
        } catch (error) {
            console.error(error);
            setMessage("Unable to send test email. Please try again.");
        } finally {
            setLoading(false);
        }
    }

  return (
    <Card>
      <BlockStack gap="400">
        <Text variant="headingLg" as="h1">Settings</Text>
        <form onSubmit={handleSave}>
          <BlockStack gap="300">
            <TextField
              label="Email"
              type="email"
              value={email}
              onChange={setEmail}
              requiredIndicator
              autoComplete="email"
            />
            <InlineStack gap="400" wrap={false} align="start">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={daily} onChange={e => setDaily(e.target.checked)} />
                <span>Daily emails</span>
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={weekly} onChange={e => setWeekly(e.target.checked)} />
                <span>Weekly summary</span>
              </label>
            </InlineStack>
            <InlineStack gap="200">
              <Button variant="primary" submit loading={loading}>
                {loading ? "Saving..." : "Save settings"}
              </Button>
              <Button onClick={handleTestEmail} loading={loading}>
                Send test email
              </Button>
            </InlineStack>
            {message && (
              <Text as="p" tone="success">
                {message}
              </Text>
            )}
          </BlockStack>
        </form>
      </BlockStack>
    </Card>
  );
}
