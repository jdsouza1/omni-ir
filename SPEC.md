# Omni-IR Specification

**Version 0.3 (draft)** · Apache-2.0

Omni-IR is a text format that an AI model writes to describe a user interface, one short line at a time, and that a trusted client renders with its own components as the lines arrive. This document says exactly what a stream may contain and how a conforming parser and renderer must treat it. It describes what is implemented and tested in this repository; nothing here is aspirational.

The words MUST, MUST NOT, SHOULD, SHOULD NOT and MAY are requirements as defined in RFC 2119. Rules with an id in brackets, such as **[3.2]**, are checked by the conformance suite in [`conformance/`](conformance/README.md).

## 1. Overview and trust model

- The **model** that writes the stream is untrusted. Anything it writes may be wrong, incomplete or hostile.
- The **renderer** is trusted code in the app. It decides what every component looks like, which components exist and which actions may run.
- The stream can only **choose** among components, props and values the app allows. It can't add markup, styles, scripts or new components, and it can't run an action the app hasn't registered.
- A renderer shows a screen **while it streams**: each line is applied as soon as it arrives, and anything referenced but not yet arrived shows as a placeholder.

A short example:

```
root = Card([title, amount, pay])
title = Heading("Confirm payment")
$amount = 42.50
amount = Text($amount, format="currency", currency="USD")
pay = Button("Pay now", action="pay")
payIt = McpMutation(pay, tool="payments.confirm", params={amount: $amount, note: ""})
```

## 2. Terms

- **Stream:** the whole sequence of characters a model writes for one screen.
- **Line:** the text between line endings. Each line holds at most one statement.
- **Statement:** a line that assigns something: a component (`id = Component(…)`) or a piece of state (`$key = value`).
- **Component:** a node of the screen, such as a Card or a Button. Its **id** names it; its **props** configure it; its **children** are other components, by id.
- **State:** a named value such as `$amount`, declared by the stream and, for Inputs, edited by the person using the screen.
- **Reference:** an id or `$key` used in another statement. It may refer to a line that hasn't arrived yet.
- **Catalog:** the fixed set of components and their allowed props (section 6).
- **Asset registry:** the app's list of pictures, by name. Streams can only show pictures named in it ([5.17]).
- **Tool registry:** the app's list of backend actions that may run, each with a schema for its parameters.
- **Issue:** an error or warning found in a stream, identified by a code (section 7).

## 3. The stream

- **[3.1]** A stream is UTF-8 text. A parser MUST decode it correctly when a multi-byte character is split across network chunks. A parser SHOULD replace an invalid byte sequence with U+FFFD (`�`) and carry on, rather than stop.
- **[3.2]** A line ends at a line feed (`\n`). A carriage return (`\r`) immediately before it is removed, so `\r\n` endings behave the same as `\n`.
- **[3.3]** The result MUST NOT depend on how the stream was split into chunks. Parsing the same text in one chunk, byte by byte, or in any other pieces MUST give the same document and the same issues.
- **[3.4]** When the stream ends, a final line without a line ending MUST still be processed.
- **[3.5]** Lines are numbered from 1, counting every line, including blank lines and comments.
- **[3.6]** A line that is empty, contains only spaces and tabs, or whose first non-space character is `#` is ignored.
- **[3.7]** A line longer than the line length limit (section 12) is reported as `line_too_long` and skipped. Processing resumes with the next line. A parser SHOULD NOT keep an over-long line in memory while waiting for its end.
- **[3.8]** An issue in one line never stops the stream. Later lines are processed normally.

## 4. Grammar

The grammar below is in EBNF. Spaces and tabs MAY appear at the start and end of a line and between any two tokens, and are otherwise ignored.

```ebnf
line          = statement , [ comment ] ;
comment       = "#" , { any character } ;
statement     = component-statement | state-statement ;
component-statement = id , "=" , call ;
state-statement     = state-key , "=" , value ;

call          = name , "(" , [ arguments ] , ")" ;
arguments     = argument , { "," , argument } , [ "," ] ;
argument      = value | ( prop-name , "=" , value ) ;     (* positional arguments come first *)

value         = string | number | "true" | "false" | "null"
              | id | state-key | list | object | call ;   (* a call here is always rejected: see [4.12] *)
list          = "[" , [ value , { "," , value } , [ "," ] ] , "]" ;
object        = "{" , [ entry , { "," , entry } , [ "," ] ] , "}" ;
entry         = ( identifier | string ) , ":" , value ;

id            = identifier ;
name          = identifier ;                              (* a component name, e.g. Text *)
prop-name     = identifier ;
identifier    = letter-or-underscore , { letter-or-underscore | digit } ;   (* ASCII letters and digits *)
state-key     = "$" , identifier ;
number        = [ "-" ] , ( digits , [ "." , { digit } ] | "." , digits ) , [ ( "e" | "E" ) , [ "+" | "-" ] , digits ] ;
string        = '"' , { character | escape } , '"' ;
escape        = "\" , any character ;
```

