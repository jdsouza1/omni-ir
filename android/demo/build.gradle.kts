// The Omni-IR demo app: streams the repo's fixtures offline, or asks a running server
// (npm run server, free mock model). Mock data only; nothing paid.
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
  alias(libs.plugins.android.application)
  alias(libs.plugins.kotlin.compose)
}

android {
  namespace = "dev.omniir.demo"
  compileSdk = 36
  defaultConfig {
    applicationId = "dev.omniir.demo"
    minSdk = 26
    targetSdk = 36
    versionCode = 1
    versionName = "0.1.0"
    testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
  }
  compileOptions {
    sourceCompatibility = JavaVersion.VERSION_17
    targetCompatibility = JavaVersion.VERSION_17
  }
  buildFeatures { compose = true }
}

kotlin {
  compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

/** Copies the repo's fixtures/ folder into the app's assets, as assets/fixtures. */
abstract class CopyFixtures : DefaultTask() {
  @get:InputDirectory abstract val source: DirectoryProperty
  @get:OutputDirectory abstract val outputDir: DirectoryProperty

  @TaskAction
  fun copy() {
    val target = outputDir.get().asFile.resolve("fixtures")
    target.deleteRecursively()
    source.get().asFile.copyRecursively(target)
  }
}

val copyFixtures = tasks.register<CopyFixtures>("copyFixtures") {
  source.set(rootDir.parentFile.resolve("fixtures"))
}

androidComponents {
  onVariants { variant -> variant.sources.assets?.addGeneratedSourceDirectory(copyFixtures, CopyFixtures::outputDir) }
}

dependencies {
  implementation(project(":omni-ir-compose"))
  implementation(platform(libs.compose.bom))
  implementation(libs.compose.material3)
  implementation(libs.activity.compose)
  androidTestImplementation(platform(libs.compose.bom))
  androidTestImplementation(libs.compose.ui.test.junit4)
  androidTestImplementation(libs.androidx.test.core)
  androidTestImplementation(libs.androidx.test.runner)
  androidTestImplementation(libs.androidx.test.ext.junit)
  debugImplementation(libs.compose.ui.test.manifest)
}
