# Contest coverage and submission preparation

## Developer Community article draft

[ARTICLE.md](ARTICLE.md) contains an unpublished English feature walkthrough. Review the draft and publish it on Developer Community to request the article bonus. A file in this repository does not constitute a published Community article or an awarded bonus.

Source: [contest announcement](https://community.intersystems.com/post/intersystems-programming-contest-build-your-own-management-portal), checked September 27, 2026. The supplied quick start and existing-instance gateway deployment are separate installation choices. Hosted access is an optional bonus.

| Required area                 | Atlas implementation                                                                          | Relevant APIs                                                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Web apps and REST exploration | Web applications, schema-driven REST explorer                                                 | `/v2/web-app*`, read operations from the official specification                                               |
| Permission management         | Role-path analysis, removal preview, matrix, evidence review, plus user/role/resource editing | `/v2/security/user*`, `/role*`, `/resource*`                                                                  |
| Security and secrets          | Wallet, X.509, TLS, OAuth definitions, clients and secret updates                             | `/v2/wallet/*`, `/v2/security/x509-*`, `/ssl-*`, `/oauth2/*`                                                  |
| Task management               | Definition editor, scheduling, controls, authoritative state and history                      | `/v2/task*`                                                                                                   |
| OS management                 | Process controls, CPU/memory/disk, devices, database inspection                               | `/v2/process*`, `/v2/device*`, `/v2/database*`, protected native telemetry extension                          |
| Logs                          | Messages, alerts, audit, task history, journal files and API console/activity                 | native log files through the extension, `/v2/security/audit/records`, `/v2/task/history`, `/v2/journal/files` |

The application includes English installation instructions and a written demonstration walkthrough. Original source code is MIT licensed and published at [Igorandor/access-atlas](https://github.com/Igorandor/access-atlas). The Open Exchange application was sent for approval with Submit to Contest selected on September 28, 2026 (Europe/Warsaw). Moderation and contest acceptance remain pending.

## Technology bonuses

The [published technology bonus list](https://community.intersystems.com/post/technology-bonuses-intersystems-programming-contest-build-your-own-management-portal) was reviewed. Atlas uses Docker and Embedded Python for a concrete purpose: native host telemetry and bounded log reads.

The video is available through the link in [VIDEO.md](VIDEO.md). No bonus award is assumed. Online hosting, IPM publication, community ideas, first-time participation and reported vendor bugs are not claimed.

## Submission follow-up

1. Wait for Open Exchange moderation and verify the listing on [contest 48](https://openexchange.intersystems.com/contest/48).
2. Finish Developer Community article moderation and add its public URL to the application.
3. Keep credentials and generated runtime data out of future commits.
4. Confirm awarded bonuses with the organizer; upload or submission alone does not establish an award.

### Suggested Open Exchange description

Access Atlas reviews access in InterSystems IRIS. Trace inherited resource grants, preview removing assigned roles and compare configuration captures. Campaigns save review decisions, object certifications and follow-up work for recurring reviews. Proposed changes require a target review and record their readback result. Administration tools also cover applications, accounts, secrets, tasks, host resources and logs. Install with Docker or connect the gateway to an existing IRIS instance.

## Current review status

See [the latest authorization and readiness review](CONTEST_SECURITY_REVIEW.md). The repository is public and the Open Exchange application is pending approval. Participant eligibility and organizer acceptance remain the organizer’s decision. The earlier Harbor application foundation has been replaced by separate implementations. Retained references and validation support are disclosed in [PROVENANCE.md](PROVENANCE.md); separate acceptance still belongs to the organizer.

## Original idea and current walkthrough

The [original project idea](../IDEA.md) and the additional product-specific walkthrough in [README](../README.md) describe the current independent release. The official [contest page](https://openexchange.intersystems.com/contest/48), read September 26, lists the submission deadline as September 27, 2026, 23:59 EST. It also identifies complexity, clarity of instructions, developer experience, applicability and usability as judging criteria. No acceptance or bonus award is implied.

The general terms also contain broad representations about assistance beyond organizer-provided prompt information, subject to contest-rule exceptions. Comparing public feature breadth and independently implementing operator needs does not itself resolve that clause or establish eligibility. No competitor code, interface text or implementation was copied. Participant eligibility, publication and organizer acceptance must still be established by the entrant.

## Video and online-demo preparation

The [video walkthrough](https://www.youtube.com/watch?v=5IzkxZosweA) is published as unlisted with English captions and CC0 music; see [VIDEO.md](VIDEO.md). The owner chose to skip cloud hosting; see [ONLINE_DEMO.md](ONLINE_DEMO.md). Do not count a local video file or local server as an awarded bonus.
