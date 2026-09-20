import { marker as T } from '@biesbjerg/ngx-translate-extract-marker';
import { StoredLocalVisionEvent } from 'app/pages/harbor-assistant/interfaces/harbor-assistant-status.interface';
import { PersonAssociationStatus } from 'app/pages/harbor-assistant/shared/harbor-assistant.interface';

export interface PackageAssociationTimelineCard {
  packageEvent: StoredLocalVisionEvent;
  associationEvent: StoredLocalVisionEvent;
  status: PersonAssociationStatus;
  recordingArtifactId: string;
  evidenceCount: number;
  windowStart: number | null;
  windowEnd: number | null;
}

export interface PackageAssociationTimelineItem {
  stored: StoredLocalVisionEvent;
  association?: PackageAssociationTimelineCard;
}

export const personAssociationStatusLabels: Record<PersonAssociationStatus, string> = {
  correlated: T('Possibly associated with nearby person activity'),
  not_observed: T('No associated person activity observed'),
  ambiguous: T('Person association is unclear'),
  unavailable: T('Person association analysis unavailable'),
};

export function projectPackageAssociationTimeline(events: StoredLocalVisionEvent[]): PackageAssociationTimelineItem[] {
  const facts = new Map(events
    .filter((stored) => stored.event.event_type === 'package_person_association_evaluated')
    .map((stored) => [stored.event.event_id, stored]));
  return events.filter((stored) => stored.event.event_type !== 'package_person_association_evaluated').map((stored) => {
    const metrics = stored.event.metrics;
    const id = metrics?.association_event_id;
    const fact = typeof id === 'string' ? facts.get(id) : undefined;
    const details = fact?.event.metrics;
    const status = details?.association_status;
    const recording = details?.recording_artifact_id;
    if (!fact || !details || !['package_removed', 'package_no_longer_visible'].includes(stored.event.event_type)
      || fact.event.camera_id !== stored.event.camera_id || details.package_event_id !== stored.event.event_id
      || details.package_instance_id !== metrics?.package_instance_id || recording !== metrics?.recording_artifact_id
      || typeof recording !== 'string' || !recording || typeof status !== 'string'
      || !Object.hasOwn(personAssociationStatusLabels, status) || status !== metrics?.person_association_status) {
      return { stored };
    }
    const evidence = Array.isArray(details.person_evidence) ? details.person_evidence : [];
    return {
      stored,
      association: {
        packageEvent: stored,
        associationEvent: fact,
        status: status as PersonAssociationStatus,
        recordingArtifactId: recording,
        evidenceCount: evidence.filter((entry: unknown) => {
          if (typeof entry !== 'object' || !entry) return false;
          const overlap = (entry as Record<string, unknown>).interaction_overlap;
          return typeof overlap === 'number' && overlap >= 0.2;
        }).length,
        windowStart: windowTimestamp(details.analyzed_window, 'start_epoch_ms'),
        windowEnd: windowTimestamp(details.analyzed_window, 'end_epoch_ms'),
      },
    };
  });
}

function windowTimestamp(window: unknown, key: string): number | null {
  if (typeof window !== 'object' || !window) return null;
  const value = (window as Record<string, unknown>)[key];
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
