# Architectural Task Decomposition

Break down tasks with detailed dependency analysis and execution order optimization.

## Analysis Framework
1. **Identify interdependencies**: which subtasks must complete before others can start
2. **Determine parallelizability**: which subtasks can run in parallel
3. **Create critical path**: identify longest chain of dependent tasks
4. **Order execution**: topological sort minimizing wait time
5. **Flag blockers**: identify external dependencies, unknown risks

## Output Format
```json
{
  "task": "overall goal",
  "subtasks": [
    {
      "id": 1,
      "title": "subtask name",
      "acceptance_criteria": ["criterion 1", "criterion 2"],
      "dependencies": [0],
      "estimated_effort": "hours or points",
      "blockers": ["blocker if any"],
      "run_after": [dependency_ids]
    }
  ],
  "critical_path": [1, 3, 5],
  "parallelizable_groups": [[1, 2], [3, 4], [5]],
  "total_effort": "estimated total"
}
```
