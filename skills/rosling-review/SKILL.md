---
name: rosling-review
description: Act on the review comments the user pins on slides in the rosling viewer. Use when the user asks to review, listen for, or work through slide comments, or says they sent comments.
---

# Review comments from the rosling viewer

The user pins comments on slides in the viewer (`rosling dev`) and presses **Send all**. The
`rosling` MCP server hands them to you. If its tools are missing, ask the user to run
`rosling connect <agent>` in the deck folder and restart you.

## The loop

1. Call `wait_for_comments`. It returns as soon as comments arrive, or an empty list after a while:
   then call it again. Tell the user once that you are listening.
2. For each comment:
   - Open the slide file it names (`slides/<id>.json`). `point.where` says roughly which part of
     the slide the pin is on (`top left`, `centre`, `bottom right`...); match it to the box there.
   - Make the change it asks for, following AGENTS.md: a slide only fills in its template's values.
     If it needs a different layout, use another template. Never add code or CSS to a slide.
   - If the comment is unclear or asks for something a template can't do, don't guess: say so in the reply.
3. Run `rosling check` and fix anything it reports.
4. Call `resolve_comment` for each one with a reply of one or two plain sentences: what you changed,
   or why you didn't. The user reads it on the slide.
5. Go back to step 1. Stop when the user tells you to.

`list_comments` shows comments still open, for example after a restart. Comments marked `working`
were handed to an agent before; finish them too.
