import { useState } from "react";
import { Button, Card, DateInput, Divider, Heading, Image, Rating, Stack, Text } from "@/components/ui";
import { callTool } from "@/lib/tools";

export default function Screen() {
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  return (
    <Card>
      <Image alt="Lakeside cabin among pine trees" ratio="16:9">cabin-pines</Image>
      <Stack direction="column" gap="sm">
        <Heading level={1}>Lakeside Cabin</Heading>
        <Text tone="muted">Private dock, wood stove, sleeps 4</Text>
      </Stack>
      <Stack direction="row" gap="sm" align="center">
        <Rating value={4.8} max={5} />
        <Text tone="muted">4.8 · 126 reviews</Text>
      </Stack>
      <Divider />
      <Stack direction="row" gap="md">
        <DateInput value={checkIn} onChange={setCheckIn} label="Check-in" min="2026-10-01" />
        <DateInput value={checkOut} onChange={setCheckOut} label="Check-out" min="2026-10-02" />
      </Stack>
      <Stack direction="row">
        <Button variant="primary" onClick={() => callTool("bookings.reserve", { checkIn, checkOut })}>Reserve</Button>
      </Stack>
    </Card>
  );
}
