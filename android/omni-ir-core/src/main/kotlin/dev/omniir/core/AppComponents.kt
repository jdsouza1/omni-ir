// App-defined components (Step 20, PLAN-APPCOMPONENTS.md): an app declares its own components with
// the same kinds of value the Trusted Catalog uses, and lines that use one are checked like a
// built-in component. Port of packages/core/src/appComponents.ts: the declarations are the same
// plain JSON (see appComponentsFromJson in omni-ir-runtime), compiled to the same spec the catalog's
// components use, so the three parsers agree. An app component can show values, edit one $state and
// hold children; it can never run an action, carry styling or code, or load a URL.
package dev.omniir.core

/** A declaration problem: found when the app starts, never while a stream is read. */
public class AppComponentException(message: String) : IllegalArgumentException(message)

/** What kind of value an edited `$state` holds. */
public enum class StateHolds(public val wireName: String) { TEXT("text"), NUMBER("number"), BOOLEAN("boolean") }

/** One prop of an app component, as in the plain-JSON declaration. */
public sealed interface AppProp {
  public val optional: Boolean

  /** Text, or a `$state` whose current value is shown (unless [state] is false). */
  public data class Text(val minLength: Int? = null, val maxLength: Int? = null, val state: Boolean = true, override val optional: Boolean = false) : AppProp

  /** A number, or a `$state` whose current value is shown (unless [state] is false). */
  public data class Number(
    val minimum: Double? = null,
    val maximum: Double? = null,
    val integer: Boolean = false,
    val state: Boolean = true,
    override val optional: Boolean = false,
  ) : AppProp

  public data class Bool(override val optional: Boolean = false) : AppProp

  /** One of the listed text values. */
  public data class OneOf(val values: List<String>, override val optional: Boolean = false) : AppProp

  /** The `$state` the component edits; the prop must be called `value`. */
  public data class State(val holds: StateHolds, override val optional: Boolean = false) : AppProp

  /** A picture name: registered with the app, or matching one of its picture patterns. Never a URL. */
  public data class Picture(override val optional: Boolean = false) : AppProp

  /** A list of plain text (`numbers` false) or numbers. */
  public data class ListOf(val numbers: Boolean = false, val maxItems: Int? = null, override val optional: Boolean = false) : AppProp
}

public data class AppComponentDeclaration(
  /** What it is, in one sentence, for the model (and for people reviewing streams). */
  val description: String,
  /** Props in declaration order (keep a LinkedHashMap or mapOf's order). */
  val props: Map<String, AppProp>,
  /** Props that may be written without their names, in order; `children` may be among them. */
  val positional: List<String> = emptyList(),
  /** Present when it holds other components: at most this many. */
  val childrenMax: Int? = null,
  /** It edits a `$state` (its `value` prop) the person fills in, and accepts `required` ([8.2]). */
  val field: Boolean = false,
)

/** A declared component, ready for the parser. */
public class AppComponent internal constructor(
  public val name: String,
  public val declaration: AppComponentDeclaration,
  internal val spec: ComponentSpec,
  /** What the `$state` it edits holds, when it edits one. */
  public val holds: StateHolds?,
) {
  public val field: Boolean get() = declaration.field
}

/** The app's components, by name. */
public class AppComponents private constructor(private val byName: Map<String, AppComponent>) {
  public operator fun get(name: String): AppComponent? = byName[name]

  public val names: List<String> get() = byName.keys.toList()

  public companion object {
    public val NONE: AppComponents = AppComponents(emptyMap())

    /** Declare the app's components; throws [AppComponentException] for any problem. */
    public fun define(declarations: Map<String, AppComponentDeclaration>): AppComponents =
      AppComponents(declarations.entries.associateTo(LinkedHashMap()) { (name, d) -> name to compile(name, d) })
  }
}

public object AppLimits {
  public const val PROPS: Int = 24
  public const val DESCRIPTION: Int = 300
  public const val LIST_ITEMS: Int = 50
}

private val NAME = Regex("[A-Z][A-Za-z0-9]{0,63}")
private val PROP_NAME = Regex("[a-z][A-Za-z0-9]{0,63}")
private const val MAX_SAFE = 9007199254740991.0

private fun refuse(name: String, why: String): Nothing = throw AppComponentException("app component \"$name\": $why")

