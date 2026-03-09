/**
 * select-emitted-platforms.mjs
 *
 * Pure helper that determines which platforms have actual emitters.
 * Separates compatible platforms from those with distributable artefacts.
 */

/**
 * Select which platforms actually have emitters that can produce artefacts.
 * Returns only platforms with implemented emitters; compatible but unimplemented
 * platforms are excluded.
 *
 * @param {Object} platformSkills - map of platformId -> skill[]
 * @param {Object} emitterRegistry - map of platformId -> true/false
 * @returns {string[]} array of platform IDs with working emitters
 */
export function selectEmittedPlatforms(platformSkills, emitterRegistry) {
  const emitted = [];
  for (const platformId of Object.keys(platformSkills)) {
    if (emitterRegistry[platformId]) {
      emitted.push(platformId);
    }
  }
  return emitted;
}