- **[4.1]** A statement is either `id = Component(arguments)` or `$key = value`. The `=` MUST NOT be followed by a second `=`.
- **[4.2]** Spaces and tabs at the start or end of a line, or between tokens, don't change its meaning.
- **[4.3]** Positional arguments MUST come before named ones. A positional argument after a named one is a `syntax` error. A trailing comma is allowed in argument lists, lists and objects.
- **[4.4]** The right side of a component statement MUST be exactly one call. Anything else (a bare value, or extra text after the closing parenthesis other than a comment) is a `syntax` error.
- **[4.5]** Strings use double quotes. Inside a string, `\"` is a double quote, `\\` is a backslash and `\n` is a line break. Single-quoted strings are a `syntax` error.
- **[4.6]** Any other backslash sequence, such as `\d`, is kept as literal text (the backslash and the character) and reported as an `unknown_escape` warning. The line is still accepted.
- **[4.7]** A string without its closing quote is an `unterminated_string` error. A string whose last character before the end of the line is an escaped quote (`\"`) is unterminated.
- **[4.8]** Inside a string every character is text: `#`, `$`, `,`, `(`, `)`, `[`, `]`, `{`, `}` and `=` have no special meaning. Outside a string, `#` starts a comment that runs to the end of the line.
- **[4.9]** A number MUST NOT be followed directly by a letter, digit or underscore (`1abc` is a `syntax` error). Numbers are decimal and MAY use an exponent. A number too large to represent as a finite 64-bit float, such as `1e999`, is an `invalid_props` error wherever it's used. Negative zero, in any spelling (`-0`, `-0.0`, `-0e5`) or from a value too small to represent (`-1e-400`), is the number 0.
- **[4.10]** An id MUST be an identifier (`1abc = …` is a `syntax` error) and MUST NOT be one of the reserved words `true`, `false`, `null`, `__proto__`, `constructor` or `prototype` (an `invalid_props` error). In a value, `true`, `false` and `null` are literals, not ids.
- **[4.11]** Lists and objects follow the grammar above. Where each kind of value is allowed is set by the catalog (section 6): lists of ids only for children, objects only for McpMutation params.
- **[4.12]** A call inside another statement's values, such as `root = Card([Heading("Hi")])`, is a `not_flat` error. Every component MUST be defined on its own line and referred to by id.
- **[4.13]** Lists, objects and calls inside a value MUST NOT be nested more than 8 levels deep (`[[1]]` is 2 levels); deeper nesting is a `syntax` error. The catalog never needs more than 2, and the limit lets a parser reject runaway nesting before it uses unbounded memory or stack.

The known limit of [4.5]: a Windows path written as `"C:\new"` contains the valid escape `\n` and becomes a line break. Models SHOULD be told to write `\\` for every backslash.

## 5. Meaning of a document

### Components, ids and children

- **[5.1]** The screen's top component MUST have the id `root`. If no `root` line has arrived by the end of the stream, that is a `missing_root` error. If `root` is defined as an McpMutation instead of a component, that is a `root_not_component` error, reported on root's line.
- **[5.2]** A component's children are the ids in its children list, in display order. A child MAY be referenced before its own line arrives. Until it arrives it is **pending**, and a renderer shows a placeholder (section 8).
- **[5.3]** Each id and each `$key` MUST be assigned at most once. A second assignment is a `duplicate_id` error; the first assignment stays unchanged.
- **[5.4]** A component MUST have at most one parent. Listing it as a child of a second component is a `multiple_parents` error. Listing the same id twice in one children list is a `duplicate_child` error.
- **[5.5]** A component MUST NOT contain itself through its children (`cycle`), and `root` MUST NOT be anyone's child (`root_as_child`).
- **[5.6]** A children list MUST name components only. Naming an McpMutation is a `child_not_component` error.
- **[5.7]** A line rejected with an error has no effect, as if it had never been sent. For example, a later reference to the id it would have defined is still pending, and becomes `dangling_ref` if nothing else defines it.

