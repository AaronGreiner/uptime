// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxtjs/i18n',
    'nuxt-auth-utils'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  colorMode: {
    preference: 'system',
    fallback: 'dark',
    storageKey: 'uptime-color-mode'
  },

  runtimeConfig: {
    /** Absolute or cwd-relative path to the SQLite database file. */
    databasePath: './data/uptime.db',
    /** Folder holding the drizzle-kit generated migrations. */
    migrationsDir: './drizzle',
    admin: {
      /** Username of the single admin account, seeded on first start. */
      username: 'admin',
      /** Password for the admin account. Generated randomly when left empty. */
      password: ''
    },
    scheduler: {
      /** Set to false to run the app without executing any checks. */
      enabled: true,
      /** How many checks may run at the same time. */
      concurrency: 10,
      /** How often the scheduler looks for due monitors. */
      tickIntervalMs: 1000
    },
    retention: {
      /** Days of raw heartbeats to keep before they are pruned. */
      heartbeatDays: 7,
      /** Days of hourly aggregates to keep before they are pruned. */
      hourlyStatsDays: 365
    },
    seed: {
      /** Creates demo monitors and dashboards on an empty database. */
      demoData: false,
      /** Days of synthetic history generated for demo monitors. */
      demoHistoryDays: 7
    },
    public: {
      appName: 'Uptime'
    }
  },

  compatibilityDate: '2026-06-30',

  nitro: {
    // better-sqlite3 ships a native binding and must not be bundled.
    externals: {
      external: ['better-sqlite3']
    }
  },

  vite: {
    optimizeDeps: {
      exclude: ['better-sqlite3']
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  i18n: {
    defaultLocale: 'en',
    strategy: 'no_prefix',
    locales: [
      { code: 'en', name: 'English', language: 'en-US', file: 'en.json' },
      { code: 'de', name: 'Deutsch', language: 'de-DE', file: 'de.json' }
    ],
    detectBrowserLanguage: {
      useCookie: true,
      cookieKey: 'uptime-locale',
      alwaysRedirect: false,
      fallbackLocale: 'en',
      redirectOn: 'root'
    }
  }
})
