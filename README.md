# Polis Linktree

Rust/Dioxus hello-world frontend, AWS CDK infrastructure, and GitHub Actions deployment scaffold.

## Run locally

Install Rust through rustup, Node from `cdk/.node-version`, and `cargo-make` 0.37.24.
The `ui/rust-toolchain.toml` file installs the pinned Rust compiler and WASM target.

```sh
cargo install cargo-make --version 0.37.24 --locked
cargo make setup
cargo make dev
```

Open the address printed by Dioxus (normally `http://localhost:8080`). The page displays
“Hello, Polis.” and a link to `polis.tv`. First-time setup compiles the Dioxus CLI;
allow approximately 10–20 minutes depending on the machine. CI uses prebuilt tools.

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
