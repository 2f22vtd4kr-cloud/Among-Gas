import {
  CollisionWorld,
  validateCollisionDocument,
  type CollisionDocument,
} from "./vectorCollision.js";
import { COLLISION_DOCUMENT } from "./generatedDocument.js";

/**
 * Canonical gameplay collision/vision world traced from the owner's red-line reference.
 *
 * build:collision extracts the red-line centre paths from the owner's reference
 * image, validates the resulting vector document, and regenerates this module
 * before either client or server starts. The old raster remains available only
 * for legacy diagnostic overlays, never as movement authority.
 */
let activeDocument: CollisionDocument = COLLISION_DOCUMENT;
let activeWorld = new CollisionWorld(
  activeDocument.shapes,
  activeDocument.mapW,
  activeDocument.mapH,
);

export let PRODUCTION_COLLISION_DOCUMENT = activeDocument;
export let PRODUCTION_COLLISION_WORLD = activeWorld;

export function getProductionCollisionDocument(): CollisionDocument {
  return activeDocument;
}

export function getProductionCollisionWorld(): CollisionWorld {
  return activeWorld;
}

/** Hot-reload the server-side world after the editor saves a reviewed candidate. */
export function replaceProductionCollisionDocument(document: CollisionDocument): void {
  const errors = validateCollisionDocument(document);
  if (errors.length) {
    throw new Error("Refusing invalid production collision candidate: " + errors.join("; "));
  }
  activeDocument = document;
  activeWorld = new CollisionWorld(
    activeDocument.shapes,
    activeDocument.mapW,
    activeDocument.mapH,
  );
  // ESM imports are live bindings, but exported `const` aliases would retain
  // the initial world forever. Refresh every public alias with the new world.
  PRODUCTION_COLLISION_DOCUMENT = activeDocument;
  PRODUCTION_COLLISION_WORLD = activeWorld;
  GENERATED_COLLISION_PREVIEW_DOCUMENT = activeDocument;
  GENERATED_COLLISION_PREVIEW_WORLD = activeWorld;
}

// Retain these names for the editor's existing preview/test integrations.
export let GENERATED_COLLISION_PREVIEW_WORLD = PRODUCTION_COLLISION_WORLD;
export let GENERATED_COLLISION_PREVIEW_DOCUMENT = PRODUCTION_COLLISION_DOCUMENT;
