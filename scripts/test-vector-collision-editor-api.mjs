import assert from "node:assert/strict";
import fs from "node:fs";

const base = process.env.VECTOR_COLLISION_EDITOR_BASE_URL || "http://127.0.0.1:5173";
const documentPath = process.env.VECTOR_COLLISION_DOCUMENT_PATH;
assert.ok(documentPath, "VECTOR_COLLISION_DOCUMENT_PATH must point to a disposable test file");
const backupPath = documentPath + ".bak";
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
  fs.rmSync(backupPath, { force: true });

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
  assert.equal((await jsonResponse(firstSave)).shapeCount, 2);
  assert.ok(fs.existsSync(documentPath), "save writes the configured candidate file");

  const modified = structuredClone(validDocument);
  modified.shapes[0].label = "Updated wall label";
  const secondSave = await post(JSON.stringify(modified), headers);
  assert.equal(secondSave.status, 200, "a second candidate save succeeds");
  assert.ok(fs.existsSync(backupPath), "the previous candidate is preserved as a backup");
  const backup = JSON.parse(fs.readFileSync(backupPath, "utf8"));
  assert.equal(backup.shapes[0].label, "API test wall", "backup contains the prior saved version");

  const reloadedResponse = await fetch(endpoint, { cache: "no-store" });
  const reloaded = await jsonResponse(reloadedResponse);
  assert.equal(reloaded.saved, true);
  assert.equal(reloaded.document.shapes[0].label, "Updated wall label");
  console.log("VECTOR COLLISION EDITOR API TESTS PASSED");
} finally {
  fs.rmSync(documentPath, { force: true });
  fs.rmSync(backupPath, { force: true });
}
