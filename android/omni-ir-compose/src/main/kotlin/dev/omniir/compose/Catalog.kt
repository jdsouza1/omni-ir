// The Trusted Catalog for Compose. These composables own all styling: Material 3 from the host app's
// theme, so its colours, light and dark mode and the user's font size apply. Nothing from the stream
// can choose a colour, a font or a layout beyond the catalog's fixed values. Stream text is always
// shown as plain text.
package dev.omniir.compose

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.toggleable
import androidx.compose.material3.Button
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.PrimaryScrollableTabRow
import androidx.compose.material3.Switch
import androidx.compose.material3.Tab
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.SelectableDates
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.CollectionInfo
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.collectionInfo
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.omniir.core.ComponentType
import dev.omniir.core.OmniNode
import dev.omniir.core.Primitive
import dev.omniir.core.PropValue
import dev.omniir.core.isMutating
import dev.omniir.runtime.Format
import dev.omniir.runtime.Governance
import dev.omniir.runtime.Slot
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneOffset
import java.util.Locale

@Composable
internal fun NodeContent(node: OmniNode, context: RenderContext) {
  val props = Props(node, context)
  when (node.type) {
    ComponentType.STACK -> StackView(node, props)
    ComponentType.CARD -> CardView(node, props)
    ComponentType.HEADING -> HeadingView(props)
    ComponentType.TEXT -> TextView(props)
    ComponentType.INPUT -> InputView(props)
    ComponentType.BUTTON -> ButtonView(node, props, context)
    ComponentType.DIVIDER -> HorizontalDivider()
    ComponentType.BADGE -> BadgeView(props)
    ComponentType.SKELETON -> SkeletonLines(props.number("lines")?.toInt() ?: 1)
    ComponentType.IMAGE -> ImageView(props, context)
    ComponentType.RATING -> RatingView(props)
    ComponentType.DATE_INPUT -> DateInputView(props)
    ComponentType.LIST -> ListView(node)
    ComponentType.LIST_ITEM -> ListItemView(props, context)
    ComponentType.MESSAGE -> MessageView(props)
    ComponentType.SELECT -> SelectView(props, context)
    ComponentType.SWITCH -> SwitchView(props, context)
    ComponentType.TABLE -> TableView(node, props, context)
    ComponentType.TABLE_ROW -> TableRowLine(node, context)
    ComponentType.TABS -> TabsView(node, context)
    ComponentType.TAB -> Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) { ColumnChildren(node.children, stretch = true) }
    ComponentType.NOTICE -> NoticeView(props)
  }
}

/** Reading one node's props, with `$state` resolved against the current document. */
internal class Props(private val node: OmniNode, private val context: RenderContext) {
  fun has(name: String) = name in node.props
  fun text(name: String) = context.store.text(node.props[name], context.document)
  fun resolved(name: String) = context.store.resolve(node.props[name], context.document)
  fun option(name: String) = (node.props[name] as? PropValue.Text)?.value
  fun number(name: String) = (node.props[name] as? PropValue.Number)?.value
  fun stateKey() = (node.props["value"] as? PropValue.State)?.key ?: ""
  fun stateText() = context.store.stateText(stateKey(), context.document)
  fun setState(value: String) = context.store.setState(stateKey(), Primitive.Text(value))
  fun texts(name: String) = Format.texts(node.props[name])
}

@Composable
private fun locale(): Locale = LocalConfiguration.current.locales[0] ?: Locale.getDefault()

@Composable
private fun isDark() = MaterialTheme.colorScheme.surface.luminance() < 0.5f

// MARK: Layout

@Composable
private fun StackView(node: OmniNode, props: Props) {
  val gap = when (props.option("gap")) {
    "none" -> 0.dp
    "sm" -> 8.dp
    "lg" -> 24.dp
    else -> 16.dp
  }
  val align = props.option("align") ?: "stretch"
  if (props.option("direction") == "row") {
    val vertical = when (align) {
      "start" -> Alignment.Top
      "end" -> Alignment.Bottom
      else -> Alignment.CenterVertically
    }
    AdaptiveRow(gap, vertical) {
      for (id in node.children) key(id) { NodeSlot(id) }
    }
  } else {
    val horizontal = when (align) {
      "center" -> Alignment.CenterHorizontally
      "end" -> Alignment.End
      else -> Alignment.Start
    }
    Column(verticalArrangement = Arrangement.spacedBy(gap), horizontalAlignment = horizontal, modifier = Modifier.fillMaxWidth()) {
      ColumnChildren(node.children, stretch = align == "stretch")
    }
  }
}

