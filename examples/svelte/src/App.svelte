<script>
  import { onMount } from "svelte";

  let screen;
  let log = $state("");
  const sent = [];

  onMount(async () => {
    // What screens may do: tool params as JSON Schema (Zod works too).
    screen.tools = { "payments.confirm": { type: "object", properties: { amount: { type: "number", exclusiveMinimum: 0 } }, required: ["amount"] } };
    screen.onMutation = async (call) => {
      sent.push(call.tool);
      // What the person sees: a plain sentence, never the action's raw data.
      log = `Paid ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(call.params.amount))}. This is a demo: nothing was charged.`;
    };
    screen.write(
      [
        "root = Card([title, amount, pay])",
        'title = Heading("Confirm payment")',
        "$amount = 24",
        'amount = Text($amount, format="currency", currency="USD", tone="strong")',
        'pay = Button("Pay now", action="go")',
        'go = McpMutation(pay, tool="payments.confirm", params={amount: $amount})',
        "",
      ].join("\n"),
    );
    screen.end();

    // ?check: the example checks itself (scripts/examples-test.mjs).
    if (new URLSearchParams(location.search).has("check")) {
      await new Promise((resolve) => setTimeout(resolve, 600));
      const root = screen.shadowRoot;
      [...root.querySelectorAll("button")].find((b) => b.textContent.trim() === "Pay now")?.click();
      await new Promise((resolve) => setTimeout(resolve, 300));
      document.getElementById("omni-check").textContent = JSON.stringify({
        framework: "svelte",
        drawn: root.textContent.includes("Confirm payment"),
        sent,
      });
    }
  });

  // Blocked actions and failed handlers: tell the person plainly; the details are for the app's logs.
  function onEvent(event) {
    if (event.detail.type === "error") {
      console.warn(event.detail.issue);
      log = "That didn't go through. Please try again.";
    }
  }
</script>

<main style="max-width: 520px; margin: 0 auto; display: grid; gap: 16px">
  <h1>Svelte</h1>
  <omni-screen bind:this={screen} theme="light" onomni-event={onEvent}></omni-screen>
  <p aria-live="polite">{log}</p>
  <pre id="omni-check" hidden></pre>
</main>
