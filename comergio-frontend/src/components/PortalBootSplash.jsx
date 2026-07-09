import { ColibriBootSplash } from './ColibriBootSplash';
import { getPortalBootSplashContent } from '../lib/portalBootSplash';

export function PortalBootSplash({
  portal = 'default',
  embedded = false,
  minimal = false,
  className = '',
  ...overrides
}) {
  const content = getPortalBootSplashContent(portal, overrides);

  return (
    <ColibriBootSplash
      {...content}
      className={`is-institutional-portal${className ? ` ${className}` : ''}`}
      embedded={embedded}
      indeterminate
      minimal={minimal}
    />
  );
}
