# Quarterly access review

Review configured administrative access and preserve the evidence for the next quarter\.

- Instance: atlas-video-20260927
- Reviewer: SuperUser
- Campaign revision: 8
- State: active
- Generated: 2026-09-28T00:36:00.000Z
- Latest capture: 2026-09-27T19:54:50.650Z

## Certification scope

- Certification: Required before campaign closure
- Object kinds: accounts
- Name prefix: All names
- Disabled accounts and applications: Excluded
- Review due date: Not set

## Reviewer note

Example from the bundled IRIS Community installation, recorded during the walkthrough on September 28, 2026\. This review is deliberately unfinished: owner confirmation and remaining account decisions are required\. No production data or native permission changes are included\. Findings are review prompts, not proof of insecure runtime access\.

## Review status

- [x] Capture saved: Quarter-start evidence
- [x] Capture readable: No incomplete evidence was reported\.
- [ ] Finding decisions current: 18 findings without a current decision\.
- [x] Required changes addressed: 0 findings still require a change\.
- [ ] Investigations complete: Findings still under investigation: 1\.
- [ ] Certification complete: 6 pending subjects; 1 unresolved decisions\.
- [x] Writes reconciled: 0 remediations require target reconciliation\.
- [x] Follow-ups current: 0 follow-ups are overdue\.
- [x] Policy results known: 0 policy results are unknown\.
- [x] Duty rule results known: 0 duty results are unknown\.

## Follow-up agenda

### SuperUser · Enabled account reaches %All

investigating · due 2026-10-02

Complete the investigation and update the decision\.

Owner: platform administrator\. Confirm why this account needs %All before closing the review\.

### \_Ensemble · Enabled account reaches %All

not reviewed

Review the current finding and record a decision\.

Declared role path: %All\. Confirm that this account needs broad administration privileges\.

### \_Ensemble · Certify accounts

not reviewed

Inspect the object and its dependencies, then record a decision\.

No certification decision for this capture\.

### \_SYSTEM · Enabled account reaches %All

not reviewed

Review the current finding and record a decision\.

Declared role path: %All\. Confirm that this account needs broad administration privileges\.

### \_SYSTEM · Certify accounts

not reviewed

Inspect the object and its dependencies, then record a decision\.

No certification decision for this capture\.

### /api/monitor · Enabled route allows unauthenticated entry

not reviewed

Review the current finding and record a decision\.

Namespace %SYS\. No entry resource is configured\. This may be intentional for a public application; inspect its own authorization\.

### /csp/broker · Enabled route allows unauthenticated entry

not reviewed

Review the current finding and record a decision\.

Namespace %SYS\. No entry resource is configured\. This may be intentional for a public application; inspect its own authorization\.

### /csp/documatic · Enabled route allows unauthenticated entry

not reviewed

Review the current finding and record a decision\.

Namespace %SYS\. Entry resource: %Development\. This may be intentional for a public application; inspect its own authorization\.

### /csp/sys · Enabled route allows unauthenticated entry

not reviewed

Review the current finding and record a decision\.

Namespace %SYS\. No entry resource is configured\. This may be intentional for a public application; inspect its own authorization\.

### /csp/sys/exp · Enabled route allows unauthenticated entry

not reviewed

Review the current finding and record a decision\.

Namespace %SYS\. Entry resource: %Development\. This may be intentional for a public application; inspect its own authorization\.

### /csp/sys/mgr · Enabled route allows unauthenticated entry

not reviewed

Review the current finding and record a decision\.

Namespace %SYS\. Entry resource: %Admin\_Manage\. This may be intentional for a public application; inspect its own authorization\.

### /csp/sys/oauth2 · Enabled route allows unauthenticated entry

not reviewed

Review the current finding and record a decision\.

Namespace %SYS\. No entry resource is configured\. This may be intentional for a public application; inspect its own authorization\.

### /csp/sys/op · Enabled route allows unauthenticated entry

not reviewed

Review the current finding and record a decision\.

Namespace %SYS\. Entry resource: %Admin\_Operate\. This may be intentional for a public application; inspect its own authorization\.

