import { renderToStaticMarkup } from 'react-dom/server';

import { BrandLogomark, BrandWordmark } from './brand';

test('BrandWordmark renders an svg whose height follows the size prop', () => {
  const html = renderToStaticMarkup(<BrandWordmark size={52} />);
  expect(html).toContain('<svg');
  expect(html).toContain('height="52"');
});

test('BrandLogomark renders a square svg sized by the size prop', () => {
  const html = renderToStaticMarkup(<BrandLogomark size={40} />);
  expect(html).toContain('width="40"');
  expect(html).toContain('height="40"');
});
