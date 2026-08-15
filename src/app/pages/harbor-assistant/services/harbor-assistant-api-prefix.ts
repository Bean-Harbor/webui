export function harborAssistantBeaconApiUrl(path: string): string {
  return `/api/harbor-beacon${path}`;
}

export function harborAssistantGateApiUrl(path: string): string {
  return `/api/harbor-gate/api/beacon${path}`;
}

export function harborAssistantGateRequiresUserToken(): boolean {
  return true;
}

export function harborAssistantDetectionObservationRequest(
  deviceId: string,
  streamProfile: 'sub' | 'main',
): { url: string; params: Record<string, string> } {
  return {
    url: harborAssistantGateApiUrl('/vision/detection-jobs'),
    params: {
      camera_id: deviceId,
      stream_profile: streamProfile,
    },
  };
}
