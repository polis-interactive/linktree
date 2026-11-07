use serde::Deserialize;

#[derive(Clone, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Content {
    pub name: String,
    pub logo: String,
    pub links: Vec<Link>,
    pub socials: Vec<Social>,
}

#[derive(Clone, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Link {
    pub title: String,
    pub url: String,
    pub icon: String,
    pub tagline: Option<String>,
}

#[derive(Clone, Deserialize, PartialEq)]
#[serde(deny_unknown_fields)]
pub struct Social {
    pub label: String,
    pub url: String,
    pub icon: String,
}

pub fn load() -> Result<Content, toml::de::Error> {
    // include_str! also registers this file with dx's dependency watcher.
    toml::from_str(include_str!("../content.toml"))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    #[test]
    fn published_content_has_valid_links_and_local_images() {
        let content = load().expect("ui/content.toml must match the content schema");
        let assets = Path::new(env!("CARGO_MANIFEST_DIR")).join("assets");
        assert!(!content.name.trim().is_empty());
        assert!(assets.join("brand").join(&content.logo).is_file());
        for link in content.links {
            assert!(!link.title.trim().is_empty());
            assert!(link.url.starts_with("https://"));
            assert!(assets.join("brand").join(link.icon).is_file());
        }
        for social in content.socials {
            assert!(!social.label.trim().is_empty());
            assert!(social.url.starts_with("https://"));
            assert!(assets.join("social").join(social.icon).is_file());
        }
    }
}
