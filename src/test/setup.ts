import '@testing-library/jest-dom/vitest';
import i18n from '../i18n';
import { registerBuiltinEntities } from '../engine/entities';

// Set language to English for tests so existing string assertions work
i18n.changeLanguage('en');

// Entities must be registered before Simulator / Renderer / createInitialMatchState
// runs in any test. registerBuiltinEntities is idempotent.
registerBuiltinEntities();
