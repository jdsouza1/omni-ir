// @vitest-environment jsdom
// The developer guide's browser code, steps 2 to 5, run as a reader would paste it (PLAN-QUICKSTART A.5).
import type React from "react";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { guideFiles, guideSnippet, writeApp } from "./quickstartGuide";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** A response whose body arrives in these chunks, like a model's reply streaming in. */
const streamed = (chunks: string[]) =>
  new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
        controller.close();
      },
    }),
  );

const load = async (dir: string) => (await import(/* @vite-ignore */ `${dir}/src/OrderScreen.tsx`)) as { OrderScreen: () => React.ReactElement };

describe("the developer guide", () => {
  it("has the files each step names", () => {
    const steps = guideFiles();
    expect([...steps.keys()]).toEqual([2, 3, 4, 5]);
    expect([...steps.get(3)!.keys()]).toEqual(["src/tools.ts", "src/OrderScreen.tsx"]);
    expect([...steps.get(4)!.keys()]).toEqual(["server.ts", "src/OrderScreen.tsx"]);
    expect([...steps.get(5)!.keys()]).toEqual(["actions.ts", "src/runAction.ts"]);
  });

  it("step 2: draws the order with its button off", async () => {
    const { OrderScreen } = await load(writeApp("step2", 2));
    render(<OrderScreen />);
    expect(screen.getByText("Order #A1B2-7731")).toBeTruthy();
    expect(screen.getByText("Shipped")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Request a return" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("step 3: the allowed action turns the button on and logs the call", async () => {
    const { OrderScreen } = await load(writeApp("step3", 3));
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    render(<OrderScreen />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Request a return" }));
    expect(log).toHaveBeenCalledWith("orders.requestReturn", { orderId: "A1B2-7731" });
  });

  it("step 4: streams the server's reply into a new screen", async () => {
    const { OrderScreen } = await load(writeApp("step4", 4));
    const reply = ['root = Card([title, status, ret])\ntitle = Heading("Order #A1B2-7731")\n', 'status = Badge("Shipped")\nret = Button("Request a return", action="return")\n', 'retM = McpMutation(ret, tool="orders.requestReturn", params={orderId: "A1B2-7731"})\n'];
    const fetchMock = vi.fn(async () => streamed(reply));
    vi.stubGlobal("fetch", fetchMock);
    render(<OrderScreen />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Where is my order?" }));
    await screen.findByText("Order #A1B2-7731");
    expect(JSON.parse((fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ request: "Where is my order A1B2-7731?" });
    await waitFor(() => expect((screen.getByRole("button", { name: "Request a return" }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("step 5: the server's answer updates the screen", async () => {
    const line = guideSnippet(5);
    const dir = writeApp("step5", 5, (path, text) => {
      if (path !== "src/OrderScreen.tsx") return text;
      const old = /^\s*<OmniRenderer [^\n]*\/>$/m.exec(text)![0];
      return text.replace(old, `      ${line}`).replace('import { tools } from "./tools";', 'import { tools } from "./tools";\nimport { runAction } from "./runAction";');
    });
    const { OrderScreen } = await load(dir);
    const reply = 'root = Card([title, status, ret])\ntitle = Heading("Order #A1B2-7731")\nstatus = Badge("Shipped")\nret = Button("Request a return", action="return")\nretM = McpMutation(ret, tool="orders.requestReturn", params={orderId: "A1B2-7731"})\n';
    const fetchMock = vi.fn(async (url: string) =>
      url === "/api/screen" ? streamed([reply]) : Response.json({ update: 'status = Badge("Return requested")\n' }),
    );
    vi.stubGlobal("fetch", fetchMock);
    render(<OrderScreen />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Where is my order?" }));
    await waitFor(() => expect((screen.getByRole("button", { name: "Request a return" }) as HTMLButtonElement).disabled).toBe(false));
    await act(() => user.click(screen.getByRole("button", { name: "Request a return" })));
    await screen.findByText("Return requested");
    expect(JSON.parse((fetchMock.mock.calls[1] as unknown as [string, RequestInit])[1].body as string)).toEqual({ tool: "orders.requestReturn", params: { orderId: "A1B2-7731" } });
  });
});
