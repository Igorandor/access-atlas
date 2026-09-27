export type ReviewOperation = {
  path: string;
  method: 'PUT' | 'POST' | 'DELETE';
  query?: Record<string, string>;
  body?: Record<string, unknown>;
};
export type ChangeReview = {
  id: string;
  title: string;
  target: string;
  createdAt: string;
  expiresAt: string;
  operation: ReviewOperation;
  before: unknown;
  expected: unknown;
  existence: 'present' | 'absent' | 'not-readable';
  verification: string;
  warnings: string[];
};
export type ChangeReceipt = {
  id: string;
  reviewId: string;
  target: string;
  path: string;
  method: string;
  at: string;
  status: 'verified' | 'acknowledged' | 'different' | 'unverified' | 'uncertain' | 'failed';
  nativeStatus?: number;
  asyncId?: string;
  message: string;
  checkedFields: string[];
  differences: Array<{ field: string; expected: unknown; observed: unknown }>;
};
export function receiptExplanation(status: ChangeReceipt['status']) {
  return {
    verified: 'A fresh read matched the values Atlas could verify.',
    acknowledged:
      'IRIS accepted the request. This operation does not provide a complete readback contract.',
    different: 'IRIS returned success, but the subsequent read differed from the requested values.',
    unverified: 'IRIS returned success, but Atlas could not read the resulting state.',
    uncertain:
      'The request may have reached IRIS. Inspect the target before creating another proposal.',
    failed: 'The operation did not produce a successful native response.',
  }[status];
}
