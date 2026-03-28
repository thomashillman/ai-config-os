const CHECKMARK = "\u2713"
const HEAVY_CHECKMARK = "\u2714"

function hasVariant(value) {
  const normalised = String(value || "").trim().toLowerCase()
  return normalised === CHECKMARK || normalised === HEAVY_CHECKMARK || normalised === "true" || normalised === "yes"
}

export function mapSkillsContract(payload) {
  const source = Array.isArray(payload?.skills)
    ? payload.skills
    : Array.isArray(payload?.effectiveOutcomeContract?.skills)
      ? payload.effectiveOutcomeContract.skills
      : []

  return source.map((row) => ({
    name: row.name || "",
    type: row.type || "",
    status: row.status || "",
    opus: Boolean(row.opus ?? hasVariant(row.opus_supported)),
    sonnet: Boolean(row.sonnet ?? hasVariant(row.sonnet_supported)),
    haiku: Boolean(row.haiku ?? hasVariant(row.haiku_supported)),
    tests: String(row.tests ?? row.tests_count ?? "0"),
  })).filter((row) => row.name)
}
