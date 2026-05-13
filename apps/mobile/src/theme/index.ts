export const colors = {
  primary: '#16a34a',        // green-600
  primaryDark: '#15803d',    // green-700
  primaryLight: '#dcfce7',   // green-100
  accent: '#0ea5e9',         // sky-500

  bg: '#f8fafc',             // slate-50
  surface: '#ffffff',        // white
  surfaceHover: '#f1f5f9',   // slate-100
  border: '#e2e8f0',         // slate-200

  textPrimary: '#0f172a',    // slate-900
  textSecondary: '#475569',  // slate-600
  textMuted: '#94a3b8',      // slate-400
  textOnPrimary: '#ffffff',

  success: '#10b981',        // emerald-500
  successBg: '#d1fae5',      // emerald-100
  error: '#ef4444',          // red-500
  errorBg: '#fee2e2',        // red-100
  warning: '#f59e0b',        // amber-500
  warningBg: '#fef3c7',      // amber-100
  info: '#3b82f6',           // blue-500
  infoBg: '#dbeafe',         // blue-100

  spoofed: '#dc2626',        // red-600
  spoofedBg: '#fecaca',      // red-200
};

export const spacing = {
  xs: 4, sm: 8, md: 16, lg: 24, xl: 32, xxl: 48,
};

export const radius = {
  sm: 8, md: 12, lg: 16, xl: 24, full: 9999,
};

export const typography = {
  display: { fontSize: 28, fontWeight: '700' as const, color: colors.textPrimary },
  h1: { fontSize: 22, fontWeight: '700' as const, color: colors.textPrimary },
  h2: { fontSize: 18, fontWeight: '600' as const, color: colors.textPrimary },
  h3: { fontSize: 16, fontWeight: '600' as const, color: colors.textPrimary },
  body: { fontSize: 15, fontWeight: '400' as const, color: colors.textPrimary },
  bodySmall: { fontSize: 13, fontWeight: '400' as const, color: colors.textSecondary },
  caption: { fontSize: 11, fontWeight: '500' as const, color: colors.textMuted },
  label: { fontSize: 12, fontWeight: '600' as const, color: colors.textSecondary, textTransform: 'uppercase' as const, letterSpacing: 0.5 },
};

export const shadow = {
  sm: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1 },
  md: { shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 3 },
  lg: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 16, elevation: 6 },
};
