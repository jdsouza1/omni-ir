// The renderer's logic, independent of the UI toolkit: the observable store, governance, formats and
// the server client. Plain Kotlin on the JVM, so it is tested anywhere; omni-ir-compose draws it.
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
  alias(libs.plugins.kotlin.jvm)
}

kotlin {
  explicitApi()
  compilerOptions { jvmTarget.set(JvmTarget.JVM_17) }
}

java {
  sourceCompatibility = JavaVersion.VERSION_17
  targetCompatibility = JavaVersion.VERSION_17
}

dependencies {
  api(project(":omni-ir-core"))
  api(libs.coroutines.core)
  testImplementation(kotlin("test"))
  testImplementation(platform(libs.junit.bom))
  testImplementation(libs.junit.jupiter)
  testRuntimeOnly(libs.junit.launcher)
  testImplementation(libs.coroutines.test)
}

tasks.test {
  useJUnitPlatform()
  systemProperty("omniir.repoRoot", rootDir.parentFile.absolutePath)
  testLogging { events("failed"); exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL }
}