@Composable
private fun CardView(node: OmniNode, props: Props) {
  val scheme = MaterialTheme.colorScheme
  OutlinedCard(
    colors = CardDefaults.outlinedCardColors(containerColor = if (isDark()) scheme.surfaceContainerHigh else scheme.surfaceContainerLowest),
    border = BorderStroke(1.dp, scheme.outlineVariant),
    shape = RoundedCornerShape(12.dp),
    modifier = Modifier.widthIn(max = 512.dp).fillMaxWidth(),
  ) {
    Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.padding(20.dp)) {
      if (props.has("title")) Text(props.text("title"), style = MaterialTheme.typography.titleMedium)
      ColumnChildren(node.children, stretch = true)
    }
  }
}

@Composable
private fun ListView(node: OmniNode) {
  Column(Modifier.fillMaxWidth()) {
    node.children.forEachIndexed { i, id ->
      key(id) {
        if (i > 0) HorizontalDivider()
        Box(Modifier.fillMaxWidth()) { NodeSlot(id) }
      }
    }
  }
}

// MARK: Text

@Composable
private fun HeadingView(props: Props) {
  val style = when (props.number("level")?.toInt()) {
    1 -> MaterialTheme.typography.headlineMedium
    3 -> MaterialTheme.typography.titleMedium
    else -> MaterialTheme.typography.titleLarge
  }
  Text(props.text("text"), style = style, fontWeight = FontWeight.Bold, modifier = Modifier.semantics { heading() })
}

