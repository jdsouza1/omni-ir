# Omni-IR Specification

**Specification 0.8 (draft) · stream format 0.5** · Apache-2.0

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
- **[3.9]** If line 1 is a comment of the form `# omni-ir MAJOR.MINOR` (spaces or tabs MAY appear before and after `#` and at the end of the line, and MUST separate `omni-ir` from the version; MAJOR and MINOR are whole numbers of any length), it is the **version marker**: the stream format the stream was written for (section 12). The numbers 0.6 and 0.7 name format 0.5: they were releases that didn't change the format, and wrote their release number. A parser built for an older format (comparing MAJOR, then MINOR, as numbers, after that substitution) MUST report a `newer_version` warning on line 1 and process the rest of the stream as usual. The same text on any other line, or in any other form, is an ordinary comment. Parsers older than 0.5 treat the marker as a comment, as [3.6] requires.

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

- **[5.25]** A stream MAY define at most 1,000 components (McpMutations included) and declare at most 1,000 `$state` keys. A line that would define one more is a `document_too_large` error, checked before the other document rules for that line; like any rejected line it has no effect ([5.7]), so the screen keeps everything it already has. A duplicate id is still `duplicate_id`. The limits keep a runaway or hostile stream from making a client hold or draw an unbounded screen; no real screen comes close.

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

## 6. Component catalog (format 0.5)

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
| `document_too_large` | error | when the line arrives | The line would define a component or $state key beyond the document size limits. |
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
| `newer_version` | warning | when the line arrives | The version marker on line 1 names a newer Omni-IR version than the parser's. The rest of the stream is processed as usual. |
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

**Versions**
- When the parser reports `newer_version` ([3.9]), a renderer SHOULD tell the person, near the screen, that the app needs an update to show all of it.
- *Tested by:* `tests/renderer.test.tsx`.

**Themes and the renderer's own words**
- Colours, fonts and shapes come only from the app: the renderer's defaults, or design tokens the app sets. Nothing in the stream chooses them, beyond picking among the catalog's own styles through enum props such as `tone`. The reference renderers share one list of tokens with light and dark defaults (`conformance/theme.json`).
- A renderer's default themes MUST give text at least 4.5:1 contrast against its background, and the edges of controls and focus indicators at least 3:1 (WCAG 2.2 AA).
- The words a renderer writes itself (placeholders read by screen readers, fallbacks, labels, the version notice) SHOULD be replaceable by the app. They MUST be shown as plain text, never as markup, and placeholders in them MUST be filled without interpreting the rest: no formatting function sees them, and a value that contains a placeholder is not filled again.
- When a press is blocked, a renderer SHOULD show the person a plain sentence, and give the details of what was wrong only to the app.
- *Tested by:* `tests/theme.test.tsx`, `tests/strings.test.tsx`; the Swift and Kotlin word tests in `swift/Tests/OmniIRSwiftUITests/StringsTests.swift` and `android/omni-ir-runtime/src/test`.

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
- It MUST check ownership against its own data, never against anything in the params: a model can write any id. Something that isn't the person's MUST get the same answer as something that doesn't exist ([10.14]), so nobody can find out which ids exist.
- An action's result SHOULD carry only what the screen needs, never other people's data, and logs SHOULD NOT hold param values, which may be personal.
- A Button without an `action` never contacts the backend.
- *Tested by:* `tests/renderer.test.tsx`, `tests/server.mutate.test.ts`, `tests/backend.api.test.ts`, `tests/e2e.client.test.tsx`.

## 10. Transport

Sections 3 to 7 define the text. This section defines how a server sends that text to a client, so that any client works with any server. An app MAY carry Omni-IR between its own server and its own clients in any other way; a server or client that says it supports the Omni-IR transport MUST follow these rules. The **server** is what produces the stream (it usually asks a model); the **client** receives it and feeds a parser. The reference server (`server/`) and the clients in `@omni-ir/react` (`generate()`), `OmniIRSwiftUI` and `omni-ir-runtime` (`OmniClient`) follow them. Language-neutral cases for clients are in `conformance/transport/`.

