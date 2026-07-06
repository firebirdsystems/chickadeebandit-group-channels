# Group Channels

Persistent named channels for org-level discussion. Leadership manages channels;
everyone reads and posts in channels they belong to.

## Security model

- **Messages** (`messages`) and **attachments** (`message_files`) are
  `channel_scoped`: only members of a channel (all / group / role / custom) can
  read or post. This is the confidential surface and is enforced server-side.
- **Channel rosters** (`channel_members`) are `owner_only`: a member reads only
  their own membership row; the leadership group (privileged) reads all.
- **Channel manager pointer** (`settings.leadership_group_id`) is `app_config`:
  writable only through the admin-gated `/api/admin-config` endpoint.
- **Channel directory metadata is intentionally household-wide.** The `channels`
  table (name, description, `membership_type`, `membership_roles`) is readable by
  every household member via `/api/db`. The `owner_or_visibility` policy cannot
  express "visible only to this channel's members" (group/custom membership isn't
  one of owner/everyone/adult/privileged), so channel *existence and names* are a
  shared directory by design. The sidebar hiding of channels you can't post in is
  a UX convenience, **not** a confidentiality boundary — do not put secrets in a
  channel *name* or *description*; the protected surface is message content and
  rosters. If channel names ever need to be hidden from non-members, that requires
  a hub-side self-referential `channel_scoped` read policy on the `channels`
  table (cross-repo change in `../chickadeebandit/packages/hub`).
