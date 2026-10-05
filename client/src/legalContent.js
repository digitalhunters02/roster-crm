// Shared text for the Terms of Service and Privacy Policy pages. Plain
// data (not JSX) so it renders identically regardless of which app's
// component wraps it — each Impact Digital product embeds this same
// content, just inside its own page chrome/styling.
export const LEGAL_EFFECTIVE_DATE = "September 22, 2026";
export const LEGAL_COMPANY_NAME = "Impact Digital LLC";
export const LEGAL_STATE = "Utah";
export const LEGAL_ADDRESS = "Bluffdale, UT";
export const LEGAL_SUPPORT_EMAIL = "support@impactdigital.network";

export const TERMS_SECTIONS = [
  {
    heading: "1. The Service",
    body: `Impact Digital develops and licenses customer relationship management (CRM) and business-operations software, delivered as a hosted, subscription-based service ("Software as a Service" or "SaaS"), to businesses across various industries. Each Service instance is provisioned for a specific Customer and may be customized or white-labeled for that Customer's use.`,
  },
  {
    heading: "2. Accounts and Eligibility",
    body: `You must be at least 18 years old and have the authority to bind the business you represent to enter into these Terms. You are responsible for maintaining the confidentiality of your account credentials and for all activity that occurs under your account — notify us immediately of any unauthorized use. You are responsible for the accuracy of information you provide and for the conduct of any user you authorize to access the Service under your account (including staff accounts you create).`,
  },
  {
    heading: "3. Subscription, Fees, and Billing",
    body: `Access to the Service is provided on a subscription basis, billed monthly (or as otherwise agreed in writing), at the rate applicable to the plan/tier you selected. Fees are non-refundable except as required by law or as expressly stated in a separate written agreement. We may change subscription fees with at least 30 days' prior notice; continued use of the Service after a fee change takes effect constitutes acceptance of the new fee. Failure to pay fees when due may result in suspension or termination of your access to the Service.`,
  },
  {
    heading: "4. Your Data",
    body: `As between you and Impact Digital, you retain all right, title, and interest in and to the data you or your authorized users submit to the Service ("Customer Data"), including records relating to your own clients, leads, transactions, and business operations. You grant Impact Digital a limited, non-exclusive license to host, process, transmit, and display Customer Data solely as necessary to provide, maintain, secure, and improve the Service, including through the third-party subprocessors described in our Privacy Policy. You are solely responsible for the accuracy, quality, legality, and appropriateness of Customer Data, and for having all rights and consents necessary to submit it to the Service, including any data relating to your own customers or clients. Upon request, and subject to reasonable technical limitations, we will make reasonable efforts to help you export your Customer Data or will delete it following termination of your subscription, except where retention is required by law.`,
  },
  {
    heading: "5. AI-Powered Features",
    body: `Certain Services include features that use third-party artificial intelligence models (including models provided by Anthropic) to process Customer Data you choose to submit to those specific features (for example: document data extraction, risk-scoring suggestions, or drafting assistance). These features are provided as productivity aids; outputs may be inaccurate or incomplete, and you are responsible for reviewing and verifying any AI-generated output before relying on it for business, financial, insurance, legal, or client-facing decisions. You may choose not to use these features.`,
  },
  {
    heading: "6. Acceptable Use",
    body: `You agree not to: (a) use the Service for any unlawful purpose or in violation of any applicable regulation governing your industry (including, where applicable, insurance, financial, or real estate regulations); (b) attempt to gain unauthorized access to the Service or other customers' data; (c) reverse-engineer, decompile, or resell the Service without our written consent; (d) upload malicious code; or (e) use the Service to send unsolicited communications in violation of applicable law (including CAN-SPAM, TCPA, or similar regulations governing the email, SMS, and WhatsApp messaging features).`,
  },
  {
    heading: "7. Third-Party Services",
    body: `The Service may integrate with third-party services that you separately choose to connect (for example, payment processors, messaging providers, or banking-data providers). Your use of those third-party services is governed by their own terms, and Impact Digital is not responsible for their acts, omissions, or availability. Where you connect your own third-party account (e.g., your own Stripe or WhatsApp Business account), you remain the merchant/account holder of record for that third-party relationship.`,
  },
  {
    heading: "7A. Financial Account Connections (Plaid)",
    body: `Certain Services allow you to connect your bank or credit card accounts to enable features such as automatic transaction import and expense tracking. This connection is provided through Plaid Inc. ("Plaid"), a third-party financial data aggregation service.

When you choose to connect a financial account, you enter your banking credentials directly into Plaid's secure interface — not into Impact Digital's systems. Impact Digital never receives, sees, or stores your bank login credentials. Plaid issues Impact Digital a token that allows read-only retrieval of the financial data you authorized (such as account balances and transaction history).

You represent that you are an authorized user of any financial account you connect and that you have the right to grant Impact Digital and Plaid access to that account's data for the purposes described in this Section.

Your use of Plaid's services is additionally governed by Plaid's End User Privacy Policy (https://plaid.com/legal/#end-user-privacy-policy) and Plaid's own terms. We encourage you to review them.

Impact Digital is not a bank, broker-dealer, money transmitter, or financial institution, and does not provide financial, investment, tax, or accounting advice. The Service displays and organizes information obtained via Plaid for your own recordkeeping purposes only.

You may disconnect a linked financial account at any time from within the Service. Disconnecting revokes Impact Digital's access token; it does not affect any relationship you have directly with your financial institution.`,
  },
  {
    heading: "8. Intellectual Property",
    body: `The Service, including its software, design, and underlying technology (excluding Customer Data), is and remains the property of Impact Digital or its licensors. These Terms do not grant you any right to our trademarks, branding, or source code beyond what is necessary to use the Service as intended.`,
  },
  {
    heading: "9. Confidentiality",
    body: `Each party will protect the other's confidential information with the same degree of care it uses for its own confidential information (and no less than reasonable care), and will use it only as necessary to perform its obligations under these Terms.`,
  },
  {
    heading: "10. Disclaimer of Warranties",
    body: `THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE," WITHOUT WARRANTIES OF ANY KIND, WHETHER EXPRESS, IMPLIED, OR STATUTORY, INCLUDING ANY IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR COMPLETELY SECURE.`,
  },
  {
    heading: "11. Limitation of Liability",
    body: `TO THE MAXIMUM EXTENT PERMITTED BY LAW, IMPACT DIGITAL'S TOTAL LIABILITY ARISING OUT OF OR RELATED TO THESE TERMS OR THE SERVICE WILL NOT EXCEED THE FEES YOU PAID TO IMPACT DIGITAL IN THE TWELVE (12) MONTHS PRECEDING THE EVENT GIVING RISE TO THE CLAIM. IN NO EVENT WILL IMPACT DIGITAL BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOST PROFITS OR LOST DATA, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.`,
  },
  {
    heading: "12. Indemnification",
    body: `You agree to indemnify and hold Impact Digital harmless from any claims, damages, or expenses (including reasonable attorneys' fees) arising out of your violation of these Terms, your Customer Data, or your violation of any law or third-party right in connection with your use of the Service.`,
  },
  {
    heading: "13. Term and Termination",
    body: `These Terms remain in effect for as long as you use the Service. Either party may terminate a subscription in accordance with the notice terms of the applicable order or, absent a separate agreement, with 30 days' written notice. We may suspend or terminate your access immediately if you materially breach these Terms, fail to pay fees when due, or if required to comply with applicable law. Sections that by their nature should survive termination (including Sections 4, 8–12, and 14) will survive.`,
  },
  {
    heading: "14. Governing Law",
    body: `These Terms are governed by the laws of the State of ${LEGAL_STATE}, without regard to its conflict-of-laws principles. Any dispute arising out of these Terms will be subject to the exclusive jurisdiction of the state and federal courts located in ${LEGAL_STATE}.`,
  },
  {
    heading: "15. Changes to These Terms",
    body: `We may update these Terms from time to time. We will provide notice of material changes (for example, by email or an in-app notice). Continued use of the Service after changes take effect constitutes acceptance.`,
  },
  {
    heading: "16. Contact",
    body: `${LEGAL_COMPANY_NAME}\n${LEGAL_ADDRESS}\n${LEGAL_SUPPORT_EMAIL}`,
  },
];

