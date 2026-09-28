# Try an access review

This short walkthrough uses the accounts and roles in the bundled IRIS Community installation. It reads configuration and saves review records; it does not change native permissions.

Start the stack with `docker compose up -d --build`, open <http://localhost:3200>, and sign in with the quick-start credentials in the [README](../README.md#quick-start-complete-local-installation). Wait for the capture to finish and check its completeness label.

## 1. Explain one grant

In **Access map**, select **Admin**, then filter resources to `%Admin_Secure`. Expand the resource to see its source path through `%Manager`. This explains the captured configuration; it is not a test of what an existing session can do.

Uncheck `%Manager` under assigned roles. The preview shows the declared grants that depend on that role. Nothing is sent to IRIS. Choose **Reset preview** before continuing.

An existing instance may have different accounts or assignments. Select a known account and inspect its own source paths instead of expecting the bundled values.

## 2. Keep a review record

Open **Campaigns**, expand **Create a campaign**, and give the review a title and scope. Create it, label the observation, and choose **Capture access**. Campaign evidence is retained on the gateway for this account and configured instance.

Under **Decisions**, review one finding. Choose **Investigating**, write the question that needs answering, and set a follow-up date. **Save decision** records the review; it does not revoke access. The saved outcome, timestamp and follow-up date appear beside the form.

Do not accept all findings just to obtain a green report. For example, a `%All` account requires an operational justification, while an unauthenticated route may have its own authorization controls.

## 3. Review accounts without automatic findings

Under **Certification**, expand **Certification scope**, require certification, leave **accounts** selected, and save the scope. Select an account to inspect its direct roles, inherited access and captured configuration.

Record **Investigate** when evidence or ownership is unclear. A certification decision is separate from a finding decision, and both are separate from changing IRIS.

## 4. Export the work that remains

Open **Report & follow-ups**. **Readiness** lists missing decisions and unresolved investigations. **Follow-ups** puts outstanding work and dates in one queue. Under **Export report**, choose **Preview report** to check the selected sections and optional reviewer note. Close the preview, then download Markdown for a repository or printable HTML for offline review and PDF printing.

Inspect the [example report from the recorded walkthrough](examples/access-review.md), or download [its standalone HTML version](examples/access-review.html). It intentionally shows unfinished work. The example is a saved report, not a live demo or a security certification.

## 5. Start the next period

**Next review period** previews which settings will be copied. Review the title, scope and new due date, then confirm. The new campaign starts without prior captures or decisions; the original remains available. Capture current access before making the next period's decisions.
