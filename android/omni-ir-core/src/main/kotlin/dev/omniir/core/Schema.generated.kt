// Generated from conformance/schema.json by `npm run kotlin:schema`; do not edit.
// The single authority is packages/core/src/schema.ts (TypeScript), exported with `npm run schema:export`.
package dev.omniir.core

/** The package release this catalog was exported from. */
public const val OMNI_IR_VERSION: String = "0.10.0"

/** The stream format's version: what the version marker, requests and version checks carry. */
public const val FORMAT_VERSION: String = "0.5"

/** The components in the Trusted Catalog. */
public enum class ComponentType(public val wireName: String) {
  STACK("Stack"),
  CARD("Card"),
  HEADING("Heading"),
  TEXT("Text"),
  INPUT("Input"),
  BUTTON("Button"),
  DIVIDER("Divider"),
  BADGE("Badge"),
  SKELETON("Skeleton"),
  IMAGE("Image"),
  RATING("Rating"),
  DATE_INPUT("DateInput"),
  LIST("List"),
  LIST_ITEM("ListItem"),
  MESSAGE("Message"),
  SELECT("Select"),
  SWITCH("Switch"),
  TABLE("Table"),
  TABLE_ROW("TableRow"),
  TABS("Tabs"),
  TAB("Tab"),
  NOTICE("Notice"),
  BAR_CHART("BarChart"),
  LINE_CHART("LineChart"),
  PIE_CHART("PieChart"),
  SERIES("Series"),
  SLICE("Slice"),
  ;

  public companion object {
    /** The component a stream names, or null if it isn't in the catalog. */
    public fun fromWireName(name: String): ComponentType? = entries.firstOrNull { it.wireName == name }
  }
}

/** Every error and warning a parser reports. */
public enum class IssueCode(
  public val wireName: String,
  public val severity: IssueSeverity,
  public val stage: IssueStage,
  /** What the issue means, in one sentence. */
  public val meaning: String,
) {
  SYNTAX("syntax", IssueSeverity.ERROR, IssueStage.LINE, "The line doesn't follow the grammar."),
  UNTERMINATED_STRING("unterminated_string", IssueSeverity.ERROR, IssueStage.LINE, "A string has no closing double quote."),
  LINE_TOO_LONG("line_too_long", IssueSeverity.ERROR, IssueStage.LINE, "The line is longer than the line length limit."),
  NOT_FLAT("not_flat", IssueSeverity.ERROR, IssueStage.LINE, "A component call appears inside another statement's arguments."),
  UNKNOWN_COMPONENT("unknown_component", IssueSeverity.ERROR, IssueStage.LINE, "The component isn't in the catalog."),
  INVALID_PROPS("invalid_props", IssueSeverity.ERROR, IssueStage.LINE, "An argument or value breaks the component's rules: wrong type, unknown prop, value not allowed, too long or repeated."),
  UNKNOWN_TOOL("unknown_tool", IssueSeverity.ERROR, IssueStage.LINE, "An McpMutation names a tool that isn't in the app's tool registry."),
  DUPLICATE_ID("duplicate_id", IssueSeverity.ERROR, IssueStage.LINE, "An id or \$state key is assigned a second time. The first assignment stays."),
  DUPLICATE_CHILD("duplicate_child", IssueSeverity.ERROR, IssueStage.LINE, "The same id appears twice in one children list."),
  MULTIPLE_PARENTS("multiple_parents", IssueSeverity.ERROR, IssueStage.LINE, "A component is listed as a child of a second component."),
  CYCLE("cycle", IssueSeverity.ERROR, IssueStage.LINE, "A component would contain itself through its children."),
  ROOT_AS_CHILD("root_as_child", IssueSeverity.ERROR, IssueStage.LINE, "root is listed as a child."),
  CHILD_NOT_COMPONENT("child_not_component", IssueSeverity.ERROR, IssueStage.LINE, "A children list names an McpMutation."),
  UNKNOWN_ASSET("unknown_asset", IssueSeverity.ERROR, IssueStage.LINE, "An Image or ListItem names a picture that isn't in the app's asset registry."),
  INPUT_STATE_TYPE("input_state_type", IssueSeverity.ERROR, IssueStage.LINE, "An Input or Select is bound to state that doesn't hold text, a DateInput to state that isn't a YYYY-MM-DD date or empty, or a Switch to state that isn't true or false."),
  LIST_MISMATCH("list_mismatch", IssueSeverity.ERROR, IssueStage.LINE, "A List contains something other than ListItems, or a ListItem is outside a List."),
  TABLE_MISMATCH("table_mismatch", IssueSeverity.ERROR, IssueStage.LINE, "A Table contains something other than TableRows, a TableRow is outside a Table, or a row's cell count differs from the table's columns."),
  TABS_MISMATCH("tabs_mismatch", IssueSeverity.ERROR, IssueStage.LINE, "A Tabs contains something other than Tab, or a Tab is outside a Tabs."),
  DOCUMENT_TOO_LARGE("document_too_large", IssueSeverity.ERROR, IssueStage.LINE, "The line would define a component or \$state key beyond the document size limits."),
  CHART_MISMATCH("chart_mismatch", IssueSeverity.ERROR, IssueStage.LINE, "A BarChart or LineChart contains something other than Series, a PieChart something other than Slices, a Series or Slice is outside its kind of chart, or a Series' number of values differs from its chart's labels."),
  DUPLICATE_MUTATION("duplicate_mutation", IssueSeverity.ERROR, IssueStage.LINE, "A button that already has an McpMutation gets a second one."),
  DANGLING_REF("dangling_ref", IssueSeverity.ERROR, IssueStage.END, "A referenced component or McpMutation target never arrived."),
  MISSING_STATE("missing_state", IssueSeverity.ERROR, IssueStage.END, "A \$state key is used but never declared."),
  MISSING_ROOT("missing_root", IssueSeverity.ERROR, IssueStage.END, "No root line arrived."),
  ROOT_NOT_COMPONENT("root_not_component", IssueSeverity.ERROR, IssueStage.END, "root is defined, but as an McpMutation instead of a component."),
  UNGOVERNED_MUTATION("ungoverned_mutation", IssueSeverity.ERROR, IssueStage.END, "A button with an action has no McpMutation."),
  MUTATION_TARGET_NOT_INTERACTIVE("mutation_target_not_interactive", IssueSeverity.ERROR, IssueStage.END, "An McpMutation targets a component that has no action."),
  MUTATION_BLOCKED("mutation_blocked", IssueSeverity.ERROR, IssueStage.RENDERER, "When pressed, the action's tool or params failed the registry's checks, so nothing was sent."),
  NODE_CRASHED("node_crashed", IssueSeverity.ERROR, IssueStage.RENDERER, "A component failed while rendering. Only its own slot shows a fallback."),
  HANDLER_FAILED("handler_failed", IssueSeverity.ERROR, IssueStage.RENDERER, "An action's handler failed or the server refused it."),
  UNKNOWN_ESCAPE("unknown_escape", IssueSeverity.WARNING, IssueStage.LINE, "A backslash sequence other than \\\", \\\\ or \\n was kept as literal text. The line is still accepted."),
  NEWER_VERSION("newer_version", IssueSeverity.WARNING, IssueStage.LINE, "The version marker on line 1 names a newer Omni-IR version than the parser's. The rest of the stream is processed as usual."),
}

