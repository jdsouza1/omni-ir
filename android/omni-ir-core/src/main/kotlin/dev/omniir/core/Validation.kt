// Line-level validation: one raw statement on its own, against the catalog in Schema.generated.kt.
// Cross-line rules live in DocumentRules.kt. Port of validateStatement in packages/core/src/schema.ts.
package dev.omniir.core

/** A statement that passed validation: the only shapes the document sees. */
internal sealed interface Statement {
  /** The id or `$key` this statement defines. */
  val definedId: String

  data class Node(val node: OmniNode) : Statement {
    override val definedId: String get() = node.id
  }

  data class MutationStatement(val mutation: Mutation) : Statement {
    override val definedId: String get() = mutation.id
  }

  data class State(val key: String, val value: Primitive) : Statement {
    override val definedId: String get() = key
  }
}

internal sealed interface StatementResult {
  data class Ok(val statement: Statement) : StatementResult
  data class Failed(val issue: Issue) : StatementResult
}

/** A converted argument value: what a prop's spec is checked against. */
private sealed interface Value {
  data class Text(val value: String) : Value
  data class Num(val value: Double) : Value
  data class Bool(val value: Boolean) : Value
  data object Null : Value
  data class Ref(val id: String) : Value
  data class State(val key: String) : Value
  data class Arr(val items: List<Value>) : Value
  data class Obj(val entries: List<Pair<String, Value>>) : Value
}

/** A component call nested inside another statement (flat syntax). */
private class NotFlat(message: String) : Exception(message)

private class InvalidArgument(message: String) : Exception(message)

private fun toValue(raw: RawValue): Value = when (raw) {
  is RawValue.Str -> Value.Text(raw.value)
  is RawValue.Num -> Value.Num(raw.value)
  is RawValue.Bool -> Value.Bool(raw.value)
  RawValue.Null -> Value.Null
  is RawValue.Ident -> Value.Ref(raw.name)
  is RawValue.StateRef -> Value.State(raw.key)
  is RawValue.Array -> Value.Arr(raw.items.map(::toValue))
  is RawValue.Obj -> {
    val seen = mutableSetOf<String>()
    Value.Obj(raw.entries.map { (key, item) ->
      if (key in Catalog.reservedWords) throw InvalidArgument("\"$key\" is a reserved key")
      if (!seen.add(key)) throw InvalidArgument("duplicate key \"$key\"")
      key to toValue(item)
    })
  }
  is RawValue.Call -> throw NotFlat("nested component call ${raw.callee}(…) is not allowed; put it on its own line and reference it by id")
}

/** Map positional and named arguments onto one list of props, in order. */
private fun collectProps(callee: String, args: List<RawValue>, named: List<Pair<String, RawValue>>, positional: List<String>): List<Pair<String, Value>> {
  if (args.size > positional.size) throw InvalidArgument("$callee takes ${positional.size} positional argument(s) but got ${args.size}")
  val props = mutableListOf<Pair<String, Value>>()
  val names = mutableSetOf<String>()
  args.forEachIndexed { i, arg ->
    names += positional[i]
    props += positional[i] to toValue(arg)
  }
  for ((name, arg) in named) {
    if (!names.add(name)) throw InvalidArgument("argument \"$name\" given more than once")
    props += name to toValue(arg)
  }
  return props
}

