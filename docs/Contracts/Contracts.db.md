---
type: database
properties:
  status:
    type: select
    options:
      - name: draft
        color: yellow
      - name: accepted
        color: emerald
      - name: deferred
        color: sky
  area:
    type: select
    options:
      - name: runtime
        color: sky
      - name: api
        color: blue
      - name: events
        color: yellow
      - name: editor
        color: purple
      - name: cli
        color: cyan
      - name: file-format
        color: emerald
      - name: testing
        color: rose
  owner:
    type: select
    options:
      - name: runtime
        color: sky
      - name: server
        color: blue
      - name: web
        color: violet
      - name: cli
        color: cyan
      - name: shared
        color: emerald
  created:
    type: date
  updated:
    type: date
views:
  - name: All
    type: table
    columns:
      - status
      - area
      - owner
      - updated
---
# Contracts

Contracts define promises between layers.

Update these when a boundary changes.
