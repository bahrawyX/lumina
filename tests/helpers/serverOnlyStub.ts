// Test stub for the `server-only` package. In production it throws if a
// server-only module is pulled into a client bundle; in the vitest/jsdom
// environment there is no such boundary, so it resolves to a harmless no-op.
export {};
