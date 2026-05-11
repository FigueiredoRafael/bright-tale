# bright-tale — Pipeline Domain

The content pipeline runs a fixed sequence of **Stages** for each **Project**: Brainstorm → Research → Draft → Review → Assets → Preview → Publish. Execution of each Stage is orchestrated server-side regardless of whether the user is on autopilot or driving manually.

## Language

**Project**:
A single content workflow from idea to publish, scoped to a Channel. Identified by `projects.id`.
_Avoid_: Job, run, workflow

**Stage**:
A named step in the pipeline: `brainstorm`, `research`, `draft`, `review`, `assets`, `preview`, `publish`. Stages have a fixed order but some can be skipped via config.
_Avoid_: Step, phase, engine (engine = UI, see below)

**Pipeline Orchestrator**:
The server-side module that decides when a Stage Run starts. The single authority over the lifecycle of all Stage Runs for a Project. Lives in Inngest functions.
_Avoid_: Pipeline manager, workflow engine

**Stage Run**:
A server-orchestrated execution of one Stage attempt for one Project. Always created and driven by the server, even when the user clicks "Run" manually. Each retry produces a new Stage Run. Thin orchestration record (status, timing, error); the per-stage payload (cards, drafts, briefs) stays in its existing table and is linked by opaque **Payload Ref**.
_Avoid_: Session (overloaded), job (Inngest-specific)

**Payload Ref**:
An opaque pointer from a Stage Run to its per-stage payload record, shaped `{ kind, id }` (e.g. `{ kind: 'research_session', id: '...' }`). The Pipeline Orchestrator never inspects the payload — only the Engine resolves it when needed.
_Avoid_: payload_id, session_id (too specific)

**Stage Run Status**:
The state of a Stage Run. One of: `queued`, `running`, `awaiting_user`, `completed`, `failed`, `aborted`, `skipped`. Terminal states (`completed`, `failed`, `aborted`, `skipped`) never transition; a retry creates a new Stage Run.

**Awaiting Reason**:
When **Stage Run Status** is `awaiting_user`, the reason it paused. One of: `manual_paste` (user must paste LLM output for a manual-provider stage) or `manual_advance` (stage completed but Mode requires explicit user click to proceed).

**Mode**:
How the Pipeline Orchestrator decides to advance. One of: `autopilot` (advances automatically on Stage Run completion) or `manual` (waits for explicit user trigger between Stage Runs). Stored on the Project.

**Paused**:
Boolean flag on the Project. When true and **Mode** is `autopilot`, the Pipeline Orchestrator does not start the next Stage Run, even if the prior one completed. Meaningless when **Mode** is `manual`.

**View**:
UI-only concept — how the user is observing the Pipeline. One of: `supervised` (parked inside an Engine, watching the current Stage in detail; auto-navigates to the next Engine when the orchestrator advances) or `overview` (dashboard showing all Stages at a glance). View is independent of **Mode** and **Paused** — the user can switch freely without affecting orchestration.

**Engine**:
The UI component that renders a Stage (e.g. `ResearchEngine`). Read-only mirror of the latest Stage Run for that Stage — never originates orchestration.
_Avoid_: Stage (the Stage is the domain concept; the Engine is its view)

## Relationships

- A **Project** has one **Mode** and one **Paused** flag.
- A **Project** has zero or more **Stage Runs** per **Stage** (each retry adds a new run).
- A **Stage Run** belongs to exactly one **Project** and one **Stage**, has one **Stage Run Status**, and references one optional **Payload Ref**.
- The **Pipeline Orchestrator** advances iff `Mode == autopilot && !Paused`.
- **Publish** is the one Stage that always starts in `awaiting_user(manual_advance)` regardless of Mode — by design (publishing is destructive and always requires explicit confirmation).
- A Project's Pipeline is **strictly sequential** — at most one non-terminal Stage Run per Project at any time. Concurrency exists only **between Projects**, not within one.

## Example dialogue

> **Dev:** "If the user closes the tab during research, does the **Stage Run** keep going?"
> **Domain expert:** "Yes — the **Stage Run** is owned by the server. The browser is just a viewer. When the user returns, the **Engine** rehydrates from the current state of the **Stage Run**."

> **Dev:** "If the user switches from **overview** to **supervised** mid-run, does anything happen on the server?"
> **Domain expert:** "Nothing. **View** is UI-only. The Pipeline Orchestrator only cares about Mode and Paused."

## Flagged ambiguities

- "Session" in the code (`research_sessions`, `brainstorm_sessions`, ...) names per-stage payload records, not orchestration records. **Stage Run** is the orchestration concept; sessions are payloads.
- Today's `mode: 'overview' | 'supervised' | 'step-by-step'` (in `pipeline_state_json`) conflates **Mode** with **View**. After this refactor: `mode ∈ {autopilot, manual}`, `view ∈ {supervised, overview}` (UI state, not stored on the Project).
