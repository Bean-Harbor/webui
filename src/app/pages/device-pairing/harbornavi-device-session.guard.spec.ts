import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { firstValueFrom, of, throwError } from 'rxjs';
import { harborNaviDeviceSessionGuard } from './harbornavi-device-session.guard';
import { HarborNaviDeviceSessionService } from './harbornavi-device-session.service';

describe('harborNaviDeviceSessionGuard', () => {
  const session = { status: jest.fn() };
  const pairingTree = { pairing: true };
  const router = { createUrlTree: jest.fn(() => pairingTree) };

  beforeEach(() => {
    jest.clearAllMocks();
    TestBed.configureTestingModule({
      providers: [
        { provide: HarborNaviDeviceSessionService, useValue: session },
        { provide: Router, useValue: router },
      ],
    });
  });

  it('allows an authenticated device session', async () => {
    session.status.mockReturnValue(of({ authenticated: true }));

    const result = await TestBed.runInInjectionContext(
      () => firstValueFrom(harborNaviDeviceSessionGuard()),
    );

    expect(result).toBe(true);
  });

  it('redirects an invalid or expired session to device pairing', async () => {
    session.status.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));

    const result = await TestBed.runInInjectionContext(
      () => firstValueFrom(harborNaviDeviceSessionGuard()),
    );

    expect(result).toBe(pairingTree);
    expect(router.createUrlTree).toHaveBeenCalledWith(['/device-pairing']);
  });
});
