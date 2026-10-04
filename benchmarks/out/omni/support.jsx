import { useState } from "react";
import { Button, Card, Divider, Heading, Input, Stack, Text } from "@/components/ui";
import { callTool } from "@/lib/tools";

export default function Screen() {
  const [subject, setSubject] = useState("Item arrived broken");
  const [message, setMessage] = useState("");
  return (
    <Card>
      <Heading level={1}>Report a broken item</Heading>
      <Text tone="muted">Sorry your item arrived damaged. Tell us what happened and we'll make it right.</Text>
      <Input value={subject} onChange={setSubject} label="Subject" />
      <Input value={message} onChange={setMessage} label="What happened?" placeholder="Order number, which item, and a short description of the damage" />
      <Text tone="muted">Keep the item and packaging until we reply. We usually respond within one business day.</Text>
      <Divider />
      <Stack direction="row" gap="sm">
        <Button variant="primary" onClick={() => callTool("support.createTicket", { subject, message })}>Send to support</Button>
        <Button variant="secondary">Cancel</Button>
      </Stack>
    </Card>
  );
}
