/* global http, MOCK_JAM_ADMIN */
// Resets mock-jam (scripts/mock-jam.ts) so every flow starts from the same PC state.
// Runs on the host (Maestro GraalJS: `http` and the flow env are globals), where the mock
// listens on loopback.
http.post(MOCK_JAM_ADMIN + '/mock/reset', { body: '' });
