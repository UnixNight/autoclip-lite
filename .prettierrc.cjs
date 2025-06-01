module.exports = {
  tabWidth: 2,
  useTabs: false,
  semi: false,
  singleQuote: true,
  trailingComma: 'all',
  printWidth: 100,
  experimentalTernaries: true,

  tailwindFunctions: ['cn', 'cva'],

  overrides: [
    {
      files: '*.astro',
      options: {
        parser: 'astro',
      },
    },
  ],

  plugins: ['prettier-plugin-astro', 'prettier-plugin-tailwindcss'],
}
