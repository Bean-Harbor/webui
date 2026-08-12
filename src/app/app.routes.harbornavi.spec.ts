import { rootRoutes } from 'app/app.routes.harbornavi';

describe('HarborNavi routes', () => {
  it('protects Harbor Assistant with the device session without the HarborOS authentication shell', () => {
    const assistantRoute = rootRoutes.find((route) => route.path === 'harbor-assistant');
    const pairingRoute = rootRoutes.find((route) => route.path === 'device-pairing');

    expect(rootRoutes.some((route) => route.path === 'signin')).toBe(false);
    expect(pairingRoute).toBeDefined();
    expect(assistantRoute).toBeDefined();
    expect(assistantRoute?.canActivate).toHaveLength(1);
  });
});
