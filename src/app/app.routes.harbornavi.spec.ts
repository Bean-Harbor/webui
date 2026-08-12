import { rootRoutes } from 'app/app.routes.harbornavi';

describe('HarborNavi routes', () => {
  it('opens Harbor Assistant directly without the HarborOS authentication shell', () => {
    const assistantRoute = rootRoutes.find((route) => route.path === 'harbor-assistant');

    expect(rootRoutes.some((route) => route.path === 'signin')).toBe(false);
    expect(assistantRoute).toBeDefined();
    expect(assistantRoute?.canActivate).toBeUndefined();
  });
});
