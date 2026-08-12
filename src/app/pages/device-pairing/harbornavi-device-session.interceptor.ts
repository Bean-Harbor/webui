import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

const observationPath = '/api/harbor-gate/api/beacon/cameras/';

export const harborNaviDeviceSessionInterceptor: HttpInterceptorFn = (request, next) => {
  const router = inject(Router);
  return next(request).pipe(
    catchError((error: unknown) => {
      if (
        error instanceof HttpErrorResponse
        && [401, 403].includes(error.status)
        && request.url.startsWith(observationPath)
        && request.url.includes('/cat-detection/observation')
      ) {
        router.navigateByUrl('/device-pairing').catch((): undefined => undefined);
      }
      return throwError(() => error);
    }),
  );
};
