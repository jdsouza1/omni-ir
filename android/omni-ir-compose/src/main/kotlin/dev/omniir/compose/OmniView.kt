// OmniView: draws a streaming Omni-IR document with the Trusted Catalog. One slot per id, keyed by the
// id, so a component keeps its identity (and a text field its focus) while more lines arrive.
package dev.omniir.compose

import androidx.compose.foundation.border
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.compositionLocalOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.layout.Layout
import androidx.compose.ui.semantics.clearAndSetSemantics
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.unit.Constraints
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.omniir.core.OmniDocument
import dev.omniir.runtime.ActionState
import dev.omniir.runtime.MutationCall
import dev.omniir.runtime.OmniStore
import dev.omniir.runtime.OmniStrings
import dev.omniir.runtime.RendererEvent
import dev.omniir.runtime.Slot
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.launch

/**
 * Draws `store`'s document as it streams.
 *
 * @param pictures The app's asset registry as images, by the names the stream uses. Pass the same names
 *   to the store; a stream can never show a picture from anywhere else.
 * @param onMutation Runs a governed action. Its params are resolved and already checked by the tool.
 * @param onEvent Blocked actions, failed handlers and presses of Buttons without an action.
 */
@Composable
public fun OmniView(
  store: OmniStore,
  onMutation: suspend (MutationCall) -> Unit,
  modifier: Modifier = Modifier,
  pictures: Map<String, Painter> = emptyMap(),
  onEvent: (RendererEvent) -> Unit = {},
  strings: OmniStrings = OmniStrings(),
) {
  val document by store.document.collectAsState()
  val actions by store.actions.collectAsState()
  val scope = rememberCoroutineScope()
  val context = RenderContext(store, document, actions, pictures, onMutation, onEvent, scope)
  CompositionLocalProvider(LocalRender provides context, LocalOmniStrings provides strings) {
    // The marker is line 1, so the notice appears before anything else and never moves the screen.
    if (document.newerVersion) {
      Column(modifier, verticalArrangement = Arrangement.spacedBy(12.dp)) {
        VersionNotice()
        NodeSlot("root")
      }
    } else {
      Box(modifier) { NodeSlot("root") }
    }
  }
}

/** The stream was written for a newer Omni-IR version (SPEC.md section 8): say the app needs an update. */
@Composable
private fun VersionNotice() {
  Text(
    LocalOmniStrings.current.newerVersion,
    style = MaterialTheme.typography.bodySmall,
    modifier = Modifier
      .fillMaxWidth()
      .background(MaterialTheme.colorScheme.tertiaryContainer, RoundedCornerShape(10.dp))
      .padding(10.dp),
  )
}

internal class RenderContext(
  val store: OmniStore,
  val document: OmniDocument,
  val actions: ActionState,
  val pictures: Map<String, Painter>,
  val onMutation: suspend (MutationCall) -> Unit,
  val onEvent: (RendererEvent) -> Unit,
  private val scope: CoroutineScope,
) {
  fun press(id: String) {
    scope.launch { store.press(id, onMutation, onEvent) }
  }
}

internal val LocalRender = compositionLocalOf<RenderContext?> { null }

/** The renderer's own words (PLAN-THEMES.md): the app's, or English. Plain text, set by the app, never by the stream. */
internal val LocalOmniStrings = staticCompositionLocalOf { OmniStrings() }

/** What one id shows: its component, a placeholder while it hasn't arrived, or a fallback if it never does. */
@Composable
internal fun NodeSlot(id: String) {
  val context = LocalRender.current ?: return
  when (val slot = context.store.slot(id, context.document)) {
    is Slot.Node -> NodeContent(slot.node, context)
    Slot.Pending -> SkeletonLines(1)
    Slot.Missing -> Fallback()
  }
}

/** Children in a column, each in its own slot keyed by id. */
@Composable
internal fun ColumnChildren(ids: List<String>, stretch: Boolean) {
  for (id in ids) {
    key(id) {
      Box(if (stretch) Modifier.fillMaxWidth() else Modifier) { NodeSlot(id) }
    }
  }
}

@Composable
internal fun SkeletonLines(lines: Int) {
  val count = lines.coerceIn(1, 6)
  val label = LocalOmniStrings.current.loading
  Column(
    verticalArrangement = Arrangement.spacedBy(6.dp),
    modifier = Modifier.fillMaxWidth().clearAndSetSemantics { contentDescription = label },
  ) {
    repeat(count) { i ->
      Box(
        Modifier
          .then(if (i == count - 1 && count > 1) Modifier.widthIn(max = 180.dp) else Modifier)
          .fillMaxWidth()
          .height(14.dp)
          .background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(4.dp)),
      )
    }
  }
}

/** Shown in place of a component that never arrived, about the size of a placeholder. */
@Composable
internal fun Fallback() {
  Text(
    LocalOmniStrings.current.failedToLoad,
    style = MaterialTheme.typography.bodySmall,
    color = MaterialTheme.colorScheme.onSurfaceVariant,
    modifier = Modifier
      .fillMaxWidth()
      .border(1.dp, MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(6.dp))
      .padding(horizontal = 10.dp, vertical = 6.dp),
  )
}

/**
 * A row whose items keep their natural single-line width. If they don't all fit (a narrow screen,
 * large text), the items stack vertically at full width instead of squeezing.
 */
@Composable
internal fun AdaptiveRow(gap: Dp, alignment: Alignment.Vertical, content: @Composable () -> Unit) {
  Layout(content, Modifier.fillMaxWidth()) { measurables, constraints ->
    val gapPx = gap.roundToPx()
    val natural = measurables.map { it.maxIntrinsicWidth(Constraints.Infinity) }
    val fits = natural.sum() + gapPx * (measurables.size - 1).coerceAtLeast(0) <= constraints.maxWidth
    if (fits) {
      val placeables = measurables.mapIndexed { i, m -> m.measure(Constraints(maxWidth = natural[i], maxHeight = constraints.maxHeight)) }
      val height = placeables.maxOfOrNull { it.height } ?: 0
      layout(constraints.maxWidth, height) {
        var x = 0
        for (p in placeables) {
          p.placeRelative(x, alignment.align(p.height, height))
          x += p.width + gapPx
        }
      }
    } else {
      val placeables = measurables.map { it.measure(Constraints.fixedWidth(constraints.maxWidth)) }
      val height = placeables.sumOf { it.height } + gapPx * (placeables.size - 1).coerceAtLeast(0)
      layout(constraints.maxWidth, height) {
        var y = 0
        for (p in placeables) {
          p.placeRelative(0, y)
          y += p.height + gapPx
        }
      }
    }
  }
}