**Requesting a screen**
- **[10.1]** A client asks for a screen with an HTTP `POST` to the server's generate endpoint (`/api/generate` in the reference server), a JSON body `{"prompt": "…"}`, `Content-Type: application/json` and `Accept: text/event-stream`. It MAY add the query parameter `version=MAJOR.MINOR`, the stream format its parser reads (section 12). The version is in the query, not the body, so servers older than 0.5 ignore it.
- **[10.2]** A server that can't start the stream answers with an HTTP error status and the body `{"error": {"code": "…", "message": "…", "retryable": true | false}}`. It uses these codes:

  | Status | Code | Meaning |
  |---|---|---|
  | 400 | `invalid_request` | The body isn't a valid request. |
  | 400 | `unsupported_version` | The server can't write a stream for the requested `version` ([10.12]). |
  | 429 | `rate_limited` | Too many requests; the `Retry-After` header gives the seconds to wait ([10.15]). |
  | 503 | `model_unverified` | The model hasn't passed the server's model check ([10.23]); retryable, with `Retry-After`. |
  | 500 | `server_error` | Anything else. |

- **[10.3]** A client that gets an error status MUST NOT write anything to the parser. It reports the body's `error`; if the body isn't in that form, it reports `server_error`, retryable when the status is 500 or above.

