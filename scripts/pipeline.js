#!/usr/bin/env node
/**
 * BandScape data pipeline — the ONE script for data work.
 *
 * Replaces the pile of one-off scripts (dedupe-links.js, clean-membership-links.js,
 * fix-missing-label-links.js, ...) that grew up trying to fix parsing by hand.
 * Every check lives here, in one place, and `fix` only applies repairs that are
 * provably safe. Anything ambiguous is reported, not guessed at.
 *
 *   node scripts/pipeline.js check            validate, report only (exit 1 on errors)
 *   node scripts/pipeline.js fix              apply safe fixes, then re-check
 *   node scripts/pipeline.js merge <file>     merge an external dataset (punk-graph format:
 *                                             {nodes:[{id,kind,name,bio,instruments}],
 *                                              edges:[{a,b,kind,role,years}]})
 *
 * No timestamped backup files are written — git is the backup. Review with `git diff`.
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
// Nodes are split by type so each file stays small: bands + members.
const BANDS_PATH = resolve(ROOT, 'public/bandsData.json');
const MEMBERS_PATH = resolve(ROOT, 'public/membersData.json');
const LINKS_PATH = resolve(ROOT, 'public/linksData.json');

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

const load = (p) => {
  const d = JSON.parse(readFileSync(p, 'utf8'));
  if (Array.isArray(d)) return d;
  return d.nodes || d.links || d.edges || [];
};

const loadNodes = () => [...load(BANDS_PATH), ...load(MEMBERS_PATH)];
const loadLinks = () => load(LINKS_PATH);

/** Drop empty fields (''/[]/{}/null) — the app guards every access, and it keeps the JSON small. */
const stripEmpty = (node) =>
  Object.fromEntries(
    Object.entries(node).filter(([, v]) => !(v === '' || v === null || (Array.isArray(v) && v.length === 0) || (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0)))
  );

const save = (p, arr, { strip = false } = {}) => {
  const out = strip ? arr.map(stripEmpty) : arr;
  writeFileSync(p, JSON.stringify(out, null, 2) + '\n');
};

/** Write nodes back, split by type. */
const saveNodes = (nodes) => {
  const bands = nodes.filter((n) => n.type === 'band');
  const members = nodes.filter((n) => n.type !== 'band');
  save(BANDS_PATH, bands, { strip: true });
  save(MEMBERS_PATH, members, { strip: true });
  return { bands: bands.length, members: members.length };
};

/** Normalize a name for matching: lowercase, drop parentheticals, punk-tuation, extra spaces. */
const norm = (s) =>
  (s || '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9 ]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const nodeNameMatches = (node, name) => {
  const n = norm(name);
  if (norm(node.name) === n) return true;
  return (node.aliases || []).some((a) => norm(a) === n);
};

