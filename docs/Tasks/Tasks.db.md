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
      - name: dropped
        color: red
  type:
    type: select
    options:
      - name: foundation
        color: blue
      - name: feature
        color: emerald
      - name: refactor
        color: yellow
      - name: test
        color: rose
      - name: research
        color: violet
      - name: docs
        color: neutral
  milestone:
    type: select
    options:
      - name: M01
        color: sky
      - name: M02
        color: blue
      - name: M03
        color: violet
      - name: M04
        color: purple
      - name: M05
        color: yellow
      - name: M06
        color: green
      - name: M07
        color: orange
      - name: M08
        color: lime
      - name: later
        color: neutral
  owner_layer:
    type: select
    options:
      - name: runtime
        color: sky
      - name: markdown
        color: emerald
      - name: api
        color: blue
      - name: web
        color: violet
      - name: editor
        color: purple
      - name: cli
        color: cyan
      - name: database
        color: green
      - name: watcher
        color: yellow
      - name: docs
        color: neutral
  coverage:
    type: multi-select
    options:
      - name: runtime
        color: sky
      - name: markdown
        color: emerald
      - name: api
        color: blue
      - name: cli
        color: cyan
      - name: ui-smoke
        color: violet
      - name: docs
        color: neutral
  created:
    type: date
  updated:
    type: date
views:
  - id: by-milestone
    name: By Milestone
    type: table
    columns:
      - status
      - milestone
      - owner_layer
      - coverage
      - updated
  - id: ready
    name: Ready
    type: table
    columns:
      - milestone
      - owner_layer
      - coverage
recordPage:
  hiddenProperties: []
---
# Tasks

Implementation units for Rumi New.

Each task must include required test coverage. A task is not done until its important behavior is protected.
