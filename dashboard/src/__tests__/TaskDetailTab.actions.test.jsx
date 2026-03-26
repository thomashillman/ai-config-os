import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import TaskDetailTab from "../tabs/TaskDetailTab"

function jsonResponse(payload, init = {}) {
  const { ok = true, status = ok ? 200 : 500 } = init
  return Promise.resolve({
    ok,
    status,
    json: () => Promise.resolve(payload),
  })
}

const BASE_TASK = {
  task_id: "task-123",
  short_code: "T-123",
  state: "active",
  goal: "Review task",
  initial_route: "local_repo",
  current_route: "local_repo",
  version: 3,
  findings: [
    {
      finding_id: "question-1",
      type: "question",
      summary: "Should we keep this?",
      description: "Should we keep this?",
      provenance: { status: "open" },
    },
  ],
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe("TaskDetailTab answer and dismiss actions", () => {
  it("refreshes the task after a successful answer save", async () => {
    const updatedTask = {
      ...BASE_TASK,
      version: 4,
      findings: [
        ...BASE_TASK.findings,
        {
          finding_id: "answer-1",
          type: "answer",
          summary: "Answer: Yes",
          description: "Question: Should we keep this?\nAnswer: Yes",
          provenance: { status: "verified" },
        },
      ],
    }

    const fetchMock = vi.spyOn(globalThis, "fetch")
    fetchMock
      .mockImplementationOnce(() => jsonResponse({ task: BASE_TASK }))
      .mockImplementationOnce(() => jsonResponse({ events: [] }))
      .mockImplementationOnce(() => jsonResponse({ task: updatedTask }))
      .mockImplementationOnce(() => jsonResponse({ task: updatedTask }))
      .mockImplementationOnce(() => jsonResponse({ events: [] }))

    render(<TaskDetailTab taskId={BASE_TASK.task_id} onBack={() => {}} />)

    expect((await screen.findAllByText("Should we keep this?")).length).toBeGreaterThan(0)

    fireEvent.click(screen.getAllByText("Answer")[0])
    fireEvent.change(screen.getByPlaceholderText("Your answer..."), {
      target: { value: "Yes" },
    })
    fireEvent.click(screen.getByText("Save answer"))

    await waitFor(() => expect(screen.queryByPlaceholderText("Your answer...")).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByText("v4")).toBeInTheDocument())
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(`/v1/tasks/${BASE_TASK.task_id}/questions/question-1/answer`),
      expect.objectContaining({ method: "POST" }),
    )
  })

  it("shows an inline error and keeps the modal open when answer save fails", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
    fetchMock
      .mockImplementationOnce(() => jsonResponse({ task: BASE_TASK }))
      .mockImplementationOnce(() => jsonResponse({ events: [] }))
      .mockImplementationOnce(() => jsonResponse({
        error: {
          code: "task_version_conflict",
          message: "Version conflict for task-123: expected 3, current 4",
        },
      }, { ok: false, status: 409 }))

    render(<TaskDetailTab taskId={BASE_TASK.task_id} onBack={() => {}} />)

    expect((await screen.findAllByText("Should we keep this?")).length).toBeGreaterThan(0)

    fireEvent.click(screen.getAllByText("Answer")[0])
    fireEvent.change(screen.getByPlaceholderText("Your answer..."), {
      target: { value: "Yes" },
    })
    fireEvent.click(screen.getByText("Save answer"))

    expect(await screen.findByRole("alert")).toHaveTextContent("Version conflict for task-123: expected 3, current 4")
    expect(screen.getByPlaceholderText("Your answer...")).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText("Save answer")).toBeEnabled())
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it("shows an inline error near the question when dismiss save fails", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch")
    fetchMock
      .mockImplementationOnce(() => jsonResponse({ task: BASE_TASK }))
      .mockImplementationOnce(() => jsonResponse({ events: [] }))
      .mockImplementationOnce(() => jsonResponse({
        error: {
          code: "task_version_conflict",
          message: "Version conflict for task-123: expected 3, current 4",
        },
      }, { ok: false, status: 409 }))

    render(<TaskDetailTab taskId={BASE_TASK.task_id} onBack={() => {}} />)

    expect((await screen.findAllByText("Should we keep this?")).length).toBeGreaterThan(0)

    fireEvent.click(screen.getAllByText("Dismiss")[0])

    expect(await screen.findByRole("alert")).toHaveTextContent("Version conflict for task-123: expected 3, current 4")
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(fetchMock.mock.calls[2][0]).toContain(`/v1/tasks/${BASE_TASK.task_id}/questions/question-1/dismiss`)
  })
})