internal fun validateStatement(
  raw: RawStatement,
  tools: ToolRegistry,
  assets: Set<String>,
  components: AppComponents = AppComponents.NONE,
  pictures: List<PicturePattern> = emptyList(),
): StatementResult {
  when (raw) {
    is RawStatement.State -> {
      if (raw.key.length > Limits.STATE_KEY_LENGTH) return failed(IssueCode.INVALID_PROPS, "state key is too long", raw.key)
      val value = try { toValue(raw.value) } catch (e: Exception) { return fail(e, raw.key) }
      val primitive = primitive(value)
        ?: return failed(IssueCode.INVALID_PROPS, "state values must be a string, number, boolean or null", raw.key)
      return StatementResult.Ok(Statement.State(raw.key, primitive))
    }
    is RawStatement.Call -> {
      val id = raw.id
      if (!isIdentifier(id)) return failed(IssueCode.INVALID_PROPS, "\"$id\" is not a valid id (too long or a reserved word)", id)
      if (raw.callee == "McpMutation") return validateMutation(raw, tools)
      val type = ComponentType.fromWireName(raw.callee)
      val spec = type?.let { Catalog.components[it] }
      if (type == null || spec == null) {
        val app = components[raw.callee] ?: return failed(IssueCode.UNKNOWN_COMPONENT, "\"${raw.callee}\" is not in the Trusted Catalog", id)
        return validateAppComponent(raw, app, assets, pictures)
      }
      val props = try { collectProps(raw.callee, raw.args, raw.named, spec.positional) } catch (e: Exception) { return fail(e, id) }
      check(props, spec)?.let { return failed(IssueCode.INVALID_PROPS, it, id) }
      crossPropRule(type, props)?.let { return failed(IssueCode.INVALID_PROPS, it, id) }

      val out = linkedMapOf<String, PropValue>()
      var children = emptyList<String>()
      for ((name, value) in props) {
        if (name == "children" && value is Value.Arr) children = value.items.mapNotNull { (it as? Value.Ref)?.id }
        else out[name] = propValue(value)
      }

      // Images come only from the app's asset registry (never a URL).
      val assetProp = when (type) {
        ComponentType.IMAGE -> "asset"
        ComponentType.LIST_ITEM -> "image"
        else -> null
      }
      val asset = (assetProp?.let { out[it] } as? PropValue.Text)?.value
      if (asset != null && asset !in assets && !matchesPicturePattern(asset, pictures)) return failed(IssueCode.UNKNOWN_ASSET, "image \"$asset\" is not in the app's asset registry", id)
      return StatementResult.Ok(Statement.Node(OmniNode(id, type, out, children)))
    }
  }
}

/** One of the app's own components (Step 20): checked like the catalog's, pictures included. */
private fun validateAppComponent(raw: RawStatement.Call, app: AppComponent, assets: Set<String>, pictures: List<PicturePattern>): StatementResult {
  val id = raw.id
  val props = try { collectProps(raw.callee, raw.args, raw.named, app.spec.positional) } catch (e: Exception) { return fail(e, id) }
  check(props, app.spec)?.let { return failed(IssueCode.INVALID_PROPS, it, id) }
  val out = linkedMapOf<String, PropValue>()
  var children = emptyList<String>()
  for ((name, value) in props) {
    if (name == "children" && value is Value.Arr) children = value.items.mapNotNull { (it as? Value.Ref)?.id }
    else out[name] = propValue(value)
  }
  for ((name, p) in app.declaration.props) {
    val picture = (out[name] as? PropValue.Text)?.value
    if (p is AppProp.Picture && picture != null && picture !in assets && !matchesPicturePattern(picture, pictures)) {
      return failed(IssueCode.UNKNOWN_ASSET, "picture \"$picture\" is not one the app knows", id)
    }
  }
  return StatementResult.Ok(Statement.Node(OmniNode(id, ComponentType.APP, out, children, appName = app.name, holds = app.holds, isField = app.field)))
}

private fun validateMutation(raw: RawStatement.Call, tools: ToolRegistry): StatementResult {
  val spec = Catalog.mcpMutation
  val props = try { collectProps("McpMutation", raw.args, raw.named, spec.positional) } catch (e: Exception) { return fail(e, raw.id) }
  check(props, spec)?.let { return failed(IssueCode.INVALID_PROPS, it, raw.id) }
  var target = ""
  var tool = ""
  var params = emptyMap<String, PropValue>()
  for ((name, value) in props) {
    when {
      name == "target" && value is Value.Ref -> target = value.id
      name == "tool" && value is Value.Text -> tool = value.value
      name == "params" && value is Value.Obj -> params = value.entries.associate { it.first to propValue(it.second) }
    }
  }
  if (tool !in tools) return failed(IssueCode.UNKNOWN_TOOL, "tool \"$tool\" is not in the client tool registry", raw.id)
  return StatementResult.Ok(Statement.MutationStatement(Mutation(raw.id, target, tool, params)))
}

private fun failed(code: IssueCode, message: String, id: String) = StatementResult.Failed(Issue(code, message, id))

private fun fail(e: Exception, id: String): StatementResult = when (e) {
  is NotFlat -> failed(IssueCode.NOT_FLAT, e.message ?: "not flat", id)
  else -> failed(IssueCode.INVALID_PROPS, e.message ?: "invalid arguments", id)
}

// MARK: - Checking values against the catalog

/** The first problem with these props, or null when they match the component's spec. */
private fun check(props: List<Pair<String, Value>>, spec: ComponentSpec): String? {
  val given = props.toMap()
  for ((name, _) in props) if (spec.props.none { it.name == name }) return "unknown prop \"$name\""
  for (prop in spec.props) {
    val value = given[prop.name]
    if (value == null) {
      if (prop.required) return "${prop.name} is required"
      continue
    }
    if (!accepts(prop.value, value)) return "${prop.name}: value not allowed"
  }
  return null
}

