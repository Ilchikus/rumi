---
type: database
properties:
  status:
    type: select
    options:
      - name: idea
        color: neutral
      - name: ready
        color: sky
      - name: doing
        color: yellow
      - name: verify
        color: violet
      - name: done
        color: emerald
      - name: blocked
        color: rose
  order:
    type: number
  areas:
    type: multi-select
    options:
      - name: runtime
        color: sky
      - name: api
        color: blue
      - name: cli
        color: cyan
      - name: web
        color: violet
      - name: editor
        color: purple
      - name: watcher
        color: yellow
      - name: index
        color: orange
      - name: database
        color: green
      - name: assets
        color: lime
      - name: search
        color: red
  depends_on:
    type: multi-select
  created:
    type: date
  updated:
    type: date
views:
  - name: Roadmap
    type: table
    columns:
      - order
      - status
      - areas
      - depends_on
      - updated
---
# Milestones

Milestones are vertical rebuild slices.

Each milestone should prove a coherent part of the architecture with tests.
