// The Trusted Catalog for Jetpack Compose: draws omni-ir-runtime's store with Material 3 from the
// host app's theme. Android 8.0+ (API 26). Built with the Android SDK (CI, or Android Studio).
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
  alias(libs.plugins.android.library)
  alias(libs.plugins.kotlin.compose)
}

android {
  namespace = "dev.omniir.compose"
  compileSdk = 36
  defaultConfig { minSdk = 26 }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  buildFeatures { compose = true }
}

kotlin {
  explicitApi()
  compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

dependencies {
  api(project(":omni-ir-runtime"))
  implementation(platform(libs.compose.bom))
  api(libs.compose.ui)
  implementation(libs.compose.material3)
}
