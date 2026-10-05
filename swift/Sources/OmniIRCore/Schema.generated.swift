// Generated from conformance/schema.json by `npm run swift:schema`; do not edit.
// The single authority is packages/core/src/schema.ts (TypeScript), exported with `npm run schema:export`.

/// The Omni-IR version this catalog describes.
public let omniIRVersion = "0.3.0"

/// The components in the Trusted Catalog.
public enum ComponentType: String, Sendable, CaseIterable, Hashable {
  case stack = "Stack"
  case card = "Card"
  case heading = "Heading"
  case text = "Text"
  case input = "Input"
  case button = "Button"
  case divider = "Divider"
  case badge = "Badge"
  case skeleton = "Skeleton"
  case image = "Image"
  case rating = "Rating"
  case dateInput = "DateInput"
  case list = "List"
  case listItem = "ListItem"
  case message = "Message"
  case select = "Select"
  case `switch` = "Switch"
  case table = "Table"
  case tableRow = "TableRow"
  case tabs = "Tabs"
  case tab = "Tab"
  case notice = "Notice"
  case barChart = "BarChart"
  case lineChart = "LineChart"
  case pieChart = "PieChart"
  case series = "Series"
  case slice = "Slice"
}

/// Every error and warning a parser reports.
public enum IssueCode: String, Sendable, CaseIterable, Hashable {
  case syntax = "syntax"
  case unterminatedString = "unterminated_string"
  case lineTooLong = "line_too_long"
  case notFlat = "not_flat"
  case unknownComponent = "unknown_component"
  case invalidProps = "invalid_props"
  case unknownTool = "unknown_tool"
  case duplicateId = "duplicate_id"
  case duplicateChild = "duplicate_child"
  case multipleParents = "multiple_parents"
  case cycle = "cycle"
  case rootAsChild = "root_as_child"
  case childNotComponent = "child_not_component"
  case unknownAsset = "unknown_asset"
  case inputStateType = "input_state_type"
  case listMismatch = "list_mismatch"
  case tableMismatch = "table_mismatch"
  case tabsMismatch = "tabs_mismatch"
  case chartMismatch = "chart_mismatch"
  case duplicateMutation = "duplicate_mutation"
  case danglingRef = "dangling_ref"
  case missingState = "missing_state"
  case missingRoot = "missing_root"
  case rootNotComponent = "root_not_component"
  case ungovernedMutation = "ungoverned_mutation"
  case mutationTargetNotInteractive = "mutation_target_not_interactive"
  case mutationBlocked = "mutation_blocked"
  case nodeCrashed = "node_crashed"
  case handlerFailed = "handler_failed"
  case unknownEscape = "unknown_escape"

  public var severity: IssueSeverity {
    switch self {
    case .syntax: .error
    case .unterminatedString: .error
    case .lineTooLong: .error
    case .notFlat: .error
    case .unknownComponent: .error
    case .invalidProps: .error
    case .unknownTool: .error
    case .duplicateId: .error
    case .duplicateChild: .error
    case .multipleParents: .error
    case .cycle: .error
    case .rootAsChild: .error
    case .childNotComponent: .error
    case .unknownAsset: .error
    case .inputStateType: .error
    case .listMismatch: .error
    case .tableMismatch: .error
    case .tabsMismatch: .error
    case .chartMismatch: .error
    case .duplicateMutation: .error
    case .danglingRef: .error
    case .missingState: .error
    case .missingRoot: .error
    case .rootNotComponent: .error
    case .ungovernedMutation: .error
    case .mutationTargetNotInteractive: .error
    case .mutationBlocked: .error
    case .nodeCrashed: .error
    case .handlerFailed: .error
    case .unknownEscape: .warning
    }
  }

