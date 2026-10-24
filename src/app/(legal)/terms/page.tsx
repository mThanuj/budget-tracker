import Link from "next/link";
import { connection } from "next/server";
import { EmailLink, LegalPage, operatorName } from "@/components/legal/legal-page";
import { APP_NAME } from "@/config/app";
import { legalDetails } from "@/config/legal";
import { priceLabel } from "@/config/plans";

export const metadata = { title: "Terms of use" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of use" intro={`The agreement between you and ${APP_NAME}. By using it, you agree to these terms.`}>
      <TermsBody />
    </LegalPage>
  );
}

async function TermsBody() {
  await connection();
  const d = legalDetails();
  return (
    <>
      <h2>What {APP_NAME} is</h2>
      <p>
        {APP_NAME} helps you keep track of your money: wallets, spending, budgets, goals and recurring bills, with optional AI help.
        It&rsquo;s run by {operatorName(d.operator)}.
      </p>

      <h2>Not financial advice</h2>
      <p>
        {APP_NAME} is a tracking tool. Its numbers come from what you enter, and its AI answers and reports can be wrong. Nothing in
        it is financial, investment, tax or legal advice. Check anything important before you rely on it. {APP_NAME} isn&rsquo;t a
        bank: it never holds or moves your money.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You sign in with Google. Keep your Google account secure; you&rsquo;re responsible for what happens in your account.</li>
        <li>You must be 18 or older. One account per person.</li>
      </ul>

      <h2>Fair use</h2>
      <p>
        Don&rsquo;t misuse the service: no attacking or overloading it, no automated or bulk use of the AI features, no getting
        around limits, and nothing illegal. We may suspend accounts that do.
      </p>

      <h2>Free and Pro</h2>
      <ul>
        <li>The Free plan includes everything for tracking money, with daily limits on the AI features.</li>
        <li>
          Pro costs {priceLabel("monthly")} or {priceLabel("yearly")}, in Indian rupees, and adds higher AI limits and Insights
          reports. Current limits are shown on the Plan &amp; billing page.
        </li>
        <li>
          Pro renews automatically through Razorpay (UPI Autopay or card) until you cancel. You can cancel any time from Plan &amp;
          billing; Pro then stays until the end of the period you paid for.
        </li>
        <li>
          If a renewal payment fails, Razorpay tries again for a few days. If it still fails, your account moves to Free. Nothing you
          recorded is lost.
        </li>
        <li>
          We&rsquo;ll tell you at least 30 days before a price change applies to your renewal. Refunds are covered in our{" "}
          <Link href="/refund">refund and cancellation policy</Link>.
        </li>
      </ul>

      <h2>Your data</h2>
      <p>
        What you enter stays yours. You let us store and process it only to run {APP_NAME} for you, as described in our{" "}
        <Link href="/privacy">privacy policy</Link>. You can download your entries or delete your account at any time.
      </p>

      <h2>Changes to the service</h2>
      <p>
        We work to keep {APP_NAME} running smoothly but can&rsquo;t promise it will never be down. Features may change. If we ever shut{" "}
        {APP_NAME} down, we&rsquo;ll give at least 30 days&rsquo; notice so you can download your data.
      </p>

      <h2>Limits on liability</h2>
      <p>
        {APP_NAME} is provided as it is. As far as the law allows, we aren&rsquo;t responsible for decisions you make based on it, or
        for indirect losses. Our total responsibility for any claim is limited to what you paid us in the 12 months before it.
      </p>

      <h2>Ending your account</h2>
      <p>
        You can delete your account from Settings whenever you like. We may close accounts that break these terms, and will tell you
        why unless the law stops us.
      </p>

      <h2>Law</h2>
      <p>These terms are governed by the laws of India{d.city ? `, and disputes go to the courts in ${d.city}` : ""}.</p>

      <h2>Changes to these terms</h2>
      <p>
        If we change these terms, we&rsquo;ll update this page and its date, and tell you in the app about important changes.
      </p>

      <h2>Contact</h2>
      <p>
        Questions? Write to <EmailLink email={d.email} />.
      </p>
    </>
  );
}
