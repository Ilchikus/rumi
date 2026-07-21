# How Codex Was Used

I have my application running on a remote home server. I connected it to Codex through Tailscale.

The Rumi application itself provides the structure for the documents, memory, tasks, roadmap, and questions. I either type the input myself or dictate it to Codex to create the documents as well.

The whole story of the application is that it started as an Electron application made with Claude. Once I understood that this was not scalable and pivoted toward self-hosting, I rewrote the application from scratch with Codex.

Before writing it, we had a big brainstorming session to cover all the structural, technical, and other questions. After the session, Codex created the documents, the roadmap, the first tasks, and started implementing.

Normally I use one thread/Codex task per actual task. Sometimes I multithread with each Codex thread or task corresponding to a specific area: for example, the editor, backend, app layout, and so on.

I also have an `agents.md` file that suggests the proper workflow to Codex. It tells Codex to create the corresponding task in the task database and to interview me if it does not have enough context. Usually though I work iteratively: first we implement, then we add more context. This added context is also added back to the initial task/prd `.md`.
