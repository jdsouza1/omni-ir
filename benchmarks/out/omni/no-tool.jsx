import { useState } from "react";
import { Badge, Button, Card, Heading, Input, Stack, Text } from "@/components/ui";
import { callTool } from "@/lib/tools";

export default function Screen() {
  const [displayName, setDisplayName] = useState("");
  const [bio, setBio] = useState("");
  return (
    <Card>
      <Heading level={1}>Settings</Heading>
      <Card title="Profile">
        <Input value={displayName} onChange={setDisplayName} label="Display name" placeholder="Your name" />
        <Input value={bio} onChange={setBio} label="Bio" placeholder="A short line about you (160 characters max)" />
        <Stack direction="row">
          <Button variant="primary" onClick={() => callTool("profile.update", { displayName, bio })}>Save changes</Button>
        </Stack>
      </Card>
      <Card title="Danger zone">
        <Stack direction="row" gap="sm" align="center">
          <Heading level={3}>Delete account</Heading>
          <Badge tone="danger">Permanent</Badge>
        </Stack>
        <Text tone="strong">Deleting your account permanently removes your profile, orders and bookings. This can't be undone.</Text>
        <Text tone="muted">Your request goes to our support team, who will confirm by email before the account is deleted.</Text>
        <Stack direction="row">
          <Button variant="danger" onClick={() => callTool("support.createTicket", { subject: "Account deletion request", message: "Please permanently delete my account and all associated data." })}>Request account deletion</Button>
        </Stack>
      </Card>
    </Card>
  );
}