### Props

- **[5.8]** Positional arguments fill the component's positional props in order (the Position column in section 6). Giving more positional arguments than the component has, giving a prop both positionally and by name, or naming the same prop twice is an `invalid_props` error.
- **[5.9]** A component name that isn't in the catalog is an `unknown_component` error. A prop the component doesn't have, or a value the prop doesn't allow, is an `invalid_props` error.

### State

- **[5.10]** `$key = value` declares state. The value MUST be a string, number, `true`, `false` or `null`; anything else is an `invalid_props` error.
- **[5.11]** A prop MAY use a `$key` instead of a literal where section 6 allows `$state`. Every `$key` used MUST be declared by the end of the stream; otherwise it is a `missing_state` error. A component whose state isn't declared yet is pending, like a missing child.
- **[5.12]** An Input's first argument is the `$key` it edits, and that state MUST hold text. Binding an Input to state that holds anything else is an `input_state_type` error, reported on whichever of the two lines arrives second.

### Images, lists and dates

- **[5.17]** An Image's `asset`, and a ListItem's `image`, MUST name a picture in the app's **asset registry**. A value that isn't shaped like an asset name (lowercase letters, digits and hyphens), such as a URL, is an `invalid_props` error; a well-formed name the registry doesn't have is an `unknown_asset` error. A stream can never make a renderer load a picture from a location it supplies.
- **[5.18]** A List MUST contain only ListItems, and a ListItem MUST be a child of a List. Breaking either rule is a `list_mismatch` error, reported on whichever of the two lines arrives second.
- **[5.19]** A DateInput's first argument is the `$key` it edits, and that state MUST hold a date written `"YYYY-MM-DD"` or the empty string. Anything else is an `input_state_type` error, reported as in [5.12].

### Choices, tables and tabs

- **[5.20]** A Select's first argument is the `$key` it edits, and that state MUST hold text; a Switch's first argument is the `$key` it edits, and that state MUST be `true` or `false`. Anything else is an `input_state_type` error, reported as in [5.12]. A Select's value that isn't one of its `options` is not an error: the Select shows nothing chosen.
- **[5.21]** A Table MUST contain only TableRows, and a TableRow MUST be a child of a Table. Each TableRow MUST have exactly as many cells as its Table has columns. Breaking any of these is a `table_mismatch` error, reported on whichever of the two lines arrives second.
- **[5.22]** A Tabs MUST contain only Tab components, and a Tab MUST be a child of a Tabs. Breaking either rule is a `tabs_mismatch` error, reported on whichever of the two lines arrives second.

### Charts

- **[5.23]** A BarChart or LineChart MUST contain only Series, and a PieChart only Slices; a Series MUST be a child of a BarChart or LineChart, and a Slice of a PieChart. Each Series MUST have exactly as many values as its chart has labels. Breaking any of these is a `chart_mismatch` error, reported on whichever of the two lines arrives second.
- **[5.24]** Charts carry data only: a title, labels, names and numbers, and an optional number `format`. Like every component, a chart, Series or Slice accepts only the props in section 6, so a prop such as `color`, `style`, `animation` or `tooltip` is an `invalid_props` error. A Slice's value MUST NOT be negative.

### Actions

- **[5.13]** A Button with an `action` triggers a backend action. It MUST be governed by exactly one McpMutation by the end of the stream; otherwise it is an `ungoverned_mutation` error. A second McpMutation for the same Button is a `duplicate_mutation` error.
- **[5.14]** An McpMutation's `tool` MUST be exactly a name in the app's tool registry, compared character by character. A value that isn't shaped like a tool name (ASCII, dot-separated segments that start with a lower-case letter), such as one with a look-alike letter from another alphabet, an invisible or full-width character, a space or an upper-case first letter, is an `invalid_props` error; a well-formed name the registry doesn't have, such as a misspelling, is an `unknown_tool` error. Either way the line is rejected, so its Button stays ungoverned.
- **[5.15]** An McpMutation's `target` MUST be a Button with an `action`. A target that never arrives is `dangling_ref`; a target without an action is `mutation_target_not_interactive`.
- **[5.16]** McpMutation `params` is an object whose keys are identifiers (not reserved words) and whose values are literals or `$key` references. A component id as a value, a repeated key or a reserved key is an `invalid_props` error.

## 6. Component catalog (v0.3)

