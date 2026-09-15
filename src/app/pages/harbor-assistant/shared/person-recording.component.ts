import { ChangeDetectionStrategy, Component, ElementRef, ViewChild, input, signal } from '@angular/core';
import { MatButton } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';
import { PersonDetectionBox } from 'app/pages/harbor-assistant/shared/harbor-assistant.interface';
import { drawPersonBoxes, validPersonBox } from 'app/pages/harbor-assistant/shared/person-detection-overlay';

export function personBoxesAtTime(evidence: unknown, seconds: number): PersonDetectionBox[] {
  if (!Array.isArray(evidence) || !Number.isFinite(seconds)) return [];
  const targetMilliseconds = seconds * 1000;
  const timestampedEntries = evidence.filter((entry: unknown): entry is Record<string, unknown> => {
    if (!entry || typeof entry !== 'object') return false;
    const value = entry as Record<string, unknown>;
    return typeof value.media_offset_ms === 'number' && Number.isFinite(value.media_offset_ms);
  });
  const closestDistance = timestampedEntries.reduce((distance, entry) => Math.min(
    distance,
    Math.abs((entry.media_offset_ms as number) - targetMilliseconds),
  ), Number.POSITIVE_INFINITY);
  if (closestDistance > 250) return [];
  const closestEntry = timestampedEntries.find((entry) => Math.abs(
    (entry.media_offset_ms as number) - targetMilliseconds,
  ) === closestDistance);
  if (!closestEntry) return [];
  const closestTimestamp = closestEntry.media_offset_ms as number;
  return timestampedEntries.filter((entry) =>
    (entry.media_offset_ms as number) === closestTimestamp
  ).map((entry) => ({
    label: 'person' as const,
    confidence: entry.confidence as number,
    normalized_box: entry.normalized_box as PersonDetectionBox['normalized_box'],
  })).filter(validPersonBox).slice(0, 8);
}

@Component({
  selector: 'ix-person-recording',
  imports: [MatButton, TranslateModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './person-recording.component.html',
  styles: [`
    .recording { position: relative; width: 100%; margin-top: 8px; }
    video { display: block; width: 100%; height: auto; }
    canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  `],
})
export class PersonRecordingComponent {
  readonly src = input.required<string>();
  readonly evidence = input<unknown>([]);
  protected readonly opened = signal(false);
  @ViewChild('video') private video?: ElementRef<HTMLVideoElement>;
  @ViewChild('overlay') private overlay?: ElementRef<HTMLCanvasElement>;

  protected draw(): void {
    const video = this.video?.nativeElement;
    const canvas = this.overlay?.nativeElement;
    if (!video || !canvas || !video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    drawPersonBoxes(canvas, personBoxesAtTime(this.evidence(), video.currentTime), 'person');
  }

  protected clear(): void {
    const canvas = this.overlay?.nativeElement;
    if (canvas) canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height);
  }
}
