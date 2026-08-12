import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { HarborNaviDeviceSessionService } from './harbornavi-device-session.service';

describe('HarborNaviDeviceSessionService', () => {
  let httpMock: HttpTestingController;
  let service: HarborNaviDeviceSessionService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    service = TestBed.inject(HarborNaviDeviceSessionService);
  });

  afterEach(() => httpMock.verify());

  it('exchanges a trimmed one-time pairing code without exposing a browser token', async () => {
    const resultPromise = firstValueFrom(service.exchange('  pairing-code  '));
    const request = httpMock.expectOne('/api/harbor-gate/api/device-session/exchange');

    expect(request.request.method).toBe('POST');
    expect(request.request.body).toEqual({ pairing_code: 'pairing-code' });
    request.flush({
      authenticated: true,
      camera_id: 'camera-252',
      expires_at_epoch_seconds: 1234,
    });

    await expect(resultPromise).resolves.toEqual(expect.objectContaining({
      authenticated: true,
      camera_id: 'camera-252',
    }));
  });

  it('checks the HttpOnly session through the same-origin Gate endpoint', async () => {
    const resultPromise = firstValueFrom(service.status());
    const request = httpMock.expectOne('/api/harbor-gate/api/device-session');

    expect(request.request.method).toBe('GET');
    request.flush({
      authenticated: true,
      camera_id: 'camera-252',
      expires_at_epoch_seconds: 1234,
    });

    await expect(resultPromise).resolves.toEqual(expect.objectContaining({ authenticated: true }));
  });
});
