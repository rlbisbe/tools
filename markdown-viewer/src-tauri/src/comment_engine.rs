/// Pure comment transforms — no I/O, no Tauri dependencies.
/// Every function takes raw markdown (with comment tags) and returns
/// a new string. This module is fully unit-testable in isolation.
use serde::{Deserialize, Serialize};

const TAG_PREFIX: &str = "<!-- @comment: ";
const TAG_SUFFIX: &str = " -->";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Comment {
    pub id: String,
    pub anchor: String,
    pub before: String,
    pub after: String,
    pub text: String,
    pub date: String,
}

/// Extract all comment tags from raw markdown.
pub fn parse_comments(raw: &str) -> Vec<Comment> {
    let mut comments = Vec::new();
    let mut search = raw;
    while let Some(start) = search.find(TAG_PREFIX) {
        let rest = &search[start + TAG_PREFIX.len()..];
        if let Some(end) = rest.find(TAG_SUFFIX) {
            let json = &rest[..end];
            if let Ok(c) = serde_json::from_str::<Comment>(json) {
                comments.push(c);
            }
            search = &rest[end + TAG_SUFFIX.len()..];
        } else {
            break;
        }
    }
    comments
}

/// Remove all comment tags from raw markdown, returning clean markdown.
pub fn strip_comments(raw: &str) -> String {
    let mut result = String::with_capacity(raw.len());
    let mut search = raw;
    while let Some(start) = search.find(TAG_PREFIX) {
        result.push_str(&search[..start]);
        let rest = &search[start + TAG_PREFIX.len()..];
        if let Some(end) = rest.find(TAG_SUFFIX) {
            search = &rest[end + TAG_SUFFIX.len()..];
        } else {
            // Malformed tag — keep the rest as-is
            result.push_str(&search[start..]);
            return result;
        }
    }
    result.push_str(search);
    result
}

/// Serialise a comment to its tag representation.
fn serialise_tag(c: &Comment) -> String {
    format!(
        "{}{}{}",
        TAG_PREFIX,
        serde_json::to_string(c).expect("comment is always serialisable"),
        TAG_SUFFIX
    )
}

/// Insert a comment tag immediately after the first match of the anchor
/// (using progressive fallback: before+anchor+after, anchor+after,
///  before+anchor, anchor alone). Operates on the comment-stripped text
/// to find the insertion offset, then inserts into the raw text.
pub fn insert_comment(raw: &str, comment: &Comment) -> Result<String, String> {
    let stripped = strip_comments(raw);
    let anchor = &comment.anchor;
    let before = &comment.before;
    let after = &comment.after;

    let search_patterns: &[(&str, &str)] = &[
        (before, after),
        ("", after),
        (before, ""),
        ("", ""),
    ];

    for (b, a) in search_patterns {
        let needle = format!("{}{}{}", b, anchor, a);
        if let Some(pos) = stripped.find(needle.as_str()) {
            // Position in stripped text where anchor ends
            let anchor_end_in_stripped = pos + b.len() + anchor.len();
            // Map back to raw text offset
            let raw_offset = clean_pos_to_raw_pos(raw, &stripped, anchor_end_in_stripped);
            let tag = serialise_tag(comment);
            let mut result = String::with_capacity(raw.len() + tag.len());
            result.push_str(&raw[..raw_offset]);
            result.push_str(&tag);
            result.push_str(&raw[raw_offset..]);
            return Ok(result);
        }
    }

    Err(format!("Anchor text not found: {:?}", anchor))
}

/// Edit the text of an existing comment by id.
pub fn edit_comment(raw: &str, id: &str, new_text: &str) -> Result<String, String> {
    let tag_start = find_tag_by_id(raw, id).ok_or_else(|| format!("Comment id not found: {}", id))?;
    let rest = &raw[tag_start + TAG_PREFIX.len()..];
    let tag_end = rest.find(TAG_SUFFIX).ok_or("Malformed comment tag")?;
    let json = &rest[..tag_end];
    let mut comment: Comment = serde_json::from_str(json).map_err(|e| e.to_string())?;
    comment.text = new_text.to_string();
    let new_tag = serialise_tag(&comment);
    let full_end = tag_start + TAG_PREFIX.len() + tag_end + TAG_SUFFIX.len();
    let mut result = String::with_capacity(raw.len());
    result.push_str(&raw[..tag_start]);
    result.push_str(&new_tag);
    result.push_str(&raw[full_end..]);
    Ok(result)
}

/// Delete a comment tag by id.
pub fn delete_comment(raw: &str, id: &str) -> Result<String, String> {
    let tag_start = find_tag_by_id(raw, id).ok_or_else(|| format!("Comment id not found: {}", id))?;
    let rest = &raw[tag_start + TAG_PREFIX.len()..];
    let tag_end = rest.find(TAG_SUFFIX).ok_or("Malformed comment tag")?;
    let full_end = tag_start + TAG_PREFIX.len() + tag_end + TAG_SUFFIX.len();
    let mut result = String::with_capacity(raw.len());
    result.push_str(&raw[..tag_start]);
    result.push_str(&raw[full_end..]);
    Ok(result)
}

