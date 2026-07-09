---
name: iOS Safari ctx.filter shadow fix
description: How to draw a blurred canvas shadow without leaking blur into subsequent drawImage on iOS Safari
---

## Rule
Use `ctx.filter = 'blur(Xpx)'` for the drop shadow, but immediately after `ctx.restore()` write `ctx.filter = 'none'` explicitly. iOS Safari's restore() does not reliably reset ctx.filter, causing blur to leak into the next drawImage call.

**Why:** Without blur, semi-transparent dark shapes over a tiled background amplify tile/grout contrast → horizontal stripe artefacts in the shadow. Without the explicit reset after restore(), the blur leaks into the sprite drawImage → semi-transparent sprite edges → tile grout bleeds through the body.

**How to apply:** Always use this pattern in the game render loop around any shadow:
```js
ctx.save();
ctx.filter = `blur(${blurPx}px)`;
// draw shadow shape
ctx.restore();
ctx.filter = 'none'; // explicit iOS Safari guard — must be outside restore()
// draw sprite (no filter)
```

**What NOT to do:**
- Don't replace blur with a radial-gradient ellipse — looks similar but semi-transparency still amplifies tile/grout contrast → stripe artefacts.
- Don't rely on ctx.restore() alone to clear ctx.filter on WebKit.
