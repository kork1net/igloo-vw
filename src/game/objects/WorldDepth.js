// Keep scenery and characters in the world layer, below windows and controls.
// groundY is the object's horizontal sorting line, or the character's feet.
export function setWorldDepth(object, groundY, roomHeight) {
    object.setDepth(10 + Math.max(0, Math.min(1, groundY / roomHeight)));
}
