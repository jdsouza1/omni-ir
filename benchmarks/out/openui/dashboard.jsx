import { BarChart, Card, CardHeader, Col, LineChart, PieChart, Series, Slice, Stack, Table, TextContent } from "@/components/ui";

export default function Screen() {
  return (
    <Stack direction="column" gap="l">
      <Card variant="card">
        <CardHeader subtitle="Usage, acquisition, feature adoption, and revenue trends">Product Analytics Dashboard</CardHeader>
      </Card>
      <Stack direction="row" gap="m" align="stretch" justify="start" wrap={true}>
        <Card variant="sunk">
          <TextContent size="small-heavy">Monthly Active Users (MAU)</TextContent>
          <TextContent size="large-heavy">128,400</TextContent>
          <TextContent size="small">+6.2% vs last month</TextContent>
        </Card>
        <Card variant="sunk">
          <TextContent size="small-heavy">New Users (30d)</TextContent>
          <TextContent size="large-heavy">24,950</TextContent>
          <TextContent size="small">+3.1% vs last 30d</TextContent>
        </Card>
        <Card variant="sunk">
          <TextContent size="small-heavy">MRR</TextContent>
          <TextContent size="large-heavy">$412,000</TextContent>
          <TextContent size="small">+4.4% MoM</TextContent>
        </Card>
        <Card variant="sunk">
          <TextContent size="small-heavy">ARR</TextContent>
          <TextContent size="large-heavy">$4.94M</TextContent>
          <TextContent size="small">+18.7% YoY</TextContent>
        </Card>
      </Stack>
      <Stack direction="row" gap="l" align="stretch" justify="start" wrap={true}>
        <Card variant="card">
          <CardHeader subtitle="Last 12 months">Monthly Active Users</CardHeader>
          <BarChart labels={["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"]} variant="grouped" xLabel="Month" yLabel="Users">
            <Series values={[84500, 87200, 90100, 93800, 96500, 100200, 104800, 109600, 114300, 119900, 123700, 128400]}>MAU</Series>
          </BarChart>
        </Card>
        <Card variant="card">
          <CardHeader subtitle="Share of new users (last 30 days)">User Acquisition</CardHeader>
          <PieChart variant="donut">
            <Slice value={34}>Organic Search</Slice>
            <Slice value={22}>Paid Search</Slice>
            <Slice value={16}>Referrals</Slice>
            <Slice value={12}>Social</Slice>
            <Slice value={16}>Direct / Other</Slice>
          </PieChart>
          <TextContent size="small">Tip: Track CAC and conversion rate by channel to explain mix shifts.</TextContent>
        </Card>
      </Stack>
      <Card variant="card">
        <CardHeader subtitle="Adoption and engagement (last 30 days)">Top Features</CardHeader>
        <Table rows={[["Dashboards", 48200, 62.5, 5.8], ["Automations", 31750, 41.2, 3.1], ["Integrations", 28900, 37.5, 2.4], ["Team Collaboration", 27100, 35.2, 4.6], ["Exports", 19850, 25.8, 1.7], ["Alerts", 17600, 22.9, 2], ["API Access", 12150, 15.8, 6.3]]}>
          <Col type="string">Feature</Col>
          <Col type="number">Weekly Active Users</Col>
          <Col type="number">Adoption Rate (%)</Col>
          <Col type="number">Avg. Uses / User</Col>
        </Table>
      </Card>
      <Card variant="card">
        <CardHeader subtitle="MRR and ARR (last 12 months)">Revenue Trend</CardHeader>
        <LineChart labels={["Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar"]} variant="natural" xLabel="Month" yLabel="USD">
          <Series values={[332000, 341000, 349000, 356000, 364000, 372000, 381000, 389000, 397000, 404000, 408000, 412000]}>MRR ($)</Series>
          <Series values={[3984000, 4092000, 4188000, 4272000, 4368000, 4464000, 4572000, 4668000, 4764000, 4848000, 4896000, 4944000]}>ARR ($)</Series>
        </LineChart>
        <TextContent size="small">ARR shown as 12×MRR for directional tracking; replace with contracted ARR if you track annual commitments.</TextContent>
      </Card>
    </Stack>
  );
}
