# Antigravity Workspace Rules — Hard R Cycles: Flat Rate Panic

1. **SSR Isolation:** Never import `@react-three/fiber`, `@react-three/rapier`, or `<Canvas>` into Server Components. Always load via `dynamic(..., { ssr: false })`.
2. **Zero `useState` in `useFrame`:** Read high-frequency simulation state via `useGameStore.getState()` inside `useFrame` and `requestAnimationFrame` callbacks; never call React state setters per frame.
3. **Sprite Material Integrity:** Every character `<Billboard>` material uses `alphaTest={0.5}` and `depthWrite={true}` to prevent z-fighting and transparency bleed.
4. **Fallback-First Assets:** `src/utils/proceduralSprites.ts` must always supply procedural Canvas2D textures whenever manifest PNGs are absent or fail to load.
5. **Strict Typing & Validation:** Keep `tsc --noEmit` passing with zero `any` leaks on game entities, and enforce matching bounds validation between TypeScript API handlers and Postgres RLS policies.
