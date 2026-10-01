import { useState } from "react";
import { Button, Card, Divider, Heading, Input, Stack, Text } from "@/components/ui";
import { callTool } from "@/lib/tools";

export default function Screen() {
  const [amount, setAmount] = useState(100);
  const [note, setNote] = useState("");
  return (
    <Card>
      <Heading level={1}>Payment</Heading>
      <Text tone="muted">Shopping bag: Linen shirt, Canvas tote</Text>
      <Stack direction="row" gap="sm" align="center">
        <Text tone="strong">Total</Text>
        <Text format="currency" currency="USD" tone="strong">{amount}</Text>
      </Stack>
      <Input value={note} onChange={setNote} label="Note (optional)" placeholder="e.g. gift wrap, please" />
      <Divider />
      <Stack direction="row" gap="sm">
        <Button variant="danger" onClick={() => callTool("payments.confirm", { amount, note })}>Pay now</Button>
        <Button variant="secondary">Cancel</Button>
      </Stack>
    </Card>
  );
}
