# Governance

How Omni-IR is run, and how its specification changes.

## Today: one maintainer

Omni-IR was started by Joel Dsouza ([@jdsouza1](https://github.com/jdsouza1)), who is currently its only maintainer. The maintainer:

- decides what changes in the specification, the conformance suite and the reference implementations;
- reviews and merges pull requests;
- publishes releases (npm, Swift Package Manager);
- enforces the [code of conduct](CODE_OF_CONDUCT.md).

Decisions are made in public, in issues and pull requests, with the reasoning written down. Larger decisions are recorded in the `PLAN-*.md` files.

## How the specification changes

1. **Proposal.** Anyone opens an issue with the "Spec proposal" template: the problem, the proposed lines of Omni-IR, and what it would mean for existing streams and renderers.
2. **Discussion.** The proposal stays open for comments for at least a week, unless it is a fix to an obvious mistake.
3. **Decision.** The maintainer accepts, asks for changes, or declines, and says why in the issue.
4. **Change.** An accepted proposal lands as one pull request that updates SPEC.md, the conformance cases, and all three reference parsers, so the spec is never ahead of a working implementation.
5. **Release.** The change ships in the next version and is listed in [CHANGELOG.md](CHANGELOG.md).

The principles a proposal is judged against:

- **The model sends intent, never presentation.** No HTML, CSS, styling props or code.
- **Every action that changes data is governed** and checked against the app's tool registry.
- **Every rule can be tested** by a language-neutral conformance case.
- **Streams stay flat and line-oriented,** so each line can be checked and drawn as it arrives.

## Versions

Until version 1.0 the specification is a draft, and any release may contain incompatible changes; each is listed in the changelog with what to do. From 1.0, incompatible changes need a new major version.

## Growing beyond one maintainer

Once people contribute regularly, a contributor with a record of good reviews and changes can be invited to become a maintainer. With three or more maintainers, specification decisions move from one person to agreement among the maintainers, with a vote when they can't agree. This document will be updated when that happens.

## Licence and trademarks

The specification and the code are licensed under [Apache-2.0](LICENSE). Anyone may implement the specification. An implementation may say it is "Omni-IR conformant" when it passes the full conformance suite for the version it names.
