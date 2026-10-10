import { AVATAR_COLORS, memberColor, initial, esc, isAdult, formatRelativeDate, formatClockTime } from "./shared.js";
export { AVATAR_COLORS, memberColor, initial, esc, isAdult, formatRelativeDate, formatClockTime };

// ── Access control ─────────────────────────────────────────────────────────────

/**
 * Whether `me` may create / edit / archive channels. This MUST mirror the server:
 * `channels` and `channel_members` are gated by `insert_privileged_only` +
 * `write_privileged_only` on the configured channel manager group (manifest
 * `bypass_group_setting` → `leadership_group_id`). There is no "all adults"
 * fallback — when no leadership group is configured the server blocks every
 * management write, so the client must too (a hub admin sets the group first via
 * the admin-config endpoint). Role (admin/officer) is NOT what the server checks.
 */
export function canManageChannels(me, groups = [], leadershipGroupId = "") {
  if (!me || !leadershipGroupId) return false;
  const g = groups.find(x => x.id === leadershipGroupId);
  return !!g && g.memberIds.includes(me.id);
}

/**
 * Returns true if `me` is allowed to see (and post in) the channel.
 * @param {object} me
 * @param {object} channel  - { membership_type, membership_roles (parsed array) }
 * @param {string[]} customMemberIds - ids from channel_members for this channel
 * @param {object[]} groups - family.groups: [{ id, memberIds }]
 */
export function canSeeChannel(me, channel, customMemberIds = [], groups = []) {
  if (!me) return false;
  if (channel.membership_type === "all") return true;
  if (channel.membership_type === "group") {
    const groupIds = Array.isArray(channel.membership_roles)
      ? channel.membership_roles
      : JSON.parse(channel.membership_roles || "[]");
    return groups.some(g => groupIds.includes(g.id) && (g.memberIds ?? []).includes(me.id));
  }
  if (channel.membership_type === "role") {
    const roles = Array.isArray(channel.membership_roles)
      ? channel.membership_roles
      : JSON.parse(channel.membership_roles || "[]");
    return roles.includes(me.role);
  }
  if (channel.membership_type === "custom") {
    return customMemberIds.includes(me.id);
  }
  return false;
}

export function canPostInChannel(me, channel, customMemberIds = [], groups = []) {
  if (channel.archived_at) return false;
  return canSeeChannel(me, channel, customMemberIds, groups);
}

// ── Channel helpers ────────────────────────────────────────────────────────────

export function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Returns the member ids who belong to a channel — used for @mention autocomplete
 * and targeting notifications.
 */
export function resolveChannelMemberIds(channel, allMembers, customMemberIds = [], groups = []) {
  if (channel.membership_type === "all") return allMembers.map(m => m.id);
  if (channel.membership_type === "group") {
    const groupIds = Array.isArray(channel.membership_roles)
      ? channel.membership_roles
      : JSON.parse(channel.membership_roles || "[]");
    const ids = new Set();
    groups
      .filter(g => groupIds.includes(g.id))
      .forEach(g => (g.memberIds ?? []).forEach(id => ids.add(id)));
    return [...ids];
  }
  if (channel.membership_type === "role") {
    const roles = Array.isArray(channel.membership_roles)
      ? channel.membership_roles
      : JSON.parse(channel.membership_roles || "[]");
    return allMembers.filter(m => roles.includes(m.role)).map(m => m.id);
  }
  if (channel.membership_type === "custom") return [...customMemberIds];
  return [];
}

// ── @mention parsing ──────────────────────────────────────────────────────────

/**
 * Renders message body: escapes HTML, highlights @mentions.
 * Matches against actual member names (longest first) so multi-word names work.
 */
export function renderBody(body, members) {
  let result = esc(body).replace(/\n/g, "<br>");
  // Sort longest name first so "Alex Johnson" matches before "Alex"
  const sorted = [...members].sort((a, b) => b.name.length - a.name.length);
  for (const m of sorted) {
    const escapedName = esc(m.name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`@(${escapedName})(?=[^a-zA-Z]|$)`, "gi");
    result = result.replace(re, `<span class="mention">@$1</span>`);
  }
  return result;
}

/**
 * Extracts member ids @mentioned in a raw body string.
 * Matches against actual member names so multi-word names work. A name counts
 * only as a whole mention, the same test renderBody highlights by: "@Alex"
 * does not also mention a member called "Al", and the longest name is taken
 * first so "@Alex Johnson" is not read as "@Alex" as well.
 */
export function extractMentionedIds(body, members) {
  const ids = new Set();
  let rest = body;
  const sorted = [...members].filter(m => m.name).sort((a, b) => b.name.length - a.name.length);
  for (const m of sorted) {
    const name = m.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(`@${name}(?=[^a-zA-Z]|$)`, "gi");
    const without = rest.replace(re, " ");
    if (without !== rest) ids.add(m.id);
    rest = without;
  }
  return [...ids];
}

/**
 * The member ids offered by @mention autocomplete in a channel.
 *
 * A hand-picked channel's roster is readable in full only by channel managers:
 * everyone else reads just their own membership row, so resolving the roster
 * for them gave a list of one, themselves. They are offered the whole roster
 * instead. The hub decides who is actually notified, and drops anyone who
 * cannot see the channel.
 */
