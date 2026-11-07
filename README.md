# Polis Linktree

Mobile-first Polis link page built with Rust/Dioxus, AWS CDK infrastructure, and GitHub Actions deployment.

## Run locally

Install Rust through rustup, Node from `cdk/.node-version`, and `cargo-make` 0.37.24.
The `ui/rust-toolchain.toml` file installs the pinned Rust compiler and WASM target.

```sh
cargo install cargo-make --version 0.37.24 --locked
cargo make setup
cargo make dev
```

Open the address printed by Dioxus (normally `http://localhost:8080`). The page displays
the Polis logo, project cards, and social links. First-time setup compiles the Dioxus CLI;
allow approximately 10–20 minutes depending on the machine. CI uses prebuilt tools.

The dev server listens on all IPv4 interfaces (`0.0.0.0`). To preview on a phone,
connect it to the same Wi-Fi as this computer and open `http://<computer-LAN-IP>:8080`
(use the port printed by Dioxus if different). Restart `cargo make dev` after changing
the server arguments. On Linux, `hostname -I` lists the computer's IP addresses.

## Update links and socials

Edit [`ui/content.toml`](ui/content.toml). The `links` and `socials` arrays control
display order; copy or remove a block to add or remove an entry. Card `tagline` is
optional and supports `/n`, `<br>`, or TOML's `\n` escape for line breaks; other
HTML remains plain text. `name` provides the logo's accessible label. Logo and card icon filenames
refer to `ui/assets/brand/`; social icon filenames refer to `ui/assets/social/`.
Add new image files to those folders and reference their filenames in the TOML.
Social SVGs should use opaque artwork on a transparent background; they render as
CSS masks colored by `--ink` in `ui/assets/main.css`.

Keep `cargo make dev` running while editing. The TOML is embedded with
`include_str!`, which Dioxus 0.7.10 tracks through Rust dependency information.
Saving it triggers an automatic rebuild and browser refresh, rather than the
instant RSX-only hot reload. No extra watcher configuration is needed. CSS edits
use Dioxus's asset hot reload. Production content updates need a new build/deploy.
`cargo make check` validates the TOML schema, HTTPS links, and referenced image files.

Run one `cargo make dev` instance per checkout: preview servers share the generated
debug output directory, even when using different ports. If the preview references
an older stylesheet, press `r` in the running Dioxus terminal to rebuild it, then
refresh the browser. `cargo make build` updates release output, not the running
development preview.

Social artwork comes from [Simple Icons](https://github.com/simple-icons/simple-icons)
under [CC0](https://github.com/simple-icons/simple-icons/blob/develop/LICENSE.md).
Original brand asset sources are recorded in `ui/assets/brand/sources.json`.

## TODO

- Add a contact entry that opens an accessible modal, with Cloudflare Turnstile
  bot detection like wallercreekhigh.com. Include server-side token verification
  when implementing submission. This is planned only; no contact form or backend
  is implemented.

## Commands

All project operations have a `cargo make` entry point; `cargo make help` lists them.
Run commands from the repository root. Node/npm and cargo-make are prerequisites.

| Command | Result |
| --- | --- |
| `cargo make dev` | Local Dioxus server with live reload |
| `cargo make build` | Release HTML, JS, CSS, and WASM in `ui/dist/` |
| `cargo make check` | Rust formatting/Clippy, TypeScript, security behavior tests, offline synthesis |
| `cargo make infra-synth` | Beta/prod CloudFormation previews; no AWS credentials needed |
| `cargo make permissions-synth` | Offline bootstrap and GitHub OIDC permissions preview |
| `cargo make infra-diff` | Real AWS diff; requires `DEPLOY_STAGE=beta` or `prod` and environment configuration |
| `cargo make deploy-beta` / `deploy-prod` | Build, synthesize, diff, and deploy selected environment |
| `cargo make bootstrap` / `permissions-deploy` | One-time human-operated AWS setup |
| `cargo make beta-state` | Read the saved beta on/off setting |
| `cargo make destroy-beta` | Delete the disabled beta site, including all object versions |
| `cargo make permissions-verify` | Validate live IAM policies and simulate console reads/write isolation |
| `cargo make bootstrap-plan` | Synthesize and diff all setup stacks without changing AWS |

Infrastructure dependencies can be installed independently with `cargo make infra-install`.
Use `cargo make infra-check` and `cargo make infra-test` while working only on CDK.
Use `cargo make fmt` for Rust formatting and `cargo make infra-fmt` for infrastructure formatting.

## Layout

| Path | Responsibility |
| --- | --- |
| `ui/` | Dioxus crate, assets, toolchain, packaging script, and generated site |
| `cdk/` | TypeScript CDK app, hosting and GitHub OIDC stacks, tests |
| `.github/` | PR validation, beta/prod delivery, dependency updates |
| `Makefile.toml` | Shared local/CI commands; implementation scripts live with their component |
| `docs/` | Architecture, AWS setup, downloaded agent references |
| `.agents/skills/` | Repository-local AWS CDK and Dioxus skills |

Beta is optional: **Actions → Beta → Run workflow → Enable beta** saves the setting
and deploys immediately. Uncheck it to delete the beta site. Pushes to `main` follow
the saved setting. Beta starts off and needs no GitHub Environment.

Production deploys automatically when a non-prerelease GitHub release is published,
including from a draft. It builds the release tag and needs no GitHub Environment or
role-ARN variable. Apply the production tag trust policy as described in
[deployment setup](docs/deployment.md#production-configuration) before the first release.

Read [architecture](docs/architecture.md) for deployment boundaries and
[deployment setup](docs/deployment.md) before the first AWS deployment.
See [agent tooling](docs/agent-tooling.md) for installed skills and remaining authentication setup.

This scaffold has no application backend. “Static” means files served by S3/CloudFront;
the initial UI renders in the browser using WASM. It is not server-rendered or prerendered HTML.

## License

Licensed under the [MIT License](LICENSE-MIT).

## Contributions

External contributions are not currently accepted. Please read
[CONTRIBUTING.md](CONTRIBUTING.md) for the contribution policy.