**The stream**
- **[10.4]** Otherwise the server answers `200` with `Content-Type: text/event-stream`, and the body is a stream of [Server-Sent Events](https://html.spec.whatwg.org/multipage/server-sent-events.html). The server MUST end lines with `\n`, and MUST write each event as an `event:` line with the event's name, one `data:` line holding one JSON object, and a blank line.
- **[10.5]** The events are:
  - `chunk` · `{"text": "…"}`: the next piece of the stream. Pieces may end anywhere, even inside a line; the stream is all the `text` values in order.
  - `done` · `{"stopReason": "end_turn" | "max_tokens" | "refusal", "model": "…", "ms": 1234}`: the stream is complete. `max_tokens` means the model was cut off, so the last lines may be missing.
  - `error` · `{"code": "…", "message": "…", "retryable": true | false}`: the stream failed. Codes the reference server uses are `timeout`, `model_error`, `rate_limited`, `refusal`, `unavailable` and `daily_cap`; a client MUST accept any code and rely on `retryable`.

  A server sends any number of `chunk` events, then exactly one `done` or `error` (the **terminal event**), then closes the response.
- **[10.6]** A client MUST read the events as Server-Sent Events: a blank line ends an event; `\r\n` counts as `\n`; a line starting with `:` is a comment; several `data:` lines are joined with `\n`; `event:` names the event; other fields such as `id:` and `retry:` are ignored; an event without data is ignored. The result MUST NOT depend on how the bytes were split into reads, even inside a UTF-8 character ([3.3]).
- **[10.7]** For each `chunk` the client MUST write `text` to the parser exactly as received, in order. It MUST skip an event whose name it doesn't know, whose data isn't a JSON object, or a `chunk` whose `text` isn't a string. A `done` with missing fields still ends the stream as done; an `error` with missing fields is `server_error`, not retryable.
- **[10.8]** The first terminal event decides the outcome. A client MUST ignore every event after it.
- **[10.9]** When the response ends, for any reason, the client MUST end the parser ([3.4]), so anything still pending becomes a fallback ([7.3]) instead of loading forever. If no terminal event arrived, the outcome is `connection_lost`, retryable. A client cancelled by the app reports that it was cancelled, and still ends the parser.
- **[10.10]** While it has no event to send, a server MUST send a comment line (`: ping`) at least every 15 seconds. A client SHOULD treat 45 seconds without any bytes as `connection_lost`, and close the response.
- **[10.11]** A stream can't be resumed. A server doesn't send event ids, and a client doesn't reconnect by itself. Retrying means a new request and a new parser.

**Versions**
- **[10.12]** A server MUST answer `unsupported_version` ([10.2]), before streaming, only when the client asked for an older format than the one it writes (comparing as in [3.9], including its substitution of 0.6 and 0.7); a client reads its own format and every older one, because formats only add (section 12). A client that gets `unsupported_version` MAY ask once more without a `version`, since servers 0.6 and 0.7 refused any number but their own; the version marker then tells it whether the stream is newer than it reads.
- **[10.13]** A server SHOULD start the stream with the version marker ([3.9]) for the format it writes. The server writes it, not the model.

**Actions**
- **[10.14]** A client runs a governed action (section 9) with `POST` to the server's mutate endpoint (`/api/mutate`) and the body `{"tool": "…", "params": {…}}`, with the person's credentials (a session cookie, or `Authorization: Bearer …` from a native app). It SHOULD add an `Idempotency-Key` header, 1 to 200 letters, digits or `_-:.`, new for each press and the same when it retries that press. The server MUST check the tool and params again before running anything. A server that performs real actions SHOULD honour the key: for 24 hours it answers a repeated key from the same person with the stored answer instead of running the action again, and refuses the key for different params. It answers:

  | Status | Body |
  |---|---|
  | 200 | `{"ok": true, "tool": "…", "result": {…}}` |
  | 400 | error `invalid_request`: the body isn't `{tool, params}` with an object for `params`, or the key is malformed |
  | 401 | error `sign_in_required`: the tool is for signed-in people, and nobody is signed in |
  | 403 | error `unknown_tool`: the tool isn't registered, or has no handler; or `bad_origin`: a browser request from another site |
  | 404 | error `not_found`: what the params name doesn't exist **or isn't the person's**; the server MUST give the same answer for both |
  | 409 | error `idempotency_conflict`: the key was used for other params; `idempotency_in_progress` (retryable): the same key is still running; or a tool's own conflict, such as `unavailable` |
  | 422 | error `invalid_params`, with `issues`: `[{"path": "…", "message": "…"}]` |
  | 429 | error `rate_limited`, with `Retry-After` |
  | 500 | error `tool_failed`, retryable |

  A server that authenticates browsers with cookies MUST refuse an action whose `Origin` header isn't the app's, or that has none, because a browser sends cookies even on requests another site starts.

- **[10.15]** A server that limits requests answers `429` with `rate_limited` and a `Retry-After` header. A server behind a proxy MUST take the client's address from the proxy only when the request came through a proxy it trusts, and MUST otherwise ignore headers such as `X-Forwarded-For`, which anyone can write. The reference server trusts no proxy unless `OMNI_TRUST_PROXY` is set.

**WebSockets**
- **[10.16]** Over a WebSocket, each event is one text message: a JSON object with a `type` field. The client sends `{"type": "generate", "prompt": "…"}`, with `"version"` if it wants ([10.12]); the server answers with `{"type": "chunk", "text": "…"}` messages and one terminal `{"type": "done", …}` or `{"type": "error", …}` with the fields of [10.5], then closes with code 1000. Errors that [10.2] sends as an HTTP status are sent as an `error` message instead. One connection carries one screen, and the WebSocket's own pings replace [10.10]. Rules [10.7] to [10.9] and [10.11] apply.
- **[10.17]** A browser doesn't apply CORS to WebSockets, so a server MUST check the `Origin` header of every WebSocket request itself and refuse origins it doesn't serve; otherwise any website a person visits could open a connection in their name. The reference server has no WebSocket endpoint.

**AG-UI**
- **[10.18]** Over [AG-UI](https://docs.ag-ui.com/) 1.0, a screen is one activity message with `activityType` `"omni-ir"`. The server sends `ACTIVITY_SNAPSHOT` with `content` `{"version": "MAJOR.MINOR", "lines": []}` (the version travels in `version`, not as a line), then one `ACTIVITY_DELTA` per complete line, whose `patch` is `[{"op": "add", "path": "/lines/-", "value": "…"}]` (the line without its line ending), including a last line without a line ending when the stream ends. The run ends with AG-UI's own `RUN_FINISHED` or `RUN_ERROR`. A stream the model cut off (`max_tokens`) still ends with `RUN_FINISHED`.
- **[10.19]** A client MUST first write the version marker for `content.version` ([3.9]) as line 1, when it is in the form MAJOR.MINOR, so line numbers and version checks match the other transports; then each line in `lines`, in order, followed by `\n`. Lines can only be added: a client MUST treat any other patch operation or path, a value that isn't a string, or a later `ACTIVITY_SNAPSHOT` for the same message whose `lines` don't begin with the lines already received, as an error that changes nothing, because Omni-IR never lets a line be rewritten ([5.3]). When the run ends, however it ends, the client MUST end the parser ([10.9]).
- **[10.20]** AG-UI carries the screen, never the authority to act. Governed actions MUST go through the app's own action endpoint ([10.14]), checked there, and never through the agent.

**Checking the model** (optional for servers)

A server MAY check that a model writes good Omni-IR before it serves that model's screens, the way a second sign-in factor checks a person before letting them in. The check is about proficiency, not safety: whatever the model writes, every line is still checked as sections 5 and 7 require.
- **[10.21]** A challenge is a few requests drawn at random from a set the server keeps, sent to the model with the system prompt it uses for people's requests. Each reply is parsed with the parser and registries the server's clients use. A reply fails if the parser reports any error (section 7), and is incomplete if it lacks what its request needed (for example a component or a tool). A challenge passes when no reply fails and at most one is incomplete. The reference server draws four requests for ordinary screens and two that push against the rules (asking for code, styling, a URL, or an action no tool allows).
- **[10.22]** A pass holds for one setup: the model, its system prompt and settings, the catalog, the tool registry and the asset registry. A change to any of them needs a new challenge, and a pass SHOULD expire (seven days in the reference server). A server SHOULD record each challenge (when, which setup, which requests, how the replies scored) and MUST NOT keep people's requests or screens for it.
- **[10.23]** While a setup hasn't passed, a server that enforces the check answers `503` with `model_unverified`, retryable, and a `Retry-After` header ([10.2]), instead of serving screens. A client treats it like any other retryable error.
- **[10.24]** A server that checks SHOULD also watch live replies with the same parser, and challenge the model again when too many have errors (in the reference server, more than 10% of the last 50, judged from 10 replies, at most once an hour). If that challenge fails, the setup is no longer verified.

## 11. Security considerations

What the format prevents:
- **No code or markup from the model.** There is no syntax for HTML, styles or scripts, and renderers display strings only as text.
- **No invented components or props.** The catalog is fixed by the app ([5.9]).
- **No pictures from the model.** Images come only from the app's asset registry ([5.17]), so a stream can't load a tracking pixel, leak data through a URL, or show an arbitrary picture from the web.
- **No unapproved actions.** Actions need a registered tool and pass three checks: in the parser ([5.14]), in the renderer and on the backend (section 9).
- **No look or wording from the model.** Themes and the renderer's own words come from the app's code (section 8); the stream has no syntax for them.
- **Damage stays contained.** A bad line is rejected on its own ([3.8]), and a failing component only affects its own slot (section 8).

What the app must still handle:
- **Authorization** of every real action (section 9).
- **Rate and cost limits** on generation ([10.15]).
- **The content of text.** A model can still write misleading words, such as a fake warning or a wrong price. Apps SHOULD treat model-written text as untrusted content, and SHOULD NOT use it for decisions without checking.
- **Prompt injection** in whatever the model reads. The format limits what an injected instruction can make the screen do, but not what it can make the screen say.

## 12. Versioning and limits

This is specification 0.8, a draft, describing **stream format 0.5**. The two numbers move separately:

- The **stream format** is what sections 3 to 7 define: the grammar, the document rules, the catalog, the issue codes and the limits. Its version changes only when one of those does. A stream MAY declare it with a version marker ([3.9]), and a client MAY ask for one ([10.1]).
- The **specification** also covers renderers, actions and transport (sections 8 to 11), which improve with each release without changing the format. Its number follows the reference packages' releases; changes are listed in CHANGELOG.md.

Until 1.0, a new format version only adds: new components, props, allowed values, issue codes or rules that accept more. It never removes or changes the meaning of something an older format had, so a parser reads its own format and every older one, and a server can serve any client that reads its format or a newer one ([10.12]). The format after 0.5 is numbered **0.8**, above every number a released parser has used, so parsers for 0.5 to 0.7 recognise it as newer.

Adding to the catalog is a format change. Because the catalog is strict ([5.9]), a parser built for an older format rejects a new component (`unknown_component`), a new prop or a new allowed value (`invalid_props`), and its renderer shows a fallback in that place. A server SHOULD therefore ask a model only for what its clients' format accepts. The reference server generates its system prompt from its own schema.

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
| Components one stream may define, McpMutations included ([5.25]) | 1,000 |
| $state keys one stream may declare ([5.25]) | 1,000 |
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
- A way to update or remove a component after its line has arrived. In format 0.5 an id can't be reassigned ([5.3]).
- Renderers other than the web reference renderer.
