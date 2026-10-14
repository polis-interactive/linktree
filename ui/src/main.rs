use dioxus::prelude::*;

// Process the site CSS at build time and load it before the first content paint.
const _: Asset = asset!(
    "/assets/main.css",
    AssetOptions::css().with_static_head(true)
);

fn main() {
    dioxus::launch(App);
}

#[component]
fn App() -> Element {
    rsx! {
        main {
            h1 { "Hello, Polis." }
            p { "Our new home for links is coming soon." }
            a { href: "https://polis.tv", "Visit Polis" }
        }
    }
}
