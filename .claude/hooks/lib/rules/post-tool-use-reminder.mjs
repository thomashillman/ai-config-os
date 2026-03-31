/**
 * Rule: Post-Tool-Use Reminder
 *
 * Reminds user to run ops/check-docs.sh when skills or ops scripts are modified.
 *
 * Triggers on: PostToolUse events
 *
 * Output: Prints reminder to stdout if file_path matches patterns
 */

export const rule = {
  name: "post-tool-use-reminder",
  triggers: ["PostToolUse"],

  async execute(event) {
    const { file_path } = event;

    if (!file_path) {
      return { decision: "allow" };
    }

    // Check if file is in shared/skills/ or ops/
    const isSkillPath = file_path.includes("/shared/skills/");
    const isOpsPath = file_path.includes("/ops/");

    if (isSkillPath || isOpsPath) {
      // Print reminder to stdout
      console.log("");
      console.log(
        "📝 Living docs reminder: Run ops/check-docs.sh to verify manifest.md, README.md, CLAUDE.md are in sync.",
      );
    }

    return { decision: "allow" };
  },
};
