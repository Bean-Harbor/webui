import { HttpErrorResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TranslateModule, TranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { HarborNaviDevicePairingComponent } from './harbornavi-device-pairing.component';
import { HarborNaviDeviceSessionService } from './harbornavi-device-session.service';

describe('HarborNaviDevicePairingComponent', () => {
  const session = {
    exchange: jest.fn(),
    status: jest.fn(() => throwError(() => new HttpErrorResponse({ status: 401 }))),
  };
  const router = { navigateByUrl: jest.fn(() => Promise.resolve(true)) };

  beforeEach(() => {
    jest.clearAllMocks();
    TestBed.configureTestingModule({
      imports: [HarborNaviDevicePairingComponent, TranslateModule.forRoot()],
      providers: [
        { provide: HarborNaviDeviceSessionService, useValue: session },
        { provide: Router, useValue: router },
      ],
    });
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('zh-hans', {
      'Pairing code is invalid or expired.': '配对码无效或已过期。',
    });
    translate.use('zh-hans');
  });

  it('exchanges the pairing code and opens Harbor Assistant', () => {
    session.exchange.mockReturnValue(of({ authenticated: true, camera_id: 'camera-252' }));
    const fixture = TestBed.createComponent(HarborNaviDevicePairingComponent);
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    const form = fixture.nativeElement.querySelector('form') as HTMLFormElement;

    input.value = 'pairing-code';
    input.dispatchEvent(new Event('input'));
    form.dispatchEvent(new Event('submit'));
    fixture.detectChanges();

    expect(session.exchange).toHaveBeenCalledWith('pairing-code');
    expect(router.navigateByUrl).toHaveBeenCalledWith('/harbor-assistant');
  });

  it('keeps the form visible when the pairing code is rejected', () => {
    session.exchange.mockReturnValue(throwError(() => new HttpErrorResponse({ status: 401 })));
    const fixture = TestBed.createComponent(HarborNaviDevicePairingComponent);
    fixture.detectChanges();
    const component = fixture.componentInstance;

    component.form.controls.pairingCode.setValue('invalid-code');
    component.pair();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('配对码无效或已过期');
    expect(router.navigateByUrl).not.toHaveBeenCalledWith('/harbor-assistant');
  });
});
