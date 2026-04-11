// Simple toast hook using sonner
import { toast as sonnerToast } from "sonner";

interface ToastProps {
  title?: string;
  description?: string;
  variant?: "default" | "destructive" | "success";
}

// Module-level stable references. The hook returns the SAME function and
// object on every render, so consumers using `toast` as a useCallback /
// useEffect dependency do not create new closures on every render — which
// was the cause of an infinite fetch loop on the Projects page (SearchBar
// debounce effect re-ran every render because onSearch identity churned).
function toast({ title, description, variant = "default" }: ToastProps): void {
  const message = title || (variant === "destructive" ? "Error" : "Success");

  if (variant === "destructive") {
    sonnerToast.error(message, { description });
  } else if (variant === "success") {
    sonnerToast.success(message, { description });
  } else {
    sonnerToast(message, { description });
  }
}

const toastApi = { toast } as const;

export function useToast(): { toast: typeof toast } {
  return toastApi;
}
