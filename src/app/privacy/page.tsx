import { Card, Page, Text, BlockStack } from "@shopify/polaris";

export default function PrivacyPage() {
  return (
    <Page title="Privacy Policy">
      <Card>
        <BlockStack gap="400">
          <Text as="p">
            MerchPulse provides operational insights for Shopify merchants by analyzing store data through the Shopify Admin API.
          </Text>

          <Text variant="headingMd" as="h2">
            1. Data We Access
          </Text>
          <Text as="p">
            When a merchant installs MerchPulse, the app may access order data, product and inventory data, customer data as permitted by approved Shopify scopes, and store metadata such as timezone. MerchPulse does not access or process payment details.
          </Text>

          <Text variant="headingMd" as="h2">
            2. How We Use Data
          </Text>
          <Text as="p">
            Store data is used solely to generate operational insights, detect inventory and revenue risks, and provide scheduled reports and email digests. Merchant data is not sold, rented, or shared with third parties for marketing purposes.
          </Text>

          <Text variant="headingMd" as="h2">
            3. Data Storage
          </Text>
          <Text as="p">
            Store data required for app functionality is stored securely. Access tokens are encrypted and used only for secure communication with Shopify APIs.
          </Text>

          <Text variant="headingMd" as="h2">
            4. Data Retention
          </Text>
          <Text as="p">
            Data is retained only while the app remains installed. Upon uninstall, associated store data is deleted in accordance with Shopify requirements.
          </Text>

          <Text variant="headingMd" as="h2">
            5. Shopify Compliance Webhooks
          </Text>
          <Text as="p">
            MerchPulse implements Shopify’s required compliance webhooks, including customers/data_request, customers/redact, shop/redact, and app/uninstalled. We process data deletion and redaction requests as required by Shopify’s privacy guidelines.
          </Text>

          <Text variant="headingMd" as="h2">
            6. Contact
          </Text>
          <Text as="p">
            For privacy inquiries, contact support@merchpulse.app
          </Text>
        </BlockStack>
      </Card>
    </Page>
  );
}
