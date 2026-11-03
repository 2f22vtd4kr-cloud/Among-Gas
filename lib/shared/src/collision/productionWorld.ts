import { CollisionWorld } from './vectorCollision.js';
import { COLLISION_DOCUMENT } from './generatedDocument.js';

/**
 * Legacy module path retained for the vector-editor preview only.
 * The document is auto-derived from raster collision/vision sources and is
 * NOT the production gameplay world. Do not import it from client/server
 * runtime code until every map zone is author-traced, independently reviewed,
 * and passes full-footprint route plus client/server parity gates.
 */
export const GENERATED_COLLISION_PREVIEW_WORLD = new CollisionWorld(
  COLLISION_DOCUMENT.shapes,
  COLLISION_DOCUMENT.mapW,
  COLLISION_DOCUMENT.mapH,
);

export const GENERATED_COLLISION_PREVIEW_DOCUMENT = COLLISION_DOCUMENT;
