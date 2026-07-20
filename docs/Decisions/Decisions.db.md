---
type: database
properties:
  status:
    type: select
    options:
      - name: proposed
        color: yellow
      - name: accepted
        color: emerald
      - name: deferred
        color: sky
      - name: rejected
        color: rose
  areas:
    type: multi-select
    options:
      - name: server
        color: sky
      - name: web
        color: violet
      - name: frontend
        color: purple
      - name: editor
        color: purple
      - name: cli
        color: blue
      - name: api
        color: cyan
      - name: files
        color: emerald
      - name: database
        color: green
      - name: watcher
        color: yellow
      - name: index
        color: orange
      - name: hosting
        color: cyan
      - name: security
        color: rose
      - name: workflow
        color: neutral
      - name: testing
        color: red
      - name: agents
        color: lime
  impact:
    type: select
    options:
      - name: high
        color: rose
      - name: medium
        color: yellow
      - name: low
        color: neutral
  created:
    type: date
  updated:
    type: date
views:
  - name: All
    type: table
    columns:
      - status
      - areas
      - impact
      - created
      - updated
  - name: Accepted
    type: table
    columns:
      - areas
      - impact
      - updated
---
# Decisions

Durable choices for the Rumi New rebuild.

Add a decision when the project chooses a direction that future work should not relitigate casually.
