import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const base = process.env.VECTOR_COLLISION_EDITOR_BASE_URL || "http://127.0.0.1:5173";
const documentPath = process.env.VECTOR_COLLISION_DOCUMENT_PATH;
assert.ok(documentPath, "VECTOR_COLLISION_DOCUMENT_PATH must point to a disposable test file");
const backupDirectory = path.join(path.dirname(documentPath), ".backups");
const zoneFilePath = path.join(path.dirname(documentPath), "collision.zone-A.v1.json");
const zoneBackupDirectory = path.join(path.dirname(documentPath), ".backups", "zone-A");
const endpoint = base.replace(/\/$/, "") + "/__vector-collision-api/document";
const zoneEndpoint = base.replace(/\/$/, "") + "/__vector-collision-api/zones/A";
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

async function postZone(body, requestHeaders = headers) {
  return fetch(zoneEndpoint, {
    method: "POST",
    headers: requestHeaders,
    body,
  });
}

try {
  fs.rmSync(documentPath, { force: true });
  fs.rmSync(backupDirectory, { recursive: true, force: true });
  fs.rmSync(zoneFilePath, { force: true });
  fs.rmSync(zoneBackupDirectory, { recursive: true, force: true });

  const initialResponse = await fetch(endpoint, { cache: "no-store" });
  assert.equal(initialResponse.status, 200, "GET returns a scratch candidate document");
  const initial = await jsonResponse(initialResponse);
  assert.equal(initial.saved, false);
  assert.deepEqual(initial.document.shapes, []);

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

  // Each A–E zone has a separate versioned file and independent 20-backup rotation.
  const initialZoneResponse = await fetch(zoneEndpoint, { cache: "no-store" });
  assert.equal(initialZoneResponse.status, 200);
  const initialZone = await jsonResponse(initialZoneResponse);
  assert.equal(initialZone.saved, false);
  assert.deepEqual(initialZone.document.shapes, []);

  const mixedZone = structuredClone(validDocument);
  mixedZone.shapes[1].zone = "B";
  const mixedZoneResponse = await postZone(JSON.stringify(mixedZone));
  assert.equal(mixedZoneResponse.status, 400, "a zone file cannot contain shapes assigned to another zone");

  const firstZoneSave = await postZone(JSON.stringify(validDocument));
  assert.equal(firstZoneSave.status, 200, "a valid single-zone candidate can be saved");
  const firstZoneResult = await jsonResponse(firstZoneSave);
  assert.equal(firstZoneResult.shapeCount, 2);
  assert.equal(firstZoneResult.backupCount, 0);
  assert.match(firstZoneResult.contentHash, /^[a-f0-9]{64}$/);
  assert.ok(fs.existsSync(zoneFilePath), "zone save writes a separate candidate file");

  const modifiedZone = structuredClone(validDocument);
  modifiedZone.shapes[0].label = "Zone A revised wall";
  const secondZoneSave = await postZone(JSON.stringify(modifiedZone));
  assert.equal(secondZoneSave.status, 200);
  const secondZoneResult = await jsonResponse(secondZoneSave);
  assert.equal(secondZoneResult.backupCount, 1);
  assert.notEqual(secondZoneResult.contentHash, firstZoneResult.contentHash);

  for (let index = 0; index < 21; index++) {
    const rotating = structuredClone(modifiedZone);
    rotating.shapes[0].label = "Zone A rotation " + index;
    const response = await postZone(JSON.stringify(rotating));
    assert.equal(response.status, 200, "zone backup rotation " + index + " succeeds");
  }
  const zoneBackups = fs.readdirSync(zoneBackupDirectory).filter(name => name.startsWith("collision.zone-A.v1.") && name.endsWith(".json"));
  assert.equal(zoneBackups.length, 20, "each zone independently retains only its newest 20 versions");

  const zoneReloadResponse = await fetch(zoneEndpoint, { cache: "no-store" });
  assert.equal(zoneReloadResponse.status, 200);
  const zoneReload = await jsonResponse(zoneReloadResponse);
  assert.equal(zoneReload.saved, true);
  assert.equal(zoneReload.document.shapes[0].label, "Zone A rotation 20");
  assert.equal(reloaded.document.shapes[0].label, "Rotation 20",
    "saving a zone must never overwrite the full candidate file");
  console.log("VECTOR COLLISION EDITOR API TESTS PASSED: global and per-zone candidate versioning");
} finally {
  fs.rmSync(documentPath, { force: true });
  fs.rmSync(backupDirectory, { recursive: true, force: true });
  fs.rmSync(zoneFilePath, { force: true });
  fs.rmSync(zoneBackupDirectory, { recursive: true, force: true });
}
