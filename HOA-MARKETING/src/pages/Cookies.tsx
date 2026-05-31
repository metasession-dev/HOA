import LegalPage from "@/components/layout/LegalPage";

/**
 * Cookie Policy.
 *
 * Lists every cookie + similar technology the Service actually uses,
 * grouped by purpose. The table is the load-bearing content here — a
 * policy that just says "we use cookies" doesn't meet the disclosure
 * standard under the EU ePrivacy Directive or NDPR. We name each
 * cookie, who sets it, what it does, and how long it lasts.
 *
 * When new third-party scripts are added (or removed) this file must be
 * updated. The README points to here as the canonical inventory.
 */
const Cookies = () => {
  return (
    <LegalPage
      title="Cookie Policy"
      subtitle="What cookies HOA.africa uses, why, and how you can manage them."
      effectiveDate="21 May 2026"
    >
      <p>
        This Cookie Policy explains how <strong>HOA.africa</strong> uses
        cookies and similar tracking technologies when you visit our website
        or use our applications. Read it together with our{" "}
        <a href="/privacy">Privacy Policy</a> for the broader picture of how
        we handle personal information.
      </p>

      <h2>1. What are cookies?</h2>
      <p>
        A cookie is a small text file that a website saves on your browser
        when you visit it. Cookies let the site recognise your device on
        return visits, remember preferences, and measure how features are
        used. "Similar technologies" such as <em>local storage</em>,{" "}
        <em>session storage</em>, and{" "}
        <em>service-worker caches</em> behave like cookies for the purposes
        of this policy and are covered by the same rules.
      </p>

      <h2>2. How we categorise them</h2>
      <p>We group the technologies we use into three buckets:</p>
      <ul>
        <li>
          <strong>Strictly necessary</strong>: required to deliver the
          Service. Without them, the site can't function (you couldn't sign
          in, your shopping cart would lose state, etc.). These don't require
          consent under most laws, but we document them for transparency.
        </li>
        <li>
          <strong>Functional</strong>: remember the choices you make so the
          site behaves better on return visits (language, theme, dismissed
          banners).
        </li>
        <li>
          <strong>Analytics</strong>: anonymised usage measurement that
          helps us understand which features are valuable and which need
          work. These are off by default until you accept them via the cookie
          banner.
        </li>
      </ul>
      <p>
        We do <strong>not</strong> use advertising cookies, retargeting
        pixels, or any technology that profiles you for ad-targeting
        purposes.
      </p>

      <h2>3. The cookies we use</h2>

      <h3>3.1 Strictly necessary</h3>
      <div className="not-prose overflow-x-auto rounded-lg border border-border my-6">
        <table className="min-w-full text-sm">
          <thead className="bg-secondary/60 text-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Name</th>
              <th className="text-left px-4 py-3 font-semibold">Set by</th>
              <th className="text-left px-4 py-3 font-semibold">Purpose</th>
              <th className="text-left px-4 py-3 font-semibold">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-muted-foreground">
            <tr>
              <td className="px-4 py-3 font-mono text-xs text-foreground">hoa_token</td>
              <td className="px-4 py-3">HOA.africa</td>
              <td className="px-4 py-3">Authenticated session. Mirrors the JWT stored in localStorage so the server-side route gate (Next.js middleware) can redirect unauthenticated users before any page renders.</td>
              <td className="px-4 py-3 whitespace-nowrap">24 hours</td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-mono text-xs text-foreground">hoa_active_role</td>
              <td className="px-4 py-3">HOA.africa</td>
              <td className="px-4 py-3">Remembers which role you selected (e.g. board chair vs property manager) so the right sidebar and permissions load on each request. Stored in localStorage rather than a cookie, but functionally equivalent for this policy.</td>
              <td className="px-4 py-3 whitespace-nowrap">Until logout</td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-mono text-xs text-foreground">csrf_token</td>
              <td className="px-4 py-3">HOA.africa</td>
              <td className="px-4 py-3">Anti-cross-site-request-forgery token paired with state-changing requests where stateless JWT protection isn't sufficient.</td>
              <td className="px-4 py-3 whitespace-nowrap">Session</td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-mono text-xs text-foreground">__cf_bm, _cfuvid</td>
              <td className="px-4 py-3">Cloudflare</td>
              <td className="px-4 py-3">Bot-management cookies used to distinguish humans from automated scrapers and prevent denial-of-service traffic.</td>
              <td className="px-4 py-3 whitespace-nowrap">30 min / Session</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>3.2 Functional</h3>
      <div className="not-prose overflow-x-auto rounded-lg border border-border my-6">
        <table className="min-w-full text-sm">
          <thead className="bg-secondary/60 text-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Name</th>
              <th className="text-left px-4 py-3 font-semibold">Set by</th>
              <th className="text-left px-4 py-3 font-semibold">Purpose</th>
              <th className="text-left px-4 py-3 font-semibold">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-muted-foreground">
            <tr>
              <td className="px-4 py-3 font-mono text-xs text-foreground">hoa_consent</td>
              <td className="px-4 py-3">HOA.africa</td>
              <td className="px-4 py-3">Stores your cookie-banner choices so we don't ask again on every visit.</td>
              <td className="px-4 py-3 whitespace-nowrap">12 months</td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-mono text-xs text-foreground">hoa_theme</td>
              <td className="px-4 py-3">HOA.africa</td>
              <td className="px-4 py-3">Remembers light/dark mode preference.</td>
              <td className="px-4 py-3 whitespace-nowrap">12 months</td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-mono text-xs text-foreground">hoa_org_pref</td>
              <td className="px-4 py-3">HOA.africa</td>
              <td className="px-4 py-3">Remembers your active HOA when you belong to more than one organisation.</td>
              <td className="px-4 py-3 whitespace-nowrap">12 months</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>3.3 Analytics</h3>
      <div className="not-prose overflow-x-auto rounded-lg border border-border my-6">
        <table className="min-w-full text-sm">
          <thead className="bg-secondary/60 text-foreground">
            <tr>
              <th className="text-left px-4 py-3 font-semibold">Name</th>
              <th className="text-left px-4 py-3 font-semibold">Set by</th>
              <th className="text-left px-4 py-3 font-semibold">Purpose</th>
              <th className="text-left px-4 py-3 font-semibold">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border text-muted-foreground">
            <tr>
              <td className="px-4 py-3 font-mono text-xs text-foreground">ph_*_posthog</td>
              <td className="px-4 py-3">PostHog</td>
              <td className="px-4 py-3">Anonymised usage analytics: pages viewed, buttons clicked, feature funnels. IP addresses are truncated before storage. Helps us decide what to build next.</td>
              <td className="px-4 py-3 whitespace-nowrap">12 months</td>
            </tr>
            <tr>
              <td className="px-4 py-3 font-mono text-xs text-foreground">sentryReplayId</td>
              <td className="px-4 py-3">Sentry</td>
              <td className="px-4 py-3">Correlates browser errors with a session so we can debug crashes. Personally identifying form fields are masked before transmission.</td>
              <td className="px-4 py-3 whitespace-nowrap">14 days</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>4. Service-worker caches (resident PWA)</h2>
      <p>
        The resident application is a Progressive Web App, which means it
        installs a small "service worker" in your browser to support offline
        access. The service worker caches:
      </p>
      <ul>
        <li>static assets (HTML, CSS, JavaScript, fonts, images);</li>
        <li>API GET responses for recently viewed data, so you can re-open
          the app on a flaky connection and still see your last balance,
          gate passes, and notices;</li>
        <li>push-notification subscription keys, so we can send you
          gate-pass codes and broadcast alerts when you enable
          notifications.</li>
      </ul>
      <p>
        Caches expire automatically (typically within 30 days) or when you
        uninstall the app from your home screen. POST and authenticated
        mutation requests are <strong>never</strong> cached.
      </p>

      <h2>5. Third-party services</h2>
      <p>
        Some cookies are set by services we embed. Each of these has its own
        privacy and cookie policy, linked below:
      </p>
      <ul>
        <li>
          <strong>PostHog</strong>:{" "}
          <a href="https://posthog.com/privacy" target="_blank" rel="noopener noreferrer">posthog.com/privacy</a>
        </li>
        <li>
          <strong>Sentry</strong>:{" "}
          <a href="https://sentry.io/privacy/" target="_blank" rel="noopener noreferrer">sentry.io/privacy</a>
        </li>
        <li>
          <strong>Cloudflare</strong>:{" "}
          <a href="https://www.cloudflare.com/privacypolicy/" target="_blank" rel="noopener noreferrer">cloudflare.com/privacypolicy</a>
        </li>
        <li>
          <strong>Paystack</strong> (during checkout only):{" "}
          <a href="https://paystack.com/privacy/merchant" target="_blank" rel="noopener noreferrer">paystack.com/privacy</a>
        </li>
      </ul>

      <h2>6. How to manage cookies</h2>
      <h3>6.1 Through our cookie banner</h3>
      <p>
        When you first visit our site you'll see a banner asking which
        categories you accept. You can change your mind at any time by
        clicking <strong>"Cookie preferences"</strong> in the footer.
      </p>
      <h3>6.2 Through your browser</h3>
      <p>
        Most browsers let you block or delete cookies entirely. Be aware
        that blocking strictly necessary cookies will prevent you from
        signing in or using key features.
      </p>
      <ul>
        <li>
          <a href="https://support.google.com/chrome/answer/95647" target="_blank" rel="noopener noreferrer">Chrome</a>
        </li>
        <li>
          <a href="https://support.mozilla.org/kb/cookies-information-websites-store-on-your-computer" target="_blank" rel="noopener noreferrer">Firefox</a>
        </li>
        <li>
          <a href="https://support.apple.com/guide/safari/manage-cookies-sfri11471/mac" target="_blank" rel="noopener noreferrer">Safari</a>
        </li>
        <li>
          <a href="https://support.microsoft.com/microsoft-edge/delete-cookies-in-microsoft-edge-63947406-40ac-c3b8-57b9-2a946a29ae09" target="_blank" rel="noopener noreferrer">Edge</a>
        </li>
      </ul>
      <h3>6.3 Do-Not-Track signals</h3>
      <p>
        We respect the <code>Sec-GPC</code> (Global Privacy Control) header.
        If your browser sends it, we will treat that as a signal to suppress
        analytics cookies and tracking pixels, the same as choosing
        "Decline" on the banner. Legacy <code>DNT</code> (Do Not Track) is
        not consistently implemented across browsers, so we honour
        <code>Sec-GPC</code> in preference.
      </p>

      <h2>7. Changes to this policy</h2>
      <p>
        We may update this Cookie Policy when we add or remove third-party
        services, or when laws change. The effective date at the top of the
        page reflects the latest revision. Material changes will be flagged
        through the cookie banner so you have the chance to refresh your
        consent.
      </p>

      <h2>8. Contact</h2>
      <p>
        Questions about our use of cookies?
      </p>
      <ul>
        <li>
          Email:{" "}
          <a href="mailto:privacy@hoa.africa">privacy@hoa.africa</a>
        </li>
        <li>Post: Meta Session Limited, Privacy Office, Lagos, Nigeria</li>
      </ul>
    </LegalPage>
  );
};

export default Cookies;