A component has exactly the props listed; any other prop is rejected ([5.9]). "Values" lists what each prop accepts; `$state` means a `$key` reference ([5.11]), and `id` means a component id. The styling of every value (what `"muted"` or `"primary"` looks like) belongs to the renderer. In each signature, positional props are written bare in their order, props written `name=…` can only be given by name, and props in [brackets] are optional: `Image(asset, alt=…, [ratio=…])` is written `Image("cabin-pines", alt="A cabin", ratio="16:9")`.

<!-- generated:components -->
### Stack

```
Stack(children, [direction=…], [gap=…], [align=…])
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `children` | 1 | yes | [id, …] (max 200) |
| `direction` | named only | no | "row" \| "column" |
| `gap` | named only | no | "none" \| "sm" \| "md" \| "lg" |
| `align` | named only | no | "start" \| "center" \| "end" \| "stretch" |

### Card

```
Card(children, [title=…])
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `children` | 1 | yes | [id, …] (max 200) |
| `title` | named only | no | text (max 2000) \| $state |

### Heading

```
Heading(text, [level=…])
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `text` | 1 | yes | text (max 2000) \| $state |
| `level` | named only | no | 1 \| 2 \| 3 |

### Text

```
Text(text, [format=…], [currency=…], [tone=…])
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `text` | 1 | yes | text (max 2000) \| number \| $state |
| `format` | named only | no | "plain" \| "currency" \| "date" |
| `currency` | named only | no | 3-letter currency code |
| `tone` | named only | no | "default" \| "muted" \| "strong" |

### Input

```
Input(value, label=…, [placeholder=…], [lines=…])
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `value` | 1 | yes | $state |
| `label` | named only | yes | text (min 1, max 200) |
| `placeholder` | named only | no | text (max 200) |
| `lines` | named only | no | whole number 1-10 |

### Button

```
Button(label, [action=…], [variant=…])
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `label` | 1 | yes | text (max 2000) \| $state |
| `action` | named only | no | text (max 64, matching /^[a-z][A-Za-z0-9_]*$/) |
| `variant` | named only | no | "primary" \| "secondary" \| "danger" |

### Divider

```
Divider()
```

No props.

### Badge

```
Badge(text, [tone=…])
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `text` | 1 | yes | text (max 2000) \| $state |
| `tone` | named only | no | "neutral" \| "success" \| "warning" \| "danger" |

### Skeleton

```
Skeleton([lines=…])
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `lines` | named only | no | whole number 1-6 |

### Image

```
Image(asset, alt=…, [ratio=…])
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `asset` | 1 | yes | image name (max 64) |
| `alt` | named only | yes | text (min 1, max 300) |
| `ratio` | named only | no | "1:1" \| "4:3" \| "3:2" \| "16:9" |

### Rating

```
Rating(value, [max=…])
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `value` | 1 | yes | number \| $state |
| `max` | named only | no | whole number 1-10 |

### DateInput

```
DateInput(value, label=…, [min=…], [max=…])
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `value` | 1 | yes | $state |
| `label` | named only | yes | text (min 1, max 200) |
| `min` | named only | no | date "YYYY-MM-DD" |
| `max` | named only | no | date "YYYY-MM-DD" |

### List

```
List(children)
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `children` | 1 | yes | [id, …] (max 200) |

### ListItem

```
ListItem(title, [detail=…], [trailing=…], [image=…])
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `title` | 1 | yes | text (max 2000) \| $state |
| `detail` | named only | no | text (max 2000) \| $state |
| `trailing` | named only | no | text (max 2000) \| $state |
| `image` | named only | no | image name (max 64) |

### Message

```
Message(text, from=…)
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `text` | 1 | yes | text (max 2000) \| $state |
| `from` | named only | yes | "user" \| "assistant" |

### Select

```
Select(value, label=…, options=…, [placeholder=…])
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `value` | 1 | yes | $state |
| `label` | named only | yes | text (min 1, max 200) |
| `options` | named only | yes | [text (min 1, max 200), …] (max 50) |
| `placeholder` | named only | no | text (max 200) |

### Switch

```
Switch(value, label=…)
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `value` | 1 | yes | $state |
| `label` | named only | yes | text (min 1, max 200) |

### Table

```
Table(columns, children)
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `columns` | 1 | yes | [text (min 1, max 200), …] (max 8) |
| `children` | 2 | yes | [id, …] (max 200) |

### TableRow

```
TableRow(cells)
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `cells` | 1 | yes | [text (max 2000) \| number, …] (max 8) |

### Tabs

