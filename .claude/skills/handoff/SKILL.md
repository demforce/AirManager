---
name: handoff
description: Write or update a handoff document so the next agent session with fresh context can continue this work. Use at the end of a work session, or when the user asks to hand off.
---

Write or update a handoff document so the next agent session with fresh context can continue this work.

Steps:
1. Handoff documents live in `docs/handoffs/`. The current one is `docs/handoffs/HANDOFF.md`; previous ones are archived as `docs/handoffs/HANDOFF-<YYYY-MM-DD-HHMM>.md`.
2. If `docs/handoffs/HANDOFF.md` exists, read it first to understand prior context, then archive it (rename with its date) before writing the new one.
3. Create or update `docs/handoffs/HANDOFF.md` with:
   - **Goal**: What we're trying to accomplish overall (the AirManager project) and in the current phase
   - **Current Progress**: What's been done so far — BMAD phase, epics/stories completed, last story in progress and its state
   - **What Worked**: Approaches that succeeded
   - **What Didn't Work**: Approaches that failed (so they're not repeated)
   - **Key Decisions**: Decisions made with the user (stack, domain rules, conventions) not yet captured in docs/
   - **Next Steps**: Clear action items for continuing, in order — including which BMAD story is next and which model runs it (stories: Fable; dev: Sonnet subagent; review: Opus subagent)
4. Keep it factual: only what actually happened, no invented content.
5. Commit the handoff file and push to the working branch, then tell the user the file path so the next session can start from it.
