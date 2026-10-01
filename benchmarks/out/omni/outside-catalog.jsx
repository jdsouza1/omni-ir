import { Badge, Button, Card, Divider, Heading, Skeleton, Stack, Text } from "@/components/ui";

export default function Screen() {
  return (
    <Card>
      <Skeleton lines={6} />
      <Stack direction="row" gap="sm" align="center">
        <Heading level={2}>Video</Heading>
        <Badge tone="neutral">Paused</Badge>
      </Stack>
      <Stack direction="row" gap="sm" align="center">
        <Text tone="strong">0:00</Text>
        <Text tone="muted">/</Text>
        <Text tone="muted">3:42</Text>
      </Stack>
      <Divider />
      <Stack direction="row" gap="sm" align="center">
        <Button variant="secondary">Back 10s</Button>
        <Button variant="primary">Play</Button>
        <Button variant="secondary">Forward 10s</Button>
      </Stack>
    </Card>
  );
}
