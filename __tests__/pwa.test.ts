/**
 * Tests for PWA manifest and meta tag integration:
 * 1. manifest.json contains required PWA fields
 * 2. index.html includes manifest link and PWA meta tags
 * 3. Service worker file exists and is registered in index.tsx
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const ROOT = resolve(__dirname, '..');

describe('PWA manifest', () => {
  const manifest = JSON.parse(
    readFileSync(resolve(ROOT, 'public/manifest.json'), 'utf-8')
  );

  it('uses CoachX branding', () => {
    expect(manifest.name).toContain('CoachX');
    expect(manifest.short_name).toContain('CoachX');
  });

  it('has a name and short_name', () => {
    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
  });

  it('has start_url set to "/"', () => {
    expect(manifest.start_url).toBe('/');
  });

  it('has standalone display mode', () => {
    expect(manifest.display).toBe('standalone');
  });

  it('has theme_color and background_color', () => {
    expect(manifest.theme_color).toBeTruthy();
    expect(manifest.background_color).toBeTruthy();
  });

  it('uses premium dark shell colors', () => {
    expect(manifest.theme_color).toBe('#05070A');
    expect(manifest.background_color).toBe('#05070A');
  });

  it('has at least one icon entry', () => {
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it('includes a 192x192 icon', () => {
    const icon192 = manifest.icons.find((i: { sizes: string }) =>
      i.sizes.includes('192x192')
    );
    expect(icon192).toBeDefined();
    expect(icon192.type).toBe('image/png');
  });

  it('includes a 512x512 icon', () => {
    const icon512 = manifest.icons.find((i: { sizes: string }) =>
      i.sizes.includes('512x512')
    );
    expect(icon512).toBeDefined();
    expect(icon512.type).toBe('image/png');
  });
});

describe('index.html PWA meta tags', () => {
  const html = readFileSync(resolve(ROOT, 'index.html'), 'utf-8');

  it('uses CoachX branding in title and app name', () => {
    expect(html).toContain('CoachX AI');
    expect(html).toContain('apple-mobile-web-app-title');
    expect(html).toContain('CoachX');
  });

  it('links to manifest.json', () => {
    expect(html).toContain('rel="manifest"');
    expect(html).toContain('/manifest.json');
  });

  it('includes theme-color meta tag', () => {
    expect(html).toContain('name="theme-color"');
  });

  it('includes apple-mobile-web-app-capable meta tag', () => {
    expect(html).toContain('apple-mobile-web-app-capable');
  });

  it('includes apple-mobile-web-app-title meta tag', () => {
    expect(html).toContain('apple-mobile-web-app-title');
  });

  it('uses app-like iOS status bar styling', () => {
    expect(html).toContain('apple-mobile-web-app-status-bar-style');
    expect(html).toContain('black-translucent');
  });

  it('includes apple-touch-icon link pointing to PNG', () => {
    expect(html).toContain('apple-touch-icon');
    expect(html).toContain('apple-touch-icon.png');
  });

  it('includes viewport-fit=cover for iOS safe areas', () => {
    expect(html).toContain('viewport-fit=cover');
  });
});

describe('service worker', () => {
  const swContent = readFileSync(resolve(ROOT, 'public/sw.js'), 'utf-8');
  const indexContent = readFileSync(resolve(ROOT, 'index.tsx'), 'utf-8');

  it('service worker file exists and has install handler', () => {
    expect(swContent).toContain("addEventListener('install'");
  });

  it('service worker file has activate handler', () => {
    expect(swContent).toContain("addEventListener('activate'");
  });

  it('service worker file has fetch handler', () => {
    expect(swContent).toContain("addEventListener('fetch'");
  });

  it('index.tsx registers the service worker', () => {
    expect(indexContent).toContain("serviceWorker");
    expect(indexContent).toContain("register('/sw.js')");
  });
});
