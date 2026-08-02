# Settlement failure incident checklist

- [ ] Incident owner assigned
- [ ] Impacted chain(s) identified
- [ ] Impacted `correlation_id` / `intent_id` / `execution_id` list captured
- [ ] Current lifecycle state and failure reason code recorded
- [ ] Reconciliation result attached (`status`, discrepancy categories, details)
- [ ] Retry hook invoked when applicable (`dropped_tx`, `stale_pending`, `missing_receipt_timeout`)
- [ ] Escalation hook invoked and acknowledged
- [ ] Manual remediation action chosen and executed
- [ ] Customer/business impact communicated
- [ ] Post-incident follow-up items logged