const nextId = (nodes, prefix) => {
  let max = 0;
  for (const n of nodes) {
    const m = new RegExp(`^${prefix}_(\\d+)$`).exec(n.id || '');
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `${prefix}_${max + 1}`;
};

// ---------------------------------------------------------------------------
// validation
// ---------------------------------------------------------------------------

function validate(nodes, links) {
  const issues = [];
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const err = (code, message, data) => issues.push({ severity: 'error', code, message, data });
  const warn = (code, message, data) => issues.push({ severity: 'warn', code, message, data });

  for (const n of nodes) {
    if (!n.type) err('untyped-node', `node ${n.id} (${n.name}) has no type`, { id: n.id });
    const m = /^(band|member)_(\d+)$/.exec(n.id || '');
    if (m && m[1] !== n.type) {
      err('id-type-mismatch', `node ${n.id} is typed '${n.type}' but id says '${m[1]}'`, { id: n.id });
    }
  }

  const seenNames = new Map();
  for (const n of nodes) {
    const k = norm(n.name);
    if (!k) { err('empty-name', `node ${n.id} has an empty name`, { id: n.id }); continue; }
    if (seenNames.has(k)) {
      err('duplicate-name', `"${n.name}" appears as both ${seenNames.get(k)} and ${n.id}`, {
        ids: [seenNames.get(k), n.id],
      });
    } else seenNames.set(k, n.id);
  }

  for (const l of links) {
    const f = byId.get(l.from), t = byId.get(l.to);
    if (!f || !t) {
      err('dangling-link', `link ${l.from} -> ${l.to} (${l.type}) points at a node that doesn't exist`, {
        from: l.from, to: l.to,
      });
      continue;
    }
    if (norm(f.name) === norm(t.name)) {
      err('self-link', `"${f.name}" (${l.from}) is linked to itself via ${l.type}`, {
        from: l.from, to: l.to,
      });
    }
    if (l.type === 'member_of' && f.type === 'band' && t.type === 'band') {
      err('band-member-of-band', `band "${f.name}" is member_of band "${t.name}" — bands aren't members`, {
        from: l.from, to: l.to,
      });
    }
  }

  // duplicate links (same from/to/type)
  const seenLinks = new Set();
  for (const l of links) {
    const k = `${l.from}|${l.to}|${l.type}`;
    if (seenLinks.has(k)) warn('duplicate-link', `duplicate link ${l.from} -> ${l.to} (${l.type})`, { from: l.from, to: l.to });
    else seenLinks.add(k);
  }

  return issues;
}

function printIssues(issues) {
  const errors = issues.filter((i) => i.severity === 'error');
  const warns = issues.filter((i) => i.severity === 'warn');
  for (const i of issues) {
    console.log(`  [${i.severity.toUpperCase()}] ${i.code}: ${i.message}`);
  }
  console.log(`\n${errors.length} error(s), ${warns.length} warning(s)`);
  return errors.length;
}

// ---------------------------------------------------------------------------
// fixes (safe only — anything ambiguous is left for a human)
// ---------------------------------------------------------------------------

function applyFixes(nodes, links) {
  const log = [];
  let ns = [...nodes], ls = [...links];
  const byId = () => new Map(ns.map((n) => [n.id, n]));

  // 1. Delete dangling links and self-links and band-member_of-band links.
  //    Record role hints: in a member_of self-link (same name both ends), the
  //    FROM side is the member — the schema's own direction convention.
  const memberHint = new Set();
  const validIds = new Set(ns.map((n) => n.id));
  const bad = ls.filter((l) => {
    const f = byId().get(l.from), t = byId().get(l.to);
    if (!f || !t) return true;
    if (norm(f.name) === norm(t.name)) {
      if (l.type === 'member_of') memberHint.add(l.from);
      return true;
    }
    if (l.type === 'member_of' && f.type === 'band' && t.type === 'band') return true;
    return false;
  });
  for (const l of bad) log.push(`deleted link ${l.from} -> ${l.to} (${l.type || 'untyped'})`);
  ls = ls.filter((l) => !bad.includes(l));

  // 2. Retype untyped member_NNN nodes that have no valid links left.
  //    (These were bands added by a broken script run; they have no good links to preserve.)
  const linkedIds = new Set();
  for (const l of ls) { linkedIds.add(l.from); linkedIds.add(l.to); }
  for (const n of ns) {
    if (!n.type && /^member_\d+$/.exec(n.id || '') && !linkedIds.has(n.id)) {
      const newId = nextId(ns, 'band');
      log.push(`retyped ${n.id} "${n.name}" -> ${newId} (type band)`);
      n.id = newId;
      n.type = 'band';
    }
  }

  // 3. Merge exact-duplicate names. Keeper = most valid links,
  //    tie-break = id prefix agrees with type, then lowest id number.
  const linkCount = new Map();
  for (const l of ls) {
    linkCount.set(l.from, (linkCount.get(l.from) || 0) + 1);
    linkCount.set(l.to, (linkCount.get(l.to) || 0) + 1);
  }
  const byName = new Map();
  for (const n of ns) {
    const k = norm(n.name);
    if (!byName.has(k)) byName.set(k, []);
    byName.get(k).push(n);
  }
  const score = (n) => {
    const agrees = /^(band|member)_/.exec(n.id || '')?.[1] === n.type ? 0 : 1;
    const num = parseInt((n.id || '').split('_')[1] || '0', 10);
    return [(linkCount.get(n.id) || 0) * -1, agrees, num];
  };
  const cmp = (a, b) => { const s = (x) => score(x); const [a1,a2,a3]=s(a),[b1,b2,b3]=s(b); return a1-b1 || a2-b2 || a3-b3; };
  for (const [, group] of byName) {
    if (group.length < 2) continue;
    // A node hinted as the member side of a member_of self-link wins outright:
    // link direction is the schema's own testimony about which dupe is the person.
    const hinted = group.filter((n) => memberHint.has(n.id));
    const keeper = hinted.length === 1 ? hinted[0] : [...group].sort(cmp)[0];
    const losers = group.filter((n) => n !== keeper);
    for (const loser of losers) {
      for (const l of ls) {
        if (l.from === loser.id) l.from = keeper.id;
        if (l.to === loser.id) l.to = keeper.id;
      }
      // re-check: rewiring may have created self-links
      ls = ls.filter((l) => {
        const f = byId().get(l.from), t = byId().get(l.to);
        if (f && t && norm(f.name) === norm(t.name)) {
          log.push(`deleted self-link created by merge: ${l.from} -> ${l.to}`);
          return false;
        }
        return true;
      });
      // enrich keeper with anything the loser had that keeper lacks
      for (const k of ['description', 'aliases', 'image_url', 'website_url', 'location']) {
        if (!keeper[k] || (Array.isArray(keeper[k]) && keeper[k].length === 0)) {
          if (loser[k] && (!Array.isArray(loser[k]) || loser[k].length > 0)) keeper[k] = loser[k];
        }
      }
      log.push(`merged duplicate "${loser.name}": kept ${keeper.id}, deleted ${loser.id}`);
      ns = ns.filter((n) => n !== loser);
    }
  }

  // 4. Drop exact-duplicate links that fixes may have created.
  const seen = new Set();
  ls = ls.filter((l) => {
    const k = `${l.from}|${l.to}|${l.type}`;
    if (seen.has(k)) { log.push(`deleted duplicate link ${k}`); return false; }
    seen.add(k);
    return true;
  });

  return { nodes: ns, links: ls, log };
}

// ---------------------------------------------------------------------------
// merge an external dataset (punk-graph format)
// ---------------------------------------------------------------------------

function mergeDataset(nodes, links, extPath) {
  const log = [];
  const ext = JSON.parse(readFileSync(extPath, 'utf8'));
  const extNodes = ext.nodes || [];
  const extEdges = ext.edges || [];
  const KIND2TYPE = { artist: 'member', band: 'band' };

  // index existing by normalized name
  const byName = new Map();
  for (const n of nodes) {
    const k = norm(n.name);
    if (k && !byName.has(k)) byName.set(k, n);
  }

  const idMap = new Map(); // ext id -> bandscape id
  let addedNodes = 0, enriched = 0;
  for (const en of extNodes) {
    const type = KIND2TYPE[en.kind];
    if (!type) { log.push(`skipped ext node "${en.name}" (unknown kind ${en.kind})`); continue; }
    const existing = byName.get(norm(en.name));
    if (existing) {
      idMap.set(en.id, existing.id);
      let touched = false;
      if (!existing.description && en.bio) { existing.description = en.bio; touched = true; }
      if (en.kind === 'artist' && en.instruments?.length && !existing.instruments) {
        existing.instruments = en.instruments; touched = true;
      }
      if (touched) { enriched++; log.push(`enriched ${existing.id} "${existing.name}"`); }
      continue;
    }
    const id = nextId(nodes, type === 'band' ? 'band' : 'member');
    const nn = {
      id, type, name: en.name, aliases: [],
      description: en.bio || '',
      image_url: '', website_url: '', socials: {},
      location: '', start_date: '', end_date: '', origin: '', tag_ids: [],
    };
    if (en.instruments?.length) nn.instruments = en.instruments;
    nodes.push(nn);
    byName.set(norm(en.name), nn);
    idMap.set(en.id, id);
    addedNodes++;
  }

  const linkKey = new Set(links.map((l) => `${l.from}|${l.to}|${l.type}`));
  const KIND2LINK = { member: 'member_of', guest: 'guest', collab: 'collab' };
  let addedLinks = 0, skippedLinks = 0;
  for (const e of extEdges) {
    const from = idMap.get(e.a), to = idMap.get(e.b);
    const type = KIND2LINK[e.kind] || 'member_of';
    if (!from || !to) { skippedLinks++; continue; }
    // member edges run artist -> band; keep direction, but never link a node to itself
    if (from === to) { skippedLinks++; continue; }
    const k = `${from}|${to}|${type}`;
    if (linkKey.has(k)) { skippedLinks++; continue; }
    let start_date = '', end_date = null;
    if (e.years) {
      const m = /^(\d{4})\s*-\s*(\d{4}|present)?$/.exec(e.years.trim());
      if (m) { start_date = m[1]; end_date = m[2] === 'present' ? null : (m[2] || null); }
      else start_date = e.years;
    }
    links.push({
      from, to, type,
      start_date, end_date,
      roles: e.role ? [e.role] : [],
      attributes: {}, label: '',
    });
    linkKey.add(k);
    addedLinks++;
  }

  log.push(`merge done: +${addedNodes} nodes, ${enriched} enriched, +${addedLinks} links, ${skippedLinks} edges skipped`);
  return log;
}

// ---------------------------------------------------------------------------
// cli
// ---------------------------------------------------------------------------

const [cmd, arg] = process.argv.slice(2);

if (cmd === 'check') {
  const issues = validate(loadNodes(), loadLinks());
  const n = printIssues(issues);
  process.exit(n > 0 ? 1 : 0);
}

if (cmd === 'fix') {
  let nodes = loadNodes(), links = loadLinks();
  const before = validate(nodes, links);
  console.log(`before: ${before.filter((i) => i.severity === 'error').length} error(s)`);
  const { nodes: ns, links: ls, log } = applyFixes(nodes, links);
  for (const l of log) console.log('  FIX:', l);
  const counts = saveNodes(ns);
  save(LINKS_PATH, ls);
  console.log(`\nwrote bands (${counts.bands}) + members (${counts.members})`);
  console.log(`wrote ${LINKS_PATH} (${ls.length} links)`);
  const after = validate(ns, ls);
  console.log('\nafter:');
  process.exit(printIssues(after) > 0 ? 1 : 0);
}

if (cmd === 'merge') {
  if (!arg) { console.error('usage: node scripts/pipeline.js merge <dataset.json>'); process.exit(2); }
  const nodes = loadNodes(), links = loadLinks();
  const log = mergeDataset(nodes, links, resolve(ROOT, arg));
  for (const l of log.slice(0, 20)) console.log('  ' + l);
  if (log.length > 20) console.log(`  ... and ${log.length - 20} more`);
  const counts = saveNodes(nodes);
  save(LINKS_PATH, links);
  console.log(`\nwrote bands (${counts.bands}) + members (${counts.members})`);
  console.log(`wrote ${LINKS_PATH} (${links.length} links)`);
  const issues = validate(nodes, links);
  console.log('\nvalidation after merge:');
  process.exit(printIssues(issues) > 0 ? 1 : 0);
}

console.error('usage: node scripts/pipeline.js <check|fix|merge <file>>');
process.exit(2);
