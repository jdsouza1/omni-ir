// The demo app's own components on Android (Step 20): the declarations come from the repo's
// app/components.json (copied into the app's assets), the same file the web and iPhone demos use,
// and these composables draw them with the app's Material theme.
package dev.omniir.demo

import android.content.Context
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
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedCard
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.painter.Painter
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import dev.omniir.compose.AppViewProps
import dev.omniir.core.AppComponents
import dev.omniir.core.PicturePattern
import dev.omniir.core.Primitive
import dev.omniir.core.PropValue
import dev.omniir.runtime.Format
import dev.omniir.runtime.appRegistryFromJson
import dev.omniir.runtime.displayText
import java.util.Locale
import org.json.JSONObject

/** What app/components.json declares: the components, picture families and which picture each product shows. */
class DemoComponentRegistry(val components: AppComponents, val pictures: List<PicturePattern>, val productPictures: Map<String, String>)

object DemoComponents {
  fun load(context: Context): DemoComponentRegistry {
    val text = context.assets.open("components.json").bufferedReader().use { it.readText() }
    val (components, pictures) = appRegistryFromJson(text)
    val products = JSONObject(text).optJSONObject("productPictures")
    val productPictures = products?.keys()?.asSequence()?.associateWith { products.getString(it) }.orEmpty()
    return DemoComponentRegistry(components, pictures, productPictures)
  }

  /** The composables for the demo's components, by name. */
  val views: Map<String, @Composable (AppViewProps) -> Unit> = mapOf(
    "ProductCard" to { ProductCardView(it) },
    "QuantityPicker" to { QuantityPickerView(it) },
  )
}

private fun text(p: PropValue?) = (p as? PropValue.Text)?.value
private fun number(p: PropValue?) = (p as? PropValue.Number)?.value

@Composable
private fun ProductCardView(p: AppViewProps) {
  val name = text(p.props["name"]) ?: ""
  val price = number(p.props["price"])
  val shown = price?.let { Format.text(Primitive.Number(it), "currency", text(p.props["currency"]) ?: "USD", Locale.getDefault()) } ?: ""
  val picture: Painter? = p.picture(text(p.props["picture"]))
  val rating = number(p.props["rating"])
  val badges = (p.props["badges"] as? PropValue.ListOf)?.items?.mapNotNull(::text).orEmpty()
  OutlinedCard(Modifier.fillMaxWidth()) {
    Row(Modifier.padding(14.dp), horizontalArrangement = Arrangement.spacedBy(14.dp)) {
      Box(Modifier.width(88.dp).aspectRatio(1f).clip(RoundedCornerShape(8.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
        if (picture != null) Image(picture, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.size(88.dp))
      }
      Column(verticalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.weight(1f)) {
        Text(name, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold, modifier = Modifier.semantics { heading() })
        Text(shown, style = MaterialTheme.typography.titleLarge)
        if (rating != null) Text("Rated ${displayText(Primitive.Number(rating))} out of 5", style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        if (badges.isNotEmpty()) {
          Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            for (b in badges) {
              Text(b, style = MaterialTheme.typography.labelSmall, modifier = Modifier.background(MaterialTheme.colorScheme.surfaceVariant, RoundedCornerShape(50)).padding(horizontal = 8.dp, vertical = 2.dp))
            }
          }
        }
        // Buttons stack: the catalog's Buttons fill their width, so a Row would squeeze the second to nothing.
        Column(verticalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth()) { p.children() }
      }
    }
  }
}

@Composable
private fun QuantityPickerView(p: AppViewProps) {
  val field = p.field
  val label = text(p.props["label"]) ?: ""
  val min = number(p.props["min"])?.toInt() ?: 0
  val max = number(p.props["max"])?.toInt() ?: 99
  val current = (field?.value as? Primitive.Number)?.value?.toInt()
  fun set(n: Int) {
    field?.onChange(Primitive.Number(n.coerceIn(min, max).toDouble()))
    field?.leave?.invoke()
  }
  Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
    Text(label, style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp), modifier = field?.modifier ?: Modifier) {
      OutlinedButton(onClick = { set((current ?: min) - 1) }, enabled = current == null || current > min, modifier = Modifier.semantics { contentDescription = "Fewer" }) { Text("−") }
      Text(current?.toString() ?: "–", style = MaterialTheme.typography.titleLarge, modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite; contentDescription = "$label: ${current ?: "none"}" })
      OutlinedButton(onClick = { set(if (current == null) min else current + 1) }, enabled = current == null || current < max, modifier = Modifier.semantics { contentDescription = "More" }) { Text("+") }
    }
  }
}
