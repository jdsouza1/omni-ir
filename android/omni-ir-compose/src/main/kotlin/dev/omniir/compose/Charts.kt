// Charts for the Compose Trusted Catalog (Step 11), drawn on a Canvas: no chart library. The stream
// supplies a title, labels and numbers; the colours, axes and legend are the catalog's own. TalkBack
// reads each chart as its title followed by every value.
package dev.omniir.compose

import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Path
import androidx.compose.ui.graphics.PathEffect
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.text.TextMeasurer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.drawText
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.rememberTextMeasurer
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.omniir.core.OmniNode
import dev.omniir.core.PropValue
import dev.omniir.runtime.Format
import java.util.Locale

/** Series colours in a fixed order, the same as the web renderer's (checked for colour blindness). */
private val CHART_COLORS = listOf(
  Color(0xFF2A78D6), Color(0xFFEB6834), Color(0xFF1BAF7A), Color(0xFFEDA100),
  Color(0xFFE87BA4), Color(0xFF008300), Color(0xFF4A3AA7), Color(0xFFE34948),
)

/** Line charts also tell series apart by dash pattern, so colour is never the only cue. */
private val DASHES: List<FloatArray?> = listOf(null, floatArrayOf(18f, 12f), floatArrayOf(6f, 9f), floatArrayOf(30f, 9f, 6f, 9f), floatArrayOf(3f, 12f), floatArrayOf(36f, 12f))

private fun chartColor(index: Int) = CHART_COLORS[index % CHART_COLORS.size]

@Composable
internal fun XYChartView(node: OmniNode, context: RenderContext, line: Boolean, locale: Locale) {
  val title = context.store.text(node.props["title"], context.document)
  val labels = Format.texts(node.props["labels"])
  val format = (node.props["format"] as? PropValue.Text)?.value
  val currency = (node.props["currency"] as? PropValue.Text)?.value
  val series = context.store.chartSeries(node.children, context.document)
  val values = series.flatMap { it.values }
  val ticks = Format.niceTicks(values.minOrNull() ?: 0.0, values.maxOrNull() ?: 0.0)
  val lo = ticks.first()
  val hi = ticks.last()
  val described = buildString {
    append(title)
    for (s in series) {
      append(". ").append(s.name).append(": ")
      append(labels.zip(s.values).joinToString(", ") { (l, v) -> "$l ${Format.chartValue(v, format, currency, locale)}" })
    }
  }
  val measurer = rememberTextMeasurer()
  val tickStyle = TextStyle(fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
  val grid = MaterialTheme.colorScheme.outlineVariant
  val surface = MaterialTheme.colorScheme.surface

  Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
    Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
    Canvas(Modifier.fillMaxWidth().height(200.dp).clearAndSetSemantics { contentDescription = described }) {
      val left = 48.dp.toPx()
      val bottom = 24.dp.toPx()
      val plotW = size.width - left
      val plotH = size.height - bottom - 8.dp.toPx()
      val top = 8.dp.toPx()
      fun y(v: Double) = top + plotH - ((v - lo) / (if (hi == lo) 1.0 else hi - lo) * plotH).toFloat()
      val band = plotW / labels.size.coerceAtLeast(1)
      for (t in ticks) {
        drawLine(grid, Offset(left, y(t)), Offset(size.width, y(t)), strokeWidth = 1f)
        drawTick(measurer, Format.chartTick(t, format, currency, locale), tickStyle, Offset(left - 6.dp.toPx(), y(t)), alignEnd = true)
      }
      labels.forEachIndexed { i, label -> drawTick(measurer, label, tickStyle, Offset(left + band * i + band / 2, size.height - bottom / 2), centered = true) }
      if (line) {
        for (s in series) {
          val path = Path()
          s.values.forEachIndexed { i, v -> val p = Offset(left + band * i + band / 2, y(v)); if (i == 0) path.moveTo(p.x, p.y) else path.lineTo(p.x, p.y) }
          drawPath(path, chartColor(s.index), style = Stroke(width = 2.dp.toPx(), pathEffect = DASHES[s.index % DASHES.size]?.let { PathEffect.dashPathEffect(it) }))
          s.values.forEachIndexed { i, v ->
            val p = Offset(left + band * i + band / 2, y(v))
            drawCircle(surface, radius = 5.dp.toPx(), center = p)
            drawCircle(chartColor(s.index), radius = 3.5.dp.toPx(), center = p)
          }
        }
      } else {
        val groupW = band * 0.72f
        val count = node.children.size.coerceAtLeast(1)
        val barW = (groupW / count - 2.dp.toPx()).coerceAtLeast(2f)
        for (s in series) {
          s.values.forEachIndexed { i, v ->
            val x = left + band * i + (band - groupW) / 2 + s.index * (barW + 2.dp.toPx())
            val yTop = y(maxOf(v, 0.0))
            val h = kotlin.math.abs(y(v) - y(0.0)).coerceAtLeast(1f)
            drawRoundRect(chartColor(s.index), Offset(x, yTop), Size(barW, h), CornerRadius(3.dp.toPx()))
          }
        }
      }
    }
    // One Series needs no legend: the title names it.
    if (node.children.size >= 2) Legend(series.map { Triple(it.name, chartColor(it.index), null as String?) })
  }
}

