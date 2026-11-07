import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const base = process.env.VECTOR_COLLISION_EDITOR_BASE_URL || "http://127.0.0.1:5173";
const documentPath = process.env.VECTOR_COLLISION_DOCUMENT_PATH;
const seedPath = process.env.VECTOR_COLLISION_EDITOR_SEED_PATH;
assert.ok(documentPath, "VECTOR_COLLISION_DOCUMENT_PATH must point to a disposable test file");
assert.ok(seedPath, "VECTOR_COLLISION_EDITOR_SEED_PATH must point to a disposable seed fixture");
const backupDirectory = path.join(path.dirname(documentPath), ".backups");
const endpoint = base.replace(/\/$/, "") + "/__vector-collision-api/document";
const origin = new URL(base).origin;
const headers = {
  "Content-Type": "application/json",
  "Origin": origin,
  "X-Vector-Collision-Editor": "1",
};

const validDocument = {
  version: 1,
  mapW: 3224,
  mapH: 1858,
  shapes: [
    {
      id: "api-test-wall",
      points: [[100, 100], [500, 100]],
      closed: false,
      blocksMove: true,
      blocksSight: true,
      label: "API test wall",
      zone: "A",
    },
    {
      id: "api-test-bench",
      points: [[600, 100], [680, 100], [680, 160], [600, 160]],
      closed: true,
      blocksMove: true,
      blocksSight: false,
      label: "Low bench",
      zone: "A",
    },
  ],
};

function jsonResponse(response) {
  return response.json().catch(() => ({}));
}

async function post(body, requestHeaders = headers) {
  return fetch(endpoint, {
    method: "POST",
    headers: requestHeaders,
    body,
  });
}

