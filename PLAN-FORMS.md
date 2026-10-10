# Omni-IR — Step 19: forms, confirmations and screens as text

Status: **APPROVED 2026-10-09** with the recommendations (all eight decisions). Free: no paid API; tests use mock data. Field validation adds props to the catalog, so this is the first format change under the versioning rules of `v0.8.0`: stream format `0.5` → `0.8`.

## Goal

Forms catch mistakes before anything is sent, risky actions always ask the person first in the renderer's own words, and every screen can also be read as plain text. All three without adding logic to the stream: the model only declares, the app's renderer decides.

## How it fits the roadmap

- **It strengthens what sets Omni-IR apart.** Checked, governed screens are the difference from the alternatives (the format comparison and the review of 487 public feature requests, 2026-10-09). Validation and confirmations extend that governance to the person's own input and consent.
- **It answers requests people made of competitors:** declarative validation ([A2UI](https://github.com/a2ui-project/a2ui/issues/316), [OpenUI](https://github.com/thesysdev/openui/issues/391), [Tambo](https://github.com/tambo-ai/tambo/issues/2374)), confirmations the stream can't skip ([A2UI](https://github.com/a2ui-project/a2ui/issues/1958)), and a readable version of a screen ([json-render](https://github.com/vercel-labs/json-render/issues/298), [OpenUI](https://github.com/thesysdev/openui/issues/681), [A2UI](https://github.com/a2ui-project/a2ui/issues/2055)).
- **It comes before app-defined components (Step 20),** which can then use the same validation for their own fields, and it improves the MCP bridge (Step 18): hosts that can't draw views get the screen as text.
- **It's the first real format change** since the format got its own version, so it also proves the versioning rules: older apps keep working, and show a fallback only where a line uses something new.

## Who benefits

- **Developers** get validated forms and safe confirmations without writing them, on web, iPhone and Android at once, and a text version of any screen for logs, tests and hosts without views.
- **The people using their apps** see what's wrong with a field before they press anything, and get a confirmation they can trust before a payment or a deletion: drawn by the app, never by the model.
- **Organisations** can require confirmation for chosen actions and know the model can't remove it, and can keep readable records of what was shown.

## What it adds

**A. Field validation**, declared in the stream:
```
$email = ""
email = Input($email, label="Email", required=true, format="email")
$bio = ""
bio = Input($bio, label="Short bio", maxLength=160, lines=3)
$size = ""
size = Select($size, label="Size", options=["S", "M", "L"], required=true)
$terms = false
terms = Switch($terms, label="I accept the terms", required=true)
```
The renderer checks each field, shows a short message in its own words under it, and keeps a governed Button from running while any field its McpMutation's params read is invalid. The server still checks the tool's schema, as now: validation is for the person, not the security boundary.

**B. Confirmations**, set by the app, never by the stream:
```ts
<OmniRenderer confirm={{ "payments.confirm": "Pay {amount} now?", "account.delete": "Delete your account? This can't be undone." }} … />
```
Pressing a button for one of these tools opens the renderer's own dialog with that text, filled in from the action's params as plain text. Only "Confirm" sends the action. The stream can't turn it off, change its words or draw it.

**C. Screens as text:** `describeScreen(document)` in `@omni-ir/core` returns a plain-text outline of a screen (headings, text, fields with their labels, buttons, table rows, chart values), without what the person typed unless asked. The MCP bridge adds it to `show_screen`'s result, so hosts that can't draw views still show something useful and the model knows what's on screen.

## Decisions: pros, cons and trade-offs

**1. Which rules: a small fixed set** (recommended): `required` on Input, DateInput, Select and Switch; `format` on Input (`"email"`, `"number"`, `"phone"`, `"url"`); `minLength` and `maxLength` on Input; DateInput's existing `min` and `max` enforced.
- *Pros:* covers most forms; every rule is a value from a list, so the model can't write logic; the same on three platforms.
- *Cons:* no custom rules (a postcode format, "must match the other field").
- *Alternative:* a `pattern` prop with a regular expression (flexible, but a regular expression is a small program from the model: it can be wrong, and a crafted one can freeze the screen).
- *Trade-off:* custom rules stay in the tool's schema on the server, which already rejects bad values with a message.

**2. Which button a field blocks: the one whose McpMutation reads the field's state** (recommended).
- *Pros:* no new syntax or component; precise: a search box doesn't block an unrelated "Save" on the same screen.
- *Cons:* a field that no action reads is checked and marked but blocks nothing.
- *Alternatives:* a new `Form` component that groups fields and a button (clear, but a new component and more for the model to get right); block every button on the screen (simple, but wrong for screens with several actions).
- *Trade-off:* the link already exists in every governed action.

**3. When messages show: after the person leaves a field, and on every field when they press the button** (recommended).
- *Pros:* no red errors while someone is still typing; nothing is missed on press; the usual pattern on all three platforms.
- *Cons:* a mistake shows only after leaving the field.
- *Alternative:* check on every keystroke (immediate, but noisy and harder for screen readers).
- *Trade-off:* calm forms, with nothing slipping through on press.

**4. A new format version, `0.8`** (recommended, as the versioning rules require).
- *Pros:* honest: older parsers can't read the new props, and the version marker tells them (`newer_version`, "the app needs an update"); everything else on the screen still shows.
- *Cons:* an app on format `0.5` shows a fallback for a field that uses a new prop, until it updates.
- *Alternative:* older parsers could ignore unknown props (no fallback, but it would end the catalog's strictness, which is what stops a model inventing props).
- *Trade-off:* the server's system prompt describes what the server's format accepts, so the reference server and the apps from the same release always agree.

**5. Confirmations are the app's, keyed by tool, with text it writes** (recommended).
- *Pros:* the model can't remove, weaken or reword them; the same words on every screen that uses the tool; params fill the text as plain text, once, so nothing in them is read as a placeholder or markup (as `strings.ts` already does).
- *Cons:* the app writes one sentence per tool it wants confirmed.
- *Alternatives:* a `confirm=true` prop the model sets on a Button (flexible, but a model can leave it out, so it can't be relied on); confirmation text in the tool registry (shared with the server, but it changes the registry's type for every app).
- *Trade-off:* a guarantee needs to come from the app; the model may still put a sentence of its own on the screen, but it can't stand in for the real dialog.

**6. Confirmation is a promise of the renderer, not the server** (recommended).
- *Pros:* simple; nothing new on the wire; MCP hosts can add their own approval on top.
- *Cons:* a modified client could skip the dialog; the server can't prove a person confirmed.
- *Alternative:* a signed confirmation token the server checks (provable, but needs keys, expiry and a second round trip, for little gain while the server already checks who, what and the key).
- *Trade-off:* the server stays the security boundary (who may do what); the dialog protects the person from slips and misleading screens. Said plainly in the spec.

**7. Screens as text: TypeScript first, values hidden by default** (recommended).
- *Pros:* serves the MCP bridge, logs and tests now; leaving out what the person typed keeps personal data away from the model and logs by default (as Step 15 decided).
- *Cons:* Swift and Kotlin apps don't get it yet; it's an outline, not a full rendering.
- *Alternatives:* all three platforms now (consistent, but three times the work for a feature mainly used on servers); Markdown output (richer, but Markdown can carry links and markup that a host might render).
- *Trade-off:* plain text, where it's needed today; Swift and Kotlin when an app asks.

**8. Validation and confirmations on all three platforms in this step** (recommended).
- *Pros:* a stream behaves the same everywhere, as the conformance suite promises; no app is left with fields that look required but aren't checked.
- *Cons:* the biggest part of the work; the SwiftUI and Compose parts build only on CI.
- *Alternative:* web first, native later (faster, but a format change that only one renderer honours breaks the promise).
- *Trade-off:* a few more days for one behaviour everywhere.

## Cost and risk

- **Cost:** none: no model is called; tests and conformance cases use fixed streams.
- **Risk:** the first format bump. The fingerprint test fails until `FORMAT_VERSION` is `0.8`, the marker and the server's check follow it, and the compatibility table in the versioning rules is checked again with a `0.5` client against a `0.8` stream (the new props become fallbacks with `newer_version`; the rest of the screen shows).

## Task checklist

Work on branch `wip/forms`. Each part starts with failing tests (constraint 4).

**A. Field validation** *(tests first)*
- [x] A.1 The new props in the schema (`required`, `format`, `minLength`, `maxLength`), with cross-prop rules (for example `minLength` ≤ `maxLength`); conformance cases; `schema.json`, Swift and Kotlin generated schemas
- [x] A.2 One shared definition of each check and its message key, with the renderer's new English words (`required`, `invalidEmail`, …) in `strings.ts`, generated into `OmniStrings`
- [x] A.3 Web: messages under fields, governed buttons blocked by the fields their params read, announced to screen readers
- [x] A.4 iOS and Android: the same, on CI; the demo apps' UI tests cover a blocked and an unblocked button

**B. Confirmations** *(tests first)*
- [x] B.1 The `confirm` option and its plain-text template on all three renderers; the action runs only on Confirm
- [x] B.2 Tests that a stream can't skip or alter it (no prop, no line, no param changes it)

**C. Screens as text** *(tests first)*
- [x] C.1 `describeScreen` in `@omni-ir/core`, values hidden by default
- [x] C.2 The MCP bridge adds it to `show_screen`'s result

**D. Format version, spec and docs**
- [x] D.1 `FORMAT_VERSION` `0.8`, the fingerprint, the system prompt and the MCP guide; a `0.5` client against a `0.8` stream, tested
- [x] D.2 SPEC.md: the new props' rules (section 5), renderer rules for validation and confirmations (sections 8 and 9), conformance coverage; guides; CHANGELOG
- [x] D.3 The decision log: this step's entry and decisions

**E. Review and release** *(checkpoint: you review)*
- [x] E.1 A short review page with screenshots on web, iPhone and Android (CI)
- [x] E.2 Merge with your approval
- [ ] E.3 Release: a separate go-ahead from you

## What I need from you

Approval of the plan, or changes to any of the eight decisions.
