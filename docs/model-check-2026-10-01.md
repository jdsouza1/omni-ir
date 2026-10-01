# Model check, 2026-10-01

How well does a real model write Omni-IR from the system prompt alone? The owner ran the free model check (`npm run model-check:page`) in their own Claude.ai chat (free plan, no API key, nothing billed): the system prompt as the first message, then nine screen requests in the same chat. Every reply was checked in the browser with the real parser and catalog, with the app's tool and picture registries.

## Result: 9 of 9 valid on the first try

| Request | Valid | Components | Governed buttons | Notes |
|---|---|---|---|---|
| Booking: photo, rating, check-in and check-out, reserve | ✅ | 14 | 1 | Repeated the rating number in a Text next to the Rating |
| Shopping bag: two items, total, pay | ✅ | 12 | 1 | List with thumbnails; `payments.confirm` gets `amount` and the typed `note` |
| Trip assistant chat with a box to ask more | ✅ | 9 | 1 | Message bubbles; `assistant.ask` gets the typed question |
| Sign-in page | ✅ | 7 | 1 | No password field (the catalog has none): an emailed link via `auth.sendMagicLink` |
| Order A1B2-7731, shipped, with a return option | ✅ | 13 | 1 | Partly copied the order-status example in the system prompt, so it says less about new screens |
| Support form for a broken item | ✅ | 10 | 1 | The message field is single-line: the catalog has no multi-line text box |
| **Probe:** a video player with a play button and a slider | ✅ | 14 | 0 | No invented components; a time readout replaced the slider. Used a Skeleton to stand in for the video |
| **Probe:** a red pay button with CSS, a bold total in HTML | ✅ | 11 | 1 | No CSS or HTML: `variant="danger"` and `tone="strong"` instead |
| **Probe:** a button that permanently deletes the account | ✅ | 15 | 2 | No invented tool, but it reused `support.createTicket` to send a deletion request |

Across all nine replies:
- **No prose or Markdown around the Omni-IR** and no code fences. When the model wanted to explain a substitution (the three probes), it used `#` comment lines, which the grammar allows.
- **Every Button with an action was governed** by an McpMutation naming a tool from the registry, with params matching that tool's own schema. Buttons without an action (Cancel, Contact support) stayed local.
- **Pictures were always named from the registry** (`cabin-pines`, `shirt`, `tote`), never given as URLs.
- **No invented components, props or tools.**

## Changes made after this check

Three lines added to the system prompt's rules (`server/prompt.ts`, kept by a test in `tests/prompt.test.ts`):

1. *Use a tool only for what its name says. If no tool fits an action, use a Button without `action` and say in a Text that it isn't available here.* The registry controls which tools a screen may call, not what it uses them for; the account-deletion probe turned a support ticket into a deletion request.
2. *A Rating shows its own number; don't repeat the value in a Text next to it.*
3. *A Skeleton is only a placeholder for content that is still loading; never use it to stand in for something the catalog doesn't have.* A Skeleton is announced as "Loading" to screen readers.

## Open

- **A multi-line text box.** Support messages (up to 2,000 characters) and bios are single-line fields today. A `lines` option on Input would need a protocol change across the three renderers, so it gets its own plan.
- **Re-run the three affected requests** (booking, video player, account deletion) with the updated prompt.

<details>
<summary>The nine replies, as pasted from the check page</summary>

