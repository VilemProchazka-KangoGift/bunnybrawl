import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';
import i18n from '../i18n';

// Set language to English for tests so existing string assertions work
i18n.changeLanguage('en');

// Mock public-dir asset imports — Vite's ?url suffix resolves /logo.png to
// file:///logo.png which Node can't import. Provide a stub URL instead.
vi.mock('/logo.png?url', () => ({ default: '/logo.png' }));
