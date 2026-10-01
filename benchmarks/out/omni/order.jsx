import { Badge, Button, Card, Divider, Heading, Stack, Text } from "@/components/ui";
import { callTool } from "@/lib/tools";

export default function Screen() {
  return (
    <Card>
      <Stack direction="row" gap="sm" align="center">
        <Heading level={1}>Order #A1B2-7731</Heading>
        <Badge tone="success">Shipped</Badge>
      </Stack>
      <Text>2 items: Linen shirt, Canvas tote</Text>
      <Text tone="muted">Carrier: Parcelwise, tracking 1Z-88-4410</Text>
      <Stack direction="row" gap="sm" align="center">
        <Text tone="muted">Estimated delivery</Text>
        <Text format="date" tone="strong">2026-10-03</Text>
      </Stack>
      <Divider />
      <Stack direction="row" gap="sm">
        <Button variant="secondary" onClick={() => callTool("orders.requestReturn", { orderId: "A1B2-7731" })}>Request a return</Button>
        <Button variant="secondary">Contact support</Button>
      </Stack>
    </Card>
  );
}
