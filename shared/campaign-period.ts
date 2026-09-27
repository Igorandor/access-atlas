import { z } from 'zod';
import type { Campaign } from './campaign.js';
import { defaultCertificationScope } from './certification.js';
import { reviewDateSchema } from './review-date.js';

export const nextPeriodSchema = z
  .object({
    revision: z.number().int().positive(),
    title: z.string().trim().min(1).max(160),
    description: z.string().trim().max(4000),
    copyDutyRules: z.boolean(),
    copyPolicies: z.boolean(),
    copyCertificationScope: z.boolean(),
    dueDate: reviewDateSchema.optional(),
  })
  .strict();
export type NextPeriod = z.infer<typeof nextPeriodSchema>;

export function nextPeriodSettings(source: Campaign, input: NextPeriod) {
  const checked = nextPeriodSchema.parse(input);
  if (checked.revision !== source.revision)
    throw new Error('The source campaign changed. Reload it before starting the next period.');
  const scope = checked.copyCertificationScope
    ? { ...structuredClone(source.certificationScope), dueDate: checked.dueDate }
    : structuredClone(defaultCertificationScope);
  return {
    title: checked.title,
    description: checked.description,
    rules: checked.copyDutyRules ? structuredClone(source.rules) : [],
    policies: checked.copyPolicies ? structuredClone(source.policies) : [],
    certificationScope: scope,
  };
}

export function nextPeriodPreview(source: Campaign, input: NextPeriod) {
  const settings = nextPeriodSettings(source, input);
  return [
    {
      label: 'Duty rules',
      before: source.rules.length,
      after: settings.rules.length,
      explanation: input.copyDutyRules
        ? 'The same role pairs will be checked against new captures.'
        : 'No duty rules will be copied.',
    },
    {
      label: 'Review policies',
      before: source.policies.length,
      after: settings.policies.length,
      explanation: input.copyPolicies
        ? 'Policy definitions are retained; all findings are evaluated again.'
        : 'No policies will be copied.',
    },
    {
      label: 'Saved captures',
      before: source.captures.length,
      after: 0,
      explanation: 'The next period starts without evidence. Save a new capture.',
    },
    {
      label: 'Finding decisions',
      before: source.decisions.length,
      after: 0,
      explanation: 'Prior acceptance or exceptions are not treated as new review decisions.',
    },
    {
      label: 'Certification decisions',
      before: source.certifications.length,
      after: 0,
      explanation: 'Every in-scope object needs a new decision.',
    },
    {
      label: 'Remediation receipts',
      before: source.remediations.length,
      after: 0,
      explanation: 'Receipts remain in the original campaign, including unresolved results.',
    },
  ];
}
