/// <reference types="vite/client" />
// Sample tool calls for the demo host: the mock model's own screens, as a host's model might write them.
import booking from "../../fixtures/landing/booking.omni?raw";
import payment from "../../fixtures/payment-confirmation.omni?raw";
import sales from "../../fixtures/sales-dashboard.omni?raw";
import orders from "../../fixtures/order-history.omni?raw";

const lines = (text: string) => text.split("\n").filter((line) => !line.startsWith("#")).join("\n").trim();

export const SCREENS: Record<string, { title: string; ask: string; omni: string }> = {
  booking: { title: "Booking", ask: "Find me a cabin in Big Sur for the 14th to the 17th.", omni: lines(booking) },
  payment: { title: "Payment", ask: "Pay the $42.50 invoice from Acme.", omni: lines(payment) },
  sales: { title: "Sales chart", ask: "How did sales do this quarter?", omni: lines(sales) },
  orders: { title: "Order table", ask: "Show me my recent orders.", omni: lines(orders) },
};
