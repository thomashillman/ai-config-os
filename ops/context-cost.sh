#!/usr/bin/env bash
# Analyze token footprint of skills and plugin
# Estimates context cost for each skill based on word count

set -uo pipefail

REPO_ROOT="$(git rev-parse --show-toplevel)"
SHARED_SKILLS="${REPO_ROOT}/shared/skills"

# Parse options
THRESHOLD=2000  # Default token threshold warning
VERBOSE=false

while [ $# -gt 0 ]; do
  case "$1" in
    --threshold)
      THRESHOLD="$2"
      shift 2
      ;;
    --verbose)
      VERBOSE=true
      shift
      ;;
    *)
      echo "[error] Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "[info] Analyzing context cost for all skills..."
echo ""

# Function to count words in a file
count_words() {
  wc -w < "$1" 2>/dev/null || echo 0
}

# Function to estimate tokens from word count (~1.3 words per token)
estimate_tokens() {
  local words=$1
  echo $(( (words * 100) / 130 ))
}

# Header
printf "%-25s %10s %15s %15s\n" "SKILL" "WORDS" "TOKENS" "% OF TOTAL"
echo "-------------------------------------------------------------------"

total_tokens=0
declare -a skill_tokens
declare -a skill_names

# Scan skills
for skill_dir in "$SHARED_SKILLS"/*; do
  if [ ! -d "$skill_dir" ]; then
    continue
  fi

  skill_name=$(basename "$skill_dir")
  if [ "$skill_name" = "_template" ]; then
    continue
  fi

  # Count words in SKILL.md
  skill_md="${skill_dir}/SKILL.md"
  skill_words=0
  if [ -f "$skill_md" ]; then
    skill_words=$(count_words "$skill_md")
  fi

  # Count words in all prompt files
  if [ -d "${skill_dir}/prompts" ]; then
    for prompt_file in "${skill_dir}"/prompts/*.md; do
      if [ -f "$prompt_file" ]; then
        prompt_words=$(count_words "$prompt_file")
        skill_words=$((skill_words + prompt_words))
      fi
    done
  fi

  # Estimate tokens
  skill_token_count=$(estimate_tokens "$skill_words")
  total_tokens=$((total_tokens + skill_token_count))

  # Store for sorting
  skill_names+=("$skill_name")
  skill_tokens+=("$skill_token_count:$skill_words")

  if [ "$VERBOSE" = true ]; then
    echo "[debug] $skill_name: $skill_words words = $skill_token_count tokens"
  fi
done

echo ""

# Display skills with token counts
for i in "${!skill_names[@]}"; do
  skill_name="${skill_names[$i]}"
  skill_data="${skill_tokens[$i]}"
  token_count="${skill_data%:*}"
  word_count="${skill_data#*:}"

  if [ "$total_tokens" -gt 0 ]; then
    percentage=$(( (token_count * 100) / total_tokens ))
  else
    percentage=0
  fi

  printf "%-25s %10d %15d %14d%%\n" "$skill_name" "$word_count" "$token_count" "$percentage"

  # Warn if skill exceeds threshold
  if [ "$token_count" -gt "$THRESHOLD" ]; then
    echo "  ⚠️  Warning: $skill_name exceeds threshold ($token_count > $THRESHOLD tokens)"
  fi
done

echo "-------------------------------------------------------------------"
printf "%-25s %10s %15d\n" "TOTAL (all skills)" "" "$total_tokens"
echo ""

# Summary and recommendations
echo "==> Summary"
echo "   Total tokens: $total_tokens"
echo "   Threshold:    $THRESHOLD tokens/skill"
echo "   Skills over threshold: $(for i in "${!skill_names[@]}"; do [ "${skill_tokens[$i]%:*}" -gt "$THRESHOLD" ] && echo "${skill_names[$i]}"; done | wc -l)"
echo ""

if [ "$total_tokens" -gt 5000 ]; then
  echo "   ⚠️  Plugin context cost is significant (>${total_tokens} tokens)."
  echo "      Consider Phase 5: splitting into domain-specific plugins."
else
  echo "   ✓ Plugin context cost is reasonable."
fi

if [ "$total_tokens" -gt 10000 ]; then
  echo "   ⚠️  CRITICAL: Plugin is too large. Split into smaller plugins immediately."
fi

echo ""
echo "[ok] Context cost analysis complete"

exit 0
