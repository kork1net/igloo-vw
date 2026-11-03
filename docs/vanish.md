# Administrator visibility

Administrators have dark blue player names, using `adminStyle.text` just like
their chat bubbles. VANISH on the right side toggles invisibility; a check mark
and a translucent local character indicate the active state.

The server checks current administrator permissions for every `admin:vanish`
request. Hidden administrators are excluded from room snapshots and broadcasts
of avatars, movement, outfits, minigame badges, chat and emojis. They continue
receiving room updates. Existing trades are cancelled when hiding.

Visibility is shared by an administrator's connected tabs and retained across
room changes/reconnections while the server runs. It is not saved to disk.
Unhiding broadcasts the current outfit and position to observers.
