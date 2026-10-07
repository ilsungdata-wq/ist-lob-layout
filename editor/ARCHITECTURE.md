# Professional Factory Layout Editor architecture

## Decision
Fabric.js is retained only as the rendering and hit-testing adapter. Manufacturing data is stored in a renderer-independent `layoutDocument` schema. The previous `layoutObjects` array remains as a compatibility alias so Model, Version, Import, Publish, print and older saved data continue to work.

## Modules
- `professional-editor.js`: editor shell, document migration, camera, selection, history, clipboard, layers, inspector, alignment, shortcuts and export.
- `fabric-engine.js`: Fabric object factory and renderer adapter.
- `studio.js`: existing LOB/Model/Version integration and legacy compatibility.

## Schema
`layoutDocument = { schemaVersion, canvas, layers, objects, metadata }`

Each object contains geometry and visual properties plus `metadata`, which may contain `processId`, `equipmentId`, `TT`, `MP` and other manufacturing fields. The renderer never queries LOB directly.

## Migration
On load, existing `layoutObjects` are normalized in place and assigned to `layoutDocument.objects`. The compatibility property `layoutObjects` points to the same array. No existing layouts are discarded.

## Real-world scale
Schema v2 stores canonical object geometry in `object.world` using meters. Legacy pixel geometry remains synchronized for backward compatibility. `canvas.pixelsPerMeter` is a rendering calibration only; zoom changes the Fabric viewport and never mutates `object.world`. The default area is 33 m × 12 m and can be changed through Area Setup. Rulers, grid, dimensions, status and measure tools use the same conversion service.

## Phase 2B+ smart process stations
`process-station` objects store geometry/style and a stable `metadata.processId`; LOB remains authoritative for process name, T/T, MP, equipment/Jig, Auto and ĐKN. Rendering resolves the current process on every redraw, so business-data changes never disturb layout geometry. The Office page remains a fixed meter-based artboard; objects may exist in the surrounding gray workspace without resizing the page.