### /csp/sys/sec · Enabled route allows unauthenticated entry

not reviewed

Review the current finding and record a decision\.

Namespace %SYS\. No entry resource is configured\. This may be intentional for a public application; inspect its own authorization\.

### /csp/user · Enabled route allows unauthenticated entry

not reviewed

Review the current finding and record a decision\.

Namespace USER\. No entry resource is configured\. This may be intentional for a public application; inspect its own authorization\.

### /isc/studio/rules · Enabled route allows unauthenticated entry

not reviewed

Review the current finding and record a decision\.

Namespace %SYS\. No entry resource is configured\. This may be intentional for a public application; inspect its own authorization\.

### /isc/studio/templates · Enabled route allows unauthenticated entry

not reviewed

Review the current finding and record a decision\.

Namespace %SYS\. Entry resource: %Development\. This may be intentional for a public application; inspect its own authorization\.

### /isc/studio/usertemplates · Enabled route allows unauthenticated entry

not reviewed

Review the current finding and record a decision\.

Namespace %SYS\. No entry resource is configured\. This may be intentional for a public application; inspect its own authorization\.

### /ui/interop · Enabled route allows unauthenticated entry

not reviewed

Review the current finding and record a decision\.

Namespace %SYS\. No entry resource is configured\. This may be intentional for a public application; inspect its own authorization\.

### %DB\_IRISTEMP · Resource permits public writes

not reviewed

Review the current finding and record a decision\.

Public permission is RW\. Check whether application and service controls provide the intended boundary\.

### Admin · Certify accounts

investigate

Resolve the requested change, removal or investigation before closing certification\.

Verify the operational need for %Manager with the account owner\. Preview shows 14 affected grant sets\.

### CSPSystem · Certify accounts

not reviewed

Inspect the object and its dependencies, then record a decision\.

No certification decision for this capture\.

### irisowner · Enabled account reaches %All

not reviewed

Review the current finding and record a decision\.

Declared role path: %All\. Confirm that this account needs broad administration privileges\.

### irisowner · Certify accounts

not reviewed

Inspect the object and its dependencies, then record a decision\.

No certification decision for this capture\.

### SuperUser · Certify accounts

not reviewed

Inspect the object and its dependencies, then record a decision\.

No certification decision for this capture\.

### UnknownUser · Certify accounts

not reviewed

Inspect the object and its dependencies, then record a decision\.

No certification decision for this capture\.

## Finding decisions

### SuperUser · Enabled account reaches %All

Decision: investigating

Owner: platform administrator\. Confirm why this account needs %All before closing the review\.

### \_Ensemble · Enabled account reaches %All

Decision: Not reviewed

Declared role path: %All\. Confirm that this account needs broad administration privileges\.

### \_SYSTEM · Enabled account reaches %All

Decision: Not reviewed

Declared role path: %All\. Confirm that this account needs broad administration privileges\.

### irisowner · Enabled account reaches %All

Decision: Not reviewed

Declared role path: %All\. Confirm that this account needs broad administration privileges\.

### %DB\_IRISTEMP · Resource permits public writes

Decision: Not reviewed

Public permission is RW\. Check whether application and service controls provide the intended boundary\.

### /api/monitor · Enabled route allows unauthenticated entry

Decision: Not reviewed

Namespace %SYS\. No entry resource is configured\. This may be intentional for a public application; inspect its own authorization\.

### /csp/sys/oauth2 · Enabled route allows unauthenticated entry

Decision: Not reviewed

Namespace %SYS\. No entry resource is configured\. This may be intentional for a public application; inspect its own authorization\.

### /csp/user · Enabled route allows unauthenticated entry

Decision: Not reviewed

Namespace USER\. No entry resource is configured\. This may be intentional for a public application; inspect its own authorization\.

### /isc/studio/usertemplates · Enabled route allows unauthenticated entry

Decision: Not reviewed

Namespace %SYS\. No entry resource is configured\. This may be intentional for a public application; inspect its own authorization\.

