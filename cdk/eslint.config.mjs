import tseslint from 'typescript-eslint';
import awscdk from 'eslint-plugin-awscdk';

export default [
  { ignores: ['node_modules/**', 'cdk.out*/**'] },
  ...tseslint.configs.recommended,
  {
    files: ['lib/**/*.ts'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { awscdk },
    rules: {
      'awscdk/no-mutable-property-of-props-interface': 'error',
      'awscdk/no-construct-in-interface': 'error',
    },
  },
];
