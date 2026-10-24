import { connection } from "next/server";
import { LegalPage } from "@/components/legal/legal-page";
import { APP_NAME } from "@/config/app";
import { legalDetails } from "@/config/legal";

export const metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <LegalPage title="Contact" intro={`Questions, problems with a payment, or something about your data: we'd like to hear from you.`}>
      <ContactBody />
    </LegalPage>
  );
}

async function ContactBody() {
  await connection();
  const d = legalDetails();
  if (!d.email) return <p className="mt-8 text-muted-foreground">Contact details will be added here soon.</p>;
  return (
    <dl className="mt-8 grid gap-5 sm:grid-cols-[10rem_1fr]">
      <dt className="text-muted-foreground">Email</dt>
      <dd>
        <a href={`mailto:${d.email}`}>{d.email}</a>
        <p className="mt-1 text-sm text-muted-foreground">We aim to reply within 2 working days.</p>
      </dd>
      {d.phone && (
        <>
          <dt className="text-muted-foreground">Phone</dt>
          <dd>
            <a href={`tel:${d.phone.replace(/\s+/g, "")}`}>{d.phone}</a>
          </dd>
        </>
      )}
      {d.operator && (
        <>
          <dt className="text-muted-foreground">Run by</dt>
          <dd>{d.operator}</dd>
        </>
      )}
      {d.address && (
        <>
          <dt className="text-muted-foreground">Address</dt>
          <dd className="whitespace-pre-line">{d.address}</dd>
        </>
      )}
      <dt className="text-muted-foreground">About</dt>
      <dd>{APP_NAME} is an online money tracker. Payments for Pro are handled by Razorpay.</dd>
    </dl>
  );
}
