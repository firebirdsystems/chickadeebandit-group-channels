import { describe, it, expect } from "vitest";
import {
  memberColor, initial, esc, AVATAR_COLORS,
  canManageChannels, canSeeChannel, canPostInChannel,
  slugify, resolveChannelMemberIds,
  renderBody, extractMentionedIds,
  dateLabel, isSameDay, shouldGroupMessages,
  formatRelativeDate, formatClockTime, searchableFields,
} from "../src/logic.js";
import { testPrivilegedGateContract } from "./helpers/privileged-gate.mjs";

// ── canManageChannels ─────────────────────────────────────────────────────────
// Fronts the channels / channel_members insert_privileged_only +
// write_privileged_only policies (leadership_group_id), so it must satisfy the
// shared privileged-gate contract (mirrors the hub: no fallback when unconfigured).

testPrivilegedGateContract("canManageChannels", canManageChannels, {
  member:   { id: "a1", role: "adult" },
  outsider: { id: "a3", role: "adult" },
  groups:   [{ id: "g1", memberIds: ["a1", "a2"] }],
  groupId:  "g1",
});

// ── memberColor / initial ─────────────────────────────────────────────────────
describe("memberColor", () => {
  it("returns a color from AVATAR_COLORS", () => {
    expect(AVATAR_COLORS).toContain(memberColor("member-1"));
  });
  it("is stable for the same id", () => {
    expect(memberColor("abc")).toBe(memberColor("abc"));
  });
  it("varies across ids", () => {
    const colors = new Set(["a","b","c","d","e","f","g","h"].map(memberColor));
    expect(colors.size).toBeGreaterThan(1);
  });
});

describe("initial", () => {
  it("uppercases the first letter", () => { expect(initial("alice")).toBe("A"); });
  it("handles leading whitespace",   () => { expect(initial("  bob")).toBe("B"); });
  it("returns ? for empty string",   () => { expect(initial("")).toBe("?"); });
  it("returns ? for null",           () => { expect(initial(null)).toBe("?"); });
});

describe("esc", () => {
  it("escapes &, <, >, \"", () => {
    expect(esc('A & B < C > D "E"')).toBe("A &amp; B &lt; C &gt; D &quot;E&quot;");
  });
  it("passes through plain text unchanged", () => {
    expect(esc("hello world")).toBe("hello world");
  });
  it("coerces numbers to string", () => {
    expect(esc(42)).toBe("42");
  });
});

// ── canManageChannels ─────────────────────────────────────────────────────────
// Management is gated on membership in the configured channel manager group (mirrors the
// server's insert_privileged_only/write_privileged_only), NOT on role.
describe("canManageChannels", () => {
  const groups = [
    { id: "g-lead", name: "Channel Managers", memberIds: ["m1", "m2"] },
    { id: "g-other", name: "Social", memberIds: ["m3"] },
  ];
  it("allows a member of the configured channel manager group",
     () => expect(canManageChannels({ id: "m1", role: "member" }, groups, "g-lead")).toBe(true));
  it("blocks a non-member of the channel manager group even if 'admin' role",
     () => expect(canManageChannels({ id: "m3", role: "admin" }, groups, "g-lead")).toBe(false));
  it("blocks everyone when no channel manager group is configured",
     () => expect(canManageChannels({ id: "m1", role: "admin" }, groups, "")).toBe(false));
  it("blocks when the configured group id does not exist",
     () => expect(canManageChannels({ id: "m1", role: "admin" }, groups, "g-missing")).toBe(false));
  it("blocks null member", () => expect(canManageChannels(null, groups, "g-lead")).toBe(false));
});

// ── canSeeChannel ─────────────────────────────────────────────────────────────
describe("canSeeChannel — all", () => {
  const ch = { membership_type: "all", membership_roles: "[]", archived_at: null };
  it("any member can see",  () => expect(canSeeChannel({ id: "x", role: "pledge" }, ch)).toBe(true));
  it("null me cannot see",  () => expect(canSeeChannel(null, ch)).toBe(false));
});

