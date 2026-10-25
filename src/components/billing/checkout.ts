// Loads Razorpay Checkout on demand, so pages that never pay don't fetch it.

type CheckoutResponse = { razorpay_payment_id: string; razorpay_subscription_id: string; razorpay_signature: string };
type CheckoutOptions = {
  key: string;
  subscription_id: string;
  name: string;
  description: string;
  prefill: { name: string; email: string };
  theme: { color: string };
  handler: (response: CheckoutResponse) => void;
  modal: { ondismiss: () => void };
};
type RazorpayInstance = {
  open: () => void;
  on: (event: "payment.failed", cb: (r: { error?: { description?: string } }) => void) => void;
};

declare global {
  interface Window {
    Razorpay?: new (options: CheckoutOptions) => RazorpayInstance;
  }
}

let loading: Promise<void> | null = null;

function loadScript() {
  if (window.Razorpay) return Promise.resolve();
  loading ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      loading = null;
      script.remove();
      reject(new Error("Couldn't load Razorpay Checkout"));
    };
    document.body.appendChild(script);
  });
  return loading;
}

export async function openCheckout(
  options: Omit<CheckoutOptions, "handler" | "modal" | "theme">,
  on: { paid: (r: CheckoutResponse) => void; closed: () => void; failed: (message: string) => void },
) {
  await loadScript();
  const rzp = new window.Razorpay!({
    ...options,
    theme: { color: "#0f6e66" },
    handler: on.paid,
    modal: { ondismiss: on.closed },
  });
  rzp.on("payment.failed", (r) => on.failed(r.error?.description ?? "The payment didn't go through."));
  rzp.open();
}
