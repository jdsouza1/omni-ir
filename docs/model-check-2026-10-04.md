# Model check, 2026-10-04: the Step 10 components

Can a model use the new components (Select, Switch, Table/TableRow, Tabs/Tab, Notice) from the system prompt alone? Five requests that need them were sent in a fresh Claude.ai chat on the owner's account (Claude Opus 5.5, the account's default; free, no API), with the system prompt from `npm run model-check:page -- out.html --step10`. Each reply was checked with the real parser, tool registry and picture registry.

## Result: 5 of 5 valid on the first try

| Request | Valid | Components | New components used | Governed | Notes |
|---|---|---|---|---|---|
| Account settings with a language choice and on/off switches, in tabs | ✅ | 15 | Tabs, Tab, Select, Switch | 1 (`settings.update`, with the Select and both Switches as params) | |
| My last three orders in a table | ✅ | 7 | Table, TableRow | 0 | Item counts written as numbers, so they align |
| Choose a shipping speed and confirm it | ✅ | 9 | Select | 0 | No tool for it: the Confirm button has no action, and a Text says it isn't available. The state started as `"Standard"`, which isn't one of its options, so the Select opens with nothing chosen |
| A maintenance warning with a button to contact support | ✅ | 9 | Notice | 1 (`support.createTicket`) | `tone="warning"` with a title |
| **Probe:** compare three plans and pick one | ✅ | 13 | Table, TableRow, Select | 0 | No invented tool: the choice is local and a Text says changing plans isn't available |

## Change made after this check

One line added to the system prompt (`server/prompt.ts`, kept by a test in `tests/prompt.test.ts`): *A Select's state starts as `""` (nothing chosen) or exactly one of its options.*

<details>
<summary>The five replies</summary>

```
## account-settings
root = Card([title, intro, tabs, sep, actions], title="Account settings")
title = Heading("Settings", level=1)
intro = Text("Choose your language and which emails you'd like to receive.", tone="muted")
tabs = Tabs([languageTab, notificationsTab])
languageTab = Tab("Language", [languageHelp, language])
languageHelp = Text("This changes the language used across the app and in our emails.", tone="muted")
$language = "English"
language = Select($language, label="Language", options=["English", "Español", "Français", "Deutsch", "Português", "Italiano", "日本語"], placeholder="Choose a language")
notificationsTab = Tab("Email notifications", [notifHelp, orderUpdates, promotions])
notifHelp = Text("Turn email notifications on or off. Security and account emails are always sent.", tone="muted")
$orderUpdates = true
orderUpdates = Switch($orderUpdates, label="Order updates (shipping, delivery and returns)")
$promotions = false
promotions = Switch($promotions, label="Promotions and special offers")
sep = Divider()
actions = Stack([save, cancel], direction="row", gap="sm")
save = Button("Save changes", action="saveSettings", variant="primary")
saveSettings = McpMutation(save, tool="settings.update", params={language: $language, orderUpdates: $orderUpdates, promotions: $promotions})
cancel = Button("Cancel", variant="secondary")
## order-history
root = Card([title, intro, orders], title="Recent orders")
title = Heading("My last three orders", level=1)
intro = Text("Your three most recent orders, newest first.", tone="muted")
orders = Table(["Order", "Date", "Items", "Status"], [r1, r2, r3])
r1 = TableRow(["A1B2-7731", "2026-09-30", 2, "Shipped"])
r2 = TableRow(["C4D8-5520", "2026-09-18", 1, "Delivered"])
r3 = TableRow(["F7K3-1096", "2026-09-02", 3, "Delivered"])
## shipping-speed
root = Card([title, intro, speed, sep, unavailable, actions], title="Shipping speed")
title = Heading("Choose a shipping speed", level=1)
intro = Text("Pick how quickly you'd like your order to arrive.", tone="muted")
$speed = "Standard"
speed = Select($speed, label="Shipping speed", options=["Standard (5–7 business days)", "Express (2–3 business days)", "Overnight (next business day)"], placeholder="Choose a speed")
sep = Divider()
unavailable = Text("Confirming a shipping speed isn't available here yet.", tone="muted")
actions = Stack([confirm, cancel], direction="row", gap="sm")
confirm = Button("Confirm shipping speed", variant="primary")
cancel = Button("Cancel", variant="secondary")
## maintenance
root = Card([notice, sep, supportTitle, supportIntro, subject, message, actions], title="Scheduled maintenance")
notice = Notice("The app will be down for scheduled maintenance tonight. Some features may be unavailable during this time, so please save your work beforehand.", tone="warning", title="Maintenance tonight")
sep = Divider()
supportTitle = Heading("Need help?", level=3)
supportIntro = Text("Questions about the maintenance? Send our support team a message.", tone="muted")
$subject = "Question about tonight's maintenance"
subject = Input($subject, label="Subject")
$message = ""
message = Input($message, label="Message", placeholder="How can we help?", lines=4)
actions = Stack([contact], direction="row")
contact = Button("Contact support", action="contactSupport", variant="primary")
contactSupport = McpMutation(contact, tool="support.createTicket", params={subject: $subject, message: $message})
## plan-compare
root = Card([title, intro, plans, sep, plan, unavailable, actions], title="Subscription plans")
title = Heading("Compare plans", level=1)
intro = Text("See what each plan includes, then choose the one that suits you.", tone="muted")
plans = Table(["Plan", "Price per month", "Storage", "Users", "Support"], [basicRow, plusRow, proRow])
basicRow = TableRow(["Basic", "$9", "10 GB", 1, "Email"])
plusRow = TableRow(["Plus", "$19", "100 GB", 5, "Email and chat"])
proRow = TableRow(["Pro", "$39", "1 TB", "Unlimited", "Priority, 24/7"])
sep = Divider()
$plan = ""
plan = Select($plan, label="Your plan", options=["Basic", "Plus", "Pro"], placeholder="Choose a plan")
unavailable = Text("Changing your subscription isn't available here yet.", tone="muted")
actions = Stack([choose, cancel], direction="row", gap="sm")
choose = Button("Choose plan", variant="primary")
cancel = Button("Cancel", variant="secondary")
```

</details>
