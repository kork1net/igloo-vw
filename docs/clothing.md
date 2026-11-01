# Adding clothing

Put a PNG sprite sheet in `public/assets/items/`. No JavaScript changes are needed.
Files directly in that directory are shirts, preserving `black-shirt.png`.
Use these subfolders for other layers (create them as needed):

| Folder | Slot / drawing order |
| --- | --- |
| `shoes/` | Shoes |
| `pants/` | Pants |
| `shirt/` | Shirt |
| `jacket/` | Jacket |
| `hair/` | Hair, below hats |
| `hat/` | Hat |
| `accessory/` | Accessory, drawn last |

Exception: an equipped item whose source PNG filename ends with `necklace.png`
(for example `gold-necklace.png`) is drawn immediately below hair, above shirts
and jackets. This also applies to its color variants and walking sheets, in both
local/remote characters and previews. Keep necklaces in `accessory/` as usual.

Accessories ending in `necklace.png` and `glasses.png` use independent equipped
slots (`necklace` and `glasses`) under the same accessories tab. One necklace and
one pair of glasses can be worn together; selecting another item of the same type
replaces only that type. Color variants keep the type of their source sheet.
Existing item IDs and ownership stay unchanged, and legacy saved `accessory`
equipment is automatically read into the appropriate slot. Glasses draw above
hair and eyelashes; necklaces stay below hair. Other accessories retain the
generic `accessory` slot.

For example, `public/assets/items/hat/red-cap.png` creates the item `hat/red-cap`.
Items use their relative paths as IDs; keep paths stable after adding them.
Admins automatically own all discovered items. Other players start with their chosen
registration body color and purchase additional items from the curated catalog inside Shop.
Ownership, currency and equipped items persist on the server; see `inventory.md`.

## Inventory categories and body colors

The inventory tabs are ordered: player color, hats, hair, accessories, shirts, pants,
then shoes. Jackets are included under shirts. Each category has its own pages;
empty categories remain visible with an empty-state message.

The seven UI sheet frames follow this same order, from left to right in the PNG.
Add hair sheets under `public/assets/items/hair/`, for example `short-brown.png`.
They use the same 64x78 direction frames, optional walking sheets and color variants
as clothes. Hair is a separate equipped slot, so wearing a hat does not remove it.
Hair appears in inventory and catalog previews, player cards and multiplayer, and
is saved with the outfit. To sell a hairstyle, explicitly add its ID (for example
`hair/short-brown`) to `server/shop-catalog.json`; new assets are not sold automatically.

Body colors are defined in `public/assets/items/body-colors.json`, with entries
such as `{ "id": "blue", "name": "Blue", "tint": "#91ceff" }`. They require no
new images and use the `bodyColor` equipment slot, with IDs like `body-color/blue`.
The default is white, with four starter choices configured in `shared/registration.json`.
The chosen color applies only to the body, including walking
frames, local/remote players and preview cards; clothing keeps its own colors.
Body colors use tint because the original body is white, rather than hue rotation.

## Sheet format

Use a transparent PNG with 64 × 78 pixel cells aligned to the character's cells.
Clothing uses the same origin and horizontal offsets as the character.
The current character uses seven frames for eight directions:

| Frame | Direction |
| --- | --- |
| 0 | Down |
| 1 | Up |
| 2 | Down-left |
| 3 | Down-right |
| 4 | Up-right |
| 5 | Up-left |
| 6 | Right (mirrored for left) |

Frames are read left-to-right, then top-to-bottom. An eighth frame is allowed but
is not used by the current character. Padding at the sheet's right/bottom edges is
allowed, matching the existing assets. Sheets must contain at least seven cells.
Walking sheets are optional. Put them beside the base sheet with matching names:

```text
shoes/gray-shoes.png
shoes/gray-shoes-walk-1.png
shoes/gray-shoes-walk-2.png
```

Each walking sheet contains all directions and uses the base item's cell dimensions.
They match `player-walk-1` and `player-walk-2` respectively, including during running.
Walking sheets are grouped under the base item and never become inventory items.
If either sheet is missing, that pose uses the base sheet. Inventory and player-card
previews use the base sheet. Existing names with a trailing dot before `.png` are
also supported without changing the item's ID.

## Optional metadata

For `hat/red-cap.png`, optionally add `hat/red-cap.json`:

```json
{
  "name": "Red cap",
  "slot": "hat",
  "frameWidth": 64,
  "frameHeight": 78
}
```

All fields are optional. `slot` overrides the folder's category. Different cell
dimensions still need artwork positioned to match the body's bottom-center origin.
`name` is available in the catalog; IDs and textures do not depend on it.

## Color variants without extra PNGs

Add `variants` to the base item's metadata file. For example, `pants/blue-jeans.json`:

```json
{
  "name": "Dark blue jeans",
  "variants": [
    { "id": "green", "name": "Green jeans", "hue": -100 },
    { "id": "burgundy", "name": "Burgundy jeans", "hue": 120 },
    { "id": "purple", "name": "Purple jeans", "hue": 60 }
  ]
}
```

Each variant is a separate inventory ID, such as `pants/blue-jeans--green`, and
shares the base textures and optional walking sheets. Variant IDs use lowercase
letters, digits, hyphens or underscores. Hue is a rotation in degrees, from -180
to 180. The original item remains unchanged. Hue rotation changes existing colors;
black, white and gray areas remain neutral.

For gray or white source artwork, use `tint` instead of `hue`, for example
`{ "id": "blue", "name": "Blue shoes", "tint": "#77b7ef" }`. Tint multiplies
the source colors, preserving transparency and shading. It applies to all walking
sheets and resets to white when selecting the original item. Hue and tint can
also be combined in the same variant.

The same color treatment is applied to inventory icons, local/remote players and
preview cards. WebGL uses a color-matrix filter; Canvas caches recolored textures
once per sheet and hue. The loader downloads each source sheet only once.

## Development and deployment

Run `npm.cmd run dev-nolog`. Vite scans PNGs and metadata on startup and updates
`src/game/items/catalog.generated.json` when assets are added, edited or removed.
Refresh the browser after adding an asset if it has not reloaded automatically.
Opening or refreshing the main page also rescans the folder, even if a file watcher
event was missed. After installing changes to the Vite configuration/plugin itself,
restart the Vite process once to load the new scanner.
The generated file is automatic; do not edit it by hand.

Run the multiplayer server with `node --watch server/index.cjs`.
It scans the same assets and validates item IDs and slots. It refreshes its catalog
when processing player updates, at most once per second. New assets must exist on
both the server and the client deployment. Rebuild with `npm.cmd run build-nolog`
and refresh clients after changing assets in production.

Check discovery/rendering/sync with `node tests/clothing.cjs` and background movement
with `node tests/background-movement.cjs`. For a visual check, add a new sheet, open
two clients, equip it, turn in every direction, open the inventory/player card, and
change rooms. Clothing remains equipped while moving between rooms.
