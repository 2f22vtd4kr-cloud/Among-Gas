import assert from "node:assert/strict";
import { getCooldownSweepProgress, getUseActionKind, isUseActionEnabled, type UseActionStateInput } from "./gameActionState";

const base: UseActionStateInput = {
  hasNearbyTask: false,
  isCrewmate: true,
  hasNearbyRepairPad: false,
  isImpostor: false,
  hasNearbyVent: false,
  isInVent: false,
  hasNearbyAdminTable: false,
  hasActiveTask: false,
  showAdminTable: false,
  showMiniMap: false,
};

assert.equal(getUseActionKind({ ...base, hasNearbyTask: true }), "task");
assert.equal(getUseActionKind({
  ...base, hasNearbyTask: true, hasNearbyRepairPad: true, hasNearbyAdminTable: true,
}), "task", "task interaction keeps priority over repair and admin");
assert.equal(getUseActionKind({
  ...base, isCrewmate: false, isImpostor: true,
  hasNearbyRepairPad: true, hasNearbyVent: true, hasNearbyAdminTable: true,
}), "repair", "repair keeps priority over vent and admin");
assert.equal(getUseActionKind({
  ...base, isCrewmate: false, isImpostor: true,
  hasNearbyVent: true, hasNearbyAdminTable: true,
}), "vent", "vent remains impostor-only and precedes admin");
assert.equal(getUseActionKind({
  ...base, isCrewmate: false, hasNearbyAdminTable: true,
}), "admin");
assert.equal(getUseActionKind(base), null);
assert.equal(getUseActionKind({
  ...base, isCrewmate: false, isImpostor: false, hasNearbyVent: true,
}), null, "crew must not receive a vent action");

const task = getUseActionKind({ ...base, hasNearbyTask: true });
assert.equal(isUseActionEnabled(task, base), true);
assert.equal(isUseActionEnabled(null, base), false);
assert.equal(isUseActionEnabled(task, { ...base, hasActiveTask: true }), false);
assert.equal(isUseActionEnabled(task, { ...base, isInVent: true }), false);
assert.equal(isUseActionEnabled(task, { ...base, showAdminTable: true }), false);
assert.equal(isUseActionEnabled(task, { ...base, showMiniMap: true }), false);
assert.equal(isUseActionEnabled("repair", base), true);

assert.equal(getCooldownSweepProgress(0, 30_000), 0, "ready Kill has no cooldown sweep");
assert.equal(getCooldownSweepProgress(15_000, 30_000), 0.5, "half cooldown leaves half the ring active");
assert.equal(getCooldownSweepProgress(30_000, 30_000), 1, "full cooldown fills the ring");
assert.equal(getCooldownSweepProgress(45_000, 30_000), 1, "over-range values clamp to a full ring");
assert.equal(getCooldownSweepProgress(-1, 30_000), 0, "negative remaining time clamps to empty");
assert.equal(getCooldownSweepProgress(1, 0), 0, "invalid maximum cannot create a non-finite sweep");
assert.equal(getCooldownSweepProgress(Number.NaN, 30_000), 0, "non-finite remaining time is rejected");

console.log("GAME ACTION STATE TESTS PASSED: action precedence, role gating and overlay/task disable rules");
