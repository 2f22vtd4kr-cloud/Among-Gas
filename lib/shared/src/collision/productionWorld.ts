import { CollisionWorld } from './vectorCollision.js';
import { COLLISION_DOCUMENT } from './generatedDocument.js';

/** Single authoritative vector world used by client prediction, server authority, bots and vision. */
export const PRODUCTION_COLLISION_WORLD = new CollisionWorld(
  COLLISION_DOCUMENT.shapes,
  COLLISION_DOCUMENT.mapW,
  COLLISION_DOCUMENT.mapH,
);

export const PRODUCTION_COLLISION_DOCUMENT = COLLISION_DOCUMENT;
