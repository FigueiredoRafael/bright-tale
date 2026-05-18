import * as Sentry from "@sentry/nextjs";

const SENTRY_DSN =
  "https://af581ebe8600c74d73926451183afe6b@o4511226892517376.ingest.us.sentry.io/4511226899202048";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    Sentry.init({
      dsn: SENTRY_DSN,
      tracesSampleRate: 1,
      enableLogs: true,
      sendDefaultPii: true,
    });
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    Sentry.init({
      dsn: SENTRY_DSN,
      tracesSampleRate: 1,
      enableLogs: true,
      sendDefaultPii: true,
    });
  }
}

export const onRequestError = Sentry.captureRequestError;