@Composable
internal fun PieChartView(node: OmniNode, context: RenderContext, locale: Locale) {
  val title = context.store.text(node.props["title"], context.document)
  val format = (node.props["format"] as? PropValue.Text)?.value
  val currency = (node.props["currency"] as? PropValue.Text)?.value
  val slices = context.store.chartSlices(node.children, context.document)
  val total = slices.sumOf { it.value }
  val surface = MaterialTheme.colorScheme.surface
  val described = title + slices.joinToString("") { ". ${it.name}: ${Format.chartValue(it.value, format, currency, locale)}, ${Format.share(it.value, total, locale)}" }
  Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) {
    Text(title, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
    Box(Modifier.fillMaxWidth(), contentAlignment = Alignment.Center) {
      Canvas(Modifier.size(180.dp).clearAndSetSemantics { contentDescription = described }) {
        var start = -90f
        for (s in slices) {
          val sweep = if (total > 0) (s.value / total * 360).toFloat() else 0f
          if (sweep > 0f) {
            drawArc(chartColor(s.index), start, sweep, useCenter = true)
            drawArc(surface, start, sweep, useCenter = true, style = Stroke(width = 2.dp.toPx()))
          }
          start += sweep
        }
      }
    }
    Legend(slices.map { Triple(it.name, chartColor(it.index), Format.share(it.value, total, locale)) })
  }
}

@OptIn(androidx.compose.foundation.layout.ExperimentalLayoutApi::class)
@Composable
private fun Legend(items: List<Triple<String, Color, String?>>) {
  FlowRow(horizontalArrangement = Arrangement.spacedBy(16.dp), verticalArrangement = Arrangement.spacedBy(4.dp), modifier = Modifier.clearAndSetSemantics {}) {
    for ((name, color, note) in items) {
      Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Canvas(Modifier.width(16.dp).height(10.dp)) { drawLine(color, Offset(0f, size.height / 2), Offset(size.width, size.height / 2), strokeWidth = 3.dp.toPx()) }
        Text(name, style = MaterialTheme.typography.bodySmall)
        if (note != null) Text(note, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
      }
    }
  }
}

private fun androidx.compose.ui.graphics.drawscope.DrawScope.drawTick(
  measurer: TextMeasurer,
  text: String,
  style: TextStyle,
  at: Offset,
  alignEnd: Boolean = false,
  centered: Boolean = false,
) {
  val layout = measurer.measure(text, style)
  val x = when {
    alignEnd -> at.x - layout.size.width
    centered -> at.x - layout.size.width / 2f
    else -> at.x
  }
  drawText(layout, topLeft = Offset(x, at.y - layout.size.height / 2f))
}
