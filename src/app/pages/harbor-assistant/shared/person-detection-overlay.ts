import { PersonDetectionBox } from 'app/pages/harbor-assistant/shared/harbor-assistant.interface';

export function validPersonBox(box: PersonDetectionBox): boolean {
  const value = box.normalized_box;
  return box.label === 'person' && Number.isFinite(box.confidence) && box.confidence >= 0.5
    && box.confidence <= 1 && !!value
    && [value.x1, value.x2, value.y1, value.y2].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)
    && value.x1 < value.x2 && value.y1 < value.y2;
}

export function drawPersonBoxes(canvas: HTMLCanvasElement, boxes: PersonDetectionBox[], label: string): void {
  const context = canvas.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.font = `${Math.max(14, canvas.width / 50)}px sans-serif`;
  context.lineWidth = Math.max(2, canvas.width / 400);
  context.strokeStyle = '#00d5ff';
  for (const box of boxes.slice(0, 8).filter(validPersonBox)) {
    const bounds = box.normalized_box;
    const x = bounds.x1 * canvas.width;
    const y = bounds.y1 * canvas.height;
    context.strokeRect(x, y, (bounds.x2 - bounds.x1) * canvas.width, (bounds.y2 - bounds.y1) * canvas.height);
    const text = `${label} ${Math.round(box.confidence * 100)}%`;
    const height = Math.max(20, canvas.width / 40);
    const width = context.measureText(text).width + 8;
    const left = Math.max(0, Math.min(x, canvas.width - width));
    const top = Math.max(0, y - height);
    context.fillStyle = '#003440';
    context.fillRect(left, top, width, height);
    context.fillStyle = '#fff';
    context.fillText(text, left + 4, top + height - 4);
  }
}