try {
  fs.rmSync(documentPath, { force: true });
  fs.rmSync(seedPath, { force: true });
  fs.rmSync(backupDirectory, { recursive: true, force: true });

  const initialResponse = await fetch(endpoint + "?scratch=1", { cache: "no-store" });
  assert.equal(initialResponse.status, 200, "GET returns a scratch candidate document");
  const initial = await jsonResponse(initialResponse);
  assert.equal(initial.saved, false);
  assert.deepEqual(initial.document.shapes, []);

  fs.writeFileSync(seedPath, JSON.stringify(validDocument));
  const seedResponse = await fetch(endpoint, { cache: "no-store" });
  assert.equal(seedResponse.status, 200);
  const seedResult = await jsonResponse(seedResponse);
  assert.equal(seedResult.saved, false, "the production seed is not misreported as a saved candidate");
  assert.equal(seedResult.seeded, true, "the editor can load the production vector seed for review");
  assert.equal(seedResult.document.shapes.length, 2);
  const scratchAfterSeed = await fetch(endpoint + "?scratch=1", { cache: "no-store" });
  assert.deepEqual((await jsonResponse(scratchAfterSeed)).document.shapes, [],
    "scratch mode remains isolated from the production seed");

  const missingHeader = await post(JSON.stringify(validDocument), {
    "Content-Type": "application/json",
    "Origin": origin,
  });
  assert.equal(missingHeader.status, 403, "custom editor header is required");

  const crossOrigin = await post(JSON.stringify(validDocument), {
    ...headers,
    "Origin": "https://attacker.example",
  });
  assert.equal(crossOrigin.status, 403, "cross-origin writes are rejected");

  const missingOrigin = await post(JSON.stringify(validDocument), {
    "Content-Type": "application/json",
    "X-Vector-Collision-Editor": "1",
  });
  assert.equal(missingOrigin.status, 403, "requests without a browser origin are rejected");

  const wrongType = await post(JSON.stringify(validDocument), {
    "Origin": origin,
    "X-Vector-Collision-Editor": "1",
    "Content-Type": "text/plain",
  });
  assert.equal(wrongType.status, 415, "JSON content type is mandatory");

  const oversized = await post("{" + " ".repeat(513_000) + "}", headers);
  assert.equal(oversized.status, 413, "oversized bodies are rejected before parsing");

  const empty = await post(JSON.stringify({ ...validDocument, shapes: [] }), headers);
  assert.equal(empty.status, 400, "empty maps cannot be saved as authored geometry");

  const invalidPolygon = {
    ...validDocument,
    shapes: [{
      id: "self-crossing",
      points: [[0, 0], [100, 100], [0, 100], [100, 0]],
      closed: true,
      blocksMove: true,
      blocksSight: true,
    }],
  };
  const invalid = await post(JSON.stringify(invalidPolygon), headers);
  assert.equal(invalid.status, 400, "self-intersecting contours are rejected");

  const firstSave = await post(JSON.stringify(validDocument), headers);
  assert.equal(firstSave.status, 200, "a valid candidate can be saved");
  const firstResult = await jsonResponse(firstSave);
  assert.equal(firstResult.shapeCount, 2);
  assert.match(firstResult.contentHash, /^[a-f0-9]{64}$/, "save returns a SHA-256 content hash");
  assert.equal(firstResult.backupCount, 0);
  assert.ok(fs.existsSync(documentPath), "save writes the configured candidate file");

  const modified = structuredClone(validDocument);
  modified.shapes[0].label = "Updated wall label";
  const secondSave = await post(JSON.stringify(modified), headers);
  assert.equal(secondSave.status, 200, "a second candidate save succeeds");
  const secondResult = await jsonResponse(secondSave);
  assert.match(secondResult.contentHash, /^[a-f0-9]{64}$/);
  assert.notEqual(secondResult.contentHash, firstResult.contentHash, "content hash changes with the saved document");
  assert.equal(secondResult.backupCount, 1);
  let backupFiles = fs.readdirSync(backupDirectory).filter(name => name.endsWith(".json"));
  assert.equal(backupFiles.length, 1, "the previous candidate is preserved in the backup directory");
  const backup = JSON.parse(fs.readFileSync(path.join(backupDirectory, backupFiles[0]), "utf8"));
  assert.equal(backup.shapes[0].label, "API test wall", "backup contains the prior saved version");

  // Zone-scoped saves replace only that zone and preserve all other authored regions.
  const withZoneB = structuredClone(modified);
  withZoneB.shapes.push({
    id: "api-test-zone-b",
    points: [[900, 100], [1000, 100]],
    closed: false,
    blocksMove: true,
    blocksSight: false,
    castsShadow: false,
    label: "Zone B boundary",
    zone: "B",
  });
  const addZoneB = await post(JSON.stringify(withZoneB), headers);
  assert.equal(addZoneB.status, 200);
  const wrongZonePayload = await fetch(endpoint + "?zone=A", {
    method: "POST", headers, body: JSON.stringify(withZoneB),
  });
  assert.equal(wrongZonePayload.status, 400, "zone save rejects shapes assigned to another zone");
  const zoneAUpdate = structuredClone(withZoneB);
  zoneAUpdate.shapes = zoneAUpdate.shapes.filter(shape => shape.zone === "A");
  zoneAUpdate.shapes[0].label = "Zone A saved independently";
  const zoneSave = await fetch(endpoint + "?zone=A", {
    method: "POST", headers, body: JSON.stringify(zoneAUpdate),
  });
  assert.equal(zoneSave.status, 200, "a valid per-zone candidate save succeeds");
  const zoneResult = await jsonResponse(zoneSave);
  assert.equal(zoneResult.savedZone, "A");
  assert.equal(zoneResult.shapeCount, 3, "zone save merges with the previously saved zones");
  const zoneReloadResponse = await fetch(endpoint, { cache: "no-store" });
  const zoneReload = await jsonResponse(zoneReloadResponse);
  assert.equal(zoneReload.document.shapes.find(shape => shape.id === "api-test-zone-b").label, "Zone B boundary",
    "saving zone A must preserve zone B unchanged");
  assert.equal(zoneReload.document.shapes.find(shape => shape.id === "api-test-wall").label, "Zone A saved independently",
    "saving zone A must replace that zone's prior geometry");

  // Exercise retention: only the newest 20 timestamped versions may remain.
  for (let index = 0; index < 21; index++) {
    const rotating = structuredClone(modified);
    rotating.shapes[0].label = "Rotation " + index;
    const response = await post(JSON.stringify(rotating), headers);
    assert.equal(response.status, 200, "rotating backup save " + index + " succeeds");
  }
  backupFiles = fs.readdirSync(backupDirectory).filter(name => name.endsWith(".json"));
  assert.equal(backupFiles.length, 20, "only the newest 20 backups are retained");

  const reloadedResponse = await fetch(endpoint, { cache: "no-store" });
  const reloaded = await jsonResponse(reloadedResponse);
  assert.equal(reloaded.saved, true);
  assert.equal(reloaded.document.shapes[0].label, "Rotation 20");
  console.log("VECTOR COLLISION EDITOR API TESTS PASSED");
} finally {
  fs.rmSync(documentPath, { force: true });
  fs.rmSync(seedPath, { force: true });
  fs.rmSync(backupDirectory, { recursive: true, force: true });
}
