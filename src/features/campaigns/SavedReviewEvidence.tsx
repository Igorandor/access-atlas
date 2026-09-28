import { campaignActivityEvidence, type CampaignActivity } from '../../../shared/campaign-report';
import './saved-review-evidence.css';

export function SavedReviewEvidence({ event }: { event: CampaignActivity }) {
  const evidence = campaignActivityEvidence(event);
  if (!evidence) return null;
  return (
    <details className="saved-review-evidence">
      <summary>{evidence.title}</summary>
      <p>Saved at this revision. Check Certification or Decisions for the current review status.</p>
      <dl>
        {evidence.facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