```
Tabs(children)
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `children` | 1 | yes | [id, …] (max 200) |

### Tab

```
Tab(label, children)
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `label` | 1 | yes | text (min 1, max 200) |
| `children` | 2 | yes | [id, …] (max 200) |

### Notice

```
Notice(text, [tone=…], [title=…])
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `text` | 1 | yes | text (max 2000) \| $state |
| `tone` | named only | no | "info" \| "success" \| "warning" \| "danger" |
| `title` | named only | no | text (max 2000) \| $state |

### BarChart

```
BarChart(title, labels, children, [format=…], [currency=…])
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `title` | 1 | yes | text (min 1, max 200) |
| `labels` | 2 | yes | [text (min 1, max 60), …] (max 24) |
| `children` | 3 | yes | [id, …] (max 6) |
| `format` | named only | no | "number" \| "currency" \| "percent" |
| `currency` | named only | no | 3-letter currency code |

### LineChart

```
LineChart(title, labels, children, [format=…], [currency=…])
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `title` | 1 | yes | text (min 1, max 200) |
| `labels` | 2 | yes | [text (min 1, max 60), …] (max 24) |
| `children` | 3 | yes | [id, …] (max 6) |
| `format` | named only | no | "number" \| "currency" \| "percent" |
| `currency` | named only | no | 3-letter currency code |

### PieChart

```
PieChart(title, children, [format=…], [currency=…])
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `title` | 1 | yes | text (min 1, max 200) |
| `children` | 2 | yes | [id, …] (max 8) |
| `format` | named only | no | "number" \| "currency" \| "percent" |
| `currency` | named only | no | 3-letter currency code |

### Series

```
Series(name, values)
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `name` | 1 | yes | text (min 1, max 200) |
| `values` | 2 | yes | [number, …] (max 24) |

### Slice

```
Slice(name, value)
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `name` | 1 | yes | text (min 1, max 200) |
| `value` | 2 | yes | number |
<!-- /generated:components -->

### McpMutation

```
McpMutation(target, tool=…, [params=…])
```

| Prop | Position | Required | Values |
|---|---|---|---|
| `target` | 1 | yes | id of a Button with an `action` |
| `tool` | named only | yes | a tool name in the app's registry, matching `/^[a-z][A-Za-z0-9_]*(\.[a-z][A-Za-z0-9_]*)+$/` (for example `payments.confirm`) |
| `params` | named only | no | `{key: value or $state, …}` ([5.16]) |

An McpMutation isn't displayed. It only approves one action for its Button.

## 7. Validation and errors

- **[7.1]** Issues are found at three stages: **when the line arrives** (the line is checked on its own and against the lines accepted so far), **at end of stream**, and **in the renderer** while the screen is used. An error found when a line arrives rejects that line ([5.7]). A warning never rejects a line.
- **[7.2]** Each issue is reported with the number of the line it concerns. End-of-stream issues are reported on the line that defined the responsible component: `dangling_ref` on the component or McpMutation holding the reference, `missing_state` on the component or McpMutation using the key, `ungoverned_mutation` on the Button, `mutation_target_not_interactive` on the McpMutation, and `root_not_component` on root's line. `missing_root` has no line.
- **[7.3]** At end of stream every reference that is still pending becomes **missing**. A renderer shows a missing component as a fallback (section 8).
- **[7.4]** Implementations MUST report issues with the codes below, so tools and tests can compare them. The wording of messages is free.

