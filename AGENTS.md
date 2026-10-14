# Polis Linktree agent guidance

Use `cargo make` tasks from the repository root for development, checks, and deployment.
Keep the Rust/Dioxus frontend in `ui/` and TypeScript CDK infrastructure in `cdk/`.
Keep component-specific scripts inside their component directory; build output is `ui/dist/`.
Read `docs/architecture.md` before changing hosting or deployment boundaries.

For Dioxus work, read `docs/agent-references/dioxus-0.7.md`, the downloaded upstream
0.7 template prompt. Use the versions and web-only feature set in this repository;
the upstream fullstack examples are reference material, not this project's architecture.

For AWS CDK work, load `.agents/skills/aws-cdk/SKILL.md`. For Dioxus work, load
`.agents/skills/dioxus/SKILL.md`. Skills belong in this repo, not in global directories. The original
toolkit setup guide is in `docs/agent-references/aws-toolkit-setup.md`; authentication
status and source revisions are documented in `docs/agent-tooling.md`.

PR checks must work without AWS credentials and without beta secrets. Never deploy
the dummy offline preview assemblies. Preserve private S3 access, beta viewer-request
authentication, HTTPS redirects, and environment-scoped GitHub OIDC trust.

Run `cargo make check` before completing implementation work. Do not create live AWS
resources as part of scaffold validation.
