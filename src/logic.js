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
 * Matches against actual member names so multi-word names work.
 */
export function extractMentionedIds(body, members) {
  const ids = new Set();
  const lower = body.toLowerCase();
  const sorted = [...members].sort((a, b) => b.name.length - a.name.length);
  for (const m of sorted) {
    if (lower.includes("@" + m.name.toLowerCase())) ids.add(m.id);
  }
  return [...ids];
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
