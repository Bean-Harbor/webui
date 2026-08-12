import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatButton } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { Router } from '@angular/router';
import { TranslateModule } from '@ngx-translate/core';
import { finalize } from 'rxjs';
import { HarborNaviDeviceSessionService } from './harbornavi-device-session.service';

@Component({
  selector: 'ix-harbornavi-device-pairing',
  templateUrl: './harbornavi-device-pairing.component.html',
  styleUrl: './harbornavi-device-pairing.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [MatButton, MatFormFieldModule, MatInputModule, ReactiveFormsModule, TranslateModule],
})
export class HarborNaviDevicePairingComponent implements OnInit {
  private readonly formBuilder = inject(NonNullableFormBuilder);
  private readonly router = inject(Router);
  private readonly sessions = inject(HarborNaviDeviceSessionService);

  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);
  readonly form = this.formBuilder.group({
    pairingCode: ['', Validators.required],
  });

  ngOnInit(): void {
    this.sessions.status().subscribe({
      next: (session) => {
        if (session.authenticated) {
          this.router.navigateByUrl('/harbor-assistant').catch((): undefined => undefined);
        }
      },
      error: () => undefined,
    });
  }

  pair(): void {
    if (this.form.invalid || this.busy()) {
      this.form.markAllAsTouched();
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    this.sessions.exchange(this.form.controls.pairingCode.value).pipe(
      finalize(() => this.busy.set(false)),
    ).subscribe({
      next: () => {
        this.router.navigateByUrl('/harbor-assistant').catch((): undefined => undefined);
      },
      error: () => this.error.set('Pairing code is invalid or expired.'),
    });
  }
}
