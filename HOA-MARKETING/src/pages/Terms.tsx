import LegalPage from "@/components/layout/LegalPage";

/**
 * Terms of Service.
 *
 * Drafted as a master agreement between Meta Session Limited and the HOA
 * subscriber. Residents and other end users interact under sub-terms that
 * the controlling HOA accepts on their behalf; that flow is documented
 * inline rather than as a separate "End User License Agreement" because
 * residents don't pay us directly.
 *
 * The platform sells a SaaS subscription. Important commercial clauses:
 *   - Acceptable use carves out gate-pass abuse + sharing credentials
 *   - Refund mechanics call out auto-renew and the prorated-credit policy
 *   - Liability cap is the lesser of (12 months of fees, USD 10,000)
 *   - Governing law: Nigeria, with arbitration in Lagos
 */
const Terms = () => {
  return (
    <LegalPage
      title="Terms of Service"
      subtitle="The agreement between you and HOA.africa for use of our platform."
      effectiveDate="21 May 2026"
    >
      <p>
        These Terms of Service ("<strong>Terms</strong>") form a binding
        agreement between you and <strong>Meta Session Limited</strong>
        ("HOA.africa", "we", "us", "our"), the operator of the HOA.africa
        platform. By creating an account, accessing the Service, or clicking a
        button labelled "Accept" or similar, you agree to these Terms. If you
        are accepting on behalf of an organisation, you confirm that you have
        the authority to bind that organisation.
      </p>

      <p>
        These Terms incorporate our{" "}
        <a href="/privacy">Privacy Policy</a> and{" "}
        <a href="/cookies">Cookie Policy</a>. If you don't agree to these
        Terms, don't use the Service.
      </p>

      <h2>1. Definitions</h2>
      <ul>
        <li>
          <strong>"Service"</strong> means the HOA.africa platform, including
          the marketing website at hoa.africa, the enterprise admin console,
          the resident PWA, the underlying API, and any related mobile or web
          applications we make available.
        </li>
        <li>
          <strong>"HOA"</strong> means the homeowners' association, body
          corporate, estate, or similar managed community that subscribes to
          the Service.
        </li>
        <li>
          <strong>"Administrator"</strong> means an HOA staff member or board
          official with elevated permissions in the Service.
        </li>
        <li>
          <strong>"Resident"</strong> means an owner, tenant, or stakeholder
          attached to a unit in an HOA managed via the Service.
        </li>
        <li>
          <strong>"Content"</strong> means any data, files, text, images,
          documents, or other materials uploaded to or generated within the
          Service.
        </li>
      </ul>

      <h2>2. Eligibility</h2>
      <p>
        You must be at least 18 years old (or the age of majority in your
        jurisdiction) and legally able to enter into binding contracts. The
        Service is offered to residents of Africa and selected other regions;
        we may refuse to provide the Service to specific individuals or
        organisations at our discretion.
      </p>

      <h2>3. Your account</h2>
      <h3>3.1 Registration</h3>
      <p>
        To use most features you'll need to register an account. You agree to
        provide accurate, complete information and to keep it up to date. Each
        account is for a single person — sharing logins is prohibited.
      </p>
      <h3>3.2 Security</h3>
      <p>
        You are responsible for safeguarding your password and any
        authentication factors associated with your account. Notify us
        immediately at{" "}
        <a href="mailto:security@hoa.africa">security@hoa.africa</a> if you
        suspect unauthorised access. We aren't liable for losses arising from
        your failure to keep your credentials secure.
      </p>
      <h3>3.3 Roles and permissions</h3>
      <p>
        HOA administrators control role assignments and access scopes within
        their estate. By accepting an invitation to a role, you accept the
        permissions and responsibilities that come with it.
      </p>

      <h2>4. Subscriptions, fees, and refunds</h2>
      <h3>4.1 Plans</h3>
      <p>
        We offer several subscription plans. The features, limits, and price
        of each plan are described on our{" "}
        <a href="/#pricing">pricing page</a>. Prices are quoted in Nigerian
        Naira (₦) by default; other currencies may be available on request.
      </p>
      <h3>4.2 Billing</h3>
      <p>
        Subscriptions are billed in advance on a monthly or annual cycle that
        starts the day you activate the plan. Payment is processed via
        Paystack and renews automatically unless you cancel. You authorise us
        to charge the payment method on file for each renewal.
      </p>
      <h3>4.3 Plan changes</h3>
      <p>
        You can upgrade or downgrade at any time. Upgrades take effect
        immediately and are prorated. Downgrades take effect at the end of the
        current billing cycle.
      </p>
      <h3>4.4 Cancellation and refunds</h3>
      <p>
        You can cancel at any time from{" "}
        <em>Settings → Billing</em>. Cancellations take effect at the end of
        the current billing cycle — you keep access until then. We do not
        provide refunds for partial periods, unused features, or feature
        deprecations, except where required by applicable consumer-protection
        law.
      </p>
      <h3>4.5 Taxes</h3>
      <p>
        Fees are exclusive of value-added tax (VAT), withholding tax, and any
        other government-imposed levies, which are your responsibility. Where
        we are required to collect tax on your behalf, it will be added to
        your invoice.
      </p>
      <h3>4.6 Failed payments</h3>
      <p>
        If a payment fails, we will retry the charge for up to 14 days and
        notify you by email. If we still cannot collect, we may suspend
        access until the balance is settled. Persistent non-payment may
        result in account termination and data deletion (subject to the
        retention rules in our Privacy Policy).
      </p>

      <h2>5. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>
          violate any applicable law (anti-spam, data protection, sanctions,
          export controls, etc.) while using the Service;
        </li>
        <li>
          access the Service in a way intended to disrupt or interfere with
          its operation (denial-of-service attacks, automated scraping outside
          our API, exploiting vulnerabilities);
        </li>
        <li>
          reverse-engineer, decompile, or attempt to derive source code from
          the Service, except to the extent expressly permitted by law;
        </li>
        <li>
          impersonate any person, misrepresent your affiliation with an HOA,
          or use the gate-pass system to grant access to people not authorised
          by the HOA;
        </li>
        <li>
          upload Content that infringes intellectual property rights, is
          defamatory, harasses or threatens any person, contains malware, or
          would violate the privacy of any resident or visitor;
        </li>
        <li>
          use the Service to send unsolicited marketing communications
          outside the Service's broadcast features (which are intended for
          legitimate HOA notices);
        </li>
        <li>
          attempt to access data that doesn't belong to your HOA or otherwise
          circumvent role-based access controls.
        </li>
      </ul>
      <p>
        We may suspend or terminate accounts that breach this section,
        without notice in serious cases. Where appropriate we report illegal
        activity to law enforcement.
      </p>

      <h2>6. Your content and data</h2>
      <h3>6.1 Ownership</h3>
      <p>
        You and your HOA retain all rights in Content you upload. We claim no
        ownership.
      </p>
      <h3>6.2 Licence to us</h3>
      <p>
        You grant HOA.africa a worldwide, royalty-free, non-exclusive licence
        to host, copy, transmit, display, and process your Content only to
        the extent necessary to provide the Service. This licence ends when
        you delete the Content or when your account is terminated and the
        retention period expires.
      </p>
      <h3>6.3 Backups and accuracy</h3>
      <p>
        We keep encrypted backups for operational resilience. You are
        responsible for the accuracy of Content you (or your administrators)
        upload — including resident records, balances, and gate-pass
        permissions.
      </p>
      <h3>6.4 Removal</h3>
      <p>
        We may remove Content that violates these Terms or applicable law on
        notice from the affected party or a regulator. We aim to give you
        notice before removal except where prohibited by law or where
        immediate removal is needed to prevent harm.
      </p>

      <h2>7. Our intellectual property</h2>
      <p>
        The Service, including all software, design, text, graphics, and
        branding, is owned by Meta Session Limited and its licensors and is
        protected by intellectual property law. We grant you a limited,
        revocable, non-exclusive, non-transferable licence to access and use
        the Service in accordance with these Terms — no other rights are
        granted. You may not copy, modify, distribute, sell, or lease any
        part of the Service.
      </p>

      <h2>8. Third-party services</h2>
      <p>
        The Service integrates with third-party providers (Paystack, Resend,
        OpenAI, Anthropic, Sentry, PostHog, and others listed in our{" "}
        <a href="/privacy">Privacy Policy</a>). Your use of those services may
        also be subject to the third party's own terms. We are not
        responsible for the acts or omissions of third-party providers, but
        we will use commercially reasonable efforts to choose reputable ones.
      </p>

      <h2>9. Availability and maintenance</h2>
      <p>
        We aim for 99.5% monthly uptime, excluding scheduled maintenance and
        events outside our reasonable control. Scheduled maintenance will
        normally be communicated at least 48 hours in advance via in-app
        notices or email. We may need to perform emergency maintenance with
        less notice; we'll communicate as soon as practicable.
      </p>

      <h2>10. Disclaimers</h2>
      <p>
        Except as expressly stated in these Terms or required by law, the
        Service is provided "as is" and "as available", without warranties of
        any kind, whether express, implied, or statutory. We do not warrant
        that the Service will be uninterrupted, error-free, or completely
        secure, or that it will meet every requirement of every customer.
      </p>
      <p>
        You acknowledge that the Service is an operational tool — it is not a
        substitute for professional legal, financial, accounting, or tax
        advice. Any reports, calculations, or AI-generated suggestions are
        provided for your convenience and should be reviewed by qualified
        professionals where significant decisions depend on them.
      </p>

      <h2>11. Limitation of liability</h2>
      <p>
        To the maximum extent permitted by law, neither party will be liable
        to the other for any indirect, incidental, consequential, special,
        punitive, or exemplary damages — including loss of profits, revenue,
        goodwill, or data — arising from or related to these Terms or the
        Service, even if advised of the possibility of such damages.
      </p>
      <p>
        Our total aggregate liability under these Terms in any 12-month
        period is capped at the greater of:
      </p>
      <ul>
        <li>the fees you actually paid us for the Service in that period; or</li>
        <li>USD 10,000 (or its equivalent in your billing currency).</li>
      </ul>
      <p>
        Nothing in this section limits liability that cannot be limited under
        applicable law — including liability for fraud, gross negligence, or
        wilful misconduct.
      </p>

      <h2>12. Indemnification</h2>
      <p>
        You agree to indemnify and hold HOA.africa harmless from any claim,
        loss, or expense (including reasonable legal fees) arising out of (a)
        your breach of these Terms, (b) your violation of applicable law,
        (c) Content you uploaded, or (d) misuse of the Service by you or
        anyone using your account. We will defend you against claims that
        your authorised use of the Service infringes a third-party
        intellectual property right, on the conditions described in our
        Master Subscription Agreement (available on request).
      </p>

      <h2>13. Suspension and termination</h2>
      <p>We may suspend or terminate your access:</p>
      <ul>
        <li>immediately if you breach these Terms in a way that can't reasonably be cured;</li>
        <li>on 14 days' notice if you breach these Terms in a way that can be cured but you fail to cure it within that time;</li>
        <li>on 30 days' notice for any other reason in our discretion (refunds for prepaid unused service will be issued on a prorated basis in this case);</li>
        <li>if required by law or a regulator.</li>
      </ul>
      <p>
        You may terminate at any time by cancelling your subscription from{" "}
        <em>Settings → Billing</em> or by emailing{" "}
        <a href="mailto:hello@hoa.africa">hello@hoa.africa</a>. After
        termination, we'll delete or anonymise your data in accordance with
        the retention timelines in our Privacy Policy. You can request a full
        data export before termination.
      </p>

      <h2>14. Changes to the Service or these Terms</h2>
      <p>
        We may modify the Service from time to time. Material reductions in
        functionality will be communicated at least 30 days in advance.
      </p>
      <p>
        We may update these Terms by posting a revised version on this page
        and updating the effective date. Material changes will be notified
        by email at least 14 days before they take effect. Continued use of
        the Service after the effective date constitutes acceptance. If you
        don't agree to the revised Terms, your sole remedy is to cancel your
        subscription before they take effect.
      </p>

      <h2>15. Governing law and dispute resolution</h2>
      <p>
        These Terms are governed by the laws of the Federal Republic of
        Nigeria, without regard to conflict-of-law principles. Any dispute
        arising out of or in connection with these Terms — including its
        validity, breach, or termination — will be referred to and finally
        resolved by arbitration in Lagos, Nigeria, under the rules of the
        Lagos Court of Arbitration. The arbitration will be conducted in
        English by a single arbitrator. The arbitration award is final and
        binding on both parties.
      </p>
      <p>
        Nothing in this section prevents either party from seeking interim or
        injunctive relief in a court of competent jurisdiction to protect
        intellectual property rights or confidential information.
      </p>
      <p>
        If you reside in a jurisdiction whose consumer-protection law gives
        you the right to bring claims in your local courts, this clause does
        not affect that right.
      </p>

      <h2>16. General</h2>
      <ul>
        <li>
          <strong>Entire agreement.</strong> These Terms (together with the
          Privacy Policy and Cookie Policy) are the entire agreement between
          you and us regarding the Service.
        </li>
        <li>
          <strong>Severability.</strong> If any provision is held unenforceable,
          the remaining provisions stay in full force.
        </li>
        <li>
          <strong>No waiver.</strong> Our failure to enforce a provision is
          not a waiver of our right to do so later.
        </li>
        <li>
          <strong>Assignment.</strong> You may not assign these Terms without
          our written consent. We may assign them to an affiliate or in
          connection with a merger, acquisition, or sale of assets, on
          notice to you.
        </li>
        <li>
          <strong>Force majeure.</strong> Neither party is liable for delay
          or failure caused by events outside its reasonable control
          (natural disaster, war, civil unrest, government action, major
          internet outage, etc.).
        </li>
        <li>
          <strong>Notices.</strong> We send notices to the email address on
          your account. You send notices to{" "}
          <a href="mailto:legal@hoa.africa">legal@hoa.africa</a>.
        </li>
      </ul>

      <h2>17. Contact</h2>
      <ul>
        <li>
          Email:{" "}
          <a href="mailto:legal@hoa.africa">legal@hoa.africa</a>
        </li>
        <li>Post: Meta Session Limited, Legal Department, Lagos, Nigeria</li>
      </ul>
    </LegalPage>
  );
};

export default Terms;
