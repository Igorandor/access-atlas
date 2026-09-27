# Contest coverage and submission preparation

Source: [contest announcement](https://community.intersystems.com/post/intersystems-programming-contest-build-your-own-management-portal), checked September 27, 2026. The contest does not require a LOC minimum or a product described as a local demo. Hosted access is an optional bonus; the supplied quick start and existing-instance gateway deployment are separate installation choices.

| Required area                 | Atlas implementation                                                                          | Relevant APIs                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Web apps and REST exploration | Web applications, schema-driven REST explorer                                                 | `/v2/web-app*`, read operations from the official specification                                               |
| Permission management         | Role-path analysis, removal preview, matrix, evidence review, plus user/role/resource editing | `/v2/security/user*`, `/role*`, `/resource*`                                                                  |
| Security and secrets          | Wallet, X.509, TLS, OAuth definitions, clients and secret updates                             | `/v2/wallet/*`, `/v2/security/x509-*`, `/ssl-*`, `/oauth2/*`                                                  |
| Task management               | Definition editor, scheduling, controls, authoritative state and history                      | `/v2/task*`                                                                                                   |
| OS management                 | Process controls, CPU/memory/disk, devices, database inspection                               | `/v2/process*`, `/v2/device*`, `/v2/database*`, protected native telemetry extension                          |
| Logs                          | Messages, alerts, audit, task history, journal files and API console/activity                 | native log files through the extension, `/v2/security/audit/records`, `/v2/task/history`, `/v2/journal/files` |

The application includes English installation instructions and a written demonstration walkthrough. Original source code is MIT licensed and ready for a public GitHub/GitLab repository. This local preparation does not constitute publication or submission to Open Exchange.

## Technology bonuses

The [published technology bonus list](https://community.intersystems.com/post/technology-bonuses-intersystems-programming-contest-build-your-own-management-portal) was reviewed. Atlas uses Docker and Embedded Python for a concrete purpose: native host telemetry and bounded log reads. It does not add vector search or an AI dependency merely to accumulate points.

No claim is made for online hosting, published IPM packages, community ideas, articles, YouTube videos, first-time participation or reported vendor bugs. These require separate completed actions or eligibility checks.

## Before publishing

1. Choose the public repository and push this directory as its root.
2. Keep `.env`, test credentials for non-demo systems and generated runtime data out of the repository.
3. Add the real author's Developer Community profile to the Open Exchange submission. If submitted as a team, add all team members' profile links to the README.
4. Use the description below and the README walkthrough for the application listing.
5. Review the [general terms](https://openexchange.intersystems.com/markdown?url=/assets/doc/contest-terms.md), publish the application on Open Exchange, then apply to the contest using the [submission guide](https://docs.openexchange.intersystems.com/contest/apply/). The announcement states a submission deadline of **September 27, 2026, 23:59 EST**; verify the current deadline in the organizer's interface.

### Suggested Open Exchange description

Access Atlas supports recurring reviews of declared access in InterSystems IRIS. Campaigns retain captures, policy findings, object certifications, decisions and verified remediation receipts. Account/resource inquiries, role-path explanations, grant-impact comparisons and offline review reports support each review period. It also manages applications, accounts, secrets, X.509/TLS/OAuth configuration, tasks, processes and devices, with log analysis and a read-only REST workbench. A same-origin gateway preserves native permissions and requires reviewed, single-use writes with conflict checks and readback. Docker provides a complete quick start or a gateway connected to an existing IRIS instance.

## Current review status

See [the latest authorization and readiness review](CONTEST_SECURITY_REVIEW.md). Public repository publication, the Open Exchange listing, participant eligibility and organizer acceptance remain unconfirmed. The earlier Harbor application foundation has been replaced by separate implementations. Retained references and validation support are disclosed in [PROVENANCE.md](PROVENANCE.md); separate acceptance still belongs to the organizer.

## Original idea and current walkthrough

The [original project idea](../IDEA.md) and the additional product-specific walkthrough in [README](../README.md) describe the current independent release. The official [contest page](https://openexchange.intersystems.com/contest/48), read September 26, lists the submission deadline as September 27, 2026, 23:59 EST. It also identifies complexity, clarity of instructions, developer experience, applicability and usability as judging criteria. No acceptance or bonus award is implied.

The general terms also contain broad representations about assistance beyond organizer-provided prompt information, subject to contest-rule exceptions. Comparing public feature breadth and independently implementing operator needs does not itself resolve that clause or establish eligibility. No competitor code, interface text or implementation was copied. Participant eligibility, publication and organizer acceptance must still be established by the entrant.
