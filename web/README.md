# Underground Atlas web app

React viewer for the Lisbon Metro depth map. See the root [`README.md`](../README.md) for project status, data sources, and pipeline commands.

## Stack

Vite, TypeScript, React 19, React Router, React Three Fiber, Tailwind CSS 4, TanStack Query, Zustand, Zod, and Three.js.

## Commands

```bash
pnpm --dir web dev
pnpm --dir web typecheck
pnpm --dir web lint
pnpm --dir web build
pnpm --dir web preview
```

`build` typechecks, builds Vite assets, prerenders `/`, and writes static entry documents for the viewer and method routes.

## Routes

- `/` - map index. Prerendered and readable without JavaScript.
- `/maps/lisboa/` - 3D viewer.
- `/maps/lisboa/method/` - method, provenance, and limitations.

Viewer URL state: `?line=C,D`, `?station=alameda`, `?segment=C:alameda-areeiro`, `?section=1`, and `?xray=1`.

## Data

The viewer fetches `public/data/v1/` at runtime. Set `VITE_DATA_BASE` to serve the same files from another base path.
