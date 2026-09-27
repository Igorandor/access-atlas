# Video publication kit

## Status

An English narrated video and subtitles have been prepared locally as `access-atlas-walkthrough.mp4` and `access-atlas-walkthrough.srt`. They are delivered separately from the source repository. No YouTube URL is available yet, and no video bonus is claimed. A combined three-project film is also available in the delivery bundle.

The video is an edited sequence of actual application screens, with offline synthesized English narration. It is not a continuous screen recording. Native IRIS operations in the shown workflow are reads; demonstration workflow records were saved in a separate temporary gateway store. Screens contain bundled instance data, not a production customer's records.

## Suggested YouTube title

Access Atlas for InterSystems IRIS | Guided product walkthrough

## Suggested description

Explain a configured permission, preview a role removal without applying it, and retain an access-review campaign in Access Atlas for InterSystems IRIS.

This is an edited, narrated walkthrough of actual application screens. It uses synthesized English narration and English subtitles. The demonstrated workflow reads a running IRIS Community instance; it does not perform native administrative changes.

Source and installation: https://github.com/YOUR_GITHUB_ACCOUNT/access-atlas

Companion article: add the published Developer Community URL.

Open Exchange: add the published application URL.

## Before upload

1. Watch the complete MP4 and review the English subtitles. Replace the repository owner and add the real article/application links in the description.
2. Upload the individual video, or use the relevant chapter of the combined video. Review YouTube's requested publication settings yourself. Do not assume multiple uploads multiply the contest bonus.
3. Add the SRT as English captions if desired; readable captions are already burned into the prepared picture. Check for duplicate displayed captions when previewing.
4. Publish the chosen video, verify that viewers can open it, and add its actual URL to the Open Exchange YouTube field and this repository's README. A local MP4 alone is not a published contest video.

## Scene transcript

### 1. Begin with captured access configuration

Access Atlas explains configured access in InterSystems IRIS. This walkthrough uses actual application screens and a dedicated demonstration campaign store. The capture lists accounts, role definitions, and resources, together with its completeness indicator. These are configuration observations, not a guarantee about a live authorization decision.

### 2. Follow the grant to its source

Select the Admin account and filter for the operate resource. Expanding the grant reveals its path: the account inherits the permission through the Manager role. This makes a broad permissions list easier to explain during a review, without editing the account.

### 3. Preview a role removal without applying it

Uncheck the Manager role to preview the effect on declared grants. Atlas marks this as a preview and shows fourteen resource grant sets changing in the captured configuration. No write is sent to IRIS. Reset preview returns to the original projection.

### 4. Save a recurring review

Campaigns retain evidence and decisions beyond the current browser session. Create a named quarterly review, describe its purpose, and label the next capture. The demonstration saves a new campaign in its own temporary store, without changing existing review records.

### 5. Capture evidence before deciding

Capture access saves the configuration and produces findings that need human review. In this example, a broad administrative account needs an owner and a reason for its privileges. A finding is a review prompt. It is not an automatic declaration that the configuration is wrong.

### 6. Preserve the reason for a decision

Record Investigating and explain the follow-up: confirm the account owner and the operational need for broad privileges. Filtering the list now brings that unresolved item into focus. The decision is attached to the captured finding, so changed evidence can require a fresh review.

### 7. Show what still needs attention

Report and follow-ups shows readiness checks and the remaining work. This campaign still has undecided findings and an open investigation, so the report does not claim completion. No permissions were changed. The repository and companion article cover installation, campaigns, certification, and reviewed remediation.
