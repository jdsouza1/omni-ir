// swift-tools-version:6.0
// Omni-IR for Swift: the parser (OmniIRCore, Foundation only, every platform) and the SwiftUI
// renderer (OmniIRSwiftUI, iOS 17+ and macOS 14+). The sources live in swift/; this manifest sits
// at the repository root so Swift Package Manager can install the package from the GitHub URL.
import PackageDescription

let package = Package(
  name: "OmniIR",
  platforms: [.iOS(.v17), .macOS(.v14)],
  products: [
    .library(name: "OmniIRCore", targets: ["OmniIRCore"]),
    .library(name: "OmniIRSwiftUI", targets: ["OmniIRSwiftUI"]),
  ],
  targets: [
    .target(name: "OmniIRCore", path: "swift/Sources/OmniIRCore"),
    .target(name: "OmniIRSwiftUI", dependencies: ["OmniIRCore"], path: "swift/Sources/OmniIRSwiftUI"),
    .testTarget(name: "OmniIRCoreTests", dependencies: ["OmniIRCore"], path: "swift/Tests/OmniIRCoreTests"),
  ],
  swiftLanguageModes: [.v6]
)
