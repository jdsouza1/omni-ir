// The SwiftUI renderer (iOS plan, task D). SwiftUI exists only on Apple platforms, so on Linux and
// Windows this library builds empty and only OmniIRCore is used.
#if canImport(SwiftUI)
@_exported import OmniIRCore
#endif
