// The Kotlin parser: plain Kotlin on the JVM, no Android and no dependencies, so it runs anywhere.
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
  testImplementation(kotlin("test"))
  testImplementation(platform(libs.junit.bom))
  testImplementation(libs.junit.jupiter)
  testRuntimeOnly(libs.junit.launcher)
  testImplementation(libs.kotlinx.json)
}

tasks.test {
  useJUnitPlatform()
  // The conformance suite lives at the repository root (conformance/cases).
  systemProperty("omniir.repoRoot", rootDir.parentFile.absolutePath)
  testLogging { events("failed"); exceptionFormat = org.gradle.api.tasks.testing.logging.TestExceptionFormat.FULL }
}
