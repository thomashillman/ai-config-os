/**
 * Rule: Pre-Tool-Use Guard
 *
 * Blocks direct edits to plugins/core-skills/skills/.
 * Enforces authoring skills in shared/skills/, with symlinks handled automatically.
 *
 * Triggers on: PreToolUse events for Write, Edit, NotebookEdit tools
 *
 * Decision: 'block' if target is plugins/core-skills/skills/ with edit tool
 */

export const rule = {
  name: "pre-tool-use-guard",
  triggers: ["PreToolUse"],

  async execute(event) {
    const { file_path, tool_name } = event;

    // Only guard edit tools
    const isEditTool = ["Write", "Edit", "NotebookEdit"].includes(tool_name);
    if (!isEditTool) {
      return { decision: "allow" };
    }

    // Check if target is in protected plugins path
    const isProtectedPath =
      file_path && file_path.includes("/plugins/core-skills/skills/");
    if (!isProtectedPath) {
      return { decision: "allow" };
    }

    // Block the edit
    return {
      decision: "block",
      reason:
        "Author skills in shared/skills/ not plugins/ directly. Symlinks handle plugin wiring automatically.",
    };
  },
};
