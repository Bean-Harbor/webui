import { drawPersonBoxes } from 'app/pages/harbor-assistant/shared/person-detection-overlay';
import { personBoxesAtTime } from 'app/pages/harbor-assistant/shared/person-recording.component';

describe('Person inference overlay', () => {
  const box = {
    x1: 0.1, y1: 0.2, x2: 0.5, y2: 0.9,
  };
  it('uses media timestamps and clears boxes outside the sampled interval', () => {
    const evidence = [{ media_offset_ms: 5250, confidence: 0.8, normalized_box: box }];
    expect(personBoxesAtTime(evidence, 5.25)).toHaveLength(1);
    expect(personBoxesAtTime(evidence, 0)).toEqual([]);
    expect(personBoxesAtTime(evidence, 6)).toEqual([]);
    expect(personBoxesAtTime([{ ...evidence[0], confidence: 0.3 }], 5.25)).toEqual([]);
    expect(personBoxesAtTime([{ ...evidence[0], normalized_box: { ...box, x2: 2 } }], 5.25)).toEqual([]);
  });
  it('uses only the closest sampled frame at a playback time', () => {
    const earlier = { media_offset_ms: 5000, confidence: 0.8, normalized_box: box };
    const later = { media_offset_ms: 5200, confidence: 0.9, normalized_box: { ...box, x1: 0.2 } };
    expect(personBoxesAtTime([earlier, later], 5.1)).toEqual([{
      label: 'person', confidence: 0.8, normalized_box: box,
    }]);
    expect(personBoxesAtTime([earlier, later], 5.16)).toEqual([{
      label: 'person', confidence: 0.9, normalized_box: { ...box, x1: 0.2 },
    }]);
    expect(personBoxesAtTime([earlier, later], 5.5)).toEqual([]);
  });
  it('scales normalized boxes to the video dimensions and labels confidence', () => {
    const context = {
      clearRect: jest.fn(),
      strokeRect: jest.fn(),
      fillRect: jest.fn(),
      fillText: jest.fn(),
      measureText: jest.fn(() => ({ width: 80 })),
    };
    const canvas = { width: 1000, height: 500, getContext: () => context } as unknown as HTMLCanvasElement;
    drawPersonBoxes(canvas, [{ label: 'person', confidence: 0.8, normalized_box: box }], 'person');
    expect(context.strokeRect).toHaveBeenCalledWith(100, 100, 400, 350);
    expect(context.fillText.mock.calls[0][0]).toBe('person 80%');
    drawPersonBoxes(canvas, [], 'person');
    expect(context.clearRect).toHaveBeenCalledTimes(2);
  });
});