private fun valueSpec(component: String, prop: String, p: AppProp): ValueSpec {
  fun bad(why: String): Nothing = refuse(component, "prop \"$prop\" $why")
  return when (p) {
    is AppProp.Text -> {
      if ((p.minLength != null && p.minLength < 0) || (p.maxLength != null && (p.maxLength < 1 || p.maxLength > Limits.TEXT))) bad("needs whole-number lengths up to ${Limits.TEXT}")
      if (p.minLength != null && p.maxLength != null && p.minLength > p.maxLength) bad("has minLength above maxLength")
      val text = ValueSpec.TextValue(p.minLength, p.maxLength ?: Limits.TEXT, null)
      if (p.state) ValueSpec.AnyOf(listOf(text, ValueSpec.State)) else text
    }
    is AppProp.Number -> {
      if ((p.minimum != null && !p.minimum.isFinite()) || (p.maximum != null && !p.maximum.isFinite())) bad("needs finite limits")
      if (p.minimum != null && p.maximum != null && p.minimum > p.maximum) bad("has a minimum above its maximum")
      // A whole number is also within ±(2^53 - 1), as JSON Schema's integers and the TypeScript parser have it.
      val min = if (p.integer) maxOf(p.minimum ?: -MAX_SAFE, -MAX_SAFE) else p.minimum
      val max = if (p.integer) minOf(p.maximum ?: MAX_SAFE, MAX_SAFE) else p.maximum
      val number = ValueSpec.NumberValue(min, max, p.integer)
      if (p.state) ValueSpec.AnyOf(listOf(number, ValueSpec.State)) else number
    }
    is AppProp.Bool -> ValueSpec.BooleanValue
    is AppProp.OneOf -> {
      if (p.values.isEmpty() || p.values.size > AppLimits.LIST_ITEMS || p.values.any { it.isEmpty() || it.length > 200 }) bad("needs 1 to 50 text choices")
      ValueSpec.OneOf(p.values)
    }
    is AppProp.State -> {
      if (prop != "value") bad("edits a \$state, so it must be called \"value\"")
      ValueSpec.State
    }
    is AppProp.Picture -> ValueSpec.TextValue(null, 64, "^[a-z0-9][a-z0-9-]*$")
    is AppProp.ListOf -> {
      val max = p.maxItems ?: AppLimits.LIST_ITEMS
      if (max < 1 || max > AppLimits.LIST_ITEMS) bad("needs maxItems from 1 to ${AppLimits.LIST_ITEMS}")
      val item = if (p.numbers) ValueSpec.NumberValue(null, null, false) else ValueSpec.TextValue(null, Limits.TEXT, null)
      ValueSpec.ListOf(item, null, max)
    }
  }
}

private fun compile(name: String, d: AppComponentDeclaration): AppComponent {
  if (!NAME.matches(name)) refuse(name, "names start with a capital letter and use only letters and digits")
  if (ComponentType.fromWireName(name) != null || name == "McpMutation" || name == "App") refuse(name, "this name is taken by the Trusted Catalog")
  if (d.description.isBlank() || d.description.length > AppLimits.DESCRIPTION) refuse(name, "needs a description of 1 to ${AppLimits.DESCRIPTION} characters")
  if (d.props.size > AppLimits.PROPS) refuse(name, "has more than ${AppLimits.PROPS} props")
  val reserved = setOf("children", "action", "required", "kind") + Catalog.reservedWords
  val specs = mutableListOf<PropSpec>()
  var holds: StateHolds? = null
  for ((prop, p) in d.props) {
    if (!PROP_NAME.matches(prop) || prop in reserved) refuse(name, "\"$prop\" can't be a prop name")
    specs += PropSpec(prop, !p.optional, valueSpec(name, prop, p))
    if (p is AppProp.State) holds = p.holds
  }
  if (d.field) {
    if (holds == null) refuse(name, "a field edits a \$state: give it a \"value\" prop made with state()")
    specs += PropSpec("required", false, ValueSpec.BooleanValue)
  }
  d.childrenMax?.let { max ->
    if (max < 1 || max > Limits.CHILDREN) refuse(name, "children.max must be from 1 to ${Limits.CHILDREN}")
    specs += PropSpec("children", false, ValueSpec.RefList(max))
  }
  for (p in d.positional) if (specs.none { it.name == p } || p == "required") refuse(name, "positional \"$p\" isn't one of its props")
  if (d.positional.toSet().size != d.positional.size) refuse(name, "lists a positional prop twice")
  return AppComponent(name, d, ComponentSpec(d.positional, specs), holds)
}

// MARK: Pictures looked up when drawn

