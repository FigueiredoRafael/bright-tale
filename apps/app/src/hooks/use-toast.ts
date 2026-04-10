// Simple toast hook using sonner
import { toast as sonnerToast } from "sonner";

interface ToastProps {
  title?: string;
  description?: string;
  variant?: "default" | "destructive" | "success";
}

export function useToast() {
  const toast = ({ title, description, variant = "default" }: ToastProps) => {
    const message = title || (variant === "destructive" ? "Error" : "Success");

    if (variant === "destructive") {
      sonnerToast.error(message, {
        description,
      });
    } else if (variant === "success") {
      sonnerToast.success(message, {
        description,
      });
    } else {
      sonnerToast(message, {
        description,
      });
    }
  };

  return { toast };
}
