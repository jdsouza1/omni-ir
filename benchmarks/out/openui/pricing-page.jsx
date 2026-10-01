import { Accordion, AccordionItem, Button, Buttons, Callout, Card, CardHeader, Col, MarkDownRenderer, Stack, Table, TagBlock, TextCallout, TextContent } from "@/components/ui";

export default function Screen() {
  return (
    <Stack direction="column" gap="xl">
      <Stack direction="column" gap="s">
        <TextContent size="large-heavy">Pricing</TextContent>
        <TextContent size="default">Choose the plan that fits your team today. Upgrade, downgrade, or cancel anytime.</TextContent>
        <TagBlock tags={["Monthly billing", "Annual discounts available", "No hidden fees"]} />
      </Stack>
      <Stack direction="row" gap="l" align="stretch" justify="start" wrap={true}>
        <Card variant="card">
          <CardHeader subtitle="For individuals and small projects">Basic</CardHeader>
          <TextContent size="large-heavy">$12 / month</TextContent>
          <TextContent size="default">Core features to get started with reliable essentials.</TextContent>
          <TextContent size="small-heavy">Includes:</TextContent>
          <MarkDownRenderer variant="clear">- 1 workspace
- Up to 3 projects
- 5 GB storage
- Community support
- Basic analytics</MarkDownRenderer>
          <Buttons>
            <Button action="action:select_plan_basic" variant="secondary">Start Basic</Button>
            <Button action="action:trial_basic" variant="tertiary">Try free</Button>
          </Buttons>
        </Card>
        <Card variant="sunk">
          <CardHeader subtitle="For growing teams that need more power">Pro</CardHeader>
          <TextContent size="large-heavy">$29 / month</TextContent>
          <TextContent size="default">Advanced collaboration, automation, and deeper insights.</TextContent>
          <TextContent size="small-heavy">Everything in Basic, plus:</TextContent>
          <MarkDownRenderer variant="clear">- 5 workspaces
- Unlimited projects
- 100 GB storage
- Team roles & permissions
- Automations (1,000 runs/month)
- Integrations (Slack, GitHub, Zapier)
- Priority email support</MarkDownRenderer>
          <Buttons>
            <Button action="action:select_plan_pro" variant="primary">Choose Pro</Button>
            <Button action="action:trial_pro" variant="secondary">Try free</Button>
          </Buttons>
          <Callout title="Most popular" description="Best value for teams that want to scale without switching tools later.">success</Callout>
        </Card>
        <Card variant="card">
          <CardHeader subtitle="For organizations with advanced security and scale">Enterprise</CardHeader>
          <TextContent size="large-heavy">Custom pricing</TextContent>
          <TextContent size="default">Security, compliance, and dedicated support tailored to your needs.</TextContent>
          <TextContent size="small-heavy">Everything in Pro, plus:</TextContent>
          <MarkDownRenderer variant="clear">- Unlimited workspaces
- Unlimited storage (fair use)
- SSO/SAML & SCIM provisioning
- Audit logs & data retention controls
- Dedicated success manager
- 99.9% uptime SLA
- Custom legal & invoicing</MarkDownRenderer>
          <Buttons>
            <Button action="action:contact_sales_enterprise" variant="primary">Contact sales</Button>
            <Button action="action:request_demo_enterprise" variant="secondary">Request demo</Button>
          </Buttons>
          <TextCallout title="Need procurement support?" description="We can provide security docs, vendor onboarding, and custom terms.">neutral</TextCallout>
        </Card>
      </Stack>
      <TextContent size="large-heavy">Feature comparison</TextContent>
      <Table rows={[["Price (monthly)", "$12", "$29", "Custom"], ["Workspaces", "1", "5", "Unlimited"], ["Projects", "Up to 3", "Unlimited", "Unlimited"], ["Storage", "5 GB", "100 GB", "Unlimited (fair use)"], ["Team members", "1", "Up to 25", "Unlimited"], ["Roles & permissions", "—", "Yes", "Advanced (custom roles)"], ["Automations", "—", "1,000 runs/mo", "Unlimited (policy-based)"], ["Integrations", "Limited", "Standard", "Standard + custom"], ["Analytics", "Basic", "Advanced", "Advanced + exports"], ["SSO (SAML)", "—", "—", "Yes"], ["SCIM provisioning", "—", "—", "Yes"], ["Audit logs", "—", "—", "Yes"], ["Support", "Community", "Priority email", "Dedicated + SLA"]]}>
        <Col type="string">Feature</Col>
        <Col type="string">Basic</Col>
        <Col type="string">Pro</Col>
        <Col type="string">Enterprise</Col>
      </Table>
      <Accordion>
        <AccordionItem value="billing" trigger="Can I switch plans later?">
          <TextContent>Yes. You can upgrade or downgrade at any time. Changes take effect immediately, and we prorate when applicable.</TextContent>
        </AccordionItem>
        <AccordionItem value="trial" trigger="Do you offer a free trial?">
          <TextContent>Yes. Basic and Pro include a free trial. Enterprise trials are available upon request via Sales.</TextContent>
        </AccordionItem>
        <AccordionItem value="annual" trigger="Do you offer annual billing?">
          <TextContent>Yes. Annual billing includes a discount. Contact Sales for Enterprise annual terms and invoicing.</TextContent>
        </AccordionItem>
        <AccordionItem value="security" trigger="What about security and compliance?">
          <TextContent>Enterprise includes SSO/SAML, SCIM, audit logs, and data retention controls. We can share security documentation during procurement.</TextContent>
        </AccordionItem>
      </Accordion>
    </Stack>
  );
}
