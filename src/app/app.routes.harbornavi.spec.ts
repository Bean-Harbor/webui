import { rootRoutes } from 'app/app.routes.harbornavi';

describe('HarborNavi routes', () => {
  it('opens Harbor Assistant without authentication or device-pairing routes', () => {
    const assistantRoute = rootRoutes.find((route) => route.path === 'harbor-assistant');

    expect(rootRoutes.some((route) => route.path === 'signin')).toBe(false);
    expect(rootRoutes.some((route) => route.path === 'device-pairing')).toBe(false);
    expect(assistantRoute).toBeDefined();
    expect(assistantRoute?.canActivate).toBeUndefined();
  });
});
