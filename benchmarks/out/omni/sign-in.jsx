import { useState } from "react";
import { Button, Card, Heading, Input, Stack, Text } from "@/components/ui";
import { callTool } from "@/lib/tools";

export default function Screen() {
  const [email, setEmail] = useState("");
  return (
    <Card>
      <Heading level={1}>Sign in</Heading>
      <Text tone="muted">Enter your email and we'll send you a one-time sign-in link. No password needed.</Text>
      <Input value={email} onChange={setEmail} label="Email address" placeholder="you@example.com" />
      <Stack direction="row">
        <Button variant="primary" onClick={() => callTool("auth.sendMagicLink", { email })}>Email me a link</Button>
      </Stack>
      <Text tone="muted">The link expires after 15 minutes. Check your spam folder if it doesn't arrive.</Text>
    </Card>
  );
}