<!-- generated:issues -->
| Code | Severity | Found | Meaning |
|---|---|---|---|
| `syntax` | error | when the line arrives | The line doesn't follow the grammar. |
| `unterminated_string` | error | when the line arrives | A string has no closing double quote. |
| `line_too_long` | error | when the line arrives | The line is longer than the line length limit. |
| `not_flat` | error | when the line arrives | A component call appears inside another statement's arguments. |
| `unknown_component` | error | when the line arrives | The component isn't in the catalog. |
| `invalid_props` | error | when the line arrives | An argument or value breaks the component's rules: wrong type, unknown prop, value not allowed, too long or repeated. |
| `unknown_tool` | error | when the line arrives | An McpMutation names a tool that isn't in the app's tool registry. |
| `duplicate_id` | error | when the line arrives | An id or $state key is assigned a second time. The first assignment stays. |
| `duplicate_child` | error | when the line arrives | The same id appears twice in one children list. |
| `multiple_parents` | error | when the line arrives | A component is listed as a child of a second component. |
| `cycle` | error | when the line arrives | A component would contain itself through its children. |
| `root_as_child` | error | when the line arrives | root is listed as a child. |
| `child_not_component` | error | when the line arrives | A children list names an McpMutation. |
| `unknown_asset` | error | when the line arrives | An Image or ListItem names a picture that isn't in the app's asset registry. |
| `input_state_type` | error | when the line arrives | An Input or Select is bound to state that doesn't hold text, a DateInput to state that isn't a YYYY-MM-DD date or empty, or a Switch to state that isn't true or false. |
| `list_mismatch` | error | when the line arrives | A List contains something other than ListItems, or a ListItem is outside a List. |
| `table_mismatch` | error | when the line arrives | A Table contains something other than TableRows, a TableRow is outside a Table, or a row's cell count differs from the table's columns. |
| `tabs_mismatch` | error | when the line arrives | A Tabs contains something other than Tab, or a Tab is outside a Tabs. |
| `chart_mismatch` | error | when the line arrives | A BarChart or LineChart contains something other than Series, a PieChart something other than Slices, a Series or Slice is outside its kind of chart, or a Series' number of values differs from its chart's labels. |
| `duplicate_mutation` | error | when the line arrives | A button that already has an McpMutation gets a second one. |
| `dangling_ref` | error | at end of stream | A referenced component or McpMutation target never arrived. |
| `missing_state` | error | at end of stream | A $state key is used but never declared. |
| `missing_root` | error | at end of stream | No root line arrived. |
| `root_not_component` | error | at end of stream | root is defined, but as an McpMutation instead of a component. |
| `ungoverned_mutation` | error | at end of stream | A button with an action has no McpMutation. |
| `mutation_target_not_interactive` | error | at end of stream | An McpMutation targets a component that has no action. |
| `mutation_blocked` | error | in the renderer | When pressed, the action's tool or params failed the registry's checks, so nothing was sent. |
| `node_crashed` | error | in the renderer | A component failed while rendering. Only its own slot shows a fallback. |
| `handler_failed` | error | in the renderer | An action's handler failed or the server refused it. |
| `unknown_escape` | warning | when the line arrives | A backslash sequence other than \", \\ or \n was kept as literal text. The line is still accepted. |
<!-- /generated:issues -->

## 8. Renderer requirements

These rules apply to anything that displays an Omni-IR screen. There are three reference renderers: React (`@omni-ir/react`), SwiftUI (`OmniIRSwiftUI`, in `swift/`) and Jetpack Compose (`omni-ir-compose`, in `android/`). The React renderer's tests are listed after each group; the SwiftUI renderer's are in `swift/Tests/` and the iOS demo's UI tests, and the Compose renderer's in `android/*/src/test` and the Android demo's emulator tests.

**Content and styling**
- A renderer MUST display strings only as text. It MUST NOT interpret any value as markup, a style, a script or a URL to load.
- A renderer MUST use only its own catalog components, and MUST decide all styling itself. Enum values such as `tone="muted"` select among the renderer's own styles.
- A Text with `format="currency"` and a number SHOULD be formatted as money in the given currency (default USD). A Text with `format="date"` SHOULD show a date-only value such as `"2026-09-30"` as that calendar day in every time zone, and SHOULD show the original text if it isn't a valid date.
- *Tested by:* `tests/renderer.test.tsx`, `tests/fixtures.render.test.tsx`.

**While streaming**
- A pending component (section 5) MUST be shown as a placeholder in its place. When it arrives, it MUST replace the placeholder in the same place.
- A missing component ([7.3]) MUST be shown as a fallback of similar size in its place, so the rest of the layout doesn't move.
- A renderer MUST keep each component's identity by its id while the stream grows, so components already shown don't restart (for example, an Input keeps its focus and cursor while new lines arrive).
- *Tested by:* `tests/renderer.test.tsx`, `tests/e2e.payment.test.tsx`.

**Input and state**
- Typing into an Input, choosing a date in a DateInput, choosing an option in a Select or flipping a Switch MUST update its `$key`, and every component using that key MUST show the new value. Editing state is local and MUST NOT call the backend by itself.
- A Select whose value isn't one of its options MUST show nothing chosen (its `placeholder`, if any).
- *Tested by:* `tests/renderer.test.tsx`, `tests/components.media.test.tsx`, `tests/components.expansion.test.tsx`.