@Composable
private fun TextView(props: Props) {
  val shown = Format.text(props.resolved("text"), props.option("format"), props.option("currency"), locale())
  when (props.option("tone")) {
    "muted" -> Text(shown, style = MaterialTheme.typography.bodyLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    "strong" -> Text(shown, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
    else -> Text(shown, style = MaterialTheme.typography.bodyLarge)
  }
}

@Composable
private fun BadgeView(props: Props) {
  val dark = isDark()
  val (container, content) = when (props.option("tone")) {
    "success" -> if (dark) Color(0xFF1E3A26) to Color(0xFF8FD6A0) else Color(0xFFE3F4E6) to Color(0xFF1B5E20)
    "warning" -> if (dark) Color(0xFF3D3011) to Color(0xFFF2CC6B) else Color(0xFFFFF4D6) to Color(0xFF7A5200)
    "danger" -> if (dark) Color(0xFF45201F) to Color(0xFFF2A3A0) else Color(0xFFFDE4E4) to Color(0xFF8E1C1C)
    else -> MaterialTheme.colorScheme.surfaceVariant to MaterialTheme.colorScheme.onSurfaceVariant
  }
  Text(
    props.text("text"),
    style = MaterialTheme.typography.labelMedium,
    fontWeight = FontWeight.SemiBold,
    color = content,
    modifier = Modifier.background(container, RoundedCornerShape(50)).padding(horizontal = 10.dp, vertical = 3.dp),
  )
}

@Composable
private fun MessageView(props: Props) {
  val fromUser = props.option("from") == "user"
  val body = props.text("text")
  val shape = if (fromUser) RoundedCornerShape(16.dp, 16.dp, 4.dp, 16.dp) else RoundedCornerShape(16.dp, 16.dp, 16.dp, 4.dp)
  Box(
    contentAlignment = if (fromUser) Alignment.CenterEnd else Alignment.CenterStart,
    modifier = Modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = "${if (fromUser) "You" else "Assistant"}: $body" },
  ) {
    Box(Modifier.fillMaxWidth(0.85f), contentAlignment = if (fromUser) Alignment.CenterEnd else Alignment.CenterStart) {
      Surface(
        shape = shape,
        color = if (fromUser) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant,
        contentColor = if (fromUser) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurfaceVariant,
      ) {
        Text(body, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.padding(horizontal = 14.dp, vertical = 10.dp))
      }
    }
  }
}

// MARK: Pictures

@Composable
private fun ImageView(props: Props, context: RenderContext) {
  val alt = props.text("alt")
  val ratio = when (props.option("ratio")) {
    "1:1" -> 1f
    "4:3" -> 4f / 3
    "3:2" -> 3f / 2
    else -> 16f / 9
  }
  val frame = Modifier.fillMaxWidth().aspectRatio(ratio).clip(RoundedCornerShape(10.dp))
  val picture = context.pictures[props.text("asset")]
  if (picture != null) {
    Image(picture, contentDescription = alt, contentScale = ContentScale.Crop, modifier = frame)
  } else {
    // The stream named a picture this app doesn't have: show its description instead.
    Box(
      contentAlignment = Alignment.Center,
      modifier = frame.background(MaterialTheme.colorScheme.surfaceVariant).semantics { contentDescription = alt; role = Role.Image },
    ) {
      Text(alt, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(8.dp))
    }
  }
}

@Composable
private fun RatingView(props: Props) {
  val model = Format.rating(props.resolved("value"), props.number("max")?.toInt(), locale())
  Row(
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(6.dp),
    modifier = Modifier.clearAndSetSemantics { contentDescription = model.label },
  ) {
    Text(
      "★".repeat(model.filled),
      color = Color(0xFFF59E0B),
      style = MaterialTheme.typography.titleMedium,
    )
    if (model.max > model.filled) {
      Text("★".repeat(model.max - model.filled), color = MaterialTheme.colorScheme.outlineVariant, style = MaterialTheme.typography.titleMedium)
    }
    Text(model.shown, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
  }
}

@Composable
private fun ListItemView(props: Props, context: RenderContext) {
  Row(
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(12.dp),
    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp).semantics(mergeDescendants = true) {},
  ) {
    if (props.has("image")) {
      // Decorative: the title already says what it shows.
      val thumbnail = Modifier.size(48.dp).clip(RoundedCornerShape(10.dp))
      val picture = context.pictures[props.text("image")]
      if (picture != null) Image(picture, contentDescription = null, contentScale = ContentScale.Crop, modifier = thumbnail)
      else Box(thumbnail.background(MaterialTheme.colorScheme.surfaceVariant))
    }
    Column(Modifier.weight(1f)) {
      Text(props.text("title"), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
      if (props.has("detail")) Text(props.text("detail"), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
    if (props.has("trailing")) Text(props.text("trailing"), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.SemiBold)
  }
}

// MARK: Interactive components

/** An Input edits its `$key` locally; it never calls the backend by itself (R1). */
@Composable
private fun InputView(props: Props) {
  // More than one line: a fixed-height box that shows `lines` lines; longer text scrolls inside it.
  val lines = props.number("lines")?.toInt()?.coerceIn(1, 10) ?: 1
  OutlinedTextField(
    value = props.stateText(),
    onValueChange = { props.setState(it) },
    label = { Text(props.text("label")) },
    placeholder = if (props.has("placeholder")) ({ Text(props.text("placeholder")) }) else null,
    singleLine = lines == 1,
    minLines = lines,
    maxLines = lines,
    modifier = Modifier.fillMaxWidth(),
  )
}

/** A DateInput edits a `$key` holding "YYYY-MM-DD" (or "" for no date), the same day in every time zone. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun DateInputView(props: Props) {
  val label = props.text("label")
  val day = Format.day(props.stateText())
  val shown = day?.let { Format.text(Primitive.Text(it.toString()), "date", null, locale()) }
  val lower = props.option("min")?.let(Format::day)
  val upper = props.option("max")?.let(Format::day)
  var open by remember { mutableStateOf(false) }
  Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
    Text(label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    FilledTonalButton(onClick = { open = true }, modifier = Modifier.semantics { contentDescription = "$label: ${shown ?: "choose a date"}" }) {
      Text(shown ?: "Choose a date")
    }
  }
  if (open) {
    val state = rememberDatePickerState(
      initialSelectedDateMillis = day?.let(::utcMillis),
      selectableDates = object : SelectableDates {
        override fun isSelectableDate(utcTimeMillis: Long): Boolean {
          val d = Instant.ofEpochMilli(utcTimeMillis).atZone(ZoneOffset.UTC).toLocalDate()
          return (lower == null || !d.isBefore(lower)) && (upper == null || !d.isAfter(upper))
        }
      },
    )
    DatePickerDialog(
      onDismissRequest = { open = false },
      confirmButton = {
        TextButton(onClick = {
          state.selectedDateMillis?.let { props.setState(Instant.ofEpochMilli(it).atZone(ZoneOffset.UTC).toLocalDate().toString()) }
          open = false
        }) { Text("OK") }
      },
      dismissButton = { TextButton(onClick = { open = false }) { Text("Cancel") } },
    ) { DatePicker(state) }
  }
}

/** A Select edits a text `$key`; a value that isn't one of its options shows as nothing chosen. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SelectView(props: Props, context: RenderContext) {
  val options = props.texts("options")
  val chosen = context.store.chosenOption(props.stateKey(), options, context.document)
  var expanded by remember { mutableStateOf(false) }
  ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }) {
    OutlinedTextField(
      value = chosen,
      onValueChange = {},
      readOnly = true,
      label = { Text(props.text("label")) },
      placeholder = if (props.has("placeholder")) ({ Text(props.text("placeholder")) }) else null,
      trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
      modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable).fillMaxWidth(),
    )
    ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
      for (option in options) {
        DropdownMenuItem(text = { Text(option) }, onClick = {
          props.setState(option)
          expanded = false
        })
      }
    }
  }
}

/** A Switch edits a true/false `$key`. */
@Composable
private fun SwitchView(props: Props, context: RenderContext) {
  val key = props.stateKey()
  val on = context.store.stateBool(key, context.document)
  val label = props.text("label")
  Row(
    verticalAlignment = Alignment.CenterVertically,
    horizontalArrangement = Arrangement.spacedBy(16.dp),
    modifier = Modifier.fillMaxWidth().toggleable(value = on, role = Role.Switch, onValueChange = { context.store.setState(key, Primitive.Bool(it)) }),
  ) {
    Text(label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
    Switch(checked = on, onCheckedChange = null)
  }
}

/**
 * A Table: column headings, then one row per TableRow, each column as wide as its widest cell. A row
 * that hasn't arrived is a placeholder; one that never arrives is a fallback. Too wide a table scrolls sideways.
 */
@Composable
private fun TableView(node: OmniNode, props: Props, context: RenderContext) {
  val columns = props.texts("columns")
  val count = columns.size.coerceAtLeast(1)
  val loc = locale()
  // Every grid cell, row by row: headings, then each row's cells (or a placeholder or fallback).
  val cells = buildList<TableCell> {
    for (column in columns) add(TableCell.Heading(column))
    for (id in node.children) {
      val slot = context.store.slot(id, context.document)
      val row = (slot as? Slot.Node)?.node?.takeIf { it.type == ComponentType.TABLE_ROW }
      if (row != null) {
        val values = Format.cells(row.props["cells"], loc)
        for (c in 0 until count) add(TableCell.Value(values.getOrNull(c) ?: Format.Cell("", false)))
      } else {
        add(if (slot is Slot.Pending) TableCell.Pending else TableCell.Missing)
        repeat(count - 1) { add(TableCell.Value(Format.Cell("", false))) }
      }
    }
  }
  Box(Modifier.fillMaxWidth().horizontalScroll(rememberScrollState()).semantics { collectionInfo = CollectionInfo(node.children.size + 1, count) }) {
    TableGrid(count, ends = cells.map { it is TableCell.Value && it.cell.isNumber }) {
      cells.forEachIndexed { i, cell ->
        val pad = Modifier.cellPadding(i % count)
        when (cell) {
          is TableCell.Heading -> Text(cell.text, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = pad.semantics { heading() })
          is TableCell.Value -> Text(cell.cell.text, style = MaterialTheme.typography.bodyMedium, modifier = pad)
          TableCell.Pending -> Box(pad.width(64.dp)) { SkeletonLines(1) }
          TableCell.Missing -> Box(pad) { Fallback() }
        }
      }
    }
  }
}

private sealed interface TableCell {
  data class Heading(val text: String) : TableCell
  data class Value(val cell: Format.Cell) : TableCell
  data object Pending : TableCell
  data object Missing : TableCell
}

private fun Modifier.cellPadding(column: Int): Modifier = this.padding(start = if (column == 0) 0.dp else 16.dp, top = 8.dp, bottom = 8.dp)

/** Lays out its children as a grid of `columns` columns, each as wide as its widest cell; `ends` marks cells aligned to their column's end. */
@Composable
private fun TableGrid(columns: Int, ends: List<Boolean>, content: @Composable () -> Unit) {
  Layout(content) { measurables, constraints ->
    val loose = constraints.copy(minWidth = 0, minHeight = 0, maxWidth = Constraints.Infinity)
    val placeables = measurables.map { it.measure(loose) }
    val widths = IntArray(columns)
    placeables.forEachIndexed { i, p -> widths[i % columns] = maxOf(widths[i % columns], p.width) }
    val rows = (placeables.size + columns - 1) / columns
    val heights = IntArray(rows) { r -> (0 until columns).maxOf { c -> placeables.getOrNull(r * columns + c)?.height ?: 0 } }
    layout(widths.sum().coerceAtLeast(constraints.minWidth), heights.sum()) {
      var y = 0
      for (r in 0 until rows) {
        var x = 0
        for (c in 0 until columns) {
          val i = r * columns + c
          val p = placeables.getOrNull(i) ?: continue
          p.placeRelative(if (ends.getOrNull(i) == true) x + widths[c] - p.width else x, y)
          x += widths[c]
        }
        y += heights[r]
      }
    }
  }
}

/** A TableRow is drawn by its Table. This is only reached for a row outside a Table, which the parser rejects. */
@Composable
private fun TableRowLine(node: OmniNode, context: RenderContext) {
  val cells = Format.cells(node.props["cells"], locale())
  Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) { for (cell in cells) Text(cell.text) }
}

/**
 * Tabs: a row of tabs with the Tabs' labels, then the open Tab. The first Tab is open until the viewer
 * picks another; which one is open is the viewer's choice, never `$state`.
 */
@Composable
private fun TabsView(node: OmniNode, context: RenderContext) {
  val labels = context.store.tabLabels(node.children, context.document)
  var picked by remember { mutableStateOf<String?>(null) }
  val open = picked?.takeIf { it in node.children } ?: node.children.firstOrNull()
  val index = node.children.indexOf(open).coerceAtLeast(0)
  Column(verticalArrangement = Arrangement.spacedBy(12.dp), modifier = Modifier.fillMaxWidth()) {
    PrimaryScrollableTabRow(selectedTabIndex = index, edgePadding = 0.dp) {
      node.children.forEachIndexed { i, id ->
        Tab(selected = id == open, onClick = { picked = id }, text = { Text(labels.getOrNull(i) ?: "…") })
      }
    }
    if (open != null) key(open) { Box(Modifier.fillMaxWidth()) { NodeSlot(open) } }
  }
}

/** A Notice: a short message in a tinted box, with an icon for its tone. */
@Composable
private fun NoticeView(props: Props) {
  val dark = isDark()
  val (container, accent, symbol) = when (props.option("tone")) {
    "success" -> Triple(if (dark) Color(0xFF1E3A26) else Color(0xFFE3F4E6), if (dark) Color(0xFF8FD6A0) else Color(0xFF1B5E20), "✓")
    "warning" -> Triple(if (dark) Color(0xFF3D3011) else Color(0xFFFFF4D6), if (dark) Color(0xFFF2CC6B) else Color(0xFF7A5200), "!")
    "danger" -> Triple(if (dark) Color(0xFF45201F) else Color(0xFFFDE4E4), if (dark) Color(0xFFF2A3A0) else Color(0xFF8E1C1C), "✕")
    else -> Triple(MaterialTheme.colorScheme.secondaryContainer, MaterialTheme.colorScheme.onSecondaryContainer, "i")
  }
  Row(
    horizontalArrangement = Arrangement.spacedBy(10.dp),
    modifier = Modifier.fillMaxWidth().background(container, RoundedCornerShape(10.dp)).padding(12.dp).semantics(mergeDescendants = true) {},
  ) {
    Text(symbol, color = accent, fontWeight = FontWeight.Bold, modifier = Modifier.clearAndSetSemantics {})
    Column(verticalArrangement = Arrangement.spacedBy(2.dp)) {
      if (props.has("title")) Text(props.text("title"), style = MaterialTheme.typography.titleSmall, color = accent)
      Text(props.text("text"), style = MaterialTheme.typography.bodyMedium)
    }
  }
}

private fun utcMillis(day: LocalDate): Long = day.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()

/**
 * A Button. With an action it stays disabled until an McpMutation approves it, and a press goes
 * through the store's checks before the app's handler runs (R6).
 */
@Composable
private fun ButtonView(node: OmniNode, props: Props, context: RenderContext) {
  val governance = if (isMutating(node)) context.store.governance(node.id, context.document, context.actions) else Governance.Ready("")
  val error = when (governance) {
    is Governance.NotPermitted -> governance.message
    is Governance.Blocked -> governance.message
    else -> null
  }
  val enabled = governance is Governance.Ready && node.id !in context.actions.running
  val label = props.text("label")
  val onClick = { context.press(node.id) }
  val modifier = Modifier.fillMaxWidth()
  Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
    when (props.option("variant")) {
      "secondary" -> OutlinedButton(onClick, modifier, enabled) { Text(label) }
      "danger" -> Button(onClick, modifier, enabled, colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error, contentColor = MaterialTheme.colorScheme.onError)) { Text(label) }
      else -> Button(onClick, modifier, enabled) { Text(label) }
    }
    if (error != null) Text(error, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.error)
  }
}

