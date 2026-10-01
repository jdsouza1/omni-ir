import { Button, Buttons, Form, FormControl, Input, Select, SelectItem, Stack, TextArea, TextContent } from "@/components/ui";

export default function Screen() {
  return (
    <Stack direction="column" gap="l">
      <TextContent size="large-heavy">Contact Us</TextContent>
      <Form name="contact" buttons={<Buttons direction="row"><Button action="submit:contact" variant="primary">Submit</Button><Button action="action:cancel_contact" variant="secondary">Cancel</Button></Buttons>}>
        <FormControl label="Name">
          <Input placeholder="Your full name" type="text" rules={["required", "minLength:2"]}>name</Input>
        </FormControl>
        <FormControl label="Email">
          <Input placeholder="you@example.com" type="email" rules={["required", "email"]}>email</Input>
        </FormControl>
        <FormControl label="Phone">
          <Input placeholder="e.g., +1 555 123 4567" type="text" rules={["required", "minLength:7", "maxLength:20"]}>phone</Input>
        </FormControl>
        <FormControl label="Subject">
          <Select name="subject" placeholder="Select a subject..." rules={["required"]}>
            <SelectItem label="General inquiry">general</SelectItem>
            <SelectItem label="Support">support</SelectItem>
            <SelectItem label="Sales">sales</SelectItem>
            <SelectItem label="Billing">billing</SelectItem>
            <SelectItem label="Feedback">feedback</SelectItem>
          </Select>
        </FormControl>
        <FormControl label="Message">
          <TextArea placeholder="How can we help?" rows={6} rules={["required", "minLength:10"]}>message</TextArea>
        </FormControl>
      </Form>
    </Stack>
  );
}
