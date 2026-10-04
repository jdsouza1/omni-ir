import { BarChart, Card, CardHeader, Series, Stack, TextCallout, TextContent } from "@/components/ui";

export default function Screen() {
  return (
    <Stack direction="column" gap="l">
      <TextContent size="large-heavy">Revenue Dashboard</TextContent>
      <Stack direction="row" gap="l" align="stretch" justify="start" wrap={true}>
        <Card variant="card">
          <CardHeader subtitle="Last 6 months">Total Revenue</CardHeader>
          <TextContent size="large-heavy">$1,284,000</TextContent>
          <TextCallout title="Up 8.4%" description="Compared to the previous 6 months">success</TextCallout>
        </Card>
        <Card variant="card">
          <CardHeader subtitle="Last 6 months">Monthly Revenue</CardHeader>
          <BarChart labels={["Oct", "Nov", "Dec", "Jan", "Feb", "Mar"]} variant="grouped" xLabel="Month" yLabel="Revenue (USD)">
            <Series values={[198000, 205000, 214000, 210000, 223000, 234000]}>Revenue</Series>
          </BarChart>
        </Card>
      </Stack>
    </Stack>
  );
}
