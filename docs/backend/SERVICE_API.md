# Layout service API

`services/layout-service.js` is the frontend-facing boundary. The editor should eventually depend only on these operations:

- `listModels()`, `getModel(id)`, `createModel(data)`
- `listVersions(modelId)`, `getVersion(id)`, `loadLayout(id)`
- `createVersion(data)`
- `saveLayout({ versionId, expectedRevision, layoutData, changeNote })`
- `publishVersion(id)`, `archiveVersion(id)`
- `getModelPermissions(id)`, `setModelPermission(...)`, `removeModelPermission(...)`
- `uploadAsset(modelId, file, options)`

`RevisionConflictError` is raised when another session has already saved the expected revision. The caller must reload or explicitly merge; it must never retry as an unconditional overwrite.

The service is intentionally not wired into the current editor yet. During parallel validation, callers can import it as an ES module while the existing local/D1 path remains the fallback.