/** Size limits of the protocol. */
public object Limits {
  public const val LINE_LENGTH: Int = 16384
  public const val TEXT: Int = 2000
  public const val CHILDREN: Int = 200
  public const val ID_LENGTH: Int = 64
  public const val STATE_KEY_LENGTH: Int = 65
  public const val TOOL_NAME_LENGTH: Int = 128
  public const val ACTION_NAME_LENGTH: Int = 64
  public const val TABLE_COLUMNS: Int = 8
  public const val CHART_LABELS: Int = 24
  public const val CHART_SERIES: Int = 6
  public const val CHART_SLICES: Int = 8
  public const val NESTING_DEPTH: Int = 8
  public const val COMPONENTS: Int = 1000
  public const val STATE_KEYS: Int = 1000
}

internal object Catalog {
  const val ROOT_ID: String = "root"
  val reservedWords: Set<String> = setOf("true", "false", "null", "__proto__", "constructor", "prototype")

  val components: Map<ComponentType, ComponentSpec> = mapOf(
    ComponentType.STACK to ComponentSpec(
      positional = listOf("children"),
      props = listOf(
        PropSpec("children", required = true, value = ValueSpec.RefList(maxItems = 200)),
        PropSpec("direction", required = false, value = ValueSpec.OneOf(listOf("row", "column"))),
        PropSpec("gap", required = false, value = ValueSpec.OneOf(listOf("none", "sm", "md", "lg"))),
        PropSpec("align", required = false, value = ValueSpec.OneOf(listOf("start", "center", "end", "stretch"))),
      ),
    ),
    ComponentType.CARD to ComponentSpec(
      positional = listOf("children"),
      props = listOf(
        PropSpec("children", required = true, value = ValueSpec.RefList(maxItems = 200)),
        PropSpec("title", required = false, value = ValueSpec.AnyOf(listOf(ValueSpec.TextValue(minLength = null, maxLength = 2000, pattern = null), ValueSpec.State))),
      ),
    ),
    ComponentType.HEADING to ComponentSpec(
      positional = listOf("text"),
      props = listOf(
        PropSpec("text", required = true, value = ValueSpec.AnyOf(listOf(ValueSpec.TextValue(minLength = null, maxLength = 2000, pattern = null), ValueSpec.State))),
        PropSpec("level", required = false, value = ValueSpec.AnyOf(listOf(ValueSpec.NumberConstant(1.0), ValueSpec.NumberConstant(2.0), ValueSpec.NumberConstant(3.0)))),
      ),
    ),
    ComponentType.TEXT to ComponentSpec(
      positional = listOf("text"),
      props = listOf(
        PropSpec("text", required = true, value = ValueSpec.AnyOf(listOf(ValueSpec.TextValue(minLength = null, maxLength = 2000, pattern = null), ValueSpec.NumberValue(minimum = null, maximum = null, integer = false), ValueSpec.State))),
        PropSpec("format", required = false, value = ValueSpec.OneOf(listOf("plain", "currency", "date"))),
        PropSpec("currency", required = false, value = ValueSpec.TextValue(minLength = null, maxLength = null, pattern = "^[A-Z]{3}\$")),
        PropSpec("tone", required = false, value = ValueSpec.OneOf(listOf("default", "muted", "strong"))),
      ),
    ),
    ComponentType.INPUT to ComponentSpec(
      positional = listOf("value"),
      props = listOf(
        PropSpec("value", required = true, value = ValueSpec.State),
        PropSpec("label", required = true, value = ValueSpec.TextValue(minLength = 1, maxLength = 200, pattern = null)),
        PropSpec("placeholder", required = false, value = ValueSpec.TextValue(minLength = null, maxLength = 200, pattern = null)),
        PropSpec("lines", required = false, value = ValueSpec.NumberValue(minimum = 1.0, maximum = 10.0, integer = true)),
      ),
    ),
    ComponentType.BUTTON to ComponentSpec(
      positional = listOf("label"),
      props = listOf(
        PropSpec("label", required = true, value = ValueSpec.AnyOf(listOf(ValueSpec.TextValue(minLength = null, maxLength = 2000, pattern = null), ValueSpec.State))),
        PropSpec("action", required = false, value = ValueSpec.TextValue(minLength = null, maxLength = 64, pattern = "^[a-z][A-Za-z0-9_]*\$")),
        PropSpec("variant", required = false, value = ValueSpec.OneOf(listOf("primary", "secondary", "danger"))),
      ),
    ),
    ComponentType.DIVIDER to ComponentSpec(
      positional = listOf(),
      props = listOf(
      ),
    ),
    ComponentType.BADGE to ComponentSpec(
      positional = listOf("text"),
      props = listOf(
        PropSpec("text", required = true, value = ValueSpec.AnyOf(listOf(ValueSpec.TextValue(minLength = null, maxLength = 2000, pattern = null), ValueSpec.State))),
        PropSpec("tone", required = false, value = ValueSpec.OneOf(listOf("neutral", "success", "warning", "danger"))),
      ),
    ),
    ComponentType.SKELETON to ComponentSpec(
      positional = listOf(),
      props = listOf(
        PropSpec("lines", required = false, value = ValueSpec.NumberValue(minimum = 1.0, maximum = 6.0, integer = true)),
      ),
    ),
    ComponentType.IMAGE to ComponentSpec(
      positional = listOf("asset"),
      props = listOf(
        PropSpec("asset", required = true, value = ValueSpec.TextValue(minLength = null, maxLength = 64, pattern = "^[a-z0-9][a-z0-9-]*\$")),
        PropSpec("alt", required = true, value = ValueSpec.TextValue(minLength = 1, maxLength = 300, pattern = null)),
        PropSpec("ratio", required = false, value = ValueSpec.OneOf(listOf("1:1", "4:3", "3:2", "16:9"))),
      ),
    ),
    ComponentType.RATING to ComponentSpec(
      positional = listOf("value"),
      props = listOf(
        PropSpec("value", required = true, value = ValueSpec.AnyOf(listOf(ValueSpec.NumberValue(minimum = 0.0, maximum = null, integer = false), ValueSpec.State))),
        PropSpec("max", required = false, value = ValueSpec.NumberValue(minimum = 1.0, maximum = 10.0, integer = true)),
      ),
    ),
    ComponentType.DATE_INPUT to ComponentSpec(
      positional = listOf("value"),
      props = listOf(
        PropSpec("value", required = true, value = ValueSpec.State),
        PropSpec("label", required = true, value = ValueSpec.TextValue(minLength = 1, maxLength = 200, pattern = null)),
        PropSpec("min", required = false, value = ValueSpec.TextValue(minLength = null, maxLength = null, pattern = "^\\d{4}-\\d{2}-\\d{2}\$")),
        PropSpec("max", required = false, value = ValueSpec.TextValue(minLength = null, maxLength = null, pattern = "^\\d{4}-\\d{2}-\\d{2}\$")),
      ),
    ),
    ComponentType.LIST to ComponentSpec(
      positional = listOf("children"),
      props = listOf(
        PropSpec("children", required = true, value = ValueSpec.RefList(maxItems = 200)),
      ),
    ),
    ComponentType.LIST_ITEM to ComponentSpec(
      positional = listOf("title"),
      props = listOf(
        PropSpec("title", required = true, value = ValueSpec.AnyOf(listOf(ValueSpec.TextValue(minLength = null, maxLength = 2000, pattern = null), ValueSpec.State))),
        PropSpec("detail", required = false, value = ValueSpec.AnyOf(listOf(ValueSpec.TextValue(minLength = null, maxLength = 2000, pattern = null), ValueSpec.State))),
        PropSpec("trailing", required = false, value = ValueSpec.AnyOf(listOf(ValueSpec.TextValue(minLength = null, maxLength = 2000, pattern = null), ValueSpec.State))),
        PropSpec("image", required = false, value = ValueSpec.TextValue(minLength = null, maxLength = 64, pattern = "^[a-z0-9][a-z0-9-]*\$")),
      ),
    ),
    ComponentType.MESSAGE to ComponentSpec(
      positional = listOf("text"),
      props = listOf(
        PropSpec("text", required = true, value = ValueSpec.AnyOf(listOf(ValueSpec.TextValue(minLength = null, maxLength = 2000, pattern = null), ValueSpec.State))),
        PropSpec("from", required = true, value = ValueSpec.OneOf(listOf("user", "assistant"))),
      ),
    ),
    ComponentType.SELECT to ComponentSpec(
      positional = listOf("value"),
      props = listOf(
        PropSpec("value", required = true, value = ValueSpec.State),
        PropSpec("label", required = true, value = ValueSpec.TextValue(minLength = 1, maxLength = 200, pattern = null)),
        PropSpec("options", required = true, value = ValueSpec.ListOf(item = ValueSpec.TextValue(minLength = 1, maxLength = 200, pattern = null), minItems = 1, maxItems = 50)),
        PropSpec("placeholder", required = false, value = ValueSpec.TextValue(minLength = null, maxLength = 200, pattern = null)),
      ),
    ),
    ComponentType.SWITCH to ComponentSpec(
      positional = listOf("value"),
      props = listOf(
        PropSpec("value", required = true, value = ValueSpec.State),
        PropSpec("label", required = true, value = ValueSpec.TextValue(minLength = 1, maxLength = 200, pattern = null)),
      ),
    ),
    ComponentType.TABLE to ComponentSpec(
      positional = listOf("columns", "children"),
      props = listOf(
        PropSpec("columns", required = true, value = ValueSpec.ListOf(item = ValueSpec.TextValue(minLength = 1, maxLength = 200, pattern = null), minItems = 1, maxItems = 8)),
        PropSpec("children", required = true, value = ValueSpec.RefList(maxItems = 200)),
      ),
    ),
    ComponentType.TABLE_ROW to ComponentSpec(
      positional = listOf("cells"),
      props = listOf(
        PropSpec("cells", required = true, value = ValueSpec.ListOf(item = ValueSpec.AnyOf(listOf(ValueSpec.TextValue(minLength = null, maxLength = 2000, pattern = null), ValueSpec.NumberValue(minimum = null, maximum = null, integer = false))), minItems = 1, maxItems = 8)),
      ),
    ),
    ComponentType.TABS to ComponentSpec(
      positional = listOf("children"),
      props = listOf(
        PropSpec("children", required = true, value = ValueSpec.RefList(maxItems = 200)),
      ),
    ),
    ComponentType.TAB to ComponentSpec(
      positional = listOf("label", "children"),
      props = listOf(
        PropSpec("label", required = true, value = ValueSpec.TextValue(minLength = 1, maxLength = 200, pattern = null)),
        PropSpec("children", required = true, value = ValueSpec.RefList(maxItems = 200)),
      ),
    ),
    ComponentType.NOTICE to ComponentSpec(
      positional = listOf("text"),
      props = listOf(
        PropSpec("text", required = true, value = ValueSpec.AnyOf(listOf(ValueSpec.TextValue(minLength = null, maxLength = 2000, pattern = null), ValueSpec.State))),
        PropSpec("tone", required = false, value = ValueSpec.OneOf(listOf("info", "success", "warning", "danger"))),
        PropSpec("title", required = false, value = ValueSpec.AnyOf(listOf(ValueSpec.TextValue(minLength = null, maxLength = 2000, pattern = null), ValueSpec.State))),
      ),
    ),
    ComponentType.BAR_CHART to ComponentSpec(
      positional = listOf("title", "labels", "children"),
      props = listOf(
        PropSpec("title", required = true, value = ValueSpec.TextValue(minLength = 1, maxLength = 200, pattern = null)),
        PropSpec("labels", required = true, value = ValueSpec.ListOf(item = ValueSpec.TextValue(minLength = 1, maxLength = 60, pattern = null), minItems = 1, maxItems = 24)),
        PropSpec("children", required = true, value = ValueSpec.RefList(maxItems = 6)),
        PropSpec("format", required = false, value = ValueSpec.OneOf(listOf("number", "currency", "percent"))),
        PropSpec("currency", required = false, value = ValueSpec.TextValue(minLength = null, maxLength = null, pattern = "^[A-Z]{3}\$")),
      ),
    ),
    ComponentType.LINE_CHART to ComponentSpec(
      positional = listOf("title", "labels", "children"),
      props = listOf(
        PropSpec("title", required = true, value = ValueSpec.TextValue(minLength = 1, maxLength = 200, pattern = null)),
        PropSpec("labels", required = true, value = ValueSpec.ListOf(item = ValueSpec.TextValue(minLength = 1, maxLength = 60, pattern = null), minItems = 1, maxItems = 24)),
        PropSpec("children", required = true, value = ValueSpec.RefList(maxItems = 6)),
        PropSpec("format", required = false, value = ValueSpec.OneOf(listOf("number", "currency", "percent"))),
        PropSpec("currency", required = false, value = ValueSpec.TextValue(minLength = null, maxLength = null, pattern = "^[A-Z]{3}\$")),
      ),
    ),
    ComponentType.PIE_CHART to ComponentSpec(
      positional = listOf("title", "children"),
      props = listOf(
        PropSpec("title", required = true, value = ValueSpec.TextValue(minLength = 1, maxLength = 200, pattern = null)),
        PropSpec("children", required = true, value = ValueSpec.RefList(maxItems = 8)),
        PropSpec("format", required = false, value = ValueSpec.OneOf(listOf("number", "currency", "percent"))),
        PropSpec("currency", required = false, value = ValueSpec.TextValue(minLength = null, maxLength = null, pattern = "^[A-Z]{3}\$")),
      ),
    ),
    ComponentType.SERIES to ComponentSpec(
      positional = listOf("name", "values"),
      props = listOf(
        PropSpec("name", required = true, value = ValueSpec.TextValue(minLength = 1, maxLength = 200, pattern = null)),
        PropSpec("values", required = true, value = ValueSpec.ListOf(item = ValueSpec.NumberValue(minimum = null, maximum = null, integer = false), minItems = 1, maxItems = 24)),
      ),
    ),
    ComponentType.SLICE to ComponentSpec(
      positional = listOf("name", "value"),
      props = listOf(
        PropSpec("name", required = true, value = ValueSpec.TextValue(minLength = 1, maxLength = 200, pattern = null)),
        PropSpec("value", required = true, value = ValueSpec.NumberValue(minimum = 0.0, maximum = null, integer = false)),
      ),
    ),
  )

  val mcpMutation: ComponentSpec = ComponentSpec(
    positional = listOf("target"),
    props = listOf(
      PropSpec("target", required = true, value = ValueSpec.Ref),
      PropSpec("tool", required = true, value = ValueSpec.TextValue(minLength = null, maxLength = 128, pattern = "^[a-z][A-Za-z0-9_]*(\\.[a-z][A-Za-z0-9_]*)+\$")),
      PropSpec("params", required = false, value = ValueSpec.Record(key = ValueSpec.TextValue(minLength = null, maxLength = 64, pattern = "^[A-Za-z_][A-Za-z0-9_]*\$"), value = ValueSpec.AnyOf(listOf(ValueSpec.AnyOf(listOf(ValueSpec.TextValue(minLength = null, maxLength = 2000, pattern = null), ValueSpec.NumberValue(minimum = null, maximum = null, integer = false), ValueSpec.BooleanValue, ValueSpec.NullValue)), ValueSpec.State)))),
    ),
  )
}
