use dioxus::prelude::*;

fn main() {
    dioxus::launch(App);
}

#[component]
fn App() -> Element {
    rsx! {
        document::Stylesheet { href: asset!("/assets/main.css") }
        main {
            h1 { "Hello, Polis." }
            p { "Our new home for links is coming soon." }
            a { href: "https://polis.tv", "Visit Polis" }
        }
    }
}
