import { useState } from "react";
import { Button, Card, Divider, Input, Message, Stack, Text } from "@/components/ui";
import { callTool } from "@/lib/tools";

export default function Screen() {
  const [question, setQuestion] = useState("");
  return (
    <Card title="Trip assistant">
      <Text tone="muted">Ask anything about your stay or the area.</Text>
      <Stack direction="column" gap="sm">
        <Message from="user">Is there anywhere to rent kayaks near the lakeside cabin?</Message>
        <Message from="assistant">Yes. The cabin has a private dock, and the marina about 10 minutes away rents kayaks and canoes by the hour or day. Mornings are usually calmest on the water, so book an early slot if you can.</Message>
      </Stack>
      <Divider />
      <Input value={question} onChange={setQuestion} label="Ask another question" placeholder="e.g. What time is check-in?" />
      <Stack direction="row">
        <Button variant="primary" onClick={() => callTool("assistant.ask", { question })}>Send</Button>
      </Stack>
    </Card>
  );
}
