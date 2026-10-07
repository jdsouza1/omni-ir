// The demo host's script (npm run mcp:host): plays the host's part with the official AppBridge,
// streaming a sample show_screen call into the Omni-IR view chunk by chunk, as a host relays a model
// that is still writing. Actions are logged and answered here: there is no server and no model.
import { AppBridge, PostMessageTransport } from "@modelcontextprotocol/ext-apps/app-bridge";
import type { McpUiStyles } from "@modelcontextprotocol/ext-apps";
import { SCREENS } from "./screens";

/** Variables a host like Claude passes (a subset, as hosts do); the view maps them onto the catalog's tokens. */
const HOST_STYLES: Record<"light" | "dark", Partial<McpUiStyles>> = {
  light: { "--color-background-primary": "#ffffff", "--color-text-primary": "#1f1e1c", "--color-text-secondary": "#5f5c55", "--color-border-primary": "#8d8a82", "--font-sans": 'system-ui, -apple-system, "Segoe UI", sans-serif', "--border-radius-md": "10px" },
  dark: { "--color-background-primary": "#24221f", "--color-text-primary": "#f3f1ec", "--color-text-secondary": "#c4c0b7", "--color-border-primary": "#8a867d", "--font-sans": 'system-ui, -apple-system, "Segoe UI", sans-serif', "--border-radius-md": "10px" },
};

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const params = new URLSearchParams(location.search);
const theme: "light" | "dark" = params.get("theme") === "dark" ? "dark" : "light";
const screenId = params.get("screen") && params.get("screen")! in SCREENS ? params.get("screen")! : Object.keys(SCREENS)[0]!;

const select = $<HTMLSelectElement>("screen");
for (const [id, s] of Object.entries(SCREENS)) select.append(new Option(s.title, id, false, id === screenId));
select.onchange = () => navigate({ screen: select.value });
$("replay").onclick = () => location.reload();
$("theme").textContent = theme === "dark" ? "Light" : "Dark";
$("theme").onclick = () => navigate({ theme: theme === "dark" ? "light" : "dark" });
document.documentElement.dataset.theme = theme;
const screen = SCREENS[screenId]!;
$("ask").textContent = screen.ask;

function navigate(change: Record<string, string>) {
  const next = new URLSearchParams(location.search);
  for (const [k, v] of Object.entries(change)) next.set(k, v);
  location.search = next.toString();
}

const log: string[] = [];
const iframe = $<HTMLIFrameElement>("view");
const bridge = new AppBridge(null, { name: "Omni-IR demo host", version: "1" }, { serverTools: {} }, { hostContext: { theme, styles: { variables: HOST_STYLES[theme] as McpUiStyles } } });
bridge.oncalltool = async ({ name, arguments: args }) => {
  log.push(`${name} ${JSON.stringify(args)}`);
  $("log").textContent = log.join("\n");
  return { content: [{ type: "text", text: "Done." }], structuredContent: { ok: true } };
};
bridge.onsizechange = ({ height }) => {
  if (height) iframe.style.height = `${height}px`;
};
const initialized = new Promise<void>((resolve) => (bridge.oninitialized = () => resolve()));
// Connect before the view loads, so its first message isn't missed.
await bridge.connect(new PostMessageTransport(iframe.contentWindow ?? undefined, iframe.contentWindow as MessageEventSource));
iframe.src = "view.html";
await initialized;

// Stream the screen as a model writes it: a few characters at a time.
const text = screen.omni;
for (let at = 0; at < text.length; at += 24) {
  await bridge.sendToolInputPartial({ arguments: { screen: text.slice(0, at) } });
  await new Promise((r) => setTimeout(r, 40));
}
await bridge.sendToolInput({ arguments: { screen: text } });
document.body.dataset.done = "true";
