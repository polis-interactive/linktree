---
name: dioxus
description: Build or update Rust Dioxus 0.7 interfaces using the official template's guidance for RSX, components, signals, assets, and routing. Use for Dioxus application work; respect the project's chosen renderer and pinned version.
---

# Dioxus 0.7

Read [references/dioxus-0.7.md](references/dioxus-0.7.md) before implementing Dioxus UI.
It is the official Dioxus template's agent prompt, downloaded from `Bare-Bones/AGENTS.md`
at revision `1308c32cd5bbb16a66640a0f08e641a84ebc2c30` of `DioxusLabs/dioxus-template`.

Use the project's Cargo manifest and Dioxus CLI version as the source of truth for
features and patch versions. The reference includes fullstack examples; only use
them when the project calls for a server. A static web build uses the web renderer
and does not need a backend.

This skill wrapper is locally authored; its reference is upstream material from
https://github.com/DioxusLabs/dioxus-template/tree/v0.7.