private fun accepts(spec: ValueSpec, value: Value): Boolean = when (spec) {
  is ValueSpec.AnyOf -> spec.options.any { accepts(it, value) }
  is ValueSpec.TextValue -> value is Value.Text &&
    (spec.minLength == null || value.value.length >= spec.minLength) &&
    (spec.maxLength == null || value.value.length <= spec.maxLength) &&
    (spec.pattern == null || matches(value.value, spec.pattern))
  is ValueSpec.NumberValue -> value is Value.Num && value.value.isFinite() &&
    (!spec.integer || value.value == Math.rint(value.value)) &&
    (spec.minimum == null || value.value >= spec.minimum) &&
    (spec.maximum == null || value.value <= spec.maximum)
  ValueSpec.BooleanValue -> value is Value.Bool
  ValueSpec.NullValue -> value is Value.Null
  is ValueSpec.OneOf -> value is Value.Text && value.value in spec.allowed
  is ValueSpec.TextConstant -> value is Value.Text && value.value == spec.value
  is ValueSpec.NumberConstant -> value is Value.Num && value.value == spec.value
  ValueSpec.State -> value is Value.State && value.key.length <= Limits.STATE_KEY_LENGTH
  ValueSpec.Ref -> value is Value.Ref && isIdentifier(value.id)
  is ValueSpec.RefList -> value is Value.Arr &&
    (spec.maxItems == null || value.items.size <= spec.maxItems) &&
    value.items.all { it is Value.Ref && isIdentifier(it.id) }
  is ValueSpec.ListOf -> value is Value.Arr &&
    (spec.minItems == null || value.items.size >= spec.minItems) &&
    (spec.maxItems == null || value.items.size <= spec.maxItems) &&
    value.items.all { accepts(spec.item, it) }
  is ValueSpec.Record -> value is Value.Obj &&
    value.entries.all { (key, item) -> accepts(spec.key, Value.Text(key)) && key !in Catalog.reservedWords && accepts(spec.value, item) }
}

/** Rules that span more than one prop (schema.json `crossPropRules`), coded by hand. */
private fun crossPropRule(type: ComponentType, props: List<Pair<String, Value>>): String? {
  if (type == ComponentType.RATING) {
    val given = props.toMap()
    val max = (given["max"] as? Value.Num)?.value ?: 5.0
    val value = (given["value"] as? Value.Num)?.value
    if (value != null && value > max) return "value must not be more than max (default 5)"
  }
  if (type == ComponentType.INPUT) {
    val given = props.toMap()
    val min = (given["minLength"] as? Value.Num)?.value
    val max = (given["maxLength"] as? Value.Num)?.value
    if (min != null && max != null && min > max) return "minLength must not be more than maxLength"
  }
  return null
}

/** A valid component id: the identifier pattern (guaranteed by the tokenizer), the length limit, not a reserved word. */
internal fun isIdentifier(id: String): Boolean = id.length <= Limits.ID_LENGTH && id !in Catalog.reservedWords

private val compiledPatterns = java.util.concurrent.ConcurrentHashMap<String, Regex>()

/** Whole-string match with JavaScript semantics: patterns are `^…$`, `\d` is ASCII only (Java's default). */
private fun matches(s: String, pattern: String): Boolean {
  val regex = compiledPatterns.getOrPut(pattern) { Regex(pattern.removePrefix("^").removeSuffix("$")) }
  return regex.matches(s)
}

private fun primitive(value: Value): Primitive? = when {
  value is Value.Text && value.value.length <= Limits.TEXT -> Primitive.Text(value.value)
  value is Value.Num && value.value.isFinite() -> Primitive.Number(value.value)
  value is Value.Bool -> Primitive.Bool(value.value)
  value is Value.Null -> Primitive.Null
  else -> null
}

private fun propValue(value: Value): PropValue = when (value) {
  is Value.Text -> PropValue.Text(value.value)
  is Value.Num -> PropValue.Number(value.value)
  is Value.Bool -> PropValue.Bool(value.value)
  Value.Null -> PropValue.Null
  is Value.Ref -> PropValue.Ref(value.id)
  is Value.State -> PropValue.State(value.key)
  is Value.Arr -> PropValue.ListOf(value.items.map(::propValue)) // children are taken out before this
  is Value.Obj -> PropValue.Record(value.entries.associate { it.first to propValue(it.second) })
}
