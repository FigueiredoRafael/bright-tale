"use client";

import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function SentryExamplePage() {
  const { toast } = useToast();

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-heading-md">Sentry Test Page</h1>
      <Button
        variant="destructive"
        onClick={async () => {
          Sentry.captureMessage("Logado no PC do Lutero", "info");
          await Sentry.flush(5000);
          toast({ title: "Sent to Sentry!" });
        }}
      >
        Send Test Message
      </Button>
    </div>
  );
}
