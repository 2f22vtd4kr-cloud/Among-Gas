import {
  CollisionWorld,
  validateCollisionDocument,
  type CollisionDocument,
} from "./vectorCollision.js";
import { COLLISION_DOCUMENT } from "./generatedDocument.js";

/**
 * Canonical gameplay collision/vision world.
 *
 * build:collision bootstraps collision.v1.json from the current fine-grid
 * movement and vision sources only when no candidate exists. The vector
 * editor then saves to that same collision.v1.json file. Every build validates
 * the saved candidate and regenerates this module from it; editor saves also
 * refresh this module so client HMR sees the new geometry.
 */
let activeDocument: CollisionDocument = COLLISION_DOCUMENT;
let activeWorld = new CollisionWorld(
  activeDocument.shapes,
  activeDocument.mapW,
  activeDocument.mapH,
);

export const PRODUCTION_COLLISION_DOCUMENT = activeDocument;
export const PRODUCTION_COLLISION_WORLD = activeWorld;

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
}

// Retain these names for the editor's existing preview/test integrations.
export const GENERATED_COLLISION_PREVIEW_WORLD = PRODUCTION_COLLISION_WORLD;
export const GENERATED_COLLISION_PREVIEW_DOCUMENT = PRODUCTION_COLLISION_DOCUMENT;