describe("canSeeChannel — group", () => {
  const ch = { membership_type: "group", membership_roles: '["g-board","g-finance"]', archived_at: null };
  const groups = [
    { id: "g-board", memberIds: ["m1", "m2"] },
    { id: "g-social", memberIds: ["m3"] },
  ];
  it("member in a selected group can see", () => expect(canSeeChannel({ id: "m1", role: "member" }, ch, [], groups)).toBe(true));
  it("member outside selected groups cannot see", () => expect(canSeeChannel({ id: "m3", role: "admin" }, ch, [], groups)).toBe(false));

  it("accepts pre-parsed array", () => {
    const ch2 = { membership_type: "group", membership_roles: ["g-board"], archived_at: null };
    expect(canSeeChannel({ id: "m2", role: "officer" }, ch2, [], groups)).toBe(true);
  });
});

describe("canSeeChannel — custom", () => {
  const ch = { membership_type: "custom", membership_roles: "[]", archived_at: null };
  it("member in list can see",     () => expect(canSeeChannel({ id: "m1", role: "member" }, ch, ["m1", "m2"])).toBe(true));
  it("member not in list cannot",  () => expect(canSeeChannel({ id: "m3", role: "member" }, ch, ["m1", "m2"])).toBe(false));
  it("empty list blocks everyone", () => expect(canSeeChannel({ id: "m1", role: "admin"  }, ch, [])).toBe(false));
});

// ── canPostInChannel ──────────────────────────────────────────────────────────
describe("canPostInChannel", () => {
  it("blocks posting in archived channel", () => {
    const ch = { membership_type: "all", membership_roles: "[]", archived_at: "2024-01-01T00:00:00Z" };
    expect(canPostInChannel({ id: "m1", role: "admin" }, ch)).toBe(false);
  });
  it("allows posting when not archived", () => {
    const ch = { membership_type: "all", membership_roles: "[]", archived_at: null };
    expect(canPostInChannel({ id: "m1", role: "member" }, ch)).toBe(true);
  });
});

// ── slugify ───────────────────────────────────────────────────────────────────
describe("slugify", () => {
  it("lowercases and hyphenates",        () => expect(slugify("House Wide")).toBe("house-wide"));
  it("strips special chars",             () => expect(slugify("Finance & Budget!")).toBe("finance-budget"));
  it("collapses multiple hyphens",       () => expect(slugify("a  --  b")).toBe("a-b"));
  it("strips leading/trailing hyphens",  () => expect(slugify("--finance--")).toBe("finance"));
  it("handles empty string",             () => expect(slugify("")).toBe(""));
});

// ── resolveChannelMemberIds ───────────────────────────────────────────────────
describe("resolveChannelMemberIds", () => {
  const members = [
    { id: "a1", role: "admin"   },
    { id: "o1", role: "officer" },
    { id: "m1", role: "member"  },
    { id: "p1", role: "pledge"  },
  ];

  it("all — returns everyone", () => {
    const ch = { membership_type: "all" };
    expect(resolveChannelMemberIds(ch, members)).toEqual(["a1","o1","m1","p1"]);
  });

  it("group — returns members from selected groups", () => {
    const ch = { membership_type: "group", membership_roles: '["g-board","g-finance"]' };
    const groups = [
      { id: "g-board", memberIds: ["a1", "o1"] },
      { id: "g-finance", memberIds: ["o1", "m1"] },
      { id: "g-social", memberIds: ["p1"] },
    ];
    expect(resolveChannelMemberIds(ch, members, [], groups).sort()).toEqual(["a1","o1","m1"].sort());
  });

  it("custom — returns provided ids", () => {
    const ch = { membership_type: "custom" };
    expect(resolveChannelMemberIds(ch, members, ["m1","p1"])).toEqual(["m1","p1"]);
  });
});

// ── renderBody ────────────────────────────────────────────────────────────────
describe("renderBody", () => {
  const members = [{ id: "m1", name: "Alex Johnson", role: "member" }];

  it("escapes HTML in the body", () => {
    const result = renderBody("<script>bad</script>", []);
    expect(result).toContain("&lt;script&gt;");
    expect(result).not.toContain("<script>");
  });

  it("highlights a @mention for a known member", () => {
    const result = renderBody("@Alex Johnson see this", members);
    expect(result).toContain('class="mention"');
    expect(result).toContain(`<span class="mention">@Alex Johnson</span>`);
  });

  it("leaves unknown @mention unstyled", () => {
    const result = renderBody("@nobody here", members);
    expect(result).not.toContain('class="mention"');
  });

  it("converts newlines to <br>", () => {
    const result = renderBody("line1\nline2", []);
    expect(result).toContain("<br>");
  });
});

