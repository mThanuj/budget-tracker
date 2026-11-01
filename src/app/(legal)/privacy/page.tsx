import { connection } from "next/server";
import { EmailLink, LegalPage, operatorName } from "@/components/legal/legal-page";
import { APP_NAME } from "@/config/app";
import { billingEnabled } from "@/config/features";
import { legalDetails } from "@/config/legal";
import { sentryDsn } from "@/lib/monitoring";

export const metadata = { title: "Privacy policy" };

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy policy"
      intro={`What ${APP_NAME} collects, why, and what you can do about it. In short: your money data is yours, it's never sold, and there are no ads or trackers.`}
    >
      <PrivacyBody />
    </LegalPage>
  );
}

async function PrivacyBody() {
  await connection();
  const d = legalDetails();
  const billing = billingEnabled();
  const monitoring = Boolean(sentryDsn());
  return (
    <>
      <h2>Who we are</h2>
      <p>
        {APP_NAME} is run by {operatorName(d.operator)}
        {d.address ? `, ${d.address}` : ""}. For anything about your data, write to <EmailLink email={d.email} />.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Your Google account basics</strong> when you sign in: name, email address and profile photo. We never
          see your Google password.
        </li>
        <li>
          <strong>What you put in:</strong> wallets and their balances, entries (amounts, dates, descriptions, notes,
          categories), budgets, savings goals, recurring items, your currency and time zone, and answers you give in
          setup.
        </li>
        <li>
          <strong>Sign-in sessions:</strong> to keep you signed in, show you where you&rsquo;re signed in, and spot
          misuse, we store each session&rsquo;s IP address and browser type.
        </li>
        <li>
          <strong>Usage counts:</strong> how many AI requests you&rsquo;ve made each day, so the daily limits work.
        </li>
        {billing && (
          <li>
            <strong>Payments, if you buy Pro:</strong> Razorpay handles the payment. We receive the subscription&rsquo;s
            status and billing dates. We never see or store card numbers, UPI IDs or bank details.
          </li>
        )}
      </ul>
      <p>
        We don&rsquo;t use advertising, analytics or tracking cookies. The only cookie is the one that keeps you signed
        in. Your light/dark choice is stored on your device.
      </p>

      <h2>How the AI features use your data</h2>
      <p>
        AI features are optional and can be switched off in Settings. When they&rsquo;re on, we send only what each
        feature needs to our AI providers (Groq, Cerebras or OpenRouter, based in the United States). If one
        doesn&rsquo;t answer, the same request goes to the next.
      </p>
      <ul>
        <li>
          <strong>Filling in an entry from a sentence:</strong> what you typed (for example, &ldquo;spent 240 on
          chai&rdquo;), today&rsquo;s date, your currency, and the names of your wallets and categories.
        </li>
        <li>
          <strong>Category suggestions:</strong> a new entry&rsquo;s description and the names of your categories. Not
          sent when you&rsquo;ve picked a category for that place before.
        </li>
        <li>
          <strong>Setup questions:</strong> your answer, today&rsquo;s date, your currency and, for bills, the names of
          your categories.
        </li>
        <li>
          <strong>Ask:</strong> your question and the last few messages of the conversation, plus what the AI looks up
          to answer it: wallet names and balances, spending by category, matching entries (date, description, category,
          wallet and amount), monthly totals, budgets, upcoming recurring items and subscriptions (name, date and
          amount), and goals.
        </li>
        <li>
          <strong>Insights reports:</strong> the period&rsquo;s totals compared with earlier ones, your top categories,
          budgets, your biggest expenses and possible duplicate charges (description, amount and date), subscription
          price changes (name and amounts), and goals.
        </li>
      </ul>
      <p>
        Your name, email address and entry notes are never sent. We picked providers whose terms say they don&rsquo;t
        train their models on data sent through their APIs, and we ask OpenRouter to use only providers that don&rsquo;t
        keep it. We don&rsquo;t save your Ask conversations. Written Insights reports are saved in your account so you
        can read them again.
      </p>

      <h2>Who else sees it</h2>
      <p>
        We never sell your data or share it for marketing. It&rsquo;s handled only by the services that run {APP_NAME}:
      </p>
      <ul>
        <li>Google, for sign-in;</li>
        <li>
          Neon (database) and Vercel (app hosting), where your data is stored, possibly outside India, for example in
          Singapore;
        </li>
        <li>GitHub, which keeps our encrypted nightly backups;</li>
        {billing && <li>Razorpay, for payments;</li>}
        {monitoring && (
          <li>
            Sentry, which records technical details when something goes wrong or a page is slow (the error, the page,
            your browser type), so we can fix it. When an error happens in your browser, it also gets a short replay of
            the page around it: the layout and your clicks, with every word, number, typed character and picture hidden.
            It never receives your entries, questions, email address or IP address, and deletes all of this after 30
            days;
          </li>
        )}
        <li>the AI providers above, only while AI features are on.</li>
      </ul>
      <p>We&rsquo;ll share data with authorities only when the law requires it.</p>

      <h2>How long we keep it</h2>
      <p>
        As long as you have an account. An entry you delete is kept for 10 minutes so you can undo it, then removed from
        our database within a day. When you delete your account, everything is removed from our database straight away.
        Copies in our backups are gone within 7 days.
        {billing && " Razorpay keeps its own payment records as the law requires."}
      </p>

      <h2>Your choices</h2>
      <ul>
        <li>Download all your entries as a CSV file from Settings.</li>
        <li>Switch AI features off in Settings.</li>
        <li>See where you&rsquo;re signed in, and sign out other devices, in Settings.</li>
        <li>Delete your account and all its data from Settings.</li>
        <li>
          Ask us to correct something or explain what we hold: write to <EmailLink email={d.email} />.
        </li>
      </ul>

      <h2>Keeping it safe</h2>
      <p>
        Everything travels over HTTPS, your data is only visible to your account, and access to our systems is limited
        to the people who run {APP_NAME}.
      </p>

      <h2>Age</h2>
      <p>{APP_NAME} is for people aged 18 or older.</p>

      <h2>Changes</h2>
      <p>
        If this policy changes, we&rsquo;ll update this page and its date. For important changes, we&rsquo;ll also tell
        you in the app.
      </p>

      <h2>Questions or complaints</h2>
      <p>
        Write to <EmailLink email={d.email} />. We aim to reply within 2 working days.
      </p>
    </>
  );
}
