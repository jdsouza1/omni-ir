import { Col, Stack, Table, TextContent } from "@/components/ui";

export default function Screen() {
  return (
    <Stack>
      <TextContent size="large-heavy">Employees (Sample)</TextContent>
      <Table rows={[["Ava Patel", "Engineering", 132000, 6.5], ["Marcus Lee", "Sales", 98000, 4.2], ["Sofia Ramirez", "Marketing", 105000, 3.1], ["Ethan Brooks", "Finance", 118500, 5], ["Nina Chen", "HR", 89000, 2.4]]}>
        <Col type="string">Name</Col>
        <Col type="string">Department</Col>
        <Col type="number">Salary</Col>
        <Col type="number">YoY change (%)</Col>
      </Table>
    </Stack>
  );
}
