"use client";
import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, Text, BlockStack, InlineStack, Button, TextField } from "@shopify/polaris";

export default function SetupPage() {
  const [email, setEmail] = useState("");
  const [daily, setDaily] = useState(true);
  const [weekly, setWeekly] = useState(true);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    await fetch("/api/setup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, daily_enabled: daily, weekly_enabled: weekly }),
    });
    // Run first scan
    await fetch("/api/insights/run", { method: "POST" });
    router.push("/insights");
  }

  return (
    <Card>
      <BlockStack gap="400">
        <Text variant="headingLg" as="h1">Setup</Text>
        <form onSubmit={handleSubmit}>
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
            <Button variant="primary" submit loading={loading}>
              {loading ? "Running scan..." : "Run my first insight scan"}
            </Button>
          </BlockStack>
        </form>
      </BlockStack>
    </Card>
  );
}
