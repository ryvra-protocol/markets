export interface FeeBreakdown {
  fee_policy_version: string;
  asset: string;
  grossAmount: string;
  platformFee: string;
  partnerFee: string;
  sponsorOffset: string;
  netAmount: string;
}
