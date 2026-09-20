import { StoredLocalVisionEvent } from 'app/pages/harbor-assistant/interfaces/harbor-assistant-status.interface';
import { projectPackageAssociationTimeline } from 'app/pages/harbor-assistant/shared/package-association-timeline';

describe('Package association timeline', () => {
  const packageEvent = {
    event: {
      event_id: 'package-1',
      event_type: 'package_removed',
      camera_id: 'camera-252',
      metrics: {
        association_event_id: 'association-1',
        package_instance_id: 'instance-1',
        recording_artifact_id: 'recording-1',
        person_association_status: 'correlated',
      },
    },
  } as StoredLocalVisionEvent;
  const associationEvent = {
    event: {
      event_id: 'association-1',
      event_type: 'package_person_association_evaluated',
      camera_id: 'camera-252',
      metrics: {
        package_event_id: 'package-1',
        package_instance_id: 'instance-1',
        recording_artifact_id: 'recording-1',
        association_status: 'correlated',
        person_evidence: [],
      },
    },
  } as StoredLocalVisionEvent;

  it('merges both arrival orders into one package card with one recording', () => {
    for (const events of [[packageEvent, associationEvent], [associationEvent, packageEvent]]) {
      const cards = projectPackageAssociationTimeline(events);
      expect(cards).toHaveLength(1);
      expect(cards[0].stored).toBe(packageEvent);
      expect(cards[0].association?.recordingArtifactId).toBe('recording-1');
      expect(cards[0].association?.status).toBe('correlated');
      expect(events).toHaveLength(2);
    }
  });

  it('preserves legacy events and rejects mismatched pair identities', () => {
    const unrelated = { ...associationEvent, event: { ...associationEvent.event, camera_id: 'another-camera' } };
    expect(projectPackageAssociationTimeline([packageEvent, unrelated])[0].association).toBeUndefined();
    expect(projectPackageAssociationTimeline([packageEvent])).toEqual([{ stored: packageEvent }]);
    expect(projectPackageAssociationTimeline([associationEvent])).toEqual([]);
  });
});