/// Find the byte offset in `raw` where the tag with the given id starts.
fn find_tag_by_id(raw: &str, id: &str) -> Option<usize> {
    let mut offset = 0;
    while let Some(rel) = raw[offset..].find(TAG_PREFIX) {
        let abs = offset + rel;
        let rest = &raw[abs + TAG_PREFIX.len()..];
        if let Some(end) = rest.find(TAG_SUFFIX) {
            let json = &rest[..end];
            if let Ok(c) = serde_json::from_str::<Comment>(json) {
                if c.id == id {
                    return Some(abs);
                }
            }
            offset = abs + TAG_PREFIX.len() + end + TAG_SUFFIX.len();
        } else {
            break;
        }
    }
    None
}

/// Map a byte offset in the stripped (comment-free) text back to the
/// corresponding byte offset in the raw text.
fn clean_pos_to_raw_pos(raw: &str, stripped: &str, clean_pos: usize) -> usize {
    // Walk both strings simultaneously, skipping over comment tags in raw.
    let _ = stripped; // used only for length reference
    let mut clean_cursor = 0usize;
    let mut raw_cursor = 0usize;
    let raw_bytes = raw.as_bytes();

    while raw_cursor < raw.len() && clean_cursor < clean_pos {
        // Check if we're at a comment tag
        if raw[raw_cursor..].starts_with(TAG_PREFIX) {
            if let Some(end) = raw[raw_cursor + TAG_PREFIX.len()..].find(TAG_SUFFIX) {
                raw_cursor += TAG_PREFIX.len() + end + TAG_SUFFIX.len();
                continue;
            }
        }
        // Advance one UTF-8 character
        let b = raw_bytes[raw_cursor];
        let char_len = utf8_char_len(b);
        raw_cursor += char_len;
        clean_cursor += char_len;
    }
    raw_cursor
}

fn utf8_char_len(first_byte: u8) -> usize {
    if first_byte < 0x80 { 1 }
    else if first_byte < 0xE0 { 2 }
    else if first_byte < 0xF0 { 3 }
    else { 4 }
}

