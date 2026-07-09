import { fakeAsync, tick, discardPeriodicTasks, flushMicrotasks } from '@angular/core/testing';
import { createComponentFactory, Spectator } from '@ngneat/spectator/jest';
import { MockComponent } from 'ng-mocks';
import { of, Subject, throwError } from 'rxjs';
import Hls from 'hls.js';
import { PageHeaderComponent } from 'app/modules/page-header/page-title-header/page-header.component';
import { HarborAssistantCameraComponent } from 'app/pages/harbor-assistant/camera/harbor-assistant-camera.component';
import {
  HarborAssistantCameraLiveSessionResponse,
  HarborAssistantSearchCameraStateResponse,
  HarborAssistantSearchDvrStatusResponse,
  HarborAssistantSearchDvrTimelineResponse,
  HarborAssistantSearchResponse,
  HarborAssistantSearchSnapshotTaskResponse,
} from 'app/pages/harbor-assistant/shared/harbor-assistant.interface';
import { HarborAssistantContentApiService } from 'app/pages/harbor-assistant/shared/harbor-assistant-content-api.service';

describe('Harbor Assistant camera component', () => {
  let spectator: Spectator<HarborAssistantCameraComponent>;
  let snapshotSubject: Subject<HarborAssistantSearchSnapshotTaskResponse>;
  let scrollIntoViewSpy: jest.Mock;
  let api: Partial<Record<keyof HarborAssistantContentApiService, jest.Mock>>;

  const createComponent = createComponentFactory({
    component: HarborAssistantCameraComponent,
    imports: [
      MockComponent(PageHeaderComponent),
    ],
    providers: [
      {
        provide: HarborAssistantContentApiService,
        useFactory: (): Partial<Record<keyof HarborAssistantContentApiService, jest.Mock>> => api,
      },
    ],
  });

  beforeEach(() => {
    snapshotSubject = new Subject<HarborAssistantSearchSnapshotTaskResponse>();
    scrollIntoViewSpy = jest.fn();
    (Element.prototype as unknown as { scrollIntoView: jest.Mock }).scrollIntoView = scrollIntoViewSpy;
    api = {
      cameraState: jest.fn(() => of(cameraState())),
      dvrStatus: jest.fn(() => of(dvrStatus())),
      dvrTimeline: jest.fn(() => of(dvrTimeline())),
      startCameraLiveSession: jest.fn(() => of(liveSession())),
      stopCameraLiveSession: jest.fn(() => of(liveSession({ status: 'stopped', playlist_url: null, playlist_ready: false }))),
      cameraLiveStatus: jest.fn(() => of(liveSession())),
      createSnapshotTask: jest.fn(() => snapshotSubject.asObservable()),
      startDvrRecording: jest.fn(() => of(dvrStatus('recording'))),
      stopDvrRecording: jest.fn(() => of(dvrStatus('stopped'))),
      search: jest.fn(() => of(searchResponse())),
      previewUrl: jest.fn((path: string) => `/api/beacon/knowledge/preview?path=${encodeURIComponent(path)}`),
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('uses snapshot polling instead of long-running MJPEG for stream-only cameras', fakeAsync(() => {
    api.cameraState = jest.fn(() => of(cameraState({
      snapshotUrl: null,
      snapshotCapability: false,
    })));
    spectator = createComponent();

    const liveUrl = spectator.component.selectedLiveUrl();

    expect(liveUrl).toContain('/api/harbor-beacon/cameras/cam-1/snapshot.jpg?ts=');
    expect(liveUrl).not.toContain('live.mjpeg');
    discardPeriodicTasks();
  }));

  it('starts a same-origin HLS live session on demand', fakeAsync(() => {
    spectator = createComponent();

    spectator.component.startLive();

    expect(api.startCameraLiveSession).toHaveBeenCalledWith('cam-1', 'sub');
    expect(spectator.component.liveModeLabel()).toBe('Live H.264 sub');
    discardPeriodicTasks();
  }));

  it('starts the selected main HLS stream profile', fakeAsync(() => {
    spectator = createComponent();
    api.startCameraLiveSession = jest.fn(() => of(liveSession({ stream_profile: 'main' })));
    api.cameraLiveStatus = jest.fn(() => of(liveSession({ stream_profile: 'main' })));
    const componentState = spectator.component as unknown as {
      selectStreamProfile: (profile: 'sub' | 'main') => void;
    };

    componentState.selectStreamProfile('main');
    spectator.component.startLive();

    expect(api.startCameraLiveSession).toHaveBeenCalledWith('cam-1', 'main');
    expect(spectator.component.liveModeLabel()).toBe('Live H.264 main');
    discardPeriodicTasks();
  }));

  it('keeps waiting when HLS media segments arrive after the camera keyframe delay', fakeAsync(() => {
    const pendingSession = liveSession({
      playlist_ready: false,
      diagnostics: {
        playlist_exists: true,
        segment_count: 0,
        latest_segment_name: null,
        latest_segment_size_bytes: null,
        latest_segment_modified_at: null,
        ffmpeg_running: true,
      },
    });
    let pollCount = 0;
    api.startCameraLiveSession = jest.fn(() => of(pendingSession));
    api.cameraLiveStatus = jest.fn(() => {
      pollCount += 1;
      return of(pollCount < 43 ? pendingSession : liveSession());
    });
    spectator = createComponent();
    const componentState = spectator.component as unknown as {
      hlsLiveError: () => string | null;
      hlsLiveStatus: () => 'stopped' | 'starting' | 'live' | 'degraded';
      liveVideo?: { nativeElement: HTMLVideoElement };
    };
    componentState.liveVideo = { nativeElement: fakeLiveVideo() };

    spectator.component.startLive();
    tick(20_000);

    expect(componentState.hlsLiveStatus()).toBe('starting');
    expect(componentState.hlsLiveError()).toBeNull();

    tick(1100);

    expect(componentState.hlsLiveStatus()).toBe('live');
    discardPeriodicTasks();
  }));

  it('attaches HLS playback while a playlist with pending segments is still starting', fakeAsync(() => {
    const pendingStatus = new Subject<HarborAssistantCameraLiveSessionResponse>();
    const playlistUrl = '/api/beacon/cameras/cam-1/live/live-test/index.m3u8';
    api.startCameraLiveSession = jest.fn(() => of(liveSession({
      playlist_url: playlistUrl,
      playlist_ready: false,
      diagnostics: {
        playlist_exists: true,
        segment_count: 1,
        latest_segment_name: 'segment_00001.m4s',
        latest_segment_size_bytes: null,
        latest_segment_modified_at: null,
        ffmpeg_running: true,
      },
    })));
    api.cameraLiveStatus = jest.fn(() => pendingStatus.asObservable());
    spectator = createComponent();
    const loadSource = jest.spyOn(Hls.prototype, 'loadSource').mockImplementation(jest.fn());
    const attachMedia = jest.spyOn(Hls.prototype, 'attachMedia').mockImplementation(jest.fn());
    jest.spyOn(Hls, 'isSupported').mockReturnValue(true);
    jest.spyOn(Hls.prototype, 'on').mockImplementation(jest.fn());
    jest.spyOn(Hls.prototype, 'destroy').mockImplementation(jest.fn());
    const video = fakeLiveVideo();
    const componentState = spectator.component as unknown as {
      hlsLiveStatus: () => 'stopped' | 'starting' | 'live' | 'degraded';
      liveVideo?: { nativeElement: HTMLVideoElement };
    };
    componentState.liveVideo = { nativeElement: video };

    spectator.component.startLive();
    tick();

    expect(loadSource).toHaveBeenCalledWith(playlistUrl);
    expect(attachMedia).toHaveBeenCalledWith(video);
    expect(componentState.hlsLiveStatus()).toBe('starting');
    discardPeriodicTasks();
  }));

  it('keeps HLS live visible and reports paused browser playback', fakeAsync(() => {
    spectator = createComponent();
    const play = jest.fn(() => Promise.reject(new Error('autoplay paused')));
    const componentState = spectator.component as unknown as {
      hlsLiveUrl: { set: (value: string | null) => void };
      hlsLiveStatus: {
        set: (value: 'stopped' | 'starting' | 'live' | 'degraded') => void;
      } & (() => string);
      hlsLiveError: () => string | null;
      liveVideo?: { nativeElement: HTMLVideoElement };
    };
    componentState.hlsLiveUrl.set('/api/beacon/cameras/cam-1/live/live-test/index.m3u8');
    componentState.hlsLiveStatus.set('live');
    componentState.liveVideo = {
      nativeElement: {
        currentTime: 0,
        load: jest.fn(),
        muted: false,
        pause: jest.fn(),
        paused: true,
        play,
        playsInline: false,
        removeAttribute: jest.fn(),
      } as unknown as HTMLVideoElement,
    };

    spectator.component.resumeLivePlayback();
    tick();
    flushMicrotasks();
    for (let attempt = 0; attempt < 6; attempt += 1) {
      tick(350);
      flushMicrotasks();
    }

    expect(play).toHaveBeenCalledTimes(7);
    expect(componentState.hlsLiveStatus()).toBe('live');
    expect(componentState.hlsLiveError()).toBe(
      'Browser paused live playback. Press the video play control.',
    );
    discardPeriodicTasks();
  }));

  it('does not resume HLS playback after the user pauses live video', fakeAsync(() => {
    spectator = createComponent();
    const play = jest.fn(() => Promise.resolve());
    const video = fakeLiveVideo({
      currentTime: 12,
      paused: true,
      play,
    });
    const componentState = spectator.component as unknown as {
      hlsLiveError: () => string | null;
      hlsLiveUrl: { set: (value: string | null) => void };
      hlsLiveStatus: { set: (value: 'stopped' | 'starting' | 'live' | 'degraded') => void };
      liveVideo?: { nativeElement: HTMLVideoElement };
      onLiveVideoPause: () => void;
      resumeLivePlayback: () => void;
    };
    componentState.hlsLiveUrl.set('/api/beacon/cameras/cam-1/live/live-test/index.m3u8');
    componentState.hlsLiveStatus.set('live');
    componentState.liveVideo = { nativeElement: video };

    componentState.onLiveVideoPause();
    componentState.resumeLivePlayback();
    tick();
    tick(2100);
    flushMicrotasks();

    expect(play).not.toHaveBeenCalled();
    expect(componentState.hlsLiveError()).toBeNull();
    discardPeriodicTasks();
  }));

  it('allows playback resume after the native controls play button fires play', fakeAsync(() => {
    spectator = createComponent();
    const play = jest.fn(() => Promise.resolve());
    const video = fakeLiveVideo({
      currentTime: 12,
      paused: true,
      playbackRate: 1.25,
      play,
    });
    const componentState = spectator.component as unknown as {
      hlsLiveUrl: { set: (value: string | null) => void };
      hlsLiveStatus: { set: (value: 'stopped' | 'starting' | 'live' | 'degraded') => void };
      liveVideo?: { nativeElement: HTMLVideoElement };
      onLiveVideoPause: () => void;
      onLiveVideoPlay: () => void;
      resumeLivePlayback: () => void;
    };
    componentState.hlsLiveUrl.set('/api/beacon/cameras/cam-1/live/live-test/index.m3u8');
    componentState.hlsLiveStatus.set('live');
    componentState.liveVideo = { nativeElement: video };

    componentState.onLiveVideoPause();
    componentState.onLiveVideoPlay();
    componentState.resumeLivePlayback();
    tick();
    flushMicrotasks();

    expect(play).toHaveBeenCalledTimes(1);
    expect(video.playbackRate).toBe(1);
    discardPeriodicTasks();
  }));

  it('keeps a stale programmatic play event from clearing user pause', fakeAsync(() => {
    spectator = createComponent();
    const play = jest.fn(() => new Promise<void>((resolve) => {
      window.setTimeout(resolve, 1);
    }));
    const pause = jest.fn();
    const video = fakeLiveVideo({
      currentTime: 12,
      pause,
      paused: true,
      play,
    });
    const componentState = spectator.component as unknown as {
      hlsLiveUrl: { set: (value: string | null) => void };
      hlsLiveStatus: { set: (value: 'stopped' | 'starting' | 'live' | 'degraded') => void };
      liveVideo?: { nativeElement: HTMLVideoElement };
      onLiveVideoPause: () => void;
      onLiveVideoPlay: () => void;
      resumeLivePlayback: () => void;
    };
    componentState.hlsLiveUrl.set('/api/beacon/cameras/cam-1/live/live-test/index.m3u8');
    componentState.hlsLiveStatus.set('live');
    componentState.liveVideo = { nativeElement: video };

    componentState.resumeLivePlayback();
    tick();
    componentState.onLiveVideoPause();
    componentState.onLiveVideoPlay();
    componentState.resumeLivePlayback();
    tick(1);
    flushMicrotasks();

    expect(pause).toHaveBeenCalled();
    expect(play).toHaveBeenCalledTimes(1);
    discardPeriodicTasks();
  }));

  it('pauses a stale pending play request after user pause', fakeAsync(() => {
    spectator = createComponent();
    const play = jest.fn(() => new Promise<void>((resolve) => {
      window.setTimeout(resolve, 1);
    }));
    const pause = jest.fn();
    const video = fakeLiveVideo({
      currentTime: 12,
      pause,
      paused: true,
      play,
    });
    const componentState = spectator.component as unknown as {
      hlsLiveUrl: { set: (value: string | null) => void };
      hlsLiveStatus: { set: (value: 'stopped' | 'starting' | 'live' | 'degraded') => void };
      liveVideo?: { nativeElement: HTMLVideoElement };
      onLiveVideoPause: () => void;
      resumeLivePlayback: () => void;
    };
    componentState.hlsLiveUrl.set('/api/beacon/cameras/cam-1/live/live-test/index.m3u8');
    componentState.hlsLiveStatus.set('live');
    componentState.liveVideo = { nativeElement: video };

    componentState.resumeLivePlayback();
    tick();
    componentState.onLiveVideoPause();
    tick(1);
    flushMicrotasks();
    componentState.resumeLivePlayback();
    tick(2100);
    flushMicrotasks();

    expect(play).toHaveBeenCalledTimes(1);
    expect(pause).toHaveBeenCalledTimes(1);
    discardPeriodicTasks();
  }));

  it('does not remute user-unmuted HLS live playback during resume', fakeAsync(() => {
    spectator = createComponent();
    const video = fakeLiveVideo({
      currentTime: 4,
      muted: false,
      paused: false,
    });
    const componentState = spectator.component as unknown as {
      hlsLiveUrl: { set: (value: string | null) => void };
      hlsLiveStatus: { set: (value: 'stopped' | 'starting' | 'live' | 'degraded') => void };
      liveVideo?: { nativeElement: HTMLVideoElement };
    };
    componentState.hlsLiveUrl.set('/api/beacon/cameras/cam-1/live/live-test/index.m3u8');
    componentState.hlsLiveStatus.set('live');
    componentState.liveVideo = { nativeElement: video };

    spectator.component.resumeLivePlayback();
    tick();

    expect(video.muted).toBe(false);
    discardPeriodicTasks();
  }));

  it('moves stale HLS playback back with enough live buffer', fakeAsync(() => {
    spectator = createComponent();
    const video = fakeLiveVideo({
      currentTime: 8,
      paused: false,
      playbackRate: 1,
      seekable: {
        end: jest.fn(() => 60),
        length: 1,
        start: jest.fn(() => 0),
      } as unknown as TimeRanges,
    });
    const componentState = spectator.component as unknown as {
      hlsLiveUrl: { set: (value: string | null) => void };
      hlsLiveStatus: { set: (value: 'stopped' | 'starting' | 'live' | 'degraded') => void };
      liveVideo?: { nativeElement: HTMLVideoElement };
      seekLiveVideoToEdge: (force?: boolean) => void;
    };
    componentState.hlsLiveUrl.set('/api/beacon/cameras/cam-1/live/live-test/index.m3u8');
    componentState.hlsLiveStatus.set('live');
    componentState.liveVideo = { nativeElement: video };

    componentState.seekLiveVideoToEdge();

    expect(video.currentTime).toBeCloseTo(54);
    expect(video.playbackRate).toBe(1);
    discardPeriodicTasks();
  }));

  it('avoids force seeking when HLS playback is close enough to live', fakeAsync(() => {
    spectator = createComponent();
    const video = fakeLiveVideo({
      currentTime: 48,
      paused: false,
      playbackRate: 1,
      seekable: {
        end: jest.fn(() => 60),
        length: 1,
        start: jest.fn(() => 0),
      } as unknown as TimeRanges,
    });
    const componentState = spectator.component as unknown as {
      liveVideo?: { nativeElement: HTMLVideoElement };
      seekLiveVideoToEdge: (force?: boolean) => void;
    };
    componentState.liveVideo = { nativeElement: video };

    componentState.seekLiveVideoToEdge();

    expect(video.currentTime).toBe(48);
    expect(video.playbackRate).toBe(1.05);
    discardPeriodicTasks();
  }));

  it('keeps delayed live playback still until the user presses play again', fakeAsync(() => {
    spectator = createComponent();
    const bufferedRange = fakeTimeRanges([[0, 80]]);
    const video = fakeLiveVideo({
      currentTime: 8,
      paused: true,
      playbackRate: 1.25,
      buffered: bufferedRange,
      seekable: bufferedRange,
    });
    const componentState = spectator.component as unknown as {
      hlsLiveUrl: { set: (value: string | null) => void };
      hlsLiveStatus: { set: (value: 'stopped' | 'starting' | 'live' | 'degraded') => void };
      liveVideo?: { nativeElement: HTMLVideoElement };
      onLiveVideoPause: () => void;
      onLiveVideoPlay: () => void;
      seekLiveVideoToEdge: (force?: boolean) => void;
    };
    componentState.hlsLiveUrl.set('/api/beacon/cameras/cam-1/live/live-test/index.m3u8');
    componentState.hlsLiveStatus.set('live');
    componentState.liveVideo = { nativeElement: video };

    componentState.onLiveVideoPause();
    video.currentTime = 74;
    componentState.seekLiveVideoToEdge(true);
    expect(video.currentTime).toBe(8);
    expect(video.playbackRate).toBe(1);

    componentState.onLiveVideoPlay();
    componentState.seekLiveVideoToEdge(true);

    expect(video.currentTime).toBeCloseTo(74);
    expect(video.playbackRate).toBe(1);
    discardPeriodicTasks();
  }));

  it('prefers hls.js when native HLS probing is unreliable', fakeAsync(() => {
    spectator = createComponent();
    const playlistUrl = '/api/beacon/cameras/cam-1/live/live-test/index.m3u8';
    const isSupported = jest.spyOn(Hls, 'isSupported').mockReturnValue(true);
    const loadSource = jest.spyOn(Hls.prototype, 'loadSource').mockImplementation(jest.fn());
    const attachMedia = jest.spyOn(Hls.prototype, 'attachMedia').mockImplementation(jest.fn());
    jest.spyOn(Hls.prototype, 'on').mockImplementation(jest.fn());
    jest.spyOn(Hls.prototype, 'destroy').mockImplementation(jest.fn());
    const componentState = spectator.component as unknown as {
      attachHlsPlayback: () => boolean;
      hls?: {
        config?: {
          backBufferLength?: number;
          liveMaxLatencyDurationCount?: number;
          maxBufferLength?: number;
          maxMaxBufferLength?: number;
        };
      };
      hlsLiveUrl: { set: (value: string | null) => void };
      hlsLiveStatus: { set: (value: 'stopped' | 'starting' | 'live' | 'degraded') => void };
      liveVideo?: { nativeElement: HTMLVideoElement };
    };
    const video = {
      autoplay: false,
      canPlayType: jest.fn(() => 'maybe'),
      currentTime: 0,
      defaultMuted: false,
      load: jest.fn(),
      muted: false,
      pause: jest.fn(),
      paused: true,
      play: jest.fn(() => Promise.resolve()),
      playsInline: false,
      removeAttribute: jest.fn(),
    } as unknown as HTMLVideoElement;
    componentState.hlsLiveUrl.set(playlistUrl);
    componentState.hlsLiveStatus.set('live');
    componentState.liveVideo = { nativeElement: video };

    expect(componentState.attachHlsPlayback()).toBe(true);

    expect(isSupported).toHaveBeenCalled();
    expect(video.autoplay).toBe(true);
    expect(video.defaultMuted).toBe(true);
    expect(video.muted).toBe(true);
    expect(loadSource).toHaveBeenCalledWith(playlistUrl);
    expect(attachMedia).toHaveBeenCalledWith(video);
    expect(video.canPlayType).not.toHaveBeenCalled();
    expect(componentState.hls?.config?.backBufferLength).toBe(Number.POSITIVE_INFINITY);
    expect(componentState.hls?.config?.liveMaxLatencyDurationCount).toBe(Number.POSITIVE_INFINITY);
    expect(componentState.hls?.config?.maxBufferLength).toBe(120);
    expect(componentState.hls?.config?.maxMaxBufferLength).toBe(600);
    discardPeriodicTasks();
  }));

  it('keeps HLS fragment buffering from overriding a user pause', fakeAsync(() => {
    spectator = createComponent();
    const playlistUrl = '/api/beacon/cameras/cam-1/live/live-test/index.m3u8';
    const hlsHandlers = new Map<string, (event: string, data?: unknown) => void>();
    const loadSource = jest.spyOn(Hls.prototype, 'loadSource').mockImplementation(jest.fn());
    jest.spyOn(Hls, 'isSupported').mockReturnValue(true);
    jest.spyOn(Hls.prototype, 'attachMedia').mockImplementation(jest.fn());
    jest.spyOn(Hls.prototype, 'destroy').mockImplementation(jest.fn());
    jest.spyOn(Hls.prototype, 'on').mockImplementation((event, handler) => {
      hlsHandlers.set(event, handler as (event: string, data?: unknown) => void);
    });
    const bufferedRange = fakeTimeRanges([[0, 90]]);
    const video = fakeLiveVideo({
      currentTime: 14,
      paused: true,
      buffered: bufferedRange,
      seekable: bufferedRange,
    });
    const componentState = spectator.component as unknown as {
      attachHlsPlayback: () => boolean;
      hlsLiveUrl: { set: (value: string | null) => void };
      hlsLiveStatus: { set: (value: 'stopped' | 'starting' | 'live' | 'degraded') => void };
      liveVideo?: { nativeElement: HTMLVideoElement };
      onLiveVideoPause: () => void;
    };
    componentState.hlsLiveUrl.set(playlistUrl);
    componentState.hlsLiveStatus.set('live');
    componentState.liveVideo = { nativeElement: video };

    expect(componentState.attachHlsPlayback()).toBe(true);
    componentState.onLiveVideoPause();
    video.currentTime = 20;
    hlsHandlers.get(Hls.Events.FRAG_BUFFERED)?.('fragBuffered');
    tick();
    flushMicrotasks();

    expect(loadSource).toHaveBeenCalledWith(playlistUrl);
    expect(video.currentTime).toBe(14);
    expect(video.play).not.toHaveBeenCalled();
    discardPeriodicTasks();
  }));

  it('recovers fatal hls.js media errors before degrading live playback', fakeAsync(() => {
    spectator = createComponent();
    const playlistUrl = '/api/beacon/cameras/cam-1/live/live-test/index.m3u8';
    const hlsHandlers = new Map<string, (event: string, data: { details: string; fatal: boolean; type: string }) => void>();
    const recoverMediaError = jest.spyOn(Hls.prototype, 'recoverMediaError').mockImplementation(jest.fn());
    jest.spyOn(Hls, 'isSupported').mockReturnValue(true);
    jest.spyOn(Hls.prototype, 'loadSource').mockImplementation(jest.fn());
    jest.spyOn(Hls.prototype, 'attachMedia').mockImplementation(jest.fn());
    jest.spyOn(Hls.prototype, 'destroy').mockImplementation(jest.fn());
    jest.spyOn(Hls.prototype, 'on').mockImplementation((event, handler) => {
      hlsHandlers.set(
        event,
        handler as (event: string, data: { details: string; fatal: boolean; type: string }) => void,
      );
    });
    const componentState = spectator.component as unknown as {
      attachHlsPlayback: () => boolean;
      hlsLiveError: () => string | null;
      hlsLiveStatus: {
        set: (value: 'stopped' | 'starting' | 'live' | 'degraded') => void;
      } & (() => string);
      hlsLiveUrl: { set: (value: string | null) => void };
      liveVideo?: { nativeElement: HTMLVideoElement };
    };
    componentState.hlsLiveUrl.set(playlistUrl);
    componentState.hlsLiveStatus.set('live');
    componentState.liveVideo = { nativeElement: fakeLiveVideo() };

    expect(componentState.attachHlsPlayback()).toBe(true);
    hlsHandlers.get(Hls.Events.ERROR)?.('hlsError', {
      details: 'bufferAppendError',
      fatal: true,
      type: 'mediaError',
    });

    expect(recoverMediaError).toHaveBeenCalled();
    expect(componentState.hlsLiveStatus()).toBe('live');
    expect(componentState.hlsLiveError()).toBe('Live HLS media error; retrying (mediaError/bufferAppendError).');
    tick();
    discardPeriodicTasks();
  }));

  it('degrades expired HLS live sessions without recovery loops', fakeAsync(() => {
    spectator = createComponent();
    const playlistUrl = '/api/beacon/cameras/cam-1/live/live-test/index.m3u8';
    const hlsHandlers = new Map<string, (event: string, data: {
      details: string;
      fatal: boolean;
      response?: { code: number };
      type: string;
    }) => void>();
    const startLoad = jest.spyOn(Hls.prototype, 'startLoad').mockImplementation(jest.fn());
    jest.spyOn(Hls, 'isSupported').mockReturnValue(true);
    jest.spyOn(Hls.prototype, 'loadSource').mockImplementation(jest.fn());
    jest.spyOn(Hls.prototype, 'attachMedia').mockImplementation(jest.fn());
    jest.spyOn(Hls.prototype, 'destroy').mockImplementation(jest.fn());
    jest.spyOn(Hls.prototype, 'on').mockImplementation((event, handler) => {
      hlsHandlers.set(
        event,
        handler as (event: string, data: {
          details: string;
          fatal: boolean;
          response?: { code: number };
          type: string;
        }) => void,
      );
    });
    const componentState = spectator.component as unknown as {
      attachHlsPlayback: () => boolean;
      hlsLiveError: () => string | null;
      hlsLiveStatus: {
        set: (value: 'stopped' | 'starting' | 'live' | 'degraded') => void;
      } & (() => string);
      hlsLiveUrl: { set: (value: string | null) => void };
      liveVideo?: { nativeElement: HTMLVideoElement };
    };
    componentState.hlsLiveUrl.set(playlistUrl);
    componentState.hlsLiveStatus.set('live');
    componentState.liveVideo = { nativeElement: fakeLiveVideo() };

    expect(componentState.attachHlsPlayback()).toBe(true);
    hlsHandlers.get(Hls.Events.ERROR)?.('hlsError', {
      details: 'fragLoadError',
      fatal: true,
      response: { code: 404 },
      type: 'networkError',
    });

    expect(startLoad).not.toHaveBeenCalled();
    expect(componentState.hlsLiveStatus()).toBe('degraded');
    expect(componentState.hlsLiveError()).toBe('Live session expired. Start live playback again.');
    tick();
    discardPeriodicTasks();
  }));

  it('freezes snapshot polling while recording is active', fakeAsync(() => {
    api.cameraState = jest.fn(() => of(cameraState({
      snapshotUrl: null,
      snapshotCapability: false,
    })));
    api.dvrStatus = jest.fn(() => of(dvrStatus('recording')));
    spectator = createComponent();
    const componentState = spectator.component as unknown as {
      liveSnapshotToken: () => number;
    };
    const token = componentState.liveSnapshotToken();

    tick(3000);

    expect(componentState.liveSnapshotToken()).toBe(token);
    discardPeriodicTasks();
  }));

  it('keeps the last good live frame when a snapshot refresh fails', fakeAsync(() => {
    spectator = createComponent();
    const componentState = spectator.component as unknown as {
      lastGoodLiveFrameUrl: { set: (value: string) => void };
      liveSnapshotErrorToken: { set: (value: number) => void };
      liveSnapshotToken: () => number;
    };
    const token = componentState.liveSnapshotToken();

    componentState.lastGoodLiveFrameUrl.set('data:image/jpeg;base64,good-frame');
    componentState.liveSnapshotErrorToken.set(token);

    expect(spectator.component.selectedLiveUrl()).toBe('data:image/jpeg;base64,good-frame');
    discardPeriodicTasks();
  }));

  it('does not expose raw camera state parsing errors', fakeAsync(() => {
    api.cameraState = jest.fn(() => throwError(() => new Error('failed to parse admin console state: EOF while parsing a value')));
    spectator = createComponent();
    spectator.detectChanges();

    expect(spectator.element.textContent).toContain('Camera settings did not fully refresh');
    expect(spectator.element.textContent).not.toContain('failed to parse admin console');
    discardPeriodicTasks();
  }));

  it('does not refresh the main live image immediately after snapshot', fakeAsync(() => {
    spectator = createComponent();
    const componentState = spectator.component as unknown as {
      liveSnapshotToken: () => number;
    };
    const token = componentState.liveSnapshotToken();

    spectator.component.captureSnapshot();

    expect(componentState.liveSnapshotToken()).toBe(token);
    discardPeriodicTasks();
  }));

  it('shows an optimistic snapshot card before the archive request finishes', fakeAsync(() => {
    spectator = createComponent();

    spectator.component.captureSnapshot();
    spectator.detectChanges();

    expect(api.createSnapshotTask).toHaveBeenCalledWith('cam-1');
    expect(spectator.query('.live-feedback')).toHaveText('Captured');
    expect(spectator.queryAll('.recent-media-card.snapshot.pending').length).toBe(1);
    expect(spectator.component.timelineItems()[0].file_path).toContain('ui://harbor-assistant-camera/snapshot:cam-1');
    tick(3000);
    discardPeriodicTasks();
  }));

  it('releases the snapshot button before archive finishes', fakeAsync(() => {
    spectator = createComponent();

    spectator.component.captureSnapshot();
    spectator.detectChanges();
    const componentState = spectator.component as unknown as {
      actionBusy: () => string | null;
    };
    expect(componentState.actionBusy()).toBe('snapshot');

    tick(500);
    spectator.detectChanges();

    expect(componentState.actionBusy()).toBeNull();
    expect(api.createSnapshotTask).toHaveBeenCalledWith('cam-1');
    tick(2500);
    discardPeriodicTasks();
  }));

  it('replaces the optimistic snapshot with the archived media item', fakeAsync(() => {
    spectator = createComponent();

    spectator.component.captureSnapshot();
    snapshotSubject.next({
      media_item: {
        device_id: 'cam-1',
        file_path: '/library/snapshots/cam-1.jpg',
        media_kind: 'snapshot',
        stream_kind: 'snapshot',
        started_at: '1714600100',
        created_at: '1714600100',
        ended_at: '1714600100',
        duration_seconds: 0,
        retention_expires_at: '',
        size_bytes: 1536,
        replay_url: '/api/knowledge/preview?path=/library/snapshots/cam-1.jpg',
        thumbnail_url: '/api/knowledge/preview?path=/library/snapshots/cam-1.jpg',
        playable: true,
        indexed: false,
      },
    });
    snapshotSubject.complete();
    spectator.detectChanges();

    expect(spectator.queryAll('.recent-media-card.snapshot.pending').length).toBe(0);
    expect(spectator.component.timelineItems()[0].file_path).toBe('/library/snapshots/cam-1.jpg');
    tick(3000);
    discardPeriodicTasks();
  }));

  it('opens DVR media in an inline viewer instead of a popup', fakeAsync(() => {
    const windowOpen = jest.spyOn(window, 'open').mockImplementation(() => null);
    spectator = createComponent();
    spectator.detectChanges();

    spectator.component.openReplay(spectator.component.timelineItems()[0]);
    tick();
    spectator.detectChanges();

    expect(windowOpen).not.toHaveBeenCalled();
    expect(spectator.query('[data-testid="harbor-assistant-camera-media-viewer"]')).toExist();
    expect(spectator.query('[data-testid="harbor-assistant-camera-media-viewer"] video')).toExist();
    windowOpen.mockRestore();
    discardPeriodicTasks();
  }));

  it('labels media library recordings as videos', fakeAsync(() => {
    spectator = createComponent();
    spectator.detectChanges();

    expect(spectator.component.mediaKindLabel(spectator.component.timelineItems()[0])).toBe('Video');
    discardPeriodicTasks();
  }));

  it('searches camera events in the DVR media library without changing the selected camera', fakeAsync(() => {
    spectator = createComponent();
    (spectator.component as unknown as {
      form: { controls: { query: { setValue: (value: string) => void } } };
    }).form.controls.query.setValue('谁倒了啤酒');
    const selectedBefore = spectator.component.selectedCameraLabel();
    spectator.component.search();
    spectator.detectChanges();
    tick();
    spectator.detectChanges();

    expect(api.search).toHaveBeenCalledWith(expect.objectContaining({
      source_scope: 'dvr_library',
      include_videos: true,
    }));
    expect(spectator.component.selectedCameraLabel()).toBe(selectedBefore);
    expect(scrollIntoViewSpy).toHaveBeenCalled();
    discardPeriodicTasks();
  }));

  it('renders live and playback tabs', fakeAsync(() => {
    spectator = createComponent();
    spectator.detectChanges();
    tick();
    spectator.detectChanges();

    expect(spectator.query('mat-tab-group')).toExist();
    expect(spectator.fixture.nativeElement.textContent).toContain('Live');
    expect(spectator.fixture.nativeElement.textContent).toContain('Playback');
    expect(spectator.fixture.nativeElement.textContent).not.toContain('Harbor Assistant Camera');
    discardPeriodicTasks();
  }));

  it('uses the camera room as the live title and keeps the camera name in the selector', fakeAsync(() => {
    api.cameraState = jest.fn(() => of(cameraState({
      cameraName: 'TP1',
      room: '客厅',
    })));
    spectator = createComponent();
    spectator.detectChanges();

    expect(spectator.query('.workbench-header h2')).toHaveText('客厅');
    expect(spectator.query('.camera-pills')).toHaveText('TP1');
    discardPeriodicTasks();
  }));

  it('keeps public DVR fixtures out of the live camera selector', fakeAsync(() => {
    api.cameraState = jest.fn(() => of(cameraState({ includeFixture: true })));
    spectator = createComponent();
    spectator.detectChanges();

    expect(spectator.query('.camera-pills')).toHaveText('Camera 192.168.3.231');
    expect(spectator.query('.camera-pills')).not.toHaveText('Public DVR Fixture');
    discardPeriodicTasks();
  }));

  it('sorts finalized recordings by the visible finalize time when available', fakeAsync(() => {
    spectator = createComponent();
    const componentState = spectator.component as unknown as {
      dvrTimeline: { set: (items: unknown[]) => void };
      optimisticMediaItems: { set: (items: unknown[]) => void };
      timelineItems: () => Array<{ file_path: string }>;
    };

    componentState.optimisticMediaItems.set([
      {
        device_id: 'cam-1',
        file_path: 'ui://recording',
        media_kind: 'recording',
        stream_kind: 'recording',
        started_at: '200',
        created_at: '200',
        ended_at: '200',
        duration_seconds: 0,
        retention_expires_at: '',
        size_bytes: 0,
        playable: false,
        indexed: false,
        local_status: 'finalizing',
        optimistic_key: 'recording:cam-1:200',
        local_display_at: '200',
      },
    ]);
    componentState.dvrTimeline.set([
      {
        device_id: 'cam-1',
        file_path: '/library/snapshot.jpg',
        media_kind: 'snapshot',
        stream_kind: 'snapshot',
        started_at: '150',
        created_at: '150',
        ended_at: '150',
        duration_seconds: 0,
        retention_expires_at: '',
        size_bytes: 100,
        playable: true,
        indexed: false,
      },
      {
        device_id: 'cam-1',
        file_path: '/library/recording.mp4',
        media_kind: 'recording',
        stream_kind: 'substream',
        started_at: '120',
        created_at: '120',
        ended_at: '200',
        duration_seconds: 80,
        retention_expires_at: '',
        size_bytes: 1000,
        playable: true,
        indexed: true,
        local_display_at: '200',
      },
    ]);

    expect(componentState.timelineItems()[0].file_path).toBe('ui://recording');
    expect(componentState.timelineItems()[1].file_path).toBe('/library/recording.mp4');
    discardPeriodicTasks();
  }));

  it('shows a starting recording badge before the start request resolves', fakeAsync(() => {
    const startSubject = new Subject<HarborAssistantSearchDvrStatusResponse>();
    api.startDvrRecording = jest.fn(() => startSubject.asObservable());
    spectator = createComponent();

    spectator.component.startRecording();
    spectator.detectChanges();

    expect(spectator.query('.recording-badge')).toHaveText('Starting');

    api.dvrStatus = jest.fn(() => of(dvrStatus('recording')));
    startSubject.next(dvrStatus('recording'));
    startSubject.complete();
    spectator.detectChanges();

    expect(spectator.query('.recording-badge')).toHaveText('REC');
    tick(3000);
    discardPeriodicTasks();
  }));

  it('shows finalizing state and a pending recording card while stopping', fakeAsync(() => {
    api.dvrStatus = jest.fn(() => of(dvrStatus('recording')));
    const stopSubject = new Subject<HarborAssistantSearchDvrStatusResponse>();
    api.stopDvrRecording = jest.fn(() => stopSubject.asObservable());
    spectator = createComponent();
    spectator.detectChanges();

    spectator.component.stopRecording();
    spectator.detectChanges();

    expect(spectator.query('.recording-badge')).toHaveText('Finalizing');
    expect(spectator.queryAll('.recent-media-card.pending').length).toBeGreaterThan(0);

    stopSubject.next(dvrStatus('stopped'));
    stopSubject.complete();
    spectator.detectChanges();
    expect(spectator.query('.recording-badge')).toHaveText('Finalizing');
    tick(3000);
    discardPeriodicTasks();
  }));

  it('clears action messages while preserving action errors', fakeAsync(() => {
    spectator = createComponent();

    spectator.component.captureSnapshot();
    snapshotSubject.error({ message: 'archive failed' });
    spectator.detectChanges();
    const componentState = spectator.component as unknown as {
      actionMessage: () => string | null;
      actionError: () => string | null;
    };
    expect(componentState.actionMessage()).toBe('Current preview was kept, but background archiving failed.');
    expect(componentState.actionError()).toBe('archive failed');

    tick(3000);
    spectator.detectChanges();

    expect(componentState.actionMessage()).toBeNull();
    expect(componentState.actionError()).toBe('archive failed');
    discardPeriodicTasks();
  }));
});

function cameraState(options: {
  cameraName?: string;
  room?: string | null;
  snapshotUrl?: string | null;
  snapshotCapability?: boolean;
  includeFixture?: boolean;
} = {}): HarborAssistantSearchCameraStateResponse {
  return {
    defaults: { selected_camera_device_id: 'cam-1' },
    devices: [
      {
        device_id: 'cam-1',
        name: options.cameraName ?? 'Camera 192.168.3.231',
        room: options.room,
        snapshot_url: options.snapshotUrl === undefined ? '/api/cameras/cam-1/snapshot.jpg' : options.snapshotUrl,
        capabilities: {
          snapshot: options.snapshotCapability ?? true,
          stream: true,
          ptz: false,
        },
      },
      ...(options.includeFixture ? [{
        device_id: 'public-fixture-dvr',
        name: 'Public DVR Fixture (not live camera)',
        snapshot_url: '/ui/assets/fixture.jpg',
        capabilities: {
          snapshot: false,
          stream: false,
          ptz: false,
        },
      }] : []),
    ],
  };
}

function dvrStatus(status = 'stopped'): HarborAssistantSearchDvrStatusResponse {
  return {
    generated_at: '1',
    statuses: [
      {
        device_id: 'cam-1',
        status,
        live_mjpeg_url: '/api/cameras/cam-1/live.mjpeg',
      },
    ],
  };
}

function fakeLiveVideo(options: Partial<HTMLVideoElement> = {}): HTMLVideoElement {
  return {
    autoplay: false,
    canPlayType: jest.fn(() => 'maybe'),
    currentTime: 0,
    defaultMuted: false,
    load: jest.fn(),
    muted: false,
    pause: jest.fn(),
    paused: true,
    play: jest.fn(() => Promise.resolve()),
    playbackRate: 1,
    playsInline: false,
    removeAttribute: jest.fn(),
    ...options,
  } as unknown as HTMLVideoElement;
}

function fakeTimeRanges(ranges: Array<readonly [number, number]>): TimeRanges {
  return {
    length: ranges.length,
    start: jest.fn((index: number) => ranges[index]?.[0] ?? 0),
    end: jest.fn((index: number) => ranges[index]?.[1] ?? 0),
  } as unknown as TimeRanges;
}

function liveSession(options: Partial<HarborAssistantCameraLiveSessionResponse> = {}): HarborAssistantCameraLiveSessionResponse {
  return {
    device_id: 'cam-1',
    session_id: 'live-test',
    status: 'running',
    playlist_url: '/api/beacon/cameras/cam-1/live/live-test/index.m3u8',
    playlist_ready: true,
    mode: 'hls_fmp4',
    codec: 'h264_copy',
    stream_profile: 'sub',
    started_at: '1714600000',
    updated_at: '1714600001',
    message: 'H.264 live remux is running',
    ...options,
  };
}

function dvrTimeline(): HarborAssistantSearchDvrTimelineResponse {
  return {
    generated_at: '1',
    recording_root: '/library',
    media_library_root: '/library',
    segments: [
      {
        device_id: 'cam-1',
        file_path: '/library/recordings/cam-1.mp4',
        media_kind: 'recording',
        stream_kind: 'substream',
        started_at: '1714600000',
        created_at: '1714600000',
        ended_at: '1714600060',
        duration_seconds: 60,
        duration_actual_seconds: 60,
        retention_expires_at: '',
        size_bytes: 4096,
        replay_url: '/api/knowledge/preview?path=/library/recordings/cam-1.mp4',
        thumbnail_url: '/api/knowledge/preview?path=/library/recordings/cam-1.mp4',
        playable: true,
        indexed: true,
      },
    ],
  };
}

function searchResponse(): HarborAssistantSearchResponse {
  return {
    query: '谁倒了啤酒',
    roots: [],
    total_matches: 1,
    documents: [],
    images: [],
    videos: [
      {
        modality: 'video',
        path: '/library/fixtures/beer.mp4',
        title: 'beer.mp4',
        score: 900,
        snippet: '有人在倒啤酒',
        content_source_kinds: ['video_sidecar'],
        content_indexed: true,
        filename_match_used: false,
        content_match_used: true,
      },
    ],
    reply_pack: { summary: '', citations: [] },
    supported_modalities: ['document', 'image', 'video'],
    pending_modalities: [],
    status: 'ok',
    degraded: false,
    blockers: [],
    warnings: [],
    source_scope: [],
    privacy_level: 'strict_local',
    resource_profile: 'cpu_only',
  };
}
