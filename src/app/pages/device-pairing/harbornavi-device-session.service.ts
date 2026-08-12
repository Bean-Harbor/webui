import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';

export interface HarborNaviDeviceSession {
  authenticated: boolean;
  camera_id: string;
  expires_at_epoch_seconds: number;
}

@Injectable({ providedIn: 'root' })
export class HarborNaviDeviceSessionService {
  private readonly http = inject(HttpClient);

  status(): Observable<HarborNaviDeviceSession> {
    return this.http.get<HarborNaviDeviceSession>('/api/harbor-gate/api/device-session');
  }

  exchange(pairingCode: string): Observable<HarborNaviDeviceSession> {
    return this.http.post<HarborNaviDeviceSession>(
      '/api/harbor-gate/api/device-session/exchange',
      { pairing_code: pairingCode.trim() },
    );
  }
}
