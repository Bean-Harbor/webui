export function harborAssistantBeaconApiUrl(path: string): string {
  return `/api/beacon${path}`;
}

export function harborAssistantGateApiUrl(path: string): string {
  return `/api/harbor-gate/api/beacon${path}`;
}

export function harborAssistantGateRequiresUserToken(): boolean {
  return false;
}

export function harborAssistantDetectionObservationRequest(
  deviceId: string,
  streamProfile: 'sub' | 'main',
): { url: string; params: Record<string, string> } {
  return {
    url: harborAssistantGateApiUrl(
      `/cameras/${encodeURIComponent(deviceId)}/cat-detection/observation`,
    ),
    params: { stream_profile: streamProfile },
  };
}
