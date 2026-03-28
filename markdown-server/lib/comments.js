'use strict';

function parseComments(raw) {
  const comments = [];
  const re = /<!--\s*@comment:\s*([\s\S]*?)-->/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    try { comments.push(JSON.parse(m[1].trim())); } catch {}
  }
  return comments;
}

function stripComments(raw) {
  return raw.replace(/<!--\s*@comment:\s*[\s\S]*?-->/g, '');
}

// Advance pos past any comment spans that start exactly at pos.
function skipSpansAt(pos, spans) {
  let cur = pos;
  let jumped = true;
  while (jumped) {
    jumped = false;
    for (const [s, e] of spans) {
      if (s === cur) { cur = e; jumped = true; break; }
    }
  }
  return cur;
}

// Map a character offset in stripComments(raw) back to an offset in raw,
// skipping over any comment tags that sit between the two positions.
function cleanPosToRawPos(raw, cleanPos) {
  const re = /<!--\s*@comment:\s*[\s\S]*?-->/g;
  const spans = [];
  let m;
  while ((m = re.exec(raw)) !== null) spans.push([m.index, m.index + m[0].length]);

  let rawPos = 0, cp = 0;
  while (rawPos < raw.length) {
    if (cp === cleanPos) return skipSpansAt(rawPos, spans);
    const next = skipSpansAt(rawPos, spans);
    if (next !== rawPos) { rawPos = next; continue; }
    cp++;
    rawPos++;
  }
  return rawPos;
}

function insertComment(raw, anchor, commentText, { before = '', after = '' } = {}) {
  const clean = stripComments(raw);

  // Try progressively looser context matches
  let anchorStart = -1;
  const searches = [
    before + anchor + after,
    anchor + after,
    before + anchor,
    anchor,
  ];
  for (const s of searches) {
    const i = clean.indexOf(s);
    if (i !== -1) {
      // anchor starts at i + (length of the before-portion of s)
      const beforeLen = s.startsWith(before) ? before.length : 0;
      anchorStart = i + beforeLen;
      break;
    }
  }
  if (anchorStart === -1) return null;

  const insertAt = cleanPosToRawPos(raw, anchorStart + anchor.length);
  const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  const payload = JSON.stringify({ id, anchor, before, after, text: commentText, date: new Date().toISOString().slice(0, 10) });
  return raw.slice(0, insertAt) + `<!-- @comment: ${payload} -->` + raw.slice(insertAt);
}

function deleteComment(raw, id) {
  const re = /<!--\s*@comment:\s*([\s\S]*?)-->/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    try {
      if (JSON.parse(m[1].trim()).id === id) {
        return raw.slice(0, m.index) + raw.slice(m.index + m[0].length);
      }
    } catch {}
  }
  return null;
}

function editComment(raw, id, newText) {
  const re = /<!--\s*@comment:\s*([\s\S]*?)-->/g;
  let m;
  while ((m = re.exec(raw)) !== null) {
    try {
      const parsed = JSON.parse(m[1].trim());
      if (parsed.id === id) {
        const updated = JSON.stringify({ ...parsed, text: newText });
        return raw.slice(0, m.index) + `<!-- @comment: ${updated} -->` + raw.slice(m.index + m[0].length);
      }
    } catch {}
  }
  return null;
}

module.exports = { parseComments, stripComments, cleanPosToRawPos, insertComment, deleteComment, editComment };