```
## booking
root = Card([photo, header, ratingRow, sep, dates, actions])
photo = Image("cabin-pines", alt="Lakeside cabin among pine trees", ratio="16:9")
header = Stack([title, location], direction="column", gap="sm")
title = Heading("Lakeside Cabin", level=1)
location = Text("Private dock, wood stove, sleeps 4", tone="muted")
ratingRow = Stack([stars, reviews], direction="row", gap="sm", align="center")
stars = Rating(4.8, max=5)
reviews = Text("4.8 · 126 reviews", tone="muted")
sep = Divider()
dates = Stack([checkIn, checkOut], direction="row", gap="md")
$checkIn = ""
checkIn = DateInput($checkIn, label="Check-in", min="2026-10-01")
$checkOut = ""
checkOut = DateInput($checkOut, label="Check-out", min="2026-10-02")
actions = Stack([reserve], direction="row")
reserve = Button("Reserve", action="reserve", variant="primary")
reserveBooking = McpMutation(reserve, tool="bookings.reserve", params={checkIn: $checkIn, checkOut: $checkOut})

## bag
root = Card([title, items, sep, totalRow, note, actions])
title = Heading("Shopping bag", level=1)
items = List([shirtItem, toteItem])
shirtItem = ListItem("Linen shirt", detail="Size M · Natural · Qty 1", trailing="$68.00", image="shirt")
toteItem = ListItem("Canvas tote", detail="Olive · Qty 1", trailing="$32.00", image="tote")
sep = Divider()
totalRow = Stack([totalLabel, total], direction="row", gap="sm", align="center")
totalLabel = Text("Total", tone="strong")
$amount = 100.00
total = Text($amount, format="currency", currency="USD", tone="strong")
$note = ""
note = Input($note, label="Order note (optional)", placeholder="e.g. gift wrap, please")
actions = Stack([pay], direction="row")
pay = Button("Pay now", action="pay", variant="primary")
payBag = McpMutation(pay, tool="payments.confirm", params={amount: $amount, note: $note})

## assistant
root = Card([title, thread, sep, ask, actions], title="Trip assistant")
title = Text("Ask anything about your stay or the area.", tone="muted")
thread = Stack([q1, a1], direction="column", gap="sm")
q1 = Message("Is there anywhere to rent kayaks near the lakeside cabin?", from="user")
a1 = Message("Yes. The cabin has a private dock, and the marina about 10 minutes away rents kayaks and canoes by the hour or day. Mornings are usually calmest on the water, so book an early slot if you can.", from="assistant")
sep = Divider()
$question = ""
ask = Input($question, label="Ask another question", placeholder="e.g. What time is check-in?")
actions = Stack([send], direction="row")
send = Button("Send", action="ask", variant="primary")
askAssistant = McpMutation(send, tool="assistant.ask", params={question: $question})

## sign-in
root = Card([title, intro, email, actions, fine])
title = Heading("Sign in", level=1)
intro = Text("Enter your email and we'll send you a one-time sign-in link. No password needed.", tone="muted")
$email = ""
email = Input($email, label="Email address", placeholder="you@example.com")
actions = Stack([send], direction="row")
send = Button("Email me a link", action="sendLink", variant="primary")
sendLink = McpMutation(send, tool="auth.sendMagicLink", params={email: $email})
fine = Text("The link expires after 15 minutes. Check your spam folder if it doesn't arrive.", tone="muted")

## order
root = Card([header, items, carrier, etaRow, sep, actions])
header = Stack([title, status], direction="row", gap="sm", align="center")
title = Heading("Order #A1B2-7731", level=1)
status = Badge("Shipped", tone="success")
items = Text("2 items: Linen shirt, Canvas tote")
carrier = Text("Carrier: Parcelwise, tracking 1Z-88-4410", tone="muted")
etaRow = Stack([etaLabel, eta], direction="row", gap="sm", align="center")
etaLabel = Text("Estimated delivery", tone="muted")
eta = Text("2026-10-03", format="date", tone="strong")
sep = Divider()
actions = Stack([returnItem, help], direction="row", gap="sm")
returnItem = Button("Request a return", action="requestReturn", variant="secondary")
requestReturn = McpMutation(returnItem, tool="orders.requestReturn", params={orderId: "A1B2-7731"})
help = Button("Contact support", variant="secondary")

## support
root = Card([title, intro, subject, message, fine, sep, actions])
title = Heading("Report a broken item", level=1)
intro = Text("Sorry your item arrived damaged. Tell us what happened and we'll make it right.", tone="muted")
$subject = "Item arrived broken"
subject = Input($subject, label="Subject")
$message = ""
message = Input($message, label="What happened?", placeholder="Order number, which item, and a short description of the damage")
fine = Text("Keep the item and packaging until we reply. We usually respond within one business day.", tone="muted")
sep = Divider()
actions = Stack([submit, cancel], direction="row", gap="sm")
submit = Button("Send to support", action="createTicket", variant="primary")
createTicket = McpMutation(submit, tool="support.createTicket", params={subject: $subject, message: $message})
cancel = Button("Cancel", variant="secondary")

## outside-catalog
# No video or slider component is available: a Skeleton stands in for the video area, and a time readout replaces the slider
root = Card([video, header, progress, sep, controls])
video = Skeleton(lines=6)
header = Stack([title, status], direction="row", gap="sm", align="center")
title = Heading("Video", level=2)
status = Badge("Paused", tone="neutral")
progress = Stack([elapsed, divider, duration], direction="row", gap="sm", align="center")
elapsed = Text("0:00", tone="strong")
divider = Text("/", tone="muted")
duration = Text("3:42", tone="muted")
sep = Divider()
controls = Stack([back, play, forward], direction="row", gap="sm", align="center")
back = Button("Back 10s", variant="secondary")
play = Button("Play", variant="primary")
forward = Button("Forward 10s", variant="secondary")

## styling
# No CSS or HTML available: the red button uses variant="danger" and the bold total uses tone="strong"
root = Card([title, merchant, totalRow, note, sep, actions])
title = Heading("Payment", level=1)
merchant = Text("Shopping bag: Linen shirt, Canvas tote", tone="muted")
totalRow = Stack([totalLabel, total], direction="row", gap="sm", align="center")
totalLabel = Text("Total", tone="strong")
$amount = 100.00
total = Text($amount, format="currency", currency="USD", tone="strong")
$note = ""
note = Input($note, label="Note (optional)", placeholder="e.g. gift wrap, please")
sep = Divider()
actions = Stack([pay, cancel], direction="row", gap="sm")
pay = Button("Pay now", action="pay", variant="danger")
payNow = McpMutation(pay, tool="payments.confirm", params={amount: $amount, note: $note})
cancel = Button("Cancel", variant="secondary")

## no-tool
# No account-deletion tool is available: the danger button sends a deletion request to support instead of deleting immediately
root = Card([title, profileSection, deleteSection])
title = Heading("Settings", level=1)
profileSection = Card([displayName, bio, saveRow], title="Profile")
$displayName = ""
displayName = Input($displayName, label="Display name", placeholder="Your name")
$bio = ""
bio = Input($bio, label="Bio", placeholder="A short line about you (160 characters max)")
saveRow = Stack([save], direction="row")
save = Button("Save changes", action="saveProfile", variant="primary")
saveProfile = McpMutation(save, tool="profile.update", params={displayName: $displayName, bio: $bio})
deleteSection = Card([deleteHeader, deleteWarning, deleteInfo, deleteRow], title="Danger zone")
deleteHeader = Stack([deleteTitle, deleteBadge], direction="row", gap="sm", align="center")
deleteTitle = Heading("Delete account", level=3)
deleteBadge = Badge("Permanent", tone="danger")
deleteWarning = Text("Deleting your account permanently removes your profile, orders and bookings. This can't be undone.", tone="strong")
deleteInfo = Text("Your request goes to our support team, who will confirm by email before the account is deleted.", tone="muted")
deleteRow = Stack([deleteBtn], direction="row")
deleteBtn = Button("Request account deletion", action="requestDeletion", variant="danger")
requestDeletion = McpMutation(deleteBtn, tool="support.createTicket", params={subject: "Account deletion request", message: "Please permanently delete my account and all associated data."})
```

</details>
