// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'ios/*', 'supabase/functions/*'],
  },
  {
    rules: {
      // No usamos React Compiler: estas reglas son orientativas. Cargar datos al montar es intencionado.
      'react-hooks/set-state-in-effect': 'warn',
      // Falsos positivos con los shared values de Reanimated (`sv.value = …`).
      'react-hooks/immutability': 'off',
      // TypeScript ya valida los miembros importados (p. ej. enums de expo-notifications).
      'import/namespace': 'off',
    },
  },
]);
