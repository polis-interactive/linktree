# Agent tooling

## AWS

The official `aws-cdk` skill is installed into `.agents/skills/aws-cdk` from
[`aws/agent-toolkit-for-aws`](https://github.com/aws/agent-toolkit-for-aws/tree/fea6667159ecf09a75310e5f70c1d76908d8abab/skills/core-skills/aws-cdk),
revision `fea6667159ecf09a75310e5f70c1d76908d8abab`. It includes the upstream references.
It is available for discovery in this repository.

The full [requested setup guide](https://raw.githubusercontent.com/aws/agent-toolkit-for-aws/refs/heads/main/setup-instructions/setup.md)
is downloaded at [agent-references/aws-toolkit-setup.md](agent-references/aws-toolkit-setup.md).
On 2026-10-14, AWS CLI 2.38.0 authentication was verified for the `default` profile
in `us-east-1`, and the Agent Toolkit skill catalog was successfully queried.
The user signed in as root for initial setup. A restricted non-root identity for
ongoing local work remains to be provisioned; the managed MCP connection itself has
not been verified. The separate beta/prod CDK bootstrap and GitHub OIDC roles were
deployed on 2026-10-14, with account-wide read access and environment-scoped writes. The user's AWS installer also installed skills into `~/.agents/skills/`.

The upstream guide uses browser-based `aws login`, followed by
`aws configure agent-toolkit --yes --region us-east-1 --profile PROFILE`. Its login
credentials are valid for 12 hours and renewable for 90 days without another browser
authentication. Follow its full instructions after selecting the profile and login method;
do not use root credentials as the agent's working identity. No MCP configuration or
AWS credential files were changed during scaffolding.

## Dioxus

The [Dioxus 0.7 release post](https://dioxuslabs.com/blog/release-070/#improvements-with-ai---llmstxt-and-vibe-coding)
links AI documentation and template prompts, rather than a packaged Codex skill.
The official template prompt is downloaded unchanged at
[agent-references/dioxus-0.7.md](agent-references/dioxus-0.7.md), from
[`Bare-Bones/AGENTS.md`](https://github.com/DioxusLabs/dioxus-template/blob/1308c32cd5bbb16a66640a0f08e641a84ebc2c30/Bare-Bones/AGENTS.md)
on the `v0.7` branch. The repository's `AGENTS.md` points to it for frontend work.
The deployed documentation endpoint returned HTTP 403, so this uses the official
versioned template alternative described in the release post.

A small `dioxus` skill wrapper in `.agents/skills/dioxus` makes this downloaded reference
discoverable in Codex. Both project skills are repository-local. Copies installed
later in the user's home directory by the AWS installer are managed separately.
The wrapper is project-authored; the enclosed reference is upstream Dioxus guidance.
The repo pins Dioxus 0.7.10 and enables only web-related features; the prompt's fullstack
examples do not imply adding a runtime backend to this project.