// ─── Unit tests ──────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;

    fn make_comment(id: &str, anchor: &str, before: &str, after: &str, text: &str) -> Comment {
        Comment {
            id: id.to_string(),
            anchor: anchor.to_string(),
            before: before.to_string(),
            after: after.to_string(),
            text: text.to_string(),
            date: "2026-01-01".to_string(),
        }
    }

    // ── parse_comments ────────────────────────────────────────────────────

    #[test]
    fn parse_returns_empty_for_clean_markdown() {
        assert_eq!(parse_comments("# Hello\n\nNo comments here."), vec![]);
    }

    #[test]
    fn parse_extracts_single_comment() {
        let raw = r#"Hello<!-- @comment: {"id":"1","anchor":"Hello","before":"","after":" world","text":"note","date":"2026-01-01"} --> world"#;
        let comments = parse_comments(raw);
        assert_eq!(comments.len(), 1);
        assert_eq!(comments[0].id, "1");
        assert_eq!(comments[0].anchor, "Hello");
        assert_eq!(comments[0].text, "note");
    }

    #[test]
    fn parse_extracts_multiple_comments() {
        let c1 = make_comment("1", "foo", "", " bar", "note1");
        let c2 = make_comment("2", "baz", "foo ", "", "note2");
        let raw = format!(
            "foo{} bar baz{}",
            serialise_tag(&c1),
            serialise_tag(&c2)
        );
        let comments = parse_comments(&raw);
        assert_eq!(comments.len(), 2);
        assert_eq!(comments[0].id, "1");
        assert_eq!(comments[1].id, "2");
    }

    #[test]
    fn parse_ignores_malformed_json() {
        let raw = "<!-- @comment: {not valid json} -->";
        assert_eq!(parse_comments(raw), vec![]);
    }

    // ── strip_comments ────────────────────────────────────────────────────

    #[test]
    fn strip_is_identity_on_clean_markdown() {
        let md = "# Title\n\nParagraph.";
        assert_eq!(strip_comments(md), md);
    }

    #[test]
    fn strip_removes_comment_tag() {
        let c = make_comment("1", "important", "is ", " here", "note");
        let raw = format!("is important{} here", serialise_tag(&c));
        let stripped = strip_comments(&raw);
        assert_eq!(stripped, "is important here");
    }

    #[test]
    fn strip_removes_all_tags() {
        let c1 = make_comment("1", "foo", "", "", "n1");
        let c2 = make_comment("2", "bar", "", "", "n2");
        let raw = format!("foo{}bar{}", serialise_tag(&c1), serialise_tag(&c2));
        assert_eq!(strip_comments(&raw), "foobar");
    }

    // ── round-trip safety ─────────────────────────────────────────────────

    #[test]
    fn round_trip_insert_parse_strip() {
        let original = "The quick brown fox jumps over the lazy dog.";
        let c = make_comment("abc", "brown fox", "The quick ", " jumps", "test note");
        let with_comment = insert_comment(original, &c).unwrap();
        // parse should find it
        let parsed = parse_comments(&with_comment);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].id, "abc");
        // strip should restore original
        assert_eq!(strip_comments(&with_comment), original);
    }

    // ── insert_comment ────────────────────────────────────────────────────

    #[test]
    fn insert_places_tag_after_anchor() {
        let raw = "Hello world, goodbye world.";
        let c = make_comment("1", "world", "Hello ", ", goodbye", "note");
        let result = insert_comment(raw, &c).unwrap();
        // Tag should appear after first "world"
        assert!(result.starts_with("Hello world<!-- @comment:"));
        assert!(result.ends_with(", goodbye world."));
    }

    #[test]
    fn insert_uses_context_to_pick_correct_occurrence() {
        let raw = "cat sat\ncat slept";
        let c = make_comment("2", "cat", "\n", " slept", "second");
        let result = insert_comment(raw, &c).unwrap();
        // Should tag the second "cat" (before="\n", after=" slept")
        let second_cat_pos = raw.find("\ncat").unwrap() + 1;
        let tag = serialise_tag(&c);
        assert!(result[second_cat_pos..].starts_with(&format!("cat{}", tag)));
    }

    #[test]
    fn insert_falls_back_to_anchor_alone() {
        let raw = "only one occurrence of unique here.";
        let c = make_comment("3", "unique", "WRONG ", " WRONG", "note");
        // Context won't match, should fall back to anchor alone
        let result = insert_comment(raw, &c).unwrap();
        assert!(result.contains("unique<!-- @comment:"));
    }

    #[test]
    fn insert_errors_when_anchor_not_found() {
        let raw = "Hello world.";
        let c = make_comment("4", "missing", "", "", "note");
        assert!(insert_comment(raw, &c).is_err());
    }

    // ── edit_comment ──────────────────────────────────────────────────────

    #[test]
    fn edit_updates_text_in_place() {
        let c = make_comment("id1", "foo", "", "", "old text");
        let raw = format!("foo{}", serialise_tag(&c));
        let result = edit_comment(&raw, "id1", "new text").unwrap();
        let parsed = parse_comments(&result);
        assert_eq!(parsed.len(), 1);
        assert_eq!(parsed[0].text, "new text");
        assert_eq!(strip_comments(&result), "foo");
    }

    #[test]
    fn edit_errors_on_missing_id() {
        let raw = "no comments here";
        assert!(edit_comment(raw, "ghost", "text").is_err());
    }

    // ── delete_comment ────────────────────────────────────────────────────

    #[test]
    fn delete_removes_tag() {
        let c = make_comment("del1", "bar", "", "", "to delete");
        let raw = format!("bar{}", serialise_tag(&c));
        let result = delete_comment(&raw, "del1").unwrap();
        assert_eq!(result, "bar");
        assert_eq!(parse_comments(&result).len(), 0);
    }

    #[test]
    fn delete_only_removes_matching_id() {
        let c1 = make_comment("k1", "foo", "", "", "keep");
        let c2 = make_comment("k2", "bar", "", "", "remove");
        let raw = format!("foo{}bar{}", serialise_tag(&c1), serialise_tag(&c2));
        let result = delete_comment(&raw, "k2").unwrap();
        let remaining = parse_comments(&result);
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0].id, "k1");
    }

    #[test]
    fn delete_errors_on_missing_id() {
        let raw = "clean text";
        assert!(delete_comment(raw, "nope").is_err());
    }

    // ── clean_pos_to_raw_pos ──────────────────────────────────────────────

    #[test]
    fn pos_mapping_with_no_tags() {
        let raw = "Hello world";
        let stripped = strip_comments(raw);
        // Position 5 (end of "Hello") should map to 5 in raw too
        assert_eq!(clean_pos_to_raw_pos(raw, &stripped, 5), 5);
    }

    #[test]
    fn pos_mapping_skips_tag_length() {
        let c = make_comment("x", "Hello", "", " world", "n");
        let raw = format!("Hello{} world", serialise_tag(&c));
        let stripped = strip_comments(&raw);
        // In stripped: "Hello world", position 5 = end of "Hello"
        // In raw: position 5 + tag length = same end of "Hello"
        let raw_pos = clean_pos_to_raw_pos(&raw, &stripped, 5);
        assert_eq!(&raw[..raw_pos], "Hello");
    }
}