// ── extractMentionedIds ───────────────────────────────────────────────────────
describe("extractMentionedIds", () => {
  const members = [
    { id: "m1", name: "Alex Johnson" },
    { id: "m2", name: "Jordan Lee"   },
  ];

  it("extracts a single mention", () => {
    expect(extractMentionedIds("@Alex Johnson check this", members)).toEqual(["m1"]);
  });

  it("extracts multiple mentions", () => {
    const ids = extractMentionedIds("@Alex Johnson and @Jordan Lee", members);
    expect(ids.sort()).toEqual(["m1","m2"].sort());
  });

  it("deduplicates repeated mentions", () => {
    const ids = extractMentionedIds("@Alex Johnson @Alex Johnson", members);
    expect(ids).toHaveLength(1);
  });

  it("returns empty for no mentions", () => {
    expect(extractMentionedIds("no mentions here", members)).toEqual([]);
  });
});

// ── isSameDay ─────────────────────────────────────────────────────────────────
describe("isSameDay", () => {
  it("same day returns true",      () => expect(isSameDay("2024-03-15T08:00:00Z", "2024-03-15T22:00:00Z")).toBe(true));
  it("different day returns false",() => expect(isSameDay("2024-03-15T08:00:00Z", "2024-03-16T08:00:00Z")).toBe(false));
});

// ── formatClockTime ───────────────────────────────────────────────────────────
// TZ-independent assertions: check shape and the compact/full relationship, not
// the absolute hour (which depends on the runner's timezone).
describe("formatClockTime", () => {
  const iso = "2024-03-15T15:42:00Z";
  it("full form is H:MM AM/PM", () => expect(formatClockTime(iso)).toMatch(/^\d{1,2}:\d{2}\s[AP]M$/));
  it("compact form drops the meridiem", () => expect(formatClockTime(iso, true)).toMatch(/^\d{1,2}:\d{2}$/));
  it("compact equals full without the meridiem",
    () => expect(formatClockTime(iso, true)).toBe(formatClockTime(iso).replace(/\s?[AP]M$/i, "")));
});

// ── shouldGroupMessages ───────────────────────────────────────────────────────
// Uses noon-UTC times so the ±few-minute gaps never straddle a local midnight.
describe("shouldGroupMessages", () => {
  const m = (author_id, created_at) => ({ author_id, created_at });
  it("groups same author within the window",
    () => expect(shouldGroupMessages(m("a", "2024-03-15T12:00:00Z"), m("a", "2024-03-15T12:03:00Z"))).toBe(true));
  it("does not group different authors",
    () => expect(shouldGroupMessages(m("a", "2024-03-15T12:00:00Z"), m("b", "2024-03-15T12:03:00Z"))).toBe(false));
  it("does not group past the 5-minute window",
    () => expect(shouldGroupMessages(m("a", "2024-03-15T12:00:00Z"), m("a", "2024-03-15T12:06:00Z"))).toBe(false));
  it("does not group across different days",
    () => expect(shouldGroupMessages(m("a", "2024-03-15T12:00:00Z"), m("a", "2024-03-16T12:00:00Z"))).toBe(false));
  it("does not group when there is no previous message",
    () => expect(shouldGroupMessages(null, m("a", "2024-03-15T12:00:00Z"))).toBe(false));
  it("does not group out-of-order (negative gap) messages",
    () => expect(shouldGroupMessages(m("a", "2024-03-15T12:03:00Z"), m("a", "2024-03-15T12:00:00Z"))).toBe(false));
});

describe("searchableFields", () => {
  it("matches on the author as well as the body", () => {
    const fields = searchableFields({ body: "who is on parking duty?", author_name: "Sam" });
    expect(fields).toContain("who is on parking duty?");
    expect(fields).toContain("Sam");
  });
});
