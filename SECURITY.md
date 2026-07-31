# Security Policy

## Responsible Disclosure

If you discover a security issue, report it privately through the project security contact/channel.

Preferred reporting path:
1. Private security advisory/report to repository maintainers.
2. If unavailable, notify the designated security on-call contact.

Please include:
- impact summary
- reproduction steps
- affected interfaces/components
- suggested mitigation (if available)

Do not publicly disclose unpatched vulnerabilities.

## Triage and Response SLA

- Initial acknowledgement: within **24 hours**
- Triage classification (severity + affected scope): within **72 hours**
- Containment plan for Sev-1/Sev-2: within **24 hours of triage**
- Target remediation window:
  - Sev-1: immediate/expedited hotfix path
  - Sev-2: within 7 calendar days
  - Sev-3: next scheduled release cycle

## Market Abuse / Security Incident Categories

- unauthorized order submission or replay
- quote manipulation / stale quote exploitation
- execution routing abuse or venue spoofing
- settlement hook tampering
- abuse of policy/risk bypass paths
- credential/key compromise

## Severity and Escalation

Severity is assessed jointly by Engineering, Operations, and Security based on exploitability, financial risk, and blast radius.

- Sev-1: active exploitation or critical systemic risk
- Sev-2: high-impact vulnerability with credible exploit path
- Sev-3: moderate/low risk requiring scheduled remediation

Escalate Sev-1 and Sev-2 through incident command and execute rollback/cutover abort criteria as documented in runbooks.
