import { inject } from '@angular/core';
import { Router, UrlTree } from '@angular/router';
import { Observable, catchError, map, of } from 'rxjs';
import { HarborNaviDeviceSessionService } from './harbornavi-device-session.service';

export function harborNaviDeviceSessionGuard(): Observable<boolean | UrlTree> {
  const router = inject(Router);
  return inject(HarborNaviDeviceSessionService).status().pipe(
    map((session) => session.authenticated || router.createUrlTree(['/device-pairing'])),
    catchError(() => of(router.createUrlTree(['/device-pairing']))),
  );
}
