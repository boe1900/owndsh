# @enterprise-agent/dsh-session-sync

Session restoration boundary for the enterprise plugin. T01 proves that a
validated remote event seed is copied to a new local Session ID through
`ctx.sessions.create(newId, { seed, meta })` and flushed through the official
Session service. Upload queues remain T17 work.