export function mentionCandidateIds(channel, allMembers, customMemberIds = [], groups = [], seesWholeRoster = false) {
  if (channel.membership_type === "custom" && !seesWholeRoster) return allMembers.map(m => m.id);
  return resolveChannelMemberIds(channel, allMembers, customMemberIds, groups);
}

/**
 * The name to show for a message's author. `author_id` is set by the hub and
 * cannot be forged; `author_name` is whatever the sender wrote, so it is used
 * only for someone no longer on the roster.
 */
export function authorName(row, members = []) {
  const member = members.find(m => m.id === row.author_id);
  return member?.name ?? row.author_name ?? "Former member";
}

// ── Date separators ───────────────────────────────────────────────────────────

export function dateLabel(iso) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  const sameDay = (a, b) =>
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();

  if (sameDay(d, today)) return "Today";
  if (sameDay(d, yesterday)) return "Yesterday";
  if (today.getFullYear() === d.getFullYear())
    return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function isSameDay(isoA, isoB) {
  const a = new Date(isoA), b = new Date(isoB);
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth()    === b.getMonth()    &&
         a.getDate()     === b.getDate();
}

/**
 * Whether `curr` should collapse into the previous message `prev` — same author,
 * same day, and posted within `windowMs` (default 5 min). Grouped messages hide
 * the avatar and name/time header so a back-and-forth reads as one block. The
 * caller must NOT group the first message after a date separator (different day
 * already fails here, but a same-day boundary can't occur across a separator).
 */
export function shouldGroupMessages(prev, curr, windowMs = 5 * 60_000) {
  if (!prev || !curr) return false;
  if (prev.author_id !== curr.author_id) return false;
  if (!isSameDay(prev.created_at, curr.created_at)) return false;
  const gap = new Date(curr.created_at) - new Date(prev.created_at);
  return gap >= 0 && gap <= windowMs;
}

/**
 * Fields the message search matches against (see hub-sdk `searchMatch`). The
 * author's name counts as well as the body, so "sam parking" finds what Sam
 * said about parking. Matching happens on the DECRYPTED row client-side —
 * `body` is encrypted at rest, so no SQL LIKE could ever do this.
 */
export function searchableFields(message) {
  return [message.body, message.author_name];
}

/**
 * Wraps a load so that only the latest call's answer is ever kept.
 *
 * `load(key, options)` fetches; `commit(key, result, options)` puts the answer
 * into the page. Each call takes the next number, and a call's answer is
 * committed only if no newer call has been made since. An answer that arrives
 * late is dropped before it can change anything, and nothing is committed for a
 * load that failed: the page stays exactly as it was.
 *
 * Resolves true when the answer was committed, false when a newer call
 * superseded it (a superseded failure is dropped too). A failure of the latest
 * call is thrown to the caller.
 *
 * `generation()` is the number of the latest call, for work that must notice a
 * newer load without starting one. `cancel()` supersedes whatever is in flight
 * without loading anything: for when the member's latest choice is what is
 * already on the page, so an earlier, slower choice must not land over it.
 */
export function createLatestLoader({ load, commit }) {
  let seq = 0;
  async function run(key, options) {
    const mine = ++seq;
    let result;
    try {
      result = await load(key, options);
    } catch (e) {
      if (mine === seq) throw e;
      return false;
    }
    if (mine !== seq) return false;
    commit(key, result, options);
    return true;
  }
  run.generation = () => seq;
  run.cancel = () => { seq++; };
  return run;
}

// ── Sending ───────────────────────────────────────────────────────────────────

/** Statements the hub accepts in one atomic /api/db batch. */
export const MAX_BATCH = 25;

/**
 * Files one message can carry. A message and its attachment rows are sent as
 * ONE batch, so they land together or not at all; one statement of the batch
 * is the message itself. Past this the send would need a second batch, and a
 * failure there left the message saved while the page offered it for retry.
 */
export const MAX_ATTACHMENTS = MAX_BATCH - 1;

/**
 * Splits newly picked files into those a message still has room for and those
 * it does not, given how many are already waiting to be sent with it.
 */
export function acceptFiles(selected, pendingCount) {
  const room = Math.max(0, MAX_ATTACHMENTS - pendingCount);
  return { accepted: selected.slice(0, room), refused: selected.slice(room) };
}

/**
 * The one batch that sends a message: its row first, then one row per
 * attachment. Every row names the channel given here, never whichever channel
 * is open when a statement happens to be built. Throws when the files would
 * not fit one batch, so a send can never be split across two.
 *
 * `files` are uploaded entries: { id, thumbId, name, mime_type, size }.
 * `newId` makes an attachment row's id.
 */
export function messageBatch({ id, channelId, authorId, authorName, body, createdAt }, files, newId) {
  if (files.length > MAX_ATTACHMENTS) {
    throw new Error(`A message can carry up to ${MAX_ATTACHMENTS} files.`);
  }
  return [
    {
      sql: `INSERT INTO app_group_channels__messages (id, channel_id, author_id, author_name, body, created_at)
            VALUES (?, ?, ?, ?, ?, ?)`,
      params: [id, channelId, authorId, authorName, body, createdAt],
    },
    ...files.map(f => ({
      sql: `INSERT INTO app_group_channels__message_files (id, message_id, channel_id, author_id, file_id, thumb_file_id, file_name, mime_type, size_bytes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      params: [newId(), id, channelId, authorId, f.id, f.thumbId ?? null, f.name, f.mime_type, f.size ?? 0, createdAt],
    })),
  ];
}