**Charts**
- A renderer MUST draw charts with its own colours, sizes, axes, legend and any animation; nothing in the stream chooses them. It SHOULD use a palette that stays distinguishable for colour-blind viewers, in light and dark, and MUST NOT rely on colour alone: a chart with two or more Series or any Slices MUST show a legend naming each one.
- Values shown on hover, focus or tap are written by the renderer from the data, using the chart's `format`. A renderer MUST expose each chart's title and values to assistive technology (for example a data table that screen readers read, or a label on each bar, point or slice).
- A Series or Slice that hasn't arrived MUST NOT stop the rest of the chart from drawing; the chart grows as they arrive.
- *Tested by:* `tests/components.charts.test.tsx`.

**Tables and tabs**
- A Table MUST present its column headings and rows as a table to assistive technology. On a screen too narrow for its columns it SHOULD scroll sideways rather than squeeze or cut off cells. Number cells SHOULD be aligned to the end.
- Tabs MUST show the first Tab's content until the viewer picks another Tab. Which Tab is open is the viewer's own choice: it is not `$state`, and nothing in the stream changes it. A renderer MUST keep the open Tab while the stream grows. Tabs MUST be reachable and switchable from the keyboard where the platform has one.
- *Tested by:* `tests/components.expansion.test.tsx`.

**Pictures and accessibility**
- A renderer MUST take an Image's picture only from the app's asset registry, and MUST NOT load a picture from any location written in the stream. It SHOULD send no referrer when loading pictures.
- If the renderer's registry doesn't have the named picture, it MUST show the Image's `alt` text in its place.
- An Image MUST expose its `alt` text to assistive technology. A ListItem's thumbnail is decorative, because its title describes it.
- A Rating MUST expose its value and maximum as text, such as "Rated 4.96 out of 5". A Message SHOULD tell assistive technology who sent it.
- *Tested by:* `tests/components.media.test.tsx`.

