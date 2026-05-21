import { Subject } from 'rxjs';
import type { GameEvent } from '../domain/events';

export interface EventBus {
  publish(event: GameEvent): void;
  flush(): void;
  events$: Subject<GameEvent>;
}

const INITIAL_CAPACITY = 512;

export function createEventBus(): EventBus {
  let buffer: GameEvent[] = new Array(INITIAL_CAPACITY);
  let head = 0;
  let count = 0;
  let lowUsageFrames = 0;

  const events$ = new Subject<GameEvent>();

  function ensureCapacity() {
    if (count >= buffer.length) {
      const newSize = buffer.length * 2;
      const newBuffer = new Array<GameEvent>(newSize);
      // Copy in ring order
      for (let i = 0; i < count; i++) {
        newBuffer[i] = buffer[(head + i) % buffer.length];
      }
      buffer = newBuffer;
      head = 0;
      lowUsageFrames = 0;
    }
  }

  function maybeShrink() {
    if (buffer.length > INITIAL_CAPACITY && count < buffer.length / 4) {
      lowUsageFrames++;
      if (lowUsageFrames > 60) {
        const newSize = Math.max(INITIAL_CAPACITY, Math.floor(buffer.length / 2));
        const newBuffer = new Array<GameEvent>(newSize);
        for (let i = 0; i < count; i++) {
          newBuffer[i] = buffer[(head + i) % buffer.length];
        }
        buffer = newBuffer;
        head = 0;
        lowUsageFrames = 0;
      }
    } else {
      lowUsageFrames = 0;
    }
  }

  return {
    events$,

    publish(event: GameEvent) {
      ensureCapacity();
      const index = (head + count) % buffer.length;
      buffer[index] = event;
      count++;
    },

    flush() {
      while (count > 0) {
        const segmentLength = Math.min(count, buffer.length - head);
        for (let i = 0; i < segmentLength; i++) {
          events$.next(buffer[head + i]);
        }
        head = (head + segmentLength) % buffer.length;
        count -= segmentLength;
      }
      maybeShrink();
    },
  };
}
