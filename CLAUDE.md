# Omni-IR: Generative UI Protocol

## WHAT
We are building an open-source standard for Generative UI called Omni-IR. It consists of a line-oriented streaming parser, a strict Zod-based schema validator, a client-side reactive state store, and a Native React renderer (The Trusted Catalog).

## WHY
To provide a secure, ultra-fast, cross-platform standard where an LLM generates declarative Intent Bytecode instead of raw, human-readable code. The AI must never dictate styling, CSS, or raw HTML.

## HOW (Tech Stack)
- **Language:** Pure TypeScript.
- **Validation:** Zod.
- **Frontend Engine:** React 19 (for the Trusted Catalog).
- **Backend/CLI Server:** Node.js / Express (for streaming the LLM response).

## STRICT CONSTRAINTS (Never Break These)
1. **No Code Generation:** The AI agent simulating the Omni-IR stream must ONLY output flat, line-oriented assignment syntax (e.g., `btn = Button("Submit")`). It must never output HTML, Tailwind, or React code.
2. **Strict Native Catalog:** The React renderer must use a predefined dictionary of components. Do not invent UI components on the fly.
3. **MCP-UI Governance:** Every interactive component that mutates backend state must be wrapped in an `McpMutation` node.
4. **Testing First:** Write a failing test for the parser before implementing the regex matching.
