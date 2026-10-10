import { AfterViewInit, Component, CUSTOM_ELEMENTS_SCHEMA, ElementRef, signal, viewChild } from "@angular/core";
import type { MutationCall, OmniScreenElement, RendererEvent } from "@omni-ir/elements";

@Component({
  selector: "app-root",
  // <omni-screen> is a custom element: Angular passes its properties and events through.
  schemas: [CUSTOM_ELEMENTS_SCHEMA],
  template: `
    <main style="max-width: 520px; margin: 0 auto; display: grid; gap: 16px">
      <h1>Angular</h1>
      <omni-screen #screen theme="light" (omni-event)="onEvent($event)"></omni-screen>
      <p aria-live="polite">{{ log() }}</p>
      <pre id="omni-check" hidden></pre>
    </main>
  `,
})
export class AppComponent implements AfterViewInit {
  readonly screen = viewChild.required<ElementRef<OmniScreenElement>>("screen");
  readonly log = signal("");
  private readonly sent: string[] = [];

  async ngAfterViewInit(): Promise<void> {
    const screen = this.screen().nativeElement;
    // What screens may do: tool params as JSON Schema (Zod works too).
    screen.tools = { "payments.confirm": { type: "object", properties: { amount: { type: "number", exclusiveMinimum: 0 } }, required: ["amount"] } };
    screen.onMutation = async (call: MutationCall) => {
      this.sent.push(call.tool);
      // What the person sees: a plain sentence, never the action's raw data.
      this.log.set(`Paid ${new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(call.params.amount))}. This is a demo: nothing was charged.`);
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
      [...(root?.querySelectorAll("button") ?? [])].find((b) => b.textContent?.trim() === "Pay now")?.click();
      await new Promise((resolve) => setTimeout(resolve, 300));
      const check = document.getElementById("omni-check");
      if (check) check.textContent = JSON.stringify({ framework: "angular", drawn: root?.textContent?.includes("Confirm payment") ?? false, sent: this.sent });
    }
  }

  // Blocked actions and failed handlers: tell the person plainly; the details are for the app's logs.
  onEvent(event: Event): void {
    const detail = (event as CustomEvent<RendererEvent>).detail;
    if (detail.type === "error") {
      console.warn(detail.issue);
      this.log.set("That didn't go through. Please try again.");
    }
  }
}
