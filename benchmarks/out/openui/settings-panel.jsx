import { Button, Buttons, Card, CardHeader, Form, FormControl, Input, Stack, SwitchGroup, SwitchItem, TabItem, Tabs, TextCallout, TextContent } from "@/components/ui";

export default function Screen() {
  return (
    <Stack direction="column" gap="l">
      <TextContent size="large-heavy">User Settings</TextContent>
      <Tabs>
        <TabItem value="profile" trigger="Profile">
          <Card variant="card">
            <CardHeader subtitle="Update your personal information and avatar.">Profile</CardHeader>
            <Form name="profile_update" buttons={<Buttons><Button action="submit:profile_update" variant="primary">Save changes</Button><Button action="action:reset_profile_form" variant="secondary">Reset</Button></Buttons>}>
              <FormControl label="Display name">
                <Input placeholder="e.g., Alex Johnson" type="text" rules={["required", "minLength:2", "maxLength:60"]}>display_name</Input>
              </FormControl>
              <FormControl label="Avatar URL">
                <Input placeholder="https://example.com/avatar.png" type="url" rules={["url"]}>avatar_url</Input>
              </FormControl>
            </Form>
          </Card>
        </TabItem>
        <TabItem value="security" trigger="Security">
          <Card variant="card">
            <CardHeader subtitle="Manage sign-in protection and account security.">Security</CardHeader>
            <SwitchGroup variant="sunk">
              <SwitchItem description="Require a verification code when signing in." name="two_fa" value="enabled" checked={false} defaultChecked={true} disabled={false}>Two-factor authentication (2FA)</SwitchItem>
            </SwitchGroup>
            <TextCallout title="Tip" description="After enabling 2FA, you may be asked to set up an authenticator app or backup codes.">info</TextCallout>
          </Card>
        </TabItem>
        <TabItem value="notifications" trigger="Notifications">
          <Card variant="card">
            <CardHeader subtitle="Choose what you want to be notified about.">Notifications</CardHeader>
            <SwitchGroup variant="sunk">
              <SwitchItem description="Receive updates and account messages by email." name="notif_email" value="enabled" checked={true} defaultChecked={true} disabled={false}>Email notifications</SwitchItem>
              <SwitchItem description="Get notified about new features and improvements." name="notif_product" value="enabled" checked={false} defaultChecked={false} disabled={false}>Product updates</SwitchItem>
              <SwitchItem description="Important alerts about sign-ins and security changes." name="notif_security" value="enabled" checked={true} defaultChecked={true} disabled={false}>Security alerts</SwitchItem>
            </SwitchGroup>
          </Card>
        </TabItem>
      </Tabs>
    </Stack>
  );
}
