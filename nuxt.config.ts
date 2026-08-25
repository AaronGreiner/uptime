// https://nuxt.com/docs/api/configuration/nuxt-config
import { MONITOR_GROUP_ICONS } from './shared/utils/group'
import { MONITOR_STATUS_ICONS, MONITOR_TYPE_ICONS } from './shared/utils/monitor'
import { NOTIFICATION_PROVIDER_ICONS } from './shared/utils/notification'

// Names assembled at runtime are invisible to the scanner, so they are listed.
const dynamicIconNames = [
  ...MONITOR_GROUP_ICONS,
  ...Object.values(MONITOR_TYPE_ICONS),
  ...Object.values(MONITOR_STATUS_ICONS),
  ...Object.values(NOTIFICATION_PROVIDER_ICONS)
].map(name => name.replace(/^i-lucide-/, 'lucide:').replace(/^i-simple-icons-/, 'simple-icons:'))

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@nuxtjs/i18n',
    'nuxt-auth-utils'
  ],

  $development: {
    runtimeConfig: {
      session: {
        cookie: {
          /** Safari rejects Secure cookies served by the HTTP development server. */
          secure: false
        }
      }
    }
  },

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
    session: {
      cookie: {
        /** Session cookies must only leave the browser over HTTPS in production. */
        secure: true
      }
    },
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
    notifications: {
      /** Set to false to queue notifications without ever delivering them. */
      enabled: true,
      /** Hard deadline for one delivery attempt, enforced by the queue. */
      sendTimeoutMs: 15000,
      /** Attempts per delivery before it is given up on. */
      maxAttempts: 4,
      /** How many deliveries the worker handles per tick. */
      concurrency: 5,
      /** How often the worker looks for due deliveries. */
      tickIntervalMs: 2000
    },
    retention: {
      /** Days of raw heartbeats to keep before they are pruned. */
      heartbeatDays: 7,
      /** Days of hourly aggregates to keep before they are pruned. */
      hourlyStatsDays: 365,
      /** Days of delivery history to keep before it is pruned. */
      notificationDays: 30
    },
    seed: {
      /** Creates demo monitors and dashboards on an empty database. */
      demoData: false,
      /** Days of synthetic history generated for demo monitors. */
      demoHistoryDays: 7
    },
    public: {
      appName: 'Uptime',
      /**
       * Public base URL of this instance, without a trailing slash. Notifications
       * link back to the monitor they are about; when this is empty they leave
       * the link out rather than pointing at localhost.
       */
      appUrl: ''
    }
  },

  compatibilityDate: '2026-06-30',

  nitro: {
    preset: 'bun',
    externals: {
      external: ['bun:sqlite']
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
  },

  icon: {
    provider: 'none',
    clientBundle: {
      icons: dynamicIconNames,
      scan: true
    }
  }
})
