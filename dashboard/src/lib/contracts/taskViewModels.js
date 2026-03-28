import { routeLabel, stateLabel } from "../taskFormatters"
import { timeAgo, formatDate } from "../dateFormatters"
import { summarizeTaskFindings } from "../taskFindingSummary"

const ROUTE_BADGE = {
  local_repo: { label: "Full mode", tone: "success" },
  github_pr: { label: "Cloud mode (PR)", tone: "info" },
  pasted_diff: { label: "Cloud mode (diff)", tone: "muted" },
}

const PROVENANCE_GROUPS = {
  verified: { icon: "✓", label: "Confirmed here", cls: "text-green-400" },
  reused: { icon: "↻", label: "Flagged in prior session, will verify", cls: "text-yellow-400" },
  hypothesis: { icon: "·", label: "Noticed — needs checking", cls: "text-gray-400" },
  invalidated: { icon: "✗", label: "Not an issue", cls: "text-gray-600" },
}

function deriveAttentionFlags(task, findingSummary) {
  const flags = []
  if (findingSummary.openCount > 0) {
    flags.push({ kind: "verification", label: `${findingSummary.openCount} to verify`, tone: "warning" })
  }
  if (findingSummary.questionCount > 0) {
    flags.push({ kind: "question", label: `${findingSummary.questionCount} open question${findingSummary.questionCount === 1 ? "" : "s"}`, tone: "muted" })
  }
  if (task.state === "active" && task.current_route !== "local_repo" && findingSummary.openCount > 0) {
    flags.push({ kind: "route", label: "Waiting for full-access session", tone: "muted" })
  }
  return flags
}

function deriveNextActions(task, findingSummary) {
  const actions = []
  if (task.state === "active") {
    actions.push({ id: "continue", label: "Continue here →", style: "primary" })
  }
  if (findingSummary.questionCount > 0) {
    actions.push({ id: "answer-question", label: "Answer open questions", style: "secondary" })
  }
  if (task.state === "complete" || task.state === "paused") {
    actions.push({ id: "view", label: "View →", style: "ghost" })
  }
  return actions
}

function taskStatusSummary(task, findingSummary) {
  const { openCount, questionCount, verifiedCount } = findingSummary

  if (task.state === "complete") {
    return { text: `${verifiedCount} verified · done`, cls: "text-gray-500" }
  }
  if (openCount > 0 && questionCount > 0) {
    return { text: `${openCount} to check · ${questionCount} question${questionCount !== 1 ? "s" : ""}`, cls: "text-yellow-400" }
  }
  if (openCount > 0) {
    return { text: `${openCount} thing${openCount !== 1 ? "s" : ""} to check`, cls: "text-yellow-400" }
  }
  if (questionCount > 0) {
    return { text: `${questionCount} open question${questionCount !== 1 ? "s" : ""}`, cls: "text-gray-400" }
  }
  if (task.state === "active") {
    return { text: "In progress", cls: "text-green-400" }
  }
  return { text: task.state, cls: "text-gray-500" }
}

function eventNarrative(event, index, allEvents) {
  switch (event.type) {
    case "state_change":
      if (index === 0 || !allEvents.slice(0, index).some(x => x.type === "state_change")) return "Started this review"
      if (event.metadata?.next_state === "complete") return "Marked complete"
      if (event.metadata?.next_state === "paused") return "Paused"
      return "Resumed"
    case "finding_recorded":
      return "Finding recorded"
    case "route_selected":
      if (event.metadata?.route_id === "local_repo") return "Switched to Full mode — full codebase access"
      if (event.metadata?.route_id === "github_pr") return "Switched to Cloud mode (PR)"
      return "Switched to Cloud mode"
    case "continuation_created":
      return "Handoff saved"
    case "finding_transitioned": {
      const count = event.metadata?.reclassified_count || 0
      const route = event.metadata?.route_id === "local_repo" ? "Full mode" : "new route"
      return `${count} finding${count !== 1 ? "s" : ""} re-evaluated for ${route}`
    }
    default:
      return null
  }
}

export function mapTaskToHubCardModel(task) {
  const findingSummary = summarizeTaskFindings(task.findings)
  const title = task.goal || task.name || task.task_type || task.task_id
  const route = routeLabel(task.current_route)

  return {
    task,
    title,
    isDone: task.state === "complete",
    conciseSummaryLine: taskStatusSummary(task, findingSummary),
    attentionFlags: deriveAttentionFlags(task, findingSummary),
    nextActions: deriveNextActions(task, findingSummary),
    metaLine: {
      route,
      shortCode: task.short_code,
      updatedAgo: timeAgo(task.updated_at),
    },
    localityCapabilityBadge: ROUTE_BADGE[task.current_route] || { label: route, tone: "muted" },
  }
}

export function mapTaskToDetailModel(task, events) {
  const findings = task?.findings || []
  const summary = summarizeTaskFindings(findings)
  const significantEvents = (events || [])
    .map((event, index, list) => ({ ...event, label: eventNarrative(event, index, list) }))
    .filter(event => event.label)

  const provenanceGroups = summary.provenanceGroups.map(group => ({
    ...PROVENANCE_GROUPS[group.status],
    status: group.status,
    items: group.items,
  }))

  return {
    title: task?.goal || task?.name || task?.task_type,
    originLabel: `${routeLabel(task?.initial_route || task?.current_route)} session`,
    stateBadge: stateLabel(task?.state),
    conciseSummaryLine: `${summary.openCount} to verify · ${summary.questionCount} open`,
    attentionFlags: deriveAttentionFlags(task || {}, summary),
    nextActions: deriveNextActions(task || {}, summary),
    localityCapabilityBadge: ROUTE_BADGE[task?.current_route] || { label: routeLabel(task?.current_route), tone: "muted" },
    findings,
    openQuestions: summary.openQuestions,
    openFindings: summary.openFindings,
    provenanceGroups,
    significantEvents: significantEvents.map(event => ({
      ...event,
      createdAtLabel: formatDate(event.created_at),
    })),
  }
}

function sessionOriginLabel(route) {
  if (route === "local_repo") return "Full mode session"
  if (route === "github_pr") return "Cloud mode session (PR)"
  return "Cloud mode session"
}

function upgradeCapabilityLine(initialRoute, currentRoute) {
  if (initialRoute !== "local_repo" && currentRoute === "local_repo") {
    return "Here I can trace the full call graph and check git history."
  }
  if (initialRoute === "pasted_diff" && currentRoute === "github_pr") {
    return "Here I can fetch the full PR context."
  }
  return null
}

export function mapTaskToResumeModel(task) {
  const findingSummary = summarizeTaskFindings(task.findings)
  const phrase = `resume ${task.goal || task.name || task.task_type || task.task_id}`
  const originRoute = task.initial_route || task.current_route

  return {
    phrase,
    title: task.goal || task.name || task.task_type,
    originLabel: sessionOriginLabel(originRoute),
    conciseSummaryLine: `${findingSummary.openCount} findings · ${findingSummary.questionCount} questions`,
    attentionFlags: deriveAttentionFlags(task, findingSummary),
    nextActions: deriveNextActions(task, findingSummary),
    localityCapabilityBadge: ROUTE_BADGE[originRoute] || { label: routeLabel(originRoute), tone: "muted" },
    openFindings: findingSummary.openFindings,
    openQuestions: findingSummary.openQuestions,
    upgradeLine: upgradeCapabilityLine(originRoute, task.current_route),
  }
}
