# Model check, 2026-10-04: charts (Step 11)

Can a model use the chart components (BarChart, LineChart, PieChart, Series, Slice) from the system prompt alone, and does it keep to "data, not pixels"? Five requests were sent in a fresh Claude.ai chat on the owner's account (Claude Opus 5.5, the account's default; free, no API), with the system prompt from `npm run model-check:page -- out.html --step11`. Each reply was checked with the real parser, tool registry and picture registry.

## Result: 5 of 5 valid on the first try

| Request | Valid | Chart | Notes |
|---|---|---|---|
| Monthly revenue for the last six months as a chart | ✅ | LineChart, one Series, `format="currency"` | A line for change over time |
| Website visitors over four weeks, compared with app users | ✅ | LineChart, two Series | |
| Where customers come from, as a pie chart | ✅ | PieChart, five Slices, `format="percent"` | The shares add up to 100 |
| Quarterly sales for two regions, with a summary | ✅ | BarChart, two Series, `format="currency"` | The summary Text matches the numbers |
| **Probe:** red, animated bars with a custom tooltip showing each region manager | ✅ | BarChart, one Series | No styling props: the managers are listed below the chart, and a Text says colour, animation and tooltips are set by the app |

Every reply marked its figures as sample data. No changes to the system prompt were needed.

<details>
<summary>The five replies</summary>

```
## revenue
root = Card([title, chart, note])
title = Heading("Monthly revenue")
chart = LineChart("Revenue, Apr–Sep 2026", ["Apr", "May", "Jun", "Jul", "Aug", "Sep"], [revenue], format="currency", currency="USD")
revenue = Series("Revenue", [18400, 21250, 19800, 24600, 26100, 28900])
note = Text("Sample figures shown. Replace with your actual monthly totals.", tone="muted")
## visitors
root = Card([title, chart, note])
title = Heading("Website visitors vs app users")
chart = LineChart("Weekly users, last four weeks", ["Week 1", "Week 2", "Week 3", "Week 4"], [web, app], format="number")
web = Series("Website visitors", [12400, 13150, 12800, 14200])
app = Series("App users", [8600, 9300, 9900, 10750])
note = Text("Sample figures shown. Replace with your actual weekly counts.", tone="muted")
## customers
root = Card([title, chart, note])
title = Heading("Customer acquisition sources")
chart = PieChart("Customers by source", [organic, paid, referral, social, email], format="percent")
organic = Slice("Organic search", 34)
paid = Slice("Paid ads", 22)
referral = Slice("Referrals", 18)
social = Slice("Social media", 15)
email = Slice("Email", 11)
note = Text("Sample figures shown. Replace with your actual customer source breakdown.", tone="muted")
## regions
root = Card([title, chart, summary, note])
title = Heading("Quarterly sales by region")
chart = BarChart("Sales by quarter, 2026", ["Q1", "Q2", "Q3"], [north, south], format="currency", currency="USD")
north = Series("North", [142000, 158500, 171200])
south = Series("South", [128000, 124500, 139800])
summary = Text("North has grown every quarter, up about 21% from Q1 to Q3. South dipped slightly in Q2 but recovered in Q3 to its best result yet, though it still trails North by roughly $31,000.")
note = Text("Sample figures shown. Replace with your actual regional totals.", tone="muted")
## styled-chart
root = Card([title, chart, managersHeading, managers, note])
title = Heading("Sales by region")
chart = BarChart("Q3 2026 sales", ["North", "South", "East", "West"], [sales], format="currency", currency="USD")
sales = Series("Sales", [171200, 139800, 154300, 162700])
managersHeading = Heading("Region managers", level=3)
managers = List([mNorth, mSouth, mEast, mWest])
mNorth = ListItem("North", detail="Priya Shah")
mSouth = ListItem("South", detail="Marcus Lee")
mEast = ListItem("East", detail="Elena Torres")
mWest = ListItem("West", detail="David Kim")
note = Text("Bar colour, animation and custom tooltips are set by the app, so manager names are listed below the chart instead. Sample figures and names shown.", tone="muted")
```

</details>
