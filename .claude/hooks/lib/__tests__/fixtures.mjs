/**
 * Test Fixtures
 *
 * Sample hook events for testing. These represent real events sent by Claude Code.
 */

export const preToolUseFixtures = {
  // Skill invocation
  skillInvocation: {
    type: "PreToolUse",
    tool_name: "Skill",
    tool_input: {
      skill: "debug",
      args: "--verbose",
    },
    session_id: "test-session-123",
    timestamp: "2026-03-30T10:00:00Z",
  },

  // Write to protected path (should be blocked by guard rule)
  writeToProtectedPath: {
    type: "PreToolUse",
    tool_name: "Write",
    file_path:
      "/home/user/project/plugins/core-skills/skills/my-skill/SKILL.md",
    tool_input: {
      skill: "my-skill",
    },
    session_id: "test-session-123",
    timestamp: "2026-03-30T10:00:01Z",
  },

  // Write to shared/skills (should be allowed)
  writeToSharedSkills: {
    type: "PreToolUse",
    tool_name: "Write",
    file_path: "/home/user/project/shared/skills/my-skill/SKILL.md",
    tool_input: {
      skill: "my-skill",
    },
    session_id: "test-session-123",
    timestamp: "2026-03-30T10:00:02Z",
  },

  // Edit to plugins (should be blocked)
  editToPlugins: {
    type: "PreToolUse",
    tool_name: "Edit",
    file_path:
      "/home/user/project/plugins/core-skills/skills/test-skill/index.js",
    session_id: "test-session-123",
    timestamp: "2026-03-30T10:00:03Z",
  },

  // Read (should always be allowed)
  read: {
    type: "PreToolUse",
    tool_name: "Read",
    file_path: "/home/user/project/plugins/core-skills/skills/test/index.js",
    session_id: "test-session-123",
    timestamp: "2026-03-30T10:00:04Z",
  },
};

export const postToolUseFixtures = {
  // Bash success
  bashSuccess: {
    type: "PostToolUse",
    tool_name: "Bash",
    file_path: "/home/user/project/test.sh",
    tool_response: {
      is_error: false,
      content: [{ text: "Command succeeded" }],
    },
    session_id: "test-session-123",
    timestamp: "2026-03-30T10:00:05Z",
  },

  // Bash error
  bashError: {
    type: "PostToolUse",
    tool_name: "Bash",
    file_path: "/home/user/project/test.sh",
    tool_response: {
      is_error: true,
      content: [{ text: "Command failed with exit code 1" }],
    },
    session_id: "test-session-123",
    timestamp: "2026-03-30T10:00:06Z",
  },

  // Edit to shared/skills (should trigger reminder)
  editToSharedSkills: {
    type: "PostToolUse",
    tool_name: "Edit",
    file_path: "/home/user/project/shared/skills/my-skill/SKILL.md",
    tool_response: {
      is_error: false,
      content: [{ text: "File edited" }],
    },
    session_id: "test-session-123",
    timestamp: "2026-03-30T10:00:07Z",
  },

  // Write to ops (should trigger reminder)
  writeToOps: {
    type: "PostToolUse",
    tool_name: "Write",
    file_path: "/home/user/project/ops/my-script.sh",
    tool_response: {
      is_error: false,
      content: [{ text: "File written" }],
    },
    session_id: "test-session-123",
    timestamp: "2026-03-30T10:00:08Z",
  },
};

export const sessionStartFixtures = {
  // Normal session start
  normal: {
    type: "SessionStart",
    session_id: "session-abc-123-def",
    project_dir: "/home/user/project",
    home_dir: "/home/user",
    timestamp: "2026-03-30T10:00:00Z",
  },
};

/**
 * Malformed fixtures for error testing
 */
export const malformedFixtures = {
  // Missing type
  missingType: {
    tool_name: "Write",
    session_id: "test-session",
    timestamp: "2026-03-30T10:00:00Z",
  },

  // Invalid type
  invalidType: {
    type: "InvalidType",
    tool_name: "Write",
    session_id: "test-session",
    timestamp: "2026-03-30T10:00:00Z",
  },

  // Bad timestamp
  badTimestamp: {
    type: "PreToolUse",
    tool_name: "Write",
    session_id: "test-session",
    timestamp: "2026-03-30 10:00:00", // Not ISO 8601
  },

  // Missing session_id
  missingSessionId: {
    type: "PreToolUse",
    tool_name: "Write",
    timestamp: "2026-03-30T10:00:00Z",
  },

  // Not an object
  notObject: "not an object",
};
