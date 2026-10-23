const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const eslintPluginPrettierRecommended = require('eslint-plugin-prettier/recommended');

module.exports = defineConfig([
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    ignores: ['android/*', 'ios/*', 'dist/*', '.expo/*', 'coverage/*', 'expo-env.d.ts'],
  },
  {
    // PlayerService is the only module that talks to the audio engine; UI goes through the store.
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['src/player/PlayerService.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { paths: [{ name: 'expo-audio', message: 'Use the player store (src/stores/player).' }] },
      ],
    },
  },
]);
