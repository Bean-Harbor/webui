import { Routes } from '@angular/router';
import { harborNaviDeviceSessionGuard } from 'app/pages/device-pairing/harbornavi-device-session.guard';

export const rootRoutes: Routes = [
  {
    path: '',
    redirectTo: 'harbor-assistant',
    pathMatch: 'full',
  },
  {
    path: 'device-pairing',
    loadComponent: () => import(
      'app/pages/device-pairing/harbornavi-device-pairing.component'
    ).then((module) => module.HarborNaviDevicePairingComponent),
  },
  {
    path: 'harbor-assistant',
    canActivate: [harborNaviDeviceSessionGuard],
    loadChildren: () => import('app/pages/harbor-assistant/harbor-assistant.routes').then((module) => module.harborAssistantRoutes),
  },
  {
    path: '**',
    redirectTo: 'harbor-assistant',
    pathMatch: 'full',
  },
];
