import { describe, it, expect } from "vitest";
import {
  memberColor, initial, esc, AVATAR_COLORS,
  canManageChannels, canSeeChannel, canPostInChannel,
  slugify, resolveChannelMemberIds,
  renderBody, extractMentionedIds,
  dateLabel, isSameDay, shouldGroupMessages,
  formatRelativeDate, formatClockTime, searchableFields,
  authorName, mentionCandidateIds,
  createLatestLoader,
  MAX_BATCH, MAX_ATTACHMENTS, acceptFiles, messageBatch,
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

describe("extractMentionedIds whole-name matching", () => {
  const people = [{ id: "al", name: "Al" }, { id: "alex", name: "Alex" }, { id: "aj", name: "Alex Johnson" }];

  it("does not mention a member whose name is the start of the one written", () => {
    expect(extractMentionedIds("thanks @Alex!", people)).toEqual(["alex"]);
  });

  it("takes the longest name and not the shorter one inside it", () => {
    expect(extractMentionedIds("@Alex Johnson can you check", people)).toEqual(["aj"]);
  });

  it("still finds two separate mentions", () => {
    expect(extractMentionedIds("@Al and @Alex", people).sort()).toEqual(["al", "alex"]);
  });
});

describe("mentionCandidateIds", () => {
  const all = [{ id: "m1" }, { id: "m2" }, { id: "m3" }];
  const custom = { membership_type: "custom", membership_roles: "[]" };

  it("offers a manager the hand-picked channel's roster", () => {
    expect(mentionCandidateIds(custom, all, ["m1", "m2"], [], true)).toEqual(["m1", "m2"]);
  });

  it("offers everyone to a member who can read only their own membership row", () => {
    expect(mentionCandidateIds(custom, all, ["m3"], [], false)).toEqual(["m1", "m2", "m3"]);
  });

  it("resolves every other kind of channel as before", () => {
    const group = { membership_type: "group", membership_roles: '["g1"]' };
    expect(mentionCandidateIds(group, all, [], [{ id: "g1", memberIds: ["m2"] }], false)).toEqual(["m2"]);
  });
});

describe("authorName", () => {
  const members = [{ id: "m1", name: "Alex" }];

  it("uses the roster name for the row's author id, whatever name the row carries", () => {
    expect(authorName({ author_id: "m1", author_name: "Someone Else" }, members)).toBe("Alex");
  });

  it("falls back to the stored name for someone no longer on the roster", () => {
    expect(authorName({ author_id: "gone", author_name: "Jordan" }, members)).toBe("Jordan");
  });
});

describe("createLatestLoader", () => {
  /** A load whose answers the test releases by hand, in any order. */
  function harness() {
    const pending = {};
    const committed = [];
    const run = createLatestLoader({
      load: (key) => new Promise((resolve, reject) => { pending[key] = { resolve, reject }; }),
      commit: (key, result) => committed.push([key, result]),
    });
    return { run, pending, committed };
  }

  it("commits the answer of a load that succeeds", async () => {
    const { run, pending, committed } = harness();
    const done = run("a");
    pending.a.resolve("rows-a");
    expect(await done).toBe(true);
    expect(committed).toEqual([["a", "rows-a"]]);
  });

  it("commits nothing when the load fails, and throws the failure", async () => {
    const { run, pending, committed } = harness();
    const done = run("b");
    pending.b.reject(new Error("offline"));
    await expect(done).rejects.toThrow("offline");
    expect(committed).toEqual([]);
  });

  it("drops an answer that arrives after a newer call, whatever order they land in", async () => {
    const { run, pending, committed } = harness();
    const first = run("a");
    const second = run("b");
    pending.b.resolve("rows-b");
    expect(await second).toBe(true);
    pending.a.resolve("rows-a");
    expect(await first).toBe(false);
    expect(committed).toEqual([["b", "rows-b"]]);
  });

  it("drops a superseded failure without throwing", async () => {
    const { run, pending, committed } = harness();
    const first = run("a");
    const second = run("b");
    pending.a.reject(new Error("offline"));
    expect(await first).toBe(false);
    pending.b.resolve("rows-b");
    expect(await second).toBe(true);
    expect(committed).toEqual([["b", "rows-b"]]);
  });

  it("can load the same key again after it failed", async () => {
    const { run, pending, committed } = harness();
    const failed = run("b");
    pending.b.reject(new Error("offline"));
    await expect(failed).rejects.toThrow();
    const retry = run("b");
    pending.b.resolve("rows-b");
    expect(await retry).toBe(true);
    expect(committed).toEqual([["b", "rows-b"]]);
  });

  it("cancel drops a load in flight, so going back to what is shown is the choice that wins", async () => {
    const { run, pending, committed } = harness();
    const done = run("b");
    run.cancel();
    pending.b.resolve("rows-b");
    expect(await done).toBe(false);
    expect(committed).toEqual([]);
  });

  it("cancel drops a failure in flight too, and a later load still commits", async () => {
    const { run, pending, committed } = harness();
    const dropped = run("b");
    run.cancel();
    pending.b.reject(new Error("offline"));
    expect(await dropped).toBe(false);
    const next = run("c");
    pending.c.resolve("rows-c");
    expect(await next).toBe(true);
    expect(committed).toEqual([["c", "rows-c"]]);
  });

  it("passes options through and reports the latest call's number", async () => {
    const seen = [];
    const run = createLatestLoader({
      load: async (key, options) => { seen.push(["load", key, options]); return 1; },
      commit: (key, result, options) => seen.push(["commit", key, options]),
    });
    expect(run.generation()).toBe(0);
    await run("a", { fresh: true });
    expect(run.generation()).toBe(1);
    expect(seen).toEqual([["load", "a", { fresh: true }], ["commit", "a", { fresh: true }]]);
  });
});

describe("acceptFiles", () => {
  const picked = (n) => Array.from({ length: n }, (_, i) => `file-${i}`);

  it("takes everything while the message has room", () => {
    expect(acceptFiles(picked(3), 0)).toEqual({ accepted: picked(3), refused: [] });
  });

  it("takes only what still fits beside the files already waiting", () => {
    const { accepted, refused } = acceptFiles(picked(5), MAX_ATTACHMENTS - 2);
    expect(accepted).toEqual(["file-0", "file-1"]);
    expect(refused).toEqual(["file-2", "file-3", "file-4"]);
  });

  it("takes nothing once the message is full", () => {
    expect(acceptFiles(picked(2), MAX_ATTACHMENTS).accepted).toEqual([]);
    expect(acceptFiles(picked(2), MAX_ATTACHMENTS + 3).accepted).toEqual([]);
  });
});

describe("messageBatch", () => {
  const message = { id: "msg-1", channelId: "ch-a", authorId: "m1", authorName: "Alex", body: "hi", createdAt: "2026-01-01T00:00:00Z" };
  const upload = (n) => Array.from({ length: n }, (_, i) => ({ id: `f${i}`, thumbId: i % 2 ? `t${i}` : null, name: `n${i}`, mime_type: "image/png", size: 10 }));
  const ids = () => { let n = 0; return () => `row-${n++}`; };

  it("is the message alone when nothing is attached", () => {
    const batch = messageBatch(message, [], ids());
    expect(batch).toHaveLength(1);
    expect(batch[0].sql).toContain("INSERT INTO app_group_channels__messages");
    expect(batch[0].params).toEqual(["msg-1", "ch-a", "m1", "Alex", "hi", "2026-01-01T00:00:00Z"]);
  });

  it("puts the message first and ties every attachment row to it and to its channel", () => {
    const batch = messageBatch(message, upload(3), ids());
    expect(batch).toHaveLength(4);
    for (const [i, statement] of batch.slice(1).entries()) {
      expect(statement.sql).toContain("INSERT INTO app_group_channels__message_files");
      const [rowId, messageId, channelId, authorId, fileId, thumbId] = statement.params;
      expect([rowId, messageId, channelId, authorId, fileId]).toEqual([`row-${i}`, "msg-1", "ch-a", "m1", `f${i}`]);
      expect(thumbId).toBe(i % 2 ? `t${i}` : null);
    }
  });

  it("fits the largest allowed send in exactly one hub batch", () => {
    expect(messageBatch(message, upload(MAX_ATTACHMENTS), ids())).toHaveLength(MAX_BATCH);
  });

  it("refuses a send that would need a second batch", () => {
    expect(() => messageBatch(message, upload(MAX_ATTACHMENTS + 1), ids())).toThrow(/up to 24 files/);
  });
});