  public var stage: IssueStage {
    switch self {
    case .syntax: .line
    case .unterminatedString: .line
    case .lineTooLong: .line
    case .notFlat: .line
    case .unknownComponent: .line
    case .invalidProps: .line
    case .unknownTool: .line
    case .duplicateId: .line
    case .duplicateChild: .line
    case .multipleParents: .line
    case .cycle: .line
    case .rootAsChild: .line
    case .childNotComponent: .line
    case .unknownAsset: .line
    case .inputStateType: .line
    case .listMismatch: .line
    case .tableMismatch: .line
    case .tabsMismatch: .line
    case .chartMismatch: .line
    case .duplicateMutation: .line
    case .danglingRef: .end
    case .missingState: .end
    case .missingRoot: .end
    case .rootNotComponent: .end
    case .ungovernedMutation: .end
    case .mutationTargetNotInteractive: .end
    case .mutationBlocked: .renderer
    case .nodeCrashed: .renderer
    case .handlerFailed: .renderer
    case .unknownEscape: .line
    }
  }

  /// What the issue means, in one sentence.
  public var meaning: String {
    switch self {
    case .syntax: "The line doesn't follow the grammar."
    case .unterminatedString: "A string has no closing double quote."
    case .lineTooLong: "The line is longer than the line length limit."
    case .notFlat: "A component call appears inside another statement's arguments."
    case .unknownComponent: "The component isn't in the catalog."
    case .invalidProps: "An argument or value breaks the component's rules: wrong type, unknown prop, value not allowed, too long or repeated."
    case .unknownTool: "An McpMutation names a tool that isn't in the app's tool registry."
    case .duplicateId: "An id or $state key is assigned a second time. The first assignment stays."
    case .duplicateChild: "The same id appears twice in one children list."
    case .multipleParents: "A component is listed as a child of a second component."
    case .cycle: "A component would contain itself through its children."
    case .rootAsChild: "root is listed as a child."
    case .childNotComponent: "A children list names an McpMutation."
    case .unknownAsset: "An Image or ListItem names a picture that isn't in the app's asset registry."
    case .inputStateType: "An Input or Select is bound to state that doesn't hold text, a DateInput to state that isn't a YYYY-MM-DD date or empty, or a Switch to state that isn't true or false."
    case .listMismatch: "A List contains something other than ListItems, or a ListItem is outside a List."
    case .tableMismatch: "A Table contains something other than TableRows, a TableRow is outside a Table, or a row's cell count differs from the table's columns."
    case .tabsMismatch: "A Tabs contains something other than Tab, or a Tab is outside a Tabs."
    case .chartMismatch: "A BarChart or LineChart contains something other than Series, a PieChart something other than Slices, a Series or Slice is outside its kind of chart, or a Series' number of values differs from its chart's labels."
    case .duplicateMutation: "A button that already has an McpMutation gets a second one."
    case .danglingRef: "A referenced component or McpMutation target never arrived."
    case .missingState: "A $state key is used but never declared."
    case .missingRoot: "No root line arrived."
    case .rootNotComponent: "root is defined, but as an McpMutation instead of a component."
    case .ungovernedMutation: "A button with an action has no McpMutation."
    case .mutationTargetNotInteractive: "An McpMutation targets a component that has no action."
    case .mutationBlocked: "When pressed, the action's tool or params failed the registry's checks, so nothing was sent."
    case .nodeCrashed: "A component failed while rendering. Only its own slot shows a fallback."
    case .handlerFailed: "An action's handler failed or the server refused it."
    case .unknownEscape: "A backslash sequence other than \\\", \\\\ or \\n was kept as literal text. The line is still accepted."
    }
  }
}

/// Size limits of the protocol.
public enum Limits {
  public static let lineLength = 16384
  public static let text = 2000
  public static let children = 200
  public static let idLength = 64
  public static let stateKeyLength = 65
  public static let toolNameLength = 128
  public static let actionNameLength = 64
  public static let tableColumns = 8
  public static let chartLabels = 24
  public static let chartSeries = 6
  public static let chartSlices = 8
}

enum Catalog {
  static let rootId = "root"
  static let reservedWords: Set<String> = ["true", "false", "null", "__proto__", "constructor", "prototype"]

