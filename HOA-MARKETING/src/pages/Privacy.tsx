import LegalPage from "@/components/layout/LegalPage";

/**
 * Privacy Policy.
 *
 * Content is written to satisfy the practical disclosure requirements of:
 *   - Nigeria Data Protection Act 2023 (NDPA) and the older NDPR 2019
 *   - South Africa POPIA (Protection of Personal Information Act)
 *   - EU/UK GDPR — for residents of the EU/UK who interact with us
 *     (relevant because we operate out of London among other locations)
 *
 * Anything that needs operator-side review before launch is marked with
 * an inline comment so legal can swap placeholders for the registered
 * entity name + address.
 */
const Privacy = () => {
  return (
    <LegalPage
      title="Privacy Policy"
      subtitle="How HOA.africa collects, uses, and protects personal information."
      effectiveDate="21 May 2026"
    >
      <p>
        This Privacy Policy explains how <strong>HOA.africa</strong> (operated by
        Meta Session Limited, "we", "us", "our") collects, uses, shares, and
        protects personal information when you visit our website at{" "}
        <a href="https://hoa.africa">hoa.africa</a>, use our enterprise admin
        console, the resident PWA, or any related API or service (together, the
        "Service").
      </p>

      <p>
        We treat personal information as a trust handed to us by the people who
        live in, manage, and visit the estates that use our platform. This
        policy is written to be readable. If anything here is unclear, contact
        us using the details at the end of this page and we'll explain.
      </p>

      <h2>1. Who we are and how to contact us</h2>
      <p>
        <strong>Data controller:</strong> Meta Session Limited, trading as
        HOA.africa. Our principal place of business is Lagos, Nigeria, with
        additional offices in London and Dubai.
      </p>
      <ul>
        <li>
          <strong>General enquiries:</strong>{" "}
          <a href="mailto:hello@hoa.africa">hello@hoa.africa</a>
        </li>
        <li>
          <strong>Privacy and data protection:</strong>{" "}
          <a href="mailto:privacy@hoa.africa">privacy@hoa.africa</a>
        </li>
        <li>
          <strong>Security incidents:</strong>{" "}
          <a href="mailto:security@hoa.africa">security@hoa.africa</a>
        </li>
      </ul>
      <p>
        If you are an HOA (homeowners' association) or property manager using
        the Service, you are the <em>data controller</em> for the residents in
        your estate; we are your <em>data processor</em>. A Data Processing
        Addendum (DPA) is available on request.
      </p>

      <h2>2. Information we collect</h2>

      <h3>2.1 Information you give us directly</h3>
      <ul>
        <li>
          <strong>Account details</strong>: first name, last name, email
          address, phone number, hashed password, optional two-factor secret,
          and profile photo (avatar).
        </li>
        <li>
          <strong>Organisation details</strong>: when you set up an HOA, we
          collect the organisation's legal name, currency, time zone, address,
          tax number, and registered logo.
        </li>
        <li>
          <strong>Resident and unit records</strong>: entered by HOA admins.
          May include owner and tenant names, contact details, occupancy
          start/end dates, vehicle registration plates, and emergency contacts.
        </li>
        <li>
          <strong>Financial information</strong>: invoices, payment records,
          payment plans, vendor bank account details (entered by the HOA),
          tokenised card references from our payment processor (we never store
          full card numbers), and accounting ledger entries.
        </li>
        <li>
          <strong>Documents and uploads</strong>: files you attach to gate
          passes, violations, vendor invoices, resale packs, broadcasts, or the
          general document library. Photos taken to support violation reports
          fall into this bucket.
        </li>
        <li>
          <strong>Communications</strong>: messages you send through the
          in-app inbox, broadcast notices, gate-pass SMS, support emails, and
          chats with our assistant.
        </li>
      </ul>

      <h3>2.2 Information we collect automatically</h3>
      <ul>
        <li>
          <strong>Device and connection data</strong>: IP address, browser
          type, operating system, screen size, language preference, and
          referrer URL.
        </li>
        <li>
          <strong>Usage data</strong>: pages viewed, features used, errors
          encountered, the buttons you click, and timing information about
          your session.
        </li>
        <li>
          <strong>Cookies and similar technologies</strong>: see our{" "}
          <a href="/cookies">Cookie Policy</a> for the full list and how to
          control them.
        </li>
      </ul>

      <h3>2.3 Information from third parties</h3>
      <ul>
        <li>
          <strong>Payments</strong>: Paystack (our payment processor) sends us
          a payment confirmation, the last four digits of the card, the card
          brand, and a transaction reference whenever you pay an invoice. We
          do not see, store, or process the rest of your card data.
        </li>
        <li>
          <strong>Single sign-on / invitation tokens</strong>: if you join
          the Service via an invitation, we receive the email address and
          claimed role from the inviting HOA.
        </li>
      </ul>

      <h2>3. How we use your information</h2>
      <p>We use personal information to:</p>
      <ul>
        <li>provide, operate, and maintain the Service;</li>
        <li>
          authenticate you, manage your session, and enforce role-based access
          to the right HOAs and units;
        </li>
        <li>process payments, generate invoices, calculate balances, and
          handle late-fee escalation;</li>
        <li>send transactional emails (invitations, password resets, receipts,
          violation notices, broadcasts, gate-pass codes);</li>
        <li>provide customer support, respond to enquiries, and investigate
          incidents reported to us;</li>
        <li>operate the AI assistant. When you ask the assistant a question
          inside the Service, we send a redacted version of the message and
          the conversation context to our LLM provider so it can compose a
          reply;</li>
        <li>improve and develop the Service through aggregated, de-identified
          analytics;</li>
        <li>detect, prevent, and respond to fraud, abuse, and security
          incidents;</li>
        <li>comply with legal, accounting, and regulatory obligations.</li>
      </ul>

      <h2>4. Legal bases (GDPR / NDPA)</h2>
      <p>
        Where the GDPR or NDPA applies to our processing, we rely on one or
        more of the following legal bases:
      </p>
      <ul>
        <li>
          <strong>Contract</strong>: to deliver the Service you signed up for
          or that your HOA has signed up for on your behalf.
        </li>
        <li>
          <strong>Legitimate interests</strong>: to keep the Service secure,
          to prevent fraud, and to develop product improvements that don't
          materially affect your privacy.
        </li>
        <li>
          <strong>Consent</strong>: for optional cookies, marketing emails,
          and any processing where consent is the most appropriate basis. You
          can withdraw consent at any time without affecting prior processing.
        </li>
        <li>
          <strong>Legal obligation</strong>: to comply with tax, anti-money
          laundering, and other regulatory requirements.
        </li>
      </ul>

      <h2>5. Who we share information with</h2>
      <p>
        We do not sell personal information. We share it only with the
        sub-processors below, all of which are bound by written data
        processing agreements:
      </p>
      <ul>
        <li>
          <strong>Cloud infrastructure</strong>: Railway (United States) and
          its underlying providers, where our application, databases, and
          uploaded files are hosted.
        </li>
        <li>
          <strong>Email delivery</strong>: Resend (United States) for
          transactional emails.
        </li>
        <li>
          <strong>Payments</strong>: Paystack (Nigeria/South Africa) for
          card and mobile-money charges.
        </li>
        <li>
          <strong>AI assistant</strong>: OpenAI and/or Anthropic (United
          States) for natural-language features. Conversation data is sent for
          inference and is not used by these providers to train their models
          under the enterprise agreements we operate under.
        </li>
        <li>
          <strong>Error monitoring</strong>: Sentry (United States) to capture
          stack traces when something breaks. We strip personal data from
          error reports before transmission where technically feasible.
        </li>
        <li>
          <strong>Product analytics</strong>: PostHog (United States), used
          for anonymised usage analytics. You can opt out via the cookie
          banner.
        </li>
        <li>
          <strong>Professional advisers</strong>: accountants, auditors, and
          legal counsel under confidentiality.
        </li>
        <li>
          <strong>Authorities</strong>: when required by law, court order, or
          to protect the rights, safety, or property of HOA.africa, our
          customers, or the public.
        </li>
      </ul>
      <p>
        A current list of sub-processors is available from{" "}
        <a href="mailto:privacy@hoa.africa">privacy@hoa.africa</a> on request.
      </p>

      <h2>6. International transfers</h2>
      <p>
        Because we use cloud infrastructure based in the United States, your
        personal information may be transferred outside Nigeria, South Africa,
        the EU, the UK, and the UAE. When we do this, we put appropriate
        safeguards in place. These are typically <strong>Standard Contractual
        Clauses</strong> and supplementary technical measures (encryption in
        transit and at rest, access controls, and audit logs), so that the
        level of protection is equivalent to your home jurisdiction.
      </p>

      <h2>7. How long we keep your data</h2>
      <p>We retain personal information only for as long as we need it:</p>
      <ul>
        <li>
          <strong>Active accounts</strong>: for the duration of your account
          plus 30 days of grace after closure (so you can re-activate).
        </li>
        <li>
          <strong>Financial records</strong>: for seven (7) years after the
          transaction date, in line with tax law requirements.
        </li>
        <li>
          <strong>Audit logs</strong>: for two (2) years from the event.
        </li>
        <li>
          <strong>Authentication logs</strong>: for one (1) year.
        </li>
        <li>
          <strong>Marketing email logs</strong>: for as long as you remain
          subscribed, deleted within 30 days of unsubscribe.
        </li>
        <li>
          <strong>Backups</strong>: encrypted backups roll off on a 35-day
          cycle.
        </li>
      </ul>
      <p>
        Beyond these timelines, we either delete the data or anonymise it so
        it can no longer be linked back to an individual.
      </p>

      <h2>8. Your rights</h2>
      <p>
        Subject to the law that applies to you, you have the right to:
      </p>
      <ul>
        <li>
          <strong>Access</strong>: request a copy of the personal information
          we hold about you.
        </li>
        <li>
          <strong>Rectification</strong>: correct inaccurate or incomplete
          information. Most fields can be updated yourself in{" "}
          <em>Settings → Profile</em>.
        </li>
        <li>
          <strong>Erasure</strong>: ask us to delete your information when
          we no longer need it for the purposes it was collected.
        </li>
        <li>
          <strong>Portability</strong>: receive your information in a
          structured, machine-readable format.
        </li>
        <li>
          <strong>Restriction</strong>: ask us to pause processing while a
          dispute is being resolved.
        </li>
        <li>
          <strong>Objection</strong>: object to processing based on legitimate
          interests, including profiling.
        </li>
        <li>
          <strong>Withdraw consent</strong>: where we rely on consent, you can
          withdraw it at any time.
        </li>
        <li>
          <strong>Lodge a complaint</strong>: with the Nigeria Data Protection
          Commission (NDPC), the South African Information Regulator, or your
          local data protection authority if you are in the EU/UK.
        </li>
      </ul>
      <p>
        To exercise any of these rights, email{" "}
        <a href="mailto:privacy@hoa.africa">privacy@hoa.africa</a>. We will
        respond within 30 days. We may need to verify your identity before
        actioning requests that involve sensitive data.
      </p>

      <h2>9. How we protect your information</h2>
      <ul>
        <li>
          All traffic to the Service is encrypted in transit using TLS 1.2 or
          higher.
        </li>
        <li>
          Passwords are hashed with bcrypt at a high cost factor; we never
          store them in plain text.
        </li>
        <li>
          Two-factor secrets are encrypted at rest using AES-256-GCM with keys
          held outside the database.
        </li>
        <li>
          Access to production systems is restricted to a small group of
          named engineers, gated by multi-factor authentication and logged.
        </li>
        <li>
          Every sensitive action in the platform writes an audit log row so
          we can investigate retroactively.
        </li>
        <li>
          We run regular dependency scans and apply security patches promptly.
        </li>
      </ul>
      <p>
        No system is perfectly secure. If we discover a personal-data breach,
        we will notify affected users and the relevant regulators within the
        statutory timelines (72 hours under GDPR; without undue delay under
        NDPA and POPIA).
      </p>

      <h2>10. Children</h2>
      <p>
        The Service is not directed at children under the age of 16. We don't
        knowingly collect personal information from children. If you believe a
        child has provided us with information, please contact{" "}
        <a href="mailto:privacy@hoa.africa">privacy@hoa.africa</a> and we'll
        delete it.
      </p>

      <h2>11. Automated decisions and profiling</h2>
      <p>
        We do not make decisions about you using fully automated processing
        that has a legal or similarly significant effect. The AI assistant
        inside the Service is advisory only. Final decisions on invoices,
        violations, votes, and any other governance action are taken by
        humans authorised by your HOA.
      </p>

      <h2>12. Marketing communications</h2>
      <p>
        We send transactional emails (receipts, password resets, notices) as
        part of providing the Service, so you cannot opt out of these while
        you have an active account. Optional marketing emails are sent only
        if you've opted in; you can unsubscribe at any time using the link in
        the email footer.
      </p>

      <h2>13. Changes to this policy</h2>
      <p>
        We may update this Privacy Policy from time to time. When we do, we
        will revise the "Effective date" at the top of the page and, if the
        changes are material, notify you by email at least 14 days before
        they take effect. Continued use of the Service after the effective
        date constitutes acceptance of the revised policy.
      </p>

      <h2>14. Contact us</h2>
      <p>
        Questions, requests, or complaints about this Privacy Policy or our
        handling of your personal information:
      </p>
      <ul>
        <li>
          Email:{" "}
          <a href="mailto:privacy@hoa.africa">privacy@hoa.africa</a>
        </li>
        <li>
          Post: Meta Session Limited, Privacy Office, Lagos, Nigeria
        </li>
      </ul>
      <p>
        If you are not satisfied with our response, you may lodge a complaint
        with your local data protection authority.
      </p>
    </LegalPage>
  );
};

export default Privacy;
