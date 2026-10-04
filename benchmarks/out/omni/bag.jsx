import { useState } from "react";
import { Button, Card, Divider, Heading, Input, List, ListItem, Stack, Text } from "@/components/ui";
import { callTool } from "@/lib/tools";

export default function Screen() {
  const [amount, setAmount] = useState(100);
  const [note, setNote] = useState("");
  return (
    <Card>
      <Heading level={1}>Shopping bag</Heading>
      <List>
        <ListItem detail="Size M · Natural · Qty 1" trailing="$68.00" image="shirt">Linen shirt</ListItem>
        <ListItem detail="Olive · Qty 1" trailing="$32.00" image="tote">Canvas tote</ListItem>
      </List>
      <Divider />
      <Stack direction="row" gap="sm" align="center">
        <Text tone="strong">Total</Text>
        <Text format="currency" currency="USD" tone="strong">{amount}</Text>
      </Stack>
      <Input value={note} onChange={setNote} label="Order note (optional)" placeholder="e.g. gift wrap, please" />
      <Stack direction="row">
        <Button variant="primary" onClick={() => callTool("payments.confirm", { amount, note })}>Pay now</Button>
      </Stack>
    </Card>
  );
}
