// Reading an app's component declarations and picture patterns from JSON text (Step 20), such as the
// file the web app exports, so every platform uses the same declarations.
package dev.omniir.runtime

import dev.omniir.core.AppComponentException
import dev.omniir.core.AppComponents
import dev.omniir.core.PicturePattern
import dev.omniir.core.appComponentsFromJsonValue
import dev.omniir.core.picturePatternsFromJsonValue

/**
 * Components and picture patterns from JSON text `{"components": {…}, "pictures": [ … ]}`.
 * Throws [AppComponentException] when the text isn't such an object or a declaration is wrong.
 */
public fun appRegistryFromJson(text: String): Pair<AppComponents, List<PicturePattern>> {
  val json = Json.parseObject(text) ?: throw AppComponentException("the app's components must be a JSON object")
  val components = (json["components"] as? Map<*, *>)?.let(::appComponentsFromJsonValue) ?: AppComponents.NONE
  val pictures = (json["pictures"] as? List<*>)?.let(::picturePatternsFromJsonValue) ?: emptyList()
  return components to pictures
}
