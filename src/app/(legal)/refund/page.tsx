import { notFound } from "next/navigation";
import { connection } from "next/server";
import { EmailLink, LegalPage } from "@/components/legal/legal-page";
import { APP_NAME } from "@/config/app";
import { billingEnabled } from "@/config/features";
import { legalDetails } from "@/config/legal";

export const metadata = { title: "Refunds & cancellation" };

export default function RefundPage() {
  if (!billingEnabled()) notFound(); // nothing to refund while payments are off
  return (
    <LegalPage
      title="Refunds & cancellation"
      intro="Cancel any time. Pro stays until the end of the period you paid for."
    >
      <RefundBody />
    </LegalPage>
  );
}

async function RefundBody() {
  await connection();
  const d = legalDetails();
  return (
    <>
      <h2>Cancelling Pro</h2>
      <ul>
        <li>Go to Plan &amp; billing and choose Cancel renewal. You won&rsquo;t be charged again.</li>
        <li>Pro stays on until the end of the month or year you already paid for, then your account moves to Free.</li>
        <li>Nothing you&rsquo;ve recorded is lost when Pro ends.</li>
        <li>Cancelling the mandate in your UPI app or with your bank also stops renewals.</li>
        <li>Deleting your account cancels the renewal straight away.</li>
      </ul>

      <h2>Refunds</h2>
      <p>
        Payments for Pro aren&rsquo;t refunded, including for a period you&rsquo;ve partly used, since you keep Pro
        until it ends. We will refund a payment in full if:
      </p>
      <ul>
        <li>you were charged twice for the same period;</li>
        <li>you were charged after you cancelled;</li>
        <li>you paid but Pro didn&rsquo;t switch on, and we couldn&rsquo;t fix it.</li>
      </ul>
      <p>
        To ask for one, write to <EmailLink email={d.email} /> within 30 days of the payment, with its date and amount.
        We&rsquo;ll reply within 2 working days. Approved refunds go back to the way you paid, through Razorpay, usually
        within 5 to 7 working days.
      </p>

      <h2>Delivery</h2>
      <p>
        {APP_NAME} is an online service; nothing is shipped. Pro switches on as soon as Razorpay confirms your payment,
        usually within a minute.
      </p>
    </>
  );
}
