use dioxus::prelude::*;

mod content;

// Bundle the directories so content.toml can select images by filename.
const BRAND_ASSETS: Asset = asset!("/assets/brand");
const SOCIAL_ASSETS: Asset = asset!("/assets/social");

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
    let content = use_hook(content::load);
    let content = match content {
        Ok(content) => content,
        Err(error) => {
            return rsx! {
                main { class: "link-page",
                    h1 { "Content could not be loaded" }
                    pre { "Check ui/content.toml: {error}" }
                }
            };
        }
    };

    rsx! {
        document::Link {
            rel: "icon",
            r#type: "image/x-icon",
            href: asset!("/assets/brand/polis-favicon.ico"),
        }
        main { class: "link-page",
            header { class: "brand-header",
                h1 { class: "brand-heading",
                    img {
                        class: "brand-logo",
                        src: "{BRAND_ASSETS}/{content.logo}",
                        alt: "{content.name}",
                        width: "227",
                        height: "60",
                    }
                }
            }
            nav { class: "link-list", "aria-label": "Projects",
                for (index, link) in content.links.into_iter().enumerate() {
                    LinktreeNode { key: "{index}", link }
                }
            }
            nav { class: "social-list", "aria-label": "Social media",
                for (index, social) in content.socials.into_iter().enumerate() {
                    SocialLink { key: "{index}", social }
                }
            }
        }
    }
}

#[component]
fn LinktreeNode(link: content::Link) -> Element {
    rsx! {
        a { class: "link-node", href: link.url,
            span { class: "link-icon",
                img { src: "{BRAND_ASSETS}/{link.icon}", alt: "", width: "52", height: "52" }
            }
            span { class: "link-copy",
                span { class: "link-title", "{link.title}" }
                if let Some(tagline) = link.tagline {
                    span { class: "link-tagline",
                        {tagline.replace("/n", "\n").replace("<br>", "\n")}
                    }
                }
            }
            svg {
                class: "link-arrow", view_box: "0 0 24 24", fill: "none",
                stroke: "currentColor", stroke_width: "1.5", "aria-hidden": "true",
                path { d: "M5 12h14m-6-6 6 6-6 6" }
            }
        }
    }
}

#[component]
fn SocialLink(social: content::Social) -> Element {
    rsx! {
        a {
            class: "social-link", href: social.url,
            "aria-label": social.label.clone(), title: social.label,
            span {
                class: "social-icon",
                style: "--icon-image: url('{SOCIAL_ASSETS}/{social.icon}');",
                "aria-hidden": "true",
            }
        }
    }
}