**Failures**
- A failure in one component MUST NOT break the rest of the screen.
- Where the platform can catch a component that fails while rendering (as React's error boundaries do), the renderer MUST replace only that component with a fallback, and SHOULD retry it when its data changes.
- Where the platform can't catch it (as in SwiftUI and Jetpack Compose, where a failing view stops the app), the renderer MUST make rendering a component unable to fail: it shows only props that passed validation, and never stops on a value from the stream.
- *Tested by:* `tests/renderer.test.tsx` (React). The SwiftUI and Compose views take only validated props and contain no forced unwraps (`!`, `try!`, `as!` in Swift; `!!` in Kotlin), which `tests/nativeCatalogs.test.ts` enforces.

## 9. Actions

- A Button with an `action` MUST be disabled until its McpMutation has arrived, and stays disabled if none arrives ([5.13]).
- When the person presses a governed Button, the renderer MUST build the params by replacing each `$key` with its current value, then check the tool against the app's registry and the params against the tool's schema. If either check fails, it MUST NOT send the action, and SHOULD show that the action was blocked.
- The backend MUST check the tool and params again before running anything, because anyone can send a request that didn't come from the renderer.
- A backend that performs real actions MUST also check that the signed-in person is **allowed** to perform this action on this data. Schema checks only prove a request is well-formed.
- A Button without an `action` never contacts the backend.
- *Tested by:* `tests/renderer.test.tsx`, `tests/server.mutate.test.ts`, `tests/e2e.client.test.tsx`.

## 10. Transport (informative)

This section describes the reference server in this repository. It isn't required: an app MAY carry Omni-IR over any transport, because only the text format must be compatible.

- `POST /api/generate` with `{"prompt": "…"}` answers with Server-Sent Events. Each event's data is JSON:
  - `event: chunk` · `{"text": "…"}`, the next piece of Omni-IR text
  - `event: done` · `{"stopReason": "end_turn" | "max_tokens" | "refusal", "model": "…", "ms": 1234}`
  - `event: error` · `{"code": "…", "message": "…", "retryable": true | false}`
  - A comment line `: ping` is sent while nothing else is, to keep the connection open.
- `POST /api/mutate` with `{"tool": "…", "params": {…}}` answers `200` with `{"ok": true, "tool": "…", "result": {…}}`, `403` for an unknown tool, `422` with `issues` for invalid params, `400` for a malformed request, `429` when rate limited and `500` when the tool fails.

## 11. Security considerations

What the format prevents:
- **No code or markup from the model.** There is no syntax for HTML, styles or scripts, and renderers display strings only as text.
- **No invented components or props.** The catalog is fixed by the app ([5.9]).
- **No pictures from the model.** Images come only from the app's asset registry ([5.17]), so a stream can't load a tracking pixel, leak data through a URL, or show an arbitrary picture from the web.
- **No unapproved actions.** Actions need a registered tool and pass three checks: in the parser ([5.14]), in the renderer and on the backend (section 9).
- **Damage stays contained.** A bad line is rejected on its own ([3.8]), and a failing component only affects its own slot (section 8).

What the app must still handle:
- **Authorization** of every real action (section 9).
- **Rate and cost limits** on generation.
- **The content of text.** A model can still write misleading words, such as a fake warning or a wrong price. Apps SHOULD treat model-written text as untrusted content, and SHOULD NOT use it for decisions without checking.
- **Prompt injection** in whatever the model reads. The format limits what an injected instruction can make the screen do, but not what it can make the screen say.

## 12. Versioning and limits

This is version 0.3, a draft. Until version 1.0, any change MAY be incompatible; changes are listed in CHANGELOG.md. A stream doesn't declare its version in v0.3.

Adding to the catalog is a change too. Because the catalog is strict ([5.9]), a parser built for an older version rejects a new component (`unknown_component`), a new prop or a new allowed value (`invalid_props`), and its renderer shows a fallback in that place. A server SHOULD therefore ask a model only for what its clients' version accepts. The reference server generates its system prompt from its own schema, so a server and its clients stay compatible by using the same version.

<!-- generated:limits -->
| Limit | Maximum |
|---|---|
| Characters in one line (UTF-16 code units, excluding the line ending) | 16,384 |
| Characters in one text value | 2,000 |
| Ids in one children list | 200 |
| Characters in a component id | 64 |
| Characters in a $state key, including the $ | 65 |
| Characters in a tool name | 128 |
| Characters in a Button action name | 64 |
| Columns in a Table, and cells in a TableRow | 8 |
| Labels in a BarChart or LineChart, and values in a Series | 24 |
| Series in a BarChart or LineChart | 6 |
| Slices in a PieChart | 8 |
| Levels of lists, objects and calls nested inside one value ([4.13]) | 8 |
<!-- /generated:limits -->

Individual props have their own limits, listed in section 6.

## 13. Examples

These examples are taken from the repository's fixtures and checked with the reference parser whenever this document is regenerated.

<!-- generated:examples -->
### Payment confirmation

Root first, state, an Input, a governed Pay button and a local Cancel button.

```
root = Card([title, merchant, amount, date, note, sep, actions])
title = Heading("Confirm payment")
merchant = Text("Blue Bottle Café, Oakland (CA)", tone="muted")
$amount = 42.50
amount = Text($amount, format="currency", currency="USD", tone="strong")
date = Text("2026-09-30", format="date")
$note = ""
note = Input($note, label="Note for merchant (optional)", placeholder="e.g. table 4, no rush")
sep = Divider()
actions = Stack([confirm, cancel], direction="row", gap="sm")
confirm = Button("Pay now", action="pay")
confirmPay = McpMutation(confirm, tool="payments.confirm", params={amount: $amount, note: $note})
cancel = Button("Cancel", variant="secondary")
```

No issues.

### Sign-in by emailed link

A form whose typed value is sent through McpMutation params.

```
root = Card([title, intro, email, actions, fine])
title = Heading("Sign in", level=1)
intro = Text("We'll email you a one-time link. No password needed.", tone="muted")
$email = ""
email = Input($email, label="Email address", placeholder="you@example.com")
actions = Stack([send], direction="row")
send = Button("Email me a link", action="sendLink")
sendLink = McpMutation(send, tool="auth.sendMagicLink", params={email: $email})
fine = Text("The link expires after 15 minutes.", tone="muted")
```

No issues.

### A stream with errors

The Pay button has an action but no McpMutation.

```
root = Card([title, amount, actions])
title = Heading("Confirm payment")
$amount = 42.50
amount = Text($amount, format="currency", currency="USD")
actions = Stack([confirm, cancel], direction="row")
confirm = Button("Pay now", action="pay")
cancel = Button("Cancel", variant="secondary")
```

Issues reported:

- line 6: `ungoverned_mutation` ("confirm" has an action but is not wrapped by an McpMutation)
<!-- /generated:examples -->

## Not yet specified

- Data-driven lists. A List's items are written out one by one; there are no loops or bindings to collections.
- A way to update or remove a component after its line has arrived. In v0.3 an id can't be reassigned ([5.3]).
- A version marker inside the stream.
- Renderers other than the web reference renderer.