/** A family of picture names the app looks up when a screen is drawn, such as `product-{id}`. */
public data class PicturePattern(
  /** The fixed start, such as `product-`. */
  val prefix: String,
  /** `digits`: 0-9; `letters-digits`: a-z and 0-9. */
  val id: String,
  /** Longest id. */
  val maxLength: Int,
) {
  public companion object {
    private val PATTERN = Regex("([a-z0-9][a-z0-9-]*-)\\{id\\}")

    public fun of(pattern: String, id: String, maxLength: Int = 32): PicturePattern {
      val m = PATTERN.matchEntire(pattern)
        ?: throw AppComponentException("picture pattern \"$pattern\": write a lowercase prefix ending in \"-\", then {id}, such as \"product-{id}\"")
      val prefix = m.groupValues[1]
      if (id != "digits" && id != "letters-digits") throw AppComponentException("picture pattern \"$pattern\": id is \"digits\" or \"letters-digits\"")
      if (maxLength < 1 || prefix.length + maxLength > 64) throw AppComponentException("picture pattern \"$pattern\": names are at most 64 characters")
      return PicturePattern(prefix, id, maxLength)
    }
  }
}

/** True when a picture name matches one of the app's patterns. */
public fun matchesPicturePattern(name: String, patterns: List<PicturePattern>): Boolean = patterns.any { p ->
  if (!name.startsWith(p.prefix)) return@any false
  val id = name.substring(p.prefix.length)
  id.length in 1..p.maxLength && id.all { c -> c in '0'..'9' || (p.id == "letters-digits" && c in 'a'..'z') }
}

// MARK: Reading the plain-JSON declarations

/**
 * The app's components from their plain-JSON declarations (as `componentDeclarations` writes them in
 * TypeScript), already parsed into maps, lists, numbers, text and booleans. Throws
 * [AppComponentException] for anything malformed.
 */
public fun appComponentsFromJsonValue(json: Map<*, *>): AppComponents =
  AppComponents.define(json.entries.associateTo(LinkedHashMap()) { (name, d) -> name.toString() to declarationFrom(name.toString(), d) })

/** Picture patterns from plain JSON: a list of `{prefix, id, maxLength}`. */
public fun picturePatternsFromJsonValue(json: List<*>): List<PicturePattern> = json.map { p ->
  val m = p as? Map<*, *> ?: throw AppComponentException("a picture pattern must be an object")
  val prefix = m["prefix"] as? String ?: throw AppComponentException("a picture pattern needs a prefix")
  PicturePattern.of("$prefix{id}", m["id"] as? String ?: "", (m["maxLength"] as? Number)?.toInt() ?: 32)
}

private fun declarationFrom(name: String, value: Any?): AppComponentDeclaration {
  val d = value as? Map<*, *> ?: refuse(name, "the declaration must be an object")
  val props = (d["props"] as? Map<*, *> ?: emptyMap<Any, Any>()).entries.associateTo(LinkedHashMap()) { (prop, p) ->
    prop.toString() to propFrom(name, prop.toString(), p as? Map<*, *> ?: refuse(name, "prop \"$prop\" must be an object"))
  }
  return AppComponentDeclaration(
    description = d["description"] as? String ?: "",
    props = props,
    positional = (d["positional"] as? List<*>)?.map { it.toString() } ?: emptyList(),
    childrenMax = ((d["children"] as? Map<*, *>)?.get("max") as? Number)?.toInt(),
    field = d["field"] == true,
  )
}

private fun propFrom(name: String, prop: String, p: Map<*, *>): AppProp {
  val optional = p["optional"] == true
  fun int(key: String) = (p[key] as? Number)?.toInt()
  fun num(key: String) = (p[key] as? Number)?.toDouble()
  return when (p["kind"]) {
    "text" -> AppProp.Text(int("minLength"), int("maxLength"), p["state"] != false, optional)
    "number" -> AppProp.Number(num("minimum"), num("maximum"), p["integer"] == true, p["state"] != false, optional)
    "boolean" -> AppProp.Bool(optional)
    "oneOf" -> AppProp.OneOf((p["values"] as? List<*>)?.map { it.toString() } ?: emptyList(), optional)
    "state" -> AppProp.State(StateHolds.entries.firstOrNull { it.wireName == p["holds"] } ?: refuse(name, "prop \"$prop\" needs holds"), optional)
    "picture" -> AppProp.Picture(optional)
    "list" -> AppProp.ListOf(p["item"] == "number", int("maxItems"), optional)
    else -> refuse(name, "prop \"$prop\" has an unknown kind")
  }
}
