export function liveIntegrationsAllowed(requestedDemoMode: boolean): boolean {
  return (
    !requestedDemoMode &&
    process.env.WORDLESS_ALLOW_LIVE_MODE === "true"
  );
}

export function liveWritesAllowed(requestedDemoMode: boolean): boolean {
  return (
    liveIntegrationsAllowed(requestedDemoMode) &&
    process.env.WORDLESS_ALLOW_LIVE_WRITES === "true"
  );
}
