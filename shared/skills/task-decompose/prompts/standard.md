# Standard Task Decomposition

Break down a high-level task into discrete, achievable subtasks with clear acceptance criteria.

## Decomposition Strategy
1. **Identify scope**: what's included and excluded
2. **Break into subtasks**: single-session work items (1-4 hours each)
3. **Define acceptance criteria**: testable, observable completion conditions
4. **List blockers**: what might prevent progress
5. **Note dependencies**: ordering constraints between subtasks

## Output Format
```json
{
  "task": "overall goal",
  "scope": "what is and isn't included",
  "constraints": "time, technical, resource constraints",
  "subtasks": [
    {
      "id": 1,
      "title": "subtask name",
      "description": "what to accomplish",
      "acceptance_criteria": [
        "criterion 1",
        "criterion 2"
      ],
      "blockers": ["blocker if any"],
      "dependencies": [0],
      "estimated_effort": "hours"
    }
  ]
}
```
