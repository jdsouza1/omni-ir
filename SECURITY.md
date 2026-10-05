# Security policy

Omni-IR's purpose is to keep a model's output from doing anything an app hasn't allowed, so security reports are especially welcome.

## Reporting a vulnerability

Please report it privately, never in a public issue: on GitHub, open **Security → Report a vulnerability** in this repository. Only the maintainer can read the report.

Include the stream (the lines of Omni-IR) or the steps that show the problem, which implementation is affected (TypeScript, Swift, Kotlin, the React, SwiftUI or Compose renderer, or the server), and the version.

You'll get a reply within a week. Once a fix is released, the report is credited to you in the release notes unless you'd rather not be named.

## What counts

Anything that lets a stream go beyond what the specification allows, for example:

- running script, injecting markup or styling, or loading a URL the app didn't register;
- triggering a tool that isn't in the app's registry, or with params its schema rejects;
- an action that runs without its `McpMutation`, or with params changed after they were checked;
- crashing or hanging a parser or renderer with any input;
- two conforming parsers reaching different results for the same stream.

The example tool handlers in `server/tools/` are stubs that don't check who is signed in: authorization is the app's job, as the README says. A missing authorization check in an app built on Omni-IR is a problem in that app.

## Supported versions

Fixes go into the latest release. Until version 1.0, older releases aren't patched.