### /ui/interop · Enabled route allows unauthenticated entry

Decision: Not reviewed

Namespace %SYS\. No entry resource is configured\. This may be intentional for a public application; inspect its own authorization\.

### /csp/broker · Enabled route allows unauthenticated entry

Decision: Not reviewed

Namespace %SYS\. No entry resource is configured\. This may be intentional for a public application; inspect its own authorization\.

### /csp/documatic · Enabled route allows unauthenticated entry

Decision: Not reviewed

Namespace %SYS\. Entry resource: %Development\. This may be intentional for a public application; inspect its own authorization\.

### /csp/sys · Enabled route allows unauthenticated entry

Decision: Not reviewed

Namespace %SYS\. No entry resource is configured\. This may be intentional for a public application; inspect its own authorization\.

### /csp/sys/exp · Enabled route allows unauthenticated entry

Decision: Not reviewed

Namespace %SYS\. Entry resource: %Development\. This may be intentional for a public application; inspect its own authorization\.

### /csp/sys/mgr · Enabled route allows unauthenticated entry

Decision: Not reviewed

Namespace %SYS\. Entry resource: %Admin\_Manage\. This may be intentional for a public application; inspect its own authorization\.

### /csp/sys/op · Enabled route allows unauthenticated entry

Decision: Not reviewed

Namespace %SYS\. Entry resource: %Admin\_Operate\. This may be intentional for a public application; inspect its own authorization\.

### /csp/sys/sec · Enabled route allows unauthenticated entry

Decision: Not reviewed

Namespace %SYS\. No entry resource is configured\. This may be intentional for a public application; inspect its own authorization\.

### /isc/studio/rules · Enabled route allows unauthenticated entry

Decision: Not reviewed

Namespace %SYS\. No entry resource is configured\. This may be intentional for a public application; inspect its own authorization\.

### /isc/studio/templates · Enabled route allows unauthenticated entry

Decision: Not reviewed

Namespace %SYS\. Entry resource: %Development\. This may be intentional for a public application; inspect its own authorization\.

## Certification

- accounts Admin: investigate · Verify the operational need for %Manager with the account owner\. Preview shows 14 affected grant sets\.
- accounts CSPSystem: Not reviewed · 
- accounts SuperUser: Not reviewed · 
- accounts UnknownUser: Not reviewed · 
- accounts \_Ensemble: Not reviewed · 
- accounts \_SYSTEM: Not reviewed · 
- accounts irisowner: Not reviewed · 

## Remediation receipts


## Capture timeline

- Quarter-start evidence · 2026-09-27T19:54:50\.650Z · complete · 9 accounts · 19 findings

## Activity

- Revision 1 · 2026-09-27T19:54:34\.418Z · SuperUser · created: Quarterly access review
- Revision 2 · 2026-09-27T19:54:50\.652Z · SuperUser · capture: Quarter-start evidence
- Revision 3 · 2026-09-27T19:55:17\.593Z · SuperUser · decision: all:SuperUser: investigating
- Revision 4 · 2026-09-27T20:38:39\.095Z · SuperUser · decision: all:SuperUser: investigating
- Revision 5 · 2026-09-28T00:13:58\.387Z · SuperUser · decision: all:SuperUser: investigating
- Revision 6 · 2026-09-28T00:15:25\.674Z · SuperUser · decision: all:SuperUser: investigating
- Revision 7 · 2026-09-28T00:16:04\.477Z · SuperUser · certification-scope: Certification scope updated
- Revision 8 · 2026-09-28T00:16:32\.511Z · SuperUser · certify: accounts:Admin: investigate

## Scope and limitations

- Configured access is not a runtime authorization decision\. Active sessions, application roles and policies can alter access\.
- Captures are sequential reads and may contain concurrent configuration changes\.
- Follow-up dates schedule review work\. They do not expire exceptions or revoke permissions\.
- Campaigns are partitioned by reviewer and configured instance\. This report is not an independent second-person approval\.
- A verified remediation confirms its named fields at readback time, not every side effect or future state\.
