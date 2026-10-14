# Agent tooling

## AWS

The official `aws-cdk` skill is installed into `.agents/skills/aws-cdk` from
[`aws/agent-toolkit-for-aws`](https://github.com/aws/agent-toolkit-for-aws/tree/fea6667159ecf09a75310e5f70c1d76908d8abab/skills/core-skills/aws-cdk),
revision `fea6667159ecf09a75310e5f70c1d76908d8abab`. It includes the upstream references.
It is available for discovery on the next turn.

The full [requested setup guide](https://raw.githubusercontent.com/aws/agent-toolkit-for-aws/refs/heads/main/setup-instructions/setup.md)
is downloaded at [agent-references/aws-toolkit-setup.md](agent-references/aws-toolkit-setup.md).
**AWS CLI login, managed MCP connection, and remote toolkit verification are pending**
the choice/configuration of a human AWS identity. Installing the local CDK skill does
not complete these authenticated steps. The local machine initially had uv but no AWS CLI.

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
discoverable in Codex. Both skills are repository-local; no global copies remain.
The wrapper is project-authored; the enclosed reference is upstream Dioxus guidance.
The repo pins Dioxus 0.7.10 and enables only web-related features; the prompt's fullstack
examples do not imply adding a runtime backend to this project.
