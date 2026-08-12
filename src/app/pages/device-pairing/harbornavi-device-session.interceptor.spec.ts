import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { harborNaviDeviceSessionInterceptor } from './harbornavi-device-session.interceptor';

describe('harborNaviDeviceSessionInterceptor', () => {
  const router = { navigateByUrl: jest.fn(() => Promise.resolve(true)) };
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    jest.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([harborNaviDeviceSessionInterceptor])),
        provideHttpClientTesting(),
        { provide: Router, useValue: router },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('redirects an expired observation session to device pairing', async () => {
    const requestPromise = firstValueFrom(http.get(
      '/api/harbor-gate/api/beacon/cameras/camera-252/cat-detection/observation',
    )).catch(() => undefined);
    httpMock.expectOne(
      '/api/harbor-gate/api/beacon/cameras/camera-252/cat-detection/observation',
    ).flush({}, { status: 401, statusText: 'Unauthorized' });

    await requestPromise;
    expect(router.navigateByUrl).toHaveBeenCalledWith('/device-pairing');
  });

  it('does not redirect a rejected pairing-code exchange', async () => {
    const requestPromise = firstValueFrom(http.post(
      '/api/harbor-gate/api/device-session/exchange',
      { pairing_code: 'invalid' },
    )).catch(() => undefined);
    httpMock.expectOne('/api/harbor-gate/api/device-session/exchange')
      .flush({}, { status: 401, statusText: 'Unauthorized' });

    await requestPromise;
    expect(router.navigateByUrl).not.toHaveBeenCalled();
  });
});