export const PRIVACY_SECTIONS = [
  {
    heading: "1. Information We Collect",
    body: `Account Information: name, email address, and password (stored as a secure hash, never in plain text) for each user you create.

Customer Data: the business records you and your authorized users enter into the Service — for example, client/contact records, transactions, policies, listings, invoices, or communications — depending on which Service you use.

Financial/Banking Information: if you choose to connect a bank or credit card account, we receive — via Plaid Inc. — account balances, transaction history, and account metadata (such as institution name and account type) for the account(s) you authorize. We do not receive or store your online banking username or password; that credential exchange happens directly between you and Plaid/your financial institution. This information is used solely to power in-app features you request, such as expense tracking and bank reconciliation.

Usage Data: information about how the Service is accessed and used, such as log data, device/browser information, and IP address, collected automatically to operate and secure the Service.

Payment Information: where a Service offers online payment collection, payment card data is handled directly by our payment processor (Stripe); Impact Digital does not store full payment card numbers on its own servers.`,
  },
  {
    heading: "2. How We Use Information",
    body: `We use the information described above to: provide, operate, and maintain the Service; authenticate users and secure accounts; send transactional communications (e.g., password resets, automated reminders you configure); provide customer support; improve and troubleshoot the Service; and comply with legal obligations.`,
  },
  {
    heading: "3. AI-Powered Features",
    body: `Some Services include optional features that send specific data you choose to submit (for example, an uploaded document, a message draft request, or a policy's coverage details) to Anthropic's Claude API for processing, in order to generate the requested output (such as extracted data fields, a suggested reply, or a plain-language summary). Only the data necessary for that specific feature is sent, only when you use that feature. Anthropic processes this data under its own API terms and does not use API data to train its models by default. We do not send Customer Data to AI features you do not use.`,
  },
  {
    heading: "4. How We Share Information",
    body: `We do not sell your information. We share information only:

With Service Providers who help us operate the Service under confidentiality obligations, which may include: hosting/infrastructure providers, our email delivery provider, Stripe (payments), Twilio (SMS), Meta/WhatsApp Business (messaging), Plaid (bank account connections — Plaid's own End User Privacy Policy, available at https://plaid.com/legal/#end-user-privacy-policy, governs how Plaid itself collects and uses your financial data), and Anthropic (for the AI-powered features described above, only when used).

As Required by Law, such as in response to a valid legal process, or to protect the rights, property, or safety of Impact Digital, our customers, or others.

In a Business Transfer, such as a merger, acquisition, or sale of assets, subject to the acquiring party's commitment to honor this Policy for previously collected information.`,
  },
  {
    heading: "5. Data Security",
    body: `We use reasonable administrative, technical, and physical safeguards designed to protect information from unauthorized access, use, or disclosure — including encrypted transmission (HTTPS/TLS) and hashed password storage. No method of transmission or storage is 100% secure, and we cannot guarantee absolute security.`,
  },
  {
    heading: "6. Data Retention",
    body: `We retain Customer Data for as long as your subscription is active, and for a reasonable period afterward to comply with legal obligations, resolve disputes, or as requested by you. You may request deletion of your Customer Data as described in Section 8.`,
  },
  {
    heading: "7. Cookies and Local Storage",
    body: `The Service uses browser local storage / session storage to keep you signed in (rather than third-party advertising cookies). This data stays on your device and is used solely to operate the login session you control (including the option to be "remembered" on a device or signed out when you close the browser).`,
  },
  {
    heading: "8. Your Rights",
    body: `Depending on your location, you may have the right to request access to, correction of, or deletion of your personal information, or to object to certain processing. To exercise these rights, contact us at ${LEGAL_SUPPORT_EMAIL}. If you are a resident of a state with a comprehensive privacy law (such as California), you may have additional rights under that law; we will honor applicable requests consistent with it.

Disconnecting a Financial Account: you may disconnect any linked bank or credit card account at any time from within the Service. Doing so revokes our access token with Plaid; it does not delete transaction data already imported into your Customer Data unless you separately request deletion under this Section.`,
  },
  {
    heading: "9. Children's Privacy",
    body: `The Service is intended for business use by adults and is not directed to individuals under 18. We do not knowingly collect information from children.`,
  },
  {
    heading: "10. Changes to This Policy",
    body: `We may update this Privacy Policy from time to time. We will indicate the date of the latest revision at the top of this page and, for material changes, provide additional notice as appropriate.`,
  },
  {
    heading: "11. Contact Us",
    body: `${LEGAL_COMPANY_NAME}\n${LEGAL_ADDRESS}\n${LEGAL_SUPPORT_EMAIL}`,
  },
];
