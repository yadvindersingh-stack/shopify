import { Card, Page, Text, BlockStack } from "@shopify/polaris";

export default function HelpPage() {
  return (
    <Page title="Help & Support">
      <Card>
        <BlockStack gap="400">
          <Text variant="headingMd" as="h2">
            How does MerchPulse work?
          </Text>
          <Text as="p">
            MerchPulse analyzes order trends, inventory levels, and product activity to identify operational risks inside your Shopify store.
          </Text>

          <Text variant="headingMd" as="h2">
            How often does the app scan my store?
          </Text>
          <Text as="p">
            Scans run automatically on a scheduled basis. You can also trigger manual scans from within the app.
          </Text>

          <Text variant="headingMd" as="h2">
            Will this affect my storefront?
          </Text>
          <Text as="p">
            No. MerchPulse only reads data through approved Shopify API scopes. It does not modify storefront behavior.
          </Text>

          <Text variant="headingMd" as="h2">
            What happens if I uninstall?
          </Text>
          <Text as="p">
            When the app is uninstalled, all associated store data is deleted automatically.
          </Text>

          <Text variant="headingMd" as="h2">
            Support
          </Text>
          <Text as="p">
            For support inquiries, contact support@ustaavenio.resend.app
          </Text>
        </BlockStack>
      </Card>
    </Page>
  );
}
