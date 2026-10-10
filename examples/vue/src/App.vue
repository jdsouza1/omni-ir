<script setup>
import { onMounted, ref } from "vue";

const screen = ref(null);
const log = ref("");
const sent = [];

onMounted(async () => {
  const el = screen.value;
  // What screens may do: tool params as JSON Schema (Zod works too).
  el.tools = { "payments.confirm": { type: "object", properties: { amount: { type: "number", exclusiveMinimum: 0 } }, required: ["amount"] } };
  el.components = {
    ProductCard: { description: "A product with its name and price.", positional: ["name"], props: { name: { kind: "text" }, price: { kind: "number" } }, tag: "demo-product-card" },
  };
  el.onMutation = async (call) => {
    sent.push(call.tool);
    log.value = `Sent ${call.tool} ${JSON.stringify(call.params)}`;
  };
  el.write(
    [
      "root = Card([title, card, pay])",
      'title = Heading("Confirm payment")',
      'card = ProductCard("Canvas tote", price=24)',
      'pay = Button("Pay now", action="go")',
      'go = McpMutation(pay, tool="payments.confirm", params={amount: 24})',
      "",
    ].join("\n"),
  );
  el.end();

  // ?check: the example checks itself (scripts/examples-test.mjs).
  if (new URLSearchParams(location.search).has("check")) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    const root = el.shadowRoot;
    [...root.querySelectorAll("button")].find((b) => b.textContent.trim() === "Pay now")?.click();
    await new Promise((resolve) => setTimeout(resolve, 300));
    document.getElementById("omni-check").textContent = JSON.stringify({
      framework: "vue",
      drawn: root.textContent.includes("Confirm payment"),
      appComponent: root.querySelector("demo-product-card")?.props?.name === "Canvas tote",
      sent,
    });
  }
});

function onEvent(event) {
  log.value = `${event.detail.type}${event.detail.issue ? `: ${event.detail.issue.code}` : ""}`;
}
</script>

<template>
  <main style="max-width: 520px; margin: 0 auto; display: grid; gap: 16px">
    <h1>Vue</h1>
    <omni-screen ref="screen" theme="light" @omni-event="onEvent"></omni-screen>
    <p aria-live="polite">{{ log }}</p>
    <pre id="omni-check" hidden></pre>
  </main>
</template>
