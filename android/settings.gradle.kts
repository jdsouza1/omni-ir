// Omni-IR for Android (PLAN-ANDROID.md). omni-ir-core is plain Kotlin on the JVM, so it builds and
// tests anywhere; the Android modules need the Android SDK and are included only when one is found
// (on CI, or locally with ANDROID_HOME or local.properties).
pluginManagement {
  repositories {
    google()
    mavenCentral()
    gradlePluginPortal()
  }
}

dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
  repositories {
    google()
    mavenCentral()
  }
}

rootProject.name = "omni-ir-android"

include(":omni-ir-core")

val hasAndroidSdk = System.getenv("ANDROID_HOME") != null ||
  System.getenv("ANDROID_SDK_ROOT") != null ||
  file("local.properties").let { it.exists() && it.readText().contains("sdk.dir") }
if (hasAndroidSdk) {
  listOf("omni-ir-compose", "demo").filter { file(it).isDirectory }.forEach { include(":$it") }
}