  static let components: [ComponentType: ComponentSpec] = [
    .stack: ComponentSpec(
      positional: ["children"],
      props: [
        PropSpec(name: "children", required: true, value: .refList(maxItems: 200)),
        PropSpec(name: "direction", required: false, value: .oneOf(["row", "column"])),
        PropSpec(name: "gap", required: false, value: .oneOf(["none", "sm", "md", "lg"])),
        PropSpec(name: "align", required: false, value: .oneOf(["start", "center", "end", "stretch"])),
      ]
    ),
    .card: ComponentSpec(
      positional: ["children"],
      props: [
        PropSpec(name: "children", required: true, value: .refList(maxItems: 200)),
        PropSpec(name: "title", required: false, value: .anyOf([.text(minLength: nil, maxLength: 2000, pattern: nil), .state])),
      ]
    ),
    .heading: ComponentSpec(
      positional: ["text"],
      props: [
        PropSpec(name: "text", required: true, value: .anyOf([.text(minLength: nil, maxLength: 2000, pattern: nil), .state])),
        PropSpec(name: "level", required: false, value: .anyOf([.numberConstant(1), .numberConstant(2), .numberConstant(3)])),
      ]
    ),
    .text: ComponentSpec(
      positional: ["text"],
      props: [
        PropSpec(name: "text", required: true, value: .anyOf([.text(minLength: nil, maxLength: 2000, pattern: nil), .number(minimum: nil, maximum: nil, integer: false), .state])),
        PropSpec(name: "format", required: false, value: .oneOf(["plain", "currency", "date"])),
        PropSpec(name: "currency", required: false, value: .text(minLength: nil, maxLength: nil, pattern: "^[A-Z]{3}$")),
        PropSpec(name: "tone", required: false, value: .oneOf(["default", "muted", "strong"])),
      ]
    ),
    .input: ComponentSpec(
      positional: ["value"],
      props: [
        PropSpec(name: "value", required: true, value: .state),
        PropSpec(name: "label", required: true, value: .text(minLength: 1, maxLength: 200, pattern: nil)),
        PropSpec(name: "placeholder", required: false, value: .text(minLength: nil, maxLength: 200, pattern: nil)),
        PropSpec(name: "lines", required: false, value: .number(minimum: 1, maximum: 10, integer: true)),
      ]
    ),
    .button: ComponentSpec(
      positional: ["label"],
      props: [
        PropSpec(name: "label", required: true, value: .anyOf([.text(minLength: nil, maxLength: 2000, pattern: nil), .state])),
        PropSpec(name: "action", required: false, value: .text(minLength: nil, maxLength: 64, pattern: "^[a-z][A-Za-z0-9_]*$")),
        PropSpec(name: "variant", required: false, value: .oneOf(["primary", "secondary", "danger"])),
      ]
    ),
    .divider: ComponentSpec(
      positional: [],
      props: [
      ]
    ),
    .badge: ComponentSpec(
      positional: ["text"],
      props: [
        PropSpec(name: "text", required: true, value: .anyOf([.text(minLength: nil, maxLength: 2000, pattern: nil), .state])),
        PropSpec(name: "tone", required: false, value: .oneOf(["neutral", "success", "warning", "danger"])),
      ]
    ),
    .skeleton: ComponentSpec(
      positional: [],
      props: [
        PropSpec(name: "lines", required: false, value: .number(minimum: 1, maximum: 6, integer: true)),
      ]
    ),
    .image: ComponentSpec(
      positional: ["asset"],
      props: [
        PropSpec(name: "asset", required: true, value: .text(minLength: nil, maxLength: 64, pattern: "^[a-z0-9][a-z0-9-]*$")),
        PropSpec(name: "alt", required: true, value: .text(minLength: 1, maxLength: 300, pattern: nil)),
        PropSpec(name: "ratio", required: false, value: .oneOf(["1:1", "4:3", "3:2", "16:9"])),
      ]
    ),
    .rating: ComponentSpec(
      positional: ["value"],
      props: [
        PropSpec(name: "value", required: true, value: .anyOf([.number(minimum: 0, maximum: nil, integer: false), .state])),
        PropSpec(name: "max", required: false, value: .number(minimum: 1, maximum: 10, integer: true)),
      ]
    ),
    .dateInput: ComponentSpec(
      positional: ["value"],
      props: [
        PropSpec(name: "value", required: true, value: .state),
        PropSpec(name: "label", required: true, value: .text(minLength: 1, maxLength: 200, pattern: nil)),
        PropSpec(name: "min", required: false, value: .text(minLength: nil, maxLength: nil, pattern: "^\\d{4}-\\d{2}-\\d{2}$")),
        PropSpec(name: "max", required: false, value: .text(minLength: nil, maxLength: nil, pattern: "^\\d{4}-\\d{2}-\\d{2}$")),
      ]
    ),
    .list: ComponentSpec(
      positional: ["children"],
      props: [
        PropSpec(name: "children", required: true, value: .refList(maxItems: 200)),
      ]
    ),
    .listItem: ComponentSpec(
      positional: ["title"],
      props: [
        PropSpec(name: "title", required: true, value: .anyOf([.text(minLength: nil, maxLength: 2000, pattern: nil), .state])),
        PropSpec(name: "detail", required: false, value: .anyOf([.text(minLength: nil, maxLength: 2000, pattern: nil), .state])),
        PropSpec(name: "trailing", required: false, value: .anyOf([.text(minLength: nil, maxLength: 2000, pattern: nil), .state])),
        PropSpec(name: "image", required: false, value: .text(minLength: nil, maxLength: 64, pattern: "^[a-z0-9][a-z0-9-]*$")),
      ]
    ),
    .message: ComponentSpec(
      positional: ["text"],
      props: [
        PropSpec(name: "text", required: true, value: .anyOf([.text(minLength: nil, maxLength: 2000, pattern: nil), .state])),
        PropSpec(name: "from", required: true, value: .oneOf(["user", "assistant"])),
      ]
    ),
    .select: ComponentSpec(
      positional: ["value"],
      props: [
        PropSpec(name: "value", required: true, value: .state),
        PropSpec(name: "label", required: true, value: .text(minLength: 1, maxLength: 200, pattern: nil)),
        PropSpec(name: "options", required: true, value: .list(item: .text(minLength: 1, maxLength: 200, pattern: nil), minItems: 1, maxItems: 50)),
        PropSpec(name: "placeholder", required: false, value: .text(minLength: nil, maxLength: 200, pattern: nil)),
      ]
    ),
    .switch: ComponentSpec(
      positional: ["value"],
      props: [
        PropSpec(name: "value", required: true, value: .state),
        PropSpec(name: "label", required: true, value: .text(minLength: 1, maxLength: 200, pattern: nil)),
      ]
    ),
    .table: ComponentSpec(
      positional: ["columns", "children"],
      props: [
        PropSpec(name: "columns", required: true, value: .list(item: .text(minLength: 1, maxLength: 200, pattern: nil), minItems: 1, maxItems: 8)),
        PropSpec(name: "children", required: true, value: .refList(maxItems: 200)),
      ]
    ),
    .tableRow: ComponentSpec(
      positional: ["cells"],
      props: [
        PropSpec(name: "cells", required: true, value: .list(item: .anyOf([.text(minLength: nil, maxLength: 2000, pattern: nil), .number(minimum: nil, maximum: nil, integer: false)]), minItems: 1, maxItems: 8)),
      ]
    ),
    .tabs: ComponentSpec(
      positional: ["children"],
      props: [
        PropSpec(name: "children", required: true, value: .refList(maxItems: 200)),
      ]
    ),
    .tab: ComponentSpec(
      positional: ["label", "children"],
      props: [
        PropSpec(name: "label", required: true, value: .text(minLength: 1, maxLength: 200, pattern: nil)),
        PropSpec(name: "children", required: true, value: .refList(maxItems: 200)),
      ]
    ),
    .notice: ComponentSpec(
      positional: ["text"],
      props: [
        PropSpec(name: "text", required: true, value: .anyOf([.text(minLength: nil, maxLength: 2000, pattern: nil), .state])),
        PropSpec(name: "tone", required: false, value: .oneOf(["info", "success", "warning", "danger"])),
        PropSpec(name: "title", required: false, value: .anyOf([.text(minLength: nil, maxLength: 2000, pattern: nil), .state])),
      ]
    ),
    .barChart: ComponentSpec(
      positional: ["title", "labels", "children"],
      props: [
        PropSpec(name: "title", required: true, value: .text(minLength: 1, maxLength: 200, pattern: nil)),
        PropSpec(name: "labels", required: true, value: .list(item: .text(minLength: 1, maxLength: 60, pattern: nil), minItems: 1, maxItems: 24)),
        PropSpec(name: "children", required: true, value: .refList(maxItems: 6)),
        PropSpec(name: "format", required: false, value: .oneOf(["number", "currency", "percent"])),
        PropSpec(name: "currency", required: false, value: .text(minLength: nil, maxLength: nil, pattern: "^[A-Z]{3}$")),
      ]
    ),
    .lineChart: ComponentSpec(
      positional: ["title", "labels", "children"],
      props: [
        PropSpec(name: "title", required: true, value: .text(minLength: 1, maxLength: 200, pattern: nil)),
        PropSpec(name: "labels", required: true, value: .list(item: .text(minLength: 1, maxLength: 60, pattern: nil), minItems: 1, maxItems: 24)),
        PropSpec(name: "children", required: true, value: .refList(maxItems: 6)),
        PropSpec(name: "format", required: false, value: .oneOf(["number", "currency", "percent"])),
        PropSpec(name: "currency", required: false, value: .text(minLength: nil, maxLength: nil, pattern: "^[A-Z]{3}$")),
      ]
    ),
    .pieChart: ComponentSpec(
      positional: ["title", "children"],
      props: [
        PropSpec(name: "title", required: true, value: .text(minLength: 1, maxLength: 200, pattern: nil)),
        PropSpec(name: "children", required: true, value: .refList(maxItems: 8)),
        PropSpec(name: "format", required: false, value: .oneOf(["number", "currency", "percent"])),
        PropSpec(name: "currency", required: false, value: .text(minLength: nil, maxLength: nil, pattern: "^[A-Z]{3}$")),
      ]
    ),
    .series: ComponentSpec(
      positional: ["name", "values"],
      props: [
        PropSpec(name: "name", required: true, value: .text(minLength: 1, maxLength: 200, pattern: nil)),
        PropSpec(name: "values", required: true, value: .list(item: .number(minimum: nil, maximum: nil, integer: false), minItems: 1, maxItems: 24)),
      ]
    ),
    .slice: ComponentSpec(
      positional: ["name", "value"],
      props: [
        PropSpec(name: "name", required: true, value: .text(minLength: 1, maxLength: 200, pattern: nil)),
        PropSpec(name: "value", required: true, value: .number(minimum: 0, maximum: nil, integer: false)),
      ]
    ),
  ]

  static let mcpMutation = ComponentSpec(
    positional: ["target"],
    props: [
      PropSpec(name: "target", required: true, value: .ref),
      PropSpec(name: "tool", required: true, value: .text(minLength: nil, maxLength: 128, pattern: "^[a-z][A-Za-z0-9_]*(\\.[a-z][A-Za-z0-9_]*)+$")),
      PropSpec(name: "params", required: false, value: .record(key: .text(minLength: nil, maxLength: 64, pattern: "^[A-Za-z_][A-Za-z0-9_]*$"), value: .anyOf([.anyOf([.text(minLength: nil, maxLength: 2000, pattern: nil), .number(minimum: nil, maximum: nil, integer: false), .boolean, .null]), .state]))),
    ]
  )
}
