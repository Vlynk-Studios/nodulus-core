/**
 * Nodulus Integrated Tracking System (NITS) Constants
 */

/**
 * The standard threshold for similarity when the dynamic threshold is not used
 * or as the ceiling for the dynamic calculation.
 */
export const DEFAULT_SIMILARITY_THRESHOLD = 0.9;

/**
 * The absolute floor for similarity. Even with very few identifiers,
 * we don't want to match anything less than 50% similar.
 */
export const MINIMUM_SIMILARITY_THRESHOLD = 0.5;

/**
 * Current version of the NITS Registry Schema
 */
export const NITS_REGISTRY_VERSION = '1.0.0';
